"use client"

import { useState } from "react"
import { STAGES } from "@/lib/content"
import {
  ALL_STYLES,
  type AnyStyleId,
  KNOBS,
  type StageView,
  STYLE_LABELS,
  styleValues,
  type Tuning,
} from "@/lib/gl/scene"

/** localStorage key remembering whether the panel is open (dev convenience only). */
const OPEN_KEY = "mislook:test-panel-open"

function readOpen() {
  try {
    return window.localStorage.getItem(OPEN_KEY) === "1"
  } catch {
    return false
  }
}

function writeOpen(open: boolean) {
  try {
    window.localStorage.setItem(OPEN_KEY, open ? "1" : "0")
  } catch {
    // Storage blocked: the panel just won't remember its state.
  }
}

const control = "grid grid-cols-[48px_1fr] items-center gap-1 mt-1"
const chip =
  "min-h-7 cursor-pointer border border-line bg-surface px-2 text-left text-micro text-ink hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"

/**
 * Distortion tuning panel. Cycling the image also switches which keywords a
 * guess must match. The timer, score, and daily lock stay on the real day.
 *
 * Collapsed to a small "TEST" tab on the left edge by default so it doesn't
 * cover the game; the open/closed state is remembered per browser.
 */
export default function TestPanel({
  imageIndex,
  imageCount,
  style,
  stage,
  tuning,
  onCycleImage,
  onStyle,
  onStage,
  onTune,
}: {
  imageIndex: number
  imageCount: number
  style: AnyStyleId
  stage: StageView
  tuning: Tuning
  onCycleImage: () => void
  onStyle: (style: AnyStyleId) => void
  onStage: (stage: StageView) => void
  onTune: (style: AnyStyleId, values: number[]) => void
}) {
  // Only rendered after Play on the client, so reading storage on first render is safe.
  const [open, setOpen] = useState(readOpen)
  const toggle = () => {
    setOpen(!open)
    writeOpen(!open)
  }
  const knob = KNOBS[style]
  const values = styleValues(style, tuning)[knob.key]
  const value = stage === 0 ? null : values[stage - 1]

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="test-panel"
        onClick={toggle}
        className="fixed top-1/2 left-0 z-50 -translate-y-1/2 cursor-pointer border border-l-0 border-ink/35 bg-bg/90 px-1 py-3 text-micro font-bold tracking-[0.18em] text-accent [writing-mode:vertical-rl] hover:text-ink"
      >
        {open ? "CLOSE" : "TEST"}
      </button>
      {open && (
        <aside
          id="test-panel"
          aria-label="Distortion test controls"
          className="fixed top-1/2 left-7 z-40 w-[230px] -translate-y-1/2 border border-ink/35 bg-bg/90 p-2 text-micro tracking-[0.08em] text-ink"
        >
          <strong className="mb-2 block tracking-[0.18em] text-accent">TEST</strong>
          <div className={control}>
            <span className="text-muted">Image</span>
            <button type="button" className={chip} onClick={onCycleImage}>
              {imageIndex + 1}/{imageCount}
            </button>
          </div>
          <div className={control}>
            <span className="text-muted">Style</span>
            <select
              className={`${chip} w-full`}
              value={style}
              onChange={(event) => onStyle(event.target.value as AnyStyleId)}
            >
              {ALL_STYLES.map((id) => (
                <option key={id} value={id}>
                  {STYLE_LABELS[id]}
                </option>
              ))}
            </select>
          </div>
          <div className={`${control} items-start`}>
            <span className="pt-1.5 text-muted">Stage</span>
            <div className="grid grid-cols-3 gap-0.5">
              {([1, 2, 3, 4, 5, 0] as StageView[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`${chip} text-center ${stage === s ? "border-accent text-accent" : ""}`}
                  onClick={() => onStage(s)}
                >
                  {s === 0 ? "Clear" : s}
                </button>
              ))}
            </div>
          </div>
          <label className="mt-1 grid grid-cols-[48px_1fr_36px] items-center gap-1">
            <span className="text-muted">Intensity</span>
            <input
              type="range"
              min={knob.min}
              max={knob.max}
              step={knob.step}
              value={value ?? knob.min}
              disabled={value === null}
              className="w-full accent-accent"
              onChange={(event) => {
                const next = [...values]
                next[stage - 1] = Number(event.target.value)
                onTune(style, next)
              }}
            />
            <output className="text-right tabular-nums">{value ?? "—"}</output>
          </label>
          <p className="mt-2 font-mono break-all text-muted select-all">
            {knob.key}: [{values.slice(0, STAGES).join(", ")}]
          </p>
        </aside>
      )}
    </>
  )
}
