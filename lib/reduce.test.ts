import { describe, expect, it } from "vitest"
import { settings } from "@/lib/content"
import { initialRound, type RoundAction, type RoundState, reduceRound, roundElapsed, roundResult } from "@/lib/reduce"

const accept = ["wolf", "dire wolf"]
const T0 = 1_000_000

/** Runs actions from a fresh round, settling after each transition the way the UI does. */
function play(...actions: (RoundAction | "settle")[]) {
  return actions.reduce<RoundState>(
    (state, action) => reduceRound(state, action === "settle" ? { type: "settled" } : action),
    initialRound,
  )
}
const start: RoundAction = { type: "start", now: T0 }
const guess = (text: string, seconds = 0): RoundAction => ({ type: "guess", text, accept, now: T0 + seconds * 1000 })
const reveal = (seconds = 0): RoundAction => ({ type: "reveal", now: T0 + seconds * 1000 })
/** Reveals up to the given stage, settling each transition. */
const revealTo = (stage: number) => Array.from({ length: stage - 1 }, () => [reveal(), "settle" as const]).flat()

describe("reduceRound", () => {
  it("ignores guesses before the timer starts", () => {
    expect(reduceRound(initialRound, guess("wolf"))).toBe(initialRound)
  })

  it("starts the timer on start", () => {
    const state = play(start)
    expect(state.status).toBe("playing")
    expect(state.startedAt).toBe(T0)
  })

  it.each([1, 2, 3, 4, 5])("wins at stage %i", (stage) => {
    const state = play(start, ...revealTo(stage), guess("The Wolf", 10))
    expect(state.status).toBe("won")
    expect(state.stage).toBe(stage)
    expect(roundResult(state, settings.scoring)).toEqual({
      won: true,
      stage,
      score: settings.scoring.stageBase[stage - 1] + 950 - (stage - 1) * settings.scoring.skipPenalty,
      elapsedSeconds: 10,
      wrongGuesses: 0,
    })
  })

  it("does not use the guess when it is empty or normalizes to empty", () => {
    const before = play(start)
    expect(reduceRound(before, guess("   "))).toBe(before)
    expect(reduceRound(before, guess("?!"))).toBe(before)
  })

  it("locks Guess after a wrong guess, so a double click can't use two guesses", () => {
    const wrong = play(start, guess("dog"))
    expect(wrong.locked).toBe(true)
    expect(wrong.wrongGuesses).toBe(1)
    expect(reduceRound(wrong, guess("wolf"))).toBe(wrong)
  })

  it("charges a skip when Reveal is used with no guess, and more when the guess was wrong", () => {
    const skipped = play(start, reveal(), "settle", guess("wolf", 0))
    const wrong = play(start, guess("dog"), reveal(), "settle", guess("wolf", 0))
    expect(skipped.skips).toBe(1)
    expect(wrong.skips).toBe(0)
    expect(wrong.wrongGuesses).toBe(1)
    expect(roundResult(skipped, settings.scoring)?.score).toBe(4000 + 1000 - 200)
    expect(roundResult(wrong, settings.scoring)?.score).toBe(4000 + 1000 - 400)
  })

  it("unlocks Guess after Reveal, keeping the penalty", () => {
    const state = play(start, guess("dog"), reveal(), "settle", guess("wolf", 30))
    expect(state.status).toBe("won")
    expect(roundResult(state, settings.scoring)?.score).toBe(4000 + 850 - 400)
  })

  it("ignores Guess and Reveal while a transition plays", () => {
    const busy = play(start, reveal())
    expect(busy.busy).toBe(true)
    expect(reduceRound(busy, guess("wolf"))).toBe(busy)
    expect(reduceRound(busy, reveal())).toBe(busy)
  })

  it("misses on a wrong guess at stage 5", () => {
    const state = play(start, ...revealTo(5), guess("dog", 157))
    expect(state.status).toBe("missed")
    expect(roundResult(state, settings.scoring)).toEqual({
      won: false,
      stage: 5,
      score: 0,
      elapsedSeconds: 157,
      wrongGuesses: 1,
    })
  })

  it("misses on Reveal at stage 5", () => {
    const state = play(start, ...revealTo(5), reveal(90))
    expect(state.status).toBe("missed")
    expect(roundResult(state, settings.scoring)?.score).toBe(0)
  })

  it("ignores everything after the round ends", () => {
    const won = play(start, guess("wolf"))
    expect(reduceRound(won, guess("wolf"))).toBe(won)
    expect(reduceRound(won, reveal())).toBe(won)
    expect(reduceRound(won, start)).toBe(won)
  })
})

describe("roundElapsed and roundResult", () => {
  it("reads 0 before the start and ticks while playing", () => {
    expect(roundElapsed(initialRound, T0 + 5000)).toBe(0)
    expect(roundElapsed(play(start), T0 + 5999)).toBe(5)
  })
  it("stops the clock at the end", () => {
    expect(roundElapsed(play(start, guess("wolf", 12)), T0 + 99_000)).toBe(12)
  })
  it("has no result while playing", () => expect(roundResult(play(start), settings.scoring)).toBeNull())
})
