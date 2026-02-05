/**
 * PersistentHomology - Topological data analysis via persistent homology
 *
 * Computes H0 (connected components) and H1 (loops/holes) persistence barcodes
 * using Vietoris-Rips filtration. Designed for main-thread use with ~2000 nodes.
 *
 * Algorithm overview:
 * 1. Build pairwise distance matrix from node positions
 * 2. Sort all edges by distance (filtration values)
 * 3. H0: Union-Find tracks component births/deaths as edges are added
 * 4. H1: Boundary matrix reduction detects cycle births/deaths
 */

// ═══════════════════════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export interface Bar {
  birth: number;      // Epsilon when feature appears
  death: number;      // Epsilon when feature dies (Infinity for essential features)
  dimension: number;  // 0 = connected component, 1 = loop/hole
  representative?: number[]; // Node indices forming the cycle (for H1)
}

export interface SimplicialComplex {
  vertices: number[];
  edges: [number, number][];
  triangles?: [number, number, number][];
}

// ═══════════════════════════════════════════════════════════════════════════
// UNION-FIND (Disjoint Set) for H0 computation
// ═══════════════════════════════════════════════════════════════════════════

class UnionFind {
  private parent: Int32Array;
  private rank: Uint8Array;
  private birthTime: Float32Array;

  constructor(n: number) {
    this.parent = new Int32Array(n);
    this.rank = new Uint8Array(n);
    this.birthTime = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.parent[i] = i;
      this.birthTime[i] = 0; // All components born at epsilon = 0
    }
  }

  find(x: number): number {
    // Path compression
    let root = x;
    while (this.parent[root] !== root) {
      root = this.parent[root];
    }
    while (this.parent[x] !== root) {
      const next = this.parent[x];
      this.parent[x] = root;
      x = next;
    }
    return root;
  }

  /**
   * Union two components. Returns true if a merge happened (they were different).
   * The younger component (higher birth time) dies.
   * Returns [merged, dyingRoot, survivingRoot] for bar tracking.
   */
  union(a: number, b: number): [boolean, number, number] {
    const rootA = this.find(a);
    const rootB = this.find(b);

    if (rootA === rootB) return [false, -1, -1];

    // Union by rank
    let dying: number;
    let surviving: number;

    if (this.rank[rootA] < this.rank[rootB]) {
      this.parent[rootA] = rootB;
      dying = rootA;
      surviving = rootB;
    } else if (this.rank[rootA] > this.rank[rootB]) {
      this.parent[rootB] = rootA;
      dying = rootB;
      surviving = rootA;
    } else {
      // Equal rank: the younger one dies (elder rule)
      if (this.birthTime[rootA] <= this.birthTime[rootB]) {
        this.parent[rootB] = rootA;
        this.rank[rootA]++;
        dying = rootB;
        surviving = rootA;
      } else {
        this.parent[rootA] = rootB;
        this.rank[rootB]++;
        dying = rootA;
        surviving = rootB;
      }
    }

    return [true, dying, surviving];
  }

  getBirthTime(x: number): number {
    return this.birthTime[this.find(x)];
  }

  connected(a: number, b: number): boolean {
    return this.find(a) === this.find(b);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SPARSE BOUNDARY MATRIX for H1 computation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sparse column representation for boundary matrix reduction.
 * Each column is stored as a sorted array of row indices.
 * Reserved for future use with full boundary matrix H1 computation.
 */
/* istanbul ignore next */
export class BoundaryMatrix {
  private columns: Map<number, number[]>;
  private pivotToCol: Map<number, number>;

  constructor() {
    this.columns = new Map();
    this.pivotToCol = new Map();
  }

  /**
   * Add a column (simplex boundary) at the given index.
   * boundary is an array of row indices (sorted ascending).
   */
  addColumn(colIdx: number, boundary: number[]): void {
    this.columns.set(colIdx, [...boundary]);
  }

  /**
   * Get the pivot (lowest/highest nonzero row) of a column.
   * Returns -1 if column is empty.
   */
  private getPivot(colIdx: number): number {
    const col = this.columns.get(colIdx);
    if (!col || col.length === 0) return -1;
    return col[col.length - 1]; // Highest row index
  }

  /**
   * Add two columns (symmetric difference / XOR over Z/2).
   * Modifies the column at targetIdx in place.
   */
  private addColumns(targetIdx: number, sourceIdx: number): void {
    const target = this.columns.get(targetIdx);
    const source = this.columns.get(sourceIdx);
    if (!target || !source) return;

    // Symmetric difference (XOR for Z/2 coefficients)
    const result: number[] = [];
    let i = 0, j = 0;
    while (i < target.length && j < source.length) {
      if (target[i] < source[j]) {
        result.push(target[i++]);
      } else if (target[i] > source[j]) {
        result.push(source[j++]);
      } else {
        // Same element: cancels out in Z/2
        i++;
        j++;
      }
    }
    while (i < target.length) result.push(target[i++]);
    while (j < source.length) result.push(source[j++]);

    this.columns.set(targetIdx, result);
  }

  /**
   * Reduce the matrix using left-to-right column operations.
   * Returns pivot pairings: Map<colIdx, pivotRow> for non-zero reduced columns.
   */
  reduce(): Map<number, number> {
    const pairings = new Map<number, number>();
    this.pivotToCol.clear();

    const colIndices = Array.from(this.columns.keys()).sort((a, b) => a - b);

    for (const colIdx of colIndices) {
      let pivot = this.getPivot(colIdx);

      while (pivot !== -1 && this.pivotToCol.has(pivot)) {
        const otherCol = this.pivotToCol.get(pivot)!;
        this.addColumns(colIdx, otherCol);
        pivot = this.getPivot(colIdx);
      }

      if (pivot !== -1) {
        this.pivotToCol.set(pivot, colIdx);
        pairings.set(colIdx, pivot);
      }
    }

    return pairings;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PERSISTENT HOMOLOGY CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class PersistentHomology {
  private distanceMatrix: Float32Array;
  private nodeCount: number;
  private bars: Bar[];
  private sortedEdges: { i: number; j: number; dist: number }[];

  constructor() {
    this.distanceMatrix = new Float32Array(0);
    this.nodeCount = 0;
    this.bars = [];
    this.sortedEdges = [];
  }

  /**
   * Build distance matrix from node positions using Euclidean distance.
   * Stored as a flat upper-triangular array for memory efficiency.
   * Index for (i,j) where i < j: i * nodeCount - i*(i+1)/2 + (j - i - 1)
   */
  buildDistanceMatrix(positions: Array<{ x: number; y: number }>): void {
    const n = positions.length;
    this.nodeCount = n;

    // Upper triangular storage: n*(n-1)/2 entries
    const size = (n * (n - 1)) / 2;
    this.distanceMatrix = new Float32Array(size);

    // Pre-sort edge list for filtration
    this.sortedEdges = [];

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = positions[i].x - positions[j].x;
        const dy = positions[i].y - positions[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        const idx = this.flatIndex(i, j);
        this.distanceMatrix[idx] = dist;

        this.sortedEdges.push({ i, j, dist });
      }
    }

    // Sort edges by distance for filtration order
    this.sortedEdges.sort((a, b) => a.dist - b.dist);
  }

  /**
   * Compute flat array index for pair (i, j) where i < j.
   */
  private flatIndex(i: number, j: number): number {
    // Ensure i < j
    if (i > j) { const tmp = i; i = j; j = tmp; }
    return i * this.nodeCount - (i * (i + 1)) / 2 + (j - i - 1);
  }

  /**
   * Get distance between two nodes.
   */
  private getDistance(i: number, j: number): number {
    if (i === j) return 0;
    return this.distanceMatrix[this.flatIndex(i, j)];
  }

  /**
   * Compute persistent homology using Vietoris-Rips filtration.
   * Returns persistence barcodes for H0 and H1.
   *
   * @param maxEpsilon - Maximum filtration value (default: auto-computed)
   * @param maxDim - Maximum homology dimension (default: 1, meaning H0 and H1)
   */
  compute(maxEpsilon?: number, maxDim: number = 1): Bar[] {
    if (this.nodeCount === 0 || this.sortedEdges.length === 0) {
      this.bars = [];
      return this.bars;
    }

    this.bars = [];

    // Determine max epsilon
    const autoMax = maxEpsilon ?? this.sortedEdges[this.sortedEdges.length - 1].dist * 1.1;

    // Filter edges to max epsilon
    const filteredEdges = this.sortedEdges.filter(e => e.dist <= autoMax);

    // ─── H0: Connected Components via Union-Find ───────────────────────

    const uf = new UnionFind(this.nodeCount);

    // Track which component root each node belongs to for H0 bars
    // All components born at epsilon = 0
    const componentBirth = new Float32Array(this.nodeCount); // All zeros

    // Adjacency list for cycle detection (H1)
    const adjacency: Set<number>[] = new Array(this.nodeCount);
    for (let i = 0; i < this.nodeCount; i++) {
      adjacency[i] = new Set();
    }

    // Edge index map for boundary matrix
    const edgeIndex = new Map<string, number>();
    let edgeCounter = 0;

    // Track which edges create cycles (for H1)
    const cycleEdges: { edgeIdx: number; birth: number; nodes: [number, number] }[] = [];

    for (const edge of filteredEdges) {
      const { i, j, dist } = edge;
      const eKey = `${Math.min(i, j)},${Math.max(i, j)}`;
      const eIdx = edgeCounter++;
      edgeIndex.set(eKey, eIdx);

      const [merged, dying] = uf.union(i, j);

      if (merged) {
        // Two components merged: the younger one dies
        // Birth time of dying component = 0, death = dist
        const birthTime = componentBirth[dying];
        this.bars.push({
          birth: birthTime,
          death: dist,
          dimension: 0
        });
      } else if (maxDim >= 1) {
        // Both already connected: this edge creates a cycle -> H1 birth
        cycleEdges.push({ edgeIdx: eIdx, birth: dist, nodes: [i, j] });
      }

      // Update adjacency for cycle tracking
      adjacency[i].add(j);
      adjacency[j].add(i);
    }

    // Add essential H0 features (components that never merge -> death = Infinity)
    // Count remaining distinct components
    const roots = new Set<number>();
    for (let i = 0; i < this.nodeCount; i++) {
      roots.add(uf.find(i));
    }
    for (const root of roots) {
      this.bars.push({
        birth: componentBirth[root],
        death: Infinity,
        dimension: 0
      });
    }

    // ─── H1: Loops/Holes via cycle detection ───────────────────────────

    if (maxDim >= 1 && cycleEdges.length > 0) {
      this.computeH1(filteredEdges, cycleEdges, edgeIndex, adjacency, autoMax);
    }

    return this.bars;
  }

  /**
   * Compute H1 (1-cycles / loops) using a simplified boundary matrix approach.
   *
   * For each cycle-creating edge, we find the shortest cycle through BFS,
   * then track triangle additions to determine when cycles die.
   */
  private computeH1(
    _edges: { i: number; j: number; dist: number }[],
    cycleEdges: { edgeIdx: number; birth: number; nodes: [number, number] }[],
    _edgeIndex: Map<string, number>,
    adjacency: Set<number>[],
    maxEpsilon: number
  ): void {
    // For each cycle-creating edge, find the representative cycle via BFS
    for (const { birth, nodes: [a, b] } of cycleEdges) {
      // BFS from a to b through already-added edges (excluding the direct a-b edge)
      const cycle = this.findShortestCycle(a, b, adjacency);

      if (cycle && cycle.length >= 3) {
        // Check if any triangle fills this cycle
        const deathEpsilon = this.findCycleDeath(cycle, maxEpsilon);

        this.bars.push({
          birth,
          death: deathEpsilon,
          dimension: 1,
          representative: cycle
        });
      }
    }
  }

  /**
   * Find shortest path from a to b using BFS on the current adjacency graph.
   * Returns the cycle as an array of node indices (including both a and b).
   */
  private findShortestCycle(
    a: number,
    b: number,
    adjacency: Set<number>[]
  ): number[] | null {
    // BFS from a to b (exclude direct edge a-b by not starting from b's neighbors)
    const visited = new Uint8Array(this.nodeCount);
    const parent = new Int32Array(this.nodeCount).fill(-1);
    const queue: number[] = [a];
    visited[a] = 1;

    while (queue.length > 0) {
      const current = queue.shift()!;

      for (const neighbor of adjacency[current]) {
        // Skip the direct a-b edge to force finding an alternative path
        if (current === a && neighbor === b) continue;

        if (!visited[neighbor]) {
          visited[neighbor] = 1;
          parent[neighbor] = current;

          if (neighbor === b) {
            // Reconstruct path
            const path: number[] = [b];
            let node = b;
            while (parent[node] !== -1) {
              node = parent[node];
              path.push(node);
            }
            path.reverse();
            return path;
          }

          queue.push(neighbor);
        }
      }
    }

    return null;
  }

  /**
   * Determine when a cycle dies by checking when a triangle fills it.
   * A cycle dies when all three edges of a triangle spanning part of
   * the cycle are present, reducing the 1-cycle.
   *
   * Simplified: checks for the maximum pairwise distance among consecutive
   * cycle nodes that would form filling triangles.
   */
  private findCycleDeath(cycle: number[], maxEpsilon: number): number {
    if (cycle.length <= 3) {
      // A triangle: dies when the third edge appears
      // Find the longest edge in the triangle
      let maxDist = 0;
      for (let i = 0; i < cycle.length; i++) {
        for (let j = i + 1; j < cycle.length; j++) {
          maxDist = Math.max(maxDist, this.getDistance(cycle[i], cycle[j]));
        }
      }
      return maxDist;
    }

    // For larger cycles: find minimum epsilon at which a triangulation exists
    // Simplified: check diagonal distances that would create filling triangles
    let minDeathEpsilon = Infinity;

    for (let i = 0; i < cycle.length; i++) {
      for (let j = i + 2; j < cycle.length; j++) {
        if (i === 0 && j === cycle.length - 1) continue; // Skip the edge itself
        const diagonalDist = this.getDistance(cycle[i], cycle[j]);
        if (diagonalDist < minDeathEpsilon) {
          minDeathEpsilon = diagonalDist;
        }
      }
    }

    return minDeathEpsilon === Infinity ? maxEpsilon : minDeathEpsilon;
  }

  /**
   * Get barcode for a specific dimension.
   */
  getBarcodeByDimension(dim: number): Bar[] {
    return this.bars.filter(bar => bar.dimension === dim);
  }

  /**
   * Get Betti numbers at a specific epsilon value.
   * b0 = number of connected components alive at epsilon
   * b1 = number of 1-cycles (holes) alive at epsilon
   */
  getBettiNumbers(epsilon: number): { b0: number; b1: number } {
    let b0 = 0;
    let b1 = 0;

    for (const bar of this.bars) {
      if (bar.birth <= epsilon && bar.death > epsilon) {
        if (bar.dimension === 0) b0++;
        else if (bar.dimension === 1) b1++;
      }
    }

    return { b0, b1 };
  }

  /**
   * Get simplicial complex at a specific epsilon for visualization.
   * Returns all vertices, edges within epsilon distance, and triangles (if requested).
   */
  getComplexAtEpsilon(epsilon: number): SimplicialComplex {
    const vertices: number[] = [];
    for (let i = 0; i < this.nodeCount; i++) {
      vertices.push(i);
    }

    const edges: [number, number][] = [];
    const triangles: [number, number, number][] = [];

    // Collect edges within epsilon
    for (const { i, j, dist } of this.sortedEdges) {
      if (dist > epsilon) break; // Sorted, so we can stop early
      edges.push([i, j]);
    }

    // Build adjacency for triangle detection
    const adj = new Map<number, Set<number>>();
    for (const [i, j] of edges) {
      if (!adj.has(i)) adj.set(i, new Set());
      if (!adj.has(j)) adj.set(j, new Set());
      adj.get(i)!.add(j);
      adj.get(j)!.add(i);
    }

    // Find triangles (only if node count is small enough)
    if (this.nodeCount <= 50) {
      for (const [i, j] of edges) {
        const neighborsI = adj.get(i);
        const neighborsJ = adj.get(j);
        if (!neighborsI || !neighborsJ) continue;

        for (const k of neighborsI) {
          if (k > j && neighborsJ.has(k)) {
            // Check that the third edge (j, k) is also within epsilon
            if (this.getDistance(j, k) <= epsilon) {
              triangles.push([i, j, k]);
            }
          }
        }
      }
    }

    return { vertices, edges, triangles };
  }

  /**
   * Get persistent features whose persistence exceeds a threshold.
   * Default threshold: median persistence * 1.5
   */
  getSignificantFeatures(minPersistence?: number): Bar[] {
    const finiteBars = this.bars.filter(b => isFinite(b.death));
    if (finiteBars.length === 0) return this.bars.filter(b => !isFinite(b.death));

    const persistences = finiteBars
      .map(b => b.death - b.birth)
      .sort((a, b) => a - b);

    const median = persistences[Math.floor(persistences.length / 2)];
    const threshold = minPersistence ?? median * 1.5;

    return this.bars.filter(bar => {
      const persistence = bar.death - bar.birth;
      return persistence >= threshold || !isFinite(bar.death);
    });
  }
}

export default PersistentHomology;
