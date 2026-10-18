# Distortion styles

Each style has one **intensity knob** (the test panel slider) and per-stage values in
`content/settings.json` under `styles.<id>`. Arrays have five entries, stage 1
(hardest) to stage 5 (easiest); single-entry arrays are fixed at every stage. Every
distorted stage is greyscale; only the clear image (stage 0) is in colour.

Styles come in three groups, defined in `lib/gl/scene.ts`:

| Group | Constant | Can be used in `images.json`? |
| --- | --- | --- |
| Rotation (v1) | `ROTATION_STYLES` | Yes, these are the only daily styles |
| Candidates (from the brief) | `CANDIDATE_STYLES` | No, test panel only |
| Experiments (outside list) | `EXPERIMENT_STYLES` | No, test panel only |

`ALL_STYLES` is all three, in that order. A style only joins the rotation by moving
it into `ROTATION_STYLES` *and* `StyleId` in `lib/content.ts`.

**Removed:** Darkness / spotlight (judged and dropped).

## Rotation (v1)

Values come from the brief's "v1 starting values" and haven't been changed.

| Id | What you see | Knob | Other keys |
| --- | --- | --- | --- |
| `tile-shuffle` | 8×8 tiles out of place, some rotated on stages 1–2 | `outOfPlace` | `rotated` |
| `hidden-tiles` | Black squares; the visible set only grows | `visible` | |
| `two-tone` | Luma posterized into equal bands; stage 1 pushed towards black | `toneLevels` | `blackBias` |
| `ripple` | Sine displacement in both directions; still when settled | `amplitude` | `waves` |

## Candidates

Retuned to be harder, with even steps between stages (the old values jumped most
between stages 4 and 5).

| Id | What you see | Knob (stage 1 → 5) | Other keys | Scene kind |
| --- | --- | --- | --- | --- |
| `ring-lock` | Concentric rings each turned like a combination lock | `turn` 1 → 0.3 | `rings` (fixed) | `rings` |
| `shredder` | Thin vertical strips shuffled | `outOfPlace` 1 → 0.5 | `strips` (fixed) | `strips` |
| `rotated-tiles` | Tiles turned 90/180/270° in place | `turned` 1 → 0.46 | `grid` (fixed) | `tiles` |
| `keyholes` | Black with round holes that grow and multiply | `holes` 4 → 22 | `radius` | `keyholes` |
| `shattered-glass` | Radial shards from a seeded impact, nudged and turned | `scatter` 1.4 → 0.54 | | `shards` |
| `melt` | Columns drip downward; the top row streaks | `amount` 0.72 → 0.3 | | `melt` |
| `static` | Frozen seeded TV static mixed over the image (never flickers) | `amount` 0.82 → 0.54 | | `static` |
| `fisheye` | Lens bulge centred across the image from the subject | `strength` 3 → 1.3 | | `fisheye` |
| `tunnel` | The image repeats into itself, each copy turned | `scale` 0.8 → 0.56 | `twist` | `tunnel` |
| `negative` | Inverted tones with squashed contrast | `contrast` 0.16 → 0.5 | | `negative` |
| `kaleidoscope` | Mirrored wedges mixed with the plain image | `amount` 1 → 0.67 | `segments` | `kaleidoscope` |

Fisheye and tunnel use the image's optional `focus` (`[x, y]` in `images.json`) and
centre themselves on the opposite side, or in a seeded direction when there's no focus.

## Experiments

From an outside list of distortion ideas. "Posterization" is already the
`two-tone` style and "Fisheye" is already a candidate, so they aren't repeated.
Because every stage is greyscale, **RGB split** shows as three offset grey copies
rather than coloured fringes.

| Id | What you see | Knob (stage 1 → 5) | Other keys | Scene kind |
| --- | --- | --- | --- | --- |
| `rgb-split` | Three offset copies along a seeded direction | `offset` 0.09 → 0.044 | | `echo` |
| `slice-glitch` | Horizontal bands slid sideways, wrapping around | `shift` 0.6 → 0.29 | `bands` (fixed) | `slices` |
| `liquid-warp` | Nested sine waves bend the image like heat haze | `amplitude` 0.11 → 0.056 | | `liquid` |
| `halftone` | White dots on a 45° grid, sized by brightness | `cell` 0.06 → 0.03 | | `halftone` |
| `dither` | Big pixels, black or white against a 4×4 Bayer threshold | `cell` 0.03 → 0.0145 | | `dither` |
| `ascii` | Characters ` .:-=+*#%@` chosen by brightness | `cell` 0.05 → 0.027 | | `ascii` |
| `scanlines` | Thick dark bands across each row | `cover` 0.88 → 0.72 | `lines` (fixed) | `scanlines` |
| `edges` | Sobel edges only, white on black | `threshold` 1.15 → 0.56 | | `edges` |
| `motion-blur` | Directional blur along a seeded angle | `length` 0.18 → 0.088 | | `motionBlur` |
| `mosaic` | Big flat blocks | `cell` 0.09 → 0.045 | | `mosaic` |

Sizes like `cell`, `offset`, `length` and `amplitude` are shares of the image side,
so they look the same at every canvas size.

## Tuning notes

- These are first guesses from looking at one image. Judge them across several
  images in the test panel and copy better numbers into `settings.json`.
- Brief's difficulty target: stage 1 close to impossible, most players solve at
  stage 3 or 4, stage 5 still takes a moment.
- For an even feel, space the knob so each stage reveals about the same amount
  more. Sizes and amounts often need geometric rather than linear spacing.

## Adding a style

1. **`lib/gl/scene.ts`**
   - Add the id to a group constant (`CANDIDATE_STYLES` or `EXPERIMENT_STYLES`).
   - Add a label to `STYLE_LABELS` and a knob to `KNOBS`.
   - Add a `Scene` variant and a `buildScene` case. Use `seededRandom` with a new
     purpose string for any randomness; make stage 0 the plain image.
   - For full-screen styles, write the per-pixel maths as a pure function.
2. **`content/settings.json`**: add `styles.<id>` with the knob's five values.
3. **`lib/gl/shaders.ts` + `lib/gl/webgl.ts`**
   - Geometry: build vertices in `drawStyle` and draw with the tile program.
   - Full-screen: add a `u_mode` branch to `CANDIDATE_FRAGMENT` or
     `EXPERIMENT_FRAGMENT` mirroring the TS maths, then map the kind to that
     mode and set its uniforms in `drawCandidate` / `drawExperiment`, lerping
     from → to.
4. **`lib/gl/canvas2d.ts`**: add a `drawScene` case using the same TS maths.
5. Check it in the test panel (both renderers), then `npx tsc --noEmit`,
   `npm run lint`, `npm run build`.
