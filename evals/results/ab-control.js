/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  HERO — "Halo"
 *
 *  A dark, photographic hero scene built on vanilla three.js. One machined
 *  metal ring, lit the way a product photographer would light it: a large
 *  soft key from the upper left, a hard cool rim from behind right, a dim
 *  bounce from below, and everything sitting in near-black.
 *
 *  Everything is procedural — no HDRI files, no textures, no post-processing
 *  library. The realism comes from four things:
 *
 *    1. A PMREM-prefiltered "studio" environment built from emissive panels.
 *       Metal is almost entirely reflection, so the shape of the light in the
 *       environment matters far more than the number of Lights in the scene.
 *    2. A roughness map. Perfectly uniform roughness reads as CG; a little
 *       blotchy variation plus faint turning marks reads as a real object.
 *    3. ACES filmic tone mapping with a long lens (32° fov) and a baked
 *       backdrop gradient, so highlights roll off instead of clipping.
 *    4. A vignette + live grain pass, which is what makes a render look like
 *       it came out of a camera rather than a viewport.
 *
 *  Usage (Vite + `npm i three`):
 *      import './main.js'                       // auto-mounts to [data-hero]
 *      // or
 *      import { createHero } from './main.js'
 *      const hero = createHero(document.querySelector('#hero'))
 *      hero.dispose()
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as THREE from 'three';

/* ═══════════════════════════════════════════════════════════════════════════
   Tuning
   ═══════════════════════════════════════════════════════════════════════════ */

const CONFIG = {
  maxPixelRatio: 2, // retina is plenty; 3x costs 2.25x the fill rate for nothing
  exposure: 1.06,
  fov: 32, // long lens — compresses the ring, flatters the reflections
  frameSize: 3.5, // world units of subject we want to keep in frame
  offsetX: 0.78, // push the ring right of centre so copy can live on the left
  ring: {
    majorRadius: 1.16,
    halfWidth: 0.17, // radial thickness of the band
    halfHeight: 0.3, // height of the band
    bevel: 0.115, // corner round — this is what catches the key light
    radialSegments: 420,
    profileSegments: 28,
    tilt: 0.46, // radians, tipped toward camera
  },
  motion: {
    precession: 0.13, // rad/s — the ring slowly turns through the lighting
    spin: 0.05, // rad/s about its own axis; only the surface grain shows it
    float: 0.055, // vertical drift amplitude
    parallax: 0.42, // how far the camera drifts with the pointer
  },
  color: {
    fog: 0x05070b,
    metal: 0xb8bec7, // cool steel; on a metal this tints every reflection
    floor: 0x0a0c11,
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
   Procedural textures
   ═══════════════════════════════════════════════════════════════════════════ */

function canvas2d(size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  return [canvas, canvas.getContext('2d')];
}

/**
 * Micro-surface variation for the metal. Broad soft blotches (like the way
 * polish wears unevenly) plus faint circumferential turning marks from a lathe.
 * Mean value sits near 0.5, so the material's own `roughness` stays the dial.
 */
function createSurfaceTexture(anisotropy) {
  const size = 1024;
  const [canvas, ctx] = canvas2d(size);

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);

  // Uneven polish
  for (let i = 0; i < 220; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = size * (0.03 + Math.random() * 0.2);
    const v = Math.random() < 0.5 ? 255 : 0;
    const a = 0.02 + Math.random() * 0.07;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${v},${v},${v},${a})`);
    g.addColorStop(1, `rgba(${v},${v},${v},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Turning marks — horizontal in UV space, which wraps around the ring
  ctx.globalAlpha = 0.05;
  for (let i = 0; i < 900; i++) {
    const y = Math.random() * size;
    ctx.strokeStyle = Math.random() < 0.5 ? '#ffffff' : '#000000';
    ctx.lineWidth = Math.random() < 0.85 ? 1 : 2;
    ctx.beginPath();
    const x0 = Math.random() * size;
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + size * (0.1 + Math.random() * 0.6), y + (Math.random() - 0.5));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.NoColorSpace; // data, not colour
  texture.anisotropy = anisotropy;
  texture.repeat.set(6, 2);
  return texture;
}

/**
 * The backdrop. A vertical falloff with a soft pool of light behind the
 * subject — the classic seamless-paper look, baked instead of lit so it stays
 * exactly as dark as it needs to be.
 */
function createBackdropTexture() {
  const size = 1024;
  const [canvas, ctx] = canvas2d(size);

  const linear = ctx.createLinearGradient(0, 0, 0, size);
  linear.addColorStop(0.0, '#12161f');
  linear.addColorStop(0.45, '#0a0d14');
  linear.addColorStop(1.0, '#04060a');
  ctx.fillStyle = linear;
  ctx.fillRect(0, 0, size, size);

  const glow = ctx.createRadialGradient(
    size * 0.56, size * 0.44, 0,
    size * 0.56, size * 0.44, size * 0.5
  );
  glow.addColorStop(0.0, 'rgba(96,124,168,0.30)');
  glow.addColorStop(0.5, 'rgba(60,80,116,0.11)');
  glow.addColorStop(1.0, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Lens vignette, drawn as a screen-space overlay. */
function createVignetteTexture() {
  const size = 512;
  const [canvas, ctx] = canvas2d(size);
  const g = ctx.createRadialGradient(
    size * 0.5, size * 0.47, size * 0.16,
    size * 0.5, size * 0.5, size * 0.72
  );
  g.addColorStop(0.0, 'rgba(3,4,7,0)');
  g.addColorStop(0.6, 'rgba(3,4,7,0.30)');
  g.addColorStop(1.0, 'rgba(2,3,6,0.86)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Sensor grain. Tiled 1:1 with device pixels and jittered every frame. */
function createGrainTexture() {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const v = 90 + Math.random() * 165;
    data[i * 4 + 0] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Environment — a lighting set-up rather than a room
   ═══════════════════════════════════════════════════════════════════════════ */

function createStudioEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const disposables = [];

  const plane = new THREE.PlaneGeometry(1, 1);
  disposables.push(plane);

  /** Emissive panel aimed at the origin — a softbox. */
  const panel = (hex, intensity, width, height, position) => {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(hex).multiplyScalar(intensity),
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    disposables.push(material);
    const mesh = new THREE.Mesh(plane, material);
    mesh.scale.set(width, height, 1);
    mesh.position.copy(position);
    mesh.lookAt(0, 0, 0);
    envScene.add(mesh);
    return mesh;
  };

  // Dark surround, so reflections read as "unlit studio" instead of "void".
  const shellGeometry = new THREE.BoxGeometry(30, 20, 30);
  const shellMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0x090b11).multiplyScalar(0.55),
    side: THREE.BackSide,
    toneMapped: false,
  });
  disposables.push(shellGeometry, shellMaterial);
  envScene.add(new THREE.Mesh(shellGeometry, shellMaterial));

  panel(0xfff0da, 7.5, 9, 6, new THREE.Vector3(-5.0, 3.6, 3.2)); // key softbox
  panel(0xfff6ea, 2.2, 4, 4, new THREE.Vector3(-2.0, 1.0, 6.0)); // frontal fill
  panel(0x9dbcff, 26.0, 0.7, 7, new THREE.Vector3(4.6, 1.4, -2.2)); // hard rim strip
  panel(0xbcd2ff, 6.0, 5, 0.5, new THREE.Vector3(0.5, 4.6, -3.4)); // top edge line
  panel(0x2b2419, 1.1, 14, 14, new THREE.Vector3(0, -5.0, 0)); // warm floor bounce
  panel(0xffd7a8, 2.4, 1.4, 1.4, new THREE.Vector3(2.2, -2.6, 3.4)); // low accent glint

  const target = pmrem.fromScene(envScene, 0.02, 0.1, 60);
  pmrem.dispose();
  disposables.forEach((d) => d.dispose());

  return target; // .texture is the env map; keep the target to dispose later
}

/* ═══════════════════════════════════════════════════════════════════════════
   Geometry — a machined band, not a primitive torus
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * A ring lathed from a rounded-rectangle profile: flat inner and outer walls,
 * flat top and bottom, generous bevels between them. Those four bevels are the
 * whole point — each one is a narrow, curved surface that sweeps a bright band
 * of the environment across itself as the ring turns.
 */
function createRingGeometry(spec) {
  const { majorRadius, halfWidth, halfHeight, bevel, radialSegments, profileSegments } = spec;
  const b = Math.min(bevel, halfWidth * 0.98, halfHeight * 0.98);

  const perCorner = Math.max(3, Math.round(profileSegments / 4));
  const corners = [
    // [centre x, centre y, start angle] walked counter-clockwise so that
    // LatheGeometry generates outward-facing normals all the way round.
    [majorRadius + halfWidth - b, -halfHeight + b, -Math.PI / 2],
    [majorRadius + halfWidth - b, halfHeight - b, 0],
    [majorRadius - halfWidth + b, halfHeight - b, Math.PI / 2],
    [majorRadius - halfWidth + b, -halfHeight + b, Math.PI],
  ];

  const points = [];
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i <= perCorner; i++) {
      const a = start + (i / perCorner) * (Math.PI / 2);
      points.push(new THREE.Vector2(cx + Math.cos(a) * b, cy + Math.sin(a) * b));
    }
  }
  points.push(points[0].clone()); // close the profile

  const geometry = new THREE.LatheGeometry(points, radialSegments);
  const normal = geometry.attributes.normal;
  const stride = points.length;

  // Safety net: if the profile ended up wound the wrong way the surface would
  // be inside-out and read as black. Check the outermost vertex and flip.
  {
    let outermost = 0;
    let maxX = -Infinity;
    for (let j = 0; j < stride; j++) {
      if (points[j].x > maxX) {
        maxX = points[j].x;
        outermost = j;
      }
    }
    if (normal.getX(outermost) < 0) {
      for (let i = 0; i < normal.count; i++) {
        normal.setXYZ(i, -normal.getX(i), -normal.getY(i), -normal.getZ(i));
      }
      const index = geometry.index;
      for (let i = 0; i < index.count; i += 3) {
        const a = index.getX(i);
        index.setX(i, index.getX(i + 2));
        index.setX(i + 2, a);
      }
      index.needsUpdate = true;
    }
  }

  // Weld the profile seam: the first and last profile points are coincident,
  // so their normals must be averaged or a hard crease runs around the ring.
  const n0 = new THREE.Vector3();
  const n1 = new THREE.Vector3();
  for (let i = 0; i <= radialSegments; i++) {
    const a = i * stride;
    const z = a + stride - 1;
    n0.fromBufferAttribute(normal, a);
    n1.fromBufferAttribute(normal, z);
    n0.add(n1).normalize();
    normal.setXYZ(a, n0.x, n0.y, n0.z);
    normal.setXYZ(z, n0.x, n0.y, n0.z);
  }
  normal.needsUpdate = true;

  geometry.computeBoundingSphere();
  return geometry;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Scene
   ═══════════════════════════════════════════════════════════════════════════ */

export function createHero(container = document.body, options = {}) {
  const settings = { ...CONFIG, ...options };
  const disposables = [];
  const track = (...items) => {
    disposables.push(...items);
    return items[0];
  };

  /* ── Renderer ──────────────────────────────────────────────────────────── */

  const canvas = document.createElement('canvas');
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  container.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    stencil: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, settings.maxPixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = settings.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

  /* ── Scene, camera ─────────────────────────────────────────────────────── */

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(settings.color.fog, 0.028);

  const camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.1, 120);
  camera.position.set(0, 0.34, 6.4);

  const envTarget = createStudioEnvironment(renderer);
  scene.environment = envTarget.texture;

  /* ── Backdrop and floor ────────────────────────────────────────────────── */

  const backdropTexture = track(createBackdropTexture());
  const backdrop = new THREE.Mesh(
    track(new THREE.PlaneGeometry(60, 34)),
    track(new THREE.MeshBasicMaterial({
      map: backdropTexture,
      fog: true,
      dithering: true, // dark gradients band badly in 8-bit without this
    }))
  );
  backdrop.position.set(0, 2, -9);
  scene.add(backdrop);

  const surfaceTexture = track(createSurfaceTexture(maxAnisotropy));
  const floorTexture = track(surfaceTexture.clone());
  floorTexture.repeat.set(9, 9);
  floorTexture.needsUpdate = true;

  const floor = new THREE.Mesh(
    track(new THREE.PlaneGeometry(60, 60)),
    track(new THREE.MeshStandardMaterial({
      color: settings.color.floor,
      roughness: 0.62,
      roughnessMap: floorTexture,
      metalness: 0.12,
      envMapIntensity: 0.4,
      dithering: true,
    }))
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.55;
  floor.receiveShadow = true;
  scene.add(floor);

  /* ── Subject ───────────────────────────────────────────────────────────── */

  const world = new THREE.Group(); // holds subject + its lighting, moved by layout
  scene.add(world);

  const pivot = new THREE.Group(); // precession + float
  world.add(pivot);

  const metal = track(new THREE.MeshPhysicalMaterial({
    color: settings.color.metal,
    metalness: 1.0,
    roughness: 0.44, // multiplied by the ~0.5-mean roughness map → ≈0.22
    roughnessMap: surfaceTexture,
    envMapIntensity: 1.18,
  }));
  // Brushed metal stretches its highlights along the machining direction.
  if ('anisotropy' in metal) {
    metal.anisotropy = 0.35;
    metal.anisotropyRotation = Math.PI / 2;
  }

  const ring = new THREE.Mesh(track(createRingGeometry(settings.ring)), metal);
  ring.rotation.x = settings.ring.tilt;
  ring.rotation.z = -0.18;
  ring.castShadow = true;
  ring.receiveShadow = true;
  pivot.add(ring);

  /* ── Lighting ──────────────────────────────────────────────────────────── */
  // The environment map does most of the work on a metal surface. These lights
  // exist for the specular flares and, above all, for the contact shadow —
  // without a shadow the ring floats in nothing and the shot dies.

  const key = new THREE.SpotLight(0xfff1e0, 150, 26, 0.62, 0.92, 2);
  key.position.set(-3.4, 4.6, 3.4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 20;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 5;
  key.shadow.blurSamples = 24;
  world.add(key, key.target);

  const rim = new THREE.SpotLight(0x8fb4ff, 120, 22, 0.7, 1.0, 2);
  rim.position.set(4.0, 1.4, -3.2);
  world.add(rim, rim.target);

  const fill = new THREE.DirectionalLight(0x6d7f9c, 0.35);
  fill.position.set(-2.5, -1.5, 2.0);
  world.add(fill);

  /* ── Overlay: vignette + grain ─────────────────────────────────────────── */

  const overlayScene = new THREE.Scene();
  const overlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const overlayQuad = track(new THREE.PlaneGeometry(2, 2));

  const vignette = new THREE.Mesh(
    overlayQuad,
    track(new THREE.MeshBasicMaterial({
      map: track(createVignetteTexture()),
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }))
  );
  overlayScene.add(vignette);

  const grainTexture = track(createGrainTexture());
  const grainMaterial = track(new THREE.MeshBasicMaterial({
    map: grainTexture,
    transparent: true,
    opacity: 0.05,
    blending: THREE.AdditiveBlending, // lifts the blacks slightly, like film base
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  }));
  const grain = new THREE.Mesh(overlayQuad, grainMaterial);
  grain.renderOrder = 1;
  overlayScene.add(grain);

  /* ── Layout ────────────────────────────────────────────────────────────── */

  const size = new THREE.Vector2();

  function layout() {
    const width = Math.max(1, container.clientWidth || window.innerWidth);
    const height = Math.max(1, container.clientHeight || window.innerHeight);
    if (size.x === width && size.y === height) return;
    size.set(width, height);

    const aspect = width / height;
    const portrait = aspect < 1.05;

    camera.aspect = aspect;

    // Dolly rather than zoom, so the lens character never changes: solve for
    // the distance that fits `frameSize` both vertically and horizontally.
    const halfFov = THREE.MathUtils.degToRad(camera.fov) * 0.5;
    const frame = settings.frameSize * (portrait ? 0.92 : 1);
    const forHeight = frame / 2 / Math.tan(halfFov);
    const forWidth = frame / 2 / (Math.tan(halfFov) * aspect);
    camera.position.z = THREE.MathUtils.clamp(Math.max(forHeight, forWidth), 5.4, 11.5);
    camera.updateProjectionMatrix();

    // Off-centre on wide screens to leave a column for the headline; centred
    // and lifted on phones, where the copy stacks underneath.
    world.position.x = portrait ? 0 : settings.offsetX * THREE.MathUtils.smoothstep(aspect, 1.05, 1.7);
    world.position.y = portrait ? 0.45 : 0;

    renderer.setSize(width, height, false);

    // One grain texel ≈ 1.4 device pixels, regardless of viewport or DPR.
    const dpr = renderer.getPixelRatio();
    grainTexture.repeat.set((width * dpr) / 256 / 1.4, (height * dpr) / 256 / 1.4);
  }

  layout();

  const resizeObserver = new ResizeObserver(() => layout());
  resizeObserver.observe(container);
  window.addEventListener('resize', layout);

  /* ── Input ─────────────────────────────────────────────────────────────── */

  const pointer = new THREE.Vector2(0, 0);
  const pointerTarget = new THREE.Vector2(0, 0);

  function onPointerMove(event) {
    pointerTarget.set(
      (event.clientX / window.innerWidth) * 2 - 1,
      (event.clientY / window.innerHeight) * 2 - 1
    );
  }
  function onPointerLeave() {
    pointerTarget.set(0, 0);
  }
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('pointerleave', onPointerLeave);

  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = reducedMotionQuery.matches;
  const onMotionPreference = (event) => {
    reducedMotion = event.matches;
  };
  reducedMotionQuery.addEventListener('change', onMotionPreference);

  /* ── Loop ──────────────────────────────────────────────────────────────── */

  const clock = new THREE.Clock();
  const lookTarget = new THREE.Vector3(0, 0, 0);
  let elapsed = 0;

  function frame() {
    const dt = Math.min(clock.getDelta(), 1 / 24);
    const scale = reducedMotion ? 0.12 : 1;
    elapsed += dt * scale;

    // The ring turns through the lighting rather than spinning in place: the
    // silhouette stays constant while the reflections sweep across the bevels.
    pivot.rotation.y = elapsed * settings.motion.precession;
    pivot.rotation.x = Math.sin(elapsed * 0.31) * 0.055;
    pivot.position.y = Math.sin(elapsed * 0.45) * settings.motion.float;
    ring.rotation.y = elapsed * settings.motion.spin;

    // Damped pointer parallax — frame-rate independent, and it never fully
    // arrives, which is what keeps it feeling like weight instead of tracking.
    pointer.x = THREE.MathUtils.damp(pointer.x, pointerTarget.x, 2.6, dt);
    pointer.y = THREE.MathUtils.damp(pointer.y, pointerTarget.y, 2.6, dt);
    const p = settings.motion.parallax * (reducedMotion ? 0.25 : 1);
    camera.position.x = pointer.x * p + world.position.x * 0.12;
    camera.position.y = 0.34 - pointer.y * p * 0.55;
    lookTarget.set(world.position.x * 0.35, world.position.y * 0.5, 0);
    camera.lookAt(lookTarget);

    if (!reducedMotion) {
      grainTexture.offset.set(Math.random(), Math.random());
    }

    renderer.render(scene, camera);
    renderer.autoClear = false;
    renderer.render(overlayScene, overlayCamera);
    renderer.autoClear = true;
  }

  renderer.setAnimationLoop(frame);

  // Don't burn a GPU on a hidden tab.
  function onVisibility() {
    if (document.hidden) {
      renderer.setAnimationLoop(null);
    } else {
      clock.getDelta();
      renderer.setAnimationLoop(frame);
    }
  }
  document.addEventListener('visibilitychange', onVisibility);

  function onContextLost(event) {
    event.preventDefault();
    renderer.setAnimationLoop(null);
  }
  function onContextRestored() {
    clock.getDelta();
    renderer.setAnimationLoop(frame);
  }
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);

  /* ── Teardown ──────────────────────────────────────────────────────────── */

  function dispose() {
    renderer.setAnimationLoop(null);
    resizeObserver.disconnect();
    window.removeEventListener('resize', layout);
    window.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerleave', onPointerLeave);
    document.removeEventListener('visibilitychange', onVisibility);
    reducedMotionQuery.removeEventListener('change', onMotionPreference);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    canvas.removeEventListener('webglcontextrestored', onContextRestored);

    disposables.forEach((item) => item.dispose());
    envTarget.dispose();
    scene.environment = null;
    renderer.dispose();
    canvas.remove();
  }

  return { renderer, scene, camera, ring, dispose };
}

/* ═══════════════════════════════════════════════════════════════════════════
   Auto-mount
   ═══════════════════════════════════════════════════════════════════════════ */

const mount =
  document.querySelector('[data-hero]') ||
  document.querySelector('#hero') ||
  document.body;

const hero = createHero(mount);

if (import.meta.hot) {
  import.meta.hot.dispose(() => hero.dispose());
}

export default hero;
