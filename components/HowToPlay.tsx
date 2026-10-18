import type { ReactNode } from "react"
import Wordmark from "@/components/fx/Wordmark"
import { button, label, metaRow, panel } from "@/components/ui"
import { copy } from "@/lib/content"

export default function HowToPlay({
  number,
  comingSoon,
  ready,
  onPlay,
  preload,
  stats,
}: {
  /** Today's puzzle number, or null while it is still being worked out. */
  number: number | null
  comingSoon: boolean
  ready: boolean
  onPlay: () => void
  preload: ReactNode
  stats: ReactNode
}) {
  return (
    <section
      className={`${panel} mx-auto my-[max(24px,7dvh)] w-[min(480px,calc(100%-32px))] p-[clamp(24px,6vw,48px)] shadow-[16px_16px_0_rgb(0_0_0/0.7)]`}
    >
      <div className={metaRow}>
        <span>{copy.kicker}</span>
        {!comingSoon && <span className={number === null ? "invisible" : ""}>#{number ?? 0}</span>}
      </div>

      <Wordmark />
      <div className="mb-8 h-px bg-line" aria-hidden="true" />

      <p className={label}>{copy.eyebrow}</p>
      <p className="mt-3 mb-8 max-w-[370px] text-lead leading-normal">{copy.tagline}</p>

      <ol className="mb-8 border-t border-line">
        {copy.howToPlay.map((line, index) => (
          <li
            key={line}
            className="flex gap-4 border-b border-line py-3 text-body tracking-[0.06em] text-muted"
          >
            <span className="text-ink tabular-nums">{String(index + 1).padStart(2, "0")}</span>
            {line}
          </li>
        ))}
      </ol>

      <button
        type="button"
        className={button({ variant: "primary", wide: true })}
        disabled={comingSoon || !ready}
        onClick={onPlay}
      >
        <span>{copy.playButton}</span>
        <span aria-hidden="true">↗</span>
      </button>

      {comingSoon && (
        <p className="mt-4 text-center text-tiny uppercase tracking-[0.08em] text-muted">{copy.comingSoon}</p>
      )}
      <div className="mt-2 text-center">{stats}</div>
      {preload}
    </section>
  )
}
