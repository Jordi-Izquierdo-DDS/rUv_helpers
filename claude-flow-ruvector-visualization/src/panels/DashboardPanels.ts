/**
 * DashboardPanels - Visualization panels for RuVector viz
 *
 * Renders analytics data into DOM containers using D3.js and inline styles
 * consistent with the Veracy Nebula dark theme.
 *
 * Panels:
 *  1. TrajectoryTimeline  - Gantt-style trajectory visualization
 *  2. LearningDashboard   - Algorithm heatmaps and convergence curves
 *  3. SessionAnalytics     - Session timeline with creation rates
 *  4. SonaStatsPanel       - Gauge-style SONA metrics
 *  5. SystemHealthPanel    - Self-diagnostic display
 *  6. RewardFieldConnector - API bridge for RewardPotentialField
 */

// D3 is loaded globally via CDN in index.html
declare const d3: typeof import('d3');

// ============================================================================
// Theme Constants
// ============================================================================

const THEME = {
  bgBase: '#0D0612',
  bgSurface: '#1A0D2E',
  bgElevated: '#261442',
  primary: '#6B2FB5',
  primaryHover: '#8B4FD9',
  primaryActive: '#B794F6',
  textPrimary: '#FFFFFF',
  textSecondary: '#E0E0E0',
  textMuted: '#B0B0B0',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  fontMono: "'JetBrains Mono', 'Fira Code', monospace",
} as const;

// ============================================================================
// Learning Algorithm Constants
// ============================================================================

/** Canonical order for displaying all 9 algorithms in 3x3 grid */
const ALGORITHM_ORDER = [
  'double-q', 'q-learning', 'sarsa',
  'actor-critic', 'ppo', 'decision-transformer',
  'monte-carlo', 'td-lambda', 'dqn',
] as const;

/** Distinct colors for each algorithm */
const ALGORITHM_COLORS: Record<string, string> = {
  'double-q': '#B794F6',
  'q-learning': '#60A5FA',
  'sarsa': '#22D3EE',
  'actor-critic': '#10B981',
  'ppo': '#F59E0B',
  'decision-transformer': '#FB923C',
  'monte-carlo': '#F472B6',
  'td-lambda': '#EF4444',
  'dqn': '#2DD4BF',
};

/** Radar chart axis definitions */
interface RadarAxis {
  name: string;
  key: 'updates' | 'avgReward' | 'convergenceScore' | 'learningRateNorm' | 'stability';
}

const RADAR_AXES: RadarAxis[] = [
  { name: 'Updates', key: 'updates' },
  { name: 'Avg Reward', key: 'avgReward' },
  { name: 'Convergence', key: 'convergenceScore' },
  { name: 'Learning Rate', key: 'learningRateNorm' },
  { name: 'Stability', key: 'stability' },
];

/** Extended algorithm metrics for radar chart */
interface AlgorithmMetrics {
  name: string;
  updates: number;
  avgReward: number;
  convergenceScore: number;
  learningRate: number | null;
  learningRateNorm: number;
  stability: number;
  isActive: boolean;
  hasConfig: boolean;
}

// ============================================================================
// Shared Types
// ============================================================================

/** A single trajectory step from the API. */
interface TrajectoryStep {
  action: string;
  state?: string;
  result?: string;
  reward: number;
  time?: number;
  timestamp?: number;
}

/** A trajectory record returned by the Gantt endpoint. */
interface TrajectoryGanttItem {
  id: string;
  context: string;
  agent?: string;
  success: boolean;
  quality: number;
  startTime: number;
  endTime: number;
  durationMs?: number;
  stepCount?: number;
  steps: TrajectoryStep[];
}

/** Learning algorithm descriptor from the API (actual shape). */
interface LearningAlgorithmRaw {
  name: string;
  stats: {
    updates: number;
    avgReward: number;
    convergenceScore: number;
    isActive: boolean;
  };
  config: {
    learningRate: number | null;
    discountFactor: number | null;
    epsilon: number | null;
  };
  qTable: Record<string, any>;
}

/** Top-level learning-algorithms API response. */
interface LearningAlgorithmsResponse {
  algorithms: LearningAlgorithmRaw[];
  rewardHistory: number[];
  convergenceCurves: Record<string, Array<{ timestamp: number | null; runningAvg: number | null }>>;
}

/** Session analytics API response (actual shape). */
interface SessionAnalyticsResponse {
  sessions: Array<{ date: string; memoryCount: number; trajectoryCount: number }>;
  rates: {
    memoriesPerHour: number;
    trajectoriesPerHour: number;
    memoriesPerDay: number;
    trajectoriesPerDay: number;
  };
  patternDrift: Array<{ state: string; before: number; after: number }>;
  loraUpdates: number;
  statsMetadata: Array<{ key: string; value: string }>;
  meta: {
    totalMemories: number;
    totalTrajectories: number;
    totalPatterns: number;
    daySpan: number;
    driftCount: number;
  };
}

/** SONA stats API response (actual shape). */
interface SonaStatsResponse {
  sona: {
    trajectories_buffered: number;
    patterns_stored: number;
    ewc_tasks: number;
    buffer_success_rate: number;
    tick_count: number;
    warmup_replays: number;
    force_learn_count: number;
    last_tick: string | null;
  };
  meta: {
    hasData: boolean;
    source: string;
  };
}

/** Embedding distribution entry. */
interface EmbeddingBucket {
  label: string;
  count: number;
}

/** System health API response (actual shape). */
interface SystemHealthResponse {
  embeddingDistribution: Record<string, number>;
  hookFireRates: {
    memoriesPerHour: number;
    firstTimestamp: number;
    lastTimestamp: number;
    totalMemories: number;
    spanHours: number;
  };
  convergence: {
    rewardPoints: number;
    runningAvg: Array<{ index: number; reward: number; runningAvg: number; timestamp: number | null }>;
    finalAvg: number;
  };
  fileSequences: Array<{ source: string; target: string; count: number }>;
  sonaLifecycle: {
    tick_count: number;
    warmup_replays: number;
    force_learn_count: number;
  };
  patchStatus: Record<string, boolean>;
  jsonDbParity: {
    jsonExists: boolean;
    memoriesJson: number;
    memoriesDb: number;
    patternsJson: number;
    patternsDb: number;
    trajectoriesJson: number;
    trajectoriesDb: number;
    inSync: boolean;
  };
  tableCounts: Record<string, number>;
  dbInfo: {
    path: string;
    size: number;
    lastModified: string;
  };
  meta: {
    totalRows: number;
    tablesPresent: number;
    tablesTotal: number;
    dbSizeMB: string;
  };
}

/** Reward point consumed by RewardPotentialField. */
interface RewardPoint {
  x: number;
  y: number;
  reward: number;
}

// ============================================================================
// Safe Number Utilities
// ============================================================================

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

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format large numbers with K/M suffixes.
 * Examples: 1234 -> "1.2K", 1500000 -> "1.5M", 42 -> "42"
 */
export function formatNumber(n: number): string {
  const safe = safeNum(n);
  if (safe >= 1_000_000) return `${(safe / 1_000_000).toFixed(1)}M`;
  if (safe >= 1_000) return `${(safe / 1_000).toFixed(1)}K`;
  return String(Math.round(safe * 100) / 100);
}

/**
 * Return an HTML string for a green/red status badge.
 */
export function statusBadge(ok: boolean, label: string): string {
  const bg = ok ? THEME.success : THEME.error;
  const icon = ok ? '\u2713' : '\u2717';
  return `<span style="
    display:inline-flex;align-items:center;gap:4px;
    background:${bg}22;color:${bg};
    padding:2px 10px;border-radius:6px;font-size:12px;
    font-family:${THEME.fontMono};border:1px solid ${bg}44;
  ">${icon} ${escapeHtml(label)}</span>`;
}

/**
 * Create an SVG circular gauge indicator.
 */
export function createGauge(
  container: HTMLElement,
  value: number,
  max: number,
  label: string,
  color: string
): void {
  const size = 120;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const safeValue = safeNum(value);
  const safeMax = safeNum(max, 1);
  const clamped = Math.max(0, Math.min(safeValue, safeMax));
  const fraction = safeMax > 0 ? clamped / safeMax : 0;
  const offset = circumference * (1 - fraction);
  const displayValue = safeMax <= 1
    ? `${(clamped * 100).toFixed(0)}%`
    : formatNumber(clamped);

  const wrapper = document.createElement('div');
  wrapper.style.cssText = `
    display:flex;flex-direction:column;align-items:center;gap:6px;
  `;

  wrapper.innerHTML = `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${radius}"
        fill="none" stroke="${THEME.bgElevated}" stroke-width="${stroke}" />
      <circle cx="${size / 2}" cy="${size / 2}" r="${radius}"
        fill="none" stroke="${color}" stroke-width="${stroke}"
        stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
        stroke-linecap="round"
        transform="rotate(-90 ${size / 2} ${size / 2})"
        style="transition:stroke-dashoffset 1s ease;" />
      <text x="${size / 2}" y="${size / 2}" text-anchor="middle" dominant-baseline="central"
        fill="${THEME.textPrimary}" font-size="18" font-family="${THEME.fontMono}">
        ${displayValue}
      </text>
    </svg>
    <span style="color:${THEME.textMuted};font-size:12px;font-family:${THEME.fontMono};">
      ${escapeHtml(label)}
    </span>
  `;

  container.appendChild(wrapper);
}

/**
 * Create a sparkline SVG from a numeric array.
 */
export function createSparkline(
  container: HTMLElement,
  data: number[],
  color: string,
  width: number = 200,
  height: number = 40
): void {
  if (!data || data.length === 0) {
    const empty = document.createElement('span');
    empty.textContent = 'No data';
    empty.style.cssText = `color:${THEME.textMuted};font-size:11px;`;
    container.appendChild(empty);
    return;
  }

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  const minVal = Math.min(...data);
  const maxVal = Math.max(...data);
  const range = maxVal - minVal || 1;
  const pad = 2;

  const points = data.map((v, i) => {
    const x = pad + (i / Math.max(data.length - 1, 1)) * (width - 2 * pad);
    const y = pad + (1 - (v - minVal) / range) * (height - 2 * pad);
    return `${x},${y}`;
  });

  // Filled area
  const areaPath = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  const firstX = pad;
  const lastX = pad + ((data.length - 1) / Math.max(data.length - 1, 1)) * (width - 2 * pad);
  areaPath.setAttribute('points',
    `${firstX},${height - pad} ${points.join(' ')} ${lastX},${height - pad}`
  );
  areaPath.setAttribute('fill', `${color}20`);
  svg.appendChild(areaPath);

  // Line
  const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  polyline.setAttribute('points', points.join(' '));
  polyline.setAttribute('fill', 'none');
  polyline.setAttribute('stroke', color);
  polyline.setAttribute('stroke-width', '1.5');
  polyline.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(polyline);

  container.appendChild(svg);
}

/**
 * Create a div-based heatmap from a Q-table structure.
 */
export function createHeatmap(
  container: HTMLElement,
  matrix: Record<string, Record<string, { q: number; v: number }>>,
  states: string[],
  actions: string[]
): void {
  if (states.length === 0 || actions.length === 0) {
    const empty = document.createElement('div');
    empty.textContent = 'No Q-table data';
    empty.style.cssText = `color:${THEME.textMuted};font-size:11px;padding:8px;`;
    container.appendChild(empty);
    return;
  }

  // Limit displayed rows/columns for readability
  const maxStates = 12;
  const maxActions = 10;
  const displayStates = states.slice(0, maxStates);
  const displayActions = actions.slice(0, maxActions);

  // Find Q-value range for color mapping
  let minQ = Infinity;
  let maxQ = -Infinity;
  for (const s of displayStates) {
    for (const a of displayActions) {
      const val = matrix[s]?.[a]?.q ?? 0;
      if (val < minQ) minQ = val;
      if (val > maxQ) maxQ = val;
    }
  }
  const qRange = maxQ - minQ || 1;

  const grid = document.createElement('div');
  grid.style.cssText = `
    display:grid;
    grid-template-columns:100px repeat(${displayActions.length}, 1fr);
    gap:1px;font-size:10px;font-family:${THEME.fontMono};
    overflow-x:auto;
  `;

  // Header row
  const cornerCell = document.createElement('div');
  cornerCell.style.cssText = `background:${THEME.bgBase};padding:4px;`;
  grid.appendChild(cornerCell);

  for (const a of displayActions) {
    const headerCell = document.createElement('div');
    headerCell.textContent = truncate(a, 10);
    headerCell.title = a;
    headerCell.style.cssText = `
      background:${THEME.bgBase};padding:4px;color:${THEME.textMuted};
      text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
    `;
    grid.appendChild(headerCell);
  }

  // Data rows
  for (const s of displayStates) {
    const rowLabel = document.createElement('div');
    rowLabel.textContent = truncate(s, 14);
    rowLabel.title = s;
    rowLabel.style.cssText = `
      background:${THEME.bgBase};padding:4px;color:${THEME.textMuted};
      overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
    `;
    grid.appendChild(rowLabel);

    for (const a of displayActions) {
      const val = matrix[s]?.[a]?.q ?? 0;
      const norm = (val - minQ) / qRange;
      const cell = document.createElement('div');
      cell.title = `Q=${val.toFixed(4)}`;
      cell.style.cssText = `
        padding:4px;text-align:center;
        background:${qValueToColor(norm)};
        color:${norm > 0.6 ? THEME.bgBase : THEME.textPrimary};
        min-width:30px;
      `;
      cell.textContent = val.toFixed(2);
      grid.appendChild(cell);
    }
  }

  container.appendChild(grid);

  // Overflow indicator
  if (states.length > maxStates || actions.length > maxActions) {
    const note = document.createElement('div');
    note.textContent = `Showing ${displayStates.length}/${states.length} states, ${displayActions.length}/${actions.length} actions`;
    note.style.cssText = `color:${THEME.textMuted};font-size:10px;margin-top:4px;`;
    container.appendChild(note);
  }
}

// ============================================================================
// Internal Helpers
// ============================================================================

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function truncate(s: string, len: number): string {
  if (!s) return '';
  return s.length > len ? s.slice(0, len - 1) + '\u2026' : s;
}

/** Map a normalized 0-1 Q-value to a color from deep purple to bright green. */
function qValueToColor(norm: number): string {
  const clamped = Math.max(0, Math.min(1, norm));
  if (clamped < 0.5) {
    // Purple range
    const t = clamped / 0.5;
    const r = Math.round(38 + t * (107 - 38));
    const g = Math.round(13 + t * (47 - 13));
    const b = Math.round(46 + t * (181 - 46));
    return `rgb(${r},${g},${b})`;
  }
  // Green range
  const t = (clamped - 0.5) / 0.5;
  const r = Math.round(107 - t * 91);
  const g = Math.round(47 + t * (185 - 47));
  const b = Math.round(181 - t * 52);
  return `rgb(${r},${g},${b})`;
}

/** Build common card wrapper HTML with title. */
function createCard(title: string): HTMLDivElement {
  const card = document.createElement('div');
  card.style.cssText = `
    background:${THEME.bgSurface};
    border:1px solid ${THEME.primary}33;
    border-radius:12px;padding:16px;
    margin-bottom:12px;
  `;
  if (title) {
    const heading = document.createElement('div');
    heading.textContent = title;
    heading.style.cssText = `
      color:${THEME.primaryActive};font-weight:600;font-size:14px;
      margin-bottom:10px;font-family:${THEME.fontMono};
    `;
    card.appendChild(heading);
  }
  return card;
}

/** Show a centered "No data yet" message. */
function showNoData(container: HTMLElement, message: string = 'No data yet'): void {
  const msg = document.createElement('div');
  msg.textContent = message;
  msg.style.cssText = `
    color:${THEME.textMuted};text-align:center;padding:40px 20px;
    font-size:14px;font-family:${THEME.fontMono};
  `;
  container.appendChild(msg);
}

/** Build a stat metric row (label: value). */
function metricRow(label: string, value: string | number): HTMLDivElement {
  const row = document.createElement('div');
  row.style.cssText = `
    display:flex;justify-content:space-between;align-items:center;
    padding:6px 0;border-bottom:1px solid ${THEME.bgElevated};
  `;
  row.innerHTML = `
    <span style="color:${THEME.textMuted};font-size:12px;">${escapeHtml(label)}</span>
    <span style="color:${THEME.textPrimary};font-family:${THEME.fontMono};font-size:13px;">
      ${escapeHtml(String(value))}
    </span>
  `;
  return row;
}

/** Create a stat card with a big number, subtitle, and optional color. */
function statCard(value: string | number, subtitle: string, color: string = THEME.primaryActive): HTMLDivElement {
  const card = document.createElement('div');
  card.style.cssText = `
    background:${THEME.bgElevated};border-radius:10px;padding:14px 18px;
    text-align:center;min-width:110px;flex:1;
  `;
  card.innerHTML = `
    <div style="color:${color};font-size:28px;font-weight:700;font-family:${THEME.fontMono};">
      ${escapeHtml(String(value))}
    </div>
    <div style="color:${THEME.textMuted};font-size:11px;margin-top:4px;">
      ${escapeHtml(subtitle)}
    </div>
  `;
  return card;
}

/** Create a simple SVG line chart inside a container. */
function renderLineChart(
  container: HTMLElement,
  data: number[],
  color: string,
  width: number = 400,
  height: number = 120
): void {
  if (!data || data.length < 2) {
    showNoData(container, 'Insufficient convergence data');
    return;
  }

  const svg = d3.select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`)
    .style('display', 'block')
    .style('max-width', '100%');

  const pad = { top: 10, right: 10, bottom: 20, left: 40 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;

  const xScale = d3.scaleLinear()
    .domain([0, data.length - 1])
    .range([0, w]);

  const yExtent = d3.extent(data) as [number, number];
  // Guard against undefined extent values from empty data
  const yMin = yExtent[0] ?? 0;
  const yMax = yExtent[1] ?? 1;
  const yRange = yMax - yMin || 1; // Prevent division by zero
  const yScale = d3.scaleLinear()
    .domain([yMin - yRange * 0.1, yMax + yRange * 0.1])
    .range([h, 0]);

  const g = svg.append('g')
    .attr('transform', `translate(${pad.left},${pad.top})`);

  // Y-axis
  g.append('g')
    .call(
      d3.axisLeft(yScale).ticks(4).tickFormat(d => formatNumber(d as number))
    )
    .selectAll('text')
    .attr('fill', THEME.textMuted)
    .style('font-size', '9px')
    .style('font-family', THEME.fontMono);

  g.selectAll('.domain, .tick line').attr('stroke', `${THEME.primary}44`);

  // Area fill
  const area = d3.area<number>()
    .x((_, i) => xScale(i))
    .y0(h)
    .y1(d => yScale(d))
    .curve(d3.curveMonotoneX);

  g.append('path')
    .datum(data)
    .attr('d', area)
    .attr('fill', `${color}18`);

  // Line
  const line = d3.line<number>()
    .x((_, i) => xScale(i))
    .y(d => yScale(d))
    .curve(d3.curveMonotoneX);

  g.append('path')
    .datum(data)
    .attr('d', line)
    .attr('fill', 'none')
    .attr('stroke', color)
    .attr('stroke-width', 1.5);
}

/** Safe JSON fetch with error handling. */
async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

// ============================================================================
// 1. TrajectoryTimeline
// ============================================================================

/**
 * Renders a Gantt-style chart of trajectories (state -> action -> reward -> outcome).
 *
 * Each trajectory is a horizontal bar colored by success/failure and opacity
 * proportional to reward magnitude. Rows are grouped by context/state.
 * Hovering shows a tooltip with details; clicking expands individual steps.
 */
export class TrajectoryTimeline {
  private data: TrajectoryGanttItem[] = [];
  private expandedIds: Set<string> = new Set();
  private tooltip: HTMLDivElement | null = null;
  private static stylesInjected = false;

  /**
   * Inject CSS animations for flow diagram and sparklines.
   * Only injects once per page load.
   */
  private injectStyles(): void {
    if (TrajectoryTimeline.stylesInjected) return;
    TrajectoryTimeline.stylesInjected = true;

    const styleEl = document.createElement('style');
    styleEl.textContent = `
      @keyframes dash-flow {
        from { stroke-dashoffset: 24; }
        to { stroke-dashoffset: 0; }
      }

      @keyframes success-pulse {
        0%, 100% { opacity: 1; filter: drop-shadow(0 0 3px ${THEME.success}); }
        50% { opacity: 0.8; filter: drop-shadow(0 0 8px ${THEME.success}); }
      }

      @keyframes failure-pulse {
        0%, 100% { opacity: 1; filter: drop-shadow(0 0 3px ${THEME.error}); }
        50% { opacity: 0.8; filter: drop-shadow(0 0 8px ${THEME.error}); }
      }

      @keyframes sparkline-draw {
        from { stroke-dashoffset: 200; }
        to { stroke-dashoffset: 0; }
      }

      .trajectory-flow-arrow {
        animation: dash-flow 1.5s linear infinite;
      }

      .trajectory-flow-node {
        transition: transform 0.2s ease-out;
        cursor: pointer;
      }

      .trajectory-flow-node:hover {
        filter: brightness(1.2);
      }

      .trajectory-outcome-success {
        animation: success-pulse 0.8s ease-in-out infinite;
      }

      .trajectory-outcome-failure {
        animation: failure-pulse 0.8s ease-in-out infinite;
      }

      .trajectory-sparkline-line {
        stroke-dasharray: 200;
        animation: sparkline-draw 0.5s ease-out forwards;
      }
    `;
    document.head.appendChild(styleEl);
  }

  /**
   * Create an animated SVG flow diagram showing STATE -> ACTION -> OUTCOME.
   * Aggregates data from all trajectories to show the most common path.
   */
  private createFlowDiagram(trajectories: TrajectoryGanttItem[]): HTMLDivElement {
    const container = document.createElement('div');
    container.style.cssText = `
      margin-bottom:12px;padding:8px;background:${THEME.bgSurface};
      border-radius:8px;border:1px solid ${THEME.primary}33;
    `;

    // Aggregate state/action/outcome frequencies
    const stateCounts = new Map<string, number>();
    const actionCounts = new Map<string, number>();
    const outcomeCounts = new Map<string, { count: number; success: boolean }>();
    let totalReward = 0;

    for (const traj of trajectories) {
      for (const step of traj.steps) {
        const state = step.state || 'unknown';
        stateCounts.set(state, (stateCounts.get(state) || 0) + 1);
        actionCounts.set(step.action, (actionCounts.get(step.action) || 0) + 1);
        totalReward += step.reward;
      }
      const outcomeKey = traj.success ? 'success' : 'failed';
      const existing = outcomeCounts.get(outcomeKey) || { count: 0, success: traj.success };
      existing.count++;
      outcomeCounts.set(outcomeKey, existing);
    }

    // Get most common state/action
    const topState = [...stateCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'state';
    const topAction = [...actionCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'action';
    const successRate = trajectories.length > 0 ? trajectories.filter(t => t.success).length / trajectories.length : 0;
    const avgReward = trajectories.length > 0 ? totalReward / trajectories.length : 0;

    // Truncate labels for display
    const truncLabel = (s: string, max: number) => s.length > max ? s.slice(0, max - 2) + '..' : s;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 400 80');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.style.cssText = 'width:100%;max-width:400px;height:80px;display:block;margin:0 auto;';

    svg.innerHTML = `
      <!-- State Node -->
      <g class="trajectory-flow-node" transform="translate(50, 40)">
        <circle r="24" fill="${THEME.primary}" stroke="${THEME.primaryActive}" stroke-width="2"/>
        <text dy="-2" text-anchor="middle" fill="white" font-size="8" font-family="${THEME.fontMono}">STATE</text>
        <text dy="10" text-anchor="middle" fill="${THEME.primaryActive}" font-size="7" font-family="${THEME.fontMono}">${truncLabel(topState, 10)}</text>
      </g>

      <!-- Arrow: State -> Action -->
      <g class="flow-arrow">
        <path d="M 78 40 L 142 40" stroke="${THEME.primaryActive}" stroke-width="2"
              stroke-dasharray="8 4" class="trajectory-flow-arrow"/>
        <polygon points="142,35 152,40 142,45" fill="${THEME.primaryActive}"/>
      </g>

      <!-- Action Node -->
      <g class="trajectory-flow-node" transform="translate(180, 40)">
        <rect x="-28" y="-20" width="56" height="40" rx="8"
              fill="#009688" stroke="#4DB6AC" stroke-width="2"/>
        <text dy="-2" text-anchor="middle" fill="white" font-size="8" font-family="${THEME.fontMono}">ACTION</text>
        <text dy="10" text-anchor="middle" fill="#4DB6AC" font-size="7" font-family="${THEME.fontMono}">${truncLabel(topAction, 10)}</text>
      </g>

      <!-- Arrow: Action -> Outcome -->
      <g class="flow-arrow">
        <path d="M 212 40 L 276 40" stroke="${THEME.primaryActive}" stroke-width="2"
              stroke-dasharray="8 4" class="trajectory-flow-arrow"/>
        <polygon points="276,35 286,40 276,45" fill="${THEME.primaryActive}"/>
      </g>

      <!-- Outcome Node -->
      <g class="trajectory-flow-node ${successRate >= 0.5 ? 'trajectory-outcome-success' : 'trajectory-outcome-failure'}" transform="translate(315, 40)">
        <polygon points="0,-24 28,0 0,24 -28,0"
                 fill="${successRate >= 0.5 ? THEME.success : THEME.error}"
                 stroke="${successRate >= 0.5 ? '#34D399' : '#F87171'}" stroke-width="2"/>
        <text dy="4" text-anchor="middle" fill="white" font-size="8" font-family="${THEME.fontMono}">${Math.round(successRate * 100)}%</text>
      </g>

      <!-- Reward Badge -->
      <g transform="translate(365, 40)">
        <circle r="18" fill="${THEME.bgElevated}" stroke="${THEME.primaryActive}" stroke-width="1"/>
        <text dy="-2" text-anchor="middle" fill="${THEME.textMuted}" font-size="6" font-family="${THEME.fontMono}">AVG</text>
        <text dy="8" text-anchor="middle" fill="${avgReward >= 0 ? THEME.success : THEME.error}" font-size="9" font-weight="bold" font-family="${THEME.fontMono}">
          ${avgReward >= 0 ? '+' : ''}${safeNum(avgReward).toFixed(2)}
        </text>
      </g>
    `;

    container.appendChild(svg);
    return container;
  }

  /**
   * Create a sparkline SVG showing reward progression over steps.
   */
  private createSparkline(steps: TrajectoryStep[], width = 60, height = 20): SVGSVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.style.cssText = 'margin-left:8px;flex-shrink:0;';

    // Background
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', String(width));
    bg.setAttribute('height', String(height));
    bg.setAttribute('fill', THEME.bgElevated);
    bg.setAttribute('rx', '2');
    svg.appendChild(bg);

    if (steps.length === 0) return svg;

    const rewards = steps.map(s => s.reward);
    const minR = Math.min(...rewards, 0);
    const maxR = Math.max(...rewards, 1);
    const range = maxR - minR || 1;
    const padding = 2;
    const usableWidth = width - 2 * padding;
    const usableHeight = height - 2 * padding;

    // For single step, draw a dot instead of a line
    if (rewards.length === 1) {
      const r = rewards[0];
      const y = padding + (1 - (r - minR) / range) * usableHeight;
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', String(width / 2));
      circle.setAttribute('cy', String(y));
      circle.setAttribute('r', '3');
      circle.setAttribute('fill', r >= 0 ? THEME.success : THEME.error);
      svg.appendChild(circle);
      return svg;
    }

    // Zero line
    const zeroY = padding + (1 - (0 - minR) / range) * usableHeight;
    const zeroLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    zeroLine.setAttribute('x1', '0');
    zeroLine.setAttribute('y1', String(zeroY));
    zeroLine.setAttribute('x2', String(width));
    zeroLine.setAttribute('y2', String(zeroY));
    zeroLine.setAttribute('stroke', '#374151');
    zeroLine.setAttribute('stroke-width', '0.5');
    svg.appendChild(zeroLine);

    // Compute points
    const points = rewards.map((r, i) => {
      const x = padding + (i / Math.max(rewards.length - 1, 1)) * usableWidth;
      const y = padding + (1 - (r - minR) / range) * usableHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    // Polyline
    const finalReward = rewards[rewards.length - 1];
    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', points);
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', finalReward >= 0 ? THEME.success : THEME.error);
    polyline.setAttribute('stroke-width', '1.5');
    polyline.setAttribute('stroke-linecap', 'round');
    polyline.setAttribute('stroke-linejoin', 'round');
    polyline.classList.add('trajectory-sparkline-line');
    svg.appendChild(polyline);

    // End point indicator
    const lastPointParts = points.split(' ').pop()?.split(',');
    if (lastPointParts && lastPointParts.length === 2) {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', lastPointParts[0]);
      circle.setAttribute('cy', lastPointParts[1]);
      circle.setAttribute('r', '2');
      circle.setAttribute('fill', finalReward >= 0 ? THEME.success : THEME.error);
      svg.appendChild(circle);
    }

    return svg;
  }

  /**
   * Aggregate rewards from all trajectories in a group for the group sparkline.
   * Returns rewards sorted by timestamp.
   */
  private aggregateGroupRewards(items: TrajectoryGanttItem[]): number[] {
    const allSteps: Array<{ reward: number; time: number }> = [];
    for (const traj of items) {
      for (const step of traj.steps) {
        const time = step.time || step.timestamp || traj.startTime;
        allSteps.push({ reward: step.reward, time });
      }
    }
    // Sort by time and return rewards
    allSteps.sort((a, b) => a.time - b.time);
    return allSteps.map(s => s.reward);
  }

  async render(container: HTMLElement): Promise<void> {
    this.injectStyles();
    container.innerHTML = '';
    container.style.cssText = `
      background:${THEME.bgBase};color:${THEME.textPrimary};
      font-family:${THEME.fontMono};overflow-y:auto;padding:12px;
    `;

    const raw = await fetchJson<{ trajectories: TrajectoryGanttItem[] }>('/api/trajectories-gantt');
    this.data = raw?.trajectories ?? [];

    if (this.data.length === 0) {
      showNoData(container);
      return;
    }

    // Sort by start time
    this.data.sort((a, b) => a.startTime - b.startTime);

    // Group by context
    const groups = new Map<string, TrajectoryGanttItem[]>();
    for (const t of this.data) {
      const key = t.context || 'unknown';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }

    // Convert Unix seconds to ms if needed
    for (const t of this.data) {
      if (t.startTime < 1e12) t.startTime *= 1000;
      if (t.endTime < 1e12) t.endTime *= 1000;
    }

    // Time axis bounds
    const minTime = Math.min(...this.data.map(t => t.startTime));
    const maxTime = Math.max(...this.data.map(t => t.endTime));
    const timeRange = maxTime - minTime || 1;

    // Summary stats
    const totalCount = this.data.length;
    const successCount = this.data.filter(t => t.success).length;
    const summaryBar = document.createElement('div');
    summaryBar.style.cssText = `
      display:flex;gap:12px;align-items:center;margin-bottom:10px;
      font-size:11px;color:${THEME.textMuted};
    `;
    summaryBar.innerHTML = `
      <span style="color:${THEME.primaryActive};font-weight:600;">${totalCount} trajectories</span>
      <span style="color:${THEME.success};">\u2713 ${successCount}</span>
      <span style="color:${THEME.error};">\u2717 ${totalCount - successCount}</span>
      <span>${groups.size} groups</span>
    `;
    container.appendChild(summaryBar);

    // Header: time axis
    const header = document.createElement('div');
    header.style.cssText = `
      display:flex;justify-content:space-between;
      padding:4px 0 8px 0;font-size:10px;color:${THEME.textMuted};
      border-bottom:1px solid ${THEME.bgElevated};margin-bottom:8px;
    `;
    const startLabel = new Date(minTime).toLocaleTimeString();
    const endLabel = new Date(maxTime).toLocaleTimeString();
    header.innerHTML = `<span>${startLabel}</span><span>${endLabel}</span>`;
    container.appendChild(header);

    // Flow diagram - animated STATE -> ACTION -> OUTCOME visualization
    const flowDiagram = this.createFlowDiagram(this.data);
    container.appendChild(flowDiagram);

    // Tooltip
    this.tooltip = document.createElement('div');
    this.tooltip.style.cssText = `
      position:fixed;background:${THEME.bgElevated};
      border:1px solid ${THEME.primary}66;border-radius:8px;
      padding:10px;max-width:320px;font-size:11px;
      color:${THEME.textPrimary};pointer-events:none;
      opacity:0;transition:opacity 0.15s;z-index:9999;
      box-shadow:0 8px 24px rgba(0,0,0,0.5);
    `;
    document.body.appendChild(this.tooltip);

    // Render collapsible groups
    for (const [context, items] of groups) {
      const groupDiv = document.createElement('div');
      groupDiv.style.cssText = 'margin-bottom:8px;';

      // Group header (clickable toggle)
      const groupHeader = document.createElement('div');
      const groupSuccessCount = items.filter(t => t.success).length;
      groupHeader.style.cssText = `
        display:flex;align-items:center;gap:6px;cursor:pointer;
        padding:4px 6px;border-radius:4px;
        background:${THEME.bgElevated};
        transition:background 0.15s;
      `;
      groupHeader.addEventListener('mouseenter', () => {
        groupHeader.style.background = `${THEME.primary}33`;
      });
      groupHeader.addEventListener('mouseleave', () => {
        groupHeader.style.background = THEME.bgElevated;
      });

      const toggle = document.createElement('span');
      toggle.textContent = '\u25B6';
      toggle.style.cssText = `
        color:${THEME.textMuted};font-size:8px;
        transition:transform 0.2s;display:inline-block;
      `;

      const groupLabel = document.createElement('span');
      groupLabel.textContent = truncate(context, 36);
      groupLabel.title = context;
      groupLabel.style.cssText = `
        color:${THEME.primaryActive};font-size:11px;font-weight:600;
        flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
      `;

      const groupStats = document.createElement('span');
      groupStats.style.cssText = `font-size:10px;color:${THEME.textMuted};white-space:nowrap;`;
      groupStats.innerHTML = `
        <span style="color:${THEME.success};">${groupSuccessCount}</span>/<span>${items.length}</span>
      `;

      // Group sparkline showing aggregated reward progression
      const groupRewards = this.aggregateGroupRewards(items);
      const groupSparkline = this.createSparkline(
        groupRewards.map(r => ({ action: '', reward: r })),
        80,
        16
      );
      groupSparkline.style.marginLeft = '8px';

      // Mini overview bar (inline in header, visible when collapsed)
      const overview = document.createElement('div');
      overview.style.cssText = `
        height:10px;width:80px;flex-shrink:0;position:relative;margin-left:8px;
        background:${THEME.bgSurface};border-radius:3px;overflow:hidden;
      `;
      for (const traj of items) {
        const leftPct = ((traj.startTime - minTime) / timeRange) * 100;
        const widthPct = Math.max(0.5, ((traj.endTime - traj.startTime) / timeRange) * 100);
        const barColor = traj.success ? THEME.success : THEME.error;
        const bar = document.createElement('div');
        bar.style.cssText = `
          position:absolute;left:${leftPct}%;width:${widthPct}%;height:100%;
          background:${barColor};opacity:0.6;border-radius:2px;
        `;
        overview.appendChild(bar);
      }

      groupHeader.appendChild(toggle);
      groupHeader.appendChild(groupLabel);
      groupHeader.appendChild(groupStats);
      groupHeader.appendChild(overview);
      groupHeader.appendChild(groupSparkline);
      groupDiv.appendChild(groupHeader);

      // Individual rows container (hidden by default)
      const rowsContainer = document.createElement('div');
      rowsContainer.style.cssText = 'display:none;margin-top:4px;';
      for (const traj of items) {
        const row = this.createTrajectoryRow(traj, minTime, timeRange);
        rowsContainer.appendChild(row);
      }
      groupDiv.appendChild(rowsContainer);

      // Toggle expand/collapse
      let expanded = false;
      groupHeader.addEventListener('click', () => {
        expanded = !expanded;
        toggle.textContent = expanded ? '\u25BC' : '\u25B6';
        // Hide inline overview bar when expanded, show when collapsed
        overview.style.opacity = expanded ? '0' : '1';
        overview.style.width = expanded ? '0' : '80px';
        overview.style.marginLeft = expanded ? '0' : '8px';
        rowsContainer.style.display = expanded ? 'block' : 'none';
      });

      container.appendChild(groupDiv);
    }

    // Cleanup tooltip on container removal
    const observer = new MutationObserver(() => {
      if (!document.body.contains(container) && this.tooltip) {
        this.tooltip.remove();
        this.tooltip = null;
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  private createTrajectoryRow(
    traj: TrajectoryGanttItem,
    minTime: number,
    timeRange: number
  ): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = `
      display:flex;align-items:center;height:28px;margin-bottom:2px;cursor:pointer;
    `;

    // Left label — show agent + short state from first step
    const stepState = traj.steps?.[0]?.state || '';
    const shortState = stepState.includes('_') ? stepState.substring(stepState.indexOf('_') + 1) : stepState;
    const rowLabel = traj.agent && traj.agent !== 'unknown'
      ? `${traj.agent}: ${shortState}`
      : shortState || traj.id;
    const label = document.createElement('div');
    label.textContent = truncate(rowLabel, 22);
    label.title = `${traj.id} | ${traj.agent} | ${stepState}`;
    label.style.cssText = `
      width:120px;min-width:120px;font-size:10px;color:${THEME.textMuted};
      overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:6px;
    `;
    row.appendChild(label);

    // Bar container
    const barContainer = document.createElement('div');
    barContainer.style.cssText = `
      flex:1;height:20px;position:relative;background:${THEME.bgElevated};
      border-radius:4px;overflow:hidden;
    `;

    // Bar
    const leftPct = ((traj.startTime - minTime) / timeRange) * 100;
    const widthPct = Math.max(1, ((traj.endTime - traj.startTime) / timeRange) * 100);
    const barColor = traj.success ? THEME.success : THEME.error;
    const opacity = 0.4 + Math.min(Math.abs(traj.quality), 1) * 0.6;

    const bar = document.createElement('div');
    bar.style.cssText = `
      position:absolute;left:${leftPct}%;width:${widthPct}%;height:100%;
      background:${barColor};opacity:${opacity};border-radius:4px;
      transition:opacity 0.15s;
    `;
    barContainer.appendChild(bar);
    row.appendChild(barContainer);

    // Row sparkline showing reward progression for this trajectory
    const rowSparkline = this.createSparkline(traj.steps, 60, 20);
    row.appendChild(rowSparkline);

    // Hover events
    row.addEventListener('mouseenter', (e) => {
      bar.style.opacity = '1';
      if (this.tooltip) {
        this.tooltip.innerHTML = `
          <div style="color:${THEME.primaryActive};font-weight:600;margin-bottom:6px;">
            ${escapeHtml(traj.context)}
          </div>
          <div style="margin-bottom:3px;">
            <span style="color:${THEME.textMuted};">Agent:</span> ${escapeHtml(traj.agent || 'unknown')}
          </div>
          <div style="margin-bottom:3px;">
            <span style="color:${THEME.textMuted};">Outcome:</span>
            <span style="color:${traj.success ? THEME.success : THEME.error};">
              ${traj.success ? 'Success' : 'Failed'}
            </span>
          </div>
          <div style="margin-bottom:3px;">
            <span style="color:${THEME.textMuted};">Quality:</span> ${safeNum(traj.quality).toFixed(3)}
          </div>
          <div style="margin-bottom:3px;">
            <span style="color:${THEME.textMuted};">Steps:</span> ${traj.steps.length}
          </div>
          <div style="color:${THEME.textMuted};font-size:10px;">
            ${new Date(traj.startTime).toLocaleString()}
          </div>
        `;
        this.tooltip.style.opacity = '1';
        this.tooltip.style.left = `${(e as MouseEvent).clientX + 12}px`;
        this.tooltip.style.top = `${(e as MouseEvent).clientY + 12}px`;
      }
    });

    row.addEventListener('mousemove', (e) => {
      if (this.tooltip) {
        this.tooltip.style.left = `${(e as MouseEvent).clientX + 12}px`;
        this.tooltip.style.top = `${(e as MouseEvent).clientY + 12}px`;
      }
    });

    row.addEventListener('mouseleave', () => {
      bar.style.opacity = String(opacity);
      if (this.tooltip) {
        this.tooltip.style.opacity = '0';
      }
    });

    // Click to expand steps
    const stepsContainer = document.createElement('div');
    stepsContainer.style.cssText = `display:none;padding:4px 0 4px 126px;`;

    row.addEventListener('click', () => {
      const expanded = this.expandedIds.has(traj.id);
      if (expanded) {
        this.expandedIds.delete(traj.id);
        stepsContainer.style.display = 'none';
      } else {
        this.expandedIds.add(traj.id);
        stepsContainer.style.display = 'block';
        stepsContainer.innerHTML = '';
        if (traj.steps.length === 0) {
          stepsContainer.innerHTML = `<div style="color:${THEME.textMuted};font-size:10px;">No steps recorded</div>`;
        } else {
          for (const step of traj.steps) {
            const stepDiv = document.createElement('div');
            stepDiv.style.cssText = `
              display:flex;gap:8px;align-items:center;padding:2px 0;font-size:10px;
            `;
            const stepReward = safeNum(step.reward);
            const rewardColor = stepReward >= 0 ? THEME.success : THEME.error;
            stepDiv.innerHTML = `
              <span style="color:${THEME.primaryActive};">${escapeHtml(step.action)}</span>
              <span style="color:${rewardColor};font-family:${THEME.fontMono};" title="Reinforcement learning reward signal">
                reward: ${stepReward.toFixed(2)}
              </span>
              ${step.result ? `<span style="color:${THEME.textMuted};">${escapeHtml(truncate(step.result, 30))}</span>` : ''}
            `;
            stepsContainer.appendChild(stepDiv);
          }
        }
      }
    });

    // Wrap row + expandable steps
    const wrapper = document.createElement('div');
    wrapper.appendChild(row);
    wrapper.appendChild(stepsContainer);
    return wrapper;
  }
}

// ============================================================================
// 2. LearningDashboard
// ============================================================================

/**
 * Shows all 9 learning algorithms with heatmaps and convergence curves.
 *
 * Enhanced features:
 * - Displays ALL 9 algorithms in 3x3 grid with visual states (active/configured/dormant)
 * - Radar chart comparing algorithm metrics across 5 dimensions
 * - Combined convergence curves overlay for all active algorithms
 * - Mini convergence sparklines per-algorithm card
 * - Reward distribution histogram
 */
export class LearningDashboard {
  private rewardHistoryByAlgorithm: Record<string, number[]> = {};

  async render(container: HTMLElement): Promise<void> {
    container.innerHTML = '';
    container.style.cssText = `
      background:${THEME.bgBase};color:${THEME.textPrimary};
      font-family:${THEME.fontMono};overflow-y:auto;padding:12px;
    `;

    const raw = await fetchJson<LearningAlgorithmsResponse>('/api/learning-algorithms');
    const algorithms = raw?.algorithms ?? [];

    // Build reward history by algorithm from convergence curves
    const curves = raw?.convergenceCurves ?? {};
    this.rewardHistoryByAlgorithm = {};
    for (const [name, points] of Object.entries(curves)) {
      const validRewards = (points || [])
        .filter(p => p.runningAvg !== null)
        .map(p => p.runningAvg!);
      this.rewardHistoryByAlgorithm[name] = validRewards;
    }

    // Ensure all 9 algorithms are displayed in canonical order
    const orderedAlgorithms = ALGORITHM_ORDER.map(name => {
      const found = algorithms.find(a => a.name === name);
      if (found) return found;
      // Create placeholder for missing algorithm
      return {
        name,
        stats: { updates: 0, avgReward: 0, convergenceScore: 0, isActive: false },
        config: { learningRate: null, discountFactor: null, epsilon: null },
        qTable: {},
      } as LearningAlgorithmRaw;
    });

    // Summary stats at top
    const activeCount = orderedAlgorithms.filter(a => a.stats.updates > 0).length;
    const totalUpdates = orderedAlgorithms.reduce((s, a) => s + a.stats.updates, 0);
    const summaryRow = document.createElement('div');
    summaryRow.style.cssText = 'display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;';
    summaryRow.appendChild(statCard('9', 'Total Algorithms', THEME.primaryActive));
    summaryRow.appendChild(statCard(String(activeCount), 'Active', THEME.success));
    summaryRow.appendChild(statCard(formatNumber(totalUpdates), 'Total Updates', THEME.warning));
    container.appendChild(summaryRow);

    // Compute normalized metrics for radar chart
    const normalizedMetrics = this.normalizeMetrics(orderedAlgorithms);
    const hasActiveAlgorithms = normalizedMetrics.some(m => m.isActive);

    // Charts row: Radar + Combined Convergence side by side
    if (hasActiveAlgorithms) {
      const chartsRow = document.createElement('div');
      chartsRow.style.cssText = `
        display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap;
      `;

      // Radar chart container
      const radarCard = createCard('Algorithm Comparison');
      radarCard.style.cssText += 'flex:0 0 auto;min-width:420px;';
      this.renderRadarChart(radarCard, normalizedMetrics, ALGORITHM_COLORS);
      chartsRow.appendChild(radarCard);

      // Combined convergence chart container
      const convergenceCard = createCard('Combined Convergence Curves');
      convergenceCard.style.cssText += 'flex:1;min-width:400px;';
      this.renderCombinedConvergence(convergenceCard, curves, ALGORITHM_COLORS);
      chartsRow.appendChild(convergenceCard);

      container.appendChild(chartsRow);
    }

    // 3x3 Grid of algorithm cards
    const grid = document.createElement('div');
    grid.style.cssText = `
      display:grid;
      grid-template-columns:repeat(3, 1fr);
      gap:12px;margin-bottom:16px;
    `;

    for (const algo of orderedAlgorithms) {
      const cardStyle = this.getCardStyle(algo);
      const card = document.createElement('div');
      card.style.cssText = cardStyle;

      // Header row with name and status badge
      const headerRow = document.createElement('div');
      headerRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;';

      const nameLabel = document.createElement('div');
      nameLabel.textContent = algo.name;
      nameLabel.style.cssText = `
        color:${ALGORITHM_COLORS[algo.name] || THEME.primaryActive};
        font-size:14px;font-weight:700;
      `;
      headerRow.appendChild(nameLabel);

      // Status badge
      const isActive = algo.stats.updates > 0;
      const hasConfig = algo.config.learningRate !== null ||
                        algo.config.discountFactor !== null ||
                        algo.config.epsilon !== null;

      const statusBadge = document.createElement('span');
      if (isActive) {
        statusBadge.textContent = 'ACTIVE';
        statusBadge.style.cssText = `
          display:inline-block;background:${THEME.success}22;color:${THEME.success};
          padding:2px 8px;border-radius:4px;font-size:9px;font-weight:700;
          border:1px solid ${THEME.success}44;
        `;
      } else if (hasConfig) {
        statusBadge.textContent = 'CONFIGURED';
        statusBadge.style.cssText = `
          display:inline-block;background:${THEME.primary}22;color:${THEME.primary};
          padding:2px 8px;border-radius:4px;font-size:9px;font-weight:700;
          border:1px solid ${THEME.primary}44;
        `;
      } else {
        statusBadge.textContent = 'DORMANT';
        statusBadge.style.cssText = `
          display:inline-block;background:${THEME.textMuted}22;color:${THEME.textMuted};
          padding:2px 8px;border-radius:4px;font-size:9px;font-weight:700;
          border:1px dashed ${THEME.textMuted}44;
        `;
      }
      headerRow.appendChild(statusBadge);
      card.appendChild(headerRow);

      // Stats row
      const statsRow = document.createElement('div');
      statsRow.style.cssText = `
        display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;
      `;

      const avgReward = safeNum(algo.stats.avgReward);
      const convergence = safeNum(algo.stats.convergenceScore);
      const statItems = [
        {
          label: 'Updates',
          value: algo.stats.updates > 0 ? formatNumber(algo.stats.updates) : '--',
          color: THEME.primaryActive,
        },
        {
          label: 'Avg Reward',
          value: algo.stats.updates > 0 ? formatNumber(avgReward) : '--',
          color: avgReward >= 0 ? THEME.success : THEME.error,
        },
        {
          label: 'Conv',
          value: algo.stats.updates > 0 ? `${(convergence * 100).toFixed(0)}%` : '--',
          color: THEME.warning,
        },
      ];

      for (const s of statItems) {
        const stat = document.createElement('div');
        stat.style.cssText = `
          background:${THEME.bgElevated};border-radius:6px;padding:4px 8px;
          text-align:center;flex:1;min-width:60px;
        `;
        stat.innerHTML = `
          <div style="color:${s.color};font-size:14px;font-weight:700;">${s.value}</div>
          <div style="color:${THEME.textMuted};font-size:8px;">${s.label}</div>
        `;
        statsRow.appendChild(stat);
      }
      card.appendChild(statsRow);

      // Config row (if has data)
      const cfg = algo.config;
      if (cfg.learningRate !== null || cfg.discountFactor !== null || cfg.epsilon !== null) {
        const cfgRow = document.createElement('div');
        cfgRow.style.cssText = `font-size:9px;color:${THEME.textMuted};margin-bottom:8px;`;
        const parts: string[] = [];
        if (cfg.learningRate !== null) parts.push(`lr=${cfg.learningRate}`);
        if (cfg.discountFactor !== null) parts.push(`\u03B3=${cfg.discountFactor}`);
        if (cfg.epsilon !== null) parts.push(`\u03B5=${cfg.epsilon}`);
        cfgRow.textContent = parts.join('  ');
        card.appendChild(cfgRow);
      }

      // Mini convergence sparkline
      const convergencePoints = curves[algo.name] || [];
      const miniContainer = document.createElement('div');
      miniContainer.style.cssText = 'margin-bottom:8px;';
      this.renderMiniConvergence(
        miniContainer,
        convergencePoints,
        ALGORITHM_COLORS[algo.name] || THEME.primary
      );
      card.appendChild(miniContainer);

      // Q-table heatmap (only if has data)
      if (algo.qTable && Object.keys(algo.qTable).length > 0) {
        const heatmapLabel = document.createElement('div');
        heatmapLabel.textContent = 'Q-Table';
        heatmapLabel.style.cssText = `color:${THEME.textMuted};font-size:9px;margin-bottom:4px;`;
        card.appendChild(heatmapLabel);

        const heatmapContainer = document.createElement('div');
        heatmapContainer.style.cssText = 'overflow-x:auto;';
        const states = Object.keys(algo.qTable);
        const actionSet = new Set<string>();
        for (const s of states) {
          if (typeof algo.qTable[s] === 'object' && algo.qTable[s] !== null) {
            for (const a of Object.keys(algo.qTable[s])) {
              actionSet.add(a);
            }
          }
        }
        if (states.length > 0 && actionSet.size > 0) {
          createHeatmap(heatmapContainer, algo.qTable, states, Array.from(actionSet));
          card.appendChild(heatmapContainer);
        }
      }

      grid.appendChild(card);
    }

    container.appendChild(grid);

    // Global reward history sparkline
    const rewardHistory = raw?.rewardHistory ?? [];
    if (rewardHistory.length > 0) {
      const histCard = createCard('Global Reward History');
      const displayHistory = rewardHistory.length > 500 ? downsample(rewardHistory, 500) : rewardHistory;
      if (displayHistory.length > 1) {
        renderLineChart(histCard, displayHistory, THEME.primaryActive, 500, 120);
      }
      // Also show histogram
      this.renderHistogram(histCard, rewardHistory);
      container.appendChild(histCard);
    }
  }

  /** Get card styling based on algorithm state */
  private getCardStyle(algo: LearningAlgorithmRaw): string {
    const base = `
      background:${THEME.bgSurface};
      border-radius:12px;
      padding:12px;
      transition: all 0.3s ease;
    `;

    const isActive = algo.stats.updates > 0;
    const hasConfig = algo.config.learningRate !== null ||
                      algo.config.discountFactor !== null ||
                      algo.config.epsilon !== null;

    if (isActive) {
      return base + `
        border: 1px solid ${THEME.success};
        box-shadow: 0 0 12px ${THEME.success}33;
        opacity: 1;
      `;
    }

    if (hasConfig) {
      return base + `
        border: 1px solid ${THEME.primary}44;
        opacity: 0.85;
      `;
    }

    return base + `
      border: 1px dashed ${THEME.primary}44;
      opacity: 0.6;
    `;
  }

  /** Compute stability from reward variance (1 - coefficient of variation) */
  private computeStability(rewards: number[]): number {
    if (rewards.length < 2) return 0;

    const mean = rewards.reduce((a, b) => a + b, 0) / rewards.length;
    if (mean === 0) return 0;

    const variance = rewards.reduce((sum, r) =>
      sum + Math.pow(r - mean, 2), 0) / rewards.length;
    const stdDev = Math.sqrt(variance);
    const cv = stdDev / Math.abs(mean);

    // Low CV = high stability
    return Math.max(0, 1 - Math.min(cv, 1));
  }

  /** Normalize metrics for radar chart (all values 0-1) */
  private normalizeMetrics(algorithms: LearningAlgorithmRaw[]): AlgorithmMetrics[] {
    const maxUpdates = Math.max(...algorithms.map(a => a.stats.updates), 1);
    const maxReward = Math.max(
      ...algorithms.map(a => Math.abs(a.stats.avgReward)),
      1
    );

    return algorithms.map(algo => {
      const rewards = this.rewardHistoryByAlgorithm[algo.name] || [];
      const stability = this.computeStability(rewards);
      const isActive = algo.stats.updates > 0;

      return {
        name: algo.name,
        updates: isActive ? Math.log1p(algo.stats.updates) / Math.log1p(maxUpdates) : 0,
        avgReward: isActive ? Math.abs(algo.stats.avgReward) / maxReward : 0,
        convergenceScore: isActive ? algo.stats.convergenceScore : 0,
        learningRate: algo.config.learningRate,
        learningRateNorm: algo.config.learningRate
          ? 1 - Math.min(algo.config.learningRate, 1)
          : 0,
        stability,
        isActive,
        hasConfig: algo.config.learningRate !== null,
      };
    });
  }

  /** Render radar chart comparing algorithms across 5 metrics */
  private renderRadarChart(
    container: HTMLElement,
    algorithms: AlgorithmMetrics[],
    colors: Record<string, string>
  ): void {
    const width = 400;
    const height = 400;
    const margin = 60;
    const radius = Math.min(width, height) / 2 - margin;
    const axes = RADAR_AXES;
    const angleSlice = axes.length > 0 ? (Math.PI * 2) / axes.length : Math.PI / 4;

    const svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .style('display', 'block')
      .style('max-width', '100%');

    const g = svg.append('g')
      .attr('transform', `translate(${width / 2},${height / 2})`);

    // Background pentagons at 25%, 50%, 75%, 100%
    [0.25, 0.5, 0.75, 1.0].forEach(level => {
      const points = axes.map((_, i) => {
        const angle = angleSlice * i - Math.PI / 2;
        return [
          radius * level * Math.cos(angle),
          radius * level * Math.sin(angle),
        ] as [number, number];
      });
      g.append('polygon')
        .attr('points', points.map(p => p.join(',')).join(' '))
        .attr('fill', 'none')
        .attr('stroke', `${THEME.primary}33`)
        .attr('stroke-width', 1);
    });

    // Axis lines and labels
    axes.forEach((axis, i) => {
      const angle = angleSlice * i - Math.PI / 2;
      g.append('line')
        .attr('x1', 0)
        .attr('y1', 0)
        .attr('x2', radius * Math.cos(angle))
        .attr('y2', radius * Math.sin(angle))
        .attr('stroke', `${THEME.primary}44`)
        .attr('stroke-width', 1);

      // Axis label
      const labelRadius = radius + 20;
      g.append('text')
        .attr('x', labelRadius * Math.cos(angle))
        .attr('y', labelRadius * Math.sin(angle))
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('fill', THEME.textMuted)
        .attr('font-size', '10px')
        .attr('font-family', THEME.fontMono)
        .text(axis.name);
    });

    // Algorithm polygons
    algorithms.filter(a => a.isActive).forEach(algo => {
      const points = axes.map((axis, i) => {
        const value = algo[axis.key] ?? 0;
        const angle = angleSlice * i - Math.PI / 2;
        return [
          radius * value * Math.cos(angle),
          radius * value * Math.sin(angle),
        ] as [number, number];
      });

      const algoColor = colors[algo.name] || THEME.primary;

      g.append('polygon')
        .attr('points', points.map(p => p.join(',')).join(' '))
        .attr('fill', `${algoColor}33`)
        .attr('stroke', algoColor)
        .attr('stroke-width', 2)
        .attr('opacity', 0.8)
        .style('cursor', 'pointer')
        .on('mouseover', function() {
          d3.select(this)
            .attr('fill', `${algoColor}66`)
            .attr('opacity', 1)
            .attr('stroke-width', 3);
        })
        .on('mouseout', function() {
          d3.select(this)
            .attr('fill', `${algoColor}33`)
            .attr('opacity', 0.8)
            .attr('stroke-width', 2);
        });
    });

    // Legend
    const legendG = svg.append('g')
      .attr('transform', `translate(${width - 110}, 20)`);

    const activeAlgos = algorithms.filter(a => a.isActive);
    activeAlgos.forEach((algo, i) => {
      const legendRow = legendG.append('g')
        .attr('transform', `translate(0, ${i * 18})`);

      legendRow.append('rect')
        .attr('width', 12)
        .attr('height', 12)
        .attr('rx', 2)
        .attr('fill', colors[algo.name] || THEME.primary);

      legendRow.append('text')
        .attr('x', 16)
        .attr('y', 10)
        .attr('fill', THEME.textSecondary)
        .attr('font-size', '10px')
        .attr('font-family', THEME.fontMono)
        .text(algo.name);
    });
  }

  /** Render combined convergence curves for all active algorithms */
  private renderCombinedConvergence(
    container: HTMLElement,
    curves: Record<string, Array<{ timestamp: number | null; runningAvg: number | null }>>,
    colors: Record<string, string>
  ): void {
    const width = 600;
    const height = 200;
    const margin = { top: 20, right: 120, bottom: 30, left: 50 };
    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;

    // Collect all valid curve data
    const curveData: Array<{ name: string; points: number[] }> = [];
    for (const [name, points] of Object.entries(curves)) {
      const validPoints = (points || [])
        .filter(p => p.runningAvg !== null)
        .map(p => p.runningAvg!);
      if (validPoints.length >= 2) {
        curveData.push({ name, points: validPoints });
      }
    }

    if (curveData.length === 0) {
      const noDataMsg = document.createElement('div');
      noDataMsg.textContent = 'Awaiting convergence data...';
      noDataMsg.style.cssText = `
        color:${THEME.textMuted};font-size:12px;
        padding:40px;text-align:center;
      `;
      container.appendChild(noDataMsg);
      return;
    }

    // Compute Y extent across all curves
    const allRewards = curveData.flatMap(c => c.points);
    const yExtent = d3.extent(allRewards) as [number, number];
    // Guard against undefined extent values
    const safeYExtent: [number, number] = [yExtent[0] ?? 0, yExtent[1] ?? 1];

    const svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .style('display', 'block')
      .style('max-width', '100%');

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // X scale: normalized 0-1 (percentage of updates)
    const xScale = d3.scaleLinear()
      .domain([0, 1])
      .range([0, w]);

    // Y scale
    const yScale = d3.scaleLinear()
      .domain(safeYExtent)
      .nice()
      .range([h, 0]);

    // X axis
    g.append('g')
      .attr('transform', `translate(0,${h})`)
      .call(d3.axisBottom(xScale).ticks(5).tickFormat(d => `${(d as number) * 100}%`))
      .selectAll('text')
      .attr('fill', THEME.textMuted)
      .style('font-size', '9px')
      .style('font-family', THEME.fontMono);

    // Y axis
    g.append('g')
      .call(d3.axisLeft(yScale).ticks(5).tickFormat(d => formatNumber(d as number)))
      .selectAll('text')
      .attr('fill', THEME.textMuted)
      .style('font-size', '9px')
      .style('font-family', THEME.fontMono);

    g.selectAll('.domain, .tick line').attr('stroke', `${THEME.primary}44`);

    // Axis labels
    g.append('text')
      .attr('x', w / 2)
      .attr('y', h + 25)
      .attr('text-anchor', 'middle')
      .attr('fill', THEME.textMuted)
      .attr('font-size', '9px')
      .text('Progress (% of updates)');

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -h / 2)
      .attr('y', -35)
      .attr('text-anchor', 'middle')
      .attr('fill', THEME.textMuted)
      .attr('font-size', '9px')
      .text('Running Avg Reward');

    // Render each curve
    curveData.forEach(({ name, points }) => {
      const lineGen = d3.line<number>()
        .x((_, i) => xScale(i / (points.length - 1)))
        .y(d => yScale(d))
        .curve(d3.curveMonotoneX);

      g.append('path')
        .datum(points)
        .attr('d', lineGen)
        .attr('fill', 'none')
        .attr('stroke', colors[name] || THEME.primary)
        .attr('stroke-width', 2)
        .attr('opacity', 0.8);
    });

    // Legend
    const legendG = svg.append('g')
      .attr('transform', `translate(${width - margin.right + 10}, ${margin.top})`);

    curveData.forEach(({ name }, i) => {
      const legendRow = legendG.append('g')
        .attr('transform', `translate(0, ${i * 16})`);

      legendRow.append('line')
        .attr('x1', 0)
        .attr('y1', 6)
        .attr('x2', 16)
        .attr('y2', 6)
        .attr('stroke', colors[name] || THEME.primary)
        .attr('stroke-width', 2);

      legendRow.append('text')
        .attr('x', 20)
        .attr('y', 9)
        .attr('fill', THEME.textSecondary)
        .attr('font-size', '9px')
        .attr('font-family', THEME.fontMono)
        .text(name);
    });
  }

  /** Render mini convergence sparkline for individual algorithm card */
  private renderMiniConvergence(
    container: HTMLElement,
    points: Array<{ timestamp: number | null; runningAvg: number | null }>,
    color: string
  ): void {
    const validPoints = (points || []).filter(p => p.runningAvg !== null);

    if (validPoints.length < 2) {
      const placeholder = document.createElement('div');
      placeholder.style.cssText = `
        height:60px;display:flex;align-items:center;justify-content:center;
        background:${THEME.bgElevated};border-radius:6px;
        color:${THEME.textMuted};font-size:10px;
      `;
      placeholder.textContent = 'Awaiting data...';
      container.appendChild(placeholder);
      return;
    }

    const width = 280;
    const height = 60;
    const rewards = validPoints.map(p => p.runningAvg!);

    const svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .style('display', 'block')
      .style('max-width', '100%');

    // Gradient definition
    const gradientId = `gradient-mini-${Math.random().toString(36).slice(2)}`;
    const defs = svg.append('defs');
    const gradient = defs.append('linearGradient')
      .attr('id', gradientId)
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');
    gradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', color)
      .attr('stop-opacity', 0.4);
    gradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', color)
      .attr('stop-opacity', 0);

    // Scales
    const xScale = d3.scaleLinear()
      .domain([0, rewards.length - 1])
      .range([0, width]);

    const yExtent = d3.extent(rewards) as [number, number];
    // Guard against undefined extent values
    const safeYExtent: [number, number] = [yExtent[0] ?? 0, yExtent[1] ?? 1];
    const yScale = d3.scaleLinear()
      .domain(safeYExtent)
      .range([height - 5, 5]);

    // Area
    const areaGen = d3.area<number>()
      .x((_, i) => xScale(i))
      .y0(height)
      .y1(d => yScale(d))
      .curve(d3.curveMonotoneX);

    svg.append('path')
      .datum(rewards)
      .attr('d', areaGen)
      .attr('fill', `url(#${gradientId})`);

    // Line
    const lineGen = d3.line<number>()
      .x((_, i) => xScale(i))
      .y(d => yScale(d))
      .curve(d3.curveMonotoneX);

    svg.append('path')
      .datum(rewards)
      .attr('d', lineGen)
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('stroke-width', 2);

    // Add start/end value labels
    const startVal = rewards[0];
    const endVal = rewards[rewards.length - 1];

    svg.append('text')
      .attr('x', 4)
      .attr('y', yScale(startVal))
      .attr('fill', THEME.textMuted)
      .attr('font-size', '8px')
      .attr('font-family', THEME.fontMono)
      .attr('dominant-baseline', 'middle')
      .text(formatNumber(startVal));

    svg.append('text')
      .attr('x', width - 4)
      .attr('y', yScale(endVal))
      .attr('fill', color)
      .attr('font-size', '8px')
      .attr('font-family', THEME.fontMono)
      .attr('text-anchor', 'end')
      .attr('dominant-baseline', 'middle')
      .text(formatNumber(endVal));
  }

  private renderHistogram(container: HTMLElement, values: number[]): void {
    const width = 500;
    const height = 140;
    const pad = { top: 10, right: 10, bottom: 25, left: 40 };
    const w = width - pad.left - pad.right;
    const h = height - pad.top - pad.bottom;

    const svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .style('display', 'block')
      .style('max-width', '100%');

    const g = svg.append('g')
      .attr('transform', `translate(${pad.left},${pad.top})`);

    const extent = d3.extent(values) as [number, number];
    // Guard against undefined extent values
    const safeExtent: [number, number] = [extent[0] ?? 0, extent[1] ?? 1];
    const x = d3.scaleLinear().domain(safeExtent).range([0, w]);

    const bins = d3.bin<number, number>()
      .domain(x.domain() as [number, number])
      .thresholds(Math.min(40, Math.ceil(Math.sqrt(values.length))))(values);

    const y = d3.scaleLinear()
      .domain([0, d3.max(bins, b => b.length) || 1])
      .range([h, 0]);

    // Bars
    g.selectAll('rect')
      .data(bins)
      .join('rect')
      .attr('x', d => x(d.x0!) + 1)
      .attr('y', d => y(d.length))
      .attr('width', d => Math.max(0, x(d.x1!) - x(d.x0!) - 2))
      .attr('height', d => h - y(d.length))
      .attr('fill', THEME.primary)
      .attr('rx', 2);

    // X axis
    g.append('g')
      .attr('transform', `translate(0,${h})`)
      .call(d3.axisBottom(x).ticks(6).tickFormat(d => formatNumber(d as number)))
      .selectAll('text')
      .attr('fill', THEME.textMuted)
      .style('font-size', '9px')
      .style('font-family', THEME.fontMono);

    // Y axis
    g.append('g')
      .call(d3.axisLeft(y).ticks(4))
      .selectAll('text')
      .attr('fill', THEME.textMuted)
      .style('font-size', '9px')
      .style('font-family', THEME.fontMono);

    g.selectAll('.domain, .tick line').attr('stroke', `${THEME.primary}44`);
  }
}

// ============================================================================
// 3. SessionAnalytics
// ============================================================================

/**
 * Timeline of sessions with creation rates.
 *
 * Renders a bar chart of memories created per period, a line overlay for
 * trajectory counts, pattern drift visualization, and summary stat cards.
 */
export class SessionAnalytics {
  async render(container: HTMLElement): Promise<void> {
    container.innerHTML = '';
    container.style.cssText = `
      background:${THEME.bgBase};color:${THEME.textPrimary};
      font-family:${THEME.fontMono};overflow-y:auto;padding:12px;
    `;

    const raw = await fetchJson<SessionAnalyticsResponse>('/api/session-analytics');
    if (!raw) {
      showNoData(container);
      return;
    }

    const meta = raw.meta || { totalMemories: 0, totalTrajectories: 0, totalPatterns: 0, daySpan: 0 };
    const rates = raw.rates || { memoriesPerHour: 0, trajectoriesPerHour: 0 };
    const sessions = raw.sessions || [];

    // Stat cards
    const statsRow = document.createElement('div');
    statsRow.style.cssText = 'display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;';
    statsRow.appendChild(statCard(formatNumber(safeNum(meta.totalMemories)), 'Total Memories', THEME.primaryActive));
    statsRow.appendChild(statCard(formatNumber(safeNum(meta.totalTrajectories)), 'Trajectories', THEME.success));
    statsRow.appendChild(statCard(safeNum(rates.memoriesPerHour).toFixed(1), 'Memories/hr', THEME.warning));
    statsRow.appendChild(statCard(formatNumber(safeNum(meta.totalPatterns)), 'Patterns', THEME.primary));
    container.appendChild(statsRow);

    // Convert sessions to period format for chart
    const memoriesPerPeriod = sessions.map(s => ({ period: s.date, count: s.memoryCount }));
    const trajectoriesPerPeriod = sessions.map(s => ({ period: s.date, count: s.trajectoryCount }));

    // Combined bar + line chart
    if (memoriesPerPeriod.length > 0) {
      const chartCard = createCard('Memory & Trajectory Creation');
      this.renderCombinedChart(chartCard, memoriesPerPeriod, trajectoriesPerPeriod);
      container.appendChild(chartCard);
    }

    // Stats metadata
    if (raw.statsMetadata && raw.statsMetadata.length > 0) {
      const metaCard = createCard('Stats Metadata');
      for (const item of raw.statsMetadata) {
        metaCard.appendChild(metricRow(item.key.replace(/_/g, ' '), item.value));
      }
      container.appendChild(metaCard);
    }

    // Pattern drift
    if (raw.patternDrift && raw.patternDrift.length > 0) {
      const driftCard = createCard('Pattern Drift (Q-Value Before/After)');
      this.renderPatternDrift(driftCard, raw.patternDrift);
      container.appendChild(driftCard);
    }
  }

  private renderCombinedChart(
    container: HTMLElement,
    memories: Array<{ period: string; count: number }>,
    trajectories: Array<{ period: string; count: number }>
  ): void {
    const width = 600;
    const height = 200;
    const pad = { top: 14, right: 50, bottom: 40, left: 45 };
    const w = width - pad.left - pad.right;
    const h = height - pad.top - pad.bottom;

    const svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .style('display', 'block')
      .style('max-width', '100%');

    const g = svg.append('g')
      .attr('transform', `translate(${pad.left},${pad.top})`);

    // X scale (band for bars)
    const periods = memories.map(m => m.period);
    const x = d3.scaleBand()
      .domain(periods)
      .range([0, w])
      .padding(0.2);

    // Y scale (left: memories)
    const maxMem = d3.max(memories, m => m.count) || 1;
    const yLeft = d3.scaleLinear().domain([0, maxMem]).range([h, 0]);

    // Y scale (right: trajectories)
    const trajMap = new Map(trajectories.map(t => [t.period, t.count]));
    const maxTraj = d3.max(trajectories, t => t.count) || 1;
    const yRight = d3.scaleLinear().domain([0, maxTraj]).range([h, 0]);

    // Bars (memories)
    g.selectAll('rect.mem-bar')
      .data(memories)
      .join('rect')
      .attr('class', 'mem-bar')
      .attr('x', d => x(d.period)!)
      .attr('y', d => yLeft(d.count))
      .attr('width', x.bandwidth())
      .attr('height', d => h - yLeft(d.count))
      .attr('fill', THEME.primary)
      .attr('rx', 3);

    // Line (trajectories)
    if (trajectories.length > 1) {
      const lineGen = d3.line<{ period: string; count: number }>()
        .x(d => (x(d.period) ?? 0) + x.bandwidth() / 2)
        .y(d => yRight(d.count))
        .curve(d3.curveMonotoneX);

      // Build aligned trajectory data (match periods)
      const alignedTraj = periods.map(p => ({
        period: p,
        count: trajMap.get(p) || 0
      }));

      g.append('path')
        .datum(alignedTraj)
        .attr('d', lineGen)
        .attr('fill', 'none')
        .attr('stroke', THEME.success)
        .attr('stroke-width', 2);

      // Dots
      g.selectAll('circle.traj-dot')
        .data(alignedTraj)
        .join('circle')
        .attr('class', 'traj-dot')
        .attr('cx', d => (x(d.period) ?? 0) + x.bandwidth() / 2)
        .attr('cy', d => yRight(d.count))
        .attr('r', 3)
        .attr('fill', THEME.success);
    }

    // X axis
    const xAxis = g.append('g')
      .attr('transform', `translate(0,${h})`)
      .call(d3.axisBottom(x));

    xAxis.selectAll('text')
      .attr('fill', THEME.textMuted)
      .style('font-size', '8px')
      .style('font-family', THEME.fontMono)
      .attr('transform', 'rotate(-35)')
      .attr('text-anchor', 'end');

    xAxis.selectAll('.domain, .tick line').attr('stroke', `${THEME.primary}44`);

    // Y left axis
    const yLeftAxis = g.append('g')
      .call(d3.axisLeft(yLeft).ticks(5));
    yLeftAxis.selectAll('text')
      .attr('fill', THEME.textMuted)
      .style('font-size', '9px')
      .style('font-family', THEME.fontMono);
    yLeftAxis.selectAll('.domain, .tick line').attr('stroke', `${THEME.primary}44`);

    // Y right axis
    const yRightAxis = g.append('g')
      .attr('transform', `translate(${w},0)`)
      .call(d3.axisRight(yRight).ticks(4));
    yRightAxis.selectAll('text')
      .attr('fill', THEME.success)
      .style('font-size', '9px')
      .style('font-family', THEME.fontMono);
    yRightAxis.selectAll('.domain, .tick line').attr('stroke', `${THEME.success}44`);

    // Legend
    const legend = svg.append('g')
      .attr('transform', `translate(${pad.left + 8},${pad.top - 2})`);

    legend.append('rect').attr('width', 10).attr('height', 10).attr('fill', THEME.primary).attr('rx', 2);
    legend.append('text').attr('x', 14).attr('y', 9).text('Memories')
      .attr('fill', THEME.textMuted).style('font-size', '9px').style('font-family', THEME.fontMono);

    legend.append('line').attr('x1', 80).attr('y1', 5).attr('x2', 94).attr('y2', 5)
      .attr('stroke', THEME.success).attr('stroke-width', 2);
    legend.append('text').attr('x', 98).attr('y', 9).text('Trajectories')
      .attr('fill', THEME.textMuted).style('font-size', '9px').style('font-family', THEME.fontMono);
  }

  private renderPatternDrift(
    container: HTMLElement,
    drift: Array<{ state: string; before: number; after: number }>
  ): void {
    // Limit to top 20 by absolute change
    const sorted = [...drift]
      .sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before))
      .slice(0, 20);

    const width = 500;
    const height = Math.max(100, sorted.length * 24 + 40);
    const pad = { top: 10, right: 20, bottom: 10, left: 140 };
    const w = width - pad.left - pad.right;
    const h = height - pad.top - pad.bottom;

    const svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .style('display', 'block')
      .style('max-width', '100%');

    const g = svg.append('g')
      .attr('transform', `translate(${pad.left},${pad.top})`);

    const y = d3.scaleBand()
      .domain(sorted.map(d => d.state))
      .range([0, h])
      .padding(0.3);

    const allVals = sorted.flatMap(d => [d.before, d.after]);
    const x = d3.scaleLinear()
      .domain([Math.min(0, ...allVals), Math.max(1, ...allVals)])
      .range([0, w]);

    // Labels
    g.selectAll('text.label')
      .data(sorted)
      .join('text')
      .attr('class', 'label')
      .attr('x', -8)
      .attr('y', d => (y(d.state) ?? 0) + y.bandwidth() / 2)
      .attr('text-anchor', 'end')
      .attr('dominant-baseline', 'central')
      .text(d => truncate(d.state, 18))
      .attr('fill', THEME.textMuted)
      .style('font-size', '9px')
      .style('font-family', THEME.fontMono);

    // Before (gray dot)
    g.selectAll('circle.before')
      .data(sorted)
      .join('circle')
      .attr('class', 'before')
      .attr('cx', d => x(d.before))
      .attr('cy', d => (y(d.state) ?? 0) + y.bandwidth() / 2)
      .attr('r', 4)
      .attr('fill', THEME.textMuted);

    // After (colored dot)
    g.selectAll('circle.after')
      .data(sorted)
      .join('circle')
      .attr('class', 'after')
      .attr('cx', d => x(d.after))
      .attr('cy', d => (y(d.state) ?? 0) + y.bandwidth() / 2)
      .attr('r', 4)
      .attr('fill', d => d.after >= d.before ? THEME.success : THEME.error);

    // Connecting line
    g.selectAll('line.drift')
      .data(sorted)
      .join('line')
      .attr('class', 'drift')
      .attr('x1', d => x(d.before))
      .attr('x2', d => x(d.after))
      .attr('y1', d => (y(d.state) ?? 0) + y.bandwidth() / 2)
      .attr('y2', d => (y(d.state) ?? 0) + y.bandwidth() / 2)
      .attr('stroke', d => d.after >= d.before ? THEME.success : THEME.error)
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.6);
  }
}

// ============================================================================
// 4. SonaStatsPanel
// ============================================================================

/**
 * Gauge-style display of SONA metrics.
 *
 * Renders 4 circular SVG gauge indicators for core SONA metrics plus
 * additional metric rows for tick_count, warmup_replays, and force_learn_count.
 */
export class SonaStatsPanel {
  async render(container: HTMLElement): Promise<void> {
    container.innerHTML = '';
    container.style.cssText = `
      background:${THEME.bgBase};color:${THEME.textPrimary};
      font-family:${THEME.fontMono};overflow-y:auto;padding:16px;
    `;

    const raw = await fetchJson<SonaStatsResponse>('/api/sona-stats');
    if (!raw) {
      showNoData(container, 'SONA engine not available');
      return;
    }

    const sona = raw.sona;

    // Title
    const title = document.createElement('div');
    title.style.cssText = `
      color:${THEME.primaryActive};font-size:16px;font-weight:700;
      margin-bottom:6px;text-align:center;
    `;
    title.textContent = 'SONA Engine Metrics';
    container.appendChild(title);

    // Status badge
    const statusDiv = document.createElement('div');
    statusDiv.style.cssText = 'text-align:center;margin-bottom:16px;';
    statusDiv.innerHTML = statusBadge(raw.meta.hasData, raw.meta.hasData ? 'Data Available' : 'No SONA Data Yet');
    container.appendChild(statusDiv);

    // Gauge row
    const gaugeRow = document.createElement('div');
    gaugeRow.style.cssText = `
      display:flex;justify-content:center;gap:24px;flex-wrap:wrap;
      margin-bottom:20px;
    `;

    createGauge(gaugeRow, safeNum(sona.trajectories_buffered), 100, 'Traj Buffered', THEME.primaryActive);
    createGauge(gaugeRow, safeNum(sona.patterns_stored), 1000, 'Patterns Stored', THEME.success);
    createGauge(gaugeRow, safeNum(sona.ewc_tasks), 50, 'EWC Tasks', THEME.warning);
    createGauge(gaugeRow, safeNum(sona.buffer_success_rate), 1, 'Buffer Success', THEME.primary);

    container.appendChild(gaugeRow);

    // Additional metrics
    const metricsCard = createCard('Additional Metrics');
    metricsCard.appendChild(metricRow('Tick Count', formatNumber(safeNum(sona.tick_count))));
    metricsCard.appendChild(metricRow('Warmup Replays', formatNumber(safeNum(sona.warmup_replays))));
    metricsCard.appendChild(metricRow('Force Learn Count', formatNumber(safeNum(sona.force_learn_count))));
    if (sona.last_tick) {
      metricsCard.appendChild(metricRow('Last Tick', new Date(Number(sona.last_tick) * 1000).toLocaleString()));
    } else {
      metricsCard.appendChild(metricRow('Last Tick', 'Never'));
    }
    metricsCard.appendChild(metricRow('Source', safeDisplay(raw.meta.source, 'unknown')));
    container.appendChild(metricsCard);
  }
}

// ============================================================================
// 5. SystemHealthPanel
// ============================================================================

/**
 * Self-diagnostic display (visual validate-setup.sh).
 *
 * Renders:
 * - Embedding distribution donut chart
 * - Hook fire rate sparkline
 * - Q-Learning convergence line chart
 * - File sequence force-directed mini graph
 * - SONA lifecycle metric cards
 * - Patch status badges
 * - JSON vs DB parity comparison table
 * - Table row counts grid
 */
export class SystemHealthPanel {
  async render(container: HTMLElement): Promise<void> {
    container.innerHTML = '';
    container.style.cssText = `
      background:${THEME.bgBase};color:${THEME.textPrimary};
      font-family:${THEME.fontMono};overflow-y:auto;padding:12px;
    `;

    const data = await fetchJson<SystemHealthResponse>('/api/system-health');
    if (!data) {
      showNoData(container, 'System health data unavailable');
      return;
    }

    // ---- DB Info summary at top ----
    if (data.dbInfo) {
      const dbCard = createCard('');
      const dbRow = document.createElement('div');
      dbRow.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;';
      dbRow.appendChild(statCard(data.meta.dbSizeMB + ' MB', 'DB Size', THEME.primaryActive));
      dbRow.appendChild(statCard(String(data.meta.totalRows), 'Total Rows', THEME.success));
      dbRow.appendChild(statCard(`${data.meta.tablesPresent}/${data.meta.tablesTotal}`, 'Tables', THEME.warning));
      dbCard.appendChild(dbRow);
      container.appendChild(dbCard);
    }

    // ---- Embedding Distribution ----
    // Convert {dim384: 29, dim64: 0, ...} to [{label, count}]
    const embBuckets: EmbeddingBucket[] = Object.entries(data.embeddingDistribution)
      .filter(([, count]) => count > 0)
      .map(([label, count]) => ({ label, count }));

    this.renderSection(container, 'Embedding Distribution',
      embBuckets.length > 0,
      (section) => this.renderDonutChart(section, embBuckets)
    );

    // ---- Hook Fire Rates ----
    const hfr = data.hookFireRates;
    this.renderSection(container, 'Hook Fire Rates', true, (section) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px;';
      row.appendChild(statCard(safeNum(hfr.memoriesPerHour).toFixed(1), 'Memories/hr', THEME.primaryActive));
      row.appendChild(statCard(safeDisplay(hfr.totalMemories, '0'), 'Total', THEME.success));
      row.appendChild(statCard(safeDisplay(hfr.spanHours, '0'), 'Hours Span', THEME.warning));
      section.appendChild(row);
      if (hfr.firstTimestamp && hfr.lastTimestamp) {
        const timeRange = document.createElement('div');
        timeRange.style.cssText = `font-size:10px;color:${THEME.textMuted};`;
        const first = new Date(hfr.firstTimestamp < 1e12 ? hfr.firstTimestamp * 1000 : hfr.firstTimestamp);
        const last = new Date(hfr.lastTimestamp < 1e12 ? hfr.lastTimestamp * 1000 : hfr.lastTimestamp);
        timeRange.textContent = `${first.toLocaleString()} \u2192 ${last.toLocaleString()}`;
        section.appendChild(timeRange);
      }
    });

    // ---- Q-Learning Convergence ----
    const convergenceData = (data.convergence.runningAvg || [])
      .map(p => p.runningAvg)
      .filter((v): v is number => v !== null && v !== undefined);

    this.renderSection(container, 'Q-Learning Convergence',
      convergenceData.length > 1,
      (section) => {
        renderLineChart(section, convergenceData, THEME.success, 500, 130);
        const finalDiv = document.createElement('div');
        finalDiv.style.cssText = `font-size:10px;color:${THEME.textMuted};margin-top:4px;`;
        // FIX: Use meta.avgQValue from patterns if convergence.finalAvg is empty
        const avgQVal = safeNum((data as any).meta?.avgQValue, 0) || safeNum(data.convergence.finalAvg);
        finalDiv.textContent = `Final avg: ${avgQVal.toFixed(4)} (${safeNum(data.convergence.rewardPoints)} points)`;
        section.appendChild(finalDiv);
      }
    );

    // ---- File Sequence Graph ----
    const fileSeqs = data.fileSequences || [];
    const seqNodeSet = new Set<string>();
    fileSeqs.forEach(s => { seqNodeSet.add(s.source); seqNodeSet.add(s.target); });
    const seqGraph = {
      nodes: Array.from(seqNodeSet).map(id => ({ id })),
      edges: fileSeqs.map(s => ({ source: s.source, target: s.target, weight: s.count }))
    };

    this.renderSection(container, 'File Sequence Graph',
      seqGraph.nodes.length > 0,
      (section) => this.renderForceGraph(section, seqGraph)
    );

    // ---- SONA Lifecycle ----
    const sona = data.sonaLifecycle;
    this.renderSection(container, 'SONA Lifecycle', true, (section) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;';
      row.appendChild(statCard(formatNumber(safeNum(sona.warmup_replays)), 'Warmup Replays', THEME.warning));
      row.appendChild(statCard(formatNumber(safeNum(sona.tick_count)), 'Tick Count', THEME.primaryActive));
      row.appendChild(statCard(formatNumber(safeNum(sona.force_learn_count)), 'Force Learn', THEME.success));
      section.appendChild(row);
    });

    // ---- Patch Status ----
    this.renderSection(container, 'Patch Status', true, (section) => {
      const patchRow = document.createElement('div');
      patchRow.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;';
      for (const [patchName, ok] of Object.entries(data.patchStatus)) {
        patchRow.innerHTML += statusBadge(ok, patchName);
      }
      section.appendChild(patchRow);
    });

    // ---- JSON vs DB Parity ----
    const parity = data.jsonDbParity;
    const parityRows = parity ? [
      { table: 'memories', jsonCount: parity.memoriesJson, dbCount: parity.memoriesDb, match: parity.memoriesJson === parity.memoriesDb },
      { table: 'patterns', jsonCount: parity.patternsJson, dbCount: parity.patternsDb, match: parity.patternsJson === parity.patternsDb },
      { table: 'trajectories', jsonCount: parity.trajectoriesJson, dbCount: parity.trajectoriesDb, match: parity.trajectoriesJson === parity.trajectoriesDb },
    ] : [];

    this.renderSection(container, 'JSON vs DB Parity',
      parityRows.length > 0,
      (section) => {
        // Overall sync badge
        const syncDiv = document.createElement('div');
        syncDiv.style.cssText = 'margin-bottom:8px;';
        syncDiv.innerHTML = statusBadge(parity.inSync, parity.inSync ? 'In Sync' : 'Out of Sync')
          + (parity.jsonExists ? '' : ` ${statusBadge(false, 'JSON file missing')}`);
        section.appendChild(syncDiv);
        this.renderParityTable(section, parityRows);
      }
    );

    // ---- Table Counts ----
    this.renderSection(container, 'Table Counts',
      Object.keys(data.tableCounts).length > 0,
      (section) => this.renderTableCountsGrid(section, data.tableCounts)
    );
  }

  private renderSection(
    container: HTMLElement,
    title: string,
    hasData: boolean,
    renderContent: (section: HTMLElement) => void
  ): void {
    const card = createCard('');

    // Section header with status indicator
    const header = document.createElement('div');
    header.style.cssText = `
      display:flex;align-items:center;gap:8px;margin-bottom:10px;
    `;

    const indicator = document.createElement('span');
    if (hasData) {
      indicator.textContent = '\u2713';
      indicator.style.cssText = `
        color:${THEME.success};font-size:14px;font-weight:700;
        width:20px;height:20px;display:flex;align-items:center;justify-content:center;
        background:${THEME.success}22;border-radius:50%;
      `;
    } else {
      indicator.textContent = '\u26A0';
      indicator.style.cssText = `
        color:${THEME.warning};font-size:14px;font-weight:700;
        width:20px;height:20px;display:flex;align-items:center;justify-content:center;
        background:${THEME.warning}22;border-radius:50%;
      `;
    }

    const heading = document.createElement('span');
    heading.textContent = title;
    heading.style.cssText = `
      color:${THEME.primaryActive};font-weight:600;font-size:13px;
    `;

    header.appendChild(indicator);
    header.appendChild(heading);
    card.appendChild(header);

    if (hasData) {
      renderContent(card);
    } else {
      const empty = document.createElement('div');
      empty.textContent = 'No data available';
      empty.style.cssText = `color:${THEME.textMuted};font-size:11px;`;
      card.appendChild(empty);
    }

    container.appendChild(card);
  }

  private renderDonutChart(container: HTMLElement, buckets: EmbeddingBucket[]): void {
    const size = 180;
    const radius = size / 2;
    const innerRadius = radius * 0.55;

    const svg = d3.select(container)
      .append('svg')
      .attr('width', size)
      .attr('height', size)
      .attr('viewBox', `0 0 ${size} ${size}`)
      .style('display', 'block')
      .style('margin', '0 auto');

    const g = svg.append('g')
      .attr('transform', `translate(${radius},${radius})`);

    const colorScale = d3.scaleOrdinal<string>()
      .domain(buckets.map(b => b.label))
      .range([THEME.primaryActive, THEME.success, THEME.warning, THEME.error, THEME.primary]);

    const pie = d3.pie<EmbeddingBucket>()
      .value(d => d.count)
      .sort(null);

    const arc = d3.arc<d3.PieArcDatum<EmbeddingBucket>>()
      .innerRadius(innerRadius)
      .outerRadius(radius - 4);

    g.selectAll('path')
      .data(pie(buckets))
      .join('path')
      .attr('d', arc as any)
      .attr('fill', d => colorScale(d.data.label))
      .attr('stroke', THEME.bgBase)
      .attr('stroke-width', 2);

    // Center total
    const total = buckets.reduce((sum, b) => sum + b.count, 0);
    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', THEME.textPrimary)
      .attr('font-size', '18')
      .attr('font-family', THEME.fontMono)
      .text(formatNumber(total));

    // Legend
    const legend = document.createElement('div');
    legend.style.cssText = `
      display:flex;gap:12px;justify-content:center;flex-wrap:wrap;
      margin-top:10px;
    `;
    for (const b of buckets) {
      const item = document.createElement('span');
      item.style.cssText = `
        display:inline-flex;align-items:center;gap:4px;font-size:10px;color:${THEME.textMuted};
      `;
      item.innerHTML = `
        <span style="width:8px;height:8px;border-radius:50%;background:${colorScale(b.label)};display:inline-block;"></span>
        ${escapeHtml(b.label)} (${formatNumber(b.count)})
      `;
      legend.appendChild(item);
    }
    container.appendChild(legend);
  }

  private renderForceGraph(
    container: HTMLElement,
    graph: { nodes: Array<{ id: string }>; edges: Array<{ source: string; target: string; weight: number }> }
  ): void {
    const width = 400;
    const height = 250;

    const svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .style('display', 'block')
      .style('max-width', '100%');

    // Limit node count for performance
    const maxNodes = 60;
    const nodeSubset = graph.nodes.slice(0, maxNodes);
    const nodeIds = new Set(nodeSubset.map(n => n.id));
    const edgeSubset = graph.edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));

    interface SimNode extends d3.SimulationNodeDatum {
      id: string;
    }

    const simNodes: SimNode[] = nodeSubset.map(n => ({ ...n }));
    const simEdges = edgeSubset.map(e => ({ source: e.source, target: e.target, weight: e.weight }));

    const simulation = d3.forceSimulation<SimNode>(simNodes)
      .force('link', d3.forceLink<SimNode, any>(simEdges).id((d: SimNode) => d.id).distance(40).strength(0.5))
      .force('charge', d3.forceManyBody().strength(-30))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide(8));

    // Run simulation synchronously
    simulation.stop();
    for (let i = 0; i < 100; i++) simulation.tick();

    // Draw edges
    svg.selectAll('line')
      .data(simEdges)
      .join('line')
      .attr('x1', (d: any) => d.source.x)
      .attr('y1', (d: any) => d.source.y)
      .attr('x2', (d: any) => d.target.x)
      .attr('y2', (d: any) => d.target.y)
      .attr('stroke', `${THEME.primary}66`)
      .attr('stroke-width', (d: any) => Math.max(0.5, Math.min(3, d.weight || 1)));

    // Draw nodes
    svg.selectAll('circle')
      .data(simNodes)
      .join('circle')
      .attr('cx', (d: SimNode) => d.x!)
      .attr('cy', (d: SimNode) => d.y!)
      .attr('r', 4)
      .attr('fill', THEME.primaryActive);

    // Labels for small graphs
    if (simNodes.length <= 20) {
      svg.selectAll('text')
        .data(simNodes)
        .join('text')
        .attr('x', (d: SimNode) => d.x! + 6)
        .attr('y', (d: SimNode) => d.y! + 3)
        .text((d: SimNode) => truncate(d.id, 12))
        .attr('fill', THEME.textMuted)
        .style('font-size', '8px')
        .style('font-family', THEME.fontMono);
    }
  }

  private renderParityTable(
    container: HTMLElement,
    rows: Array<{ table: string; jsonCount: number; dbCount: number; match: boolean }>
  ): void {
    const table = document.createElement('div');
    table.style.cssText = `
      display:grid;grid-template-columns:1fr 80px 80px 80px;
      gap:1px;font-size:11px;
    `;

    // Header
    const headers = ['Table', 'JSON', 'DB', 'Status'];
    for (const h of headers) {
      const cell = document.createElement('div');
      cell.textContent = h;
      cell.style.cssText = `
        background:${THEME.bgElevated};padding:6px 8px;
        color:${THEME.textMuted};font-weight:600;
      `;
      table.appendChild(cell);
    }

    for (const row of rows) {
      const nameCell = document.createElement('div');
      nameCell.textContent = row.table;
      nameCell.style.cssText = `background:${THEME.bgSurface};padding:4px 8px;color:${THEME.textPrimary};`;
      table.appendChild(nameCell);

      const jsonCell = document.createElement('div');
      jsonCell.textContent = String(row.jsonCount);
      jsonCell.style.cssText = `background:${THEME.bgSurface};padding:4px 8px;color:${THEME.textSecondary};text-align:right;font-family:${THEME.fontMono};`;
      table.appendChild(jsonCell);

      const dbCell = document.createElement('div');
      dbCell.textContent = String(row.dbCount);
      dbCell.style.cssText = `background:${THEME.bgSurface};padding:4px 8px;color:${THEME.textSecondary};text-align:right;font-family:${THEME.fontMono};`;
      table.appendChild(dbCell);

      const statusCell = document.createElement('div');
      statusCell.innerHTML = statusBadge(row.match, row.match ? 'Match' : 'Mismatch');
      statusCell.style.cssText = `background:${THEME.bgSurface};padding:4px 8px;text-align:center;`;
      table.appendChild(statusCell);
    }

    container.appendChild(table);
  }

  private renderTableCountsGrid(container: HTMLElement, counts: Record<string, number>): void {
    const grid = document.createElement('div');
    grid.style.cssText = `
      display:grid;grid-template-columns:repeat(auto-fill, minmax(150px, 1fr));
      gap:8px;
    `;

    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    for (const [tableName, count] of entries) {
      const cell = document.createElement('div');
      cell.style.cssText = `
        background:${THEME.bgElevated};border-radius:8px;padding:10px;
        display:flex;justify-content:space-between;align-items:center;
      `;
      cell.innerHTML = `
        <span style="color:${THEME.textMuted};font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
              title="${escapeHtml(tableName)}">
          ${escapeHtml(truncate(tableName, 16))}
        </span>
        <span style="color:${THEME.primaryActive};font-size:14px;font-weight:600;font-family:${THEME.fontMono};">
          ${formatNumber(count)}
        </span>
      `;
      grid.appendChild(cell);
    }

    container.appendChild(grid);
  }
}

// ============================================================================
// 6. RewardFieldConnector
// ============================================================================

/**
 * Provides API data for the existing Spacetime geodesic mode.
 *
 * Fetches reward history and trajectory positions and returns them in the
 * format expected by the existing RewardPotentialField class:
 * `{ points: Array<{x, y, reward}> }`
 */
export class RewardFieldConnector {
  async getRewardData(): Promise<{ points: RewardPoint[] }> {
    const [learningRaw, trajRaw] = await Promise.all([
      fetchJson<{ rewardHistory: number[] }>('/api/learning-data'),
      fetchJson<{
        trajectories: Array<{
          id: string;
          x?: number;
          y?: number;
          quality: number;
          success: boolean;
          steps: Array<{ reward: number }>;
        }>;
      }>('/api/trajectories'),
    ]);

    const points: RewardPoint[] = [];

    // Map trajectories to spatial reward points
    if (trajRaw?.trajectories) {
      for (const traj of trajRaw.trajectories) {
        // Use provided positions or generate deterministic positions from ID hash
        const x = traj.x ?? hashToCoord(traj.id, 0);
        const y = traj.y ?? hashToCoord(traj.id, 1);
        const reward = traj.quality ?? 0;

        if (Math.abs(reward) > 0.001) {
          points.push({ x, y, reward });
        }

        // Add individual step rewards as nearby sub-points
        if (traj.steps) {
          for (let i = 0; i < traj.steps.length; i++) {
            const step = traj.steps[i];
            if (Math.abs(step.reward) > 0.001) {
              const angle = (2 * Math.PI * i) / Math.max(traj.steps.length, 1);
              const dist = 30 + i * 5;
              points.push({
                x: x + Math.cos(angle) * dist,
                y: y + Math.sin(angle) * dist,
                reward: step.reward,
              });
            }
          }
        }
      }
    }

    // If we also have a reward history but no trajectory positions, create
    // a spiral layout so the potential field has spatial coverage.
    if (points.length === 0 && learningRaw?.rewardHistory) {
      const history = learningRaw.rewardHistory;
      for (let i = 0; i < history.length; i++) {
        if (Math.abs(history[i]) < 0.001) continue;
        const angle = (i / Math.max(history.length, 1)) * Math.PI * 8;
        const dist = 50 + (i / Math.max(history.length, 1)) * 400;
        points.push({
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist,
          reward: history[i],
        });
      }
    }

    return { points };
  }
}

// ============================================================================
// Utility: Downsample & Hash Helpers
// ============================================================================

/** Downsample a numeric array to a target length using averaging. */
function downsample(data: number[], targetLen: number): number[] {
  if (data.length <= targetLen) return data;
  const result: number[] = [];
  const binSize = data.length / targetLen;
  for (let i = 0; i < targetLen; i++) {
    const start = Math.floor(i * binSize);
    const end = Math.floor((i + 1) * binSize);
    let sum = 0;
    for (let j = start; j < end; j++) sum += data[j];
    result.push(sum / (end - start));
  }
  return result;
}

/** Hash a string to a coordinate in [-500, 500] range. */
function hashToCoord(str: string, axis: number): number {
  let hash = axis * 7919;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash; // Convert to 32-bit integer
  }
  return ((hash % 1000) / 1000) * 1000 - 500;
}

// ============================================================================
// 7. SystemValidationPanel
// ============================================================================

/** Response shape from /api/system-validation. */
interface SystemValidationResponse {
  tableCoverage: Array<{
    name: string;
    rowCount: number;
    hasContent: boolean;
    hasEmbeddings: boolean;
    embeddingDim: number | null;
    status: 'green' | 'amber' | 'red';
  }>;
  hookStatus: {
    settingsFound: boolean;
    hooks: Array<{
      event: string;
      command: string;
      hasFired: boolean;
      evidenceCount: number;
    }>;
  };
  qLearningCoverage: Array<{
    algorithm: string;
    hasEntries: boolean;
    updateCount: number;
    avgReward: number;
    convergenceScore: number;
  }>;
  sonaLifecycle: {
    trajectories_buffered: number;
    patterns_stored: number;
    ewc_tasks: number;
    buffer_success_rate: number;
    instant_enabled: boolean;
    background_enabled: boolean;
    blindSpots: string[];
  };
  embeddingHealth: {
    total: number;
    nullCount: number;
    dim384: number;
    dim64: number;
    otherDims: Record<string, number>;
    neuralTotal: number;
    neuralNull: number;
    neuralDim384: number;
  };
  memoryQuality: {
    samples: Array<{
      id: string;
      type: string;
      contentLength: number;
      hasMeaningfulText: boolean;
      hasRcA: boolean;
      hasRcB: boolean;
      preview: string;
    }>;
    avgContentLength: number;
    rcACount: number;
    rcBCount: number;
  };
  bridgePatchStatus: {
    hookBridgeExists: boolean;
    hookBridgeExecutable: boolean;
    patchCliV094: boolean;
    patchEngineV092: boolean;
    noToolInputRefs: boolean;
    storageLoadable: boolean;
  };
}

/**
 * Comprehensive system validation panel.
 *
 * Fetches /api/system-validation and renders 7 sub-sections:
 *  a) Table Coverage Matrix
 *  b) Hook Fire Tracker
 *  c) Q-Learning Coverage
 *  d) SONA Lifecycle
 *  e) Embedding Health
 *  f) Memory Content Quality
 *  g) Bridge & Patch Status
 */
export class SystemValidationPanel {
  async render(container: HTMLElement): Promise<void> {
    container.innerHTML = '';
    container.style.cssText = `
      background:${THEME.bgBase};color:${THEME.textPrimary};
      font-family:${THEME.fontMono};overflow-y:auto;padding:16px;
    `;

    const data = await fetchJson<SystemValidationResponse>('/api/system-validation');
    if (!data) {
      showNoData(container, 'System validation data not available');
      return;
    }

    // Panel title
    const title = document.createElement('div');
    title.style.cssText = `
      color:${THEME.primaryActive};font-size:18px;font-weight:700;
      margin-bottom:16px;text-align:center;letter-spacing:0.5px;
    `;
    title.textContent = 'System Validation Report';
    container.appendChild(title);

    this.renderTableCoverage(container, data.tableCoverage);
    this.renderHookFireTracker(container, data.hookStatus);
    this.renderQLearningCoverage(container, data.qLearningCoverage);
    this.renderSonaLifecycle(container, data.sonaLifecycle);
    this.renderEmbeddingHealth(container, data.embeddingHealth);
    this.renderMemoryQuality(container, data.memoryQuality);
    this.renderBridgePatchStatus(container, data.bridgePatchStatus);
  }

  // --------------------------------------------------------------------------
  // a) Table Coverage Matrix
  // --------------------------------------------------------------------------
  private renderTableCoverage(
    container: HTMLElement,
    tables: SystemValidationResponse['tableCoverage']
  ): void {
    const card = createCard('Table Coverage Matrix');

    const grid = document.createElement('div');
    grid.style.cssText = `
      display:grid;
      grid-template-columns:minmax(120px, 1.5fr) 80px 90px 90px 50px;
      gap:1px;font-size:12px;
    `;

    // Header
    const headers = ['Table', 'Rows', 'Content', 'Embedding', ''];
    headers.forEach((h) => {
      const cell = document.createElement('div');
      cell.textContent = h;
      cell.style.cssText = `
        color:${THEME.textMuted};font-size:10px;text-transform:uppercase;
        padding:6px 8px;background:${THEME.bgElevated};font-weight:600;
        letter-spacing:0.5px;
      `;
      grid.appendChild(cell);
    });

    // Rows
    tables.forEach((t) => {
      // Table name
      const nameCell = document.createElement('div');
      nameCell.textContent = t.name;
      nameCell.style.cssText = `
        color:${THEME.textPrimary};padding:8px;
        background:${THEME.bgBase};border-bottom:1px solid ${THEME.bgElevated};
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
      `;
      grid.appendChild(nameCell);

      // Row count
      const countCell = document.createElement('div');
      countCell.textContent = formatNumber(t.rowCount);
      countCell.style.cssText = `
        color:${THEME.primaryActive};padding:8px;text-align:right;
        background:${THEME.bgBase};border-bottom:1px solid ${THEME.bgElevated};
        font-weight:700;font-size:14px;
      `;
      grid.appendChild(countCell);

      // Content status badge
      const contentCell = document.createElement('div');
      contentCell.style.cssText = `
        padding:8px;background:${THEME.bgBase};
        border-bottom:1px solid ${THEME.bgElevated};
        display:flex;align-items:center;justify-content:center;
      `;
      const contentColor = t.rowCount === 0
        ? THEME.error
        : t.hasContent ? THEME.success : THEME.warning;
      const contentLabel = t.rowCount === 0
        ? 'EMPTY'
        : t.hasContent ? 'OK' : 'STUBS';
      contentCell.innerHTML = `<span style="
        background:${contentColor}22;color:${contentColor};
        padding:2px 8px;border-radius:4px;font-size:10px;
        border:1px solid ${contentColor}44;font-weight:600;
      ">${contentLabel}</span>`;
      grid.appendChild(contentCell);

      // Embedding status
      const embedCell = document.createElement('div');
      embedCell.style.cssText = `
        padding:8px;background:${THEME.bgBase};
        border-bottom:1px solid ${THEME.bgElevated};
        display:flex;align-items:center;justify-content:center;
      `;
      if (t.embeddingDim === null) {
        embedCell.innerHTML = `<span style="color:${THEME.textMuted};font-size:14px;">\u2014</span>`;
      } else if (t.embeddingDim === 384) {
        embedCell.innerHTML = `<span style="color:${THEME.success};font-size:14px;">\u2713 384d</span>`;
      } else {
        embedCell.innerHTML = `<span style="color:${THEME.warning};font-size:11px;">${t.embeddingDim}d</span>`;
      }
      grid.appendChild(embedCell);

      // Overall status dot
      const dotCell = document.createElement('div');
      dotCell.style.cssText = `
        padding:8px;background:${THEME.bgBase};
        border-bottom:1px solid ${THEME.bgElevated};
        display:flex;align-items:center;justify-content:center;
      `;
      const dotColor = t.status === 'green'
        ? THEME.success
        : t.status === 'amber' ? THEME.warning : THEME.error;
      dotCell.innerHTML = `<span style="
        background:${dotColor};width:8px;height:8px;
        border-radius:50%;display:inline-block;
      "></span>`;
      grid.appendChild(dotCell);
    });

    card.appendChild(grid);
    container.appendChild(card);
  }

  // --------------------------------------------------------------------------
  // b) Hook Fire Tracker
  // --------------------------------------------------------------------------
  private renderHookFireTracker(
    container: HTMLElement,
    hookStatus: SystemValidationResponse['hookStatus']
  ): void {
    const card = createCard('Hook Fire Tracker');

    // Settings status
    const settingsDiv = document.createElement('div');
    settingsDiv.style.cssText = 'margin-bottom:12px;';
    settingsDiv.innerHTML = statusBadge(
      hookStatus.settingsFound,
      hookStatus.settingsFound ? 'Hook settings found' : 'No hook settings'
    );
    card.appendChild(settingsDiv);

    if (hookStatus.hooks.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = `
        padding:12px;border-radius:6px;background:${THEME.bgElevated};
        border-left:3px solid ${THEME.warning};
      `;
      empty.innerHTML = `
        <div style="color:${THEME.warning};font-size:12px;font-weight:600;margin-bottom:4px;">
          No hooks configured
        </div>
        <div style="color:${THEME.textMuted};font-size:11px;">
          Hooks auto-capture file edits, bash commands, and tool usage into the memory system.
          Configure hooks in <code style="color:${THEME.primaryActive};">.claude/settings.json</code>
          to enable automatic learning.
        </div>
      `;
      card.appendChild(empty);
      container.appendChild(card);
      return;
    }

    const grid = document.createElement('div');
    grid.style.cssText = `
      display:grid;
      grid-template-columns:repeat(auto-fill, minmax(220px, 1fr));
      gap:8px;
    `;

    hookStatus.hooks.forEach((hook) => {
      const hookCard = document.createElement('div');
      hookCard.style.cssText = `
        background:${THEME.bgElevated};border-radius:8px;padding:12px;
        border-left:3px solid ${hook.hasFired ? THEME.success : THEME.error};
      `;

      const cmdExcerpt = hook.command.length > 40
        ? hook.command.slice(0, 37) + '...'
        : hook.command;

      hookCard.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
          <span style="
            background:${hook.hasFired ? THEME.success : THEME.error};
            width:8px;height:8px;border-radius:50%;display:inline-block;
          "></span>
          <span style="color:${THEME.textPrimary};font-size:12px;font-weight:600;">
            ${escapeHtml(hook.event)}
          </span>
        </div>
        <div style="color:${THEME.textMuted};font-size:10px;margin-bottom:4px;
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"
          title="${escapeHtml(hook.command)}">
          ${escapeHtml(cmdExcerpt)}
        </div>
        <div style="color:${THEME.textSecondary};font-size:10px;">
          Evidence: <span style="color:${THEME.primaryActive};font-weight:600;">
            ${hook.evidenceCount}
          </span>
        </div>
      `;

      grid.appendChild(hookCard);
    });

    card.appendChild(grid);
    container.appendChild(card);
  }

  // --------------------------------------------------------------------------
  // c) Q-Learning Coverage
  // --------------------------------------------------------------------------
  private renderQLearningCoverage(
    container: HTMLElement,
    algorithms: SystemValidationResponse['qLearningCoverage']
  ): void {
    const card = createCard('Q-Learning Coverage');

    const grid = document.createElement('div');
    grid.style.cssText = `
      display:grid;
      grid-template-columns:repeat(auto-fill, minmax(180px, 1fr));
      gap:8px;
    `;

    algorithms.forEach((algo) => {
      const algoCard = document.createElement('div');
      algoCard.style.cssText = `
        background:${THEME.bgElevated};border-radius:8px;padding:12px;
        position:relative;overflow:hidden;
      `;

      // Convergence bar background
      const barWidth = Math.max(0, Math.min(100, algo.convergenceScore * 100));
      const barColor = algo.updateCount === 0 ? THEME.error
        : algo.convergenceScore > 0.7 ? THEME.success
        : algo.convergenceScore > 0.3 ? THEME.warning : THEME.primaryActive;

      algoCard.innerHTML = `
        <div style="
          position:absolute;bottom:0;left:0;height:3px;
          width:${barWidth}%;background:${barColor};
          border-radius:0 0 8px 8px;transition:width 0.5s ease;
        "></div>
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
          <span style="color:${THEME.textPrimary};font-size:12px;font-weight:600;">
            ${escapeHtml(algo.algorithm)}
          </span>
          ${algo.updateCount === 0 ? `<span style="
            background:${THEME.error}22;color:${THEME.error};
            padding:1px 6px;border-radius:3px;font-size:9px;
            border:1px solid ${THEME.error}44;font-weight:700;
          ">UNTESTED</span>` : ''}
        </div>
        <div style="display:flex;gap:12px;margin-bottom:6px;">
          <div>
            <div style="color:${THEME.primaryActive};font-size:18px;font-weight:700;">
              ${formatNumber(algo.updateCount)}
            </div>
            <div style="color:${THEME.textMuted};font-size:9px;">updates</div>
          </div>
          <div>
            <div style="color:${THEME.textSecondary};font-size:18px;font-weight:700;">
              ${safeNum(algo.avgReward).toFixed(2)}
            </div>
            <div style="color:${THEME.textMuted};font-size:9px;">avg reward</div>
          </div>
        </div>
        <div style="color:${THEME.textMuted};font-size:10px;">
          Convergence: <span style="color:${barColor};font-weight:600;">
            ${(safeNum(algo.convergenceScore) * 100).toFixed(0)}%
          </span>
        </div>
      `;

      grid.appendChild(algoCard);
    });

    card.appendChild(grid);

    // Footer note for untested algorithms
    const untestedCount = algorithms.filter(a => a.updateCount === 0).length;
    if (untestedCount > 0) {
      const note = document.createElement('div');
      note.style.cssText = `
        margin-top:8px;padding:8px;border-radius:4px;
        background:${THEME.bgElevated};color:${THEME.textMuted};font-size:10px;
      `;
      note.textContent = `${untestedCount} algorithm${untestedCount > 1 ? 's' : ''} untested \u2014 these activate when matching trajectory patterns are recorded.`;
      card.appendChild(note);
    }

    container.appendChild(card);
  }

  // --------------------------------------------------------------------------
  // d) SONA Lifecycle
  // --------------------------------------------------------------------------
  private renderSonaLifecycle(
    container: HTMLElement,
    sona: SystemValidationResponse['sonaLifecycle']
  ): void {
    const card = createCard('SONA Lifecycle');

    const gaugeRow = document.createElement('div');
    gaugeRow.style.cssText = `
      display:flex;justify-content:center;gap:20px;flex-wrap:wrap;
      margin-bottom:16px;
    `;

    const metrics: Array<{ value: number; max: number; label: string; color: string }> = [
      {
        value: sona.trajectories_buffered,
        max: 100,
        label: 'Traj Buffered',
        color: sona.trajectories_buffered === 0 ? THEME.error : THEME.primaryActive,
      },
      {
        value: sona.patterns_stored,
        max: 1000,
        label: 'Patterns Stored',
        color: sona.patterns_stored === 0 ? THEME.error : THEME.success,
      },
      {
        value: sona.ewc_tasks,
        max: 50,
        label: 'EWC Tasks',
        color: sona.ewc_tasks === 0 ? THEME.error : THEME.warning,
      },
      {
        value: sona.buffer_success_rate,
        max: 1,
        label: 'Buffer Success',
        color: sona.buffer_success_rate === 0 ? THEME.error : THEME.primary,
      },
    ];

    metrics.forEach((m) => {
      createGauge(gaugeRow, m.value, m.max, m.label, m.color);
    });

    card.appendChild(gaugeRow);

    // Feature toggles
    const toggleRow = document.createElement('div');
    toggleRow.style.cssText = `
      display:flex;gap:10px;justify-content:center;margin-bottom:12px;
    `;
    toggleRow.innerHTML = `
      ${statusBadge(sona.instant_enabled, 'Instant')}
      ${statusBadge(sona.background_enabled, 'Background')}
    `;
    card.appendChild(toggleRow);

    // Blind spots
    if (sona.blindSpots.length > 0) {
      const blindDiv = document.createElement('div');
      blindDiv.style.cssText = `
        background:${THEME.error}11;border:1px solid ${THEME.error}33;
        border-radius:8px;padding:10px;margin-top:8px;
      `;
      blindDiv.innerHTML = `
        <div style="color:${THEME.error};font-size:11px;font-weight:600;margin-bottom:6px;">
          Blind Spots Detected
        </div>
        ${sona.blindSpots.map((s) => `
          <div style="color:${THEME.textSecondary};font-size:11px;padding:2px 0;">
            <span style="
              background:${THEME.error};width:6px;height:6px;
              border-radius:50%;display:inline-block;margin-right:6px;
            "></span>
            ${escapeHtml(s)}
          </div>
        `).join('')}
      `;
      card.appendChild(blindDiv);
    }

    container.appendChild(card);
  }

  // --------------------------------------------------------------------------
  // e) Embedding Health
  // --------------------------------------------------------------------------
  private renderEmbeddingHealth(
    container: HTMLElement,
    health: SystemValidationResponse['embeddingHealth']
  ): void {
    const card = createCard('Embedding Health');

    // Summary stat cards
    const statsRow = document.createElement('div');
    statsRow.style.cssText = `
      display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;
    `;
    statsRow.appendChild(statCard(formatNumber(health.total), 'Total Embeddings', THEME.primaryActive));
    statsRow.appendChild(statCard(
      formatNumber(health.dim384),
      '384d (correct)',
      THEME.success
    ));
    statsRow.appendChild(statCard(
      formatNumber(health.dim64),
      '64d (legacy)',
      health.dim64 > 0 ? THEME.warning : THEME.textMuted
    ));
    statsRow.appendChild(statCard(
      formatNumber(health.nullCount),
      'NULL',
      health.nullCount > 0 ? THEME.error : THEME.textMuted
    ));
    card.appendChild(statsRow);

    // Bar chart of dimension distribution
    const chartContainer = document.createElement('div');
    chartContainer.style.cssText = `margin-bottom:12px;`;

    const allBuckets: Array<{ label: string; count: number; color: string }> = [];

    if (health.dim384 > 0) {
      allBuckets.push({ label: '384d', count: health.dim384, color: THEME.success });
    }
    if (health.dim64 > 0) {
      allBuckets.push({ label: '64d', count: health.dim64, color: THEME.warning });
    }
    if (health.nullCount > 0) {
      allBuckets.push({ label: 'NULL', count: health.nullCount, color: THEME.error });
    }
    Object.entries(health.otherDims).forEach(([dim, count]) => {
      allBuckets.push({ label: `${dim}d`, count, color: THEME.textMuted });
    });

    if (allBuckets.length > 0) {
      const maxCount = Math.max(...allBuckets.map((b) => b.count));

      allBuckets.forEach((bucket) => {
        const row = document.createElement('div');
        row.style.cssText = `
          display:flex;align-items:center;gap:8px;margin-bottom:4px;
        `;

        const labelEl = document.createElement('span');
        labelEl.textContent = bucket.label;
        labelEl.style.cssText = `
          color:${THEME.textMuted};font-size:11px;min-width:50px;text-align:right;
        `;
        row.appendChild(labelEl);

        const barBg = document.createElement('div');
        barBg.style.cssText = `
          flex:1;height:16px;background:${THEME.bgElevated};border-radius:4px;
          overflow:hidden;position:relative;
        `;
        const barFill = document.createElement('div');
        const pct = maxCount > 0 ? (bucket.count / maxCount) * 100 : 0;
        barFill.style.cssText = `
          height:100%;width:${pct}%;background:${bucket.color};
          border-radius:4px;transition:width 0.5s ease;
        `;
        barBg.appendChild(barFill);
        row.appendChild(barBg);

        const countEl = document.createElement('span');
        countEl.textContent = formatNumber(bucket.count);
        countEl.style.cssText = `
          color:${bucket.color};font-size:11px;min-width:40px;font-weight:600;
        `;
        row.appendChild(countEl);

        chartContainer.appendChild(row);
      });
    }

    card.appendChild(chartContainer);

    // Neural embedding summary
    const neuralCard = document.createElement('div');
    neuralCard.style.cssText = `
      background:${THEME.bgElevated};border-radius:8px;padding:10px;
      margin-top:4px;
    `;
    neuralCard.innerHTML = `
      <div style="color:${THEME.textMuted};font-size:10px;text-transform:uppercase;
        letter-spacing:0.5px;margin-bottom:6px;">Neural Embeddings</div>
      <div style="display:flex;gap:16px;">
        <div>
          <span style="color:${THEME.textSecondary};font-size:11px;">Total: </span>
          <span style="color:${THEME.primaryActive};font-weight:600;font-size:12px;">
            ${formatNumber(health.neuralTotal)}
          </span>
        </div>
        <div>
          <span style="color:${THEME.textSecondary};font-size:11px;">384d: </span>
          <span style="color:${THEME.success};font-weight:600;font-size:12px;">
            ${formatNumber(health.neuralDim384)}
          </span>
        </div>
        <div>
          <span style="color:${THEME.textSecondary};font-size:11px;">NULL: </span>
          <span style="color:${health.neuralNull > 0 ? THEME.error : THEME.textMuted};font-weight:600;font-size:12px;">
            ${formatNumber(health.neuralNull)}
          </span>
        </div>
      </div>
    `;
    card.appendChild(neuralCard);

    container.appendChild(card);
  }

  // --------------------------------------------------------------------------
  // f) Memory Content Quality
  // --------------------------------------------------------------------------
  private renderMemoryQuality(
    container: HTMLElement,
    quality: SystemValidationResponse['memoryQuality']
  ): void {
    const card = createCard('Memory Content Quality');

    // Summary row
    const summaryRow = document.createElement('div');
    summaryRow.style.cssText = `
      display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;
    `;
    summaryRow.appendChild(statCard(
      Math.round(quality.avgContentLength).toString(),
      'Avg Length',
      THEME.primaryActive
    ));
    summaryRow.appendChild(statCard(
      quality.rcACount.toString(),
      'RC-A Enriched',
      quality.rcACount > 0 ? THEME.success : THEME.textMuted
    ));
    summaryRow.appendChild(statCard(
      quality.rcBCount.toString(),
      'RC-B Enriched',
      quality.rcBCount > 0 ? THEME.success : THEME.textMuted
    ));
    card.appendChild(summaryRow);

    if (quality.samples.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No memory samples available';
      empty.style.cssText = `color:${THEME.textMuted};font-size:12px;padding:8px 0;`;
      card.appendChild(empty);
      container.appendChild(card);
      return;
    }

    // Table
    const tableWrap = document.createElement('div');
    tableWrap.style.cssText = `overflow-x:auto;`;

    const table = document.createElement('table');
    table.style.cssText = `
      width:100%;border-collapse:collapse;font-size:11px;
    `;

    // Header
    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th style="color:${THEME.textMuted};text-align:left;padding:6px 8px;
          border-bottom:1px solid ${THEME.bgElevated};font-size:10px;
          text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Type</th>
        <th style="color:${THEME.textMuted};text-align:right;padding:6px 8px;
          border-bottom:1px solid ${THEME.bgElevated};font-size:10px;
          text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Length</th>
        <th style="color:${THEME.textMuted};text-align:center;padding:6px 8px;
          border-bottom:1px solid ${THEME.bgElevated};font-size:10px;
          text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">RC-A</th>
        <th style="color:${THEME.textMuted};text-align:center;padding:6px 8px;
          border-bottom:1px solid ${THEME.bgElevated};font-size:10px;
          text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">RC-B</th>
        <th style="color:${THEME.textMuted};text-align:left;padding:6px 8px;
          border-bottom:1px solid ${THEME.bgElevated};font-size:10px;
          text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Preview</th>
      </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    quality.samples.forEach((s) => {
      const tr = document.createElement('tr');
      const previewText = s.preview.length > 60
        ? s.preview.slice(0, 57) + '...'
        : s.preview;

      const textColor = s.hasMeaningfulText ? THEME.textSecondary : THEME.textMuted;

      tr.innerHTML = `
        <td style="color:${THEME.primaryActive};padding:6px 8px;
          border-bottom:1px solid ${THEME.bgElevated};white-space:nowrap;">
          ${escapeHtml(s.type)}
        </td>
        <td style="color:${THEME.textPrimary};padding:6px 8px;text-align:right;
          border-bottom:1px solid ${THEME.bgElevated};font-weight:600;">
          ${formatNumber(s.contentLength)}
        </td>
        <td style="padding:6px 8px;text-align:center;
          border-bottom:1px solid ${THEME.bgElevated};">
          <span style="color:${s.hasRcA ? THEME.success : THEME.textMuted};font-size:13px;">
            ${s.hasRcA ? '\u2713' : '\u2014'}
          </span>
        </td>
        <td style="padding:6px 8px;text-align:center;
          border-bottom:1px solid ${THEME.bgElevated};">
          <span style="color:${s.hasRcB ? THEME.success : THEME.textMuted};font-size:13px;">
            ${s.hasRcB ? '\u2713' : '\u2014'}
          </span>
        </td>
        <td style="color:${textColor};padding:6px 8px;
          border-bottom:1px solid ${THEME.bgElevated};
          max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
          title="${escapeHtml(s.preview)}">
          ${escapeHtml(previewText)}
        </td>
      `;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    card.appendChild(tableWrap);
    container.appendChild(card);
  }

  // --------------------------------------------------------------------------
  // g) Bridge & Patch Status
  // --------------------------------------------------------------------------
  private renderBridgePatchStatus(
    container: HTMLElement,
    status: SystemValidationResponse['bridgePatchStatus']
  ): void {
    const card = createCard('Bridge & Patch Status');

    const items: Array<{ label: string; ok: boolean }> = [
      { label: 'Hook bridge script exists', ok: status.hookBridgeExists },
      { label: 'Hook bridge is executable', ok: status.hookBridgeExecutable },
      { label: 'CLI patch v0.9.4 applied', ok: status.patchCliV094 },
      { label: 'Engine patch v0.9.2 applied', ok: status.patchEngineV092 },
      { label: 'No tool_input references remain', ok: status.noToolInputRefs },
      { label: 'Storage module loadable', ok: status.storageLoadable },
    ];

    const list = document.createElement('div');
    list.style.cssText = `display:flex;flex-direction:column;gap:6px;`;

    items.forEach((item) => {
      const row = document.createElement('div');
      row.style.cssText = `
        display:flex;align-items:center;gap:10px;
        padding:8px 12px;border-radius:6px;
        background:${THEME.bgElevated};
      `;

      const icon = item.ok ? '\u2713' : '\u2717';
      const iconColor = item.ok ? THEME.success : THEME.error;

      row.innerHTML = `
        <span style="
          color:${iconColor};font-size:16px;font-weight:700;
          min-width:20px;text-align:center;
        ">${icon}</span>
        <span style="color:${item.ok ? THEME.textSecondary : THEME.error};font-size:12px;">
          ${escapeHtml(item.label)}
        </span>
      `;

      list.appendChild(row);
    });

    card.appendChild(list);

    // Summary
    const passing = items.filter((i) => i.ok).length;
    const total = items.length;
    const allGood = passing === total;
    const summaryDiv = document.createElement('div');
    summaryDiv.style.cssText = `
      margin-top:12px;text-align:center;
    `;
    summaryDiv.innerHTML = `<span style="
      background:${allGood ? THEME.success : THEME.warning}22;
      color:${allGood ? THEME.success : THEME.warning};
      padding:4px 14px;border-radius:6px;font-size:12px;
      border:1px solid ${allGood ? THEME.success : THEME.warning}44;
      font-weight:600;
    ">${passing}/${total} checks passing</span>`;
    card.appendChild(summaryDiv);

    container.appendChild(card);
  }
}
