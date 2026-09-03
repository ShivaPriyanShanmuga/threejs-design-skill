# React Three Fiber

R3F is Three.js expressed as a React tree. Every JSX element maps to a Three constructor —
`<mesh>` is `new THREE.Mesh()`, `<meshStandardMaterial roughness={0.3} />` sets `.roughness` on a
`MeshStandardMaterial`. There is no wrapper API to learn: Three's docs are R3F's docs.

## Install

```bash
npm i three @react-three/fiber @react-three/drei
npm i @react-three/postprocessing   # only if you actually need post
npm i -D @types/three               # TypeScript
```

Version pairing matters. R3F v8 targets React 18; R3F v9 targets React 19. Mismatching them
produces reconciler errors that read as nonsense. Check `react`'s major version first, then
install the matching R3F.

## The Canvas

```jsx
<Canvas
  camera={{ fov: 35, position: [0, 0, 6], near: 0.1, far: 100 }}
  dpr={[1, 2]}
  gl={{ antialias: true, powerPreference: 'high-performance' }}
>
```

- **`fov: 35`.** The default is 75, a wide-angle lens that bows edges and distends whatever is
  closest to camera. 35 is a portrait lens and is most of what "looks photographic" means. Push
  the camera back to reframe.
- **`dpr={[1, 2]}`** caps device pixel ratio at 2. Declare it explicitly even though R3F's
  default is sensible — it documents the intent and survives refactors.
- R3F already sets `outputColorSpace` to sRGB and `toneMapping` to `ACESFilmicToneMapping`. Do
  not "fix" those. The `flat` prop disables tone mapping — only use it if you are tone mapping in
  the effect chain instead.
- The canvas is transparent by default, so the page background shows through. That is usually
  what you want: style the background in CSS where the rest of your design system lives.
- `<Canvas shadows>` enables the shadow map. Leave it off if nothing casts.

## The loop

`useFrame` runs every frame with the render state and the delta since the last one. Multiply
every rate by `delta` or your animation runs at a different speed on a 120 Hz display.

```jsx
function Blob() {
  const ref = useRef();
  useFrame((state, delta) => {
    ref.current.rotation.y += delta * 0.15;                  // rate × delta
    const target = state.pointer.x * 0.2;
    ref.current.rotation.z = damp(ref.current.rotation.z, target, 3, delta);
  });
  return <mesh ref={ref}>{/* ... */}</mesh>;
}
```

`damp` is `THREE.MathUtils.damp(current, target, lambda, delta)` — an exponential approach that
is frame-rate independent, unlike `lerp(a, b, 0.1)`. Lambda is a rate, not a fraction: 2–4 feels
heavy and luxurious, 6–10 feels responsive, above 15 is nearly instant. `damp3` and `dampE` in
`maath/easing` do the same for vectors and euler angles.

`state.pointer` is already normalised to −1..1 with y up. Do not recompute it from
`clientX / innerWidth`, and do not attach your own mousemove listener.

**Never call `setState` inside `useFrame`.** That re-renders the React tree 60 times a second and
will destroy the frame rate. Mutate refs. React state is for things that change on interaction —
which model is selected, which colorway — not for per-frame values.

## Things that quietly cost you frames

```jsx
// Wrong: a new object every render, and React can't tell it changed
<mesh position={[0, Math.sin(t), 0]} />

// Wrong: new geometry and material on every render
const geo = new THREE.SphereGeometry(1, 64, 64);

// Right: memoise anything constructed imperatively
const geo = useMemo(() => new THREE.SphereGeometry(1, 64, 64), []);
const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
useFrame((_, d) => { ref.current.material.uniforms.uTime.value += d; });  // see below
```

Declarative primitives (`<sphereGeometry args={[1, 64, 64]} />`) are already memoised by R3F on
their `args` array, so prefer them. Reach for `useMemo` when you have to build something
imperatively.

**Animate uniforms through the material, not through the object you passed in.** This one is
nasty because it fails silently and looks like it works:

```jsx
const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
// WRONG: R3F does not keep this object's identity
useFrame((_, d) => { uniforms.uTime.value += d; });
return <mesh ref={ref}><shaderMaterial uniforms={uniforms} /></mesh>;
```

Passing `uniforms` to the JSX prop does not guarantee `material.uniforms` *is* that object — in
R3F v9 it is not, and `material.uniforms === uniforms` returns false. Every write lands on an
orphan, the shader keeps its initial values forever, and nothing errors. A scene animated by
`uTime` simply sits frozen, which is easy to miss when the mesh is also rotating: the object
moves, so the page looks alive while the shader has not advanced a frame.

Two fixes. Read the uniforms back off the material, which cannot go stale:

```jsx
useFrame((_, d) => { ref.current.material.uniforms.uTime.value += d; });
```

Or build the material imperatively and hand it over by reference, which does preserve identity:

```jsx
const material = useMemo(() => new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms }), []);
return <points geometry={geometry} material={material} />;
```

To check which you have, log `mesh.current.material.uniforms === uniforms` once. If it is false and
you are mutating the local object, your shader is frozen.

## drei, in rough order of usefulness

```jsx
import { Environment, ContactShadows, Float, useGLTF, OrbitControls } from '@react-three/drei';
```

- **`<Environment />`** — the single most valuable component here. `preset="city"` (also
  `studio`, `sunset`, `dawn`, `warehouse`, `night`) gives you an HDRI in one line. Presets are
  fetched from a CDN at runtime, so for production or offline builds pass `files="/env/x.hdr"`
  and self-host. `<Environment preset="studio" environmentIntensity={0.6} />` dials it down.
  Without `background`, it lights but does not show — normally what you want.
- **`<ContactShadows />`** — a cheap blurred ground shadow. Usually looks better than a real
  shadow map for a single hero object, and costs far less.
- **`<Float speed={1.5} rotationIntensity={0.4} floatIntensity={0.6} />`** — gentle idle motion.
  Keep the values low; the default reads as bobbing.
- **`<MeshTransmissionMaterial />`** — better-looking glass than core `transmission`, with
  chromatic dispersion and controllable blur. Expensive: it re-renders the scene into a buffer.
- **`<useGLTF />` / `useTexture` / `useFBX`** — suspense-based loaders. Call
  `useGLTF.preload('/model.glb')` at module scope to start the fetch before render.
- **`<Html />`** — DOM elements positioned in 3D space. Good for labels and hotspots; bad for
  body copy, which belongs in real DOM outside the canvas.
- **`<PerformanceMonitor>` and `<AdaptiveDpr pixelated />`** — automatic quality degradation.
- **`<OrbitControls makeDefault enableDamping />`** — for viewers. `makeDefault` lets other drei
  components find it. Constrain `minPolarAngle` / `maxPolarAngle` so users cannot orbit under the
  floor, and `minDistance` / `maxDistance` so they cannot fly into the geometry.

## Canvas behind DOM text

The common hero layout. Keep the text in real DOM — it stays selectable, accessible, and
crisp — and put the canvas behind it:

```jsx
<section style={{ position: 'relative', minHeight: '100vh' }}>
  <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
    <Canvas /* ... */ />
  </div>
  <div style={{ position: 'relative', zIndex: 1, pointerEvents: 'none' }}>
    <h1>…</h1>
  </div>
</section>
```

`pointerEvents: 'none'` on the text layer lets mouse interaction reach the canvas; re-enable it
on the individual links. If the 3D competes with the copy, the fix is contrast and speed, not
size: desaturate it, slow it down, or drop its opacity — never make the type heavier to win.

## Loading

```jsx
<Suspense fallback={null}>
  <Model />
</Suspense>
```

`fallback={null}` renders nothing until ready. A `<Html>` spinner inside `Suspense` works but
flashes on fast connections. `useProgress` from drei drives a real loading bar. Put `<Suspense>`
around the loading components inside `<Canvas>`, not around the `<Canvas>` itself, so the canvas
mounts and sizes immediately.

## Disposal

R3F automatically disposes geometries, materials, and textures it created from JSX when a
component unmounts. It cannot dispose what you created imperatively — anything from `useMemo`, a
manual `new THREE.WebGLRenderTarget()`, a texture from a raw loader. Clean those up yourself:

```jsx
useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
```

Set `dispose={null}` on objects you intend to reuse across mounts, so R3F leaves them alone.

## Static scenes

If nothing moves until the user does something, do not render 60 times a second:

```jsx
<Canvas frameloop="demand">
```

Then call `invalidate()` (from `useThree`) whenever something changes. `OrbitControls` and other
drei components already call it. This takes a product viewer from constant GPU load to almost
nothing while idle — see `performance.md`.
