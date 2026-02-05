/**
 * Potential Surface Vertex Shader
 *
 * Displaces vertices along Y by the per-vertex potential value, and passes
 * the potential and normal to the fragment shader for terrain coloring.
 */

attribute float potential;
varying float vPotential;
varying vec3 vNormal;

uniform float uHeightScale;

void main() {
  vPotential = potential;
  vNormal = normal;

  // Displace vertex along Y by potential value
  vec3 displaced = position;
  displaced.y += potential * uHeightScale;

  vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
  gl_Position = projectionMatrix * mvPosition;
}
