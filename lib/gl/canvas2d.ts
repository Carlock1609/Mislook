/**
 * @file Canvas 2D fallback for when WebGL is unavailable.
 *
 * Draws the same settled stages as `webgl.ts` from the same `Scene` and the
 * same per-pixel maths in `scene.ts`, so seeds and layouts match. It skips the
 * trippy transitions: every stage change is a plain crossfade.
 *
 * Full-screen styles are done per pixel on `ImageData`, which is slow at large
 * sizes but only runs once per stage change.
 */

import { createAnimator, type Renderer, type ShowOptions, TRANSITION_MS } from "@/lib/gl/renderer"
import {
  easeInOut,
  liquidSource,
  type LumaAt,
  LUMA,
  mirror,
  ringSource,
  rippleOffset,
  type Scene,
} from "@/lib/gl/scene"

/** A new size × size canvas that isn't in the document. */
function offscreen(size: number) {
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = size
  return canvas
}

/** Luma (0–1) of the RGBA pixel starting at byte `i`. */
const luma = (d: Uint8ClampedArray, i: number) => (LUMA[0] * d[i] + LUMA[1] * d[i + 1] + LUMA[2] * d[i + 2]) / 255

/**
 * The canvas's current contents as a luma grid plus a nearest-pixel sampler,
 * matching how the shaders read the image texture at any (u, v).
 */
function lumaGrid(ctx: CanvasRenderingContext2D, size: number) {
  const d = ctx.getImageData(0, 0, size, size).data
  const grid = new Float32Array(size * size)
  for (let p = 0; p < grid.length; p++) grid[p] = luma(d, p * 4)
  const lumaAt: LumaAt = (u, v) => {
    const x = Math.min(size - 1, Math.max(0, Math.floor(u * size)))
    const y = Math.min(size - 1, Math.max(0, Math.floor(v * size)))
    return grid[y * size + x]
  }
  return { grid, lumaAt }
}

/**
 * Sets each pixel to grey `fn(luma, u, v, lumaAt)`. (u, v) is the pixel centre;
 * `lumaAt` samples the canvas as it was before this call, for filters that
 * read neighbours.
 */
function shade(
  ctx: CanvasRenderingContext2D,
  size: number,
  fn: (l: number, u: number, v: number, lumaAt: LumaAt) => number,
) {
  const { grid, lumaAt } = lumaGrid(ctx, size)
  const out = ctx.createImageData(size, size)
  const d = out.data
  for (let p = 0; p < grid.length; p++) {
    const v = Math.round(fn(grid[p], ((p % size) + 0.5) / size, (Math.floor(p / size) + 0.5) / size, lumaAt) * 255)
    d[p * 4] = d[p * 4 + 1] = d[p * 4 + 2] = v
    d[p * 4 + 3] = 255
  }
  ctx.putImageData(out, 0, 0)
}

/** Redraws each pixel from the source point `source(u, v)` gives (black for null), greyscale unless `colour`. */
function remap(
  ctx: CanvasRenderingContext2D,
  size: number,
  colour: boolean,
  source: (u: number, v: number) => readonly [number, number] | null,
) {
  const from = ctx.getImageData(0, 0, size, size).data
  const out = ctx.createImageData(size, size)
  const d = out.data
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const di = (y * size + x) * 4
      d[di + 3] = 255
      const s = source((x + 0.5) / size, (y + 0.5) / size)
      if (!s) continue
      const sx = Math.min(size - 1, Math.max(0, Math.floor(s[0] * size)))
      const sy = Math.min(size - 1, Math.max(0, Math.floor(s[1] * size)))
      const si = (sy * size + sx) * 4
      if (colour) {
        d[di] = from[si]
        d[di + 1] = from[si + 1]
        d[di + 2] = from[si + 2]
      } else {
        d[di] = d[di + 1] = d[di + 2] = Math.round(luma(from, si) * 255)
      }
    }
  }
  ctx.putImageData(out, 0, 0)
}

/**
 * Draws one settled scene into a new canvas.
 * @param image - The loaded puzzle image.
 * @param scene - What to draw (from `buildScene`).
 * @param size - Canvas side in device pixels.
 */
function drawScene(image: HTMLImageElement, scene: Scene, size: number) {
  const canvas = offscreen(size)
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!
  const iw = image.naturalWidth
  const ih = image.naturalHeight
  ctx.fillStyle = "#000"
  ctx.fillRect(0, 0, size, size)
  const grey = () => !scene.colour && shade(ctx, size, (l) => l)

  switch (scene.kind) {
    case "tiles": {
      const g = scene.grid
      const cell = size / g
      scene.tiles.forEach((tile, i) => {
        const sx = i % g
        const sy = Math.floor(i / g)
        ctx.save()
        ctx.translate((tile.cellX + 0.5) * cell, (tile.cellY + 0.5) * cell)
        ctx.rotate(((tile.rot === 3 ? -1 : tile.rot) * Math.PI) / 2)
        ctx.drawImage(image, (sx * iw) / g, (sy * ih) / g, iw / g, ih / g, -cell / 2, -cell / 2, cell, cell)
        ctx.restore()
      })
      grey()
      break
    }
    case "hidden": {
      ctx.drawImage(image, 0, 0, size, size)
      grey()
      const g = scene.grid
      const cell = size / g
      ctx.fillStyle = "#000"
      scene.hidden.forEach((hidden, i) => {
        if (hidden) ctx.fillRect((i % g) * cell, Math.floor(i / g) * cell, Math.ceil(cell), Math.ceil(cell))
      })
      break
    }
    case "ripple": {
      ctx.drawImage(image, 0, 0, size, size)
      if (scene.colour && scene.amplitude === 0) break
      remap(ctx, size, scene.colour, (u, v) => {
        const [dx, dy] = rippleOffset(u, v, scene.amplitude, scene.waves, scene.phaseX, scene.phaseY)
        return [mirror(u + dx), mirror(v + dy)]
      })
      break
    }
    case "strips": {
      const n = scene.slots.length
      const cell = size / n
      scene.slots.forEach((slot, i) => {
        const down = scene.up[i] < 0
        ctx.save()
        ctx.translate(slot * cell, down ? size : 0)
        if (down) ctx.scale(1, -1)
        ctx.drawImage(image, (i * iw) / n, 0, iw / n, ih, 0, 0, cell, size)
        ctx.restore()
      })
      grey()
      break
    }
    case "keyholes": {
      ctx.save()
      ctx.beginPath()
      for (const h of scene.holes) {
        if (h.r <= 0) continue
        ctx.moveTo(h.x * size + h.r * size, h.y * size)
        ctx.arc(h.x * size, h.y * size, h.r * size, 0, Math.PI * 2)
      }
      ctx.clip()
      ctx.drawImage(image, 0, 0, size, size)
      ctx.restore()
      grey()
      break
    }
    case "rings": {
      ctx.drawImage(image, 0, 0, size, size)
      if (scene.angles.every((angle) => angle === 0)) break
      remap(ctx, size, scene.colour, (u, v) => ringSource(u, v, scene.angles))
      break
    }
    case "liquid": {
      ctx.drawImage(image, 0, 0, size, size)
      if (scene.amplitude === 0) break
      remap(ctx, size, scene.colour, (u, v) => liquidSource(u, v, scene.amplitude, scene.phases))
      break
    }
  }
  return canvas
}

/**
 * Creates the Canvas 2D fallback renderer on `canvas`.
 * @returns The renderer, or null when even a 2D context is unavailable.
 */
export function createCanvas2DRenderer(canvas: HTMLCanvasElement): Renderer | null {
  const display = canvas.getContext("2d")
  if (!display) return null
  const ctx: CanvasRenderingContext2D = display

  let image: HTMLImageElement | null = null
  let size = canvas.width
  let current: Scene | null = null
  let shown: HTMLCanvasElement | null = null
  const animator = createAnimator()

  const paint = (frame: HTMLCanvasElement) => {
    ctx.globalAlpha = 1
    ctx.drawImage(frame, 0, 0, size, size)
    shown = frame
  }
  const renderSettled = () => {
    if (image && current) paint(drawScene(image, current, size))
  }

  return {
    kind: "canvas2d",
    setImage(img) {
      image = img
      renderSettled()
    },
    resize(next) {
      if (next === size && shown) return
      size = next
      canvas.width = canvas.height = size
      renderSettled()
    },
    show(scene, options: ShowOptions) {
      current = scene
      animator.cancel()
      if (!image) return
      const next = drawScene(image, scene, size)
      const previous = shown
      if (!previous || options.transition === "none") return paint(next)
      animator.run(
        TRANSITION_MS,
        (p) => {
          ctx.globalAlpha = 1
          ctx.drawImage(previous, 0, 0, size, size)
          ctx.globalAlpha = easeInOut(p)
          ctx.drawImage(next, 0, 0, size, size)
        },
        () => paint(next),
      )
    },
    destroy() {
      animator.cancel()
    },
  }
}
