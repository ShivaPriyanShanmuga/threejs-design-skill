import { Suspense, useEffect, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import Lenis from 'lenis'
import Scene from './Scene'
import './index.css'

const clamp01 = (v) => Math.min(1, Math.max(0, v))
const ramp = (p, a, b) => clamp01((p - a) / (b - a))
// Smoothstep, so the beats ease rather than wipe linearly.
const ease = (t) => t * t * (3 - 2 * t)

export default function App() {
  const scrollRef = useRef(0)
  const beat1 = useRef()
  const beat1ui = useRef()
  const beat2 = useRef()
  const beat3 = useRef()
  const scrim = useRef()
  const foot = useRef()

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const lenis = new Lenis({ duration: reduced ? 0 : 1.15, smoothWheel: !reduced })

    let raf = requestAnimationFrame(function loop(t) {
      lenis.raf(t)
      raf = requestAnimationFrame(loop)
    })

    // Normalise to 0–1 once, here. The scene damps toward it; the DOM reads it directly.
    // Beat opacity is written straight to the elements rather than held in React state —
    // a scroll-driven setState would re-render the tree on every wheel tick.
    const apply = (p) => {
      scrollRef.current = p

      const o1 = 1 - ease(ramp(p, 0.1, 0.24))
      const o2 = ease(ramp(p, 0.3, 0.4)) * (1 - ease(ramp(p, 0.52, 0.62)))
      const o3 = ease(ramp(p, 0.7, 0.82))

      if (beat1.current) {
        beat1.current.style.opacity = o1
        beat1.current.style.transform = `translateY(${(1 - o1) * -3}vh)`
        beat1.current.style.visibility = o1 > 0.01 ? 'visible' : 'hidden'
      }
      if (beat1ui.current) {
        beat1ui.current.style.opacity = o1
        beat1ui.current.style.visibility = o1 > 0.01 ? 'visible' : 'hidden'
      }
      if (beat2.current) {
        beat2.current.style.opacity = o2
        beat2.current.style.visibility = o2 > 0.01 ? 'visible' : 'hidden'
      }
      if (beat3.current) {
        beat3.current.style.opacity = o3
        beat3.current.style.transform = `translateY(${(1 - o3) * 3}vh)`
        beat3.current.style.visibility = o3 > 0.01 ? 'visible' : 'hidden'
      }
      if (foot.current) foot.current.style.opacity = o3
      // Darkens the page behind the manifesto so the text holds against the bloom.
      if (scrim.current) scrim.current.style.opacity = o2 * 0.42
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
      {/* Layer 1: the display type. It sits BELOW the canvas on purpose — the reference
          lets the object pass in front of the headline, hiding "OF N", and that overlap
          is most of why the composition reads as one image rather than text over a video. */}
      <div className="type">
        <div className="beat beat--hero" ref={beat1}>
          <span className="display display--a">BORN</span>
          <span className="display display--b">ATURE</span>
        </div>

        <div className="beat beat--myth" ref={beat3}>
          <span className="display display--c">
            <sup>©</sup>SCARABYNTH
          </span>
          <span className="display display--d">BORN OF</span>
          <span className="display display--e">MYTH</span>
        </div>
      </div>

      <div className="canvas-layer">
        <Canvas
          camera={{ fov: 35, position: [0, 0, 6.4], near: 0.1, far: 60 }}
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          flat /* tone mapping lives in the effect chain */
        >
          <Suspense fallback={null}>
            <Scene scrollRef={scrollRef} />
          </Suspense>
        </Canvas>
      </div>

      <div className="scrim" ref={scrim} />

      {/* Layer 3: everything that must stay readable on top of the 3D. */}
      <div className="ui">
        <nav className="nav">
          <span className="nav__group">
            <a href="#work">
              Work <sup>12</sup>
            </a>
            <a href="#case">Case Study</a>
            <a href="#about">About Us</a>
            <a href="#studio">Studio</a>
          </span>
          <a className="nav__cta" href="#contact">
            <span className="arrow">↗</span> Let&apos;s build something extraordinary
          </a>
        </nav>

        <div className="beat beat--hero-ui" ref={beat1ui}>
          <p className="label label--right">
            Built for
            <br />
            the future
          </p>
          <p className="label label--left">
            We transcend
            <br />
            dimensions
          </p>
          <a className="get" href="#start">
            Get started <span className="arrow">↗</span>
          </a>
          <p className="micro">
            Sculptures of light, cast in ways nature intended. We build digital work that
            behaves like something grown rather than assembled.
          </p>
        </div>

        <div className="beat beat--manifesto" ref={beat2}>
          <p className="manifesto">
            Scarabynth is a creative studio at the intersection of art and technology.
            Inspired by the resilience and beauty of nature, we design digital experiences
            that captivate, innovate and transform.
          </p>
          <div className="pills">
            <span className="pill">✦</span>
            <span className="pill">⚡</span>
            <span className="pill">◉</span>
          </div>
        </div>

        <footer className="foot" ref={foot}>
          <span className="foot__brand">
            <span className="foot__logo" />
            Echoes
            <br />
            of nature
          </span>
          <p className="micro">
            We&apos;d love to hear from you. Whether you are building a new brand or
            evolving one, the conversation starts the same way.
          </p>
          <a className="foot__cta" href="#contact">
            <span className="arrow">↗</span> Enquire for work
          </a>
        </footer>
      </div>

      {/* Scroll room. Three viewports for three beats. */}
      <section className="spacer" />
      <section className="spacer" />
      <section className="spacer" />
    </div>
  )
}
