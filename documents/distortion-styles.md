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

**Removed:** Darkness / spotlight, two-tone, rotated tiles, shattered glass, melt, static, negative, RGB split, halftone, ordered dither, ASCII, scanlines, edges only, fisheye, tunnel, kaleidoscope, slice glitch, motion blur, and mosaic.

## Rotation (v1)

Values come from the brief's "v1 starting values" and haven't been changed.

| Id | What you see | Knob | Other keys |
| --- | --- | --- | --- |
| `tile-shuffle` | 8×8 tiles out of place, some rotated on stages 1–2 | `outOfPlace` | `rotated` |
| `hidden-tiles` | Black squares; the visible set only grows | `visible` | |
| `ripple` | Sine displacement in both directions; still when settled | `amplitude` | `waves` |

## Candidates

Values are calibrated with `scripts/measure-difficulty.mjs` (see below) so each
stage reveals about the same amount more. Current numbers are in `content/settings.json`.

| Id | What you see | Knob | Other keys | Scene kind |
| --- | --- | --- | --- | --- |
| `ring-lock` | 48 thin concentric rings, each turned like a combination lock | `turn` | `rings` (fixed) | `rings` |
| `shredder` | 64 thin vertical strips, shuffled. Every other strip can be upside down | `outOfPlace` | `strips` (fixed), `upsideDown` | `strips` |
| `keyholes` | Black with round holes that grow and multiply | `holes` | `radius` | `keyholes` |

`upsideDown` is the share of those alternating strips that are flipped. Stage 1 flips all of them, so neighbouring frames run back and forth. Later stages unflip from the end. The clear image is upright.

## Experiments

From an outside list of distortion ideas.

| Id | What you see | Knob | Other keys | Scene kind |
| --- | --- | --- | --- | --- |
| `liquid-warp` | Nested sine waves bend the image like heat haze | `amplitude` | | `liquid` |

Sizes like `cell`, `offset`, `length` and `amplitude` are shares of the image side,
so they look the same at every canvas size.

## Calibrating difficulty

`scripts/measure-difficulty.mjs` renders every style's stages in Node with the
same scene maths, for every image in `public/images`, and scores how
recognisable each stage is (0 = nothing left, 1 = the clear image).

```bash
node scripts/measure-difficulty.mjs              # score table for the current settings.json
node scripts/measure-difficulty.mjs --calibrate  # plus suggested evenly spaced values
```

- **Score:** at 32 × 32 (where the gist of an image lives), the average of the
  brightness correlation (absolute, so a negative still counts) and the edge
  correlation, times SSIM's contrast term (so washed-out or noise-buried
  images score lower). A proxy for human judgement, not a replacement.
- **Calibration:** each style has a hardest and easiest setting (`RANGES` in the
  script). It walks a dial between them and picks stage values whose scores
  step evenly from 0.1 (stage 1) to 0.7 (stage 5). When a style can't get that
  hard within a sensible range, stage 1 sits at its hardest and the steps stay even.
- The v1 rotation styles keep the brief's values. On this score, hidden tiles ends hard (0.43).

## Tuning notes

- Judge the calibrated values by eye across several images in the test panel
  and copy better numbers into `settings.json`.
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
