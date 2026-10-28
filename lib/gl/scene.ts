/**
 * @file Pure description of what each settled stage looks like.
 *
 * `buildScene` turns (style, stage, date seed, tuning) into a plain `Scene`
 * object. Both renderers (`webgl.ts` and the `canvas2d.ts` fallback) draw from
 * that object and from the per-pixel maths below, so every player sees the
 * same settled stage whichever renderer they get.
 *
 * Conventions used throughout:
 * - Coordinates are `u, v` in [0, 1] with (0, 0) at the image's top-left.
 * - Stage 1 is hardest, stage 5 easiest, stage 0 is the clear colour image.
 * - Anything random comes from `seededRandom(seed + ":" + purpose)`, so a
 *   given day always looks the same and styles never share a random stream.
 */

import { settings } from "@/lib/content"
import { seededRandom, shuffledIndices } from "@/lib/gl/random"

/** Styles in the daily rotation. */
export const ROTATION_STYLES = ["tile-shuffle", "hidden-tiles", "ripple"] as const
/** Styles being judged in the test panel. They never join the rotation from here. */
export const CANDIDATE_STYLES = ["ring-lock", "shredder", "keyholes"] as const
/** Further experiments to judge by eye (from an outside list of distortion ideas). Test panel only. */
export const EXPERIMENT_STYLES = ["liquid-warp"] as const
/** Every style the test panel can show: rotation, then candidates, then experiments. */
export const ALL_STYLES = [...ROTATION_STYLES, ...CANDIDATE_STYLES, ...EXPERIMENT_STYLES] as const
/** Any style id the renderers understand, including test-panel-only ones. */
export type AnyStyleId = (typeof ALL_STYLES)[number]

/** Human-readable style names for the test panel. */
export const STYLE_LABELS: Record<AnyStyleId, string> = {
  "tile-shuffle": "Tile shuffle",
  "hidden-tiles": "Hidden tiles",
  ripple: "Ripple",
  "ring-lock": "Ring lock",
  shredder: "Shredder",
  keyholes: "Keyholes",
  "liquid-warp": "Liquid warp",
}

/**
 * The one knob per style that the test panel's intensity slider tunes.
 * `key` names the per-stage array in `settings.json` under `styles[style]`.
 */
export const KNOBS: Record<AnyStyleId, { key: string; min: number; max: number; step: number }> = {
  "tile-shuffle": { key: "outOfPlace", min: 0, max: 1, step: 0.01 },
  "hidden-tiles": { key: "visible", min: 0, max: 1, step: 0.01 },
  ripple: { key: "amplitude", min: 0, max: 0.25, step: 0.005 },
  "ring-lock": { key: "turn", min: 0, max: 1, step: 0.01 },
  shredder: { key: "outOfPlace", min: 0, max: 1, step: 0.01 },
  keyholes: { key: "holes", min: 1, max: 32, step: 1 },
  "liquid-warp": { key: "amplitude", min: 0, max: 0.2, step: 0.002 },
}

/** Per-stage values for one style, keyed like settings.json. */
export type StyleValues = Record<string, number[]>
/** Test-panel overrides of settings.json, per style. */
export type Tuning = Partial<Record<AnyStyleId, StyleValues>>

/**
 * Per-stage values for a style: `settings.json` with any test-panel tuning on top.
 * @param style - Style id.
 * @param tuning - Optional overrides from the test panel's intensity slider.
 */
export function styleValues(style: AnyStyleId, tuning?: Tuning): StyleValues {
  const base = (settings.styles as Record<string, StyleValues>)[style]
  return { ...base, ...tuning?.[style] }
}

/** Stage 1–5, or 0 for the clear image. */
export type StageView = 0 | 1 | 2 | 3 | 4 | 5

/** Where one source tile is drawn (grid cell) and how many quarter turns it is rotated (0–3). */
export type Tile = { cellX: number; cellY: number; rot: number }
/** A round keyhole: centre and radius as shares of the side. Radius 0 means closed. */
export type Hole = { x: number; y: number; r: number }
/** A triangle of glass: home corners (x, y pairs), the point it turns about, and its nudge. */
export type Shard = { tri: number[]; pivotX: number; pivotY: number; dx: number; dy: number; rot: number }

/**
 * Everything a renderer needs to draw one settled stage. `colour` is true only
 * for the clear image; every distorted stage is greyscale. Transitions
 * interpolate between two scenes of the same `kind`.
 */
export type Scene = { colour: boolean } & (
  | { kind: "tiles"; grid: number; tiles: Tile[] }
  | { kind: "hidden"; grid: number; hidden: boolean[]; delay: number[] }
  | { kind: "ripple"; amplitude: number; waves: number; phaseX: number; phaseY: number }
  | { kind: "rings"; angles: number[] }
  | { kind: "strips"; slots: number[]; up: number[] }
  | { kind: "keyholes"; holes: Hole[] }
  | { kind: "liquid"; amplitude: number; phases: number[] }
)

/** Inputs to `buildScene`. */
export type SceneInput = {
  style: AnyStyleId
  stage: StageView
  /** Date seed, e.g. `mislook-12`: the same for every player on a given day. */
  seed: string
  tuning?: Tuning
  /** The image's subject as `[x, y]` shares of the side (from images.json); default centre. */
  focus?: [number, number]
}

/**
 * Builds the pure description of one settled stage.
 *
 * Values marked "fixed" in settings.json (single-element arrays such as
 * `strips` or `grid`) are the same at every stage so that the 1s transition
 * between stages can interpolate piece by piece.
 */
export function buildScene({ style, stage, seed, tuning }: SceneInput): Scene {
  const values = styleValues(style, tuning)
  const clear = stage === 0
  const at = (key: string) => values[key][stage - 1]
  /** A value that stays the same at every stage, so transitions line up. */
  const fixed = (key: string) => values[key][0]
  const grid = settings.tileGrid
  const count = grid * grid

  switch (style) {
    case "tile-shuffle":
      return {
        kind: "tiles",
        colour: clear,
        grid,
        tiles: tileLayout(seed, grid, clear ? 0 : at("outOfPlace"), clear ? 0 : at("rotated")),
      }
    case "hidden-tiles": {
      const rank = hiddenRank(seed, count)
      const visible = clear ? count : Math.round(at("visible") * count)
      return {
        kind: "hidden",
        colour: clear,
        grid,
        hidden: rank.map((r) => r >= visible),
        // Newly opened tiles flip in a seeded, staggered order.
        delay: rank.map((r) => (r % 11) / 10),
      }
    }
    case "ripple": {
      const random = seededRandom(`${seed}:ripple`)
      return {
        kind: "ripple",
        colour: clear,
        amplitude: clear ? 0 : at("amplitude"),
        waves: clear ? values.waves[STAGE_COUNT - 1] : at("waves"),
        phaseX: random() * Math.PI * 2,
        phaseY: random() * Math.PI * 2,
      }
    }
    case "ring-lock": {
      const random = seededRandom(`${seed}:rings`)
      const turn = clear ? 0 : at("turn")
      return {
        kind: "rings",
        colour: clear,
        angles: Array.from({ length: Math.min(MAX_RINGS, fixed("rings")) }, () => {
          const sign = random() < 0.5 ? -1 : 1
          return sign * (0.35 + 0.65 * random()) * Math.PI * turn
        }),
      }
    }
    case "shredder": {
      const strips = fixed("strips")
      const order = shuffledIndices(strips, seededRandom(`${seed}:strips`))
      // Every other strip is upside down, so neighbouring frames run back and forth.
      // Later stages unflip those strips from the end and leave the rest upright.
      const start = seededRandom(`${seed}:strip-flip`)() < 0.5 ? 0 : 1
      const downs = Array.from({ length: strips }, (_, i) => i).filter((i) => (i + start) % 2 === 1)
      const flipped = clear ? 0 : Math.round(at("upsideDown") * downs.length)
      const up = Array.from({ length: strips }, () => 1)
      for (let i = 0; i < flipped; i++) up[downs[i]] = -1
      return {
        kind: "strips",
        colour: clear,
        slots: cycleCells(order, clear ? 0 : at("outOfPlace")),
        up,
      }
    }
    case "keyholes": {
      const count = clear ? MAX_HOLES : Math.round(at("holes"))
      const radius = clear ? 1.5 : at("radius")
      return {
        kind: "keyholes",
        colour: clear,
        holes: holeLayout(seed).map((h, k) => ({
          x: h.x,
          y: h.y,
          r: k < count ? (clear ? radius : radius * h.size) : 0,
        })),
      }
    }
    case "liquid-warp": {
      const random = seededRandom(`${seed}:liquid`)
      return {
        kind: "liquid",
        colour: clear,
        amplitude: clear ? 0 : at("amplitude"),
        phases: [0, 1, 2, 3].map(() => random() * Math.PI * 2),
      }
    }
  }
}

const STAGE_COUNT = 5

/**
 * Tile shuffle layout, indexed by source tile. The out-of-place tiles are a
 * prefix of one seeded order, so a tile that is home at one stage stays home
 * at every later stage, and displaced tiles form a single cycle (none sits in
 * its own cell).
 */
export function tileLayout(seed: string, grid: number, outOfPlace: number, rotated: number): Tile[] {
  const count = grid * grid
  const random = seededRandom(`${seed}:tiles`)
  const order = shuffledIndices(count, random)
  const turns = order.map(() => 1 + Math.floor(random() * 3))
  const cells = cycleCells(order, outOfPlace)
  const moved = cells.filter((cell, i) => cell !== i).length
  const turned = Math.min(moved, Math.round(rotated * count))

  const tiles: Tile[] = cells.map((cell) => ({ cellX: cell % grid, cellY: Math.floor(cell / grid), rot: 0 }))
  for (let k = 0; k < turned; k++) tiles[order[k]].rot = turns[k]
  return tiles
}

/**
 * Cell of each source piece when `outOfPlace` of them are displaced. The moved
 * pieces are a prefix of the seeded `order`, so a piece that is home at one
 * stage stays home later, and they form one cycle (none sits in its own cell).
 */
export function cycleCells(order: number[], outOfPlace: number) {
  const count = order.length
  let moved = Math.round(outOfPlace * count)
  if (moved === 1) moved = 2
  const cells = Array.from({ length: count }, (_, i) => i)
  // Cell order[k] shows source order[k + 1], so that piece lives at order[k].
  for (let k = 0; k < moved; k++) cells[order[(k + 1) % moved]] = order[k]
  return cells
}

/** Seeded reveal rank per tile: a tile is visible when its rank is below the visible count. */
export function hiddenRank(seed: string, count: number) {
  const order = shuffledIndices(count, seededRandom(`${seed}:hidden`))
  const rank = new Array<number>(count)
  order.forEach((tile, position) => (rank[tile] = position))
  return rank
}

export const LUMA = [0.2126, 0.7152, 0.0722] as const

/** Two-tone: equal luma bands, no dither. `bias` pushes the threshold so more goes black. */
export function posterize(luma: number, levels: number, bias: number) {
  if (levels < 1.5) return luma
  const cut = bias * 0.35
  const x = Math.min(1, Math.max(0, (luma - cut) / (1 - cut)))
  return Math.min(Math.floor(x * levels), levels - 1) / (levels - 1)
}

/** Ripple: sine displacement in both directions, as a share of the side. */
export function rippleOffset(u: number, v: number, amplitude: number, waves: number, phaseX: number, phaseY: number) {
  return [
    amplitude * Math.sin(2 * Math.PI * waves * v + phaseX),
    amplitude * Math.sin(2 * Math.PI * waves * u + phaseY),
  ] as const
}

/** Mirror-repeat a texture coordinate into [0, 1]. */
export function mirror(t: number) {
  const m = ((t % 2) + 2) % 2
  return 1 - Math.abs(1 - m)
}

/** Most rings ring lock supports (size of the shader's uniform array). */
export const MAX_RINGS = 48
/** Most keyholes (size of the shader's uniform array). */
export const MAX_HOLES = 32
/** Most slice-glitch bands (size of the shader's uniform array). */
export const MAX_BANDS = 48
/** Side of the static noise grid, in cells. */
export const NOISE_SIZE = 256
/** Glyphs for the ASCII style, darkest first. */
export const ASCII_GLYPHS = " .:-=+*#%@"
/** Edge detection samples this far either side, as a share of the side, so both renderers match. */
export const EDGE_STEP = 1 / 400
/** Number of taps along the motion-blur line. */
export const BLUR_TAPS = 24
/** Rings span the centre to the far corner. */
const RING_REACH = Math.SQRT1_2
const FISHEYE_RADIUS = 0.8

const inside = (u: number, v: number) => u >= 0 && u <= 1 && v >= 0 && v <= 1
type Source = readonly [number, number] | null

/** Fisheye and tunnel centre: across the image from the subject (seeded when the subject is central). */
export function awayFromSubject(seed: string, focus?: [number, number]): [number, number] {
  let dx = 0.5 - (focus?.[0] ?? 0.5)
  let dy = 0.5 - (focus?.[1] ?? 0.5)
  const length = Math.hypot(dx, dy)
  if (length < 0.05) {
    const angle = seededRandom(`${seed}:away`)() * Math.PI * 2
    dx = Math.cos(angle)
    dy = Math.sin(angle)
  } else {
    dx /= length
    dy /= length
  }
  return [0.5 + dx * 0.24, 0.5 + dy * 0.24]
}

/** Keyholes: up to MAX_HOLES spots, one per cell of a shuffled 6 × 6 grid so they spread out. */
export function holeLayout(seed: string) {
  const random = seededRandom(`${seed}:holes`)
  return shuffledIndices(36, random)
    .slice(0, MAX_HOLES)
    .map((cell) => ({
      x: (cell % 6) / 6 + (0.15 + random() * 0.7) / 6,
      y: Math.floor(cell / 6) / 6 + (0.15 + random() * 0.7) / 6,
      size: 0.75 + random() * 0.5,
    }))
}

/**
 * Shattered glass: a seeded impact point with jagged spokes and rings, cut into
 * triangles. Each shard is pushed outward and turned, scaled by `scatter`.
 */
export function shardLayout(seed: string, scatter: number): Shard[] {
  const random = seededRandom(`${seed}:shards`)
  const spokes = 14
  const radii = [0.07, 0.18, 0.34, 0.56, 1.6]
  const px = 0.3 + random() * 0.4
  const py = 0.3 + random() * 0.4
  const angles = Array.from({ length: spokes }, (_, k) => ((k + (random() - 0.5) * 0.6) / spokes) * Math.PI * 2)
  // ring[j][k]: where spoke k crosses ring j; ring 0 is the impact point.
  const ring = [Array.from({ length: spokes }, () => [px, py])].concat(
    radii.map((r, j) =>
      angles.map((a) => {
        const reach = j === radii.length - 1 ? r : r * (0.8 + random() * 0.4)
        return [px + reach * Math.cos(a), py + reach * Math.sin(a)]
      }),
    ),
  )
  const triangles: { tri: number[]; outer: boolean }[] = []
  for (let j = 0; j < radii.length; j++) {
    for (let k = 0; k < spokes; k++) {
      const n = (k + 1) % spokes
      const [a, b, c, d] = [ring[j][k], ring[j][n], ring[j + 1][n], ring[j + 1][k]]
      const outer = j === radii.length - 1
      if (j === 0) triangles.push({ tri: [...a, ...c, ...d], outer })
      else if (random() < 0.5) triangles.push({ tri: [...a, ...b, ...c], outer }, { tri: [...a, ...c, ...d], outer })
      else triangles.push({ tri: [...a, ...b, ...d], outer }, { tri: [...b, ...c, ...d], outer })
    }
  }
  const clamp = (t: number) => Math.min(0.98, Math.max(0.02, t))
  return triangles.map(({ tri, outer }) => {
    const pivotX = clamp((tri[0] + tri[2] + tri[4]) / 3)
    const pivotY = clamp((tri[1] + tri[3] + tri[5]) / 3)
    const ox = pivotX - px
    const oy = pivotY - py
    const length = Math.hypot(ox, oy) || 1
    const push = (0.25 + random()) * 0.035
    const side = (random() - 0.5) * 0.03
    const rot = (random() - 0.5) * 0.6 * (outer ? 0.35 : 1)
    return {
      tri,
      pivotX,
      pivotY,
      dx: scatter * ((ox / length) * push - (oy / length) * side),
      dy: scatter * ((oy / length) * push + (ox / length) * side),
      rot: scatter * rot,
    }
  })
}

/** Ring lock: each ring around the centre is turned by its own angle. Off the image is black. */
export function ringSource(u: number, v: number, angles: number[]): Source {
  const qx = u - 0.5
  const qy = v - 0.5
  const ring = Math.min(angles.length - 1, Math.floor(Math.hypot(qx, qy) / (RING_REACH / angles.length)))
  const cos = Math.cos(angles[ring])
  const sin = Math.sin(angles[ring])
  const su = 0.5 + qx * cos - qy * sin
  const sv = 0.5 + qx * sin + qy * cos
  return inside(su, sv) ? [su, sv] : null
}

/** Melt: how far (0–1) column `u` drips, from a few seeded waves and some sharp drips. */
export function drip(u: number, phases: number[]) {
  const t = 2 * Math.PI * u
  const spikes = (0.5 + 0.5 * Math.sin(29 * t + phases[3])) ** 8
  const d =
    0.3 +
    0.22 * Math.sin(3 * t + phases[0]) +
    0.16 * Math.sin(7 * t + phases[1]) +
    0.12 * Math.sin(17 * t + phases[2]) +
    0.5 * spikes
  return Math.min(1, Math.max(0, d))
}

/** Melt: content slides down its column; above the image the top row streaks. */
export function meltSource(u: number, v: number, amount: number, phases: number[]): Source {
  return [u, Math.max(0, v - amount * drip(u, phases))]
}

/** Fisheye: a bulge that magnifies around the centre and squeezes towards its rim. */
export function fisheyeSource(u: number, v: number, strength: number, cx: number, cy: number): Source {
  const qx = u - cx
  const qy = v - cy
  const r = Math.hypot(qx, qy) / FISHEYE_RADIUS
  if (r >= 1 || r === 0) return [u, v]
  const k = r ** strength
  return [cx + qx * k, cy + qy * k]
}

/** Tunnel: the image holds a turned copy of itself at `scale`, again and again. */
export function tunnelSource(u: number, v: number, scale: number, twist: number, cx: number, cy: number): Source {
  if (scale < 0.02) return [u, v]
  const cos = Math.cos(-twist) / scale
  const sin = Math.sin(-twist) / scale
  let su = u
  let sv = v
  for (let i = 0; i < 16; i++) {
    const nu = cx + (su - cx) * cos - (sv - cy) * sin
    const nv = cy + (su - cx) * sin + (sv - cy) * cos
    if (!inside(nu, nv)) break
    su = nu
    sv = nv
  }
  return [su, sv]
}

/** Kaleidoscope: mirrored wedges around the centre, mixed with the plain image by `amount`. */
export function kaleidoscopeSource(
  u: number,
  v: number,
  amount: number,
  segments: number,
  spin: number,
  source: number,
): Source {
  const qx = u - 0.5
  const qy = v - 0.5
  const r = Math.hypot(qx, qy)
  const wedge = (2 * Math.PI) / segments
  let a = Math.atan2(qy, qx) + spin
  a -= wedge * Math.floor(a / wedge)
  if (a > wedge / 2) a = wedge - a
  a += source
  const ku = 0.5 + r * Math.cos(a)
  const kv = 0.5 + r * Math.sin(a)
  return [mirror(u + (ku - u) * amount), mirror(v + (kv - v) * amount)]
}

/** Static: frozen seeded noise, NOISE_SIZE square, one byte per cell. */
export function staticNoise(seed: string) {
  const random = seededRandom(`${seed}:static`)
  const noise = new Uint8Array(NOISE_SIZE * NOISE_SIZE)
  for (let i = 0; i < noise.length; i++) noise[i] = Math.floor(random() * 256)
  return noise
}

/** Negative: invert, then squash contrast towards mid grey. */
export const negate = (c: number, invert: number, contrast: number) => 0.5 + (c + (1 - 2 * c) * invert - 0.5) * contrast

/** Reads the source image's luma (0–1) at a texture coordinate. */
export type LumaAt = (u: number, v: number) => number

/** RGB split (greyscale): three equal copies of the image, offset along a seeded direction. */
export function echoValue(u: number, v: number, offset: number, angle: number, lumaAt: LumaAt) {
  const dx = Math.cos(angle) * offset
  const dy = Math.sin(angle) * offset
  return (lumaAt(mirror(u - dx), mirror(v - dy)) + lumaAt(u, v) + lumaAt(mirror(u + dx), mirror(v + dy))) / 3
}

/** Slice glitch: horizontal bands, each slid sideways by its own seeded offset, wrapping around. */
export function sliceSource(u: number, v: number, shift: number, offsets: number[]): Source {
  const band = Math.min(offsets.length - 1, Math.floor(v * offsets.length))
  const su = u + offsets[band] * shift
  return [su - Math.floor(su), v]
}

/** Liquid warp: layered, nested sine waves bend the image like heat haze or water. */
export function liquidSource(u: number, v: number, amplitude: number, phases: number[]): Source {
  const tau = 2 * Math.PI
  const dx = Math.sin(tau * (2.3 * v + 0.6 * Math.sin(tau * 1.7 * u + phases[0])) + phases[1])
  const dy = Math.sin(tau * (2.1 * u + 0.6 * Math.sin(tau * 1.9 * v + phases[2])) + phases[3])
  return [mirror(u + amplitude * dx), mirror(v + amplitude * dy)]
}

/**
 * Halftone: white dots on black on a 45° grid of `cell`-sized cells. Each dot's
 * radius grows in step with the brightness at its cell centre (full brightness fills the cell).
 */
export function halftoneValue(u: number, v: number, cell: number, lumaAt: LumaAt) {
  const r = Math.SQRT1_2
  // Into the rotated grid, in cell units.
  const px = ((u - 0.5) * r - (v - 0.5) * r) / cell
  const py = ((u - 0.5) * r + (v - 0.5) * r) / cell
  const cx = Math.floor(px) + 0.5
  const cy = Math.floor(py) + 0.5
  // Back out to image space to read the cell centre.
  const su = 0.5 + (cx * r + cy * r) * cell
  const sv = 0.5 + (-cx * r + cy * r) * cell
  const radius = lumaAt(clamp01(su), clamp01(sv)) * Math.SQRT1_2
  return Math.hypot(px - cx, py - cy) < radius ? 1 : 0
}

/** 4×4 Bayer matrix entry (0–15) for integer cell coordinates, built from the 2×2 pattern [[0, 2], [3, 1]]. */
export function bayer4(x: number, y: number) {
  const b2 = (a: number, b: number) => (2 * a + 3 * b) % 4
  return 4 * b2(x % 2, y % 2) + b2(Math.floor(x / 2) % 2, Math.floor(y / 2) % 2)
}

/** Ordered dither: big `cell`-sized pixels, each pure black or white against a Bayer threshold. */
export function ditherValue(u: number, v: number, cell: number, lumaAt: LumaAt) {
  const x = Math.floor(u / cell)
  const y = Math.floor(v / cell)
  const l = lumaAt(clamp01((x + 0.5) * cell), clamp01((y + 0.5) * cell))
  return l > (bayer4(x, y) + 0.5) / 16 ? 1 : 0
}

/**
 * ASCII: which glyph covers this point and where inside its cell the point is.
 * Brighter cells get denser glyphs from `ASCII_GLYPHS`.
 */
export function asciiCell(u: number, v: number, cell: number, lumaAt: LumaAt) {
  const x = Math.floor(u / cell)
  const y = Math.floor(v / cell)
  const l = lumaAt(clamp01((x + 0.5) * cell), clamp01((y + 0.5) * cell))
  return {
    glyph: Math.min(ASCII_GLYPHS.length - 1, Math.floor(l * ASCII_GLYPHS.length)),
    localX: u / cell - x,
    localY: v / cell - y,
  }
}

/** Scanlines: `lines` dark bands across the image, each covering `cover` of its row. */
export function scanlineValue(u: number, v: number, cover: number, lines: number, lumaAt: LumaAt) {
  const t = v * lines - Math.floor(v * lines)
  return t < cover ? 0 : lumaAt(u, v)
}

/** Edges only: Sobel edge strength, shown white on black above `threshold`. */
export function edgeValue(u: number, v: number, threshold: number, lumaAt: LumaAt) {
  const s = EDGE_STEP
  const l = (dx: number, dy: number) => lumaAt(clamp01(u + dx * s), clamp01(v + dy * s))
  const gx = l(1, -1) + 2 * l(1, 0) + l(1, 1) - l(-1, -1) - 2 * l(-1, 0) - l(-1, 1)
  const gy = l(-1, 1) + 2 * l(0, 1) + l(1, 1) - l(-1, -1) - 2 * l(0, -1) - l(1, -1)
  return smoothstep(threshold, threshold + 0.15, Math.hypot(gx, gy))
}

/** Motion blur: the average of `BLUR_TAPS` samples along a seeded direction, `length` long. */
export function motionBlurValue(u: number, v: number, length: number, angle: number, lumaAt: LumaAt) {
  const dx = Math.cos(angle) * length
  const dy = Math.sin(angle) * length
  let sum = 0
  for (let i = 0; i < BLUR_TAPS; i++) {
    const t = i / (BLUR_TAPS - 1) - 0.5
    sum += lumaAt(mirror(u + dx * t), mirror(v + dy * t))
  }
  return sum / BLUR_TAPS
}

/** Mosaic: big flat `cell`-sized blocks, each the brightness at its centre. */
export function mosaicValue(u: number, v: number, cell: number, lumaAt: LumaAt) {
  return lumaAt(clamp01((Math.floor(u / cell) + 0.5) * cell), clamp01((Math.floor(v / cell) + 0.5) * cell))
}

const clamp01 = (t: number) => Math.min(1, Math.max(0, t))
const smoothstep = (a: number, b: number, t: number) => {
  const x = clamp01((t - a) / (b - a))
  return x * x * (3 - 2 * x)
}

/** Cubic ease-in-out, used for every stage transition. */
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
