import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import Lenis from 'lenis'
import Scene from './Scene'
import './index.css'

function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = (e) => setReduced(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

export default function App() {
  const scrollRef = useRef(0)
  const [selected, setSelected] = useState(null)
  const [scrolled, setScrolled] = useState(false)
  const reduced = useReducedMotion()

  useEffect(() => {
    // Smoothing off under reduced motion: native scroll, no interpolation.
    const lenis = new Lenis({ duration: reduced ? 0 : 1.1, smoothWheel: !reduced })
    let raf = requestAnimationFrame(function loop(t) {
      lenis.raf(t)
      raf = requestAnimationFrame(loop)
    })
    // Normalise to 0–1 once, in one place; the scene damps toward it.
    lenis.on('scroll', ({ progress }) => {
      scrollRef.current = progress || 0
      setScrolled(progress > 0.08)
    })
    return () => {
      cancelAnimationFrame(raf)
      lenis.destroy()
    }
  }, [reduced])

  const onSelect = useCallback((i) => setSelected(i), [])

  return (
    <div className="page">
      <div className="canvas-layer">
        <Canvas
          camera={{ fov: 35, position: [0, 8.0, 16.4], near: 0.1, far: 120 }}
          dpr={[1, 2]}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          shadows
          flat /* tone mapping lives in the effect chain */
        >
          <Suspense fallback={null}>
            <Scene scrollRef={scrollRef} selected={selected} onSelect={onSelect} />
          </Suspense>
        </Canvas>
      </div>

      <header className="bar">
        <span className="mark">Avery Lane</span>
        <span className="bar__right">
          <span className="meta">Menu</span>
          <span className="burger" aria-hidden="true">
            <i />
            <i />
          </span>
        </span>
      </header>

      <section className="hero">
        <div className={`hero__copy ${scrolled ? 'is-out' : ''}`}>
          <p className="kicker">Hi, I am</p>
          <h1 className="name">
            Avery
            <br />
            Lane
          </h1>
          <p className="role">Frontend &amp; Creative Engineer</p>
          <div className="actions">
            <a className="btn btn--solid" href="#resume">
              Résumé
            </a>
            <div className="actions__row">
              <a className="btn" href="#contact">
                Hire me
              </a>
              <a className="btn btn--icon" href="#github" aria-label="GitHub">
                <Github />
              </a>
              <a className="btn btn--icon" href="#linkedin" aria-label="LinkedIn">
                <LinkedIn />
              </a>
            </div>
          </div>
        </div>

        <div className={`cue ${scrolled ? 'is-out' : ''}`} aria-hidden="true">
          <span className="cue__mouse">
            <i />
          </span>
        </div>
      </section>

      {/* Scroll room for the second beat. Its heading and copy live in the 3D scene. */}
      <section className="skills" aria-label="Skills" />
    </div>
  )
}

function Github() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
      <path d="M12 .5C5.73.5.5 5.73.5 12a11.5 11.5 0 0 0 7.86 10.93c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.5 3.17-1.18 3.17-1.18.63 1.59.24 2.76.12 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.7 5.41-5.26 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z" />
    </svg>
  )
}

function LinkedIn() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
      <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM2.4 21.5h5.16V9.75H2.4V21.5Zm7.9-11.75V21.5h5.15v-6.5c0-1.72.33-3.38 2.46-3.38 2.1 0 2.13 1.96 2.13 3.49v6.39h5.15v-7.42c0-4.47-.96-7.9-6.18-7.9-2.5 0-4.19 1.38-4.88 2.68h-.07V9.75h-4.9Z" />
    </svg>
  )
}
