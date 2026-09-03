#!/usr/bin/env node
/**
 * Generates public/product.glb — a five-part product, one part per material archetype.
 *
 * The model is built here rather than downloaded so the repo owns its assets outright and
 * there is no licence to track. It also means the demo exercises the real asset path:
 * a .glb on disk, loaded over HTTP by GLTFLoader, rather than geometry constructed in the
 * browser, which is what most Three.js work actually does and what neither of the other
 * two demos covered.
 *
 * three is used in Node purely for geometry maths — no WebGL context is created.
 *
 *   node scripts/make-model.mjs
 */

import { Document, NodeIO } from '@gltf-transform/core'
import { mkdir, writeFile } from 'node:fs/promises'
import * as THREE from 'three'

// Part name -> the material archetype the app applies to it. The names are the contract
// between this script and src/materials.js.
const PARTS = [
  {
    name: 'body',
    geometry: () => new THREE.CylinderGeometry(1.0, 1.05, 1.5, 72, 1, false),
    position: [0, 0.75, 0],
  },
  {
    name: 'grille',
    geometry: () => new THREE.CylinderGeometry(1.06, 1.06, 0.62, 72, 1, true),
    position: [0, 0.66, 0],
  },
  {
    name: 'collar',
    geometry: () => new THREE.TorusGeometry(1.02, 0.055, 14, 72),
    position: [0, 1.5, 0],
    rotation: [Math.PI / 2, 0, 0],
  },
  {
    name: 'dome',
    // Open hemisphere: phiLength full, thetaLength half.
    geometry: () => new THREE.SphereGeometry(0.98, 72, 28, 0, Math.PI * 2, 0, Math.PI / 2),
    position: [0, 1.5, 0],
  },
  {
    name: 'base',
    geometry: () => new THREE.CylinderGeometry(1.18, 1.24, 0.14, 72),
    position: [0, 0.07, 0],
  },
]

const doc = new Document()
doc.createBuffer()
const scene = doc.createScene('product')

for (const part of PARTS) {
  const geo = part.geometry()
  // glTF needs indexed geometry with explicit accessors; three's non-indexed
  // primitives would work too but double the vertex count for nothing.
  const indexed = geo.index ? geo : geo.toNonIndexed()

  const pos = indexed.attributes.position
  const nor = indexed.attributes.normal
  const uv = indexed.attributes.uv

  const prim = doc.createPrimitive()
  prim.setAttribute(
    'POSITION',
    doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos.array)),
  )
  if (nor) {
    prim.setAttribute(
      'NORMAL',
      doc.createAccessor().setType('VEC3').setArray(new Float32Array(nor.array)),
    )
  }
  if (uv) {
    prim.setAttribute(
      'TEXCOORD_0',
      doc.createAccessor().setType('VEC2').setArray(new Float32Array(uv.array)),
    )
  }
  if (indexed.index) {
    prim.setIndices(
      doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(indexed.index.array)),
    )
  }

  // A placeholder material per part. The app replaces these by name — the point of the
  // glTF is the geometry and the naming, not the shading.
  prim.setMaterial(doc.createMaterial(part.name).setBaseColorFactor([0.8, 0.8, 0.8, 1]))

  const mesh = doc.createMesh(part.name).addPrimitive(prim)
  const node = doc.createNode(part.name).setMesh(mesh)
  if (part.position) node.setTranslation(part.position)
  if (part.rotation) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...part.rotation))
    node.setRotation([q.x, q.y, q.z, q.w])
  }
  scene.addChild(node)

  geo.dispose()
}

await mkdir(new URL('../public/', import.meta.url), { recursive: true })
const glb = await new NodeIO().writeBinary(doc)
const out = new URL('../public/product.glb', import.meta.url)
await writeFile(out, glb)

const tris = PARTS.reduce((n, p) => {
  const g = p.geometry()
  const count = g.index ? g.index.count : g.attributes.position.count
  g.dispose()
  return n + count / 3
}, 0)
console.log(`wrote public/product.glb — ${PARTS.length} parts, ~${Math.round(tris)} triangles, ${(glb.byteLength / 1024).toFixed(0)} KB`)
