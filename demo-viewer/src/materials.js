import * as THREE from 'three'

/**
 * The five material archetypes from the skill's `materials-lighting.md`, as a working
 * reference you can rotate and compare rather than a list of numbers in a document.
 *
 * `MeshStandardMaterial` covers metalness and roughness. Everything mentioning clearcoat,
 * transmission, iridescence or sheen needs `MeshPhysicalMaterial`, which compiles a bigger
 * shader and costs more to shade — so it is used only where it earns its place.
 */

export const FINISHES = {
  brushed: {
    label: 'Brushed metal',
    note: 'roughness 0.28, not 0 — at 0 it is a perfect mirror with nothing to reflect, which reads as flat grey plastic',
    make: () =>
      new THREE.MeshStandardMaterial({
        color: '#b8b8bd',
        metalness: 1.0,
        roughness: 0.28,
      }),
  },

  lacquer: {
    label: 'Clearcoat lacquer',
    note: 'two layers: a soft, slightly rough base under a hard near-mirror coat. Matching the two roughnesses throws the effect away',
    make: () =>
      new THREE.MeshPhysicalMaterial({
        color: '#14304f',
        metalness: 0.0,
        roughness: 0.45,
        clearcoat: 1.0,
        clearcoatRoughness: 0.06,
      }),
  },

  glass: {
    label: 'Transmission glass',
    note: 'thickness is in world units and must suit the object — the default 0 means no refraction at all. Needs an environment to refract, and costs an extra scene render per frame',
    make: () =>
      new THREE.MeshPhysicalMaterial({
        transmission: 1.0,
        thickness: 0.9, // roughly the part's own depth
        roughness: 0.06,
        ior: 1.5,
        transparent: false, // transmission does the blending; true breaks sorting
        color: '#eaf2ff',
      }),
  },

  iridescent: {
    label: 'Iridescence',
    note: 'the thickness range is in nanometres and decides which colours appear — widen it for more bands',
    make: () =>
      new THREE.MeshPhysicalMaterial({
        color: '#2a2f3a',
        metalness: 0.9,
        roughness: 0.2,
        iridescence: 1.0,
        iridescenceIOR: 1.3,
        iridescenceThicknessRange: [100, 400],
      }),
  },

  sheen: {
    label: 'Sheen fabric',
    note: 'the retroreflective glow at grazing angles that makes velvet look like velvet. A lighter, desaturated sheenColor against a dark base sells it',
    make: () =>
      new THREE.MeshPhysicalMaterial({
        color: '#2a1f3d',
        roughness: 0.9,
        metalness: 0.0,
        sheen: 1.0,
        sheenRoughness: 0.75,
        sheenColor: new THREE.Color('#8877aa'),
      }),
  },
}

export const FINISH_KEYS = Object.keys(FINISHES)

/**
 * Which archetype each part of the model wears by default. The keys are mesh names, set in
 * scripts/make-model.mjs — that naming is the contract between the asset and the app, and
 * it is why the glTF is worth generating rather than hand-waving the geometry in code.
 */
export const PART_FINISH = {
  body: 'brushed', // overridden by the picker
  grille: 'sheen',
  collar: 'iridescent',
  dome: 'glass',
  base: 'lacquer',
}
