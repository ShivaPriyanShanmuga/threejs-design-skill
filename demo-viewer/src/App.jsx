import { Suspense, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import {
  AdaptiveDpr,
  ContactShadows,
  Environment,
  OrbitControls,
  PerformanceMonitor,
} from '@react-three/drei'
import Product from './Product'
import { FINISHES, FINISH_KEYS } from './materials'
import './index.css'

export default function App() {
  const [finish, setFinish] = useState('brushed')
  const [degraded, setDegraded] = useState(false)

  return (
    <div className="page">
      <Canvas
        // frameloop="demand" renders only when something asks for a frame. A viewer that
        // sits idle most of the time should not run the GPU at 60fps; OrbitControls and
        // drei call invalidate() for you, and Product does it on a material swap.
        frameloop="demand"
        camera={{ fov: 35, position: [4.8, 3.1, 5.9], near: 0.1, far: 60 }}
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        shadows
      >
        <color attach="background" args={['#0d0f14']} />

        <PerformanceMonitor onDecline={() => setDegraded(true)}>
          <AdaptiveDpr pixelated />

          {/* Environment before lights. Transmission and clearcoat have nothing to
              refract or reflect without one, and metal reads as grey clay. */}
          <Environment preset="studio" environmentIntensity={0.75} />

          <directionalLight
            position={[4, 6, 3]}
            intensity={1.6}
            castShadow
            shadow-mapSize={degraded ? [512, 512] : [1536, 1536]}
            shadow-camera-near={1}
            shadow-camera-far={18}
            shadow-camera-left={-3}
            shadow-camera-right={3}
            shadow-camera-top={3}
            shadow-camera-bottom={-3}
            shadow-normalBias={0.02}
          />
          <directionalLight position={[-5, 2, -4]} intensity={0.7} color="#9db6ff" />

          <Suspense fallback={null}>
            <Product finish={finish} />
          </Suspense>

          {/* Cheaper than a second shadow-casting light, and usually better looking. */}
          <ContactShadows
            position={[0, 0, 0]}
            opacity={0.6}
            scale={8}
            blur={2.4}
            far={3}
            resolution={degraded ? 256 : 512}
          />

          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.08}
            minDistance={4}
            maxDistance={12}
            minPolarAngle={0.2}
            maxPolarAngle={Math.PI / 2 - 0.02} /* never orbit under the floor */
            target={[0, 0.8, 0]}
          />
        </PerformanceMonitor>
      </Canvas>

      <header className="bar">
        <span className="mark">Finish study</span>
        <span className="meta">
          drag to orbit{degraded ? ' · quality reduced' : ''}
        </span>
      </header>

      <div className="panel">
        <p className="panel__label">Body material</p>
        <div className="swatches">
          {FINISH_KEYS.map((k) => (
            <button
              key={k}
              className={`swatch ${k === finish ? 'is-on' : ''}`}
              onClick={() => setFinish(k)}
            >
              {FINISHES[k].label}
            </button>
          ))}
        </div>
        <p className="panel__note">{FINISHES[finish].note}</p>
        <p className="panel__foot">
          The other parts stay fixed, so all five archetypes are on screen at once: the collar is
          iridescent, the dome is transmission glass, the band is sheen, the base is clearcoat.
        </p>
      </div>
    </div>
  )
}
