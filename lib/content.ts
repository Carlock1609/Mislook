/**
 * @file Typed access to the editable JSON content: copy, images and settings.
 * Anything you might want to tweak lives in `content/`, not in components.
 */

import copyJson from "@/content/copy.json"
import imagesJson from "@/content/images.json"
import settingsJson from "@/content/settings.json"

/** Styles an image can use in the daily rotation (test-panel-only styles are in `lib/gl/scene.ts`). */
export type StyleId = "tile-shuffle" | "hidden-tiles" | "two-tone" | "ripple"

/** One entry of `content/images.json`. */
export type PuzzleImage = {
  /** File name under `public/images/`. */
  file: string
  style: StyleId
  /** The answer as shown on the result screen. */
  title: string
  /** Accepted guesses (normalized lower case). */
  accept: string[]
  /** Where the subject is, as `[x, y]` shares of the side; default centre. */
  focus?: [number, number]
}

export const copy = copyJson
export const images = imagesJson as PuzzleImage[]
export const settings = settingsJson

/** Number of distorted stages in a round. */
export const STAGES = 5

/** Public URL of an image file. */
export function imageSrc(image: PuzzleImage) {
  return `/images/${image.file}`
}

/** Replaces `{name}` placeholders in a copy string. */
export function fill(text: string, values: Record<string, string | number>) {
  return text.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""))
}
