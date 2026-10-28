import { describe, expect, it } from "vitest"
import { shareText } from "@/lib/share"

describe("shareText", () => {
  it("formats a win with the date and outcome", () => {
    const text = shareText(12, "2026-10-18", {
      won: true,
      stage: 2,
      score: 4680,
      elapsedSeconds: 64,
      wrongGuesses: 0,
    })
    expect(text).toBe("Mislook #12\nOctober 18, 2026\nWON · Stage 2 · 4,680 pts · 1:04")
  })
  it("formats a loss in words", () => {
    const text = shareText(12, "2026-10-29", {
      won: false,
      stage: 5,
      score: 0,
      elapsedSeconds: 157,
      wrongGuesses: 1,
    })
    expect(text).toBe("Mislook #12\nOctober 29, 2026\nLOST · Stage 5 · 0 pts · 2:37")
  })
  it("never includes the answer or the old square row", () => {
    const text = shareText(3, "2026-10-20", {
      won: true,
      stage: 1,
      score: 6000,
      elapsedSeconds: 0,
      wrongGuesses: 0,
    })
    expect(text).not.toMatch(/thanos/i)
    expect(text).not.toMatch(/[■□✕]/)
  })
})
