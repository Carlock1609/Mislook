import { describe, expect, it } from "vitest"
import { isRoundResult, parseSavedDay } from "@/lib/storage"

const result = {
  won: true,
  stage: 2,
  score: 4680,
  elapsedSeconds: 64,
  wrongGuesses: 0,
}

describe("isRoundResult", () => {
  it("accepts a finished round", () => expect(isRoundResult(result)).toBe(true))

  it("rejects a misshape", () => {
    expect(isRoundResult(null)).toBe(false)
    expect(isRoundResult({ ...result, stage: 0 })).toBe(false)
    expect(isRoundResult({ ...result, won: "yes" })).toBe(false)
  })
})

describe("parseSavedDay", () => {
  it("reads a valid saved day", () => {
    expect(parseSavedDay(JSON.stringify({ date: "2026-10-19", result }))).toEqual({
      date: "2026-10-19",
      result,
    })
  })

  it("returns null for junk", () => {
    expect(parseSavedDay(null)).toBeNull()
    expect(parseSavedDay("{")).toBeNull()
    expect(parseSavedDay(JSON.stringify({ date: "nope", result }))).toBeNull()
    expect(parseSavedDay(JSON.stringify({ date: "2026-10-19", result: { won: true } }))).toBeNull()
  })
})
