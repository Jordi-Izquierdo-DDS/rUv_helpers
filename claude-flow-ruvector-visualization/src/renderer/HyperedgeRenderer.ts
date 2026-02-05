/**
 * HyperedgeRenderer - Convex hull rendering for node groups in Three.js
 *
 * Renders transparent convex hulls around groups of related nodes (hyperedges).
 * Supports memory type groups, category groups, and agent groups.
 * Uses ConvexGeometry from Three.js addons for 3D hull generation.
 */

import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES AND INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Types of hyperedge groupings supported
 */
export type HyperedgeType = 'memory_group' | 'category_group' | 'agent_group';

/**
 * Hyperedge data structure representing a group of related nodes
 */
export interface Hyperedge {
  /** Unique identifier for the hyperedge */
  id: string;
  /** Type of grouping */
  type: HyperedgeType;
  /** Display label for the hyperedge */
  label: string;
  /** Array of node IDs that belong to this group */
  members: string[];
  /** Color for the hull (CSS hex format, e.g., '#3498DB') */
  color: string;
}

/**
 * Position data for a node
 */
export interface NodePosition {
  x: number;
  y: number;
  z: number;
}

/**
 * Internal hull data structure for efficient management
 */
interface HullData {
  hyperedge: Hyperedge;
  mesh: THREE.Mesh;
  wireframe: THREE.LineSegments | null;
  material: THREE.MeshBasicMaterial;
  wireframeMaterial: THREE.LineBasicMaterial | null;
  lastPositionHash: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// COLOR PALETTE FOR MEMORY TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Default color palette for memory types
 * Used when hyperedge doesn't specify a color
 */
export const MEMORY_TYPE_COLORS: Record<string, string> = {
  command: '#3498DB',
  adr: '#E74C3C',
  edit: '#2ECC71',
  file_access: '#F39C12',
  neural_general: '#9B59B6',
  search_pattern: '#1ABC9C',
  task: '#E67E22',
  action: '#34495E'
};

/**
 * Get color for a memory type, with fallback to a default gray
 */
export function getMemoryTypeColor(memoryType: string): string {
  return MEMORY_TYPE_COLORS[memoryType] || '#7F8C8D';
}

// ═══════════════════════════════════════════════════════════════════════════
// HYPEREDGE RENDERER CLASS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Renderer for hyperedge convex hulls in Three.js scene.
 *
 * Hyperedges represent groupings of nodes (e.g., by memory type, category, or agent).
 * They are visualized as transparent convex hulls surrounding the member nodes.
 *
 * @example
 * ```typescript
 * const renderer = new HyperedgeRenderer(scene);
 *
 * const hyperedges: Hyperedge[] = [
 *   { id: 'command-group', type: 'memory_group', label: 'Commands', members: ['n1', 'n2', 'n3', 'n4'], color: '#3498DB' }
 * ];
 *
 * const positions = new Map([
 *   ['n1', { x: 0, y: 0, z: 0 }],
 *   ['n2', { x: 10, y: 0, z: 0 }],
 *   ['n3', { x: 0, y: 10, z: 0 }],
 *   ['n4', { x: 0, y: 0, z: 10 }]
 * ]);
 *
 * renderer.createHulls(hyperedges, positions);
 * ```
 */
export class HyperedgeRenderer {
  private scene: THREE.Scene;
  private hulls: Map<string, HullData> = new Map();
  private visible: boolean = false;  // Start hidden - user can toggle on
  private opacity: number = 0.05;    // Very subtle - 5% opacity
  private showWireframe: boolean = false;
  private wireframeOpacity: number = 0.2;

  /** Minimum number of members required to create a 3D convex hull */
  private static readonly MIN_MEMBERS_FOR_HULL = 4;

  /** Throttle interval for position updates (milliseconds) */
  private static readonly UPDATE_THROTTLE_MS = 100; // 10fps

  /** Last update timestamp for throttling */
  private lastUpdateTime: number = 0;

  /** Padding factor applied to hull vertices to create visual separation */
  private hullPadding: number = 5;

  /**
   * Create a new HyperedgeRenderer
   *
   * @param scene - The Three.js scene to add hulls to
   */
  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /**
   * Create or update convex hulls from hyperedge data.
   * Removes existing hulls that are no longer in the data.
   * Only creates hulls for groups with 4+ members (required for 3D convex hull).
   *
   * @param hyperedges - Array of hyperedge definitions
   * @param nodePositions - Map of node ID to position
   */
  createHulls(hyperedges: Hyperedge[], nodePositions: Map<string, NodePosition>): void {
    // Track which hulls should exist
    const validHullIds = new Set<string>();

    for (const hyperedge of hyperedges) {
      // Skip groups with fewer than 4 members (can't form 3D convex hull)
      if (hyperedge.members.length < HyperedgeRenderer.MIN_MEMBERS_FOR_HULL) {
        continue;
      }

      validHullIds.add(hyperedge.id);

      // Get positions for all members
      const positions = this.getMemberPositions(hyperedge.members, nodePositions);

      // Need at least 4 valid positions for convex hull
      if (positions.length < HyperedgeRenderer.MIN_MEMBERS_FOR_HULL) {
        continue;
      }

      // Check if hull already exists
      const existingHull = this.hulls.get(hyperedge.id);

      if (existingHull) {
        // Update existing hull if membership or color changed
        const membershipChanged = !this.areMembersEqual(existingHull.hyperedge.members, hyperedge.members);
        const colorChanged = existingHull.hyperedge.color !== hyperedge.color;

        if (membershipChanged || colorChanged) {
          this.removeHull(hyperedge.id);
          this.createHull(hyperedge, positions);
        } else {
          // Just update positions
          this.updateHullPositions(hyperedge.id, positions);
        }
      } else {
        // Create new hull
        this.createHull(hyperedge, positions);
      }
    }

    // Remove hulls that are no longer in the data
    const hullIdsToRemove: string[] = [];
    for (const hullId of this.hulls.keys()) {
      if (!validHullIds.has(hullId)) {
        hullIdsToRemove.push(hullId);
      }
    }

    for (const hullId of hullIdsToRemove) {
      this.removeHull(hullId);
    }

    console.log(`HyperedgeRenderer: Created/updated ${this.hulls.size} hulls from ${hyperedges.length} hyperedges`);
  }

  /**
   * Update hull positions when nodes move.
   * Throttled to 10fps for performance.
   *
   * @param nodePositions - Map of node ID to position
   */
  updatePositions(nodePositions: Map<string, NodePosition>): void {
    const now = Date.now();

    // Throttle updates to 10fps
    if (now - this.lastUpdateTime < HyperedgeRenderer.UPDATE_THROTTLE_MS) {
      return;
    }

    this.lastUpdateTime = now;

    for (const [hullId, hullData] of this.hulls) {
      const positions = this.getMemberPositions(hullData.hyperedge.members, nodePositions);

      if (positions.length >= HyperedgeRenderer.MIN_MEMBERS_FOR_HULL) {
        // Check if positions changed significantly
        const positionHash = this.computePositionHash(positions);

        if (positionHash !== hullData.lastPositionHash) {
          this.updateHullGeometry(hullId, positions);
          hullData.lastPositionHash = positionHash;
        }
      }
    }
  }

  /**
   * Toggle visibility of all hulls
   *
   * @param visible - Whether hulls should be visible
   */
  setVisible(visible: boolean): void {
    this.visible = visible;

    for (const hullData of this.hulls.values()) {
      hullData.mesh.visible = visible;
      if (hullData.wireframe) {
        hullData.wireframe.visible = visible && this.showWireframe;
      }
    }
  }

  /**
   * Set opacity for all hulls
   *
   * @param opacity - Opacity value between 0 and 1
   */
  setOpacity(opacity: number): void {
    this.opacity = Math.max(0, Math.min(1, opacity));

    for (const hullData of this.hulls.values()) {
      hullData.material.opacity = this.opacity;
      hullData.material.needsUpdate = true;
    }
  }

  /**
   * Enable or disable wireframe rendering for hull edges
   *
   * @param show - Whether to show wireframes
   * @param opacity - Optional wireframe opacity (0-1)
   */
  setWireframe(show: boolean, opacity?: number): void {
    this.showWireframe = show;

    if (opacity !== undefined) {
      this.wireframeOpacity = Math.max(0, Math.min(1, opacity));
    }

    for (const hullData of this.hulls.values()) {
      if (show) {
        if (!hullData.wireframe) {
          // Create wireframe if it doesn't exist
          this.addWireframeToHull(hullData);
        }
        if (hullData.wireframe) {
          hullData.wireframe.visible = this.visible;
          if (hullData.wireframeMaterial) {
            hullData.wireframeMaterial.opacity = this.wireframeOpacity;
          }
        }
      } else if (hullData.wireframe) {
        hullData.wireframe.visible = false;
      }
    }
  }

  /**
   * Set padding applied to hull vertices
   *
   * @param padding - Padding value in world units
   */
  setHullPadding(padding: number): void {
    this.hullPadding = Math.max(0, padding);
  }

  /**
   * Get hull data for a specific hyperedge
   *
   * @param hyperedgeId - ID of the hyperedge
   * @returns Hull data or undefined if not found
   */
  getHull(hyperedgeId: string): HullData | undefined {
    return this.hulls.get(hyperedgeId);
  }

  /**
   * Get all hull IDs
   *
   * @returns Array of hyperedge IDs that have hulls
   */
  getHullIds(): string[] {
    return Array.from(this.hulls.keys());
  }

  /**
   * Get number of active hulls
   *
   * @returns Count of currently rendered hulls
   */
  getHullCount(): number {
    return this.hulls.size;
  }

  /**
   * Highlight a specific hull
   *
   * @param hyperedgeId - ID of the hyperedge to highlight
   * @param highlight - Whether to highlight or unhighlight
   */
  setHighlight(hyperedgeId: string, highlight: boolean): void {
    const hullData = this.hulls.get(hyperedgeId);
    if (!hullData) return;

    if (highlight) {
      hullData.material.opacity = Math.min(this.opacity * 2.5, 0.4);
      if (hullData.wireframeMaterial) {
        hullData.wireframeMaterial.opacity = Math.min(this.wireframeOpacity * 2, 0.8);
      }
    } else {
      hullData.material.opacity = this.opacity;
      if (hullData.wireframeMaterial) {
        hullData.wireframeMaterial.opacity = this.wireframeOpacity;
      }
    }

    hullData.material.needsUpdate = true;
    if (hullData.wireframeMaterial) {
      hullData.wireframeMaterial.needsUpdate = true;
    }
  }

  /**
   * Clear highlight from all hulls
   */
  clearHighlights(): void {
    for (const hullData of this.hulls.values()) {
      hullData.material.opacity = this.opacity;
      hullData.material.needsUpdate = true;
      if (hullData.wireframeMaterial) {
        hullData.wireframeMaterial.opacity = this.wireframeOpacity;
        hullData.wireframeMaterial.needsUpdate = true;
      }
    }
  }

  /**
   * Dispose of all resources and clean up
   */
  dispose(): void {
    for (const hullId of Array.from(this.hulls.keys())) {
      this.removeHull(hullId);
    }
    this.hulls.clear();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create a new hull for a hyperedge
   */
  private createHull(hyperedge: Hyperedge, positions: THREE.Vector3[]): void {
    // Apply padding to expand hull slightly
    const paddedPositions = this.applyPadding(positions);

    // Create convex geometry
    let geometry: THREE.BufferGeometry;
    try {
      geometry = new ConvexGeometry(paddedPositions);
    } catch {
      // ConvexGeometry can fail with degenerate point sets
      console.warn(`HyperedgeRenderer: Failed to create convex hull for ${hyperedge.id}`);
      return;
    }

    // Parse color from hyperedge or use default
    const color = this.parseColor(hyperedge.color);

    // Create transparent material
    const material = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: this.opacity,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    // Create mesh
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = -10; // Render behind nodes and edges
    mesh.visible = this.visible;

    this.scene.add(mesh);

    // Store hull data
    const hullData: HullData = {
      hyperedge: { ...hyperedge },
      mesh,
      wireframe: null,
      material,
      wireframeMaterial: null,
      lastPositionHash: this.computePositionHash(positions)
    };

    // Add wireframe if enabled
    if (this.showWireframe) {
      this.addWireframeToHull(hullData);
    }

    this.hulls.set(hyperedge.id, hullData);
  }

  /**
   * Add wireframe edges to a hull
   */
  private addWireframeToHull(hullData: HullData): void {
    const wireframeGeometry = new THREE.EdgesGeometry(hullData.mesh.geometry);
    const wireframeMaterial = new THREE.LineBasicMaterial({
      color: hullData.material.color,
      transparent: true,
      opacity: this.wireframeOpacity,
      depthWrite: false
    });

    const wireframe = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);
    wireframe.frustumCulled = false;
    wireframe.renderOrder = -9; // Render slightly after fill
    wireframe.visible = this.visible;

    this.scene.add(wireframe);

    hullData.wireframe = wireframe;
    hullData.wireframeMaterial = wireframeMaterial;
  }

  /**
   * Update hull geometry with new positions
   */
  private updateHullGeometry(hullId: string, positions: THREE.Vector3[]): void {
    const hullData = this.hulls.get(hullId);
    if (!hullData) return;

    // Apply padding
    const paddedPositions = this.applyPadding(positions);

    // Create new geometry
    let newGeometry: THREE.BufferGeometry;
    try {
      newGeometry = new ConvexGeometry(paddedPositions);
    } catch {
      // Keep existing geometry if new one fails
      return;
    }

    // Dispose old geometry
    hullData.mesh.geometry.dispose();

    // Apply new geometry
    hullData.mesh.geometry = newGeometry;

    // Update wireframe if present
    if (hullData.wireframe) {
      hullData.wireframe.geometry.dispose();
      hullData.wireframe.geometry = new THREE.EdgesGeometry(newGeometry);
    }
  }

  /**
   * Update hull positions (called when membership hasn't changed)
   */
  private updateHullPositions(hullId: string, positions: THREE.Vector3[]): void {
    const hullData = this.hulls.get(hullId);
    if (!hullData) return;

    // Check if positions changed significantly
    const positionHash = this.computePositionHash(positions);

    if (positionHash !== hullData.lastPositionHash) {
      this.updateHullGeometry(hullId, positions);
      hullData.lastPositionHash = positionHash;
    }
  }

  /**
   * Remove a hull and clean up resources
   */
  private removeHull(hullId: string): void {
    const hullData = this.hulls.get(hullId);
    if (!hullData) return;

    // Remove mesh
    this.scene.remove(hullData.mesh);
    hullData.mesh.geometry.dispose();
    hullData.material.dispose();

    // Remove wireframe if present
    if (hullData.wireframe) {
      this.scene.remove(hullData.wireframe);
      hullData.wireframe.geometry.dispose();
    }
    if (hullData.wireframeMaterial) {
      hullData.wireframeMaterial.dispose();
    }

    this.hulls.delete(hullId);
  }

  /**
   * Get positions for member nodes, filtering out missing nodes
   */
  private getMemberPositions(members: string[], nodePositions: Map<string, NodePosition>): THREE.Vector3[] {
    const positions: THREE.Vector3[] = [];

    for (const memberId of members) {
      const pos = nodePositions.get(memberId);
      if (pos && isFinite(pos.x) && isFinite(pos.y) && isFinite(pos.z)) {
        positions.push(new THREE.Vector3(pos.x, pos.y, pos.z));
      }
    }

    return positions;
  }

  /**
   * Apply padding to expand hull vertices outward from center
   */
  private applyPadding(positions: THREE.Vector3[]): THREE.Vector3[] {
    if (this.hullPadding <= 0 || positions.length === 0) {
      return positions;
    }

    // Calculate centroid
    const centroid = new THREE.Vector3();
    for (const pos of positions) {
      centroid.add(pos);
    }
    centroid.divideScalar(positions.length);

    // Expand each vertex away from centroid
    return positions.map(pos => {
      const direction = new THREE.Vector3().subVectors(pos, centroid);
      const length = direction.length();

      if (length > 0) {
        direction.normalize();
        return pos.clone().add(direction.multiplyScalar(this.hullPadding));
      }

      return pos.clone();
    });
  }

  /**
   * Compute a simple hash of positions for change detection
   */
  private computePositionHash(positions: THREE.Vector3[]): string {
    // Round to reduce false positives from floating point noise
    const precision = 10;
    return positions
      .map(p => `${Math.round(p.x * precision)},${Math.round(p.y * precision)},${Math.round(p.z * precision)}`)
      .sort()
      .join('|');
  }

  /**
   * Check if two member arrays are equal
   */
  private areMembersEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;

    const sortedA = [...a].sort();
    const sortedB = [...b].sort();

    for (let i = 0; i < sortedA.length; i++) {
      if (sortedA[i] !== sortedB[i]) return false;
    }

    return true;
  }

  /**
   * Parse color string to THREE.Color-compatible number
   */
  private parseColor(colorStr: string): number {
    // Handle hex colors (e.g., '#3498DB' or '3498DB')
    const hex = colorStr.replace('#', '');
    const parsed = parseInt(hex, 16);

    if (isFinite(parsed)) {
      return parsed;
    }

    // Fallback to gray
    return 0x7F8C8D;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create hyperedges from node data grouped by memory type.
 * Utility function to generate hyperedges from raw node data.
 *
 * @param nodes - Array of nodes with memoryType and id properties
 * @returns Array of hyperedges grouped by memory type
 */
export function createMemoryTypeHyperedges(
  nodes: Array<{ id: string; memoryType?: string }>
): Hyperedge[] {
  const groups = new Map<string, string[]>();

  for (const node of nodes) {
    const memoryType = node.memoryType || 'unknown';
    const members = groups.get(memoryType) || [];
    members.push(node.id);
    groups.set(memoryType, members);
  }

  const hyperedges: Hyperedge[] = [];

  for (const [memoryType, members] of groups) {
    hyperedges.push({
      id: `memory_group_${memoryType}`,
      type: 'memory_group',
      label: memoryType,
      members,
      color: getMemoryTypeColor(memoryType)
    });
  }

  return hyperedges;
}

/**
 * Create hyperedges from node data grouped by category.
 *
 * @param nodes - Array of nodes with category and id properties
 * @returns Array of hyperedges grouped by category
 */
export function createCategoryHyperedges(
  nodes: Array<{ id: string; category?: string }>
): Hyperedge[] {
  const groups = new Map<string, string[]>();

  for (const node of nodes) {
    if (!node.category) continue;

    const members = groups.get(node.category) || [];
    members.push(node.id);
    groups.set(node.category, members);
  }

  const hyperedges: Hyperedge[] = [];
  const categoryColors: Record<string, string> = {
    code: '#3B82F6',
    architecture: '#8B5CF6',
    security: '#EF4444',
    error: '#F59E0B',
    test: '#10B981'
  };

  for (const [category, members] of groups) {
    hyperedges.push({
      id: `category_group_${category}`,
      type: 'category_group',
      label: category,
      members,
      color: categoryColors[category] || '#6B7280'
    });
  }

  return hyperedges;
}

/**
 * Create hyperedges from node data grouped by agent.
 *
 * @param nodes - Array of nodes with agent and id properties
 * @returns Array of hyperedges grouped by agent
 */
export function createAgentHyperedges(
  nodes: Array<{ id: string; agent?: string }>
): Hyperedge[] {
  const groups = new Map<string, string[]>();

  for (const node of nodes) {
    if (!node.agent) continue;

    const members = groups.get(node.agent) || [];
    members.push(node.id);
    groups.set(node.agent, members);
  }

  const hyperedges: Hyperedge[] = [];

  // Generate distinct colors for agents using golden ratio
  const agentList = Array.from(groups.keys());
  const goldenRatio = 0.618033988749895;

  for (let i = 0; i < agentList.length; i++) {
    const agent = agentList[i];
    const members = groups.get(agent)!;

    // Generate hue using golden ratio for good distribution
    const hue = (i * goldenRatio) % 1;
    const color = hslToHex(hue, 0.7, 0.5);

    hyperedges.push({
      id: `agent_group_${agent}`,
      type: 'agent_group',
      label: agent,
      members,
      color
    });
  }

  return hyperedges;
}

/**
 * Convert HSL to hex color string
 */
function hslToHex(h: number, s: number, l: number): string {
  const hueToRgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  const r = Math.round(hueToRgb(p, q, h + 1/3) * 255);
  const g = Math.round(hueToRgb(p, q, h) * 255);
  const b = Math.round(hueToRgb(p, q, h - 1/3) * 255);

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
