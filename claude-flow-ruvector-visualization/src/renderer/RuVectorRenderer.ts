/**
 * RuVectorRenderer - Main Three.js Scene Manager
 *
 * Central orchestrator for the visualization. Manages:
 * - WebGL renderer, scene, camera
 * - OrbitControls for pan/zoom
 * - NodeRenderer and EdgeRenderer
 * - Animation loop
 * - Event handling
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { NodeRenderer } from './NodeRenderer';
import { EdgeRenderer } from './EdgeRenderer';
import { HyperedgeRenderer, type NodePosition, type Hyperedge } from './HyperedgeRenderer';
import {
  RENDER_CONFIG,
  EdgeGroup,
  type GraphData,
  type GraphNode,
  type EdgeGroupSettings,
  type Preset
} from '../config/Constants';

export interface RuVectorRendererOptions {
  container: HTMLElement;
  antialias?: boolean;
  pixelRatio?: number;
}

export interface RendererStats {
  fps: number;
  nodes: number;
  edges: number;
  drawCalls: number;
  triangles: number;
}

export type ViewMode = '2d' | '2.5d' | '3d' | 'poincare' | 'spacetime' | 'tda' | 'pulse';

export class RuVectorRenderer {
  // Core Three.js objects
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;

  // Sub-renderers
  private nodeRenderer: NodeRenderer;
  private edgeRenderer: EdgeRenderer;
  private hyperedgeRenderer: HyperedgeRenderer;

  // Container
  private container: HTMLElement;

  // Data
  private graphData: GraphData | null = null;

  // Animation
  private animationId: number | null = null;
  private isRunning = false;

  // Stats tracking
  private frameCount = 0;
  private lastFpsUpdate = 0;
  private currentFps = 0;

  // Event callbacks
  private onNodeHover: ((node: GraphNode | null, index: number | null) => void) | null = null;
  private onNodeClick: ((node: GraphNode | null, index: number | null) => void) | null = null;
  private onSimulationTick: (() => void) | null = null;
  private onAnimateCallback: ((deltaTime: number) => void) | null = null;
  private lastFrameTime = 0;

  // Picking
  private mouse: THREE.Vector2;

  // View mode (2D flat vs 3D temporal layers)
  private viewMode: ViewMode = '2d';

  // Drag state
  private isDragging = false;
  private draggedNodeIndex: number | null = null;
  private dragStartMouse: { x: number; y: number } | null = null;
  private onNodeDrag: ((node: GraphNode, index: number) => void) | null = null;
  private onNodeUnpin: ((node: GraphNode, index: number) => void) | null = null;

  constructor(options: RuVectorRendererOptions) {
    this.container = options.container;

    // Create WebGL renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: options.antialias ?? true,
      alpha: true,
      powerPreference: 'high-performance'
    });

    this.renderer.setPixelRatio(options.pixelRatio ?? Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setClearColor(0x0D0612, 1);
    this.container.appendChild(this.renderer.domElement);

    // Create scene
    this.scene = new THREE.Scene();

    // Add lighting for 3D mode (MeshStandardMaterial requires lights)
    this.setupLights();

    // Create camera
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(
      RENDER_CONFIG.camera.fov,
      aspect,
      RENDER_CONFIG.camera.near,
      RENDER_CONFIG.camera.far
    );
    this.camera.position.set(0, 0, RENDER_CONFIG.camera.defaultZ);

    // Create OrbitControls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 100;
    this.controls.maxDistance = 50000;
    this.controls.enableRotate = false; // 2D view by default
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN
    };

    // Create sub-renderers
    this.nodeRenderer = new NodeRenderer(this.scene);
    this.edgeRenderer = new EdgeRenderer(this.scene);
    this.hyperedgeRenderer = new HyperedgeRenderer(this.scene);

    // Raycaster for picking
    // Raycaster available if needed for advanced picking
    this.mouse = new THREE.Vector2();

    // Set up event listeners
    this.setupEventListeners();

    // Handle resize
    window.addEventListener('resize', this.handleResize.bind(this));

    console.log('Three.js renderer initialized');
  }

  /**
   * Set up lighting for the scene
   * Required for MeshStandardMaterial in 3D mode
   */
  private setupLights(): void {
    // Ambient light provides base illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    // Main directional light for shadows and highlights
    const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
    mainLight.position.set(500, 800, 1000);
    this.scene.add(mainLight);

    // Secondary fill light from opposite side
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    fillLight.position.set(-500, -200, -500);
    this.scene.add(fillLight);

    // Hemisphere light for natural sky/ground gradient
    const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x362d59, 0.4);
    this.scene.add(hemiLight);
  }

  /**
   * Set up mouse event listeners
   */
  private setupEventListeners(): void {
    const canvas = this.renderer.domElement;

    // Mouse move for hover and drag
    canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));

    // Mouse down for drag start
    canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));

    // Mouse up for drag end
    canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));

    // Click for selection (handled separately from drag)
    canvas.addEventListener('click', this.handleClick.bind(this));

    // Double click to unpin node or fit view
    canvas.addEventListener('dblclick', this.handleDoubleClick.bind(this));
  }

  /**
   * Handle mouse move for hover detection and dragging
   */
  private handleMouseMove(event: MouseEvent): void {
    if (!this.graphData) return;

    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;

    // Handle dragging
    if (this.isDragging && this.draggedNodeIndex !== null) {
      const worldPos = this.screenToWorld(screenX, screenY);
      const node = this.graphData.nodes[this.draggedNodeIndex];

      // Update node position (keep Z in 3D mode)
      node.x = worldPos.x;
      node.y = worldPos.y;
      // Don't change Z during drag - keep temporal position

      // Pin the node (fx, fy are used by D3 force simulation)
      node.fx = worldPos.x;
      node.fy = worldPos.y;

      // Update renderer
      this.nodeRenderer.updatePositions(this.graphData.nodes);
      this.edgeRenderer.updatePositions(this.graphData.nodes);

      // Notify drag callback
      if (this.onNodeDrag) {
        this.onNodeDrag(node, this.draggedNodeIndex);
      }

      return;
    }

    // Normal hover detection (only when not dragging)
    if (!this.onNodeHover) return;

    // Use raycasting for 3D mode, simple projection for 2D
    let nodeIndex: number | null;
    if (this.viewMode === '3d' || this.viewMode === '2.5d' || this.viewMode === 'spacetime' || this.viewMode === 'tda') {
      nodeIndex = this.findNodeAtScreen(screenX, screenY);
    } else {
      const worldPos = this.screenToWorld(screenX, screenY);
      nodeIndex = this.nodeRenderer.getNodeIndexFromPosition(
        worldPos.x,
        worldPos.y,
        0,
        50 / this.getZoomLevel()
      );
    }

    if (nodeIndex !== null) {
      this.onNodeHover(this.graphData.nodes[nodeIndex], nodeIndex);
      this.renderer.domElement.style.cursor = 'grab';
    } else {
      this.onNodeHover(null, null);
      this.renderer.domElement.style.cursor = 'default';
    }
  }

  /**
   * Handle mouse down for drag start
   */
  private handleMouseDown(event: MouseEvent): void {
    if (!this.graphData || event.button !== 0) return; // Only left click

    const rect = this.container.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;

    // Check if clicking on a node (use 3D picking in 3D mode)
    let nodeIndex: number | null;
    if (this.viewMode === '3d' || this.viewMode === '2.5d' || this.viewMode === 'spacetime' || this.viewMode === 'tda') {
      nodeIndex = this.findNodeAtScreen(screenX, screenY);
    } else {
      const worldPos = this.screenToWorld(screenX, screenY);
      nodeIndex = this.nodeRenderer.getNodeIndexFromPosition(
        worldPos.x,
        worldPos.y,
        0,
        50 / this.getZoomLevel()
      );
    }

    if (nodeIndex !== null) {
      // Start dragging
      this.isDragging = true;
      this.draggedNodeIndex = nodeIndex;
      this.dragStartMouse = { x: event.clientX, y: event.clientY };

      // Disable orbit controls during drag
      this.controls.enabled = false;

      // Change cursor
      this.renderer.domElement.style.cursor = 'grabbing';
    }
  }

  /**
   * Handle mouse up for drag end
   */
  private handleMouseUp(_event: MouseEvent): void {
    if (this.isDragging) {
      // Re-enable orbit controls
      this.controls.enabled = true;

      // Reset cursor
      this.renderer.domElement.style.cursor = 'default';

      // Clear drag state
      this.isDragging = false;
      this.draggedNodeIndex = null;
      this.dragStartMouse = null;
    }
  }

  /**
   * Handle click for selection
   */
  private handleClick(event: MouseEvent): void {
    // Skip click if we just finished dragging (mouse moved significantly)
    if (this.dragStartMouse) {
      const dx = event.clientX - this.dragStartMouse.x;
      const dy = event.clientY - this.dragStartMouse.y;
      if (Math.sqrt(dx * dx + dy * dy) > 5) {
        return; // This was a drag, not a click
      }
    }

    if (!this.onNodeClick || !this.graphData) return;

    const rect = this.container.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;

    // Use 3D picking in 3D mode
    let nodeIndex: number | null;
    if (this.viewMode === '3d' || this.viewMode === '2.5d' || this.viewMode === 'spacetime' || this.viewMode === 'tda') {
      nodeIndex = this.findNodeAtScreen(screenX, screenY);
    } else {
      const worldPos = this.screenToWorld(screenX, screenY);
      nodeIndex = this.nodeRenderer.getNodeIndexFromPosition(
        worldPos.x,
        worldPos.y,
        0,
        50 / this.getZoomLevel()
      );
    }

    if (nodeIndex !== null) {
      this.onNodeClick(this.graphData.nodes[nodeIndex], nodeIndex);
    } else {
      this.onNodeClick(null, null);
    }
  }

  /**
   * Handle double click - unpin node or fit view
   */
  private handleDoubleClick(event: MouseEvent): void {
    if (!this.graphData) {
      this.fitView();
      return;
    }

    const rect = this.container.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;

    // Use 3D picking in 3D mode
    let nodeIndex: number | null;
    if (this.viewMode === '3d' || this.viewMode === '2.5d' || this.viewMode === 'spacetime' || this.viewMode === 'tda') {
      nodeIndex = this.findNodeAtScreen(screenX, screenY);
    } else {
      const worldPos = this.screenToWorld(screenX, screenY);
      nodeIndex = this.nodeRenderer.getNodeIndexFromPosition(
        worldPos.x,
        worldPos.y,
        0,
        50 / this.getZoomLevel()
      );
    }

    if (nodeIndex !== null) {
      // Double-click on node: unpin it
      const node = this.graphData.nodes[nodeIndex];
      node.fx = null;
      node.fy = null;

      // Notify callback to restart simulation
      if (this.onNodeUnpin) {
        this.onNodeUnpin(node, nodeIndex);
      }
    } else {
      // Double-click on empty space: fit view
      this.fitView();
    }
  }

  /**
   * Convert screen coordinates to world coordinates
   * In 3D mode, returns the ray direction for proper 3D picking
   */
  private screenToWorld(screenX: number, screenY: number): THREE.Vector3 {
    const vector = new THREE.Vector3();
    vector.set(
      (screenX / this.container.clientWidth) * 2 - 1,
      -(screenY / this.container.clientHeight) * 2 + 1,
      0.5
    );
    vector.unproject(this.camera);

    const dir = vector.sub(this.camera.position).normalize();

    // In 3D/2.5D mode, intersect with a plane perpendicular to camera view
    // For 2D mode, intersect with Z=0 plane
    if (this.viewMode === '3d' || this.viewMode === '2.5d' || this.viewMode === 'spacetime' || this.viewMode === 'tda') {
      // Use camera's forward direction to define intersection plane
      const planeNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(this.camera.quaternion);
      const planePoint = this.controls.target.clone();
      const denom = planeNormal.dot(dir);
      if (Math.abs(denom) > 0.0001) {
        const t = planeNormal.dot(planePoint.clone().sub(this.camera.position)) / denom;
        return this.camera.position.clone().add(dir.multiplyScalar(t));
      }
    }

    // 2D mode: intersect with Z=0
    const distance = -this.camera.position.z / dir.z;
    return this.camera.position.clone().add(dir.multiplyScalar(distance));
  }

  /**
   * Find node at screen position using raycasting (works in 3D)
   */
  private findNodeAtScreen(screenX: number, screenY: number): number | null {
    if (!this.graphData) return null;

    // Create ray from camera through mouse position
    const mouse = new THREE.Vector2(
      (screenX / this.container.clientWidth) * 2 - 1,
      -(screenY / this.container.clientHeight) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.camera);
    const ray = raycaster.ray;

    // Find closest node to the ray
    let closestIndex: number | null = null;
    let closestDist = Infinity;
    const tolerance = 30 / this.getZoomLevel(); // Screen-space tolerance

    for (let i = 0; i < this.graphData.nodes.length; i++) {
      const node = this.graphData.nodes[i];
      const nodePos = new THREE.Vector3(node.x ?? 0, node.y ?? 0, node.z ?? 0);

      // Distance from point to ray
      const toNode = nodePos.clone().sub(ray.origin);
      const projLength = toNode.dot(ray.direction);
      const closestPointOnRay = ray.origin.clone().add(ray.direction.clone().multiplyScalar(projLength));
      const dist = nodePos.distanceTo(closestPointOnRay);

      if (dist < tolerance && dist < closestDist) {
        closestDist = dist;
        closestIndex = i;
      }
    }

    return closestIndex;
  }

  /**
   * Get current zoom level
   */
  private getZoomLevel(): number {
    return RENDER_CONFIG.camera.defaultZ / this.camera.position.z;
  }

  /**
   * Handle window resize
   */
  private handleResize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
  }

  /**
   * Load graph data
   */
  setData(data: GraphData): void {
    this.graphData = data;

    // Set up nodes
    this.nodeRenderer.setNodes(data.nodes);

    // Set up edges
    this.edgeRenderer.setEdges(data.edges, data.nodes);

    // Auto fit view
    this.fitView();

    console.log(`RuVectorRenderer: Loaded ${data.nodes.length} nodes, ${data.edges.length} edges`);
  }

  /**
   * Add incremental data (for Live mode)
   * Merges new nodes/edges without full rebuild, highlights new elements
   * @returns Set of new node indices for highlighting
   */
  addIncrementalData(
    newData: GraphData,
    existingNodeIds: Set<string>
  ): { newNodeIndices: Set<number>; addedNodes: number; addedEdges: number } {
    if (!this.graphData) {
      this.setData(newData);
      return {
        newNodeIndices: new Set(newData.nodes.map((_, i) => i)),
        addedNodes: newData.nodes.length,
        addedEdges: newData.edges.length
      };
    }

    // Find new nodes (not in existing set)
    const newNodes = newData.nodes.filter(n => !existingNodeIds.has(String(n.id)));

    // Find new edges (source or target is a new node, or edge didn't exist)
    const existingEdgeKeys = new Set(
      this.graphData.edges.map(e => `${e.source}-${e.target}-${e.type || 'default'}`)
    );
    const newEdges = newData.edges.filter(e => {
      const key = `${e.source}-${e.target}-${e.type || 'default'}`;
      return !existingEdgeKeys.has(key);
    });

    if (newNodes.length === 0 && newEdges.length === 0) {
      return { newNodeIndices: new Set(), addedNodes: 0, addedEdges: 0 };
    }

    // Calculate indices for new nodes (they will be appended)
    const startIndex = this.graphData.nodes.length;
    const newNodeIndices = new Set<number>();
    newNodes.forEach((_, i) => newNodeIndices.add(startIndex + i));

    // Merge data
    const mergedNodes = [...this.graphData.nodes, ...newNodes];
    const mergedEdges = [...this.graphData.edges, ...newEdges];

    // Update stored data
    this.graphData = {
      ...this.graphData,
      nodes: mergedNodes,
      edges: mergedEdges
    };

    // Rebuild renderers with merged data
    this.nodeRenderer.setNodes(mergedNodes);
    this.edgeRenderer.setEdges(mergedEdges, mergedNodes);

    // Apply highlight to new nodes
    if (newNodeIndices.size > 0) {
      this.nodeRenderer.setHighlight(newNodeIndices);
    }

    console.log(`RuVectorRenderer: Added ${newNodes.length} nodes, ${newEdges.length} edges (total: ${mergedNodes.length} nodes, ${mergedEdges.length} edges)`);

    return { newNodeIndices, addedNodes: newNodes.length, addedEdges: newEdges.length };
  }

  /**
   * Get current node IDs as a Set for diffing
   */
  getNodeIds(): Set<string> {
    if (!this.graphData) return new Set();
    return new Set(this.graphData.nodes.map(n => String(n.id)));
  }

  /**
   * Update node positions (called during simulation)
   */
  updateNodePositions(nodes: GraphNode[]): void {
    this.nodeRenderer.updatePositions(nodes);
    this.edgeRenderer.updatePositions(nodes);

    if (this.onSimulationTick) {
      this.onSimulationTick();
    }
  }

  /**
   * Fit view to show all nodes with smooth animation
   */
  fitView(): void {
    if (!this.graphData || this.graphData.nodes.length === 0) return;

    // Calculate bounding box
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const node of this.graphData.nodes) {
      const x = node.x ?? 0;
      const y = node.y ?? 0;

      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const width = maxX - minX || 1000;
    const height = maxY - minY || 1000;

    // Calculate required camera distance
    const fov = this.camera.fov * Math.PI / 180;
    const aspect = this.camera.aspect;
    const distanceForWidth = (width / 2) / Math.tan(fov / 2) / aspect;
    const distanceForHeight = (height / 2) / Math.tan(fov / 2);
    const targetDistance = Math.max(distanceForWidth, distanceForHeight) * 1.2;

    // Smooth animation
    const startPos = this.camera.position.clone();
    const startTarget = this.controls.target.clone();
    const endPos = new THREE.Vector3(centerX, centerY, targetDistance);
    const endTarget = new THREE.Vector3(centerX, centerY, 0);
    const duration = 800; // ms
    const startTime = performance.now();

    const animate = () => {
      const elapsed = performance.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      // Ease out cubic for smooth deceleration
      const eased = 1 - Math.pow(1 - t, 3);

      this.camera.position.lerpVectors(startPos, endPos, eased);
      this.controls.target.lerpVectors(startTarget, endTarget, eased);
      this.controls.update();

      if (t < 1) {
        requestAnimationFrame(animate);
      }
    };

    animate();
  }

  /**
   * Start the animation loop
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.animate();
    console.log('Animation loop started');
  }

  /**
   * Stop the animation loop
   */
  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /**
   * Animation loop
   */
  private animate(): void {
    if (!this.isRunning) return;

    this.animationId = requestAnimationFrame(this.animate.bind(this));

    // Compute delta time for mode-specific animations
    const now = performance.now();
    const deltaTime = this.lastFrameTime > 0 ? (now - this.lastFrameTime) / 1000 : 0.016;
    this.lastFrameTime = now;

    // Update controls
    this.controls.update();

    // Update node animations
    this.nodeRenderer.update();

    // Per-frame mode-specific updates (TDA gap pulse, etc.)
    if (this.onAnimateCallback) {
      this.onAnimateCallback(deltaTime);
    }

    // Render
    this.renderer.render(this.scene, this.camera);

    // Update FPS
    this.frameCount++;
    if (now - this.lastFpsUpdate >= 1000) {
      this.currentFps = this.frameCount;
      this.frameCount = 0;
      this.lastFpsUpdate = now;
    }
  }

  /**
   * Set node colors using a color function
   */
  setNodeColors(colorFn: (node: GraphNode, index: number) => [number, number, number]): void {
    if (!this.graphData) return;
    this.nodeRenderer.updateColors(colorFn, this.graphData.nodes);
  }

  /**
   * Set node sizes using a size function
   */
  setNodeSizes(sizeFn: (node: GraphNode, index: number) => number): void {
    if (!this.graphData) return;
    this.nodeRenderer.updateSizes(sizeFn, this.graphData.nodes);
  }

  /**
   * Set node opacity
   */
  setNodeOpacity(opacity: number): void {
    this.nodeRenderer.setOpacity(opacity);
  }

  /**
   * Set edge group settings
   */
  setEdgeGroupSettings(group: EdgeGroup, settings: Partial<EdgeGroupSettings>): void {
    this.edgeRenderer.applyGroupSettings(group, settings);
  }

  /**
   * Apply a preset
   */
  applyPreset(preset: Preset): void {
    this.edgeRenderer.applyGroupSettings(EdgeGroup.DETERMINISTIC, preset.deterministic);
    this.edgeRenderer.applyGroupSettings(EdgeGroup.SEMANTIC, preset.semantic);
  }

  /**
   * Highlight specific nodes
   */
  highlightNodes(indices: number[]): void {
    this.nodeRenderer.setHighlight(new Set(indices));
  }

  /**
   * Highlight specific edges (by global edge index) and dim all others
   */
  highlightEdges(edgeIndices: Set<number>): void {
    this.edgeRenderer.highlightEdges(edgeIndices);
  }

  /**
   * Clear all highlights (nodes + edges)
   */
  clearHighlights(): void {
    this.nodeRenderer.clearHighlights();
    this.edgeRenderer.clearEdgeHighlights();
  }

  /**
   * Filter visible nodes
   */
  setVisibleNodes(indices: Set<number>): void {
    this.nodeRenderer.setVisibility(indices);

    // Also filter edges to only show edges between visible nodes
    if (this.graphData) {
      const visibleEdges = new Set<number>();
      this.graphData.edges.forEach((edge, i) => {
        // After D3 forceLink runs, source/target become node objects
        // We need to extract the nodeIndex from either the number or the object
        let sourceIdx: number;
        let targetIdx: number;

        if (typeof edge.source === 'number') {
          sourceIdx = edge.source;
        } else if (edge.source && typeof edge.source === 'object') {
          sourceIdx = (edge.source as GraphNode).nodeIndex ?? -1;
        } else {
          sourceIdx = -1;
        }

        if (typeof edge.target === 'number') {
          targetIdx = edge.target;
        } else if (edge.target && typeof edge.target === 'object') {
          targetIdx = (edge.target as GraphNode).nodeIndex ?? -1;
        } else {
          targetIdx = -1;
        }

        if (indices.has(sourceIdx) && indices.has(targetIdx)) {
          visibleEdges.add(i);
        }
      });
      this.edgeRenderer.setEdgeVisibility(visibleEdges);
    }
  }

  /**
   * Show all nodes
   */
  showAllNodes(): void {
    this.nodeRenderer.showAll();
    this.edgeRenderer.showAllEdges();
  }

  /**
   * Set edge types to hide (visual only - doesn't affect physics)
   * @param hiddenTypes Set of edge type strings to hide
   */
  setHiddenEdgeTypes(hiddenTypes: Set<string>): void {
    this.edgeRenderer.setHiddenEdgeTypes(hiddenTypes);
  }

  /**
   * Get currently hidden edge types
   */
  getHiddenEdgeTypes(): Set<string> {
    return this.edgeRenderer.getHiddenEdgeTypes();
  }

  /**
   * Set node types to hide (visual only - doesn't affect physics)
   * @param hiddenTypes Set of node type strings to hide (e.g., 'memory', 'neural_pattern')
   */
  setHiddenSourceTypes(hiddenTypes: Set<string>): void {
    this.nodeRenderer.setHiddenSourceTypes(hiddenTypes);
  }

  /**
   * Get currently hidden node types
   */
  getHiddenSourceTypes(): Set<string> {
    return this.nodeRenderer.getHiddenSourceTypes();
  }

  /**
   * Set event callbacks
   */
  onHover(callback: (node: GraphNode | null, index: number | null) => void): void {
    this.onNodeHover = callback;
  }

  onClick(callback: (node: GraphNode | null, index: number | null) => void): void {
    this.onNodeClick = callback;
  }

  onTick(callback: () => void): void {
    this.onSimulationTick = callback;
  }

  setOnAnimate(callback: ((deltaTime: number) => void) | null): void {
    this.onAnimateCallback = callback;
  }

  onDrag(callback: (node: GraphNode, index: number) => void): void {
    this.onNodeDrag = callback;
  }

  onUnpin(callback: (node: GraphNode, index: number) => void): void {
    this.onNodeUnpin = callback;
  }

  /**
   * Unpin a node (release it back to the force simulation)
   */
  unpinNode(nodeIndex: number): void {
    if (this.graphData && nodeIndex >= 0 && nodeIndex < this.graphData.nodes.length) {
      const node = this.graphData.nodes[nodeIndex];
      node.fx = null;
      node.fy = null;
    }
  }

  /**
   * Unpin all nodes
   */
  unpinAllNodes(): void {
    if (this.graphData) {
      for (const node of this.graphData.nodes) {
        node.fx = null;
        node.fy = null;
      }
    }
  }

  /**
   * Get renderer stats
   */
  getStats(): RendererStats {
    const info = this.renderer.info;
    return {
      fps: this.currentFps,
      nodes: this.nodeRenderer.getNodeCount(),
      edges: this.edgeRenderer.getEdgeCounts().total,
      drawCalls: info.render.calls,
      triangles: info.render.triangles
    };
  }

  /**
   * Get the Three.js scene
   */
  getScene(): THREE.Scene {
    return this.scene;
  }

  /**
   * Get the DOM container element
   */
  getContainer(): HTMLElement {
    return this.container;
  }

  /**
   * Get the camera
   */
  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  /**
   * Get the controls
   */
  getControls(): OrbitControls {
    return this.controls;
  }

  /**
   * Get the graph data
   */
  getGraphData(): GraphData | null {
    return this.graphData;
  }

  /**
   * Get current view mode
   */
  getViewMode(): ViewMode {
    return this.viewMode;
  }

  /**
   * Set view mode (2D, 2.5D, or 3D)
   * - '2d': Flat view, no rotation, pan with left/right click
   * - '2.5d': Tilted view with depth layers, right-click to rotate
   * - '3d': Full spherical orbit, left-drag rotates freely
   */
  setViewMode(mode: ViewMode): void {
    if (this.viewMode === mode) return;

    this.viewMode = mode;

    if (mode === '3d') {
      this.enterMode3DFull();
    } else if (mode === '2.5d') {
      this.enterMode3D();
    } else if (mode === 'poincare') {
      // Flat 2D-like mode with special overlays
      this.enterMode2D();
    } else if (mode === 'tda') {
      // TDA uses 3D orbit so users can rotate the topology
      this.enterMode3D();
    } else if (mode === 'spacetime') {
      // 3D mode with special geometry
      this.enterMode3DFull();
    } else if (mode === 'pulse') {
      // Pulse mode uses 2D camera - rotation handled by PulseRenderer
      this.enterMode2D();
    } else {
      this.enterMode2D();
    }

    console.log(`RuVectorRenderer: Switched to ${mode} mode`);
  }

  /**
   * Toggle between 2D and 3D modes
   */
  toggleViewMode(): ViewMode {
    this.setViewMode(this.viewMode === '2d' ? '3d' : '2d');
    return this.viewMode;
  }

  /**
   * Enter 2.5D mode - enable rotation and tilt camera
   * Keeps left-click for drag (nodes) and pan (empty space)
   * Right-click for rotation in 3D
   */
  private enterMode3D(): void {
    // Reset camera up vector for clean 3D entry
    this.camera.up.set(0, 1, 0);

    // Unified 3D controls: left-drag rotates, right-drag pans (same as full 3D)
    this.controls.enableRotate = true;
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,   // Unified: left-drag rotates in all 3D modes
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN      // Unified: right-drag pans in all 3D modes
    };

    // Tilt camera to show depth - position at an angle to see the layers
    const target = this.controls.target.clone();
    const distance = this.camera.position.distanceTo(target);

    // Position camera at an angle (20 degrees from above-front)
    const theta = Math.PI * 0.12;  // ~22 degrees tilt
    const phi = Math.PI * 0.08;    // Slight side angle

    const newPos = new THREE.Vector3(
      target.x + distance * Math.sin(phi),
      target.y + distance * Math.sin(theta),
      target.z + distance * Math.cos(phi) * Math.cos(theta)
    );

    // Animate to new position
    this.animateCameraTo(newPos, target);
  }

  /**
   * Enter full 3D mode - free spherical orbit controls
   * Left-drag rotates the view freely in all directions
   * Scroll zooms, right-drag pans
   */
  private enterMode3DFull(): void {
    // Reset camera up vector for clean 3D entry
    this.camera.up.set(0, 1, 0);

    // Full 3D orbit - rotate freely in all directions
    this.controls.enableRotate = true;
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,   // Left-drag rotates
      MIDDLE: THREE.MOUSE.DOLLY,  // Scroll zooms
      RIGHT: THREE.MOUSE.PAN      // Right-drag pans
    };

    // Position camera to view the sphere
    // Sphere is centered at origin with radius ~800
    const targetPos = new THREE.Vector3(0, 400, 1600);
    const targetLookAt = new THREE.Vector3(0, 0, 0);

    // Animate to the new position
    this.animateCameraTo(targetPos, targetLookAt);
  }

  /**
   * Enter 2D mode - disable rotation and flatten view
   */
  private enterMode2D(): void {
    // Disable rotation
    this.controls.enableRotate = false;
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN
    };

    // Reset camera up vector to eliminate rotational artifacts from 3D modes
    this.camera.up.set(0, 1, 0);

    // Always reset to clean top-down view, preserving XY pan and zoom distance
    const target = new THREE.Vector3(
      this.controls.target.x,
      this.controls.target.y,
      0
    );
    const distance = Math.max(
      this.camera.position.distanceTo(this.controls.target),
      500
    );
    const newPos = new THREE.Vector3(target.x, target.y, distance);
    this.controls.target.copy(target);
    this.animateCameraTo(newPos, target);

  }

  /**
   * Animate camera to a new position
   */
  private animateCameraTo(targetPos: THREE.Vector3, targetLookAt: THREE.Vector3, duration = 600): void {
    const startPos = this.camera.position.clone();
    const startTarget = this.controls.target.clone();
    const startTime = performance.now();

    const animate = () => {
      const elapsed = performance.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - t, 3);

      this.camera.position.lerpVectors(startPos, targetPos, eased);
      this.controls.target.lerpVectors(startTarget, targetLookAt, eased);
      this.controls.update();

      if (t < 1) {
        requestAnimationFrame(animate);
      }
    };

    animate();
  }

  /**
   * Update node Z positions (for temporal layering in 3D mode)
   */
  updateNodeZPositions(zPositions: Float32Array): void {
    this.nodeRenderer.updateZPositions(zPositions);
    // Also update edges to match node positions
    if (this.graphData) {
      this.edgeRenderer.updatePositions(this.graphData.nodes);
    }
  }

  /**
   * Apply depth-based visual effects
   */
  applyDepthEffects(zPositions: Float32Array): void {
    this.nodeRenderer.applyDepthOpacity(zPositions);
    this.nodeRenderer.applyDepthSize(zPositions);
  }

  /**
   * Reset depth effects (for returning to 2D mode)
   */
  resetDepthEffects(): void {
    this.nodeRenderer.resetDepthEffects();
  }

  /**
   * Get node renderer (for direct access to depth methods)
   */
  getNodeRenderer(): NodeRenderer {
    return this.nodeRenderer;
  }

  /**
   * Get edge renderer
   */
  getEdgeRenderer(): EdgeRenderer {
    return this.edgeRenderer;
  }

  /**
   * Get hyperedge renderer for convex hull management
   */
  getHyperedgeRenderer(): HyperedgeRenderer {
    return this.hyperedgeRenderer;
  }

  /**
   * Set hyperedges and create convex hulls
   * @param hyperedges - Array of hyperedge definitions
   * @param nodePositions - Map of node ID to position
   */
  setHyperedges(hyperedges: Hyperedge[], nodePositions: Map<string, NodePosition>): void {
    this.hyperedgeRenderer.createHulls(hyperedges, nodePositions);
  }

  /**
   * Update hyperedge hull positions when nodes move
   * @param nodePositions - Map of node ID to current position
   */
  updateHyperedgePositions(nodePositions: Map<string, NodePosition>): void {
    this.hyperedgeRenderer.updatePositions(nodePositions);
  }

  /**
   * Set hyperedge hull visibility
   */
  setHyperedgeVisibility(visible: boolean): void {
    this.hyperedgeRenderer.setVisible(visible);
  }

  /**
   * Toggle hyperedge visibility
   */
  toggleHyperedgeVisibility(): boolean {
    const currentVisible = this.hyperedgeRenderer.getHullCount() > 0;
    this.hyperedgeRenderer.setVisible(!currentVisible);
    return !currentVisible;
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.stop();

    // Remove event listeners
    window.removeEventListener('resize', this.handleResize.bind(this));

    // Dispose sub-renderers
    this.nodeRenderer.dispose();
    this.edgeRenderer.dispose();
    this.hyperedgeRenderer.dispose();

    // Dispose Three.js objects
    this.controls.dispose();
    this.renderer.dispose();

    // Remove canvas
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }

    console.log('RuVectorRenderer disposed');
  }
}
