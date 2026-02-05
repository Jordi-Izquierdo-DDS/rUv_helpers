/**
 * NodeRenderer - InstancedMesh-based node rendering for Three.js
 *
 * Uses one InstancedMesh per node shape type for efficient GPU rendering.
 * Supports both 2D flat shapes (Circle, Square, Diamond, Triangle) and
 * 3D geometries (Sphere, Icosahedron, Cone, Box, Torus, Octahedron, Tetrahedron, Dodecahedron).
 *
 * Phase 2-3 implementation: Multiple 3D shapes per node type with
 * color mapping per node type per VIZ doc color palette.
 */

import * as THREE from 'three';
import {
  NodeType,
  NodeShape,
  NodeShape3D,
  NODE_TYPE_SHAPES,
  NODE_TYPE_TO_SHAPE_3D,
  SOURCE_TO_NODE_TYPE,
  RENDER_CONFIG,
  hexToRGB,
  getNodeColor,
  type GraphNode,
  type GPUNodeData
} from '../config/Constants';

// Import shaders as raw strings (Vite handles this with ?raw)
import nodeVertShader from './shaders/node.vert.glsl?raw';
import nodeFragShader from './shaders/node.frag.glsl?raw';

/**
 * Mapping from global node index to mesh-specific data
 */
interface NodeMeshMapping {
  shape: NodeShape;           // 2D shape
  shape3D: NodeShape3D;       // 3D shape
  index2D: number;            // Index within 2D mesh
  index3D: number;            // Index within 3D mesh
}

export class NodeRenderer {
  private scene: THREE.Scene;

  // 2D flat meshes (one per NodeShape)
  private meshes2D: Map<NodeShape, THREE.InstancedMesh> = new Map();
  private materials2D: Map<NodeShape, THREE.ShaderMaterial> = new Map();

  // 3D meshes (one per NodeShape3D)
  private meshes3D: Map<NodeShape3D, THREE.InstancedMesh> = new Map();
  private materials3D: Map<NodeShape3D, THREE.MeshStandardMaterial> = new Map();

  // Node to mesh index mapping
  private nodeToMeshIndex: Map<number, NodeMeshMapping> = new Map();

  // Counts per shape type
  private shapeCounts2D: Map<NodeShape, number> = new Map();
  private shapeCounts3D: Map<NodeShape3D, number> = new Map();

  // GPU data buffers
  private gpuData: GPUNodeData | null = null;
  private nodeCount = 0;

  // Configuration
  private baseSize = RENDER_CONFIG.node.baseSize;
  private opacity = RENDER_CONFIG.node.opacity;

  // Time uniform for animations
  private startTime = Date.now();

  // Store all nodes for type-based filtering
  private allNodesData: GraphNode[] = [];
  private hiddenSourceTypes: Set<string> = new Set();

  // Z-position depth effect configuration (match ViewModeController defaults)
  private maxDepth = 1200;
  private opacityFalloff = 0.5;
  private sizeFalloff = 0.3;

  // Current view mode (for 3D sphere rendering)
  private viewMode: '2d' | '2.5d' | '3d' = '2d';

  // Scale factor for 3D shapes (relative to 2D shapes)
  private shape3DScaleFactor = 0.15;

  // Fog settings for "historical obsolescence" effect in 3D mode
  // Nodes closer to center (older) become more transparent
  private fogEnabled = true;
  private fogSphereRadius = 800;      // Radius of the sphere (from ViewModeController)
  private fogCoreRadius = 100;        // Inner radius where fog is maximum
  private fogStrength = 0.5;          // How much fog affects opacity (0.5 = center is 50% visible)

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.initializeMeshes2D();
    this.initializeMeshes3D();
  }

  /**
   * Initialize 2D InstancedMesh for each flat shape type
   */
  private initializeMeshes2D(): void {
    const maxInstances = RENDER_CONFIG.performance.maxNodesPerDraw;

    // Create geometries for each 2D shape
    const geometries: Record<NodeShape, THREE.BufferGeometry> = {
      [NodeShape.CIRCLE]: new THREE.CircleGeometry(1, 32),
      [NodeShape.SQUARE]: new THREE.PlaneGeometry(2, 2),
      [NodeShape.DIAMOND]: this.createDiamondGeometry(),
      [NodeShape.TRIANGLE]: this.createTriangleGeometry(),
      [NodeShape.HEXAGON]: this.createHexagonGeometry(),
      [NodeShape.PENTAGON]: this.createPentagonGeometry(),
      [NodeShape.STAR]: this.createStarGeometry(),
      [NodeShape.INVERTED_TRIANGLE]: this.createInvertedTriangleGeometry()
    };

    // Create mesh for each 2D shape type
    for (const shape of Object.values(NodeShape).filter(v => typeof v === 'number') as NodeShape[]) {
      const geometry = geometries[shape];

      // Create shader material
      const material = new THREE.ShaderMaterial({
        vertexShader: nodeVertShader,
        fragmentShader: nodeFragShader,
        uniforms: {
          uOpacity: { value: this.opacity },
          uTime: { value: 0 }
        },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
      });

      // Create instanced mesh
      const mesh = new THREE.InstancedMesh(geometry, material, maxInstances);
      mesh.frustumCulled = false;
      mesh.count = 0;

      // Add instance attributes
      this.addInstanceAttributes2D(mesh, maxInstances);

      mesh.renderOrder = 10;
      this.meshes2D.set(shape, mesh);
      this.materials2D.set(shape, material);
      this.scene.add(mesh);

      this.shapeCounts2D.set(shape, 0);
    }
  }

  /**
   * Add instance attributes to a 2D mesh
   */
  private addInstanceAttributes2D(mesh: THREE.InstancedMesh, maxInstances: number): void {
    const geometry = mesh.geometry;

    const instanceColors = new THREE.InstancedBufferAttribute(
      new Float32Array(maxInstances * 3), 3
    );
    const instanceSizes = new THREE.InstancedBufferAttribute(
      new Float32Array(maxInstances), 1
    );
    const instanceShapes = new THREE.InstancedBufferAttribute(
      new Float32Array(maxInstances), 1
    );
    const instanceVisible = new THREE.InstancedBufferAttribute(
      new Float32Array(maxInstances), 1
    );
    const instanceHighlight = new THREE.InstancedBufferAttribute(
      new Float32Array(maxInstances), 1
    );
    const instanceFog = new THREE.InstancedBufferAttribute(
      new Float32Array(maxInstances).fill(1.0), 1
    );

    geometry.setAttribute('instanceColor', instanceColors);
    geometry.setAttribute('instanceSize', instanceSizes);
    geometry.setAttribute('instanceShape', instanceShapes);
    geometry.setAttribute('instanceVisible', instanceVisible);
    geometry.setAttribute('instanceHighlight', instanceHighlight);
    geometry.setAttribute('instanceFog', instanceFog);
  }

  /**
   * Initialize 3D InstancedMesh for each geometry type
   * Each shape type gets its own mesh with MeshStandardMaterial
   */
  private initializeMeshes3D(): void {
    const maxInstances = RENDER_CONFIG.performance.maxNodesPerDraw;

    // Create geometries for each 3D shape
    const geometries: Record<NodeShape3D, THREE.BufferGeometry> = {
      [NodeShape3D.SPHERE]: new THREE.SphereGeometry(1, 24, 16),
      [NodeShape3D.ICOSAHEDRON]: new THREE.IcosahedronGeometry(1, 0),
      [NodeShape3D.CONE]: new THREE.ConeGeometry(0.7, 1.4, 16),
      [NodeShape3D.BOX]: new THREE.BoxGeometry(1.2, 1.2, 1.2),
      [NodeShape3D.TORUS]: new THREE.TorusGeometry(0.8, 0.3, 12, 24),
      [NodeShape3D.OCTAHEDRON]: new THREE.OctahedronGeometry(1, 0),
      [NodeShape3D.TETRAHEDRON]: new THREE.TetrahedronGeometry(1, 0),
      [NodeShape3D.DODECAHEDRON]: new THREE.DodecahedronGeometry(1, 0)
    };

    // Create mesh for each 3D shape type
    for (const shape of Object.values(NodeShape3D)) {
      const geometry = geometries[shape];

      // Create standard material for proper 3D lighting
      const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        metalness: 0.1,
        roughness: 0.4,
        transparent: true,
        opacity: this.opacity,
        depthWrite: true,
        depthTest: true,
        side: THREE.FrontSide
      });

      // Inject custom shader code to support per-instance fog
      this.injectFogShader(material);

      // Create instanced mesh
      const mesh = new THREE.InstancedMesh(geometry, material, maxInstances);
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.visible = false; // Hidden by default (2D mode)

      // Enable instance colors for per-shape tinting
      mesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(maxInstances * 3), 3
      );

      // Add instance attributes
      this.addInstanceAttributes3D(mesh, maxInstances);

      mesh.renderOrder = 10;
      this.meshes3D.set(shape, mesh);
      this.materials3D.set(shape, material);
      this.scene.add(mesh);

      this.shapeCounts3D.set(shape, 0);
    }
  }

  /**
   * Inject fog shader modification into MeshStandardMaterial
   */
  private injectFogShader(material: THREE.MeshStandardMaterial): void {
    material.onBeforeCompile = (shader) => {
      // Add instance fog attribute and varying to vertex shader
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
        attribute float instanceFog;
        varying float vInstanceFog;`
      );

      // Pass fog to fragment shader
      shader.vertexShader = shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vInstanceFog = instanceFog;`
      );

      // Declare varying in fragment shader
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
        varying float vInstanceFog;`
      );

      // Apply fog to final output
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        gl_FragColor.a *= vInstanceFog;`
      );
    };
  }

  /**
   * Add instance attributes to a 3D mesh
   */
  private addInstanceAttributes3D(mesh: THREE.InstancedMesh, maxInstances: number): void {
    const geometry = mesh.geometry;

    const instanceSizes = new THREE.InstancedBufferAttribute(
      new Float32Array(maxInstances), 1
    );
    const instanceVisible = new THREE.InstancedBufferAttribute(
      new Float32Array(maxInstances), 1
    );
    const instanceHighlight = new THREE.InstancedBufferAttribute(
      new Float32Array(maxInstances), 1
    );
    const instanceFog = new THREE.InstancedBufferAttribute(
      new Float32Array(maxInstances).fill(1.0), 1
    );

    geometry.setAttribute('instanceSize', instanceSizes);
    geometry.setAttribute('instanceVisible', instanceVisible);
    geometry.setAttribute('instanceHighlight', instanceHighlight);
    geometry.setAttribute('instanceFog', instanceFog);
  }

  /**
   * Create diamond-shaped geometry (rotated square)
   */
  private createDiamondGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      0, 1, 0,   // top
      1, 0, 0,   // right
      0, -1, 0,  // bottom
      -1, 0, 0   // left
    ]);
    const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
    const uvs = new Float32Array([
      0.5, 1,
      1, 0.5,
      0.5, 0,
      0, 0.5
    ]);

    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

    return geometry;
  }

  /**
   * Create triangle geometry
   */
  private createTriangleGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const h = Math.sqrt(3) / 2;
    const vertices = new Float32Array([
      0, h, 0,      // top
      -0.5, -h/2, 0, // bottom left
      0.5, -h/2, 0   // bottom right
    ]);
    const uvs = new Float32Array([
      0.5, 1,
      0, 0,
      1, 0
    ]);

    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

    return geometry;
  }

  /**
   * Create hexagon geometry (6-sided regular polygon)
   */
  private createHexagonGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const verts: number[] = [0, 0, 0]; // center
    const uvs: number[] = [0.5, 0.5];
    const indices: number[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6; // flat-top hexagon
      verts.push(Math.cos(angle), Math.sin(angle), 0);
      uvs.push(0.5 + 0.5 * Math.cos(angle), 0.5 + 0.5 * Math.sin(angle));
      indices.push(0, i + 1, ((i + 1) % 6) + 1);
    }
    geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(indices), 1));
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
    return geometry;
  }

  /**
   * Create a 2D pentagon geometry (flat, 5 vertices + center)
   */
  private createPentagonGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const verts: number[] = [0, 0, 0]; // center
    const uvs: number[] = [0.5, 0.5];
    const indices: number[] = [];
    for (let i = 0; i < 5; i++) {
      const angle = (2 * Math.PI / 5) * i - Math.PI / 2;
      verts.push(Math.cos(angle), Math.sin(angle), 0);
      uvs.push(0.5 + 0.5 * Math.cos(angle), 0.5 + 0.5 * Math.sin(angle));
      indices.push(0, i + 1, ((i + 1) % 5) + 1);
    }
    geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(indices), 1));
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
    return geometry;
  }

  /**
   * Create a 2D star geometry (flat, 10 vertices alternating outer/inner + center)
   */
  private createStarGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const verts: number[] = [0, 0, 0]; // center
    const uvs: number[] = [0.5, 0.5];
    const indices: number[] = [];
    for (let i = 0; i < 10; i++) {
      const angle = (Math.PI / 5) * i - Math.PI / 2;
      const r = i % 2 === 0 ? 1 : 0.45;
      verts.push(Math.cos(angle) * r, Math.sin(angle) * r, 0);
      uvs.push(0.5 + 0.5 * Math.cos(angle) * r, 0.5 + 0.5 * Math.sin(angle) * r);
      indices.push(0, i + 1, ((i + 1) % 10) + 1);
    }
    geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(indices), 1));
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
    return geometry;
  }

  /**
   * Create a 2D inverted triangle geometry (flat, points down)
   */
  private createInvertedTriangleGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const h = Math.sqrt(3) / 2;
    const vertices = new Float32Array([
      -0.5, h / 2, 0,  // top left
      0.5, h / 2, 0,   // top right
      0, -h, 0          // bottom center
    ]);
    const uvs = new Float32Array([
      0, 1,
      1, 1,
      0.5, 0
    ]);

    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

    return geometry;
  }

  /**
   * Set view mode - switches between flat (2D/2.5D) and 3D geometry rendering
   */
  setViewMode(mode: '2d' | '2.5d' | '3d'): void {
    if (this.viewMode === mode) return;
    this.viewMode = mode;

    const is3D = mode === '3d';

    // Toggle visibility: show 3D shapes in 3D mode, flat shapes otherwise
    for (const mesh of this.meshes2D.values()) {
      mesh.visible = !is3D;
    }
    for (const mesh of this.meshes3D.values()) {
      mesh.visible = is3D && mesh.count > 0;
    }

    // If switching to 3D, sync the 3D mesh data
    if (is3D) {
      this.sync3DMeshData();
    }
  }

  /**
   * Sync 3D mesh instance data from GPU data
   * Updates positions, colors, and sizes for all 3D meshes
   */
  private sync3DMeshData(): void {
    if (!this.gpuData) return;

    const nodes = this.allNodesData;
    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const mapping = this.nodeToMeshIndex.get(i);
      if (!mapping) continue;

      const mesh = this.meshes3D.get(mapping.shape3D);
      if (!mesh) continue;

      const instanceIndex = mapping.index3D;
      const isHidden = this.hiddenSourceTypes.has(node.source || '');

      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const z = node.z ?? 0;

      // Position and scale
      const size = (this.gpuData.sizes[i] || this.baseSize) * this.shape3DScaleFactor;
      scale.set(size, size, size);
      matrix.makeScale(scale.x, scale.y, scale.z);
      matrix.setPosition(x, y, z);
      mesh.setMatrixAt(instanceIndex, matrix);

      // Color - set via instanceColor
      if (mesh.instanceColor) {
        color.setRGB(
          this.gpuData.colors[i * 3],
          this.gpuData.colors[i * 3 + 1],
          this.gpuData.colors[i * 3 + 2]
        );
        mesh.instanceColor.setXYZ(instanceIndex, color.r, color.g, color.b);
      }

      // Visibility and other attributes
      const sizeAttr = mesh.geometry.getAttribute('instanceSize') as THREE.InstancedBufferAttribute;
      const visibleAttr = mesh.geometry.getAttribute('instanceVisible') as THREE.InstancedBufferAttribute;
      const highlightAttr = mesh.geometry.getAttribute('instanceHighlight') as THREE.InstancedBufferAttribute;

      sizeAttr.setX(instanceIndex, size);
      visibleAttr.setX(instanceIndex, isHidden ? 0.0 : 1.0);
      highlightAttr.setX(instanceIndex, 0.0);
    }

    // Mark all 3D meshes as needing update
    for (const mesh of this.meshes3D.values()) {
      if (mesh.count > 0) {
        if (mesh.instanceColor) {
          mesh.instanceColor.needsUpdate = true;
        }
        const sizeAttr = mesh.geometry.getAttribute('instanceSize') as THREE.InstancedBufferAttribute;
        const visibleAttr = mesh.geometry.getAttribute('instanceVisible') as THREE.InstancedBufferAttribute;
        const highlightAttr = mesh.geometry.getAttribute('instanceHighlight') as THREE.InstancedBufferAttribute;
        sizeAttr.needsUpdate = true;
        visibleAttr.needsUpdate = true;
        highlightAttr.needsUpdate = true;
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  /**
   * Set nodes from graph data
   * Groups nodes by both 2D and 3D shape types
   */
  setNodes(nodes: GraphNode[]): void {
    this.nodeCount = nodes.length;
    this.nodeToMeshIndex.clear();

    // Reset shape counts
    for (const shape of this.shapeCounts2D.keys()) {
      this.shapeCounts2D.set(shape, 0);
    }
    for (const shape of this.shapeCounts3D.keys()) {
      this.shapeCounts3D.set(shape, 0);
    }

    // Allocate GPU data
    this.gpuData = {
      positions: new Float32Array(nodes.length * 3),
      colors: new Float32Array(nodes.length * 3),
      sizes: new Float32Array(nodes.length),
      types: new Uint8Array(nodes.length),
      ids: new Uint32Array(nodes.length),
      visible: new Uint8Array(nodes.length)
    };

    // Group nodes by 2D and 3D shapes
    const nodesByShape2D: Map<NodeShape, { node: GraphNode; globalIndex: number }[]> = new Map();
    const nodesByShape3D: Map<NodeShape3D, { node: GraphNode; globalIndex: number }[]> = new Map();

    for (const shape of Object.values(NodeShape).filter(v => typeof v === 'number') as NodeShape[]) {
      nodesByShape2D.set(shape, []);
    }
    for (const shape of Object.values(NodeShape3D)) {
      nodesByShape3D.set(shape, []);
    }

    // Categorize nodes
    nodes.forEach((node, i) => {
      const nodeType = SOURCE_TO_NODE_TYPE[node.source] ?? NodeType.MEMORY;
      const shape2D = NODE_TYPE_SHAPES[nodeType];
      const shape3D = NODE_TYPE_TO_SHAPE_3D[nodeType];

      node.nodeType = nodeType;
      node.nodeIndex = i;
      node.shape3D = shape3D;

      nodesByShape2D.get(shape2D)!.push({ node, globalIndex: i });
      nodesByShape3D.get(shape3D)!.push({ node, globalIndex: i });

      // Store ID and type
      this.gpuData!.ids[i] = typeof node.id === 'number' ? node.id : i;
      this.gpuData!.types[i] = nodeType;
      this.gpuData!.visible[i] = 1;
    });

    // Set up 2D meshes
    for (const [shape, shapeNodes] of nodesByShape2D) {
      const mesh = this.meshes2D.get(shape)!;
      const count = shapeNodes.length;
      mesh.count = count;
      this.shapeCounts2D.set(shape, count);

      const geometry = mesh.geometry;
      const colorAttr = geometry.getAttribute('instanceColor') as THREE.InstancedBufferAttribute;
      const sizeAttr = geometry.getAttribute('instanceSize') as THREE.InstancedBufferAttribute;
      const shapeAttr = geometry.getAttribute('instanceShape') as THREE.InstancedBufferAttribute;
      const visibleAttr = geometry.getAttribute('instanceVisible') as THREE.InstancedBufferAttribute;
      const highlightAttr = geometry.getAttribute('instanceHighlight') as THREE.InstancedBufferAttribute;

      const matrix = new THREE.Matrix4();

      shapeNodes.forEach(({ node, globalIndex }, instanceIndex) => {
        // Position
        const x = node.x ?? Math.random() * 2000 - 1000;
        const y = node.y ?? Math.random() * 2000 - 1000;
        const z = node.z ?? 0;

        this.gpuData!.positions[globalIndex * 3] = x;
        this.gpuData!.positions[globalIndex * 3 + 1] = y;
        this.gpuData!.positions[globalIndex * 3 + 2] = z;

        matrix.makeTranslation(x, y, z);
        mesh.setMatrixAt(instanceIndex, matrix);

        // Color using new color system
        const colorHex = getNodeColor(node.source, node.memoryType, node.success, node.qValue);
        const rgb = hexToRGB(colorHex);

        colorAttr.setXYZ(instanceIndex, rgb[0], rgb[1], rgb[2]);
        this.gpuData!.colors[globalIndex * 3] = rgb[0];
        this.gpuData!.colors[globalIndex * 3 + 1] = rgb[1];
        this.gpuData!.colors[globalIndex * 3 + 2] = rgb[2];

        // Size
        const size = this.calculateNodeSize(node);
        sizeAttr.setX(instanceIndex, size);
        this.gpuData!.sizes[globalIndex] = size;

        // Shape, visible, highlight
        shapeAttr.setX(instanceIndex, shape);
        visibleAttr.setX(instanceIndex, 1);
        highlightAttr.setX(instanceIndex, 0);
      });

      mesh.instanceMatrix.needsUpdate = true;
      colorAttr.needsUpdate = true;
      sizeAttr.needsUpdate = true;
      shapeAttr.needsUpdate = true;
      visibleAttr.needsUpdate = true;
      highlightAttr.needsUpdate = true;
    }

    // Set up 3D meshes and create mappings
    for (const [shape3D, shapeNodes] of nodesByShape3D) {
      const mesh = this.meshes3D.get(shape3D)!;
      const count = shapeNodes.length;
      mesh.count = count;
      this.shapeCounts3D.set(shape3D, count);

      shapeNodes.forEach(({ node, globalIndex }, index3D) => {
        // Get the 2D shape and index for this node
        const nodeType = node.nodeType!;
        const shape2D = NODE_TYPE_SHAPES[nodeType];
        const nodes2D = nodesByShape2D.get(shape2D)!;
        const index2D = nodes2D.findIndex(n => n.globalIndex === globalIndex);

        // Store mapping
        this.nodeToMeshIndex.set(globalIndex, {
          shape: shape2D,
          shape3D,
          index2D,
          index3D
        });
      });

      // Initialize 3D mesh attributes
      if (mesh.instanceColor) {
        for (let i = 0; i < count; i++) {
          const globalIndex = shapeNodes[i].globalIndex;
          mesh.instanceColor.setXYZ(i,
            this.gpuData!.colors[globalIndex * 3],
            this.gpuData!.colors[globalIndex * 3 + 1],
            this.gpuData!.colors[globalIndex * 3 + 2]
          );
        }
        mesh.instanceColor.needsUpdate = true;
      }
    }

    // Store nodes for type-based filtering
    this.allNodesData = nodes;

    // If in 3D mode, sync the 3D meshes
    if (this.viewMode === '3d') {
      this.sync3DMeshData();
    }

    console.log(`NodeRenderer: Set ${nodes.length} nodes across ${this.shapeCounts2D.size} 2D shapes and ${this.shapeCounts3D.size} 3D shapes`);
  }

  /**
   * Calculate node size based on properties
   */
  private calculateNodeSize(node: GraphNode): number {
    const connectivity = node.connectionCount ?? 0;
    const sizeMultiplier = 1 + Math.log1p(connectivity) * 0.3;
    return this.baseSize * sizeMultiplier;
  }

  /**
   * Update node positions (called during simulation)
   * Updates both 2D and 3D meshes
   */
  updatePositions(nodes: GraphNode[]): void {
    if (!this.gpuData || nodes.length !== this.nodeCount) return;

    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3();

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const mapping = this.nodeToMeshIndex.get(i);
      if (!mapping) continue;

      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const z = node.z ?? 0;

      // Update GPU data
      this.gpuData.positions[i * 3] = x;
      this.gpuData.positions[i * 3 + 1] = y;
      this.gpuData.positions[i * 3 + 2] = z;

      // Update 2D instance matrix
      const mesh2D = this.meshes2D.get(mapping.shape)!;
      matrix.makeTranslation(x, y, z);
      mesh2D.setMatrixAt(mapping.index2D, matrix);

      // Update 3D instance matrix if in 3D mode
      if (this.viewMode === '3d') {
        const mesh3D = this.meshes3D.get(mapping.shape3D);
        if (mesh3D) {
          const size = (this.gpuData.sizes[i] || this.baseSize) * this.shape3DScaleFactor;
          scale.set(size, size, size);
          matrix.makeScale(scale.x, scale.y, scale.z);
          matrix.setPosition(x, y, z);
          mesh3D.setMatrixAt(mapping.index3D, matrix);
        }
      }
    }

    // Mark all 2D meshes as needing update
    for (const mesh of this.meshes2D.values()) {
      mesh.instanceMatrix.needsUpdate = true;
    }

    // Mark all 3D meshes as needing update if in 3D mode
    if (this.viewMode === '3d') {
      for (const mesh of this.meshes3D.values()) {
        if (mesh.count > 0) {
          mesh.instanceMatrix.needsUpdate = true;
        }
      }

      // Update fog for 3D mode
      this.updateFog(nodes);
    }
  }

  /**
   * Update fog values based on radial distance from sphere center.
   * Creates "historical obsolescence" effect: older memories (center) are foggier.
   */
  updateFog(nodes: GraphNode[]): void {
    if (!this.fogEnabled || this.viewMode !== '3d') {
      this.resetFog();
      return;
    }

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const mapping = this.nodeToMeshIndex.get(i);
      if (!mapping) continue;

      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const z = node.z ?? 0;

      // Calculate radial distance from sphere center (origin)
      const distance = Math.sqrt(x * x + y * y + z * z);

      // Calculate fog factor
      let fogFactor: number;
      if (distance <= this.fogCoreRadius) {
        fogFactor = 1.0 - this.fogStrength;
      } else if (distance >= this.fogSphereRadius) {
        fogFactor = 1.0;
      } else {
        const t = (distance - this.fogCoreRadius) / (this.fogSphereRadius - this.fogCoreRadius);
        const smooth = t * t * (3 - 2 * t);
        fogFactor = (1.0 - this.fogStrength) + smooth * this.fogStrength;
      }

      // Update 2D mesh fog attribute
      const mesh2D = this.meshes2D.get(mapping.shape)!;
      const fogAttr2D = mesh2D.geometry.getAttribute('instanceFog') as THREE.InstancedBufferAttribute;
      fogAttr2D.setX(mapping.index2D, fogFactor);

      // Update 3D mesh fog attribute
      const mesh3D = this.meshes3D.get(mapping.shape3D);
      if (mesh3D) {
        const fogAttr3D = mesh3D.geometry.getAttribute('instanceFog') as THREE.InstancedBufferAttribute;
        fogAttr3D.setX(mapping.index3D, fogFactor);
      }
    }

    // Mark fog attributes as needing update
    for (const mesh of this.meshes2D.values()) {
      const fogAttr = mesh.geometry.getAttribute('instanceFog') as THREE.InstancedBufferAttribute;
      fogAttr.needsUpdate = true;
    }
    for (const mesh of this.meshes3D.values()) {
      if (mesh.count > 0) {
        const fogAttr = mesh.geometry.getAttribute('instanceFog') as THREE.InstancedBufferAttribute;
        fogAttr.needsUpdate = true;
      }
    }
  }

  /**
   * Reset fog to fully visible
   */
  private resetFog(): void {
    for (const mesh of this.meshes2D.values()) {
      const fogAttr = mesh.geometry.getAttribute('instanceFog') as THREE.InstancedBufferAttribute;
      for (let i = 0; i < mesh.count; i++) {
        fogAttr.setX(i, 1.0);
      }
      fogAttr.needsUpdate = true;
    }

    for (const mesh of this.meshes3D.values()) {
      if (mesh.count > 0) {
        const fogAttr = mesh.geometry.getAttribute('instanceFog') as THREE.InstancedBufferAttribute;
        for (let i = 0; i < mesh.count; i++) {
          fogAttr.setX(i, 1.0);
        }
        fogAttr.needsUpdate = true;
      }
    }
  }

  /**
   * Configure fog settings for 3D mode
   */
  setFogSettings(settings: { enabled?: boolean; sphereRadius?: number; coreRadius?: number; strength?: number }): void {
    if (settings.enabled !== undefined) this.fogEnabled = settings.enabled;
    if (settings.sphereRadius !== undefined) this.fogSphereRadius = settings.sphereRadius;
    if (settings.coreRadius !== undefined) this.fogCoreRadius = settings.coreRadius;
    if (settings.strength !== undefined) this.fogStrength = Math.max(0, Math.min(1, settings.strength));
  }

  /**
   * Update node colors
   */
  updateColors(colorFn: (node: GraphNode, index: number) => [number, number, number], nodes: GraphNode[]): void {
    for (let i = 0; i < nodes.length; i++) {
      const mapping = this.nodeToMeshIndex.get(i);
      if (!mapping) continue;

      const rgb = colorFn(nodes[i], i);

      // Update GPU data
      this.gpuData!.colors[i * 3] = rgb[0];
      this.gpuData!.colors[i * 3 + 1] = rgb[1];
      this.gpuData!.colors[i * 3 + 2] = rgb[2];

      // Update 2D instance attribute
      const mesh2D = this.meshes2D.get(mapping.shape)!;
      const colorAttr2D = mesh2D.geometry.getAttribute('instanceColor') as THREE.InstancedBufferAttribute;
      colorAttr2D.setXYZ(mapping.index2D, rgb[0], rgb[1], rgb[2]);

      // Update 3D instance color
      if (this.viewMode === '3d') {
        const mesh3D = this.meshes3D.get(mapping.shape3D);
        if (mesh3D && mesh3D.instanceColor) {
          mesh3D.instanceColor.setXYZ(mapping.index3D, rgb[0], rgb[1], rgb[2]);
        }
      }
    }

    for (const mesh of this.meshes2D.values()) {
      const colorAttr = mesh.geometry.getAttribute('instanceColor') as THREE.InstancedBufferAttribute;
      colorAttr.needsUpdate = true;
    }

    if (this.viewMode === '3d') {
      for (const mesh of this.meshes3D.values()) {
        if (mesh.count > 0 && mesh.instanceColor) {
          mesh.instanceColor.needsUpdate = true;
        }
      }
    }
  }

  /**
   * Update node sizes
   */
  updateSizes(sizeFn: (node: GraphNode, index: number) => number, nodes: GraphNode[]): void {
    for (let i = 0; i < nodes.length; i++) {
      const mapping = this.nodeToMeshIndex.get(i);
      if (!mapping) continue;

      const size = sizeFn(nodes[i], i);
      this.gpuData!.sizes[i] = size;

      // Update 2D mesh
      const mesh2D = this.meshes2D.get(mapping.shape)!;
      const sizeAttr2D = mesh2D.geometry.getAttribute('instanceSize') as THREE.InstancedBufferAttribute;
      sizeAttr2D.setX(mapping.index2D, size);

      // Update 3D mesh
      if (this.viewMode === '3d') {
        const mesh3D = this.meshes3D.get(mapping.shape3D);
        if (mesh3D) {
          const sizeAttr3D = mesh3D.geometry.getAttribute('instanceSize') as THREE.InstancedBufferAttribute;
          sizeAttr3D.setX(mapping.index3D, size * this.shape3DScaleFactor);
        }
      }
    }

    for (const mesh of this.meshes2D.values()) {
      const sizeAttr = mesh.geometry.getAttribute('instanceSize') as THREE.InstancedBufferAttribute;
      sizeAttr.needsUpdate = true;
    }

    if (this.viewMode === '3d') {
      this.sync3DMeshSizes();
    }
  }

  /**
   * Sync sizes to 3D meshes (updates instance matrices for shape scale)
   */
  private sync3DMeshSizes(): void {
    if (!this.gpuData) return;

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();

    for (let i = 0; i < this.allNodesData.length; i++) {
      const mapping = this.nodeToMeshIndex.get(i);
      if (!mapping) continue;

      const mesh = this.meshes3D.get(mapping.shape3D);
      if (!mesh) continue;

      const size = (this.gpuData.sizes[i] || this.baseSize) * this.shape3DScaleFactor;

      mesh.getMatrixAt(mapping.index3D, matrix);
      matrix.decompose(position, quaternion, scale);

      scale.set(size, size, size);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(mapping.index3D, matrix);
    }

    for (const mesh of this.meshes3D.values()) {
      if (mesh.count > 0) {
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  /**
   * Set visibility for specific nodes
   */
  setVisibility(visibleIndices: Set<number>): void {
    for (let i = 0; i < this.nodeCount; i++) {
      const mapping = this.nodeToMeshIndex.get(i);
      if (!mapping) continue;

      const visible = visibleIndices.has(i) ? 1 : 0;
      this.gpuData!.visible[i] = visible;

      // Update 2D mesh
      const mesh2D = this.meshes2D.get(mapping.shape)!;
      const visibleAttr2D = mesh2D.geometry.getAttribute('instanceVisible') as THREE.InstancedBufferAttribute;
      visibleAttr2D.setX(mapping.index2D, visible);

      // Update 3D mesh
      const mesh3D = this.meshes3D.get(mapping.shape3D);
      if (mesh3D) {
        const visibleAttr3D = mesh3D.geometry.getAttribute('instanceVisible') as THREE.InstancedBufferAttribute;
        visibleAttr3D.setX(mapping.index3D, visible);
      }
    }

    for (const mesh of this.meshes2D.values()) {
      const visibleAttr = mesh.geometry.getAttribute('instanceVisible') as THREE.InstancedBufferAttribute;
      visibleAttr.needsUpdate = true;
    }

    for (const mesh of this.meshes3D.values()) {
      if (mesh.count > 0) {
        const visibleAttr = mesh.geometry.getAttribute('instanceVisible') as THREE.InstancedBufferAttribute;
        visibleAttr.needsUpdate = true;
      }
    }
  }

  /**
   * Show all nodes
   */
  showAll(): void {
    for (let i = 0; i < this.nodeCount; i++) {
      this.gpuData!.visible[i] = 1;

      const mapping = this.nodeToMeshIndex.get(i);
      if (!mapping) continue;

      const mesh2D = this.meshes2D.get(mapping.shape)!;
      const visibleAttr2D = mesh2D.geometry.getAttribute('instanceVisible') as THREE.InstancedBufferAttribute;
      visibleAttr2D.setX(mapping.index2D, 1);

      const mesh3D = this.meshes3D.get(mapping.shape3D);
      if (mesh3D) {
        const visibleAttr3D = mesh3D.geometry.getAttribute('instanceVisible') as THREE.InstancedBufferAttribute;
        visibleAttr3D.setX(mapping.index3D, 1);
      }
    }

    for (const mesh of this.meshes2D.values()) {
      const visibleAttr = mesh.geometry.getAttribute('instanceVisible') as THREE.InstancedBufferAttribute;
      visibleAttr.needsUpdate = true;
    }

    for (const mesh of this.meshes3D.values()) {
      if (mesh.count > 0) {
        const visibleAttr = mesh.geometry.getAttribute('instanceVisible') as THREE.InstancedBufferAttribute;
        visibleAttr.needsUpdate = true;
      }
    }
  }

  /**
   * Set node types to hide (visual only - doesn't affect physics)
   */
  setHiddenSourceTypes(hiddenTypes: Set<string>): void {
    this.hiddenSourceTypes = hiddenTypes;

    if (!this.gpuData || this.allNodesData.length === 0) return;

    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3();

    for (let i = 0; i < this.allNodesData.length; i++) {
      const node = this.allNodesData[i];
      const sourceType = node.source || 'memory';
      const isHidden = hiddenTypes.has(sourceType);

      this.gpuData.visible[i] = isHidden ? 0 : 1;

      const mapping = this.nodeToMeshIndex.get(i);
      if (!mapping) continue;

      // Update 2D mesh
      const mesh2D = this.meshes2D.get(mapping.shape)!;
      const visibleAttr2D = mesh2D.geometry.getAttribute('instanceVisible') as THREE.InstancedBufferAttribute;
      visibleAttr2D.setX(mapping.index2D, isHidden ? 0 : 1);

      // Update 3D mesh (use scale 0 to hide since MeshStandardMaterial doesn't support instanceVisible)
      if (this.viewMode === '3d') {
        const mesh3D = this.meshes3D.get(mapping.shape3D);
        if (mesh3D) {
          mesh3D.getMatrixAt(mapping.index3D, matrix);

          if (isHidden) {
            matrix.scale(new THREE.Vector3(0, 0, 0));
          } else {
            const size = (this.gpuData.sizes[i] || this.baseSize) * this.shape3DScaleFactor;
            const pos = new THREE.Vector3();
            pos.setFromMatrixPosition(matrix);
            scale.set(size, size, size);
            matrix.makeScale(scale.x, scale.y, scale.z);
            matrix.setPosition(pos);
          }

          mesh3D.setMatrixAt(mapping.index3D, matrix);
        }
      }
    }

    for (const mesh of this.meshes2D.values()) {
      const visibleAttr = mesh.geometry.getAttribute('instanceVisible') as THREE.InstancedBufferAttribute;
      visibleAttr.needsUpdate = true;
    }

    if (this.viewMode === '3d') {
      for (const mesh of this.meshes3D.values()) {
        if (mesh.count > 0) {
          mesh.instanceMatrix.needsUpdate = true;
        }
      }
    }
  }

  /**
   * Get currently hidden node types
   */
  getHiddenSourceTypes(): Set<string> {
    return this.hiddenSourceTypes;
  }

  /**
   * Highlight specific nodes
   */
  setHighlight(highlightIndices: Set<number>): void {
    for (let i = 0; i < this.nodeCount; i++) {
      const mapping = this.nodeToMeshIndex.get(i);
      if (!mapping) continue;

      const highlight = highlightIndices.has(i) ? 1 : 0;

      const mesh2D = this.meshes2D.get(mapping.shape)!;
      const highlightAttr2D = mesh2D.geometry.getAttribute('instanceHighlight') as THREE.InstancedBufferAttribute;
      highlightAttr2D.setX(mapping.index2D, highlight);

      const mesh3D = this.meshes3D.get(mapping.shape3D);
      if (mesh3D) {
        const highlightAttr3D = mesh3D.geometry.getAttribute('instanceHighlight') as THREE.InstancedBufferAttribute;
        highlightAttr3D.setX(mapping.index3D, highlight);
      }
    }

    for (const mesh of this.meshes2D.values()) {
      const highlightAttr = mesh.geometry.getAttribute('instanceHighlight') as THREE.InstancedBufferAttribute;
      highlightAttr.needsUpdate = true;
    }

    for (const mesh of this.meshes3D.values()) {
      if (mesh.count > 0) {
        const highlightAttr = mesh.geometry.getAttribute('instanceHighlight') as THREE.InstancedBufferAttribute;
        highlightAttr.needsUpdate = true;
      }
    }
  }

  /**
   * Clear all highlights
   */
  clearHighlights(): void {
    for (const mesh of this.meshes2D.values()) {
      const highlightAttr = mesh.geometry.getAttribute('instanceHighlight') as THREE.InstancedBufferAttribute;
      for (let i = 0; i < mesh.count; i++) {
        highlightAttr.setX(i, 0);
      }
      highlightAttr.needsUpdate = true;
    }

    for (const mesh of this.meshes3D.values()) {
      if (mesh.count > 0) {
        const highlightAttr = mesh.geometry.getAttribute('instanceHighlight') as THREE.InstancedBufferAttribute;
        for (let i = 0; i < mesh.count; i++) {
          highlightAttr.setX(i, 0);
        }
        highlightAttr.needsUpdate = true;
      }
    }
  }

  /**
   * Set base node size
   */
  setBaseSize(size: number): void {
    this.baseSize = size;
  }

  /**
   * Set node opacity
   */
  setOpacity(opacity: number): void {
    this.opacity = opacity;

    // Update 2D shader materials
    for (const material of this.materials2D.values()) {
      material.uniforms.uOpacity.value = opacity;
    }

    // Update 3D materials
    for (const material of this.materials3D.values()) {
      material.opacity = opacity;
      material.needsUpdate = true;
    }
  }

  /**
   * Update time uniform for animations
   */
  update(): void {
    const time = (Date.now() - this.startTime) / 1000;
    for (const material of this.materials2D.values()) {
      material.uniforms.uTime.value = time;
    }
  }

  /**
   * Get node index at screen position (for picking)
   */
  getNodeIndexFromPosition(x: number, y: number, z: number, tolerance = 10): number | null {
    if (!this.gpuData) return null;

    let closestIndex: number | null = null;
    let closestDist = tolerance * tolerance;

    for (let i = 0; i < this.nodeCount; i++) {
      if (this.gpuData.visible[i] === 0) continue;

      const nx = this.gpuData.positions[i * 3];
      const ny = this.gpuData.positions[i * 3 + 1];
      const nz = this.gpuData.positions[i * 3 + 2];

      const dx = nx - x;
      const dy = ny - y;
      const dz = nz - z;
      const distSq = dx * dx + dy * dy + dz * dz;

      if (distSq < closestDist) {
        closestDist = distSq;
        closestIndex = i;
      }
    }

    return closestIndex;
  }

  /**
   * Get GPU data for external use
   */
  getGPUData(): GPUNodeData | null {
    return this.gpuData;
  }

  /**
   * Get node count
   */
  getNodeCount(): number {
    return this.nodeCount;
  }

  /**
   * Update Z positions for all nodes (used for 3D temporal view)
   */
  updateZPositions(zPositions: Float32Array): void {
    if (!this.gpuData || zPositions.length !== this.nodeCount) return;

    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3();

    for (let i = 0; i < this.nodeCount; i++) {
      const mapping = this.nodeToMeshIndex.get(i);
      if (!mapping) continue;

      const x = this.gpuData.positions[i * 3];
      const y = this.gpuData.positions[i * 3 + 1];
      const z = zPositions[i];

      // Update stored Z
      this.gpuData.positions[i * 3 + 2] = z;

      // Update 2D instance matrix
      const mesh2D = this.meshes2D.get(mapping.shape)!;
      matrix.makeTranslation(x, y, z);
      mesh2D.setMatrixAt(mapping.index2D, matrix);

      // Update 3D instance matrix if in 3D mode
      if (this.viewMode === '3d') {
        const mesh3D = this.meshes3D.get(mapping.shape3D);
        if (mesh3D) {
          const size = (this.gpuData.sizes[i] || this.baseSize) * this.shape3DScaleFactor;
          scale.set(size, size, size);
          matrix.makeScale(scale.x, scale.y, scale.z);
          matrix.setPosition(x, y, z);
          mesh3D.setMatrixAt(mapping.index3D, matrix);
        }
      }
    }

    // Mark all meshes as needing update
    for (const mesh of this.meshes2D.values()) {
      mesh.instanceMatrix.needsUpdate = true;
    }

    if (this.viewMode === '3d') {
      for (const mesh of this.meshes3D.values()) {
        if (mesh.count > 0) {
          mesh.instanceMatrix.needsUpdate = true;
        }
      }
    }
  }

  /**
   * Enable depth-based effects (opacity/size falloff for 3D mode)
   */
  setDepthEffects(enabled: boolean, config?: { maxDepth?: number; opacityFalloff?: number; sizeFalloff?: number }): void {
    if (config) {
      if (config.maxDepth !== undefined) this.maxDepth = config.maxDepth;
      if (config.opacityFalloff !== undefined) this.opacityFalloff = config.opacityFalloff;
      if (config.sizeFalloff !== undefined) this.sizeFalloff = config.sizeFalloff;
    }

    // Update shader uniforms for depth effects
    for (const material of this.materials2D.values()) {
      if (!material.uniforms.uDepthEnabled) {
        material.uniforms.uDepthEnabled = { value: enabled ? 1 : 0 };
        material.uniforms.uMaxDepth = { value: this.maxDepth };
        material.uniforms.uOpacityFalloff = { value: this.opacityFalloff };
        material.uniforms.uSizeFalloff = { value: this.sizeFalloff };
      } else {
        material.uniforms.uDepthEnabled.value = enabled ? 1 : 0;
        material.uniforms.uMaxDepth.value = this.maxDepth;
        material.uniforms.uOpacityFalloff.value = this.opacityFalloff;
        material.uniforms.uSizeFalloff.value = this.sizeFalloff;
      }
    }
  }

  /**
   * Apply depth-based opacity to nodes (for 3D mode without shader modification)
   */
  applyDepthOpacity(zPositions: Float32Array, baseColors?: Float32Array): void {
    if (!this.gpuData) return;

    for (let i = 0; i < this.nodeCount; i++) {
      const mapping = this.nodeToMeshIndex.get(i);
      if (!mapping) continue;

      const z = zPositions[i];
      const depthRatio = Math.abs(z) / this.maxDepth;
      const opacityMult = 1 - (depthRatio * this.opacityFalloff);

      // Get base color
      let r: number, g: number, b: number;
      if (baseColors) {
        r = baseColors[i * 3];
        g = baseColors[i * 3 + 1];
        b = baseColors[i * 3 + 2];
      } else {
        r = this.gpuData.colors[i * 3];
        g = this.gpuData.colors[i * 3 + 1];
        b = this.gpuData.colors[i * 3 + 2];
      }

      // Apply opacity as brightness reduction
      const mesh2D = this.meshes2D.get(mapping.shape)!;
      const colorAttr2D = mesh2D.geometry.getAttribute('instanceColor') as THREE.InstancedBufferAttribute;
      colorAttr2D.setXYZ(mapping.index2D, r * opacityMult, g * opacityMult, b * opacityMult);

      // Also update 3D mesh if in 3D mode
      if (this.viewMode === '3d') {
        const mesh3D = this.meshes3D.get(mapping.shape3D);
        if (mesh3D && mesh3D.instanceColor) {
          mesh3D.instanceColor.setXYZ(mapping.index3D, r * opacityMult, g * opacityMult, b * opacityMult);
        }
      }
    }

    for (const mesh of this.meshes2D.values()) {
      const colorAttr = mesh.geometry.getAttribute('instanceColor') as THREE.InstancedBufferAttribute;
      colorAttr.needsUpdate = true;
    }

    if (this.viewMode === '3d') {
      for (const mesh of this.meshes3D.values()) {
        if (mesh.count > 0 && mesh.instanceColor) {
          mesh.instanceColor.needsUpdate = true;
        }
      }
    }
  }

  /**
   * Apply depth-based size scaling (for 3D mode)
   */
  applyDepthSize(zPositions: Float32Array): void {
    if (!this.gpuData) return;

    for (let i = 0; i < this.nodeCount; i++) {
      const mapping = this.nodeToMeshIndex.get(i);
      if (!mapping) continue;

      const z = zPositions[i];
      const depthRatio = Math.abs(z) / this.maxDepth;
      const sizeMult = 1 - (depthRatio * this.sizeFalloff);

      const baseSize = this.gpuData.sizes[i];
      const adjustedSize = baseSize * sizeMult;

      const mesh2D = this.meshes2D.get(mapping.shape)!;
      const sizeAttr2D = mesh2D.geometry.getAttribute('instanceSize') as THREE.InstancedBufferAttribute;
      sizeAttr2D.setX(mapping.index2D, adjustedSize);

      if (this.viewMode === '3d') {
        const mesh3D = this.meshes3D.get(mapping.shape3D);
        if (mesh3D) {
          const sizeAttr3D = mesh3D.geometry.getAttribute('instanceSize') as THREE.InstancedBufferAttribute;
          sizeAttr3D.setX(mapping.index3D, adjustedSize * this.shape3DScaleFactor);
        }
      }
    }

    for (const mesh of this.meshes2D.values()) {
      const sizeAttr = mesh.geometry.getAttribute('instanceSize') as THREE.InstancedBufferAttribute;
      sizeAttr.needsUpdate = true;
    }

    if (this.viewMode === '3d') {
      for (const mesh of this.meshes3D.values()) {
        if (mesh.count > 0) {
          const sizeAttr = mesh.geometry.getAttribute('instanceSize') as THREE.InstancedBufferAttribute;
          sizeAttr.needsUpdate = true;
        }
      }
    }
  }

  /**
   * Reset depth effects (return to uniform opacity/size for 2D mode)
   */
  resetDepthEffects(): void {
    if (!this.gpuData) return;

    // Restore original colors
    for (let i = 0; i < this.nodeCount; i++) {
      const mapping = this.nodeToMeshIndex.get(i);
      if (!mapping) continue;

      const r = this.gpuData.colors[i * 3];
      const g = this.gpuData.colors[i * 3 + 1];
      const b = this.gpuData.colors[i * 3 + 2];

      const mesh2D = this.meshes2D.get(mapping.shape)!;
      const colorAttr2D = mesh2D.geometry.getAttribute('instanceColor') as THREE.InstancedBufferAttribute;
      colorAttr2D.setXYZ(mapping.index2D, r, g, b);

      if (this.viewMode === '3d') {
        const mesh3D = this.meshes3D.get(mapping.shape3D);
        if (mesh3D && mesh3D.instanceColor) {
          mesh3D.instanceColor.setXYZ(mapping.index3D, r, g, b);
        }
      }
    }

    // Restore original sizes
    for (let i = 0; i < this.nodeCount; i++) {
      const mapping = this.nodeToMeshIndex.get(i);
      if (!mapping) continue;

      const size = this.gpuData.sizes[i];

      const mesh2D = this.meshes2D.get(mapping.shape)!;
      const sizeAttr2D = mesh2D.geometry.getAttribute('instanceSize') as THREE.InstancedBufferAttribute;
      sizeAttr2D.setX(mapping.index2D, size);

      if (this.viewMode === '3d') {
        const mesh3D = this.meshes3D.get(mapping.shape3D);
        if (mesh3D) {
          const sizeAttr3D = mesh3D.geometry.getAttribute('instanceSize') as THREE.InstancedBufferAttribute;
          sizeAttr3D.setX(mapping.index3D, size * this.shape3DScaleFactor);
        }
      }
    }

    for (const mesh of this.meshes2D.values()) {
      const colorAttr = mesh.geometry.getAttribute('instanceColor') as THREE.InstancedBufferAttribute;
      const sizeAttr = mesh.geometry.getAttribute('instanceSize') as THREE.InstancedBufferAttribute;
      colorAttr.needsUpdate = true;
      sizeAttr.needsUpdate = true;
    }

    if (this.viewMode === '3d') {
      for (const mesh of this.meshes3D.values()) {
        if (mesh.count > 0) {
          if (mesh.instanceColor) {
            mesh.instanceColor.needsUpdate = true;
          }
          const sizeAttr = mesh.geometry.getAttribute('instanceSize') as THREE.InstancedBufferAttribute;
          sizeAttr.needsUpdate = true;
        }
      }
    }

    // Reset Z positions to 0
    const zeroZ = new Float32Array(this.nodeCount);
    this.updateZPositions(zeroZ);
  }

  /**
   * Get all 2D meshes (for external access if needed)
   */
  getMeshes2D(): Map<NodeShape, THREE.InstancedMesh> {
    return this.meshes2D;
  }

  /**
   * Get all 3D meshes (for external access if needed)
   */
  getMeshes3D(): Map<NodeShape3D, THREE.InstancedMesh> {
    return this.meshes3D;
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    // Dispose 2D meshes
    for (const mesh of this.meshes2D.values()) {
      mesh.geometry.dispose();
      this.scene.remove(mesh);
    }
    for (const material of this.materials2D.values()) {
      material.dispose();
    }

    // Dispose 3D meshes
    for (const mesh of this.meshes3D.values()) {
      mesh.geometry.dispose();
      this.scene.remove(mesh);
    }
    for (const material of this.materials3D.values()) {
      material.dispose();
    }

    this.meshes2D.clear();
    this.meshes3D.clear();
    this.materials2D.clear();
    this.materials3D.clear();
    this.nodeToMeshIndex.clear();
    this.gpuData = null;
  }
}
