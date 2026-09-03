# Materials & Lighting

The pipeline that decides whether a scene reads as photographed or as a school project. Work in
this order: color pipeline → environment → lights → materials → post. Jumping straight to
materials is why most scenes look wrong in a way nobody can quite name.

## 1. Color pipeline

Since r152 Three.js manages color for you. `ColorManagement.enabled` is `true` and the renderer
outputs `SRGBColorSpace` by default. The failure mode is no longer "set up color management" —
it is fighting the management that is already there.

**Texture tagging.** Every texture is either a picture or a lookup table, and they need opposite
treatment:

```js
colorMap.colorSpace    = THREE.SRGBColorSpace;  // color / albedo / diffuse
emissiveMap.colorSpace = THREE.SRGBColorSpace;  // emissive
// Everything else is data, not color — leave it alone:
roughnessMap.colorSpace    = THREE.NoColorSpace; // (this is already the default)
metalnessMap.colorSpace    = THREE.NoColorSpace;
normalMap.colorSpace       = THREE.NoColorSpace;
aoMap.colorSpace           = THREE.NoColorSpace;
displacementMap.colorSpace = THREE.NoColorSpace;
```

Tagging a roughness map as sRGB pushes every value through a decode curve it was never encoded
with. Mid-grey 0.5 becomes about 0.21, so the whole surface turns glossier than authored — the
single most common cause of "it looks plasticky and I cannot say why". Tagging a color map as
`NoColorSpace` does the reverse: the image reads bright, milky, and washed out.

`GLTFLoader` and `KTX2Loader` set all of this correctly. Textures loaded by hand with
`TextureLoader` do not — that is where the bug lives. Canvas and video textures need the tag set
manually too.

**Tone mapping.** HDR lighting produces values above 1.0. Without tone mapping they clip to flat
white and the image goes chalky.

```js
renderer.toneMapping = THREE.ACESFilmicToneMapping;  // safe default
renderer.toneMappingExposure = 1.0;
```

- `ACESFilmicToneMapping` — the default choice. Contrasty, rolls highlights off well, pushes
  saturated colors toward orange at the extremes.
- `AgXToneMapping` (r163+) — better highlight desaturation, more neutral. Prefer it for scenes
  with bright emissives or a strong HDRI. It looks flatter on first glance; that is headroom, not
  a defect. Answer it with exposure and post contrast, not by switching back.
- `NeutralToneMapping` (r165+, Khronos PBR Neutral) — preserves the hue and saturation of
  in-range colors. Use it for product viewers where a brand color has to stay that color.

Tune `toneMappingExposure`, not light intensities. Exposure is a camera control that scales the
whole image; changing light intensities re-balances relationships you already got right. Useful
range is roughly 0.6–1.6.

If you use the `postprocessing` library, tone mapping moves into the effect chain: set
`renderer.toneMapping = THREE.NoToneMapping` and add a `ToneMapping` effect last. Otherwise you
tone map twice and the image goes pale.

## 2. Environment — do this before adding a single light

A real surface reflects a room. Ambient plus directional gives it nothing to reflect, so metal
goes grey, glass goes invisible, and everything reads as untextured clay. This is the highest-
leverage change available and the one most consistently skipped.

**Free, and good enough for most work:**

```js
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();
```

That is a small procedural studio — soft box lights, neutral walls — for zero download. The
`0.04` blurs it slightly so reflections read as light rather than as furniture.

**HDRI, when mood matters:**

```js
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

new RGBELoader().load('/env/studio_1k.hdr', (hdr) => {
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = hdr;      // reflections + ambient
  // scene.background = hdr;    // usually NOT this
});
```

Set `environment` but usually not `background`. You want the light the HDRI carries, not a
photograph of somebody's parking lot behind your product. A flat color, or a CSS gradient behind
a transparent canvas, nearly always composes better with page typography. When you do want it
visible, soften it: `scene.backgroundBlurriness = 0.6` and `scene.backgroundIntensity = 0.4`.

Use 1k or 2k HDRIs. 4k is a multi-megabyte download that gets blurred into a mip chain anyway.

`scene.environmentIntensity` (r163+) is the dial for how strongly the environment lights the
scene — the cheapest way to move mood without touching anything else.
`scene.environmentRotation` (r165+) rotates the reflections, sliding specular highlights across a
surface. Rotating the environment is often more flattering than moving a light.

## 3. Lights, after the environment, for shape

The environment supplies ambient illumination and reflection. Lights add direction, contrast, and
shadow. Two or three is plenty.

```js
const key = new THREE.DirectionalLight(0xffffff, 3.0);
key.position.set(4, 6, 4);
key.castShadow = true;

const rim = new THREE.DirectionalLight(0xaaccff, 1.5);
rim.position.set(-5, 2, -4);   // behind the subject, separates it from the background
```

**r155 changed light units.** `useLegacyLights` became `false` by default, so lighting is now
physically correct. Every tutorial written before mid-2023 uses intensities that render far too
dim today. As a rough conversion, multiply old punctual light intensities by π (≈3.14). More
importantly, point and spot lights now obey inverse-square falloff (`decay = 2`), so intensity
has to scale with distance squared — a `PointLight` at intensity 1 sitting 5 units away is
essentially invisible. Think about what a real bulb would need to be, or just raise it until it
looks right, rather than assuming the light is broken.

If a scene looks dark, check this before adding more lights. Adding lights to compensate for
wrong units gives you a flat, overlit scene with no shadow structure — worse than where you
started.

**Shadows.** The default shadow camera is a 10-unit box. If your scene is 2 units across, you are
spending the entire shadow map on empty space:

```js
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 1;
key.shadow.camera.far = 20;
key.shadow.camera.left = -4;   // tighten to the actual bounds of what casts
key.shadow.camera.right = 4;
key.shadow.camera.top = 4;
key.shadow.camera.bottom = -4;
key.shadow.normalBias = 0.02;  // fixes acne without the peter-panning that .bias causes
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
```

Tighten the frustum before raising `mapSize` — it is free, and it usually is the problem.
`new THREE.CameraHelper(key.shadow.camera)` draws the box so you can see the waste. For a static
hero, a baked shadow plane or drei's `<ContactShadows>` costs a fraction of a real shadow map and
often looks better.

## 4. Material parameter sets

Values that hold up under an environment map. `MeshStandardMaterial` covers metalness and
roughness; anything mentioning clearcoat, transmission, iridescence, or sheen needs
`MeshPhysicalMaterial`, which is meaningfully more expensive to compile and shade.

**Brushed metal**

```js
new THREE.MeshStandardMaterial({ color: 0xb8b8bd, metalness: 1.0, roughness: 0.28 })
```

Roughness 0.28, not 0. A metal at roughness 0 is a perfect mirror, and with nothing detailed to
reflect it reads as flat untextured chrome — the "why does my metal look like grey plastic" case.
Real brushed surfaces live at 0.2–0.4. Polished chrome is 0.05 and only earns its keep against a
rich HDRI. `MeshPhysicalMaterial` adds `anisotropy` (r167+) for directional brush streaks.

**Clearcoat lacquer** — car paint, piano finish, phone shell

```js
new THREE.MeshPhysicalMaterial({
  color: 0x14304f, metalness: 0.0, roughness: 0.45,
  clearcoat: 1.0, clearcoatRoughness: 0.06,
})
```

The whole point is two layers: a soft, slightly rough base under a hard, near-mirror coat.
Matching `clearcoatRoughness` to `roughness` throws the effect away.

**Transmission glass**

```js
new THREE.MeshPhysicalMaterial({
  transmission: 1.0, thickness: 0.6,   // roughly the object's own depth, in world units
  roughness: 0.06, ior: 1.5,
  transparent: false,                  // transmission does the blending; true breaks sorting
})
```

`thickness` is in world units and must be proportional to the object. The default of 0 means no
refraction at all, and a value tuned for a 1-unit sphere does nothing on a 50-unit one — roughly
the object's diameter is a good starting point. Transmission needs an environment map to refract
and costs an extra scene render per frame, so a handful of transmissive objects is fine and a
hundred is not. Add `iridescence`, or `attenuationColor` with `attenuationDistance`, for tinted
glass.

**Iridescence** — soap film, fuel sheen, anodized metal

```js
new THREE.MeshPhysicalMaterial({
  metalness: 0.9, roughness: 0.2,
  iridescence: 1.0, iridescenceIOR: 1.3, iridescenceThicknessRange: [100, 400],
})
```

The thickness range is in nanometres and controls which colors appear. Widen it for more bands.

**Sheen fabric** — velvet, felt, suede

```js
new THREE.MeshPhysicalMaterial({
  color: 0x2a1f3d, roughness: 0.9, metalness: 0.0,
  sheen: 1.0, sheenRoughness: 0.75, sheenColor: new THREE.Color(0x8877aa),
})
```

Sheen is the retroreflective glow at grazing angles that makes velvet look like velvet. A
lighter, slightly desaturated `sheenColor` against a dark base sells it.

**Emissive that actually glows** needs a value above 1.0 to survive tone mapping and trip a bloom
threshold: `emissive: 0x44aaff, emissiveIntensity: 2.5`.

## 5. Post-processing

Post is seasoning. The tell of an amateur scene is every effect at 50%.

```jsx
// @react-three/postprocessing, or pmndrs/postprocessing for vanilla
<Bloom luminanceThreshold={0.9} luminanceSmoothing={0.03} intensity={0.6} mipmapBlur />
<Vignette offset={0.3} darkness={0.5} />
<Noise opacity={0.025} premultiply blendFunction={BlendFunction.SOFT_LIGHT} />
```

- **Bloom** with `luminanceThreshold` around 0.9, so only genuine highlights bloom. At 0.0 the
  entire image hazes over and contrast dies. `mipmapBlur` gives a wide, soft falloff far more
  cheaply than a large kernel.
- **Vignette** at `darkness` 0.4–0.6. Pulls the eye to center and reads as a lens.
- **Grain** at 0.02–0.04 opacity. Costs almost nothing, hides 8-bit gradient banding, and is most
  of what makes a render feel shot rather than computed.
- **Depth of field** only when there is a subject to focus on and a background meant to fall away.
  It is expensive, and it makes any text behind it unreadable.
- **Chromatic aberration** only for a deliberately lo-fi or glitch concept, and below 0.002.

Post-processing renders at full resolution and multiplies fill cost. If the frame rate drops the
moment you add effects, that is why — see `performance.md`.
