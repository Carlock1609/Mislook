/**
 * @file Spoiler-free share text: no answer, no link. Pure: no React.
 *
 * ```text
 * Mislook #12
 * October 18, 2026
 * WON · Stage 2 · 4,680 pts · 1:04
 * ```
 */

import { formatMss } from "@/lib/daily"
import type { RoundResult } from "@/lib/reduce"

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const

/** `YYYY-MM-DD` as `October 20, 2026`. The string is already a calendar date, so it is not parsed as an instant. */
function formatShareDate(date: string) {
  const [year, month, day] = date.split("-").map(Number)
  return `${MONTHS[month - 1]} ${day}, ${year}`
}

/** The text shared or copied from the result. No answer, no link. */
export function shareText(number: number, date: string, result: RoundResult) {
  const outcome = result.won ? "WON" : "LOST"
  const score = `${result.score.toLocaleString("en-US")} pts`
  return `Mislook #${number}\n${formatShareDate(date)}\n${outcome} · Stage ${result.stage} · ${score} · ${formatMss(result.elapsedSeconds)}`
}
