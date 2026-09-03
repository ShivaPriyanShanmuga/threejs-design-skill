// GLSL for the hero orb. Lifted straight out of the skill's references/shaders.md:
// gradient-noise fbm, domain warping, recomputed normals after displacement,
// a fresnel rim term, an IQ cosine palette, and a dither to kill gradient banding.

const NOISE = /* glsl */ `
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
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; }
  return v;
}
`

export const vertexShader = /* glsl */ `
uniform float uTime;
uniform float uAmp;

varying vec3 vNormalW;
varying vec3 vViewDir;
varying float vShape;

${NOISE}

// One level of domain warping. Time moves *through* the field rather than scaling it,
// so the surface drifts instead of breathing.
float shape(vec3 p) {
  vec3 q = p * 0.85 + vec3(0.0, 0.0, uTime * 0.045);
  vec3 w = vec3(fbm(q), fbm(q + vec3(5.2, 1.3, 2.8)), fbm(q + vec3(1.7, 9.2, 3.4)));
  return fbm(q + 1.7 * w);
}

vec3 displace(vec3 p, vec3 n) { return p + n * shape(p) * uAmp; }

void main() {
  vec3 n = normalize(normal);

  // Rebuild the normal from the displaced surface. Without this the lighting and the
  // fresnel are computed against a sphere that no longer exists, and it reads flat.
  vec3 t = normalize(cross(n, abs(n.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 b = normalize(cross(n, t));
  float eps = 0.03;

  vec3 p0 = displace(position, n);
  vec3 p1 = displace(position + t * eps, n);
  vec3 p2 = displace(position + b * eps, n);
  vec3 dn = normalize(cross(p1 - p0, p2 - p0));

  vec4 world = modelMatrix * vec4(p0, 1.0);

  vShape   = shape(position);
  vNormalW = normalize(mat3(modelMatrix) * dn);
  vViewDir = normalize(cameraPosition - world.xyz);

  gl_Position = projectionMatrix * viewMatrix * world;
}
`

export const fragmentShader = /* glsl */ `
uniform vec3 uPalA;
uniform vec3 uPalB;
uniform vec3 uPalC;
uniform vec3 uPalD;
uniform vec3 uRim;
uniform float uRimPower;

varying vec3 vNormalW;
varying vec3 vViewDir;
varying float vShape;

// Inigo Quilez cosine palette — smooth multi-stop ramps that never cross the grey
// centre of the colour cube the way a two-stop RGB mix does.
vec3 palette(float t) {
  return uPalA + uPalB * cos(6.28318 * (uPalC * t + uPalD));
}

void main() {
  float ndv = clamp(dot(normalize(vNormalW), normalize(vViewDir)), 0.0, 1.0);
  float fres = pow(1.0 - ndv, uRimPower);

  vec3 base = palette(clamp(vShape * 0.9 + 0.4, 0.0, 1.0));
  vec3 color = mix(base, uRim, fres * 0.44);

  // A thin, genuinely bright edge — the only thing in the frame above the
  // bloom threshold, so bloom picks out the silhouette and nothing else.
  // Note this compounds with uRimPower: at 2.8, pow(fres, 3.0) is really (1 - ndv)^8.4.
  color += uRim * pow(fres, 3.0) * 2.4;

  float dither = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  color += dither;

  gl_FragColor = vec4(color, 1.0);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`
