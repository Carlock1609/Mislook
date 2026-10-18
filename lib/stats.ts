/**
 * @file Client side of the site stats (see `app/api/stats/route.ts`).
 *
 * - A **visit** is counted once per browser tab session (a `sessionStorage`
 *   flag), so refreshes and Play don't inflate it.
 * - A **visitor** is a random anonymous id kept in `localStorage`. Clearing
 *   storage or switching devices counts as a new visitor; that's accepted.
 * - Visits from localhost and `?day` previews are never counted; those only read.
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

/** True when this page view must not be counted: local development or a `?day` preview. */
function isPreview() {
  const { hostname, search } = window.location
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    new URLSearchParams(search).has("day")
  )
}

let pending: Promise<Stats | null> | null = null

/**
 * Records this visit if it hasn't been counted yet, and returns the totals.
 * The request is made once per page load; later calls share its result.
 * @returns The totals, or null if the request failed (the stats line then hides).
 */
export function loadStats(): Promise<Stats | null> {
  pending ??= request()
  return pending
}

async function request(): Promise<Stats | null> {
  const count = !isPreview() && read(() => sessionStorage, COUNTED_KEY) !== "1"
  try {
    const response = await fetch(
      "/api/stats",
      count
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ visitorId: visitorId() }),
          }
        : { cache: "no-store" },
    )
    if (!response.ok) return null
    if (count) write(() => sessionStorage, COUNTED_KEY, "1")
    const data = (await response.json()) as Stats
    return typeof data.visits === "number" && typeof data.visitors === "number" ? data : null
  } catch {
    return null
  }
}
