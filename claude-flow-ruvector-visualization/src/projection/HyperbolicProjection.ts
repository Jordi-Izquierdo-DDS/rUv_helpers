/**
 * HyperbolicProjection - Poincare ball model projection for memory graph visualization
 *
 * Projects UMAP 2D coordinates into the Poincare disk model, where hierarchy is
 * encoded radially: abstract node types (AGENT, STATE) sit near the disk center,
 * while specific types (MEMORY, FILE) are pushed toward the boundary.
 *
 * Math reference (Poincare disk model, curvature K = -1):
 *   Metric:          ds^2 = 4 / (1 - |x|^2)^2 * (dx^2 + dy^2)
 *   Mobius addition:  a (+) b = ((1 + 2<a,b> + |b|^2) a + (1 - |a|^2) b) / (1 + 2<a,b> + |a|^2 |b|^2)
 *   Distance:         d(a, b) = 2 * artanh(|(-a) (+) b|)
 *   Conformal factor: lambda(x) = 2 / (1 - |x|^2)
 */

import type { GraphNode } from '../config/Constants';

// ============================================================================
// Types
// ============================================================================

type Point2 = [number, number];

interface Position2D {
  x: number;
  y: number;
}

// ============================================================================
// Hierarchy depth configuration
// ============================================================================

/**
 * Radial depth for each source type in the Poincare disk.
 * Lower values place nodes closer to the origin (more abstract/general).
 * Higher values place nodes closer to the boundary (more specific/concrete).
 */
const HIERARCHY_DEPTH: Record<string, number> = {
  agent: 0.1,
  state: 0.2,
  action: 0.3,
  trajectory: 0.4,
  trajectory_success: 0.4,
  trajectory_failed: 0.4,
  neural_pattern: 0.5,
  q_pattern: 0.6,
  memory: 0.8,
  file: 0.9,
};

const DEFAULT_HIERARCHY_DEPTH = 0.5;

/** Maximum radius within the unit disk to avoid numerical instability at the boundary. */
const DISK_MARGIN = 0.95;

/** Epsilon for clamping norms away from 1.0 to prevent division by zero. */
const EPS = 1e-7;

// ============================================================================
// Internal math helpers
// ============================================================================

function dot(a: Point2, b: Point2): number {
  return a[0] * b[0] + a[1] * b[1];
}

function normSq(p: Point2): number {
  return p[0] * p[0] + p[1] * p[1];
}

function norm(p: Point2): number {
  return Math.sqrt(normSq(p));
}

/** Clamp a point so its norm stays strictly below 1 - EPS. */
function clampToDisk(p: Point2): Point2 {
  const n = norm(p);
  if (n >= 1.0 - EPS) {
    const scale = (1.0 - EPS) / n;
    return [p[0] * scale, p[1] * scale];
  }
  return p;
}

/**
 * artanh(x) = 0.5 * ln((1+x)/(1-x))
 * Clamped to avoid NaN for |x| >= 1.
 */
function artanh(x: number): number {
  const clamped = Math.min(Math.max(x, -1 + EPS), 1 - EPS);
  return 0.5 * Math.log((1 + clamped) / (1 - clamped));
}

// ============================================================================
// HyperbolicProjection
// ============================================================================

export class HyperbolicProjection {
  // -------------------------------------------------------------------
  // Poincare disk primitive operations
  // -------------------------------------------------------------------

  /**
   * Mobius addition in the Poincare disk: a (+) b
   *
   * Formula:
   *   a (+) b = ((1 + 2<a,b> + |b|^2) * a  +  (1 - |a|^2) * b)
   *             / (1 + 2<a,b> + |a|^2 * |b|^2)
   */
  mobiusAdd(a: Point2, b: Point2): Point2 {
    const ab = dot(a, b);
    const aSq = normSq(a);
    const bSq = normSq(b);
    const denom = 1 + 2 * ab + aSq * bSq;

    if (Math.abs(denom) < EPS) {
      return [0, 0];
    }

    const coefA = 1 + 2 * ab + bSq;
    const coefB = 1 - aSq;

    return clampToDisk([
      (coefA * a[0] + coefB * b[0]) / denom,
      (coefA * a[1] + coefB * b[1]) / denom,
    ]);
  }

  /**
   * Hyperbolic distance in the Poincare disk.
   *
   * d(a, b) = 2 * artanh( |(-a) (+) b| )
   *
   * Equivalent form used here for numerical stability:
   *   d(a, b) = 2 * artanh( |a - b| / |1 - conj(a) * b| )
   * where the complex form |1 - conj(a)*b| expands in R^2 to:
   *   sqrt( (1 - <a,b>)^2 + (a0*b1 - a1*b0)^2 )
   *   = sqrt(1 - 2<a,b> + |a|^2 * |b|^2)
   * simplified: 1 + |a|^2|b|^2 - 2<a,b> under the square root.
   */
  poincareDistance(a: Point2, b: Point2): number {
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    const diffNorm = Math.sqrt(dx * dx + dy * dy);

    const ab = dot(a, b);
    const aSq = normSq(a);
    const bSq = normSq(b);
    // |1 - conj(a)*b| in the complex sense:
    // For real 2D vectors treated as complex numbers z = x + iy:
    // |1 - conj(a)*b| = sqrt((1 - a.x*b.x - a.y*b.y)^2 + (a.x*b.y - a.y*b.x)^2)
    // This simplifies to sqrt(1 - 2<a,b> + |a|^2*|b|^2)
    const denomSq = 1 - 2 * ab + aSq * bSq;
    const denomVal = Math.sqrt(Math.max(denomSq, EPS));

    return 2 * artanh(diffNorm / denomVal);
  }

  /**
   * Conformal (metric) scaling factor at point p in the Poincare disk.
   * lambda(p) = 2 / (1 - |p|^2)
   */
  conformalFactor(p: Point2): number {
    const pSq = normSq(p);
    return 2.0 / Math.max(1.0 - pSq, EPS);
  }

  /**
   * Re-center the Poincare disk by Mobius-translating all points.
   * This corresponds to an isometry that moves `center` to the origin.
   * Useful for panning: translate by the negation of the desired center.
   *
   * Translation by c maps point p to (-c) (+) p.
   */
  mobiusTranslate(center: Point2, points: Point2[]): Point2[] {
    const negCenter: Point2 = [-center[0], -center[1]];
    return points.map((p) => this.mobiusAdd(negCenter, p));
  }

  /**
   * Exponential map at `origin` in the Poincare disk.
   * Maps a tangent vector at `origin` to a point on the disk.
   *
   * exp_o(v) = o (+) ( tanh( lambda(o) * |v| / 2 ) * v / |v| )
   *
   * where lambda(o) = 2 / (1 - |o|^2) is the conformal factor.
   */
  expMap(origin: Point2, tangent: Point2): Point2 {
    const vNorm = norm(tangent);
    if (vNorm < EPS) {
      return [...origin] as Point2;
    }

    const lambda = this.conformalFactor(origin);
    const t = Math.tanh((lambda * vNorm) / 2.0);

    const direction: Point2 = [tangent[0] / vNorm, tangent[1] / vNorm];
    const scaled: Point2 = [t * direction[0], t * direction[1]];

    return this.mobiusAdd(origin, scaled);
  }

  /**
   * Logarithmic map at `origin` in the Poincare disk.
   * Inverse of expMap: maps a disk point back to a tangent vector at `origin`.
   *
   * log_o(p) = (2 / lambda(o)) * artanh(|(-o) (+) p|) * ((-o)(+)p) / |(-o)(+)p|
   */
  logMap(origin: Point2, target: Point2): Point2 {
    const negOrigin: Point2 = [-origin[0], -origin[1]];
    const diff = this.mobiusAdd(negOrigin, target);
    const diffNorm = norm(diff);

    if (diffNorm < EPS) {
      return [0, 0];
    }

    const lambda = this.conformalFactor(origin);
    const scale = (2.0 / lambda) * artanh(diffNorm);

    return [
      scale * diff[0] / diffNorm,
      scale * diff[1] / diffNorm,
    ];
  }

  // -------------------------------------------------------------------
  // Model conversions
  // -------------------------------------------------------------------

  /**
   * Poincare disk to Klein disk.
   * k = 2p / (1 + |p|^2)
   */
  poincareToKlein(p: Point2): Point2 {
    const pSq = normSq(p);
    const denom = 1 + pSq;
    return [
      (2 * p[0]) / denom,
      (2 * p[1]) / denom,
    ];
  }

  /**
   * Klein disk to Poincare disk.
   * p = k / (1 + sqrt(1 - |k|^2))
   */
  kleinToPoincare(k: Point2): Point2 {
    const kSq = normSq(k);
    const denom = 1 + Math.sqrt(Math.max(1 - kSq, EPS));
    return clampToDisk([
      k[0] / denom,
      k[1] / denom,
    ]);
  }

  /**
   * Poincare disk to upper half-plane.
   *
   * Using the Cayley transform with the convention mapping the disk to the
   * upper half-plane H = {(u,v) : v > 0}:
   *
   *   w = i * (1 + z) / (1 - z)
   *
   * where z = p[0] + i*p[1], i = sqrt(-1).
   *
   * Expanding in real coordinates:
   *   Let z = x + iy, then 1+z = (1+x) + iy, 1-z = (1-x) - iy.
   *   w = i * ((1+x)+iy) / ((1-x)-iy)
   *     = i * [((1+x)+iy)((1-x)+iy)] / [((1-x)-iy)((1-x)+iy)]
   *   Denominator = (1-x)^2 + y^2
   *   Numerator (before i*) = (1+x)(1-x) + iy(1+x) + iy(1-x) + i^2 y^2
   *     = (1-x^2-y^2) + i*2y
   *   i * numerator = i*(1-x^2-y^2) + i^2 * 2y = -2y + i*(1-x^2-y^2)
   *
   *   u = -2y / ((1-x)^2 + y^2)
   *   v = (1 - x^2 - y^2) / ((1-x)^2 + y^2)
   */
  poincareToHalfPlane(p: Point2): Point2 {
    const x = p[0];
    const y = p[1];
    const denom = (1 - x) * (1 - x) + y * y;

    if (denom < EPS) {
      // Point is near (1, 0), maps to infinity; return large finite value.
      return [0, 1e6];
    }

    const u = (-2 * y) / denom;
    const v = (1 - x * x - y * y) / denom;

    return [u, v];
  }

  /**
   * Upper half-plane to Poincare disk.
   *
   * Inverse Cayley transform:
   *   z = (w - i) / (w + i)
   *
   * where w = u + iv, i = sqrt(-1).
   *
   * Expanding:
   *   w - i = u + i(v-1), w + i = u + i(v+1)
   *   z = [u + i(v-1)] / [u + i(v+1)]
   *     = [u + i(v-1)] * [u - i(v+1)] / [u^2 + (v+1)^2]
   *
   *   Real part:      (u^2 + (v-1)(v+1)) / (u^2 + (v+1)^2)  =  (u^2 + v^2 - 1) / (u^2 + (v+1)^2)
   *   Imaginary part:  (u(v-1) - u(v+1)) / (u^2 + (v+1)^2)  =  -2u / (u^2 + (v+1)^2)
   */
  halfPlaneToPoincare(w: Point2): Point2 {
    const u = w[0];
    const v = w[1];
    const denom = u * u + (v + 1) * (v + 1);

    if (denom < EPS) {
      return [0, 0];
    }

    return clampToDisk([
      (u * u + v * v - 1) / denom,
      (-2 * u) / denom,
    ]);
  }

  // -------------------------------------------------------------------
  // Node projection
  // -------------------------------------------------------------------

  /**
   * Project an array of graph nodes from their UMAP (Euclidean) positions
   * into the Poincare disk model.
   *
   * Steps:
   *   1. Compute the centroid and maximum radius of the UMAP point cloud.
   *   2. Normalize all points into the unit disk with a safety margin.
   *   3. Apply hierarchy-aware radial rescaling so that abstract node types
   *      (AGENT, STATE) sit near the origin and specific types (MEMORY, FILE)
   *      are pushed toward the boundary.
   *
   * Nodes with missing x/y default to (0, 0).
   */
  projectNodes(nodes: GraphNode[]): Position2D[] {
    if (nodes.length === 0) {
      return [];
    }

    // -- Step 1: extract positions and compute centroid --
    const xs: number[] = [];
    const ys: number[] = [];

    for (const node of nodes) {
      xs.push(node.x ?? 0);
      ys.push(node.y ?? 0);
    }

    let cx = 0;
    let cy = 0;
    for (let i = 0; i < xs.length; i++) {
      cx += xs[i];
      cy += ys[i];
    }
    cx /= xs.length;
    cy /= ys.length;

    // -- Step 2: center and find max radius --
    let maxR = 0;
    const centered: Point2[] = [];

    for (let i = 0; i < xs.length; i++) {
      const dx = xs[i] - cx;
      const dy = ys[i] - cy;
      centered.push([dx, dy]);
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r > maxR) {
        maxR = r;
      }
    }

    // Avoid division by zero for degenerate point clouds
    if (maxR < EPS) {
      maxR = 1;
    }

    // -- Step 3: normalize to unit disk and apply hierarchy scaling --
    const result: Position2D[] = [];

    for (let i = 0; i < nodes.length; i++) {
      const [px, py] = centered[i];

      // Normalize to unit disk with margin
      const euclideanR = Math.sqrt(px * px + py * py);
      const normalizedR = (euclideanR / maxR) * DISK_MARGIN;

      // Compute angle (preserve angular position from UMAP)
      const angle = Math.atan2(py, px);

      // Get the target radial depth for this node type
      const source = nodes[i].source ?? '';
      const targetDepth = HIERARCHY_DEPTH[source] ?? DEFAULT_HIERARCHY_DEPTH;

      // Blend the Euclidean radial position with the hierarchy target.
      // The final radius is a weighted combination:
      //   - The Euclidean position contribution preserves UMAP structure
      //   - The hierarchy depth contribution enforces the radial ordering
      // Using a 50/50 blend gives a good balance.
      const blendedR = 0.5 * normalizedR + 0.5 * (targetDepth * DISK_MARGIN);

      // Clamp to stay strictly inside the disk
      const finalR = Math.min(blendedR, 1 - EPS);

      result.push({
        x: finalR * Math.cos(angle),
        y: finalR * Math.sin(angle),
      });
    }

    return result;
  }

  /**
   * Interpolate between Euclidean and Poincare positions for animated transitions.
   *
   * @param euclideanPositions - Original UMAP/Euclidean positions
   * @param poincarePositions  - Target Poincare disk positions
   * @param t                  - Interpolation parameter: 0 = Euclidean, 1 = Poincare
   * @returns Interpolated positions
   *
   * Uses per-point polar interpolation: the angle is linearly interpolated,
   * and the radius is interpolated through the inverse hyperbolic tangent
   * to produce a smooth geodesic-like transition in the disk.
   */
  interpolateProjection(
    euclideanPositions: Position2D[],
    poincarePositions: Position2D[],
    t: number,
  ): Position2D[] {
    const clamped = Math.max(0, Math.min(1, t));
    const count = Math.min(euclideanPositions.length, poincarePositions.length);
    const result: Position2D[] = [];

    for (let i = 0; i < count; i++) {
      const e = euclideanPositions[i];
      const p = poincarePositions[i];

      // Simple linear interpolation in Cartesian coordinates.
      // While not a true geodesic interpolation on the Poincare disk,
      // it produces visually smooth transitions and avoids the complexity
      // of geodesic shooting between two differently-scaled coordinate systems.
      result.push({
        x: e.x + (p.x - e.x) * clamped,
        y: e.y + (p.y - e.y) * clamped,
      });
    }

    return result;
  }
}

export default HyperbolicProjection;
