"use client"

import { motion, useReducedMotion } from "motion/react"
import type { ReactNode } from "react"
import Wordmark from "@/components/fx/Wordmark"
import { button, label, metaRow, panel } from "@/components/ui"
import { copy } from "@/lib/content"

/** Matches `--motion-panel`, `--motion-stagger`, and `--ease-out-expo`. */
const PANEL_S = 0.4
const STAGGER_S = 0.05
const EASE = [0.22, 1, 0.36, 1] as const

/** One landing row: a short fade and rise. Clicks are never blocked. */
function Rise({ delay, className, children }: { delay: number; className?: string; children: ReactNode }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className ? `landing-row ${className}` : "landing-row"}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : PANEL_S, delay: reduce ? 0 : delay, ease: EASE }}
    >
      {children}
    </motion.div>
  )
}

/** First screen: rules, Play, and the Coming soon state before `DAY_0`. */
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
  /** Before `DAY_0`: no puzzle yet, Play disabled. */
  comingSoon: boolean
  /** Today's puzzle is known, so Play can start. */
  ready: boolean
  onPlay: () => void
  /** Hidden element that warms the image cache before Play. */
  preload: ReactNode
  stats: ReactNode
}) {
  const reduce = useReducedMotion()
  const rulesStart = STAGGER_S * 2

  return (
    <motion.section
      className={`landing-panel ${panel} mx-auto my-[max(24px,7dvh)] w-[min(480px,calc(100%-32px))] p-[clamp(24px,6vw,48px)] shadow-[16px_16px_0_rgb(0_0_0/0.7)]`}
      initial={{ y: 12 }}
      animate={{ y: 0 }}
      transition={{ duration: reduce ? 0 : PANEL_S, ease: EASE }}
    >
      <Rise delay={0} className={metaRow}>
        <span>{copy.kicker}</span>
        {!comingSoon && <span className={number === null ? "invisible" : ""}>#{number ?? 0}</span>}
      </Rise>

      <Wordmark />

      <Rise delay={STAGGER_S}>
        <div className="mb-8 h-px bg-line" aria-hidden="true" />
        <p className={label}>{copy.eyebrow}</p>
        <p className="mt-3 mb-8 max-w-[370px] text-lead leading-normal">{copy.tagline}</p>
      </Rise>

      <ol className="mb-8 border-t border-line">
        {copy.howToPlay.map((line, index) => (
          <li key={line}>
            <Rise
              delay={rulesStart + index * STAGGER_S}
              className="flex gap-4 border-b border-line py-3 text-body tracking-[0.06em] text-muted"
            >
              <span className="text-ink tabular-nums">{String(index + 1).padStart(2, "0")}</span>
              {line}
            </Rise>
          </li>
        ))}
      </ol>

      <Rise delay={rulesStart + copy.howToPlay.length * STAGGER_S}>
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
      </Rise>
      {preload}
    </motion.section>
  )
}
