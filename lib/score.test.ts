import { describe, expect, it } from "vitest"
import { settings } from "@/lib/content"
import { elapsedSeconds, isLowBonus, pointsAvailable, timeBonus } from "@/lib/score"

const scoring = settings.scoring

describe("timeBonus", () => {
  it("starts at the maximum", () => expect(timeBonus(0, scoring)).toBe(1000))
  it("drops 5 per whole second", () => {
    expect(timeBonus(1, scoring)).toBe(995)
    expect(timeBonus(1.9, scoring)).toBe(995)
    expect(timeBonus(64, scoring)).toBe(680)
  })
  it("reaches zero at 200s and stays there", () => {
    expect(timeBonus(199, scoring)).toBe(5)
    expect(timeBonus(200, scoring)).toBe(0)
    expect(timeBonus(10_000, scoring)).toBe(0)
  })
})

describe("isLowBonus", () => {
  it("is low above 0 and at most 200", () => {
    expect(isLowBonus(201, scoring)).toBe(false)
    expect(isLowBonus(200, scoring)).toBe(true)
    expect(isLowBonus(5, scoring)).toBe(true)
    expect(isLowBonus(0, scoring)).toBe(false)
  })
})

describe("elapsedSeconds", () => {
  it("floors to whole seconds", () => expect(elapsedSeconds(1_000, 65_999)).toBe(64))
  it("never goes negative", () => expect(elapsedSeconds(5_000, 1_000)).toBe(0))
})

describe("pointsAvailable", () => {
  it.each([
    [1, 6000],
    [2, 5000],
    [3, 4000],
    [4, 3000],
    [5, 2000],
  ])("a fast win at stage %i scores %i", (stage, points) => {
    expect(pointsAvailable(stage, 0, 0, scoring)).toBe(points)
  })
  it("matches the brief's worked example", () => expect(pointsAvailable(2, 64, 0, scoring)).toBe(4680))
  it("takes 400 per wrong guess", () => expect(pointsAvailable(3, 0, 2, scoring)).toBe(3200))
  it("loses the time bonus after 200s", () => expect(pointsAvailable(4, 250, 0, scoring)).toBe(2000))
  it("never goes below the 100-point floor", () => {
    expect(pointsAvailable(5, 300, 3, scoring)).toBe(100)
    expect(pointsAvailable(5, 300, 2, scoring)).toBe(200)
  })
})
