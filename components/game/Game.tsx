"use client"

import type { ReactNode } from "react"
import Countdown from "@/components/game/Countdown"
import GuessBar from "@/components/game/GuessBar"
import MislookImage, { type ImageStatus } from "@/components/game/MislookImage"
import StageTrack from "@/components/game/StageTrack"
import TopBar from "@/components/TopBar"
import { label, panel } from "@/components/ui"
import { copy, STAGES } from "@/lib/content"

export default function Game({
  number,
  imageSrc,
  stage,
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
}: {
  number: number
  imageSrc: string
  stage: number
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
}) {
  return (
    <section className="mx-auto my-3 w-[calc(100%-24px)] md:my-4 md:w-[min(1180px,calc(100%-32px))]">
      <TopBar meta={`#${number}`} stats={stats} />

      <div className="pt-3 pb-60 md:grid md:min-h-[calc(100dvh-90px)] md:grid-cols-[minmax(0,1.4fr)_minmax(340px,0.8fr)] md:items-center md:gap-4 md:py-4">
        <div className="w-full md:w-[min(100%,560px)] md:justify-self-center">
          <MislookImage
            src={imageSrc}
            stage={stage}
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
