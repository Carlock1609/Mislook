/**
 * @file Site stats: total visits and unique visitors.
 *
 * - `GET` returns the totals. Cached by Vercel's CDN for a minute, so however
 *   often it's called, Redis is read at most about once a minute per region.
 *   Query strings are refused, because each different one would skip the
 *   cache and reach Redis.
 * - `POST { visitorId }` records one visit (`INCR`), adds the anonymous id to
 *   a HyperLogLog (`PFADD`), and returns the new totals.
 *
 * A POST only counts after passing, in order (cheapest first, so junk costs
 * no Redis commands):
 * 1. body size and visitor id format;
 * 2. same-origin check (a page on another site can't post here);
 * 3. user-agent check (crawlers and scripting tools are never counted);
 * 4. an in-memory burst limit per IP;
 * 5. Vercel BotID (`checkBotId`), an invisible challenge that headless
 *    browsers and scripts fail;
 * 6. Redis limits: per IP per hour, then a daily cap on counted visits (the
 *    cap only counts requests that passed the per-IP limit, so one IP can't
 *    use it up for everyone).
 * A request that fails any step gets `{ counted: false }` with no detail, and
 * the browser falls back to the cached GET.
 *
 * Only production writes to the real counters. Development writes to a
 * separate `mislook:dev:` set of keys (for testing); preview deployments
 * never write. Reads always show the real (production) totals.
 *
 * No IPs, cookies or personal data are stored: rate-limit keys use a keyed
 * hash of the IP that expires within the hour. Responds 503 when Redis isn't
 * configured, and the stats line hides itself.
 */

import { checkBotId } from "botid/server"
import { connection } from "next/server"
import { pipeline, RedisError, serverSecret } from "@/lib/redis"
import { clientKey, createBurstLimiter, isSameOrigin, looksLikeBot, MAX_BODY_BYTES } from "@/lib/stats-guard"

/** Real counters. */
const LIVE = "mislook:"
/** Where writes go outside production, so testing never touches the real counts. */
const SANDBOX = "mislook:dev:"

/** Counted visits allowed per IP per hour (households share one IP, so this is generous). */
const PER_IP_PER_HOUR = 20
/** Counted visits allowed per day across the whole site; caps the worst-case Redis usage. */
const DAILY_CAP = 3000
/** POSTs per IP per minute one server instance lets through to Redis at all. */
const burst = createBurstLimiter(10, 60_000)
/** GETs per IP per minute one server instance answers on a CDN cache miss. */
const readBurst = createBurstLimiter(30, 60_000)

/** Anonymous ids are random UUIDs from the browser; reject anything else. */
const VISITOR_ID = /^[a-zA-Z0-9-]{8,64}$/

/** Shape of every successful totals response. */
type StatsResponse = { visits: number; visitors: number }

/** CDN caching for totals: fresh for 60s, then served stale while one request refreshes. */
const CACHED = "public, max-age=0, s-maxage=60, stale-while-revalidate=600"

export async function GET(request: Request) {
  await connection()
  // A query string would make every request a cache miss that reaches Redis.
  if (new URL(request.url).search !== "") {
    return Response.json({ error: "No query parameters" }, { status: 400 })
  }
  try {
    if (!readBurst(await clientKey(request, serverSecret()))) {
      return Response.json({ error: "Too many requests" }, { status: 429, headers: { "Cache-Control": "no-store" } })
    }
  } catch {
    return Response.json({ error: "Stats unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } })
  }
  return respond(CACHED, async () => {
    const [visits, visitors] = await pipeline([
      ["GET", `${LIVE}visits`],
      ["PFCOUNT", `${LIVE}visitors`],
    ])
    return { visits: Number(visits ?? 0), visitors: Number(visitors ?? 0) }
  })
}

export async function POST(request: Request) {
  const notCounted = () => Response.json({ counted: false }, { status: 202, headers: { "Cache-Control": "no-store" } })

  // 1. Size and shape. The declared length is checked first (a missing or
  // malformed one is refused), then the body actually read, in case it lies.
  const declared = Number(request.headers.get("content-length"))
  if (!(declared > 0 && declared <= MAX_BODY_BYTES)) return Response.json({ error: "Too large" }, { status: 413 })
  const text = await request.text().catch(() => "")
  if (text.length > MAX_BODY_BYTES) return Response.json({ error: "Too large" }, { status: 413 })
  let body: { visitorId?: unknown } | null = null
  try {
    body = JSON.parse(text)
  } catch {
    // Not JSON: treated as a missing id below.
  }
  const visitorId = body?.visitorId
  if (typeof visitorId !== "string" || !VISITOR_ID.test(visitorId)) {
    return Response.json({ error: "Invalid visitor id" }, { status: 400 })
  }

  // 2–3. Only this site's pages, only real browsers.
  if (!isSameOrigin(request) || looksLikeBot(request)) return notCounted()

  const environment = process.env.VERCEL_ENV ?? "development"
  if (environment === "preview") return notCounted()
  const prefix = environment === "production" ? LIVE : SANDBOX

  let ipKey: string
  try {
    ipKey = await clientKey(request, serverSecret())
  } catch {
    return Response.json({ error: "Stats unavailable" }, { status: 503 })
  }

  // 4. Bursts from one IP stop here, before any Redis command.
  if (!burst(ipKey)) return notCounted()

  // 5. Invisible bot challenge (bypassed automatically in development). If
  // the check itself fails, don't count: fail closed.
  try {
    if ((await checkBotId()).isBot) return notCounted()
  } catch {
    return notCounted()
  }

  return respond("no-store", async () => {
    // 6a. Per-IP hourly limit.
    const hour = Math.floor(Date.now() / 3_600_000)
    const ipLimitKey = `${prefix}limit:${ipKey}:${hour}`
    const [perIp] = await pipeline([
      ["INCR", ipLimitKey],
      ["EXPIRE", ipLimitKey, 3600],
    ])
    if (Number(perIp) > PER_IP_PER_HOUR) return null

    // 6b. Site-wide daily cap, only for requests within their IP's limit.
    const dayKey = `${prefix}day:${new Date().toISOString().slice(0, 10)}`
    const [today] = await pipeline([
      ["INCR", dayKey],
      ["EXPIRE", dayKey, 172_800],
    ])
    if (Number(today) > DAILY_CAP) return null

    const [visits, , visitors] = await pipeline([
      ["INCR", `${prefix}visits`],
      ["PFADD", `${prefix}visitors`, visitorId],
      ["PFCOUNT", `${prefix}visitors`],
    ])
    return { visits: Number(visits), visitors: Number(visitors) }
  })
}

/**
 * Runs a Redis read/write and turns failures into a 503 the client can quietly
 * ignore. `work` returning null means "not counted".
 */
async function respond(cacheControl: string, work: () => Promise<StatsResponse | null>) {
  try {
    const totals = await work()
    if (!totals) return Response.json({ counted: false }, { status: 202, headers: { "Cache-Control": "no-store" } })
    return Response.json(totals, { headers: { "Cache-Control": cacheControl } })
  } catch (error) {
    if (!(error instanceof RedisError)) console.error(error)
    return Response.json({ error: "Stats unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } })
  }
}
