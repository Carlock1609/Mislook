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
  layout.tsx              fonts, global CSS, metadata
  page.tsx                renders <Mislook />, the whole app
  api/stats/route.ts      GET/POST site stats (Redis)
components/
  Mislook.tsx             top-level client component: day, phase, round state
  HowToPlay.tsx           first screen (and Coming soon)
  game/                   Game screen, MislookImage (canvas), GuessBar, StageTrack, Countdown
  result/Result.tsx       result screen
  dev/TestPanel.tsx       development-only distortion tuning panel
  fx/                     Background (op-art), Wordmark
  SiteStats.tsx, TopBar.tsx, ui.ts
lib/
  content.ts              typed access to content/*.json
  daily.ts                Pacific-time day maths (pure)
  stats.ts                client side of the visit counter
  redis.ts                server-only Upstash REST client
  gl/                     everything that draws the puzzle image (see rendering.md)
content/
  copy.json               every user-facing string
  images.json             the image list: file, style, title, accepted answers, optional focus
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

- `?day=N` previews puzzle number N, in development only.
- The image is `images[dayIndex % images.length]`; the seed for every random
  layout is `mislook-<puzzle number>`, so all players see the same distortion.

## Where state lives

All in `Mislook.tsx`, passed down as props:

| State | Purpose |
| --- | --- |
| `phase` | Which screen shows |
| `stage`, `locked`, `wrongGuesses`, `busy`, `result` | Placeholder round logic until build steps 3–4 |
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
