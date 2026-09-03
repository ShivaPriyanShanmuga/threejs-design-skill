import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { FINISHES, PART_FINISH } from './materials'

const MODEL = '/product.glb'
// Draco geometry needs its decoder served alongside the model. Passing the path as
// useGLTF's second argument is enough — drei wires up the DRACOLoader itself. Passing
// `true` instead points it at a Google CDN, which is a runtime dependency on someone
// else's uptime and a second copy of the decoder in the bundle.
const DECODER = '/draco/gltf/'

useGLTF.preload(MODEL, DECODER)

export default function Product({ finish }) {
  const { scene } = useGLTF(MODEL, DECODER)
  const invalidate = useThree((s) => s.invalidate)

  // One material per archetype, built once and shared across every part that wants it.
  // Constructing these per render would recompile a shader each time.
  const materials = useMemo(() => {
    const out = {}
    for (const [key, def] of Object.entries(FINISHES)) out[key] = def.make()
    return out
  }, [])

  // R3F disposes what it created from JSX. These came from useMemo, so they are ours.
  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials])

  useEffect(() => {
    scene.traverse((o) => {
      if (!o.isMesh) return
      const key = o.name === 'body' ? finish : PART_FINISH[o.name]
      if (materials[key]) o.material = materials[key]
      o.castShadow = true
      o.receiveShadow = true
    })
    // frameloop is "demand", so a change that is not driven by useFrame has to ask for a
    // frame explicitly or the swap never appears.
    invalidate()
  }, [scene, finish, materials, invalidate])

  return <primitive object={scene} />
}
