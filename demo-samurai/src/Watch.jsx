import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * The watch, built from primitives in watch space: +Y points out of the dial, and the whole
 * group is tipped so the dial faces the camera. Nothing here is a soft blob — the case is a
 * lathe with real chamfers, because "machined, not modelled" is a silhouette problem before
 * it is a material problem.
 */

// Case profile, in cross-section: radius against height. The three short diagonal runs are
// the chamfers, and they are what catch the key light as a hard line.
const CASE_PROFILE = [
  [0.0, -0.19],
  [0.72, -0.19],
  [0.72, -0.19],
  [0.86, -0.172],
  [0.86, -0.172],
  [0.925, -0.115],
  [0.925, -0.115],
  [0.972, -0.03],
  [0.972, -0.03],
  [0.985, 0.055],
  [0.985, 0.055],
  [0.94, 0.126],
  [0.94, 0.126],
  [0.892, 0.166],
  [0.892, 0.166],
  [0.0, 0.166],
]

const INDEX_COUNT = 12

export default function Watch({ progressRef }) {
  const group = useRef()
  const spin = useRef()
  const second = useRef()
  const indices = useRef()

  const caseGeo = useMemo(() => {
    const pts = CASE_PROFILE.map(([x, y]) => new THREE.Vector2(x, y))
    const g = new THREE.LatheGeometry(pts, 128)
    g.computeVertexNormals()
    return g
  }, [])

  // A hand pivots at one end, so the geometry is pushed off its own origin rather than the
  // mesh being offset — that keeps rotation a single number.
  const hand = (w, t, len, tail = 0) => {
    const g = new THREE.BoxGeometry(w, t, len + tail)
    g.translate(0, 0, len / 2 - tail / 2)
    return g
  }
  const hourGeo = useMemo(() => hand(0.05, 0.016, 0.46), [])
  const minGeo = useMemo(() => hand(0.036, 0.016, 0.68), [])
  const secGeo = useMemo(() => hand(0.014, 0.011, 0.78, 0.2), [])
  const indexGeo = useMemo(() => new THREE.BoxGeometry(0.034, 0.018, 0.13), [])

  // Materials, straight out of the skill's parameter sets.
  const steel = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#9b9ea3', metalness: 1, roughness: 0.3 }),
    [],
  )
  const polished = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#b9bcc2', metalness: 1, roughness: 0.075 }),
    [],
  )
  // Sapphire, not glass: ior 1.77 rather than 1.5, and thickness matched to the real part.
  const crystal = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        transmission: 1,
        thickness: 0.08,
        ior: 1.77,
        roughness: 0.02,
        metalness: 0,
        transparent: false,
        envMapIntensity: 0.4,
        color: '#ffffff',
      }),
    [],
  )
  const dial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#060608', metalness: 0.05, roughness: 0.94 }),
    [],
  )
  const handSteel = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#eef1f6', metalness: 1, roughness: 0.14 }),
    [],
  )
  const brass = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#d8b478', metalness: 1, roughness: 0.16 }),
    [],
  )
  const lacquer = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#b8202e',
        metalness: 0,
        roughness: 0.35,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
      }),
    [],
  )
  const leather = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#15151a',
        metalness: 0,
        roughness: 0.78,
        sheen: 0.6,
        sheenRoughness: 0.8,
        sheenColor: new THREE.Color('#3a3540'),
      }),
    [],
  )

  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    for (let i = 0; i < INDEX_COUNT; i++) {
      const a = (i / INDEX_COUNT) * Math.PI * 2
      e.set(0, -a, 0)
      q.setFromEuler(e)
      // 12 and 6 get a longer marker; the rest are batons.
      const long = i % 3 === 0 ? 1.55 : 1
      m.compose(
        new THREE.Vector3(Math.sin(a) * 0.70, 0.172, Math.cos(a) * 0.70),
        q,
        new THREE.Vector3(long > 1 ? 1.25 : 1, 1, long),
      )
      indices.current.setMatrixAt(i, m)
    }
    indices.current.instanceMatrix.needsUpdate = true
  }, [])

  useFrame((state, delta) => {
    const d = Math.min(delta, 0.1)
    const p = progressRef.current

    // Slow enough that you are not sure it is moving: a full turn takes about three minutes.
    spin.current.rotation.y += d * 0.035

    // The watch is the second beat now. It arrives from the right, turned, and settles
    // face-on as the armour recedes — the page's one idea, told as a movement.
    const enter = THREE.MathUtils.smoothstep(p, 0.3, 0.68)
    group.current.rotation.y = THREE.MathUtils.damp(
      group.current.rotation.y,
      THREE.MathUtils.lerp(0.62, 0.1, enter),
      3,
      d,
    )
    group.current.rotation.x = THREE.MathUtils.damp(
      group.current.rotation.x,
      THREE.MathUtils.lerp(-0.34, -0.2, enter),
      3,
      d,
    )
    group.current.position.x = THREE.MathUtils.lerp(4.9, 1.15, enter)
    group.current.position.y = THREE.MathUtils.lerp(-0.35, 0, enter)

    // A few degrees of cursor parallax. Nothing more, per the brief.
    const tx = state.pointer.y * 0.07
    const ty = state.pointer.x * 0.09
    spin.current.rotation.x = THREE.MathUtils.damp(spin.current.rotation.x, tx, 2, d)
    spin.current.rotation.z = THREE.MathUtils.damp(spin.current.rotation.z, ty, 2, d)

    // The one moving hand. A real seconds hand sweeps; a quartz one ticks. This one sweeps.
    second.current.rotation.y = -state.clock.elapsedTime * 0.35
  })

  return (
    <group ref={group} position={[4.9, -0.35, 0]} scale={0.74} rotation={[-0.34, 0.62, 0]}>
      <group ref={spin}>
        {/* dial faces the camera */}
        {/* +PI/2, not -PI/2: -PI/2 maps the dial normal to -Z and shows the caseback. */}
        <group rotation={[Math.PI / 2, 0, 0]}>
          <mesh geometry={caseGeo} material={steel} castShadow receiveShadow />

          {/* bezel — the one polished surface, so it reads as a hard bright line */}
          <mesh position={[0, 0.163, 0]} rotation={[Math.PI / 2, 0, 0]} material={polished}>
            <torusGeometry args={[0.9, 0.032, 20, 128]} />
          </mesh>

          <mesh position={[0, 0.15, 0]} material={dial}>
            <cylinderGeometry args={[0.885, 0.885, 0.012, 96]} />
          </mesh>

          <instancedMesh ref={indices} args={[indexGeo, brass, INDEX_COUNT]} />

          {/* hands, stacked a hair apart so they never z-fight */}
          <mesh geometry={hourGeo} material={handSteel} position={[0, 0.182, 0]} rotation={[0, 1.9, 0]} />
          <mesh geometry={minGeo} material={handSteel} position={[0, 0.191, 0]} rotation={[0, 4.4, 0]} />
          <mesh ref={second} geometry={secGeo} material={lacquer} position={[0, 0.199, 0]} />
          <mesh position={[0, 0.204, 0]} material={handSteel}>
            <cylinderGeometry args={[0.035, 0.035, 0.02, 24]} />
          </mesh>

          {/* sapphire, last, so it refracts everything under it */}
          <mesh position={[0, 0.212, 0]} material={crystal}>
            <cylinderGeometry args={[0.878, 0.878, 0.05, 96]} />
          </mesh>

          {/* crown at three o'clock */}
          <mesh position={[1.02, -0.02, 0]} rotation={[0, 0, Math.PI / 2]} material={steel}>
            <cylinderGeometry args={[0.075, 0.075, 0.09, 32]} />
          </mesh>

          {/* lugs and strap */}
          {[1, -1].map((s) => (
            <group key={s}>
              <mesh position={[0, -0.02, s * 0.96]} material={steel}>
                <boxGeometry args={[0.46, 0.16, 0.24]} />
              </mesh>
              <mesh position={[0, -0.06, s * 1.55]} rotation={[s * 0.18, 0, 0]} material={leather}>
                <boxGeometry args={[0.42, 0.075, 1.1]} />
              </mesh>
              <mesh position={[0, -0.22, s * 2.35]} rotation={[s * 0.5, 0, 0]} material={leather}>
                <boxGeometry args={[0.36, 0.065, 0.9]} />
              </mesh>
            </group>
          ))}
        </group>
      </group>
    </group>
  )
}
