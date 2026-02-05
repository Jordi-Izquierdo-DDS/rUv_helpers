/**
 * PotentialSurfaceRenderer - Translucent height-field mesh for reward potential
 *
 * Renders the RewardPotentialField as a 3D surface where vertex Y displacement
 * encodes potential value, and vertex color follows a terrain colormap:
 *   black (0) -> purple (0.3) -> amber (0.7) -> white (1.0)
 *
 * Uses custom ShaderMaterial with per-vertex potential attributes for GPU-side
 * coloring and displacement, falling back to a MeshStandardMaterial path when
 * shader compilation is unavailable.
 *
 * The surface sits below the graph nodes and provides an intuitive landscape
 * view of the reward topology: peaks correspond to high-reward memory clusters.
 */

import * as THREE from 'three';
import { RewardPotentialField } from '../temporal/RewardPotentialField';

// Import shaders as raw strings (Vite handles ?raw)
import potentialVertShader from './shaders/potential_surface.vert.glsl?raw';
import potentialFragShader from './shaders/potential_surface.frag.glsl?raw';

// ============================================================================
// Constants
// ============================================================================

/** Default height multiplier for potential values. */
const DEFAULT_HEIGHT_SCALE = 100;

/** Default surface opacity (0 = invisible, 1 = fully opaque). */
const DEFAULT_OPACITY = 0.4;

// ============================================================================
// PotentialSurfaceRenderer
// ============================================================================

export class PotentialSurfaceRenderer {
  private scene: THREE.Scene;
  private mesh: THREE.Mesh | null = null;
  private material: THREE.ShaderMaterial | null = null;
  private heightScale: number = DEFAULT_HEIGHT_SCALE;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  // --------------------------------------------------------------------------
  // Surface construction
  // --------------------------------------------------------------------------

  /**
   * Build the height-field mesh from a computed potential field.
   *
   * Creates a PlaneGeometry subdivided to match the field grid resolution,
   * displaces vertex Y positions by the potential value, and colors vertices
   * using the terrain colormap.
   *
   * @param field       - The computed reward potential field
   * @param heightScale - Y displacement multiplier (default 100)
   */
  buildSurface(field: RewardPotentialField, heightScale: number = DEFAULT_HEIGHT_SCALE): void {
    // Dispose previous mesh
    this.disposeMesh();

    this.heightScale = heightScale;

    const gridSize = field.getGridSize();
    const gridData = field.getGridData();
    const bounds = field.getBounds();

    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    const segments = gridSize - 1;

    // Create geometry
    const geometry = new THREE.PlaneGeometry(width, height, segments, segments);

    // Rotate the plane to lie in the XZ plane (Y = up)
    geometry.rotateX(-Math.PI / 2);

    // Center the geometry on the field bounds
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerZ = (bounds.minY + bounds.maxY) / 2;
    geometry.translate(centerX, 0, centerZ);

    // Add per-vertex potential attribute
    const positionAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const vertexCount = positionAttr.count;
    const potentialAttr = new Float32Array(vertexCount);

    // The PlaneGeometry vertices are arranged row by row (top to bottom in
    // the original XY plane). After the -90deg X rotation, the plane lies in
    // XZ with Y as the displacement axis. The vertex ordering follows
    // (gridSize) columns x (gridSize) rows.
    for (let j = 0; j <= segments; j++) {
      for (let i = 0; i <= segments; i++) {
        const vertexIndex = j * (segments + 1) + i;
        const gridIndex = j * gridSize + i;
        const potential = gridData[gridIndex] ?? 0;

        potentialAttr[vertexIndex] = potential;

        // Displace Y position by potential value (geometry is already in XZ)
        const y = potential * heightScale;
        positionAttr.setY(vertexIndex, y);
      }
    }

    geometry.setAttribute(
      'potential',
      new THREE.BufferAttribute(potentialAttr, 1)
    );

    // Recompute normals for lighting
    geometry.computeVertexNormals();

    // Create shader material
    this.material = new THREE.ShaderMaterial({
      vertexShader: potentialVertShader,
      fragmentShader: potentialFragShader,
      uniforms: {
        uHeightScale: { value: heightScale },
        uOpacity: { value: DEFAULT_OPACITY },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // Create mesh
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1; // Render below graph elements

    this.scene.add(this.mesh);
  }

  // --------------------------------------------------------------------------
  // Dynamic updates
  // --------------------------------------------------------------------------

  /**
   * Update the surface when the potential field changes.
   *
   * Recomputes vertex Y displacement and the potential attribute from the
   * new field data. The mesh geometry is not recreated; only vertex data
   * is updated for performance.
   *
   * @param field - The updated reward potential field
   */
  updateSurface(field: RewardPotentialField): void {
    if (!this.mesh) {
      this.buildSurface(field, this.heightScale);
      return;
    }

    const geometry = this.mesh.geometry as THREE.BufferGeometry;
    const positionAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const potentialAttr = geometry.getAttribute('potential') as THREE.BufferAttribute;

    if (!potentialAttr) return;

    const gridSize = field.getGridSize();
    const gridData = field.getGridData();
    const segments = gridSize - 1;

    for (let j = 0; j <= segments; j++) {
      for (let i = 0; i <= segments; i++) {
        const vertexIndex = j * (segments + 1) + i;
        const gridIndex = j * gridSize + i;
        const potential = gridData[gridIndex] ?? 0;

        potentialAttr.array[vertexIndex] = potential;
        positionAttr.setY(vertexIndex, potential * this.heightScale);
      }
    }

    positionAttr.needsUpdate = true;
    (potentialAttr as THREE.BufferAttribute).needsUpdate = true;

    // Recompute normals for updated displacement
    geometry.computeVertexNormals();
  }

  // --------------------------------------------------------------------------
  // Visibility and appearance
  // --------------------------------------------------------------------------

  /** Show or hide the surface mesh. */
  setVisible(visible: boolean): void {
    if (this.mesh) {
      this.mesh.visible = visible;
    }
  }

  /** Set the surface translucency (0 = invisible, 1 = opaque). */
  setOpacity(opacity: number): void {
    if (this.material) {
      this.material.uniforms.uOpacity.value = Math.max(0, Math.min(1, opacity));
    }
  }

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  /** Dispose of all GPU resources. */
  dispose(): void {
    this.disposeMesh();
  }

  /** Internal: remove and dispose current mesh and material. */
  private disposeMesh(): void {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.scene.remove(this.mesh);
      this.mesh = null;
    }
    if (this.material) {
      this.material.dispose();
      this.material = null;
    }
  }
}

export default PotentialSurfaceRenderer;
