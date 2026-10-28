/**
 * @file Client side of the site stats (see `app/api/stats/route.ts`).
 *
 * - A **visit** is counted once per browser tab session (a `sessionStorage`
 *   flag), so refreshes and Play don't inflate it.
 * - A **visitor** is a random anonymous id kept in `localStorage`. Clearing
 *   storage or switching devices counts as a new visitor; that's accepted.
 * - Visits from localhost, `?day` previews, and a confirmed test link are never counted; those only read.
 */

import type { Stats } from "@/components/SiteStats"

const VISITOR_KEY = "mislook:visitor-id"
const COUNTED_KEY = "mislook:visit-counted"

/** Reads a storage value, or null when storage is blocked. */
function read(storage: () => Storage, key: string) {
  try {
    return storage().getItem(key)
  } catch {
    return null
  }
}

/** Writes a storage value; does nothing when storage is blocked. */
function write(storage: () => Storage, key: string, value: string) {
  try {
    storage().setItem(key, value)
  } catch {
    // Blocked storage only means this browser may be counted again.
  }
}

/** This browser's anonymous visitor id, created on first use. */
function visitorId() {
  const existing = read(() => localStorage, VISITOR_KEY)
  if (existing) return existing
  const id = crypto.randomUUID()
  write(() => localStorage, VISITOR_KEY, id)
  return id
}

/** True when this page view must not be counted: local development, a `?day` preview, or a confirmed test link. */
function isPreview(testing: boolean) {
  const { hostname, search } = window.location
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    new URLSearchParams(search).has("day") ||
    testing
  )
}

let pending: Promise<Stats | null> | null = null

/**
 * Records this visit if it hasn't been counted yet, and returns the totals.
 * The request is made once per page load; later calls share its result.
 * @returns The totals, or null if the request failed (the stats line then hides).
 */
export function loadStats(testing = false): Promise<Stats | null> {
  pending ??= request(testing)
  return pending
}

async function request(testing: boolean): Promise<Stats | null> {
  const count = !isPreview(testing) && read(() => sessionStorage, COUNTED_KEY) !== "1"
  if (count) {
    const counted = await fetchTotals({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitorId: visitorId() }),
    })
    // Any answer (counted or turned away) settles it for this tab, so it never retries.
    if (counted !== undefined) write(() => sessionStorage, COUNTED_KEY, "1")
    if (counted) return counted
  }
  // Not counting, or the visit wasn't counted: read the (CDN-cached) totals.
  return (await fetchTotals()) ?? null
}

/**
 * Calls the stats route.
 * @returns The totals; null when the server answered without totals (a visit
 * not counted); undefined when the request failed.
 */
async function fetchTotals(init?: RequestInit): Promise<Stats | null | undefined> {
  try {
    const response = await fetch("/api/stats", init)
    if (!response.ok) return undefined
    const data = (await response.json()) as Partial<Stats>
    return typeof data.visits === "number" && typeof data.visitors === "number" ? (data as Stats) : null
  } catch {
    return undefined
  }
}
