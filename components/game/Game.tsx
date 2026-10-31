"use client"

import { type ReactNode, useEffect, useRef, useState } from "react"
import Countdown from "@/components/game/Countdown"
import GuessBar from "@/components/game/GuessBar"
import MislookImage, { type ImageStatus } from "@/components/game/MislookImage"
import StageTrack from "@/components/game/StageTrack"
import TopBar from "@/components/TopBar"
import { label, panel } from "@/components/ui"
import { copy, fill, STAGES } from "@/lib/content"
import type { AnyStyleId, StageView, Tuning } from "@/lib/gl/scene"
import type { RoundStatus } from "@/lib/reduce"

/** What the image shows. Normally the round's own image and stage; the dev test panel can override it. */
export type ImageView = {
  src: string
  style: AnyStyleId
  stage: StageView
  seed: string
  focus?: [number, number]
  tuning?: Tuning
}

/**
 * Polite announcements for the game screen. The first values are the starting
 * stage, so they are not read. The clock is not an input, so ticks stay quiet.
 * A repeated wrong guess changes the text (zero-width spaces) so it is read again.
 */
function useGameAnnouncement(stage: number, wrongCount: number, status: RoundStatus) {
  const [announcement, setAnnouncement] = useState("")
  const seen = useRef<{ stage: number; wrongs: number; status: RoundStatus } | null>(null)

  useEffect(() => {
    if (seen.current === null) {
      seen.current = { stage, wrongs: wrongCount, status }
      return
    }
    const previous = seen.current
    seen.current = { stage, wrongs: wrongCount, status }

    if (status === "won" && previous.status !== "won") {
      setAnnouncement(copy.winTitle)
      return
    }
    if (status === "missed" && previous.status !== "missed") {
      setAnnouncement(copy.missTitle)
      return
    }
    if (wrongCount !== previous.wrongs) {
      setAnnouncement(`${copy.announceWrong}${"\u200B".repeat(wrongCount)}`)
      return
    }
    if (stage !== previous.stage) {
      setAnnouncement(fill(copy.announceStage, { stage, stages: STAGES }))
    }
  }, [stage, wrongCount, status])

  return announcement
}

/** The game screen: the image, stage track, points, time bonus, and the guess bar. */
export default function Game({
  number,
  view,
  stage,
  status,
  points,
  bonus,
  locked,
  busy,
  wrongCount,
  imageStatus,
  onImageStatus,
  onGuess,
  onReveal,
  stats,
  testPanel,
}: {
  number: number
  view: ImageView
  stage: number
  status: RoundStatus
  points: number
  bonus: number
  locked: boolean
  busy: boolean
  wrongCount: number
  imageStatus: ImageStatus
  onImageStatus: (status: ImageStatus) => void
  onGuess: (guess: string) => void
  onReveal: () => void
  stats: ReactNode
  /** Development-only distortion test panel. */
  testPanel?: ReactNode
}) {
  const announcement = useGameAnnouncement(stage, wrongCount, status)

  return (
    <section className="mx-auto my-3 w-[calc(100%-24px)] md:my-4 md:w-[min(1180px,calc(100%-32px))]">
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {testPanel}
      <TopBar meta={`#${number}`} stats={stats} />

      <div className="pt-3 pb-60 md:grid md:min-h-[calc(100dvh-90px)] md:grid-cols-[minmax(0,1.4fr)_minmax(340px,0.8fr)] md:items-center md:gap-4 md:py-4">
        <div className="w-full md:w-[min(100%,560px)] md:justify-self-center">
          <MislookImage
            {...view}
            label={`Today's image, stage ${stage} of ${STAGES}`}
            revealing={busy}
            status={imageStatus}
            onStatus={onImageStatus}
          />
          <div className="flex justify-end pt-3 text-label font-semibold uppercase tracking-[0.14em] text-muted">
            {copy.resultStage} {String(stage).padStart(2, "0")} / {String(STAGES).padStart(2, "0")}
          </div>
        </div>

        <aside className={`${panel} mt-3 p-4 pb-0 min-[381px]:p-5 min-[381px]:pb-0 md:mt-0 md:p-6`}>
          <div className="flex items-start justify-between border-b border-line pb-5 md:pb-6">
            <div>
              <p className={label}>{copy.stageLabel}</p>
              <StageTrack stage={stage} />
            </div>
            <div className="text-right">
              <p className={label}>{copy.pointsLabel}</p>
              <strong className="font-display text-[27px] font-normal text-accent tabular-nums">
                {points.toLocaleString("en-US")}
              </strong>
              <span className="text-micro uppercase text-muted"> {copy.pointsUnit}</span>
            </div>
          </div>

          <Countdown bonus={bonus} />

          <div className="fixed inset-x-3 bottom-0 z-20 border border-b-0 border-line bg-surface px-5 pb-[max(20px,env(safe-area-inset-bottom))] shadow-[0_-12px_20px_var(--color-surface)] md:static md:z-auto md:border-0 md:bg-transparent md:px-0 md:pb-6 md:shadow-none">
            <GuessBar
              locked={locked}
              busy={busy}
              lastStage={stage === STAGES}
              wrongCount={wrongCount}
              onGuess={onGuess}
              onReveal={onReveal}
            />
          </div>
        </aside>
      </div>
    </section>
  )
}
