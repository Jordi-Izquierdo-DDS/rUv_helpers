precision highp float;

varying vec2 vUv;

uniform float uRadius;
uniform float uTime;
uniform float uIntensity;

void main() {
  // Map UV to centered coordinates
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);

  // Normalize to disk radius
  float diskR = r; // Already normalized since geometry matches

  // Outside disk: fully transparent
  if (diskR > 1.0) {
    discard;
  }

  // Conformal factor visualization: lambda = 2 / (1 - r^2)
  float conformal = 2.0 / (1.0 - diskR * diskR + 0.001); // +epsilon to avoid div/0

  // Map conformal factor to brightness (inverse - bright at center, dark at boundary)
  // At center: conformal = 2, at boundary: conformal -> infinity
  float brightness = 1.0 / conformal; // 0.5 at center, -> 0 at boundary

  // Subtle pulsing animation
  float pulse = sin(uTime * 0.5) * 0.02 + 1.0;

  // Color: deep blue-purple at center, fading to black at boundary
  vec3 centerColor = vec3(0.08, 0.04, 0.15);  // Deep purple
  vec3 edgeColor = vec3(0.02, 0.01, 0.05);    // Near black

  vec3 color = mix(edgeColor, centerColor, brightness * pulse);

  // Soft edge at boundary
  float edgeFade = smoothstep(1.0, 0.95, diskR);

  gl_FragColor = vec4(color * uIntensity, edgeFade * uIntensity * 0.8);
}
