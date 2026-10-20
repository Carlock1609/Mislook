# Mislook technical documents

Notes on how the app is built, for anyone (or any AI session) picking the code up.
The product brief, `mislook-app-brief.md` at the repo root, is the source of truth for
*what* the game should do. These documents explain *how* the current code does it.

| Document | What it covers |
| --- | --- |
| [architecture.md](architecture.md) | Stack, folder layout, the single page and its states, where state lives |
| [rendering.md](rendering.md) | How a distorted stage gets drawn: scenes, the WebGL and Canvas 2D renderers, shaders, transitions |
| [distortion-styles.md](distortion-styles.md) | Every distortion style, its settings keys and stage values, and how to add a new one |
| [test-panel.md](test-panel.md) | The development-only TEST panel and the tuning workflow |
| [site-stats.md](site-stats.md) | The visits and visitors counter: API route, Redis, privacy, setup |
| [security.md](security.md) | Threats, defences, bot protection, cost safety |

## Build status

Written against build steps 1–5 of the brief, plus the site stats from step 6.
`components/Mislook.tsx` drives the round with `useReducer(reduceRound)` and
locks a finished day via `lib/storage.ts`. The link preview card, polish
(step 7) and real images (step 8) haven't landed yet.

## Checks

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```

Difficulty calibration: `node scripts/measure-difficulty.mjs --calibrate` (see
[distortion-styles.md](distortion-styles.md#calibrating-difficulty)).

Code style is Prettier with `--no-semi --print-width 120` (no config file is checked in).
