# Working From References

When the user hands you a video, a screenshot, a Dribbble shot or a link and says "like this",
the job is to *read* the reference rather than guess at it. You can see images. Use that.

`scripts/reference.sh` does the fetching and slicing; this file is what to do with the output.

## Get the media into frames you can actually look at

```bash
scripts/reference.sh https://youtube.com/shorts/XXXX   # video: sheet + frames + palette
scripts/reference.sh ./hero-shot.png                   # image: palette + upscaled crops
scripts/reference.sh ./clip.mp4 --at 1.7,4.2,7.0       # full-res frames at chosen seconds
```

It writes a contact sheet, full-resolution frames, and a palette to `.reference/`.

The order matters. **Look at the contact sheet first** — a grid of the whole thing at low
resolution tells you the structure (how many beats, where the transitions are) in one look.
Only then pull full-resolution frames at the moments that matter. Going straight to
full-resolution frames means guessing at timestamps and missing the shape of the piece.

Screen recordings are usually letterboxed inside phone-shaped video with captions and channel
branding. Crop to the actual browser window before you study anything, or you will be reading
someone's title card.

## What to extract, in order

1. **Structure.** How many distinct states? Where does each begin and end? A 40-second short is
   usually three or four beats. Write them down before looking at any detail.
2. **Composition.** For the key frame of each beat: where is the object, where is the type, what
   is the margin, what is empty. Sketch it in words — "object right of centre, headline stacked
   left against a hard margin, bottom third empty". This is the part that transfers; the exact
   object rarely does.
3. **Palette.** Take the hex values from the script rather than eyeballing them. Note *how many*
   colours are actually in play — references that look rich are usually two neutrals and one
   accent.
4. **Type.** Not the exact typeface, which you will not identify reliably: the *character*.
   High-contrast serif or grotesk? Tight or airy tracking? Huge or restrained? Is it uppercase?
   Does it overlap the object?
5. **Lighting.** Where are the highlights? A bright edge on one side and shadow on the other means
   a raking key. Even illumination means frontal. This tells you where to put your lights far
   faster than trying to match a look by trial and error.
6. **Motion.** Count frames between two states to get real timing. "It felt slow" is not a number;
   "the transition takes 1.4 seconds" is.

## Be honest about what is not reproducible

Some references are not real-time and never will be. A dense volumetric explosion, a fluid sim,
a ray-traced caustic, film-plate footage — these come out of Houdini or a camera, and the
browser is not going to match them.

When you hit one, say so, then pick the closest real-time technique and name the trade:

| The reference is | Real-time stand-in | What you lose |
| --- | --- | --- |
| A pre-rendered volumetric | Fragment shader on a full-screen quad, fbm + domain warp | Genuine depth and self-shadowing |
| A fluid or smoke sim | Curl-noise particles, or the quad above | Physical accuracy, interaction with geometry |
| Ray-traced glass with caustics | `transmission` + a good environment | Caustics entirely |
| A studio photograph | HDRI + a raking key + `ContactShadows` | Nothing, usually. This one is achievable |
| Film grain and halation | Grain and a restrained bloom in post | Very little |

Saying "this is an approximation of a pre-rendered effect" up front is better work than quietly
shipping something worse and hoping nobody compares.

## Build, then compare in the same frame

Screenshot your build at the same viewport as the reference crop and put them side by side. The
differences that matter are almost always the ones you would never notice reading code:

- Is your object the same size in the frame? Scale is the most commonly missed thing.
- Is the empty space in the same places?
- Is the value range the same — is your version washed out or crushed by comparison?
- Is the accent colour used as sparingly?

`scripts/audit.mjs` gives you mean luminance and saturation for both, which turns "mine looks
brighter" into a number.

## Recreating someone else's design

Rebuilding a design to study it is normal practice and how most people learn this craft. Keep it
honest:

- Write your own code. Do not lift assets, and do not lift copy or brand names into anything
  public — swap in your own.
- Credit the original in the README with a link, and say it is a rebuild.
- Note in the write-up which parts are approximations rather than matches.
- A study is not a product. If the work is going to ship commercially, that is a different
  conversation and the answer is usually to take the *principles* and not the composition.
