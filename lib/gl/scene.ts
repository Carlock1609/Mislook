// Pure description of what each settled stage looks like. Shared by the WebGL
// renderer and the Canvas 2D fallback so both show identical stages.

import { settings } from "@/lib/content"
import { seededRandom, shuffledIndices } from "@/lib/gl/random"

/** Styles in the daily rotation. */
export const ROTATION_STYLES = ["tile-shuffle", "hidden-tiles", "two-tone", "ripple"] as const
/** Styles being judged in the test panel. They never join the rotation from here. */
export const CANDIDATE_STYLES = [
  "ring-lock",
  "shredder",
  "rotated-tiles",
  "keyholes",
  "shattered-glass",
  "melt",
  "static",
  "fisheye",
  "tunnel",
  "negative",
  "kaleidoscope",
] as const
/** Every style the test panel can show, rotation first. */
export const ALL_STYLES = [...ROTATION_STYLES, "darkness", ...CANDIDATE_STYLES] as const
export type AnyStyleId = (typeof ALL_STYLES)[number]

export const STYLE_LABELS: Record<AnyStyleId, string> = {
  "tile-shuffle": "Tile shuffle",
  "hidden-tiles": "Hidden tiles",
  "two-tone": "Two-tone",
  ripple: "Ripple",
  darkness: "Darkness",
  "ring-lock": "Ring lock",
  shredder: "Shredder",
  "rotated-tiles": "Rotated tiles",
  keyholes: "Keyholes",
  "shattered-glass": "Shattered glass",
  melt: "Melt",
  static: "Static",
  fisheye: "Fisheye",
  tunnel: "Tunnel",
  negative: "Negative",
  kaleidoscope: "Kaleidoscope",
}

/** The one knob per style that the test panel's intensity slider tunes. */
export const KNOBS: Record<AnyStyleId, { key: string; min: number; max: number; step: number }> = {
  "tile-shuffle": { key: "outOfPlace", min: 0, max: 1, step: 0.01 },
  "hidden-tiles": { key: "visible", min: 0, max: 1, step: 0.01 },
  "two-tone": { key: "toneLevels", min: 2, max: 12, step: 1 },
  ripple: { key: "amplitude", min: 0, max: 0.25, step: 0.005 },
  darkness: { key: "radius", min: 0, max: 1, step: 0.01 },
  "ring-lock": { key: "turn", min: 0, max: 1, step: 0.01 },
  shredder: { key: "outOfPlace", min: 0, max: 1, step: 0.01 },
  "rotated-tiles": { key: "turned", min: 0, max: 1, step: 0.01 },
  keyholes: { key: "holes", min: 1, max: 32, step: 1 },
  "shattered-glass": { key: "scatter", min: 0, max: 2, step: 0.01 },
  melt: { key: "amount", min: 0, max: 1, step: 0.01 },
  static: { key: "amount", min: 0, max: 1, step: 0.01 },
  fisheye: { key: "strength", min: 0, max: 4, step: 0.05 },
  tunnel: { key: "scale", min: 0, max: 0.9, step: 0.01 },
  negative: { key: "contrast", min: 0.05, max: 1, step: 0.01 },
  kaleidoscope: { key: "amount", min: 0, max: 1, step: 0.01 },
}

/** Per-stage values for one style, keyed like settings.json. */
export type StyleValues = Record<string, number[]>
/** Test-panel overrides of settings.json, per style. */
export type Tuning = Partial<Record<AnyStyleId, StyleValues>>

export function styleValues(style: AnyStyleId, tuning?: Tuning): StyleValues {
  const base = (settings.styles as Record<string, StyleValues>)[style]
  return { ...base, ...tuning?.[style] }
}

/** Stage 1–5, or 0 for the clear image. */
export type StageView = 0 | 1 | 2 | 3 | 4 | 5

export type Tile = { cellX: number; cellY: number; rot: number }
export type Hole = { x: number; y: number; r: number }
/** A triangle of glass: home corners (x, y pairs), the point it turns about, and its nudge. */
export type Shard = { tri: number[]; pivotX: number; pivotY: number; dx: number; dy: number; rot: number }

export type Scene = { colour: boolean } & (
  | { kind: "tiles"; grid: number; tiles: Tile[] }
  | { kind: "hidden"; grid: number; hidden: boolean[]; delay: number[] }
  | { kind: "twoTone"; levels: number; bias: number }
  | { kind: "ripple"; amplitude: number; waves: number; phaseX: number; phaseY: number }
  | { kind: "darkness"; radius: number; focusX: number; focusY: number }
  | { kind: "rings"; angles: number[] }
  | { kind: "strips"; slots: number[] }
  | { kind: "keyholes"; holes: Hole[] }
  | { kind: "shards"; shards: Shard[] }
  | { kind: "melt"; amount: number; phases: number[] }
  | { kind: "static"; amount: number; seed: string }
  | { kind: "fisheye"; strength: number; centerX: number; centerY: number }
  | { kind: "tunnel"; scale: number; twist: number; centerX: number; centerY: number }
  | { kind: "negative"; invert: number; contrast: number }
  | { kind: "kaleidoscope"; amount: number; segments: number; spin: number; source: number }
)

export type SceneInput = {
  style: AnyStyleId
  stage: StageView
  seed: string
  tuning?: Tuning
  focus?: [number, number]
}

export function buildScene({ style, stage, seed, tuning, focus }: SceneInput): Scene {
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
    case "two-tone":
      return {
        kind: "twoTone",
        colour: clear,
        levels: clear ? 0 : at("toneLevels"),
        bias: clear ? 0 : at("blackBias"),
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
    case "darkness":
      return {
        kind: "darkness",
        colour: clear,
        radius: clear ? 1.5 : at("radius"),
        focusX: focus?.[0] ?? 0.5,
        focusY: focus?.[1] ?? 0.5,
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
      return { kind: "strips", colour: clear, slots: cycleCells(order, clear ? 0 : at("outOfPlace")) }
    }
    case "rotated-tiles": {
      const g = fixed("grid")
      const random = seededRandom(`${seed}:rotated`)
      const order = shuffledIndices(g * g, random)
      const turns = order.map(() => 1 + Math.floor(random() * 3))
      const turned = clear ? 0 : Math.round(at("turned") * g * g)
      const tiles: Tile[] = Array.from({ length: g * g }, (_, i) => ({ cellX: i % g, cellY: Math.floor(i / g), rot: 0 }))
      for (let k = 0; k < turned; k++) tiles[order[k]].rot = turns[k]
      return { kind: "tiles", colour: clear, grid: g, tiles }
    }
    case "keyholes": {
      const count = clear ? MAX_HOLES : Math.round(at("holes"))
      const radius = clear ? 1.5 : at("radius")
      return {
        kind: "keyholes",
        colour: clear,
        holes: holeLayout(seed).map((h, k) => ({ x: h.x, y: h.y, r: k < count ? (clear ? radius : radius * h.size) : 0 })),
      }
    }
    case "shattered-glass":
      return { kind: "shards", colour: clear, shards: shardLayout(seed, clear ? 0 : at("scatter")) }
    case "melt": {
      const random = seededRandom(`${seed}:melt`)
      return {
        kind: "melt",
        colour: clear,
        amount: clear ? 0 : at("amount"),
        phases: [0, 1, 2, 3].map(() => random() * Math.PI * 2),
      }
    }
    case "static":
      return { kind: "static", colour: clear, amount: clear ? 0 : at("amount"), seed }
    case "fisheye": {
      const [centerX, centerY] = awayFromSubject(seed, focus)
      return { kind: "fisheye", colour: clear, strength: clear ? 0 : at("strength"), centerX, centerY }
    }
    case "tunnel": {
      const [centerX, centerY] = awayFromSubject(seed, focus)
      return {
        kind: "tunnel",
        colour: clear,
        scale: clear ? 0 : at("scale"),
        twist: clear ? 0 : at("twist"),
        centerX,
        centerY,
      }
    }
    case "negative":
      return { kind: "negative", colour: clear, invert: clear ? 0 : 1, contrast: clear ? 1 : at("contrast") }
    case "kaleidoscope": {
      const random = seededRandom(`${seed}:kaleidoscope`)
      return {
        kind: "kaleidoscope",
        colour: clear,
        amount: clear ? 0 : at("amount"),
        segments: clear ? values.segments[STAGE_COUNT - 1] : at("segments"),
        spin: random() * Math.PI * 2,
        source: random() * Math.PI * 2,
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

export const MAX_RINGS = 16
export const MAX_HOLES = 32
export const NOISE_SIZE = 256
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
    0.3 + 0.22 * Math.sin(3 * t + phases[0]) + 0.16 * Math.sin(7 * t + phases[1]) + 0.12 * Math.sin(17 * t + phases[2]) + 0.5 * spikes
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

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
