/**
 * SonaAttentionPanel - SONA Attention Mechanism Visualization
 *
 * Renders:
 *  1. Attention Heatmap - 10 mechanisms x time columns showing activation levels
 *  2. LoRA Weight Delta Sparklines - Historical weight changes per layer
 *  3. Latency Gauge - Adaptation latency vs 0.05ms target
 *
 * Data source: GET /api/sona-attention
 */

// ============================================================================
// Theme Constants (matching DashboardPanels.ts)
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

// Heatmap color scale (0.0 to 1.0)
const HEATMAP_COLORS = [
  '#1a1a2e', // 0.0 - No activation
  '#4a1d8f', // 0.25 - Low activation
  '#8b4fd9', // 0.5 - Medium activation
  '#c084fc', // 0.75 - High activation
  '#e879f9', // 1.0 - Peak activation
] as const;

// ============================================================================
// Types
// ============================================================================

/** Attention mechanism data */
interface AttentionMechanism {
  id: number;
  name: string;
  activations: number[]; // Last N activations (windowed)
  currentWeight: number;
  avgWeight: number;
}

/** LoRA weight delta history */
interface LoRADelta {
  layerId: number;
  deltas: number[];
  maxDelta: number;
  timestamp: number;
}

/** Timing metrics for adaptation latency */
interface TimingMetrics {
  current: number;
  target: number;
  average: number;
  percentile95: number;
}

/** Full SONA attention data response */
interface SonaAttentionData {
  mechanisms: AttentionMechanism[];
  loraDeltas: LoRADelta[];
  timing: TimingMetrics;
  meta: {
    lastUpdate: number | null;
    tickCount: number;
    hasData: boolean;
  };
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

/** Truncate string with ellipsis */
function truncate(s: string, len: number): string {
  if (!s) return '';
  return s.length > len ? s.slice(0, len - 1) + '\u2026' : s;
}

/** Interpolate heatmap color based on value (0-1) */
function interpolateColor(value: number): string {
  const clamped = Math.max(0, Math.min(1, value));
  const idx = clamped * (HEATMAP_COLORS.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.min(lower + 1, HEATMAP_COLORS.length - 1);
  const t = idx - lower;

  // Parse colors
  const parseHex = (hex: string) => {
    const h = hex.replace('#', '');
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  };

  const c1 = parseHex(HEATMAP_COLORS[lower]);
  const c2 = parseHex(HEATMAP_COLORS[upper]);

  const r = Math.round(c1.r + t * (c2.r - c1.r));
  const g = Math.round(c1.g + t * (c2.g - c1.g));
  const b = Math.round(c1.b + t * (c2.b - c1.b));

  return `rgb(${r},${g},${b})`;
}

/** Create a card container */
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

/** Show "no data" message */
function showNoData(container: HTMLElement, message: string = 'No data yet'): void {
  const msg = document.createElement('div');
  msg.textContent = message;
  msg.style.cssText = `
    color:${THEME.textMuted};text-align:center;padding:40px 20px;
    font-size:14px;font-family:${THEME.fontMono};
  `;
  container.appendChild(msg);
}

/** Safe JSON fetch */
async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

/** Format number with suffix */
function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n * 100) / 100);
}

// ============================================================================
// SonaAttentionPanel Class
// ============================================================================

/**
 * SONA Attention Panel
 *
 * Visualizes the 10-mechanism attention system with:
 * - Canvas-based heatmap for performance
 * - SVG sparklines for LoRA deltas
 * - SVG gauge for latency metrics
 */
export class SonaAttentionPanel {
  private container: HTMLElement | null = null;
  private heatmapCanvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private data: SonaAttentionData | null = null;
  private refreshInterval: number | null = null;

  /**
   * Render the panel into a container
   */
  async render(container: HTMLElement): Promise<void> {
    this.container = container;
    container.innerHTML = '';
    container.style.cssText = `
      background:${THEME.bgBase};color:${THEME.textPrimary};
      font-family:${THEME.fontMono};overflow-y:auto;padding:16px;
    `;

    // Fetch data
    this.data = await fetchJson<SonaAttentionData>('/api/sona-attention');

    if (!this.data || !this.data.meta.hasData) {
      showNoData(container, 'SONA attention data not available yet');
      return;
    }

    // Title
    const title = document.createElement('div');
    title.style.cssText = `
      color:${THEME.primaryActive};font-size:16px;font-weight:700;
      margin-bottom:6px;text-align:center;
    `;
    title.textContent = 'SONA Attention Activations';
    container.appendChild(title);

    // Status badge
    const statusDiv = document.createElement('div');
    statusDiv.style.cssText = 'text-align:center;margin-bottom:16px;';
    const tickCount = safeNum(this.data.meta.tickCount);
    const statusColor = tickCount > 0 ? THEME.success : THEME.warning;
    statusDiv.innerHTML = `
      <span style="
        display:inline-flex;align-items:center;gap:4px;
        background:${statusColor}22;color:${statusColor};
        padding:2px 10px;border-radius:6px;font-size:12px;
        font-family:${THEME.fontMono};border:1px solid ${statusColor}44;
      ">${tickCount > 0 ? '\u2713' : '\u26A0'} ${tickCount} ticks recorded</span>
    `;
    container.appendChild(statusDiv);

    // Heatmap section
    this.renderHeatmap(container);

    // LoRA sparklines section
    this.renderLoRASparklines(container);

    // Latency gauge section
    this.renderLatencyGauge(container);

    // Last update info
    if (this.data.meta.lastUpdate) {
      const updateDiv = document.createElement('div');
      updateDiv.style.cssText = `
        text-align:center;color:${THEME.textMuted};font-size:11px;margin-top:12px;
      `;
      updateDiv.textContent = `Last update: ${new Date(this.data.meta.lastUpdate).toLocaleString()}`;
      container.appendChild(updateDiv);
    }
  }

  /**
   * Render the attention heatmap using Canvas
   */
  private renderHeatmap(container: HTMLElement): void {
    const card = createCard('Attention Heatmap');

    const mechanisms = this.data?.mechanisms || [];
    if (mechanisms.length === 0) {
      showNoData(card, 'No attention mechanism data');
      container.appendChild(card);
      return;
    }

    // Determine dimensions
    const numMechanisms = mechanisms.length;
    const numTimeSteps = Math.max(...mechanisms.map(m => m.activations?.length || 0), 5);

    const labelWidth = 100;
    const avgColWidth = 60;
    const cellWidth = 40;
    const cellHeight = 24;
    const canvasWidth = labelWidth + numTimeSteps * cellWidth + avgColWidth + 20;
    const canvasHeight = (numMechanisms + 1) * cellHeight + 10;

    // Create canvas
    this.heatmapCanvas = document.createElement('canvas');
    this.heatmapCanvas.width = canvasWidth;
    this.heatmapCanvas.height = canvasHeight;
    this.heatmapCanvas.style.cssText = `
      display:block;max-width:100%;border-radius:6px;
      background:${THEME.bgElevated};
    `;

    this.ctx = this.heatmapCanvas.getContext('2d');
    if (!this.ctx) return;

    const ctx = this.ctx;
    ctx.fillStyle = THEME.bgElevated;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Draw header row
    ctx.font = `10px ${THEME.fontMono}`;
    ctx.fillStyle = THEME.textMuted;
    ctx.textAlign = 'center';

    // Time step labels (t-N to now)
    for (let t = 0; t < numTimeSteps; t++) {
      const x = labelWidth + t * cellWidth + cellWidth / 2;
      const label = t === numTimeSteps - 1 ? 'now' : `t-${numTimeSteps - 1 - t}`;
      ctx.fillText(label, x, 16);
    }

    // Avg column header
    ctx.fillText('Avg', labelWidth + numTimeSteps * cellWidth + avgColWidth / 2, 16);

    // Draw mechanism rows
    mechanisms.forEach((mech, rowIdx) => {
      const y = (rowIdx + 1) * cellHeight;

      // Mechanism label
      ctx.textAlign = 'right';
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(truncate(mech.name, 12), labelWidth - 8, y + cellHeight / 2 + 4);

      // Activation cells
      const activations = mech.activations || [];
      const paddedActivations = [...Array(numTimeSteps - activations.length).fill(0), ...activations];

      paddedActivations.forEach((val, colIdx) => {
        const x = labelWidth + colIdx * cellWidth;
        const safeVal = safeNum(val);
        const color = interpolateColor(safeVal);

        // Cell background
        ctx.fillStyle = color;
        ctx.fillRect(x + 2, y + 2, cellWidth - 4, cellHeight - 4);

        // Cell value
        ctx.textAlign = 'center';
        ctx.fillStyle = safeVal > 0.6 ? THEME.bgBase : THEME.textPrimary;
        ctx.fillText(safeVal.toFixed(2), x + cellWidth / 2, y + cellHeight / 2 + 4);
      });

      // Average cell
      const avgX = labelWidth + numTimeSteps * cellWidth;
      const safeAvgWeight = safeNum(mech.avgWeight);
      const avgColor = interpolateColor(safeAvgWeight);
      ctx.fillStyle = avgColor;
      ctx.fillRect(avgX + 2, y + 2, avgColWidth - 4, cellHeight - 4);

      ctx.fillStyle = safeAvgWeight > 0.6 ? THEME.bgBase : THEME.textPrimary;
      ctx.fillText(safeAvgWeight.toFixed(2), avgX + avgColWidth / 2, y + cellHeight / 2 + 4);
    });

    // Legend
    const legendDiv = document.createElement('div');
    legendDiv.style.cssText = `
      display:flex;align-items:center;gap:8px;margin-top:8px;
      font-size:10px;color:${THEME.textMuted};
    `;
    legendDiv.innerHTML = `
      <span>Legend:</span>
      <span style="display:flex;align-items:center;gap:4px;">
        <span style="width:16px;height:12px;background:${HEATMAP_COLORS[0]};border-radius:2px;"></span>
        <span>&lt;0.25</span>
      </span>
      <span style="display:flex;align-items:center;gap:4px;">
        <span style="width:16px;height:12px;background:${HEATMAP_COLORS[2]};border-radius:2px;"></span>
        <span>0.25-0.75</span>
      </span>
      <span style="display:flex;align-items:center;gap:4px;">
        <span style="width:16px;height:12px;background:${HEATMAP_COLORS[4]};border-radius:2px;"></span>
        <span>&gt;0.75</span>
      </span>
    `;

    card.appendChild(this.heatmapCanvas);
    card.appendChild(legendDiv);
    container.appendChild(card);
  }

  /**
   * Render LoRA weight delta sparklines
   */
  private renderLoRASparklines(container: HTMLElement): void {
    const card = createCard('LoRA Adaptation Deltas');

    const loraDeltas = this.data?.loraDeltas || [];
    if (loraDeltas.length === 0) {
      const noData = document.createElement('div');
      noData.textContent = 'No LoRA delta data recorded yet';
      noData.style.cssText = `color:${THEME.textMuted};font-size:12px;`;
      card.appendChild(noData);
      container.appendChild(card);
      return;
    }

    // Sort by layer ID
    const sortedDeltas = [...loraDeltas].sort((a, b) => a.layerId - b.layerId);

    sortedDeltas.forEach(layer => {
      const row = document.createElement('div');
      row.style.cssText = `
        display:flex;align-items:center;gap:12px;margin-bottom:8px;
      `;

      // Layer label
      const label = document.createElement('span');
      label.textContent = `Layer ${layer.layerId}:`;
      label.style.cssText = `
        width:60px;color:${THEME.textMuted};font-size:11px;
      `;
      row.appendChild(label);

      // Sparkline container
      const sparkContainer = document.createElement('div');
      sparkContainer.style.cssText = 'flex:1;';
      this.createSparkline(sparkContainer, layer.deltas, THEME.primaryActive, 180, 24);
      row.appendChild(sparkContainer);

      // Max delta
      const maxDelta = document.createElement('span');
      maxDelta.textContent = `\u0394max: ${safeNum(layer.maxDelta).toFixed(4)}`;
      maxDelta.style.cssText = `
        width:100px;text-align:right;color:${THEME.textSecondary};font-size:10px;
      `;
      row.appendChild(maxDelta);

      card.appendChild(row);
    });

    // Summary stats
    const totalAdaptations = loraDeltas.reduce((sum, l) => sum + safeNum(l.deltas?.length), 0);
    const avgLatency = safeNum(this.data?.timing?.average);

    const summary = document.createElement('div');
    summary.style.cssText = `
      margin-top:12px;padding-top:8px;border-top:1px solid ${THEME.bgElevated};
      font-size:11px;color:${THEME.textMuted};
    `;
    summary.innerHTML = `
      Total adaptations: <span style="color:${THEME.textPrimary};">${formatNumber(totalAdaptations)}</span>
      &nbsp;&nbsp;|&nbsp;&nbsp;
      Avg latency: <span style="color:${THEME.textPrimary};">${avgLatency.toFixed(3)}ms</span>
    `;
    card.appendChild(summary);

    container.appendChild(card);
  }

  /**
   * Create a sparkline SVG
   */
  private createSparkline(
    container: HTMLElement,
    data: number[],
    color: string,
    width: number = 200,
    height: number = 40
  ): void {
    if (!data || data.length === 0) {
      const empty = document.createElement('span');
      empty.textContent = '\u2014';
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
    areaPath.setAttribute(
      'points',
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
   * Render the latency gauge
   */
  private renderLatencyGauge(container: HTMLElement): void {
    const card = createCard('Adaptation Latency');

    const timing = this.data?.timing || {
      current: 0,
      target: 0.05,
      average: 0,
      percentile95: 0,
    };

    const gaugeContainer = document.createElement('div');
    gaugeContainer.style.cssText = `
      display:flex;align-items:flex-start;gap:24px;
    `;

    // Left: Gauge visualization
    const gaugeWrapper = document.createElement('div');
    gaugeWrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;';

    // Current vs Target display
    const currentDisplay = document.createElement('div');
    currentDisplay.style.cssText = `
      font-size:11px;color:${THEME.textMuted};text-align:center;
    `;
    const safeCurrent = safeNum(timing.current);
    const safeTarget = safeNum(timing.target, 0.05);
    currentDisplay.innerHTML = `
      Current: <span style="color:${THEME.textPrimary};font-weight:600;">${safeCurrent.toFixed(3)}ms</span>
      &nbsp;&nbsp;Target: <span style="color:${THEME.textMuted};">&lt;${safeTarget}ms</span>
    `;
    gaugeWrapper.appendChild(currentDisplay);

    // Progress bar
    const progressContainer = document.createElement('div');
    progressContainer.style.cssText = `
      width:200px;height:20px;background:${THEME.bgElevated};
      border-radius:10px;overflow:hidden;position:relative;
    `;

    const usedPercent = Math.min((safeCurrent / (safeTarget || 0.05)) * 100, 100);
    const barColor = usedPercent > 80 ? THEME.error : usedPercent > 60 ? THEME.warning : THEME.success;

    const progressBar = document.createElement('div');
    progressBar.style.cssText = `
      height:100%;width:${usedPercent}%;background:${barColor};
      transition:width 0.5s ease;border-radius:10px;
    `;
    progressContainer.appendChild(progressBar);

    // Percent label
    const percentLabel = document.createElement('div');
    percentLabel.style.cssText = `
      position:absolute;right:8px;top:50%;transform:translateY(-50%);
      font-size:10px;color:${THEME.textPrimary};font-weight:600;
    `;
    percentLabel.textContent = `${safeNum(usedPercent).toFixed(0)}%`;
    progressContainer.appendChild(percentLabel);

    gaugeWrapper.appendChild(progressContainer);

    // Status indicator
    const status = document.createElement('div');
    const withinTarget = safeCurrent <= safeTarget;
    const statusColor = withinTarget ? THEME.success : THEME.error;
    status.style.cssText = `
      display:flex;align-items:center;gap:4px;
      color:${statusColor};font-size:12px;
    `;
    status.innerHTML = `
      ${withinTarget ? '\u2713' : '\u2717'}
      ${withinTarget ? 'Within Target' : 'Above Target'}
    `;
    gaugeWrapper.appendChild(status);

    gaugeContainer.appendChild(gaugeWrapper);

    // Right: Additional metrics
    const metricsDiv = document.createElement('div');
    metricsDiv.style.cssText = 'flex:1;';

    const safeAvg = safeNum(timing.average);
    const safeP95 = safeNum(timing.percentile95);
    const metrics = [
      { label: 'Average', value: `${safeAvg.toFixed(3)}ms` },
      { label: '95th Percentile', value: `${safeP95.toFixed(3)}ms` },
      { label: 'Headroom', value: `${Math.max(0, safeTarget - safeCurrent).toFixed(3)}ms` },
    ];

    metrics.forEach(metric => {
      const row = document.createElement('div');
      row.style.cssText = `
        display:flex;justify-content:space-between;padding:4px 0;
        border-bottom:1px solid ${THEME.bgElevated};font-size:11px;
      `;
      row.innerHTML = `
        <span style="color:${THEME.textMuted};">${metric.label}</span>
        <span style="color:${THEME.textPrimary};font-family:${THEME.fontMono};">${metric.value}</span>
      `;
      metricsDiv.appendChild(row);
    });

    gaugeContainer.appendChild(metricsDiv);
    card.appendChild(gaugeContainer);
    container.appendChild(card);
  }

  /**
   * Start auto-refresh (5s interval)
   */
  startAutoRefresh(): void {
    if (this.refreshInterval) return;
    this.refreshInterval = window.setInterval(() => {
      if (this.container) {
        this.render(this.container);
      }
    }, 5000);
  }

  /**
   * Stop auto-refresh
   */
  stopAutoRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.stopAutoRefresh();
    this.container = null;
    this.heatmapCanvas = null;
    this.ctx = null;
    this.data = null;
  }
}
