import { describe, expect, it } from "vitest"
import { shareSquares, shareText } from "@/lib/share"

describe("shareText", () => {
  it("formats a win", () => {
    const text = shareText(12, { won: true, stage: 2, score: 4680, elapsedSeconds: 64, wrongGuesses: 0 })
    expect(text).toBe("Mislook #12\nStage 2 · 4,680 pts · 1:04\n■■□□□")
  })
  it("formats a miss", () => {
    const text = shareText(12, { won: false, stage: 5, score: 0, elapsedSeconds: 157, wrongGuesses: 1 })
    expect(text).toBe("Mislook #12\nMislooked · 0 pts · 2:37\n■■■■■ ✕")
  })
  it("never includes the answer", () => {
    const text = shareText(3, { won: true, stage: 1, score: 6000, elapsedSeconds: 0, wrongGuesses: 0 })
    expect(text).not.toMatch(/thanos/i)
  })
})

describe("shareSquares", () => {
  it("fills up to the winning stage, with no ✕", () => {
    expect(shareSquares({ won: true, stage: 1, score: 0, elapsedSeconds: 0, wrongGuesses: 0 })).toBe("■□□□□")
    expect(shareSquares({ won: true, stage: 5, score: 0, elapsedSeconds: 0, wrongGuesses: 0 })).toBe("■■■■■")
  })
})
