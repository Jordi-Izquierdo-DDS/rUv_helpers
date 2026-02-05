/**
 * GPUPicker - GPU-based color picking for O(1) node detection
 *
 * Uses a separate render target where each node is rendered with a unique color
 * based on its ID. Reading a single pixel gives us the node ID instantly.
 */

import * as THREE from 'three';
import { RENDER_CONFIG } from '../config/Constants';

export class GPUPicker {
  private renderer: THREE.WebGLRenderer;
  private camera: THREE.PerspectiveCamera;

  // Picking render target
  private pickingTarget: THREE.WebGLRenderTarget;
  private pickingScene: THREE.Scene;
  private pickingMaterial: THREE.ShaderMaterial;

  // Buffer for reading pixels
  private pixelBuffer: Uint8Array;

  // Node mapping
  private nodeIdToColor: Map<number, THREE.Color> = new Map();
  private colorToNodeId: Map<string, number> = new Map();

  // Picking meshes
  private pickingMeshes: Map<number, THREE.InstancedMesh> = new Map();

  constructor(
    renderer: THREE.WebGLRenderer,
    camera: THREE.PerspectiveCamera,
    _scene: THREE.Scene
  ) {
    this.renderer = renderer;
    this.camera = camera;

    // Create picking render target (1x1 pixel for efficiency)
    const resolution = RENDER_CONFIG.performance.pickingResolution;
    this.pickingTarget = new THREE.WebGLRenderTarget(resolution, resolution, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType
    });

    // Create picking scene (separate from main scene)
    this.pickingScene = new THREE.Scene();
    this.pickingScene.background = new THREE.Color(0x000000);

    // Create picking material
    this.pickingMaterial = new THREE.ShaderMaterial({
      vertexShader: `
        attribute vec3 pickingColor;
        varying vec3 vPickingColor;

        void main() {
          vPickingColor = pickingColor;
          vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vPickingColor;

        void main() {
          gl_FragColor = vec4(vPickingColor, 1.0);
        }
      `,
      side: THREE.DoubleSide
    });

    // Pixel buffer for reading
    this.pixelBuffer = new Uint8Array(4);
  }

  /**
   * Set up picking meshes from node renderer meshes
   */
  setupPickingMeshes(
    meshes: Map<number, THREE.InstancedMesh>,
    nodeCount: number
  ): void {
    // Clear existing picking meshes
    this.clearPickingMeshes();

    // Generate unique colors for each node
    this.generateNodeColors(nodeCount);

    // Create picking mesh for each shape type
    for (const [shapeType, mesh] of meshes) {
      const pickingGeometry = mesh.geometry.clone();

      // Add picking color attribute
      const pickingColors = new Float32Array(mesh.count * 3);
      pickingGeometry.setAttribute(
        'pickingColor',
        new THREE.InstancedBufferAttribute(pickingColors, 3)
      );

      const pickingMesh = new THREE.InstancedMesh(
        pickingGeometry,
        this.pickingMaterial.clone(),
        mesh.count
      );

      // Copy instance matrices
      pickingMesh.instanceMatrix.copy(mesh.instanceMatrix);
      pickingMesh.count = mesh.count;

      this.pickingMeshes.set(shapeType, pickingMesh);
      this.pickingScene.add(pickingMesh);
    }
  }

  /**
   * Generate unique colors for each node ID
   */
  private generateNodeColors(nodeCount: number): void {
    this.nodeIdToColor.clear();
    this.colorToNodeId.clear();

    for (let i = 0; i < nodeCount; i++) {
      // Convert node index to RGB (24-bit color = 16.7M unique values)
      // Add 1 to avoid black (0x000000) which is background
      const id = i + 1;
      const r = ((id >> 16) & 0xFF) / 255;
      const g = ((id >> 8) & 0xFF) / 255;
      const b = (id & 0xFF) / 255;

      const color = new THREE.Color(r, g, b);
      this.nodeIdToColor.set(i, color);

      // Store reverse mapping using hex string
      const colorKey = `${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)}`;
      this.colorToNodeId.set(colorKey, i);
    }
  }

  /**
   * Update picking colors for a specific mesh
   */
  updatePickingColors(
    shapeType: number,
    nodeIndices: Map<number, number> // globalIndex -> instanceIndex
  ): void {
    const pickingMesh = this.pickingMeshes.get(shapeType);
    if (!pickingMesh) return;

    const colorAttr = pickingMesh.geometry.getAttribute('pickingColor') as THREE.InstancedBufferAttribute;

    for (const [globalIndex, instanceIndex] of nodeIndices) {
      const color = this.nodeIdToColor.get(globalIndex);
      if (color) {
        colorAttr.setXYZ(instanceIndex, color.r, color.g, color.b);
      }
    }

    colorAttr.needsUpdate = true;
  }

  /**
   * Update instance matrices from main meshes
   */
  updateInstanceMatrices(meshes: Map<number, THREE.InstancedMesh>): void {
    for (const [shapeType, mesh] of meshes) {
      const pickingMesh = this.pickingMeshes.get(shapeType);
      if (pickingMesh) {
        pickingMesh.instanceMatrix.copy(mesh.instanceMatrix);
        pickingMesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  /**
   * Pick node at screen coordinates
   * Returns node index or null if no node found
   */
  pick(_screenX: number, _screenY: number): number | null {
    // Save current render target
    const currentTarget = this.renderer.getRenderTarget();

    // Create a camera that looks at just the point we're picking
    const pickingCamera = this.camera.clone();

    // Set picking render target
    this.renderer.setRenderTarget(this.pickingTarget);
    this.renderer.clear();

    // Render picking scene
    this.renderer.render(this.pickingScene, pickingCamera);

    // Read pixel
    this.renderer.readRenderTargetPixels(
      this.pickingTarget,
      0, 0,
      1, 1,
      this.pixelBuffer
    );

    // Restore render target
    this.renderer.setRenderTarget(currentTarget);

    // Decode color to node ID
    const r = this.pixelBuffer[0];
    const g = this.pixelBuffer[1];
    const b = this.pixelBuffer[2];

    // Check if it's background (black)
    if (r === 0 && g === 0 && b === 0) {
      return null;
    }

    // Look up node ID
    const colorKey = `${r},${g},${b}`;
    return this.colorToNodeId.get(colorKey) ?? null;
  }

  /**
   * Pick node at world coordinates (faster for known 3D position)
   */
  pickAtWorldPosition(
    worldX: number,
    worldY: number,
    worldZ: number,
    positions: Float32Array,
    nodeCount: number,
    tolerance: number = 50
  ): number | null {
    // Simple nearest-neighbor search for now
    // Can be optimized with spatial index (Octree) in Phase 3
    let closestIndex: number | null = null;
    let closestDist = tolerance * tolerance;

    for (let i = 0; i < nodeCount; i++) {
      const px = positions[i * 3];
      const py = positions[i * 3 + 1];
      const pz = positions[i * 3 + 2];

      const dx = px - worldX;
      const dy = py - worldY;
      const dz = pz - worldZ;
      const distSq = dx * dx + dy * dy + dz * dz;

      if (distSq < closestDist) {
        closestDist = distSq;
        closestIndex = i;
      }
    }

    return closestIndex;
  }

  /**
   * Clear picking meshes
   */
  private clearPickingMeshes(): void {
    for (const mesh of this.pickingMeshes.values()) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      this.pickingScene.remove(mesh);
    }
    this.pickingMeshes.clear();
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.clearPickingMeshes();
    this.pickingTarget.dispose();
    this.pickingMaterial.dispose();
    this.nodeIdToColor.clear();
    this.colorToNodeId.clear();
  }
}
