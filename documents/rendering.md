# Rendering the puzzle image

Everything is in `lib/gl/`.

| File | Role |
| --- | --- |
| `scene.ts` | Pure description of each stage (`buildScene`) plus the per-pixel maths both renderers share |
| `random.ts` | Seeded PRNG (FNV-1a hash + mulberry32) and a seeded shuffle |
| `renderer.ts` | The `Renderer` interface, `TRANSITION_MS`, and the rAF animator |
| `webgl.ts` | The WebGL 1 renderer |
| `shaders.ts` | GLSL sources for the WebGL renderer |
| `canvas2d.ts` | The Canvas 2D fallback |

## From stage to pixels

```text
(style, stage, seed, tuning, focus)
        │  buildScene()             scene.ts, pure
        ▼
      Scene  { kind, colour, ...params }
        │  renderer.show(scene, { transition, reduced })
        ▼
  WebGL: style pass -> framebuffer -> post pass -> screen
  Canvas 2D: draw settled scene offscreen -> crossfade on screen
```

### Scenes

A `Scene` is a plain object: a `kind` (which drawing routine), `colour` (always
true, so the photo keeps its own colors), and the numbers that routine needs:
tile positions, ring angles, a blur length and so on. Rules:

- **Stage 1 is hardest, stage 5 easiest, stage 0 is the clear colour image.**
- Randomness only comes from `seededRandom(seed + ":" + purpose)`. Each style
  uses its own purpose string, so changing one style never reshuffles another.
- Layouts that must "come back" between stages (tile order, strip order, which
  keyholes are open) are a prefix of one seeded order, so a piece that is home at
  one stage stays home later (`cycleCells`, `hiddenRank`, `holeLayout`).
- Values that must line up across stages (strip count, grid size, band count)
  are single-element arrays in `settings.json`, read with `fixed()`.

### Shared per-pixel maths

Full-screen styles are written twice, once in TypeScript (`scene.ts`) and once in
GLSL (`shaders.ts`), with the same formulas. Coordinates are `u, v` in [0, 1],
origin top-left. Two shapes:

- **Source mappings** (`ringSource`, `liquidSource`) return which point of the
  image to show at (u, v), or null for black.

When you change a formula, change both copies. The Canvas 2D fallback is the
easiest way to check they still agree (see "Checking the fallback" below).

## The WebGL renderer (`webgl.ts`)

Each frame is two passes:

1. **Style pass** into an offscreen framebuffer. `drawStyle(from, to, e)` draws
   the in-between of two scenes at eased progress `e`:
   - **Geometry styles** (tile shuffle, shredder, hidden tiles' black covers) build
     a vertex list of textured quads and draw them with the `TILE` program. Each
     piece is lerped from its old position to its new one.
   - **Full-screen styles** draw one quad with a fragment shader and lerp the
     uniforms: `STYLE` (v1: ripple), `CANDIDATE`, or `EXPERIMENT`.
2. **Post pass** to the screen (`POST` program): glitch slices and an RGB split
   while a transition plays (the pattern changes only 3 times per transition,
   never per frame), a crossfade when the style kind changes or motion is
   reduced. The photo stays in its own colors at every stage.

Details worth knowing:

- The candidate and experiment programs compile **lazily**, the first time one
  of their styles is shown. A device that can't compile them still plays the v1 styles.
- GLSL ES 1.0 only guarantees constant indices into uniform arrays in fragment
  shaders, so ring lock and slice glitch loop over the array and pick the matching entry.
- Lookup textures live on their own units (image 0, post framebuffers 1–2),
  so creating one never unbinds the image.
- `webglcontextlost` / `webglcontextrestored` are handled: `init()` rebuilds
  every GPU resource and lazy programs/textures are recreated on demand.

### Transitions

`TRANSITION_MS` is 1000. `MislookImage` asks for `stage` between stages, `final`
into the clear image, and `none` otherwise. Within one kind the style pass
interpolates, so rings turn back into line, strips slide home and upside-down
strips flip upright, keyholes grow, and ripple and liquid waves flow and settle
on the seeded phase.

## The Canvas 2D fallback (`canvas2d.ts`)

Used when `getContext("webgl")` fails. `drawScene` draws a settled scene into an
offscreen canvas, and every stage change is a 1s crossfade (no glitch).

- Geometry styles use `drawImage` with transforms (and clip paths for shards and keyholes).
- Full-screen styles go through `remap` (source mappings) or `shade` (value
  functions) on `ImageData`, using the same functions as the shaders. `lumaGrid`
  gives the shader-like nearest-pixel `lumaAt` sampler.
- This per-pixel work is slow at large sizes but only runs once per stage change.

### Checking the fallback

To see the fallback, temporarily change the renderer choice in
`components/game/MislookImage.tsx` to `createCanvas2DRenderer(canvas) || createWebGLRenderer(canvas)`,
compare a few styles in the test panel, then revert. Don't commit that change.

## Adding a style

See [distortion-styles.md](distortion-styles.md#adding-a-style).
