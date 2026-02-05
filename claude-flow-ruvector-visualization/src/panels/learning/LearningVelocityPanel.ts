/**
 * LearningVelocityPanel - Real-time learning velocity chart
 *
 * Displays patterns/minute over time as a line chart using D3.js.
 * Fetches data from /api/learning/velocity endpoint.
 */

import * as d3 from 'd3';

// ============================================================================
// Theme Constants (matching existing panels)
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

interface VelocityDataPoint {
  timestamp: number;
  patternsPerMinute: number;
  rollingAverage: number;
}

interface VelocityResponse {
  data: VelocityDataPoint[];
  meta: {
    currentVelocity: number;
    peakVelocity: number;
    avgVelocity: number;
    totalPatterns: number;
    windowMinutes: number;
  };
}

// ============================================================================
// Styles
// ============================================================================

const STYLES = `
  .learning-velocity-panel {
    background: ${THEME.bgBase};
    color: ${THEME.textPrimary};
    font-family: ${THEME.fontMono};
    padding: 16px;
    height: 100%;
    box-sizing: border-box;
    overflow-y: auto;
  }

  .learning-velocity-panel .panel-title {
    color: ${THEME.primaryActive};
    font-size: 16px;
    font-weight: 700;
    margin-bottom: 16px;
    text-align: center;
  }

  .learning-velocity-panel .stats-row {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  .learning-velocity-panel .stat-card {
    background: ${THEME.bgElevated};
    border-radius: 10px;
    padding: 12px 16px;
    text-align: center;
    flex: 1;
    min-width: 100px;
  }

  .learning-velocity-panel .stat-value {
    font-size: 24px;
    font-weight: 700;
    color: ${THEME.primaryActive};
  }

  .learning-velocity-panel .stat-label {
    font-size: 11px;
    color: ${THEME.textMuted};
    margin-top: 4px;
  }

  .learning-velocity-panel .chart-container {
    background: ${THEME.bgSurface};
    border: 1px solid ${THEME.primary}33;
    border-radius: 12px;
    padding: 16px;
    margin-top: 12px;
  }

  .learning-velocity-panel .chart-title {
    color: ${THEME.textSecondary};
    font-size: 12px;
    margin-bottom: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .learning-velocity-panel .chart-svg {
    width: 100%;
    height: 200px;
  }

  .learning-velocity-panel .axis text {
    fill: ${THEME.textMuted};
    font-size: 10px;
    font-family: ${THEME.fontMono};
  }

  .learning-velocity-panel .axis line,
  .learning-velocity-panel .axis path {
    stroke: ${THEME.bgElevated};
  }

  .learning-velocity-panel .grid line {
    stroke: ${THEME.bgElevated};
    stroke-dasharray: 2,2;
  }

  .learning-velocity-panel .velocity-line {
    fill: none;
    stroke: ${THEME.primaryActive};
    stroke-width: 2;
  }

  .learning-velocity-panel .velocity-area {
    fill: url(#velocity-gradient);
    opacity: 0.3;
  }

  .learning-velocity-panel .rolling-avg-line {
    fill: none;
    stroke: ${THEME.warning};
    stroke-width: 1.5;
    stroke-dasharray: 4,2;
  }

  .learning-velocity-panel .tooltip {
    position: absolute;
    background: ${THEME.bgElevated};
    border: 1px solid ${THEME.primary}55;
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 11px;
    pointer-events: none;
    z-index: 100;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  }

  .learning-velocity-panel .no-data {
    color: ${THEME.textMuted};
    text-align: center;
    padding: 40px 20px;
    font-size: 14px;
  }

  .learning-velocity-panel .legend {
    display: flex;
    gap: 16px;
    margin-top: 12px;
    justify-content: center;
    font-size: 11px;
  }

  .learning-velocity-panel .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    color: ${THEME.textMuted};
  }

  .learning-velocity-panel .legend-line {
    width: 20px;
    height: 2px;
  }
`;

// ============================================================================
// LearningVelocityPanel Class
// ============================================================================

export class LearningVelocityPanel {
  private container: HTMLElement | null = null;
  private data: VelocityResponse | null = null;
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
    if (!document.getElementById('learning-velocity-styles')) {
      this.styleElement = document.createElement('style');
      this.styleElement.id = 'learning-velocity-styles';
      this.styleElement.textContent = STYLES;
      document.head.appendChild(this.styleElement);
    }
  }

  /**
   * Fetch velocity data
   */
  private async fetchData(): Promise<VelocityResponse | null> {
    try {
      const response = await fetch('/api/learning/velocity');
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
    this.container.className = 'learning-velocity-panel';

    // Title
    const title = document.createElement('div');
    title.className = 'panel-title';
    title.textContent = 'Learning Velocity';
    this.container.appendChild(title);

    // Fetch data
    this.data = await this.fetchData();

    if (!this.data || (this.data.data ?? []).length === 0) {
      const noData = document.createElement('div');
      noData.className = 'no-data';
      noData.textContent = 'No learning velocity data available';
      this.container.appendChild(noData);
      return;
    }

    // Stats row
    this.renderStats();

    // Chart
    this.renderChart();

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
        value: safeNum(this.data.meta?.currentVelocity).toFixed(1),
        label: 'Current (p/min)',
        color: THEME.primaryActive,
      },
      {
        value: safeNum(this.data.meta?.peakVelocity).toFixed(1),
        label: 'Peak',
        color: THEME.success,
      },
      {
        value: safeNum(this.data.meta?.avgVelocity).toFixed(1),
        label: 'Average',
        color: THEME.warning,
      },
      {
        value: this.formatNumber(safeNum(this.data.meta?.totalPatterns)),
        label: 'Total Patterns',
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
   * Render the D3 chart
   */
  private renderChart(): void {
    if (!this.container || !this.data) return;

    const chartContainer = document.createElement('div');
    chartContainer.className = 'chart-container';

    const chartTitle = document.createElement('div');
    chartTitle.className = 'chart-title';
    chartTitle.textContent = `Patterns/Minute (Last ${safeNum(this.data.meta?.windowMinutes, 30)} minutes)`;
    chartContainer.appendChild(chartTitle);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'chart-svg');
    chartContainer.appendChild(svg);

    this.container.appendChild(chartContainer);

    // D3 rendering
    const bounds = svg.getBoundingClientRect();
    const width = bounds.width || 400;
    const height = bounds.height || 200;
    const margin = { top: 20, right: 20, bottom: 30, left: 50 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const d3Svg = d3.select(svg)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    // Gradient definition
    const defs = d3Svg.append('defs');
    const gradient = defs.append('linearGradient')
      .attr('id', 'velocity-gradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');

    gradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', THEME.primaryActive);

    gradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', THEME.bgSurface);

    const g = d3Svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Guard against empty data for D3 scale
    if (!this.data.data || this.data.data.length === 0) {
      const noData = document.createElement('div');
      noData.style.cssText = `color:${THEME.textMuted};text-align:center;padding:40px;font-size:14px;`;
      noData.textContent = 'No velocity data available';
      chartContainer.appendChild(noData);
      return;
    }

    // Scales
    const extent = d3.extent(this.data.data, d => new Date(d.timestamp));
    const xScale = d3.scaleTime()
      .domain(extent[0] && extent[1] ? extent : [new Date(), new Date()])
      .range([0, innerWidth]);

    const yMax = Math.max(
      safeNum(d3.max(this.data.data, d => safeNum(d.patternsPerMinute))),
      safeNum(d3.max(this.data.data, d => safeNum(d.rollingAverage)))
    ) * 1.1 || 1;

    const yScale = d3.scaleLinear()
      .domain([0, yMax])
      .range([innerHeight, 0]);

    // Grid lines
    g.append('g')
      .attr('class', 'grid')
      .call(
        d3.axisLeft(yScale)
          .tickSize(-innerWidth)
          .tickFormat(() => '')
      );

    // X axis
    g.append('g')
      .attr('class', 'axis')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale).ticks(6).tickFormat(d => {
        const date = d as Date;
        return `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
      }));

    // Y axis
    g.append('g')
      .attr('class', 'axis')
      .call(d3.axisLeft(yScale).ticks(5));

    // Area
    const area = d3.area<VelocityDataPoint>()
      .x(d => xScale(new Date(d.timestamp)))
      .y0(innerHeight)
      .y1(d => yScale(safeNum(d.patternsPerMinute)))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(this.data.data)
      .attr('class', 'velocity-area')
      .attr('d', area);

    // Velocity line
    const line = d3.line<VelocityDataPoint>()
      .x(d => xScale(new Date(d.timestamp)))
      .y(d => yScale(safeNum(d.patternsPerMinute)))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(this.data.data)
      .attr('class', 'velocity-line')
      .attr('d', line);

    // Rolling average line
    const avgLine = d3.line<VelocityDataPoint>()
      .x(d => xScale(new Date(d.timestamp)))
      .y(d => yScale(safeNum(d.rollingAverage)))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(this.data.data)
      .attr('class', 'rolling-avg-line')
      .attr('d', avgLine);

    // Interactive overlay
    this.addInteractivity(g, xScale, yScale, innerWidth, innerHeight);
  }

  /**
   * Add tooltip interactivity
   */
  private addInteractivity(
    g: d3.Selection<SVGGElement, unknown, null, undefined>,
    xScale: d3.ScaleTime<number, number>,
    yScale: d3.ScaleLinear<number, number>,
    width: number,
    height: number
  ): void {
    if (!this.data || !this.container) return;

    // Create tooltip
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'tooltip';
    this.tooltip.style.display = 'none';
    this.container.appendChild(this.tooltip);

    const bisect = d3.bisector<VelocityDataPoint, Date>(d => new Date(d.timestamp)).left;
    const data = this.data.data;

    const focus = g.append('g')
      .style('display', 'none');

    focus.append('circle')
      .attr('r', 5)
      .attr('fill', THEME.primaryActive)
      .attr('stroke', THEME.textPrimary)
      .attr('stroke-width', 2);

    focus.append('line')
      .attr('class', 'x-hover-line')
      .attr('stroke', THEME.textMuted)
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3,3')
      .attr('y1', 0)
      .attr('y2', height);

    g.append('rect')
      .attr('class', 'overlay')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'transparent')
      .on('mouseover', () => {
        focus.style('display', null);
        if (this.tooltip) this.tooltip.style.display = 'block';
      })
      .on('mouseout', () => {
        focus.style('display', 'none');
        if (this.tooltip) this.tooltip.style.display = 'none';
      })
      .on('mousemove', (event) => {
        const [mx] = d3.pointer(event);
        const x0 = xScale.invert(mx);
        const i = bisect(data, x0, 1);
        const d0 = data[i - 1];
        const d1 = data[i];
        const d = d1 && (x0.getTime() - new Date(d0.timestamp).getTime() >
          new Date(d1.timestamp).getTime() - x0.getTime()) ? d1 : d0;

        if (d) {
          const xPos = xScale(new Date(d.timestamp));
          const yPos = yScale(safeNum(d.patternsPerMinute));

          focus.attr('transform', `translate(${xPos},${yPos})`);
          focus.select('.x-hover-line').attr('y2', height - yPos);

          if (this.tooltip) {
            const time = new Date(d.timestamp);
            this.tooltip.innerHTML = `
              <div style="color:${THEME.textMuted};margin-bottom:4px;">
                ${time.toLocaleTimeString()}
              </div>
              <div style="color:${THEME.primaryActive};">
                ${safeNum(d.patternsPerMinute).toFixed(1)} p/min
              </div>
              <div style="color:${THEME.warning};font-size:10px;">
                Avg: ${safeNum(d.rollingAverage).toFixed(1)}
              </div>
            `;
            const rect = this.container!.getBoundingClientRect();
            this.tooltip.style.left = `${event.clientX - rect.left + 10}px`;
            this.tooltip.style.top = `${event.clientY - rect.top - 40}px`;
          }
        }
      });
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
        <div class="legend-line" style="background:${THEME.primaryActive}"></div>
        <span>Velocity</span>
      </div>
      <div class="legend-item">
        <div class="legend-line" style="background:${THEME.warning};border-top:2px dashed ${THEME.warning};height:0"></div>
        <span>Rolling Avg</span>
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
