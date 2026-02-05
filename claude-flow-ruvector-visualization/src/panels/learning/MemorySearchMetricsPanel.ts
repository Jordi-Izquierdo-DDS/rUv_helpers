/**
 * MemorySearchMetricsPanel - Search quality metrics
 *
 * Shows recall@k curves and latency distribution.
 * Dual-axis chart for precision and latency.
 * Uses D3.js for rendering.
 * Fetches data from /api/memory/search-metrics endpoint.
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

// ============================================================================
// Types
// ============================================================================

interface RecallPoint {
  k: number;
  recall: number;
  precision: number;
}

interface LatencyBucket {
  range: string;
  rangeStart: number;
  rangeEnd: number;
  count: number;
  percentage: number;
}

interface SearchMetricsResponse {
  recallCurve: RecallPoint[];
  latencyDistribution: LatencyBucket[];
  meta: {
    totalSearches: number;
    avgLatencyMs: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
    avgRecallAt10: number;
    avgPrecisionAt10: number;
    indexType: string;
  };
}

// ============================================================================
// Styles
// ============================================================================

const STYLES = `
  .memory-search-metrics-panel {
    background: ${THEME.bgBase};
    color: ${THEME.textPrimary};
    font-family: ${THEME.fontMono};
    padding: 16px;
    height: 100%;
    box-sizing: border-box;
    overflow-y: auto;
  }

  .memory-search-metrics-panel .panel-title {
    color: ${THEME.primaryActive};
    font-size: 16px;
    font-weight: 700;
    margin-bottom: 16px;
    text-align: center;
  }

  .memory-search-metrics-panel .stats-row {
    display: flex;
    gap: 10px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  .memory-search-metrics-panel .stat-card {
    background: ${THEME.bgElevated};
    border-radius: 10px;
    padding: 10px 14px;
    text-align: center;
    flex: 1;
    min-width: 70px;
  }

  .memory-search-metrics-panel .stat-value {
    font-size: 18px;
    font-weight: 700;
  }

  .memory-search-metrics-panel .stat-label {
    font-size: 9px;
    color: ${THEME.textMuted};
    margin-top: 4px;
  }

  .memory-search-metrics-panel .charts-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  @media (max-width: 600px) {
    .memory-search-metrics-panel .charts-grid {
      grid-template-columns: 1fr;
    }
  }

  .memory-search-metrics-panel .chart-container {
    background: ${THEME.bgSurface};
    border: 1px solid ${THEME.primary}33;
    border-radius: 12px;
    padding: 14px;
    position: relative;
  }

  .memory-search-metrics-panel .chart-title {
    color: ${THEME.textSecondary};
    font-size: 11px;
    margin-bottom: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .memory-search-metrics-panel .chart-svg {
    width: 100%;
    height: 180px;
  }

  .memory-search-metrics-panel .axis text {
    fill: ${THEME.textMuted};
    font-size: 9px;
    font-family: ${THEME.fontMono};
  }

  .memory-search-metrics-panel .axis line,
  .memory-search-metrics-panel .axis path {
    stroke: ${THEME.bgElevated};
  }

  .memory-search-metrics-panel .grid line {
    stroke: ${THEME.bgElevated};
    stroke-dasharray: 2,2;
  }

  .memory-search-metrics-panel .recall-line {
    fill: none;
    stroke: ${THEME.success};
    stroke-width: 2;
  }

  .memory-search-metrics-panel .precision-line {
    fill: none;
    stroke: ${THEME.primaryActive};
    stroke-width: 2;
  }

  .memory-search-metrics-panel .latency-bar {
    fill: ${THEME.cyan};
  }

  .memory-search-metrics-panel .latency-bar:hover {
    fill: ${THEME.primary};
  }

  .memory-search-metrics-panel .percentile-line {
    stroke: ${THEME.warning};
    stroke-width: 2;
    stroke-dasharray: 4,2;
  }

  .memory-search-metrics-panel .legend {
    display: flex;
    gap: 16px;
    margin-top: 12px;
    justify-content: center;
    font-size: 10px;
    flex-wrap: wrap;
  }

  .memory-search-metrics-panel .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    color: ${THEME.textMuted};
  }

  .memory-search-metrics-panel .legend-line {
    width: 16px;
    height: 2px;
  }

  .memory-search-metrics-panel .legend-box {
    width: 12px;
    height: 12px;
    border-radius: 2px;
  }

  .memory-search-metrics-panel .no-data {
    color: ${THEME.textMuted};
    text-align: center;
    padding: 40px 20px;
    font-size: 14px;
  }

  .memory-search-metrics-panel .tooltip {
    position: absolute;
    background: ${THEME.bgElevated};
    border: 1px solid ${THEME.primary}55;
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 10px;
    pointer-events: none;
    z-index: 100;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  }

  .memory-search-metrics-panel .index-badge {
    display: inline-block;
    background: ${THEME.primary}33;
    color: ${THEME.primaryActive};
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 10px;
    text-transform: uppercase;
    margin-left: 8px;
  }
`;

// ============================================================================
// MemorySearchMetricsPanel Class
// ============================================================================

export class MemorySearchMetricsPanel {
  private container: HTMLElement | null = null;
  private data: SearchMetricsResponse | null = null;
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
    if (!document.getElementById('memory-search-metrics-styles')) {
      this.styleElement = document.createElement('style');
      this.styleElement.id = 'memory-search-metrics-styles';
      this.styleElement.textContent = STYLES;
      document.head.appendChild(this.styleElement);
    }
  }

  /**
   * Fetch metrics data
   */
  private async fetchData(): Promise<SearchMetricsResponse | null> {
    try {
      const response = await fetch('/api/memory/search-metrics');
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
    this.container.className = 'memory-search-metrics-panel';

    // Title
    const title = document.createElement('div');
    title.className = 'panel-title';
    title.textContent = 'Memory Search Metrics';
    this.container.appendChild(title);

    // Fetch data
    this.data = await this.fetchData();

    if (!this.data) {
      const noData = document.createElement('div');
      noData.className = 'no-data';
      noData.textContent = 'No search metrics available';
      this.container.appendChild(noData);
      return;
    }

    // Index badge
    if (this.data.meta?.indexType) {
      const badge = document.createElement('span');
      badge.className = 'index-badge';
      badge.textContent = this.data.meta.indexType;
      title.appendChild(badge);
    }

    // Stats row
    this.renderStats();

    // Charts grid
    const chartsGrid = document.createElement('div');
    chartsGrid.className = 'charts-grid';
    this.container.appendChild(chartsGrid);

    // Recall/Precision chart
    this.renderRecallChart(chartsGrid);

    // Latency distribution chart
    this.renderLatencyChart(chartsGrid);

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

    const stats = [
      {
        value: this.formatNumber(safeNum(this.data.meta?.totalSearches)),
        label: 'Searches',
        color: THEME.primaryActive,
      },
      {
        value: `${(safeNum(this.data.meta?.avgRecallAt10) * 100).toFixed(1)}%`,
        label: 'Recall@10',
        color: THEME.success,
      },
      {
        value: `${(safeNum(this.data.meta?.avgPrecisionAt10) * 100).toFixed(1)}%`,
        label: 'Precision@10',
        color: THEME.primaryActive,
      },
      {
        value: `${safeNum(this.data.meta?.p50LatencyMs).toFixed(0)}ms`,
        label: 'p50 Latency',
        color: THEME.cyan,
      },
      {
        value: `${safeNum(this.data.meta?.p95LatencyMs).toFixed(0)}ms`,
        label: 'p95 Latency',
        color: THEME.warning,
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
   * Render recall/precision curve chart
   */
  private renderRecallChart(chartsGrid: HTMLElement): void {
    if (!this.data) return;

    const chartContainer = document.createElement('div');
    chartContainer.className = 'chart-container';

    const chartTitle = document.createElement('div');
    chartTitle.className = 'chart-title';
    chartTitle.textContent = 'Recall & Precision @ K';
    chartContainer.appendChild(chartTitle);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'chart-svg');
    chartContainer.appendChild(svg);

    chartsGrid.appendChild(chartContainer);

    // Wait for layout
    requestAnimationFrame(() => this.drawRecallChart(svg));
  }

  /**
   * Draw recall/precision chart
   */
  private drawRecallChart(svg: SVGSVGElement): void {
    if (!this.data || (this.data.recallCurve ?? []).length === 0) return;

    const bounds = svg.getBoundingClientRect();
    const width = bounds.width || 250;
    const height = bounds.height || 180;
    const margin = { top: 15, right: 15, bottom: 30, left: 40 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const d3Svg = d3.select(svg)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    const g = d3Svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales
    const xScale = d3.scaleLinear()
      .domain([1, safeNum(d3.max(this.data.recallCurve, d => safeNum(d.k)), 20)])
      .range([0, innerWidth]);

    const yScale = d3.scaleLinear()
      .domain([0, 1])
      .range([innerHeight, 0]);

    // Grid
    g.append('g')
      .attr('class', 'grid')
      .call(d3.axisLeft(yScale).tickSize(-innerWidth).tickFormat(() => ''));

    // X axis
    g.append('g')
      .attr('class', 'axis')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale).ticks(5).tickFormat(d => `${d}`));

    // X axis label
    g.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', innerHeight + 25)
      .attr('fill', THEME.textMuted)
      .attr('text-anchor', 'middle')
      .attr('font-size', '9px')
      .text('K');

    // Y axis
    g.append('g')
      .attr('class', 'axis')
      .call(d3.axisLeft(yScale).ticks(5).tickFormat(d => `${(d as number * 100).toFixed(0)}%`));

    // Recall line
    const recallLine = d3.line<RecallPoint>()
      .x(d => xScale(safeNum(d.k, 1)))
      .y(d => yScale(safeNum(d.recall)))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(this.data.recallCurve)
      .attr('class', 'recall-line')
      .attr('d', recallLine);

    // Precision line
    const precisionLine = d3.line<RecallPoint>()
      .x(d => xScale(safeNum(d.k, 1)))
      .y(d => yScale(safeNum(d.precision)))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(this.data.recallCurve)
      .attr('class', 'precision-line')
      .attr('d', precisionLine);

    // Data points
    g.selectAll('.recall-dot')
      .data(this.data.recallCurve)
      .enter()
      .append('circle')
      .attr('cx', d => xScale(safeNum(d.k, 1)))
      .attr('cy', d => yScale(safeNum(d.recall)))
      .attr('r', 3)
      .attr('fill', THEME.success);

    g.selectAll('.precision-dot')
      .data(this.data.recallCurve)
      .enter()
      .append('circle')
      .attr('cx', d => xScale(safeNum(d.k, 1)))
      .attr('cy', d => yScale(safeNum(d.precision)))
      .attr('r', 3)
      .attr('fill', THEME.primaryActive);
  }

  /**
   * Render latency distribution chart
   */
  private renderLatencyChart(chartsGrid: HTMLElement): void {
    if (!this.data) return;

    const chartContainer = document.createElement('div');
    chartContainer.className = 'chart-container';

    const chartTitle = document.createElement('div');
    chartTitle.className = 'chart-title';
    chartTitle.textContent = 'Latency Distribution';
    chartContainer.appendChild(chartTitle);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'chart-svg');
    chartContainer.appendChild(svg);

    chartsGrid.appendChild(chartContainer);

    // Tooltip
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'tooltip';
    this.tooltip.style.display = 'none';
    chartContainer.appendChild(this.tooltip);

    // Wait for layout
    requestAnimationFrame(() => this.drawLatencyChart(svg, chartContainer));
  }

  /**
   * Draw latency distribution chart
   */
  private drawLatencyChart(svg: SVGSVGElement, chartContainer: HTMLElement): void {
    if (!this.data || (this.data.latencyDistribution ?? []).length === 0) return;

    const bounds = svg.getBoundingClientRect();
    const width = bounds.width || 250;
    const height = bounds.height || 180;
    const margin = { top: 15, right: 15, bottom: 40, left: 40 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const d3Svg = d3.select(svg)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    const g = d3Svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales
    const xScale = d3.scaleBand()
      .domain(this.data.latencyDistribution.map(d => d.range))
      .range([0, innerWidth])
      .padding(0.2);

    const yMax = safeNum(d3.max(this.data.latencyDistribution, d => safeNum(d.percentage)), 100);
    const yScale = d3.scaleLinear()
      .domain([0, yMax * 1.1])
      .range([innerHeight, 0]);

    // X axis
    g.append('g')
      .attr('class', 'axis')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale))
      .selectAll('text')
      .attr('transform', 'rotate(-30)')
      .style('text-anchor', 'end')
      .attr('dx', '-0.5em')
      .attr('dy', '0.5em');

    // Y axis
    g.append('g')
      .attr('class', 'axis')
      .call(d3.axisLeft(yScale).ticks(5).tickFormat(d => `${d}%`));

    // Bars
    g.selectAll('.latency-bar')
      .data(this.data.latencyDistribution)
      .enter()
      .append('rect')
      .attr('class', 'latency-bar')
      .attr('x', d => xScale(d.range) || 0)
      .attr('y', d => yScale(safeNum(d.percentage)))
      .attr('width', xScale.bandwidth())
      .attr('height', d => innerHeight - yScale(safeNum(d.percentage)))
      .attr('rx', 2)
      .on('mouseenter', (event, d) => this.showLatencyTooltip(event, d, chartContainer))
      .on('mouseleave', () => this.hideTooltip());

    // P95 line
    const p95Value = safeNum(this.data.meta?.p95LatencyMs);
    if (p95Value > 0) {
      const p95X = this.findBucketPosition(p95Value, xScale, innerWidth);
      if (p95X !== null) {
        g.append('line')
          .attr('class', 'percentile-line')
          .attr('x1', p95X)
          .attr('x2', p95X)
          .attr('y1', 0)
          .attr('y2', innerHeight);

        g.append('text')
          .attr('x', p95X + 3)
          .attr('y', 10)
          .attr('fill', THEME.warning)
          .attr('font-size', '8px')
          .text('p95');
      }
    }
  }

  /**
   * Find x position for a latency value
   */
  private findBucketPosition(
    latency: number,
    xScale: d3.ScaleBand<string>,
    innerWidth: number
  ): number | null {
    if (!this.data) return null;

    for (const bucket of this.data.latencyDistribution) {
      if (latency >= bucket.rangeStart && latency < bucket.rangeEnd) {
        const x = xScale(bucket.range);
        if (x !== undefined) {
          return x + xScale.bandwidth() / 2;
        }
      }
    }
    return innerWidth;
  }

  /**
   * Show latency tooltip
   */
  private showLatencyTooltip(event: MouseEvent, bucket: LatencyBucket, chartContainer: HTMLElement): void {
    if (!this.tooltip) return;

    this.tooltip.innerHTML = `
      <div style="color:${THEME.textPrimary};font-weight:600;">${safeStr(bucket.range, 'N/A')}</div>
      <div style="color:${THEME.cyan};">${safeNum(bucket.count)} searches</div>
      <div style="color:${THEME.textMuted};">${safeNum(bucket.percentage).toFixed(1)}%</div>
    `;

    const containerRect = chartContainer.getBoundingClientRect();
    this.tooltip.style.display = 'block';
    this.tooltip.style.left = `${event.clientX - containerRect.left + 10}px`;
    this.tooltip.style.top = `${event.clientY - containerRect.top - 50}px`;
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
    if (!this.container) return;

    const legend = document.createElement('div');
    legend.className = 'legend';
    legend.innerHTML = `
      <div class="legend-item">
        <div class="legend-line" style="background:${THEME.success}"></div>
        <span>Recall</span>
      </div>
      <div class="legend-item">
        <div class="legend-line" style="background:${THEME.primaryActive}"></div>
        <span>Precision</span>
      </div>
      <div class="legend-item">
        <div class="legend-box" style="background:${THEME.cyan}"></div>
        <span>Latency</span>
      </div>
      <div class="legend-item">
        <div class="legend-line" style="background:${THEME.warning};border-top:2px dashed ${THEME.warning};height:0"></div>
        <span>p95</span>
      </div>
    `;
    this.container.appendChild(legend);
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
  startAutoRefresh(intervalMs: number = 15000): void {
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
