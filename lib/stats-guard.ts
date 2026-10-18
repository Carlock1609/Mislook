/**
 * @file Cheap abuse checks for the stats route (server only).
 *
 * These run before anything that costs a Redis command, so junk traffic is
 * turned away for free. They're layers, not walls: each stops a different
 * kind of misuse, and `checkBotId()` plus the Redis rate limits in the route
 * handle what gets through.
 */

/** Largest POST body the stats route accepts, in bytes (a visitor id is ~50). */
export const MAX_BODY_BYTES = 512

/** User agents of crawlers, link previews and scripting tools: answered, never counted. */
const BOT_AGENT =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|curl|wget|python|httpx|axios|node-fetch|go-http|java\/|okhttp|headless|phantom|puppeteer|playwright|lighthouse/i

/** True when the user agent is missing or belongs to a known bot or tool. */
export function looksLikeBot(request: Request) {
  const agent = request.headers.get("user-agent") ?? ""
  return agent === "" || BOT_AGENT.test(agent)
}

/**
 * True when the request comes from this site's own pages. Browsers send
 * `Sec-Fetch-Site` and `Origin` on POSTs, so a form or script on another site
 * can't record visits. (A raw script can fake these; BotID covers that.)
 */
export function isSameOrigin(request: Request) {
  const site = request.headers.get("sec-fetch-site")
  if (site !== null && site !== "same-origin") return false
  const origin = request.headers.get("origin")
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  if (!origin || !host) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

/** The caller's IP as seen by Vercel's edge, or "local" in development. */
function clientIp(request: Request) {
  return request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local"
}

/**
 * A short, non-reversible key for the caller's IP: HMAC-SHA-256 with a server
 * secret, truncated. Rate-limit keys use this so no IP address is ever stored.
 */
export async function clientKey(request: Request, secret: string) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ])
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(clientIp(request))))
  return Array.from(signature.slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("")
}

/**
 * In-memory limiter per server instance: at most `limit` requests per key per
 * `windowMs`. It resets when the instance is recycled, so it only blunts
 * bursts before they reach Redis; the Redis limit is the real one.
 */
export function createBurstLimiter(limit: number, windowMs: number, maxKeys = 5000) {
  const hits = new Map<string, { count: number; resetAt: number }>()
  return (key: string) => {
    const now = Date.now()
    const entry = hits.get(key)
    if (!entry || entry.resetAt <= now) {
      // Keep memory bounded: drop the oldest entry when full.
      if (hits.size >= maxKeys) hits.delete(hits.keys().next().value!)
      hits.set(key, { count: 1, resetAt: now + windowMs })
      return true
    }
    entry.count++
    return entry.count <= limit
  }
}
