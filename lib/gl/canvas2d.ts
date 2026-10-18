// Canvas 2D fallback for when WebGL is unavailable: the same settled stages
// (same scene maths and seeds), with crossfades instead of trippy transitions.

import { createAnimator, type Renderer, type ShowOptions, TRANSITION_MS } from "@/lib/gl/renderer"
import { easeInOut, LUMA, mirror, posterize, rippleOffset, type Scene } from "@/lib/gl/scene"

function offscreen(size: number) {
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = size
  return canvas
}

const luma = (d: Uint8ClampedArray, i: number) => (LUMA[0] * d[i] + LUMA[1] * d[i + 1] + LUMA[2] * d[i + 2]) / 255

function mapPixels(ctx: CanvasRenderingContext2D, size: number, fn: (l: number) => number) {
  const data = ctx.getImageData(0, 0, size, size)
  const d = data.data
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.round(fn(luma(d, i)) * 255)
    d[i] = d[i + 1] = d[i + 2] = v
  }
  ctx.putImageData(data, 0, 0)
}

/** Draws one settled scene into a new canvas. */
function drawScene(image: HTMLImageElement, scene: Scene, size: number) {
  const canvas = offscreen(size)
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!
  const iw = image.naturalWidth
  const ih = image.naturalHeight
  ctx.fillStyle = "#000"
  ctx.fillRect(0, 0, size, size)
  const grey = () => !scene.colour && mapPixels(ctx, size, (l) => l)

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
      if (!scene.colour) mapPixels(ctx, size, (l) => posterize(l, scene.levels, scene.bias))
      break
    }
    case "ripple": {
      ctx.drawImage(image, 0, 0, size, size)
      if (scene.colour && scene.amplitude === 0) break
      const source = ctx.getImageData(0, 0, size, size).data
      const out = ctx.createImageData(size, size)
      const d = out.data
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const u = (x + 0.5) / size
          const v = (y + 0.5) / size
          const [dx, dy] = rippleOffset(u, v, scene.amplitude, scene.waves, scene.phaseX, scene.phaseY)
          const sx = Math.min(size - 1, Math.floor(mirror(u + dx) * size))
          const sy = Math.min(size - 1, Math.floor(mirror(v + dy) * size))
          const si = (sy * size + sx) * 4
          const di = (y * size + x) * 4
          if (scene.colour) {
            d[di] = source[si]
            d[di + 1] = source[si + 1]
            d[di + 2] = source[si + 2]
          } else {
            d[di] = d[di + 1] = d[di + 2] = Math.round(luma(source, si) * 255)
          }
          d[di + 3] = 255
        }
      }
      ctx.putImageData(out, 0, 0)
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
