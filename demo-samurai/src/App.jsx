import { Suspense, useEffect, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import Lenis from 'lenis'
import Scene from './Scene'
import './index.css'

const clamp01 = (v) => Math.min(1, Math.max(0, v))
const ramp = (p, a, b) => clamp01((p - a) / (b - a))
const ease = (t) => t * t * (3 - 2 * t)

export default function App() {
  const scrollRef = useRef(0)
  const lede = useRef()
  const rail = useRef()

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const lenis = new Lenis({ duration: reduced ? 0 : 1.2, smoothWheel: !reduced })
    let raf = requestAnimationFrame(function loop(t) {
      lenis.raf(t)
      raf = requestAnimationFrame(loop)
    })

    // Normalised once. The scene damps toward it; the DOM reads it directly, written straight
    // to the elements so a wheel tick never re-renders the tree.
    const apply = (p) => {
      scrollRef.current = p
      const a = 1 - ease(ramp(p, 0.12, 0.42))
      const b = ease(ramp(p, 0.48, 0.78))
      if (lede.current) {
        lede.current.style.opacity = a
        lede.current.style.transform = `translateY(calc(-50% + ${(1 - a) * -1.4}rem))`
        lede.current.style.visibility = a > 0.01 ? 'visible' : 'hidden'
      }
      if (rail.current) {
        rail.current.style.opacity = b
        rail.current.style.transform = `translateY(${(1 - b) * 1.4}rem)`
        rail.current.style.visibility = b > 0.01 ? 'visible' : 'hidden'
      }
    }
    lenis.on('scroll', ({ progress }) => apply(progress || 0))
    apply(0)

    return () => {
      cancelAnimationFrame(raf)
      lenis.destroy()
    }
  }, [])

  return (
    <div className="page">
      <div className="canvas-layer">
        <Canvas
          camera={{ fov: 35, position: [0, 0.25, 5.6], near: 0.1, far: 60 }}
          dpr={[1, 2]}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          shadows
          flat /* tone mapping lives in the effect chain */
          onCreated={({ gl }) => gl.setClearColor(new THREE.Color('#0a0a0b'), 1)}
        >
          <Suspense fallback={null}>
            <Scene scrollRef={scrollRef} />
          </Suspense>
        </Canvas>
      </div>

      <div className="ui">
        <header className="bar">
          <span className="mark">
            Kurogane
            <em>黒鉄</em>
          </span>
          <span className="meta">Seki · Gifu</span>
        </header>

        <div className="lede" ref={lede}>
          <hr className="rule" />
          <h1 className="head">
            Eleven generations
            <br />
            of folding steel.
            <br />
            <span className="head__quiet">One hand that never hurries.</span>
          </h1>
          <p className="stand">
            Forged in Seki, assembled in silence. Forty-two hours of reserve, and nothing on the
            dial that does not need to be there.
          </p>
          <a className="cta" href="#audience">
            Request an audience <span className="arrow">↗</span>
          </a>
        </div>

        <div className="rail" ref={rail}>
          <dl>
            <div>
              <dt>Case</dt>
              <dd>39mm · Grade 5 titanium</dd>
            </div>
            <div>
              <dt>Movement</dt>
              <dd>In-house cal. K-11</dd>
            </div>
            <div>
              <dt>Reserve</dt>
              <dd>42 hours</dd>
            </div>
            <div>
              <dt>Crystal</dt>
              <dd>Sapphire, boxed</dd>
            </div>
          </dl>
        </div>

        <footer className="foot">
          <span className="meta">Made to order · 24 pieces a year</span>
        </footer>
      </div>

      <section className="spacer" />
      <section className="spacer" />
    </div>
  )
}
