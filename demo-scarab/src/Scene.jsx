import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, Noise, ToneMapping, Vignette } from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import Arcs from './Arcs'
import Burst from './Burst'
import Shard from './Shard'

// Camera poses per beat. The reference barely moves the camera — the objects do the work —
// so these are close together on purpose.
const POSES = [
  { pos: new THREE.Vector3(0, 0, 6.4), look: new THREE.Vector3(0, 0, 0) },
  { pos: new THREE.Vector3(0, 0, 5.2), look: new THREE.Vector3(0, 0, 0) },
  { pos: new THREE.Vector3(0, 0.15, 6.9), look: new THREE.Vector3(0.35, 0, 0) },
]

export default function Scene({ scrollRef }) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  if (import.meta.env.DEV) window.__gl = gl

  const smooth = useRef(0)
  const pos = useMemo(() => new THREE.Vector3(), [])
  const look = useMemo(() => new THREE.Vector3(), [])
  const parallax = useRef({ x: 0, y: 0 })

  // The damped progress every object reads. Normalised once, in App; damped once, here.
  const progress = useRef(0)

  useFrame((state, delta) => {
    const d = Math.min(delta, 0.1)

    smooth.current = THREE.MathUtils.damp(smooth.current, scrollRef.current, 4.5, d)
    progress.current = smooth.current
    const p = smooth.current

    // Interpolate between whichever pair of poses we are between.
    const seg = Math.min(Math.floor(p * 2), 1)
    const t = THREE.MathUtils.smoothstep(p * 2 - seg, 0, 1)
    pos.lerpVectors(POSES[seg].pos, POSES[seg + 1].pos, t)
    look.lerpVectors(POSES[seg].look, POSES[seg + 1].look, t)

    parallax.current.x = THREE.MathUtils.damp(parallax.current.x, state.pointer.x * 0.22, 2, d)
    parallax.current.y = THREE.MathUtils.damp(parallax.current.y, state.pointer.y * 0.14, 2, d)

    camera.position.set(pos.x + parallax.current.x, pos.y + parallax.current.y, pos.z)
    camera.lookAt(look)
  })

  return (
    <>
      <Shard progressRef={progress} />
      <Burst progressRef={progress} />
      <Arcs progressRef={progress} />

      <EffectComposer>
        {/* Threshold 0.85, a touch lower than usual: on a pure black page the specular
            hits on the shard and the core of the burst are the only things above it, and
            they are exactly what should glow. */}
        <Bloom luminanceThreshold={0.85} luminanceSmoothing={0.06} intensity={0.7} mipmapBlur />
        <Vignette offset={0.16} darkness={0.72} />
        <Noise opacity={0.032} premultiply blendFunction={BlendFunction.SOFT_LIGHT} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </>
  )
}
