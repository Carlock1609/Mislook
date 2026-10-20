# Mislook — Handoff

Where the build stands, how it deploys, and what's next. Start here when you pick the project back up.

- **What the game should do:** [mislook-app-brief.md](mislook-app-brief.md). This is the source of truth for rules, numbers and copy.
- **How the code does it:** [documents/](documents/README.md). Covers architecture, rendering, distortion styles, the test panel, site stats and security.

Last updated: 2026-10-19 (after build step 3).

---

## Status

| # | Build step (from the brief) | State |
| --- | --- | --- |
| 1 | Shell: how to play, coming soon, game and result states | ✅ Done |
| 2 | WebGL image with four v1 styles, transitions, Canvas 2D fallback, dev test panel | ✅ Done (plus many test-panel candidate styles and a difficulty calibration script) |
| 3 | Rules: `normalize`, `score`, `reduce`, `share`, with Vitest tests (also tests for `daily`) | ✅ Done (`npm test`) |
| 4 | Wire the game: guess, reveal, timer, countdown, result | ⬜ **Next**: replace the placeholder round in `Mislook.tsx` with `useReducer(reduceRound)`, `pointsAvailable`, `shareText` |
| 5 | Daily lock in `localStorage` | ⬜ |
| 6 | Share text, link preview card, site stats | 🟡 Site stats done (Upstash Redis, BotID, rate limits). Share text and the preview card are left |
| 7 | Op-art background, wordmark motion, keyboard/safe-area, loading/error states, a11y | ⬜ |
| 8 | Real images and answers | ⬜ |

The "Done when" criteria for each step are in the brief under **Build order**.

### Known placeholders

- `components/Mislook.tsx`: the round logic is still a placeholder. The real rules exist in `lib/` (step 3) but aren't wired in yet (step 4).
- `content/images.json`: 10 dummy images and answers (step 8).
- `content/copy.json`: placeholder how-to-play, win and miss copy.
- `motion` is in the brief's stack but **not installed yet**. Add it when the UI motion work starts (step 4 or 7).

---

## Deployment

- **Repo:** `github.com/Carlock1609/mislook`, branch `main`.
- **Host:** Vercel project `mislook`. A push to `main` deploys to production. Other branches and PRs get preview deployments.
- **Redis:** Upstash (free tier) is connected for all environments (`KV_REST_API_URL` / `KV_REST_API_TOKEN`). Only production writes the real counters. See [documents/site-stats.md](documents/site-stats.md).
- **Security headers / CSP** are in `next.config.ts`. If you add an external script, font or image host, the CSP has to allow it or it will be blocked. See [documents/security.md](documents/security.md).

### Which URL to share

Every deployment gets its own URL, like `mislook-hcsofnj5i-carlock-enterprise-s.vercel.app`. With Vercel's default **Standard Protection**, those per-deployment and preview URLs require a Vercel login. That's why your phone showed a login wall. Only the **production domain** is public.

- **Share the production domain.** Find it in Vercel → `mislook` → **Settings → Domains** (something like `mislook.vercel.app` or `mislook-<team>.vercel.app`).
- To make previews public too (for example, to text a preview to family before merging), go to **Settings → Deployment Protection** and turn off **Vercel Authentication**.
- A custom domain can be added later under **Settings → Domains**.

### Before launch

- Set `DAY_0` in `content/settings.json` to the real launch date. It is currently `2026-10-18`. The puzzle number and the image order both count from it.
- Swap in the real images (step 8). Use random file names, square ~1200px `.webp`, in `public/images/`.
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

Steps 3 → 4 → 5 depend on each other, so do them in order. Share text fits naturally after step 4. These can happen anytime:

- the link preview card
- step 7 (polish)
- step 8 (content)
- style tuning in the TEST panel (copy the numbers into `settings.json`)

---

## After v1

From the brief's **Later** list:

- "Guess the original" (AI op-art versions of public-domain works)
- stacked-layer distortion
- promoting candidate styles into rotation
- near-miss matching
- then a leaderboard and accounts

All of these are out of scope until v1 ships.
