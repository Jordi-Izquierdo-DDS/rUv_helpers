/**
 * AgentCoordinationPanel - Agent spawn/dependency graph
 *
 * Force-directed graph showing agent relationships.
 * Shows task dependencies as edges.
 * Uses D3.js force simulation.
 * Fetches data from /api/agents/coordination endpoint.
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

// Agent role colors
const AGENT_COLORS: Record<string, string> = {
  coordinator: '#8b5cf6',
  coder: '#3b82f6',
  reviewer: '#10b981',
  tester: '#f59e0b',
  planner: '#ec4899',
  researcher: '#14b8a6',
  security: '#ef4444',
  'memory-specialist': '#6366f1',
  default: '#6b7280',
};

// Agent status colors
const STATUS_COLORS: Record<string, string> = {
  active: THEME.success,
  idle: THEME.textMuted,
  busy: THEME.warning,
  error: THEME.error,
  terminated: '#4b5563',
};

// ============================================================================
// Types
// ============================================================================

interface AgentNode {
  id: string;
  name: string;
  role: string;
  status: 'active' | 'idle' | 'busy' | 'error' | 'terminated';
  taskCount: number;
  spawnTime: number;
  parentId?: string;
}

interface AgentLink {
  source: string;
  target: string;
  type: 'spawned' | 'dependency' | 'communication';
  strength: number;
}

interface CoordinationResponse {
  agents: AgentNode[];
  links: AgentLink[];
  meta: {
    totalAgents: number;
    activeAgents: number;
    totalTasks: number;
    avgTasksPerAgent: number;
    topologyType: string;
  };
}

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  role: string;
  status: string;
  taskCount: number;
  spawnTime: number;
  parentId?: string;
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  type: string;
  strength: number;
}

// ============================================================================
// Styles
// ============================================================================

const STYLES = `
  .agent-coordination-panel {
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

  .agent-coordination-panel .panel-title {
    color: ${THEME.primaryActive};
    font-size: 16px;
    font-weight: 700;
    margin-bottom: 16px;
    text-align: center;
  }

  .agent-coordination-panel .stats-row {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  .agent-coordination-panel .stat-card {
    background: ${THEME.bgElevated};
    border-radius: 10px;
    padding: 10px 14px;
    text-align: center;
    flex: 1;
    min-width: 80px;
  }

  .agent-coordination-panel .stat-value {
    font-size: 20px;
    font-weight: 700;
  }

  .agent-coordination-panel .stat-label {
    font-size: 10px;
    color: ${THEME.textMuted};
    margin-top: 4px;
  }

  .agent-coordination-panel .graph-container {
    background: ${THEME.bgSurface};
    border: 1px solid ${THEME.primary}33;
    border-radius: 12px;
    flex: 1;
    position: relative;
    overflow: hidden;
    min-height: 300px;
  }

  .agent-coordination-panel .graph-svg {
    width: 100%;
    height: 100%;
  }

  .agent-coordination-panel .node {
    cursor: pointer;
  }

  .agent-coordination-panel .node circle {
    stroke-width: 2;
    transition: r 0.15s;
  }

  .agent-coordination-panel .node:hover circle {
    stroke: ${THEME.textPrimary};
    stroke-width: 3;
  }

  .agent-coordination-panel .node text {
    fill: ${THEME.textPrimary};
    font-size: 10px;
    font-family: ${THEME.fontMono};
    pointer-events: none;
  }

  .agent-coordination-panel .link {
    stroke-opacity: 0.6;
  }

  .agent-coordination-panel .link.spawned {
    stroke: ${THEME.primaryActive};
    stroke-dasharray: none;
  }

  .agent-coordination-panel .link.dependency {
    stroke: ${THEME.warning};
    stroke-dasharray: 4,2;
  }

  .agent-coordination-panel .link.communication {
    stroke: ${THEME.textMuted};
    stroke-dasharray: 2,2;
  }

  .agent-coordination-panel .legend {
    display: flex;
    gap: 12px;
    margin-top: 12px;
    flex-wrap: wrap;
    font-size: 10px;
    justify-content: center;
  }

  .agent-coordination-panel .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    color: ${THEME.textMuted};
  }

  .agent-coordination-panel .legend-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .agent-coordination-panel .legend-line {
    width: 20px;
    height: 2px;
  }

  .agent-coordination-panel .no-data {
    color: ${THEME.textMuted};
    text-align: center;
    padding: 40px 20px;
    font-size: 14px;
  }

  .agent-coordination-panel .tooltip {
    position: absolute;
    background: ${THEME.bgElevated};
    border: 1px solid ${THEME.primary}55;
    border-radius: 8px;
    padding: 12px 16px;
    font-size: 11px;
    pointer-events: none;
    z-index: 100;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    max-width: 240px;
  }

  .agent-coordination-panel .tooltip-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  .agent-coordination-panel .tooltip-badge {
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 10px;
    text-transform: uppercase;
  }

  .agent-coordination-panel .status-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
  }

  .agent-coordination-panel .controls {
    position: absolute;
    bottom: 12px;
    right: 12px;
    display: flex;
    gap: 4px;
  }

  .agent-coordination-panel .control-btn {
    width: 32px;
    height: 32px;
    background: ${THEME.bgElevated};
    border: 1px solid ${THEME.primary}44;
    border-radius: 6px;
    color: ${THEME.textPrimary};
    font-size: 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
  }

  .agent-coordination-panel .control-btn:hover {
    background: ${THEME.primary}44;
  }
`;

// ============================================================================
// AgentCoordinationPanel Class
// ============================================================================

export class AgentCoordinationPanel {
  private container: HTMLElement | null = null;
  private data: CoordinationResponse | null = null;
  private updateInterval: number | null = null;
  private tooltip: HTMLDivElement | null = null;
  private styleElement: HTMLStyleElement | null = null;
  private simulation: d3.Simulation<SimNode, SimLink> | null = null;

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
    if (!document.getElementById('agent-coordination-styles')) {
      this.styleElement = document.createElement('style');
      this.styleElement.id = 'agent-coordination-styles';
      this.styleElement.textContent = STYLES;
      document.head.appendChild(this.styleElement);
    }
  }

  /**
   * Fetch coordination data
   */
  private async fetchData(): Promise<CoordinationResponse | null> {
    try {
      const response = await fetch('/api/agents/coordination');
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

    // Stop existing simulation
    if (this.simulation) {
      this.simulation.stop();
      this.simulation = null;
    }

    this.container.innerHTML = '';
    this.container.className = 'agent-coordination-panel';

    // Title
    const title = document.createElement('div');
    title.className = 'panel-title';
    title.textContent = 'Agent Coordination';
    this.container.appendChild(title);

    // Fetch data
    this.data = await this.fetchData();

    if (!this.data || (this.data.agents ?? []).length === 0) {
      const noData = document.createElement('div');
      noData.className = 'no-data';
      noData.textContent = 'No agent coordination data available';
      this.container.appendChild(noData);
      return;
    }

    // Stats row
    this.renderStats();

    // Graph container
    const graphContainer = document.createElement('div');
    graphContainer.className = 'graph-container';
    this.container.appendChild(graphContainer);

    // Render force graph
    this.renderGraph(graphContainer);

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
        value: safeStr(safeNum(this.data.meta?.totalAgents), '0'),
        label: 'Total Agents',
        color: THEME.primaryActive,
      },
      {
        value: safeStr(safeNum(this.data.meta?.activeAgents), '0'),
        label: 'Active',
        color: THEME.success,
      },
      {
        value: safeStr(safeNum(this.data.meta?.totalTasks), '0'),
        label: 'Tasks',
        color: THEME.warning,
      },
      {
        value: safeStr(this.data.meta?.topologyType, 'unknown'),
        label: 'Topology',
        color: THEME.cyan,
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
   * Render the force-directed graph
   */
  private renderGraph(graphContainer: HTMLElement): void {
    if (!this.data) return;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'graph-svg');
    graphContainer.appendChild(svg);

    // Create tooltip
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'tooltip';
    this.tooltip.style.display = 'none';
    graphContainer.appendChild(this.tooltip);

    // Controls
    const controls = document.createElement('div');
    controls.className = 'controls';
    controls.innerHTML = `
      <button class="control-btn" data-action="reheat" title="Reheat simulation">R</button>
      <button class="control-btn" data-action="center" title="Center view">C</button>
    `;
    graphContainer.appendChild(controls);

    // Wait for layout then draw
    requestAnimationFrame(() => this.drawGraph(svg, graphContainer, controls));
  }

  /**
   * Draw force-directed graph with D3
   */
  private drawGraph(svg: SVGSVGElement, graphContainer: HTMLElement, controls: HTMLElement): void {
    if (!this.data) return;

    const bounds = graphContainer.getBoundingClientRect();
    const width = bounds.width || 500;
    const height = bounds.height || 400;

    const d3Svg = d3.select(svg)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    // Clear previous
    d3Svg.selectAll('*').remove();

    // Prepare nodes and links for simulation
    const nodes: SimNode[] = this.data.agents.map(a => ({
      ...a,
      x: width / 2 + (Math.random() - 0.5) * 100,
      y: height / 2 + (Math.random() - 0.5) * 100,
    }));

    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    const links: SimLink[] = this.data.links
      .filter(l => nodeMap.has(l.source) && nodeMap.has(l.target))
      .map(l => ({
        source: nodeMap.get(l.source)!,
        target: nodeMap.get(l.target)!,
        type: l.type,
        strength: l.strength,
      }));

    // Create container for zoom
    const container = d3Svg.append('g');

    // Zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => {
        container.attr('transform', event.transform);
      });

    d3Svg.call(zoom);

    // Draw links
    const linkElements = container.append('g')
      .selectAll('line')
      .data(links)
      .enter()
      .append('line')
      .attr('class', d => `link ${d.type}`)
      .attr('stroke-width', d => Math.max(1, d.strength * 3));

    // Draw nodes
    const nodeElements = container.append('g')
      .selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', 'node')
      .call(d3.drag<SVGGElement, SimNode>()
        .on('start', (event, d) => {
          if (!event.active && this.simulation) this.simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active && this.simulation) this.simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        })
      )
      .on('mouseenter', (event, d) => this.showTooltip(event, d))
      .on('mouseleave', () => this.hideTooltip());

    // Node circles
    nodeElements.append('circle')
      .attr('r', d => Math.max(12, 8 + safeNum(d.taskCount) * 2))
      .attr('fill', d => AGENT_COLORS[d.role] || AGENT_COLORS.default)
      .attr('stroke', d => STATUS_COLORS[d.status] || STATUS_COLORS.idle);

    // Node labels
    nodeElements.append('text')
      .attr('dy', d => Math.max(12, 8 + safeNum(d.taskCount) * 2) + 14)
      .attr('text-anchor', 'middle')
      .text(d => this.truncate(safeStr(d.name, 'Agent'), 10));

    // Force simulation
    this.simulation = d3.forceSimulation<SimNode>(nodes)
      .force('link', d3.forceLink<SimNode, SimLink>(links)
        .id(d => d.id)
        .distance(80)
        .strength(d => d.strength * 0.5)
      )
      .force('charge', d3.forceManyBody().strength(-150))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(30))
      .on('tick', () => {
        linkElements
          .attr('x1', d => (d.source as SimNode).x || 0)
          .attr('y1', d => (d.source as SimNode).y || 0)
          .attr('x2', d => (d.target as SimNode).x || 0)
          .attr('y2', d => (d.target as SimNode).y || 0);

        nodeElements.attr('transform', d => `translate(${d.x || 0},${d.y || 0})`);
      });

    // Control buttons
    controls.querySelectorAll('.control-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = (btn as HTMLElement).dataset.action;
        if (action === 'reheat' && this.simulation) {
          this.simulation.alpha(0.5).restart();
        } else if (action === 'center') {
          d3Svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
        }
      });
    });
  }

  /**
   * Show tooltip for an agent
   */
  private showTooltip(event: MouseEvent, agent: SimNode): void {
    if (!this.tooltip) return;

    const roleColor = AGENT_COLORS[agent.role] || AGENT_COLORS.default;
    const statusColor = STATUS_COLORS[agent.status] || STATUS_COLORS.idle;
    const uptime = this.formatDuration(Date.now() - safeNum(agent.spawnTime, Date.now()));

    this.tooltip.innerHTML = `
      <div class="tooltip-header">
        <span class="tooltip-badge" style="background:${roleColor}33;color:${roleColor}">${safeStr(agent.role, 'unknown')}</span>
        <span class="status-indicator" style="background:${statusColor}"></span>
        <span style="color:${statusColor};font-size:10px;">${safeStr(agent.status, 'unknown')}</span>
      </div>
      <div style="color:${THEME.textPrimary};font-weight:600;margin-bottom:6px;">${safeStr(agent.name, 'Agent')}</div>
      <div style="color:${THEME.textMuted};font-size:10px;">
        Tasks: ${safeNum(agent.taskCount)}
      </div>
      <div style="color:${THEME.textMuted};font-size:10px;">
        Uptime: ${uptime}
      </div>
      ${agent.parentId ? `
        <div style="color:${THEME.textMuted};font-size:10px;">
          Parent: ${safeStr(agent.parentId, '-')}
        </div>
      ` : ''}
    `;

    const containerRect = this.tooltip.parentElement?.getBoundingClientRect();
    if (!containerRect) return;

    this.tooltip.style.display = 'block';
    this.tooltip.style.left = `${event.clientX - containerRect.left + 15}px`;
    this.tooltip.style.top = `${event.clientY - containerRect.top - 20}px`;
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

    // Role colors
    const roles = ['coordinator', 'coder', 'reviewer', 'tester'];
    roles.forEach(role => {
      const color = AGENT_COLORS[role];
      legend.innerHTML += `
        <div class="legend-item">
          <div class="legend-dot" style="background:${color}"></div>
          <span>${role}</span>
        </div>
      `;
    });

    // Link types
    legend.innerHTML += `
      <div class="legend-item">
        <div class="legend-line" style="background:${THEME.primaryActive}"></div>
        <span>Spawned</span>
      </div>
      <div class="legend-item">
        <div class="legend-line" style="background:${THEME.warning};border-top:2px dashed ${THEME.warning};height:0"></div>
        <span>Dependency</span>
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
   * Format duration in human readable
   */
  private formatDuration(ms: number): string {
    const safe = safeNum(ms);
    if (safe < 60000) return '<1m';
    if (safe < 3600000) return `${Math.floor(safe / 60000)}m`;
    if (safe < 86400000) return `${Math.floor(safe / 3600000)}h`;
    return `${Math.floor(safe / 86400000)}d`;
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
    if (this.simulation) {
      this.simulation.stop();
      this.simulation = null;
    }
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
