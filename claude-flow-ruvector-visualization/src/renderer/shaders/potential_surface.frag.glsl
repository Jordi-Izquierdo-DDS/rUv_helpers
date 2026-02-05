/**
 * Potential Surface Fragment Shader
 *
 * Colors vertices using a terrain colormap:
 *   black (0.0) -> purple (0.3) -> amber (0.7) -> white (1.0)
 *
 * Applies simple directional diffuse lighting for surface definition.
 */

precision highp float;

varying float vPotential;
varying vec3 vNormal;

uniform float uOpacity;

void main() {
  // Terrain colormap: black -> purple -> amber -> white
  vec3 color;
  if (vPotential < 0.3) {
    float t = vPotential / 0.3;
    color = mix(vec3(0.02, 0.01, 0.03), vec3(0.4, 0.1, 0.6), t); // black to purple
  } else if (vPotential < 0.7) {
    float t = (vPotential - 0.3) / 0.4;
    color = mix(vec3(0.4, 0.1, 0.6), vec3(0.9, 0.7, 0.1), t); // purple to amber
  } else {
    float t = (vPotential - 0.7) / 0.3;
    color = mix(vec3(0.9, 0.7, 0.1), vec3(1.0, 1.0, 0.95), t); // amber to white
  }

  // Simple directional lighting
  vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
  float diffuse = max(dot(normalize(vNormal), lightDir), 0.0) * 0.5 + 0.5;

  gl_FragColor = vec4(color * diffuse, uOpacity);
}
