# Site stats

The small line on every screen, e.g. `12,481 visits · 3,207 visitors`. It's the
app's only storage.

## Pieces

| File | Role |
| --- | --- |
| `app/api/stats/route.ts` | `GET` returns totals; `POST { visitorId }` records a visit and returns totals |
| `lib/redis.ts` | Server-only Upstash REST client (`pipeline`) using plain `fetch` |
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
- **No bot filtering**, so counts are approximate.

## Privacy

No IP addresses, cookies, personal data or third-party trackers. The visitor id is
random and not linked to anything. The id is validated (`^[a-zA-Z0-9-]{8,64}$`)
before it reaches Redis.

## Failure behaviour

Stats never block the game. If Redis isn't configured or a request fails, the route
answers `503` and the line hides itself. Without credentials (for example in local
development), the line is hidden and the browser console shows the 503.

## Setup

1. In the Vercel dashboard, add **Upstash Redis** (free tier) from the Marketplace and
   connect it to the project. That sets the environment variables.
2. Either pair works:
   - `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
   - `KV_REST_API_URL` and `KV_REST_API_TOKEN`
3. To see real numbers locally, put the same pair in `.env.local` (git-ignored).
   Local page views still only read; they never add visits.
