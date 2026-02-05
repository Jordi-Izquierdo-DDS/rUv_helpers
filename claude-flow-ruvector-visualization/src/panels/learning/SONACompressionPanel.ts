/**
 * SONACompressionPanel - SONA compression ratio visualization
 *
 * Bar chart showing raw vs compressed pattern sizes with compression ratio percentage.
 * Uses D3.js for rendering.
 * Fetches data from /api/sona/compression-stats endpoint.
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

interface CompressionCategory {
  category: string;
  rawSize: number;
  compressedSize: number;
  compressionRatio: number;
  patternCount: number;
}

interface CompressionResponse {
  categories: CompressionCategory[];
  meta: {
    totalRawSize: number;
    totalCompressedSize: number;
    overallRatio: number;
    totalPatterns: number;
    algorithm: string;
  };
}

// ============================================================================
// Styles
// ============================================================================

const STYLES = `
  .sona-compression-panel {
    background: ${THEME.bgBase};
    color: ${THEME.textPrimary};
    font-family: ${THEME.fontMono};
    padding: 16px;
    height: 100%;
    box-sizing: border-box;
    overflow-y: auto;
  }

  .sona-compression-panel .panel-title {
    color: ${THEME.primaryActive};
    font-size: 16px;
    font-weight: 700;
    margin-bottom: 16px;
    text-align: center;
  }

  .sona-compression-panel .summary-card {
    background: ${THEME.bgSurface};
    border: 1px solid ${THEME.primary}33;
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 16px;
    text-align: center;
  }

  .sona-compression-panel .ratio-display {
    font-size: 48px;
    font-weight: 700;
    color: ${THEME.success};
    line-height: 1;
  }

  .sona-compression-panel .ratio-label {
    font-size: 12px;
    color: ${THEME.textMuted};
    margin-top: 8px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .sona-compression-panel .meta-row {
    display: flex;
    justify-content: space-around;
    margin-top: 16px;
    flex-wrap: wrap;
    gap: 12px;
  }

  .sona-compression-panel .meta-item {
    text-align: center;
  }

  .sona-compression-panel .meta-value {
    font-size: 18px;
    font-weight: 600;
    color: ${THEME.textPrimary};
  }

  .sona-compression-panel .meta-label {
    font-size: 10px;
    color: ${THEME.textMuted};
    margin-top: 2px;
  }

  .sona-compression-panel .chart-container {
    background: ${THEME.bgSurface};
    border: 1px solid ${THEME.primary}33;
    border-radius: 12px;
    padding: 16px;
  }

  .sona-compression-panel .chart-title {
    color: ${THEME.textSecondary};
    font-size: 12px;
    margin-bottom: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .sona-compression-panel .chart-svg {
    width: 100%;
    height: 280px;
  }

  .sona-compression-panel .axis text {
    fill: ${THEME.textMuted};
    font-size: 10px;
    font-family: ${THEME.fontMono};
  }

  .sona-compression-panel .axis line,
  .sona-compression-panel .axis path {
    stroke: ${THEME.bgElevated};
  }

  .sona-compression-panel .bar-raw {
    fill: ${THEME.primary};
    opacity: 0.7;
  }

  .sona-compression-panel .bar-compressed {
    fill: ${THEME.success};
  }

  .sona-compression-panel .bar-label {
    fill: ${THEME.textPrimary};
    font-size: 10px;
    font-family: ${THEME.fontMono};
  }

  .sona-compression-panel .legend {
    display: flex;
    gap: 24px;
    margin-top: 16px;
    justify-content: center;
    font-size: 11px;
  }

  .sona-compression-panel .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    color: ${THEME.textMuted};
  }

  .sona-compression-panel .legend-box {
    width: 14px;
    height: 14px;
    border-radius: 3px;
  }

  .sona-compression-panel .no-data {
    color: ${THEME.textMuted};
    text-align: center;
    padding: 40px 20px;
    font-size: 14px;
  }

  .sona-compression-panel .tooltip {
    position: absolute;
    background: ${THEME.bgElevated};
    border: 1px solid ${THEME.primary}55;
    border-radius: 6px;
    padding: 10px 14px;
    font-size: 11px;
    pointer-events: none;
    z-index: 100;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  }
`;

// ============================================================================
// SONACompressionPanel Class
// ============================================================================

export class SONACompressionPanel {
  private container: HTMLElement | null = null;
  private data: CompressionResponse | null = null;
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
    if (!document.getElementById('sona-compression-styles')) {
      this.styleElement = document.createElement('style');
      this.styleElement.id = 'sona-compression-styles';
      this.styleElement.textContent = STYLES;
      document.head.appendChild(this.styleElement);
    }
  }

  /**
   * Fetch compression data
   */
  private async fetchData(): Promise<CompressionResponse | null> {
    try {
      const response = await fetch('/api/sona/compression-stats');
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
    this.container.className = 'sona-compression-panel';

    // Title
    const title = document.createElement('div');
    title.className = 'panel-title';
    title.textContent = 'SONA Compression';
    this.container.appendChild(title);

    // Fetch data
    this.data = await this.fetchData();

    if (!this.data || (this.data.categories ?? []).length === 0) {
      const noData = document.createElement('div');
      noData.className = 'no-data';
      noData.textContent = 'No compression statistics available';
      this.container.appendChild(noData);
      return;
    }

    // Summary card
    this.renderSummary();

    // Chart
    this.renderChart();

    // Legend
    this.renderLegend();
  }

  /**
   * Render summary card with overall ratio
   */
  private renderSummary(): void {
    if (!this.container || !this.data) return;

    const summary = document.createElement('div');
    summary.className = 'summary-card';

    const safeRatio = safeNum(this.data.meta?.overallRatio);
    const ratioPercent = ((1 - safeRatio) * 100).toFixed(1);
    const ratioColor = safeRatio < 0.5 ? THEME.success :
      safeRatio < 0.8 ? THEME.warning : THEME.error;

    summary.innerHTML = `
      <div class="ratio-display" style="color:${ratioColor}">${ratioPercent}%</div>
      <div class="ratio-label">Overall Compression Savings</div>
      <div class="meta-row">
        <div class="meta-item">
          <div class="meta-value">${this.formatBytes(safeNum(this.data.meta?.totalRawSize))}</div>
          <div class="meta-label">Raw Size</div>
        </div>
        <div class="meta-item">
          <div class="meta-value">${this.formatBytes(safeNum(this.data.meta?.totalCompressedSize))}</div>
          <div class="meta-label">Compressed</div>
        </div>
        <div class="meta-item">
          <div class="meta-value">${this.formatNumber(safeNum(this.data.meta?.totalPatterns))}</div>
          <div class="meta-label">Patterns</div>
        </div>
        <div class="meta-item">
          <div class="meta-value" style="color:${THEME.cyan}">${safeStr(this.data.meta?.algorithm, 'unknown')}</div>
          <div class="meta-label">Algorithm</div>
        </div>
      </div>
    `;

    this.container.appendChild(summary);
  }

  /**
   * Render the D3 bar chart
   */
  private renderChart(): void {
    if (!this.container || !this.data) return;

    const chartContainer = document.createElement('div');
    chartContainer.className = 'chart-container';

    const chartTitle = document.createElement('div');
    chartTitle.className = 'chart-title';
    chartTitle.textContent = 'Compression by Category';
    chartContainer.appendChild(chartTitle);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'chart-svg');
    chartContainer.appendChild(svg);

    this.container.appendChild(chartContainer);

    // Create tooltip
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'tooltip';
    this.tooltip.style.display = 'none';
    this.container.appendChild(this.tooltip);

    // D3 rendering
    const bounds = svg.getBoundingClientRect();
    const width = bounds.width || 400;
    const height = bounds.height || 280;
    const margin = { top: 20, right: 30, bottom: 60, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const d3Svg = d3.select(svg)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    const g = d3Svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const categories = this.data.categories;

    // Scales
    const x0Scale = d3.scaleBand()
      .domain(categories.map(d => d.category))
      .range([0, innerWidth])
      .padding(0.3);

    const x1Scale = d3.scaleBand()
      .domain(['raw', 'compressed'])
      .range([0, x0Scale.bandwidth()])
      .padding(0.05);

    const yMax = safeNum(d3.max(categories, d => Math.max(safeNum(d.rawSize), safeNum(d.compressedSize))), 1);
    const yScale = d3.scaleLinear()
      .domain([0, yMax * 1.1])
      .range([innerHeight, 0]);

    // X axis
    g.append('g')
      .attr('class', 'axis')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x0Scale))
      .selectAll('text')
      .attr('transform', 'rotate(-30)')
      .style('text-anchor', 'end')
      .attr('dx', '-0.5em')
      .attr('dy', '0.5em');

    // Y axis
    g.append('g')
      .attr('class', 'axis')
      .call(d3.axisLeft(yScale).ticks(5).tickFormat(d => this.formatBytes(d as number)));

    // Y axis label
    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -50)
      .attr('x', -innerHeight / 2)
      .attr('fill', THEME.textMuted)
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px')
      .text('Size');

    // Bars
    const categoryGroups = g.selectAll('.category-group')
      .data(categories)
      .enter()
      .append('g')
      .attr('class', 'category-group')
      .attr('transform', d => `translate(${x0Scale(d.category)},0)`);

    // Raw bars
    categoryGroups.append('rect')
      .attr('class', 'bar-raw')
      .attr('x', x1Scale('raw')!)
      .attr('y', d => yScale(safeNum(d.rawSize)))
      .attr('width', x1Scale.bandwidth())
      .attr('height', d => innerHeight - yScale(safeNum(d.rawSize)))
      .on('mouseenter', (event, d) => this.showTooltip(event, d, 'raw'))
      .on('mouseleave', () => this.hideTooltip());

    // Compressed bars
    categoryGroups.append('rect')
      .attr('class', 'bar-compressed')
      .attr('x', x1Scale('compressed')!)
      .attr('y', d => yScale(safeNum(d.compressedSize)))
      .attr('width', x1Scale.bandwidth())
      .attr('height', d => innerHeight - yScale(safeNum(d.compressedSize)))
      .on('mouseenter', (event, d) => this.showTooltip(event, d, 'compressed'))
      .on('mouseleave', () => this.hideTooltip());

    // Compression ratio labels
    categoryGroups.append('text')
      .attr('class', 'bar-label')
      .attr('x', x0Scale.bandwidth() / 2)
      .attr('y', d => yScale(safeNum(d.compressedSize)) - 5)
      .attr('text-anchor', 'middle')
      .text(d => `${((1 - safeNum(d.compressionRatio)) * 100).toFixed(0)}%`);
  }

  /**
   * Show tooltip
   */
  private showTooltip(event: MouseEvent, d: CompressionCategory, type: 'raw' | 'compressed'): void {
    if (!this.tooltip || !this.container) return;

    const size = type === 'raw' ? safeNum(d.rawSize) : safeNum(d.compressedSize);
    const label = type === 'raw' ? 'Raw Size' : 'Compressed Size';
    const color = type === 'raw' ? THEME.primary : THEME.success;

    this.tooltip.innerHTML = `
      <div style="color:${THEME.textMuted};margin-bottom:4px;">${safeStr(d.category, 'Unknown')}</div>
      <div style="color:${color};font-weight:600;">${label}: ${this.formatBytes(size)}</div>
      <div style="color:${THEME.textSecondary};font-size:10px;margin-top:4px;">
        ${safeNum(d.patternCount)} patterns
      </div>
      <div style="color:${THEME.success};font-size:10px;">
        Ratio: ${((1 - safeNum(d.compressionRatio)) * 100).toFixed(1)}% saved
      </div>
    `;

    const rect = this.container.getBoundingClientRect();
    this.tooltip.style.display = 'block';
    this.tooltip.style.left = `${event.clientX - rect.left + 10}px`;
    this.tooltip.style.top = `${event.clientY - rect.top - 60}px`;
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
        <div class="legend-box" style="background:${THEME.primary};opacity:0.7"></div>
        <span>Raw Size</span>
      </div>
      <div class="legend-item">
        <div class="legend-box" style="background:${THEME.success}"></div>
        <span>Compressed Size</span>
      </div>
    `;
    this.container.appendChild(legend);
  }

  /**
   * Format bytes to human readable
   */
  private formatBytes(bytes: number): string {
    const safe = safeNum(bytes);
    if (safe >= 1_073_741_824) return `${(safe / 1_073_741_824).toFixed(1)}GB`;
    if (safe >= 1_048_576) return `${(safe / 1_048_576).toFixed(1)}MB`;
    if (safe >= 1024) return `${(safe / 1024).toFixed(1)}KB`;
    return `${safe}B`;
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
  startAutoRefresh(intervalMs: number = 10000): void {
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
