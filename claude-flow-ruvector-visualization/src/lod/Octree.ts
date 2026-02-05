/**
 * Octree - Spatial index for fast neighbor queries
 *
 * Optimized for 2D/3D node positions with support for:
 * - Fast nearest neighbor search
 * - Range queries (nodes within distance)
 * - Frustum queries (nodes in view)
 * - Dynamic updates
 */

import * as THREE from 'three';

export interface OctreeNode<T> {
  data: T;
  x: number;
  y: number;
  z: number;
  index: number;
}

interface OctreeCell<T> {
  bounds: THREE.Box3;
  children: OctreeCell<T>[] | null;
  items: OctreeNode<T>[];
  depth: number;
}

export interface OctreeConfig {
  maxDepth: number;
  maxItemsPerCell: number;
  minCellSize: number;
}

export class Octree<T = unknown> {
  private root: OctreeCell<T> | null = null;
  private config: OctreeConfig;
  private nodeCount = 0;

  // For fast index-based lookup
  private nodeMap: Map<number, OctreeNode<T>> = new Map();

  constructor(config?: Partial<OctreeConfig>) {
    this.config = {
      maxDepth: 8,
      maxItemsPerCell: 16,
      minCellSize: 10,
      ...config
    };
  }

  /**
   * Build octree from node positions
   */
  build(
    positions: Float32Array,
    data: T[],
    bounds?: THREE.Box3
  ): void {
    this.clear();

    const nodeCount = positions.length / 3;
    if (nodeCount === 0) return;

    this.nodeCount = nodeCount;

    // Calculate bounds if not provided
    if (!bounds) {
      bounds = new THREE.Box3();
      for (let i = 0; i < nodeCount; i++) {
        const x = positions[i * 3];
        const y = positions[i * 3 + 1];
        const z = positions[i * 3 + 2];
        bounds.expandByPoint(new THREE.Vector3(x, y, z));
      }
      // Expand bounds slightly to ensure all points are inside
      bounds.expandByScalar(1);
    }

    // Create root cell
    this.root = {
      bounds: bounds.clone(),
      children: null,
      items: [],
      depth: 0
    };

    // Insert all nodes
    for (let i = 0; i < nodeCount; i++) {
      const node: OctreeNode<T> = {
        data: data[i],
        x: positions[i * 3],
        y: positions[i * 3 + 1],
        z: positions[i * 3 + 2],
        index: i
      };

      this.nodeMap.set(i, node);
      this.insertNode(this.root, node);
    }
  }

  /**
   * Insert a node into the octree
   */
  private insertNode(cell: OctreeCell<T>, node: OctreeNode<T>): void {
    // If cell has children, insert into appropriate child
    if (cell.children) {
      const childIndex = this.getChildIndex(cell, node.x, node.y, node.z);
      this.insertNode(cell.children[childIndex], node);
      return;
    }

    // Add to current cell
    cell.items.push(node);

    // Check if we need to subdivide
    if (
      cell.items.length > this.config.maxItemsPerCell &&
      cell.depth < this.config.maxDepth
    ) {
      const cellSize = cell.bounds.max.x - cell.bounds.min.x;
      if (cellSize > this.config.minCellSize * 2) {
        this.subdivide(cell);
      }
    }
  }

  /**
   * Subdivide a cell into 8 children
   */
  private subdivide(cell: OctreeCell<T>): void {
    const min = cell.bounds.min;
    const max = cell.bounds.max;
    const mid = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);

    cell.children = [];

    // Create 8 children
    for (let i = 0; i < 8; i++) {
      const childMin = new THREE.Vector3(
        (i & 1) ? mid.x : min.x,
        (i & 2) ? mid.y : min.y,
        (i & 4) ? mid.z : min.z
      );
      const childMax = new THREE.Vector3(
        (i & 1) ? max.x : mid.x,
        (i & 2) ? max.y : mid.y,
        (i & 4) ? max.z : mid.z
      );

      cell.children.push({
        bounds: new THREE.Box3(childMin, childMax),
        children: null,
        items: [],
        depth: cell.depth + 1
      });
    }

    // Move items to children
    for (const item of cell.items) {
      const childIndex = this.getChildIndex(cell, item.x, item.y, item.z);
      cell.children[childIndex].items.push(item);
    }

    cell.items = [];
  }

  /**
   * Get child index for a position
   */
  private getChildIndex(
    cell: OctreeCell<T>,
    x: number,
    y: number,
    z: number
  ): number {
    const mid = new THREE.Vector3()
      .addVectors(cell.bounds.min, cell.bounds.max)
      .multiplyScalar(0.5);

    let index = 0;
    if (x > mid.x) index |= 1;
    if (y > mid.y) index |= 2;
    if (z > mid.z) index |= 4;

    return index;
  }

  /**
   * Find nearest neighbor to a point
   */
  findNearest(
    x: number,
    y: number,
    z: number,
    maxDistance: number = Infinity
  ): OctreeNode<T> | null {
    if (!this.root) return null;

    let nearest: OctreeNode<T> | null = null;
    let nearestDist = maxDistance * maxDistance;

    const searchCell = (cell: OctreeCell<T>) => {
      // Check if cell could contain a closer point
      const closestPoint = new THREE.Vector3(x, y, z).clamp(
        cell.bounds.min,
        cell.bounds.max
      );
      const cellDistSq =
        (closestPoint.x - x) ** 2 +
        (closestPoint.y - y) ** 2 +
        (closestPoint.z - z) ** 2;

      if (cellDistSq > nearestDist) return;

      // Check items in this cell
      for (const item of cell.items) {
        const distSq =
          (item.x - x) ** 2 +
          (item.y - y) ** 2 +
          (item.z - z) ** 2;

        if (distSq < nearestDist) {
          nearestDist = distSq;
          nearest = item;
        }
      }

      // Recursively search children
      if (cell.children) {
        // Sort children by distance to search closest first
        const sortedChildren = cell.children
          .map((child, index) => {
            const childClosest = new THREE.Vector3(x, y, z).clamp(
              child.bounds.min,
              child.bounds.max
            );
            const dist =
              (childClosest.x - x) ** 2 +
              (childClosest.y - y) ** 2 +
              (childClosest.z - z) ** 2;
            return { child, dist, index };
          })
          .sort((a, b) => a.dist - b.dist);

        for (const { child } of sortedChildren) {
          searchCell(child);
        }
      }
    };

    searchCell(this.root);

    return nearest;
  }

  /**
   * Find all nodes within a distance
   */
  findInRadius(
    x: number,
    y: number,
    z: number,
    radius: number
  ): OctreeNode<T>[] {
    const results: OctreeNode<T>[] = [];
    if (!this.root) return results;

    const radiusSq = radius * radius;

    const searchCell = (cell: OctreeCell<T>) => {
      // Check if cell intersects sphere
      const closestPoint = new THREE.Vector3(x, y, z).clamp(
        cell.bounds.min,
        cell.bounds.max
      );
      const cellDistSq =
        (closestPoint.x - x) ** 2 +
        (closestPoint.y - y) ** 2 +
        (closestPoint.z - z) ** 2;

      if (cellDistSq > radiusSq) return;

      // Check items
      for (const item of cell.items) {
        const distSq =
          (item.x - x) ** 2 +
          (item.y - y) ** 2 +
          (item.z - z) ** 2;

        if (distSq <= radiusSq) {
          results.push(item);
        }
      }

      // Search children
      if (cell.children) {
        for (const child of cell.children) {
          searchCell(child);
        }
      }
    };

    searchCell(this.root);

    return results;
  }

  /**
   * Find all nodes within a bounding box
   */
  findInBox(box: THREE.Box3): OctreeNode<T>[] {
    const results: OctreeNode<T>[] = [];
    if (!this.root) return results;

    const searchCell = (cell: OctreeCell<T>) => {
      // Check if cell intersects box
      if (!cell.bounds.intersectsBox(box)) return;

      // Check items
      for (const item of cell.items) {
        if (
          item.x >= box.min.x && item.x <= box.max.x &&
          item.y >= box.min.y && item.y <= box.max.y &&
          item.z >= box.min.z && item.z <= box.max.z
        ) {
          results.push(item);
        }
      }

      // Search children
      if (cell.children) {
        for (const child of cell.children) {
          searchCell(child);
        }
      }
    };

    searchCell(this.root);

    return results;
  }

  /**
   * Find all nodes within a view frustum
   */
  findInFrustum(frustum: THREE.Frustum): OctreeNode<T>[] {
    const results: OctreeNode<T>[] = [];
    if (!this.root) return results;

    const searchCell = (cell: OctreeCell<T>) => {
      // Check if cell intersects frustum
      if (!frustum.intersectsBox(cell.bounds)) return;

      // Check items
      for (const item of cell.items) {
        const point = new THREE.Vector3(item.x, item.y, item.z);
        if (frustum.containsPoint(point)) {
          results.push(item);
        }
      }

      // Search children
      if (cell.children) {
        for (const child of cell.children) {
          searchCell(child);
        }
      }
    };

    searchCell(this.root);

    return results;
  }

  /**
   * Update position of a node by index
   */
  updatePosition(index: number, x: number, y: number, z: number): void {
    const node = this.nodeMap.get(index);
    if (!node) return;

    // Update position
    node.x = x;
    node.y = y;
    node.z = z;

    // Note: For now we don't rebalance the tree on updates
    // This is acceptable if positions don't change dramatically
    // For large position changes, rebuild the tree
  }

  /**
   * Get node by index
   */
  getNode(index: number): OctreeNode<T> | undefined {
    return this.nodeMap.get(index);
  }

  /**
   * Get total node count
   */
  getNodeCount(): number {
    return this.nodeCount;
  }

  /**
   * Clear the octree
   */
  clear(): void {
    this.root = null;
    this.nodeMap.clear();
    this.nodeCount = 0;
  }

  /**
   * Get statistics about the octree
   */
  getStats(): {
    depth: number;
    cellCount: number;
    itemsPerCell: number;
    nodeCount: number;
  } {
    let maxDepth = 0;
    let cellCount = 0;
    let totalItems = 0;
    let leafCells = 0;

    const traverse = (cell: OctreeCell<T>) => {
      cellCount++;
      maxDepth = Math.max(maxDepth, cell.depth);

      if (cell.children) {
        for (const child of cell.children) {
          traverse(child);
        }
      } else {
        leafCells++;
        totalItems += cell.items.length;
      }
    };

    if (this.root) {
      traverse(this.root);
    }

    return {
      depth: maxDepth,
      cellCount,
      itemsPerCell: leafCells > 0 ? totalItems / leafCells : 0,
      nodeCount: this.nodeCount
    };
  }
}
