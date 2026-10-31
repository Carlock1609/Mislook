"use client"

import { type ReactNode, useEffect, useState, useSyncExternalStore } from "react"
import type { ImageView } from "@/components/game/Game"
import MislookImage, { type ImageStatus } from "@/components/game/MislookImage"
import TopBar from "@/components/TopBar"
import { button, panel } from "@/components/ui"
import { copy, fill, STAGES, settings } from "@/lib/content"
import { formatHms, formatMss, nextZonedMidnight } from "@/lib/daily"
import type { RoundResult } from "@/lib/reduce"

export type { RoundResult }

const COUNT_UP_MS = 900

/** What the result button did. Only `"copied"` shows the toast. */
export type ShareOutcome = "shared" | "copied" | "failed"

function subscribeReducedMotion(onChange: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)")
  media.addEventListener("change", onChange)
  return () => media.removeEventListener("change", onChange)
}

function reducedMotionNow() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/** False during SSR, so the first paint matches the server. */
function useReducedMotion() {
  return useSyncExternalStore(subscribeReducedMotion, reducedMotionNow, () => false)
}

function subscribeShare() {
  return () => {}
}

/** False during SSR, so the button label doesn't mismatch on hydration. */
function useCanNativeShare() {
  return useSyncExternalStore(
    subscribeShare,
    () => typeof navigator.share === "function",
    () => false,
  )
}

/** Counts from 0 to `target` once `active` is true, with an ease-out. */
function useCountUp(target: number, ms: number, active: boolean) {
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (!active) return

    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / ms)
      const eased = 1 - (1 - progress) ** 3
      setValue(Math.round(eased * target))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [active, ms, target])

  return value
}

/** Hours, minutes and seconds until the next Pacific midnight, ticking every second. */
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

/** Result screen: the image resolves to clear, then the score, answer, share button and countdown. */
export default function Result({
  number,
  view,
  answer,
  result,
  onShare,
  stats,
}: {
  number: number
  /** The image as the round ended; the result resolves it to the clear image. */
  view: ImageView
  answer: string
  result: RoundResult
  onShare: () => Promise<ShareOutcome>
  stats: ReactNode
}) {
  const [copied, setCopied] = useState(false)
  const canNativeShare = useCanNativeShare()
  const reducedMotion = useReducedMotion()
  const [imageStatus, setImageStatus] = useState<ImageStatus>("loading")
  const [revealed, setRevealed] = useState(false)
  // Show the last stage first, then play the final reveal into the clear image.
  useEffect(() => {
    if (imageStatus !== "ready") return
    const id = window.setTimeout(() => setRevealed(true), 150)
    return () => window.clearTimeout(id)
  }, [imageStatus])
  const stage = revealed ? 0 : view.stage
  const countedScore = useCountUp(result.score, COUNT_UP_MS, revealed && !reducedMotion && result.score > 0)
  // Reduced motion and a miss show the final number. Otherwise it stays at 0 until the reveal.
  const shownScore = reducedMotion || result.score === 0 ? result.score : revealed ? countedScore : 0

  useEffect(() => {
    if (!copied) return
    const id = window.setTimeout(() => setCopied(false), 2200)
    return () => window.clearTimeout(id)
  }, [copied])

  const statCells = [
    [copy.resultScore, shownScore.toLocaleString("en-US")],
    [copy.resultStage, `${result.stage}/${STAGES}`],
    [copy.resultTime, formatMss(result.elapsedSeconds)],
    [copy.resultWrongGuesses, String(result.wrongGuesses)],
  ]

  return (
    <section className="mx-auto my-3 w-[calc(100%-24px)] md:my-4 md:w-[min(1180px,calc(100%-32px))]">
      <TopBar meta={`#${number}`} stats={stats} />

      <div className="pt-3 pb-6 md:grid md:min-h-[calc(100dvh-90px)] md:grid-cols-[minmax(0,1fr)_minmax(360px,0.72fr)] md:items-center md:gap-4 md:py-4">
        <div className="relative w-full md:w-[min(100%,560px)] md:justify-self-center">
          <MislookImage {...view} stage={stage} label={answer} status={imageStatus} onStatus={setImageStatus} />
          <span className="absolute right-3 bottom-3 z-20 bg-ink px-3 py-2 text-tiny font-bold uppercase tracking-[0.12em] text-bg">
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
              <div key={name} className="flex min-h-[76px] flex-col justify-center border-r border-b border-line p-3">
                <dt className="text-micro font-semibold uppercase tracking-[0.13em] text-muted">{name}</dt>
                <dd className="mt-1 font-display text-[22px] tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>

          <button
            type="button"
            className={button({ variant: "primary", wide: true })}
            onClick={async () => {
              if ((await onShare()) === "copied") setCopied(true)
            }}
          >
            <span>{canNativeShare ? copy.shareResult : copy.copyResult}</span>
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
