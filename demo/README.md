# demo

A placeholder portfolio hero, built by following the `threejs-design` skill in this repo and used
to test it. The persona and copy are fictional — swap them.

```bash
npm install
npm run dev
```

| File | |
| --- | --- |
| `src/App.jsx` | Canvas config, the post chain, and the DOM hero that sits on top of it |
| `src/Orb.jsx` | The form: uniforms, the damped mouse response, reduced-motion handling |
| `src/shaders.js` | GLSL — fbm, domain warping, recomputed normals, fresnel, cosine palette, dither |
| `src/index.css` | Type and the scrim that keeps the 3D from competing with it |

The three decisions doing the most work here:

- **The interior is nearly black.** Palette values are authored in linear space, where sRGB output
  roughly square-roots them on the way to the screen — a linear 0.08 lands near 0.31. The form is
  meant to be read from its rim, so the headline stays the brightest thing in the frame.
- **The scrim, not heavier type.** A radial gradient between the canvas and the text buys the
  contrast. Thickening the typography to win against the 3D loses either way.
- **Lambda 1.6 on the pointer.** The orb drifts toward the cursor over about a second. 1:1
  tracking reads as twitchy; this reads as aware.

See the repo README for what the screenshot pass caught and changed.
