# Art Direction

The rest of this skill makes a scene *correct*. This file is about making it *look like
something*. Correctness is necessary and nowhere near sufficient: a scene can have a perfect
colour pipeline, a capped DPR and a tight shadow frustum and still look like a template with an
object dropped into it.

Read this alongside `materials-lighting.md`. That one tells you which knobs exist; this one tells
you where to set them and why.

## Light like a photographer, not like a room

The single biggest lever is **where the key light is**, not how bright it is. Intensity changes
exposure; angle changes what the object *is*.

- **Frontal key** — flat, even, informational. Everything is visible and nothing is interesting.
  This is what you get by default and it is why default scenes look like product catalogue
  filler.
- **Raking key**, pushed toward or behind the plane of the subject — grazes the surface, finds
  every edge and chamfer, throws the flat faces into shadow. This is the "expensive" look.
- **Rim / back light** — behind the subject, cool, catching one edge. On a dark background this is
  what separates the object from the void. Without it a dark object on a dark ground is a hole.

**A matte black surface under a strong frontal key renders grey.** This one catches people
constantly and it gets misdiagnosed as a colour problem — the material is darkened, then
darkened again, and it stays grey because the light is the cause. If something must read as
black, move the key behind its plane so the surface is lit at a grazing angle, and add a weak
frontal fill only if small bright details (markers, type, edges) need lifting. A fill at 0.3–0.6
lifts specular detail without lifting a large matte area, which is exactly what a photographer's
reflector does.

Three lights is a full rig: one key that shapes, one rim that separates, one weak fill that
rescues detail. A fourth is usually an admission that the first three are in the wrong place.

## Silhouette before material

If the outline is wrong, no material will save it. "Machined, not modelled" is a geometry
problem: crisp chamfers, hard creases, edges that catch a single bright line.

Watch for smooth-shading eating your creases. `LatheGeometry` averages normals along the profile,
so a case with three deliberate chamfers renders as a dome. Repeat a profile point to split the
normal there and the crease survives:

```js
const profile = [
  [0.72, -0.19], [0.72, -0.19],   // repeated → hard edge
  [0.86, -0.17], [0.86, -0.17],
  [0.98,  0.05],
]
```

The same applies to `ExtrudeGeometry` bevels and to any hand-built mesh: duplicate vertices where
you want an edge, or accept a blob.

## Composition

The canvas is a frame. Treat it like one.

- **Asymmetry.** Object off-centre, type stacked against a hard margin on the other side. A
  centred object with centred type under it is the layout equivalent of a default.
- **Let most of it be empty.** On a hero, half the frame doing nothing is a feature. Crowding is
  what makes work look cheap far more often than the objects themselves.
- **Crop on purpose.** An object running off the edge of the frame reads as editorial. An object
  accidentally clipped reads as a bug. The difference is whether the crop is obviously deliberate
  — cut deep, not by ten pixels.
- **Overlap type and object.** When the 3D passes in front of a headline, or the headline passes
  in front of the 3D, the two stop being separate layers and become one image. This is often the
  single change that makes a page look art-directed. Decide which is in front and commit.

## Colour

- **One accent.** Pick a single non-neutral and use it two or three times on the whole page. The
  restraint is the effect. Two accents halve it; three make a rainbow.
- **The ground does the work.** A near-black or near-white field with one object is inherently
  more expensive-looking than a gradient. Gradients are what you add when the composition is not
  carrying itself.
- **Metal has no colour of its own** — it is the colour of what it reflects. If your steel looks
  wrong, change the environment, not the albedo.
- **Saturation is a budget.** Spend it on the one thing that matters. See `materials-lighting.md`
  on over-lighting, which desaturates everything at once and reads as a colour problem.

## Transparent covers veil what is under them

A crystal, a screen, a vitrine — anything transmissive over a dark surface will reflect the
environment and turn the thing beneath it grey. That is physically right and usually not what you
want. Damp the cover specifically rather than dimming the whole scene:

```js
crystal.envMapIntensity = 0.4;   // the case stays bright, the dial goes back to black
```

## Restraint

The tell of an amateur scene is that everything is on.

- **Bloom does not belong on every page.** On a dark, quiet, expensive-looking design it is the
  fastest way to make the object look cheap. If nothing in the concept glows, do not add glow.
- **Depth of field** needs a subject and a reason. It makes text unreadable and costs a lot.
- **Motion should be slower than feels right.** If a viewer can time the rotation, halve it. A
  hero that turns once a minute reads as considered; once every five seconds reads as a
  screensaver.
- **When in doubt, remove.** Almost every scene that looks wrong is over-built, not under-built.

## Reading a brief into scene decisions

Design briefs describe feelings. This is the translation:

| The brief says | In the scene that means |
| --- | --- |
| premium, quiet, considered | Low key. Raking light, deep shadow, one accent colour, no bloom, very slow motion, generous empty frame |
| energetic, playful, alive | Higher key, more fill, saturated palette, faster damping (lambda 8–12), more objects in motion |
| editorial, art-directed | Hard margins, asymmetry, deliberate crops, type overlapping the object, one accent |
| technical, precise, engineered | Crisp chamfers, visible construction, neutral tone mapping, a grid, restrained colour |
| organic, natural, flowing | fbm and domain warping, curl-noise motion, no straight lines, colours from one family |
| immersive, cinematic | Wider framing, atmosphere (haze, particles), stronger vignette, camera movement rather than object movement |
| luxurious | Mostly the "premium" row, plus: fewer objects, more empty space, and a slower everything |

## The bar

Two questions, and they are harsher than any checklist:

1. Would someone stop scrolling?
2. If you removed the 3D entirely, would the page still be well designed?

If the answer to (2) is no, the 3D is doing work that layout and type should be doing, and it will
read as decoration however good the shader is.
