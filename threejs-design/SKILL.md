---
name: threejs-design
description: >-
  Build polished, animated 3D web experiences with Three.js, React Three Fiber (R3F), drei,
  WebGL, and GLSL shaders. Use for 3D heroes, ambient 3D backgrounds, scroll-driven
  scrollytelling, product viewers and configurators, particle systems, GPGPU, post-processing,
  HDRI and environment lighting, PBR materials, and glTF pipelines. Also use when the user
  never says "Three.js" but asks for a site that should feel animated, immersive, premium,
  cinematic, or "like an Awwwards site", or wants motion and depth behind their content. Also
  use to diagnose 3D that looks flat, washed out, too dark, plasticky, blurry, or janky, or
  that overheats phones.
---

# Three.js Design

Scope: everything inside the `<canvas>` — scene, camera, lighting, materials, shaders, motion,
performance. The built-in `frontend-design` skill owns everything outside it: palette,
typography, layout, spacing. When 3D sits inside a real page, use both and don't re-derive type
scales here.

Read this file, then load only the references the task actually needs.

## Route by stack

| Situation | Load |
| --- | --- |
| React or Next.js project, or nothing exists yet | `references/r3f.md` |
| Plain JS, static site, or embedding into non-React | `references/vanilla.md` |

Default to R3F: the declarative scene graph keeps state in one place, drei absorbs the
boilerplate, and its ecosystem carries better defaults than hand-rolled code. Choose vanilla
when the page isn't React, bundle size is tight, or you need imperative control of the loop.

## Route by archetype

| Goal | Load, in order |
| --- | --- |
| Hero or ambient background behind text | stack file → `materials-lighting.md` (add `shaders.md` if the form is procedural) |
| Scroll-driven narrative | stack file → `scroll-motion.md` → `materials-lighting.md` |
| Shader art, generative, particles | `shaders.md` first, then the stack file just for mounting. Skip materials-lighting — raw shaders bypass the lighting pipeline entirely |
| Product viewer or configurator | stack file → `materials-lighting.md` → `performance.md` |
| "It looks wrong" | Diagnosis below, then the single file it points at |
| "It's slow / phone gets hot" | `performance.md` |

## Defaults that decide the look

These are the small number of decisions that separate studio work from tutorial work. Apply them
before reaching for anything fancier.

- **Give the scene an environment map before you add a single light.** Ambient + directional
  will always look flat, because real surfaces reflect a room. `RoomEnvironment` through
  `PMREMGenerator` costs nothing and instantly reads as lit; an HDRI sets mood. Set
  `scene.environment`, usually *not* `scene.background` — you want the reflections, not the
  photo. Lights come after, to carve shape and cast shadow. This is the highest-leverage lever
  in the whole pipeline and the one most often skipped.
- **Camera `fov: 35`, not the default 75.** 75 is a wide-angle lens: it bows straight edges and
  balloons whatever is nearest the camera. 35 is a portrait lens. Dolly back to reframe. This
  one number does more for "photographic" than any amount of material tuning.
- **Tone mapping on, exposure as the master dial.** `ACESFilmicToneMapping` is the safe default;
  `AgXToneMapping` (r163+) handles blown highlights more gracefully; `NeutralToneMapping` (r165+)
  preserves hue best for product shots. When the image is too bright or too dark, change
  `toneMappingExposure` — not light intensities, which distorts the balance you already tuned.
- **Tag textures by what they mean.** Color, albedo, and emissive maps are `SRGBColorSpace`;
  roughness, metalness, normal, AO, and displacement maps must stay `NoColorSpace`. Mistagging
  data maps as sRGB is the top cause of "subtly plasticky and wrong". glTF handles this for you;
  hand-loaded textures do not.
- **Frame-rate independence, everywhere.** `lerp(current, target, 0.1)` runs twice as fast on a
  120 Hz display. Use `THREE.MathUtils.damp(current, target, lambda, delta)`, which is
  `lerp(a, b, 1 - Math.exp(-lambda * delta))`. Every rate gets multiplied by delta — rotations,
  drifts, shader time uniforms, all of it.
- **Cap DPR at 2.** `Math.min(window.devicePixelRatio, 2)`, or `dpr={[1, 2]}` in R3F. A 3x phone
  otherwise renders 9x the pixels of a 1x screen. This is the single biggest cause of hot
  phones and stuttering scroll.
- **Restraint in post.** Bloom with `luminanceThreshold` around 0.9, so only genuine highlights
  bloom rather than the whole image hazing over. A slight vignette. Low-opacity grain, which
  also hides gradient banding. Depth of field and chromatic aberration only when the concept
  asks for them. Every effect at 50% reads as a demo of the effects.
- **Motion should feel like weight, not like a loop.** Slow, continuous, non-repeating beats fast
  and cyclic. Anything reacting to the mouse should damp toward the target over ~0.3–0.6s, never
  track it directly.

## Diagnosis

| Symptom | Most likely cause |
| --- | --- |
| Flat, cardboard-looking, "not 3D" | No environment map. Right roughly half the time. The reflex is to add more lights, which flattens it further — add `scene.environment` instead (`materials-lighting.md`) |
| Washed out, milky, low contrast | `NoToneMapping`, or a color texture left untagged so sRGB values get read as linear |
| Everything too dark, lights seem broken | Pre-r155 intensity values under r155+ physically correct lighting. Punctual lights need roughly π× more; point and spot lights also decay with distance² now |
| Plasticky, materials subtly off | A roughness/metalness/normal map tagged `SRGBColorSpace` |
| Colours pastel or candy-coloured | Over-lighting. Every channel is climbing toward its ceiling, which desaturates long before it looks overexposed — cut intensities, not the colours |
| A dark palette renders mid-grey | Raw float colours are authored in linear space; sRGB output roughly square-roots them. Pick colours as hex through `Color`, or author far darker |
| Blocky, aliased shadow edges | Shadow camera frustum far larger than the scene. Tighten it before raising `mapSize` |
| Banded gradients | 8-bit quantization. Add low-opacity grain or dither in the shader |
| Janky, stutters, drops frames | Check `renderer.info.render.calls` first, then per-frame allocations in the loop (`performance.md`) |
| Fine on desktop, melts phones | Uncapped DPR, then post-processing passes at full resolution |

## Scaffold

`scripts/scaffold.sh <name> <r3f|vanilla>` creates a Vite project non-interactively with the
dependencies installed and a starter scene that already has the defaults above baked in. Use it
to skip setup, then build the actual concept on top.
