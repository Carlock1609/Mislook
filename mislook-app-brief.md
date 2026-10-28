# Mislook — App Brief

> Supersedes `pixel-guess-planning-brief.md` and `pixel-guess-planning-brief-v2.md`.
> Companion doc for design: `mislook-figma-poc-brief.md`.

## What this is

**Mislook** is a daily image-guessing game for family and friends. Everyone gets the same image each day. It starts heavily distorted and gets clearer over five stages. Guess earlier and faster for more points. Wrong guesses cost points, so revealing is sometimes smarter than guessing.

It is a **very simple one-page app**: how to play, Play, the game, the result, come back tomorrow. No accounts, no leaderboard, no admin page. The only storage is a tiny visit counter for the public site stats.

The look is **trippy**: op-art spirals and checkerboards, glitch slices, chromatic (RGB) fringing, echo trails, in the spirit of Doctor Strange's mirror-dimension and Inception's dream-folding. The wild motion happens in the transitions and the background. Each settled stage stays fair and readable.

## Principles

- Frontend quality and motion over backend complexity.
- One page, one flow.
- Trust the player. No anti-cheat beyond cheap, obvious steps.
- Pure game rules live in functions that do not import React.
- The app computes the score. The player never enters one.
- Anything you might want to tweak (copy, scoring numbers, images) lives in JSON files, not in components.

---

## Stack

- **Next.js** (App Router), version pinned at scaffold
- **React** + **TypeScript**
- **Tailwind CSS**, with no second CSS framework and no component kit
- **Motion** (`motion/react`) for UI motion: the landing→game transition, panels, score count-up
- **WebGL fragment shaders** for the image and the trippy effects, using plain WebGL. No `ogl`. No Three.js.
- **Canvas 2D fallback** when WebGL is unavailable: the same settled stages, no transition effects
- **Vitest** for pure rules
- Repo: `github.com/Carlock1609/mislook`
- Host: **Vercel** free tier, deploying automatically on every push to `main`
- **Upstash Redis** (free tier, connected through Vercel) for the visit counter only

---

## The page

One route (`/`) with four states. Play never changes the URL. `?day` is the only query the page reads, and only in development.

```text
Coming soon (before DAY_0)
How to play  —Play→  Game  →  Result · Thanks for playing · Come back tomorrow
```

### 1. How to play (the landing)

- Mislook wordmark, today's number (`#12`)
- How to play, in about four short lines:
  - Five stages, from unrecognisable to nearly clear
  - One guess per stage, or Reveal to move on
  - Earlier and faster scores more; wrong guesses cost points
  - One image a day
- **Play** button
- Today's image preloads here, out of sight.

### Coming soon (only before DAY_0)

Same layout as How to play. Hide the puzzle number. Show `comingSoon`. Play is disabled. Do not preload an image. Running out of images loops; it does not show this state.

### 2. Game

- The image is the hero, centred, square.
- Around it: stage track (five dots), points available now, countdown, guess field, **Guess**, **Reveal**.
- The guess bar stays usable with the phone keyboard open.

### 3. Result

- Clear image revealed for the first time, with the answer
- Win or miss message, stage, score, time, wrong guesses
- **Copy result** (and the native share sheet where available)
- "Thanks for playing — come back tomorrow" with a countdown to the next image

Visiting again after finishing today goes straight to the result state.

---

## The day

- A new image every day at 00:00 in America/Los_Angeles (Pacific time, including daylight saving). Everyone gets the same image for that Pacific date.
- `DAY_0` is the first deploy date, in `content/settings.json`.
- `dayIndex` is the number of Pacific midnights from `DAY_0` to today. On `DAY_0`, `dayIndex` is 0. Before `DAY_0`, `dayIndex` is negative.
- The number in the UI and in share text is the place in the image list, starting at `#1` on `DAY_0`. After the last image, the next day is `#1` again and uses the first image. The calendar date used for the lock and the share line does not restart.
- Before `DAY_0`, select no image and show Coming soon.
- If the page is left open past midnight, the round in progress finishes on the old day’s image and saves that date.
- Development only: a small **test panel** in the top-left corner has three controls: an **image** button that cycles through every image in `images.json`, a **style** button that cycles through every distortion style (including ones not yet in rotation), **stage** buttons for 1–5 and the clear image, and an **intensity** slider for tuning the current style and stage. It is hidden in production builds and never affects the daily lock or scoring.
- Development only: `?day=N` previews puzzle number N when that photo exists (`?day=1` is the first image). It does not read or write the daily lock. A `?day` that is not an integer from 1 through the number of images is removed from the URL, and the page shows the real current day. Play state never changes the URL. `?day` is the only query the page reads.

---

## Saving and the daily lock

- When a round ends, save **only the result** for that date in `localStorage`.
- Nothing is saved mid-round. A refresh during a round restarts it. Accepted.
- If `localStorage` is unavailable, the game still works without the lock.

---

## Game rules

### Stages

Five stages. Stage 1 is hardest. Stage 5 is still slightly distorted but pretty easy. The clear image appears only on the result.

**Settled vs. transition.** Each stage *settles* into a still, fair image that every player sees identically. The trippy motion (glitch slices, swirl, echo, folding) plays during the ~1s *transition* between stages and on the final reveal, then resolves into the next settled stage.

**Same for everyone.** Anything random (tile shuffle order, which regions are hidden) uses the date as its seed, never the visit.

WebGL and the Canvas 2D fallback show the same settled stages for every style, with the same date-seeded randomness. The fallback skips the trippy transitions and crossfades instead. Scoring does not change.

### Distortion styles

Each style has one *intensity* knob that goes from hardest (stage 1) to easiest (stage 5).

**Difficulty target:**

- Stage 1 is close to impossible.
- Most players solve at stage 3 or 4.
- Stage 5 still takes a moment.

**Color throughout:** stages 1–5 and the clear image all keep the photo's original colors.

#### Verdicts from the POC

| Style | Verdict | Note |
| --- | --- | --- |
| Tile shuffle | **Keep (v1)** | |
| Hidden tiles | **Keep (v1)** | |
| Two-tone | Dropped | Removed from the rotation and the test panel |
| Ripple | **Keep (v1)** | |
| Darkness / spotlight | Dropped | Retested in the app and removed |
| Kaleidoscope | Dropped | Removed from the test panel |
| Slice / echo, stripe overlay, halftone, edges only, swirl | Dropped | |
| Pixelate, blur | Dropped | Soft and familiar; don't fit the look |

#### New candidates to try

These go in the test panel and only join the rotation if they feel good.

| Style | What the player sees | Stage 1 → stage 5 |
| --- | --- | --- |
| Ring lock | Image cut into concentric rings, each turned a different amount, like a combination lock | Rings rotate back into line |
| Shredder | Image cut into thin vertical strips, shuffled | Strips return to order |
| Keyholes | Black, with a few small round holes scattered across the image | Holes grow and multiply |

Rotated tiles, shattered glass, melt, static, negative, fisheye, tunnel, and kaleidoscope were tried and removed. The experiment still in the test panel is liquid warp. Slice glitch, motion blur, and mosaic were removed, along with RGB split, halftone, ordered dither, ASCII, scanlines, and edges only. See `documents/distortion-styles.md`.

#### How styles map to stages

- **A. One style per image, getting weaker each stage.** Decided for v1.
- **B. A different style at each stage.** Rejected: each reveal feels like a reset, and a later stage can end up harder than an earlier one.
- **C. Stacked layers, one peeled away each stage.** An experiment for after v1.

The style is chosen per image in `images.json`, because some images suit some styles.

#### v1 starting values

These are harder than the POC.

| Stage | Tile shuffle (8×8: out of place / also rotated) | Hidden tiles (8×8: tiles visible) | Ripple (wave height as a share of the side / waves across) |
| --- | --- | --- | --- |
| 1 | 100% / 50% | 6% | 0.12 / 14 |
| 2 | 85% / 25% | 15% | 0.09 / 12 |
| 3 | 65% / 0% | 30% | 0.06 / 10 |
| 4 | 40% / 0% | 50% | 0.035 / 8 |
| 5 | 20% / 0% | 70% | 0.015 / 6 |
| Result | Clear, in colour | Clear, in colour | Clear, in colour |

**Rules per style:**

- **Style ids:** `tile-shuffle`, `hidden-tiles`, and `ripple`. Ring lock, shredder, keyholes, and liquid warp exist in the test panel only.
- **Tile shuffle:** one grid for every stage (`tileGrid`, starting at 8 × 8).
  - Tiles out of place = round(fraction × columns × rows).
  - On stages 1–2, some of those tiles are also rotated.
  - Tiles slide and turn back into place.
  - Which tiles move comes from the date seed.
- **Hidden tiles:** black squares on the same grid.
  - The visible set comes from the date seed.
  - It only grows: every tile visible at one stage stays visible at the next.
- **Ripple:** sine-wave displacement in both directions.
  - The settled stage is still; the waves move only during transitions.
  - The wave phase comes from the date seed.

**Tuning:** the test panel also gets an intensity slider for the current style and stage. Numbers get tuned by playing, then copied into `settings.json`. In family playtests, note which stage each person solves at. If most solve at stage 1–2, raise the difficulty.

`settings.json` holds `DAY_0`, `tileGrid`, every style's stage values, and the scoring numbers.

### Turn

- Each stage offers **Guess** or **Reveal**.
- One guess per stage. A wrong guess locks Guess until Reveal and costs the wrong-guess penalty.
- Reveal with no guess on that stage moves to the next stage and costs the skip penalty, which is less than a wrong guess. Reveal after a wrong guess does not also charge the skip.
- Empty or whitespace-only input does not use the guess. A guess that normalizes to empty does not use the guess either. The field accepts at most 48 characters, counted before normalization; further keystrokes do nothing.
- A correct guess ends the round as a win.
- A wrong guess or Reveal on stage 5 ends the round as a miss.
- Guess and Reveal are disabled while a transition plays.

### Timer

- Starts when the stage-1 image settles on screen after Play. Image loading and the intro transition don't count.
- Stops on a win or a miss.
- The countdown shows the live time bonus in points, from 1000 down to 0, falling by 5 per floored elapsed second. At 0 the bonus is gone and play continues. Variant `low` is when the bonus is greater than 0 and at most 200. Points available now is separate: the score a correct guess would get at this moment, `max(100, stageBase + timeBonus - skipPenalty - wrongPenalty)`, on the same one-second tick. The result countdown is hours and minutes until the next Pacific midnight (`H:MM:SS`), not the time bonus.

### Scoring

```text
stageBase    = [5000, 4000, 3000, 2000, 1000][stage - 1]
timeBonus    = max(0, 1000 - elapsedSeconds * 5)    // gone after 200s
skipPenalty  = skips * 200
wrongPenalty = wrongGuesses * 400
win          = max(100, stageBase + timeBonus - skipPenalty - wrongPenalty)
miss         = 0
```

`elapsedSeconds` is whole seconds, floored. The bonus drops by 5 once per second.

All numbers live in `content/settings.json`. The shape is locked.

---

## Answers

Each image has a list of accepted answers. A guess is correct when the full normalized guess is exactly equal to the full normalized form of one accepted answer. **Misspellings are wrong.**

Normalization, applied to the guess and every accepted answer:

- Lowercase
- Strip accents
- Delete apostrophes, leaving no space (`Peach's` and `Peachs` match)
- `&` → `and`
- Runs of non-alphanumeric characters → single space
- Trim
- Drop one leading whole word when that word is exactly `a`, `an`, or `the`. Do this once, after trim. `theatre`, `apple`, and `another` stay as they are. `the a team` becomes `a team`.

If the normalized guess is empty, do not consume the guess.

---

## Content files (instead of an admin page)

Everything you'd want to change without touching components lives in `content/`. Edit a file (on GitHub's website is fine), push, and Vercel redeploys in about a minute.

`content/images.json`: ordered. Index 0 is the image for `dayIndex` 0 (`#1`).

```json
[
  {
    "file": "k7f2q9.webp",
    "style": "tile-shuffle",
    "title": "Red telephone box",
    "accept": ["red telephone box", "telephone box", "phone box", "phone booth"]
  }
]
```

`content/copy.json`: every visible string.

```json
{
  "tagline": "One image a day. See it before everyone else does.",
  "howToPlay": ["...", "...", "...", "..."],
  "playButton": "Play",
  "winTitle": "You saw it",
  "missTitle": "Mislooked",
  "thanks": "Thanks for playing — come back tomorrow",
  "comingSoon": "Coming soon",
  "wrongGuess": "Wrong",
  "copied": "Copied",
  "imageLoading": "Loading today’s image",
  "imageError": "Today’s image didn’t load"
}
```

`content/settings.json`: `DAY_0`, `tileGrid`, every style's stage values, and the scoring numbers.

An image may also set `"focus": [0.5, 0.4]` to mark where the subject is. No current style reads it.

The current ten photos and their keyword lists are in `content/images.json`. `title` is what the result shows. `accept` is every guess that wins.

### Images

- Square crop, ~1200px, `.webp`, in `public/images/`
- One obvious subject; title of 1–3 words
- Random file names, so nobody can browse ahead by guessing `043.webp`
- Answers ship in the page code. Someone determined could find them. Accepted.

---

## Share

Prebuilt text, copied with one tap. No answer, no link.

Worked example, stage 2 win, 64 elapsed seconds, 0 wrong guesses: stageBase 4000 + timeBonus (1000 − 64×5 = 680) − 0 = 4680. Share time is elapsed time since the stage-1 settle, floored to whole seconds, formatted `m:ss`.

The result is words: the puzzle date, `WON` or `LOST`, the stage the round ended on, the score, and the elapsed time. No square row and no ✕.

```text
Mislook #12
October 29, 2026
WON · Stage 2 · 4,680 pts · 1:04
```

```text
Mislook #12
October 29, 2026
LOST · Stage 5 · 0 pts · 2:37
```

## Site stats

Always visible on every state (how to play, game, result): **total visits** and **unique visitors**, for example `12,481 visits · 3,207 visitors`. The numbers are there to show the site's traffic for portfolio and competition entries. Placement follows the Figma design; the line stays small and never competes with the image or the controls.

**How it works**

- **One route handler**, `app/api/stats/route.ts`. `POST` records a visit and returns the totals; `GET` only returns them.
- **Total visits:** one `INCR` per visit.
  - A visit is counted once per browser tab session, using a `sessionStorage` flag, so refreshes and Play don't inflate it.
- **Unique visitors:** on first visit the browser gets a random anonymous id in `localStorage`. The server adds it to a Redis HyperLogLog (`PFADD`), and the count comes from `PFCOUNT`.
  - Clearing storage or switching devices counts as a new visitor. Accepted.
- **Privacy:** no IP addresses, no personal data, no cookies, and no third-party trackers are stored. The anonymous id is not linked to anything.
- **Development:** visits from `localhost` and `?day` previews are not counted.
- **Display:** numbers are formatted with thousands separators. The line shows a dash while loading and is hidden if the request fails. Stats never block or slow the game.
- **Bots and abuse:** same-origin and user-agent checks, Vercel BotID, per-IP and daily limits, and CDN-cached reads (see `documents/security.md`). Counts are still approximate.

Optional later: "played today" and "% who saw it" from the same store.

## Link preview

When the site link is texted, the preview shows a **static branded card** (1200×630): the Mislook wordmark over an op-art background. It never shows the day's image, which would spoil it. Title: "Mislook — a daily image guessing game."

---

## Visual direction

**References:** the `reference/` folder. `moodboard-01.png` shows black-and-white op-art (spirals, concentric rings, checkerboards, stripes), a subject sliced and echoed into trailing copies, glitch blocks, and RGB fringing on edges.

The other references (warped and neon cityscapes, a black-and-white spiral dreamscape) are mostly about *subject matter*: they fit the V2 "guess the original" idea well. Two of them shape the v1 look:

- **Warped skyline:** buildings bending like waves, the Inception feel. A good model for the landing→game and stage transitions.
- **Black-and-white spiral dreamscape:** the closest match to the UI tone. Its radiating spiral is a strong candidate for the background and the "tunnel in" transition.

The bright neon and psychedelic colour in the others is **not** the app's palette.

**The tone is edgy, clean and dark, with very little colour.** Take the *geometry* from the references, not the clutter, with lots of black negative space. Do not draw floating eyes or spheres. Use spirals, rings, checkerboards, stripes, slices, and glitch blocks only.

- **Palette:** near-black base, off-white lines and type, a few greys. Colour is rare.
  - RGB fringing appears only for a moment during transitions.
  - One restrained accent for score and wins; one muted miss colour, always with text.
  - No gradients, no pastels, no neon.
- **Lines and edges:** hard, crisp, thin. Op-art patterns are precise, never noisy.
- **Background:** slow, living op-art (rotating spiral, drifting moiré or checkerboard warp). It calms down and dims during play so it never competes with the image.
- **Transitions:** stage reveals glitch, slice, swirl and chromatically split, then settle. Landing→game, and game→result, are a short fade.
- **Wordmark:** "Mislook" with a built-in distortion (slice offset, echo, or RGB split) that can animate on the landing.
- **Readability rule:** text always sits on a calm surface. Never put body text over moving op-art.

**Motion timings:**

- Landing → game: a short fade, about 0.4s.
- Stage reveal: 1s.
- Final reveal: 1s, denser than a stage reveal.
- Wrong guess: shake plus a brief RGB jitter, under 0.5s, together with the wrong-guess text.
- Guess and Reveal stay disabled for the whole transition.
- Score count-up plays on the result.

Motion tokens: fast = wrong guess, medium = landing, reveal = stage and final reveal. The background period is chosen in the storyboard and written next to those tokens.

### Safety and accessibility of the trippy look

- No flashing more than 3 times per second, and no full-screen high-contrast strobing (photosensitive seizure risk).
- `prefers-reduced-motion`: static background, no wordmark idle motion, transitions are crossfades, no score count-up.
- Visible label on the guess field; Guess and Reveal are real buttons; Enter submits.
- Stage changes and right/wrong are announced in an `aria-live` region.
- A wrong guess is text plus motion, never motion alone.
- The image canvas has a non-spoiling label: "Today's image, stage 2 of 5".
- Touch targets ≥ 44px; `dvh` layout.
- Performance: transitions hold a smooth frame rate on a mid-range phone; the background shader pauses when the tab is hidden.

---

## App shape

```text
app/
  layout.tsx                 # fonts, metadata, link preview
  page.tsx                   # how-to-play | game | result
  opengraph-image.png        # static preview card
components/
  HowToPlay.tsx
  game/Game.tsx
  game/MislookImage.tsx      # WebGL image: distortion styles + transitions
  game/GuessBar.tsx
  game/StageTrack.tsx
  game/Countdown.tsx
  result/Result.tsx
  fx/Background.tsx          # op-art shader background
  fx/Wordmark.tsx
  SiteStats.tsx              # visits · visitors line
app/api/stats/route.ts       # Redis INCR / PFADD / PFCOUNT
lib/
  normalize.ts
  score.ts
  reduce.ts
  daily.ts                   # Pacific date, day index, loop
  share.ts
  storage.ts
  stats.ts                   # visit + visitor counting (client side)
  gl/                        # shader helpers, canvas 2D fallback
content/
  images.json
  copy.json
  settings.json
public/images/
reference/moodboard-01.png
```

---

## Build order

Each step leaves the app runnable. Steps 1–2 wait for the Figma POC; step 3 can start now.

1. **Shell:** one page, how-to-play → game → result states, with dummy content from `content/`.
   *Done when:* Play doesn't change the URL; how to play, coming soon, game, and result all render on phone and desktop.
2. **Image and effects:** WebGL image with the three v1 styles (tile shuffle, hidden tiles, ripple) at five stages each, plus one trippy transition; Canvas 2D fallback with the same settled stages.
   *Done when:* each stage settles crisp; each style visibly gets easier every stage; the transition plays at a smooth frame rate on a phone; reduced motion crossfades.
3. **Rules:** `normalize`, `score`, `reduce`, `daily`, `share`, with tests.
   *Done when:* tests cover case, punctuation, leading "the", an accepted answer, a misspelling rejected, a win at each stage, the 100-point floor, the time bonus reaching zero, stage-5 miss and stage-5 reveal, midnight Pacific, the loop after the last image, and before `DAY_0`.
4. **Wire the game:** guess, reveal, timer, countdown, result.
   *Done when:* a full round plays end to end; double-clicking can't use two guesses; the timer doesn't count loading or the intro.
5. **Daily lock:** save today's result.
   *Done when:* a refresh after finishing shows the result and "come back tomorrow".
6. **Share, link preview and site stats.**
   *Done when:* pasted text has no answer; win and miss look different; a texted link shows the card; the stats line shows real numbers on every screen; a refresh doesn't add a visit; a failed stats request hides the line without affecting play.
7. **Background and polish:** op-art background, wordmark animation, keyboard and safe area, loading and error states, focus, live region.
   *Done when:* a short phone with the keyboard open is playable; a missing WebGL context uses the Canvas 2D path; a failed image request shows the error state and does not start the timer; nothing flashes faster than 3 per second.
8. **Real content:** swap the dummy images for the real list.

---

## Out of scope for v1

Accounts, any database beyond the visit counter, leaderboard, admin page, mid-round save, likeness matching, more than four distortion styles in rotation, stacked layers (option C), practice mode, sound, Three.js, image APIs, anti-cheat.

## Later

1. **V2 idea: "Guess the original."** The daily image is an AI-generated op-art or trippy reinterpretation of something famous: a painting, a landmark, a city. Players guess the original. This could become the main concept or a separate game mode, with the AI art itself as the distortion. Stick to public-domain paintings (for example *The Starry Night*, the *Mona Lisa*) and landmarks rather than modern copyrighted artworks.
2. Prototype stacked-layer distortion (option C); adopt it as a mode only if it plays well
3. More distortion styles from the list
4. Likeness matching for near-miss guesses
5. Leaderboard, then accounts, then server-checked scores
6. Sound
7. **Keyword difficulty meter.** Three settings, three keyword lists per photo. The meter chooses how specific a guess has to be. The broad list is today's `accept` array. See `documents/architecture.md`.

## Open items

| Item | Needed for | Owner |
| --- | --- | --- |
| Figma POC (see the Figma brief) | Build steps 1, 2, 7 | Figma |
| How-to-play, win and miss copy | `copy.json` | You (placeholders until then) |
| Real images, with accepted answers and a style for each | Build step 8 | Done for the first ten |
| Create the `mislook` repo and connect Vercel | Deploy | You |
| Add Upstash Redis from the Vercel dashboard (free tier) | Site stats | You |
