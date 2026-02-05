precision highp float;

varying vec2 vUv;

uniform float uTime;
uniform float uIntensity;
uniform vec2 uResolution;

// --- Hash-based noise (simplex-style) ---

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
  const vec4 C = vec4(
    0.211324865405187,   // (3.0 - sqrt(3.0)) / 6.0
    0.366025403784439,   // 0.5 * (sqrt(3.0) - 1.0)
   -0.577350269189626,   // -1.0 + 2.0 * C.x
    0.024390243902439    // 1.0 / 41.0
  );

  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);

  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);

  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;

  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));

  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;

  vec3 x_ = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x_) - 0.5;
  vec3 ox = floor(x_ + 0.5);
  vec3 a0 = x_ - ox;

  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);

  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;

  return 130.0 * dot(m, g);
}

// Fractional Brownian Motion - multiple octaves of noise
float fbm(vec2 p, int octaves) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    value += amplitude * snoise(p * frequency);
    frequency *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

// Hash for sparkle points
float hash(vec2 p) {
  float h = dot(p, vec2(127.1, 311.7));
  return fract(sin(h) * 43758.5453123);
}

// Dream color palette
vec3 deepViolet   = vec3(0.102, 0.020, 0.200);  // #1a0533
vec3 electricPurp  = vec3(0.420, 0.184, 0.710);  // #6B2FB5
vec3 cyan          = vec3(0.000, 0.831, 1.000);  // #00d4ff
vec3 magenta       = vec3(1.000, 0.000, 1.000);  // #ff00ff
vec3 softGold      = vec3(1.000, 0.843, 0.000);  // #ffd700

void main() {
  vec2 uv = vUv;
  float t = uTime * 0.08; // Slow dreamlike pace

  // Aspect correction
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

  // --- Layer 1: Large flowing aurora bands ---
  vec2 q = vec2(
    fbm(p * 1.2 + vec2(t * 0.3, t * 0.1), 4),
    fbm(p * 1.2 + vec2(t * 0.2, t * -0.15), 4)
  );

  vec2 r = vec2(
    fbm(p + q * 3.0 + vec2(1.7, 9.2) + t * 0.15, 5),
    fbm(p + q * 3.0 + vec2(8.3, 2.8) + t * 0.12, 5)
  );

  float auroraVal = fbm(p + r * 2.5, 5);

  // --- Layer 2: Secondary flowing pattern for depth ---
  vec2 q2 = vec2(
    fbm(p * 0.8 + vec2(t * -0.2, t * 0.25), 3),
    fbm(p * 0.8 + vec2(t * 0.15, t * 0.3), 3)
  );
  float secondaryVal = fbm(p + q2 * 2.0 + vec2(3.1, 7.4), 4);

  // --- Color mixing: aurora bands ---
  // Map the noise values to color palette segments
  float colorMix = auroraVal * 0.5 + 0.5; // Remap to 0..1

  vec3 col = deepViolet;

  // Blend through palette based on noise value
  col = mix(col, electricPurp, smoothstep(0.15, 0.35, colorMix));
  col = mix(col, cyan,         smoothstep(0.35, 0.55, colorMix));
  col = mix(col, magenta,      smoothstep(0.55, 0.72, colorMix));
  col = mix(col, softGold,     smoothstep(0.72, 0.90, colorMix));

  // Blend in secondary layer with a shifted palette
  float secMix = secondaryVal * 0.5 + 0.5;
  vec3 secCol = mix(deepViolet, electricPurp, smoothstep(0.2, 0.5, secMix));
  secCol = mix(secCol, cyan, smoothstep(0.5, 0.8, secMix));

  col = mix(col, secCol, 0.3);

  // --- Flowing sine-wave aurora bands ---
  float wave1 = sin(p.y * 4.0 + p.x * 2.0 + t * 2.5 + auroraVal * 3.0) * 0.5 + 0.5;
  float wave2 = sin(p.y * 6.0 - p.x * 3.0 + t * 1.8 + secondaryVal * 2.5) * 0.5 + 0.5;
  float wave3 = sin(p.x * 5.0 + p.y * 1.5 + t * 3.0) * 0.5 + 0.5;

  float bandIntensity = wave1 * wave2 * 0.6 + wave3 * 0.2;
  col += cyan * bandIntensity * 0.15;
  col += magenta * wave2 * wave3 * 0.08;

  // --- Overall intensity envelope: slightly brighter near center ---
  float centerDist = length(p);
  float vignette = 1.0 - smoothstep(0.3, 1.5, centerDist);
  col *= 0.6 + vignette * 0.4;

  // --- Sparkle / star points ---
  // Grid of potential star locations
  float sparkleIntensity = 0.0;

  for (int layer = 0; layer < 3; layer++) {
    float scale = 40.0 + float(layer) * 25.0;
    vec2 starUv = uv * scale;
    vec2 starCell = floor(starUv);
    vec2 starFrac = fract(starUv);

    float starHash = hash(starCell + float(layer) * 100.0);

    // Only some cells have stars
    if (starHash > 0.92) {
      // Star position within cell
      vec2 starPos = vec2(
        hash(starCell * 1.3 + 0.5),
        hash(starCell * 2.7 + 1.3)
      );

      float dist = length(starFrac - starPos);

      // Twinkle: time-varying brightness
      float twinkle = sin(uTime * (1.5 + starHash * 3.0) + starHash * 6.2831) * 0.5 + 0.5;
      twinkle = twinkle * twinkle; // Sharpen the twinkle

      // Sharp point of light
      float star = smoothstep(0.04, 0.0, dist) * twinkle;
      sparkleIntensity += star * (0.6 + starHash * 0.4);
    }
  }

  col += vec3(0.9, 0.85, 1.0) * sparkleIntensity * 0.8;

  // --- Apply global intensity ---
  col *= uIntensity;

  // --- Alpha: semi-transparent so graph nodes show through ---
  // Base alpha from the aurora pattern; stronger where colors are brighter
  float luminance = dot(col, vec3(0.299, 0.587, 0.114));
  float alpha = 0.55 + luminance * 0.35;
  alpha *= uIntensity;

  // Clamp final output
  col = clamp(col, 0.0, 1.0);
  alpha = clamp(alpha, 0.0, 1.0);

  gl_FragColor = vec4(col, alpha);
}
