import { describe, expect, it } from "vitest"
import { matchesTestKey } from "@/lib/test-mode"

describe("matchesTestKey", () => {
  it("matches only the full key", () => {
    expect(matchesTestKey("7f3c9a2e4b81", "7f3c9a2e4b81")).toBe(true)
    expect(matchesTestKey("7f3c9a2e4b81 ", "7f3c9a2e4b81")).toBe(false)
    expect(matchesTestKey("nope", "7f3c9a2e4b81")).toBe(false)
    expect(matchesTestKey(null, "7f3c9a2e4b81")).toBe(false)
  })
  it("stays off when the key is empty", () => expect(matchesTestKey("", "")).toBe(false))
})
