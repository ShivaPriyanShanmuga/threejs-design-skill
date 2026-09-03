import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  Bloom,
  EffectComposer,
  Noise,
  ToneMapping,
  Vignette,
} from "@react-three/postprocessing";
import { BlendFunction, ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import Keyboard from "./Keyboard";

// The two poses the scroll interpolates between.
const HERO = {
  camera: new THREE.Vector3(0, 8.0, 16.4),
  target: new THREE.Vector3(1.7, -0.6, 0),
  board: new THREE.Vector3(3.0, 0, 0),
  scale: 1.0,
};
const SKILLS = {
  camera: new THREE.Vector3(0, 10.6, 13.4),
  target: new THREE.Vector3(0, -0.4, 0),
  board: new THREE.Vector3(0, 0, 0),
  scale: 1.08,
};
const SKILLS_YAW = -0.52;

// Drag only takes over once the skills beat is most of the way in, so it never fights
// the hero's idle tumble or the mouse parallax.
const DRAG_FROM = 0.25;
const DRAG_SPEED = 0.0055; // radians per pixel
// Yaw is free — it is a turntable. Pitch is clamped: past these the board shows its
// underside and the in-plane text edge-on, which just reads as broken.
const PITCH_MIN = -1.05;
const PITCH_MAX = 0.62;
const CLICK_SLOP = 6; // px of travel before a press counts as a drag rather than a click

/**
 * RoomEnvironment rather than an HDRI preset: no network fetch, no wait, and for glossy
 * plastic it is indistinguishable. Without any environment the caps read as flat gouache.
 */
function RoomEnv() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.42;
    pmrem.dispose();
    return () => {
      scene.environment = null;
      env.dispose();
    };
  }, [gl, scene]);
  return null;
}

function Stars({ count = 900 }) {
  const geometry = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const scale = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // A shell well behind the board, so parallax reads without stars in the caps.
      const r = 34 + Math.random() * 26;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.cos(phi) * 0.5;
      pos[i * 3 + 2] = -Math.abs(r * Math.sin(phi) * Math.sin(theta)) - 12;
      scale[i] = 0.4 + Math.random() * 0.9;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aScale", new THREE.BufferAttribute(scale, 1));
    return g;
  }, [count]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uDpr: { value: Math.min(window.devicePixelRatio, 2) } },
        vertexShader: /* glsl */ `
          attribute float aScale;
          uniform float uDpr;
          varying float vScale;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            // gl_PointSize is in physical pixels: the DPR term keeps stars the same
            // apparent size on a retina display instead of half size.
            gl_PointSize = aScale * uDpr * (58.0 / -mv.z);
            vScale = aScale;
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          varying float vScale;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.08, d) * (0.25 + vScale * 0.4);
            if (a < 0.01) discard;
            gl_FragColor = vec4(vec3(0.72, 0.78, 0.95), a);
          }
        `,
      }),
    [],
  );

  return (
    <points geometry={geometry} material={material} frustumCulled={false} />
  );
}

export default function Scene({ scrollRef, selected, onSelect }) {
  // Two nested groups so the axes stay independent: pitch on the outer, yaw on the
  // inner. A single euler triple would gimbal and start rolling the board.
  const pitchGroup = useRef();
  const yawGroup = useRef();
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);

  // Dev-only handle so `__gl.info.render.calls` can be checked from the console — the
  // draw-call count is the number worth watching here, and it should be a single digit.
  useEffect(() => {
    if (import.meta.env.DEV) window.__gl = gl;
  }, [gl]);

  const smooth = useRef(0);
  const spin = useRef(0);
  const target = useMemo(() => new THREE.Vector3(), []);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const parallax = useRef({ x: 0, y: 0 });

  // Drag target plus its momentum; `view` is the damped value actually rendered.
  const drag = useRef({
    active: false,
    px: 0,
    py: 0,
    at: 0,
    travel: 0,
    yaw: 0,
    pitch: 0,
    velYaw: 0,
    velPitch: 0,
  });
  const view = useRef({ yaw: 0, pitch: 0 });
  const boardYaw = useRef(0); // total yaw, so the in-plane text can stay readable
  // Set on release when the press travelled far enough to count as a drag; read by the
  // keycap click handler so rotating the board never also selects a key.
  const dragged = useRef(false);
  const hoveringKey = useRef(false);

  useEffect(() => {
    const el = gl.domElement;
    const g = drag.current;

    const onDown = (e) => {
      // Mouse and pen only. On touch, a vertical swipe is how you scroll — capturing
      // it here would rotate the board and trap the reader in the section.
      if (e.pointerType === 'touch') return
      if (e.button !== 0 || scrollRef.current < DRAG_FROM) return;
      dragged.current = false; // fresh press: clear the previous verdict
      g.active = true;
      g.travel = 0;
      g.px = e.clientX;
      g.py = e.clientY;
      g.at = performance.now();
      g.velYaw = 0;
      g.velPitch = 0;
      el.setPointerCapture?.(e.pointerId);
    };

    const onMove = (e) => {
      if (!g.active) return;
      const dx = e.clientX - g.px;
      const dy = e.clientY - g.py;
      g.px = e.clientX;
      g.py = e.clientY;
      g.travel += Math.abs(dx) + Math.abs(dy);

      const now = performance.now();
      const dt = Math.max((now - g.at) / 1000, 0.004);
      g.at = now;

      g.yaw += dx * DRAG_SPEED;
      g.pitch = THREE.MathUtils.clamp(
        g.pitch + dy * DRAG_SPEED,
        PITCH_MIN,
        PITCH_MAX,
      );
      // Momentum in radians per second, so a throw is frame-rate independent.
      g.velYaw = (dx * DRAG_SPEED) / dt;
      g.velPitch = (dy * DRAG_SPEED) / dt;
    };

    const onUp = (e) => {
      if (!g.active) return;
      g.active = false;
      dragged.current = g.travel > CLICK_SLOP;
      el.releasePointerCapture?.(e.pointerId);
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [gl, scrollRef]);

  useFrame((state, delta) => {
    const d = Math.min(delta, 0.1);
    const g = drag.current;

    // Damp toward the scroll target rather than reading it raw: absorbs the stepping
    // from a wheel and gives the board a little lag, which reads as weight.
    smooth.current = THREE.MathUtils.damp(
      smooth.current,
      scrollRef.current,
      4,
      d,
    );
    const p = smooth.current;
    const e = THREE.MathUtils.smoothstep(p, 0, 1);

    // The board idles with a slow tumble in the hero and settles as skills takes over.
    spin.current += d * 0.11 * (1 - e);

    // Throw: after release the target keeps moving and the velocity decays out.
    if (!g.active) {
      g.yaw += g.velYaw * d;
      g.pitch = THREE.MathUtils.clamp(
        g.pitch + g.velPitch * d,
        PITCH_MIN,
        PITCH_MAX,
      );
      const decay = Math.exp(-4 * d);
      g.velYaw *= decay;
      g.velPitch *= decay;
      if (Math.abs(g.velYaw) < 1e-4) g.velYaw = 0;
      if (Math.abs(g.velPitch) < 1e-4) g.velPitch = 0;
    }

    // Lag a few frames behind the pointer — the difference between "it rotates" and
    // "it has weight".
    view.current.yaw = THREE.MathUtils.damp(view.current.yaw, g.yaw, 11, d);
    view.current.pitch = THREE.MathUtils.damp(
      view.current.pitch,
      g.pitch,
      11,
      d,
    );

    pos.lerpVectors(HERO.camera, SKILLS.camera, e);
    target.lerpVectors(HERO.target, SKILLS.target, e);

    // Mouse parallax: small, damped, and only in the hero half.
    const amp = 1 - e;
    parallax.current.x = THREE.MathUtils.damp(
      parallax.current.x,
      state.pointer.x * 0.55 * amp,
      2.5,
      d,
    );
    parallax.current.y = THREE.MathUtils.damp(
      parallax.current.y,
      state.pointer.y * 0.35 * amp,
      2.5,
      d,
    );

    camera.position.set(
      pos.x + parallax.current.x,
      pos.y + parallax.current.y,
      pos.z,
    );
    camera.lookAt(target);

    pitchGroup.current.position.lerpVectors(HERO.board, SKILLS.board, e);
    pitchGroup.current.scale.setScalar(
      THREE.MathUtils.lerp(HERO.scale, SKILLS.scale, e),
    );
    // Scaling the offsets by `e` means scrolling back up unwinds the rotation rather
    // than stranding the board at whatever angle it was left at.
    pitchGroup.current.rotation.x = view.current.pitch * e;
    boardYaw.current = THREE.MathUtils.lerp(
      spin.current,
      SKILLS_YAW + view.current.yaw,
      e,
    );
    yawGroup.current.rotation.y = boardYaw.current;

    const canGrab = p > DRAG_FROM;
    gl.domElement.style.cursor = g.active
      ? "grabbing"
      : hoveringKey.current && canGrab
        ? "pointer"
        : canGrab
          ? "grab"
          : "";
  });

  return (
    <>
      <RoomEnv />
      <Stars />

      <directionalLight
        position={[5, 9, 6]}
        intensity={1.35}
        castShadow
        // Tight frustum around the board — the default 10-unit box would spend most of
        // the shadow map on empty space.
        shadow-mapSize={[1024, 1024]}
        shadow-camera-near={1}
        shadow-camera-far={26}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-normalBias={0.02}
      />
      {/* Cool rim from behind, to separate the board from the background */}
      <directionalLight
        position={[-7, 3, -6]}
        intensity={0.75}
        color="#9db6ff"
      />

      <group ref={pitchGroup}>
        <group ref={yawGroup}>
          {/* the ref, not its value: a value read during render would be a frame stale */}
          <Keyboard
            progressRef={smooth}
            selected={selected}
            onSelect={onSelect}
            draggedRef={dragged}
            dragRef={drag}
            hoveringKeyRef={hoveringKey}
            boardYawRef={boardYaw}
          />
        </group>
      </group>

      <EffectComposer>
        <Bloom
          luminanceThreshold={0.92}
          luminanceSmoothing={0.04}
          intensity={0.32}
          mipmapBlur
        />
        <Vignette offset={0.22} darkness={0.72} />
        <Noise
          opacity={0.025}
          premultiply
          blendFunction={BlendFunction.SOFT_LIGHT}
        />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </>
  );
}
