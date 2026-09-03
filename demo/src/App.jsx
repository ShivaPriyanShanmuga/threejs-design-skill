import { Suspense, useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Bloom, EffectComposer, Noise, ToneMapping, Vignette } from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode } from 'postprocessing'
import Orb from './Orb'
import './index.css'

function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = (e) => setReduced(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

export default function App() {
  const reducedMotion = useReducedMotion()

  return (
    <main className="hero">
      <div className="hero__canvas" aria-hidden="true">
        <Canvas
          camera={{ fov: 35, position: [0, 0, 8.6], near: 0.1, far: 100 }}
          dpr={[1, 2]}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          flat /* tone mapping moves into the effect chain below */
        >
          <Suspense fallback={null}>
            <Orb reducedMotion={reducedMotion} />
            <EffectComposer>
              {/* Threshold 0.9: only the fresnel rim is bright enough to bloom,
                  so the silhouette glows and the rest of the frame stays clean. */}
              <Bloom luminanceThreshold={0.9} luminanceSmoothing={0.04} intensity={0.85} mipmapBlur />
              <Vignette offset={0.2} darkness={0.78} />
              <Noise opacity={0.03} premultiply blendFunction={BlendFunction.SOFT_LIGHT} />
              <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
            </EffectComposer>
          </Suspense>
        </Canvas>
      </div>

      {/* A soft scrim between the 3D and the type. This is what actually buys the
          contrast — the alternative is making the typography heavier, which loses. */}
      <div className="hero__scrim" aria-hidden="true" />

      <div className="hero__content">
        <header className="hero__bar">
          <span className="mark">
            <i className="mark__dot" /> avery lane
          </span>
          <span className="meta">Index — 2026</span>
        </header>

        <div className="hero__center">
          <h1 className="title">Avery Lane</h1>
          <p className="subtitle">Designer and developer building interfaces that move.</p>
        </div>

        <footer className="hero__bar hero__bar--foot">
          <nav className="nav">
            <a href="#work">Work</a>
            <a href="#writing">Writing</a>
            <a href="#contact">Contact</a>
          </nav>
          <span className="meta">Toronto, ON</span>
        </footer>
      </div>
    </main>
  )
}
