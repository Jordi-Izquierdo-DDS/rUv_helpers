/**
 * GeodesicIntegrator - RK4 trajectory integration through a reward potential field
 *
 * Computes curved trajectories between two endpoints by integrating through
 * the RewardPotentialField. The trajectory is deflected toward high-potential
 * (high-reward) regions, creating visually meaningful curved edges that reveal
 * the reward landscape.
 *
 * Integration method: 4th-order Runge-Kutta (RK4)
 *   - Base velocity = normalized direction toward the endpoint
 *   - Deflection    = field gradient * curvatureStrength
 *   - Combined velocity = normalize(baseDir + deflection) * stepSize
 *
 * The curvatureStrength parameter controls how aggressively trajectories
 * bend: 0 produces a straight line, 1 produces full deflection.
 */

import { RewardPotentialField } from './RewardPotentialField';

// ============================================================================
// Types
// ============================================================================

export interface TrajectoryPoint {
  /** World-space X coordinate */
  x: number;
  /** World-space Y coordinate */
  y: number;
  /** Potential field value at this point (0..1) */
  potential: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Small epsilon for safe normalization. */
const EPS = 1e-10;

// ============================================================================
// GeodesicIntegrator
// ============================================================================

export class GeodesicIntegrator {
  private field: RewardPotentialField;

  constructor(field: RewardPotentialField) {
    this.field = field;
  }

  // --------------------------------------------------------------------------
  // Single trajectory integration
  // --------------------------------------------------------------------------

  /**
   * Integrate a trajectory from (startX, startY) toward (endX, endY),
   * deflecting through the reward potential field using RK4.
   *
   * The result always begins at the start position and ends at the end
   * position (the final point is forced to the exact endpoint).
   *
   * @param startX           - Start X coordinate
   * @param startY           - Start Y coordinate
   * @param endX             - End X coordinate
   * @param endY             - End Y coordinate
   * @param steps            - Number of integration steps (default 32)
   * @param curvatureStrength - Deflection strength 0..1 (default 0.3)
   * @returns Array of TrajectoryPoints along the integrated path
   */
  integrate(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    steps: number = 32,
    curvatureStrength: number = 0.3
  ): TrajectoryPoint[] {
    const totalDist = Math.sqrt(
      (endX - startX) * (endX - startX) + (endY - startY) * (endY - startY)
    );

    // Degenerate case: start and end coincide
    if (totalDist < EPS) {
      const p = this.field.sample(startX, startY);
      return [{ x: startX, y: startY, potential: p }];
    }

    const stepSize = totalDist / steps;
    const points: TrajectoryPoint[] = [];

    let cx = startX;
    let cy = startY;

    // Record start point
    points.push({ x: cx, y: cy, potential: this.field.sample(cx, cy) });

    for (let i = 0; i < steps - 1; i++) {
      // RK4 integration step
      const [nx, ny] = this.rk4Step(cx, cy, endX, endY, stepSize, curvatureStrength);
      cx = nx;
      cy = ny;
      points.push({ x: cx, y: cy, potential: this.field.sample(cx, cy) });
    }

    // Force the last point to the exact endpoint
    points.push({ x: endX, y: endY, potential: this.field.sample(endX, endY) });

    return points;
  }

  // --------------------------------------------------------------------------
  // Batch integration
  // --------------------------------------------------------------------------

  /**
   * Integrate trajectories for an array of edges in batch.
   *
   * @param edges             - Array of edge endpoints {sx, sy, tx, ty}
   * @param steps             - Number of integration steps per trajectory (default 32)
   * @param curvatureStrength - Deflection strength 0..1 (default 0.3)
   * @returns Array of trajectory point arrays (one per edge)
   */
  integrateBatch(
    edges: Array<{ sx: number; sy: number; tx: number; ty: number }>,
    steps: number = 32,
    curvatureStrength: number = 0.3
  ): TrajectoryPoint[][] {
    const results: TrajectoryPoint[][] = [];
    for (const edge of edges) {
      results.push(
        this.integrate(edge.sx, edge.sy, edge.tx, edge.ty, steps, curvatureStrength)
      );
    }
    return results;
  }

  // --------------------------------------------------------------------------
  // RK4 internals
  // --------------------------------------------------------------------------

  /**
   * Single RK4 step.
   *
   * The velocity at any point is composed of:
   *   1. A base direction toward the endpoint (normalized)
   *   2. A deflection from the potential field gradient (scaled by curvatureStrength)
   *
   * These are combined, re-normalized, and scaled by stepSize to advance the
   * trajectory.
   *
   * @returns [newX, newY] after the step
   */
  private rk4Step(
    cx: number,
    cy: number,
    endX: number,
    endY: number,
    stepSize: number,
    curvatureStrength: number
  ): [number, number] {
    // k1
    const [vx1, vy1] = this.velocity(cx, cy, endX, endY, curvatureStrength);
    const k1x = vx1 * stepSize;
    const k1y = vy1 * stepSize;

    // k2
    const [vx2, vy2] = this.velocity(
      cx + k1x * 0.5,
      cy + k1y * 0.5,
      endX,
      endY,
      curvatureStrength
    );
    const k2x = vx2 * stepSize;
    const k2y = vy2 * stepSize;

    // k3
    const [vx3, vy3] = this.velocity(
      cx + k2x * 0.5,
      cy + k2y * 0.5,
      endX,
      endY,
      curvatureStrength
    );
    const k3x = vx3 * stepSize;
    const k3y = vy3 * stepSize;

    // k4
    const [vx4, vy4] = this.velocity(
      cx + k3x,
      cy + k3y,
      endX,
      endY,
      curvatureStrength
    );
    const k4x = vx4 * stepSize;
    const k4y = vy4 * stepSize;

    // Weighted average
    const newX = cx + (k1x + 2 * k2x + 2 * k3x + k4x) / 6;
    const newY = cy + (k1y + 2 * k2y + 2 * k3y + k4y) / 6;

    return [newX, newY];
  }

  /**
   * Compute the normalized velocity at a given position.
   *
   * velocity = normalize( baseDirection + curvatureStrength * gradient(field) )
   *
   * @returns [vx, vy] unit velocity vector
   */
  private velocity(
    x: number,
    y: number,
    endX: number,
    endY: number,
    curvatureStrength: number
  ): [number, number] {
    // Base direction toward the endpoint
    const dx = endX - x;
    const dy = endY - y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    let baseDirX: number;
    let baseDirY: number;

    if (dist < EPS) {
      baseDirX = 0;
      baseDirY = 0;
    } else {
      baseDirX = dx / dist;
      baseDirY = dy / dist;
    }

    // Gradient deflection from the potential field
    const [gx, gy] = this.field.gradient(x, y);

    // Combine
    const combinedX = baseDirX + curvatureStrength * gx;
    const combinedY = baseDirY + curvatureStrength * gy;

    // Normalize
    const combinedLen = Math.sqrt(combinedX * combinedX + combinedY * combinedY);
    if (combinedLen < EPS) {
      return [baseDirX, baseDirY];
    }

    return [combinedX / combinedLen, combinedY / combinedLen];
  }
}

export default GeodesicIntegrator;
