import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { NOISE } from './shaders'

/**
 * The purple bloom of the second beat.
 *
 * The reference is almost certainly a pre-rendered volumetric — the kind of thing that
 * comes out of Houdini, not a browser. The first attempt here was 160k additive points,
 * and it was the wrong tool twice over: a point cloud dense enough to read as powder is
 * enormous, and spreading it wide enough to fill the frame drops the density below the
 * point where it reads as anything at all. It drew all 160k points and looked like an
 * empty page.
 *
 * So this is the other route the skill points at: for something that fills the frame and
 * has no silhouette of its own, do not build geometry — render one quad and do the work in
 * the fragment shader. Four vertices, control of every pixel, and density is a number
 * rather than an emergent property of how many sprites happen to overlap.
 */
export default function Burst({ progressRef }) {
  const mesh = useRef()
  const viewport = useThree((s) => s.viewport)

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uOpacity: { value: 0 },
      uAspect: { value: 1.6 },
      uCore: { value: new THREE.Color('#f6e7ff') },
      uMid: { value: new THREE.Color('#c07ae8') },
      uEdge: { value: new THREE.Color('#5b1fa8') },
    }),
    [],
  )

  useFrame((state, delta) => {
    const d = Math.min(delta, 0.1)
    const p = progressRef.current

    // Drive the material's own uniforms, not the object handed to the JSX prop. R3F does
    // not guarantee those are the same object, and when they are not the mutations land
    // nowhere: the shader keeps its initial values and the scene renders as if progress
    // never advanced. Reading them back off the material is the version that cannot lie.
    const u = mesh.current.material.uniforms
    u.uTime.value += d
    u.uProgress.value = THREE.MathUtils.smoothstep(p, 0.24, 0.6)
    u.uOpacity.value =
      THREE.MathUtils.smoothstep(p, 0.24, 0.34) * (1 - THREE.MathUtils.smoothstep(p, 0.56, 0.7))
    u.uAspect.value = state.viewport.aspect

    mesh.current.visible = u.uOpacity.value > 0.004
  })

  return (
    <mesh ref={mesh} position={[0, 0, 0.6]} renderOrder={2}>
      <planeGeometry args={[viewport.width * 1.3, viewport.height * 1.3]} />
      <shaderMaterial
        transparent
        depthWrite={false}
        depthTest={false}
        uniforms={uniforms}
        vertexShader={`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          uniform float uTime;
          uniform float uProgress;
          uniform float uOpacity;
          uniform float uAspect;
          uniform vec3 uCore;
          uniform vec3 uMid;
          uniform vec3 uEdge;
          varying vec2 vUv;

          ${NOISE}

          // fbm returns roughly -1..1; remap where a 0..1 field is wanted.
          float fbm01(vec3 p) { return fbm(p) * 0.5 + 0.5; }

          void main() {
            vec2 p = (vUv - 0.5) * 2.0;
            p.x *= uAspect;

            float r = length(p);
            float ang = atan(p.y, p.x);

            // Angular noise sampled around a circle, so it wraps seamlessly and gives the
            // burst a spiked, uneven edge instead of a clean disc.
            vec3 ac = vec3(cos(ang), sin(ang), uTime * 0.03) * 2.6;
            float spikes = fbm01(ac);

            // How far the cloud has reached at this angle.
            float reach = uProgress * (0.5 + spikes * 2.3);

            // Domain-warped smoke for the internal texture. Two levels is where it stops
            // looking like noise and starts looking like something billowing.
            vec3 wc = vec3(p * 1.9, uTime * 0.035);
            vec3 warp = vec3(fbm(wc), fbm(wc + 3.7), fbm(wc + 8.1));
            float smoke = fbm01(wc + warp * 2.2);
            // The field is gentle; stretch it so the cloud has real light and shade.
            smoke = clamp((smoke - 0.42) * 3.4 + 0.42, 0.0, 1.0);

            float body = 1.0 - smoothstep(reach * 0.1, reach, r);
            float dens = clamp(body * (0.12 + smoke * 1.5), 0.0, 1.0);
            dens = pow(dens, 1.25);

            float heat = 1.0 - clamp(r / max(reach, 0.001), 0.0, 1.0);
            vec3 color = mix(uEdge, uMid, smoothstep(0.0, 0.6, heat));
            color = mix(color, uCore, smoothstep(0.68, 1.0, heat) * 0.9);

            // Dither: a smooth volumetric ramp on a black page bands badly at 8 bits.
            float dither = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
            color += dither;

            float a = dens * uOpacity;
            if (a < 0.003) discard;
            gl_FragColor = vec4(color, a);
          }
        `}
      />
    </mesh>
  )
}
