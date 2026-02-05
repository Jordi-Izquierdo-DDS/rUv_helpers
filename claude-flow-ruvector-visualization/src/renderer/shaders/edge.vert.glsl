/**
 * Edge Vertex Shader
 * Line rendering with per-vertex colors, dash pattern support, and per-edge styling
 */

attribute vec3 color;
attribute float visible;
attribute float linePos;   // 0.0 for start vertex, 1.0 for end vertex
attribute float edgeLen;   // Total edge length for dash calculation
attribute float fog;       // Fog factor (1.0 = clear, 0.0 = fully fogged)
attribute float dashStyle; // Per-edge dash style: 0 = solid, 1 = dashed, 2 = dotted

varying vec3 vColor;
varying float vVisible;
varying float vLinePos;
varying float vEdgeLen;
varying float vFog;
varying float vDashStyle;

void main() {
  vColor = color;
  vVisible = visible;
  vLinePos = linePos;
  vEdgeLen = edgeLen;
  vFog = fog;
  vDashStyle = dashStyle;

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
}
