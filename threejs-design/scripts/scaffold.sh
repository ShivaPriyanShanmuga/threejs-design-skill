#!/usr/bin/env bash
#
# scaffold.sh <name> <r3f|vanilla>
#
# Creates a Vite project non-interactively with Three.js installed and a starter scene that
# already has the defaults right: fov 35, DPR capped at 2, ACES tone mapping, an environment
# map before any lights, and a delta-driven loop.
#
# Everything it writes is meant to be replaced. It exists so you skip setup, not so you ship it.

set -euo pipefail

NAME="${1:-}"
STACK="${2:-}"

if [ -z "$NAME" ] || [ -z "$STACK" ]; then
  echo "usage: scaffold.sh <name> <r3f|vanilla>" >&2
  exit 1
fi

case "$STACK" in
  r3f)     TEMPLATE="react" ;;
  vanilla) TEMPLATE="vanilla" ;;
  *) echo "stack must be 'r3f' or 'vanilla', got '$STACK'" >&2; exit 1 ;;
esac

if [ -e "$NAME" ]; then
  echo "'$NAME' already exists — refusing to overwrite it" >&2
  exit 1
fi

echo "==> creating vite project ($TEMPLATE)"
npx --yes create-vite@latest "$NAME" --template "$TEMPLATE"
cd "$NAME"

echo "==> installing dependencies"
npm install --silent
if [ "$STACK" = "r3f" ]; then
  npm install --silent three @react-three/fiber @react-three/drei
else
  npm install --silent three
fi

echo "==> writing starter scene"

if [ "$STACK" = "r3f" ]; then

rm -f src/App.css
cat > src/App.jsx <<'JSX'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment } from '@react-three/drei'
import { useRef } from 'react'
import { MathUtils } from 'three'
import './index.css'

function Subject() {
  const ref = useRef()

  useFrame((state, delta) => {
    // Every rate multiplied by delta, so 60Hz and 120Hz look the same.
    ref.current.rotation.y += delta * 0.15

    // Damped mouse response: aware of the cursor, not attached to it.
    const tx = state.pointer.y * 0.18
    const ty = state.pointer.x * 0.25
    ref.current.rotation.x = MathUtils.damp(ref.current.rotation.x, tx, 3, delta)
    ref.current.position.x = MathUtils.damp(ref.current.position.x, ty, 3, delta)
  })

  return (
    <mesh ref={ref}>
      {/* detail 12 ~= 3.4k triangles, already perfectly smooth. Only go higher when a
          vertex shader is actually displacing the surface — see references/shaders.md. */}
      <icosahedronGeometry args={[1.3, 12]} />
      <meshStandardMaterial color="#b8b8bd" metalness={1} roughness={0.28} />
    </mesh>
  )
}

export default function App() {
  return (
    <Canvas
      camera={{ fov: 35, position: [0, 0, 6], near: 0.1, far: 100 }}
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      {/* Environment first — without it, metal reads as grey clay. */}
      <Environment preset="studio" environmentIntensity={0.7} />
      <directionalLight position={[4, 6, 4]} intensity={2.5} />
      <Subject />
    </Canvas>
  )
}
JSX

cat > src/index.css <<'CSS'
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #root { height: 100%; }
body { background: #0b0c10; overflow: hidden; }
canvas { display: block; }
CSS

else

rm -f src/counter.js javascript.svg public/vite.svg 2>/dev/null || true
cat > index.html <<'HTML'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>scene</title>
  </head>
  <body>
    <canvas id="scene"></canvas>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
HTML

cat > src/style.css <<'CSS'
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { height: 100%; background: #0b0c10; overflow: hidden; }
#scene { display: block; width: 100%; height: 100%; }
CSS

cat > src/main.js <<'JS'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import './style.css'

const canvas = document.querySelector('#scene')

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))   // capped at 2
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.0

const scene = new THREE.Scene()

// fov 35, not the default 75 — a portrait lens rather than a wide angle.
const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 100)
camera.position.set(0, 0, 6)

// Environment before lights. Without it, metal reads as grey clay.
const pmrem = new THREE.PMREMGenerator(renderer)
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
pmrem.dispose()

const key = new THREE.DirectionalLight(0xffffff, 2.5)
key.position.set(4, 6, 4)
scene.add(key)

const mesh = new THREE.Mesh(
  // detail 12 ~= 3.4k triangles, already perfectly smooth. Only go higher when a vertex
  // shader is actually displacing the surface — see references/shaders.md.
  new THREE.IcosahedronGeometry(1.3, 12),
  new THREE.MeshStandardMaterial({ color: 0xb8b8bd, metalness: 1.0, roughness: 0.28 }),
)
scene.add(mesh)

const pointer = { x: 0, y: 0 }
window.addEventListener('pointermove', (e) => {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1
})

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
}
window.addEventListener('resize', onResize)

// Timer, not Clock (deprecated in r185). connect(document) reports a zero delta while
// the tab is hidden, so returning to a backgrounded tab doesn't jump the animation.
const timer = new THREE.Timer()
timer.connect(document)

renderer.setAnimationLoop((timestamp) => {
  timer.update(timestamp)
  const delta = timer.getDelta()

  mesh.rotation.y += delta * 0.15
  mesh.rotation.x = THREE.MathUtils.damp(mesh.rotation.x, pointer.y * 0.18, 3, delta)
  mesh.position.x = THREE.MathUtils.damp(mesh.position.x, pointer.x * 0.25, 3, delta)

  renderer.render(scene, camera)
})
JS

fi

echo ""
echo "==> done"
echo "    cd $NAME && npm run dev"
