# The TEST panel

`components/dev/TestPanel.tsx`, rendered by `components/Mislook.tsx` on the game
screen **only when `NODE_ENV` is `development`**. It changes what the image shows,
never the round, timer, score or daily lock.

## Opening it

A small vertical **TEST** tab sits on the left edge of the game screen. Click it to
open the panel; click **CLOSE** to hide it. It starts closed, and the browser
remembers the last state (`localStorage` key `mislook:test-panel-open`).

## Controls

| Control | What it does |
| --- | --- |
| **Image** | Cycles through `images.json` |
| **Style** | Picks any style from one list |
| **Stage** | Jumps to stage 1–5 or the clear image; changing stage plays the real transition |
| **Intensity** | Live-tunes the style's knob for the current stage (disabled on Clear) |
| Values line | The knob's five current values, ready to copy into `settings.json` |

The overrides live in `testView` and `tuning` state in `Mislook.tsx`, so they reset
on reload. Pressing Reveal in the game clears the stage override.

## Tuning workflow

1. Run `npm run dev` and press Play.
2. Open the panel, pick a style, and step through stages 1 → 5 → Clear.
3. Drag Intensity until each stage feels right; repeat across several images.
4. Copy the values line into `content/settings.json` under `styles.<id>.<knob>`.
