/**
 * LearningPulsePanel - Full-stack learning health dashboard
 *
 * Sections:
 *  A. Memory Pipeline Health   - stat cards, embedding dist, trend sparkline
 *  B. Learning Pipeline Health - Q-learning, neural patterns, edges, trajectories, agents
 *  C. SONA & Advanced          - SONA stats, pretrain, storage, patch level
 *  D. Wire Connectivity Matrix - per-component status grid (green/yellow/red)
 *  E. Validation Actions       - POST buttons with live stdout output
 */
import { formatNumber, statusBadge, createSparkline } from './DashboardPanels';

declare const d3: typeof import('d3');

const T = {
  bgBase: '#0D0612', bgSurface: '#1A0D2E', bgElevated: '#261442',
  primary: '#6B2FB5', primaryHover: '#8B4FD9', primaryActive: '#B794F6',
  textPrimary: '#FFFFFF', textSecondary: '#E0E0E0', textMuted: '#B0B0B0',
  success: '#10B981', warning: '#F59E0B', error: '#EF4444',
  fontMono: "'JetBrains Mono', 'Fira Code', monospace",
} as const;

// -- Response shape ----------------------------------------------------------
interface LearningPulseResponse {
  memoryPipeline: {
    total: number; dim384: number; dimNull: number; dimOther: number;
    avgWordCount: number; basenameEnriched: number; memoriesPerHour: number;
    latestMemory: { id: string; preview: string; timestamp: number } | null;
    trend: Array<{ hour: number; count: number }>;
  };
  learningPipeline: {
    qLearning: Record<string, { entries: number; avgReward: number }>;
    neuralPatterns: Record<string, number>;
    edges: Record<string, number>;
    trajectories: { total: number; successRate: number; avgReward: number; rewardVariance: string };
    agents: { count: number; entries: Array<{ name: string; lastSeen: number | null }> };
  };
  sonaAdvanced: {
    sonaStats: Record<string, unknown>;
    pretrainStatus: Record<string, unknown> | null;
    storageBackend: string;
    patchLevel: Record<string, unknown>;
  };
  wireMatrix: Record<string, { count: number; status: 'green' | 'yellow' | 'red'; latestTs: number | null }>;
  allTables: Array<{ name: string; sql: string }>;
}

// -- Safe number utilities ---------------------------------------------------
function safeNum(val: any, fallback = 0): number {
  if (val == null || typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  return val;
}

function safePct(num: number, denom: number): string {
  if (denom === 0 || !Number.isFinite(num) || !Number.isFinite(denom)) return '0%';
  return `${Math.round(100 * num / denom)}%`;
}

function safeDisplay(val: any, fallback = '-'): string {
  if (val == null || (typeof val === 'number' && !Number.isFinite(val))) return fallback;
  return String(val);
}

// -- Local helpers -----------------------------------------------------------
function esc(text: string): string {
  const d = document.createElement('div'); d.textContent = text; return d.innerHTML;
}

async function fetchJson<R>(url: string): Promise<R | null> {
  try { const r = await fetch(url); return r.ok ? r.json() : null; } catch { return null; }
}

function sectionLabel(text: string): HTMLDivElement {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = `color:${T.textMuted};font-size:11px;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;`;
  return el;
}

function createCard(title: string): HTMLDivElement {
  const c = document.createElement('div');
  c.style.cssText = `background:${T.bgSurface};border:1px solid ${T.primary}33;border-radius:12px;padding:16px;margin-bottom:12px;`;
  if (title) {
    const h = document.createElement('div');
    h.textContent = title;
    h.style.cssText = `color:${T.primaryActive};font-weight:600;font-size:14px;margin-bottom:10px;font-family:${T.fontMono};`;
    c.appendChild(h);
  }
  return c;
}

function stat(value: string | number, subtitle: string, color: string = T.primaryActive): HTMLDivElement {
  const c = document.createElement('div');
  c.style.cssText = `background:${T.bgElevated};border-radius:10px;padding:14px 18px;text-align:center;min-width:110px;flex:1;`;
  c.innerHTML = `<div style="color:${color};font-size:28px;font-weight:700;font-family:${T.fontMono};">${esc(String(value))}</div>
    <div style="color:${T.textMuted};font-size:11px;margin-top:4px;">${esc(subtitle)}</div>`;
  return c;
}

function mRow(label: string, value: string | number): HTMLDivElement {
  const r = document.createElement('div');
  r.style.cssText = `display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid ${T.bgElevated};`;
  r.innerHTML = `<span style="color:${T.textMuted};font-size:12px;">${esc(label)}</span>
    <span style="color:${T.textPrimary};font-family:${T.fontMono};font-size:13px;">${esc(String(value))}</span>`;
  return r;
}

function dot(color: string): string {
  return `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};box-shadow:0 0 4px ${color}88;"></span>`;
}

function timeAgo(ts: number | null): string {
  if (!ts) return 'never';
  const diff = Date.now() - (ts < 1e12 ? ts * 1000 : ts);
  if (diff < 60_000) return '<1m ago';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function flexRow(gap = '10px'): HTMLDivElement {
  const d = document.createElement('div');
  d.style.cssText = `display:flex;gap:${gap};flex-wrap:wrap;`;
  return d;
}

function gridCell(text: string, css: string): HTMLDivElement {
  const c = document.createElement('div'); c.textContent = text; c.style.cssText = css; return c;
}

// -- Panel -------------------------------------------------------------------
export class LearningPulsePanel {
  async render(container: HTMLElement): Promise<void> {
    container.innerHTML = '';
    container.style.cssText = `background:${T.bgBase};color:${T.textPrimary};font-family:${T.fontMono};overflow-y:auto;padding:16px;`;

    // FIX-003: Use relative URL instead of hardcoded localhost
    const data = await fetchJson<LearningPulseResponse>('/api/learning-pulse');
    if (!data) {
      const msg = document.createElement('div');
      msg.textContent = 'Learning Pulse data not available';
      msg.style.cssText = `color:${T.textMuted};text-align:center;padding:40px 20px;font-size:14px;`;
      container.appendChild(msg);
      return;
    }

    const title = document.createElement('div');
    title.textContent = 'Learning Pulse';
    title.style.cssText = `color:${T.primaryActive};font-size:18px;font-weight:700;margin-bottom:16px;text-align:center;letter-spacing:0.5px;`;
    container.appendChild(title);

    this.renderMemoryPipeline(container, data.memoryPipeline);
    this.renderLearningPipeline(container, data.learningPipeline);
    this.renderSonaAdvanced(container, data.sonaAdvanced);
    this.renderWireMatrix(container, data.wireMatrix);
    this.renderValidationActions(container);
  }

  // == A. Memory Pipeline Health ==============================================
  private renderMemoryPipeline(container: HTMLElement, mp: LearningPulseResponse['memoryPipeline']): void {
    const card = createCard('A. Memory Pipeline Health');

    const row = flexRow();
    row.style.marginBottom = '12px';
    row.appendChild(stat(formatNumber(safeNum(mp.total)), 'Total Memories', T.primaryActive));
    row.appendChild(stat(safeNum(mp.memoriesPerHour).toFixed(1), 'Memories/hr', T.success));
    row.appendChild(stat(safeNum(mp.avgWordCount).toFixed(0), 'Avg Words', T.warning));
    card.appendChild(row);

    // Embedding distribution
    const embBox = document.createElement('div');
    embBox.style.cssText = `background:${T.bgElevated};border-radius:8px;padding:12px;margin-bottom:10px;`;
    embBox.appendChild(sectionLabel('Embedding Distribution'));
    const embGrid = flexRow('12px');
    [
      { label: 'dim384', count: mp.dim384, color: T.success },
      { label: 'NULL', count: mp.dimNull, color: mp.dimNull > 0 ? T.warning : T.textMuted },
      { label: 'other', count: mp.dimOther, color: mp.dimOther > 0 ? T.error : T.textMuted },
    ].forEach(({ label, count, color }) => {
      const safeCount = safeNum(count);
      const safeTotal = safeNum(mp.total);
      const pct = safeTotal > 0 ? ((safeCount / safeTotal) * 100).toFixed(1) : '0.0';
      const el = document.createElement('div');
      el.style.cssText = 'flex:1;min-width:80px;text-align:center;';
      el.innerHTML = `<div style="color:${color};font-size:20px;font-weight:700;">${formatNumber(safeCount)}</div>
        <div style="color:${T.textMuted};font-size:10px;">${esc(label)} (${pct}%)</div>`;
      embGrid.appendChild(el);
    });
    embBox.appendChild(embGrid);
    card.appendChild(embBox);

    // Basename enrichment
    const safeEnriched = safeNum(mp.basenameEnriched);
    const safeTotalMem = safeNum(mp.total);
    const enrichPct = safeTotalMem > 0 ? ((safeEnriched / safeTotalMem) * 100).toFixed(1) : '0.0';
    card.appendChild(mRow('Basename Enriched', `${formatNumber(safeEnriched)} / ${formatNumber(safeTotalMem)} (${enrichPct}%)`));

    // Latest memory preview
    if (mp.latestMemory) {
      const pv = document.createElement('div');
      pv.style.cssText = `background:${T.bgElevated};border-radius:8px;padding:10px;margin-top:10px;border-left:3px solid ${T.primary};`;
      const preview = mp.latestMemory.preview.length > 120
        ? mp.latestMemory.preview.slice(0, 117) + '...' : mp.latestMemory.preview;
      pv.innerHTML = `<div style="color:${T.textMuted};font-size:10px;margin-bottom:4px;">Latest Memory - ${timeAgo(mp.latestMemory.timestamp)}</div>
        <div style="color:${T.textSecondary};font-size:12px;line-height:1.4;">${esc(preview)}</div>`;
      card.appendChild(pv);
    }

    // Trend sparkline
    if (mp.trend && mp.trend.length > 1) {
      const sw = document.createElement('div');
      sw.style.cssText = 'margin-top:10px;';
      const sl = document.createElement('div');
      sl.textContent = 'Hourly Trend';
      sl.style.cssText = `color:${T.textMuted};font-size:10px;margin-bottom:4px;`;
      sw.appendChild(sl);
      createSparkline(sw, mp.trend.map(t => t.count), T.primaryActive, 280, 40);
      card.appendChild(sw);
    }
    container.appendChild(card);
  }

  // == B. Learning Pipeline Health ============================================
  private renderLearningPipeline(container: HTMLElement, lp: LearningPulseResponse['learningPipeline']): void {
    const card = createCard('B. Learning Pipeline Health');

    // Q-learning algorithms
    const qEntries = Object.entries(lp.qLearning);
    if (qEntries.length > 0) {
      const sec = document.createElement('div');
      sec.style.marginBottom = '12px';
      sec.appendChild(sectionLabel('Q-Learning Algorithms'));
      qEntries.forEach(([algo, s]) => {
        const safeAvgReward = safeNum(s.avgReward);
        const rwColor = safeAvgReward >= 0 ? T.success : T.error;
        const r = mRow(algo, '');
        const span = r.querySelector('span:last-child') as HTMLElement;
        span.innerHTML = `<span style="color:${T.textPrimary};">${formatNumber(safeNum(s.entries))} entries</span>
          <span style="color:${T.textMuted};"> | avg </span>
          <span style="color:${rwColor};font-weight:700;">${safeAvgReward.toFixed(4)}</span>`;
        sec.appendChild(r);
      });
      card.appendChild(sec);
    } else {
      card.appendChild(mRow('Q-Learning', 'No algorithms'));
    }

    // Neural patterns
    const patEntries = Object.entries(lp.neuralPatterns);
    if (patEntries.length > 0) {
      const sec = document.createElement('div');
      sec.style.marginBottom = '12px';
      sec.appendChild(sectionLabel('Neural Patterns'));
      const pg = flexRow('8px');
      patEntries.forEach(([cat, count]) => {
        const chip = document.createElement('span');
        chip.style.cssText = `display:inline-flex;align-items:center;gap:4px;background:${T.primary}22;color:${T.primaryActive};padding:4px 10px;border-radius:6px;font-size:12px;border:1px solid ${T.primary}44;`;
        chip.textContent = `${cat}: ${formatNumber(count)}`;
        pg.appendChild(chip);
      });
      sec.appendChild(pg);
      card.appendChild(sec);
    }

    // Edges
    const edgeEntries = Object.entries(lp.edges);
    if (edgeEntries.length > 0) {
      const sec = document.createElement('div');
      sec.style.marginBottom = '12px';
      sec.appendChild(sectionLabel('Edges'));
      edgeEntries.forEach(([type, count]) => sec.appendChild(mRow(type, formatNumber(count))));
      card.appendChild(sec);
    }

    // Trajectories
    const tj = lp.trajectories;
    const tsec = document.createElement('div');
    tsec.style.marginBottom = '12px';
    tsec.appendChild(sectionLabel('Trajectories'));
    const tr = flexRow();
    tr.appendChild(stat(formatNumber(safeNum(tj.total)), 'Total', T.primaryActive));
    const safeSuccessRate = safeNum(tj.successRate);
    const srC = safeSuccessRate >= 0.7 ? T.success : safeSuccessRate >= 0.4 ? T.warning : T.error;
    tr.appendChild(stat((safeSuccessRate * 100).toFixed(1) + '%', 'Success Rate', srC));
    const safeTjReward = safeNum(tj.avgReward);
    tr.appendChild(stat(safeTjReward.toFixed(3), 'Avg Reward', safeTjReward >= 0 ? T.success : T.error));
    tsec.appendChild(tr);
    if (tj.rewardVariance) {
      const vd = document.createElement('div');
      vd.style.cssText = `color:${T.textMuted};font-size:11px;margin-top:6px;`;
      vd.textContent = `Variance: ${tj.rewardVariance}`;
      tsec.appendChild(vd);
    }
    card.appendChild(tsec);

    // Agent registry
    if (lp.agents.count > 0) {
      const sec = document.createElement('div');
      sec.appendChild(sectionLabel(`Agent Registry (${lp.agents.count})`));
      lp.agents.entries.forEach(a => sec.appendChild(mRow(a.name, timeAgo(a.lastSeen))));
      card.appendChild(sec);
    }
    container.appendChild(card);
  }

  // == C. SONA & Advanced ====================================================
  private renderSonaAdvanced(container: HTMLElement, sa: LearningPulseResponse['sonaAdvanced']): void {
    const card = createCard('C. SONA & Advanced');

    const sonaEntries = Object.entries(sa.sonaStats);
    if (sonaEntries.length > 0) {
      card.appendChild(sectionLabel('SONA Stats'));
      sonaEntries.forEach(([k, v]) => card.appendChild(mRow(k, safeDisplay(v))));
    } else {
      card.appendChild(mRow('SONA', 'No stats'));
    }

    // Pretrain status
    const ptDiv = document.createElement('div');
    ptDiv.style.marginTop = '10px';
    if (sa.pretrainStatus) {
      ptDiv.appendChild(sectionLabel('Pretrain Status'));
      Object.entries(sa.pretrainStatus).forEach(([k, v]) => ptDiv.appendChild(mRow(k, safeDisplay(v))));
    } else {
      ptDiv.innerHTML = statusBadge(false, 'No pretrain data');
    }
    card.appendChild(ptDiv);

    card.appendChild(mRow('Storage Backend', safeDisplay(sa.storageBackend, 'unknown')));

    // Patch level badges
    const patchEntries = Object.entries(sa.patchLevel);
    if (patchEntries.length > 0) {
      const pl = document.createElement('div');
      pl.style.cssText = 'margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;';
      patchEntries.forEach(([patch, val]) => {
        const ok = val === true || val === 'applied' || val === 'ok';
        pl.innerHTML += statusBadge(!!ok, patch);
      });
      card.appendChild(pl);
    }
    container.appendChild(card);
  }

  // == D. Wire Connectivity Matrix ============================================
  private renderWireMatrix(container: HTMLElement, wm: LearningPulseResponse['wireMatrix']): void {
    const card = createCard('D. Wire Connectivity Matrix');
    const entries = Object.entries(wm);

    if (entries.length === 0) {
      const e = document.createElement('div');
      e.textContent = 'No wire data';
      e.style.cssText = `color:${T.textMuted};font-size:11px;`;
      card.appendChild(e);
      container.appendChild(card);
      return;
    }

    const grid = document.createElement('div');
    grid.style.cssText = `display:grid;grid-template-columns:24px minmax(120px,1.5fr) 80px 100px;gap:1px;font-size:12px;`;

    const hdrCss = `color:${T.textMuted};font-size:10px;text-transform:uppercase;padding:6px 8px;background:${T.bgElevated};font-weight:600;letter-spacing:0.5px;`;
    ['', 'Component', 'Rows', 'Last Activity'].forEach(h => grid.appendChild(gridCell(h, hdrCss)));

    const cellBase = `padding:8px;background:${T.bgBase};border-bottom:1px solid ${T.bgElevated};`;
    entries.forEach(([comp, info]) => {
      const dc = info.status === 'green' ? T.success : info.status === 'yellow' ? T.warning : T.error;
      // Dot
      const d1 = gridCell('', `${cellBase}display:flex;align-items:center;justify-content:center;`);
      d1.innerHTML = dot(dc);
      grid.appendChild(d1);
      // Name
      const nm = gridCell(comp, `${cellBase}color:${T.textPrimary};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`);
      nm.title = comp;
      grid.appendChild(nm);
      // Count
      grid.appendChild(gridCell(formatNumber(info.count), `${cellBase}color:${info.count > 0 ? T.primaryActive : T.textMuted};text-align:right;font-weight:700;`));
      // Timestamp
      grid.appendChild(gridCell(timeAgo(info.latestTs), `${cellBase}color:${T.textMuted};font-size:11px;`));
    });
    card.appendChild(grid);

    const legend = document.createElement('div');
    legend.style.cssText = `display:flex;gap:16px;margin-top:10px;font-size:10px;color:${T.textMuted};`;
    legend.innerHTML = `<span>${dot(T.success)} Data flows</span><span>${dot(T.warning)} Empty table</span><span>${dot(T.error)} Not wired</span>`;
    card.appendChild(legend);
    container.appendChild(card);
  }

  // == E. Validation Actions ==================================================
  private renderValidationActions(container: HTMLElement): void {
    const card = createCard('E. Validation Actions');
    const actions = [
      { label: 'Run Validate', endpoint: '/api/validate' },
      { label: 'Run Diagnose', endpoint: '/api/diagnose' },
      { label: 'Consolidate Now', endpoint: '/api/consolidate' },
      { label: 'Re-embed NULLs', endpoint: '/api/re-embed' },
    ];

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;';

    const output = document.createElement('pre');
    output.style.cssText = `background:${T.bgElevated};border:1px solid ${T.primary}33;border-radius:8px;padding:12px;margin:0;max-height:260px;overflow:auto;font-size:11px;color:${T.textSecondary};font-family:${T.fontMono};white-space:pre-wrap;word-break:break-all;display:none;`;

    actions.forEach(({ label, endpoint }) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style.cssText = `background:${T.primary};color:${T.textPrimary};border:none;border-radius:8px;padding:10px 18px;font-family:${T.fontMono};font-size:12px;font-weight:600;cursor:pointer;transition:background 0.2s;`;
      btn.addEventListener('mouseenter', () => { btn.style.background = T.primaryHover; });
      btn.addEventListener('mouseleave', () => { btn.style.background = T.primary; });

      btn.addEventListener('click', async () => {
        const allBtns = btnRow.querySelectorAll('button');
        allBtns.forEach(b => { (b as HTMLButtonElement).disabled = true; (b as HTMLElement).style.opacity = '0.5'; });
        btn.textContent = label + ' ...';
        btn.style.background = T.primaryActive;
        output.style.display = 'block';
        output.textContent = `Running ${label}...\n`;

        try {
          // FIX-003: Use relative URL instead of hardcoded localhost
          const resp = await fetch(endpoint, { method: 'POST' });
          if (!resp.ok) {
            output.textContent += `Error: HTTP ${resp.status} ${resp.statusText}\n`;
          } else {
            const result = await resp.json();
            output.textContent = `=== ${label} ===\n${result.stdout || result.output || JSON.stringify(result, null, 2)}`;
          }
        } catch (err: unknown) {
          output.textContent += `Failed: ${err instanceof Error ? err.message : String(err)}\n`;
        }

        allBtns.forEach(b => { (b as HTMLButtonElement).disabled = false; (b as HTMLElement).style.opacity = '1'; });
        btn.textContent = label;
        btn.style.background = T.primary;
      });
      btnRow.appendChild(btn);
    });

    card.appendChild(btnRow);
    card.appendChild(output);
    container.appendChild(card);
  }
}
