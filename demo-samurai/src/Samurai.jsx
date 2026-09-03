import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * A samurai in armour, as a bust — kabuto, mempo, dō and sode, cropped by the frame.
 *
 * Built from primitives, and deliberately read almost entirely as silhouette with a rim
 * light catching the edges. That is not a dodge: armour photographed in a dark room looks
 * exactly like this, and it means the piece survives being made of lathes and boxes. A
 * fully lit low-poly figure would look like a game asset. This one looks like a photograph
 * of something in a vitrine.
 *
 * Lacquered iron everywhere, brass on the maedate crest alone. No red: the accent is spent
 * on the seconds hand and the rule, and a third use would cost the restraint its effect.
 */

// Helmet bowl, in cross-section: radius against height, apex first.
const HACHI = [
  [0.02, 0.66],
  [0.13, 0.645],
  [0.27, 0.60],
  [0.40, 0.505],
  [0.495, 0.375],
  [0.545, 0.225],
  [0.565, 0.09],
  [0.565, 0.05],
]

export default function Samurai({ progressRef }) {
  const group = useRef()
  const sway = useRef()

  const hachiGeo = useMemo(() => {
    const g = new THREE.LatheGeometry(
      HACHI.map(([x, y]) => new THREE.Vector2(x, y)),
      96,
    )
    g.computeVertexNormals()
    return g
  }, [])

  // Lacquered iron. Dark enough that the form is carried by the rim, metallic enough that
  // the rim is a hard line rather than a soft glow.
  const iron = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#1b1b23',
        metalness: 0.7,
        roughness: 0.44,
        transparent: true,
      }),
    [],
  )
  const ironMatte = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#141419',
        metalness: 0.42,
        roughness: 0.66,
        transparent: true,
      }),
    [],
  )
  const brass = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#b08d57',
        metalness: 1,
        roughness: 0.28,
        transparent: true,
      }),
    [],
  )
  const materials = useMemo(() => [iron, ironMatte, brass], [iron, ironMatte, brass])

  // Lamellar rows. Real armour is hundreds of small plates laced together; at this distance
  // what reads is the stack of horizontal bands, so that is what gets built.
  const shikoro = useMemo(
    () =>
      [0, 1, 2, 3].map((i) => ({
        y: 0.045 - i * 0.085,
        rTop: 0.575 + i * 0.075,
        rBot: 0.65 + i * 0.085,
        h: 0.075,
      })),
    [],
  )
  const kusazuri = useMemo(
    () =>
      [0, 1, 2, 3, 4].map((i) => ({
        y: -0.5 - i * 0.145,
        rTop: 0.58 + i * 0.032,
        rBot: 0.61 + i * 0.035,
        h: 0.125,
      })),
    [],
  )

  useFrame((state, delta) => {
    const d = Math.min(delta, 0.1)
    const p = progressRef.current

    // Hands the stage to the watch. Recedes rather than sliding away — the story is that
    // the armour becomes the object, so it should retreat, not exit.
    const out = THREE.MathUtils.smoothstep(p, 0.24, 0.52)
    const o = 1 - out
    for (const m of materials) m.opacity = o
    group.current.visible = o > 0.01
    group.current.position.z = THREE.MathUtils.lerp(0, -2.2, out)
    group.current.position.x = THREE.MathUtils.lerp(1.2, 0.6, out)
    group.current.scale.setScalar(THREE.MathUtils.lerp(0.62, 0.5, out))

    // Barely alive. A slow breath, and a few degrees toward the cursor.
    const t = state.clock.elapsedTime
    sway.current.rotation.y = THREE.MathUtils.damp(
      sway.current.rotation.y,
      -0.42 + Math.sin(t * 0.09) * 0.05 + state.pointer.x * 0.07,
      1.6,
      d,
    )
    sway.current.position.y = Math.sin(t * 0.16) * 0.012
  })

  const plate = ({ y, rTop, rBot, h }, i, mat) => (
    <mesh key={i} position={[0, y, 0]} material={mat}>
      <cylinderGeometry args={[rTop, rBot, h, 64, 1, true]} />
    </mesh>
  )

  return (
    <group ref={group} position={[1.2, -0.12, 0]} scale={0.62}>
      <group ref={sway}>
        {/* kabuto — the bowl */}
        <mesh geometry={hachiGeo} material={iron} position={[0, 0.62, 0]} />

        {/* tehen: the small opening at the crown */}
        <mesh position={[0, 1.275, 0]} material={brass}>
          <cylinderGeometry args={[0.055, 0.07, 0.045, 24]} />
        </mesh>

        {/* shikoro — the flared neck guard, four laced rows */}
        <group position={[0, 0.62, 0]}>{shikoro.map((s, i) => plate(s, i, iron))}</group>

        {/* fukigaeshi — the two plates swept back at the temples */}
        {[1, -1].map((s) => (
          <mesh
            key={s}
            position={[s * 0.6, 0.66, 0.16]}
            rotation={[0.12, s * -0.5, s * 0.22]}
            material={iron}
          >
            <boxGeometry args={[0.3, 0.26, 0.03]} />
          </mesh>
        ))}

        {/* kuwagata — the two horns rising from the brow, and the only brass on the
            figure. This is the shape that reads as "kabuto" instantly; a closed arc reads
            as a handle. */}
        <group position={[0, 0.98, 0.42]} rotation={[-0.22, 0, 0]}>
          {[1, -1].map((s) => (
            <mesh key={s} position={[s * 0.14, 0.24, 0]} rotation={[0, 0, s * -0.42]} material={brass}>
              <cylinderGeometry args={[0.012, 0.045, 0.56, 16]} />
            </mesh>
          ))}
          {/* the small central plate the horns mount to */}
          <mesh position={[0, 0.02, 0]} material={brass}>
            <cylinderGeometry args={[0.075, 0.09, 0.05, 24]} />
          </mesh>
        </group>

        {/* mempo — the face mask, set back under the brow so the face stays a shadow */}
        <mesh position={[0, 0.52, 0.2]} scale={[0.9, 1, 0.75]} material={ironMatte}>
          <sphereGeometry args={[0.33, 40, 28]} />
        </mesh>

        {/* dō — the chest, five lamellar rows narrowing to the waist */}
        <group position={[0, 0, 0]}>
          {[0, 1, 2, 3, 4].map((i) => (
            <mesh key={i} position={[0, 0.12 - i * 0.15, 0]} material={iron}>
              <cylinderGeometry args={[0.66 - i * 0.02, 0.64 - i * 0.025, 0.14, 56, 1, true]} />
            </mesh>
          ))}
        </group>

        {/* kusazuri — the skirt plates, flaring out below the waist */}
        {kusazuri.map((s, i) => plate(s, i, ironMatte))}

        {/* sode — shoulder plates, three tiers each side */}
        {[1, -1].map((s) => (
          <group key={s} position={[s * 0.72, 0.06, 0]} rotation={[0, 0, s * -0.16]}>
            {[0, 1, 2].map((i) => (
              <mesh key={i} position={[0, -i * 0.15, 0]} rotation={[0.06, 0, 0]} material={iron}>
                <boxGeometry args={[0.42, 0.13, 0.5 + i * 0.03]} />
              </mesh>
            ))}
          </group>
        ))}
      </group>
    </group>
  )
}
