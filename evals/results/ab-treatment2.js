/**
 * Hero — a single turned-metal form on a dark studio sweep.
 *
 * Vanilla Three.js, ES modules, Vite (`npm i three`). Everything below the canvas
 * is self-contained: the scene paints its own gradient backdrop, so the canvas sits
 * at `z-index: 0` and never depends on the page's `html` background showing through.
 *
 * Mounting: append into `[data-hero-canvas]` if present, else <body>.
 * Page content must sit above it, e.g. `.hero__content { position: relative; z-index: 1 }`.
 *
 * Look pipeline, in the order that matters: colour → environment → lights → material → post.
 */

import * as THREE from 'three';
import { Timer } from 'three/addons/misc/Timer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/* ------------------------------------------------------------------ *
 * Tuning
 * ------------------------------------------------------------------ */

const CONFIG = {
  exposure: 1.05, // master brightness dial — move this, never light intensities
  spin: 0.1, // rad/s, slow enough to read as weight rather than a loop
  parallax: { x: 0.6, y: 0.32, lambda: 2.4 }, // ~0.4s settle
  bloom: { strength: 0.42, radius: 0.65, threshold: 0.9 }, // only true highlights bloom
  grain: 0.032,
  vignette: 0.55,
};

const reducedMotion =
  typeof matchMedia === 'function' &&
  matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------ *
 * Canvas + renderer
 * ------------------------------------------------------------------ */

const mount = document.querySelector('[data-hero-canvas]') ?? document.body;

const canvas = document.createElement('canvas');
Object.assign(canvas.style, {
  position: 'fixed',
  top: '0',
  left: '0',
  width: '100%',
  height: '100%',
  display: 'block',
  zIndex: '0', // opaque canvas, so no negative z-index games with the html background
  pointerEvents: 'none',
});
mount.appendChild(canvas);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // capped: a 3x phone would render 9x the pixels
renderer.setSize(viewportWidth(), viewportHeight(), false); // false — CSS owns the element's size
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0; // ramped up by the intro
renderer.shadowMap.enabled = true; // PCFShadowMap default is the right one
// outputColorSpace is already sRGB since r152 — leave it alone.

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(35, viewportWidth() / viewportHeight(), 0.1, 120);
const cameraHome = new THREE.Vector3(0, 0.35, 7.6);
const lookTarget = new THREE.Vector3(0.38, 0.02, 0);

/* ------------------------------------------------------------------ *
 * Backdrop — a gradient sweep with a soft pool of light behind the subject
 * ------------------------------------------------------------------ */

scene.background = makeBackdropTexture();

function makeBackdropTexture() {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');

  const sweep = ctx.createLinearGradient(0, 0, 0, size);
  sweep.addColorStop(0, '#0c0e13');
  sweep.addColorStop(0.55, '#07080b');
  sweep.addColorStop(1, '#040406');
  ctx.fillStyle = sweep;
  ctx.fillRect(0, 0, size, size);

  const glow = ctx.createRadialGradient(
    size * 0.62, size * 0.5, 0,
    size * 0.62, size * 0.5, size * 0.62,
  );
  glow.addColorStop(0, 'rgba(126,146,182,0.17)');
  glow.addColorStop(0.45, 'rgba(58,70,94,0.07)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; // this one is a picture, so it gets tagged
  return tex;
}

/* ------------------------------------------------------------------ *
 * Environment BEFORE lights — metal needs a room to reflect
 * A hand-built dark studio: near-black shell, a warm key softbox camera-right,
 * a cool bounce camera-left, an overhead strip, and a low warm kicker.
 * ------------------------------------------------------------------ */

scene.environment = buildStudioEnvironment();
if ('environmentIntensity' in scene) scene.environmentIntensity = 1.0;
if (scene.environmentRotation) scene.environmentRotation.y = 0.4;

function buildStudioEnvironment() {
  const env = new THREE.Scene();
  const panel = new THREE.PlaneGeometry(1, 1);
  const disposables = [panel];

  const shellMat = new THREE.MeshBasicMaterial({ color: 0x05060a, side: THREE.BackSide });
  const shellGeo = new THREE.BoxGeometry(34, 34, 34);
  env.add(new THREE.Mesh(shellGeo, shellMat));
  disposables.push(shellGeo, shellMat);

  // HDR emitters: colour values above 1 are what make this a light source, not a grey card.
  const light = (w, h, pos, hex, intensity) => {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(hex).multiplyScalar(intensity),
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(panel, mat);
    mesh.scale.set(w, h, 1);
    mesh.position.set(...pos);
    mesh.lookAt(0, 0, 0);
    env.add(mesh);
    disposables.push(mat);
  };

  light(9, 15, [8.0, 3.5, 3.0], 0xfff3e4, 4.4); // key softbox
  light(7, 13, [-8.5, 1.6, -3.6], 0x8fb4ff, 2.6); // cool separation
  light(15, 5, [0, 9.5, -1.5], 0xffffff, 1.1); // overhead strip
  light(5, 3.5, [-2.0, -4.2, 6.5], 0xff9a5a, 1.1); // low warm kicker

  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(env, 0.02).texture;
  pmrem.dispose();
  for (const d of disposables) d.dispose();

  return texture;
}

/* ------------------------------------------------------------------ *
 * Stage — subject, floor, lights. Moved as one unit when reframing.
 * ------------------------------------------------------------------ */

const stage = new THREE.Group();
scene.add(stage);

const FLOOR_Y = -1.15;
const HOVER = 0.09; // the subject sits just off the sweep, so the shadow reads as its own shape

// --- the subject: a lathe-turned form, splined so the silhouette has no facets
const profile = [
  new THREE.Vector2(0.520, -1.150),
  new THREE.Vector2(0.545, -1.050),
  new THREE.Vector2(0.500, -0.800),
  new THREE.Vector2(0.415, -0.420),
  new THREE.Vector2(0.375, -0.020),
  new THREE.Vector2(0.415, 0.360),
  new THREE.Vector2(0.515, 0.740),
  new THREE.Vector2(0.545, 1.000),
  new THREE.Vector2(0.465, 1.180),
  new THREE.Vector2(0.295, 1.300),
  new THREE.Vector2(0.115, 1.360),
];
const silhouette = [
  new THREE.Vector2(0.0005, FLOOR_Y), // flat foot, kept crisp outside the spline
  ...new THREE.SplineCurve(profile).getPoints(160),
  new THREE.Vector2(0.0005, 1.378), // closed cap
];

const bodyGeometry = new THREE.LatheGeometry(silhouette, 256);

const bodyMaterial = new THREE.MeshPhysicalMaterial({
  color: 0x8d9199, // cool steel
  metalness: 1.0,
  roughness: 0.34, // multiplied by the map below → ~0.24 effective. Never 0: a mirror with nothing to reflect reads as grey plastic
  roughnessMap: makeBrushedRoughnessMap(),
  anisotropy: 0.4, // turning marks run around the axis, i.e. along U — the default direction
  envMapIntensity: 1.15,
});

const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
body.castShadow = true;
body.position.y = HOVER;
body.rotation.z = -0.05; // a hair off-axis; perfectly upright reads as CAD
stage.add(body);

function makeBrushedRoughnessMap() {
  const s = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#b4b4b4';
  ctx.fillRect(0, 0, s, s);

  // broad tonal bands: where the surface polishes unevenly
  for (let i = 0; i < 48; i++) {
    const y = Math.random() * s;
    const h = 6 + Math.random() * 60;
    const a = 0.015 + Math.random() * 0.05;
    ctx.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`;
    ctx.fillRect(0, y, s, h);
  }
  // fine lathe streaks
  for (let i = 0; i < 2600; i++) {
    const y = Math.random() * s;
    const h = 0.5 + Math.random() * 2;
    const a = 0.02 + Math.random() * 0.1;
    ctx.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`;
    ctx.fillRect(0, y, s, h);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 1);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  // colorSpace stays NoColorSpace — this is data, not colour. Tagging it sRGB is
  // the classic "why is my metal plasticky" bug.
  return tex;
}

// --- floor: a pool of light for the subject to stand in, plus a shadow catcher
const floorGlow = new THREE.Mesh(
  new THREE.CircleGeometry(3.6, 96),
  new THREE.MeshBasicMaterial({
    map: makeRadialFalloffTexture(),
    color: 0x2b323d,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: true,
  }),
);
floorGlow.rotation.x = -Math.PI / 2;
floorGlow.position.y = FLOOR_Y - 0.004;
floorGlow.renderOrder = 0;
stage.add(floorGlow);

const shadowCatcher = new THREE.Mesh(
  new THREE.PlaneGeometry(24, 24),
  new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.62 }),
);
shadowCatcher.rotation.x = -Math.PI / 2;
shadowCatcher.position.y = FLOOR_Y;
shadowCatcher.receiveShadow = true;
shadowCatcher.material.depthWrite = false;
shadowCatcher.renderOrder = 1;
stage.add(shadowCatcher);

function makeRadialFalloffTexture() {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// --- lights, after the environment, purely to carve shape
const key = new THREE.DirectionalLight(0xfff1dd, 3.1);
key.position.set(4.5, 6.5, 3.5);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 2;
key.shadow.camera.far = 18;
key.shadow.camera.left = -2.2; // tight to the subject — a 10-unit default box wastes the whole map
key.shadow.camera.right = 2.2;
key.shadow.camera.top = 2.6;
key.shadow.camera.bottom = -2.6;
key.shadow.normalBias = 0.02; // acne fix without peter-panning
stage.add(key, key.target);

const rim = new THREE.DirectionalLight(0x9dc4ff, 2.0);
rim.position.set(-5.2, 2.2, -4.4); // behind, cool — peels the silhouette off the backdrop
stage.add(rim, rim.target);

const kicker = new THREE.PointLight(0xffb27a, 14, 10, 2); // r155+ units: inverse-square, so this is not "14 of the old 1"
kicker.position.set(-1.9, -0.5, 2.6);
stage.add(kicker);

/* ------------------------------------------------------------------ *
 * Post — seasoning only: threshold bloom, vignette, grain
 * ------------------------------------------------------------------ */

const composer = new EffectComposer(
  renderer,
  new THREE.WebGLRenderTarget(viewportWidth(), viewportHeight(), {
    type: THREE.HalfFloatType, // keep highlights above 1.0 alive for bloom
    samples: 4, // MSAA, which the composer would otherwise bypass
  }),
);
composer.addPass(new RenderPass(scene, camera));

const bloom = new UnrealBloomPass(
  new THREE.Vector2(viewportWidth(), viewportHeight()),
  CONFIG.bloom.strength,
  CONFIG.bloom.radius,
  CONFIG.bloom.threshold,
);
composer.addPass(bloom);

composer.addPass(new OutputPass()); // tone mapping + sRGB happen here, once

const filmPass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uVignette: { value: CONFIG.vignette },
    uGrain: { value: CONFIG.grain },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uVignette;
    uniform float uGrain;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);

      // lens vignette, aspect-corrected so it stays circular
      vec2 d = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
      float v = smoothstep(0.92, 0.28, length(d));
      color.rgb *= mix(1.0 - uVignette, 1.0, v);

      // grain: reads as film, and dithers away 8-bit banding in the backdrop
      float n = hash(vUv * uResolution + fract(uTime) * 1000.0);
      color.rgb += (n - 0.5) * uGrain;

      gl_FragColor = color;
    }
  `,
});
composer.addPass(filmPass);

/* ------------------------------------------------------------------ *
 * Framing + resize
 * ------------------------------------------------------------------ */

function viewportWidth() {
  return canvas.clientWidth || window.innerWidth;
}
function viewportHeight() {
  return canvas.clientHeight || window.innerHeight;
}

// Portrait screens get the subject centred and a little further away.
function applyFraming(aspect) {
  const narrow = aspect < 0.95;
  stage.position.x = narrow ? 0 : 1.05;
  lookTarget.set(narrow ? 0 : 0.38, narrow ? 0.05 : 0.02, 0);
  cameraHome.set(0, narrow ? 0.5 : 0.35, narrow ? 9.4 : 7.6);
}

function resize() {
  const w = viewportWidth();
  const h = viewportHeight();
  if (w === 0 || h === 0) return;

  camera.aspect = w / h;
  camera.updateProjectionMatrix(); // aspect alone does nothing
  applyFraming(camera.aspect);

  // Re-apply DPR: dragging the window to another monitor changes it with no other event.
  const dpr = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  composer.setPixelRatio?.(dpr);
  composer.setSize(w, h);
  filmPass.uniforms.uResolution.value.set(w * dpr, h * dpr);
}

// ResizeObserver on the canvas, not the window resize event: it ignores the
// mobile URL-bar collapse that makes window resize fire mid-scroll.
const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(canvas);
resize();

/* ------------------------------------------------------------------ *
 * Input — damped, never tracked directly
 * ------------------------------------------------------------------ */

const pointerTarget = new THREE.Vector2(0, 0);
const pointer = new THREE.Vector2(0, 0);

function onPointerMove(e) {
  pointerTarget.set(
    (e.clientX / window.innerWidth) * 2 - 1,
    (e.clientY / window.innerHeight) * 2 - 1,
  );
}
function onPointerLeave() {
  pointerTarget.set(0, 0);
}
if (!reducedMotion) {
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerout', onPointerLeave, { passive: true });
  window.addEventListener('blur', onPointerLeave);
}

// Stop rendering when the hero scrolls away (only meaningful when mounted in a section).
let onScreen = true;
let visibilityObserver = null;
if (mount !== document.body) {
  visibilityObserver = new IntersectionObserver(
    ([entry]) => { onScreen = entry.isIntersecting; },
    { threshold: 0 },
  );
  visibilityObserver.observe(mount);
}

/* ------------------------------------------------------------------ *
 * Loop
 * ------------------------------------------------------------------ */

const timer = new Timer();
timer.connect(document); // zero delta while hidden — otherwise a backgrounded tab returns one huge delta

let intro = 0; // 0 → 1, drives the exposure ramp and the opening dolly

function tick(timestamp) {
  timer.update(timestamp);
  const dt = timer.getDelta();
  const t = timer.getElapsed();

  if (!onScreen) return;

  intro = THREE.MathUtils.damp(intro, 1, 1.5, dt);
  renderer.toneMappingExposure = CONFIG.exposure * intro;

  if (!reducedMotion) {
    pointer.x = THREE.MathUtils.damp(pointer.x, pointerTarget.x, CONFIG.parallax.lambda, dt);
    pointer.y = THREE.MathUtils.damp(pointer.y, pointerTarget.y, CONFIG.parallax.lambda, dt);
  }

  camera.position.set(
    cameraHome.x + pointer.x * CONFIG.parallax.x,
    cameraHome.y - pointer.y * CONFIG.parallax.y,
    cameraHome.z + (1 - intro) * 1.6, // dolly in on load
  );
  camera.lookAt(lookTarget);

  body.rotation.y += dt * (reducedMotion ? CONFIG.spin * 0.25 : CONFIG.spin);
  if (!reducedMotion) {
    // two incommensurate sines: drift that never visibly repeats
    body.position.y = HOVER + Math.sin(t * 0.27) * 0.03 + Math.sin(t * 0.11) * 0.02;
    body.rotation.z = -0.05 + pointer.x * 0.02;
  }

  // Rotating the environment slides the specular bands across the metal —
  // more flattering than moving a light, and cheaper.
  if (scene.environmentRotation) {
    scene.environmentRotation.y = 0.4 + t * (reducedMotion ? 0 : 0.03);
  }

  filmPass.uniforms.uTime.value = t;
  composer.render();
}

renderer.setAnimationLoop(tick);

/* ------------------------------------------------------------------ *
 * Teardown — the GPU frees nothing when you drop a reference
 * ------------------------------------------------------------------ */

export function dispose() {
  renderer.setAnimationLoop(null);
  resizeObserver.disconnect();
  visibilityObserver?.disconnect();
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerout', onPointerLeave);
  window.removeEventListener('blur', onPointerLeave);
  timer.disconnect?.();

  scene.traverse((o) => {
    o.geometry?.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
      m.dispose();
    }
  });
  scene.background?.dispose?.();
  scene.environment?.dispose?.();

  composer.dispose?.();
  renderer.dispose();
  renderer.forceContextLoss(); // browsers cap live WebGL contexts at ~8–16
  canvas.remove();
}

// Vite HMR: without this, every hot reload leaks a context until the scene goes black.
if (import.meta.hot) import.meta.hot.dispose(dispose);
