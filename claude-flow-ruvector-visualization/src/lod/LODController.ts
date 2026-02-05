/**
 * LODController - Level of Detail management
 *
 * Coordinates between:
 * - ClusterComputer for spatial aggregation
 * - FrustumCuller for visibility
 * - NodeRenderer for rendering
 *
 * Automatically switches between detail levels based on camera zoom.
 */

import * as THREE from 'three';
import { ClusterComputer, type Cluster } from './ClusterComputer';
import { FrustumCuller } from './FrustumCuller';
import type { GraphNode } from '../config/Constants';

export interface LODConfig {
  enabled: boolean;
  // Zoom thresholds for each LOD level
  zoomThresholds: number[];
  // Transition smoothing
  transitionDuration: number;
  // Update frequency
  updateInterval: number;
}

export interface LODState {
  currentLevel: number;
  previousLevel: number;
  transitionProgress: number;
  visibleClusters: Cluster[];
  visibleNodeIndices: Set<number>;
  zoom: number;
}

export type LODChangeCallback = (state: LODState) => void;

export class LODController {
  private config: LODConfig;
  private camera: THREE.PerspectiveCamera;
  private clusterComputer: ClusterComputer;
  private frustumCuller: FrustumCuller<GraphNode>;

  // State
  private state: LODState = {
    currentLevel: 0,
    previousLevel: 0,
    transitionProgress: 1,
    visibleClusters: [],
    visibleNodeIndices: new Set(),
    zoom: 1
  };

  // Nodes reference
  private nodes: GraphNode[] = [];

  // Default camera Z position for zoom calculation
  private defaultCameraZ: number;

  // Callbacks
  private onLevelChange: LODChangeCallback | null = null;
  private onVisibilityChange: ((indices: Set<number>) => void) | null = null;

  // Update tracking
  private lastUpdateTime = 0;
  private isTransitioning = false;
  private transitionStartTime = 0;

  constructor(
    camera: THREE.PerspectiveCamera,
    config?: Partial<LODConfig>
  ) {
    this.camera = camera;
    this.defaultCameraZ = camera.position.z || 2000;

    this.config = {
      enabled: true,
      zoomThresholds: [2, 1, 0.5, 0.25, 0.1],
      transitionDuration: 300,
      updateInterval: 100,
      ...config
    };

    this.clusterComputer = new ClusterComputer({
      levels: this.config.zoomThresholds.length,
      baseCellSize: 100,
      cellMultiplier: 2,
      minNodesPerCluster: 5
    });

    this.frustumCuller = new FrustumCuller<GraphNode>(camera);
  }

  /**
   * Initialize with node data
   */
  initialize(nodes: GraphNode[]): void {
    this.nodes = nodes;

    if (!this.config.enabled) return;

    // Build clusters
    this.clusterComputer.computeClusters(nodes);

    // Build frustum culler index
    const positions = new Float32Array(nodes.length * 3);
    for (let i = 0; i < nodes.length; i++) {
      positions[i * 3] = nodes[i].x ?? 0;
      positions[i * 3 + 1] = nodes[i].y ?? 0;
      positions[i * 3 + 2] = nodes[i].z ?? 0;
    }
    this.frustumCuller.buildIndex(positions, nodes);

    // Initial update
    this.update(true);

    console.log('LODController initialized');
    console.log('Cluster stats:', this.clusterComputer.getStats());
  }

  /**
   * Update LOD state based on camera
   * Returns true if state changed
   */
  update(forceUpdate = false): boolean {
    const now = performance.now();

    // Check update interval
    if (!forceUpdate && now - this.lastUpdateTime < this.config.updateInterval) {
      return this.updateTransition(now);
    }

    this.lastUpdateTime = now;

    // Calculate zoom level
    const zoom = this.calculateZoom();
    this.state.zoom = zoom;

    // Determine LOD level from zoom
    const newLevel = this.getLevelForZoom(zoom);

    // Check if level changed
    if (newLevel !== this.state.currentLevel) {
      this.state.previousLevel = this.state.currentLevel;
      this.state.currentLevel = newLevel;
      this.isTransitioning = true;
      this.transitionStartTime = now;
      this.state.transitionProgress = 0;

      console.log(`LOD: Level changed ${this.state.previousLevel} -> ${newLevel} (zoom: ${zoom.toFixed(2)})`);

      // Notify of level change
      if (this.onLevelChange) {
        this.onLevelChange(this.state);
      }
    }

    // Update frustum culling
    const frustumChanged = this.frustumCuller.update(forceUpdate);

    // Update visible elements
    if (forceUpdate || frustumChanged || this.isTransitioning) {
      this.updateVisibility();
      return true;
    }

    return false;
  }

  /**
   * Update transition animation
   */
  private updateTransition(now: number): boolean {
    if (!this.isTransitioning) return false;

    const elapsed = now - this.transitionStartTime;
    this.state.transitionProgress = Math.min(
      elapsed / this.config.transitionDuration,
      1
    );

    if (this.state.transitionProgress >= 1) {
      this.isTransitioning = false;
      this.state.transitionProgress = 1;
    }

    return true;
  }

  /**
   * Calculate zoom factor from camera position
   */
  private calculateZoom(): number {
    const distance = this.camera.position.length();
    return this.defaultCameraZ / distance;
  }

  /**
   * Get LOD level for a zoom factor
   */
  private getLevelForZoom(zoom: number): number {
    for (let i = 0; i < this.config.zoomThresholds.length; i++) {
      if (zoom >= this.config.zoomThresholds[i]) {
        return i;
      }
    }
    return this.config.zoomThresholds.length - 1;
  }

  /**
   * Update visible nodes and clusters
   */
  private updateVisibility(): void {
    if (!this.config.enabled) {
      // Show all nodes when LOD is disabled
      this.state.visibleNodeIndices.clear();
      for (let i = 0; i < this.nodes.length; i++) {
        this.state.visibleNodeIndices.add(i);
      }
      this.state.visibleClusters = [];
      return;
    }

    const level = this.state.currentLevel;

    // At finest level (0), show individual nodes
    if (level === 0) {
      this.state.visibleClusters = [];
      this.state.visibleNodeIndices = this.frustumCuller.getVisibleIndices();
    } else {
      // At coarser levels, show clusters
      const { clusters, individualNodeIndices } = this.clusterComputer.getVisibleElements(
        this.state.zoom,
        (x, y, z) => {
          const point = new THREE.Vector3(x, y, z);
          // Simple distance-based visibility check
          // Could be replaced with actual frustum check
          const dist = point.distanceTo(this.camera.position);
          return dist < this.defaultCameraZ * 3;
        }
      );

      this.state.visibleClusters = clusters;
      this.state.visibleNodeIndices = new Set(individualNodeIndices);
    }

    // Notify of visibility change
    if (this.onVisibilityChange) {
      this.onVisibilityChange(this.state.visibleNodeIndices);
    }
  }

  /**
   * Get current LOD state
   */
  getState(): LODState {
    return { ...this.state };
  }

  /**
   * Get visible node indices
   */
  getVisibleNodeIndices(): Set<number> {
    return this.state.visibleNodeIndices;
  }

  /**
   * Get visible clusters
   */
  getVisibleClusters(): Cluster[] {
    return this.state.visibleClusters;
  }

  /**
   * Get current LOD level
   */
  getCurrentLevel(): number {
    return this.state.currentLevel;
  }

  /**
   * Get transition progress (0-1)
   */
  getTransitionProgress(): number {
    return this.state.transitionProgress;
  }

  /**
   * Register callbacks
   */
  onLODChange(callback: LODChangeCallback): void {
    this.onLevelChange = callback;
  }

  onVisibilityUpdate(callback: (indices: Set<number>) => void): void {
    this.onVisibilityChange = callback;
  }

  /**
   * Enable/disable LOD
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;

    if (!enabled) {
      // Reset to show all nodes
      this.state.currentLevel = 0;
      this.state.visibleClusters = [];
      this.state.visibleNodeIndices.clear();
      for (let i = 0; i < this.nodes.length; i++) {
        this.state.visibleNodeIndices.add(i);
      }
    }
  }

  /**
   * Get cluster computer reference
   */
  getClusterComputer(): ClusterComputer {
    return this.clusterComputer;
  }

  /**
   * Get frustum culler reference
   */
  getFrustumCuller(): FrustumCuller<GraphNode> {
    return this.frustumCuller;
  }

  /**
   * Get statistics
   */
  getStats(): {
    currentLevel: number;
    zoom: number;
    visibleNodes: number;
    visibleClusters: number;
    totalNodes: number;
    clusterStats: ReturnType<ClusterComputer['getStats']>;
    cullingStats: ReturnType<FrustumCuller<GraphNode>['getStats']>;
  } {
    return {
      currentLevel: this.state.currentLevel,
      zoom: this.state.zoom,
      visibleNodes: this.state.visibleNodeIndices.size,
      visibleClusters: this.state.visibleClusters.length,
      totalNodes: this.nodes.length,
      clusterStats: this.clusterComputer.getStats(),
      cullingStats: this.frustumCuller.getStats()
    };
  }

  /**
   * Dispose
   */
  dispose(): void {
    this.clusterComputer.clear();
    this.frustumCuller.dispose();
    this.nodes = [];
    this.onLevelChange = null;
    this.onVisibilityChange = null;
  }
}
