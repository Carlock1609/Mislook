import type { CSSProperties } from "react"
import { label } from "@/components/ui"
import { copy, settings } from "@/lib/content"

/** Live time bonus: running, low (0 < bonus ≤ threshold) or zero. */
export default function Countdown({ bonus }: { bonus: number }) {
  const { timeBonusMax, lowBonusThreshold } = settings.scoring
  const variant = bonus === 0 ? "zero" : bonus <= lowBonusThreshold ? "low" : "running"
  const ringColor = { running: "var(--color-accent)", low: "var(--color-miss)", zero: "var(--color-line)" }[variant]
  const numberColor = { running: "text-ink", low: "text-miss", zero: "text-muted" }[variant]

  return (
    <div className="flex items-center justify-between border-b border-line py-4 md:py-6">
      <div>
        <p className={label}>{copy.timeBonusLabel}</p>
        <strong className={`mt-1 block font-display text-[25px] font-normal tabular-nums ${numberColor}`}>
          +{bonus}
        </strong>
      </div>
      <div
        className="bonus-ring aspect-square w-[42px] rounded-full p-[3px] transition-[background] duration-1000 ease-linear"
        style={
          {
            "--bonus-progress": `${(bonus / timeBonusMax) * 100}%`,
            "--ring-color": ringColor,
          } as CSSProperties
        }
        aria-hidden="true"
      >
        <span className="block size-full rounded-full bg-surface" />
      </div>
    </div>
  )
}
