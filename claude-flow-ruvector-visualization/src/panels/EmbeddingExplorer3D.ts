/**
 * EmbeddingExplorer3D - Three.js 3D Scatter Plot for Memory Embeddings
 *
 * Features:
 *  1. UMAP 3D projection of 384d embeddings
 *  2. InstancedMesh rendering for efficient node visualization
 *  3. Semantic edge highlighting with threshold slider
 *  4. Cluster coloring via DBSCAN-style clustering
 *  5. WASD fly-through navigation
 *
 * Data source: GET /api/embeddings-3d
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ============================================================================
// Theme Constants
// ============================================================================

const THEME = {
  bgBase: '#0D0612',
  bgSurface: '#1A0D2E',
  bgElevated: '#261442',
  primary: '#6B2FB5',
  primaryActive: '#B794F6',
  textPrimary: '#FFFFFF',
  textSecondary: '#E0E0E0',
  textMuted: '#B0B0B0',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  fontMono: "'JetBrains Mono', 'Fira Code', monospace",
} as const;

// Cluster color palette (12 distinct bright colors for visibility against dark background)
const CLUSTER_COLORS = [
  0x60a5fa, // Bright Blue
  0x10b981, // Emerald Green
  0xf59e0b, // Amber
  0xef4444, // Red
  0x8b5cf6, // Violet
  0xec4899, // Pink
  0x14b8a6, // Teal
  0xf97316, // Orange
  0x6366f1, // Indigo
  0x84cc16, // Lime
  0x06b6d4, // Cyan
  0xd946ef, // Fuchsia
];

// Noise/unclustered nodes - brighter gray for visibility
const NOISE_COLOR = 0x9ca3af; // Light Gray

// ============================================================================
// Types
// ============================================================================

/** 3D embedding node */
interface Embedding3DNode {
  id: string | number;
  x: number;
  y: number;
  z: number;
  cluster: number;
  source: string;
  namespace: string;
  connectionCount: number;
  rewardSum?: number;
  confidence?: number;
  color?: string;
}

/** Semantic edge between nodes */
interface Embedding3DEdge {
  source: number; // Node index
  target: number; // Node index
  similarity: number;
  type: 'semantic' | 'temporal' | 'file' | 'trajectory' | 'pattern';
}

/** Cluster information */
interface ClusterInfo {
  id: number;
  centroid: { x: number; y: number; z: number };
  size: number;
  color: number;
}

/** Full 3D embedding data response */
interface Embedding3DData {
  nodes: Embedding3DNode[];
  edges: Embedding3DEdge[];
  clusters: ClusterInfo[];
  meta: {
    nodeCount: number;
    edgeCount: number;
    clusterCount: number;
    similarityRange: { min: number; max: number };
  };
}

/** Edge type filter state */
type EdgeType = 'semantic' | 'temporal' | 'file' | 'trajectory' | 'pattern';

// ============================================================================
// Safe Number Utilities
// ============================================================================

function safeNum(val: any, fallback = 0): number {
  if (val == null || typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  return val;
}

function safePct(num: number, denom: number): string {
  if (denom === 0 || !Number.isFinite(num) || !Number.isFinite(denom)) return '0%';
  return `${Math.round(100 * num / denom)}%`;
}

function safeDisplay(val: any, fallback = '-'): string {
  if (val == null || (typeof val === 'number' && !Number.isFinite(val))) return fallback;
  return String(val);
}

// ============================================================================
// Helper Functions
// ============================================================================

/** Safe JSON fetch */
async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

/** Show "no data" message */
function showNoData(container: HTMLElement, message: string = 'No data yet'): void {
  const msg = document.createElement('div');
  msg.textContent = message;
  msg.style.cssText = `
    color:${THEME.textMuted};text-align:center;padding:40px 20px;
    font-size:14px;font-family:${THEME.fontMono};
  `;
  container.appendChild(msg);
}

/** Show loading indicator */
function showLoading(container: HTMLElement): HTMLElement {
  const loader = document.createElement('div');
  loader.className = 'embedding-3d-loader';
  loader.style.cssText = `
    position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
    display:flex;flex-direction:column;align-items:center;gap:12px;
    color:${THEME.textMuted};font-family:${THEME.fontMono};font-size:14px;
    z-index:10;
  `;

  const spinner = document.createElement('div');
  spinner.style.cssText = `
    width:40px;height:40px;border:3px solid ${THEME.bgElevated};
    border-top-color:${THEME.primaryActive};border-radius:50%;
    animation:embedding-spin 1s linear infinite;
  `;

  // Add keyframes for spinner animation
  if (!document.getElementById('embedding-spinner-style')) {
    const style = document.createElement('style');
    style.id = 'embedding-spinner-style';
    style.textContent = `
      @keyframes embedding-spin {
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }

  const text = document.createElement('span');
  text.textContent = 'Loading embeddings...';

  loader.appendChild(spinner);
  loader.appendChild(text);
  container.appendChild(loader);

  return loader;
}

/** Remove loading indicator */
function hideLoading(container: HTMLElement): void {
  const loader = container.querySelector('.embedding-3d-loader');
  if (loader) {
    loader.remove();
  }
}

/** Show error message */
function showError(container: HTMLElement, message: string): void {
  const errorDiv = document.createElement('div');
  errorDiv.style.cssText = `
    position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
    color:${THEME.error};text-align:center;padding:20px;
    font-size:14px;font-family:${THEME.fontMono};
    background:${THEME.bgSurface};border-radius:8px;
    border:1px solid ${THEME.error}44;max-width:80%;
  `;
  errorDiv.innerHTML = `
    <div style="font-size:24px;margin-bottom:8px;">&#9888;</div>
    <div>${message}</div>
  `;
  container.appendChild(errorDiv);
}

// ============================================================================
// EmbeddingExplorer3D Class
// ============================================================================

/**
 * 3D Embedding Explorer
 *
 * Renders memory embeddings in a navigable 3D space using Three.js.
 * Uses InstancedMesh for efficient rendering of thousands of nodes.
 */
export class EmbeddingExplorer3D {
  private panelContainer: HTMLElement | null = null;
  private canvasContainer: HTMLElement | null = null;
  private controlsPanel: HTMLElement | null = null;

  // Three.js components
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private controls: OrbitControls | null = null;

  // Scene objects
  private nodeMesh: THREE.InstancedMesh | null = null;
  private edgeLines: THREE.LineSegments | null = null;
  private nodeGeometry: THREE.SphereGeometry | null = null;
  private nodeMaterial: THREE.MeshStandardMaterial | null = null;
  private edgeMaterial: THREE.LineBasicMaterial | null = null;

  // Data
  private data: Embedding3DData | null = null;
  private filteredEdges: Embedding3DEdge[] = [];

  // Filter state
  private similarityThreshold: number = 0.72;
  private enabledEdgeTypes: Set<EdgeType> = new Set(['semantic']);

  // Animation
  private animationFrameId: number | null = null;
  private isDisposed: boolean = false;

  // Fly controls state
  private keyState: Record<string, boolean> = {};
  private flySpeed: number = 5;

  /**
   * Render the panel into a container
   */
  async render(container: HTMLElement): Promise<void> {
    this.panelContainer = container;
    container.innerHTML = '';
    container.style.cssText = `
      background:${THEME.bgBase};color:${THEME.textPrimary};
      font-family:${THEME.fontMono};overflow:hidden;
      display:flex;flex-direction:column;height:100%;
    `;

    // Controls panel
    this.controlsPanel = this.createControlsPanel();
    container.appendChild(this.controlsPanel);

    // Canvas container
    this.canvasContainer = document.createElement('div');
    this.canvasContainer.style.cssText = `
      flex:1;position:relative;min-height:400px;background:${THEME.bgBase};
    `;
    container.appendChild(this.canvasContainer);

    // Show loading indicator
    showLoading(this.canvasContainer);

    // Fetch data
    try {
      await this.loadData();
    } catch (error) {
      hideLoading(this.canvasContainer);
      showError(this.canvasContainer, `Failed to load embedding data: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return;
    }

    hideLoading(this.canvasContainer);

    if (!this.data) {
      showError(this.canvasContainer, 'No embedding data available. The API may be unavailable.');
      return;
    }

    if (this.data.nodes.length < 5) {
      showNoData(this.canvasContainer, `Insufficient embedding data (${this.data.nodes.length} nodes found, need 5+ memories with embeddings)`);
      return;
    }

    // Wait for container to have dimensions (important for proper canvas sizing)
    await this.waitForDimensions();

    // Initialize Three.js
    this.initThreeScene();
    this.createNodes();
    this.createEdges();
    this.setupLighting();
    this.setupFlyControls();

    // Position camera to fit data bounds
    this.fitCameraToData();

    this.animate();

    // Update stats display
    this.updateStats();
  }

  /**
   * Wait for container to have valid dimensions
   */
  private waitForDimensions(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.canvasContainer) {
        resolve();
        return;
      }

      const check = () => {
        if (this.canvasContainer && this.canvasContainer.clientWidth > 0 && this.canvasContainer.clientHeight > 0) {
          resolve();
        } else {
          requestAnimationFrame(check);
        }
      };
      check();
    });
  }

  /**
   * Load embedding data from the API
   */
  async loadData(threshold?: number): Promise<void> {
    const t = threshold ?? this.similarityThreshold;
    const edgeTypes = Array.from(this.enabledEdgeTypes).join(',');
    // FIX-005: Try primary endpoint first, then fallback to projection endpoint
    let result = await fetchJson<Embedding3DData>(
      `/api/embeddings-3d?threshold=${t}&includeEdgeTypes=${edgeTypes}`
    );
    // Fallback to embeddings/projection if primary endpoint unavailable
    if (!result) {
      const projectionResult = await fetchJson<{ points: Array<{ x: number; y: number; id: string; namespace: string; label: string }>; meta: { pointCount: number; namespaces: string[] } }>(
        `/api/embeddings/projection?limit=500`
      );
      if (projectionResult && projectionResult.points && projectionResult.points.length > 0) {
        // Transform projection data to 3D format
        result = {
          nodes: projectionResult.points.map((p, _i) => ({
            id: p.id,
            x: safeNum(p.x) * 100,
            y: safeNum(p.y) * 100,
            z: Math.random() * 50 - 25, // Random z for 3D effect
            cluster: Math.floor(Math.random() * 5),
            source: 'memory',
            namespace: safeDisplay(p.namespace, 'default'),
            connectionCount: 1
          })),
          edges: [],
          clusters: [],
          meta: {
            nodeCount: projectionResult.points.length,
            edgeCount: 0,
            clusterCount: 0,
            similarityRange: { min: 0, max: 1 }
          }
        };
      }
    }
    this.data = result;
  }

  /**
   * Calculate data bounds for camera positioning
   */
  private getDataBounds(): { min: THREE.Vector3; max: THREE.Vector3; center: THREE.Vector3; size: number } {
    if (!this.data || this.data.nodes.length === 0) {
      return {
        min: new THREE.Vector3(-100, -100, -100),
        max: new THREE.Vector3(100, 100, 100),
        center: new THREE.Vector3(0, 0, 0),
        size: 200
      };
    }

    const nodes = this.data.nodes;
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

    nodes.forEach(node => {
      min.x = Math.min(min.x, node.x);
      min.y = Math.min(min.y, node.y);
      min.z = Math.min(min.z, node.z);
      max.x = Math.max(max.x, node.x);
      max.y = Math.max(max.y, node.y);
      max.z = Math.max(max.z, node.z);
    });

    const center = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);
    const size = Math.max(max.x - min.x, max.y - min.y, max.z - min.z);

    return { min, max, center, size };
  }

  /**
   * Position camera to fit all data in view
   */
  private fitCameraToData(): void {
    if (!this.camera || !this.controls) return;

    const bounds = this.getDataBounds();
    const distance = bounds.size * 1.5; // Add some padding

    // Position camera looking at center from an angle
    this.camera.position.set(
      bounds.center.x + distance * 0.7,
      bounds.center.y + distance * 0.5,
      bounds.center.z + distance
    );

    // Point camera at center of data
    this.controls.target.copy(bounds.center);
    this.camera.lookAt(bounds.center);

    // Update near/far planes based on data size
    this.camera.near = Math.max(1, bounds.size * 0.01);
    this.camera.far = Math.max(10000, bounds.size * 10);
    this.camera.updateProjectionMatrix();

    // Update orbit controls limits
    this.controls.minDistance = Math.max(10, bounds.size * 0.1);
    this.controls.maxDistance = bounds.size * 5;
  }

  /**
   * Create the controls panel
   */
  private createControlsPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.style.cssText = `
      padding:12px 16px;background:${THEME.bgSurface};
      border-bottom:1px solid ${THEME.primary}33;
      display:flex;flex-wrap:wrap;align-items:center;gap:16px;
    `;

    // Threshold slider
    const thresholdGroup = document.createElement('div');
    thresholdGroup.style.cssText = 'display:flex;align-items:center;gap:8px;';

    const thresholdLabel = document.createElement('label');
    thresholdLabel.textContent = 'Similarity Threshold:';
    thresholdLabel.style.cssText = `font-size:12px;color:${THEME.textMuted};`;
    thresholdGroup.appendChild(thresholdLabel);

    const thresholdSlider = document.createElement('input');
    thresholdSlider.type = 'range';
    thresholdSlider.min = '0.5';
    thresholdSlider.max = '1.0';
    thresholdSlider.step = '0.01';
    thresholdSlider.value = String(this.similarityThreshold);
    thresholdSlider.style.cssText = 'width:120px;cursor:pointer;';
    thresholdGroup.appendChild(thresholdSlider);

    const thresholdValue = document.createElement('span');
    thresholdValue.textContent = this.similarityThreshold.toFixed(2);
    thresholdValue.style.cssText = `
      font-size:12px;color:${THEME.textPrimary};
      font-family:${THEME.fontMono};width:40px;
    `;
    thresholdGroup.appendChild(thresholdValue);

    thresholdSlider.addEventListener('input', () => {
      this.similarityThreshold = parseFloat(thresholdSlider.value);
      thresholdValue.textContent = this.similarityThreshold.toFixed(2);
    });

    thresholdSlider.addEventListener('change', async () => {
      await this.loadData();
      this.updateEdges();
      this.updateStats();
    });

    panel.appendChild(thresholdGroup);

    // Edge type checkboxes
    const edgeTypesGroup = document.createElement('div');
    edgeTypesGroup.style.cssText = 'display:flex;align-items:center;gap:12px;';

    const edgeTypesLabel = document.createElement('span');
    edgeTypesLabel.textContent = 'Edge Types:';
    edgeTypesLabel.style.cssText = `font-size:12px;color:${THEME.textMuted};`;
    edgeTypesGroup.appendChild(edgeTypesLabel);

    const edgeTypes: EdgeType[] = ['semantic', 'temporal', 'file', 'trajectory', 'pattern'];
    edgeTypes.forEach(type => {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `edge-${type}`;
      checkbox.checked = this.enabledEdgeTypes.has(type);
      checkbox.style.cssText = 'cursor:pointer;';

      checkbox.addEventListener('change', async () => {
        if (checkbox.checked) {
          this.enabledEdgeTypes.add(type);
        } else {
          this.enabledEdgeTypes.delete(type);
        }
        await this.loadData();
        this.updateEdges();
        this.updateStats();
      });

      const label = document.createElement('label');
      label.htmlFor = `edge-${type}`;
      label.textContent = type.charAt(0).toUpperCase() + type.slice(1);
      label.style.cssText = `
        font-size:11px;color:${THEME.textSecondary};cursor:pointer;
        display:flex;align-items:center;gap:3px;
      `;
      label.prepend(checkbox);

      edgeTypesGroup.appendChild(label);
    });

    panel.appendChild(edgeTypesGroup);

    // Stats display
    const statsDisplay = document.createElement('div');
    statsDisplay.id = 'embedding-stats';
    statsDisplay.style.cssText = `
      margin-left:auto;font-size:11px;color:${THEME.textMuted};
    `;
    panel.appendChild(statsDisplay);

    // Controls help
    const helpText = document.createElement('div');
    helpText.style.cssText = `
      font-size:10px;color:${THEME.textMuted};width:100%;margin-top:4px;
    `;
    helpText.textContent = 'Controls: Mouse drag to rotate | Scroll to zoom | WASD to fly | Shift for speed boost';
    panel.appendChild(helpText);

    return panel;
  }

  /**
   * Update the stats display
   */
  private updateStats(): void {
    const statsDisplay = document.getElementById('embedding-stats');
    if (!statsDisplay || !this.data) return;

    statsDisplay.innerHTML = `
      Nodes: <span style="color:${THEME.textPrimary};">${safeNum(this.data.meta.nodeCount)}</span>
      &nbsp;|&nbsp;
      Edges: <span style="color:${THEME.textPrimary};">${safeNum(this.data.meta.edgeCount)}</span>
      &nbsp;|&nbsp;
      Clusters: <span style="color:${THEME.textPrimary};">${safeNum(this.data.meta.clusterCount)}</span>
    `;
  }

  /**
   * Initialize the Three.js scene
   */
  private initThreeScene(): void {
    if (!this.canvasContainer) return;

    // Ensure container has dimensions - use fallback if needed
    let width = this.canvasContainer.clientWidth;
    let height = this.canvasContainer.clientHeight;

    if (width === 0) width = 800;
    if (height === 0) height = 600;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(THEME.bgBase);

    // Add fog for depth perception
    this.scene.fog = new THREE.Fog(THEME.bgBase, 500, 5000);

    // Camera - initial position will be adjusted by fitCameraToData
    this.camera = new THREE.PerspectiveCamera(60, width / height, 1, 10000);
    this.camera.position.set(0, 0, 500);

    // Renderer with better settings
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(THEME.bgBase, 1);

    // Style the canvas to fill container
    this.renderer.domElement.style.cssText = `
      display:block;width:100%;height:100%;
    `;
    this.canvasContainer.appendChild(this.renderer.domElement);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 50;
    this.controls.maxDistance = 5000;
    this.controls.target.set(0, 0, 0);

    // Handle resize
    this.resizeObserver = new ResizeObserver(() => {
      if (!this.canvasContainer || !this.camera || !this.renderer || this.isDisposed) return;
      const w = this.canvasContainer.clientWidth || 800;
      const h = this.canvasContainer.clientHeight || 600;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h, true);
    });
    this.resizeObserver.observe(this.canvasContainer);
  }

  // Store resize observer for cleanup
  private resizeObserver: ResizeObserver | null = null;

  /**
   * Set up scene lighting for good visibility on dark background
   */
  private setupLighting(): void {
    if (!this.scene) return;

    // Strong ambient light to ensure visibility
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);

    // Main directional light
    const dir1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dir1.position.set(1, 1, 1).normalize();
    this.scene.add(dir1);

    // Fill light from opposite direction
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.4);
    dir2.position.set(-1, -0.5, -1).normalize();
    this.scene.add(dir2);

    // Top light
    const dir3 = new THREE.DirectionalLight(0xffffff, 0.3);
    dir3.position.set(0, 1, 0);
    this.scene.add(dir3);

    // Hemisphere light for natural ambient variation
    const hemi = new THREE.HemisphereLight(0xffffff, 0x404040, 0.4);
    this.scene.add(hemi);
  }

  /**
   * Create instanced mesh for nodes
   */
  private createNodes(): void {
    if (!this.scene || !this.data) return;

    // Remove existing mesh
    if (this.nodeMesh) {
      this.scene.remove(this.nodeMesh);
      this.nodeMesh.dispose();
    }

    const nodes = this.data.nodes;
    const count = nodes.length;

    // Calculate appropriate node size based on data bounds
    const bounds = this.getDataBounds();
    const baseSize = Math.max(2, bounds.size * 0.015); // Node size scales with data spread

    // Geometry - larger spheres for better visibility
    this.nodeGeometry = new THREE.SphereGeometry(baseSize, 24, 16);

    // Material with emissive for glow effect (better visibility on dark background)
    this.nodeMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.3,
      metalness: 0.2,
      emissive: new THREE.Color(0x222222),
      emissiveIntensity: 0.3,
    });

    // Create instanced mesh
    this.nodeMesh = new THREE.InstancedMesh(this.nodeGeometry, this.nodeMaterial, count);
    this.nodeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // Set positions and colors
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();

    nodes.forEach((node, i) => {
      // Position
      position.set(node.x, node.y, node.z);

      // Scale based on connection count - ensure minimum visibility
      const nodeScale = 1 + Math.log(node.connectionCount + 1) / 3;
      scale.set(nodeScale, nodeScale, nodeScale);

      // Compose matrix
      matrix.compose(position, quaternion, scale);
      this.nodeMesh!.setMatrixAt(i, matrix);

      // Color based on cluster - use bright colors
      const clusterColor =
        node.cluster >= 0 && node.cluster < CLUSTER_COLORS.length
          ? CLUSTER_COLORS[node.cluster % CLUSTER_COLORS.length]
          : NOISE_COLOR;
      color.setHex(clusterColor);
      this.nodeMesh!.setColorAt(i, color);
    });

    this.nodeMesh.instanceMatrix.needsUpdate = true;
    if (this.nodeMesh.instanceColor) {
      this.nodeMesh.instanceColor.needsUpdate = true;
    }

    // Enable frustum culling for performance
    this.nodeMesh.frustumCulled = true;

    this.scene.add(this.nodeMesh);
  }

  /**
   * Create edge lines
   */
  private createEdges(): void {
    if (!this.scene || !this.data) return;

    this.filteredEdges = this.data.edges.filter(
      e => this.enabledEdgeTypes.has(e.type) && e.similarity >= this.similarityThreshold
    );

    this.updateEdgeGeometry();
  }

  /**
   * Update edge lines when filter changes
   */
  private updateEdges(): void {
    if (!this.data) return;

    this.filteredEdges = this.data.edges.filter(
      e => this.enabledEdgeTypes.has(e.type) && e.similarity >= this.similarityThreshold
    );

    this.updateEdgeGeometry();
  }

  /**
   * Update the edge line geometry
   */
  private updateEdgeGeometry(): void {
    if (!this.scene || !this.data) return;

    // Remove existing lines
    if (this.edgeLines) {
      this.scene.remove(this.edgeLines);
      this.edgeLines.geometry.dispose();
    }

    if (this.filteredEdges.length === 0) return;

    const nodes = this.data.nodes;
    const positions: number[] = [];
    const colors: number[] = [];

    const color = new THREE.Color();

    this.filteredEdges.forEach(edge => {
      const sourceNode = nodes[edge.source];
      const targetNode = nodes[edge.target];

      if (!sourceNode || !targetNode) return;

      // Position
      positions.push(sourceNode.x, sourceNode.y, sourceNode.z);
      positions.push(targetNode.x, targetNode.y, targetNode.z);

      // Color based on similarity (brighter = higher similarity)
      const intensity = 0.3 + edge.similarity * 0.7;
      color.setHSL(0.75, 0.6, intensity * 0.5); // Purple hue

      colors.push(color.r, color.g, color.b);
      colors.push(color.r, color.g, color.b);
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    if (!this.edgeMaterial) {
      this.edgeMaterial = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.5,
        linewidth: 1,
      });
    }

    this.edgeLines = new THREE.LineSegments(geometry, this.edgeMaterial);
    this.scene.add(this.edgeLines);
  }

  /**
   * Set up keyboard controls for fly-through navigation
   */
  private setupFlyControls(): void {
    const handleKeyDown = (e: KeyboardEvent) => {
      this.keyState[e.key.toLowerCase()] = true;
      if (e.key === 'Shift') this.flySpeed = 15;
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      this.keyState[e.key.toLowerCase()] = false;
      if (e.key === 'Shift') this.flySpeed = 5;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Store references for cleanup
    (this as any)._keydownHandler = handleKeyDown;
    (this as any)._keyupHandler = handleKeyUp;
  }

  /**
   * Update fly controls each frame
   */
  private updateFlyControls(): void {
    if (!this.camera || !this.controls) return;

    const direction = new THREE.Vector3();
    const right = new THREE.Vector3();

    // Get camera direction
    this.camera.getWorldDirection(direction);
    right.crossVectors(direction, this.camera.up).normalize();

    // Apply movement based on key state
    if (this.keyState['w']) {
      this.camera.position.addScaledVector(direction, this.flySpeed);
      this.controls.target.addScaledVector(direction, this.flySpeed);
    }
    if (this.keyState['s']) {
      this.camera.position.addScaledVector(direction, -this.flySpeed);
      this.controls.target.addScaledVector(direction, -this.flySpeed);
    }
    if (this.keyState['a']) {
      this.camera.position.addScaledVector(right, -this.flySpeed);
      this.controls.target.addScaledVector(right, -this.flySpeed);
    }
    if (this.keyState['d']) {
      this.camera.position.addScaledVector(right, this.flySpeed);
      this.controls.target.addScaledVector(right, this.flySpeed);
    }
    if (this.keyState['q']) {
      this.camera.position.y += this.flySpeed;
      this.controls.target.y += this.flySpeed;
    }
    if (this.keyState['e']) {
      this.camera.position.y -= this.flySpeed;
      this.controls.target.y -= this.flySpeed;
    }
  }

  /**
   * Animation loop
   */
  private animate(): void {
    if (this.isDisposed) return;

    this.animationFrameId = requestAnimationFrame(() => this.animate());

    this.updateFlyControls();

    if (this.controls) {
      this.controls.update();
    }

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /**
   * Set similarity threshold
   */
  setThreshold(threshold: number): void {
    this.similarityThreshold = Math.max(0, Math.min(1, threshold));
    this.updateEdges();
  }

  /**
   * Set enabled edge types
   */
  setEdgeTypes(types: EdgeType[]): void {
    this.enabledEdgeTypes = new Set(types);
    this.updateEdges();
  }

  /**
   * Get the container element
   */
  getContainer(): HTMLElement | null {
    return this.panelContainer;
  }

  /**
   * Dispose and clean up resources
   */
  dispose(): void {
    this.isDisposed = true;

    // Stop animation
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // Remove event listeners
    if ((this as any)._keydownHandler) {
      window.removeEventListener('keydown', (this as any)._keydownHandler);
    }
    if ((this as any)._keyupHandler) {
      window.removeEventListener('keyup', (this as any)._keyupHandler);
    }

    // Disconnect resize observer
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    // Dispose Three.js resources
    if (this.nodeMesh) {
      this.nodeMesh.dispose();
      this.nodeMesh = null;
    }
    if (this.nodeGeometry) {
      this.nodeGeometry.dispose();
      this.nodeGeometry = null;
    }
    if (this.nodeMaterial) {
      this.nodeMaterial.dispose();
      this.nodeMaterial = null;
    }
    if (this.edgeLines) {
      this.edgeLines.geometry.dispose();
      this.edgeLines = null;
    }
    if (this.edgeMaterial) {
      this.edgeMaterial.dispose();
      this.edgeMaterial = null;
    }
    if (this.controls) {
      this.controls.dispose();
      this.controls = null;
    }
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }

    this.scene = null;
    this.camera = null;
    this.panelContainer = null;
    this.canvasContainer = null;
    this.controlsPanel = null;
    this.data = null;
  }
}
