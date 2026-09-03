import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, Noise, ToneMapping, Vignette } from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import Watch from './Watch'

/**
 * A product studio, not a stage. One key raking across the case, one cool rim to peel it off
 * the black, and an environment so the steel has something to reflect — without which brushed
 * metal reads as grey clay no matter how the lights are set.
 */
function Studio() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.03).texture
    scene.environment = env
    // Dimmed hard. The brief asks for low-key: most of the object in shadow, one edge lit.
    scene.environmentIntensity = 0.26
    pmrem.dispose()
    return () => {
      scene.environment = null
      env.dispose()
    }
  }, [gl, scene])
  return null
}

export default function Scene({ scrollRef }) {
  const camera = useThree((s) => s.camera)
  const progress = useRef(0)
  const smooth = useRef(0)
  const target = useMemo(() => new THREE.Vector3(-0.35, 0, 0), [])

  useFrame((state, delta) => {
    const d = Math.min(delta, 0.1)
    smooth.current = THREE.MathUtils.damp(smooth.current, scrollRef.current, 4, d)
    progress.current = smooth.current

    // The camera barely moves; the object does the work.
    const p = smooth.current
    camera.position.set(
      state.pointer.x * 0.18,
      0.25 + state.pointer.y * 0.12 - p * 0.15,
      THREE.MathUtils.lerp(5.6, 5.0, THREE.MathUtils.smoothstep(p, 0, 1)),
    )
    camera.lookAt(target)
  })

  return (
    <>
      <Studio />

      {/* Key: pushed behind the plane of the dial so it truly rakes. Frontal, it lit the
          matte dial face-on and a matte black surface under a strong frontal key is grey —
          which is why the dial kept reading as a light disc however dark its colour was. */}
      <directionalLight
        position={[5.0, 4.0, -0.9]}
        intensity={3.4}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-near={1}
        shadow-camera-far={20}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-3}
        shadow-normalBias={0.02}
      />
      {/* Cool rim from behind left, to separate steel from a black ground. */}
      <directionalLight position={[-5, 1.5, -3.5]} intensity={1.1} color="#93a6c8" />
      {/* A weak frontal fill, standing in for the reflector a photographer would use: just
          enough to put light in the hands and markers without lifting the dial. */}
      <directionalLight position={[0.6, 0.8, 4.5]} intensity={0.42} color="#cfd6e2" />

      <Watch progressRef={progress} />

      <EffectComposer>
        {/* No bloom. The brief says nothing glows, and on a page this dark a bloom pass is
            the fastest way to make an expensive object look cheap. */}
        <Vignette offset={0.18} darkness={0.78} />
        <Noise opacity={0.028} premultiply blendFunction={BlendFunction.SOFT_LIGHT} />
        {/* Neutral, not ACES: this is a product shot, and Khronos PBR Neutral is the one that
            keeps a lacquer red the same red instead of pushing it orange in the highlights. */}
        <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      </EffectComposer>
    </>
  )
}
