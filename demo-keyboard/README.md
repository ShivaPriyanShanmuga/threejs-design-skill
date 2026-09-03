# demo-keyboard

A harder test of the `threejs-design` skill: a two-beat portfolio built from a video reference,
where one 3D mechanical keyboard persists across both. Scrolling drives it from the hero's
three-quarter view into a SKILLS view; hovering lifts a cap, clicking presses it down and reveals
that skill's name and a one-liner as 3D text lying in the board's own plane.

The persona and copy are fictional.

```bash
npm install
npm run dev
```

![Hero: name on the left, a colourful 3D keyboard floating on the right](docs/hero.png)

![Skills: the board rotated large, with the pressed GraphQL cap and its caption lying in the board's plane](docs/skills.png)

| File | |
| --- | --- |
| `src/App.jsx` | DOM layer, Lenis, and the scroll progress that everything reads |
| `src/Scene.jsx` | Camera rig, environment, lights, starfield, post chain |
| `src/Keyboard.jsx` | Instanced caps and decals, interaction, press animation, in-scene text |
| `src/keycap.js` | The keycap geometry |
| `src/atlas.js` | Runtime logo atlas and the glow sprite |
| `src/tech.js` | 25 technologies, their brand colours, and their one-liners |

## The parts worth reading

**The keycap is a tapered rounded box.** `RoundedBoxGeometry` cannot taper, so the vertices are
scaled in x/z by their own height in a single pass. That is the whole difference between a rounded
die and something that reads as a key. Normals have to be recomputed after, since moving vertices
invalidates them — the same trap as displacing a plane in a vertex shader.

**Two draw calls carry the whole board.** The 25 caps are one `InstancedMesh` with per-instance
colour. The 25 logos are a second one, sampling a single 1280×1280 atlas built at runtime from
`simple-icons` paths on a canvas; each instance carries a `vec2` UV offset for its own cell, fed in
through a four-line `onBeforeCompile` patch. One texture per logo would have meant 25 materials and
25 more calls.

Measured, not assumed: **25 draw calls for the entire frame**, including the shadow pass and every
post-processing pass. Without instancing the caps and decals it would be about 73. In dev,
`__gl.info.render.calls` is on `window` — though `info.render` resets per pass, so with a composer
you have to set `autoReset = false` and accumulate a frame to get a true number.

**The 3D text is in the board's group**, not overlaid on the page. That is why it inherits the
board's yaw and is occluded by the caps, which is what makes it read as part of the object.

**Scroll is normalised once.** Lenis emits `progress`, `App` writes it to a ref, and the scene
damps toward it at lambda 4 — the board lagging slightly behind the page is what gives it weight.
The camera interpolates between two poses rather than following a spline; with two keyframes a
damped lerp is the right tool and a `CatmullRomCurve3` would be ceremony.

## What the screenshot pass caught

- **The logos were standing upright.** A `PlaneGeometry` faces +Z, and instancing it with a pure
  translation left 25 little billboards hovering above the caps. The rotation has to be baked into
  the geometry (`g.rotateX(-Math.PI / 2)`), not applied per instance.
- **The caps came out pastel.** Brand colours were washing to candy under a 0.8 environment plus
  two directional lights at 2.4 and 1.5. Cutting the environment to 0.42, `envMapIntensity` to
  0.45, and the lights to 1.35/0.75 brought the actual brand colours back. Over-lighting reads as
  desaturation long before it reads as brightness.
- **The bundle was 6.6 MB.** `import * as si from 'simple-icons'` defeats tree-shaking and pulls in
  all ~3200 icons. Named imports took it to 1.35 MB (389 KB gzipped).
- **The first framing was far too close**, and the in-scene caption collided with the skill name.

It also turned up a correction to the skill itself: `PCFSoftShadowMap` is deprecated as of r185 —
three warns and silently falls back to `PCFShadowMap` — so `references/materials-lighting.md` no
longer recommends it.

## Attribution

Logo paths and brand colours come from [simple-icons](https://github.com/simple-icons/simple-icons)
(CC0-1.0). The trademarks belong to their respective owners; they are used here to identify the
technologies, which is what a skills grid is for.

The design is an original rebuild, following the composition and interaction idea of a
[YouTube Short](https://www.youtube.com/shorts/CI5uyCDkwKY) by TechWorsh showing Rukesh Babu's
portfolio. No code or assets were taken from it.
