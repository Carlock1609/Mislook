/**
 * @file Daily lock: save today's finished result in `localStorage`. Pure helpers
 * plus thin storage wrappers. Mid-round progress is never saved. If storage is
 * blocked, the game still works without the lock.
 */

import type { RoundResult } from "@/lib/reduce"

const KEY = "mislook:day-result"

/** What we keep for one finished Pacific date. */
export type SavedDay = {
  date: string
  result: RoundResult
}

/** True when `value` looks like a finished round we can show again. */
export function isRoundResult(value: unknown): value is RoundResult {
  if (!value || typeof value !== "object") return false
  const r = value as Record<string, unknown>
  return (
    typeof r.won === "boolean" &&
    typeof r.stage === "number" &&
    Number.isInteger(r.stage) &&
    r.stage >= 1 &&
    r.stage <= 5 &&
    typeof r.score === "number" &&
    Number.isFinite(r.score) &&
    typeof r.elapsedSeconds === "number" &&
    Number.isFinite(r.elapsedSeconds) &&
    typeof r.wrongGuesses === "number" &&
    Number.isInteger(r.wrongGuesses) &&
    r.wrongGuesses >= 0
  )
}

/** Parses a stored JSON string into a saved day, or null if it's unusable. */
export function parseSavedDay(raw: string | null): SavedDay | null {
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as unknown
    if (!data || typeof data !== "object") return null
    const { date, result } = data as { date?: unknown; result?: unknown }
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
    if (!isRoundResult(result)) return null
    return { date, result }
  } catch {
    return null
  }
}

/** Reads a storage value, or null when storage is blocked. */
function read(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Writes a storage value; does nothing when storage is blocked. */
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // No lock is fine: the game still plays.
  }
}

/** Today's saved result for this Pacific date, or null if none / unavailable. */
export function loadDayResult(date: string): RoundResult | null {
  const saved = parseSavedDay(read(KEY))
  return saved && saved.date === date ? saved.result : null
}

/** Saves the finished result for this Pacific date. Overwrites any previous entry. */
export function saveDayResult(date: string, result: RoundResult) {
  write(KEY, JSON.stringify({ date, result } satisfies SavedDay))
}
