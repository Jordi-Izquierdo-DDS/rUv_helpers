/**
 * PulseRenderer - Live system architecture diagram for the "Pulse" view mode.
 *
 * Renders a layered DAG of RuVector system components with animated
 * data-flow particles, health-colored nodes, and row-count badges.
 * Visual theme: Veracy Nebula (#0D0612 background, purple accents).
 */
import * as THREE from 'three';

// -- Types ------------------------------------------------------------------

interface PulseNode {
  id: string;
  label: string;
  layer: number;
  x: number;
  y: number;
  count: number;
  status: 'green' | 'yellow' | 'red';
  mesh?: THREE.Mesh;
  ring?: THREE.LineLoop;
  labelSprite?: THREE.Sprite;
  countSprite?: THREE.Sprite;
}

interface PulseEdge {
  source: string;
  target: string;
  line?: THREE.Line;
  arrow?: THREE.Mesh;
  particles: THREE.Mesh[];
  particleProgress: number[];
  active: boolean;
}

// -- Constants ---------------------------------------------------------------

const COLOR_GREEN  = new THREE.Color(0x10B981);
const COLOR_YELLOW = new THREE.Color(0xF59E0B);
const COLOR_RED    = new THREE.Color(0xEF4444);
const COLOR_BORDER = new THREE.Color(0x8B4FD9);
const COLOR_LABEL  = '#B794F6';
const COLOR_COUNT  = '#E0E0E0';

const PARTICLE_SPEED = 0.5; // full edge traversal in ~2 s
const MAX_PARTICLES_PER_EDGE = 3;
const NODE_MIN_RADIUS = 15;
const NODE_MAX_RADIUS = 60;

const NODE_DEFS: { id: string; label: string; layer: number }[] = [
  { id: 'hooks',           label: 'Hooks',            layer: 0 },
  { id: 'bridge',          label: 'Bridge',           layer: 1 },
  { id: 'onnx',            label: 'ONNX',             layer: 2 },
  { id: 'qlearning',       label: 'Q-Learning',       layer: 2 },
  { id: 'sona',            label: 'SONA',             layer: 2 },
  { id: 'postprocess',     label: 'post-process.js',  layer: 2 },
  { id: 'memories',        label: 'memories',         layer: 3 },
  { id: 'patterns',        label: 'patterns',         layer: 3 },
  { id: 'neural_patterns', label: 'neural_patterns',  layer: 3 },
  { id: 'edges',           label: 'edges',            layer: 3 },
  { id: 'agents',          label: 'agents',           layer: 3 },
  { id: 'trajectories',    label: 'trajectories',     layer: 3 },
  { id: 'sqlite',          label: 'SQLite',           layer: 4 },
];

const EDGE_DEFS: [string, string][] = [
  ['hooks', 'bridge'],
  ['bridge', 'memories'], ['bridge', 'onnx'], ['bridge', 'patterns'], ['bridge', 'agents'],
  ['onnx', 'memories'],
  ['qlearning', 'patterns'], ['qlearning', 'trajectories'],
  ['sona', 'memories'], ['sona', 'patterns'], ['sona', 'trajectories'],
  ['postprocess', 'neural_patterns'], ['postprocess', 'edges'], ['postprocess', 'agents'],
  ['memories', 'sqlite'], ['patterns', 'sqlite'], ['neural_patterns', 'sqlite'],
  ['edges', 'sqlite'], ['agents', 'sqlite'], ['trajectories', 'sqlite'],
];

// Table-backed node ids (used for data lookup)
const TABLE_NODES = new Set([
  'memories', 'patterns', 'neural_patterns', 'edges', 'agents', 'trajectories',
]);

// Map process nodes to their downstream table nodes for health derivation
const PROCESS_DOWNSTREAM: Record<string, string[]> = {
  hooks:       ['memories', 'patterns', 'agents'],
  bridge:      ['memories', 'patterns', 'agents'],
  onnx:        ['memories'],
  qlearning:   ['patterns', 'trajectories'],
  sona:        ['memories', 'patterns', 'trajectories'],
  postprocess: ['neural_patterns', 'edges', 'agents'],
  sqlite:      ['memories', 'patterns', 'neural_patterns', 'edges', 'agents', 'trajectories'],
};

// -- Helpers -----------------------------------------------------------------

function statusColor(s: 'green' | 'yellow' | 'red'): THREE.Color {
  if (s === 'green') return COLOR_GREEN.clone();
  if (s === 'yellow') return COLOR_YELLOW.clone();
  return COLOR_RED.clone();
}

function makeTextCanvas(
  text: string, fontSize: number, color: string, maxWidth: number,
): { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture } {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  canvas.width = maxWidth;
  canvas.height = fontSize + 12;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `bold ${fontSize}px monospace`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return { canvas, texture };
}

function radiusForCount(count: number, maxCount: number): number {
  if (maxCount <= 0) return NODE_MIN_RADIUS;
  const t = Math.min(count / maxCount, 1);
  return NODE_MIN_RADIUS + t * (NODE_MAX_RADIUS - NODE_MIN_RADIUS);
}

// -- PulseRenderer -----------------------------------------------------------

export class PulseRenderer {
  private scene: THREE.Scene;
  // @ts-ignore: Camera stored for potential future use
  private _camera: THREE.Camera;
  private group: THREE.Group;
  private nodes: Map<string, PulseNode> = new Map();
  private edges: PulseEdge[] = [];
  private visible = false;
  private time = 0;
  private disposed = false;

  // Mouse rotation state
  private isDragging = false;
  private previousMousePosition = { x: 0, y: 0 };
  private rotation = { x: 0, y: 0 };
  private targetRotation = { x: 0, y: 0 };
  private zoom = 1;
  private targetZoom = 1;
  private pan = { x: 0, y: 0 };
  private targetPan = { x: 0, y: 0 };
  private isPanning = false;
  private canvas: HTMLCanvasElement | null = null;

  // Bound event handlers for cleanup
  private boundMouseDown: (e: MouseEvent) => void;
  private boundMouseMove: (e: MouseEvent) => void;
  private boundMouseUp: (e: MouseEvent) => void;
  private boundWheel: (e: WheelEvent) => void;
  private boundContextMenu: (e: Event) => void;

  constructor(scene: THREE.Scene, _camera: THREE.Camera) {
    this.scene = scene;
    this._camera = _camera;
    this.group = new THREE.Group();
    this.group.visible = false;
    this.scene.add(this.group);
    this.initLayout();

    // Bind event handlers
    this.boundMouseDown = this.onMouseDown.bind(this);
    this.boundMouseMove = this.onMouseMove.bind(this);
    this.boundMouseUp = this.onMouseUp.bind(this);
    this.boundWheel = this.onWheel.bind(this);
    this.boundContextMenu = (e: Event) => e.preventDefault();
  }

  private initLayout(): void {
    const layerX: Record<number, number> = { 0: -500, 1: -250, 2: 0, 3: 280, 4: 550 };
    const layerItems: Record<number, string[]> = {};
    for (const def of NODE_DEFS) {
      (layerItems[def.layer] ??= []).push(def.id);
    }

    for (const def of NODE_DEFS) {
      const items = layerItems[def.layer];
      const idx = items.indexOf(def.id);
      const total = items.length;
      const spacing = 110;
      const yOffset = -(total - 1) * spacing * 0.5;
      this.nodes.set(def.id, {
        id: def.id,
        label: def.label,
        layer: def.layer,
        x: layerX[def.layer],
        y: yOffset + idx * spacing,
        count: 0,
        status: 'yellow',
      });
    }
  }

  /** Fetch wire-matrix data from the API and build all Three.js objects. */
  async loadData(): Promise<void> {
    // wireMatrix comes as Record<string, {count, status, latestTs}> from the API
    let wireObj: Record<string, { count: number; status: string; latestTs?: number | null }> = {};
    try {
      const resp = await fetch('/api/learning-pulse');
      if (resp.ok) {
        const json = await resp.json();
        wireObj = json.wireMatrix ?? {};
      }
    } catch {
      // API unavailable -- all nodes stay yellow/red
    }

    let maxCount = 1;
    for (const info of Object.values(wireObj)) {
      if (info.count > maxCount) maxCount = info.count;
    }

    // Assign counts and statuses to table-backed nodes
    for (const [id, node] of this.nodes) {
      if (TABLE_NODES.has(id)) {
        const info = wireObj[id];
        if (!info || info.status === 'red') {
          node.status = 'red';
          node.count = 0;
        } else if (info.count > 0) {
          node.status = 'green';
          node.count = info.count;
        } else {
          node.status = 'yellow';
          node.count = 0;
        }
      }
    }

    // Derive status for process nodes from downstream table health
    for (const [procId, downIds] of Object.entries(PROCESS_DOWNSTREAM)) {
      const node = this.nodes.get(procId);
      if (!node) continue;
      const downNodes = downIds.map((d) => this.nodes.get(d)).filter(Boolean) as PulseNode[];
      const anyGreen = downNodes.some((n) => n.status === 'green');
      const allRed = downNodes.every((n) => n.status === 'red');
      if (anyGreen) node.status = 'green';
      else if (allRed) node.status = 'red';
      else node.status = 'yellow';
      // Process nodes show sum of downstream counts
      node.count = downNodes.reduce((s, n) => s + n.count, 0);
    }

    // Build visuals
    this.createNodes(maxCount);
    this.createEdges();
    this.createParticles();
  }

  private createNodes(maxCount: number): void {
    for (const node of this.nodes.values()) {
      const radius = radiusForCount(node.count, maxCount);
      const color = statusColor(node.status);

      // Circle mesh
      const geo = new THREE.CircleGeometry(radius, 48);
      const mat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.85, depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(node.x, node.y, 0);
      this.group.add(mesh);
      node.mesh = mesh;

      // Border ring
      const ringGeo = new THREE.BufferGeometry().setFromPoints(
        new THREE.Path().absarc(0, 0, radius + 2, 0, Math.PI * 2, false).getPoints(48),
      );
      const ringMat = new THREE.LineBasicMaterial({
        color: COLOR_BORDER, transparent: true, opacity: 0.6,
      });
      const ring = new THREE.LineLoop(ringGeo, ringMat);
      ring.position.set(node.x, node.y, 0.1);
      this.group.add(ring);
      node.ring = ring;

      // Label sprite
      const { texture: labelTex } = makeTextCanvas(node.label, 18, COLOR_LABEL, 256);
      const labelMat = new THREE.SpriteMaterial({
        map: labelTex, transparent: true, depthWrite: false,
      });
      const labelSprite = new THREE.Sprite(labelMat);
      labelSprite.scale.set(120, 20, 1);
      labelSprite.position.set(node.x, node.y - radius - 18, 0.2);
      this.group.add(labelSprite);
      node.labelSprite = labelSprite;

      // Count badge sprite
      const countText = node.count > 0 ? node.count.toLocaleString() : '--';
      const { texture: countTex } = makeTextCanvas(countText, 16, COLOR_COUNT, 128);
      const countMat = new THREE.SpriteMaterial({
        map: countTex, transparent: true, depthWrite: false,
      });
      const countSprite = new THREE.Sprite(countMat);
      countSprite.scale.set(60, 14, 1);
      countSprite.position.set(node.x, node.y + radius + 14, 0.2);
      this.group.add(countSprite);
      node.countSprite = countSprite;
    }
  }

  private createEdges(): void {
    for (const [srcId, tgtId] of EDGE_DEFS) {
      const src = this.nodes.get(srcId);
      const tgt = this.nodes.get(tgtId);
      if (!src || !tgt) continue;

      const tgtCount = tgt.count;
      const thickness = 1 + Math.min(tgtCount / 200, 3);

      // Dashed line
      const points = [
        new THREE.Vector3(src.x, src.y, -0.1),
        new THREE.Vector3(tgt.x, tgt.y, -0.1),
      ];
      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
      const lineMat = new THREE.LineDashedMaterial({
        color: 0x8B4FD9, dashSize: 8, gapSize: 4,
        transparent: true, opacity: 0.4, linewidth: thickness,
      });
      const line = new THREE.Line(lineGeo, lineMat);
      line.computeLineDistances();
      this.group.add(line);

      // Arrow head (small triangle at target end)
      const dx = tgt.x - src.x;
      const dy = tgt.y - src.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const ux = dx / len;
      const uy = dy / len;
      const tgtRadius = (tgt.mesh?.geometry as THREE.CircleGeometry)
        ?.parameters?.radius ?? NODE_MIN_RADIUS;
      const ax = tgt.x - ux * (tgtRadius + 6);
      const ay = tgt.y - uy * (tgtRadius + 6);

      const arrowGeo = new THREE.BufferGeometry();
      const size = 6;
      const px = -uy * size;
      const py = ux * size;
      const verts = new Float32Array([
        ax + ux * size, ay + uy * size, -0.05,
        ax - px, ay - py, -0.05,
        ax + px, ay + py, -0.05,
      ]);
      arrowGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
      const arrowMat = new THREE.MeshBasicMaterial({
        color: 0x8B4FD9, transparent: true, opacity: 0.6, side: THREE.DoubleSide,
      });
      const arrow = new THREE.Mesh(arrowGeo, arrowMat);
      this.group.add(arrow);

      const active = tgt.status === 'green';
      this.edges.push({
        source: srcId, target: tgtId,
        line, arrow, particles: [], particleProgress: [],
        active,
      });
    }
  }

  private createParticles(): void {
    for (const edge of this.edges) {
      if (!edge.active) continue;
      const src = this.nodes.get(edge.source)!;
      const count = 1 + Math.floor(Math.random() * MAX_PARTICLES_PER_EDGE);
      const srcColor = statusColor(src.status);

      for (let i = 0; i < count; i++) {
        const geo = new THREE.SphereGeometry(3, 8, 8);
        const mat = new THREE.MeshBasicMaterial({
          color: srcColor, transparent: true, opacity: 0.9,
          blending: THREE.AdditiveBlending, depthWrite: false,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(src.x, src.y, 0.5);
        this.group.add(mesh);
        edge.particles.push(mesh);
        edge.particleProgress.push(i / count); // stagger start
      }
    }
  }

  update(dt: number): void {
    if (!this.visible || this.disposed) return;
    this.time += dt;

    // Update mouse-driven transforms (rotation, zoom, pan)
    this.updateTransforms();

    // Animate particles along edges
    for (const edge of this.edges) {
      if (!edge.active || edge.particles.length === 0) continue;
      const src = this.nodes.get(edge.source)!;
      const tgt = this.nodes.get(edge.target)!;

      for (let i = 0; i < edge.particles.length; i++) {
        edge.particleProgress[i] += PARTICLE_SPEED * dt;
        if (edge.particleProgress[i] >= 1) {
          edge.particleProgress[i] -= 1;
        }
        const t = edge.particleProgress[i];
        const px = src.x + (tgt.x - src.x) * t;
        const py = src.y + (tgt.y - src.y) * t;
        edge.particles[i].position.set(px, py, 0.5);

        // Fade near endpoints
        const fade = Math.sin(t * Math.PI);
        (edge.particles[i].material as THREE.MeshBasicMaterial).opacity = 0.3 + fade * 0.7;
      }
    }

    // Pulse node glow
    for (const node of this.nodes.values()) {
      if (!node.mesh) continue;
      const pulse = 0.75 + 0.15 * Math.sin(this.time * 2.5 + node.x * 0.01);
      (node.mesh.material as THREE.MeshBasicMaterial).opacity = pulse;
    }
  }

  setVisible(v: boolean): void {
    this.group.visible = v;
    this.visible = v;

    // Attach/detach mouse event listeners based on visibility
    if (v) {
      this.attachMouseListeners();
    } else {
      this.detachMouseListeners();
      // Reset rotation/zoom/pan when hiding
      this.rotation = { x: 0, y: 0 };
      this.targetRotation = { x: 0, y: 0 };
      this.zoom = 1;
      this.targetZoom = 1;
      this.pan = { x: 0, y: 0 };
      this.targetPan = { x: 0, y: 0 };
      this.group.rotation.set(0, 0, 0);
      this.group.scale.set(1, 1, 1);
      this.group.position.set(0, 0, 0);
    }
  }

  /**
   * Attach mouse event listeners for rotation/zoom/pan
   */
  private attachMouseListeners(): void {
    // Find the canvas element from the renderer
    const canvasElements = document.querySelectorAll('canvas');
    this.canvas = canvasElements.length > 0 ? canvasElements[0] as HTMLCanvasElement : null;

    if (this.canvas) {
      this.canvas.addEventListener('mousedown', this.boundMouseDown);
      this.canvas.addEventListener('mousemove', this.boundMouseMove);
      this.canvas.addEventListener('mouseup', this.boundMouseUp);
      this.canvas.addEventListener('mouseleave', this.boundMouseUp);
      this.canvas.addEventListener('wheel', this.boundWheel, { passive: false });
      this.canvas.addEventListener('contextmenu', this.boundContextMenu);
    }
  }

  /**
   * Detach mouse event listeners
   */
  private detachMouseListeners(): void {
    if (this.canvas) {
      this.canvas.removeEventListener('mousedown', this.boundMouseDown);
      this.canvas.removeEventListener('mousemove', this.boundMouseMove);
      this.canvas.removeEventListener('mouseup', this.boundMouseUp);
      this.canvas.removeEventListener('mouseleave', this.boundMouseUp);
      this.canvas.removeEventListener('wheel', this.boundWheel);
      this.canvas.removeEventListener('contextmenu', this.boundContextMenu);
    }
    this.isDragging = false;
    this.isPanning = false;
  }

  /**
   * Mouse down handler - start rotation or pan
   */
  private onMouseDown(e: MouseEvent): void {
    if (!this.visible) return;

    // Left button = rotate, Right button = pan
    if (e.button === 0) {
      this.isDragging = true;
      this.isPanning = false;
    } else if (e.button === 2) {
      this.isDragging = false;
      this.isPanning = true;
    }

    this.previousMousePosition = { x: e.clientX, y: e.clientY };
  }

  /**
   * Mouse move handler - update rotation or pan
   */
  private onMouseMove(e: MouseEvent): void {
    if (!this.visible) return;

    if (this.isDragging) {
      const deltaX = e.clientX - this.previousMousePosition.x;
      const deltaY = e.clientY - this.previousMousePosition.y;

      // Update target rotation (Y-axis for horizontal drag, X-axis for vertical drag)
      this.targetRotation.y += deltaX * 0.005;
      this.targetRotation.x += deltaY * 0.005;

      // Clamp X rotation to prevent flipping
      this.targetRotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.targetRotation.x));

      this.previousMousePosition = { x: e.clientX, y: e.clientY };
    } else if (this.isPanning) {
      const deltaX = e.clientX - this.previousMousePosition.x;
      const deltaY = e.clientY - this.previousMousePosition.y;

      // Update pan position (scaled by zoom level)
      this.targetPan.x += deltaX * 2 / this.zoom;
      this.targetPan.y -= deltaY * 2 / this.zoom;

      this.previousMousePosition = { x: e.clientX, y: e.clientY };
    }
  }

  /**
   * Mouse up handler - stop rotation or pan
   */
  private onMouseUp(_e: MouseEvent): void {
    this.isDragging = false;
    this.isPanning = false;
  }

  /**
   * Wheel handler - zoom in/out
   */
  private onWheel(e: WheelEvent): void {
    if (!this.visible) return;
    e.preventDefault();

    // Zoom with scroll wheel
    const zoomSpeed = 0.001;
    this.targetZoom -= e.deltaY * zoomSpeed;

    // Clamp zoom between 0.2 and 5.0
    this.targetZoom = Math.max(0.2, Math.min(5.0, this.targetZoom));
  }

  /**
   * Apply smooth interpolation to rotation, zoom, and pan
   */
  private updateTransforms(): void {
    const lerpFactor = 0.1;

    // Smoothly interpolate rotation
    this.rotation.x += (this.targetRotation.x - this.rotation.x) * lerpFactor;
    this.rotation.y += (this.targetRotation.y - this.rotation.y) * lerpFactor;

    // Smoothly interpolate zoom
    this.zoom += (this.targetZoom - this.zoom) * lerpFactor;

    // Smoothly interpolate pan
    this.pan.x += (this.targetPan.x - this.pan.x) * lerpFactor;
    this.pan.y += (this.targetPan.y - this.pan.y) * lerpFactor;

    // Apply transformations to the group
    this.group.rotation.x = this.rotation.x;
    this.group.rotation.y = this.rotation.y;
    this.group.scale.set(this.zoom, this.zoom, this.zoom);
    this.group.position.x = this.pan.x;
    this.group.position.y = this.pan.y;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    // Detach event listeners
    this.detachMouseListeners();

    const disposeMG = (o: { material: THREE.Material; geometry: THREE.BufferGeometry }) => {
      o.material.dispose();
      o.geometry.dispose();
    };
    const disposeSprite = (s: THREE.Sprite) => {
      const m = s.material as THREE.SpriteMaterial;
      m.map?.dispose();
      m.dispose();
    };
    for (const n of this.nodes.values()) {
      if (n.mesh) disposeMG(n.mesh as any);
      if (n.ring) disposeMG(n.ring as any);
      if (n.labelSprite) disposeSprite(n.labelSprite);
      if (n.countSprite) disposeSprite(n.countSprite);
    }
    for (const e of this.edges) {
      if (e.line) disposeMG(e.line as any);
      if (e.arrow) disposeMG(e.arrow as any);
      e.particles.forEach((p) => disposeMG(p as any));
    }
    this.scene.remove(this.group);
    this.nodes.clear();
    this.edges = [];
  }
}

export default PulseRenderer;
