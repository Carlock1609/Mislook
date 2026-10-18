// Canvas 2D fallback for when WebGL is unavailable: the same settled stages
// (same scene maths and seeds), with crossfades instead of trippy transitions.

import { createAnimator, type Renderer, type ShowOptions, TRANSITION_MS } from "@/lib/gl/renderer"
import {
  easeInOut,
  fisheyeSource,
  kaleidoscopeSource,
  LUMA,
  meltSource,
  mirror,
  negate,
  NOISE_SIZE,
  posterize,
  ringSource,
  rippleOffset,
  type Scene,
  staticNoise,
  tunnelSource,
} from "@/lib/gl/scene"

function offscreen(size: number) {
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = size
  return canvas
}

const luma = (d: Uint8ClampedArray, i: number) => (LUMA[0] * d[i] + LUMA[1] * d[i + 1] + LUMA[2] * d[i + 2]) / 255

/** Sets each pixel to grey `fn(luma, u, v)`, where (u, v) is the pixel centre. */
function shade(ctx: CanvasRenderingContext2D, size: number, fn: (l: number, u: number, v: number) => number) {
  const data = ctx.getImageData(0, 0, size, size)
  const d = data.data
  for (let i = 0; i < d.length; i += 4) {
    const p = i / 4
    const v = Math.round(fn(luma(d, i), ((p % size) + 0.5) / size, (Math.floor(p / size) + 0.5) / size) * 255)
    d[i] = d[i + 1] = d[i + 2] = v
  }
  ctx.putImageData(data, 0, 0)
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

/** Draws one settled scene into a new canvas. */
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
    case "twoTone": {
      ctx.drawImage(image, 0, 0, size, size)
      if (!scene.colour) shade(ctx, size, (l) => posterize(l, scene.levels, scene.bias))
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
    case "darkness": {
      ctx.drawImage(image, 0, 0, size, size)
      grey()
      ctx.fillStyle = "#000"
      ctx.beginPath()
      ctx.rect(0, 0, size, size)
      ctx.arc(scene.focusX * size, scene.focusY * size, scene.radius * size, 0, Math.PI * 2)
      ctx.fill("evenodd")
      break
    }
    case "strips": {
      const n = scene.slots.length
      const cell = size / n
      scene.slots.forEach((slot, i) => {
        ctx.drawImage(image, (i * iw) / n, 0, iw / n, ih, slot * cell, 0, cell, size)
      })
      grey()
      break
    }
    case "shards": {
      // The settled clear image is whole; drawing it shard by shard would leave hairline seams.
      if (scene.colour) {
        ctx.drawImage(image, 0, 0, size, size)
        break
      }
      for (const shard of scene.shards) {
        const t = shard.tri.map((c) => c * size)
        ctx.save()
        ctx.translate((shard.pivotX + shard.dx) * size, (shard.pivotY + shard.dy) * size)
        ctx.rotate(shard.rot)
        ctx.translate(-shard.pivotX * size, -shard.pivotY * size)
        ctx.beginPath()
        ctx.moveTo(t[0], t[1])
        ctx.lineTo(t[2], t[3])
        ctx.lineTo(t[4], t[5])
        ctx.closePath()
        ctx.clip()
        ctx.drawImage(image, 0, 0, size, size)
        ctx.restore()
      }
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
    case "rings":
    case "melt":
    case "fisheye":
    case "tunnel":
    case "kaleidoscope": {
      ctx.drawImage(image, 0, 0, size, size)
      // Every clear stage is the plain image.
      if (scene.colour) break
      remap(ctx, size, false, (u, v) => {
        switch (scene.kind) {
          case "rings":
            return ringSource(u, v, scene.angles)
          case "melt":
            return meltSource(u, v, scene.amount, scene.phases)
          case "fisheye":
            return fisheyeSource(u, v, scene.strength, scene.centerX, scene.centerY)
          case "tunnel":
            return tunnelSource(u, v, scene.scale, scene.twist, scene.centerX, scene.centerY)
          case "kaleidoscope":
            return kaleidoscopeSource(u, v, scene.amount, scene.segments, scene.spin, scene.source)
        }
      })
      break
    }
    case "static": {
      ctx.drawImage(image, 0, 0, size, size)
      if (scene.colour) break
      const noise = staticNoise(scene.seed)
      shade(ctx, size, (l, u, v) => {
        const n = noise[Math.floor(v * NOISE_SIZE) * NOISE_SIZE + Math.floor(u * NOISE_SIZE)] / 255
        return l + (n - l) * scene.amount
      })
      break
    }
    case "negative": {
      ctx.drawImage(image, 0, 0, size, size)
      if (scene.colour) break
      shade(ctx, size, (l) => negate(l, scene.invert, scene.contrast))
      break
    }
  }
  return canvas
}

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
