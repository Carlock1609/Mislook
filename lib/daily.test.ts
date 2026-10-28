import { describe, expect, it } from "vitest"
import {
  dateForDayIndex,
  dayIndexFor,
  formatHms,
  formatMss,
  imageIndexFor,
  nextZonedMidnight,
  puzzleNumberFor,
  readDayRequest,
  zonedDateString,
} from "@/lib/daily"

const TZ = "America/Los_Angeles"
const DAY_0 = "2026-10-18"
const at = (iso: string) => Date.parse(iso)

describe("dayIndexFor", () => {
  it("is 0 on DAY_0", () => expect(dayIndexFor(at("2026-10-18T12:00:00-07:00"), DAY_0, TZ)).toBe(0))

  it("changes at midnight Pacific, not UTC", () => {
    // 23:59:59 Pacific on DAY_0 is already the next day in UTC.
    expect(dayIndexFor(at("2026-10-19T06:59:59Z"), DAY_0, TZ)).toBe(0)
    expect(dayIndexFor(at("2026-10-19T07:00:00Z"), DAY_0, TZ)).toBe(1)
  })

  it("is negative before DAY_0", () => {
    expect(dayIndexFor(at("2026-10-17T23:59:59-07:00"), DAY_0, TZ)).toBe(-1)
    expect(dayIndexFor(at("2026-10-01T12:00:00-07:00"), DAY_0, TZ)).toBe(-17)
  })

  it("counts whole days across daylight saving", () => {
    // Clocks go back on 2026-11-01.
    expect(dayIndexFor(at("2026-11-02T00:00:00-08:00"), DAY_0, TZ)).toBe(15)
    expect(dayIndexFor(at("2026-11-01T23:59:59-08:00"), DAY_0, TZ)).toBe(14)
  })
})

describe("imageIndexFor", () => {
  it("loops after the last image", () => {
    expect(imageIndexFor(9, 10)).toBe(9)
    expect(imageIndexFor(10, 10)).toBe(0)
    expect(imageIndexFor(23, 10)).toBe(3)
  })
  it("is never negative", () => expect(imageIndexFor(-1, 10)).toBe(9))
})

describe("puzzleNumberFor", () => {
  it("starts at 1 and returns to day 1 after the last image", () => {
    expect(puzzleNumberFor(0, 10)).toBe(1)
    expect(puzzleNumberFor(9, 10)).toBe(10)
    expect(puzzleNumberFor(10, 10)).toBe(1)
    expect(puzzleNumberFor(23, 10)).toBe(4)
  })
})

describe("readDayRequest", () => {
  it("treats a missing param as no request", () => expect(readDayRequest(null, 10)).toBe("absent"))
  it("accepts a day that has a photo", () => {
    expect(readDayRequest("1", 10)).toBe("playable")
    expect(readDayRequest("10", 10)).toBe("playable")
  })
  it("rejects a day with no photo", () => {
    expect(readDayRequest("0", 10)).toBe("missing")
    expect(readDayRequest("11", 10)).toBe("missing")
    expect(readDayRequest("-3", 10)).toBe("missing")
    expect(readDayRequest("nope", 10)).toBe("missing")
    expect(readDayRequest("", 10)).toBe("missing")
  })
})

describe("zonedDateString", () => {
  it("gives the Pacific date", () => expect(zonedDateString(at("2026-10-19T06:59:59Z"), TZ)).toBe("2026-10-18"))
})

describe("dateForDayIndex", () => {
  it("matches DAY_0 and later days", () => {
    expect(dateForDayIndex(0, DAY_0)).toBe("2026-10-18")
    expect(dateForDayIndex(1, DAY_0)).toBe("2026-10-19")
    expect(dateForDayIndex(14, DAY_0)).toBe("2026-11-01")
  })
})

describe("nextZonedMidnight", () => {
  it("finds the next Pacific midnight", () => {
    expect(nextZonedMidnight(at("2026-10-18T12:00:00-07:00"), TZ)).toBe(at("2026-10-19T00:00:00-07:00"))
  })
  it("is the following midnight when it's exactly midnight", () => {
    expect(nextZonedMidnight(at("2026-10-19T00:00:00-07:00"), TZ)).toBe(at("2026-10-20T00:00:00-07:00"))
  })
  it("handles the day clocks go back", () => {
    expect(nextZonedMidnight(at("2026-10-31T12:00:00-07:00"), TZ)).toBe(at("2026-11-01T00:00:00-07:00"))
    expect(nextZonedMidnight(at("2026-11-01T12:00:00-08:00"), TZ)).toBe(at("2026-11-02T00:00:00-08:00"))
  })
  it("handles the day clocks go forward", () => {
    expect(nextZonedMidnight(at("2026-03-07T12:00:00-08:00"), TZ)).toBe(at("2026-03-08T00:00:00-08:00"))
    expect(nextZonedMidnight(at("2026-03-08T12:00:00-07:00"), TZ)).toBe(at("2026-03-09T00:00:00-07:00"))
  })
})

describe("formatting", () => {
  it("formats H:MM:SS", () => expect(formatHms(3_723_000)).toBe("1:02:03"))
  it("formats m:ss", () => expect(formatMss(64)).toBe("1:04"))
})
