"use client"

import { useEffect, useReducer, useRef, useState, useSyncExternalStore } from "react"
import TestPanel from "@/components/dev/TestPanel"
import Background from "@/components/fx/Background"
import Game, { type ImageView } from "@/components/game/Game"
import type { ImageStatus } from "@/components/game/MislookImage"
import HowToPlay from "@/components/HowToPlay"
import Result from "@/components/result/Result"
import SiteStats, { type Stats } from "@/components/SiteStats"
import { imageSrc, images, type PuzzleImage, settings } from "@/lib/content"
import { dateForDayIndex, dayIndexFor, imageIndexFor } from "@/lib/daily"
import { TRANSITION_MS } from "@/lib/gl/renderer"
import { type AnyStyleId, KNOBS, type StageView, type Tuning } from "@/lib/gl/scene"
import { initialRound, reduceRound, type RoundResult, roundElapsed, roundResult } from "@/lib/reduce"
import { pointsAvailable, timeBonus } from "@/lib/score"
import { shareText } from "@/lib/share"
import { loadDayResult, saveDayResult } from "@/lib/storage"
import { loadStats } from "@/lib/stats"

/** Today, as the client works it out: before `DAY_0`, or the puzzle number and image. */
type Day =
  | { comingSoon: true }
  | { comingSoon: false; number: number; date: string; imageIndex: number; image: PuzzleImage; preview: boolean }

// Resolved once on the client: the page is static, so the date can't come from the server.
let resolvedDay: Day | undefined
/** Today's day (cached). In development `?day=N` previews puzzle number N. */
function getDay(): Day {
  if (resolvedDay) return resolvedDay
  let dayIndex = dayIndexFor(Date.now(), settings.DAY_0, settings.timeZone)
  let preview = false
  if (process.env.NODE_ENV === "development") {
    const param = new URLSearchParams(window.location.search).get("day")
    if (param !== null && /^-?\d+$/.test(param)) {
      dayIndex = Number(param) - 1
      preview = true
    }
  }
  resolvedDay =
    dayIndex < 0
      ? { comingSoon: true }
      : {
          comingSoon: false,
          number: dayIndex + 1,
          date: dateForDayIndex(dayIndex, settings.DAY_0),
          imageIndex: imageIndexFor(dayIndex, images.length),
          image: images[imageIndexFor(dayIndex, images.length)],
          preview,
        }
  return resolvedDay
}

// Cached like `resolvedDay`: getSnapshot must return the same reference each call.
let restoredResult: RoundResult | null | undefined
/** Finished result for today's date, if the daily lock has one. Skips `?day=` previews. */
function getRestoredResult(): RoundResult | null {
  if (restoredResult !== undefined) return restoredResult
  const day = getDay()
  restoredResult = day.comingSoon || day.preview ? null : loadDayResult(day.date)
  return restoredResult
}

/** useSyncExternalStore subscriber for a value that never changes after load. */
const noSubscribe = () => () => {}

/** Which screen is showing. Play never changes the URL. */
type Phase = "howToPlay" | "game" | "result"

const SHOW_TEST_PANEL = process.env.NODE_ENV === "development"
/** Landing → game tunnel: mid-point swaps the screen; full length matches the brief. */
const TUNNEL_SWAP_MS = 500
const TUNNEL_MS = 1000

/** Dev test panel overrides: display only, never the round itself. */
type TestView = { imageIndex?: number; style?: AnyStyleId; stage?: StageView }

/**
 * The whole app: picks today's puzzle, holds the round state, and switches
 * between How to play, Game and Result.
 */
export default function Mislook() {
  const day = useSyncExternalStore(noSubscribe, getDay, () => null)
  const restored = useSyncExternalStore(noSubscribe, getRestoredResult, () => null)
  const [phase, setPhase] = useState<Phase>("howToPlay")
  const [tunneling, setTunneling] = useState(false)
  const [imageStatus, setImageStatus] = useState<ImageStatus>("loading")
  const [round, dispatch] = useReducer(reduceRound, initialRound)
  // null until the client interval runs — avoids Date.now() during prerender.
  const [now, setNow] = useState<number | null>(null)
  const [testView, setTestView] = useState<TestView>({})
  const [tuning, setTuning] = useState<Tuning>({})
  // undefined while loading (shows a dash), null if the request failed (line hidden).
  const [siteStats, setSiteStats] = useState<Stats | null | undefined>(undefined)
  const timers = useRef<number[]>([])
  const savedRef = useRef(false)

  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), [])
  useEffect(() => {
    let cancelled = false
    loadStats().then((s) => !cancelled && setSiteStats(s))
    return () => {
      cancelled = true
    }
  }, [])

  // Live clock for the time bonus and points-available, once per second while playing.
  useEffect(() => {
    if (round.status !== "playing" || round.startedAt === null) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [round.status, round.startedAt])

  // Timer starts when stage 1 has settled: game visible, tunnel done, image ready.
  // A failed image never starts the round.
  useEffect(() => {
    if (phase !== "game" || tunneling || imageStatus !== "ready") return
    if (round.status !== "ready") return
    dispatch({ type: "start", now: Date.now() })
  }, [phase, tunneling, imageStatus, round.status])

  // After a stage Reveal, unlock Guess/Reveal when the transition ends.
  useEffect(() => {
    if (!round.busy || round.status !== "playing") return
    const id = window.setTimeout(() => dispatch({ type: "settled" }), TRANSITION_MS)
    return () => window.clearTimeout(id)
  }, [round.busy, round.status, round.stage])

  // After a win or miss, save the lock (unless preview) and show Result.
  useEffect(() => {
    if (round.status !== "won" && round.status !== "missed") return
    const finished = roundResult(round, settings.scoring)
    if (finished && day && !day.comingSoon && !day.preview && !savedRef.current) {
      saveDayResult(day.date, finished)
      savedRef.current = true
    }
    const id = window.setTimeout(() => setPhase("result"), TRANSITION_MS)
    return () => window.clearTimeout(id)
    // Only re-run when the round ends; `round` / `day` are read for the save payload.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: status is the trigger
  }, [round.status])

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

  const clock = now ?? round.startedAt ?? 0
  const elapsed = roundElapsed(round, clock)
  const points = pointsAvailable(round.stage, elapsed, round.wrongGuesses, settings.scoring)
  const bonus = timeBonus(elapsed, settings.scoring)
  const liveResult = roundResult(round, settings.scoring)
  const result = liveResult ?? restored
  // A refresh after finishing jumps straight to Result via the daily lock.
  const screen: Phase = phase === "howToPlay" && restored ? "result" : phase
  const controlsBusy =
    round.busy || round.status === "ready" || round.status === "won" || round.status === "missed"

  /** Plays the tunnel transition, then shows the game. The timer starts after stage 1 settles. */
  const play = () => {
    setTunneling(true)
    later(() => setPhase("game"), TUNNEL_SWAP_MS)
    later(() => setTunneling(false), TUNNEL_MS)
  }

  /** Checks a guess: a match wins, a miss locks Guess and costs the wrong-guess penalty. */
  const guess = (text: string) => {
    if (!puzzle) return
    dispatch({ type: "guess", text, accept: puzzle.image.accept, now: Date.now() })
  }

  /** Moves to the next stage, or ends the round as a miss on stage 5. */
  const reveal = () => {
    setTestView((t) => ({ ...t, stage: undefined }))
    dispatch({ type: "reveal", now: Date.now() })
  }

  /** Copies spoiler-free share text to the clipboard. Resolves false if the clipboard is blocked. */
  const copyResult = async () => {
    if (!puzzle || !result) return false
    try {
      await navigator.clipboard.writeText(shareText(puzzle.number, result))
      return true
    } catch {
      return false
    }
  }

  return (
    <main className="relative isolate min-h-dvh overflow-x-hidden">
      <Background dim={screen === "game"} />

      {screen === "howToPlay" && (
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

      {screen === "game" && puzzle && (
        <Game
          number={puzzle.number}
          view={view(testView.stage ?? (round.stage as StageView))}
          stage={round.stage}
          points={points}
          bonus={bonus}
          locked={round.locked}
          busy={controlsBusy}
          wrongCount={round.wrongGuesses}
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
                stage={testView.stage ?? (round.stage as StageView)}
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

      {screen === "result" && puzzle && result && (
        <Result
          number={puzzle.number}
          view={view(result.stage as StageView)}
          answer={puzzle.image.title}
          result={result}
          onCopy={copyResult}
          stats={stats}
        />
      )}

      {tunneling && <div className="play-tunnel" aria-hidden="true" />}
    </main>
  )
}
