/**
 * PoincareDiskRenderer - Renders the Poincare disk background, boundary circle,
 * and iso-distance grid in a Three.js scene.
 *
 * Visual elements:
 * - Conformal factor background (full-screen quad with custom shader)
 * - Boundary circle (luminous ring at the ideal boundary)
 * - Iso-distance grid (concentric circles at hyperbolic distances d=1,2,3,4)
 * - Radial geodesic lines (8 diameter lines through the origin)
 *
 * The Poincare disk model maps the entire hyperbolic plane into a unit disk.
 * Hyperbolic distance d from center maps to Euclidean radius r = tanh(d/2).
 */

import * as THREE from 'three';
import shaderCode from './shaders/poincare-bg.frag.glsl?raw';

/** Number of line segments per iso-distance circle */
const CIRCLE_SEGMENTS = 64;

/** Hyperbolic distances for iso-distance grid circles */
const HYPERBOLIC_DISTANCES = [1, 2, 3, 4];

/** Number of radial geodesic lines */
const RADIAL_LINE_COUNT = 8;

/** Colors for iso-distance circles (fading from center outward) */
const GRID_COLORS = [0x334466, 0x2a3a55, 0x1e2e44, 0x112244];

/** Color for radial geodesic lines */
const RADIAL_COLOR = 0x223344;

/**
 * Vertex shader for the conformal factor background quad.
 * Passes UV coordinates to the fragment shader.
 */
const bgVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export class PoincareDiskRenderer {
  private scene: THREE.Scene;
  private radius: number;

  // Visual elements
  private boundaryMesh: THREE.Mesh;
  private backgroundMesh: THREE.Mesh;
  private isoGridLines: THREE.LineSegments;
  private radialLines: THREE.LineSegments;

  // Materials (kept for uniform updates and disposal)
  private boundaryMaterial: THREE.MeshBasicMaterial;
  private backgroundMaterial: THREE.ShaderMaterial;
  private isoGridMaterial: THREE.LineBasicMaterial;
  private radialMaterial: THREE.LineBasicMaterial;

  // Geometries (kept for disposal)
  private boundaryGeometry: THREE.RingGeometry;
  private backgroundGeometry: THREE.PlaneGeometry;
  private isoGridGeometry: THREE.BufferGeometry;
  private radialGeometry: THREE.BufferGeometry;

  constructor(scene: THREE.Scene, radius: number = 900) {
    this.scene = scene;
    this.radius = radius;

    // Create all visual elements
    const boundary = this.createBoundaryCircle();
    this.boundaryGeometry = boundary.geometry;
    this.boundaryMaterial = boundary.material;
    this.boundaryMesh = boundary.mesh;

    const background = this.createBackground();
    this.backgroundGeometry = background.geometry;
    this.backgroundMaterial = background.material;
    this.backgroundMesh = background.mesh;

    const isoGrid = this.createIsoDistanceGrid();
    this.isoGridGeometry = isoGrid.geometry;
    this.isoGridMaterial = isoGrid.material;
    this.isoGridLines = isoGrid.lines;

    const radial = this.createRadialLines();
    this.radialGeometry = radial.geometry;
    this.radialMaterial = radial.material;
    this.radialLines = radial.lines;

    // Add all elements to the scene
    this.scene.add(this.backgroundMesh);
    this.scene.add(this.boundaryMesh);
    this.scene.add(this.isoGridLines);
    this.scene.add(this.radialLines);
  }

  /**
   * Create the luminous boundary circle at the edge of the disk
   * (the "ideal boundary" at infinity in the Poincare model).
   */
  private createBoundaryCircle(): {
    geometry: THREE.RingGeometry;
    material: THREE.MeshBasicMaterial;
    mesh: THREE.Mesh;
  } {
    const geometry = new THREE.RingGeometry(
      this.radius * 0.99,
      this.radius * 1.01,
      128
    );

    const material = new THREE.MeshBasicMaterial({
      color: 0x4488ff,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = -1;

    return { geometry, material, mesh };
  }

  /**
   * Create the conformal factor background visualization.
   * A full-screen quad with a custom fragment shader that visualizes
   * the conformal factor lambda = 2 / (1 - r^2).
   */
  private createBackground(): {
    geometry: THREE.PlaneGeometry;
    material: THREE.ShaderMaterial;
    mesh: THREE.Mesh;
  } {
    const geometry = new THREE.PlaneGeometry(
      this.radius * 2.2,
      this.radius * 2.2
    );

    const material = new THREE.ShaderMaterial({
      vertexShader: bgVertexShader,
      fragmentShader: shaderCode,
      uniforms: {
        uRadius: { value: this.radius },
        uTime: { value: 0 },
        uIntensity: { value: 0.15 }
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = -2;

    return { geometry, material, mesh };
  }

  /**
   * Create the iso-distance grid: concentric circles at hyperbolic
   * distances d = 1, 2, 3, 4.
   *
   * In the Poincare disk, hyperbolic distance d from center maps to
   * Euclidean radius r = tanh(d/2):
   *   d=1 -> r = tanh(0.5) ~ 0.462
   *   d=2 -> r = tanh(1.0) ~ 0.762
   *   d=3 -> r = tanh(1.5) ~ 0.905
   *   d=4 -> r = tanh(2.0) ~ 0.964
   */
  private createIsoDistanceGrid(): {
    geometry: THREE.BufferGeometry;
    material: THREE.LineBasicMaterial;
    lines: THREE.LineSegments;
  } {
    const circleCount = HYPERBOLIC_DISTANCES.length;
    // Each circle has CIRCLE_SEGMENTS line segments, each with 2 vertices
    const totalVertices = circleCount * CIRCLE_SEGMENTS * 2;
    const positions = new Float32Array(totalVertices * 3);
    const colors = new Float32Array(totalVertices * 3);

    let vertexOffset = 0;

    for (let c = 0; c < circleCount; c++) {
      const d = HYPERBOLIC_DISTANCES[c];
      const euclideanR = Math.tanh(d / 2) * this.radius;

      // Extract RGB from hex color
      const colorHex = GRID_COLORS[c];
      const r = ((colorHex >> 16) & 0xff) / 255;
      const g = ((colorHex >> 8) & 0xff) / 255;
      const b = (colorHex & 0xff) / 255;

      for (let s = 0; s < CIRCLE_SEGMENTS; s++) {
        const angle0 = (s / CIRCLE_SEGMENTS) * Math.PI * 2;
        const angle1 = ((s + 1) / CIRCLE_SEGMENTS) * Math.PI * 2;

        // Start vertex
        const i0 = vertexOffset * 3;
        positions[i0] = Math.cos(angle0) * euclideanR;
        positions[i0 + 1] = Math.sin(angle0) * euclideanR;
        positions[i0 + 2] = 0;
        colors[i0] = r;
        colors[i0 + 1] = g;
        colors[i0 + 2] = b;
        vertexOffset++;

        // End vertex
        const i1 = vertexOffset * 3;
        positions[i1] = Math.cos(angle1) * euclideanR;
        positions[i1 + 1] = Math.sin(angle1) * euclideanR;
        positions[i1 + 2] = 0;
        colors[i1] = r;
        colors[i1 + 1] = g;
        colors[i1 + 2] = b;
        vertexOffset++;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.15,
      depthWrite: false
    });

    const lines = new THREE.LineSegments(geometry, material);
    lines.renderOrder = -1;
    lines.frustumCulled = false;

    return { geometry, material, lines };
  }

  /**
   * Create radial geodesic lines through the origin.
   * In the Poincare disk, geodesics through the origin are straight
   * Euclidean diameters. 8 lines at 0, 22.5, 45, 67.5, 90, 112.5,
   * 135, and 157.5 degrees.
   */
  private createRadialLines(): {
    geometry: THREE.BufferGeometry;
    material: THREE.LineBasicMaterial;
    lines: THREE.LineSegments;
  } {
    // Each radial line is a diameter: 2 vertices per line
    const totalVertices = RADIAL_LINE_COUNT * 2;
    const positions = new Float32Array(totalVertices * 3);

    const colorR = ((RADIAL_COLOR >> 16) & 0xff) / 255;
    const colorG = ((RADIAL_COLOR >> 8) & 0xff) / 255;
    const colorB = (RADIAL_COLOR & 0xff) / 255;
    const colors = new Float32Array(totalVertices * 3);

    for (let i = 0; i < RADIAL_LINE_COUNT; i++) {
      const angle = (i / RADIAL_LINE_COUNT) * Math.PI; // 0 to PI (diameter)
      const dx = Math.cos(angle) * this.radius;
      const dy = Math.sin(angle) * this.radius;

      const v0 = i * 2;
      const v1 = v0 + 1;

      // One end
      positions[v0 * 3] = -dx;
      positions[v0 * 3 + 1] = -dy;
      positions[v0 * 3 + 2] = 0;

      // Other end
      positions[v1 * 3] = dx;
      positions[v1 * 3 + 1] = dy;
      positions[v1 * 3 + 2] = 0;

      // Colors
      colors[v0 * 3] = colorR;
      colors[v0 * 3 + 1] = colorG;
      colors[v0 * 3 + 2] = colorB;
      colors[v1 * 3] = colorR;
      colors[v1 * 3 + 1] = colorG;
      colors[v1 * 3 + 2] = colorB;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.08,
      depthWrite: false
    });

    const lines = new THREE.LineSegments(geometry, material);
    lines.renderOrder = -1;
    lines.frustumCulled = false;

    return { geometry, material, lines };
  }

  /**
   * Show or hide all Poincare disk elements.
   */
  setVisible(visible: boolean): void {
    this.boundaryMesh.visible = visible;
    this.backgroundMesh.visible = visible;
    this.isoGridLines.visible = visible;
    this.radialLines.visible = visible;
  }

  /**
   * Adjust background brightness (0-1).
   */
  setIntensity(intensity: number): void {
    this.backgroundMaterial.uniforms.uIntensity.value = intensity;
  }

  /**
   * Update time uniform for the subtle background animation.
   */
  update(time: number): void {
    this.backgroundMaterial.uniforms.uTime.value = time;
  }

  /**
   * Update the disk radius (e.g. for zoom synchronization).
   * Rebuilds all geometries to match the new radius.
   */
  setRadius(radius: number): void {
    if (radius === this.radius) return;
    this.radius = radius;

    // Remove old objects from scene
    this.scene.remove(this.boundaryMesh);
    this.scene.remove(this.backgroundMesh);
    this.scene.remove(this.isoGridLines);
    this.scene.remove(this.radialLines);

    // Dispose old geometries
    this.boundaryGeometry.dispose();
    this.backgroundGeometry.dispose();
    this.isoGridGeometry.dispose();
    this.radialGeometry.dispose();

    // Preserve visibility state
    const wasVisible = this.boundaryMesh.visible;
    const currentIntensity = this.backgroundMaterial.uniforms.uIntensity.value;
    const currentTime = this.backgroundMaterial.uniforms.uTime.value;

    // Rebuild with new radius
    const boundary = this.createBoundaryCircle();
    this.boundaryGeometry = boundary.geometry;
    this.boundaryMaterial = boundary.material;
    this.boundaryMesh = boundary.mesh;

    const background = this.createBackground();
    this.backgroundGeometry = background.geometry;
    this.backgroundMaterial = background.material;
    this.backgroundMesh = background.mesh;

    const isoGrid = this.createIsoDistanceGrid();
    this.isoGridGeometry = isoGrid.geometry;
    this.isoGridMaterial = isoGrid.material;
    this.isoGridLines = isoGrid.lines;

    const radial = this.createRadialLines();
    this.radialGeometry = radial.geometry;
    this.radialMaterial = radial.material;
    this.radialLines = radial.lines;

    // Restore state
    this.backgroundMaterial.uniforms.uIntensity.value = currentIntensity;
    this.backgroundMaterial.uniforms.uTime.value = currentTime;
    this.setVisible(wasVisible);

    // Re-add to scene
    this.scene.add(this.backgroundMesh);
    this.scene.add(this.boundaryMesh);
    this.scene.add(this.isoGridLines);
    this.scene.add(this.radialLines);
  }

  /**
   * Get the current disk radius.
   */
  getRadius(): number {
    return this.radius;
  }

  /**
   * Clean up all Three.js objects and remove them from the scene.
   */
  dispose(): void {
    // Remove from scene
    this.scene.remove(this.boundaryMesh);
    this.scene.remove(this.backgroundMesh);
    this.scene.remove(this.isoGridLines);
    this.scene.remove(this.radialLines);

    // Dispose geometries
    this.boundaryGeometry.dispose();
    this.backgroundGeometry.dispose();
    this.isoGridGeometry.dispose();
    this.radialGeometry.dispose();

    // Dispose materials
    this.boundaryMaterial.dispose();
    this.backgroundMaterial.dispose();
    this.isoGridMaterial.dispose();
    this.radialMaterial.dispose();
  }
}

export default PoincareDiskRenderer;
