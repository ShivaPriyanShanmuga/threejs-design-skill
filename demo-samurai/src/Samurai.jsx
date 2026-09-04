import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { makeKabutoTexture } from './kabuto'

/**
 * The kabuto: a flat mark on a quad, shaded so it reads as an object rather than a sticker.
 *
 * Everything dimensional here is faked from the alpha channel. Offsetting the mask against
 * itself and taking the difference gives a lit edge on one side and a dark one opposite,
 * which is the whole illusion — the eye reads a rim highlight as form. A wider tap adds
 * falloff into the interior, a gradient adds depth, and the parallax comes from moving the
 * quad rather than from any geometry.
 *
 * `raycast` is disabled: the brief says the figure is not interactive, and a silent pointer
 * target sitting behind the copy is exactly the thing that eats clicks later.
 */
export default function Samurai({ progressRef }) {
  const mesh = useRef()
  const viewport = useThree((s) => s.viewport)
  const { texture, aspect } = useMemo(() => makeKabutoTexture(), [])

  const uniforms = useMemo(
    () => ({
      uMap: { value: texture },
      uOpacity: { value: 0 },
      uFill: { value: new THREE.Color('#1d1d26') },
      uRim: { value: new THREE.Color('#8f9099') },
      uEdge: { value: new THREE.Color('#050507') },
      uTime: { value: 0 },
      uSlash: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
    }),
    [texture],
  )

  const height = viewport.height * 0.86
  const width = height * aspect

  useFrame((state, delta) => {
    const d = Math.min(delta, 0.1)
    const p = progressRef.current
    const u = mesh.current.material.uniforms

    u.uTime.value += d

    // Present from the first frame — a fade-in ramp starting above zero means the hero
    // is empty when the page loads, which is exactly when it matters most.
    const out = THREE.MathUtils.smoothstep(p, 0.32, 0.58)
    u.uOpacity.value = 1 - out
    // The cut runs through it before it leaves.
    u.uSlash.value = THREE.MathUtils.smoothstep(p, 0.24, 0.46)
    // Screen size, so the cut can be computed in screen space and land exactly on the
    // DOM hairline. In UV space the two were at different angles and read as two events.
    u.uResolution.value.set(state.size.width, state.size.height)
    mesh.current.visible = u.uOpacity.value > 0.005

    // Parallax only. A few percent, damped: depth, not a toy.
    mesh.current.position.x = THREE.MathUtils.damp(
      mesh.current.position.x,
      0.5 + state.pointer.x * 0.12,
      2,
      d,
    )
    mesh.current.position.y = THREE.MathUtils.damp(
      mesh.current.position.y,
      -0.05 + state.pointer.y * 0.08 - p * 0.3,
      2,
      d,
    )
  })

  return (
    <mesh ref={mesh} position={[0.5, -0.05, -1.4]} raycast={() => null} renderOrder={-1}>
      <planeGeometry args={[width, height]} />
      <shaderMaterial
        transparent
        depthWrite={false}
        uniforms={uniforms}
        vertexShader={`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          uniform sampler2D uMap;
          uniform float uOpacity;
          uniform float uTime;
          uniform float uSlash;
          uniform vec2 uResolution;
          uniform vec3 uFill;
          uniform vec3 uRim;
          uniform vec3 uEdge;
          varying vec2 vUv;

          float mask(vec2 uv) { return texture2D(uMap, uv).a; }

          void main() {
            float m = mask(vUv);
            if (m < 0.004) discard;

            // Offset the mask against itself: the difference is a lit edge on the side the
            // light comes from and a dark one opposite. This is the entire illusion.
            vec2 L = vec2(-0.0040, 0.0050);
            float lit = clamp(m - mask(vUv - L), 0.0, 1.0);
            float shade = clamp(m - mask(vUv + L), 0.0, 1.0);

            // Wider taps for a soft falloff inward, so the middle is not flat.
            float soft = 0.0;
            soft += mask(vUv + vec2( 0.013, 0.0));
            soft += mask(vUv + vec2(-0.013, 0.0));
            soft += mask(vUv + vec2( 0.0,  0.016));
            soft += mask(vUv + vec2( 0.0, -0.016));
            soft *= 0.25;

            vec3 col = mix(uEdge, uFill, soft);
            col = mix(col, uFill * 1.7, smoothstep(0.2, 0.95, vUv.y) * 0.55);
            col += uRim * lit * 2.6;
            col -= vec3(0.015) * shade * 2.0;

            // The cut, in SCREEN space so it coincides with the DOM hairline exactly:
            // same angle (-38deg), same centre. Computed from vUv it sat on a different
            // diagonal and the page read as two unrelated strokes.
            vec2 fc = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
            vec2 centre = vec2(uResolution.x * 0.5, uResolution.y * 0.46);
            float dist = dot(fc - centre, vec2(0.616, 0.788));   // normal of a -38deg line
            float core = 1.0 - smoothstep(0.0, 22.0, abs(dist));
            float halo = 1.0 - smoothstep(0.0, 120.0, abs(dist));
            float strike = sin(clamp(uSlash, 0.0, 1.0) * 3.14159);
            col += vec3(1.0, 0.94, 0.9) * (core * 2.2 + halo * 0.35) * strike;

            float a = m * uOpacity * (1.0 - core * 0.75 * strike);

            float dither = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
            col += dither;

            gl_FragColor = vec4(col, a);
          }
        `}
      />
    </mesh>
  )
}
