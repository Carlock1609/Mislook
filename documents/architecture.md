# Architecture

## Stack

- **Next.js 16** (App Router) with `cacheComponents` on, **React 19**, **TypeScript**.
  This Next version differs from older ones; read `node_modules/next/dist/docs/`
  before touching Next APIs (see `AGENTS.md`).
- **Tailwind CSS v4**, configured in `app/globals.css` (design tokens as `@theme` variables).
- **WebGL 1** written by hand (no Three.js or ogl), with a **Canvas 2D** fallback.
- **Upstash Redis** over its REST API for the visit counter only.
- Hosted on **Vercel**; pushes to `main` deploy.

## Folder layout

```text
app/
  layout.tsx              fonts, global CSS, metadata (metadataBase, Open Graph, Twitter)
  page.tsx                renders <Mislook />, the whole app
  opengraph-image.tsx     static 1200×630 link-preview card (no daily image)
  twitter-image.tsx       the same card, for X
  fonts/                  Archivo Black (.ttf), bundled for the preview card
  api/stats/route.ts      GET/POST site stats (Redis)
components/
  Mislook.tsx             top-level client component: day, phase, round state
  HowToPlay.tsx           first screen (and Coming soon)
  game/                   Game screen, MislookImage (canvas), GuessBar, StageTrack, Countdown
  result/Result.tsx       result screen
  dev/TestPanel.tsx       development-only distortion tuning panel
  fx/                     Background (op-art), Wordmark
  SiteStats.tsx, TopBar.tsx, ui.ts
instrumentation-client.ts starts Vercel BotID in the browser
next.config.ts            security headers (CSP etc.), BotID rewrites
lib/
  content.ts              typed access to content/*.json
  daily.ts                Pacific-time day maths (pure)
  normalize.ts            answer matching (pure)
  score.ts                scoring and time bonus (pure)
  reduce.ts               the round as a state machine for useReducer (pure)
  share.ts                spoiler-free share text (pure)
  storage.ts              daily lock in localStorage (finished result only)
  *.test.ts               Vitest tests for the pure rules (`npm test`)
  stats.ts                client side of the visit counter
  redis.ts                server-only Upstash REST client
  stats-guard.ts          cheap abuse checks for the stats route
  gl/                     everything that draws the puzzle image (see rendering.md)
content/
  copy.json               every user-facing string
  images.json             one object per photo: title, keyword list, file, style
  settings.json           DAY_0, time zone, scoring, and every style's per-stage values
public/images/            puzzle images
scripts/
  measure-difficulty.mjs  scores and calibrates each style's stage difficulty
documents/                these notes
```

## The page

One route, `/`, statically prerendered. The day can't be known at build time, so
`components/Mislook.tsx` works it out on the client (`getDay`, cached in a module
variable and read through `useSyncExternalStore` so server and client markup agree).

States (the `phase` state; Play never changes the URL):

```text
Coming soon (before DAY_0)
How to play  --Play-->  Game  -->  Result
```

- The puzzle number and the image both wrap after the last photo, so the next day is `#1` again. The saved date stays the real Pacific date.
- `?day=N` previews puzzle number N in development, and only when a photo exists for N. Any other `?day` is removed from the URL and the real day is shown.
- The seed for every random layout is `mislook-<puzzle number>`, so all players see the same distortion.

## Where state lives

All in `Mislook.tsx`, passed down as props:

| State | Purpose |
| --- | --- |
| `phase` | Which screen shows |
| `round` | `useReducer(reduceRound)` from `lib/reduce.ts`: stage, lock, wrongs, busy, timer, win/miss |
| `siteStats` | `undefined` loading, `null` failed (line hidden), or the totals |
| `testView`, `tuning` | Test panel overrides (development only; never change the round) |

`Game` and `Result` render `MislookImage`, which owns the canvas and the renderer
(`lib/gl`). It builds a `Scene` from (style, stage, seed, tuning) and asks the
renderer to show it with the right transition (`stage` between stages, `final`
into the clear image, `none` for anything else).

## Content and settings

Anything tunable lives in `content/`. `lib/content.ts` imports the JSON and types
it. Style stage values are read through `styleValues()` in `lib/gl/scene.ts`,
which also layers the test panel's live tuning on top.

### Keywords

`content/images.json` is the only list of what each photo accepts. One object per
photo, in play order. `title` is the name shown on the result. `accept` is every
guess that wins for that photo. Matching is exact after normalization (case,
punctuation, and a leading "the" do not count as different guesses), so the file
keeps one written form of each guess.

The files in `public/images/` use random names and are square. The source photos
were portrait, so each one is fitted inside the square with a dark margin instead
of being cropped or stretched.

### TODO: keyword difficulty meter

Not built. The idea is three difficulty settings, and three keyword lists on each
photo. The meter picks which list is live. A harder setting keeps only the more
specific names, so a broad guess can win on the easy setting and miss on the hard one.

Today's `accept` array is the broad list. When this is built, split that array
into the three levels in the same file, rather than adding a second place to edit:

```json
"keywords": {
  "easy": ["Tatooine", "Star Wars", "Mos Eisley"],
  "medium": ["Tatooine", "Planet Tatooine", "Twin Suns of Tatooine"],
  "hard": ["Tatooine"]
}
```

The medium and hard lists are not written yet.
