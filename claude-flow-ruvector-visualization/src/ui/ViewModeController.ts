/**
 * ViewModeController - Manages 2D/2.5D/3D view modes
 *
 * Modes:
 * - 2D: Flat view, all nodes at Z=0
 * - 2.5D: Temporal layers based on date ranges (newest front, oldest back)
 * - 3D: Spherical projection with time-based radial distance
 */

import type { GraphNode } from '../config/Constants';

export type ViewMode = '2d' | '2.5d' | '3d' | 'poincare' | 'spacetime' | 'tda' | 'pulse';

export interface ViewModeConfig {
  mode: ViewMode;
  maxDepth: number;           // Maximum Z depth for oldest nodes
  continuous: boolean;        // true = smooth Z, false = discrete layers
  layerCount: number;         // Number of discrete layers (only used if continuous=false)
  opacityFalloff: number;     // How much opacity decreases with depth (0-1)
  sizeFalloff: number;        // How much size decreases with depth (0-1)
  parallaxStrength: number;   // Mouse parallax effect strength
  sphereRadius: number;       // Radius of the 3D sphere (default 800)
}

export interface TemporalBounds {
  minTimestamp: number;
  maxTimestamp: number;
  range: number;
}

export interface SpatialBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  centerX: number;
  centerY: number;
  maxRadius: number;  // Maximum distance from center
}

export type ViewModeChangeCallback = (mode: ViewMode, config: ViewModeConfig) => void;

export class ViewModeController {
  private config: ViewModeConfig;
  private temporalBounds: TemporalBounds | null = null;
  private spatialBounds: SpatialBounds | null = null;
  private nodes: GraphNode[] = [];
  private callbacks: ViewModeChangeCallback[] = [];

  constructor(config?: Partial<ViewModeConfig>) {
    this.config = {
      mode: '2d',
      maxDepth: 1200,         // Z range from 0 to -1200 (increased for better spread)
      continuous: true,       // Smooth continuous Z positioning (time flows)
      layerCount: 12,         // Only used if continuous=false
      opacityFalloff: 0.5,    // Back at 50% opacity
      sizeFalloff: 0.3,       // Back at 70% size
      parallaxStrength: 0.02, // Subtle parallax on mouse move
      sphereRadius: 800,      // Default radius for 3D sphere mode
      ...config
    };
  }

  /**
   * Initialize with graph nodes to extract temporal and spatial bounds
   */
  initialize(nodes: GraphNode[]): void {
    this.nodes = nodes;
    this.calculateTemporalBounds();
    this.calculateSpatialBounds();
  }

  /**
   * Calculate min/max timestamps from nodes
   */
  private calculateTemporalBounds(): void {
    let minTimestamp = Infinity;
    let maxTimestamp = -Infinity;
    let hasTimestamps = false;

    for (const node of this.nodes) {
      if (node.timestamp != null) {
        hasTimestamps = true;
        minTimestamp = Math.min(minTimestamp, node.timestamp);
        maxTimestamp = Math.max(maxTimestamp, node.timestamp);
      }
    }

    if (hasTimestamps && isFinite(minTimestamp)) {
      this.temporalBounds = {
        minTimestamp,
        maxTimestamp,
        range: maxTimestamp - minTimestamp || 1
      };
      console.log(`ViewModeController: Temporal range ${new Date(minTimestamp).toLocaleDateString()} - ${new Date(maxTimestamp).toLocaleDateString()}`);
    } else {
      // No timestamps - use node index as pseudo-time
      this.temporalBounds = {
        minTimestamp: 0,
        maxTimestamp: this.nodes.length,
        range: this.nodes.length || 1
      };
      console.log('ViewModeController: No timestamps found, using node index');
    }
  }

  /**
   * Calculate spatial bounds (UMAP extent) from nodes
   * This is critical for proper 360° spherical distribution
   */
  private calculateSpatialBounds(): void {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const node of this.nodes) {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }

    if (!isFinite(minX)) {
      // No valid positions, use defaults
      this.spatialBounds = {
        minX: -500, maxX: 500,
        minY: -500, maxY: 500,
        centerX: 0, centerY: 0,
        maxRadius: 500
      };
      return;
    }

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // Calculate maximum distance from center
    let maxRadius = 0;
    for (const node of this.nodes) {
      const dx = (node.x ?? 0) - centerX;
      const dy = (node.y ?? 0) - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      maxRadius = Math.max(maxRadius, dist);
    }

    this.spatialBounds = {
      minX, maxX, minY, maxY,
      centerX, centerY,
      maxRadius: maxRadius || 1  // Avoid division by zero
    };

    console.log(`ViewModeController: Spatial bounds X[${minX.toFixed(0)}, ${maxX.toFixed(0)}] Y[${minY.toFixed(0)}, ${maxY.toFixed(0)}] maxRadius=${maxRadius.toFixed(0)}`);
  }

  /**
   * Get current view mode
   */
  getMode(): ViewMode {
    return this.config.mode;
  }

  /**
   * Get full config
   */
  getConfig(): ViewModeConfig {
    return { ...this.config };
  }

  /**
   * Toggle between view modes
   * Standard cycle: 2d -> 2.5d -> 3d -> poincare -> 2d
   * Extended modes (spacetime, tda)
   * are accessed via setMode() directly, not through toggle cycle.
   */
  toggle(): ViewMode {
    const nextMode: Record<ViewMode, ViewMode> = {
      '2d': '2.5d',
      '2.5d': '3d',
      '3d': 'poincare',
      'poincare': '2d',
      // Extended modes cycle back to 2d
      'spacetime': '2d',
      'tda': '2d',
      'pulse': '2d'
    };
    this.setMode(nextMode[this.config.mode]);
    return this.config.mode;
  }

  /**
   * Set view mode
   */
  setMode(mode: ViewMode): void {
    if (this.config.mode === mode) return;

    this.config.mode = mode;
    console.log(`ViewModeController: Switched to ${mode} mode`);

    this.notifyCallbacks();
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ViewModeConfig>): void {
    this.config = { ...this.config, ...config };
    this.notifyCallbacks();
  }

  /**
   * Calculate Z position for a node based on its timestamp
   * Returns 0 in 2D mode, or depth-based position in 2.5D mode
   *
   * Z mapping: newest (front) = 0, oldest (back) = -maxDepth
   * Continuous mode: smooth linear interpolation
   * Discrete mode: quantized to layerCount steps
   */
  getNodeZ(node: GraphNode, _nodeIndex: number): number {
    if (this.config.mode === '2d' || this.config.mode === 'poincare' || this.config.mode === 'pulse') return 0;
    if (!this.temporalBounds) return 0;

    // Get normalized time (0 = oldest, 1 = newest)
    let normalizedTime: number;

    if (node.timestamp != null && node.timestamp > 0) {
      normalizedTime = (node.timestamp - this.temporalBounds.minTimestamp) / this.temporalBounds.range;
      // Clamp to 0-1
      normalizedTime = Math.max(0, Math.min(1, normalizedTime));
    } else {
      // Nodes without timestamp go to the back
      normalizedTime = 0;
    }

    if (this.config.continuous) {
      // Continuous: smooth Z based on time
      // normalizedTime 1 (newest) → Z = 0 (front)
      // normalizedTime 0 (oldest) → Z = -maxDepth (back)
      return -(1 - normalizedTime) * this.config.maxDepth;
    } else {
      // Discrete: quantize to layers for "glass planes" effect
      const layerIndex = Math.min(
        this.config.layerCount - 1,
        Math.floor(normalizedTime * this.config.layerCount)
      );
      return -(this.config.layerCount - 1 - layerIndex) * (this.config.maxDepth / (this.config.layerCount - 1));
    }
  }

  /**
   * Calculate 3D position for a node using polar-to-spherical projection.
   *
   * 3D-NATIVE APPROACH (not adapted from 2D):
   *
   * Uses UMAP's natural polar structure to create a proper sphere:
   * - PHI (longitude): UMAP angle from center → full 360° around sphere
   * - THETA (latitude): UMAP distance from center → pole (center) to equator (edge)
   * - RADIUS: Time-based shells → older at core, newer at surface
   *
   * This preserves UMAP clustering: nodes close in 2D remain close on the sphere.
   * The sphere "grows outward" over time - older memories form the core,
   * newer memories form the outer shell.
   *
   * @param node - The graph node
   * @param _nodeIndex - Index of the node
   * @param umapX - UMAP X coordinate
   * @param umapY - UMAP Y coordinate
   * @param _centerX - Deprecated
   * @param _centerY - Deprecated
   * @param pushToSurface - Push to outer surface for cluster separation
   * @param surfaceStrength - How much to push (0-1)
   */
  getNode3DPosition(
    node: GraphNode,
    _nodeIndex: number,
    umapX: number,
    umapY: number,
    _centerX: number,
    _centerY: number,
    pushToSurface = false,
    surfaceStrength = 1.0
  ): { x: number; y: number; z: number } {
    if (!this.temporalBounds || !this.spatialBounds) {
      return { x: umapX, y: umapY, z: 0 };
    }

    const { sphereRadius } = this.config;
    const { centerX, centerY, maxRadius } = this.spatialBounds;

    // === TEMPORAL: Normalized time (0 = oldest, 1 = newest) ===
    let normalizedTime: number;
    if (node.timestamp != null && node.timestamp > 0) {
      normalizedTime = (node.timestamp - this.temporalBounds.minTimestamp) / this.temporalBounds.range;
      normalizedTime = Math.max(0, Math.min(1, normalizedTime));
    } else {
      normalizedTime = 0;  // No timestamp = oldest
    }

    // === POLAR COORDINATES from UMAP ===
    const dx = umapX - centerX;
    const dy = umapY - centerY;
    const umapDist = Math.sqrt(dx * dx + dy * dy);
    const umapAngle = Math.atan2(dy, dx);  // -π to π

    // Normalize distance (0 = center, 1 = edge)
    const normalizedDist = Math.min(umapDist / (maxRadius || 1), 1);

    // === SPHERICAL MAPPING (FULL SPHERE) ===

    // PHI (longitude): UMAP angle → full 360° around sphere
    // This preserves the angular relationships from UMAP
    const phi = umapAngle;

    // THETA (latitude): UMAP distance → full pole-to-pole coverage
    // Center of UMAP (dist=0) → north pole (theta ≈ 0)
    // Edge of UMAP (dist=1) → south pole (theta ≈ π)
    // This wraps the UMAP "disk" around the full sphere
    //
    // Small margin from exact poles to avoid singularities
    const thetaMin = Math.PI * 0.02;  // Just off north pole
    const thetaMax = Math.PI * 0.98;  // Just off south pole
    const theta = thetaMin + normalizedDist * (thetaMax - thetaMin);

    // === RADIUS: Time-based shells ===
    // OLDER memories at CENTER (small radius)
    // NEWER memories at SURFACE (large radius)
    const coreRadius = sphereRadius * 0.2;      // Oldest memories here
    const surfaceRadius = sphereRadius;          // Newest memories here
    let r = coreRadius + normalizedTime * (surfaceRadius - coreRadius);

    // === CLUSTER SEPARATION (Push to Surface) ===
    if (pushToSurface && surfaceStrength > 0) {
      const targetR = sphereRadius * 1.3;  // 30% beyond surface
      r = r + (targetR - r) * surfaceStrength;
    }

    // === CONVERT TO CARTESIAN (Y-up) ===
    const x = r * Math.sin(theta) * Math.cos(phi);
    const y = r * Math.cos(theta);  // Y is up (pole direction)
    const z = r * Math.sin(theta) * Math.sin(phi);

    return { x, y, z };
  }

  /**
   * Get sphere bounds for camera positioning in 3D mode.
   * Returns the center point and radius of the sphere.
   */
  getSphereBounds(): { center: { x: number; y: number; z: number }; radius: number } {
    return {
      center: { x: 0, y: 0, z: 0 },
      radius: this.config.sphereRadius
    };
  }

  /**
   * Get layer index for a node (0 = oldest, layerCount-1 = newest)
   */
  getNodeLayer(node: GraphNode, _nodeIndex: number): number {
    if (!this.temporalBounds) return 0;

    let normalizedTime: number;
    if (node.timestamp != null && node.timestamp > 0) {
      normalizedTime = (node.timestamp - this.temporalBounds.minTimestamp) / this.temporalBounds.range;
      normalizedTime = Math.max(0, Math.min(1, normalizedTime));
    } else {
      normalizedTime = 0;
    }

    return Math.min(
      this.config.layerCount - 1,
      Math.floor(normalizedTime * this.config.layerCount)
    );
  }

  /**
   * Calculate all node Z positions at once
   * Returns Float32Array of Z values for each node
   */
  calculateAllNodeZ(): Float32Array {
    const zPositions = new Float32Array(this.nodes.length);

    if (this.config.mode === '2d' || this.config.mode === 'poincare' || this.config.mode === 'pulse') {
      // All zeros for flat modes
      return zPositions;
    }

    for (let i = 0; i < this.nodes.length; i++) {
      zPositions[i] = this.getNodeZ(this.nodes[i], i);
    }

    return zPositions;
  }

  /**
   * Get opacity multiplier based on Z depth
   * Used to fade nodes that are further back
   */
  getOpacityForZ(z: number): number {
    if (this.config.mode === '2d' || this.config.mode === 'poincare' || this.config.mode === 'pulse') return 1;

    // z is negative, so normalize: 0 = front, 1 = back
    const depthRatio = Math.abs(z) / this.config.maxDepth;

    // Linear falloff from 1.0 (front) to (1 - opacityFalloff) (back)
    return 1 - (depthRatio * this.config.opacityFalloff);
  }

  /**
   * Get size multiplier based on Z depth
   * Simulates perspective without actual 3D projection
   */
  getSizeForZ(z: number): number {
    if (this.config.mode === '2d' || this.config.mode === 'poincare' || this.config.mode === 'pulse') return 1;

    const depthRatio = Math.abs(z) / this.config.maxDepth;
    return 1 - (depthRatio * this.config.sizeFalloff);
  }

  /**
   * Get layer info for a Z position
   */
  getLayerInfo(z: number): { layer: number; label: string } {
    const depthRatio = Math.abs(z) / this.config.maxDepth;
    const layer = Math.round(depthRatio * (this.config.layerCount - 1));

    const labels = ['Now', 'Recent', 'Earlier', 'Old', 'Oldest'];
    const label = labels[Math.min(layer, labels.length - 1)];

    return { layer, label };
  }

  /**
   * Get temporal bounds
   */
  getTemporalBounds(): TemporalBounds | null {
    return this.temporalBounds;
  }

  /**
   * Get spatial bounds (UMAP extent)
   */
  getSpatialBounds(): SpatialBounds | null {
    return this.spatialBounds;
  }

  /**
   * Update spatial bounds from external positions
   * Use this when positions have changed (e.g., after force simulation)
   */
  updateSpatialBoundsFromPositions(positions: Array<{ x: number; y: number }>): void {
    if (positions.length === 0) return;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const pos of positions) {
      minX = Math.min(minX, pos.x);
      maxX = Math.max(maxX, pos.x);
      minY = Math.min(minY, pos.y);
      maxY = Math.max(maxY, pos.y);
    }

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // Calculate maximum distance from center
    let maxRadius = 0;
    for (const pos of positions) {
      const dx = pos.x - centerX;
      const dy = pos.y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      maxRadius = Math.max(maxRadius, dist);
    }

    this.spatialBounds = {
      minX, maxX, minY, maxY,
      centerX, centerY,
      maxRadius: maxRadius || 1
    };

    console.log(`ViewModeController: Updated spatial bounds X[${minX.toFixed(0)}, ${maxX.toFixed(0)}] Y[${minY.toFixed(0)}, ${maxY.toFixed(0)}] maxRadius=${maxRadius.toFixed(0)}`);
  }

  /**
   * Get layer boundaries for visualization
   * Returns array of { z, timestamp, label } for each layer boundary
   */
  getLayerBoundaries(): Array<{ z: number; timestamp: number; label: string }> {
    if (!this.temporalBounds) return [];

    const boundaries: Array<{ z: number; timestamp: number; label: string }> = [];

    for (let i = 0; i <= this.config.layerCount; i++) {
      const ratio = i / this.config.layerCount;
      const z = -ratio * this.config.maxDepth;
      const timestamp = this.temporalBounds.minTimestamp +
        (1 - ratio) * this.temporalBounds.range;

      const date = new Date(timestamp);
      const label = date.toLocaleDateString();

      boundaries.push({ z, timestamp, label });
    }

    return boundaries;
  }

  /**
   * Register callback for mode changes
   */
  onChange(callback: ViewModeChangeCallback): void {
    this.callbacks.push(callback);
  }

  /**
   * Remove callback
   */
  offChange(callback: ViewModeChangeCallback): void {
    const index = this.callbacks.indexOf(callback);
    if (index >= 0) {
      this.callbacks.splice(index, 1);
    }
  }

  /**
   * Notify all callbacks
   */
  private notifyCallbacks(): void {
    for (const callback of this.callbacks) {
      callback(this.config.mode, this.config);
    }
  }

  /**
   * Dispose
   */
  dispose(): void {
    this.nodes = [];
    this.temporalBounds = null;
    this.spatialBounds = null;
    this.callbacks = [];
  }
}

export default ViewModeController;
