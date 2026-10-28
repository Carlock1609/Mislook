/**
 * @file Measures how recognisable each distortion style is at each stage.
 *
 * Renders every style's settled stages in Node with the same scene maths the
 * game uses (`lib/gl/scene.ts`), for every image in `public/images`, and scores
 * each against the clear image. The score is a rough stand-in for "how easy is
 * this to recognise": 0 is nothing left of the image, 1 is the image itself.
 *
 * Score = average of two correlations at low resolution (where the gist of
 * an image lives), brightness (absolute, so a negative still counts) and edge
 * strength (so outline-only styles still count), times a contrast term (as in
 * SSIM) so washed-out or noise-buried images score lower.
 *
 * Usage:
 *   node scripts/measure-difficulty.mjs            # scores for settings.json
 *   node scripts/measure-difficulty.mjs --calibrate  # also suggest evenly spaced values
 *
 * Uses `jiti` (TypeScript + the `@/` alias) and `sharp` (image decoding), both
 * already installed as dependencies of ESLint and Next.
 */

import { readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { createJiti } from "jiti"
import sharp from "sharp"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const jiti = createJiti(import.meta.url, { alias: { "@": root } })
const S = await jiti.import(join(root, "lib/gl/scene.ts"))

/** Render size in pixels; scores are taken at SCORE_SIZE. */
const N = 160
const SCORE_SIZE = 32

// ---------------------------------------------------------------- images

const files = readdirSync(join(root, "public/images")).filter((f) => /\.(webp|png|jpe?g)$/.test(f))
const images = await Promise.all(
  files.map(async (file) => {
    const { data } = await sharp(join(root, "public/images", file))
      .resize(N, N, { fit: "fill" })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true })
    return Float32Array.from(data, (b) => b / 255)
  }),
)

// ---------------------------------------------------------------- rendering

const clamp = (t, a, b) => Math.min(b, Math.max(a, t))
/** Bilinear sampler, like the shaders' LINEAR texture reads (edge detection needs sub-pixel steps). */
const sampler = (img) => (u, v) => {
  const x = clamp(u * N - 0.5, 0, N - 1)
  const y = clamp(v * N - 0.5, 0, N - 1)
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(N - 1, x0 + 1)
  const y1 = Math.min(N - 1, y0 + 1)
  const fx = x - x0
  const fy = y - y0
  const top = img[y0 * N + x0] * (1 - fx) + img[y0 * N + x1] * fx
  const bottom = img[y1 * N + x0] * (1 - fx) + img[y1 * N + x1] * fx
  return top * (1 - fy) + bottom * fy
}

/** Draws one settled scene as luma, mirroring canvas2d.ts. */
function render(scene, img) {
  const lumaAt = sampler(img)
  const out = new Float32Array(N * N)
  const each = (fn) => {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) out[y * N + x] = fn((x + 0.5) / N, (y + 0.5) / N)
  }
  const from = (source) =>
    each((u, v) => {
      const s = source(u, v)
      return s ? lumaAt(s[0], s[1]) : 0
    })

  switch (scene.kind) {
    case "tiles": {
      const g = scene.grid
      const atCell = new Map(scene.tiles.map((t, i) => [t.cellY * g + t.cellX, { i, rot: t.rot }]))
      each((u, v) => {
        const cx = Math.floor(u * g)
        const cy = Math.floor(v * g)
        const { i, rot } = atCell.get(cy * g + cx)
        // Undo the tile's rotation about its centre.
        const a = -((rot === 3 ? -1 : rot) * Math.PI) / 2
        const px = u * g - cx - 0.5
        const py = v * g - cy - 0.5
        const sx = px * Math.cos(a) - py * Math.sin(a)
        const sy = px * Math.sin(a) + py * Math.cos(a)
        return lumaAt(((i % g) + sx + 0.5) / g, (Math.floor(i / g) + sy + 0.5) / g)
      })
      break
    }
    case "hidden": {
      const g = scene.grid
      each((u, v) => (scene.hidden[Math.floor(v * g) * g + Math.floor(u * g)] ? 0 : lumaAt(u, v)))
      break
    }
    case "ripple":
      from((u, v) => {
        const [dx, dy] = S.rippleOffset(u, v, scene.amplitude, scene.waves, scene.phaseX, scene.phaseY)
        return [S.mirror(u + dx), S.mirror(v + dy)]
      })
      break
    case "rings":
      from((u, v) => S.ringSource(u, v, scene.angles))
      break
    case "strips": {
      const n = scene.slots.length
      const source = new Array(n)
      scene.slots.forEach((slot, i) => (source[slot] = i))
      from((u, v) => {
        const slot = Math.floor(u * n)
        return [(source[slot] + u * n - slot) / n, v]
      })
      break
    }
    case "keyholes":
      each((u, v) => (scene.holes.some((h) => h.r > 0 && Math.hypot(u - h.x, v - h.y) < h.r) ? lumaAt(u, v) : 0))
      break
    case "fisheye":
      from((u, v) => S.fisheyeSource(u, v, scene.strength, scene.centerX, scene.centerY))
      break
    case "tunnel":
      from((u, v) => S.tunnelSource(u, v, scene.scale, scene.twist, scene.centerX, scene.centerY))
      break
    case "kaleidoscope":
      from((u, v) => S.kaleidoscopeSource(u, v, scene.amount, scene.segments, scene.spin, scene.source))
      break
    case "slices":
      from((u, v) => S.sliceSource(u, v, scene.shift, scene.offsets))
      break
    case "liquid":
      from((u, v) => S.liquidSource(u, v, scene.amplitude, scene.phases))
      break
    case "motionBlur":
      each((u, v) => S.motionBlurValue(u, v, scene.length, scene.angle, lumaAt))
      break
    case "mosaic":
      each((u, v) => S.mosaicValue(u, v, scene.cell, lumaAt))
      break
    default:
      throw new Error(`No renderer for ${scene.kind}`)
  }
  return out
}

// ---------------------------------------------------------------- scoring

/** Box-downsamples an N×N image to SCORE_SIZE × SCORE_SIZE. */
function shrink(img) {
  const k = N / SCORE_SIZE
  const out = new Float32Array(SCORE_SIZE * SCORE_SIZE)
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) out[Math.floor(y / k) * SCORE_SIZE + Math.floor(x / k)] += img[y * N + x] / (k * k)
  return out
}

/** Gradient magnitude (central differences) of a SCORE_SIZE square image. */
function gradient(img) {
  const n = SCORE_SIZE
  const out = new Float32Array(n * n)
  const at = (x, y) => img[clamp(y, 0, n - 1) * n + clamp(x, 0, n - 1)]
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) out[y * n + x] = Math.hypot(at(x + 1, y) - at(x - 1, y), at(x, y + 1) - at(x, y - 1))
  return out
}

/** Standard deviation. */
function spread(a) {
  let m = 0
  for (const x of a) m += x
  m /= a.length
  let v = 0
  for (const x of a) v += (x - m) ** 2
  return Math.sqrt(v / a.length)
}

/** SSIM's contrast term: 1 when both spreads match, lower as they differ. */
function contrast(a, b) {
  const sa = spread(a)
  const sb = spread(b)
  return (2 * sa * sb + 1e-4) / (sa * sa + sb * sb + 1e-4)
}

function pearson(a, b) {
  let ma = 0
  let mb = 0
  for (let i = 0; i < a.length; i++) {
    ma += a[i]
    mb += b[i]
  }
  ma /= a.length
  mb /= b.length
  let ab = 0
  let aa = 0
  let bb = 0
  for (let i = 0; i < a.length; i++) {
    ab += (a[i] - ma) * (b[i] - mb)
    aa += (a[i] - ma) ** 2
    bb += (b[i] - mb) ** 2
  }
  return aa === 0 || bb === 0 ? 0 : ab / Math.sqrt(aa * bb)
}

const clearShrunk = images.map(shrink)
const clearGradient = clearShrunk.map(gradient)

/** Mean recognisability score of a style at one stage across every image. */
function score(style, stage, tuning) {
  let total = 0
  images.forEach((img, k) => {
    const scene = S.buildScene({ style, stage, seed: `mislook-${k + 1}`, tuning })
    const small = shrink(render(scene, img))
    const brightness = Math.abs(pearson(small, clearShrunk[k]))
    const edges = Math.max(0, pearson(gradient(small), clearGradient[k]))
    total += ((brightness + edges) / 2) * contrast(small, clearShrunk[k])
  })
  return total / images.length
}

// ---------------------------------------------------------------- report

const fmt = (x) => x.toFixed(2).padStart(5)
console.log(`${images.length} images, render ${N}px, score at ${SCORE_SIZE}px\n`)
console.log(`${"style".padEnd(16)}  stage1 stage2 stage3 stage4 stage5  monotonic`)
const results = {}
for (const style of S.ALL_STYLES) {
  const scores = [1, 2, 3, 4, 5].map((stage) => score(style, stage))
  results[style] = scores
  const monotonic = scores.every((s, i) => i === 0 || s >= scores[i - 1] - 0.01)
  console.log(`${style.padEnd(16)}  ${scores.map(fmt).join("  ")}  ${monotonic ? "yes" : "NO"}`)
}

// ---------------------------------------------------------------- calibration

/**
 * Hardest and easiest setting per style, as `{ key: [hardest, easiest] }`.
 * Calibration walks a single difficulty dial t from 0 (hardest) to 1
 * (easiest), moving every key linearly (or geometrically for sizes), and
 * picks the t whose score hits each stage's target.
 */
const RANGES = {
  "ring-lock": { turn: [1, 0.004] },
  shredder: { outOfPlace: [1, 0.06] },
  keyholes: { holes: [2, 32], radius: [0.022, 0.17] },
  fisheye: { strength: [4, 0.05] },
  tunnel: { scale: [0.95, 0.1], twist: [0.7, 0.05] },
  kaleidoscope: { amount: [1, 0.02], segments: [12, 6] },
  "slice-glitch": { shift: [1, 0.01] },
  "liquid-warp": { amplitude: [0.25, 0.008] },
  "motion-blur": { length: [0.5, 0.01] },
  mosaic: { cell: [0.2, 0.012] },
}
/** Keys that change size-like quantities move geometrically, so small values get as much room as large ones. */
const GEOMETRIC = new Set(["cell", "offset", "length", "amplitude", "radius", "holes", "strength", "threshold"])
const INTEGER = new Set(["holes", "segments"])
/**
 * Stage 1 aims for TARGET_HARD (barely anything left) and stage 5 for
 * TARGET_EASY ("takes a moment"), with even steps between. When a style can't
 * get that hard (or that easy) within its sensible range, the ends move to what
 * it can reach and the steps stay even.
 */
const TARGET_HARD = 0.1
const TARGET_EASY = 0.7

function settingAt(style, t) {
  const out = {}
  for (const [key, [hard, easy]] of Object.entries(RANGES[style])) {
    let value = GEOMETRIC.has(key) && hard > 0 && easy > 0 ? hard * (easy / hard) ** t : hard + (easy - hard) * t
    value = INTEGER.has(key) ? Math.round(value) : Number(value.toPrecision(3))
    out[key] = value
  }
  return out
}

if (process.argv.includes("--calibrate")) {
  console.log(`\nSuggested values (stage 1 → 5 aiming ${TARGET_HARD} → ${TARGET_EASY}, evenly spaced):\n`)
  for (const style of Object.keys(RANGES)) {
    // Score the dial, then take the first t (from the hard end) that reaches each target.
    const steps = 80
    const dial = Array.from({ length: steps + 1 }, (_, i) => {
      const t = i / steps
      const setting = settingAt(style, t)
      const tuning = { [style]: Object.fromEntries(Object.entries(setting).map(([k, v]) => [k, [v, v, v, v, v]])) }
      return { t, setting, score: score(style, 1, tuning) }
    })
    const lowest = Math.min(...dial.map((d) => d.score))
    const highest = Math.max(...dial.map((d) => d.score))
    const hard = Math.max(TARGET_HARD, lowest)
    const easy = Math.min(TARGET_EASY, highest)
    const targets = [0, 1, 2, 3, 4].map((i) => hard + ((easy - hard) * i) / 4)
    const picks = targets.map((target) => dial.find((d) => d.score >= target - 0.005) ?? dial[dial.length - 1])
    const keys = Object.keys(RANGES[style])
    const values = Object.fromEntries(keys.map((k) => [k, picks.map((p) => p.setting[k])]))
    const range = `${fmt(dial[0].score)} → ${fmt(dial[dial.length - 1].score)}`
    console.log(`${style.padEnd(16)} dial ${range}  scores ${picks.map((p) => fmt(p.score)).join("")}`)
    console.log(`  ${JSON.stringify(values)}`)
  }
}
