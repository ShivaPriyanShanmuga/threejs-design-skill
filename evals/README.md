# Evals

Does the skill fire when it should, load only what it needs, and change the output? Three
suites, in `cases.json`. Two of them need the Claude Code CLI; one does not.

| Suite | Asks | Runner | Status |
| --- | --- | --- | --- |
| `trigger` | Does the skill activate on 16 prompts, 11 of which should and 5 of which should not? | `run.mjs --suite trigger` | **Not yet run** — needs the CLI |
| `routing` | Once fired, does it load the right reference files and *not* the others? | `run.mjs --suite routing` | **Not yet run** — one incidental data point below |
| `output` | Do the defaults SKILL.md claims decide the look actually show up in generated code? | `score-output.mjs <file>` | **Run.** Results below |

```bash
npm i -D playwright pngjs && npx playwright install chromium   # for score-output / audit
node evals/score-output.mjs a.js b.js                          # no CLI needed
node evals/run.mjs --suite trigger                             # needs `claude` on PATH
```

## The A/B, run 2026-09-03

The experiment that motivated all of this: same prompt, two cold sessions, one that first
reads `SKILL.md` and follows its routing and one that gets no skill at all. Prompt was
*"Write a single file of vanilla Three.js for a website hero: dark and moody, one metal
object, premium and photographic."* Artifacts are in `results/`.

**On the code rubric they tied, 8/8 applicable checks each.** Both got fov, environment map,
DPR cap, ACES tone mapping, delta-driven animation, exponential damping, a clamped or
Timer-based clock, and non-zero metal roughness. Both failed to tighten the shadow frustum.

So the rubric found no difference. Two things it did find, which matter more:

**The skill removed both deprecation warnings.** Control shipped `THREE.Clock` and
`PCFSoftShadowMap`; treatment used `THREE.Timer` and left the shadow type alone, and rendered
with a clean console. That is the skill transmitting knowledge the base model did not have —
and it only exists in the skill because an earlier demo surfaced it.

**The treatment's render looked worse.** This is the uncomfortable half.

| | control | treatment |
| --- | --- | --- |
| mean luminance | 0.170 | 0.261 |
| clipped white | 2.2% | 0.7% |
| Three.js warnings | 2 | 0 |
| file size | 27 KB | 16 KB |

![control](results/ab-control.png)
![treatment](results/ab-treatment.png)

The control produced a clean chrome torus. The treatment produced a form so blown out by
bloom that the metal reads as a glowing blob. The post settings were not the cause — the
treatment followed the skill exactly there, `UnrealBloomPass(res, 0.42, 0.55, 0.9)`, threshold
0.9 and a restrained strength, with a comment quoting the reasoning back.

The cause was upstream, in the lights. Treatment: a `SpotLight` at intensity 190 with
`distance = 0`, meaning no falloff cutoff at all, plus a `RectAreaLight` and a directional on
top. Control: a `SpotLight` at 150 bounded to `distance = 26`, a dimmer rim, and a weak fill.

The honest reading is that the skill's r155 section — "multiply old intensities by π", "scale
with distance squared", "raise it until it looks right" — pushes hard toward *more* light and,
at the time of this run, carried no counterweight. `materials-lighting.md` now has one, added
the same day from a defect in `demo-keyboard`: **too much light reads as desaturation, not as
brightness**, so cut intensities before touching colours. That paragraph would have caught
this. Re-running the A/B against the updated skill is the obvious next step and has not been
done.

### What this does and does not show

n = 1 prompt, 1 run per condition, same model in both. It cannot distinguish "the skill
helped" from "the model already knew this" for anything the base model gets right on its own,
which on this rubric is nearly everything. Treat the tie as the finding it is: **on
well-known defaults the skill adds little; its measurable value so far is version-specific
knowledge the model's training predates.**

It also shows a rubric of correctness checks cannot see design quality. The treatment scored
identically and looked worse. Any future version of this eval needs a rendered comparison,
not just a code scan.

### Routing, incidentally

Given the vanilla hero prompt, the treatment session loaded `SKILL.md`, then `vanilla.md` and
`materials-lighting.md`, and nothing else. That is exactly what the routing table specifies —
one real data point for the `routing` suite, collected by accident rather than by design.

## Notes on the harness

Rendering a hero canvas needs care, and two false failures came from getting it wrong before
the code was at fault:

- A wrapper `<div>` with `position: fixed; inset: 0` painted over a `z-index: -1` canvas.
- Then `background` on `body` did the same thing: a negative-z-index child paints *behind* its
  ancestor's background box. Put the page background on `html`, or do not use a negative
  z-index.

Both looked exactly like "the scene renders nothing". Check the harness before believing a
black frame.
