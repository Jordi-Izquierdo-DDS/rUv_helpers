/**
 * GeodesicComputer - Computes geodesic arcs in the Poincare disk model.
 *
 * In hyperbolic geometry on the Poincare disk, geodesics (shortest paths)
 * are either:
 *   - Diameters of the disk (straight lines through the origin), or
 *   - Arcs of circles that intersect the unit boundary circle at right angles.
 *
 * This module provides methods to sample points along these geodesics for
 * Three.js edge rendering between nodes placed in hyperbolic space.
 */

const DEFAULT_SEGMENTS = 32;
const DEFAULT_EPSILON = 1e-8;
const DEFAULT_MAX_RADIUS = 0.99;

export class GeodesicComputer {
  /**
   * Compute points along the geodesic arc between p1 and p2 in the Poincare disk.
   *
   * Returns a Float32Array of interleaved [x, y, x, y, ...] pairs with
   * (numSegments + 1) points total.
   *
   * Algorithm (Circle Inversion Method):
   * - If p1 and p2 are collinear with the origin (within epsilon), the geodesic
   *   is a straight line segment.
   * - Otherwise, find the unique circle orthogonal to the unit circle that passes
   *   through both p1 and p2, then sample along the shorter arc.
   */
  computeGeodesicArc(
    p1: [number, number],
    p2: [number, number],
    numSegments: number = DEFAULT_SEGMENTS,
  ): Float32Array {
    const cp1 = GeodesicComputer.clampToDisk(p1);
    const cp2 = GeodesicComputer.clampToDisk(p2);
    const pointCount = numSegments + 1;
    const result = new Float32Array(pointCount * 2);

    // Straight-line case: points are on (or near) the same diameter.
    if (this.isNearDiameter(cp1, cp2)) {
      for (let i = 0; i <= numSegments; i++) {
        const t = i / numSegments;
        result[i * 2] = cp1[0] + t * (cp2[0] - cp1[0]);
        result[i * 2 + 1] = cp1[1] + t * (cp2[1] - cp1[1]);
      }
      return result;
    }

    // Find the center of the geodesic circle (orthogonal to the unit circle).
    const { cx, cy, r } = this.findGeodesicCircle(cp1, cp2);

    // Compute start and end angles on the geodesic circle.
    const angle1 = Math.atan2(cp1[1] - cy, cp1[0] - cx);
    const angle2 = Math.atan2(cp2[1] - cy, cp2[0] - cx);

    // Determine the angular sweep, choosing the shorter arc.
    let delta = angle2 - angle1;

    // Normalize to (-PI, PI] to pick the shorter arc.
    if (delta > Math.PI) {
      delta -= 2 * Math.PI;
    } else if (delta <= -Math.PI) {
      delta += 2 * Math.PI;
    }

    for (let i = 0; i <= numSegments; i++) {
      const t = i / numSegments;
      const angle = angle1 + t * delta;
      result[i * 2] = cx + r * Math.cos(angle);
      result[i * 2 + 1] = cy + r * Math.sin(angle);
    }

    return result;
  }

  /**
   * Compute points along the geodesic arc with a constant z-coordinate,
   * returning interleaved [x, y, z, x, y, z, ...] for Three.js BufferGeometry.
   *
   * Produces (numSegments + 1) 3D points.
   */
  computeGeodesicArc3D(
    p1: [number, number],
    p2: [number, number],
    z: number,
    numSegments: number = DEFAULT_SEGMENTS,
  ): Float32Array {
    const arc2D = this.computeGeodesicArc(p1, p2, numSegments);
    const pointCount = numSegments + 1;
    const result = new Float32Array(pointCount * 3);

    for (let i = 0; i < pointCount; i++) {
      result[i * 3] = arc2D[i * 2];
      result[i * 3 + 1] = arc2D[i * 2 + 1];
      result[i * 3 + 2] = z;
    }

    return result;
  }

  /**
   * Batch-compute geodesic arcs for multiple point pairs.
   * Returns one Float32Array per pair (2D interleaved format).
   */
  computeGeodesicBatch(
    pairs: Array<{ p1: [number, number]; p2: [number, number] }>,
    numSegments: number = DEFAULT_SEGMENTS,
  ): Float32Array[] {
    return pairs.map(({ p1, p2 }) =>
      this.computeGeodesicArc(p1, p2, numSegments),
    );
  }

  /**
   * Compute the midpoint of the geodesic between p1 and p2 in the Poincare disk.
   *
   * For the diameter case this is the Euclidean midpoint. For the circular-arc
   * case the midpoint lies on the geodesic circle at the angle halfway along
   * the shorter arc.
   */
  geodesicMidpoint(
    p1: [number, number],
    p2: [number, number],
  ): [number, number] {
    const cp1 = GeodesicComputer.clampToDisk(p1);
    const cp2 = GeodesicComputer.clampToDisk(p2);

    if (this.isNearDiameter(cp1, cp2)) {
      return [
        (cp1[0] + cp2[0]) / 2,
        (cp1[1] + cp2[1]) / 2,
      ];
    }

    const { cx, cy, r } = this.findGeodesicCircle(cp1, cp2);

    const angle1 = Math.atan2(cp1[1] - cy, cp1[0] - cx);
    const angle2 = Math.atan2(cp2[1] - cy, cp2[0] - cx);

    let delta = angle2 - angle1;
    if (delta > Math.PI) {
      delta -= 2 * Math.PI;
    } else if (delta <= -Math.PI) {
      delta += 2 * Math.PI;
    }

    const midAngle = angle1 + delta / 2;
    return [
      cx + r * Math.cos(midAngle),
      cy + r * Math.sin(midAngle),
    ];
  }

  /**
   * Returns true if the geodesic between p1 and p2 is approximately a
   * diameter (a straight line through the origin).
   *
   * This is detected by checking whether p1, p2, and the origin are
   * collinear, i.e. the cross product p1 x p2 is near zero.
   */
  isNearDiameter(
    p1: [number, number],
    p2: [number, number],
    epsilon: number = DEFAULT_EPSILON,
  ): boolean {
    // Cross product of the 2D vectors p1 and p2.
    const cross = p1[0] * p2[1] - p1[1] * p2[0];
    return Math.abs(cross) < epsilon;
  }

  /**
   * Clamp a point so that it lies strictly within the Poincare disk.
   * Points with |p| >= maxRadius are scaled inward to maxRadius.
   */
  static clampToDisk(
    p: [number, number],
    maxRadius: number = DEFAULT_MAX_RADIUS,
  ): [number, number] {
    const norm = Math.sqrt(p[0] * p[0] + p[1] * p[1]);
    if (norm <= maxRadius) {
      return [p[0], p[1]];
    }
    const scale = maxRadius / norm;
    return [p[0] * scale, p[1] * scale];
  }

  /**
   * Return the point on the unit circle at the given angle.
   */
  static diskBoundaryPoint(angle: number): [number, number] {
    return [Math.cos(angle), Math.sin(angle)];
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Find the center and radius of the unique circle that:
   *   1. Passes through both p1 and p2.
   *   2. Is orthogonal to the unit circle (r^2 = |c|^2 - 1).
   *
   * Derivation:
   *   |c - p1|^2 = r^2  and  |c - p2|^2 = r^2  and  r^2 = cx^2 + cy^2 - 1
   *
   *   Expanding |c - p1|^2 = |c|^2 - 2*c.p1 + |p1|^2 and setting equal to
   *   |c|^2 - 1 gives:  2*c.p1 = |p1|^2 + 1, and similarly for p2.
   *
   *   This yields two linear equations in (cx, cy):
   *     2*(p1.x * cx + p1.y * cy) = |p1|^2 + 1
   *     2*(p2.x * cx + p2.y * cy) = |p2|^2 + 1
   *
   *   Solve via Cramer's rule.
   */
  private findGeodesicCircle(
    p1: [number, number],
    p2: [number, number],
  ): { cx: number; cy: number; r: number } {
    const s1 = p1[0] * p1[0] + p1[1] * p1[1] + 1;
    const s2 = p2[0] * p2[0] + p2[1] * p2[1] + 1;

    // Coefficients for 2*(px*cx + py*cy) = s
    // =>  px*cx + py*cy = s/2
    const a1 = p1[0];
    const b1 = p1[1];
    const c1 = s1 / 2;

    const a2 = p2[0];
    const b2 = p2[1];
    const c2 = s2 / 2;

    const det = a1 * b2 - a2 * b1;

    // det should not be zero here because we already handled the collinear
    // (diameter) case, but guard against numerical issues.
    if (Math.abs(det) < DEFAULT_EPSILON) {
      // Fallback: treat as diameter. Return a circle with very large radius
      // whose arc approximates a line. This should not happen in normal use.
      return { cx: 0, cy: 0, r: 1e6 };
    }

    const cx = (c1 * b2 - c2 * b1) / det;
    const cy = (a1 * c2 - a2 * c1) / det;
    const rSquared = cx * cx + cy * cy - 1;

    // rSquared should always be positive for points inside the disk, but clamp
    // to avoid NaN from floating-point drift.
    const r = Math.sqrt(Math.max(rSquared, 0));

    return { cx, cy, r };
  }
}

export default GeodesicComputer;
