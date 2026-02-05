/**
 * Node Fragment Shader
 * Renders different node shapes with anti-aliasing and glow effects
 */

precision highp float;

// Varyings from vertex shader
varying vec3 vColor;
varying float vShape;
varying float vVisible;
varying float vHighlight;
varying float vFog;  // Fog factor (1.0 = clear, 0.0 = fully fogged)
varying vec2 vUv;

// Uniforms
uniform float uOpacity;
uniform float uTime;

// Shape constants (must match NodeShape enum in Constants.ts)
const float SHAPE_CIRCLE = 0.0;
const float SHAPE_SQUARE = 1.0;
const float SHAPE_DIAMOND = 2.0;
const float SHAPE_TRIANGLE = 3.0;
const float SHAPE_HEXAGON = 4.0;
const float SHAPE_PENTAGON = 5.0;
const float SHAPE_STAR = 6.0;
const float SHAPE_INVERTED_TRIANGLE = 7.0;

// Signed distance function for circle
float sdCircle(vec2 p, float r) {
  return length(p) - r;
}

// Signed distance function for square
float sdSquare(vec2 p, float s) {
  vec2 d = abs(p) - vec2(s);
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

// Signed distance function for diamond (rotated square)
float sdDiamond(vec2 p, float s) {
  vec2 d = abs(p);
  return (d.x + d.y - s) * 0.707;
}

// Signed distance function for triangle (pointing up)
float sdTriangle(vec2 p, float r) {
  const float k = sqrt(3.0);
  p.x = abs(p.x) - r;
  p.y = p.y + r / k;
  if (p.x + k * p.y > 0.0) {
    p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
  }
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}

// Signed distance function for regular polygon (n sides)
float sdRegularPolygon(vec2 p, float r, float n) {
  float an = 3.141593 / n;
  float he = r * cos(an);
  float angle = atan(p.x, p.y);
  float sector = mod(angle, 2.0 * an) - an;
  vec2 q = vec2(length(p) * cos(sector), length(p) * sin(sector));
  q.x -= he;
  q.y = abs(q.y) - he * tan(an);
  float d1 = length(max(q, 0.0));
  float d2 = min(0.0, max(q.x, q.y));
  return d1 + d2;
}

// Signed distance function for star (5-pointed)
float sdStar5(vec2 p, float r) {
  // Rotate so top point faces up
  float a = atan(p.x, p.y) + 3.141593;
  float seg = 6.283185 / 5.0;
  a = mod(a, seg) - seg * 0.5;
  vec2 q = vec2(length(p) * cos(a), length(p) * sin(a));
  // Inner radius ratio 0.45
  float innerR = r * 0.45;
  float outerR = r;
  // Approximate SDF using polygon intersection
  float d = q.x - outerR;
  float angle2 = 3.141593 / 5.0;
  float slope = tan(angle2);
  float lineD = (q.x - innerR) * cos(angle2) + q.y * sin(angle2);
  d = max(d, lineD);
  d = max(d, abs(q.y) - outerR);
  return d;
}

void main() {
  // Early discard for invisible nodes
  if (vVisible < 0.5) {
    discard;
  }

  // Center UV coordinates
  vec2 p = (vUv - 0.5) * 2.0;

  // Calculate signed distance based on shape (matches NodeShape enum)
  float d;
  if (vShape < 0.5) {
    d = sdCircle(p, 0.8);                        // 0: CIRCLE (Memory)
  } else if (vShape < 1.5) {
    d = sdSquare(p, 0.6);                        // 1: SQUARE (Q-Pattern)
  } else if (vShape < 2.5) {
    d = sdDiamond(p, 0.9);                       // 2: DIAMOND (Neural Pattern)
  } else if (vShape < 3.5) {
    d = sdTriangle(p, 0.7);                      // 3: TRIANGLE (Action)
  } else if (vShape < 4.5) {
    d = sdRegularPolygon(p, 0.8, 6.0);           // 4: HEXAGON (State)
  } else if (vShape < 5.5) {
    d = sdRegularPolygon(p, 0.8, 5.0);           // 5: PENTAGON (Trajectory)
  } else if (vShape < 6.5) {
    d = sdStar5(p, 0.8);                         // 6: STAR (File)
  } else {
    d = sdTriangle(vec2(p.x, -p.y), 0.7);       // 7: INVERTED_TRIANGLE (Agent)
  }

  // Anti-aliased edge
  float aa = fwidth(d) * 1.5;
  float alpha = 1.0 - smoothstep(-aa, aa, d);

  // Discard fragments outside shape
  if (alpha < 0.01) {
    discard;
  }

  // Base color with opacity
  vec3 color = vColor;

  // Highlight effect (pulsing glow)
  if (vHighlight > 0.5) {
    float pulse = sin(uTime * 3.0) * 0.3 + 0.7;
    color = mix(color, vec3(1.0), pulse * 0.5);
    alpha *= 1.0 + pulse * 0.3;
  }

  // Inner glow for depth
  float innerGlow = smoothstep(0.0, -0.3, d);
  color = mix(color, color * 1.3, innerGlow * 0.3);

  // Border
  float border = smoothstep(-0.1, -0.05, d) * smoothstep(-0.02, -0.1, d);
  color = mix(color, color * 0.7, border * 0.5);

  // Apply fog (historical obsolescence) - compounds with base opacity
  // vFog: 1.0 = fully visible (surface), 0.0 = fully fogged (center)
  float finalAlpha = alpha * uOpacity * vFog;

  gl_FragColor = vec4(color, finalAlpha);
}
