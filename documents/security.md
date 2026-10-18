# Security

Mislook has no accounts, no user content and no payments, so the attack surface is
small: the static page, and one API route (`/api/stats`) that writes to Redis.
The main risks are bots inflating the visit counter, someone burning through the
free Upstash quota, and the usual web risks (script injection, clickjacking).

## Threats and defences

| Threat | Defence | Where |
| --- | --- | --- |
| Script injection (XSS) | Strict Content Security Policy: scripts, styles, images, fonts and requests only from this site; no plugins | `next.config.ts` |
| Clickjacking | `X-Frame-Options: SAMEORIGIN` and `frame-ancestors 'self'` | `next.config.ts` |
| Downgrade / sniffing | HSTS (2 years), `X-Content-Type-Options: nosniff`, `upgrade-insecure-requests` | `next.config.ts` |
| Leaking URLs to other sites | `Referrer-Policy: strict-origin-when-cross-origin` | `next.config.ts` |
| Unneeded browser powers | `Permissions-Policy` turns off camera, microphone, location, payment, USB, topics | `next.config.ts` |
| Framework fingerprinting | No `X-Powered-By` header | `next.config.ts` |
| Bots inflating visits | Same-origin check, bot user-agent filter, Vercel BotID invisible challenge | `lib/stats-guard.ts`, `instrumentation-client.ts`, `app/api/stats/route.ts` |
| Flooding the stats route | Per-instance burst limit (10/min/IP, no Redis cost), Redis limit (20 counted visits/hour/IP), daily cap (3,000 counted visits) | `app/api/stats/route.ts` |
| Burning the Redis quota with reads | GET cached by Vercel's CDN (`s-maxage=60`), so Redis is read about once a minute per region | `app/api/stats/route.ts` |
| Junk input | Body ≤ 512 bytes; visitor id must match `^[a-zA-Z0-9-]{8,64}$` | `app/api/stats/route.ts` |
| Test or preview traffic in real counts | Only production writes the real keys; development writes `mislook:dev:*`; previews never write | `app/api/stats/route.ts` |
| Leaked Redis token | Token only on the server (never sent to the browser), git-ignored `.env.local` | `lib/redis.ts`, `.gitignore` |
| Personal data | No IPs, cookies or personal data stored. Rate-limit keys use an HMAC of the IP that expires within the hour | `lib/stats-guard.ts` |

Turned-away requests get a plain `{ "counted": false }` with no reason, so an
attacker learns nothing about which check failed. The browser then shows the
cached totals.

## Cost safety

The Upstash **Free** plan has no card attached, so it **cannot bill you**. If the
monthly command limit (500,000) is ever reached, Redis stops answering until the
next month: the stats line hides itself and the game is unaffected.

Worst case per day: a counted visit costs 7 commands and is capped at 3,000 per
day (21,000 commands). Turned-away requests cost 0 commands (checks 1–5) or 4
(the Redis limit check). Reads cost 2 commands about once a minute per region.

Keep it that way: don't add a payment method to Upstash or upgrade the database
unless you mean to.

## Bot protection (BotID)

`instrumentation-client.ts` starts Vercel BotID in the browser; it runs an
invisible challenge and attaches proof to `POST /api/stats`. The route calls
`checkBotId()` and ignores requests that fail. Basic mode is included on every
Vercel plan. **Deep Analysis** (Vercel dashboard → Firewall) is stronger but may
cost extra; it isn't needed for a visit counter. In development BotID is
bypassed automatically.

## Optional hardening in the Vercel dashboard

- **Firewall → Attack Challenge Mode**: turn on only if the site is under attack.
- **Firewall → custom rules / rate limits**: can block abusive IPs or countries
  before they reach the app (check what your plan includes).
- **Deployment Protection**: keeps preview deployments private.
- **`STATS_SECRET`**: set a long random value to use as the hashing key instead
  of the Redis token (optional).

## What isn't protected (by design)

- **Answers are in the page's JavaScript.** The brief says "trust the player":
  no anti-cheat beyond cheap steps. A determined player can read today's answer
  from the code. Hiding answers would need a server-side guess check.
- **Counts are approximate.** A clever bot that passes BotID, rotates IPs and
  stays under the caps can still add a few visits. The daily cap bounds the damage.

## Upkeep

- Run `npm audit --omit=dev` occasionally (it currently reports 0 issues in
  shipped code; the dev-only ESLint chain has known advisories that don't reach the site).
- Keep `next` updated for security releases.
- If the Redis token ever leaks, rotate it in Upstash, then update the Vercel
  environment variables and redeploy.
