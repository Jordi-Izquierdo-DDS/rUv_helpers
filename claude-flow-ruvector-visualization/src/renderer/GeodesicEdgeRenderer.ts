/**
 * GeodesicEdgeRenderer - Renders geodesic (curved) edges in the Poincare disk.
 *
 * In the Poincare disk model of hyperbolic geometry, geodesics are arcs of
 * circles orthogonal to the boundary circle (or diameters through the origin).
 * This renderer computes those arcs via GeodesicComputer and builds subdivided
 * LineSegments geometry so that edges curve naturally in hyperbolic space.
 *
 * Architecture follows the same patterns as EdgeRenderer:
 *   - Separate LineSegments for deterministic vs semantic edge groups
 *   - Per-edge coloring by type, per-edge dash style (solid/dashed/dotted)
 *   - Custom ShaderMaterial reusing the existing edge.frag.glsl
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
} from '../config/Constants';
import { GeodesicComputer } from '../projection/GeodesicComputer';

// Shaders: geodesic-specific vertex shader paired with the shared fragment shader
import geodesicEdgeVertShader from './shaders/geodesic-edge.vert.glsl?raw';
import edgeFragShader from './shaders/edge.frag.glsl?raw';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/** Number of line sub-segments per geodesic arc. */
const SEGMENTS_PER_EDGE = 16;

// ═══════════════════════════════════════════════════════════════════════════
// EDGE TYPE STYLING (mirrored from EdgeRenderer for consistency)
// ═══════════════════════════════════════════════════════════════════════════

enum EdgeDashStyle {
  SOLID = 0,
  DASHED = 1,
  DOTTED = 2,
}

const EDGE_TYPE_DASH_STYLES: Record<string, EdgeDashStyle> = {
  // SOLID: Explicit structural / temporal relationships
  'co_edit': EdgeDashStyle.SOLID,
  'coedit': EdgeDashStyle.SOLID,
  'trajectory-memory': EdgeDashStyle.SOLID,
  'trajectory-sequence': EdgeDashStyle.SOLID,
  'explicit': EdgeDashStyle.SOLID,
  'sequence': EdgeDashStyle.SOLID,
  'test_pair': EdgeDashStyle.SOLID,
  'memory-agent': EdgeDashStyle.SOLID,
  'references': EdgeDashStyle.SOLID,
  'details': EdgeDashStyle.SOLID,
  'learned_from': EdgeDashStyle.SOLID,
  'extends': EdgeDashStyle.SOLID,
  'routes_to': EdgeDashStyle.SOLID,
  'has_state': EdgeDashStyle.SOLID,
  'has_action': EdgeDashStyle.SOLID,
  'is_agent': EdgeDashStyle.SOLID,
  'trajectory-agent': EdgeDashStyle.SOLID,
  'trajectory-neural': EdgeDashStyle.SOLID,

  // DASHED: Pattern / learned relationships
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
  'about_file': EdgeDashStyle.DASHED,
  'supersedes': EdgeDashStyle.DASHED,

  // DOTTED: Semantic / inferred relationships
  'semantic': EdgeDashStyle.DOTTED,
  'semantic_similar': EdgeDashStyle.DOTTED,
  'semantic_bridge': EdgeDashStyle.DOTTED,
  'embedding': EdgeDashStyle.DOTTED,
  'content-match': EdgeDashStyle.DOTTED,
  'type-mapping': EdgeDashStyle.DOTTED,
  'cross-type': EdgeDashStyle.DOTTED,
  'memory-context': EdgeDashStyle.DOTTED,
  'same-namespace': EdgeDashStyle.DOTTED,
  'same-source': EdgeDashStyle.DOTTED,
  'knn-bridge': EdgeDashStyle.DOTTED,
  'instance_of': EdgeDashStyle.DOTTED,
  'coordinates': EdgeDashStyle.DOTTED,
};

const EDGE_TYPE_COLORS: Record<string, number> = {
  'co_edit': 0x4A90D9,
  'coedit': 0x4A90D9,
  'trajectory-memory': 0x795548,
  'trajectory-sequence': 0x795548,
  'trajectory-action': 0x795548,
  'trajectory-outcome': 0x795548,
  'pattern': 0x808000,
  'pattern_produces': 0x808000,
  'same-state': 0x14B8A6,
  'same-action': 0x14B8A6,
  'same-state-prefix': 0x14B8A6,
  'same-agent': 0x14B8A6,
  'explicit': 0x10B981,
  'sequence': 0x10B981,
  'test_pair': 0x10B981,
  'memory-agent': 0x10B981,
  'success-cluster': 0x22C55E,
  'failure-cluster': 0xEF4444,
  'semantic': 0x9B59B6,
  'semantic_similar': 0x9B59B6,
  'semantic_bridge': 0x9B59B6,
  'embedding': 0x9B59B6,
  'content-match': 0xA855F7,
  'type-mapping': 0xA855F7,
  'cross-type': 0xA855F7,
  'memory-context': 0xA855F7,
  'same-namespace': 0x8B5CF6,
  'same-source': 0x8B5CF6,
  'knn-bridge': 0x8B5CF6,
  'references': 0xF59E0B,
  'details': 0x8B5CF6,
  'learned_from': 0x10B981,
  'about_file': 0x14B8A6,
  'extends': 0x06B6D4,
  'supersedes': 0xDC2626,
  'routes_to': 0xD946EF,
  'has_state': 0x22D3EE,
  'has_action': 0x10B981,
  'is_agent': 0x34495E,
  'trajectory-agent': 0xF59E0B,
  'trajectory-neural': 0x9B59B6,
};

// ═══════════════════════════════════════════════════════════════════════════
// EXTENDED EDGE INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

interface ExtendedGraphEdge extends GraphEdge {
  qValue?: number;
  visits?: number;
  similarity?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function getEdgeDashStyle(type: string | undefined): EdgeDashStyle {
  if (!type) return EdgeDashStyle.SOLID;
  return EDGE_TYPE_DASH_STYLES[type] ?? EdgeDashStyle.SOLID;
}

function getEdgeTypeColor(edge: ExtendedGraphEdge): [number, number, number] {
  const type = edge.type || 'semantic';

  // Pattern edges use Q-value gradient (red -> green)
  if (type === 'pattern' || type === 'pattern_produces') {
    const qValue = edge.qValue ?? 0.5;
    const lowColor = hexToRGB(0xFF0000);
    const highColor = hexToRGB(0x00FF00);
    return [
      lowColor[0] + (highColor[0] - lowColor[0]) * qValue,
      lowColor[1] + (highColor[1] - lowColor[1]) * qValue,
      lowColor[2] + (highColor[2] - lowColor[2]) * qValue,
    ];
  }

  const colorHex = EDGE_TYPE_COLORS[type];
  if (colorHex !== undefined) {
    return hexToRGB(colorHex);
  }

  // Fallback to group-based default color
  const group = getEdgeGroup(type);
  return group === EdgeGroup.DETERMINISTIC
    ? hexToRGB(COLORS.edges.deterministic)
    : hexToRGB(COLORS.edges.semantic);
}

function calculateEdgeWidth(edge: ExtendedGraphEdge): number {
  const type = edge.type || 'semantic';
  const weight = edge.weight ?? 0.5;

  switch (type) {
    case 'co_edit':
    case 'coedit':
      return weight * 5;
    case 'semantic':
    case 'semantic_similar':
    case 'semantic_bridge':
    case 'embedding': {
      const similarity = edge.similarity ?? edge.weight ?? 0.5;
      return 0.5 + similarity * 2;
    }
    case 'pattern':
    case 'pattern_produces': {
      const visits = edge.visits ?? 1;
      return 1 + Math.log(visits + 1);
    }
    case 'trajectory-memory':
    case 'trajectory-sequence':
    case 'trajectory-action':
    case 'trajectory-outcome':
      return 2;
    case 'learned_from':
    case 'routes_to':
      return 3;
    case 'references':
    case 'details':
    case 'about_file':
    case 'extends':
    case 'supersedes':
      return 2;
    case 'instance_of':
    case 'coordinates':
      return 1.5;
    default:
      return RENDER_CONFIG.edge.baseWidth * (0.5 + weight * 0.5);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GEODESIC EDGE RENDERER
// ═══════════════════════════════════════════════════════════════════════════

export class GeodesicEdgeRenderer {
  private scene: THREE.Scene;
  private geodesicComputer: GeodesicComputer;

  // Separate LineSegments for each edge group
  private deterministicLines: THREE.LineSegments | null = null;
  private semanticLines: THREE.LineSegments | null = null;

  // Materials
  private deterministicMaterial: THREE.ShaderMaterial | null = null;
  private semanticMaterial: THREE.ShaderMaterial | null = null;

  // Stored edge data per group (for recomputation)
  private deterministicEdges: ExtendedGraphEdge[] = [];
  private semanticEdges: ExtendedGraphEdge[] = [];

  // All edges in original order (for group classification)
  private allEdges: ExtendedGraphEdge[] = [];

  // Edge counts
  private deterministicCount = 0;
  private semanticCount = 0;

  constructor(scene: THREE.Scene, geodesicComputer: GeodesicComputer) {
    this.scene = scene;
    this.geodesicComputer = geodesicComputer;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Build geodesic edge geometry from edges and Poincare disk positions.
   *
   * @param edges - Array of graph edges (source/target may be indices or GraphNode)
   * @param poincarePositions - Array indexed by nodeIndex with {x, y} in disk coords
   * @param diskRadius - Scale factor: screenPos = poincarePos * diskRadius
   */
  setEdges(
    edges: GraphEdge[],
    poincarePositions: { x: number; y: number }[],
    diskRadius: number,
  ): void {
    this.dispose();

    this.allEdges = edges as ExtendedGraphEdge[];

    // Partition edges into deterministic / semantic groups
    const deterministicEdges: ExtendedGraphEdge[] = [];
    const semanticEdges: ExtendedGraphEdge[] = [];

    for (const edge of this.allEdges) {
      const group =
        edge.group === 'deterministic'
          ? EdgeGroup.DETERMINISTIC
          : edge.group === 'semantic'
            ? EdgeGroup.SEMANTIC
            : getEdgeGroup(edge.type || 'semantic');
      edge.group = group;

      if (group === EdgeGroup.DETERMINISTIC) {
        deterministicEdges.push(edge);
      } else {
        semanticEdges.push(edge);
      }
    }

    this.deterministicEdges = deterministicEdges;
    this.semanticEdges = semanticEdges;
    this.deterministicCount = deterministicEdges.length;
    this.semanticCount = semanticEdges.length;

    // Build geometry for each group
    if (deterministicEdges.length > 0) {
      const result = this.buildGroupGeometry(
        deterministicEdges,
        poincarePositions,
        diskRadius,
        EdgeGroup.DETERMINISTIC,
      );
      this.deterministicLines = result.lines;
      this.deterministicMaterial = result.material;
      this.deterministicLines.renderOrder = 0;
      this.scene.add(this.deterministicLines);
    }

    if (semanticEdges.length > 0) {
      const result = this.buildGroupGeometry(
        semanticEdges,
        poincarePositions,
        diskRadius,
        EdgeGroup.SEMANTIC,
      );
      this.semanticLines = result.lines;
      this.semanticMaterial = result.material;
      this.semanticLines.renderOrder = 0;
      this.scene.add(this.semanticLines);
    }

    console.log(
      `GeodesicEdgeRenderer: Set ${edges.length} edges ` +
        `(${this.deterministicCount} deterministic, ${this.semanticCount} semantic, ` +
        `${SEGMENTS_PER_EDGE} segments/arc)`,
    );
  }

  /**
   * Recompute all geodesic arcs with new Poincare positions.
   * Updates BufferGeometry position attributes in-place.
   */
  updatePositions(
    poincarePositions: { x: number; y: number }[],
    diskRadius: number,
  ): void {
    if (this.deterministicLines) {
      this.updateGroupPositions(
        this.deterministicLines,
        this.deterministicEdges,
        poincarePositions,
        diskRadius,
      );
    }

    if (this.semanticLines) {
      this.updateGroupPositions(
        this.semanticLines,
        this.semanticEdges,
        poincarePositions,
        diskRadius,
      );
    }
  }

  /**
   * Set visibility for all geodesic edges.
   */
  setVisible(visible: boolean): void {
    if (this.deterministicLines) this.deterministicLines.visible = visible;
    if (this.semanticLines) this.semanticLines.visible = visible;
  }

  /**
   * Set visibility for a specific edge group.
   */
  setGroupVisible(group: 'deterministic' | 'semantic', visible: boolean): void {
    if (group === 'deterministic' && this.deterministicLines) {
      this.deterministicLines.visible = visible;
    } else if (group === 'semantic' && this.semanticLines) {
      this.semanticLines.visible = visible;
    }
  }

  /**
   * Dispose all GPU resources.
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

    this.deterministicEdges = [];
    this.semanticEdges = [];
    this.allEdges = [];
    this.deterministicCount = 0;
    this.semanticCount = 0;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PRIVATE: GEOMETRY CONSTRUCTION
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Build LineSegments geometry for one edge group.
   *
   * For each edge the geodesic arc is computed (SEGMENTS_PER_EDGE + 1 points),
   * producing SEGMENTS_PER_EDGE sub-segments (pairs of consecutive arc points).
   * Each sub-segment occupies 2 vertices in the LineSegments buffer.
   */
  private buildGroupGeometry(
    edges: ExtendedGraphEdge[],
    poincarePositions: { x: number; y: number }[],
    diskRadius: number,
    group: EdgeGroup,
  ): { lines: THREE.LineSegments; material: THREE.ShaderMaterial } {
    const S = SEGMENTS_PER_EDGE;
    const edgeCount = edges.length;
    const totalVerts = edgeCount * S * 2; // S sub-segments * 2 verts each

    const positions = new Float32Array(totalVerts * 3);
    const colors = new Float32Array(totalVerts * 3);
    const visible = new Float32Array(totalVerts);
    const linePos = new Float32Array(totalVerts);
    const edgeLen = new Float32Array(totalVerts);
    const fog = new Float32Array(totalVerts).fill(1.0); // No fog in Poincare mode
    const dashStyle = new Float32Array(totalVerts);

    const isDeterministic = group === EdgeGroup.DETERMINISTIC;
    const groupOpacity = isDeterministic
      ? RENDER_CONFIG.edge.opacity.deterministic
      : RENDER_CONFIG.edge.opacity.semantic;

    for (let e = 0; e < edgeCount; e++) {
      const edge = edges[e];

      // Resolve source / target node indices
      const sourceIdx =
        typeof edge.source === 'number'
          ? edge.source
          : (edge.source as GraphNode).nodeIndex ?? 0;
      const targetIdx =
        typeof edge.target === 'number'
          ? edge.target
          : (edge.target as GraphNode).nodeIndex ?? 0;

      const srcPos = poincarePositions[sourceIdx];
      const tgtPos = poincarePositions[targetIdx];

      if (!srcPos || !tgtPos) continue;

      // Compute geodesic arc in disk coordinates (2D interleaved: x,y,x,y,...)
      const arcPoints2D = this.geodesicComputer.computeGeodesicArc(
        [srcPos.x, srcPos.y],
        [tgtPos.x, tgtPos.y],
        S,
      );

      // Compute total arc length in screen space for dash pattern calculations
      let totalLen = 0;
      for (let s = 0; s < S; s++) {
        const x0 = arcPoints2D[s * 2] * diskRadius;
        const y0 = arcPoints2D[s * 2 + 1] * diskRadius;
        const x1 = arcPoints2D[(s + 1) * 2] * diskRadius;
        const y1 = arcPoints2D[(s + 1) * 2 + 1] * diskRadius;
        const dx = x1 - x0;
        const dy = y1 - y0;
        totalLen += Math.sqrt(dx * dx + dy * dy);
      }

      // Per-edge styling
      const edgeColor = getEdgeTypeColor(edge);
      const edgeWidth = calculateEdgeWidth(edge);
      const normalizedWidth = Math.min(edgeWidth / 5, 1);
      const brightness = 0.5 + normalizedWidth * 0.5;

      const cr = edgeColor[0] * brightness;
      const cg = edgeColor[1] * brightness;
      const cb = edgeColor[2] * brightness;

      const dash = getEdgeDashStyle(edge.type);

      // Fill sub-segment vertices
      const baseVert = e * S * 2;
      const baseVert3 = baseVert * 3;
      let accumLen = 0;

      for (let seg = 0; seg < S; seg++) {
        // Arc point indices into 2D array
        const p0x = arcPoints2D[seg * 2] * diskRadius;
        const p0y = arcPoints2D[seg * 2 + 1] * diskRadius;
        const p1x = arcPoints2D[(seg + 1) * 2] * diskRadius;
        const p1y = arcPoints2D[(seg + 1) * 2 + 1] * diskRadius;

        // Vertex buffer offsets (2 verts per sub-segment)
        const v3 = baseVert3 + seg * 6; // 3-component position offset
        const v1 = baseVert + seg * 2;  // 1-component attribute offset

        // Positions (z = 0 for 2D Poincare disk)
        positions[v3] = p0x;
        positions[v3 + 1] = p0y;
        positions[v3 + 2] = 0;
        positions[v3 + 3] = p1x;
        positions[v3 + 4] = p1y;
        positions[v3 + 5] = 0;

        // Colors (same for both verts of this sub-segment)
        colors[v3] = cr;
        colors[v3 + 1] = cg;
        colors[v3 + 2] = cb;
        colors[v3 + 3] = cr;
        colors[v3 + 4] = cg;
        colors[v3 + 5] = cb;

        // Visibility
        visible[v1] = 1;
        visible[v1 + 1] = 1;

        // Dash style
        dashStyle[v1] = dash;
        dashStyle[v1 + 1] = dash;

        // linePos: interpolated 0 -> 1 along arc
        const segLen = Math.sqrt(
          (p1x - p0x) * (p1x - p0x) + (p1y - p0y) * (p1y - p0y),
        );
        linePos[v1] = totalLen > 0 ? accumLen / totalLen : 0;
        accumLen += segLen;
        linePos[v1 + 1] = totalLen > 0 ? accumLen / totalLen : 1;

        // Edge length (total arc length for dash pattern calculation)
        edgeLen[v1] = totalLen;
        edgeLen[v1 + 1] = totalLen;
      }
    }

    // Assemble BufferGeometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('visible', new THREE.BufferAttribute(visible, 1));
    geometry.setAttribute('linePos', new THREE.BufferAttribute(linePos, 1));
    geometry.setAttribute('edgeLen', new THREE.BufferAttribute(edgeLen, 1));
    geometry.setAttribute('fog', new THREE.BufferAttribute(fog, 1));
    geometry.setAttribute('dashStyle', new THREE.BufferAttribute(dashStyle, 1));

    // ShaderMaterial using geodesic vertex shader + shared fragment shader
    const material = new THREE.ShaderMaterial({
      vertexShader: geodesicEdgeVertShader,
      fragmentShader: edgeFragShader,
      uniforms: {
        uOpacity: { value: groupOpacity },
        uGlow: { value: isDeterministic ? 1 : 0 },
        uDashStyle: { value: 0 },
        uDashScale: { value: 1.0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      linewidth: isDeterministic
        ? RENDER_CONFIG.edge.baseWidth
        : RENDER_CONFIG.edge.baseWidth * 0.5,
    });

    const lines = new THREE.LineSegments(geometry, material);
    lines.frustumCulled = false;

    return { lines, material };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PRIVATE: POSITION UPDATES
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Recompute geodesic arcs for one edge group and update the position,
   * linePos, and edgeLen buffer attributes in-place.
   */
  private updateGroupPositions(
    lineSegments: THREE.LineSegments,
    edges: ExtendedGraphEdge[],
    poincarePositions: { x: number; y: number }[],
    diskRadius: number,
  ): void {
    const S = SEGMENTS_PER_EDGE;
    const posAttr = lineSegments.geometry.getAttribute('position') as THREE.BufferAttribute;
    const posArray = posAttr.array as Float32Array;
    const linePosAttr = lineSegments.geometry.getAttribute('linePos') as THREE.BufferAttribute;
    const linePosArray = linePosAttr.array as Float32Array;
    const edgeLenAttr = lineSegments.geometry.getAttribute('edgeLen') as THREE.BufferAttribute;
    const edgeLenArray = edgeLenAttr.array as Float32Array;

    for (let e = 0; e < edges.length; e++) {
      const edge = edges[e];

      const sourceIdx =
        typeof edge.source === 'number'
          ? edge.source
          : (edge.source as GraphNode).nodeIndex ?? 0;
      const targetIdx =
        typeof edge.target === 'number'
          ? edge.target
          : (edge.target as GraphNode).nodeIndex ?? 0;

      const srcPos = poincarePositions[sourceIdx];
      const tgtPos = poincarePositions[targetIdx];

      if (!srcPos || !tgtPos) continue;

      // Recompute geodesic arc
      const arcPoints2D = this.geodesicComputer.computeGeodesicArc(
        [srcPos.x, srcPos.y],
        [tgtPos.x, tgtPos.y],
        S,
      );

      // Compute total arc length
      let totalLen = 0;
      for (let s = 0; s < S; s++) {
        const x0 = arcPoints2D[s * 2] * diskRadius;
        const y0 = arcPoints2D[s * 2 + 1] * diskRadius;
        const x1 = arcPoints2D[(s + 1) * 2] * diskRadius;
        const y1 = arcPoints2D[(s + 1) * 2 + 1] * diskRadius;
        totalLen += Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2);
      }

      const baseVert = e * S * 2;
      const baseVert3 = baseVert * 3;
      let accumLen = 0;

      for (let seg = 0; seg < S; seg++) {
        const p0x = arcPoints2D[seg * 2] * diskRadius;
        const p0y = arcPoints2D[seg * 2 + 1] * diskRadius;
        const p1x = arcPoints2D[(seg + 1) * 2] * diskRadius;
        const p1y = arcPoints2D[(seg + 1) * 2 + 1] * diskRadius;

        const v3 = baseVert3 + seg * 6;
        const v1 = baseVert + seg * 2;

        // Positions
        posArray[v3] = p0x;
        posArray[v3 + 1] = p0y;
        posArray[v3 + 2] = 0;
        posArray[v3 + 3] = p1x;
        posArray[v3 + 4] = p1y;
        posArray[v3 + 5] = 0;

        // linePos
        const segLen = Math.sqrt((p1x - p0x) ** 2 + (p1y - p0y) ** 2);
        linePosArray[v1] = totalLen > 0 ? accumLen / totalLen : 0;
        accumLen += segLen;
        linePosArray[v1 + 1] = totalLen > 0 ? accumLen / totalLen : 1;

        // edgeLen
        edgeLenArray[v1] = totalLen;
        edgeLenArray[v1 + 1] = totalLen;
      }
    }

    posAttr.needsUpdate = true;
    linePosAttr.needsUpdate = true;
    edgeLenAttr.needsUpdate = true;
  }
}

export default GeodesicEdgeRenderer;
