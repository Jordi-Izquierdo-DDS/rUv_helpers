/**
 * ClusterComputer - Spatial clustering for LOD
 *
 * Aggregates nearby nodes into clusters for zoomed-out views.
 * Uses grid-based spatial hashing for efficiency.
 */

import type { GraphNode } from '../config/Constants';

export interface Cluster {
  id: string;
  x: number;
  y: number;
  z: number;
  nodeCount: number;
  nodeIndices: number[];
  radius: number;
  color: [number, number, number];
  // Aggregated properties
  avgConnectionCount: number;
  dominantSource: string;
  dominantNamespace: string;
}

export interface ClusterLevel {
  level: number;
  cellSize: number;
  clusters: Cluster[];
  totalNodes: number;
}

export interface ClusterConfig {
  levels: number;       // Number of LOD levels
  baseCellSize: number; // Cell size at finest level
  cellMultiplier: number; // How much to multiply cell size per level
  minNodesPerCluster: number; // Minimum nodes to form a cluster
}

export class ClusterComputer {
  private config: ClusterConfig;
  private nodes: GraphNode[] = [];
  private levels: Map<number, ClusterLevel> = new Map();

  constructor(config?: Partial<ClusterConfig>) {
    this.config = {
      levels: 5,
      baseCellSize: 100,
      cellMultiplier: 2,
      minNodesPerCluster: 3,
      ...config
    };
  }

  /**
   * Compute clusters for all LOD levels
   */
  computeClusters(nodes: GraphNode[]): void {
    this.nodes = nodes;
    this.levels.clear();

    if (nodes.length === 0) return;

    console.log(`ClusterComputer: Computing clusters for ${nodes.length} nodes`);
    const startTime = performance.now();

    for (let level = 0; level < this.config.levels; level++) {
      const cellSize = this.config.baseCellSize *
        Math.pow(this.config.cellMultiplier, level);

      const clusters = this.computeLevel(nodes, cellSize, level);

      this.levels.set(level, {
        level,
        cellSize,
        clusters,
        totalNodes: nodes.length
      });

      console.log(`  Level ${level}: ${clusters.length} clusters (cell size: ${cellSize})`);
    }

    console.log(`ClusterComputer: Computed in ${(performance.now() - startTime).toFixed(1)}ms`);
  }

  /**
   * Compute clusters for a single level
   */
  private computeLevel(
    nodes: GraphNode[],
    cellSize: number,
    level: number
  ): Cluster[] {
    // Grid-based spatial hashing
    const grid: Map<string, number[]> = new Map();

    // Assign nodes to grid cells
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const cellX = Math.floor((node.x ?? 0) / cellSize);
      const cellY = Math.floor((node.y ?? 0) / cellSize);
      const cellZ = Math.floor((node.z ?? 0) / cellSize);
      const key = `${cellX},${cellY},${cellZ}`;

      if (!grid.has(key)) {
        grid.set(key, []);
      }
      grid.get(key)!.push(i);
    }

    // Convert grid cells to clusters
    const clusters: Cluster[] = [];

    for (const [key, nodeIndices] of grid) {
      if (nodeIndices.length < this.config.minNodesPerCluster && level > 0) {
        // Too few nodes for a cluster at this level
        // Individual nodes will be shown instead
        continue;
      }

      // Compute cluster center (centroid)
      let sumX = 0, sumY = 0, sumZ = 0;
      let sumConnections = 0;
      const sourceCounts: Map<string, number> = new Map();
      const namespaceCounts: Map<string, number> = new Map();

      for (const idx of nodeIndices) {
        const node = nodes[idx];
        sumX += node.x ?? 0;
        sumY += node.y ?? 0;
        sumZ += node.z ?? 0;
        sumConnections += node.connectionCount ?? 0;

        // Count sources
        const source = node.source;
        sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);

        // Count namespaces
        const ns = node.namespace || source;
        namespaceCounts.set(ns, (namespaceCounts.get(ns) || 0) + 1);
      }

      const count = nodeIndices.length;
      const centerX = sumX / count;
      const centerY = sumY / count;
      const centerZ = sumZ / count;

      // Compute radius (max distance from center)
      let maxDist = 0;
      for (const idx of nodeIndices) {
        const node = nodes[idx];
        const dx = (node.x ?? 0) - centerX;
        const dy = (node.y ?? 0) - centerY;
        const dz = (node.z ?? 0) - centerZ;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        maxDist = Math.max(maxDist, dist);
      }

      // Get dominant source and namespace
      let dominantSource = 'memory';
      let maxSourceCount = 0;
      for (const [source, count] of sourceCounts) {
        if (count > maxSourceCount) {
          maxSourceCount = count;
          dominantSource = source;
        }
      }

      let dominantNamespace = dominantSource;
      let maxNsCount = 0;
      for (const [ns, count] of namespaceCounts) {
        if (count > maxNsCount) {
          maxNsCount = count;
          dominantNamespace = ns;
        }
      }

      // Compute color based on dominant source
      const color = this.getSourceColor(dominantSource);

      clusters.push({
        id: `cluster-${level}-${key}`,
        x: centerX,
        y: centerY,
        z: centerZ,
        nodeCount: count,
        nodeIndices,
        radius: Math.max(maxDist, cellSize * 0.3),
        color,
        avgConnectionCount: sumConnections / count,
        dominantSource,
        dominantNamespace
      });
    }

    return clusters;
  }

  /**
   * Get color for node type
   */
  private getSourceColor(source: string): [number, number, number] {
    const colors: Record<string, [number, number, number]> = {
      memory: [0.42, 0.18, 0.71],
      neural_pattern: [0.55, 0.31, 0.85],
      q_pattern: [0.72, 0.58, 0.96],
      trajectory: [0.06, 0.73, 0.51]
    };
    return colors[source] || [0.4, 0.4, 0.4];
  }

  /**
   * Get clusters for a specific LOD level
   */
  getLevel(level: number): ClusterLevel | undefined {
    return this.levels.get(level);
  }

  /**
   * Get appropriate LOD level for a zoom factor
   */
  getLevelForZoom(zoom: number): number {
    // Higher zoom = closer view = lower LOD level = more detail
    // zoom 1 = default view, zoom < 1 = zoomed out, zoom > 1 = zoomed in

    if (zoom >= 2) return 0; // Show all nodes
    if (zoom >= 1) return 1;
    if (zoom >= 0.5) return 2;
    if (zoom >= 0.25) return 3;
    return 4;
  }

  /**
   * Get clusters and individual nodes for current view
   */
  getVisibleElements(
    zoom: number,
    frustumTest?: (x: number, y: number, z: number) => boolean
  ): {
    clusters: Cluster[];
    individualNodeIndices: number[];
  } {
    const level = this.getLevelForZoom(zoom);
    const levelData = this.levels.get(level);

    if (!levelData) {
      // Return all nodes as individuals
      return {
        clusters: [],
        individualNodeIndices: Array.from({ length: this.nodes.length }, (_, i) => i)
      };
    }

    const clusters: Cluster[] = [];
    const individualNodeIndices: number[] = [];

    // Collect nodes that aren't in any cluster
    const nodesInClusters = new Set<number>();

    for (const cluster of levelData.clusters) {
      // If frustum test provided, check if cluster is visible
      if (frustumTest && !frustumTest(cluster.x, cluster.y, cluster.z)) {
        continue;
      }

      clusters.push(cluster);
      for (const idx of cluster.nodeIndices) {
        nodesInClusters.add(idx);
      }
    }

    // Add individual nodes that aren't in clusters
    for (let i = 0; i < this.nodes.length; i++) {
      if (!nodesInClusters.has(i)) {
        const node = this.nodes[i];
        if (!frustumTest || frustumTest(node.x ?? 0, node.y ?? 0, node.z ?? 0)) {
          individualNodeIndices.push(i);
        }
      }
    }

    return { clusters, individualNodeIndices };
  }

  /**
   * Get all levels
   */
  getAllLevels(): ClusterLevel[] {
    return Array.from(this.levels.values());
  }

  /**
   * Get statistics
   */
  getStats(): {
    levels: number;
    totalNodes: number;
    clustersPerLevel: number[];
  } {
    const clustersPerLevel = Array.from(this.levels.values()).map(l => l.clusters.length);

    return {
      levels: this.levels.size,
      totalNodes: this.nodes.length,
      clustersPerLevel
    };
  }

  /**
   * Clear all computed data
   */
  clear(): void {
    this.nodes = [];
    this.levels.clear();
  }
}
