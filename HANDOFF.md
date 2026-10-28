# Mislook — Handoff

Where the build stands, how it deploys, and what's next. Start here when you pick the project back up.

- **What the game should do:** [mislook-app-brief.md](mislook-app-brief.md). This is the source of truth for rules, numbers and copy.
- **How the code does it:** [documents/](documents/README.md). Covers architecture, rendering, distortion styles, the test panel, site stats and security.

Last updated: 2026-10-27 (playable round on `cursor/wire-game-daily-lock`, ready to merge).

---

## Status

| # | Build step (from the brief) | State |
| --- | --- | --- |
| 1 | Shell: how to play, coming soon, game and result states | ✅ Done |
| 2 | WebGL image with three v1 styles (tile shuffle, hidden tiles, ripple), transitions, Canvas 2D fallback, dev test panel | ✅ Done (plus test-panel candidates; two-tone and several experiments removed) |
| 3 | Rules: `normalize`, `score`, `reduce`, `share`, with Vitest tests (also tests for `daily`) | ✅ Done (`npm test`) |
| 4 | Wire the game: guess, reveal, timer, countdown, result | ✅ Done (`Mislook.tsx` uses `useReducer(reduceRound)`, live `pointsAvailable` / time bonus, `shareText`) |
| 5 | Daily lock in `localStorage` | ✅ Done (`lib/storage.ts`; refresh after finishing reopens Result; `?day=` never reads/writes) |
| 6 | Share text, link preview card, site stats | 🟡 Site stats done. Share text is wired. **Next:** link preview card (`opengraph-image`) |
| 7 | Op-art background, wordmark motion, keyboard/safe-area, loading/error states, a11y | ⬜ |
| 8 | Real images and answers | ✅ Done (first ten in `content/images.json` and `public/images/`) |

The "Done when" criteria for each step are in the brief under **Build order**.

Also in this branch, beyond steps 4 and 5:

- A skip costs 200. A wrong guess still costs 400, and Reveal after a wrong guess is not charged again as a skip.
- Share text is the puzzle date plus `WON` or `LOST`, the stage, the score, and the time. No square row.
- How to play → game, and game → result, are a short fade. Stage reveals are unchanged.
- Daily rotation is tile shuffle, hidden tiles, and ripple.

### Known placeholders

- `content/copy.json`: placeholder how-to-play, win and miss copy.
- `motion` is in the brief's stack but **not installed yet**. Add it when the UI motion work starts (step 7).

---

## Deployment

- **Repo:** `github.com/Carlock1609/mislook`, branch `main`.
- **Host:** Vercel project `mislook`. A push to `main` deploys to production. Other branches and PRs get preview deployments.
- **Redis:** Upstash (free tier) is connected for all environments (`KV_REST_API_URL` / `KV_REST_API_TOKEN`). Only production writes the real counters. See [documents/site-stats.md](documents/site-stats.md).
- **Security headers / CSP** are in `next.config.ts`. If you add an external script, font or image host, the CSP has to allow it or it will be blocked. See [documents/security.md](documents/security.md).

### Which URL to share

- **Production (public):** [playmislook.com](https://playmislook.com) — Cloudflare in front of the Vercel production deployment.
- Per-deployment and preview URLs (`*.vercel.app`) may still require a Vercel login under **Deployment Protection**. Share the production domain, not a preview URL, unless you turn that off.
- To make previews public too (for example, to text a preview to family before merging), go to Vercel → `mislook` → **Settings → Deployment Protection** and turn off **Vercel Authentication**.

### Before launch

- Set `DAY_0` in `content/settings.json` to the real launch date. It is currently `2026-10-18`. The puzzle number and the image order both count from it.
- Text the production URL to yourself to check the link preview card (step 6).

---

## Working on it (Cursor or anywhere)

```bash
npm install
vercel env pull .env.local   # optional: real stats locally (after `vercel link`)
npm run dev                  # http://localhost:3000, the TEST panel is in the top-left
npm test                     # Vitest: pure rules in lib/*.test.ts
npx tsc --noEmit && npm run lint && npm run build   # before pushing
```

- `?day=N` (dev only) previews puzzle `#N`. `?day=0` shows Coming soon.
- Code style: Prettier with `--no-semi --print-width 120`. Pure rules go in `lib/` and never import React.
- Next.js 16 differs from older versions. Read `node_modules/next/dist/docs/` before using a new Next API (see `AGENTS.md`, which Cursor reads automatically).
- To start a step in Cursor, prompt something like: *"Read HANDOFF.md, mislook-app-brief.md and documents/architecture.md, then do build step 4."*
- Small tweaks can go straight to `main`. For bigger steps, push a branch and check the Vercel preview first.

### Order

Core play path through step 5 is in. Natural next pieces:

- the link preview card (finishes step 6)
- step 7 (polish)
- style tuning in the TEST panel (copy the numbers into `settings.json`)

---

## After v1

From the brief's **Later** list:

- "Guess the original" (AI op-art versions of public-domain works)
- stacked-layer distortion
- promoting candidate styles into rotation
- near-miss matching
- then a leaderboard and accounts
- a keyword difficulty meter: three settings, three lists per photo (see [documents/architecture.md](documents/architecture.md)). Today's `accept` list is the broad one. The tighter lists are not written yet.

All of these are out of scope until v1 ships.
