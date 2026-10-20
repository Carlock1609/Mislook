/**
 * @file Scoring. Pure: no React. The numbers come from `content/settings.json`.
 *
 * ```text
 * stageBase    = [5000, 4000, 3000, 2000, 1000][stage - 1]
 * timeBonus    = max(0, 1000 - elapsedSeconds * 5)
 * wrongPenalty = wrongGuesses * 400
 * win          = max(100, stageBase + timeBonus - wrongPenalty)
 * miss         = 0
 * ```
 */

/** The `scoring` block of `content/settings.json`. */
export type Scoring = {
  stageBase: number[]
  timeBonusMax: number
  timeBonusPerSecond: number
  wrongPenalty: number
  winFloor: number
  lowBonusThreshold: number
}

/** Whole seconds between two instants, floored and never negative. */
export function elapsedSeconds(startedAt: number, now: number) {
  return Math.max(0, Math.floor((now - startedAt) / 1000))
}

/** The live time bonus: drops once per whole second and stops at 0. */
export function timeBonus(elapsed: number, scoring: Scoring) {
  return Math.max(0, scoring.timeBonusMax - Math.floor(elapsed) * scoring.timeBonusPerSecond)
}

/** True when the bonus is running low (above 0, at most the threshold). */
export function isLowBonus(bonus: number, scoring: Scoring) {
  return bonus > 0 && bonus <= scoring.lowBonusThreshold
}

/** What a correct guess would score right now. This is also the score of a win. */
export function pointsAvailable(stage: number, elapsed: number, wrongGuesses: number, scoring: Scoring) {
  return Math.max(
    scoring.winFloor,
    scoring.stageBase[stage - 1] + timeBonus(elapsed, scoring) - wrongGuesses * scoring.wrongPenalty,
  )
}
