// Shared GLSL. The noise block is the one from the skill's references/shaders.md;
// everything else is built on top of it.

export const NOISE = /* glsl */ `
vec3 hash3(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
           dot(p, vec3(269.5, 183.3, 246.1)),
           dot(p, vec3(113.5, 271.9, 124.6)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float noise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dot(hash3(i + vec3(0,0,0)), f - vec3(0,0,0)),
                     dot(hash3(i + vec3(1,0,0)), f - vec3(1,0,0)), u.x),
                 mix(dot(hash3(i + vec3(0,1,0)), f - vec3(0,1,0)),
                     dot(hash3(i + vec3(1,1,0)), f - vec3(1,1,0)), u.x), u.y),
             mix(mix(dot(hash3(i + vec3(0,0,1)), f - vec3(0,0,1)),
                     dot(hash3(i + vec3(1,0,1)), f - vec3(1,0,1)), u.x),
                 mix(dot(hash3(i + vec3(0,1,1)), f - vec3(0,1,1)),
                     dot(hash3(i + vec3(1,1,1)), f - vec3(1,1,1)), u.x), u.y), u.z);
}

float fbm(vec3 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; }
  return v;
}
`

/**
 * The shard: an icosahedron pushed out along its normals by ridged noise.
 *
 * Ridged noise — `1 - |n|`, raised to a power — is what makes the spikes. Plain fbm gives
 * soft lumps; folding it at zero produces creases, and the exponent sharpens them into the
 * blades the reference has. Everything else here is the skill's displacement recipe:
 * recompute the normal from the displaced surface, because the `normal` attribute still
 * describes the sphere you started with.
 */
export const shardVertex = /* glsl */ `
uniform float uTime;
uniform float uAmp;
uniform float uSharp;
uniform float uFreq;

varying vec3 vNormalW;
varying vec3 vViewDir;
varying float vRidge;

${NOISE}

float ridged(vec3 p) {
  float n = fbm(p);
  float r = 1.0 - abs(n * 2.0);
  return pow(clamp(r, 0.0, 1.0), uSharp);
}

float field(vec3 p) {
  vec3 q = p * uFreq + vec3(0.0, 0.0, uTime * 0.05);
  return ridged(q);
}

vec3 displace(vec3 p, vec3 n) { return p + n * field(p) * uAmp; }

void main() {
  vec3 n = normalize(normal);

  vec3 t = normalize(cross(n, abs(n.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 b = normalize(cross(n, t));
  float eps = 0.025;

  vec3 p0 = displace(position, n);
  vec3 p1 = displace(position + t * eps, n);
  vec3 p2 = displace(position + b * eps, n);
  vec3 dn = normalize(cross(p1 - p0, p2 - p0));

  vec4 world = modelMatrix * vec4(p0, 1.0);

  vRidge = field(position);
  vNormalW = normalize(mat3(modelMatrix) * dn);
  vViewDir = normalize(cameraPosition - world.xyz);

  gl_Position = projectionMatrix * viewMatrix * world;
}
`

/**
 * Black chrome. There is almost no diffuse here — the form is read entirely from a
 * fresnel rim and a couple of hard specular lobes, which is why it survives on a pure
 * black page. Values are LINEAR: the base sits near 0.01 so that sRGB output lands it
 * around 0.1 rather than mid grey.
 */
export const shardFragment = /* glsl */ `
uniform vec3 uRim;
uniform vec3 uTint;
uniform float uRimPower;
uniform float uOpacity;

varying vec3 vNormalW;
varying vec3 vViewDir;
varying float vRidge;

void main() {
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(vViewDir);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, uRimPower);

  // Two hard key lobes standing in for a studio: one high right, one low left and cool.
  vec3 L1 = normalize(vec3(0.55, 0.75, 0.38));
  vec3 L2 = normalize(vec3(-0.65, -0.25, 0.5));
  float s1 = pow(max(dot(reflect(-L1, N), V), 0.0), 150.0);
  float s2 = pow(max(dot(reflect(-L2, N), V), 0.0), 85.0);

  vec3 color = uTint * (0.005 + vRidge * 0.028);
  color += uRim * fres * 0.15;
  color += vec3(1.0, 0.99, 0.97) * s1 * 2.6;
  color += vec3(0.55, 0.6, 0.95) * s2 * 0.32;

  float dither = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  color += dither;

  gl_FragColor = vec4(color, uOpacity);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

/**
 * The burst. Positions are integrated on the GPU from a seed and a single progress
 * uniform — stateless, so no ping-pong render targets are needed for a one-shot
 * explosion. The skill's threshold for reaching for GPGPU is state that has to persist
 * between frames, and an explosion that is a pure function of progress does not.
 *
 * Curl noise gives the swirl: it is divergence-free, so particles never pile into sinks
 * the way plain fbm advection does, which is the difference between smoke and drift.
 */
/**
 * The burst. Positions are integrated in the vertex shader from a seed and a single
 * progress uniform — stateless, so a one-shot explosion needs no ping-pong render
 * targets. The skill's threshold for reaching for GPGPU is state that must survive
 * between frames, and an explosion that is a pure function of scroll has none.
 * Scrubbing backwards runs it in reverse for free, which a stateful sim could not do.
 *
 * The swirl comes from curl noise baked into an attribute at construction — see
 * Burst.jsx for why it is not evaluated here.
 */
export const burstVertex = /* glsl */ `
uniform float uTime;
uniform float uProgress;   // 0 = collapsed in the core, 1 = fully bloomed
uniform float uSize;
uniform float uDpr;

attribute vec3 aDir;       // unit direction out of the core
attribute vec3 aSwirl;     // baked curl-noise offset, already length-limited
attribute float aSeed;
attribute float aReach;    // how far this particle travels

varying float vFade;
varying float vHeat;

void main() {
  // Stagger the launch so the cloud has a leading edge rather than one shell.
  float delay = aSeed * 0.3;
  float t = clamp((uProgress - delay) / (1.0 - delay), 0.0, 1.0);
  // Ease out hard: an explosion is fast then slow, never linear.
  float e = 1.0 - pow(1.0 - t, 2.4);

  float dist = e * aReach;

  // Slowly rotate the baked swirl so the cloud keeps moving without recomputing noise.
  float a = uTime * 0.1 + aSeed * 6.2831;
  vec3 sw = vec3(
    aSwirl.x * cos(a) - aSwirl.z * sin(a),
    aSwirl.y,
    aSwirl.x * sin(a) + aSwirl.z * cos(a)
  );

  vec3 pos = aDir * dist + sw * dist;
  pos.y += e * e * 0.3; // a little lift, so it reads as buoyant rather than radial

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);

  // gl_PointSize is in physical pixels: without the DPR term these are half size on a
  // retina display. Particles grow as they travel, the way real powder dissipates.
  float grow = mix(0.4, 1.0, e);
  gl_PointSize = uSize * grow * uDpr * (1.0 / -mv.z);

  vFade = smoothstep(0.0, 0.1, t);
  vHeat = 1.0 - clamp(dist / 6.5, 0.0, 1.0); // hot near the core, cool at the edges

  gl_Position = projectionMatrix * mv;
}
`

export const burstFragment = /* glsl */ `
uniform vec3 uCore;
uniform vec3 uEdge;
uniform float uOpacity;

varying float vFade;
varying float vHeat;

void main() {
  float d = length(gl_PointCoord - 0.5);
  // A soft, wide falloff. A hard disc reads as confetti; this reads as powder.
  // Written edge0 < edge1: GLSL smoothstep with the edges reversed is undefined.
  float a = 1.0 - smoothstep(0.05, 0.5, d);
  if (a < 0.004) discard;

  vec3 color = mix(uEdge, uCore, pow(vHeat, 2.0));
  gl_FragColor = vec4(color, a * vFade * uOpacity * 0.16);
}
`
