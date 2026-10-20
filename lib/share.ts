/**
 * @file Spoiler-free share text: no answer, no link. Pure: no React.
 *
 * ```text
 * Mislook #12
 * Stage 2 · 4,680 pts · 1:04
 * ■■□□□
 * ```
 */

import { STAGES } from "@/lib/content"
import { formatMss } from "@/lib/daily"
import type { RoundResult } from "@/lib/reduce"

/** ■ for each stage reached, □ for each still ahead; a miss adds ✕. */
export function shareSquares(result: RoundResult) {
  const reached = result.won ? result.stage : STAGES
  return "■".repeat(reached) + "□".repeat(STAGES - reached) + (result.won ? "" : " ✕")
}

/** The three-line text copied by Copy result. */
export function shareText(number: number, result: RoundResult) {
  const score = `${result.score.toLocaleString("en-US")} pts`
  const summary = result.won ? `Stage ${result.stage}` : "Mislooked"
  return `Mislook #${number}\n${summary} · ${score} · ${formatMss(result.elapsedSeconds)}\n${shareSquares(result)}`
}
