import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * The thin white curves that sweep across the third beat.
 *
 * `CatmullRomCurve3` into `TubeGeometry` rather than `Line`: a line is one device pixel
 * wide whatever the DPR, so it shimmers under motion and vanishes on a retina display.
 * A tube is real geometry with a real thickness and antialiases like everything else.
 */
const CURVES = [
  { pts: [[-7, 2.6, -1], [-2, 1.2, 1.4], [2.4, 2.2, 0.6], [7, 0.4, -1.6]], r: 0.011 },
  { pts: [[-6.5, -2.2, 0.8], [-1.5, -0.4, -1.2], [3, -1.6, 1.0], [7.5, 1.4, 0.2]], r: 0.008 },
  { pts: [[1.2, 4.2, -2], [2.2, 1.0, 0.4], [1.6, -1.8, 0.9], [3.4, -4.4, -0.8]], r: 0.007 },
]

export default function Arcs({ progressRef }) {
  const group = useRef()

  const tubes = useMemo(
    () =>
      CURVES.map(({ pts, r }) => {
        const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)))
        curve.curveType = 'catmullrom'
        curve.tension = 0.4 // the 0.5 default loops too eagerly through four points
        return new THREE.TubeGeometry(curve, 220, r, 8, false)
      }),
    [],
  )

  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#e9e6f2',
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  )

  useFrame((state, delta) => {
    const d = Math.min(delta, 0.1)
    const p = progressRef.current

    const show = THREE.MathUtils.smoothstep(p, 0.66, 0.86)
    material.opacity = THREE.MathUtils.damp(material.opacity, show * 0.72, 6, d)
    group.current.visible = material.opacity > 0.01

    group.current.rotation.z = THREE.MathUtils.lerp(0.22, 0, show)
    group.current.position.x = THREE.MathUtils.lerp(2.2, 0, show)
  })

  return (
    <group ref={group}>
      {tubes.map((g, i) => (
        <mesh key={i} geometry={g} material={material} />
      ))}
    </group>
  )
}
