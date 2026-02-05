/**
 * TopologyRenderer - Renders simplicial complexes, persistence barcodes, and knowledge gaps
 *
 * Three.js visualization layer for topological data analysis results:
 * - Simplicial complex edges and triangles at a given filtration epsilon
 * - Knowledge gap voids as pulsing translucent spheres with labels
 * - 2D persistence barcode overlay panel
 */

import * as THREE from 'three';
import type { Bar, SimplicialComplex } from '../topology/PersistentHomology';
import type { KnowledgeGap } from '../topology/KnowledgeGapDetector';

// ═══════════════════════════════════════════════════════════════════════════
// COLORS
// ═══════════════════════════════════════════════════════════════════════════

const COMPLEX_EDGE_COLOR = 0x00BFFF;    // Cyan for simplicial edges
const COMPLEX_TRIANGLE_COLOR = 0x00CED1; // Teal for triangles
const GAP_COLOR = 0xFF6B35;              // Warm red-orange for knowledge gaps
const H0_BAR_COLOR = '#3B82F6';          // Blue for H0 bars
const H1_BAR_COLOR = '#F97316';          // Orange for H1 bars

// ═══════════════════════════════════════════════════════════════════════════
// TOPOLOGY RENDERER
// ═══════════════════════════════════════════════════════════════════════════

export class TopologyRenderer {
  private scene: THREE.Scene;

  // Simplicial complex rendering
  private complexEdges: THREE.LineSegments | null = null;
  private complexEdgeMaterial: THREE.LineBasicMaterial | null = null;
  private complexTriangles: THREE.Mesh | null = null;
  private complexTriangleMaterial: THREE.MeshBasicMaterial | null = null;

  // Knowledge gap rendering
  private gapGroup: THREE.Group;
  private gapMeshes: Map<string, THREE.Mesh> = new Map();
  private gapLabels: Map<string, THREE.Sprite> = new Map();
  private _gapData: KnowledgeGap[] = [];

  // State
  private currentEpsilon = 0;
  private visible = true;
  private startTime: number;

  // Barcode panel
  private barcodePanel: HTMLElement | null = null;
  private onBarClick: ((bar: Bar) => void) | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.gapGroup = new THREE.Group();
    this.gapGroup.name = 'topology-gaps';
    this.scene.add(this.gapGroup);
    this.startTime = Date.now();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SIMPLICIAL COMPLEX RENDERING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Render simplicial complex at current epsilon.
   * Edges are drawn as thin cyan lines; triangles as semi-transparent teal faces.
   */
  renderComplex(
    complex: SimplicialComplex,
    positions: Array<{ x: number; y: number }>,
    epsilon: number
  ): void {
    this.currentEpsilon = epsilon;

    // Dispose previous complex geometry
    this.disposeComplex();

    if (!this.visible) return;

    // ─── Edges ─────────────────────────────────────────────────────────

    if (complex.edges.length > 0) {
      const edgePositions = new Float32Array(complex.edges.length * 6);

      for (let e = 0; e < complex.edges.length; e++) {
        const [i, j] = complex.edges[e];
        const posA = positions[i];
        const posB = positions[j];
        if (!posA || !posB) continue;

        // Compute opacity based on how close the edge distance is to epsilon
        // (closer to epsilon = more transparent)
        const offset = e * 6;
        edgePositions[offset]     = posA.x;
        edgePositions[offset + 1] = posA.y;
        edgePositions[offset + 2] = 0;
        edgePositions[offset + 3] = posB.x;
        edgePositions[offset + 4] = posB.y;
        edgePositions[offset + 5] = 0;
      }

      const edgeGeometry = new THREE.BufferGeometry();
      edgeGeometry.setAttribute('position', new THREE.BufferAttribute(edgePositions, 3));

      this.complexEdgeMaterial = new THREE.LineBasicMaterial({
        color: COMPLEX_EDGE_COLOR,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });

      this.complexEdges = new THREE.LineSegments(edgeGeometry, this.complexEdgeMaterial);
      this.complexEdges.renderOrder = 1;
      this.complexEdges.frustumCulled = false;
      this.scene.add(this.complexEdges);
    }

    // ─── Triangles ─────────────────────────────────────────────────────

    if (complex.triangles && complex.triangles.length > 0) {
      const triPositions = new Float32Array(complex.triangles.length * 9);

      for (let t = 0; t < complex.triangles.length; t++) {
        const [i, j, k] = complex.triangles[t];
        const posA = positions[i];
        const posB = positions[j];
        const posC = positions[k];
        if (!posA || !posB || !posC) continue;

        const offset = t * 9;
        triPositions[offset]     = posA.x;
        triPositions[offset + 1] = posA.y;
        triPositions[offset + 2] = 0;
        triPositions[offset + 3] = posB.x;
        triPositions[offset + 4] = posB.y;
        triPositions[offset + 5] = 0;
        triPositions[offset + 6] = posC.x;
        triPositions[offset + 7] = posC.y;
        triPositions[offset + 8] = 0;
      }

      const triGeometry = new THREE.BufferGeometry();
      triGeometry.setAttribute('position', new THREE.BufferAttribute(triPositions, 3));

      this.complexTriangleMaterial = new THREE.MeshBasicMaterial({
        color: COMPLEX_TRIANGLE_COLOR,
        transparent: true,
        opacity: 0.05,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
      });

      this.complexTriangles = new THREE.Mesh(triGeometry, this.complexTriangleMaterial);
      this.complexTriangles.renderOrder = 0;
      this.complexTriangles.frustumCulled = false;
      this.scene.add(this.complexTriangles);
    }
  }

  /**
   * Dispose simplicial complex geometry (edges + triangles).
   */
  private disposeComplex(): void {
    if (this.complexEdges) {
      this.complexEdges.geometry.dispose();
      this.scene.remove(this.complexEdges);
      this.complexEdges = null;
    }
    if (this.complexEdgeMaterial) {
      this.complexEdgeMaterial.dispose();
      this.complexEdgeMaterial = null;
    }
    if (this.complexTriangles) {
      this.complexTriangles.geometry.dispose();
      this.scene.remove(this.complexTriangles);
      this.complexTriangles = null;
    }
    if (this.complexTriangleMaterial) {
      this.complexTriangleMaterial.dispose();
      this.complexTriangleMaterial = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // KNOWLEDGE GAP RENDERING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Render knowledge gaps as glowing translucent spheres with pulsing animation.
   */
  renderGaps(gaps: KnowledgeGap[]): void {
    // Clear existing gap meshes
    this.disposeGaps();
    this._gapData = gaps;

    if (!this.visible) return;

    for (const gap of gaps) {
      // Translucent sphere at gap center
      const geometry = new THREE.SphereGeometry(gap.radius || 30, 24, 16);
      const material = new THREE.MeshBasicMaterial({
        color: GAP_COLOR,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(gap.center.x, gap.center.y, 0);
      mesh.userData = { gapId: gap.id, persistence: gap.persistence };

      this.gapGroup.add(mesh);
      this.gapMeshes.set(gap.id, mesh);

      // Text label sprite above gap
      const label = this.createLabelSprite(gap.label, gap.radius);
      label.position.set(gap.center.x, gap.center.y + (gap.radius || 30) + 15, 0);
      this.gapGroup.add(label);
      this.gapLabels.set(gap.id, label);
    }
  }

  /**
   * Create a text label sprite using CanvasTexture.
   */
  private createLabelSprite(text: string, radius: number): THREE.Sprite {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    // Size canvas based on text length
    const fontSize = 14;
    ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;

    canvas.width = Math.ceil(textWidth + 16);
    canvas.height = fontSize + 8;

    // Redraw after resize (canvas clears on resize)
    ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#FF6B35';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false
    });

    const sprite = new THREE.Sprite(material);
    // Scale sprite to world units; maintain aspect ratio
    const scale = Math.max(radius * 0.8, 40);
    sprite.scale.set(scale, scale * (canvas.height / canvas.width), 1);

    return sprite;
  }

  /**
   * Dispose all gap meshes and labels.
   */
  private disposeGaps(): void {
    for (const mesh of this.gapMeshes.values()) {
      mesh.geometry.dispose();
      (mesh.material as THREE.MeshBasicMaterial).dispose();
      this.gapGroup.remove(mesh);
    }
    for (const sprite of this.gapLabels.values()) {
      (sprite.material as THREE.SpriteMaterial).map?.dispose();
      (sprite.material as THREE.SpriteMaterial).dispose();
      this.gapGroup.remove(sprite);
    }
    this.gapMeshes.clear();
    this.gapLabels.clear();
  }

  /**
   * Update gap pulse animation. Call in render loop.
   */
  updateGapAnimation(): void {
    if (this.gapMeshes.size === 0) return;

    const elapsed = (Date.now() - this.startTime) / 1000;

    for (const [_gapId, mesh] of this.gapMeshes) {
      // Pulsing scale oscillation
      const pulse = 1.0 + Math.sin(elapsed * 2.0 + mesh.position.x * 0.01) * 0.08;
      mesh.scale.setScalar(pulse);

      // Subtle opacity oscillation
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.08 + Math.sin(elapsed * 1.5 + mesh.position.y * 0.01) * 0.04;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PERSISTENCE BARCODE PANEL (2D HTML overlay)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create a 2D persistence barcode panel as an HTML overlay.
   * Horizontal bars: left = birth, right = death.
   * H0 bars are blue, H1 bars are orange.
   * Clicking a bar triggers a callback to highlight the corresponding feature.
   *
   * @param bars - Persistence bars from homology computation
   * @param container - DOM element to append the panel to
   * @returns The created HTML panel element
   */
  createBarcodePanel(bars: Bar[], container: HTMLElement): HTMLElement {
    // Remove existing panel
    if (this.barcodePanel && this.barcodePanel.parentElement) {
      this.barcodePanel.parentElement.removeChild(this.barcodePanel);
    }

    const panel = document.createElement('div');
    panel.className = 'topology-barcode-panel';
    Object.assign(panel.style, {
      position: 'absolute',
      bottom: '10px',
      right: '10px',
      width: '280px',
      maxHeight: '240px',
      overflowY: 'auto',
      backgroundColor: 'rgba(20, 10, 40, 0.9)',
      borderRadius: '8px',
      border: '1px solid rgba(139, 92, 246, 0.3)',
      padding: '10px',
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      fontSize: '11px',
      color: '#E2E8F0',
      zIndex: '100',
      pointerEvents: 'auto'
    });

    // Header
    const header = document.createElement('div');
    Object.assign(header.style, {
      fontWeight: '600',
      fontSize: '12px',
      marginBottom: '8px',
      color: '#C4B5FD',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    });
    header.textContent = 'Persistence Barcode';

    // Close button
    const closeBtn = document.createElement('span');
    closeBtn.textContent = 'x';
    Object.assign(closeBtn.style, {
      cursor: 'pointer',
      color: '#94A3B8',
      fontSize: '14px',
      lineHeight: '1'
    });
    closeBtn.addEventListener('click', () => {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // Determine scale: max birth/death among finite bars
    const finiteBars = bars.filter(b => isFinite(b.death));
    const maxValue = finiteBars.length > 0
      ? Math.max(...finiteBars.map(b => b.death))
      : 1;

    // Sort bars: H0 first, then H1; within each, by birth
    const sortedBars = [...bars]
      .filter(b => isFinite(b.death)) // Skip essential features in barcode
      .sort((a, b) => a.dimension - b.dimension || a.birth - b.birth);

    const barWidth = 240; // Pixels available for bars

    // Legend
    const legend = document.createElement('div');
    Object.assign(legend.style, {
      display: 'flex',
      gap: '12px',
      marginBottom: '6px',
      fontSize: '10px'
    });
    legend.innerHTML = `
      <span style="display:flex;align-items:center;gap:3px">
        <span style="width:12px;height:3px;background:${H0_BAR_COLOR};display:inline-block;border-radius:1px"></span>
        H0 (components)
      </span>
      <span style="display:flex;align-items:center;gap:3px">
        <span style="width:12px;height:3px;background:${H1_BAR_COLOR};display:inline-block;border-radius:1px"></span>
        H1 (loops)
      </span>
    `;
    panel.appendChild(legend);

    // Bar container
    const barContainer = document.createElement('div');
    Object.assign(barContainer.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '2px'
    });

    for (const bar of sortedBars) {
      const barEl = document.createElement('div');
      Object.assign(barEl.style, {
        display: 'flex',
        alignItems: 'center',
        height: '6px',
        cursor: 'pointer',
        position: 'relative'
      });

      const color = bar.dimension === 0 ? H0_BAR_COLOR : H1_BAR_COLOR;
      const left = (bar.birth / maxValue) * barWidth;
      const width = Math.max(((bar.death - bar.birth) / maxValue) * barWidth, 2);

      const line = document.createElement('div');
      Object.assign(line.style, {
        position: 'absolute',
        left: `${left}px`,
        width: `${width}px`,
        height: '4px',
        backgroundColor: color,
        borderRadius: '2px',
        opacity: '0.8',
        transition: 'opacity 0.15s'
      });

      barEl.appendChild(line);

      // Hover effect
      barEl.addEventListener('mouseenter', () => {
        line.style.opacity = '1.0';
        line.style.height = '6px';
      });
      barEl.addEventListener('mouseleave', () => {
        line.style.opacity = '0.8';
        line.style.height = '4px';
      });

      // Click handler: highlight feature in 3D
      barEl.addEventListener('click', () => {
        if (this.onBarClick) {
          this.onBarClick(bar);
        }
      });

      // Tooltip
      const persistence = (bar.death - bar.birth).toFixed(2);
      barEl.title = `H${bar.dimension}: birth=${bar.birth.toFixed(2)}, death=${bar.death.toFixed(2)}, persistence=${persistence}`;

      barContainer.appendChild(barEl);
    }

    panel.appendChild(barContainer);

    // Epsilon indicator axis
    const axis = document.createElement('div');
    Object.assign(axis.style, {
      marginTop: '6px',
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: '9px',
      color: '#94A3B8'
    });
    axis.innerHTML = `<span>0</span><span>${(maxValue / 2).toFixed(1)}</span><span>${maxValue.toFixed(1)}</span>`;
    panel.appendChild(axis);

    container.appendChild(panel);
    this.barcodePanel = panel;

    return panel;
  }

  /**
   * Set callback for when a barcode bar is clicked.
   */
  setOnBarClick(callback: (bar: Bar) => void): void {
    this.onBarClick = callback;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Update epsilon value. Triggers re-render of simplicial complex
   * if called with new positions/complex data.
   */
  setEpsilon(epsilon: number): void {
    this.currentEpsilon = epsilon;
  }

  /**
   * Get current epsilon value.
   */
  getEpsilon(): number {
    return this.currentEpsilon;
  }

  /**
   * Get currently rendered gap data.
   */
  getGapData(): KnowledgeGap[] {
    return this._gapData;
  }

  /**
   * Set visibility for all topology rendering.
   */
  setVisible(visible: boolean): void {
    this.visible = visible;

    if (this.complexEdges) this.complexEdges.visible = visible;
    if (this.complexTriangles) this.complexTriangles.visible = visible;
    this.gapGroup.visible = visible;

    if (this.barcodePanel) {
      this.barcodePanel.style.display = visible ? 'block' : 'none';
    }
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    this.disposeComplex();
    this.disposeGaps();

    this.scene.remove(this.gapGroup);

    if (this.barcodePanel && this.barcodePanel.parentElement) {
      this.barcodePanel.parentElement.removeChild(this.barcodePanel);
      this.barcodePanel = null;
    }

    this.onBarClick = null;
  }
}

export default TopologyRenderer;
