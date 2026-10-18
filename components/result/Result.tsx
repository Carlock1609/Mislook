"use client"

import { type ReactNode, useEffect, useState } from "react"
import TopBar from "@/components/TopBar"
import { button, panel } from "@/components/ui"
import { copy, fill, STAGES, settings } from "@/lib/content"
import { formatHms, formatMss, nextZonedMidnight } from "@/lib/daily"

export type RoundResult = {
  won: boolean
  stage: number
  score: number
  elapsedSeconds: number
  wrongGuesses: number
}

function NextImageCountdown() {
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    const tick = () => setNow(Date.now())
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <strong className="font-display text-[26px] font-normal text-accent tabular-nums">
      {now === null ? "—" : formatHms(nextZonedMidnight(now, settings.timeZone) - now)}
    </strong>
  )
}

export default function Result({
  number,
  imageSrc,
  answer,
  result,
  onCopy,
  stats,
}: {
  number: number
  imageSrc: string
  answer: string
  result: RoundResult
  onCopy: () => Promise<boolean>
  stats: ReactNode
}) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const id = window.setTimeout(() => setCopied(false), 2200)
    return () => window.clearTimeout(id)
  }, [copied])

  const statCells = [
    [copy.resultScore, result.score.toLocaleString("en-US")],
    [copy.resultStage, `${result.stage}/${STAGES}`],
    [copy.resultTime, formatMss(result.elapsedSeconds)],
    [copy.resultWrongGuesses, String(result.wrongGuesses)],
  ]

  return (
    <section className="mx-auto my-3 w-[calc(100%-24px)] md:my-4 md:w-[min(1180px,calc(100%-32px))]">
      <TopBar meta={`#${number}`} stats={stats} />

      <div className="pt-3 pb-6 md:grid md:min-h-[calc(100dvh-90px)] md:grid-cols-[minmax(0,1fr)_minmax(360px,0.72fr)] md:items-center md:gap-4 md:py-4">
        <div className="relative aspect-square w-full overflow-hidden border border-line md:w-[min(100%,560px)] md:justify-self-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- same source as the WebGL canvas */}
          <img src={imageSrc} alt={answer} className="absolute inset-0 size-full animate-final-reveal object-cover" />
          <span className="absolute right-3 bottom-3 bg-ink px-3 py-2 text-tiny font-bold uppercase tracking-[0.12em] text-bg">
            {answer}
          </span>
        </div>

        <div className={`${panel} mt-3 p-5 md:mt-0 md:p-[clamp(24px,4vw,44px)]`}>
          <h1
            className={`mt-0 mb-2 font-display text-[42px] leading-[0.95] font-normal tracking-[-0.055em] md:text-[clamp(42px,5vw,68px)] ${
              result.won ? "text-accent" : "text-miss"
            }`}
          >
            {result.won ? copy.winTitle : copy.missTitle}
          </h1>
          <p className="mt-0 mb-8 leading-normal text-muted">
            {result.won ? fill(copy.winSummary, { stage: result.stage }) : copy.missSummary}
          </p>

          <dl className="mb-6 grid grid-cols-2 border-t border-l border-line">
            {statCells.map(([name, value]) => (
              <div
                key={name}
                className="flex min-h-[76px] flex-col justify-center border-r border-b border-line p-3"
              >
                <dt className="text-micro font-semibold uppercase tracking-[0.13em] text-muted">{name}</dt>
                <dd className="mt-1 font-display text-[22px] tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>

          <button
            type="button"
            className={button({ variant: "primary", wide: true })}
            onClick={async () => setCopied(await onCopy())}
          >
            <span>{copy.copyResult}</span>
            <span aria-hidden="true">↗</span>
          </button>

          <div className="mt-8 grid justify-items-center gap-1 text-center">
            <span className="text-micro font-semibold uppercase tracking-[0.13em] text-muted">{copy.thanks}</span>
            <NextImageCountdown />
            <span className="text-micro font-semibold uppercase tracking-[0.13em] text-muted">{copy.nextImage}</span>
          </div>
        </div>
      </div>

      {copied && (
        <div
          role="status"
          className="fixed inset-x-3 top-[68px] z-30 animate-toast-in border border-accent bg-surface px-5 py-4 text-center text-label font-bold uppercase tracking-[0.12em] text-accent md:inset-x-auto md:top-auto md:right-6 md:bottom-6"
        >
          {copy.copied}
        </div>
      )}
    </section>
  )
}
