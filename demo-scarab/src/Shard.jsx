import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { shardFragment, shardVertex } from './shaders'

/**
 * The dark form at the centre of beats one and three.
 *
 * It is a single mesh whose displacement parameters are driven by scroll, so the bladed
 * "explosion" of the first beat and the blockier crystal of the third are the same object
 * under different settings rather than two models cross-faded.
 */
export default function Shard({ progressRef }) {
  const mesh = useRef()
  const group = useRef()

  // Icosahedron, not a UV sphere: even triangle distribution and no pole pinching, which
  // matters when the displacement is this sharp. Detail 56 is ~63k triangles — high, but
  // this is the one hero object on the page and the spikes need the vertices.
  const geometry = useMemo(() => new THREE.IcosahedronGeometry(1, 56), [])

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAmp: { value: 1.55 },
      uSharp: { value: 7.0 },
      uFreq: { value: 0.85 },
      uRimPower: { value: 4.5 },
      uOpacity: { value: 1 },
      // Linear values, deliberately tiny — see the colour note in materials-lighting.md.
      uTint: { value: new THREE.Color(0.26, 0.29, 0.46) },
      uRim: { value: new THREE.Color(0.62, 0.66, 0.95) },
    }),
    [],
  )

  useFrame((state, delta) => {
    const d = Math.min(delta, 0.1)
    const p = progressRef.current

    // Same trap as Burst: R3F does not keep the uniforms object passed to the JSX prop,
    // so mutations have to go through the material's own uniforms or they land nowhere.
    const u = mesh.current.material.uniforms
    u.uTime.value += d

    // Beat one holds long bladed spikes; beat three tightens into a blockier crystal.
    const toCrystal = THREE.MathUtils.smoothstep(p, 0.58, 0.82)
    u.uAmp.value = THREE.MathUtils.lerp(1.55, 0.72, toCrystal)
    u.uSharp.value = THREE.MathUtils.lerp(7.0, 2.4, toCrystal)
    u.uFreq.value = THREE.MathUtils.lerp(0.85, 1.7, toCrystal)

    // Out of the way while the burst owns the screen.
    const hide = THREE.MathUtils.smoothstep(p, 0.26, 0.42)
    const back = 1 - THREE.MathUtils.smoothstep(p, 0.6, 0.74)
    u.uOpacity.value = Math.max(1 - hide, 1 - back) * 0.999 + 0.001

    const s = THREE.MathUtils.lerp(1, 0.55, hide) * THREE.MathUtils.lerp(0.55, 1, 1 - back)
    group.current.scale.setScalar(s * 0.95)
    group.current.visible = u.uOpacity.value > 0.02

    // Slow enough to read as weight. The reference barely moves.
    mesh.current.rotation.y += d * 0.055
    mesh.current.rotation.x += d * 0.018

    // Drifts right in the third beat, where the headline takes the left.
    group.current.position.x = THREE.MathUtils.lerp(0, 1.15, THREE.MathUtils.smoothstep(p, 0.62, 0.9))

    const px = state.pointer.x * 0.12
    const py = state.pointer.y * 0.08
    mesh.current.rotation.z = THREE.MathUtils.damp(mesh.current.rotation.z, px, 2, d)
    group.current.position.y = THREE.MathUtils.damp(group.current.position.y, py, 2, d)
  })

  return (
    <group ref={group}>
      <mesh ref={mesh} geometry={geometry}>
        <shaderMaterial
          vertexShader={shardVertex}
          fragmentShader={shardFragment}
          uniforms={uniforms}
          transparent
        />
      </mesh>
    </group>
  )
}
