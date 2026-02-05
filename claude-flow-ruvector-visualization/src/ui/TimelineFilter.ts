/**
 * TimelineFilter - Temporal filtering for nodes and edges
 *
 * Enables filtering visualization by timestamp ranges,
 * supporting animation and progressive reveal.
 */

import type { GraphNode, GraphEdge } from '../config/Constants';

export interface TimeRange {
  start: number;
  end: number;
}

export interface TimelineState {
  minTimestamp: number;
  maxTimestamp: number;
  currentRange: TimeRange;
  isAnimating: boolean;
  animationSpeed: number;
  visibleNodeCount: number;
  visibleEdgeCount: number;
}

export interface TimelineConfig {
  enabled: boolean;
  animationSpeed: number; // ms per time unit
  snapToEvents: boolean;  // Snap to actual event timestamps
  showFuture: boolean;    // Show nodes without timestamps
  bucketCount: number;    // Number of histogram buckets
}

export type TimelineChangeCallback = (state: TimelineState) => void;

/**
 * TimelineFilter - Manages temporal filtering
 */
export class TimelineFilter {
  private config: TimelineConfig;
  private nodes: GraphNode[] = [];
  private edges: GraphEdge[] = [];

  // Time bounds
  private minTimestamp = 0;
  private maxTimestamp = 0;
  private timestampRange = 0;

  // Current filter state
  private currentRange: TimeRange = { start: 0, end: Infinity };
  private visibleNodes: Set<number> = new Set();
  private visibleEdges: Set<number> = new Set();

  // Animation state
  private isAnimating = false;
  private animationFrame: number | null = null;
  private animationStartTime = 0;

  // Histogram for visualization
  private histogram: number[] = [];

  // Callbacks
  private onChangeCallbacks: TimelineChangeCallback[] = [];

  constructor(config?: Partial<TimelineConfig>) {
    this.config = {
      enabled: true,
      animationSpeed: 100, // 100ms per time unit
      snapToEvents: false,
      showFuture: true,
      bucketCount: 50,
      ...config
    };
  }

  /**
   * Initialize with graph data
   */
  initialize(nodes: GraphNode[], edges: GraphEdge[]): void {
    this.nodes = nodes;
    this.edges = edges;

    // Find timestamp bounds
    this.minTimestamp = Infinity;
    this.maxTimestamp = -Infinity;

    for (const node of nodes) {
      if (node.timestamp != null) {
        this.minTimestamp = Math.min(this.minTimestamp, node.timestamp);
        this.maxTimestamp = Math.max(this.maxTimestamp, node.timestamp);
      }
    }

    // Handle case where no timestamps exist
    if (!isFinite(this.minTimestamp)) {
      this.minTimestamp = 0;
      this.maxTimestamp = 0;
    }

    this.timestampRange = this.maxTimestamp - this.minTimestamp || 1;

    // Initialize range to show all
    this.currentRange = {
      start: this.minTimestamp,
      end: this.maxTimestamp
    };

    // Build histogram
    this.buildHistogram();

    // Update visibility
    this.updateVisibility();

    console.log(`TimelineFilter initialized: ${this.formatTimestamp(this.minTimestamp)} - ${this.formatTimestamp(this.maxTimestamp)}`);
  }

  /**
   * Set time range filter
   */
  setRange(start: number, end: number): void {
    this.currentRange = { start, end };
    this.updateVisibility();
    this.notifyChange();
  }

  /**
   * Set range as percentage (0-1)
   */
  setRangePercent(startPercent: number, endPercent: number): void {
    const start = this.minTimestamp + startPercent * this.timestampRange;
    const end = this.minTimestamp + endPercent * this.timestampRange;
    this.setRange(start, end);
  }

  /**
   * Set end point only (for progressive reveal)
   */
  setEndpoint(timestamp: number): void {
    this.setRange(this.minTimestamp, timestamp);
  }

  /**
   * Set endpoint as percentage
   */
  setEndpointPercent(percent: number): void {
    const end = this.minTimestamp + percent * this.timestampRange;
    this.setRange(this.minTimestamp, end);
  }

  /**
   * Reset to show all
   */
  reset(): void {
    this.setRange(this.minTimestamp, this.maxTimestamp);
  }

  /**
   * Start animation (progressive reveal)
   */
  startAnimation(speed?: number): void {
    if (this.isAnimating) return;

    if (speed != null) {
      this.config.animationSpeed = speed;
    }

    this.isAnimating = true;
    this.animationStartTime = performance.now();
    // Animation starts from current position

    // Reset to beginning
    this.currentRange = {
      start: this.minTimestamp,
      end: this.minTimestamp
    };

    this.animate();
  }

  /**
   * Stop animation
   */
  stopAnimation(): void {
    this.isAnimating = false;
    if (this.animationFrame != null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  /**
   * Pause/resume animation
   */
  toggleAnimation(): void {
    if (this.isAnimating) {
      this.stopAnimation();
    } else {
      this.startAnimation();
    }
  }

  /**
   * Animation loop
   */
  private animate(): void {
    if (!this.isAnimating) return;

    const now = performance.now();
    const elapsed = now - this.animationStartTime;

    // Calculate new end time
    const progress = elapsed / this.config.animationSpeed;
    const newEnd = this.minTimestamp + progress * this.timestampRange;

    if (newEnd >= this.maxTimestamp) {
      // Animation complete
      this.setRange(this.minTimestamp, this.maxTimestamp);
      this.stopAnimation();
      return;
    }

    this.setRange(this.minTimestamp, newEnd);

    this.animationFrame = requestAnimationFrame(() => this.animate());
  }

  /**
   * Update node/edge visibility based on current range
   */
  private updateVisibility(): void {
    this.visibleNodes.clear();
    this.visibleEdges.clear();

    const { start, end } = this.currentRange;

    // Update node visibility
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      const timestamp = node.timestamp;

      if (timestamp == null) {
        // Nodes without timestamp
        if (this.config.showFuture) {
          this.visibleNodes.add(i);
        }
      } else if (timestamp >= start && timestamp <= end) {
        this.visibleNodes.add(i);
      }
    }

    // Update edge visibility (both endpoints must be visible)
    for (let i = 0; i < this.edges.length; i++) {
      const edge = this.edges[i];
      const sourceIdx = typeof edge.source === 'number' ? edge.source : (edge.source as GraphNode).nodeIndex ?? -1;
      const targetIdx = typeof edge.target === 'number' ? edge.target : (edge.target as GraphNode).nodeIndex ?? -1;

      if (this.visibleNodes.has(sourceIdx) && this.visibleNodes.has(targetIdx)) {
        this.visibleEdges.add(i);
      }
    }
  }

  /**
   * Build histogram of node counts over time
   */
  private buildHistogram(): void {
    this.histogram = new Array(this.config.bucketCount).fill(0);

    if (this.timestampRange === 0) return;

    for (const node of this.nodes) {
      if (node.timestamp != null) {
        const normalized = (node.timestamp - this.minTimestamp) / this.timestampRange;
        const bucket = Math.min(
          this.config.bucketCount - 1,
          Math.floor(normalized * this.config.bucketCount)
        );
        this.histogram[bucket]++;
      }
    }
  }

  /**
   * Get visibility flags for nodes
   */
  getNodeVisibility(): Uint8Array {
    const visibility = new Uint8Array(this.nodes.length);
    for (const idx of this.visibleNodes) {
      visibility[idx] = 1;
    }
    return visibility;
  }

  /**
   * Get visibility flags for edges
   */
  getEdgeVisibility(): Uint8Array {
    const visibility = new Uint8Array(this.edges.length);
    for (const idx of this.visibleEdges) {
      visibility[idx] = 1;
    }
    return visibility;
  }

  /**
   * Get visible node indices
   */
  getVisibleNodeIndices(): Set<number> {
    return new Set(this.visibleNodes);
  }

  /**
   * Get visible edge indices
   */
  getVisibleEdgeIndices(): Set<number> {
    return new Set(this.visibleEdges);
  }

  /**
   * Check if a node is visible
   */
  isNodeVisible(index: number): boolean {
    return this.visibleNodes.has(index);
  }

  /**
   * Check if an edge is visible
   */
  isEdgeVisible(index: number): boolean {
    return this.visibleEdges.has(index);
  }

  /**
   * Get current state
   */
  getState(): TimelineState {
    return {
      minTimestamp: this.minTimestamp,
      maxTimestamp: this.maxTimestamp,
      currentRange: { ...this.currentRange },
      isAnimating: this.isAnimating,
      animationSpeed: this.config.animationSpeed,
      visibleNodeCount: this.visibleNodes.size,
      visibleEdgeCount: this.visibleEdges.size
    };
  }

  /**
   * Get histogram data
   */
  getHistogram(): {
    buckets: number[];
    labels: string[];
    maxCount: number;
  } {
    const labels = [];
    const bucketWidth = this.timestampRange / this.config.bucketCount;

    for (let i = 0; i < this.config.bucketCount; i++) {
      const time = this.minTimestamp + i * bucketWidth;
      labels.push(this.formatTimestamp(time));
    }

    return {
      buckets: [...this.histogram],
      labels,
      maxCount: Math.max(...this.histogram)
    };
  }

  /**
   * Get time bounds
   */
  getTimeBounds(): { min: number; max: number } {
    return {
      min: this.minTimestamp,
      max: this.maxTimestamp
    };
  }

  /**
   * Get current range
   */
  getCurrentRange(): TimeRange {
    return { ...this.currentRange };
  }

  /**
   * Get current range as percentage
   */
  getCurrentRangePercent(): { start: number; end: number } {
    return {
      start: (this.currentRange.start - this.minTimestamp) / this.timestampRange,
      end: (this.currentRange.end - this.minTimestamp) / this.timestampRange
    };
  }

  /**
   * Format timestamp for display
   */
  formatTimestamp(timestamp: number): string {
    if (!isFinite(timestamp)) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleString();
  }

  /**
   * Format duration
   */
  formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
    return `${(ms / 3600000).toFixed(1)}h`;
  }

  /**
   * Register change callback
   */
  onChange(callback: TimelineChangeCallback): void {
    this.onChangeCallbacks.push(callback);
  }

  /**
   * Remove change callback
   */
  offChange(callback: TimelineChangeCallback): void {
    const index = this.onChangeCallbacks.indexOf(callback);
    if (index >= 0) {
      this.onChangeCallbacks.splice(index, 1);
    }
  }

  /**
   * Notify change callbacks
   */
  private notifyChange(): void {
    const state = this.getState();
    for (const callback of this.onChangeCallbacks) {
      callback(state);
    }
  }

  /**
   * Enable/disable timeline filtering
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    if (!enabled) {
      // Show all when disabled
      for (let i = 0; i < this.nodes.length; i++) {
        this.visibleNodes.add(i);
      }
      for (let i = 0; i < this.edges.length; i++) {
        this.visibleEdges.add(i);
      }
    } else {
      this.updateVisibility();
    }
    this.notifyChange();
  }

  /**
   * Check if filtering is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Update configuration
   */
  updateConfig(options: Partial<TimelineConfig>): void {
    this.config = { ...this.config, ...options };
    if (options.bucketCount) {
      this.buildHistogram();
    }
    this.updateVisibility();
    this.notifyChange();
  }

  /**
   * Get unique timestamps (for snap-to-events)
   */
  getEventTimestamps(): number[] {
    const timestamps = new Set<number>();
    for (const node of this.nodes) {
      if (node.timestamp != null) {
        timestamps.add(node.timestamp);
      }
    }
    return Array.from(timestamps).sort((a, b) => a - b);
  }

  /**
   * Snap to nearest event timestamp
   */
  snapToNearest(timestamp: number): number {
    const events = this.getEventTimestamps();
    if (events.length === 0) return timestamp;

    let nearest = events[0];
    let minDist = Math.abs(timestamp - nearest);

    for (const event of events) {
      const dist = Math.abs(timestamp - event);
      if (dist < minDist) {
        minDist = dist;
        nearest = event;
      }
    }

    return nearest;
  }

  /**
   * Dispose
   */
  dispose(): void {
    this.stopAnimation();
    this.nodes = [];
    this.edges = [];
    this.visibleNodes.clear();
    this.visibleEdges.clear();
    this.onChangeCallbacks = [];
  }
}

export default TimelineFilter;
