/**
 * TrajectoryFlowPanel - State->Action->Reward flow diagram
 *
 * Sankey-style flow diagram showing trajectory chains.
 * Colors by reward (green=positive, red=negative).
 * Uses D3.js with custom Sankey layout (no d3-sankey dependency).
 * Fetches data from /api/trajectories/flow endpoint.
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

interface FlowNode {
  id: string;
  name: string;
  type: 'state' | 'action' | 'reward';
  value?: number;
}

interface FlowLink {
  source: string;
  target: string;
  value: number;
  reward?: number;
}

interface TrajectoryFlowResponse {
  nodes: FlowNode[];
  links: FlowLink[];
  meta: {
    totalTrajectories: number;
    avgReward: number;
    successRate: number;
    timeRange: { start: number; end: number };
  };
}

interface LayoutNode extends FlowNode {
  x: number;
  y: number;
  width: number;
  height: number;
  column: number;
  sourceLinks: LayoutLink[];
  targetLinks: LayoutLink[];
}

interface LayoutLink {
  source: LayoutNode;
  target: LayoutNode;
  value: number;
  reward?: number;
  y0: number;
  y1: number;
  width: number;
}

// ============================================================================
// Styles
// ============================================================================

const STYLES = `
  .trajectory-flow-panel {
    background: ${THEME.bgBase};
    color: ${THEME.textPrimary};
    font-family: ${THEME.fontMono};
    padding: 16px;
    height: 100%;
    box-sizing: border-box;
    overflow-y: auto;
  }

  .trajectory-flow-panel .panel-title {
    color: ${THEME.primaryActive};
    font-size: 16px;
    font-weight: 700;
    margin-bottom: 16px;
    text-align: center;
  }

  .trajectory-flow-panel .stats-row {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  .trajectory-flow-panel .stat-card {
    background: ${THEME.bgElevated};
    border-radius: 10px;
    padding: 12px 16px;
    text-align: center;
    flex: 1;
    min-width: 100px;
  }

  .trajectory-flow-panel .stat-value {
    font-size: 20px;
    font-weight: 700;
  }

  .trajectory-flow-panel .stat-label {
    font-size: 10px;
    color: ${THEME.textMuted};
    margin-top: 4px;
  }

  .trajectory-flow-panel .chart-container {
    background: ${THEME.bgSurface};
    border: 1px solid ${THEME.primary}33;
    border-radius: 12px;
    padding: 16px;
    position: relative;
  }

  .trajectory-flow-panel .chart-title {
    color: ${THEME.textSecondary};
    font-size: 12px;
    margin-bottom: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .trajectory-flow-panel .chart-svg {
    width: 100%;
    height: 350px;
  }

  .trajectory-flow-panel .node-rect {
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .trajectory-flow-panel .node-rect:hover {
    opacity: 0.8;
  }

  .trajectory-flow-panel .node-label {
    fill: ${THEME.textPrimary};
    font-size: 10px;
    font-family: ${THEME.fontMono};
    pointer-events: none;
  }

  .trajectory-flow-panel .link {
    fill: none;
    stroke-opacity: 0.4;
    transition: stroke-opacity 0.2s;
  }

  .trajectory-flow-panel .link:hover {
    stroke-opacity: 0.7;
  }

  .trajectory-flow-panel .legend {
    display: flex;
    gap: 16px;
    margin-top: 12px;
    justify-content: center;
    font-size: 11px;
    flex-wrap: wrap;
  }

  .trajectory-flow-panel .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    color: ${THEME.textMuted};
  }

  .trajectory-flow-panel .legend-box {
    width: 14px;
    height: 14px;
    border-radius: 3px;
  }

  .trajectory-flow-panel .no-data {
    color: ${THEME.textMuted};
    text-align: center;
    padding: 40px 20px;
    font-size: 14px;
  }

  .trajectory-flow-panel .tooltip {
    position: absolute;
    background: ${THEME.bgElevated};
    border: 1px solid ${THEME.primary}55;
    border-radius: 6px;
    padding: 10px 14px;
    font-size: 11px;
    pointer-events: none;
    z-index: 100;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    max-width: 200px;
  }

  .trajectory-flow-panel .column-label {
    fill: ${THEME.textMuted};
    font-size: 12px;
    font-family: ${THEME.fontMono};
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
`;

// ============================================================================
// TrajectoryFlowPanel Class
// ============================================================================

export class TrajectoryFlowPanel {
  private container: HTMLElement | null = null;
  private data: TrajectoryFlowResponse | null = null;
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
    if (!document.getElementById('trajectory-flow-styles')) {
      this.styleElement = document.createElement('style');
      this.styleElement.id = 'trajectory-flow-styles';
      this.styleElement.textContent = STYLES;
      document.head.appendChild(this.styleElement);
    }
  }

  /**
   * Fetch trajectory flow data
   */
  private async fetchData(): Promise<TrajectoryFlowResponse | null> {
    try {
      const response = await fetch('/api/trajectories/flow');
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
    this.container.className = 'trajectory-flow-panel';

    // Title
    const title = document.createElement('div');
    title.className = 'panel-title';
    title.textContent = 'Trajectory Flow';
    this.container.appendChild(title);

    // Fetch data
    this.data = await this.fetchData();

    if (!this.data || (this.data.nodes ?? []).length === 0) {
      const noData = document.createElement('div');
      noData.className = 'no-data';
      noData.textContent = 'No trajectory flow data available';
      this.container.appendChild(noData);
      return;
    }

    // Stats row
    this.renderStats();

    // Sankey diagram
    this.renderSankey();

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

    // Use safe number utilities for all meta property accesses
    const meta = this.data?.meta ?? {};
    const successRate = safeNum(meta.successRate);
    const avgReward = safeNum(meta.avgReward);
    const totalTrajectories = safeNum(meta.totalTrajectories);
    const successColor = successRate >= 0.7 ? THEME.success :
      successRate >= 0.4 ? THEME.warning : THEME.error;
    const rewardColor = avgReward >= 0 ? THEME.success : THEME.error;

    const stats = [
      {
        value: this.formatNumber(totalTrajectories),
        label: 'Total Trajectories',
        color: THEME.primaryActive,
      },
      {
        value: `${(successRate * 100).toFixed(1)}%`,
        label: 'Success Rate',
        color: successColor,
      },
      {
        value: avgReward.toFixed(3),
        label: 'Avg Reward',
        color: rewardColor,
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
   * Render the Sankey diagram
   */
  private renderSankey(): void {
    if (!this.container || !this.data) return;

    const chartContainer = document.createElement('div');
    chartContainer.className = 'chart-container';

    const chartTitle = document.createElement('div');
    chartTitle.className = 'chart-title';
    chartTitle.textContent = 'State -> Action -> Reward Flow';
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
    requestAnimationFrame(() => this.drawSankey(svg, chartContainer));
  }

  /**
   * Custom Sankey layout (no d3-sankey dependency)
   */
  private computeSankeyLayout(
    nodes: FlowNode[],
    links: FlowLink[],
    width: number,
    height: number
  ): { nodes: LayoutNode[]; links: LayoutLink[] } {
    const nodeWidth = 20;
    const nodePadding = 15;

    // Create layout nodes
    const nodeMap = new Map<string, LayoutNode>();
    nodes.forEach(n => {
      const layoutNode: LayoutNode = {
        ...n,
        x: 0,
        y: 0,
        width: nodeWidth,
        height: 0,
        column: n.type === 'state' ? 0 : n.type === 'action' ? 1 : 2,
        sourceLinks: [],
        targetLinks: [],
      };
      nodeMap.set(n.id, layoutNode);
    });

    // Create layout links
    const layoutLinks: LayoutLink[] = links
      .filter(l => nodeMap.has(l.source) && nodeMap.has(l.target))
      .map(l => ({
        source: nodeMap.get(l.source)!,
        target: nodeMap.get(l.target)!,
        value: safeNum(l.value, 1),
        reward: l.reward,
        y0: 0,
        y1: 0,
        width: 0,
      }));

    // Connect links to nodes
    layoutLinks.forEach(link => {
      link.source.sourceLinks.push(link);
      link.target.targetLinks.push(link);
    });

    // Compute node values (sum of links)
    const layoutNodes = Array.from(nodeMap.values());
    layoutNodes.forEach(node => {
      const incoming = node.targetLinks.reduce((sum, l) => sum + safeNum(l.value), 0);
      const outgoing = node.sourceLinks.reduce((sum, l) => sum + safeNum(l.value), 0);
      node.value = Math.max(incoming, outgoing, safeNum(node.value, 1));
    });

    // Compute total value per column
    const columns: LayoutNode[][] = [[], [], []];
    layoutNodes.forEach(node => columns[node.column].push(node));

    // Compute scale factor
    const maxColumnValue = Math.max(
      ...columns.map(col => col.reduce((sum, n) => sum + safeNum(n.value), 0))
    );
    const maxColLength = Math.max(...columns.map(c => c.length || 0), 1);
    const availableHeight = height - (maxColLength - 1) * nodePadding;
    const scale = maxColumnValue > 0 ? availableHeight / maxColumnValue : 1;

    // Position columns
    const columnX = [nodeWidth / 2, width / 2, width - nodeWidth / 2];

    columns.forEach((col, colIndex) => {
      const totalHeight = col.reduce((sum, n) => sum + safeNum(n.value) * scale, 0) +
        ((col.length || 1) - 1) * nodePadding;
      let y = (height - totalHeight) / 2;

      col.forEach(node => {
        node.x = columnX[colIndex] - nodeWidth / 2;
        node.y = y;
        node.height = Math.max(4, safeNum(node.value) * scale);
        y += node.height + nodePadding;
      });
    });

    // Compute link positions
    layoutNodes.forEach(node => {
      let y0 = node.y;
      node.sourceLinks
        .sort((a, b) => a.target.y - b.target.y)
        .forEach(link => {
          link.y0 = y0 + link.value * scale / 2;
          link.width = link.value * scale;
          y0 += link.value * scale;
        });

      let y1 = node.y;
      node.targetLinks
        .sort((a, b) => a.source.y - b.source.y)
        .forEach(link => {
          link.y1 = y1 + link.value * scale / 2;
          y1 += link.value * scale;
        });
    });

    return { nodes: layoutNodes, links: layoutLinks };
  }

  /**
   * Draw the Sankey diagram
   */
  private drawSankey(svg: SVGSVGElement, chartContainer: HTMLElement): void {
    if (!this.data) return;

    const bounds = chartContainer.getBoundingClientRect();
    // Fix: Ensure width is positive even when bounds.width is 0 or small
    const rawWidth = bounds.width - 32;
    const width = rawWidth > 100 ? rawWidth : 500;
    const height = 350;
    const margin = { top: 30, right: 80, bottom: 20, left: 80 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const d3Svg = d3.select(svg)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    const g = d3Svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Compute layout
    const { nodes, links } = this.computeSankeyLayout(
      this.data.nodes,
      this.data.links,
      innerWidth,
      innerHeight
    );

    // Column labels
    const columns = ['States', 'Actions', 'Rewards'];
    const columnX = [0, innerWidth / 2, innerWidth];
    columns.forEach((label, i) => {
      g.append('text')
        .attr('class', 'column-label')
        .attr('x', columnX[i])
        .attr('y', -10)
        .attr('text-anchor', i === 0 ? 'start' : i === 1 ? 'middle' : 'end')
        .text(label);
    });

    // Color functions
    const getNodeColor = (node: LayoutNode): string => {
      switch (node.type) {
        case 'state':
          return THEME.warning;
        case 'action':
          return THEME.cyan;
        case 'reward':
          return safeNum(node.value) >= 0 ? THEME.success : THEME.error;
        default:
          return THEME.primary;
      }
    };

    const getLinkColor = (link: LayoutLink): string => {
      const reward = safeNum(link.reward);
      if (reward > 0) return THEME.success;
      if (reward < 0) return THEME.error;
      return THEME.textMuted;
    };

    // Draw links using cubic bezier curves
    const linkPath = (link: LayoutLink): string => {
      const x0 = link.source.x + link.source.width;
      const x1 = link.target.x;
      const xi = d3.interpolateNumber(x0, x1);
      const x2 = xi(0.4);
      const x3 = xi(0.6);

      return `M${x0},${link.y0}
              C${x2},${link.y0} ${x3},${link.y1} ${x1},${link.y1}`;
    };

    g.append('g')
      .attr('fill', 'none')
      .selectAll('path')
      .data(links)
      .enter()
      .append('path')
      .attr('class', 'link')
      .attr('d', linkPath)
      .attr('stroke', d => getLinkColor(d))
      .attr('stroke-width', d => Math.max(1, d.width))
      .on('mouseenter', (event, d) => this.showLinkTooltip(event, d))
      .on('mouseleave', () => this.hideTooltip());

    // Draw nodes
    const nodeGroups = g.append('g')
      .selectAll('g')
      .data(nodes)
      .enter()
      .append('g');

    nodeGroups.append('rect')
      .attr('class', 'node-rect')
      .attr('x', d => d.x)
      .attr('y', d => d.y)
      .attr('height', d => d.height)
      .attr('width', d => d.width)
      .attr('fill', d => getNodeColor(d))
      .attr('rx', 4)
      .on('mouseenter', (event, d) => this.showNodeTooltip(event, d))
      .on('mouseleave', () => this.hideTooltip());

    // Node labels
    nodeGroups.append('text')
      .attr('class', 'node-label')
      .attr('x', d => d.column === 2 ? d.x - 6 : d.x + d.width + 6)
      .attr('y', d => d.y + d.height / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', d => d.column === 2 ? 'end' : 'start')
      .text(d => this.truncate(d.name, 15));
  }

  /**
   * Show node tooltip
   */
  private showNodeTooltip(event: MouseEvent, node: LayoutNode): void {
    if (!this.tooltip) return;

    const typeLabel = (node.type || 'unknown').charAt(0).toUpperCase() + (node.type || 'unknown').slice(1);
    const typeColor = node.type === 'state' ? THEME.warning :
      node.type === 'action' ? THEME.cyan : THEME.success;

    this.tooltip.innerHTML = `
      <div style="color:${typeColor};font-weight:600;margin-bottom:4px;">${typeLabel}</div>
      <div style="color:${THEME.textPrimary};">${safeStr(node.name, 'Unknown')}</div>
      <div style="color:${THEME.textMuted};font-size:10px;margin-top:4px;">
        Flow: ${this.formatNumber(safeNum(node.value))}
      </div>
    `;

    this.positionTooltip(event);
  }

  /**
   * Show link tooltip
   */
  private showLinkTooltip(event: MouseEvent, link: LayoutLink): void {
    if (!this.tooltip) return;

    const reward = safeNum(link.reward);
    const rewardColor = reward >= 0 ? THEME.success : THEME.error;

    this.tooltip.innerHTML = `
      <div style="color:${THEME.textMuted};font-size:10px;margin-bottom:4px;">Flow</div>
      <div style="color:${THEME.textPrimary};">
        ${safeStr(link.source.name, 'Unknown')} -> ${safeStr(link.target.name, 'Unknown')}
      </div>
      <div style="color:${THEME.textSecondary};font-size:10px;margin-top:4px;">
        Volume: ${this.formatNumber(safeNum(link.value))}
      </div>
      ${link.reward != null ? `
        <div style="color:${rewardColor};font-size:10px;">
          Reward: ${reward >= 0 ? '+' : ''}${reward.toFixed(3)}
        </div>
      ` : ''}
    `;

    this.positionTooltip(event);
  }

  /**
   * Position tooltip near mouse
   */
  private positionTooltip(event: MouseEvent): void {
    if (!this.tooltip) return;

    const containerRect = this.tooltip.parentElement?.getBoundingClientRect();
    if (!containerRect) return;

    this.tooltip.style.display = 'block';
    this.tooltip.style.left = `${event.clientX - containerRect.left + 10}px`;
    this.tooltip.style.top = `${event.clientY - containerRect.top - 40}px`;
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
        <div class="legend-box" style="background:${THEME.warning}"></div>
        <span>State</span>
      </div>
      <div class="legend-item">
        <div class="legend-box" style="background:${THEME.cyan}"></div>
        <span>Action</span>
      </div>
      <div class="legend-item">
        <div class="legend-box" style="background:${THEME.success}"></div>
        <span>Positive Reward</span>
      </div>
      <div class="legend-item">
        <div class="legend-box" style="background:${THEME.error}"></div>
        <span>Negative Reward</span>
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
    return safeStr(Math.round(safe), '0');
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
