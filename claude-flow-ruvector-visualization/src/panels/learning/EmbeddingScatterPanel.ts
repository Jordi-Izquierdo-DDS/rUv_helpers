/**
 * EmbeddingScatterPanel - t-SNE projection of embeddings
 *
 * 2D scatter plot of 384d vectors projected to 2D.
 * Colors by namespace/type with interactive hover for details.
 * Uses D3.js for rendering.
 * Fetches data from /api/embeddings/projection endpoint.
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

// Color palette for namespaces/types
const NAMESPACE_COLORS = [
  '#60a5fa', // Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#14b8a6', // Teal
  '#f97316', // Orange
  '#6366f1', // Indigo
  '#84cc16', // Lime
  '#06b6d4', // Cyan
  '#d946ef', // Fuchsia
];

// ============================================================================
// Types
// ============================================================================

interface EmbeddingPoint {
  id: string;
  x: number;
  y: number;
  namespace: string;
  type: string;
  preview: string;
  timestamp?: number;
  similarity?: number;
}

interface EmbeddingProjectionResponse {
  points: EmbeddingPoint[];
  meta: {
    totalPoints: number;
    namespaces: string[];
    types: string[];
    projectionMethod: string;
    perplexity?: number;
  };
}

// ============================================================================
// Styles
// ============================================================================

const STYLES = `
  .embedding-scatter-panel {
    background: ${THEME.bgBase};
    color: ${THEME.textPrimary};
    font-family: ${THEME.fontMono};
    padding: 16px;
    height: 100%;
    box-sizing: border-box;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .embedding-scatter-panel .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .embedding-scatter-panel .panel-title {
    color: ${THEME.primaryActive};
    font-size: 16px;
    font-weight: 700;
  }

  .embedding-scatter-panel .point-count {
    color: ${THEME.textMuted};
    font-size: 11px;
  }

  .embedding-scatter-panel .controls {
    display: flex;
    gap: 12px;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }

  .embedding-scatter-panel .filter-select {
    background: ${THEME.bgElevated};
    border: 1px solid ${THEME.primary}44;
    border-radius: 6px;
    padding: 6px 10px;
    color: ${THEME.textPrimary};
    font-family: ${THEME.fontMono};
    font-size: 11px;
    cursor: pointer;
  }

  .embedding-scatter-panel .filter-select:focus {
    outline: none;
    border-color: ${THEME.primaryActive};
  }

  .embedding-scatter-panel .chart-container {
    background: ${THEME.bgSurface};
    border: 1px solid ${THEME.primary}33;
    border-radius: 12px;
    flex: 1;
    position: relative;
    overflow: hidden;
  }

  .embedding-scatter-panel .chart-svg {
    width: 100%;
    height: 100%;
  }

  .embedding-scatter-panel .point {
    cursor: pointer;
    transition: r 0.15s, opacity 0.15s;
  }

  .embedding-scatter-panel .point:hover {
    stroke: ${THEME.textPrimary};
    stroke-width: 2;
  }

  .embedding-scatter-panel .point.dimmed {
    opacity: 0.15;
  }

  .embedding-scatter-panel .legend {
    display: flex;
    gap: 12px;
    margin-top: 12px;
    flex-wrap: wrap;
    font-size: 11px;
  }

  .embedding-scatter-panel .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    color: ${THEME.textMuted};
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    transition: background 0.2s;
  }

  .embedding-scatter-panel .legend-item:hover {
    background: ${THEME.bgElevated};
  }

  .embedding-scatter-panel .legend-item.active {
    background: ${THEME.primary}33;
  }

  .embedding-scatter-panel .legend-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .embedding-scatter-panel .no-data {
    color: ${THEME.textMuted};
    text-align: center;
    padding: 40px 20px;
    font-size: 14px;
  }

  .embedding-scatter-panel .tooltip {
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
    word-wrap: break-word;
  }

  .embedding-scatter-panel .tooltip-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .embedding-scatter-panel .tooltip-type {
    background: ${THEME.primary}44;
    color: ${THEME.primaryActive};
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 10px;
    text-transform: uppercase;
  }

  .embedding-scatter-panel .tooltip-preview {
    color: ${THEME.textSecondary};
    line-height: 1.4;
    font-size: 10px;
    border-left: 2px solid ${THEME.primary}55;
    padding-left: 8px;
    margin-top: 8px;
  }

  .embedding-scatter-panel .zoom-controls {
    position: absolute;
    bottom: 12px;
    right: 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .embedding-scatter-panel .zoom-btn {
    width: 32px;
    height: 32px;
    background: ${THEME.bgElevated};
    border: 1px solid ${THEME.primary}44;
    border-radius: 6px;
    color: ${THEME.textPrimary};
    font-size: 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
  }

  .embedding-scatter-panel .zoom-btn:hover {
    background: ${THEME.primary}44;
  }
`;

// ============================================================================
// EmbeddingScatterPanel Class
// ============================================================================

export class EmbeddingScatterPanel {
  private container: HTMLElement | null = null;
  private data: EmbeddingProjectionResponse | null = null;
  private updateInterval: number | null = null;
  private tooltip: HTMLDivElement | null = null;
  private styleElement: HTMLStyleElement | null = null;
  private colorScale: d3.ScaleOrdinal<string, string> | null = null;
  private activeFilter: string | null = null;
  private zoom: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null;

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
    if (!document.getElementById('embedding-scatter-styles')) {
      this.styleElement = document.createElement('style');
      this.styleElement.id = 'embedding-scatter-styles';
      this.styleElement.textContent = STYLES;
      document.head.appendChild(this.styleElement);
    }
  }

  /**
   * Fetch projection data
   */
  private async fetchData(): Promise<EmbeddingProjectionResponse | null> {
    try {
      const response = await fetch('/api/embeddings/projection');
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
    this.container.className = 'embedding-scatter-panel';

    // Header
    const header = document.createElement('div');
    header.className = 'panel-header';

    const title = document.createElement('div');
    title.className = 'panel-title';
    title.textContent = 'Embedding Projection';
    header.appendChild(title);

    this.container.appendChild(header);

    // Fetch data
    this.data = await this.fetchData();

    if (!this.data || (this.data.points ?? []).length === 0) {
      const noData = document.createElement('div');
      noData.className = 'no-data';
      noData.textContent = 'No embedding projection data available';
      this.container.appendChild(noData);
      return;
    }

    // Point count
    const pointCount = document.createElement('div');
    pointCount.className = 'point-count';
    pointCount.textContent = `${this.formatNumber(safeNum(this.data.meta?.totalPoints))} vectors (${safeStr(this.data.meta?.projectionMethod, 'unknown')})`;
    header.appendChild(pointCount);

    // Build color scale
    const categorySet = new Set(this.data.points.map(p => p.namespace || p.type));
    const allCategories = Array.from(categorySet);
    this.colorScale = d3.scaleOrdinal<string, string>()
      .domain(allCategories)
      .range(NAMESPACE_COLORS);

    // Controls
    this.renderControls();

    // Chart container
    const chartContainer = document.createElement('div');
    chartContainer.className = 'chart-container';
    this.container.appendChild(chartContainer);

    // Render scatter plot
    this.renderScatter(chartContainer);

    // Legend
    this.renderLegend(allCategories);
  }

  /**
   * Render filter controls
   */
  private renderControls(): void {
    if (!this.container || !this.data) return;

    const controls = document.createElement('div');
    controls.className = 'controls';

    // Namespace filter
    if ((this.data.meta?.namespaces ?? []).length > 1) {
      const nsSelect = document.createElement('select');
      nsSelect.className = 'filter-select';
      nsSelect.innerHTML = `<option value="">All Namespaces</option>`;
      (this.data.meta?.namespaces ?? []).forEach(ns => {
        nsSelect.innerHTML += `<option value="${ns}">${ns}</option>`;
      });
      nsSelect.addEventListener('change', () => {
        this.activeFilter = nsSelect.value || null;
        this.updatePointVisibility();
      });
      controls.appendChild(nsSelect);
    }

    // Type filter
    if ((this.data.meta?.types ?? []).length > 1) {
      const typeSelect = document.createElement('select');
      typeSelect.className = 'filter-select';
      typeSelect.innerHTML = `<option value="">All Types</option>`;
      (this.data.meta?.types ?? []).forEach(type => {
        typeSelect.innerHTML += `<option value="${type}">${type}</option>`;
      });
      typeSelect.addEventListener('change', () => {
        this.activeFilter = typeSelect.value || null;
        this.updatePointVisibility();
      });
      controls.appendChild(typeSelect);
    }

    this.container.appendChild(controls);
  }

  /**
   * Render the D3 scatter plot
   */
  private renderScatter(chartContainer: HTMLElement): void {
    if (!this.data || !this.colorScale) return;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'chart-svg');
    chartContainer.appendChild(svg);

    // Create tooltip
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'tooltip';
    this.tooltip.style.display = 'none';
    chartContainer.appendChild(this.tooltip);

    // Zoom controls
    const zoomControls = document.createElement('div');
    zoomControls.className = 'zoom-controls';
    zoomControls.innerHTML = `
      <button class="zoom-btn" data-action="in">+</button>
      <button class="zoom-btn" data-action="out">-</button>
      <button class="zoom-btn" data-action="reset">R</button>
    `;
    chartContainer.appendChild(zoomControls);

    // Wait for layout
    requestAnimationFrame(() => this.drawScatter(svg, chartContainer, zoomControls));
  }

  /**
   * Draw scatter plot with D3
   */
  private drawScatter(svg: SVGSVGElement, chartContainer: HTMLElement, zoomControls: HTMLElement): void {
    if (!this.data || !this.colorScale) return;

    const bounds = chartContainer.getBoundingClientRect();
    const width = bounds.width || 500;
    const height = bounds.height || 400;
    const margin = { top: 20, right: 20, bottom: 20, left: 20 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const d3Svg = d3.select(svg)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    // Clear previous
    d3Svg.selectAll('*').remove();

    // Scales - guard against undefined extent values from empty data
    const xExtent = d3.extent(this.data.points, d => safeNum(d.x)) as [number, number];
    const yExtent = d3.extent(this.data.points, d => safeNum(d.y)) as [number, number];
    const safeXExtent: [number, number] = [safeNum(xExtent[0]), safeNum(xExtent[1], 1)];
    const safeYExtent: [number, number] = [safeNum(yExtent[0]), safeNum(yExtent[1], 1)];
    const padding = 0.05;
    const xRange = (safeXExtent[1] - safeXExtent[0]) || 1;
    const yRange = (safeYExtent[1] - safeYExtent[0]) || 1;

    const xScale = d3.scaleLinear()
      .domain([safeXExtent[0] - xRange * padding, safeXExtent[1] + xRange * padding])
      .range([0, innerWidth]);

    const yScale = d3.scaleLinear()
      .domain([safeYExtent[0] - yRange * padding, safeYExtent[1] + yRange * padding])
      .range([innerHeight, 0]);

    // Container group for zoom
    const container = d3Svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Points group (will be transformed by zoom)
    const pointsGroup = container.append('g')
      .attr('class', 'points-group');

    // Draw points
    const colorScale = this.colorScale;
    pointsGroup.selectAll('circle')
      .data(this.data.points)
      .enter()
      .append('circle')
      .attr('class', 'point')
      .attr('cx', d => xScale(safeNum(d.x)))
      .attr('cy', d => yScale(safeNum(d.y)))
      .attr('r', 4)
      .attr('fill', d => colorScale(d.namespace || d.type || 'unknown'))
      .attr('opacity', 0.7)
      .attr('data-namespace', d => d.namespace || '')
      .attr('data-type', d => d.type || '')
      .on('mouseenter', (event, d) => this.showTooltip(event, d))
      .on('mouseleave', () => this.hideTooltip());

    // Zoom behavior
    this.zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 10])
      .on('zoom', (event) => {
        pointsGroup.attr('transform', event.transform);
      });

    d3Svg.call(this.zoom);

    // Zoom controls
    zoomControls.querySelectorAll('.zoom-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = (btn as HTMLElement).dataset.action;
        if (!this.zoom) return;

        if (action === 'in') {
          d3Svg.transition().duration(300).call(this.zoom.scaleBy, 1.5);
        } else if (action === 'out') {
          d3Svg.transition().duration(300).call(this.zoom.scaleBy, 0.67);
        } else if (action === 'reset') {
          d3Svg.transition().duration(300).call(this.zoom.transform, d3.zoomIdentity);
        }
      });
    });
  }

  /**
   * Update point visibility based on filter
   */
  private updatePointVisibility(): void {
    if (!this.container) return;

    const points = this.container.querySelectorAll('.point');
    points.forEach(point => {
      const el = point as SVGCircleElement;
      const ns = el.dataset.namespace || '';
      const type = el.dataset.type || '';

      if (!this.activeFilter || ns === this.activeFilter || type === this.activeFilter) {
        el.classList.remove('dimmed');
      } else {
        el.classList.add('dimmed');
      }
    });
  }

  /**
   * Show tooltip for a point
   */
  private showTooltip(event: MouseEvent, point: EmbeddingPoint): void {
    if (!this.tooltip || !this.colorScale) return;

    const category = point.namespace || point.type || 'unknown';
    const color = this.colorScale(category);
    const previewText = safeStr(point.preview, '');
    const preview = previewText.length > 150 ?
      previewText.slice(0, 147) + '...' : previewText;

    this.tooltip.innerHTML = `
      <div class="tooltip-header">
        <span class="tooltip-type" style="background:${color}33;color:${color}">${category}</span>
        <span style="color:${THEME.textMuted};font-size:10px;">${safeStr(point.id, '-')}</span>
      </div>
      <div style="color:${THEME.textSecondary};">Type: ${safeStr(point.type, 'unknown')}</div>
      ${point.timestamp ? `
        <div style="color:${THEME.textMuted};font-size:10px;">
          ${new Date(point.timestamp).toLocaleString()}
        </div>
      ` : ''}
      <div class="tooltip-preview">${this.escapeHtml(preview)}</div>
    `;

    const containerRect = this.tooltip.parentElement?.getBoundingClientRect();
    if (!containerRect) return;

    this.tooltip.style.display = 'block';

    // Position tooltip
    const tooltipRect = this.tooltip.getBoundingClientRect();
    let left = event.clientX - containerRect.left + 15;
    let top = event.clientY - containerRect.top - 20;

    // Keep within bounds
    if (left + tooltipRect.width > containerRect.width - 10) {
      left = event.clientX - containerRect.left - tooltipRect.width - 15;
    }
    if (top + tooltipRect.height > containerRect.height - 10) {
      top = containerRect.height - tooltipRect.height - 10;
    }
    if (top < 10) top = 10;

    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = `${top}px`;
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
  private renderLegend(categories: string[]): void {
    if (!this.container || !this.colorScale) return;

    const legend = document.createElement('div');
    legend.className = 'legend';

    const colorScale = this.colorScale;
    categories.slice(0, 8).forEach(cat => {
      const item = document.createElement('div');
      item.className = 'legend-item';
      item.innerHTML = `
        <div class="legend-dot" style="background:${colorScale(cat)}"></div>
        <span>${cat}</span>
      `;
      item.addEventListener('click', () => {
        const isActive = item.classList.contains('active');
        this.container?.querySelectorAll('.legend-item').forEach(el => el.classList.remove('active'));

        if (isActive) {
          this.activeFilter = null;
        } else {
          this.activeFilter = cat;
          item.classList.add('active');
        }
        this.updatePointVisibility();
      });
      legend.appendChild(item);
    });

    if (categories.length > 8) {
      const more = document.createElement('span');
      more.style.color = THEME.textMuted;
      more.textContent = `+${categories.length - 8} more`;
      legend.appendChild(more);
    }

    this.container.appendChild(legend);
  }

  /**
   * Escape HTML entities
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
  startAutoRefresh(intervalMs: number = 30000): void {
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
    this.colorScale = null;
    this.zoom = null;
  }
}
