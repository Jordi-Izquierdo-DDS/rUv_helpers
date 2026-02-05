/**
 * FrustumCuller - Visibility culling for large node sets
 *
 * Uses view frustum to determine which nodes are visible,
 * reducing render load by only drawing visible nodes.
 */

import * as THREE from 'three';
import { Octree } from './Octree';

export interface CullingStats {
  totalNodes: number;
  visibleNodes: number;
  culledNodes: number;
  cullingRatio: number;
  lastUpdateMs: number;
}

export class FrustumCuller<T = unknown> {
  private camera: THREE.PerspectiveCamera;
  private frustum: THREE.Frustum;
  private projScreenMatrix: THREE.Matrix4;

  // Octree for spatial queries
  private octree: Octree<T>;

  // Cached visibility state
  private visibleIndices: Set<number> = new Set();
  private lastCameraPosition: THREE.Vector3 = new THREE.Vector3();
  private lastCameraQuaternion: THREE.Quaternion = new THREE.Quaternion();
  private lastCameraFov: number = 0;
  private cameraMovedThreshold = 10;
  private cameraRotatedThreshold = 0.01;

  // Stats
  private stats: CullingStats = {
    totalNodes: 0,
    visibleNodes: 0,
    culledNodes: 0,
    cullingRatio: 0,
    lastUpdateMs: 0
  };

  // Configuration
  private enabled = true;
  private padding = 100; // Extra padding around frustum
  private updateInterval = 100; // ms between updates
  private lastUpdateTime = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.frustum = new THREE.Frustum();
    this.projScreenMatrix = new THREE.Matrix4();
    this.octree = new Octree<T>({
      maxDepth: 8,
      maxItemsPerCell: 32,
      minCellSize: 50
    });
  }

  /**
   * Build spatial index from positions
   */
  buildIndex(positions: Float32Array, data: T[]): void {
    this.octree.build(positions, data);
    this.stats.totalNodes = this.octree.getNodeCount();
    this.visibleIndices.clear();

    console.log(`FrustumCuller: Built index for ${this.stats.totalNodes} nodes`);
    console.log(`Octree stats:`, this.octree.getStats());
  }

  /**
   * Update visibility based on current camera
   * Returns true if visibility changed
   */
  update(forceUpdate = false): boolean {
    if (!this.enabled) {
      // Return all nodes as visible
      if (this.visibleIndices.size !== this.stats.totalNodes) {
        this.visibleIndices.clear();
        for (let i = 0; i < this.stats.totalNodes; i++) {
          this.visibleIndices.add(i);
        }
        return true;
      }
      return false;
    }

    // Check if enough time has passed
    const now = performance.now();
    if (!forceUpdate && now - this.lastUpdateTime < this.updateInterval) {
      return false;
    }

    // Check if camera moved significantly
    if (!forceUpdate && !this.cameraMoved()) {
      return false;
    }

    const startTime = performance.now();

    // Update frustum
    this.camera.updateMatrixWorld();
    this.projScreenMatrix.multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse
    );
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);

    // Expand frustum planes by padding
    // This ensures nodes near edges are rendered
    const expandedFrustum = this.expandFrustum(this.frustum, this.padding);

    // Query octree for visible nodes
    const visibleNodes = this.octree.findInFrustum(expandedFrustum);

    // Update visible indices
    const newVisibleIndices = new Set<number>();
    for (const node of visibleNodes) {
      newVisibleIndices.add(node.index);
    }

    // Check if visibility changed
    let changed = false;
    if (newVisibleIndices.size !== this.visibleIndices.size) {
      changed = true;
    } else {
      for (const index of newVisibleIndices) {
        if (!this.visibleIndices.has(index)) {
          changed = true;
          break;
        }
      }
    }

    this.visibleIndices = newVisibleIndices;

    // Update stats
    this.stats.visibleNodes = this.visibleIndices.size;
    this.stats.culledNodes = this.stats.totalNodes - this.stats.visibleNodes;
    this.stats.cullingRatio = this.stats.totalNodes > 0
      ? this.stats.culledNodes / this.stats.totalNodes
      : 0;
    this.stats.lastUpdateMs = performance.now() - startTime;

    // Save camera state
    this.lastCameraPosition.copy(this.camera.position);
    this.lastCameraQuaternion.copy(this.camera.quaternion);
    this.lastCameraFov = this.camera.fov;
    this.lastUpdateTime = now;

    return changed;
  }

  /**
   * Check if camera moved significantly
   */
  private cameraMoved(): boolean {
    const posDiff = this.camera.position.distanceTo(this.lastCameraPosition);
    if (posDiff > this.cameraMovedThreshold) return true;

    const rotDiff = this.camera.quaternion.angleTo(this.lastCameraQuaternion);
    if (rotDiff > this.cameraRotatedThreshold) return true;

    if (Math.abs(this.camera.fov - this.lastCameraFov) > 0.1) return true;

    return false;
  }

  /**
   * Expand frustum by padding
   */
  private expandFrustum(frustum: THREE.Frustum, _padding: number): THREE.Frustum {
    // For simplicity, we'll use the original frustum
    // A more accurate implementation would adjust plane distances
    return frustum;
  }

  /**
   * Get visible node indices
   */
  getVisibleIndices(): Set<number> {
    return this.visibleIndices;
  }

  /**
   * Check if a specific node is visible
   */
  isVisible(index: number): boolean {
    if (!this.enabled) return true;
    return this.visibleIndices.has(index);
  }

  /**
   * Get nodes within a screen rectangle
   */
  getNodesInScreenRect(
    left: number,
    top: number,
    right: number,
    bottom: number,
    container: HTMLElement
  ): number[] {
    const results: number[] = [];

    // Convert screen rect to normalized device coordinates
    const width = container.clientWidth;
    const height = container.clientHeight;

    const ndcLeft = (left / width) * 2 - 1;
    const ndcRight = (right / width) * 2 - 1;
    const ndcTop = -(top / height) * 2 + 1;
    const ndcBottom = -(bottom / height) * 2 + 1;

    // Project visible nodes and check if in rect
    for (const index of this.visibleIndices) {
      const node = this.octree.getNode(index);
      if (!node) continue;

      const worldPos = new THREE.Vector3(node.x, node.y, node.z);
      const screenPos = worldPos.clone().project(this.camera);

      if (
        screenPos.x >= ndcLeft &&
        screenPos.x <= ndcRight &&
        screenPos.y >= ndcBottom &&
        screenPos.y <= ndcTop &&
        screenPos.z >= -1 &&
        screenPos.z <= 1
      ) {
        results.push(index);
      }
    }

    return results;
  }

  /**
   * Get culling statistics
   */
  getStats(): CullingStats {
    return { ...this.stats };
  }

  /**
   * Enable/disable culling
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      // Mark all nodes as visible
      this.visibleIndices.clear();
      for (let i = 0; i < this.stats.totalNodes; i++) {
        this.visibleIndices.add(i);
      }
    }
  }

  /**
   * Set padding around frustum
   */
  setPadding(padding: number): void {
    this.padding = padding;
  }

  /**
   * Set update interval
   */
  setUpdateInterval(intervalMs: number): void {
    this.updateInterval = intervalMs;
  }

  /**
   * Get octree reference
   */
  getOctree(): Octree<T> {
    return this.octree;
  }

  /**
   * Dispose
   */
  dispose(): void {
    this.octree.clear();
    this.visibleIndices.clear();
  }
}
