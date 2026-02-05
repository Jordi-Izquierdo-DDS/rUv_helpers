/**
 * HookTimelinePanel - Hook execution timeline
 *
 * Horizontal timeline showing hook events.
 * Colors by hook type and outcome (success/fail).
 * Uses D3.js timeline.
 * Fetches data from /api/hooks/timeline endpoint.
 */

import * as d3 from 'd3';

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
  cyan: '#22D3EE',
  fontMono: "'JetBrains Mono', 'Fira Code', monospace",
} as const;

// ============================================================================
// Safe Number Utilities
// ============================================================================

/** Safely convert value to number with fallback */
const safeNum = (v: any, f = 0): number =>
  v == null || typeof v !== 'number' || !Number.isFinite(v) ? f : v;

/** Safely calculate percentage with division-by-zero protection */
const safePct = (n: number, d: number): string =>
  d === 0 ? '0%' : `${Math.round(100 * safeNum(n) / safeNum(d, 1))}%`;

/** Safely convert value to string with fallback */
const safeStr = (v: any, f = '-'): string =>
  v == null || (typeof v === 'number' && !Number.isFinite(v)) ? f : String(v);

// Hook type colors
const HOOK_COLORS: Record<string, string> = {
  'pre-edit': '#60a5fa',
  'post-edit': '#3b82f6',
  'pre-command': '#f59e0b',
  'post-command': '#d97706',
  'pre-task': '#8b5cf6',
  'post-task': '#7c3aed',
  'route': '#14b8a6',
  'learn': '#10b981',
  'remember': '#ec4899',
  'recall': '#f472b6',
  default: '#6b7280',
};

// ============================================================================
// Types
// ============================================================================

interface HookEvent {
  id: string;
  hookType: string;
  timestamp: number;
  duration: number;
  success: boolean;
  context?: string;
  error?: string;
}

interface HookTimelineResponse {
  events: HookEvent[];
  meta: {
    totalEvents: number;
    successRate: number;
    avgDuration: number;
    timeRange: { start: number; end: number };
    hookTypes: string[];
  };
}

// ============================================================================
// Styles
// ============================================================================

const STYLES = `
  .hook-timeline-panel {
    background: ${THEME.bgBase};
    color: ${THEME.textPrimary};
    font-family: ${THEME.fontMono};
    padding: 16px;
    height: 100%;
    box-sizing: border-box;
    overflow-y: auto;
  }

  .hook-timeline-panel .panel-title {
    color: ${THEME.primaryActive};
    font-size: 16px;
    font-weight: 700;
    margin-bottom: 16px;
    text-align: center;
  }

  .hook-timeline-panel .stats-row {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  .hook-timeline-panel .stat-card {
    background: ${THEME.bgElevated};
    border-radius: 10px;
    padding: 12px 16px;
    text-align: center;
    flex: 1;
    min-width: 80px;
  }

  .hook-timeline-panel .stat-value {
    font-size: 20px;
    font-weight: 700;
  }

  .hook-timeline-panel .stat-label {
    font-size: 10px;
    color: ${THEME.textMuted};
    margin-top: 4px;
  }

  .hook-timeline-panel .chart-container {
    background: ${THEME.bgSurface};
    border: 1px solid ${THEME.primary}33;
    border-radius: 12px;
    padding: 16px;
    position: relative;
  }

  .hook-timeline-panel .chart-title {
    color: ${THEME.textSecondary};
    font-size: 12px;
    margin-bottom: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .hook-timeline-panel .chart-svg {
    width: 100%;
    height: 300px;
  }

  .hook-timeline-panel .axis text {
    fill: ${THEME.textMuted};
    font-size: 10px;
    font-family: ${THEME.fontMono};
  }

  .hook-timeline-panel .axis line,
  .hook-timeline-panel .axis path {
    stroke: ${THEME.bgElevated};
  }

  .hook-timeline-panel .lane-label {
    fill: ${THEME.textSecondary};
    font-size: 11px;
    font-family: ${THEME.fontMono};
  }

  .hook-timeline-panel .event-rect {
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .hook-timeline-panel .event-rect:hover {
    opacity: 0.8;
  }

  .hook-timeline-panel .event-rect.failed {
    stroke: ${THEME.error};
    stroke-width: 2;
  }

  .hook-timeline-panel .legend {
    display: flex;
    gap: 12px;
    margin-top: 12px;
    flex-wrap: wrap;
    font-size: 11px;
    justify-content: center;
  }

  .hook-timeline-panel .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    color: ${THEME.textMuted};
  }

  .hook-timeline-panel .legend-box {
    width: 14px;
    height: 14px;
    border-radius: 3px;
  }

  .hook-timeline-panel .no-data {
    color: ${THEME.textMuted};
    text-align: center;
    padding: 40px 20px;
    font-size: 14px;
  }

  .hook-timeline-panel .tooltip {
    position: absolute;
    background: ${THEME.bgElevated};
    border: 1px solid ${THEME.primary}55;
    border-radius: 8px;
    padding: 12px 16px;
    font-size: 11px;
    pointer-events: none;
    z-index: 100;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    max-width: 280px;
  }

  .hook-timeline-panel .tooltip-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  .hook-timeline-panel .tooltip-badge {
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 10px;
    text-transform: uppercase;
  }

  .hook-timeline-panel .time-axis line.now-marker {
    stroke: ${THEME.error};
    stroke-width: 2;
    stroke-dasharray: 4,2;
  }
`;

// ============================================================================
// HookTimelinePanel Class
// ============================================================================

export class HookTimelinePanel {
  private container: HTMLElement | null = null;
  private data: HookTimelineResponse | null = null;
  private updateInterval: number | null = null;
  private tooltip: HTMLDivElement | null = null;
  private styleElement: HTMLStyleElement | null = null;

  /**
   * Initialize the panel
   */
  async init(container: HTMLElement): Promise<void> {
    this.container = container;
    this.injectStyles();
    await this.render();
  }

  /**
   * Inject CSS styles
   */
  private injectStyles(): void {
    if (!document.getElementById('hook-timeline-styles')) {
      this.styleElement = document.createElement('style');
      this.styleElement.id = 'hook-timeline-styles';
      this.styleElement.textContent = STYLES;
      document.head.appendChild(this.styleElement);
    }
  }

  /**
   * Fetch timeline data
   */
  private async fetchData(): Promise<HookTimelineResponse | null> {
    try {
      const response = await fetch('/api/hooks/timeline');
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  /**
   * Render the panel
   */
  private async render(): Promise<void> {
    if (!this.container) return;

    this.container.innerHTML = '';
    this.container.className = 'hook-timeline-panel';

    // Title
    const title = document.createElement('div');
    title.className = 'panel-title';
    title.textContent = 'Hook Execution Timeline';
    this.container.appendChild(title);

    // Fetch data
    this.data = await this.fetchData();

    if (!this.data || (this.data.events ?? []).length === 0) {
      const noData = document.createElement('div');
      noData.className = 'no-data';
      noData.textContent = 'No hook events recorded';
      this.container.appendChild(noData);
      return;
    }

    // Stats row
    this.renderStats();

    // Timeline chart
    this.renderTimeline();

    // Legend
    this.renderLegend();
  }

  /**
   * Render stats cards
   */
  private renderStats(): void {
    if (!this.container || !this.data) return;

    const statsRow = document.createElement('div');
    statsRow.className = 'stats-row';

    const successRate = safeNum(this.data.meta?.successRate);
    const successColor = successRate >= 0.9 ? THEME.success :
      successRate >= 0.7 ? THEME.warning : THEME.error;

    const stats = [
      {
        value: this.formatNumber(safeNum(this.data.meta?.totalEvents)),
        label: 'Total Events',
        color: THEME.primaryActive,
      },
      {
        value: `${(successRate * 100).toFixed(1)}%`,
        label: 'Success Rate',
        color: successColor,
      },
      {
        value: `${safeNum(this.data.meta?.avgDuration).toFixed(0)}ms`,
        label: 'Avg Duration',
        color: THEME.cyan,
      },
      {
        value: safeStr((this.data.meta?.hookTypes ?? []).length || 0),
        label: 'Hook Types',
        color: THEME.textSecondary,
      },
    ];

    stats.forEach(({ value, label, color }) => {
      const card = document.createElement('div');
      card.className = 'stat-card';
      card.innerHTML = `
        <div class="stat-value" style="color:${color}">${value}</div>
        <div class="stat-label">${label}</div>
      `;
      statsRow.appendChild(card);
    });

    this.container.appendChild(statsRow);
  }

  /**
   * Render the timeline chart
   */
  private renderTimeline(): void {
    if (!this.container || !this.data) return;

    const chartContainer = document.createElement('div');
    chartContainer.className = 'chart-container';

    const chartTitle = document.createElement('div');
    chartTitle.className = 'chart-title';
    chartTitle.textContent = 'Hook Events Over Time';
    chartContainer.appendChild(chartTitle);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'chart-svg');
    chartContainer.appendChild(svg);

    this.container.appendChild(chartContainer);

    // Create tooltip
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'tooltip';
    this.tooltip.style.display = 'none';
    chartContainer.appendChild(this.tooltip);

    // Wait for layout then draw
    requestAnimationFrame(() => this.drawTimeline(svg, chartContainer));
  }

  /**
   * Draw timeline with D3
   */
  private drawTimeline(svg: SVGSVGElement, chartContainer: HTMLElement): void {
    if (!this.data) return;

    const bounds = chartContainer.getBoundingClientRect();
    const width = bounds.width - 32 || 500;
    const height = 300;
    const margin = { top: 20, right: 30, bottom: 40, left: 120 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const d3Svg = d3.select(svg)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    const g = d3Svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Get unique hook types for lanes
    const hookTypes = this.data.meta?.hookTypes ?? [];
    const laneHeight = Math.min(30, (hookTypes.length || 0) > 0 ? innerHeight / (hookTypes.length || 1) : innerHeight);

    // Time scale
    const timeExtent = [
      safeNum(this.data.meta?.timeRange?.start, Date.now() - 3600000),
      safeNum(this.data.meta?.timeRange?.end, Date.now()),
    ];
    const xScale = d3.scaleTime()
      .domain(timeExtent.map(t => new Date(t)))
      .range([0, innerWidth]);

    // Lane scale
    const yScale = d3.scaleBand()
      .domain(hookTypes)
      .range([0, hookTypes.length * laneHeight])
      .padding(0.2);

    // X axis
    g.append('g')
      .attr('class', 'axis')
      .attr('transform', `translate(0,${hookTypes.length * laneHeight + 10})`)
      .call(d3.axisBottom(xScale).ticks(6).tickFormat(d => {
        const date = d as Date;
        return `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
      }));

    // Lane backgrounds and labels
    hookTypes.forEach((hookType, i) => {
      // Lane background (alternating)
      if (i % 2 === 0) {
        g.append('rect')
          .attr('x', 0)
          .attr('y', yScale(hookType) || 0)
          .attr('width', innerWidth)
          .attr('height', yScale.bandwidth())
          .attr('fill', THEME.bgElevated)
          .attr('opacity', 0.3);
      }

      // Lane label
      g.append('text')
        .attr('class', 'lane-label')
        .attr('x', -10)
        .attr('y', (yScale(hookType) || 0) + yScale.bandwidth() / 2)
        .attr('dy', '0.35em')
        .attr('text-anchor', 'end')
        .text(hookType);
    });

    // Event rectangles
    const minEventWidth = 6;
    g.selectAll('.event-rect')
      .data(this.data.events)
      .enter()
      .append('rect')
      .attr('class', d => `event-rect ${d.success ? '' : 'failed'}`)
      .attr('x', d => xScale(new Date(safeNum(d.timestamp, Date.now()))))
      .attr('y', d => yScale(d.hookType) || 0)
      .attr('width', d => {
        const ts = safeNum(d.timestamp, Date.now());
        const dur = safeNum(d.duration);
        const w = xScale(new Date(ts + dur)) - xScale(new Date(ts));
        return Math.max(minEventWidth, safeNum(w, minEventWidth));
      })
      .attr('height', yScale.bandwidth())
      .attr('fill', d => HOOK_COLORS[d.hookType] || HOOK_COLORS.default)
      .attr('rx', 3)
      .on('mouseenter', (event, d) => this.showTooltip(event, d))
      .on('mouseleave', () => this.hideTooltip());

    // Now marker
    const now = Date.now();
    if (now >= timeExtent[0] && now <= timeExtent[1]) {
      g.append('line')
        .attr('class', 'now-marker')
        .attr('x1', xScale(new Date(now)))
        .attr('x2', xScale(new Date(now)))
        .attr('y1', 0)
        .attr('y2', hookTypes.length * laneHeight)
        .attr('stroke', THEME.error)
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '4,2');
    }
  }

  /**
   * Show tooltip for an event
   */
  private showTooltip(event: MouseEvent, hookEvent: HookEvent): void {
    if (!this.tooltip) return;

    const color = HOOK_COLORS[hookEvent.hookType] || HOOK_COLORS.default;
    const statusColor = hookEvent.success ? THEME.success : THEME.error;
    const statusText = hookEvent.success ? 'Success' : 'Failed';

    this.tooltip.innerHTML = `
      <div class="tooltip-header">
        <span class="tooltip-badge" style="background:${color}33;color:${color}">${safeStr(hookEvent.hookType, 'unknown')}</span>
        <span class="tooltip-badge" style="background:${statusColor}33;color:${statusColor}">${statusText}</span>
      </div>
      <div style="color:${THEME.textSecondary};margin-bottom:4px;">
        ${new Date(safeNum(hookEvent.timestamp, Date.now())).toLocaleString()}
      </div>
      <div style="color:${THEME.textMuted};font-size:10px;">
        Duration: ${safeNum(hookEvent.duration)}ms
      </div>
      ${hookEvent.context ? `
        <div style="color:${THEME.textMuted};font-size:10px;margin-top:4px;">
          Context: ${this.truncate(safeStr(hookEvent.context, ''), 50)}
        </div>
      ` : ''}
      ${hookEvent.error ? `
        <div style="color:${THEME.error};font-size:10px;margin-top:4px;">
          Error: ${this.truncate(safeStr(hookEvent.error, ''), 50)}
        </div>
      ` : ''}
    `;

    const containerRect = this.tooltip.parentElement?.getBoundingClientRect();
    if (!containerRect) return;

    this.tooltip.style.display = 'block';
    this.tooltip.style.left = `${event.clientX - containerRect.left + 10}px`;
    this.tooltip.style.top = `${event.clientY - containerRect.top - 60}px`;
  }

  /**
   * Hide tooltip
   */
  private hideTooltip(): void {
    if (this.tooltip) {
      this.tooltip.style.display = 'none';
    }
  }

  /**
   * Render legend
   */
  private renderLegend(): void {
    if (!this.container || !this.data) return;

    const legend = document.createElement('div');
    legend.className = 'legend';

    // Show first 6 hook types
    (this.data.meta?.hookTypes ?? []).slice(0, 6).forEach(hookType => {
      const color = HOOK_COLORS[hookType] || HOOK_COLORS.default;
      const item = document.createElement('div');
      item.className = 'legend-item';
      item.innerHTML = `
        <div class="legend-box" style="background:${color}"></div>
        <span>${hookType}</span>
      `;
      legend.appendChild(item);
    });

    // Success/fail indicators
    legend.innerHTML += `
      <div class="legend-item">
        <div class="legend-box" style="background:${THEME.success}"></div>
        <span>Success</span>
      </div>
      <div class="legend-item">
        <div class="legend-box" style="background:transparent;border:2px solid ${THEME.error}"></div>
        <span>Failed</span>
      </div>
    `;

    this.container.appendChild(legend);
  }

  /**
   * Truncate string with ellipsis
   */
  private truncate(str: string, maxLen: number): string {
    if (!str) return '';
    return str.length > maxLen ? str.slice(0, maxLen - 1) + '\u2026' : str;
  }

  /**
   * Format large numbers
   */
  private formatNumber(n: number): string {
    const safe = safeNum(n);
    if (safe >= 1_000_000) return `${(safe / 1_000_000).toFixed(1)}M`;
    if (safe >= 1_000) return `${(safe / 1_000).toFixed(1)}K`;
    return safeStr(safe, '0');
  }

  /**
   * Update the panel with fresh data
   */
  async update(): Promise<void> {
    await this.render();
  }

  /**
   * Start auto-refresh
   */
  startAutoRefresh(intervalMs: number = 5000): void {
    if (this.updateInterval) return;
    this.updateInterval = window.setInterval(() => this.update(), intervalMs);
  }

  /**
   * Stop auto-refresh
   */
  stopAutoRefresh(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopAutoRefresh();
    if (this.tooltip) {
      this.tooltip.remove();
      this.tooltip = null;
    }
    if (this.container) {
      this.container.innerHTML = '';
    }
    this.container = null;
    this.data = null;
  }
}
