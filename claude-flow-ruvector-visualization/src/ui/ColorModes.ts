/**
 * ColorModes - Node coloring strategies
 *
 * Implements 20+ color modes for different visualization needs.
 * Each mode computes colors based on node properties.
 */

import {
  ColorMode,
  GraphNode,
  NodeType,
  COLORS,
  hexToRGB,
  NODE_SOURCE_COLORS
} from '../config/Constants';

export type ColorRGB = [number, number, number];

export interface ColorModeResult {
  colors: Float32Array;
  legend?: Map<string, ColorRGB>;
}

export interface ColorModeConfig {
  mode: ColorMode;
  singleColor?: number;
  gradientStart?: number;
  gradientEnd?: number;
  namespace?: string;
  categoryColors?: Map<string, number>;
}

// Color palettes for categorical data
const CATEGORY_PALETTES: ColorRGB[][] = [
  // Palette 1: Purple-teal
  [[0.42, 0.18, 0.71], [0.55, 0.31, 0.85], [0.72, 0.58, 0.96], [0.06, 0.73, 0.51]],
  // Palette 2: Warm
  [[0.96, 0.26, 0.21], [1.0, 0.6, 0.0], [1.0, 0.76, 0.03], [0.55, 0.76, 0.29]],
  // Palette 3: Cool
  [[0.13, 0.59, 0.95], [0.0, 0.74, 0.83], [0.0, 0.59, 0.53], [0.4, 0.23, 0.72]],
  // Palette 4: Earth
  [[0.55, 0.27, 0.07], [0.71, 0.49, 0.26], [0.8, 0.68, 0.53], [0.44, 0.5, 0.44]]
];

/**
 * ColorModeManager - Computes node colors based on selected mode
 */
export class ColorModeManager {
  private currentMode: ColorMode = ColorMode.SOURCE_TYPE;
  private config: ColorModeConfig = { mode: ColorMode.SOURCE_TYPE };
  private categoryColorMap: Map<string, ColorRGB> = new Map();
  private paletteIndex = 0;

  constructor(config?: Partial<ColorModeConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
      this.currentMode = config.mode || ColorMode.SOURCE_TYPE;
    }
  }

  /**
   * Set current color mode
   */
  setMode(mode: ColorMode, options?: Partial<ColorModeConfig>): void {
    this.currentMode = mode;
    if (options) {
      this.config = { ...this.config, ...options, mode };
    }
    // Reset category map when mode changes
    this.categoryColorMap.clear();
  }

  /**
   * Get current mode
   */
  getMode(): ColorMode {
    return this.currentMode;
  }

  /**
   * Compute colors for all nodes
   */
  computeColors(nodes: GraphNode[]): ColorModeResult {
    const colors = new Float32Array(nodes.length * 3);
    const legend = new Map<string, ColorRGB>();

    switch (this.currentMode) {
      case ColorMode.SOURCE_TYPE:
        this.colorBySourceType(nodes, colors, legend);
        break;
      case ColorMode.NAMESPACE:
        this.colorByNamespace(nodes, colors, legend, false);
        break;
      case ColorMode.NAMESPACE_FULL:
        this.colorByNamespace(nodes, colors, legend, true);
        break;
      case ColorMode.SINGLE:
        this.colorSingle(nodes, colors);
        break;
      case ColorMode.DB_SOURCE:
        this.colorByDbSource(nodes, colors, legend);
        break;
      case ColorMode.CONNECTIVITY:
        this.colorByConnectivity(nodes, colors, legend);
        break;
      case ColorMode.TIME:
        this.colorByTime(nodes, colors, legend);
        break;
      case ColorMode.RECENCY:
        this.colorByRecency(nodes, colors, legend);
        break;
      case ColorMode.RATE:
        this.colorByRate(nodes, colors, legend);
        break;
      case ColorMode.CHAR_LENGTH:
        this.colorByCharLength(nodes, colors, legend);
        break;
      case ColorMode.WORD_COUNT:
        this.colorByWordCount(nodes, colors, legend);
        break;
      case ColorMode.CONTENT_TYPE:
        this.colorByContentType(nodes, colors, legend);
        break;
      case ColorMode.NS_DEPTH:
        this.colorByNsDepth(nodes, colors, legend);
        break;
      case ColorMode.KEY_PREFIX:
        this.colorByKeyPrefix(nodes, colors, legend);
        break;
      case ColorMode.HAS_EMBEDDING:
        this.colorByHasEmbedding(nodes, colors, legend);
        break;
      case ColorMode.CROSS_LINK_TYPE:
        this.colorByCrossLinkType(nodes, colors, legend);
        break;
      case ColorMode.Q_VALUE:
        this.colorByQValue(nodes, colors, legend);
        break;
      case ColorMode.VISITS:
        this.colorByVisits(nodes, colors, legend);
        break;
      case ColorMode.STATE:
        this.colorByState(nodes, colors, legend);
        break;
      case ColorMode.ACTION:
        this.colorByAction(nodes, colors, legend);
        break;
      case ColorMode.SUCCESS:
        this.colorBySuccess(nodes, colors, legend);
        break;
      case ColorMode.QUALITY:
        this.colorByQuality(nodes, colors, legend);
        break;
      case ColorMode.AGENT:
        this.colorByAgent(nodes, colors, legend);
        break;
      case ColorMode.MODEL:
        this.colorByModel(nodes, colors, legend);
        break;
      case ColorMode.TOPOLOGY_ROLE:
        this.colorByTopologyRole(nodes, colors, legend);
        break;
      default:
        this.colorBySourceType(nodes, colors, legend);
    }

    return { colors, legend };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COLOR MODE IMPLEMENTATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  private colorBySourceType(
    nodes: GraphNode[],
    colors: Float32Array,
    legend: Map<string, ColorRGB>
  ): void {
    // Build sourceColors from SSOT (NODE_SOURCE_COLORS) - includes all 8 types
    const sourceColors: Record<string, ColorRGB> = {};
    for (const [source, colorHex] of Object.entries(NODE_SOURCE_COLORS)) {
      if (!source.includes('_success') && !source.includes('_failed')) {
        sourceColors[source] = hexToRGB(colorHex);
      }
    }

    for (const [source, color] of Object.entries(sourceColors)) {
      legend.set(source, color);
    }

    for (let i = 0; i < nodes.length; i++) {
      const color = sourceColors[nodes[i].source] || [0.4, 0.4, 0.4];
      colors[i * 3] = color[0];
      colors[i * 3 + 1] = color[1];
      colors[i * 3 + 2] = color[2];
    }
  }

  private colorByNamespace(
    nodes: GraphNode[],
    colors: Float32Array,
    legend: Map<string, ColorRGB>,
    fullPath: boolean
  ): void {
    // Collect unique namespaces
    const namespaces = new Set<string>();
    for (const node of nodes) {
      const ns = this.getNamespace(node, fullPath);
      namespaces.add(ns);
    }

    // Assign colors to namespaces
    const nsArray = Array.from(namespaces).sort();
    for (let i = 0; i < nsArray.length; i++) {
      const color = this.getCategoryColor(nsArray[i], i);
      legend.set(nsArray[i], color);
    }

    // Apply colors
    for (let i = 0; i < nodes.length; i++) {
      const ns = this.getNamespace(nodes[i], fullPath);
      const color = legend.get(ns) || [0.4, 0.4, 0.4];
      colors[i * 3] = color[0];
      colors[i * 3 + 1] = color[1];
      colors[i * 3 + 2] = color[2];
    }
  }

  private colorSingle(nodes: GraphNode[], colors: Float32Array): void {
    const color = hexToRGB(this.config.singleColor || NODE_SOURCE_COLORS.memory);
    for (let i = 0; i < nodes.length; i++) {
      colors[i * 3] = color[0];
      colors[i * 3 + 1] = color[1];
      colors[i * 3 + 2] = color[2];
    }
  }

  private colorByDbSource(
    nodes: GraphNode[],
    colors: Float32Array,
    legend: Map<string, ColorRGB>
  ): void {
    // Group by database source (e.g., memories, patterns, trajectories)
    const sources = new Set<string>();
    for (const node of nodes) {
      sources.add(node.source);
    }

    const srcArray = Array.from(sources).sort();
    for (let i = 0; i < srcArray.length; i++) {
      const color = this.getCategoryColor(srcArray[i], i);
      legend.set(srcArray[i], color);
    }

    for (let i = 0; i < nodes.length; i++) {
      const color = legend.get(nodes[i].source) || [0.4, 0.4, 0.4];
      colors[i * 3] = color[0];
      colors[i * 3 + 1] = color[1];
      colors[i * 3 + 2] = color[2];
    }
  }

  private colorByConnectivity(
    nodes: GraphNode[],
    colors: Float32Array,
    legend: Map<string, ColorRGB>
  ): void {
    // Find min/max connectivity
    let minConn = Infinity, maxConn = -Infinity;
    for (const node of nodes) {
      const conn = node.connectionCount ?? 0;
      minConn = Math.min(minConn, conn);
      maxConn = Math.max(maxConn, conn);
    }

    legend.set('Low', [0.2, 0.2, 0.6]);
    legend.set('High', [1.0, 0.4, 0.2]);

    const range = maxConn - minConn || 1;
    for (let i = 0; i < nodes.length; i++) {
      const conn = nodes[i].connectionCount ?? 0;
      const t = (conn - minConn) / range;
      const color = this.gradient(t, [0.2, 0.2, 0.6], [1.0, 0.4, 0.2]);
      colors[i * 3] = color[0];
      colors[i * 3 + 1] = color[1];
      colors[i * 3 + 2] = color[2];
    }
  }

  private colorByTime(
    nodes: GraphNode[],
    colors: Float32Array,
    legend: Map<string, ColorRGB>
  ): void {
    // Find time range
    let minTime = Infinity, maxTime = -Infinity;
    for (const node of nodes) {
      if (node.timestamp != null) {
        minTime = Math.min(minTime, node.timestamp);
        maxTime = Math.max(maxTime, node.timestamp);
      }
    }

    legend.set('Oldest', [0.4, 0.2, 0.6]);
    legend.set('Newest', [0.2, 0.8, 0.6]);

    const range = maxTime - minTime || 1;
    for (let i = 0; i < nodes.length; i++) {
      const time = nodes[i].timestamp ?? minTime;
      const t = (time - minTime) / range;
      const color = this.gradient(t, [0.4, 0.2, 0.6], [0.2, 0.8, 0.6]);
      colors[i * 3] = color[0];
      colors[i * 3 + 1] = color[1];
      colors[i * 3 + 2] = color[2];
    }
  }

  private colorByRecency(
    nodes: GraphNode[],
    colors: Float32Array,
    legend: Map<string, ColorRGB>
  ): void {
    const now = Date.now();
    let maxAge = 0;

    for (const node of nodes) {
      if (node.timestamp != null) {
        const age = now - node.timestamp;
        maxAge = Math.max(maxAge, age);
      }
    }

    legend.set('Recent', [0.0, 0.9, 0.5]);
    legend.set('Old', [0.5, 0.5, 0.5]);

    maxAge = maxAge || 1;
    for (let i = 0; i < nodes.length; i++) {
      const age = nodes[i].timestamp != null ? now - nodes[i].timestamp! : maxAge;
      const t = 1 - (age / maxAge); // Invert so recent is brighter
      const color = this.gradient(t, [0.5, 0.5, 0.5], [0.0, 0.9, 0.5]);
      colors[i * 3] = color[0];
      colors[i * 3 + 1] = color[1];
      colors[i * 3 + 2] = color[2];
    }
  }

  private colorByRate(
    nodes: GraphNode[],
    colors: Float32Array,
    legend: Map<string, ColorRGB>
  ): void {
    // Rate based on visits/time for Q-patterns, or access frequency
    let minRate = Infinity, maxRate = -Infinity;

    for (const node of nodes) {
      const nodeTs = node.timestamp ?? 0;
      const rate = nodeTs ? (node.visits ?? 1) / Math.max(1, Date.now() - nodeTs) : 0;
      minRate = Math.min(minRate, rate);
      maxRate = Math.max(maxRate, rate);
    }

    legend.set('Low Rate', [0.3, 0.3, 0.7]);
    legend.set('High Rate', [0.9, 0.3, 0.3]);

    const range = maxRate - minRate || 1;
    for (let i = 0; i < nodes.length; i++) {
      const nodeTs = nodes[i].timestamp ?? 0;
      const rate = nodeTs ? (nodes[i].visits ?? 1) / Math.max(1, Date.now() - nodeTs) : 0;
      const t = (rate - minRate) / range;
      const color = this.gradient(t, [0.3, 0.3, 0.7], [0.9, 0.3, 0.3]);
      colors[i * 3] = color[0];
      colors[i * 3 + 1] = color[1];
      colors[i * 3 + 2] = color[2];
    }
  }

  private colorByCharLength(
    nodes: GraphNode[],
    colors: Float32Array,
    legend: Map<string, ColorRGB>
  ): void {
    let minLen = Infinity, maxLen = -Infinity;

    for (const node of nodes) {
      const len = (node.preview ?? '').length;
      minLen = Math.min(minLen, len);
      maxLen = Math.max(maxLen, len);
    }

    legend.set('Short', [0.2, 0.6, 0.8]);
    legend.set('Long', [0.8, 0.4, 0.2]);

    const range = maxLen - minLen || 1;
    for (let i = 0; i < nodes.length; i++) {
      const len = (nodes[i].preview ?? '').length;
      const t = (len - minLen) / range;
      const color = this.gradient(t, [0.2, 0.6, 0.8], [0.8, 0.4, 0.2]);
      colors[i * 3] = color[0];
      colors[i * 3 + 1] = color[1];
      colors[i * 3 + 2] = color[2];
    }
  }

  private colorByWordCount(
    nodes: GraphNode[],
    colors: Float32Array,
    legend: Map<string, ColorRGB>
  ): void {
    let minWords = Infinity, maxWords = -Infinity;

    for (const node of nodes) {
      const words = (node.preview ?? '').split(/\s+/).filter(w => w).length;
      minWords = Math.min(minWords, words);
      maxWords = Math.max(maxWords, words);
    }

    legend.set('Few Words', [0.4, 0.7, 0.4]);
    legend.set('Many Words', [0.7, 0.2, 0.5]);

    const range = maxWords - minWords || 1;
    for (let i = 0; i < nodes.length; i++) {
      const words = (nodes[i].preview ?? '').split(/\s+/).filter(w => w).length;
      const t = (words - minWords) / range;
      const color = this.gradient(t, [0.4, 0.7, 0.4], [0.7, 0.2, 0.5]);
      colors[i * 3] = color[0];
      colors[i * 3 + 1] = color[1];
      colors[i * 3 + 2] = color[2];
    }
  }

  private colorByContentType(
    nodes: GraphNode[],
    colors: Float32Array,
    legend: Map<string, ColorRGB>
  ): void {
    // Detect content type from preview (code, prose, list, etc.)
    const types = new Set<string>();

    const getContentType = (preview: string): string => {
      if (!preview) return 'empty';
      if (/^[\s]*[-*]\s/.test(preview)) return 'list';
      if (/function|const|let|var|=>|class\s/.test(preview)) return 'code';
      if (/^\d+\./.test(preview)) return 'numbered';
      if (preview.length < 50) return 'short';
      return 'prose';
    };

    for (const node of nodes) {
      types.add(getContentType(node.preview ?? ''));
    }

    const typeArray = Array.from(types).sort();
    for (let i = 0; i < typeArray.length; i++) {
      const color = this.getCategoryColor(typeArray[i], i);
      legend.set(typeArray[i], color);
    }

    for (let i = 0; i < nodes.length; i++) {
      const type = getContentType(nodes[i].preview ?? '');
      const color = legend.get(type) || [0.4, 0.4, 0.4];
      colors[i * 3] = color[0];
      colors[i * 3 + 1] = color[1];
      colors[i * 3 + 2] = color[2];
    }
  }

  private colorByNsDepth(
    nodes: GraphNode[],
    colors: Float32Array,
    legend: Map<string, ColorRGB>
  ): void {
    let maxDepth = 0;

    const getDepth = (ns: string): number => {
      if (!ns) return 0;
      return (ns.match(/[:/\.]/g) || []).length + 1;
    };

    for (const node of nodes) {
      maxDepth = Math.max(maxDepth, getDepth(node.namespace ?? ''));
    }

    legend.set('Shallow', [0.3, 0.8, 0.4]);
    legend.set('Deep', [0.8, 0.3, 0.5]);

    maxDepth = maxDepth || 1;
    for (let i = 0; i < nodes.length; i++) {
      const depth = getDepth(nodes[i].namespace ?? '');
      const t = depth / maxDepth;
      const color = this.gradient(t, [0.3, 0.8, 0.4], [0.8, 0.3, 0.5]);
      colors[i * 3] = color[0];
      colors[i * 3 + 1] = color[1];
      colors[i * 3 + 2] = color[2];
    }
  }

  private colorByKeyPrefix(
    nodes: GraphNode[],
    colors: Float32Array,
    legend: Map<string, ColorRGB>
  ): void {
    const prefixes = new Set<string>();

    const getPrefix = (id: string | number): string => {
      const str = String(id);
      const match = str.match(/^([a-zA-Z_-]+)/);
      return match ? match[1] : 'numeric';
    };

    for (const node of nodes) {
      prefixes.add(getPrefix(node.id));
    }

    const prefixArray = Array.from(prefixes).sort();
    for (let i = 0; i < prefixArray.length; i++) {
      const color = this.getCategoryColor(prefixArray[i], i);
      legend.set(prefixArray[i], color);
    }

    for (let i = 0; i < nodes.length; i++) {
      const prefix = getPrefix(nodes[i].id);
      const color = legend.get(prefix) || [0.4, 0.4, 0.4];
      colors[i * 3] = color[0];
      colors[i * 3 + 1] = color[1];
      colors[i * 3 + 2] = color[2];
    }
  }

  private colorByHasEmbedding(
    nodes: GraphNode[],
    colors: Float32Array,
    legend: Map<string, ColorRGB>
  ): void {
    const withEmbedding: ColorRGB = [0.2, 0.7, 0.9];
    const withoutEmbedding: ColorRGB = [0.6, 0.6, 0.6];

    legend.set('Has Embedding', withEmbedding);
    legend.set('No Embedding', withoutEmbedding);

    for (let i = 0; i < nodes.length; i++) {
      const color = nodes[i].hasEmbedding ? withEmbedding : withoutEmbedding;
      colors[i * 3] = color[0];
      colors[i * 3 + 1] = color[1];
      colors[i * 3 + 2] = color[2];
    }
  }

  private colorByCrossLinkType(
    nodes: GraphNode[],
    colors: Float32Array,
    legend: Map<string, ColorRGB>
  ): void {
    // Color based on whether node has cross-type connections
    const crossLinked: ColorRGB = [0.9, 0.5, 0.2];
    const sameType: ColorRGB = [0.4, 0.4, 0.7];

    legend.set('Cross-linked', crossLinked);
    legend.set('Same-type', sameType);

    // For now, use connectivity as proxy (high connectivity = likely cross-linked)
    for (let i = 0; i < nodes.length; i++) {
      const conn = nodes[i].connectionCount ?? 0;
      const color = conn > 5 ? crossLinked : sameType;
      colors[i * 3] = color[0];
      colors[i * 3 + 1] = color[1];
      colors[i * 3 + 2] = color[2];
    }
  }

  private colorByQValue(
    nodes: GraphNode[],
    colors: Float32Array,
    legend: Map<string, ColorRGB>
  ): void {
    let minQ = Infinity, maxQ = -Infinity;

    for (const node of nodes) {
      if (node.qValue != null) {
        minQ = Math.min(minQ, node.qValue);
        maxQ = Math.max(maxQ, node.qValue);
      }
    }

    legend.set('Low Q', [0.9, 0.2, 0.2]);
    legend.set('High Q', [0.2, 0.9, 0.4]);

    const range = maxQ - minQ || 1;
    const defaultColor: ColorRGB = [0.5, 0.5, 0.5];

    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].qValue != null) {
        const t = (nodes[i].qValue! - minQ) / range;
        const color = this.gradient(t, [0.9, 0.2, 0.2], [0.2, 0.9, 0.4]);
        colors[i * 3] = color[0];
        colors[i * 3 + 1] = color[1];
        colors[i * 3 + 2] = color[2];
      } else {
        colors[i * 3] = defaultColor[0];
        colors[i * 3 + 1] = defaultColor[1];
        colors[i * 3 + 2] = defaultColor[2];
      }
    }
  }

  private colorByVisits(
    nodes: GraphNode[],
    colors: Float32Array,
    legend: Map<string, ColorRGB>
  ): void {
    let minVisits = Infinity, maxVisits = -Infinity;

    for (const node of nodes) {
      if (node.visits != null) {
        minVisits = Math.min(minVisits, node.visits);
        maxVisits = Math.max(maxVisits, node.visits);
      }
    }

    legend.set('Few Visits', [0.5, 0.5, 0.8]);
    legend.set('Many Visits', [0.9, 0.6, 0.1]);

    const range = maxVisits - minVisits || 1;
    const defaultColor: ColorRGB = [0.5, 0.5, 0.5];

    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].visits != null) {
        const t = (nodes[i].visits! - minVisits) / range;
        const color = this.gradient(t, [0.5, 0.5, 0.8], [0.9, 0.6, 0.1]);
        colors[i * 3] = color[0];
        colors[i * 3 + 1] = color[1];
        colors[i * 3 + 2] = color[2];
      } else {
        colors[i * 3] = defaultColor[0];
        colors[i * 3 + 1] = defaultColor[1];
        colors[i * 3 + 2] = defaultColor[2];
      }
    }
  }

  private colorByState(
    nodes: GraphNode[],
    colors: Float32Array,
    legend: Map<string, ColorRGB>
  ): void {
    const states = new Set<string>();

    for (const node of nodes) {
      if (node.state) {
        states.add(node.state);
      }
    }

    const stateArray = Array.from(states).sort();
    for (let i = 0; i < stateArray.length; i++) {
      const color = this.getCategoryColor(stateArray[i], i);
      legend.set(stateArray[i], color);
    }

    const defaultColor: ColorRGB = [0.5, 0.5, 0.5];
    for (let i = 0; i < nodes.length; i++) {
      const color = nodes[i].state ? (legend.get(nodes[i].state!) || defaultColor) : defaultColor;
      colors[i * 3] = color[0];
      colors[i * 3 + 1] = color[1];
      colors[i * 3 + 2] = color[2];
    }
  }

  private colorByAction(
    nodes: GraphNode[],
    colors: Float32Array,
    legend: Map<string, ColorRGB>
  ): void {
    const actions = new Set<string>();

    for (const node of nodes) {
      if (node.action) {
        actions.add(node.action);
      }
    }

    const actionArray = Array.from(actions).sort();
    for (let i = 0; i < actionArray.length; i++) {
      const color = this.getCategoryColor(actionArray[i], i);
      legend.set(actionArray[i], color);
    }

    const defaultColor: ColorRGB = [0.5, 0.5, 0.5];
    for (let i = 0; i < nodes.length; i++) {
      const color = nodes[i].action ? (legend.get(nodes[i].action!) || defaultColor) : defaultColor;
      colors[i * 3] = color[0];
      colors[i * 3 + 1] = color[1];
      colors[i * 3 + 2] = color[2];
    }
  }

  private colorBySuccess(
    nodes: GraphNode[],
    colors: Float32Array,
    legend: Map<string, ColorRGB>
  ): void {
    const successColor: ColorRGB = hexToRGB(COLORS.status.success);
    const failureColor: ColorRGB = hexToRGB(COLORS.status.failure);
    const neutralColor: ColorRGB = [0.5, 0.5, 0.5];

    legend.set('Success', successColor);
    legend.set('Failure', failureColor);
    legend.set('Unknown', neutralColor);

    for (let i = 0; i < nodes.length; i++) {
      let color: ColorRGB;
      if (nodes[i].success === true) {
        color = successColor;
      } else if (nodes[i].success === false) {
        color = failureColor;
      } else {
        color = neutralColor;
      }
      colors[i * 3] = color[0];
      colors[i * 3 + 1] = color[1];
      colors[i * 3 + 2] = color[2];
    }
  }

  private colorByQuality(
    nodes: GraphNode[],
    colors: Float32Array,
    legend: Map<string, ColorRGB>
  ): void {
    // Quality score based on combination of factors
    const getQuality = (node: GraphNode): number => {
      let score = 0.5;
      if (node.qValue != null) score = Math.max(0, Math.min(1, (node.qValue + 1) / 2));
      if (node.success === true) score = Math.max(score, 0.8);
      if (node.success === false) score = Math.min(score, 0.3);
      return score;
    };

    legend.set('Low Quality', [0.8, 0.3, 0.3]);
    legend.set('High Quality', [0.2, 0.8, 0.4]);

    for (let i = 0; i < nodes.length; i++) {
      const quality = getQuality(nodes[i]);
      const color = this.gradient(quality, [0.8, 0.3, 0.3], [0.2, 0.8, 0.4]);
      colors[i * 3] = color[0];
      colors[i * 3 + 1] = color[1];
      colors[i * 3 + 2] = color[2];
    }
  }

  private colorByAgent(
    nodes: GraphNode[],
    colors: Float32Array,
    legend: Map<string, ColorRGB>
  ): void {
    const agents = new Set<string>();

    for (const node of nodes) {
      if (node.agent) {
        agents.add(node.agent);
      }
    }

    const agentArray = Array.from(agents).sort();
    for (let i = 0; i < agentArray.length; i++) {
      const color = this.getCategoryColor(agentArray[i], i);
      legend.set(agentArray[i], color);
    }

    const defaultColor: ColorRGB = [0.5, 0.5, 0.5];
    for (let i = 0; i < nodes.length; i++) {
      const color = nodes[i].agent ? (legend.get(nodes[i].agent!) || defaultColor) : defaultColor;
      colors[i * 3] = color[0];
      colors[i * 3 + 1] = color[1];
      colors[i * 3 + 2] = color[2];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FIX-010: MODEL AND TOPOLOGY COLOR MODES
  // ═══════════════════════════════════════════════════════════════════════════

  private colorByModel(
    nodes: GraphNode[],
    colors: Float32Array,
    legend: Map<string, ColorRGB>
  ): void {
    // FIX-010: Color by AI model (from Q-pattern state key suffix or agent model)
    const modelColors: Record<string, ColorRGB> = {
      'haiku': [0.3, 0.7, 0.9],     // Light blue
      'sonnet': [0.6, 0.3, 0.9],    // Purple
      'opus': [0.9, 0.6, 0.2],      // Gold
      'unknown': [0.5, 0.5, 0.5]    // Gray
    };

    for (const [model, color] of Object.entries(modelColors)) {
      legend.set(model, color);
    }

    const defaultColor: ColorRGB = [0.5, 0.5, 0.5];

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      // Get model from Q-pattern state suffix or agent model field
      const model = (node as any).model || (node as any).agentModel || 'unknown';
      const color = modelColors[model] || defaultColor;
      colors[i * 3] = color[0];
      colors[i * 3 + 1] = color[1];
      colors[i * 3 + 2] = color[2];
    }
  }

  private colorByTopologyRole(
    nodes: GraphNode[],
    colors: Float32Array,
    legend: Map<string, ColorRGB>
  ): void {
    // FIX-010: Color by topology role (queen/worker/standalone)
    const roleColors: Record<string, ColorRGB> = {
      'queen': [1.0, 0.84, 0.0],     // Gold
      'worker': [0.75, 0.75, 0.75],  // Silver
      'standalone': [0.5, 0.5, 0.5]  // Gray
    };

    for (const [role, color] of Object.entries(roleColors)) {
      legend.set(role, color);
    }

    const defaultColor: ColorRGB = [0.4, 0.4, 0.4];

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const role = (node as any).topologyRole || 'standalone';
      const color = roleColors[role] || defaultColor;
      colors[i * 3] = color[0];
      colors[i * 3 + 1] = color[1];
      colors[i * 3 + 2] = color[2];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITY METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  private getNamespace(node: GraphNode, fullPath: boolean): string {
    const ns = node.namespace || node.source;
    if (fullPath) return ns;
    // Return first segment only
    const parts = ns.split(/[:/\.]/);
    return parts[0] || ns;
  }

  private getCategoryColor(key: string, index: number): ColorRGB {
    // Check if we already have a color for this key
    if (this.categoryColorMap.has(key)) {
      return this.categoryColorMap.get(key)!;
    }

    // Get color from palette
    const palette = CATEGORY_PALETTES[this.paletteIndex % CATEGORY_PALETTES.length];
    const color = palette[index % palette.length];

    // Vary the color slightly for keys beyond palette size
    const variation = Math.floor(index / palette.length) * 0.1;
    const variedColor: ColorRGB = [
      Math.min(1, color[0] + variation),
      Math.min(1, color[1] - variation * 0.5),
      Math.min(1, color[2] + variation * 0.3)
    ];

    this.categoryColorMap.set(key, variedColor);
    return variedColor;
  }

  private gradient(t: number, from: ColorRGB, to: ColorRGB): ColorRGB {
    return [
      from[0] + (to[0] - from[0]) * t,
      from[1] + (to[1] - from[1]) * t,
      from[2] + (to[2] - from[2]) * t
    ];
  }

  /**
   * Get available color modes for a given node type
   */
  static getModesForType(nodeType?: NodeType): ColorMode[] {
    const common = [
      ColorMode.SOURCE_TYPE,
      ColorMode.NAMESPACE,
      ColorMode.NAMESPACE_FULL,
      ColorMode.SINGLE,
      ColorMode.DB_SOURCE,
      ColorMode.CONNECTIVITY,
      ColorMode.TIME,
      ColorMode.RECENCY,
      ColorMode.CHAR_LENGTH,
      ColorMode.WORD_COUNT,
      ColorMode.CONTENT_TYPE,
      ColorMode.NS_DEPTH,
      ColorMode.KEY_PREFIX,
      ColorMode.HAS_EMBEDDING,
      ColorMode.CROSS_LINK_TYPE
    ];

    const qPatternModes = [
      ColorMode.Q_VALUE,
      ColorMode.VISITS,
      ColorMode.STATE,
      ColorMode.ACTION
    ];

    const trajectoryModes = [
      ColorMode.SUCCESS,
      ColorMode.QUALITY,
      ColorMode.AGENT
    ];

    if (nodeType === NodeType.Q_PATTERN) {
      return [...common, ...qPatternModes];
    }
    if (nodeType === NodeType.TRAJECTORY) {
      return [...common, ...trajectoryModes];
    }

    return [...common, ...qPatternModes, ...trajectoryModes];
  }

  /**
   * Get human-readable name for a color mode
   */
  static getModeName(mode: ColorMode): string {
    const names: Record<ColorMode, string> = {
      [ColorMode.SOURCE_TYPE]: 'node Type',
      [ColorMode.NAMESPACE]: 'Namespace (Top Level)',
      [ColorMode.NAMESPACE_FULL]: 'Namespace (Full Path)',
      [ColorMode.SINGLE]: 'Single Color',
      [ColorMode.DB_SOURCE]: 'Database Source',
      [ColorMode.CONNECTIVITY]: 'Connectivity',
      [ColorMode.TIME]: 'Timestamp',
      [ColorMode.RECENCY]: 'Recency',
      [ColorMode.RATE]: 'Access Rate',
      [ColorMode.CHAR_LENGTH]: 'Character Length',
      [ColorMode.WORD_COUNT]: 'Word Count',
      [ColorMode.CONTENT_TYPE]: 'Content Type',
      [ColorMode.NS_DEPTH]: 'Namespace Depth',
      [ColorMode.KEY_PREFIX]: 'Key Prefix',
      [ColorMode.HAS_EMBEDDING]: 'Has Embedding',
      [ColorMode.CROSS_LINK_TYPE]: 'Cross-Link Type',
      [ColorMode.Q_VALUE]: 'Q-Value',
      [ColorMode.VISITS]: 'Visit Count',
      [ColorMode.STATE]: 'State',
      [ColorMode.ACTION]: 'Action',
      [ColorMode.SUCCESS]: 'Success/Failure',
      [ColorMode.QUALITY]: 'Quality Score',
      [ColorMode.AGENT]: 'Agent',
      [ColorMode.DOMAIN]: 'Domain',
      [ColorMode.MODEL]: 'AI Model (FIX-010)',
      [ColorMode.TOPOLOGY_ROLE]: 'Topology Role (FIX-010)',
      // FIX-016: Foundation RL modes
      [ColorMode.RECALL_COUNT]: 'Recall Count',
      [ColorMode.REWARD_SUM]: 'Reward Sum',
      [ColorMode.EFFECTIVENESS]: 'Effectiveness',
      [ColorMode.LAYER]: 'Foundation Layer',
      [ColorMode.FOUNDATION_DOC]: 'Document Group'
    };
    return names[mode] || mode;
  }
}

export default ColorModeManager;
