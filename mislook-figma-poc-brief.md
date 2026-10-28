# Mislook — Figma POC Brief

## The ask

Design a proof of concept for **Mislook**, a one-page daily image-guessing game. The POC decides the **look and the motion**. It does not need working game logic. The app will be built separately in Next.js + Tailwind, so the designs and tokens should translate cleanly to that.

Attach every image in the `reference/` folder with this brief.

## Status (round 3)

The UI from round 2 is approved: landing, game panel, result, and the Play transition.

**This round focuses on the picture:**

- the distortion styles;
- making them much harder;
- the stage-reveal motion inside the image frame;
- the test panel.

**Also fix from round 2:**

1. **Scoring:** "Available" shows the real score:
   - stage base 5000 / 4000 / 3000 / 2000 / 1000;
   - plus a time bonus counting down from 1000 by 5 per second;
   - minus 400 per wrong guess;
   - a correct guess always scores at least 100.
2. **Timer:** replace "Time on stage" with one live time-bonus countdown for the whole round.
3. **Result:** rename "Misses" to "Wrong guesses" and show the real count.
4. **Stage reveal:** no full-screen starburst. The reveal happens inside the image frame. The starburst stays for Play only.
5. **Mobile:** pin the guess field, Guess and Reveal to the bottom so they stay visible with the keyboard open.
6. **Small fixes:** make Play a real button, and move the "Copied" toast so it doesn't overlap the button on mobile.
7. **New: site stats.** Always show two live numbers on every screen (landing, game and result): **total visits** and **unique visitors**. Example: `12,481 visits · 3,207 visitors`. Place them wherever fits best (header, footer or a corner), small and quiet, never competing with the image or the guess controls. Use dummy numbers that tick up occasionally. While loading, show a dash; if the numbers fail to load, hide the line.

## The game in 30 seconds

- Every day, everyone gets the same image.
- It starts heavily distorted (shuffled tiles, hidden tiles, crushed to two tones, or rippled), in the photo's own colors. There are five stages, each clearer than the last.
- At each stage the player either **Guesses** (one try per stage) or **Reveals** the next stage.
- Earlier and faster means more points; wrong guesses cost points.
- At the end they see the clear image, their score, and a result they can copy into a group text.
- Then: "Thanks for playing — come back tomorrow."

The players are family and friends, on phones first and laptops second.

## Mood

**Trippy.** Think Doctor Strange's mirror dimension and Inception's folding dream cities.

From the reference image:

- Black-and-white op-art: spirals, concentric rings, checkerboards, stripes
- The subject sliced into strips and echoed into trailing copies
- Glitch blocks and checkerboard breakup across the subject
- RGB chromatic fringing on edges

**How to use it:**

- **Background:** a living op-art field that slowly moves. It must calm down and dim during play.
- **Transitions:** where it gets wild (fold, tunnel, slice, swirl, RGB split).
- **The game image itself:** settles each stage into a clean, fair, full-color still of that day’s style. It’s a puzzle first.
- **Text:** always sits on a calm surface, never directly on moving op-art.

**Tone: edgy, clean, dark, with very little colour.** Take the *geometry* from the references, not the clutter: lots of black negative space; hard, crisp, thin lines; precise patterns, never noisy. Do not draw floating eyes or spheres. Use spirals, rings, checkerboards, stripes, slices, and glitch blocks only.

**Palette:**

- Near-black base, off-white lines and type, a few greys.
- RGB fringing only for a moment during transitions.
- One restrained accent for score and wins, and one muted miss colour.

**Avoid:** colour-heavy palettes, gradients, pastels, neon, glassmorphism, card grids, SaaS dashboard chrome, busy surreal clutter.

How to read the other references:

- **Black-and-white spiral dreamscape:** closest to the UI tone. Use its radiating spiral for the background and the "tunnel in" transition.
- **Warped skyline:** buildings bending like waves. A model for transitions.
- **Neon and psychedelic cityscapes:** show the *kind of image* players might guess in a later version. Their colour is **not** the app's palette.

## Frames

- **Mobile:** 390 × 844 (primary)
- **Desktop:** 1440 × 900
- **Link preview card:** 1200 × 630

On desktop the image caps around 560px square and the op-art fills the rest. One composition at both sizes, not two different layouts.

## Screens and states

Use a placeholder image (any photo of one obvious subject) and dummy text.

1. **How to play (landing):** wordmark, `#12`, about four lines of how to play, **Play** button.
2. **Coming soon:** the landing without a puzzle number, Play disabled, “Coming soon” copy, no preloaded image. Used only before DAY_0.
3. **Game: stage 1, can guess.** The image is the hero. Around it: five-dot stage track, points available, countdown, guess field, **Guess**, **Reveal**.
4. **Game: wrong guess.** The miss message plus a shake, then the miss-locked state with Guess disabled and Reveal highlighted.
5. **Game: stage 3**, to show the progression.
6. **Game: keyboard open (mobile).** The guess bar is still visible above the keyboard.
7. **Game: countdown at zero.**
8. **Result: win.** Clear image, answer, "You saw it", stage, score, time, wrong guesses, **Copy result**, "Thanks for playing — come back tomorrow" with a countdown to the next image.
9. **Result: miss.** Same as the win layout, titled "Mislooked".
10. **"Copied" confirmation.**
11. **Image loading.**
12. **Image failed to load.**
13. **Link preview card:** wordmark over op-art, no game image.
15. **Site stats:** the visits and visitors line in place on the landing, game and result, at mobile and desktop sizes.
14. **Distortion style sheets:** for each v1 style, the same image at stages 1–5 side by side.

## Distortion styles

**Rules for every style:**

- One style per image. It gets weaker each stage; it never switches style mid-round.
- Stages 1–5 and the result keep the photo's **original colors**.
- **Much harder than round 2.** Stage 1 should be close to impossible. Most players should solve at stage 3–4, and stage 5 should still take a moment.
- No pixelation, blur, slice/echo, stripe overlay, halftone, edges only or swirl.

### v1 styles

| Stage | Tile shuffle (8×8 grid: out of place / also rotated) | Hidden tiles (8×8 grid: tiles visible) | Two-tone (tone levels) | Ripple (wave height as a share of the side / waves across) |
| --- | --- | --- | --- | --- |
| 1 | 100% / 50% | 6% | 2, mostly black | 0.12 / 14 |
| 2 | 85% / 25% | 15% | 2 | 0.09 / 12 |
| 3 | 65% / 0% | 30% | 3 | 0.06 / 10 |
| 4 | 40% / 0% | 50% | 4 | 0.035 / 8 |
| 5 | 20% / 0% | 70% | 6 | 0.015 / 6 |

- **Tile shuffle:** tiles swap cells, and on stages 1–2 some are also rotated. Each stage, tiles visibly slide and turn back into place.
- **Hidden tiles:** black squares cover the image. Visible tiles stay visible at every later stage; more appear each stage.
- **Two-tone:** pure black-and-white with no dither. On stage 1 the image is pushed mostly to black; more grey tones return each stage.
- **Ripple:** the image warped by sine waves in both directions. It is still once settled and moves only during the reveal.

### Retest

- **Darkness:** a crisp spotlight on pure black, radius as a share of the short side of 0.08 / 0.14 / 0.22 / 0.35 / 0.50.
- **Kaleidoscope:** mirrored segments folding into fewer each stage. The round 2 version felt weak; try a cleaner one.

### New candidates

Add these to the test panel:

- **Ring lock:** concentric rings, each rotated a different amount like a combination lock, rotating back into line each stage.
- **Rotated tiles:** 8×8 tiles, each turned 90°, 180° or 270° in place, turning upright each stage.
- **Melt:** the image drips downward like a melting city; the drips pull back up each stage.
- **Shattered glass:** sharp shards nudged and turned, settling back each stage.
- **Shredder:** thin vertical strips shuffled, returning to order.
- **Keyholes:** black with a few small round holes; the holes grow and multiply.
- **Static:** frozen TV static over the image (never flickering), thinning each stage.
- **Fisheye:** an extreme lens bulge centred away from the subject, flattening each stage.
- **Tunnel:** the image repeating into itself, unwinding each stage.

## Test panel (temporary)

A small, semi-transparent panel in the top-left of the game screen, labelled "TEST":

1. **Image:** cycles through my 5 uploaded images and shows "2/5".
2. **Style:** cycles through the v1 styles, the retest styles and every new candidate, and shows the style name.
3. **Stage:** buttons 1–5 and "Clear". Changing stage plays the in-frame reveal transition.
4. **Intensity:** a slider that adjusts the current style at the current stage, with the value shown, so difficulty can be tuned by eye.

Changing image or style keeps the current stage. The panel doesn't affect score, timer or game state.

## Motion

This is the most important part of the POC. Static frames can't show it, so provide **prototypes or frame-by-frame storyboards** (about 5 frames each) with durations and easing for:

1. **Landing → game:** the page folds, tunnels or spirals into the game. About 0.8–1.2s.
2. **Stage reveal:** inside the image frame only. The distorted image breaks up (glitch blocks, RGB split) and resolves into the next, easier stage. About 1s, ending on a clean, settled image. Each style reveals in its own way: tiles slide and turn home, hidden tiles flip open, two-tone gains tones, and ripple waves calm.
3. **Final reveal:** the last stage resolves into the clear image on the result screen. This is the big payoff moment and can be the wildest.
4. **Wrong guess:** field shake plus a brief RGB jitter. Under 0.5s.
5. **Wordmark idle:** "Mislook" with a subtle built-in distortion (slice offset, echo or RGB split).
6. **Background idle:** how the op-art moves, both normally and in its dimmed in-game state.

Landing → game: 0.8–1.2s. Stage reveal: 1s. Final reveal: 1s, denser than a stage reveal, same duration. Wrong guess: shake plus a brief RGB jitter, under 0.5s, together with the wrong-guess text. Guess and Reveal stay disabled for the whole transition. Score count-up plays on the result; reduced motion shows the final number immediately.

`prefers-reduced-motion`: static background, no wordmark idle motion, transitions are crossfades, no score count-up.

Tokens: fast = wrong guess (under 0.5s), medium = landing (0.8–1.2s), reveal = stage and final reveal (1s). The background period is chosen in the storyboard and written next to that token.

For each motion, also show the reduced-motion version.

**Hard rule:** nothing flashes more than 3 times per second, and there is no full-screen high-contrast strobing. That's a seizure risk.

## Components

Build as Figma components with variants:

- **Wordmark:** static and animated
- **Button:** primary and secondary; default, hover, pressed, disabled, focus
- **Guess field:** empty, typing, wrong, disabled
- **Stage track:** current stage 1–5; past stages marked used
- **Countdown:** running, low, zero. Display the live time bonus (1000 → 0, minus 5 per second). Number, bar, or ring is the visual choice. Zero means the bonus is 0 and the round continues. Show why you picked that form. Variant `low` is when the bonus is greater than 0 and at most 200.
- **Points-available indicator**
- **Result panel:** win and miss
- **Toast:** "Copied"
- **Site stats:** default, loading (dash) and hidden

## Design tokens

Set these up as **Figma variables** so they map one-to-one to Tailwind:

- **Colour:** background, surface, text, muted text, accent, miss, plus the chromatic fringe red, green and blue
- **Type:**
  - one heavy display face for the wordmark and big numbers;
  - one neutral sans for UI (Geist is fine);
  - a scale of about 5 steps.
- **Spacing:** 4px base scale
- **Radius:** pick one or two
- **Motion:** duration and easing tokens (fast, medium, slow, reveal)

Use Google Fonts or other freely licensed fonts only.

## Constraints

- Touch targets ≥ 44px.
- Text contrast meets WCAG AA against its surface.
- A wrong guess is shown with text plus motion, never motion alone.
- One image, a few controls. No extra pages, menus, profiles or leaderboards.

## What to hand back

1. Figma file link with all frames above, mobile and desktop
2. Prototypes or storyboards for the six motions, plus their reduced-motion versions
3. The component set with variants
4. The variables (tokens) list
5. The link preview card exported as PNG
6. A short note on any decisions or alternatives you'd like us to pick between

## Acceptance

The POC is done when:

- screens and states 1–12 exist at mobile and desktop sizes;
- the link preview card and the four v1 style sheets exist;
- the test panel switches image, style, stage and intensity;
- every style keeps the photo's colors and is clearly harder than round 2;
- the round-2 fixes in the Status section are done;
- the site stats line appears on every screen without crowding the game;
- every motion has a prototype or storyboard with timings, plus a reduced-motion version;
- the in-game image area is calm enough that the puzzle is clearly the focus;
- all text is readable (AA) and never sits on moving op-art;
- tokens exist as variables and components use them.
