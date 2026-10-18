"use client"

import { STAGES } from "@/lib/content"
import { type AnyStyleId, KNOBS, type StageView, STYLE_LABELS, styleValues, type Tuning } from "@/lib/gl/scene"

const control = "grid grid-cols-[48px_1fr] items-center gap-1 mt-1"
const chip =
  "min-h-7 cursor-pointer border border-line bg-surface px-2 text-left text-micro text-ink hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"

/**
 * Development-only distortion tuning panel. It changes what the image shows,
 * never the round, timer, score or daily lock.
 */
export default function TestPanel({
  imageIndex,
  imageCount,
  style,
  stage,
  tuning,
  onCycleImage,
  onCycleStyle,
  onStage,
  onTune,
}: {
  imageIndex: number
  imageCount: number
  style: AnyStyleId
  stage: StageView
  tuning: Tuning
  onCycleImage: () => void
  onCycleStyle: () => void
  onStage: (stage: StageView) => void
  onTune: (style: AnyStyleId, values: number[]) => void
}) {
  const knob = KNOBS[style]
  const values = styleValues(style, tuning)[knob.key]
  const value = stage === 0 ? null : values[stage - 1]

  return (
    <aside
      aria-label="Distortion test controls"
      className="fixed top-3 left-3 z-40 w-[210px] border border-ink/35 bg-bg/80 p-2 text-micro tracking-[0.08em] text-ink"
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
        <button type="button" className={chip} onClick={onCycleStyle}>
          {STYLE_LABELS[style]}
        </button>
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
  )
}
