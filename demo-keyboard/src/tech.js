// 25 keycaps, 5x5. Logo paths and brand colours come from `simple-icons`, so there are no
// image assets to ship and no network fetch at runtime.
//
// These are named imports rather than `import * as si` on purpose: the namespace form
// defeats tree-shaking and drags all ~3200 icons into the bundle (6.6 MB of it).
import {
  siDocker,
  siEslint,
  siFigma,
  siGit,
  siGithub,
  siGraphql,
  siJavascript,
  siJest,
  siLinux,
  siMongodb,
  siNextdotjs,
  siNodedotjs,
  siNpm,
  siPostgresql,
  siPrettier,
  siPython,
  siReact,
  siRedis,
  siSass,
  siSupabase,
  siTailwindcss,
  siThreedotjs,
  siTypescript,
  siVercel,
  siVite,
} from 'simple-icons'

const ENTRIES = [
  [siTypescript, "types today so you don't cry tomorrow"],
  [siJavascript, 'undefined is not a function, and never was'],
  [siReact, "everything is a component if you're brave enough"],
  [siNextdotjs, 'is it a server? is it a client? yes'],
  [siNodedotjs, 'javascript escaped the browser and never looked back'],
  [siPython, 'whitespace, with opinions'],
  [siThreedotjs, 'the reason your laptop fan is loud'],
  [siTailwindcss, 'seventeen classes and not one stylesheet'],
  [siGit, "a time machine you'll use wrong at least once"],
  [siGithub, 'where the side projects go to rest'],
  [siDocker, 'it works on my machine, now shipped'],
  [siPostgresql, 'the database that says no, for good reasons'],
  [siMongodb, 'schemas are a social construct'],
  [siVite, 'the waiting was the worst part, so it left'],
  [siFigma, 'where it already looked perfect'],
  [siSupabase, "a backend you didn't have to write"],
  [siRedis, 'remembers things briefly, very fast'],
  [siGraphql, 'ask for exactly what you want, get exactly that'],
  [siSass, 'css with a nesting habit'],
  [siPrettier, 'every argument about semicolons, settled'],
  [siEslint, 'the friend who tells you the truth'],
  [siJest, 'proof that it worked, at least once'],
  [siVercel, "git push, and it's live"],
  [siLinux, 'the machine, actually yours'],
  [siNpm, 'install one thing, get nine hundred'],
]

const luminance = (hex) => {
  const n = parseInt(hex, 16)
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)
}

export const TECH = ENTRIES.map(([icon, blurb]) => {
  // A few brands are pure #000000. Left alone they render as holes rather than keycaps,
  // so floor the darkest ones — they still read as the dark caps they are meant to be.
  const hex = luminance(icon.hex) > 26 ? icon.hex : '2a2c34'
  return {
    title: icon.title,
    blurb,
    path: icon.path,
    color: '#' + hex,
    // Light caps (JavaScript, Linux, Prettier) need a dark logo to stay legible.
    ink: luminance(hex) > 150 ? '#14161c' : '#ffffff',
  }
})

export const GRID = 5
