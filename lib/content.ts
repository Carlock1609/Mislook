import copyJson from "@/content/copy.json"
import imagesJson from "@/content/images.json"
import settingsJson from "@/content/settings.json"

export type StyleId = "tile-shuffle" | "hidden-tiles" | "two-tone" | "ripple"

export type PuzzleImage = {
  file: string
  style: StyleId
  title: string
  accept: string[]
  focus?: [number, number]
}

export const copy = copyJson
export const images = imagesJson as PuzzleImage[]
export const settings = settingsJson

export const STAGES = 5

export function imageSrc(image: PuzzleImage) {
  return `/images/${image.file}`
}

/** Replaces `{name}` placeholders in a copy string. */
export function fill(text: string, values: Record<string, string | number>) {
  return text.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""))
}
