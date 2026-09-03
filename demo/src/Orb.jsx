import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, MathUtils } from 'three'
import { fragmentShader, vertexShader } from './shaders'

/**
 * The hero form. Everything here is tuned to sit *behind* type:
 * slow enough to read as ambient, dark enough not to fight the text,
 * and damped enough that the mouse feels acknowledged rather than tracked.
 */
export default function Orb({ reducedMotion = false }) {
  const group = useRef()
  const mesh = useRef()

  // Built once. A new uniforms object every render would silently detach the
  // material from the values the loop is mutating.
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAmp: { value: 0.27 },
      // A near-black interior with a blue-violet cast. The form is meant to be read
      // from its edge, like an eclipse — an interior bright enough to see clearly is
      // an interior that competes with the headline sitting on top of it.
      //
      // These are LINEAR values. sRGB output roughly square-roots them, so a linear
      // 0.08 lands near 0.31 on screen — which is why an interior authored to "look
      // dark" still renders as a bright blue ball. Everything here is deliberately tiny.
      uPalA: { value: new Color(0.026, 0.026, 0.058) },
      uPalB: { value: new Color(0.016, 0.016, 0.038) },
      // One shared frequency across the channels. Differing frequencies cycle the hue
      // and drop orange patches into what is supposed to be a single indigo family;
      // the phase offsets in uPalD do the colour work instead.
      uPalC: { value: new Color(0.55, 0.55, 0.55) },
      uPalD: { value: new Color(0.0, 0.04, 0.18) },
      uRim: { value: new Color(0.34, 0.44, 0.98) },
      uRimPower: { value: 2.8 },
    }),
    [],
  )

  useFrame((state, delta) => {
    const d = Math.min(delta, 0.1) // a backgrounded tab returns a huge delta

    // Mutate the MATERIAL's uniforms, not the object handed to the JSX prop. R3F does
    // not preserve that object's identity, so writing to it advances nothing and the
    // shader sits frozen at its initial values — which is exactly what happened here.
    const u = mesh.current.material.uniforms

    if (!reducedMotion) {
      u.uTime.value += d
      // ~140s for a full revolution. Slow enough to read as weight, not as a loop.
      group.current.rotation.y += d * 0.045
      group.current.rotation.x += d * 0.012
    }

    // Damped, low-amplitude mouse response. Lambda 1.6 is deliberately lazy:
    // the orb drifts toward the cursor over about a second and never snaps to it.
    const targetX = reducedMotion ? 0 : state.pointer.y * 0.1
    const targetY = reducedMotion ? 0 : state.pointer.x * 0.14
    mesh.current.rotation.x = MathUtils.damp(mesh.current.rotation.x, targetX, 1.6, d)
    mesh.current.rotation.y = MathUtils.damp(mesh.current.rotation.y, targetY, 1.6, d)
    mesh.current.position.x = MathUtils.damp(mesh.current.position.x, targetY * 0.9, 1.2, d)
    mesh.current.position.y = MathUtils.damp(mesh.current.position.y, targetX * 0.9, 1.2, d)
  })

  return (
    <group ref={group} position={[0, -0.16, 0]}>
      <mesh ref={mesh}>
        {/* Real subdivision — a low-poly sphere has nothing to displace.
            Icosahedron rather than UV sphere: even triangles, no pole pinching. */}
        <icosahedronGeometry args={[1.45, 42]} />
        <shaderMaterial
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
        />
      </mesh>
    </group>
  )
}
