import { Suspense, useEffect, useRef, useState } from 'react'
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
  const slash = useRef()
  const reveal = useRef()
  const handle = useRef()
  const [qty, setQty] = useState(1)

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const lenis = new Lenis({ duration: reduced ? 0 : 1.2, smoothWheel: !reduced })
    let raf = requestAnimationFrame(function loop(t) {
      lenis.raf(t)
      raf = requestAnimationFrame(loop)
    })

    const apply = (p) => {
      scrollRef.current = p

      // 1. the headline gives way
      const a = 1 - ease(ramp(p, 0.1, 0.38))
      if (lede.current) {
        lede.current.style.opacity = a
        lede.current.style.transform = `translateY(calc(-50% + ${(1 - a) * -1.4}rem))`
        lede.current.style.visibility = a > 0.01 ? 'visible' : 'hidden'
      }

      // 2. the cut itself: a bright line that arrives, holds, and is gone once the wound
      //    starts opening. It only exists during the strike.
      const s = ramp(p, 0.24, 0.46)
      if (slash.current) {
        const bright = Math.sin(clamp01(s) * Math.PI)
        slash.current.style.opacity = bright
        slash.current.style.transform = `translate(-50%, -50%) rotate(-38deg) scaleX(${0.2 + s * 0.9})`
      }

      // 3. the wound opens. A band centred on the same diagonal, widening until it has
      //    taken the screen. Content inside is revealed by the clip, not faded in.
      const w = ease(ramp(p, 0.44, 0.82))
      if (reveal.current) {
        const h = w * 130
        reveal.current.style.clipPath = `polygon(0% ${100 - h}%, 100% ${-h}%, 100% ${h}%, 0% ${100 + h}%)`
        reveal.current.style.visibility = w > 0.005 ? 'visible' : 'hidden'
      }
      // The watch becomes handleable at the same point; say so once, quietly.
      if (handle.current) handle.current.style.opacity = ease(ramp(p, 0.62, 0.8)) * 0.9
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
          flat
          onCreated={({ gl }) => gl.setClearColor(new THREE.Color('#0a0a0b'), 1)}
        >
          <Suspense fallback={null}>
            <Scene scrollRef={scrollRef} />
          </Suspense>
        </Canvas>
      </div>

      {/* the blade's own light, in the DOM so it stays a hard hairline at any DPR */}
      <div className="slash" ref={slash} aria-hidden="true" />

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

        <footer className="foot">
          <span className="meta">Made to order · 24 pieces a year</span>
        </footer>
      </div>

      <p className="handle" ref={handle} aria-hidden="true">
        Drag to examine
      </p>

      {/* revealed through the cut */}
      <div className="reveal" ref={reveal}>
        <div className="reveal__panel">
          <p className="reveal__eyebrow">Calibre K-11 · No. 07 of 24</p>
          <p className="reveal__price">¥ 1,480,000</p>

          <dl className="reveal__specs">
            <div>
              <dt>Case</dt>
              <dd>39mm · Grade 5 titanium</dd>
            </div>
            <div>
              <dt>Reserve</dt>
              <dd>42 hours</dd>
            </div>
            <div>
              <dt>Crystal</dt>
              <dd>Sapphire, boxed</dd>
            </div>
            <div>
              <dt>Lead time</dt>
              <dd>14 months</dd>
            </div>
          </dl>

          <div className="reveal__buy">
            <div className="qty">
              <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Fewer">
                −
              </button>
              <span>{qty}</span>
              <button onClick={() => setQty((q) => Math.min(2, q + 1))} aria-label="More">
                +
              </button>
            </div>
            <a className="buy" href="#reserve">
              Reserve {qty === 1 ? 'one' : 'two'} <span className="arrow">↗</span>
            </a>
          </div>

          <p className="reveal__note">
            Two pieces per client, per lifetime. Payment on completion, never on order.
          </p>
        </div>
      </div>

      <section className="spacer" />
      <section className="spacer" />
    </div>
  )
}
