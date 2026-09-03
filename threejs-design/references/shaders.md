# Shaders & Particles

Custom GLSL is what separates a scene made of primitives from a scene that looks authored. Raw
shaders bypass Three's lighting pipeline entirely — no environment map, no PBR, no tone mapping
unless you ask for it — so the rules in `materials-lighting.md` mostly do not apply here, with
one exception noted at the bottom of this section.

## Attaching a shader

Three ways, in increasing order of how much you keep from Three:

**`ShaderMaterial`** — full control, no lighting. Right for backgrounds, particles, procedural
surfaces, anything where you are painting rather than lighting.

```js
const material = new THREE.ShaderMaterial({
  vertexShader, fragmentShader,
  uniforms: {
    uTime:  { value: 0 },
    uColorA: { value: new THREE.Color('#1b1d3a') },
  },
});
// in the loop: material.uniforms.uTime.value = elapsed;   // mutate .value, never replace the object
```

`ShaderMaterial` gives you `position`, `normal`, `uv`, `modelMatrix`, `viewMatrix`,
`projectionMatrix`, `modelViewMatrix`, `normalMatrix`, and `cameraPosition` for free.
`RawShaderMaterial` gives you none of them and is almost never worth it.

**`onBeforeCompile`** — inject GLSL into a `MeshStandardMaterial` and keep PBR, shadows, and the
environment map. Right for "our normal material, but the vertices ripple".

```js
material.onBeforeCompile = (shader) => {
  shader.uniforms.uTime = uTime;                  // share the same uniform object as your loop
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n uniform float uTime;\n ${noiseGLSL}`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>\n transformed += normal * fbm(position * 1.5 + uTime * 0.2) * 0.3;`);
};
material.customProgramCacheKey = () => 'rippling-v1';   // or every instance recompiles
```

Brittle against Three upgrades, since it string-matches internal chunks. The `three-custom-shader-material`
package does the same thing with a stable API and is worth the dependency if you do this more than
once.

**Fragment-only, on a full-screen quad** — for a flat background, do not subdivide a plane and
displace it. Render a 4-vertex quad and do everything in the fragment shader. It is dramatically
cheaper and there is no geometry to alias.

## Noise: the foundation

fbm is layered noise, and it is what makes procedural motion read as organic rather than
mathematical. Self-contained gradient noise, good enough for visuals:

```glsl
vec3 hash3(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
           dot(p, vec3(269.5, 183.3, 246.1)),
           dot(p, vec3(113.5, 271.9, 124.6)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float noise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);            // smoothstep, kills the grid artifacts
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
```

The `2.02` lacunarity rather than a clean `2.0` is deliberate: exact octave doubling makes the
layers line up and produces visible grid structure. For higher quality use Ashima's `snoise` from
`webgl-noise`, or the `glsl-noise` package.

**Animate by moving through the noise field, not by scaling it.** `fbm(p + vec3(0.0, 0.0, uTime * 0.15))`
drifts; `fbm(p * (1.0 + sin(uTime)))` pulses and reads as a breathing bug.

**Domain warping** is the single highest-value trick in procedural graphics: feed noise into
itself so the field flows instead of just bubbling.

```glsl
float warp(vec3 p) {
  vec3 q = vec3(fbm(p), fbm(p + vec3(5.2, 1.3, 2.8)), fbm(p + vec3(1.7, 9.2, 3.4)));
  vec3 r = vec3(fbm(p + 4.0 * q + vec3(1.7, 9.2, 0.0)),
                fbm(p + 4.0 * q + vec3(8.3, 2.8, 0.0)),
                fbm(p + 4.0 * q));
  return fbm(p + 4.0 * r);
}
```

Two levels of warping is where it starts looking like smoke or marbled ink. Each level multiplies
the noise calls, so a 5-octave fbm warped twice is 65 noise evaluations per fragment — measure it
before shipping to phones.

## Fresnel

The rim term. It is most of what makes a shape read as glass, energy, or atmosphere, and it costs
almost nothing.

```glsl
// vertex
vNormal  = normalize(mat3(modelMatrix) * normal);          // world space
vViewDir = normalize(cameraPosition - (modelMatrix * vec4(position, 1.0)).xyz);

// fragment
float fresnel = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewDir)), 0.0, 1.0), 3.0);
vec3 color = mix(baseColor, rimColor, fresnel);
```

Use `mat3(modelMatrix)` for the normal only when scaling is uniform; with non-uniform scale you
need the inverse transpose. The exponent is the dial: 2 is a broad glow, 5 is a thin bright edge.
Multiply by a noise term to make the rim shimmer rather than sit there.

## Displacing geometry

**A plane needs real subdivision.** `new THREE.PlaneGeometry(4, 4)` has four vertices — displacing
them in a vertex shader does nothing visible. Use `PlaneGeometry(4, 4, 128, 128)` or higher.
Likewise `SphereGeometry(1, 64, 64)`, not the default 32×16. The cost is vertex count: 256×256 is
131k triangles, which is fine for one hero object and not fine for fifty.

**Displacement breaks your normals.** The `normal` attribute describes the original surface, so
after moving vertices, lighting and fresnel are computed against a shape that no longer exists —
this is why displaced meshes often look oddly flat or lit from the wrong side. Recompute by
sampling the displacement function at two nearby points:

```glsl
vec3 displace(vec3 p) { return p + normal * fbm(p * 1.5 + uTime * 0.15) * 0.35; }

vec3 tangent  = normalize(cross(normal, abs(normal.y) < 0.99 ? vec3(0.0,1.0,0.0) : vec3(1.0,0.0,0.0)));
vec3 bitangent = normalize(cross(normal, tangent));
float eps = 0.01;
vec3 p0 = displace(position);
vec3 p1 = displace(position + tangent * eps);
vec3 p2 = displace(position + bitangent * eps);
vNormal = normalize(mat3(modelMatrix) * normalize(cross(p1 - p0, p2 - p0)));
```

Three displacement evaluations instead of one. Worth it — the difference is immediately visible.

## Particles

Use `THREE.Points` with a `BufferGeometry` and per-particle attributes. One draw call for the
whole system.

```js
const N = 40000;
const positions = new Float32Array(N * 3);
const scales = new Float32Array(N);
const seeds = new Float32Array(N);
for (let i = 0; i < N; i++) { /* fill */ }

const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geo.setAttribute('aScale',   new THREE.BufferAttribute(scales, 1));
geo.setAttribute('aSeed',    new THREE.BufferAttribute(seeds, 1));

const points = new THREE.Points(geo, new THREE.ShaderMaterial({
  vertexShader, fragmentShader,
  transparent: true,
  depthWrite: false,                       // otherwise particles occlude each other opaquely
  blending: THREE.AdditiveBlending,        // glowing look; only works on a dark background
}));
```

**Perspective-correct point size.** `gl_PointSize` is in physical device pixels, so it needs both
a `1 / -z` term to shrink with distance and a DPR multiplier — forget the second and particles
render half-size on a retina display:

```glsl
uniform float uSize;
uniform float uDpr;
attribute float aScale;

vec4 mv = modelViewMatrix * vec4(position, 1.0);
gl_PointSize = uSize * aScale * uDpr * (1.0 / -mv.z);
gl_Position = projectionMatrix * mv;
```

**Round, soft particles.** A raw point is a hard square. `gl_PointCoord` is the 0–1 coordinate
inside the sprite:

```glsl
float d = length(gl_PointCoord - 0.5);
float alpha = smoothstep(0.5, 0.1, d);       // soft radial falloff
if (alpha < 0.01) discard;
gl_FragColor = vec4(color, alpha);
```

Give each particle its own phase from `aSeed` so the system never pulses in unison — the
give-away of a cheap particle field is everything breathing on the same beat.

**Curl noise** for flow fields. It is the curl of a vector potential, so it is divergence-free:
particles swirl and never pile up in sinks, which is why it looks like fluid where plain noise
looks like drift.

```glsl
vec3 potential(vec3 p) {
  return vec3(fbm(p), fbm(p + vec3(31.4, 0.0, 17.7)), fbm(p + vec3(0.0, 47.2, 5.1)));
}
vec3 curl(vec3 p) {
  const float e = 0.1;
  vec3 dx = vec3(e, 0.0, 0.0), dy = vec3(0.0, e, 0.0), dz = vec3(0.0, 0.0, e);
  vec3 x1 = potential(p + dx), x0 = potential(p - dx);
  vec3 y1 = potential(p + dy), y0 = potential(p - dy);
  vec3 z1 = potential(p + dz), z0 = potential(p - dz);
  return vec3((y1.z - y0.z) - (z1.y - z0.y),
              (z1.x - z0.x) - (x1.z - x0.z),
              (x1.y - x0.y) - (y1.x - y0.x)) / (2.0 * e);
}
```

**Above roughly 100k particles, move simulation to the GPU.** Below that, integrating positions in
a vertex shader from a seed and `uTime` is stateless and cheap. Above it — or the moment particles
need to remember state, collide, or respond to a moving attractor — use `GPUComputationRenderer`
from `three/addons/misc/GPUComputationRenderer.js`: positions and velocities live in float
textures, a fragment shader ping-pongs them between two render targets, and the vertex shader
reads the result. Millions of particles become feasible; the trade is that everything must be
expressible as texture lookups.

## Color

Two failures make procedural work look cheap regardless of how good the motion is.

**Two-stop gradients read as a template.** A `mix(colorA, colorB, t)` background is the visual
signature of a starter project. Use three or more stops, or a palette function. Inigo Quilez's
cosine palette gives smooth, non-linear, professional-looking ramps from twelve numbers:

```glsl
vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(6.28318 * (c * t + d));
}
// e.g. palette(t, vec3(0.5), vec3(0.5), vec3(1.0, 1.0, 0.5), vec3(0.8, 0.9, 0.3))
```

**Interpolating between complements passes through grey.** Linear RGB mixing from orange to blue
crosses a desaturated mud at t = 0.5, and the midpoint is exactly where the eye lands. Either
route the ramp through an intermediate hue (orange → magenta → blue), or interpolate in a
perceptual space (OKLab), or use the palette function above, which never traverses the centre of
the color cube.

**Dither your gradients.** Any smooth ramp quantizes to visible bands in 8-bit output. One line
fixes it:

```glsl
float dither = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
gl_FragColor.rgb += dither;
```

## Shader output and the color pipeline

The one place the color pipeline does reach into raw shaders. `ShaderMaterial` does not get
Three's tone mapping or output color-space conversion automatically — so a custom shader will look
more saturated and contrastier than the PBR materials sitting next to it in the same scene. If
they must match, end `main()` with the same chunks the built-in materials use:

```glsl
  gl_FragColor = vec4(color, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
```

For a standalone background that is not trying to match lit geometry, leaving them out is fine —
just be aware you are authoring in output space, and pick colors by eye rather than by hex value.
