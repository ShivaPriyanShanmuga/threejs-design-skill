/**
 * Hero — "Turned Vessel"
 *
 * A single machined-aluminium form, lit like a product still: a dimmed studio
 * environment for the reflections, one warm shadowed key, one cool softbox
 * whose reflection reads as a vertical streak down the metal, and a cool back
 * rim to cut the subject out of the dark.
 *
 * Vanilla Three.js, ES modules, Vite (`npm i three`). No external assets — the
 * environment, the backdrop and the brushed-roughness map are all generated at
 * runtime.
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/* ------------------------------------------------------------------ *
 * Art direction
 * ------------------------------------------------------------------ */

// Hex, so THREE.Color does the sRGB -> linear conversion. Authoring these as
// raw floats would land a "nearly black" 0.08 somewhere around mid grey.
const LOOK = {
  ink: 0x05060a, // the dark everything falls off into
  key: 0xffe6c8, // tungsten
  panel: 0xdce8ff, // daylight softbox
  rim: 0x93b8ff, // cool separation
  metal: 0xb7bac2, // raw aluminium, very slightly cool
  floor: 0x0a0b0e,
  exposure: 1.05,
  envIntensity: 0.32, // the studio is dimmed, not removed — the cheapest mood dial there is
};

const MOTION = {
  spin: 0.11, // rad/s — weight, not a loop
  envSpin: 0.045, // rad/s — slides the specular across the metal
  bobAmplitude: 0.035,
  bobRate: 0.42,
  parallax: new THREE.Vector2(0.38, 0.24),
  parallaxLambda: 2.2, // ~0.45s to settle, never tracking the cursor directly
};

/* ------------------------------------------------------------------ *
 * Canvas + renderer
 * ------------------------------------------------------------------ */

const canvas = document.querySelector('#hero-canvas') ?? mountCanvas();

function mountCanvas() {
  const el = document.createElement('canvas');
  el.id = 'hero-canvas';
  // A hero canvas is sized by CSS and sits behind the page copy; JS only ever
  // updates the camera and the drawing buffer.
  Object.assign(el.style, {
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    display: 'block',
    zIndex: '-1',
  });
  document.body.appendChild(el);
  return el;
}

const renderer = new THREE.WebGLRenderer({
  canvas,
  // antialias:true only buys MSAA when rendering straight to the screen, and
  // the composer bypasses it — a multisampled render target does the job below.
  antialias: false,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // capped: a 3x phone would otherwise render 9x the pixels
renderer.setSize(canvas.clientWidth || 1, canvas.clientHeight || 1, false); // false: CSS owns layout
renderer.toneMapping = THREE.ACESFilmicToneMapping; // AgX if the speculars ever clip; exposure stays the master dial
renderer.toneMappingExposure = LOOK.exposure;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoft is deprecated and silently falls back to this anyway

/* ------------------------------------------------------------------ *
 * Scene + camera
 * ------------------------------------------------------------------ */

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(LOOK.ink, 0.042); // the floor dissolves instead of ending
scene.background = makeBackdropTexture();
scene.backgroundIntensity = 0.9;

const camera = new THREE.PerspectiveCamera(
  35, // a portrait lens — 75 bows straight edges and balloons whatever is nearest
  1, // set for real in resize()
  0.1,
  100,
);
const CAMERA_HOME = new THREE.Vector3(0.15, 1.35, 6.6);
camera.position.copy(CAMERA_HOME);

const lookTarget = new THREE.Vector3(0, 1.05, 0);
camera.lookAt(lookTarget);

// Environment before a single light. With nothing to reflect, metal is grey.
const pmrem = new THREE.PMREMGenerator(renderer);
const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
scene.environment = envRT.texture;
scene.environmentIntensity = LOOK.envIntensity;
pmrem.dispose();

/**
 * A soft pool of light behind the subject. Generated, so it costs no request,
 * and tagged sRGB because it is a picture — the tag a data map must never get.
 */
function makeBackdropTexture() {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');

  const g = ctx.createRadialGradient(
    size * 0.5,
    size * 0.58,
    16,
    size * 0.5,
    size * 0.58,
    size * 0.78,
  );
  g.addColorStop(0.0, '#1a1f27');
  g.addColorStop(0.45, '#0c0f14');
  g.addColorStop(1.0, '#040508');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ------------------------------------------------------------------ *
 * Lights — after the environment, and only for shape
 * ------------------------------------------------------------------ */

RectAreaLightUniformsLib.init(); // required before any RectAreaLight is shaded

// Key: warm, high front-left, the only caster. Intensity is candela and falls
// off with distance squared under physically correct lighting (r155+).
const key = new THREE.SpotLight(LOOK.key, 190, 0, 0.62, 0.78, 2);
key.position.set(-3.6, 5.2, 3.4);
key.target.position.set(0, 1.0, 0);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 2.5; // tightened onto the subject, not the default 10-unit box
key.shadow.camera.far = 14;
key.shadow.normalBias = 0.02; // kills acne without the peter-panning .bias causes
key.shadow.focus = 1.0;
scene.add(key, key.target);

// Softbox: a tall cool panel behind and to the right. It casts no shadow, but
// its reflection is the vertical streak that makes metal read as metal.
const panel = new THREE.RectAreaLight(LOOK.panel, 7.5, 1.1, 3.2);
panel.position.set(2.9, 1.7, -1.15);
panel.lookAt(0, 1.05, 0);
scene.add(panel);

// Rim: cool, from behind left, cutting an edge against the dark.
const rim = new THREE.DirectionalLight(LOOK.rim, 1.5);
rim.position.set(-4.5, 2.4, -4.2);
scene.add(rim);

/* ------------------------------------------------------------------ *
 * Subject — a vessel turned from a hand-drawn profile
 * ------------------------------------------------------------------ */

const PROFILE = [
  [0.0, 0.0],
  [0.72, 0.0],
  [0.78, 0.06], // rolled edge of the base
  [0.7, 0.14],
  [0.3, 0.2], // tuck
  [0.26, 0.34],
  [0.34, 0.55],
  [0.52, 0.86], // the swell begins
  [0.62, 1.22],
  [0.6, 1.62],
  [0.46, 1.92], // shoulder
  [0.22, 2.06],
  [0.1, 2.12],
  [0.0, 2.16], // dome
].map(([x, y]) => new THREE.Vector2(x, y));

const silhouette = new THREE.SplineCurve(PROFILE).getPoints(180);
for (const p of silhouette) p.x = Math.max(p.x, 0); // spline overshoot must never cross the axis

const vesselGeometry = new THREE.LatheGeometry(silhouette, 256);

const metal = new THREE.MeshPhysicalMaterial({
  color: LOOK.metal,
  metalness: 1.0,
  roughness: 0.34, // multiplied by the map below — never 0, a perfect mirror has nothing to reflect
  roughnessMap: makeBrushedRoughnessMap(),
  anisotropy: 0.6, // directional brush, stretched around the turning axis
  anisotropyRotation: Math.PI * 0.5,
  envMapIntensity: 1.15,
});

const vessel = new THREE.Mesh(vesselGeometry, metal);
vessel.castShadow = true;
vessel.receiveShadow = true;

const subject = new THREE.Group();
subject.add(vessel);
scene.add(subject);

/**
 * Turning marks: noise that drifts along the profile and smears around the
 * circumference. It stays NoColorSpace — a roughness map pushed through the
 * sRGB decode is the classic "plasticky, and I can't say why".
 */
function makeBrushedRoughnessMap() {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);

  let band = 0.72;
  for (let y = 0; y < size; y++) {
    band = Math.min(0.95, Math.max(0.52, band + (Math.random() - 0.5) * 0.07));
    for (let x = 0; x < size; x++) {
      const v = Math.round((band + (Math.random() - 0.5) * 0.05) * 255);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 2);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

/* ------------------------------------------------------------------ *
 * Ground
 * ------------------------------------------------------------------ */

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 80),
  new THREE.MeshStandardMaterial({ color: LOOK.floor, roughness: 0.42, metalness: 0.05 }),
);
floor.rotation.x = -Math.PI * 0.5;
floor.receiveShadow = true;
scene.add(floor);

/* ------------------------------------------------------------------ *
 * Post — seasoning, not the meal
 * ------------------------------------------------------------------ */

const composerTarget = new THREE.WebGLRenderTarget(1, 1, {
  type: THREE.HalfFloatType, // keeps highlights above 1.0 alive for the bloom threshold
  samples: renderer.getPixelRatio() > 1.5 ? 2 : 4, // the MSAA the composer would otherwise cost us
});

const composer = new EffectComposer(renderer, composerTarget);
composer.addPass(new RenderPass(scene, camera));

// threshold 0.9: only genuine speculars bloom, so the image never hazes over.
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.55, 0.9);
composer.addPass(bloom);

composer.addPass(new OutputPass()); // tone maps + encodes, reading the renderer's own settings

// Grade last, in display space, where grain actually hides 8-bit banding.
const gradePass = new ShaderPass({
  name: 'HeroGrade',
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.028 },
    uVignette: { value: 0.45 },
    uAspect: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;

    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uGrain;
    uniform float uVignette;
    uniform float uAspect;

    varying vec2 vUv;

    float hash( vec2 p ) {
      p = fract( p * vec2( 443.897, 441.423 ) );
      p += dot( p, p + 19.19 );
      return fract( p.x * p.y );
    }

    void main() {
      vec4 c = texture2D( tDiffuse, vUv );

      // Elliptical falloff, only partly aspect-corrected — a lens, not a circle.
      vec2 d = ( vUv - 0.5 ) * vec2( mix( 1.0, uAspect, 0.35 ), 1.0 );
      float vig = smoothstep( 0.90, 0.28, length( d ) );
      c.rgb *= mix( 1.0, vig, uVignette );

      float luma = dot( c.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );

      // Cool the shadows a touch. A grade, not a filter.
      c.rgb = mix( c.rgb * vec3( 0.96, 0.99, 1.06 ), c.rgb, smoothstep( 0.0, 0.45, luma ) );

      // Grain, weighted away from the highlights.
      float n = hash( gl_FragCoord.xy + fract( uTime ) * 977.0 ) - 0.5;
      c.rgb += n * uGrain * ( 1.0 - 0.75 * luma );

      gl_FragColor = c;
    }
  `,
});
composer.addPass(gradePass);

/* ------------------------------------------------------------------ *
 * Resize — a ResizeObserver, not the resize event, which also fires when
 * mobile browser chrome hides on scroll and causes a visible jump.
 * ------------------------------------------------------------------ */

function resize() {
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  if (w === 0 || h === 0) return;

  const dpr = Math.min(window.devicePixelRatio, 2); // re-read: dragging to another monitor changes it silently
  const aspect = w / h;

  camera.aspect = aspect;
  camera.updateProjectionMatrix(); // required — aspect alone does nothing

  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);

  composer.setPixelRatio(dpr); // composers size their targets separately
  composer.setSize(w, h);

  gradePass.uniforms.uAspect.value = aspect;

  // Art direction, not just plumbing: on wide screens the vessel sits right of
  // centre so the headline owns the left; in portrait it returns to centre.
  subject.position.x = aspect > 1.15 ? 0.85 : 0;
}

const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(canvas);
resize();

/* ------------------------------------------------------------------ *
 * Input
 * ------------------------------------------------------------------ */

const pointerTarget = new THREE.Vector2(); // -1..1
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function onPointerMove(event) {
  pointerTarget.set(
    (event.clientX / window.innerWidth) * 2 - 1,
    (event.clientY / window.innerHeight) * 2 - 1,
  );
}
window.addEventListener('pointermove', onPointerMove, { passive: true });

// Don't burn a GPU on a hero that has been scrolled past.
let onScreen = true;
const visibility = new IntersectionObserver(
  ([entry]) => {
    onScreen = entry.isIntersecting;
  },
  { threshold: 0 },
);
visibility.observe(canvas);

/* ------------------------------------------------------------------ *
 * Loop
 * ------------------------------------------------------------------ */

const timer = new THREE.Timer();
timer.connect(document); // zero delta while the tab is hidden, so nothing teleports on return

// Hoisted: a new Vector3 per frame is 60 allocations a second for the GC.
const desired = new THREE.Vector3();

function tick(timestamp) {
  timer.update(timestamp); // sampled once per frame, so every read agrees
  const dt = timer.getDelta();
  const t = timer.getElapsed();

  if (!onScreen) return;

  const m = reducedMotion.matches ? 0 : 1;

  subject.rotation.y += dt * MOTION.spin * m;
  subject.position.y = Math.sin(t * MOTION.bobRate) * MOTION.bobAmplitude * m;

  // Rotating the room is usually more flattering than moving a light.
  scene.environmentRotation.y -= dt * MOTION.envSpin * m;

  desired.set(
    CAMERA_HOME.x + pointerTarget.x * MOTION.parallax.x * m,
    CAMERA_HOME.y - pointerTarget.y * MOTION.parallax.y * m,
    CAMERA_HOME.z,
  );
  // damp(), not lerp() — a fixed lerp factor runs twice as fast at 120Hz.
  camera.position.x = THREE.MathUtils.damp(camera.position.x, desired.x, MOTION.parallaxLambda, dt);
  camera.position.y = THREE.MathUtils.damp(camera.position.y, desired.y, MOTION.parallaxLambda, dt);

  lookTarget.x = THREE.MathUtils.damp(lookTarget.x, subject.position.x * 0.55, 1.6, dt);
  camera.lookAt(lookTarget);

  gradePass.uniforms.uTime.value = t;

  composer.render(dt);
}

renderer.setAnimationLoop(tick); // stops cleanly with null, unlike a bare rAF

/* ------------------------------------------------------------------ *
 * Teardown — three frees nothing when you drop a reference, and a browser
 * only allows a handful of live WebGL contexts.
 * ------------------------------------------------------------------ */

export function dispose() {
  renderer.setAnimationLoop(null);
  resizeObserver.disconnect();
  visibility.disconnect();
  window.removeEventListener('pointermove', onPointerMove);
  timer.disconnect();

  scene.traverse((o) => {
    o.geometry?.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const mat of mats) {
      for (const value of Object.values(mat)) if (value?.isTexture) value.dispose();
      mat.dispose();
    }
  });

  scene.background?.dispose();
  envRT.texture.dispose();
  composerTarget.dispose();
  composer.dispose();
  renderer.dispose();
  renderer.forceContextLoss(); // frees the WebGL context itself
}

if (import.meta.hot) import.meta.hot.dispose(dispose);
