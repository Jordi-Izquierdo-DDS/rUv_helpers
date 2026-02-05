/**
 * SizeModes - Node sizing strategies
 *
 * Implements 12+ size modes for different visualization needs.
 * Each mode computes sizes based on node properties.
 */

import {
  SizeMode,
  GraphNode,
  RENDER_CONFIG
} from '../config/Constants';

export interface SizeModeResult {
  sizes: Float32Array;
  minValue?: number;
  maxValue?: number;
}

export interface SizeModeConfig {
  mode: SizeMode;
  fixedSize?: number;
  minSize?: number;
  maxSize?: number;
  exponent?: number; // For non-linear scaling
}

/**
 * SizeModeManager - Computes node sizes based on selected mode
 */
export class SizeModeManager {
  private currentMode: SizeMode = SizeMode.FIXED;
  private config: SizeModeConfig;

  constructor(config?: Partial<SizeModeConfig>) {
    this.config = {
      mode: SizeMode.FIXED,
      fixedSize: RENDER_CONFIG.node.baseSize,
      minSize: RENDER_CONFIG.node.minSize,
      maxSize: RENDER_CONFIG.node.maxSize,
      exponent: 1,
      ...config
    };
    this.currentMode = this.config.mode;
  }

  /**
   * Set current size mode
   */
  setMode(mode: SizeMode, options?: Partial<SizeModeConfig>): void {
    this.currentMode = mode;
    if (options) {
      this.config = { ...this.config, ...options, mode };
    }
  }

  /**
   * Get current mode
   */
  getMode(): SizeMode {
    return this.currentMode;
  }

  /**
   * Compute sizes for all nodes
   */
  computeSizes(nodes: GraphNode[]): SizeModeResult {
    const sizes = new Float32Array(nodes.length);
    let minValue: number | undefined;
    let maxValue: number | undefined;

    switch (this.currentMode) {
      case SizeMode.FIXED:
        this.sizeFixed(nodes, sizes);
        break;
      case SizeMode.CONNECTIVITY: {
        const result = this.sizeByConnectivity(nodes, sizes);
        minValue = result.min;
        maxValue = result.max;
        break;
      }
      case SizeMode.RATE: {
        const result = this.sizeByRate(nodes, sizes);
        minValue = result.min;
        maxValue = result.max;
        break;
      }
      case SizeMode.CHAR_LENGTH: {
        const result = this.sizeByCharLength(nodes, sizes);
        minValue = result.min;
        maxValue = result.max;
        break;
      }
      case SizeMode.WORD_COUNT: {
        const result = this.sizeByWordCount(nodes, sizes);
        minValue = result.min;
        maxValue = result.max;
        break;
      }
      case SizeMode.RECENCY: {
        const result = this.sizeByRecency(nodes, sizes);
        minValue = result.min;
        maxValue = result.max;
        break;
      }
      case SizeMode.CROSS_LINKS: {
        const result = this.sizeByCrossLinks(nodes, sizes);
        minValue = result.min;
        maxValue = result.max;
        break;
      }
      case SizeMode.NS_DEPTH: {
        const result = this.sizeByNsDepth(nodes, sizes);
        minValue = result.min;
        maxValue = result.max;
        break;
      }
      case SizeMode.Q_VALUE: {
        const result = this.sizeByQValue(nodes, sizes);
        minValue = result.min;
        maxValue = result.max;
        break;
      }
      case SizeMode.VISITS: {
        const result = this.sizeByVisits(nodes, sizes);
        minValue = result.min;
        maxValue = result.max;
        break;
      }
      case SizeMode.SUCCESS: {
        const result = this.sizeBySuccess(nodes, sizes);
        minValue = result.min;
        maxValue = result.max;
        break;
      }
      case SizeMode.QUALITY: {
        const result = this.sizeByQuality(nodes, sizes);
        minValue = result.min;
        maxValue = result.max;
        break;
      }
      default:
        this.sizeFixed(nodes, sizes);
    }

    return { sizes, minValue, maxValue };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SIZE MODE IMPLEMENTATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  private sizeFixed(nodes: GraphNode[], sizes: Float32Array): void {
    const size = this.config.fixedSize ?? RENDER_CONFIG.node.baseSize;
    for (let i = 0; i < nodes.length; i++) {
      sizes[i] = size;
    }
  }

  private sizeByConnectivity(
    nodes: GraphNode[],
    sizes: Float32Array
  ): { min: number; max: number } {
    let min = Infinity, max = -Infinity;

    for (const node of nodes) {
      const conn = node.connectionCount ?? 0;
      min = Math.min(min, conn);
      max = Math.max(max, conn);
    }

    const range = max - min || 1;

    for (let i = 0; i < nodes.length; i++) {
      const conn = nodes[i].connectionCount ?? 0;
      const t = (conn - min) / range;
      sizes[i] = this.mapToSize(t);
    }

    return { min, max };
  }

  private sizeByRate(
    nodes: GraphNode[],
    sizes: Float32Array
  ): { min: number; max: number } {
    const now = Date.now();
    let min = Infinity, max = -Infinity;

    const rates: number[] = [];
    for (const node of nodes) {
      const age = node.timestamp ? (now - node.timestamp) : 0;
      const visits = node.visits ?? 1;
      const rate = age > 0 ? visits / Math.max(1, age / 1000 / 60 / 60) : 0; // per hour
      rates.push(rate);
      min = Math.min(min, rate);
      max = Math.max(max, rate);
    }

    const range = max - min || 1;

    for (let i = 0; i < nodes.length; i++) {
      const t = (rates[i] - min) / range;
      sizes[i] = this.mapToSize(t);
    }

    return { min, max };
  }

  private sizeByCharLength(
    nodes: GraphNode[],
    sizes: Float32Array
  ): { min: number; max: number } {
    let min = Infinity, max = -Infinity;

    for (const node of nodes) {
      const len = (node.preview ?? '').length;
      min = Math.min(min, len);
      max = Math.max(max, len);
    }

    const range = max - min || 1;

    for (let i = 0; i < nodes.length; i++) {
      const len = (nodes[i].preview ?? '').length;
      const t = (len - min) / range;
      sizes[i] = this.mapToSize(t);
    }

    return { min, max };
  }

  private sizeByWordCount(
    nodes: GraphNode[],
    sizes: Float32Array
  ): { min: number; max: number } {
    let min = Infinity, max = -Infinity;

    const counts: number[] = [];
    for (const node of nodes) {
      const words = (node.preview ?? '').split(/\s+/).filter(w => w).length;
      counts.push(words);
      min = Math.min(min, words);
      max = Math.max(max, words);
    }

    const range = max - min || 1;

    for (let i = 0; i < nodes.length; i++) {
      const t = (counts[i] - min) / range;
      sizes[i] = this.mapToSize(t);
    }

    return { min, max };
  }

  private sizeByRecency(
    nodes: GraphNode[],
    sizes: Float32Array
  ): { min: number; max: number } {
    const now = Date.now();
    let minAge = Infinity, maxAge = -Infinity;

    const ages: number[] = [];
    for (const node of nodes) {
      const age = node.timestamp ? (now - node.timestamp) : now; // No timestamp = max age
      ages.push(age);
      minAge = Math.min(minAge, age);
      maxAge = Math.max(maxAge, age);
    }

    const range = maxAge - minAge || 1;

    for (let i = 0; i < nodes.length; i++) {
      // Invert: recent = larger
      const t = 1 - (ages[i] - minAge) / range;
      sizes[i] = this.mapToSize(t);
    }

    return { min: minAge, max: maxAge };
  }

  private sizeByCrossLinks(
    nodes: GraphNode[],
    sizes: Float32Array
  ): { min: number; max: number } {
    // Use connectivity as proxy for cross-links
    // In a full implementation, would count actual cross-type edges
    return this.sizeByConnectivity(nodes, sizes);
  }

  private sizeByNsDepth(
    nodes: GraphNode[],
    sizes: Float32Array
  ): { min: number; max: number } {
    let min = Infinity, max = -Infinity;

    const getDepth = (ns: string): number => {
      if (!ns) return 0;
      return (ns.match(/[:/\.]/g) || []).length + 1;
    };

    const depths: number[] = [];
    for (const node of nodes) {
      const depth = getDepth(node.namespace ?? '');
      depths.push(depth);
      min = Math.min(min, depth);
      max = Math.max(max, depth);
    }

    const range = max - min || 1;

    for (let i = 0; i < nodes.length; i++) {
      // Deeper = smaller (inverse relationship)
      const t = 1 - (depths[i] - min) / range;
      sizes[i] = this.mapToSize(t);
    }

    return { min, max };
  }

  private sizeByQValue(
    nodes: GraphNode[],
    sizes: Float32Array
  ): { min: number; max: number } {
    let min = Infinity, max = -Infinity;
    let hasQValues = false;

    for (const node of nodes) {
      if (node.qValue != null) {
        hasQValues = true;
        min = Math.min(min, node.qValue);
        max = Math.max(max, node.qValue);
      }
    }

    if (!hasQValues) {
      this.sizeFixed(nodes, sizes);
      return { min: 0, max: 0 };
    }

    const range = max - min || 1;
    const defaultSize = this.config.fixedSize ?? RENDER_CONFIG.node.baseSize;

    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].qValue != null) {
        const t = (nodes[i].qValue! - min) / range;
        sizes[i] = this.mapToSize(t);
      } else {
        sizes[i] = defaultSize;
      }
    }

    return { min, max };
  }

  private sizeByVisits(
    nodes: GraphNode[],
    sizes: Float32Array
  ): { min: number; max: number } {
    let min = Infinity, max = -Infinity;
    let hasVisits = false;

    for (const node of nodes) {
      if (node.visits != null) {
        hasVisits = true;
        min = Math.min(min, node.visits);
        max = Math.max(max, node.visits);
      }
    }

    if (!hasVisits) {
      this.sizeFixed(nodes, sizes);
      return { min: 0, max: 0 };
    }

    const range = max - min || 1;
    const defaultSize = this.config.fixedSize ?? RENDER_CONFIG.node.baseSize;

    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].visits != null) {
        // Use logarithmic scaling for visits (often power-law distributed)
        const normalized = (nodes[i].visits! - min) / range;
        const t = Math.log1p(normalized * 9) / Math.log(10); // log scale
        sizes[i] = this.mapToSize(t);
      } else {
        sizes[i] = defaultSize;
      }
    }

    return { min, max };
  }

  private sizeBySuccess(
    nodes: GraphNode[],
    sizes: Float32Array
  ): { min: number; max: number } {
    const successSize = this.config.maxSize ?? RENDER_CONFIG.node.maxSize;
    const failureSize = this.config.minSize ?? RENDER_CONFIG.node.minSize;
    const neutralSize = this.config.fixedSize ?? RENDER_CONFIG.node.baseSize;

    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].success === true) {
        sizes[i] = successSize;
      } else if (nodes[i].success === false) {
        sizes[i] = failureSize;
      } else {
        sizes[i] = neutralSize;
      }
    }

    return { min: failureSize, max: successSize };
  }

  private sizeByQuality(
    nodes: GraphNode[],
    sizes: Float32Array
  ): { min: number; max: number } {
    // Quality = weighted combination of qValue, visits, success
    const getQuality = (node: GraphNode): number => {
      let score = 0.5;
      let factors = 0;

      if (node.qValue != null) {
        score += (node.qValue + 1) / 2; // Normalize -1..1 to 0..1
        factors++;
      }

      if (node.visits != null) {
        const normalizedVisits = Math.min(node.visits / 100, 1);
        score += normalizedVisits;
        factors++;
      }

      if (node.success === true) {
        score += 1;
        factors++;
      } else if (node.success === false) {
        score += 0;
        factors++;
      }

      return factors > 0 ? score / (factors + 1) : score;
    };

    let min = Infinity, max = -Infinity;
    const qualities: number[] = [];

    for (const node of nodes) {
      const quality = getQuality(node);
      qualities.push(quality);
      min = Math.min(min, quality);
      max = Math.max(max, quality);
    }

    const range = max - min || 1;

    for (let i = 0; i < nodes.length; i++) {
      const t = (qualities[i] - min) / range;
      sizes[i] = this.mapToSize(t);
    }

    return { min, max };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITY METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Map normalized value (0-1) to size range
   */
  private mapToSize(t: number): number {
    const minSize = this.config.minSize ?? RENDER_CONFIG.node.minSize;
    const maxSize = this.config.maxSize ?? RENDER_CONFIG.node.maxSize;
    const exponent = this.config.exponent ?? 1;

    // Apply non-linear scaling if exponent != 1
    const scaledT = Math.pow(t, exponent);

    return minSize + scaledT * (maxSize - minSize);
  }

  /**
   * Get configuration
   */
  getConfig(): SizeModeConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(options: Partial<SizeModeConfig>): void {
    this.config = { ...this.config, ...options };
    if (options.mode) {
      this.currentMode = options.mode;
    }
  }

  /**
   * Get available size modes
   */
  static getAllModes(): SizeMode[] {
    return Object.values(SizeMode);
  }

  /**
   * Get human-readable name for a size mode
   */
  static getModeName(mode: SizeMode): string {
    const names: Record<SizeMode, string> = {
      [SizeMode.FIXED]: 'Fixed Size',
      [SizeMode.CONNECTIVITY]: 'Connectivity',
      [SizeMode.RATE]: 'Access Rate',
      [SizeMode.CHAR_LENGTH]: 'Character Length',
      [SizeMode.WORD_COUNT]: 'Word Count',
      [SizeMode.RECENCY]: 'Recency',
      [SizeMode.CROSS_LINKS]: 'Cross-Links',
      [SizeMode.NS_DEPTH]: 'Namespace Depth',
      [SizeMode.Q_VALUE]: 'Q-Value',
      [SizeMode.VISITS]: 'Visit Count',
      [SizeMode.SUCCESS]: 'Success/Failure',
      [SizeMode.QUALITY]: 'Quality Score',
      // FIX-016: Foundation RL modes
      [SizeMode.RECALL_COUNT]: 'Recall Count',
      [SizeMode.EFFECTIVENESS]: 'Effectiveness'
    };
    return names[mode] || mode;
  }

  /**
   * Get description for a size mode
   */
  static getModeDescription(mode: SizeMode): string {
    const descriptions: Record<SizeMode, string> = {
      [SizeMode.FIXED]: 'All nodes have the same size',
      [SizeMode.CONNECTIVITY]: 'Size by number of connections',
      [SizeMode.RATE]: 'Size by access frequency over time',
      [SizeMode.CHAR_LENGTH]: 'Size by content character count',
      [SizeMode.WORD_COUNT]: 'Size by content word count',
      [SizeMode.RECENCY]: 'Recent nodes are larger',
      [SizeMode.CROSS_LINKS]: 'Size by cross-type connections',
      [SizeMode.NS_DEPTH]: 'Shallow namespaces are larger',
      [SizeMode.Q_VALUE]: 'Size by Q-learning value',
      [SizeMode.VISITS]: 'Size by visit count (log scale)',
      [SizeMode.SUCCESS]: 'Successful nodes are larger',
      [SizeMode.QUALITY]: 'Size by combined quality metrics',
      // FIX-016: Foundation RL modes
      [SizeMode.RECALL_COUNT]: 'Size by recall frequency',
      [SizeMode.EFFECTIVENESS]: 'Size by effectiveness ratio'
    };
    return descriptions[mode] || '';
  }
}

export default SizeModeManager;
