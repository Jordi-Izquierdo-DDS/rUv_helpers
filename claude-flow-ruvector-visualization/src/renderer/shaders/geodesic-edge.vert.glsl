/**
 * Geodesic Edge Vertex Shader
 * Handles curved arc edges in Poincare disk mode.
 * Geometry already contains arc points; the shader handles styling passthrough.
 * Attribute layout is identical to edge.vert.glsl so the same fragment shader
 * (edge.frag.glsl) can be reused without modification.
 */

attribute vec3 color;
attribute float visible;
attribute float linePos;   // 0.0 at arc start, 1.0 at arc end (interpolated along arc)
attribute float edgeLen;   // Total arc length for dash calculation
attribute float fog;       // Always 1.0 in Poincare mode (no fog)
attribute float dashStyle; // 0=solid, 1=dashed, 2=dotted

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
