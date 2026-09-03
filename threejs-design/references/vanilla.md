# Vanilla Three.js + Vite

For pages that are not React, or where you want direct control of the render loop. Everything in
`materials-lighting.md`, `shaders.md`, `scroll-motion.md`, and `performance.md` applies
unchanged — this file is only the plumbing.

## Setup

```bash
npm create vite@latest my-scene -- --template vanilla
cd my-scene && npm i three
```

Vite handles ES modules and `three/addons/*` with no config. Use the `three/addons/` alias rather
than the older `three/examples/jsm/` path — it is the supported public entry point and shorter:

```js
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
```

Never load Three from a CDN alongside a bundled copy. Two instances of the library means
`instanceof` checks fail and materials silently refuse to work.

## The boilerplate, with the defaults already right

```js
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const canvas = document.querySelector('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));   // cap at 2
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
// outputColorSpace is already SRGBColorSpace since r152 — do not set it back to Linear

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  35,                                        // not 75 — see materials-lighting.md
  window.innerWidth / window.innerHeight,
  0.1,
  100,                                       // keep near:far under ~10000:1 to avoid z-fighting
);
camera.position.set(0, 0, 6);

// Environment before lights. Always.
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();
```

`antialias: true` gives you MSAA — but only when rendering straight to the screen. The moment you
add an `EffectComposer`, MSAA is bypassed and you need an SMAA pass or a multisampled render
target instead.

## Resize

Resize handling is where vanilla scenes most often break: forget it and the scene stretches on
rotate, or stays blurry on a retina display.

```js
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();          // required — aspect alone does nothing
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  composer?.setSize(w, h);                  // composers need it separately
}
window.addEventListener('resize', onResize);
```

Re-apply `setPixelRatio` on resize: dragging a window between a laptop screen and an external
monitor changes `devicePixelRatio` without any other event. On mobile, prefer a `ResizeObserver`
on the container over the `resize` event, which also fires when browser chrome hides on scroll
and causes a visible jump.

## The loop

```js
const timer = new THREE.Timer();
timer.connect(document);        // Page Visibility API — see below

function tick(timestamp) {
  timer.update(timestamp);
  const delta = timer.getDelta();
  const elapsed = timer.getElapsed();

  mesh.rotation.y += delta * 0.15;
  material.uniforms.uTime.value = elapsed;

  renderer.render(scene, camera);
}
renderer.setAnimationLoop(tick);
```

`Timer` replaces `Clock`, which is deprecated as of r185, and it fixes two real problems.
`update()` samples the time once per frame, so `getDelta()` returns the same value no matter how
many times it is read — with `Clock`, a second call in the same frame returns nearly zero, and
whichever system read it second silently stops moving. And `connect(document)` reports a zero
delta while the tab is hidden: without that, returning to a backgrounded tab hands you the entire
time away as a single delta and everything integrating it jumps across the screen.

`Timer` lives in the core namespace — `THREE.Timer`, from the same `import * as THREE from 'three'`
you already have. Do **not** import it from `three/addons/misc/Timer.js`: it was moved out of
addons, that path no longer resolves on current versions, and the failure is a build error rather
than a runtime one. If you are on a version old enough that `THREE.Timer` is undefined, stay on
`Clock` and clamp by hand: `Math.min(clock.getDelta(), 0.1)`.

Allocate nothing inside the loop. `new THREE.Vector3()` per frame is 60 allocations a second
feeding the garbage collector, which is a large share of "janky but the frame rate looks fine".
Hoist scratch vectors to module scope and reuse them.

`renderer.setAnimationLoop(tick)` rather than a bare `requestAnimationFrame`: it is the same
thing on the desktop, it is required for WebXR, and it stops cleanly with
`renderer.setAnimationLoop(null)` — which you want on teardown.

## Loading models

```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

const draco = new DRACOLoader().setDecoderPath('/draco/');   // copy from node_modules/three/examples/jsm/libs/draco/
const ktx2 = new KTX2Loader().setTranscoderPath('/basis/').detectSupport(renderer);

const loader = new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2);
loader.load('/model.glb', (gltf) => scene.add(gltf.scene));
```

`detectSupport(renderer)` is required for KTX2 — it picks the GPU's native texture format. Skip
it and decoding fails at runtime. GLTFLoader tags every texture's color space correctly, which is
a good reason to ship glTF rather than loose textures.

## Structure

Once past a hundred lines, split by concern rather than by object: a module that builds and
returns the renderer/scene/camera, one per meaningful scene element exposing `{ object, update(delta) }`,
and a small loop that calls each `update`. Keep a single `Timer` and a single animation loop for
the whole app — multiple loops fight each other and double the cost.

For a hero canvas behind page content, size the canvas with CSS (`position: fixed; inset: 0;
z-index: -1`) rather than JavaScript, and let the resize handler only update the camera and
renderer.

## Teardown

Three does not free GPU resources when you drop a reference. If the scene mounts and unmounts —
a route change, a modal — you must dispose explicitly:

```js
function dispose() {
  scene.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
        m.dispose();
      }
    }
  });
  renderer.dispose();
  renderer.forceContextLoss();          // frees the WebGL context itself
  window.removeEventListener('resize', onResize);
}
```

Browsers cap you at roughly 8–16 live WebGL contexts. Leak them across route changes and the
oldest context is killed, which looks like the scene randomly turning black.
