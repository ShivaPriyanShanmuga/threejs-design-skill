# Design brief: KUROGANE

The prompt used to test whether the skill helps with *design*, not just correctness. Written
first, then executed without loosening it. The build is in [`../demo-samurai/`](../demo-samurai/).

---

## The brief

Build the landing page for **KUROGANE (黒鉄, "black steel")** — a small atelier selling one
exquisite mechanical watch, made by a family that forged swords for eleven generations before
they started making movements.

**The idea to hold onto:** a katana is a thousand folds of steel that ends up looking like a
single quiet line. The watch should feel the same — enormously laboured, outwardly still. The
page must not look like a watch advert. It should look like the object is being *shown to you*,
once, by someone who does not need to sell it.

### Art direction

- **Palette.** Sumi black (`#0a0a0b`) ground. Washi off-white (`#efeae2`) type. One accent only:
  urushi lacquer red (`#b8202e`), used at most twice on the whole page — the second hand, and one
  hairline rule. Aged brass (`#b08d57`) permitted as a metal tone in the 3D only, never in UI.
- **Type.** A high-contrast serif for the wordmark and headline, at large size and tight leading.
  A small, wide-tracked uppercase grotesk for everything else — labels, spec rail, nav. No third
  family. No italics.
- **Composition.** Asymmetric. The watch sits right of centre; type stacks along the left edge
  with a hard left margin. Generous emptiness — at least half the frame should be black and doing
  nothing. Never centre the headline.
- **Mood.** Cold, quiet, low-key lighting. The kind of product photograph where most of the object
  is in shadow and one edge catches the light. Nothing glows. Nothing bounces.

### The 3D

A single wristwatch, shown at rest, rotating slowly enough that you are not sure it is moving.

- Brushed steel case, a polished bezel that catches one hard highlight, a sapphire crystal with
  real refraction, a matte black dial, applied indices, and a lacquer-red second hand.
- It must read as **machined**, not modelled: crisp bevels, no soft blobby edges.
- The lighting should be a product studio, not a stage — one key that rakes across the case, one
  cool rim to separate it from the black, and enough environment for the steel to have something
  to reflect.
- The watch face should be readable. If the indices mush together, the object has failed.

### Motion

- Rotation so slow it reads as breathing. If a viewer can time it, it is too fast.
- The page responds to the cursor by a few degrees of parallax and nothing more.
- On scroll, the watch turns to show its profile while the headline gives way to a short spec
  rail. One beat, not a carousel.

### Copy

- Wordmark: `KUROGANE` with `黒鉄` set small beneath it.
- Headline: **Eleven generations of folding steel. One hand that never hurries.**
- Standfirst: *Forged in Seki, assembled in silence. Forty-two hours of reserve, and nothing on
  the dial that does not need to be there.*
- Spec rail: `39mm · Grade 5 titanium` / `In-house cal. K-11` / `42h reserve` / `Sapphire, boxed`
- Single call to action: `Request an audience ↗` — not "Buy now".
- Footer: `Seki, Gifu` and `Made to order · 24 pieces a year`.

### The bar

If it looks like a template with a watch dropped into it, it has failed. If someone would stop
scrolling, it has worked.
