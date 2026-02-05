/**
 * Node Vertex Shader
 * Handles instanced rendering of nodes with per-instance attributes
 */

// Instance attributes (per-node data)
attribute vec3 instanceColor;
attribute float instanceSize;
attribute float instanceShape;
attribute float instanceVisible;
attribute float instanceHighlight;
attribute float instanceFog;  // Fog/opacity multiplier (1.0 = clear, 0.0 = fully fogged)

// Varyings to fragment shader
varying vec3 vColor;
varying float vShape;
varying float vVisible;
varying float vHighlight;
varying float vFog;
varying vec2 vUv;

void main() {
  // Pass data to fragment shader
  vColor = instanceColor;
  vShape = instanceShape;
  vVisible = instanceVisible;
  vHighlight = instanceHighlight;
  vFog = instanceFog;
  vUv = uv;

  // Scale the geometry by instance size
  vec3 transformed = position * instanceSize;

  // Apply instance matrix (position, rotation, scale)
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(transformed, 1.0);

  gl_Position = projectionMatrix * mvPosition;
}
