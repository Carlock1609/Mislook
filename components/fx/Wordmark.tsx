"use client"

import { motion, useReducedMotion } from "motion/react"
import { useState } from "react"

/** Matches `--motion-wordmark` and `--ease-out-expo` in `app/globals.css`. */
const ENTRANCE_S = 0.9
const EASE = [0.22, 1, 0.36, 1] as const

/** Horizontal bands. Each starts shifted and slides into the same line. */
const slices = [
  { clip: "inset(0 0 75% 0)", x: -18 },
  { clip: "inset(25% 0 50% 0)", x: 14 },
  { clip: "inset(50% 0 25% 0)", x: -10 },
  { clip: "inset(75% 0 0 0)", x: 16 },
] as const

/** The MISLOOK wordmark with its offset echo. `compact` is the top-bar size, with no entrance. */
export default function Wordmark({ compact = false }: { compact?: boolean }) {
  const reduce = useReducedMotion()
  const [settled, setSettled] = useState(compact)
  const entrance = { duration: reduce ? 0 : ENTRANCE_S, ease: EASE }

  if (compact) {
    return (
      <div
        role="img"
        aria-label="Mislook"
        className="relative isolate inline-block font-display text-[22px] leading-[0.82] tracking-[-0.06em]"
      >
        <span aria-hidden="true">MISLOOK</span>
        <span className="wordmark__echo" aria-hidden="true">
          MISLOOK
        </span>
      </div>
    )
  }

  return (
    <div
      role="img"
      aria-label="Mislook"
      className="relative isolate mt-10 mb-8 inline-block font-display text-[clamp(48px,13vw,76px)] leading-[0.82] tracking-[-0.075em]"
    >
      {/* Sizes the box while the slices animate; once settled it is the word itself, so no slice seams remain. */}
      <span className={settled ? undefined : "invisible"} aria-hidden="true">
        MISLOOK
      </span>
      {!settled && (
        <>
          <motion.span
            aria-hidden="true"
            className="landing-fringe absolute inset-0 block text-fringe-red"
            initial={{ x: -6, opacity: 1 }}
            animate={{ x: 0, opacity: 0 }}
            transition={entrance}
          >
            MISLOOK
          </motion.span>
          <motion.span
            aria-hidden="true"
            className="landing-fringe absolute inset-0 block text-fringe-blue"
            initial={{ x: 6, opacity: 1 }}
            animate={{ x: 0, opacity: 0 }}
            transition={entrance}
          >
            MISLOOK
          </motion.span>
          {slices.map((slice) => (
            <motion.span
              key={slice.clip}
              aria-hidden="true"
              className="landing-slice absolute inset-0 z-[1] block"
              style={{ clipPath: slice.clip }}
              initial={{ x: slice.x }}
              animate={{ x: 0 }}
              transition={entrance}
            >
              MISLOOK
            </motion.span>
          ))}
        </>
      )}
      <motion.span
        aria-hidden="true"
        className={settled ? "landing-echo wordmark__echo" : "landing-echo wordmark__echo wordmark__echo--hold"}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.75 }}
        transition={entrance}
        onAnimationComplete={() => setSettled(true)}
      >
        MISLOOK
      </motion.span>
    </div>
  )
}
