import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox, Text } from "@react-three/drei";
import * as THREE from "three";
import {
  ATLAS_CELL,
  atlasOffset,
  buildGlowTexture,
  buildLogoAtlas,
} from "./atlas";
import {
  KEY,
  KEY_H,
  PITCH,
  TAPER,
  keyPosition,
  makeKeycapGeometry,
} from "./keycap";
import { GRID, TECH } from "./tech";

const N = TECH.length;
const SPAN = (GRID - 1) * PITCH + KEY;
const TRAY = SPAN + 1.0;
const TRAY_H = 0.44;

const DECAL = KEY * TAPER * 0.74;
const LIFT_HOVER = 0.09;
const LIFT_PRESS = -0.12;

export default function Keyboard({
  progressRef,
  onSelect,
  selected,
  draggedRef,
  dragRef,
  hoveringKeyRef,
  boardYawRef,
}) {
  const caps = useRef();
  const decals = useRef();
  const glow = useRef();
  const [hovered, setHovered] = useState(null);
  // The cursor is owned by Scene, which also knows whether a drag is in progress.

  const geometry = useMemo(() => makeKeycapGeometry(), []);
  const atlas = useMemo(() => buildLogoAtlas(), []);
  const glowMap = useMemo(() => buildGlowTexture(), []);

  // Per-key animation state, mutated in the loop. Never React state — that would
  // re-render the tree every frame.
  const anim = useMemo(() => TECH.map(() => ({ y: 0 })), []);
  const scratch = useMemo(() => new THREE.Matrix4(), []);
  const colorScratch = useMemo(() => new THREE.Color(), []);

  const decalMaterial = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({
      map: atlas,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    // Per-instance UV offset: every decal samples its own cell of the shared atlas,
    // so all 25 logos draw in a single call.
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nattribute vec2 aAtlas;",
        )
        .replace(
          "#include <uv_vertex>",
          `#include <uv_vertex>\n vMapUv = uv * ${ATLAS_CELL.toFixed(6)} + aAtlas;`,
        );
    };
    m.customProgramCacheKey = () => "atlas-decal-v1";
    return m;
  }, [atlas]);

  // A PlaneGeometry faces +Z. Instanced with a pure translation it stands upright,
  // which renders the logos as little billboards hovering over the caps — so the
  // rotation has to be baked into the geometry itself.
  const decalGeometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(DECAL, DECAL);
    g.rotateX(-Math.PI / 2);
    const arr = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const [u, v] = atlasOffset(i);
      arr[i * 2] = u;
      arr[i * 2 + 1] = v;
    }
    g.setAttribute("aAtlas", new THREE.InstancedBufferAttribute(arr, 2));
    return g;
  }, []);

  // Brand colour per cap, written once.
  useLayoutEffect(() => {
    if (!caps.current) return;
    for (let i = 0; i < N; i++) {
      caps.current.setColorAt(i, colorScratch.set(TECH[i].color));
    }
    caps.current.instanceColor.needsUpdate = true;
  }, [colorScratch]);

  // "hint: press a key" — a physical keypress selects the matching cap.
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const ch = e.key.toLowerCase();
      if (ch.length !== 1) return;
      const matches = TECH.map((t, i) => [t, i]).filter(([t]) =>
        t.title.toLowerCase().startsWith(ch),
      );
      if (!matches.length) return;
      const cur = matches.findIndex(([, i]) => i === selected);
      onSelect(matches[(cur + 1) % matches.length][1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSelect, selected]);

  useFrame((state, delta) => {
    const d = Math.min(delta, 0.1);

    for (let i = 0; i < N; i++) {
      const target =
        i === selected ? LIFT_PRESS : i === hovered ? LIFT_HOVER : 0;
      // A key should snap down and ease back — lambda 14 down, 8 up.
      anim[i].y = THREE.MathUtils.damp(
        anim[i].y,
        target,
        target < anim[i].y ? 14 : 8,
        d,
      );

      const [x, , z] = keyPosition(i, GRID);
      scratch.makeTranslation(x, anim[i].y, z);
      caps.current.setMatrixAt(i, scratch);
      scratch.makeTranslation(x, anim[i].y + KEY_H + 0.006, z);
      decals.current.setMatrixAt(i, scratch);
    }
    caps.current.instanceMatrix.needsUpdate = true;
    decals.current.instanceMatrix.needsUpdate = true;

    // Glow follows whichever key is live, and fades rather than popping.
    const live = hovered ?? selected;
    const g = glow.current;
    if (live != null) {
      const [x, , z] = keyPosition(live, GRID);
      g.position.set(x, 0.03, z);
      g.material.color.set(TECH[live].color);
    }
    const gTarget = live != null ? 0.85 : 0;
    g.material.opacity = THREE.MathUtils.damp(
      g.material.opacity,
      gTarget,
      9,
      d,
    );
    g.visible = g.material.opacity > 0.01;
  });

  return (
    <group>
      {/* Tray */}
      <RoundedBox
        args={[TRAY, TRAY_H, TRAY]}
        radius={0.14}
        smoothness={4}
        position={[0, -TRAY_H / 2, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color="#191b22"
          roughness={0.62}
          metalness={0.15}
        />
      </RoundedBox>

      {/* Glow behind the live key */}
      <mesh ref={glow} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <planeGeometry args={[PITCH * 2.4, PITCH * 2.4]} />
        <meshBasicMaterial
          map={glowMap}
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      {/* 25 caps, one draw call */}
      <instancedMesh
        ref={caps}
        args={[geometry, undefined, N]}
        castShadow
        receiveShadow
        onPointerMove={(e) => {
          e.stopPropagation();
          // Mid-rotate the pointer sweeps across every cap; letting hover follow it
          // would strobe the glow across the board.
          if (dragRef?.current.active) return;
          hoveringKeyRef.current = true;
          setHovered(e.instanceId);
        }}
        onPointerOut={() => {
          hoveringKeyRef.current = false;
          setHovered(null);
        }}
        onClick={(e) => {
          e.stopPropagation();
          // A rotate ends with a pointerup over some cap; that is not a selection.
          if (draggedRef?.current) return;
          onSelect(e.instanceId === selected ? null : e.instanceId);
        }}
      >
        <meshStandardMaterial
          roughness={0.38}
          metalness={0.0}
          envMapIntensity={0.45}
        />
      </instancedMesh>

      {/* 25 logos, also one draw call, sampling one shared atlas */}
      <instancedMesh
        ref={decals}
        args={[decalGeometry, decalMaterial, N]}
        frustumCulled={false}
      />

      <SceneText
        progressRef={progressRef}
        selected={selected}
        boardYawRef={boardYawRef}
      />
    </group>
  );
}

/**
 * Type that lies in the board's plane, so it inherits the board's yaw and is occluded by
 * the caps — the thing that makes it read as part of the object rather than an overlay.
 */
function SceneText({ progressRef, selected, boardYawRef }) {
  const group = useRef();
  const spin = useRef();
  const tech = selected != null ? TECH[selected] : null;

  useFrame((_, delta) => {
    const d = Math.min(delta, 0.1);

    // Only present in the skills half of the scroll.
    const target = THREE.MathUtils.smoothstep(progressRef.current, 0.45, 0.85);
    spin.current.children.forEach((c) => {
      if (c.material)
        c.material.opacity = THREE.MathUtils.damp(
          c.material.opacity,
          target,
          6,
          d,
        );
    });

    // The text stays in the plane and rotates with the board — but spinning the board a
    // half turn would leave it reading upside-down. Counter-rotate about the plane's own
    // normal by the nearest half turn: under 90° the designed skew is untouched, and past
    // it the text swings around inside the plane instead of inverting.
    const flip = Math.round((boardYawRef?.current ?? 0) / Math.PI) * Math.PI;
    spin.current.rotation.z = THREE.MathUtils.damp(
      spin.current.rotation.z,
      -flip,
      6,
      d,
    );
  });

  return (
    <group ref={group} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
      <group ref={spin}>
        <Text
          position={[1.5, SPAN * 0.8, 0]}
          fontSize={1.3}
          letterSpacing={0.06}
          color="#5b6274"
          anchorX="center"
          anchorY="middle"
          fillOpacity={1}
          material-transparent
          material-opacity={0}
          material-depthWrite={false}
          material-toneMapped={false}
          material-side={THREE.DoubleSide}
        >
          SKILLS
        </Text>

        <Text
          position={[-SPAN * 0.6, SPAN * 0.74, 0]}
          fontSize={0.66}
          color="#eef1f8"
          anchorX="right"
          anchorY="middle"
          maxWidth={7}
          material-transparent
          material-opacity={0}
          material-depthWrite={false}
          material-toneMapped={false}
          material-side={THREE.DoubleSide}
        >
          {tech ? tech.title : ""}
        </Text>

        <Text
          position={[-SPAN * 0.6, SPAN * 0.74 - 1.0, 0]}
          fontSize={0.235}
          color="#8d94a8"
          anchorX="right"
          anchorY="top"
          maxWidth={3.1}
          lineHeight={1.4}
          material-transparent
          material-opacity={0}
          material-depthWrite={false}
          material-toneMapped={false}
          material-side={THREE.DoubleSide}
        >
          {tech
            ? tech.blurb
            : "drag to rotate · click a key · or just press one"}
        </Text>
      </group>
    </group>
  );
}
