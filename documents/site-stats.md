# Site stats

The small line on every screen, e.g. `12,481 visits · 3,207 visitors`. It's the
app's only storage.

## Pieces

| File | Role |
| --- | --- |
| `app/api/stats/route.ts` | `GET` returns totals; `POST { visitorId }` records a visit and returns totals |
| `lib/redis.ts` | Server-only Upstash REST client (`pipeline`) using plain `fetch` |
| `lib/stats-guard.ts` | Same-origin, bot user-agent, IP hashing and burst-limit checks |
| `instrumentation-client.ts` | Starts Vercel BotID for `POST /api/stats` |
| `lib/stats.ts` | Client: decides whether this page view counts, calls the route once per page load |
| `components/SiteStats.tsx` | Renders the line: dash while loading, nothing if the request failed |

## Counting rules

- **Visits:** Redis `INCR mislook:visits`, once per browser tab session (a
  `sessionStorage` flag, `mislook:visit-counted`), so refreshes and Play don't
  inflate it. The flag is set only after the server confirms.
- **Unique visitors:** a random UUID in `localStorage` (`mislook:visitor-id`),
  added to a HyperLogLog with `PFADD mislook:visitors`; the count is `PFCOUNT`.
  Clearing storage or switching devices counts as a new visitor.
- **Not counted:** `localhost`, `127.0.0.1`, `[::1]` and any `?day` preview. These only `GET`.
- **Abuse protection:** see [security.md](security.md). In short, a POST only
  counts if it comes from this site's page, from a real browser (user agent and
  BotID), and within the per-IP and daily limits. Otherwise the server replies
  `{ "counted": false }` and the browser shows the cached totals.
- **Environments:** only production writes the real counters (`mislook:*`).
  Development writes `mislook:dev:*`; preview deployments never write. Every
  environment reads the real totals.
- Counts are still approximate: a determined bot can add a few visits within the caps.

## Privacy

No IP addresses, cookies, personal data or third-party trackers. The visitor id is
random and not linked to anything. The id is validated (`^[a-zA-Z0-9-]{8,64}$`)
before it reaches Redis.

## Failure behaviour

Stats never block the game. If Redis isn't configured or a request fails, the route
answers `503` and the line hides itself. Totals (`GET`) are cached by Vercel's CDN
for 60 seconds, so the line can lag real visits by up to a minute. Without credentials (for example in local
development), the line is hidden and the browser console shows the 503.

## Setup (done)

1. Upstash Redis (Free plan, region `iad1`, eviction off) was added from the Vercel
   Marketplace and connected to the project for all environments with the prefix
   `KV`, which creates `KV_REST_API_URL` and `KV_REST_API_TOKEN` (the code also
   accepts `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`).
2. Locally: `vercel link`, then `vercel env pull .env.local` (git-ignored), then
   restart the dev server.
