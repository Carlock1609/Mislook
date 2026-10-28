import { describe, expect, it } from "vitest"
import { isCorrect, normalize } from "@/lib/normalize"

describe("normalize", () => {
  it("lowercases", () => expect(normalize("Red PHONE Box")).toBe("red phone box"))
  it("strips accents", () => expect(normalize("Crème Brûlée")).toBe("creme brulee"))
  it("turns & into and", () => expect(normalize("Rock & Roll")).toBe("rock and roll"))
  it("collapses punctuation and spaces", () => expect(normalize("  phone--box!!  ")).toBe("phone box"))
  it("deletes apostrophes instead of leaving a space", () => {
    expect(normalize("Peach's Castle")).toBe("peachs castle")
    expect(normalize("Peach's Castle")).toBe(normalize("Peachs Castle"))
    expect(normalize("Na'vi")).toBe("navi")
  })
  it("keeps digits", () => expect(normalize("R2-D2")).toBe("r2 d2"))
  it("keeps non-latin letters", () => expect(normalize("Øresund")).toBe("øresund"))

  it("drops one leading a, an or the", () => {
    expect(normalize("The Eiffel Tower")).toBe("eiffel tower")
    expect(normalize("an apple")).toBe("apple")
    expect(normalize("a castle")).toBe("castle")
  })
  it("drops the article only once, as a whole word", () => {
    expect(normalize("the a team")).toBe("a team")
    expect(normalize("theatre")).toBe("theatre")
    expect(normalize("apple")).toBe("apple")
    expect(normalize("another")).toBe("another")
  })
  it("drops the article after trimming punctuation", () => expect(normalize("...The wolf")).toBe("wolf"))
  it("leaves a lone article alone", () => expect(normalize("the")).toBe("the"))
  it("returns empty for punctuation only", () => expect(normalize(" ?! ")).toBe(""))
})

describe("isCorrect", () => {
  const accept = ["red telephone box", "phone box", "phone booth"]

  it("accepts an accepted answer in any case or punctuation", () => {
    expect(isCorrect("Phone Box", accept)).toBe(true)
    expect(isCorrect("the phone-box!", accept)).toBe(true)
  })
  it("normalizes the accepted answers too", () => expect(isCorrect("castle", ["The Castle"])).toBe(true))
  it("rejects a misspelling", () => expect(isCorrect("phone boxx", accept)).toBe(false))
  it("rejects a partial match", () => expect(isCorrect("phone", accept)).toBe(false))
  it("never matches an empty guess", () => expect(isCorrect("  ", ["", " "])).toBe(false))
})
