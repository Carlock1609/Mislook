"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import TestPanel from "@/components/dev/TestPanel"
import Background from "@/components/fx/Background"
import Game, { type ImageView } from "@/components/game/Game"
import type { ImageStatus } from "@/components/game/MislookImage"
import HowToPlay from "@/components/HowToPlay"
import Result, { type RoundResult } from "@/components/result/Result"
import SiteStats, { type Stats } from "@/components/SiteStats"
import { imageSrc, images, type PuzzleImage, STAGES, settings } from "@/lib/content"
import { dayIndexFor, imageIndexFor } from "@/lib/daily"
import { loadStats } from "@/lib/stats"
import { type AnyStyleId, KNOBS, type StageView, type Tuning } from "@/lib/gl/scene"

/** Today, as the client works it out: before `DAY_0`, or the puzzle number and image. */
type Day =
  | { comingSoon: true }
  | { comingSoon: false; number: number; imageIndex: number; image: PuzzleImage }

// Resolved once on the client: the page is static, so the date can't come from the server.
let resolvedDay: Day | undefined
/** Today's day (cached). In development `?day=N` previews puzzle number N. */
function getDay(): Day {
  if (resolvedDay) return resolvedDay
  let dayIndex = dayIndexFor(Date.now(), settings.DAY_0, settings.timeZone)
  if (process.env.NODE_ENV === "development") {
    const param = new URLSearchParams(window.location.search).get("day")
    if (param !== null && /^-?\d+$/.test(param)) dayIndex = Number(param) - 1
  }
  resolvedDay =
    dayIndex < 0
      ? { comingSoon: true }
      : {
          comingSoon: false,
          number: dayIndex + 1,
          imageIndex: imageIndexFor(dayIndex, images.length),
          image: images[imageIndexFor(dayIndex, images.length)],
        }
  return resolvedDay
}
/** useSyncExternalStore subscriber for a value that never changes after load. */
const noSubscribe = () => () => {}

/** Which screen is showing. Play never changes the URL. */
type Phase = "howToPlay" | "game" | "result"

const SHOW_TEST_PANEL = process.env.NODE_ENV === "development"

/** Dev test panel overrides: display only, never the round itself. */
type TestView = { imageIndex?: number; style?: AnyStyleId; stage?: StageView }

/**
 * The whole app: picks today's puzzle, holds the round state, and switches
 * between How to play, Game and Result.
 */
export default function Mislook() {
  const day = useSyncExternalStore(noSubscribe, getDay, () => null)
  const [phase, setPhase] = useState<Phase>("howToPlay")
  const [tunneling, setTunneling] = useState(false)
  const [imageStatus, setImageStatus] = useState<ImageStatus>("loading")

  // Round state. Build step 1 wiring only: real rules, timer and scoring arrive in steps 3–4.
  const [stage, setStage] = useState(1)
  const [locked, setLocked] = useState(false)
  const [wrongGuesses, setWrongGuesses] = useState(0)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<RoundResult | null>(null)
  const [testView, setTestView] = useState<TestView>({})
  const [tuning, setTuning] = useState<Tuning>({})
  // undefined while loading (shows a dash), null if the request failed (line hidden).
  const [siteStats, setSiteStats] = useState<Stats | null | undefined>(undefined)
  const startedAt = useRef(0)
  const timers = useRef<number[]>([])

  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), [])
  useEffect(() => {
    let cancelled = false
    loadStats().then((s) => !cancelled && setSiteStats(s))
    return () => {
      cancelled = true
    }
  }, [])
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms))

  const stats = <SiteStats stats={siteStats} />
  const puzzle = day && !day.comingSoon ? day : null
  const shownImageIndex = testView.imageIndex ?? (puzzle ? puzzle.imageIndex : 0)
  const shownImage = images[shownImageIndex]
  const view = (shownStage: StageView): ImageView => ({
    src: imageSrc(shownImage),
    style: testView.style ?? shownImage.style,
    stage: shownStage,
    seed: `mislook-${puzzle?.number ?? 0}`,
    focus: shownImage.focus,
    tuning,
  })
  const bonus = settings.scoring.timeBonusMax
  const points = Math.max(
    settings.scoring.winFloor,
    settings.scoring.stageBase[stage - 1] + bonus - wrongGuesses * settings.scoring.wrongPenalty,
  )

  /** Plays the tunnel transition, then starts the round (the timer starts when the game shows). */
  const play = () => {
    setTunneling(true)
    later(() => {
      startedAt.current = Date.now()
      setPhase("game")
    }, 500)
    later(() => setTunneling(false), 1000)
  }

  /** Ends the round after the 1s reveal and shows the result. */
  const finish = (won: boolean) => {
    setBusy(true)
    later(() => {
      setResult({
        won,
        stage,
        score: won ? points : 0,
        elapsedSeconds: Math.floor((Date.now() - startedAt.current) / 1000),
        wrongGuesses,
      })
      setPhase("result")
      setBusy(false)
    }, 1000)
  }

  /** Checks a guess: a match wins, a miss locks Guess and costs the wrong-guess penalty. */
  const guess = (text: string) => {
    if (!puzzle || busy || locked) return
    if (puzzle.image.accept.includes(text.trim().toLowerCase())) {
      finish(true)
    } else {
      setLocked(true)
      setWrongGuesses((n) => n + 1)
    }
  }

  /** Moves to the next stage, or ends the round as a miss on stage 5. */
  const reveal = () => {
    if (busy) return
    if (stage === STAGES) return finish(false)
    setBusy(true)
    setTestView((t) => ({ ...t, stage: undefined }))
    setStage((s) => s + 1)
    setLocked(false)
    later(() => setBusy(false), 1000)
  }

  /** Copies spoiler-free share text to the clipboard. Resolves false if the clipboard is blocked. */
  const copyResult = async () => {
    if (!puzzle || !result) return false
    const squares = "■".repeat(result.stage) + "□".repeat(STAGES - result.stage)
    const seconds = result.elapsedSeconds
    const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
    const text = result.won
      ? `Mislook #${puzzle.number}\nStage ${result.stage} · ${result.score.toLocaleString("en-US")} pts · ${time}\n${squares}`
      : `Mislook #${puzzle.number}\nMislooked · 0 pts · ${time}\n${squares} ✕`
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      return false
    }
  }

  return (
    <main className="relative isolate min-h-dvh overflow-x-hidden">
      <Background dim={phase === "game"} />

      {phase === "howToPlay" && (
        <HowToPlay
          number={puzzle?.number ?? null}
          comingSoon={day?.comingSoon ?? false}
          ready={puzzle !== null}
          onPlay={play}
          stats={stats}
          preload={
            puzzle && (
              // eslint-disable-next-line @next/next/no-img-element -- warms the cache for the game image
              <img
                src={imageSrc(puzzle.image)}
                alt=""
                aria-hidden="true"
                className="hidden"
                onLoad={() => setImageStatus("ready")}
                onError={() => setImageStatus("error")}
              />
            )
          }
        />
      )}

      {phase === "game" && puzzle && (
        <Game
          number={puzzle.number}
          view={view(testView.stage ?? (stage as StageView))}
          stage={stage}
          points={points}
          bonus={bonus}
          locked={locked}
          busy={busy}
          wrongCount={wrongGuesses}
          imageStatus={imageStatus}
          onImageStatus={setImageStatus}
          onGuess={guess}
          onReveal={reveal}
          stats={stats}
          testPanel={
            SHOW_TEST_PANEL && (
              <TestPanel
                imageIndex={shownImageIndex}
                imageCount={images.length}
                style={testView.style ?? shownImage.style}
                stage={testView.stage ?? (stage as StageView)}
                tuning={tuning}
                onCycleImage={() => setTestView((t) => ({ ...t, imageIndex: (shownImageIndex + 1) % images.length }))}
                onStyle={(style) => setTestView((t) => ({ ...t, style }))}
                onStage={(s) => setTestView((t) => ({ ...t, stage: s }))}
                onTune={(style, values) =>
                  setTuning((t) => ({ ...t, [style]: { ...t[style], [KNOBS[style].key]: values } }))
                }
              />
            )
          }
        />
      )}

      {phase === "result" && puzzle && result && (
        <Result
          number={puzzle.number}
          view={view(result.stage as StageView)}
          answer={shownImage.title}
          result={result}
          onCopy={copyResult}
          stats={stats}
        />
      )}

      {tunneling && <div className="play-tunnel" aria-hidden="true" />}
    </main>
  )
}
