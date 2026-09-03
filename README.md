# threejs-design

A [Claude Skill](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview) that
makes Claude good at building polished, animated Three.js sites — the kind that look like a studio
made them, rather than like a tutorial.

Most bad WebGL on the web is not bad because of the geometry. It is bad because there is no
environment map, the camera is on a 75° wide-angle lens, textures are mistagged so materials read
as plastic, tone mapping is off, and every animation is a raw `lerp` that runs at a different speed
on a 120 Hz display. This skill encodes those decisions and roughly forty more, with the reasoning
attached so Claude can depart from them when the concept calls for it.

![The demo hero: a slow, dark displaced sphere sitting behind large light type](demo/docs/screenshot.png)

*Built by following the skill, in [`demo/`](demo/). Details below.*

## Install

Skills live in a `skills/` directory that Claude Code discovers automatically. Copy the
`threejs-design/` folder into one of them:

```bash
# Available in every project (personal skill)
git clone https://github.com/ShivaPriyanShanmuga/threejs-design-skill.git
cp -r threejs-design-skill/threejs-design ~/.claude/skills/

# Or scoped to a single project, checked in alongside the code
cp -r threejs-design-skill/threejs-design .claude/skills/
```

Then start a session and ask for something 3D. The skill is model-invoked: Claude reads the
frontmatter description and decides to load it on its own — you never name it.

It triggers on the obvious things — Three.js, R3F, drei, WebGL, GLSL, shaders, 3D heroes,
scrollytelling, product viewers, particles — and also on requests that never mention 3D at all
("make the landing page feel more premium", "something animated behind the headline", "like an
Awwwards site"), plus on debugging ("this looks flat", "washed out", "why is it so dark",
"janky on mobile").

## How it is organised

`SKILL.md` is under 100 lines and is the only file always in context. It routes by stack (R3F vs
vanilla) and by archetype (hero/ambient, scroll narrative, shader art, product viewer), so a
shader task never loads R3F patterns and a product viewer never loads scroll machinery. It also
carries the handful of defaults that decide the look, and a diagnosis table that maps symptoms to
the one file worth opening.

| File | What it covers |
| --- | --- |
| [`references/r3f.md`](threejs-design/references/r3f.md) | React Three Fiber and drei. Canvas config, `useFrame` and damping, the memoisation mistakes that quietly cost frames, the drei components worth knowing, canvas-behind-DOM-text layout, Suspense loading, and what R3F will and will not dispose for you. |
| [`references/vanilla.md`](threejs-design/references/vanilla.md) | Plain Three.js with Vite. Correct boilerplate, resize handling (including the DPR case people miss), the `Timer` loop, Draco/KTX2 loading, and explicit teardown. |
| [`references/materials-lighting.md`](threejs-design/references/materials-lighting.md) | The pipeline that decides whether a scene reads as photographed: colour management and texture tagging, tone mapping, environment maps, the r155 lighting-unit change, shadow frusta, and tested parameter sets for brushed metal, clearcoat, transmission glass, iridescence, and sheen. |
| [`references/shaders.md`](threejs-design/references/shaders.md) | GLSL. fbm and domain warping, fresnel, recomputing normals after displacement, `Points` with perspective-correct `gl_PointSize`, curl-noise flow fields, when to move to GPGPU, and the colour mistakes that make procedural work look cheap. |
| [`references/scroll-motion.md`](threejs-design/references/scroll-motion.md) | Lenis and GSAP ScrollTrigger without desync, normalising and damping scroll progress, `CatmullRomCurve3` camera paths with look-ahead, `ScrollControls` vs Lenis, and reduced-motion handling. |
| [`references/performance.md`](threejs-design/references/performance.md) | In priority order: measure, cap DPR, cut draw calls, stop rendering when nothing changes, compress assets, degrade adaptively. Plus disposal and a symptom-to-cause table. |
| [`scripts/scaffold.sh`](threejs-design/scripts/scaffold.sh) | `scaffold.sh <name> <r3f\|vanilla>` — non-interactive Vite setup with a starter scene that already has the defaults baked in. |

The skill covers everything inside the `<canvas>`. Palette, typography, and layout stay with
Claude's built-in `frontend-design` skill; `SKILL.md` says so explicitly so the two compose
instead of overlapping.

## The demo

[`demo/`](demo/) is a placeholder portfolio hero, built by following the skill, and used to test
it. A slow displaced sphere sits behind the name, responds to the mouse, and stays out of the
type's way.

```bash
cd demo && npm install && npm run dev
```

What it exercises:

- **`fov: 35`**, `dpr={[1, 2]}`, and every animation rate multiplied by delta.
- **A custom `ShaderMaterial`** — gradient-noise fbm with one level of domain warping, normals
  recomputed from the displaced surface, and a fresnel rim.
- **An Inigo Quilez cosine palette** in a single indigo family, plus a dither to kill banding.
- **Post at low doses**: bloom at `luminanceThreshold` 0.9 so only the fresnel rim glows, a
  vignette, and 3% grain, with tone mapping moved into the effect chain.
- **A damped, low-amplitude mouse response** at lambda 1.6, so the form drifts toward the cursor
  over about a second instead of tracking it.
- **`prefers-reduced-motion`**, which freezes the drift and the parallax while keeping the scene.

It was checked by screenshotting it with Playwright and looking at the result. Two things that
only showed up that way:

- The first pass rendered a bright saturated blue ball that fought the headline. The palette was
  authored in **linear** space, where a value of 0.08 looks dark — but sRGB output roughly
  square-roots it to 0.31 on screen. The fix was authoring an order of magnitude darker.
- Orange patches were appearing in what was meant to be a single indigo family, because the cosine
  palette's per-channel frequencies were cycling the hue. One shared frequency, with the colour
  work moved into the phase offsets, fixed it.

The mouse response was verified rather than assumed: two loads at a matched animation phase with
the pointer on opposite sides differ by a mean channel delta of 2.94, against a 0.25 run-to-run
timing-noise floor — present, and subtle.

Testing the skill also turned up a real correction to it: `THREE.Clock` is deprecated as of r185,
so the vanilla reference and the scaffold now use `THREE.Timer` with `connect(document)`.

The copy and the persona in the demo are placeholders. Swap them.

## License

MIT — see [LICENSE](LICENSE).
