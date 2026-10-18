/**
 * @file Site stats: total visits and unique visitors.
 *
 * - `GET` returns the totals.
 * - `POST { visitorId }` records one visit (`INCR`), adds the anonymous id to
 *   a HyperLogLog (`PFADD`), and returns the new totals.
 *
 * The client decides when a visit counts (once per tab session, never from
 * localhost or `?day` previews); see `lib/stats.ts`. No IPs, cookies or
 * personal data are stored. Responds 503 when Redis isn't configured, and the
 * stats line hides itself.
 */

import { connection } from "next/server"
import { pipeline, RedisError } from "@/lib/redis"

const VISITS_KEY = "mislook:visits"
const VISITORS_KEY = "mislook:visitors"

/** Anonymous ids are random UUIDs from the browser; reject anything else. */
const VISITOR_ID = /^[a-zA-Z0-9-]{8,64}$/

/** Shape of every successful response. */
type StatsResponse = { visits: number; visitors: number }

export async function GET() {
  await connection()
  return respond(async () => {
    const [visits, visitors] = await pipeline([
      ["GET", VISITS_KEY],
      ["PFCOUNT", VISITORS_KEY],
    ])
    return { visits: Number(visits ?? 0), visitors: Number(visitors ?? 0) }
  })
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { visitorId?: unknown } | null
  const visitorId = body?.visitorId
  if (typeof visitorId !== "string" || !VISITOR_ID.test(visitorId)) {
    return Response.json({ error: "Invalid visitor id" }, { status: 400 })
  }
  return respond(async () => {
    const [visits, , visitors] = await pipeline([
      ["INCR", VISITS_KEY],
      ["PFADD", VISITORS_KEY, visitorId],
      ["PFCOUNT", VISITORS_KEY],
    ])
    return { visits: Number(visits), visitors: Number(visitors) }
  })
}

/** Runs a Redis read/write and turns failures into a 503 the client can quietly ignore. */
async function respond(work: () => Promise<StatsResponse>) {
  try {
    return Response.json(await work(), { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    if (!(error instanceof RedisError)) console.error(error)
    return Response.json({ error: "Stats unavailable" }, { status: 503 })
  }
}
