/**
 * EdgeRenderer - LineSegments-based edge rendering for Three.js
 *
 * Uses BufferGeometry with LineSegments for efficient rendering of millions of edges.
 * Supports separate rendering for deterministic and semantic edge groups.
 * Features per-edge dash styling, coloring, and width based on edge type.
 */

import * as THREE from 'three';
import {
  EdgeGroup,
  COLORS,
  RENDER_CONFIG,
  getEdgeGroup,
  hexToRGB,
  type GraphNode,
  type GraphEdge,
  type GPUEdgeData,
  type EdgeGroupSettings
} from '../config/Constants';

// Import shaders
import edgeVertShader from './shaders/edge.vert.glsl?raw';
import edgeFragShader from './shaders/edge.frag.glsl?raw';

// ═══════════════════════════════════════════════════════════════════════════
// EDGE TYPE STYLING CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Edge dash styles: 0 = solid, 1 = dashed, 2 = dotted
 */
export enum EdgeDashStyle {
  SOLID = 0,
  DASHED = 1,
  DOTTED = 2
}

/**
 * Edge type to dash style mapping per SSOT (RUVECTOR-MEMORY-ARCHITECTURE_VIZ.md)
 *
 * Visual Style by Nature:
 * - SOLID: Explicit structural relationships (co_edit, trajectory-*, explicit)
 * - DASHED: Pattern/learned relationships (Q-learning, same-* groupings)
 * - DOTTED: Semantic/inferred relationships (embedding-based, content-based inference)
 */
const EDGE_TYPE_DASH_STYLES: Record<string, EdgeDashStyle> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // SOLID: Explicit structural/temporal relationships (DETERMINISTIC)
  // ═══════════════════════════════════════════════════════════════════════════
  'co_edit': EdgeDashStyle.SOLID,
  'coedit': EdgeDashStyle.SOLID,
  'trajectory-memory': EdgeDashStyle.SOLID,
  'trajectory-sequence': EdgeDashStyle.SOLID,
  'explicit': EdgeDashStyle.SOLID,
  'sequence': EdgeDashStyle.SOLID,
  'test_pair': EdgeDashStyle.SOLID,
  'memory-agent': EdgeDashStyle.SOLID,  // Exact agent name match

  // ═══════════════════════════════════════════════════════════════════════════
  // DASHED: Pattern/learned relationships (DETERMINISTIC - Q-learning based)
  // ═══════════════════════════════════════════════════════════════════════════
  'pattern': EdgeDashStyle.DASHED,
  'pattern_produces': EdgeDashStyle.DASHED,
  'same-state-prefix': EdgeDashStyle.DASHED,
  'same-action': EdgeDashStyle.DASHED,
  'same-state': EdgeDashStyle.DASHED,
  'same-agent': EdgeDashStyle.DASHED,
  'success-cluster': EdgeDashStyle.DASHED,
  'failure-cluster': EdgeDashStyle.DASHED,
  'trajectory-action': EdgeDashStyle.DASHED,
  'trajectory-outcome': EdgeDashStyle.DASHED,

  // ═══════════════════════════════════════════════════════════════════════════
  // DOTTED: Semantic/inferred relationships (SEMANTIC by nature)
  // ═══════════════════════════════════════════════════════════════════════════
  'semantic': EdgeDashStyle.DOTTED,
  'semantic_similar': EdgeDashStyle.DOTTED,
  'semantic_bridge': EdgeDashStyle.DOTTED,
  'embedding': EdgeDashStyle.DOTTED,
  // Content-based inference (semantic by nature)
  'content-match': EdgeDashStyle.DOTTED,
  'type-mapping': EdgeDashStyle.DOTTED,
  'cross-type': EdgeDashStyle.DOTTED,
  'memory-context': EdgeDashStyle.DOTTED,  // Word overlap inference
  // Namespace/source inference
  'same-namespace': EdgeDashStyle.DOTTED,
  'same-source': EdgeDashStyle.DOTTED,
  'knn-bridge': EdgeDashStyle.DOTTED,

  // ═══════════════════════════════════════════════════════════════════════════
  // FIX-016: Foundation knowledge graph relation types
  // ═══════════════════════════════════════════════════════════════════════════
  'references': EdgeDashStyle.SOLID,     // Medium solid — ADR cross-references
  'details': EdgeDashStyle.SOLID,        // Medium solid — summary-to-detail
  'learned_from': EdgeDashStyle.SOLID,   // Thick solid — pattern-to-file
  'about_file': EdgeDashStyle.DASHED,    // Medium dashed — memory-to-file
  'extends': EdgeDashStyle.SOLID,        // Medium solid — ADR extension
  'supersedes': EdgeDashStyle.DASHED,    // Medium dashed — ADR replacement
  'instance_of': EdgeDashStyle.DOTTED,   // Dotted — agent hierarchy
  'coordinates': EdgeDashStyle.DOTTED,   // Dotted arrow — queen-to-worker

  // RC-2: Q-pattern routing
  'routes_to': EdgeDashStyle.SOLID,      // Thick arrow — Q-pattern → file routing

  // New structural edge types (Q-pattern/trajectory decomposition)
  'has_state': EdgeDashStyle.SOLID,       // Q-pattern → state
  'has_action': EdgeDashStyle.SOLID,      // Q-pattern → action
  'is_agent': EdgeDashStyle.SOLID,        // Action → agent
  'trajectory-agent': EdgeDashStyle.SOLID, // Trajectory → agent
  'trajectory-neural': EdgeDashStyle.SOLID // Trajectory → neural pattern
};

/**
 * Edge type to color mapping (hex values)
 * Per SSOT Section 11.7 Color Palette:
 * - Co-Edit Edge: #4A90D9 (blue) - Deterministic
 * - Semantic Edge: #9B59B6 (purple) - Semantic
 * - Pattern Edge: Gradient #FF0000 → #00FF00 by Q-value
 */
const EDGE_TYPE_COLORS: Record<string, number> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // DETERMINISTIC EDGES
  // ═══════════════════════════════════════════════════════════════════════════

  // Co-edit edges: blue (per SSOT 11.7)
  'co_edit': 0x4A90D9,
  'coedit': 0x4A90D9,

  // Trajectory edges: brown/amber
  'trajectory-memory': 0x795548,
  'trajectory-sequence': 0x795548,
  'trajectory-action': 0x795548,
  'trajectory-outcome': 0x795548,

  // Pattern edges: gradient computed dynamically (red→green by Q-value per SSOT 11.7)
  // Base color is yellow-green (gradient midpoint)
  'pattern': 0x808000,
  'pattern_produces': 0x808000,

  // Same-* structural edges: teal
  'same-state': 0x14B8A6,
  'same-action': 0x14B8A6,
  'same-state-prefix': 0x14B8A6,
  'same-agent': 0x14B8A6,

  // Explicit structure edges: green
  'explicit': 0x10B981,
  'sequence': 0x10B981,
  'test_pair': 0x10B981,
  'memory-agent': 0x10B981,

  // Cluster edges: success=green, failure=red
  'success-cluster': 0x22C55E,
  'failure-cluster': 0xEF4444,

  // ═══════════════════════════════════════════════════════════════════════════
  // SEMANTIC EDGES (purple tones per SSOT 11.7)
  // ═══════════════════════════════════════════════════════════════════════════

  // Embedding-based semantic: purple
  'semantic': 0x9B59B6,
  'semantic_similar': 0x9B59B6,
  'semantic_bridge': 0x9B59B6,
  'embedding': 0x9B59B6,

  // Content-based inference: lighter purple
  'content-match': 0xA855F7,
  'type-mapping': 0xA855F7,
  'cross-type': 0xA855F7,
  'memory-context': 0xA855F7,

  // Namespace inference: cyan-purple
  'same-namespace': 0x8B5CF6,
  'same-source': 0x8B5CF6,
  'knn-bridge': 0x8B5CF6,

  // ═══════════════════════════════════════════════════════════════════════════
  // FIX-016: Foundation knowledge graph relation types
  // ═══════════════════════════════════════════════════════════════════════════
  'references': 0xF59E0B,        // Orange — ADR cross-references
  'details': 0x8B5CF6,           // Purple — summary-to-detail link
  'learned_from': 0x10B981,      // Green — pattern-to-file learning
  'about_file': 0x14B8A6,        // Teal — memory-to-file
  'extends': 0x06B6D4,           // Cyan — ADR extension
  'supersedes': 0xDC2626,        // Dark red — ADR replacement

  // RC-2: Q-pattern routing
  'routes_to': 0xD946EF,         // Magenta — Q-pattern → file routing

  // New structural edge types (Q-pattern/trajectory decomposition)
  'has_state': 0x22D3EE,         // Cyan — Q-pattern → state
  'has_action': 0x10B981,        // Green — Q-pattern → action
  'is_agent': 0x34495E,          // Dark gray-blue — action → agent
  'trajectory-agent': 0xF59E0B,  // Amber — trajectory → agent
  'trajectory-neural': 0x9B59B6  // Purple — trajectory → neural pattern
};

/**
 * Extended GraphEdge interface with additional properties for visualization
 */
interface ExtendedGraphEdge extends GraphEdge {
  qValue?: number;
  visits?: number;
  similarity?: number;
}

/**
 * Get dash style for an edge type
 */
function getEdgeDashStyle(type: string | undefined): EdgeDashStyle {
  if (!type) return EdgeDashStyle.SOLID;
  return EDGE_TYPE_DASH_STYLES[type] ?? EdgeDashStyle.SOLID;
}

/**
 * Get color for an edge type, with optional q_value gradient for pattern edges
 * Per SSOT (RUVECTOR-MEMORY-ARCHITECTURE_VIZ.md Section 11.7):
 * - Pattern Edge: Gradient #FF0000 → #00FF00 by Q-value (red to green)
 */
function getEdgeTypeColor(edge: ExtendedGraphEdge): [number, number, number] {
  const type = edge.type || 'semantic';

  // Handle pattern edges with q_value gradient per SSOT Section 11.7
  if (type === 'pattern' || type === 'pattern_produces') {
    const qValue = edge.qValue ?? 0.5;
    // Gradient from red (low q) to green (high q) per SSOT
    const lowColor = hexToRGB(0xFF0000);  // Red (low Q-value)
    const highColor = hexToRGB(0x00FF00); // Green (high Q-value)
    return [
      lowColor[0] + (highColor[0] - lowColor[0]) * qValue,
      lowColor[1] + (highColor[1] - lowColor[1]) * qValue,
      lowColor[2] + (highColor[2] - lowColor[2]) * qValue
    ];
  }

  // Use type-specific color or fall back to default
  const colorHex = EDGE_TYPE_COLORS[type];
  if (colorHex !== undefined) {
    return hexToRGB(colorHex);
  }

  // Fall back to group-based color
  const group = getEdgeGroup(type);
  return group === EdgeGroup.DETERMINISTIC
    ? hexToRGB(COLORS.edges.deterministic)
    : hexToRGB(COLORS.edges.semantic);
}

/**
 * Calculate width for an edge based on its type and properties
 */
function calculateEdgeWidth(edge: ExtendedGraphEdge): number {
  const type = edge.type || 'semantic';
  const weight = edge.weight ?? 0.5;

  // Width scaling by edge type per SPARC implementation
  switch (type) {
    case 'co_edit':
    case 'coedit':
      // co_edit: weight * 5
      return weight * 5;

    case 'semantic':
    case 'semantic_similar':
    case 'semantic_bridge':
    case 'embedding':
      // semantic: 0.5 + similarity * 2
      const similarity = edge.similarity ?? edge.weight ?? 0.5;
      return 0.5 + similarity * 2;

    case 'pattern':
    case 'pattern_produces':
      // pattern: 1 + log(visits + 1)
      const visits = edge.visits ?? 1;
      return 1 + Math.log(visits + 1);

    case 'trajectory-memory':
    case 'trajectory-sequence':
    case 'trajectory-action':
    case 'trajectory-outcome':
      // trajectory: fixed width 2
      return 2;

    // FIX-016: Foundation knowledge graph edge widths
    case 'learned_from':
    case 'routes_to':
      // Thick (per VIZ doc) — co_edit already handled above
      return 3;

    case 'references':
    case 'details':
    case 'about_file':
    case 'extends':
    case 'supersedes':
      // Medium (per VIZ doc)
      return 2;

    case 'instance_of':
    case 'coordinates':
      // Thin dotted (per VIZ doc)
      return 1.5;

    default:
      // Default: use weight for width scaling
      return RENDER_CONFIG.edge.baseWidth * (0.5 + weight * 0.5);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EDGE RENDERER CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class EdgeRenderer {
  private scene: THREE.Scene;

  // Separate line segments for each edge group
  private deterministicLines: THREE.LineSegments | null = null;
  private semanticLines: THREE.LineSegments | null = null;

  // Materials
  private deterministicMaterial: THREE.ShaderMaterial | null = null;
  private semanticMaterial: THREE.ShaderMaterial | null = null;

  // GPU data
  private gpuData: GPUEdgeData | null = null;
  private edgeCount = 0;
  private deterministicCount = 0;
  private semanticCount = 0;

  // Edge indices mapping
  private edgeToGroup: Map<number, { group: EdgeGroup; index: number }> = new Map();

  // Current settings
  private settings = {
    deterministic: {
      opacity: RENDER_CONFIG.edge.opacity.deterministic,
      width: RENDER_CONFIG.edge.baseWidth,
      color: COLORS.edges.deterministic,
      glow: true,
      visible: true,
      style: 'solid' as 'solid' | 'dashed' | 'dotted',
      widthMode: 'fixed' as 'fixed' | 'similarity' | 'weight',
      useTypeColors: true,
      useTypeStyles: true
    },
    semantic: {
      opacity: RENDER_CONFIG.edge.opacity.semantic,
      width: RENDER_CONFIG.edge.baseWidth * 0.5,
      color: COLORS.edges.semantic,
      glow: false,
      visible: true,
      style: 'solid' as 'solid' | 'dashed' | 'dotted',
      widthMode: 'fixed' as 'fixed' | 'similarity' | 'weight',
      useTypeColors: true,
      useTypeStyles: true
    }
  };

  // Store edges for width updates
  private deterministicEdgesData: ExtendedGraphEdge[] = [];
  private semanticEdgesData: ExtendedGraphEdge[] = [];

  // Store all edges for type-based filtering
  private allEdgesData: ExtendedGraphEdge[] = [];
  private hiddenEdgeTypes: Set<string> = new Set();

  // Highlight state: stored original colors for restoration
  private highlightActive = false;
  private deterministicOriginalColors: Float32Array | null = null;
  private semanticOriginalColors: Float32Array | null = null;

  // Fog settings for "historical obsolescence" effect in 3D mode
  private fogEnabled = true;
  private fogSphereRadius = 800;
  private fogCoreRadius = 100;
  private fogStrength = 0.5;  // 0.5 = center is 50% visible
  private viewMode: '2d' | '2.5d' | '3d' = '2d';

  // 3D curved edge geometry (separate LineSegments with subdivided arcs)
  private static readonly SEGMENTS_3D = 8;
  private deterministicLines3D: THREE.LineSegments | null = null;
  private semanticLines3D: THREE.LineSegments | null = null;
  private deterministicMaterial3D: THREE.ShaderMaterial | null = null;
  private semanticMaterial3D: THREE.ShaderMaterial | null = null;
  private curved3DBuilt = false;
  private arcPointsBuffer: Float32Array;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.arcPointsBuffer = new Float32Array((EdgeRenderer.SEGMENTS_3D + 1) * 3);
  }

  /**
   * Set edges from graph data
   */
  setEdges(edges: GraphEdge[], nodes: GraphNode[]): void {
    // Clean up existing
    this.dispose();

    this.edgeCount = edges.length;
    this.edgeToGroup.clear();

    // Separate edges by group (use server-provided group, fallback to type-based)
    const deterministicEdges: ExtendedGraphEdge[] = [];
    const semanticEdges: ExtendedGraphEdge[] = [];

    edges.forEach((edge, i) => {
      // Use server-provided group, fallback to getEdgeGroup for backwards compatibility
      const group = edge.group === 'deterministic' ? EdgeGroup.DETERMINISTIC :
                    edge.group === 'semantic' ? EdgeGroup.SEMANTIC :
                    getEdgeGroup(edge.type || 'semantic');
      edge.group = group;

      if (group === EdgeGroup.DETERMINISTIC) {
        this.edgeToGroup.set(i, { group, index: deterministicEdges.length });
        deterministicEdges.push(edge as ExtendedGraphEdge);
      } else {
        this.edgeToGroup.set(i, { group, index: semanticEdges.length });
        semanticEdges.push(edge as ExtendedGraphEdge);
      }
    });

    this.deterministicCount = deterministicEdges.length;
    this.semanticCount = semanticEdges.length;

    // Allocate GPU data
    this.gpuData = {
      positions: new Float32Array(edges.length * 6), // 2 vertices * 3 components per edge
      colors: new Float32Array(edges.length * 6),    // 2 vertices * 3 components per edge
      sourceIndices: new Uint32Array(edges.length),
      targetIndices: new Uint32Array(edges.length),
      groups: new Uint8Array(edges.length),
      visible: new Uint8Array(edges.length)
    };

    // Store for later updates
    this.deterministicEdgesData = deterministicEdges;
    this.semanticEdgesData = semanticEdges;
    this.allEdgesData = edges as ExtendedGraphEdge[];

    // Create line segments for each group
    if (deterministicEdges.length > 0) {
      this.deterministicLines = this.createLineSegments(
        deterministicEdges,
        nodes,
        EdgeGroup.DETERMINISTIC
      );
      this.deterministicLines.renderOrder = 0;  // Render edges first
      this.scene.add(this.deterministicLines);
    }

    if (semanticEdges.length > 0) {
      this.semanticLines = this.createLineSegments(
        semanticEdges,
        nodes,
        EdgeGroup.SEMANTIC
      );
      this.semanticLines.renderOrder = 0;  // Render edges first
      this.scene.add(this.semanticLines);
    }

    // Store indices for position updates
    edges.forEach((edge, i) => {
      const sourceIdx = typeof edge.source === 'number' ? edge.source :
        (edge.source as GraphNode).nodeIndex ?? 0;
      const targetIdx = typeof edge.target === 'number' ? edge.target :
        (edge.target as GraphNode).nodeIndex ?? 0;

      this.gpuData!.sourceIndices[i] = sourceIdx;
      this.gpuData!.targetIndices[i] = targetIdx;
      this.gpuData!.groups[i] = edge.group === EdgeGroup.DETERMINISTIC ? 0 : 1;
      this.gpuData!.visible[i] = 1;
    });

    console.log(`EdgeRenderer: Set ${edges.length} edges (${this.deterministicCount} deterministic, ${this.semanticCount} semantic)`);
  }

  /**
   * Create LineSegments for a group of edges with per-edge styling
   */
  private createLineSegments(
    edges: ExtendedGraphEdge[],
    nodes: GraphNode[],
    group: EdgeGroup
  ): THREE.LineSegments {
    const positions = new Float32Array(edges.length * 6);
    const colors = new Float32Array(edges.length * 6);
    const visible = new Float32Array(edges.length * 2);
    const linePos = new Float32Array(edges.length * 2);  // 0 for start, 1 for end
    const edgeLen = new Float32Array(edges.length * 2);  // Edge length for dash calc
    const fog = new Float32Array(edges.length * 2).fill(1.0);
    const dashStyle = new Float32Array(edges.length * 2);  // Per-edge dash style

    const settings = group === EdgeGroup.DETERMINISTIC
      ? this.settings.deterministic
      : this.settings.semantic;

    const baseColor = hexToRGB(settings.color);
    const useTypeColors = settings.useTypeColors;
    const useTypeStyles = settings.useTypeStyles;

    edges.forEach((edge, i) => {
      const sourceIdx = typeof edge.source === 'number' ? edge.source :
        (edge.source as GraphNode).nodeIndex ?? 0;
      const targetIdx = typeof edge.target === 'number' ? edge.target :
        (edge.target as GraphNode).nodeIndex ?? 0;

      const sourceNode = nodes[sourceIdx];
      const targetNode = nodes[targetIdx];

      if (!sourceNode || !targetNode) return;

      // Positions
      const px = i * 6;
      const sx = sourceNode.x ?? 0;
      const sy = sourceNode.y ?? 0;
      const sz = sourceNode.z ?? 0;
      const tx = targetNode.x ?? 0;
      const ty = targetNode.y ?? 0;
      const tz = targetNode.z ?? 0;

      positions[px] = sx;
      positions[px + 1] = sy;
      positions[px + 2] = sz;
      positions[px + 3] = tx;
      positions[px + 4] = ty;
      positions[px + 5] = tz;

      // Calculate edge length for dash pattern
      const length = Math.sqrt((tx - sx) ** 2 + (ty - sy) ** 2 + (tz - sz) ** 2);
      linePos[i * 2] = 0;      // Start vertex
      linePos[i * 2 + 1] = 1;  // End vertex
      edgeLen[i * 2] = length;
      edgeLen[i * 2 + 1] = length;

      // Per-edge dash style
      const edgeDashStyle = useTypeStyles
        ? getEdgeDashStyle(edge.type)
        : (settings.style === 'dashed' ? EdgeDashStyle.DASHED :
           settings.style === 'dotted' ? EdgeDashStyle.DOTTED :
           EdgeDashStyle.SOLID);
      dashStyle[i * 2] = edgeDashStyle;
      dashStyle[i * 2 + 1] = edgeDashStyle;

      // Per-edge colors with type-based coloring and width-based brightness
      let edgeColor: [number, number, number];
      if (useTypeColors) {
        edgeColor = getEdgeTypeColor(edge);
      } else {
        edgeColor = [...baseColor] as [number, number, number];
      }

      // Apply brightness based on weight/width
      const edgeWidth = calculateEdgeWidth(edge);
      const normalizedWidth = Math.min(edgeWidth / 5, 1);  // Normalize to 0-1
      const brightness = 0.5 + normalizedWidth * 0.5;

      colors[px] = edgeColor[0] * brightness;
      colors[px + 1] = edgeColor[1] * brightness;
      colors[px + 2] = edgeColor[2] * brightness;
      colors[px + 3] = edgeColor[0] * brightness;
      colors[px + 4] = edgeColor[1] * brightness;
      colors[px + 5] = edgeColor[2] * brightness;

      // Visibility
      visible[i * 2] = 1;
      visible[i * 2 + 1] = 1;
    });

    // Create geometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('visible', new THREE.BufferAttribute(visible, 1));
    geometry.setAttribute('linePos', new THREE.BufferAttribute(linePos, 1));
    geometry.setAttribute('edgeLen', new THREE.BufferAttribute(edgeLen, 1));
    geometry.setAttribute('fog', new THREE.BufferAttribute(fog, 1));
    geometry.setAttribute('dashStyle', new THREE.BufferAttribute(dashStyle, 1));

    // Get global dash style value (fallback)
    const globalStyleValue = settings.style === 'dashed' ? 1 : (settings.style === 'dotted' ? 2 : 0);

    // Create material
    const material = new THREE.ShaderMaterial({
      vertexShader: edgeVertShader,
      fragmentShader: edgeFragShader,
      uniforms: {
        uOpacity: { value: settings.opacity },
        uGlow: { value: settings.glow ? 1 : 0 },
        uDashStyle: { value: globalStyleValue },
        uDashScale: { value: 1.0 }
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      linewidth: settings.width  // Note: Limited support in WebGL
    });

    if (group === EdgeGroup.DETERMINISTIC) {
      this.deterministicMaterial = material;
    } else {
      this.semanticMaterial = material;
    }

    // Create line segments
    const lines = new THREE.LineSegments(geometry, material);
    lines.frustumCulled = false;

    return lines;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3D CURVED EDGE METHODS (sphere-aligned arcs)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Compute quadratic bezier arc points between two 3D positions.
   * The control point is the midpoint pushed radially outward so edges
   * arc over the sphere surface instead of cutting through it.
   * Uses pre-allocated buffer — caller must consume before next call.
   */
  private computeArcPoints(
    sx: number, sy: number, sz: number,
    tx: number, ty: number, tz: number
  ): Float32Array {
    const S = EdgeRenderer.SEGMENTS_3D;
    const pts = this.arcPointsBuffer;

    // Midpoint
    const mx = (sx + tx) / 2;
    const my = (sy + ty) / 2;
    const mz = (sz + tz) / 2;
    const mLen = Math.sqrt(mx * mx + my * my + mz * mz) || 1;

    // Push midpoint radially outward to max(|S|,|T|) × 1.05
    const sLen = Math.sqrt(sx * sx + sy * sy + sz * sz);
    const tLen = Math.sqrt(tx * tx + ty * ty + tz * tz);
    const arcR = Math.max(sLen, tLen) * 1.05;
    const cx = (mx / mLen) * arcR;
    const cy = (my / mLen) * arcR;
    const cz = (mz / mLen) * arcR;

    // Sample quadratic bezier: P(t) = (1-t)²S + 2(1-t)tC + t²T
    for (let i = 0; i <= S; i++) {
      const t = i / S;
      const t1 = 1 - t;
      pts[i * 3]     = t1 * t1 * sx + 2 * t1 * t * cx + t * t * tx;
      pts[i * 3 + 1] = t1 * t1 * sy + 2 * t1 * t * cy + t * t * ty;
      pts[i * 3 + 2] = t1 * t1 * sz + 2 * t1 * t * cz + t * t * tz;
    }

    return pts;
  }

  /**
   * Build curved 3D geometry for both edge groups.
   * Called once when entering 3D mode. Uses current node positions and
   * copies attribute state (colors, visibility, dash styles) from straight geometry.
   */
  buildCurved3DGeometry(nodes: GraphNode[]): void {
    this.disposeCurved3D();

    if (this.deterministicLines && this.deterministicEdgesData.length > 0) {
      const result = this.createCurvedGroup(
        this.deterministicEdgesData, nodes, EdgeGroup.DETERMINISTIC, this.deterministicLines
      );
      this.deterministicLines3D = result.lines;
      this.deterministicMaterial3D = result.material;
      this.deterministicLines3D.renderOrder = 0;
      this.deterministicLines3D.visible = this.settings.deterministic.visible;
      this.scene.add(this.deterministicLines3D);
    }

    if (this.semanticLines && this.semanticEdgesData.length > 0) {
      const result = this.createCurvedGroup(
        this.semanticEdgesData, nodes, EdgeGroup.SEMANTIC, this.semanticLines
      );
      this.semanticLines3D = result.lines;
      this.semanticMaterial3D = result.material;
      this.semanticLines3D.renderOrder = 0;
      this.semanticLines3D.visible = this.settings.semantic.visible;
      this.scene.add(this.semanticLines3D);
    }

    this.curved3DBuilt = true;
    console.log(`EdgeRenderer: Built curved 3D geometry (${EdgeRenderer.SEGMENTS_3D} segments/edge)`);
  }

  /**
   * Create curved LineSegments for one edge group.
   * Each edge becomes SEGMENTS_3D sub-segments (pairs of vertices along bezier arc).
   */
  private createCurvedGroup(
    edges: ExtendedGraphEdge[],
    nodes: GraphNode[],
    group: EdgeGroup,
    straightLines: THREE.LineSegments
  ): { lines: THREE.LineSegments; material: THREE.ShaderMaterial } {
    const S = EdgeRenderer.SEGMENTS_3D;
    const count = edges.length;
    const totalVerts = count * S * 2;

    const positions = new Float32Array(totalVerts * 3);
    const colors = new Float32Array(totalVerts * 3);
    const visible = new Float32Array(totalVerts);
    const linePos = new Float32Array(totalVerts);
    const edgeLen = new Float32Array(totalVerts);
    const fog = new Float32Array(totalVerts).fill(1.0);
    const dashStyle = new Float32Array(totalVerts);

    // Source attribute arrays from straight geometry
    const srcColors = (straightLines.geometry.getAttribute('color') as THREE.BufferAttribute).array as Float32Array;
    const srcVisible = (straightLines.geometry.getAttribute('visible') as THREE.BufferAttribute).array as Float32Array;
    const srcDashStyle = (straightLines.geometry.getAttribute('dashStyle') as THREE.BufferAttribute).array as Float32Array;

    for (let e = 0; e < count; e++) {
      const edge = edges[e];
      const sourceIdx = typeof edge.source === 'number' ? edge.source :
        (edge.source as GraphNode).nodeIndex ?? 0;
      const targetIdx = typeof edge.target === 'number' ? edge.target :
        (edge.target as GraphNode).nodeIndex ?? 0;
      const sourceNode = nodes[sourceIdx];
      const targetNode = nodes[targetIdx];

      if (!sourceNode || !targetNode) continue;

      const sx = sourceNode.x ?? 0, sy = sourceNode.y ?? 0, sz = sourceNode.z ?? 0;
      const tx = targetNode.x ?? 0, ty = targetNode.y ?? 0, tz = targetNode.z ?? 0;

      const arcPts = this.computeArcPoints(sx, sy, sz, tx, ty, tz);

      // Compute total arc length
      let totalLen = 0;
      for (let s = 0; s < S; s++) {
        const dx = arcPts[(s + 1) * 3] - arcPts[s * 3];
        const dy = arcPts[(s + 1) * 3 + 1] - arcPts[s * 3 + 1];
        const dz = arcPts[(s + 1) * 3 + 2] - arcPts[s * 3 + 2];
        totalLen += Math.sqrt(dx * dx + dy * dy + dz * dz);
      }

      const base = e * S * 2;
      const base3 = base * 3;

      // Per-edge attribute offsets in straight geometry
      const srcColorOff = e * 6;
      const srcVisOff = e * 2;
      const srcDashOff = e * 2;

      let accumLen = 0;
      for (let seg = 0; seg < S; seg++) {
        const p0 = seg * 3;
        const p1 = (seg + 1) * 3;
        const v3 = base3 + seg * 6;  // 2 verts × 3 comps
        const v1 = base + seg * 2;   // 2 verts × 1 comp

        // Positions from arc
        positions[v3]     = arcPts[p0];
        positions[v3 + 1] = arcPts[p0 + 1];
        positions[v3 + 2] = arcPts[p0 + 2];
        positions[v3 + 3] = arcPts[p1];
        positions[v3 + 4] = arcPts[p1 + 1];
        positions[v3 + 5] = arcPts[p1 + 2];

        // Colors (replicate from straight — both verts same color)
        colors[v3]     = srcColors[srcColorOff];
        colors[v3 + 1] = srcColors[srcColorOff + 1];
        colors[v3 + 2] = srcColors[srcColorOff + 2];
        colors[v3 + 3] = srcColors[srcColorOff];
        colors[v3 + 4] = srcColors[srcColorOff + 1];
        colors[v3 + 5] = srcColors[srcColorOff + 2];

        // Visibility (replicate)
        visible[v1]     = srcVisible[srcVisOff];
        visible[v1 + 1] = srcVisible[srcVisOff];

        // Dash style (replicate)
        dashStyle[v1]     = srcDashStyle[srcDashOff];
        dashStyle[v1 + 1] = srcDashStyle[srcDashOff];

        // linePos: interpolated 0→1 along arc
        const segLen = Math.sqrt(
          (arcPts[p1] - arcPts[p0]) ** 2 +
          (arcPts[p1 + 1] - arcPts[p0 + 1]) ** 2 +
          (arcPts[p1 + 2] - arcPts[p0 + 2]) ** 2
        );
        linePos[v1]     = totalLen > 0 ? accumLen / totalLen : 0;
        accumLen += segLen;
        linePos[v1 + 1] = totalLen > 0 ? accumLen / totalLen : 1;

        // Edge length (total arc length for dash pattern calc)
        edgeLen[v1]     = totalLen;
        edgeLen[v1 + 1] = totalLen;

        // Fog: per-vertex based on radial distance along arc
        const r0 = Math.sqrt(arcPts[p0] ** 2 + arcPts[p0 + 1] ** 2 + arcPts[p0 + 2] ** 2);
        const r1 = Math.sqrt(arcPts[p1] ** 2 + arcPts[p1 + 1] ** 2 + arcPts[p1 + 2] ** 2);
        fog[v1]     = this.fogEnabled ? this.calculateFogFactor(r0) : 1.0;
        fog[v1 + 1] = this.fogEnabled ? this.calculateFogFactor(r1) : 1.0;
      }
    }

    // Create geometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('visible', new THREE.BufferAttribute(visible, 1));
    geometry.setAttribute('linePos', new THREE.BufferAttribute(linePos, 1));
    geometry.setAttribute('edgeLen', new THREE.BufferAttribute(edgeLen, 1));
    geometry.setAttribute('fog', new THREE.BufferAttribute(fog, 1));
    geometry.setAttribute('dashStyle', new THREE.BufferAttribute(dashStyle, 1));

    // Clone material settings from straight geometry
    const srcMaterial = group === EdgeGroup.DETERMINISTIC
      ? this.deterministicMaterial!
      : this.semanticMaterial!;

    const material = new THREE.ShaderMaterial({
      vertexShader: edgeVertShader,
      fragmentShader: edgeFragShader,
      uniforms: {
        uOpacity: { value: srcMaterial.uniforms.uOpacity.value },
        uGlow: { value: srcMaterial.uniforms.uGlow.value },
        uDashStyle: { value: srcMaterial.uniforms.uDashStyle.value },
        uDashScale: { value: srcMaterial.uniforms.uDashScale.value }
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      linewidth: (srcMaterial as any).linewidth ?? 1
    });

    const lines = new THREE.LineSegments(geometry, material);
    lines.frustumCulled = false;

    return { lines, material };
  }

  /**
   * Update curved arc positions for one edge group.
   * Also updates linePos, edgeLen, and fog per-vertex along arcs.
   */
  private updateCurvedGroupPositions(
    curvedLines: THREE.LineSegments,
    nodes: GraphNode[],
    groupValue: number
  ): void {
    if (!this.gpuData) return;
    const S = EdgeRenderer.SEGMENTS_3D;

    const posArray = (curvedLines.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    const edgeLenArray = (curvedLines.geometry.getAttribute('edgeLen') as THREE.BufferAttribute).array as Float32Array;
    const linePosArray = (curvedLines.geometry.getAttribute('linePos') as THREE.BufferAttribute).array as Float32Array;
    const fogArray = (curvedLines.geometry.getAttribute('fog') as THREE.BufferAttribute).array as Float32Array;

    let edgeIdx = 0;
    for (let i = 0; i < this.edgeCount; i++) {
      if (this.gpuData.groups[i] !== groupValue) continue;

      const sourceNode = nodes[this.gpuData.sourceIndices[i]];
      const targetNode = nodes[this.gpuData.targetIndices[i]];

      if (!sourceNode || !targetNode) {
        edgeIdx++;
        continue;
      }

      const sx = sourceNode.x ?? 0, sy = sourceNode.y ?? 0, sz = sourceNode.z ?? 0;
      const tx = targetNode.x ?? 0, ty = targetNode.y ?? 0, tz = targetNode.z ?? 0;

      const arcPts = this.computeArcPoints(sx, sy, sz, tx, ty, tz);

      // Total arc length
      let totalLen = 0;
      for (let s = 0; s < S; s++) {
        const dx = arcPts[(s + 1) * 3] - arcPts[s * 3];
        const dy = arcPts[(s + 1) * 3 + 1] - arcPts[s * 3 + 1];
        const dz = arcPts[(s + 1) * 3 + 2] - arcPts[s * 3 + 2];
        totalLen += Math.sqrt(dx * dx + dy * dy + dz * dz);
      }

      const base = edgeIdx * S * 2;
      const base3 = base * 3;
      let accumLen = 0;

      for (let seg = 0; seg < S; seg++) {
        const p0 = seg * 3;
        const p1 = (seg + 1) * 3;
        const v3 = base3 + seg * 6;
        const v1 = base + seg * 2;

        posArray[v3]     = arcPts[p0];
        posArray[v3 + 1] = arcPts[p0 + 1];
        posArray[v3 + 2] = arcPts[p0 + 2];
        posArray[v3 + 3] = arcPts[p1];
        posArray[v3 + 4] = arcPts[p1 + 1];
        posArray[v3 + 5] = arcPts[p1 + 2];

        const segLen = Math.sqrt(
          (arcPts[p1] - arcPts[p0]) ** 2 +
          (arcPts[p1 + 1] - arcPts[p0 + 1]) ** 2 +
          (arcPts[p1 + 2] - arcPts[p0 + 2]) ** 2
        );
        linePosArray[v1]     = totalLen > 0 ? accumLen / totalLen : 0;
        accumLen += segLen;
        linePosArray[v1 + 1] = totalLen > 0 ? accumLen / totalLen : 1;

        edgeLenArray[v1]     = totalLen;
        edgeLenArray[v1 + 1] = totalLen;

        const r0 = Math.sqrt(arcPts[p0] ** 2 + arcPts[p0 + 1] ** 2 + arcPts[p0 + 2] ** 2);
        const r1 = Math.sqrt(arcPts[p1] ** 2 + arcPts[p1 + 1] ** 2 + arcPts[p1 + 2] ** 2);
        fogArray[v1]     = this.fogEnabled ? this.calculateFogFactor(r0) : 1.0;
        fogArray[v1 + 1] = this.fogEnabled ? this.calculateFogFactor(r1) : 1.0;
      }

      edgeIdx++;
    }

    (curvedLines.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (curvedLines.geometry.getAttribute('edgeLen') as THREE.BufferAttribute).needsUpdate = true;
    (curvedLines.geometry.getAttribute('linePos') as THREE.BufferAttribute).needsUpdate = true;
    (curvedLines.geometry.getAttribute('fog') as THREE.BufferAttribute).needsUpdate = true;
  }

  /**
   * Sync a uniform-per-edge attribute from straight geometry to curved 3D geometry.
   * "Uniform" means both vertices of each straight edge have the same value,
   * which gets replicated to all SEGMENTS_3D × 2 vertices in the curved geometry.
   */
  private syncAttrToCurved(
    straightLines: THREE.LineSegments | null,
    curvedLines: THREE.LineSegments | null,
    attrName: string,
    cpv: number
  ): void {
    if (!straightLines || !curvedLines) return;
    const srcAttr = straightLines.geometry.getAttribute(attrName) as THREE.BufferAttribute;
    const dstAttr = curvedLines.geometry.getAttribute(attrName) as THREE.BufferAttribute;
    if (!srcAttr || !dstAttr) return;

    const src = srcAttr.array as Float32Array;
    const dst = dstAttr.array as Float32Array;
    const S = EdgeRenderer.SEGMENTS_3D;
    const edgeCount = src.length / (2 * cpv);

    for (let e = 0; e < edgeCount; e++) {
      const srcOff = e * 2 * cpv;
      const dstBase = e * S * 2 * cpv;

      for (let seg = 0; seg < S; seg++) {
        const segOff = dstBase + seg * 2 * cpv;
        for (let c = 0; c < cpv; c++) {
          dst[segOff + c] = src[srcOff + c];
          dst[segOff + cpv + c] = src[srcOff + c];
        }
      }
    }

    dstAttr.needsUpdate = true;
  }

  /**
   * Dispose curved 3D geometry and materials
   */
  private disposeCurved3D(): void {
    if (this.deterministicLines3D) {
      this.deterministicLines3D.geometry.dispose();
      this.scene.remove(this.deterministicLines3D);
      this.deterministicLines3D = null;
    }
    if (this.semanticLines3D) {
      this.semanticLines3D.geometry.dispose();
      this.scene.remove(this.semanticLines3D);
      this.semanticLines3D = null;
    }
    if (this.deterministicMaterial3D) {
      this.deterministicMaterial3D.dispose();
      this.deterministicMaterial3D = null;
    }
    if (this.semanticMaterial3D) {
      this.semanticMaterial3D.dispose();
      this.semanticMaterial3D = null;
    }
    this.curved3DBuilt = false;
  }

  /**
   * Update edge positions based on node positions
   */
  updatePositions(nodes: GraphNode[]): void {
    if (!this.gpuData) return;

    // In 3D mode: build curved geometry if needed, then update arcs
    if (this.viewMode === '3d') {
      if (!this.curved3DBuilt) {
        this.buildCurved3DGeometry(nodes);
      }
      if (this.deterministicLines3D) {
        this.updateCurvedGroupPositions(this.deterministicLines3D, nodes, 0);
      }
      if (this.semanticLines3D) {
        this.updateCurvedGroupPositions(this.semanticLines3D, nodes, 1);
      }
      return;
    }

    let nanPositions = 0;
    let missingNodes = 0;

    // Update deterministic edges
    if (this.deterministicLines) {
      const positions = this.deterministicLines.geometry.getAttribute('position') as THREE.BufferAttribute;
      const posArray = positions.array as Float32Array;
      const edgeLenAttr = this.deterministicLines.geometry.getAttribute('edgeLen') as THREE.BufferAttribute;
      const edgeLenArray = edgeLenAttr.array as Float32Array;

      let edgeIdx = 0;
      for (let i = 0; i < this.edgeCount; i++) {
        if (this.gpuData.groups[i] !== 0) continue; // Skip non-deterministic

        const sourceIdx = this.gpuData.sourceIndices[i];
        const targetIdx = this.gpuData.targetIndices[i];

        const sourceNode = nodes[sourceIdx];
        const targetNode = nodes[targetIdx];

        if (!sourceNode || !targetNode) {
          missingNodes++;
          edgeIdx++;
          continue;
        }

        // Check for NaN/invalid positions
        const sx = sourceNode.x ?? 0;
        const sy = sourceNode.y ?? 0;
        const sz = sourceNode.z ?? 0;
        const tx = targetNode.x ?? 0;
        const ty = targetNode.y ?? 0;
        const tz = targetNode.z ?? 0;

        if (!isFinite(sx) || !isFinite(sy) || !isFinite(sz) ||
            !isFinite(tx) || !isFinite(ty) || !isFinite(tz)) {
          nanPositions++;
        }

        const px = edgeIdx * 6;
        posArray[px] = sx;
        posArray[px + 1] = sy;
        posArray[px + 2] = sz;
        posArray[px + 3] = tx;
        posArray[px + 4] = ty;
        posArray[px + 5] = tz;

        // Update edge length for dash pattern
        const length = Math.sqrt((tx - sx) ** 2 + (ty - sy) ** 2 + (tz - sz) ** 2);
        edgeLenArray[edgeIdx * 2] = length;
        edgeLenArray[edgeIdx * 2 + 1] = length;

        edgeIdx++;
      }

      positions.needsUpdate = true;
      edgeLenAttr.needsUpdate = true;

      // Update fog for deterministic edges
      this.updateEdgeFog(this.deterministicLines, nodes, EdgeGroup.DETERMINISTIC);
    }

    // Update semantic edges
    if (this.semanticLines) {
      const positions = this.semanticLines.geometry.getAttribute('position') as THREE.BufferAttribute;
      const posArray = positions.array as Float32Array;
      const edgeLenAttr = this.semanticLines.geometry.getAttribute('edgeLen') as THREE.BufferAttribute;
      const edgeLenArray = edgeLenAttr.array as Float32Array;

      let edgeIdx = 0;
      for (let i = 0; i < this.edgeCount; i++) {
        if (this.gpuData.groups[i] !== 1) continue; // Skip non-semantic

        const sourceIdx = this.gpuData.sourceIndices[i];
        const targetIdx = this.gpuData.targetIndices[i];

        const sourceNode = nodes[sourceIdx];
        const targetNode = nodes[targetIdx];

        if (!sourceNode || !targetNode) {
          missingNodes++;
          edgeIdx++;
          continue;
        }

        // Check for NaN/invalid positions
        const sx = sourceNode.x ?? 0;
        const sy = sourceNode.y ?? 0;
        const sz = sourceNode.z ?? 0;
        const tx = targetNode.x ?? 0;
        const ty = targetNode.y ?? 0;
        const tz = targetNode.z ?? 0;

        if (!isFinite(sx) || !isFinite(sy) || !isFinite(sz) ||
            !isFinite(tx) || !isFinite(ty) || !isFinite(tz)) {
          nanPositions++;
        }

        const px = edgeIdx * 6;
        posArray[px] = sx;
        posArray[px + 1] = sy;
        posArray[px + 2] = sz;
        posArray[px + 3] = tx;
        posArray[px + 4] = ty;
        posArray[px + 5] = tz;

        // Update edge length for dash pattern
        const length = Math.sqrt((tx - sx) ** 2 + (ty - sy) ** 2 + (tz - sz) ** 2);
        edgeLenArray[edgeIdx * 2] = length;
        edgeLenArray[edgeIdx * 2 + 1] = length;

        edgeIdx++;
      }

      positions.needsUpdate = true;
      edgeLenAttr.needsUpdate = true;

      // Update fog for semantic edges
      this.updateEdgeFog(this.semanticLines, nodes, EdgeGroup.SEMANTIC);
    }

    // Log issues if any
    if (nanPositions > 0 || missingNodes > 0) {
      console.warn(`EdgeRenderer.updatePositions: ${nanPositions} edges with NaN positions, ${missingNodes} edges with missing nodes`);
    }
  }

  /**
   * Update fog values for edge endpoints based on radial distance.
   * Creates "historical obsolescence" effect: edges near center are foggier.
   */
  private updateEdgeFog(lines: THREE.LineSegments, nodes: GraphNode[], group: EdgeGroup): void {
    if (!this.fogEnabled || this.viewMode !== '3d' || !this.gpuData) {
      // Reset fog to fully visible
      const fogAttr = lines.geometry.getAttribute('fog') as THREE.BufferAttribute;
      const fogArray = fogAttr.array as Float32Array;
      fogArray.fill(1.0);
      fogAttr.needsUpdate = true;
      return;
    }

    const fogAttr = lines.geometry.getAttribute('fog') as THREE.BufferAttribute;
    const fogArray = fogAttr.array as Float32Array;
    const groupValue = group === EdgeGroup.DETERMINISTIC ? 0 : 1;

    let edgeIdx = 0;
    for (let i = 0; i < this.edgeCount; i++) {
      if (this.gpuData.groups[i] !== groupValue) continue;

      const sourceIdx = this.gpuData.sourceIndices[i];
      const targetIdx = this.gpuData.targetIndices[i];
      const sourceNode = nodes[sourceIdx];
      const targetNode = nodes[targetIdx];

      if (!sourceNode || !targetNode) {
        edgeIdx++;
        continue;
      }

      // Calculate fog for source vertex
      const sx = sourceNode.x ?? 0;
      const sy = sourceNode.y ?? 0;
      const sz = sourceNode.z ?? 0;
      const sourceDist = Math.sqrt(sx * sx + sy * sy + sz * sz);
      const sourceFog = this.calculateFogFactor(sourceDist);

      // Calculate fog for target vertex
      const tx = targetNode.x ?? 0;
      const ty = targetNode.y ?? 0;
      const tz = targetNode.z ?? 0;
      const targetDist = Math.sqrt(tx * tx + ty * ty + tz * tz);
      const targetFog = this.calculateFogFactor(targetDist);

      // Set fog for both vertices of this edge
      fogArray[edgeIdx * 2] = sourceFog;
      fogArray[edgeIdx * 2 + 1] = targetFog;

      edgeIdx++;
    }

    fogAttr.needsUpdate = true;
  }

  /**
   * Calculate fog factor for a given radial distance.
   * Returns 1.0 at surface (fully visible), approaches (1 - fogStrength) at core.
   */
  private calculateFogFactor(distance: number): number {
    if (distance <= this.fogCoreRadius) {
      return 1.0 - this.fogStrength;
    } else if (distance >= this.fogSphereRadius) {
      return 1.0;
    } else {
      const t = (distance - this.fogCoreRadius) / (this.fogSphereRadius - this.fogCoreRadius);
      const smooth = t * t * (3 - 2 * t);
      return (1.0 - this.fogStrength) + smooth * this.fogStrength;
    }
  }

  /**
   * Set view mode — toggles between straight (2D) and curved (3D) edge geometry
   */
  setViewMode(mode: '2d' | '2.5d' | '3d'): void {
    const wasMode = this.viewMode;
    this.viewMode = mode;

    if (mode === '3d') {
      // Hide straight geometry
      if (this.deterministicLines) this.deterministicLines.visible = false;
      if (this.semanticLines) this.semanticLines.visible = false;
      // Show curved if already built (otherwise built on next updatePositions)
      if (this.deterministicLines3D) this.deterministicLines3D.visible = this.settings.deterministic.visible;
      if (this.semanticLines3D) this.semanticLines3D.visible = this.settings.semantic.visible;
      // Mark curved as needing rebuild when switching to 3D (positions change)
      if (wasMode !== '3d') this.curved3DBuilt = false;
    } else {
      // Hide curved, show straight
      if (this.deterministicLines) this.deterministicLines.visible = this.settings.deterministic.visible;
      if (this.semanticLines) this.semanticLines.visible = this.settings.semantic.visible;
      if (this.deterministicLines3D) this.deterministicLines3D.visible = false;
      if (this.semanticLines3D) this.semanticLines3D.visible = false;
    }
  }

  /**
   * Configure fog settings
   */
  setFogSettings(settings: { enabled?: boolean; sphereRadius?: number; coreRadius?: number; strength?: number }): void {
    if (settings.enabled !== undefined) this.fogEnabled = settings.enabled;
    if (settings.sphereRadius !== undefined) this.fogSphereRadius = settings.sphereRadius;
    if (settings.coreRadius !== undefined) this.fogCoreRadius = settings.coreRadius;
    if (settings.strength !== undefined) this.fogStrength = Math.max(0, Math.min(1, settings.strength));
  }

  /**
   * Enable or disable per-edge type-based coloring
   */
  setUseTypeColors(group: EdgeGroup, enabled: boolean): void {
    const settings = group === EdgeGroup.DETERMINISTIC
      ? this.settings.deterministic
      : this.settings.semantic;
    settings.useTypeColors = enabled;

    // Rebuild the line segments with new coloring
    const edges = group === EdgeGroup.DETERMINISTIC
      ? this.deterministicEdgesData
      : this.semanticEdgesData;
    const lines = group === EdgeGroup.DETERMINISTIC
      ? this.deterministicLines
      : this.semanticLines;

    if (lines && edges.length > 0) {
      this.updateEdgeColorsForGroup(group);
    }
  }

  /**
   * Enable or disable per-edge type-based dash styles
   */
  setUseTypeStyles(group: EdgeGroup, enabled: boolean): void {
    const settings = group === EdgeGroup.DETERMINISTIC
      ? this.settings.deterministic
      : this.settings.semantic;
    settings.useTypeStyles = enabled;

    // Update dash styles for the group
    const edges = group === EdgeGroup.DETERMINISTIC
      ? this.deterministicEdgesData
      : this.semanticEdgesData;
    const lines = group === EdgeGroup.DETERMINISTIC
      ? this.deterministicLines
      : this.semanticLines;

    if (lines && edges.length > 0) {
      this.updateDashStylesForGroup(group);
    }
  }

  /**
   * Update edge colors for a specific group
   */
  private updateEdgeColorsForGroup(group: EdgeGroup): void {
    const lines = group === EdgeGroup.DETERMINISTIC
      ? this.deterministicLines
      : this.semanticLines;
    const edges = group === EdgeGroup.DETERMINISTIC
      ? this.deterministicEdgesData
      : this.semanticEdgesData;
    const settings = group === EdgeGroup.DETERMINISTIC
      ? this.settings.deterministic
      : this.settings.semantic;

    if (!lines || edges.length === 0) return;

    const colorAttr = lines.geometry.getAttribute('color') as THREE.BufferAttribute;
    const colors = colorAttr.array as Float32Array;
    const baseColor = hexToRGB(settings.color);

    edges.forEach((edge, i) => {
      let edgeColor: [number, number, number];
      if (settings.useTypeColors) {
        edgeColor = getEdgeTypeColor(edge);
      } else {
        edgeColor = [...baseColor] as [number, number, number];
      }

      // Apply brightness based on weight/width
      const edgeWidth = calculateEdgeWidth(edge);
      const normalizedWidth = Math.min(edgeWidth / 5, 1);
      const brightness = 0.5 + normalizedWidth * 0.5;

      const px = i * 6;
      colors[px] = edgeColor[0] * brightness;
      colors[px + 1] = edgeColor[1] * brightness;
      colors[px + 2] = edgeColor[2] * brightness;
      colors[px + 3] = edgeColor[0] * brightness;
      colors[px + 4] = edgeColor[1] * brightness;
      colors[px + 5] = edgeColor[2] * brightness;
    });

    colorAttr.needsUpdate = true;

    // Sync to curved 3D geometry if it exists
    const curvedLines = group === EdgeGroup.DETERMINISTIC
      ? this.deterministicLines3D : this.semanticLines3D;
    this.syncAttrToCurved(lines, curvedLines, 'color', 3);
  }

  /**
   * Update dash styles for a specific group
   */
  private updateDashStylesForGroup(group: EdgeGroup): void {
    const lines = group === EdgeGroup.DETERMINISTIC
      ? this.deterministicLines
      : this.semanticLines;
    const edges = group === EdgeGroup.DETERMINISTIC
      ? this.deterministicEdgesData
      : this.semanticEdgesData;
    const settings = group === EdgeGroup.DETERMINISTIC
      ? this.settings.deterministic
      : this.settings.semantic;

    if (!lines || edges.length === 0) return;

    const dashStyleAttr = lines.geometry.getAttribute('dashStyle') as THREE.BufferAttribute;
    const dashStyles = dashStyleAttr.array as Float32Array;

    edges.forEach((edge, i) => {
      const style = settings.useTypeStyles
        ? getEdgeDashStyle(edge.type)
        : (settings.style === 'dashed' ? EdgeDashStyle.DASHED :
           settings.style === 'dotted' ? EdgeDashStyle.DOTTED :
           EdgeDashStyle.SOLID);

      dashStyles[i * 2] = style;
      dashStyles[i * 2 + 1] = style;
    });

    dashStyleAttr.needsUpdate = true;

    // Sync to curved 3D geometry
    const curvedLines = group === EdgeGroup.DETERMINISTIC
      ? this.deterministicLines3D : this.semanticLines3D;
    this.syncAttrToCurved(lines, curvedLines, 'dashStyle', 1);
  }

  /**
   * Apply edge group settings
   */
  applyGroupSettings(group: EdgeGroup, settings: Partial<EdgeGroupSettings>): void {
    const currentSettings = group === EdgeGroup.DETERMINISTIC
      ? this.settings.deterministic
      : this.settings.semantic;

    const material = group === EdgeGroup.DETERMINISTIC
      ? this.deterministicMaterial
      : this.semanticMaterial;

    const material3D = group === EdgeGroup.DETERMINISTIC
      ? this.deterministicMaterial3D
      : this.semanticMaterial3D;

    const lines = group === EdgeGroup.DETERMINISTIC
      ? this.deterministicLines
      : this.semanticLines;

    const lines3D = group === EdgeGroup.DETERMINISTIC
      ? this.deterministicLines3D
      : this.semanticLines3D;

    // Update settings
    if (settings.opacity !== undefined) {
      currentSettings.opacity = settings.opacity;
      if (material) material.uniforms.uOpacity.value = settings.opacity;
      if (material3D) material3D.uniforms.uOpacity.value = settings.opacity;
    }

    if (settings.glow !== undefined) {
      currentSettings.glow = settings.glow;
      if (material) material.uniforms.uGlow.value = settings.glow ? 1 : 0;
      if (material3D) material3D.uniforms.uGlow.value = settings.glow ? 1 : 0;
    }

    if (settings.color !== undefined) {
      currentSettings.color = settings.color;
      if (lines) {
        this.updateEdgeColorsForGroup(group);
      }
    }

    if (settings.enabled !== undefined) {
      currentSettings.visible = settings.enabled;
      if (this.viewMode === '3d') {
        if (lines3D) lines3D.visible = settings.enabled;
        if (lines) lines.visible = false;  // Keep straight hidden in 3D
      } else {
        if (lines) lines.visible = settings.enabled;
        if (lines3D) lines3D.visible = false;
      }
    }

    // Handle style setting (solid, dashed, dotted) - applies as global fallback
    if ((settings as any).style !== undefined) {
      const style = (settings as any).style as 'solid' | 'dashed' | 'dotted';
      currentSettings.style = style;
      const styleValue = style === 'dashed' ? 1 : (style === 'dotted' ? 2 : 0);
      if (material) material.uniforms.uDashStyle.value = styleValue;
      if (material3D) material3D.uniforms.uDashStyle.value = styleValue;
      // Also update per-edge styles if not using type-based styles
      if (!currentSettings.useTypeStyles) {
        this.updateDashStylesForGroup(group);
      }
    }

    // Handle width setting
    if (settings.width !== undefined) {
      currentSettings.width = settings.width;
      // Note: WebGL linewidth has limited support, but we set it anyway
      if (material) {
        (material as any).linewidth = settings.width;
        material.needsUpdate = true;
      }
      if (material3D) {
        (material3D as any).linewidth = settings.width;
        material3D.needsUpdate = true;
      }
    }

    // Handle width mode
    if ((settings as any).widthMode !== undefined) {
      if (group === EdgeGroup.DETERMINISTIC) {
        this.settings.deterministic.widthMode = (settings as any).widthMode;
        this.updateDeterministicEdgeWidths();
      } else if (group === EdgeGroup.SEMANTIC) {
        this.settings.semantic.widthMode = (settings as any).widthMode;
        this.updateSemanticEdgeWidths();
      }
    }

    // Handle useTypeColors
    if ((settings as any).useTypeColors !== undefined) {
      this.setUseTypeColors(group, (settings as any).useTypeColors);
    }

    // Handle useTypeStyles
    if ((settings as any).useTypeStyles !== undefined) {
      this.setUseTypeStyles(group, (settings as any).useTypeStyles);
    }
  }

  /**
   * Update semantic edge widths based on mode
   */
  private updateSemanticEdgeWidths(): void {
    if (!this.semanticLines || this.semanticEdgesData.length === 0) return;

    const mode = this.settings.semantic.widthMode;
    const colorAttr = this.semanticLines.geometry.getAttribute('color') as THREE.BufferAttribute;
    const colors = colorAttr.array as Float32Array;
    const baseColor = hexToRGB(this.settings.semantic.color);

    this.semanticEdgesData.forEach((edge, i) => {
      let intensity = 0.5;

      if (mode === 'similarity' && edge.weight !== undefined) {
        // Use similarity/weight for brightness
        intensity = 0.3 + edge.weight * 0.7;
      } else if (mode === 'weight' && edge.weight !== undefined) {
        intensity = 0.2 + edge.weight * 0.8;
      }

      // If using type colors, get type-specific color
      let edgeColor: [number, number, number];
      if (this.settings.semantic.useTypeColors) {
        edgeColor = getEdgeTypeColor(edge);
      } else {
        edgeColor = [...baseColor] as [number, number, number];
      }

      const px = i * 6;
      colors[px] = edgeColor[0] * intensity;
      colors[px + 1] = edgeColor[1] * intensity;
      colors[px + 2] = edgeColor[2] * intensity;
      colors[px + 3] = edgeColor[0] * intensity;
      colors[px + 4] = edgeColor[1] * intensity;
      colors[px + 5] = edgeColor[2] * intensity;
    });

    colorAttr.needsUpdate = true;

    // Sync to curved 3D geometry
    this.syncAttrToCurved(this.semanticLines, this.semanticLines3D, 'color', 3);
  }

  /**
   * Update deterministic edge widths based on mode
   */
  private updateDeterministicEdgeWidths(): void {
    if (!this.deterministicLines || this.deterministicEdgesData.length === 0) return;

    const mode = this.settings.deterministic.widthMode;
    const colorAttr = this.deterministicLines.geometry.getAttribute('color') as THREE.BufferAttribute;
    const colors = colorAttr.array as Float32Array;
    const baseColor = hexToRGB(this.settings.deterministic.color);

    this.deterministicEdgesData.forEach((edge, i) => {
      let intensity = 0.5;

      if (mode === 'similarity' && edge.weight !== undefined) {
        // Use similarity/weight for brightness
        intensity = 0.3 + edge.weight * 0.7;
      } else if (mode === 'weight' && edge.weight !== undefined) {
        intensity = 0.2 + edge.weight * 0.8;
      }

      // If using type colors, get type-specific color
      let edgeColor: [number, number, number];
      if (this.settings.deterministic.useTypeColors) {
        edgeColor = getEdgeTypeColor(edge);
      } else {
        edgeColor = [...baseColor] as [number, number, number];
      }

      const px = i * 6;
      colors[px] = edgeColor[0] * intensity;
      colors[px + 1] = edgeColor[1] * intensity;
      colors[px + 2] = edgeColor[2] * intensity;
      colors[px + 3] = edgeColor[0] * intensity;
      colors[px + 4] = edgeColor[1] * intensity;
      colors[px + 5] = edgeColor[2] * intensity;
    });

    colorAttr.needsUpdate = true;

    // Sync to curved 3D geometry
    this.syncAttrToCurved(this.deterministicLines, this.deterministicLines3D, 'color', 3);
  }

  /**
   * Set visibility for specific edges
   */
  setEdgeVisibility(visibleEdges: Set<number>): void {
    // Update deterministic edges
    if (this.deterministicLines) {
      const visibleAttr = this.deterministicLines.geometry.getAttribute('visible') as THREE.BufferAttribute;
      const visibleArray = visibleAttr.array as Float32Array;

      let edgeIdx = 0;
      for (let i = 0; i < this.edgeCount; i++) {
        if (this.gpuData!.groups[i] !== 0) continue;

        const vis = visibleEdges.has(i) ? 1 : 0;
        visibleArray[edgeIdx * 2] = vis;
        visibleArray[edgeIdx * 2 + 1] = vis;
        edgeIdx++;
      }

      visibleAttr.needsUpdate = true;
    }

    // Update semantic edges
    if (this.semanticLines) {
      const visibleAttr = this.semanticLines.geometry.getAttribute('visible') as THREE.BufferAttribute;
      const visibleArray = visibleAttr.array as Float32Array;

      let edgeIdx = 0;
      for (let i = 0; i < this.edgeCount; i++) {
        if (this.gpuData!.groups[i] !== 1) continue;

        const vis = visibleEdges.has(i) ? 1 : 0;
        visibleArray[edgeIdx * 2] = vis;
        visibleArray[edgeIdx * 2 + 1] = vis;
        edgeIdx++;
      }

      visibleAttr.needsUpdate = true;
    }

    // Sync visibility to curved 3D geometry
    this.syncAttrToCurved(this.deterministicLines, this.deterministicLines3D, 'visible', 1);
    this.syncAttrToCurved(this.semanticLines, this.semanticLines3D, 'visible', 1);
  }

  /**
   * Show all edges
   */
  showAllEdges(): void {
    if (this.deterministicLines) {
      const visibleAttr = this.deterministicLines.geometry.getAttribute('visible') as THREE.BufferAttribute;
      const visibleArray = visibleAttr.array as Float32Array;
      visibleArray.fill(1);
      visibleAttr.needsUpdate = true;
    }

    if (this.semanticLines) {
      const visibleAttr = this.semanticLines.geometry.getAttribute('visible') as THREE.BufferAttribute;
      const visibleArray = visibleAttr.array as Float32Array;
      visibleArray.fill(1);
      visibleAttr.needsUpdate = true;
    }

    // Also fill curved 3D geometry
    if (this.deterministicLines3D) {
      const attr = this.deterministicLines3D.geometry.getAttribute('visible') as THREE.BufferAttribute;
      (attr.array as Float32Array).fill(1);
      attr.needsUpdate = true;
    }
    if (this.semanticLines3D) {
      const attr = this.semanticLines3D.geometry.getAttribute('visible') as THREE.BufferAttribute;
      (attr.array as Float32Array).fill(1);
      attr.needsUpdate = true;
    }
  }

  /**
   * Set edge types to hide (visual only - doesn't affect physics)
   * @param hiddenTypes Set of edge type strings to hide
   */
  setHiddenEdgeTypes(hiddenTypes: Set<string>): void {
    this.hiddenEdgeTypes = hiddenTypes;

    if (!this.gpuData || this.allEdgesData.length === 0) return;

    // Update deterministic edges visibility
    if (this.deterministicLines) {
      const visibleAttr = this.deterministicLines.geometry.getAttribute('visible') as THREE.BufferAttribute;
      const visibleArray = visibleAttr.array as Float32Array;

      let edgeIdx = 0;
      for (let i = 0; i < this.allEdgesData.length; i++) {
        if (this.gpuData.groups[i] !== 0) continue; // Skip non-deterministic

        const edge = this.allEdgesData[i];
        const edgeType = edge.type || 'embedding';
        const isHidden = hiddenTypes.has(edgeType);

        visibleArray[edgeIdx * 2] = isHidden ? 0 : 1;
        visibleArray[edgeIdx * 2 + 1] = isHidden ? 0 : 1;
        edgeIdx++;
      }

      visibleAttr.needsUpdate = true;
    }

    // Update semantic edges visibility
    if (this.semanticLines) {
      const visibleAttr = this.semanticLines.geometry.getAttribute('visible') as THREE.BufferAttribute;
      const visibleArray = visibleAttr.array as Float32Array;

      let edgeIdx = 0;
      for (let i = 0; i < this.allEdgesData.length; i++) {
        if (this.gpuData.groups[i] !== 1) continue; // Skip non-semantic

        const edge = this.allEdgesData[i];
        const edgeType = edge.type || 'embedding';
        const isHidden = hiddenTypes.has(edgeType);

        visibleArray[edgeIdx * 2] = isHidden ? 0 : 1;
        visibleArray[edgeIdx * 2 + 1] = isHidden ? 0 : 1;
        edgeIdx++;
      }

      visibleAttr.needsUpdate = true;
    }

    // Sync visibility to curved 3D geometry
    this.syncAttrToCurved(this.deterministicLines, this.deterministicLines3D, 'visible', 1);
    this.syncAttrToCurved(this.semanticLines, this.semanticLines3D, 'visible', 1);
  }

  /**
   * Get currently hidden edge types
   */
  getHiddenEdgeTypes(): Set<string> {
    return this.hiddenEdgeTypes;
  }

  /**
   * Highlight specific edges (by global edge index) and dim all others.
   * Stores original colors for restoration via clearEdgeHighlights().
   */
  highlightEdges(highlightedEdgeIndices: Set<number>): void {
    if (!this.gpuData) return;
    const DIM = 0.08;  // Dimming factor for non-highlighted edges

    // Deterministic group
    if (this.deterministicLines) {
      const colorAttr = this.deterministicLines.geometry.getAttribute('color') as THREE.BufferAttribute;
      const colors = colorAttr.array as Float32Array;

      // Store originals on first highlight
      if (!this.deterministicOriginalColors) {
        this.deterministicOriginalColors = new Float32Array(colors);
      }

      let edgeIdx = 0;
      for (let i = 0; i < this.edgeCount; i++) {
        if (this.gpuData.groups[i] !== 0) continue;

        const px = edgeIdx * 6;
        const orig = this.deterministicOriginalColors;
        if (highlightedEdgeIndices.has(i)) {
          // Highlighted: restore original + slight boost
          colors[px]     = Math.min(orig[px] * 1.3, 1.0);
          colors[px + 1] = Math.min(orig[px + 1] * 1.3, 1.0);
          colors[px + 2] = Math.min(orig[px + 2] * 1.3, 1.0);
          colors[px + 3] = Math.min(orig[px + 3] * 1.3, 1.0);
          colors[px + 4] = Math.min(orig[px + 4] * 1.3, 1.0);
          colors[px + 5] = Math.min(orig[px + 5] * 1.3, 1.0);
        } else {
          // Dim non-highlighted
          colors[px]     = orig[px] * DIM;
          colors[px + 1] = orig[px + 1] * DIM;
          colors[px + 2] = orig[px + 2] * DIM;
          colors[px + 3] = orig[px + 3] * DIM;
          colors[px + 4] = orig[px + 4] * DIM;
          colors[px + 5] = orig[px + 5] * DIM;
        }
        edgeIdx++;
      }
      colorAttr.needsUpdate = true;
    }

    // Semantic group
    if (this.semanticLines) {
      const colorAttr = this.semanticLines.geometry.getAttribute('color') as THREE.BufferAttribute;
      const colors = colorAttr.array as Float32Array;

      if (!this.semanticOriginalColors) {
        this.semanticOriginalColors = new Float32Array(colors);
      }

      let edgeIdx = 0;
      for (let i = 0; i < this.edgeCount; i++) {
        if (this.gpuData.groups[i] !== 1) continue;

        const px = edgeIdx * 6;
        const orig = this.semanticOriginalColors;
        if (highlightedEdgeIndices.has(i)) {
          colors[px]     = Math.min(orig[px] * 1.3, 1.0);
          colors[px + 1] = Math.min(orig[px + 1] * 1.3, 1.0);
          colors[px + 2] = Math.min(orig[px + 2] * 1.3, 1.0);
          colors[px + 3] = Math.min(orig[px + 3] * 1.3, 1.0);
          colors[px + 4] = Math.min(orig[px + 4] * 1.3, 1.0);
          colors[px + 5] = Math.min(orig[px + 5] * 1.3, 1.0);
        } else {
          colors[px]     = orig[px] * DIM;
          colors[px + 1] = orig[px + 1] * DIM;
          colors[px + 2] = orig[px + 2] * DIM;
          colors[px + 3] = orig[px + 3] * DIM;
          colors[px + 4] = orig[px + 4] * DIM;
          colors[px + 5] = orig[px + 5] * DIM;
        }
        edgeIdx++;
      }
      colorAttr.needsUpdate = true;
    }

    this.highlightActive = true;

    // Sync highlighted colors to curved 3D geometry
    this.syncAttrToCurved(this.deterministicLines, this.deterministicLines3D, 'color', 3);
    this.syncAttrToCurved(this.semanticLines, this.semanticLines3D, 'color', 3);
  }

  /**
   * Clear edge highlighting - restore original colors
   */
  clearEdgeHighlights(): void {
    if (!this.highlightActive) return;

    if (this.deterministicLines && this.deterministicOriginalColors) {
      const colorAttr = this.deterministicLines.geometry.getAttribute('color') as THREE.BufferAttribute;
      (colorAttr.array as Float32Array).set(this.deterministicOriginalColors);
      colorAttr.needsUpdate = true;
      this.deterministicOriginalColors = null;
    }

    if (this.semanticLines && this.semanticOriginalColors) {
      const colorAttr = this.semanticLines.geometry.getAttribute('color') as THREE.BufferAttribute;
      (colorAttr.array as Float32Array).set(this.semanticOriginalColors);
      colorAttr.needsUpdate = true;
      this.semanticOriginalColors = null;
    }

    this.highlightActive = false;

    // Sync restored colors to curved 3D geometry
    this.syncAttrToCurved(this.deterministicLines, this.deterministicLines3D, 'color', 3);
    this.syncAttrToCurved(this.semanticLines, this.semanticLines3D, 'color', 3);
  }

  /**
   * Check if edge highlighting is currently active
   */
  isHighlightActive(): boolean {
    return this.highlightActive;
  }

  /**
   * Set group visibility
   */
  setGroupVisible(group: EdgeGroup, visible: boolean): void {
    if (group === EdgeGroup.DETERMINISTIC) {
      this.settings.deterministic.visible = visible;
      if (this.viewMode === '3d') {
        if (this.deterministicLines) this.deterministicLines.visible = false;
        if (this.deterministicLines3D) this.deterministicLines3D.visible = visible;
      } else {
        if (this.deterministicLines) this.deterministicLines.visible = visible;
        if (this.deterministicLines3D) this.deterministicLines3D.visible = false;
      }
    } else if (group === EdgeGroup.SEMANTIC) {
      this.settings.semantic.visible = visible;
      if (this.viewMode === '3d') {
        if (this.semanticLines) this.semanticLines.visible = false;
        if (this.semanticLines3D) this.semanticLines3D.visible = visible;
      } else {
        if (this.semanticLines) this.semanticLines.visible = visible;
        if (this.semanticLines3D) this.semanticLines3D.visible = false;
      }
    }
  }

  /**
   * Get edge counts
   */
  getEdgeCounts(): { total: number; deterministic: number; semantic: number } {
    return {
      total: this.edgeCount,
      deterministic: this.deterministicCount,
      semantic: this.semanticCount
    };
  }

  /**
   * Get GPU data
   */
  getGPUData(): GPUEdgeData | null {
    return this.gpuData;
  }

  /**
   * Get current settings for a group
   */
  getGroupSettings(group: EdgeGroup): typeof this.settings.deterministic {
    return group === EdgeGroup.DETERMINISTIC
      ? this.settings.deterministic
      : this.settings.semantic;
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    if (this.deterministicLines) {
      this.deterministicLines.geometry.dispose();
      this.scene.remove(this.deterministicLines);
      this.deterministicLines = null;
    }

    if (this.semanticLines) {
      this.semanticLines.geometry.dispose();
      this.scene.remove(this.semanticLines);
      this.semanticLines = null;
    }

    if (this.deterministicMaterial) {
      this.deterministicMaterial.dispose();
      this.deterministicMaterial = null;
    }

    if (this.semanticMaterial) {
      this.semanticMaterial.dispose();
      this.semanticMaterial = null;
    }

    // Dispose curved 3D geometry
    this.disposeCurved3D();

    this.gpuData = null;
    this.edgeToGroup.clear();
    this.edgeCount = 0;
    this.deterministicCount = 0;
    this.semanticCount = 0;
    this.deterministicOriginalColors = null;
    this.semanticOriginalColors = null;
    this.highlightActive = false;
  }
}
