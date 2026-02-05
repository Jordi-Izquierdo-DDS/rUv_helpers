/**
 * RewardPotentialField - Grid-based reward potential field for memory graph visualization
 *
 * Creates "gravity wells" around high-reward memory clusters by computing a
 * scalar potential field from node reward data (qValue, rewardSum, effectiveness).
 * Each node deposits a Gaussian blob onto the grid, producing a smooth
 * landscape that can be sampled and differentiated for trajectory deflection.
 *
 * The field is normalized to [0, 1] after accumulation so that downstream
 * consumers (surface renderer, geodesic integrator) work in a consistent range.
 */

import type { GraphNode } from '../config/Constants';

// ============================================================================
// Constants
// ============================================================================

/** Default spread radius for Gaussian blobs (in world-space units). */
const DEFAULT_SIGMA = 50;

/** Padding factor applied to node bounding box so the field extends beyond node extremes. */
const BOUNDS_PADDING = 1.2;

/** Small epsilon to prevent division by zero. */
const EPS = 1e-10;

// ============================================================================
// RewardPotentialField
// ============================================================================

export class RewardPotentialField {
  private grid: Float32Array;
  private gridSize: number;
  private bounds: { minX: number; maxX: number; minY: number; maxY: number };

  constructor(gridSize: number = 128) {
    this.gridSize = gridSize;
    this.grid = new Float32Array(gridSize * gridSize);
    this.bounds = { minX: -500, maxX: 500, minY: -500, maxY: 500 };
  }

  // --------------------------------------------------------------------------
  // Field computation
  // --------------------------------------------------------------------------

  /**
   * Build the potential field from nodes that carry reward data.
   *
   * For each node with qValue, rewardSum, or effectiveness > 0 the method
   * accumulates a Gaussian blob centered at the node position:
   *
   *   phi(x, y) += reward * exp( -((x - nx)^2 + (y - ny)^2) / (2 * sigma^2) )
   *
   * After accumulation the field is normalized to [0, 1].
   *
   * @param nodes - Array of graph nodes (only those with reward data contribute)
   */
  computeField(nodes: GraphNode[]): void {
    // Update bounds to enclose all node positions
    this.updateBounds(nodes);

    const { minX, maxX, minY, maxY } = this.bounds;
    const size = this.gridSize;
    const cellW = (maxX - minX) / (size - 1);
    const cellH = (maxY - minY) / (size - 1);
    const sigma = DEFAULT_SIGMA;
    const twoSigmaSq = 2 * sigma * sigma;

    // Clear grid
    this.grid.fill(0);

    // Accumulate Gaussian blobs
    for (const node of nodes) {
      const reward = this.getNodeReward(node);
      if (reward <= 0) continue;

      const nx = node.x ?? 0;
      const ny = node.y ?? 0;

      // Compute the grid-space influence radius (3 sigma cutoff)
      const influencePixels = Math.ceil((3 * sigma) / Math.min(cellW, cellH));

      // Map node position to grid coordinates
      const gx = (nx - minX) / cellW;
      const gy = (ny - minY) / cellH;

      const iMin = Math.max(0, Math.floor(gx) - influencePixels);
      const iMax = Math.min(size - 1, Math.ceil(gx) + influencePixels);
      const jMin = Math.max(0, Math.floor(gy) - influencePixels);
      const jMax = Math.min(size - 1, Math.ceil(gy) + influencePixels);

      for (let j = jMin; j <= jMax; j++) {
        const worldY = minY + j * cellH;
        const dy = worldY - ny;
        const dySq = dy * dy;

        for (let i = iMin; i <= iMax; i++) {
          const worldX = minX + i * cellW;
          const dx = worldX - nx;
          const distSq = dx * dx + dySq;

          const value = reward * Math.exp(-distSq / twoSigmaSq);
          this.grid[j * size + i] += value;
        }
      }
    }

    // Normalize to [0, 1]
    let maxVal = 0;
    for (let k = 0; k < this.grid.length; k++) {
      if (this.grid[k] > maxVal) maxVal = this.grid[k];
    }

    if (maxVal > EPS) {
      const invMax = 1 / maxVal;
      for (let k = 0; k < this.grid.length; k++) {
        this.grid[k] *= invMax;
      }
    }
  }

  // --------------------------------------------------------------------------
  // Sampling
  // --------------------------------------------------------------------------

  /**
   * Sample the potential value at an arbitrary world-space position using
   * bilinear interpolation between the four nearest grid cells.
   *
   * @param x - World-space X coordinate
   * @param y - World-space Y coordinate
   * @returns Potential value in [0, 1], or 0 if outside bounds
   */
  sample(x: number, y: number): number {
    const { minX, maxX, minY, maxY } = this.bounds;
    const size = this.gridSize;

    // Map to continuous grid coordinates
    const gx = ((x - minX) / (maxX - minX)) * (size - 1);
    const gy = ((y - minY) / (maxY - minY)) * (size - 1);

    // Outside the grid
    if (gx < 0 || gx >= size - 1 || gy < 0 || gy >= size - 1) {
      return 0;
    }

    // Bilinear interpolation
    const ix = Math.floor(gx);
    const iy = Math.floor(gy);
    const fx = gx - ix;
    const fy = gy - iy;

    const v00 = this.grid[iy * size + ix];
    const v10 = this.grid[iy * size + ix + 1];
    const v01 = this.grid[(iy + 1) * size + ix];
    const v11 = this.grid[(iy + 1) * size + ix + 1];

    return (
      v00 * (1 - fx) * (1 - fy) +
      v10 * fx * (1 - fy) +
      v01 * (1 - fx) * fy +
      v11 * fx * fy
    );
  }

  /**
   * Compute the gradient of the potential field at a world-space position
   * using central finite differences on the bilinear-interpolated field.
   *
   * The gradient points in the direction of steepest ascent (toward higher
   * potential / higher reward regions).
   *
   * @param x - World-space X coordinate
   * @param y - World-space Y coordinate
   * @returns [dPhi/dx, dPhi/dy] gradient vector
   */
  gradient(x: number, y: number): [number, number] {
    const { minX, maxX, minY, maxY } = this.bounds;
    const size = this.gridSize;

    // Step size: one half grid cell in world space
    const hx = ((maxX - minX) / (size - 1)) * 0.5;
    const hy = ((maxY - minY) / (size - 1)) * 0.5;

    const dPhiDx = (this.sample(x + hx, y) - this.sample(x - hx, y)) / (2 * hx);
    const dPhiDy = (this.sample(x, y + hy) - this.sample(x, y - hy)) / (2 * hy);

    return [dPhiDx, dPhiDy];
  }

  // --------------------------------------------------------------------------
  // Accessors
  // --------------------------------------------------------------------------

  /** Get the raw grid data (e.g. for GPU upload as a texture). */
  getGridData(): Float32Array {
    return this.grid;
  }

  /** Get the grid resolution (number of cells along each axis). */
  getGridSize(): number {
    return this.gridSize;
  }

  /** Get the world-space bounding box of the field. */
  getBounds(): { minX: number; maxX: number; minY: number; maxY: number } {
    return { ...this.bounds };
  }

  // --------------------------------------------------------------------------
  // Bounds management
  // --------------------------------------------------------------------------

  /**
   * Recompute the world-space bounding box to enclose all node positions,
   * with a padding factor so the field extends beyond the point cloud.
   *
   * @param nodes - Current array of graph nodes
   */
  updateBounds(nodes: GraphNode[]): void {
    if (nodes.length === 0) return;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const node of nodes) {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    // Ensure non-degenerate bounds
    if (maxX - minX < 1) {
      minX -= 500;
      maxX += 500;
    }
    if (maxY - minY < 1) {
      minY -= 500;
      maxY += 500;
    }

    // Apply padding
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const halfW = ((maxX - minX) / 2) * BOUNDS_PADDING;
    const halfH = ((maxY - minY) / 2) * BOUNDS_PADDING;

    this.bounds = {
      minX: cx - halfW,
      maxX: cx + halfW,
      minY: cy - halfH,
      maxY: cy + halfH,
    };
  }

  // --------------------------------------------------------------------------
  // Internal helpers
  // --------------------------------------------------------------------------

  /**
   * Extract a scalar reward value from a graph node.
   * Uses qValue, rewardSum, or effectiveness (whichever is positive).
   */
  private getNodeReward(node: GraphNode): number {
    if (node.qValue !== undefined && node.qValue > 0) return node.qValue;
    if (node.rewardSum !== undefined && node.rewardSum > 0) return node.rewardSum;
    if (node.effectiveness !== undefined && node.effectiveness > 0) return node.effectiveness;
    return 0;
  }
}

export default RewardPotentialField;
