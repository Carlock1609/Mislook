// Pacific-time day maths. Pure: no React, no globals beyond Intl.

const DAY_MS = 86_400_000

type DateParts = { year: number; month: number; day: number; hour: number; minute: number; second: number }

/** Wall-clock date and time of `instant` in `timeZone`, via Intl (handles daylight saving). */
function zonedParts(instant: number, timeZone: string): DateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  }
}

/** `YYYY-MM-DD` for the given instant in `timeZone`. */
export function zonedDateString(instant: number, timeZone: string) {
  const { year, month, day } = zonedParts(instant, timeZone)
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

/** Whole days since the Unix epoch for a `YYYY-MM-DD` string, treating it as a UTC date. */
function dateStringToUtcDay(date: string) {
  const [year, month, day] = date.split("-").map(Number)
  return Date.UTC(year, month - 1, day) / DAY_MS
}

/** Number of zone midnights from `day0` to the instant's date. Negative before `day0`. */
export function dayIndexFor(instant: number, day0: string, timeZone: string) {
  return dateStringToUtcDay(zonedDateString(instant, timeZone)) - dateStringToUtcDay(day0)
}

/** Non-negative modulo, so the image list loops. */
export function imageIndexFor(dayIndex: number, count: number) {
  return ((dayIndex % count) + count) % count
}

/** Milliseconds the zone's wall clock is ahead of UTC at `instant` (negative west of UTC). */
function zoneOffset(instant: number, timeZone: string) {
  const p = zonedParts(instant, timeZone)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(instant / 1000) * 1000
}

/** The instant of the next midnight in `timeZone` after `instant`. Handles daylight saving. */
export function nextZonedMidnight(instant: number, timeZone: string) {
  const { year, month, day } = zonedParts(instant, timeZone)
  // Tomorrow's 00:00 as if the zone were UTC, then shift by the zone offset.
  // The offset is looked up twice because it can change across the midnight
  // itself (daylight saving), so the second lookup uses the first estimate.
  const wallMidnight = Date.UTC(year, month - 1, day + 1)
  let guess = wallMidnight - zoneOffset(wallMidnight, timeZone)
  guess = wallMidnight - zoneOffset(guess, timeZone)
  return guess
}

/** `H:MM:SS` for a duration in milliseconds. */
export function formatHms(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

/** `m:ss` for whole seconds. */
export function formatMss(seconds: number) {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}
