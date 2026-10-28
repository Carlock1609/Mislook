import { describe, expect, it } from "vitest"
import { images } from "@/lib/content"
import { isCorrect, normalize } from "@/lib/normalize"

describe("puzzle images", () => {
  it("shows a title that its own keyword list accepts", () => {
    for (const image of images) {
      expect(isCorrect(image.title, image.accept), image.title).toBe(true)
    }
  })

  it("keeps one entry per guess, after normalization", () => {
    for (const image of images) {
      const seen = new Map<string, string>()
      for (const answer of image.accept) {
        const key = normalize(answer)
        expect(key, `${image.title}: "${answer}"`).not.toBe("")
        const previous = seen.get(key)
        expect(previous, `${image.title}: "${answer}" matches "${previous}"`).toBeUndefined()
        seen.set(key, answer)
      }
    }
  })

  it("does not treat nearby Game of Thrones places as the Wall", () => {
    const wall = images.find((image) => image.title === "The Wall")
    expect(wall).toBeDefined()
    expect(isCorrect("Winterfell", wall!.accept)).toBe(false)
    expect(isCorrect("Beyond the Wall", wall!.accept)).toBe(false)
    expect(isCorrect("Castle Black", wall!.accept)).toBe(true)
  })
})
