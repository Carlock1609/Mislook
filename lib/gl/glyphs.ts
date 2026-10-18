/**
 * @file Glyph atlas for the ASCII experiment.
 *
 * One row of `ASCII_GLYPHS`, white on black, each in a `GLYPH_PX` square.
 * WebGL uploads it as a texture and the Canvas 2D fallback copies cells
 * from it, so both renderers draw the same characters.
 */

import { ASCII_GLYPHS } from "@/lib/gl/scene"

/** Side of one glyph cell in the atlas, in pixels. */
export const GLYPH_PX = 48

let atlas: HTMLCanvasElement | null = null

/** The shared atlas canvas, drawn once per page load. */
export function glyphAtlas() {
  if (atlas) return atlas
  atlas = document.createElement("canvas")
  atlas.width = GLYPH_PX * ASCII_GLYPHS.length
  atlas.height = GLYPH_PX
  const ctx = atlas.getContext("2d")!
  ctx.fillStyle = "#000"
  ctx.fillRect(0, 0, atlas.width, atlas.height)
  ctx.fillStyle = "#fff"
  ctx.font = `bold ${Math.round(GLYPH_PX * 0.9)}px ui-monospace, Menlo, Consolas, monospace`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  for (let i = 0; i < ASCII_GLYPHS.length; i++) {
    ctx.fillText(ASCII_GLYPHS[i], (i + 0.5) * GLYPH_PX, GLYPH_PX * 0.55)
  }
  return atlas
}
