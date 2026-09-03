# Performance

Work this list in order. Each step is roughly an order of magnitude less impactful than the one
above it, and people reliably start at the bottom — optimising geometry while an uncapped DPR
quietly renders nine times too many pixels.

## 0. Measure first

```js
console.log(renderer.info.render.calls);      // draw calls — the number that matters most
console.log(renderer.info.render.triangles);
console.log(renderer.info.memory.geometries, renderer.info.memory.textures);  // leak detector
```

`info.render` is reset at the start of every render pass, so with an `EffectComposer` a naive read
after the frame reports the last pass only — usually a single fullscreen quad, which looks like a
suspiciously good result. Set `renderer.info.autoReset = false`, reset once, and read after exactly
one frame to get the whole picture, post included.

Two numbers tell you which problem you have. If frame time scales with window size, you are
**fill-rate bound** — pixels, post-processing, transparency, DPR. If it does not change when you
shrink the window, you are **CPU or draw-call bound** — too many objects, too much work per frame.
The fixes are completely different, and guessing wrong wastes a day.

`stats.js` for a frame-time graph, `r3f-perf` for R3F, and the Spector.js extension when you need
to see every GL call in a frame.

## 1. Cap device pixel ratio

The single largest win, and free.

```js
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));   // vanilla
<Canvas dpr={[1, 2]} />                                          // R3F
```

A phone at DPR 3 renders nine times the pixels of a DPR 1 screen. Capping at 2 is visually
indistinguishable on a handheld and can more than double the frame rate. On a heavy scene, cap at
1.5. This is the top cause of hot phones and stuttering scroll.

Re-apply it on resize — moving a window to an external monitor changes `devicePixelRatio` with no
other signal.

## 2. Cut draw calls

Every distinct mesh-material pair is a draw call. A few hundred is where the main thread starts
losing.

- **`InstancedMesh`** for many copies of one geometry — trees, particles as real meshes, a grid of
  cubes. Ten thousand instances in one draw call.
  ```js
  const mesh = new THREE.InstancedMesh(geo, mat, 10000);
  const m = new THREE.Matrix4();                       // reuse, do not allocate in the loop
  for (let i = 0; i < 10000; i++) { m.setPosition(x, y, z); mesh.setMatrixAt(i, m); }
  mesh.instanceMatrix.needsUpdate = true;
  ```
  Per-instance color via `setColorAt`; anything else needs an `InstancedBufferAttribute` and a
  shader. Set `mesh.frustumCulled = false` if instances spread beyond the source geometry's
  bounding box, or they will vanish at screen edges.

  Bake orientation into the geometry, not into the instance matrices. A `PlaneGeometry` faces +Z;
  instancing it with translation-only matrices leaves every copy standing upright, which is how a
  set of flat decals ends up as billboards hovering over the surface they were meant to be printed
  on. `geometry.rotateX(-Math.PI / 2)` once beats rotating 10,000 matrices every frame.
- **`mergeGeometries`** (`three/addons/utils/BufferGeometryUtils.js`) for many *different* static
  geometries sharing a material. One mesh, one call. The trade-off is you lose per-object
  transforms and per-object frustum culling.
- **Share materials.** Two meshes with identical materials still cost two draw calls, but they
  avoid a shader recompile and a state change each. Never construct a material inside a loop or a
  React render.
- **Watch the model.** A glTF from Blender often arrives as fifty separate meshes with fifty
  material slots. `gltf-transform` can dedupe and join them.

## 3. Stop rendering when nothing changes

A product viewer that sits idle 95% of the time should not run the GPU at 60fps.

```jsx
<Canvas frameloop="demand">
```

R3F then renders only when `invalidate()` is called — drei's controls, prop changes, and
`useFrame`-free interactions all trigger it. In vanilla, gate `renderer.render()` on a dirty flag
set by controls and animations. Also pause on `document.hidden` and when the canvas scrolls out of
view via `IntersectionObserver`; a background tab still burns battery otherwise.

## 4. Watch the JavaScript, not just the assets

Three.js plus R3F, drei, and postprocessing is already 300–400 KB gzipped before your own code, so
a careless import is easy to miss against that baseline.

The one that bites: `import * as pkg from 'big-icon-or-asset-library'` defeats tree-shaking
entirely and pulls in the whole package — a namespace import of `simple-icons` for 25 logos ships
all ~3200 of them, turning a 1.3 MB bundle into 6.6 MB. Use named imports so the bundler can drop
what you do not reference, and check `dist/` after a build rather than trusting it.

Lazy-load the 3D itself when it is below the fold or behind an interaction: a dynamic `import()`
of the canvas component keeps Three out of the initial bundle entirely, which matters more for
first paint than anything inside the scene.

## 5. Compress assets

Download size and VRAM are different problems and need different tools.

```bash
npx @gltf-transform/cli optimize in.glb out.glb --texture-compress ktx2
```

That one command does most of it: dedupes, prunes unused nodes, joins meshes, resizes and
compresses textures, and applies Draco.

- **KTX2 / Basis is the important one.** A 2048² PNG is ~16 MB in VRAM no matter how small the
  file compresses to on disk, because the GPU stores it uncompressed. KTX2 stays compressed in
  VRAM — roughly 4–8x less memory, and it uploads faster. This is what fixes "the page loads fine
  then everything stalls".
- **Draco** shrinks geometry for transfer only; it decompresses to full size in VRAM. Real win on
  download, none on memory, plus a decoder to load.
- **Texture size is the usual culprit.** A 4096² normal map on an object that occupies 200px of
  screen is pure waste. 1024² covers most web work; 2048² for a hero close-up.
- **Power-of-two dimensions** so mipmaps generate properly. Blurry, shimmering textures in motion
  usually means mipmapping is off or the texture is NPOT.

## 6. Degrade adaptively

Ship one experience that measures the device rather than two experiences behind a guess.

```jsx
<PerformanceMonitor onDecline={() => setQuality('low')}>
  <AdaptiveDpr pixelated />
</PerformanceMonitor>
```

Drop in this order, because it matches what users actually notice: post-processing effects first,
then shadow map resolution, then DPR, then particle counts and geometry detail. Never drop the
thing the concept is about.

Do not branch on user agent. A modern phone often outruns an old laptop.

## Fill-rate specifics

- **Post-processing** renders the full screen once per pass. Three effects at DPR 2 is three
  full-resolution passes. Combine them in one `EffectComposer` from the `postprocessing` library,
  which merges compatible effects into a single shader, rather than chaining separate passes.
- **Transparency is expensive and unsorted.** Overlapping transparent surfaces multiply fill cost
  and produce sorting artifacts. `depthWrite: false` fixes most sorting glitches on particles.
  Where you can, use alpha-tested cutout (`alphaTest: 0.5`) instead of blending.
- **Transmission materials render the scene an extra time.** A few are fine. Do not build a wall
  of glass.
- **Shadows** cost a full extra render per shadow-casting light. One shadow-casting light is the
  budget for most web scenes. `light.shadow.autoUpdate = false` with a manual `needsUpdate` is
  free for static scenes. `<ContactShadows>` or a baked shadow plane is a fraction of the price.

## Disposal

Three does not free GPU memory when JavaScript drops the reference. Removing a mesh from the scene
does nothing to VRAM.

```js
geometry.dispose();
material.dispose();
texture.dispose();
renderTarget.dispose();
```

R3F disposes what it created from JSX automatically. It cannot dispose what you built
imperatively — anything from `useMemo`, a hand-made render target, a texture from a raw loader.
Those need an explicit cleanup in `useEffect`. Watch `renderer.info.memory` across route changes:
if geometries or textures only ever climb, you have a leak, and the eventual symptom is a browser
killing the WebGL context and the canvas going black.

## Fast checklist

| Symptom | Look at |
| --- | --- |
| Hot phone, fine on desktop | DPR cap, then post-processing passes |
| Frame rate scales with window size | Fill rate: post, transparency, shadows |
| Frame rate ignores window size | Draw calls, per-frame allocations |
| Stutters every few seconds | Garbage collection — you are allocating in the loop |
| Long freeze on load | Shader compilation. Warm up with `renderer.compileAsync(scene, camera)` |
| Slowly degrades over minutes | Missing disposal, or an event listener added per frame |
| Fine until you add one model | Draw-call explosion from an unmerged glTF |
