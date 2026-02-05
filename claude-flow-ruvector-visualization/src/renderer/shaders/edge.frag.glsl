/**
 * Edge Fragment Shader
 * Renders edges with optional glow effects and per-edge dash patterns
 */

precision highp float;

varying vec3 vColor;
varying float vVisible;
varying float vLinePos;
varying float vEdgeLen;
varying float vFog;       // Fog factor (1.0 = clear, 0.0 = fully fogged)
varying float vDashStyle; // Per-edge dash style: 0 = solid, 1 = dashed, 2 = dotted

uniform float uOpacity;
uniform float uGlow;
uniform float uDashStyle;  // Global fallback (used when per-edge dashStyle is -1)
uniform float uDashScale;  // Scale factor for dash pattern

void main() {
  // Discard invisible edges
  if (vVisible < 0.5) {
    discard;
  }

  // Determine which dash style to use: per-edge or global uniform
  // Use per-edge style if >= 0, otherwise fall back to global uniform
  float dashStyle = vDashStyle >= 0.0 ? vDashStyle : uDashStyle;

  // Calculate dash pattern
  float dashSize = uDashScale * 20.0;  // Base dash size
  float position = vLinePos * vEdgeLen;

  if (dashStyle > 0.5) {
    float pattern;
    if (dashStyle > 1.5) {
      // Dotted: small dots with larger gaps
      pattern = mod(position, dashSize * 0.4);
      if (pattern > dashSize * 0.1) {
        discard;
      }
    } else {
      // Dashed: longer segments
      pattern = mod(position, dashSize);
      if (pattern > dashSize * 0.6) {
        discard;
      }
    }
  }

  vec3 color = vColor;

  // Optional glow effect (brighten the color)
  if (uGlow > 0.5) {
    color = mix(color, vec3(1.0), 0.2);
  }

  // Apply fog (historical obsolescence) - compounds with base opacity
  // vFog: 1.0 = fully visible (surface), 0.0 = fully fogged (center)
  float finalAlpha = uOpacity * vFog;

  gl_FragColor = vec4(color, finalAlpha);
}
