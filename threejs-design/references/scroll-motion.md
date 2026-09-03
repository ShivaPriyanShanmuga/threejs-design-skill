# Scroll & Motion

Scroll-driven 3D fails in two predictable ways: the motion fights the scroll (jitter, desync,
scroll-jacking that steals control), or the motion is technically fine but reads as mechanical.
Both are solvable and neither is about the 3D.

## Smooth scroll

Native scroll is stepped — a wheel event jumps 100px at a time — so anything driven directly off
`window.scrollY` snaps between positions. Lenis interpolates it:

```js
import Lenis from 'lenis';

const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
function raf(time) { lenis.raf(time); requestAnimationFrame(raf); }
requestAnimationFrame(raf);
```

Keep `duration` around 1.0–1.3. Above about 1.5 the page feels like it is ignoring you, which is
worse than no smoothing at all. Leave `smoothTouch` off: touch devices already have momentum
scrolling, and overriding it feels broken.

**With GSAP ScrollTrigger, drive Lenis from GSAP's ticker.** Two independent RAF loops will
drift apart, and the symptom is pinned sections lagging a frame behind the scroll:

```js
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));   // GSAP ticker is in seconds, Lenis wants ms
gsap.ticker.lagSmoothing(0);                          // stop GSAP from swallowing long frames
```

That is the whole integration, and getting it wrong is the most common cause of "the scroll
animation is subtly janky".

## Reading scroll in the 3D loop

Normalise progress to 0–1 once, in one place, and have the scene read that. Do not scatter
`scrollY / (scrollHeight - innerHeight)` through your components.

```js
let scrollTarget = 0;       // written by the scroll listener
let scrollSmooth = 0;       // read by the scene

lenis.on('scroll', ({ progress }) => { scrollTarget = progress; });

// in the render loop
scrollSmooth = THREE.MathUtils.damp(scrollSmooth, scrollTarget, 4, delta);
```

Damping toward the target rather than reading it raw does two things: it absorbs the remaining
stepping from trackpads and scroll wheels, and it gives the 3D a slight lag behind the page that
reads as weight. Lambda 3–5 is a good range; higher feels locked to the page, lower feels
disconnected.

For per-section progress, ScrollTrigger's `scrub` gives you the same thing scoped to an element.
`scrub: true` is instant; `scrub: 1` adds a one-second catch-up and is almost always the better
choice for 3D.

```js
ScrollTrigger.create({
  trigger: '#chapter-2', start: 'top bottom', end: 'bottom top',
  scrub: 1,
  onUpdate: (self) => { state.chapter2 = self.progress; },
});
```

## Camera paths

For a camera that travels through a scene, a spline beats keyframed positions — it stays smooth
through every turn and you can reason about the whole route at once.

```js
const path = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 1, 8),
  new THREE.Vector3(4, 2, 3),
  new THREE.Vector3(2, 0.5, -4),
  new THREE.Vector3(-3, 3, -6),
]);
path.curveType = 'catmullrom';
path.tension = 0.4;                    // lower is smoother; 0.5 is the default and often too loopy

const LOOK_AHEAD = 0.03;
function updateCamera(t) {                       // t is the damped 0–1 progress
  camera.position.copy(path.getPointAt(t));
  const ahead = path.getPointAt(Math.min(t + LOOK_AHEAD, 1));
  camera.lookAt(ahead);
}
```

Two details do most of the work here:

- **`getPointAt`, not `getPoint`.** `getPoint` samples the curve's parameter space, so the camera
  speeds up through gentle sections and crawls through tight ones for no reason.  `getPointAt` is
  arc-length parameterised, so progress maps to constant speed along the path.
- **Look-ahead.** Aiming the camera at a point slightly further along the curve means it turns
  into a corner before arriving — the anticipation a real operator gives you. Aiming at a fixed
  target instead produces a rigid, mechanical pan. Damp the lookAt target separately, with a lower
  lambda than the position, and the camera turns lazily behind its own motion, which is what sells
  it.

For a static camera with moving content, invert this: keep the camera still and move the scene.
It is easier to reason about and avoids near-plane clipping surprises.

## R3F: ScrollControls versus Lenis

drei's `<ScrollControls>` puts a scrollable DOM element over the canvas and hands you
`useScroll()` with `offset` and `range()`. It is the fastest path when the page *is* the 3D
experience:

```jsx
<ScrollControls pages={4} damping={0.25}>
  <Scene />
  <Scroll html><h1>…</h1></Scroll>
</ScrollControls>
```

Choose it for a self-contained 3D story. Choose Lenis + ScrollTrigger when the 3D is one element
in a normal marketing page with real DOM sections, SEO requirements, and other scroll animations
to coordinate with — `<ScrollControls>` owns the scroll container, which fights everything else on
the page.

`useScroll().range(start, distance)` returns a clean 0–1 for a slice of the scroll, which is the
right way to sequence beats: `range(0, 1/4)` for the first quarter, and so on.

## Making motion read as designed

- **Nothing linear.** Linear motion is the signature of a first draft. Anything that starts and
  stops needs an ease; anything continuous needs a noise or sine variation so its speed is not
  constant.
- **Overlap, do not sequence.** If the camera moves, the object rotates, and text fades in, start
  them 100–200ms apart. Simultaneous starts read as one mechanical event; a stagger reads as
  choreography.
- **Slower than feels right.** A hero element rotating once every 30–60 seconds reads as premium.
  The same element at 5 seconds reads as a screensaver. When in doubt, halve the speed.
- **Mouse response is damped, always.** Track the pointer toward a target with `damp` at lambda
  3–6, and keep the amplitude small — a few degrees of rotation, a few percent of parallax. 1:1
  mouse tracking feels twitchy and cheap; the goal is that the object seems aware of the cursor,
  not attached to it.
- **Parallax by depth.** If several layers respond to the mouse or scroll, move the near ones more
  than the far ones. That single relationship is most of the perceived depth.

## Reduced motion

Scroll-driven 3D is exactly the category that triggers vestibular disorders. Honour the
preference — do not ship without it:

```js
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
```

Do not just disable everything and leave a blank hero. Keep the scene, drop the motion: hold the
camera at the first path position, stop the auto-rotation, disable parallax and any scroll-linked
movement, and let content cross-fade instead of travelling. In R3F, `frameloop="demand"` plus a
single `invalidate()` renders one correct frame and then idles.
