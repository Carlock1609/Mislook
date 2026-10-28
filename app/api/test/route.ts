/**
 * @file Checks the test link. The key is `MISLOOK_TEST_KEY` and never leaves
 * the server. A wrong key and a missing key look the same.
 */

import { connection } from "next/server"
import { createBurstLimiter } from "@/lib/stats-guard"
import { matchesTestKey } from "@/lib/test-mode"

const allow = createBurstLimiter(20, 60_000)

function answer(testing: boolean, status = 200) {
  return Response.json({ testing }, { status, headers: { "Cache-Control": "no-store" } })
}

/** Confirms `?test=` for this browser. The page then skips the daily lock. */
export async function POST(request: Request) {
  await connection()
  const ip = request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local"
  if (!allow(ip)) return answer(false, 429)
  const length = Number(request.headers.get("content-length") ?? 0)
  if (length > 200) return answer(false)
  let key: string | null = null
  try {
    const body = (await request.json()) as { key?: unknown }
    key = typeof body.key === "string" ? body.key : null
  } catch {
    key = null
  }
  return answer(matchesTestKey(key, process.env.MISLOOK_TEST_KEY ?? ""))
}
