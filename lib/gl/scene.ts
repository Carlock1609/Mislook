// Pure description of what each settled stage looks like. Shared by the WebGL
// renderer and the Canvas 2D fallback so both show identical stages.

import { settings } from "@/lib/content"
import { seededRandom, shuffledIndices } from "@/lib/gl/random"

/** Styles in the daily rotation. */
export const ROTATION_STYLES = ["tile-shuffle", "hidden-tiles", "two-tone", "ripple"] as const
/** Every style the test panel can show, rotation first. */
export const ALL_STYLES = [...ROTATION_STYLES, "darkness"] as const
export type AnyStyleId = (typeof ALL_STYLES)[number]

export const STYLE_LABELS: Record<AnyStyleId, string> = {
  "tile-shuffle": "Tile shuffle",
  "hidden-tiles": "Hidden tiles",
  "two-tone": "Two-tone",
  ripple: "Ripple",
  darkness: "Darkness",
}

/** The one knob per style that the test panel's intensity slider tunes. */
export const KNOBS: Record<AnyStyleId, { key: string; min: number; max: number; step: number }> = {
  "tile-shuffle": { key: "outOfPlace", min: 0, max: 1, step: 0.01 },
  "hidden-tiles": { key: "visible", min: 0, max: 1, step: 0.01 },
  "two-tone": { key: "toneLevels", min: 2, max: 12, step: 1 },
  ripple: { key: "amplitude", min: 0, max: 0.25, step: 0.005 },
  darkness: { key: "radius", min: 0, max: 1, step: 0.01 },
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

export type Scene = { colour: boolean } & (
  | { kind: "tiles"; grid: number; tiles: Tile[] }
  | { kind: "hidden"; grid: number; hidden: boolean[]; delay: number[] }
  | { kind: "twoTone"; levels: number; bias: number }
  | { kind: "ripple"; amplitude: number; waves: number; phaseX: number; phaseY: number }
  | { kind: "darkness"; radius: number; focusX: number; focusY: number }
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
  let moved = Math.round(outOfPlace * count)
  if (moved === 1) moved = 2
  const turned = Math.min(moved, Math.round(rotated * count))

  const tiles: Tile[] = Array.from({ length: count }, (_, i) => ({
    cellX: i % grid,
    cellY: Math.floor(i / grid),
    rot: 0,
  }))
  for (let k = 0; k < moved; k++) {
    // Cell order[k] shows source tile order[k + 1], so that tile lives at order[k].
    const source = order[(k + 1) % moved]
    const cell = order[k]
    tiles[source] = { cellX: cell % grid, cellY: Math.floor(cell / grid), rot: 0 }
  }
  for (let k = 0; k < turned; k++) tiles[order[k]].rot = turns[k]
  return tiles
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

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
