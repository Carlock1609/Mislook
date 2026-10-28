/**
 * @file The round as a pure state machine, ready for `useReducer`. No React.
 *
 * Stage 1 is hardest. Each stage allows one guess or Reveal. A wrong guess locks
 * Guess until Reveal and costs more than leaving the stage without a guess.
 * A correct guess wins. A wrong guess or Reveal on the last stage ends the round
 * as a miss. Nothing is accepted while a transition plays.
 */

import { STAGES } from "@/lib/content"
import { isCorrect, normalize } from "@/lib/normalize"
import { elapsedSeconds, pointsAvailable, type Scoring } from "@/lib/score"

export type RoundStatus = "ready" | "playing" | "won" | "missed"

export type RoundState = {
  status: RoundStatus
  /** Current stage, 1–5. On a win, the winning stage; on a miss, 5. */
  stage: number
  /** A wrong guess was made on this stage; only Reveal is allowed. */
  locked: boolean
  wrongGuesses: number
  /** Stages left with Reveal and no guess. Each costs less than a wrong guess. */
  skips: number
  /** A transition is playing; Guess and Reveal do nothing. */
  busy: boolean
  /** When the stage-1 image settled (the timer start), or null before that. */
  startedAt: number | null
  /** When the round ended, or null while it's going. */
  endedAt: number | null
}

export type RoundAction =
  /** The stage-1 image has settled on screen: the timer starts. */
  | { type: "start"; now: number }
  | { type: "guess"; text: string; accept: string[]; now: number }
  | { type: "reveal"; now: number }
  /** The stage transition finished: Guess and Reveal work again. */
  | { type: "settled" }

/** How a round ended. `stage` is the stage the player won on, or reached on a miss. */
export type RoundResult = {
  won: boolean
  stage: number
  score: number
  elapsedSeconds: number
  wrongGuesses: number
}

export const initialRound: RoundState = {
  status: "ready",
  stage: 1,
  locked: false,
  wrongGuesses: 0,
  skips: 0,
  busy: false,
  startedAt: null,
  endedAt: null,
}

/**
 * Applies one action. Returns the same object when the action does nothing, so a
 * double click can't use two guesses.
 */
export function reduceRound(state: RoundState, action: RoundAction): RoundState {
  switch (action.type) {
    case "start":
      if (state.status !== "ready") return state
      return { ...state, status: "playing", startedAt: action.now }

    case "guess": {
      if (state.status !== "playing" || state.busy || state.locked) return state
      // An empty (or empty-after-normalizing) guess doesn't use the guess.
      if (normalize(action.text) === "") return state
      if (isCorrect(action.text, action.accept)) return end(state, "won", action.now)
      const wrong = { ...state, locked: true, wrongGuesses: state.wrongGuesses + 1 }
      return state.stage === STAGES ? end(wrong, "missed", action.now) : wrong
    }

    case "reveal": {
      if (state.status !== "playing" || state.busy) return state
      if (state.stage === STAGES) return end(state, "missed", action.now)
      // A wrong guess already cost the larger penalty, so Reveal does not also charge a skip.
      const skips = state.locked ? state.skips : state.skips + 1
      return { ...state, stage: state.stage + 1, locked: false, busy: true, skips }
    }

    case "settled":
      return state.busy ? { ...state, busy: false } : state
  }
}

function end(state: RoundState, status: "won" | "missed", now: number): RoundState {
  return { ...state, status, busy: true, endedAt: now }
}

/** Whole seconds on the clock: since the start, up to the end (or `now` while playing). */
export function roundElapsed(state: RoundState, now: number) {
  if (state.startedAt === null) return 0
  return elapsedSeconds(state.startedAt, state.endedAt ?? now)
}

/** The result once the round is over, or null while it's still going. */
export function roundResult(state: RoundState, scoring: Scoring): RoundResult | null {
  if (state.status !== "won" && state.status !== "missed") return null
  const elapsed = roundElapsed(state, state.endedAt ?? 0)
  const won = state.status === "won"
  return {
    won,
    stage: state.stage,
    score: won ? pointsAvailable(state.stage, elapsed, state.wrongGuesses, state.skips, scoring) : 0,
    elapsedSeconds: elapsed,
    wrongGuesses: state.wrongGuesses,
  }
}
