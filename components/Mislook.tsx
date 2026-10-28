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
import { dateForDayIndex, dayIndexFor, imageIndexFor, puzzleNumberFor, readDayRequest } from "@/lib/daily"
import { TRANSITION_MS } from "@/lib/gl/renderer"
import { type AnyStyleId, KNOBS, type StageView, type Tuning } from "@/lib/gl/scene"
import { initialRound, reduceRound, type RoundResult, roundElapsed, roundResult } from "@/lib/reduce"
import { pointsAvailable, timeBonus } from "@/lib/score"
import { shareText } from "@/lib/share"
import { loadDayResult, saveDayResult } from "@/lib/storage"
import { loadStats } from "@/lib/stats"

/** Today, as the client works it out: before `DAY_0`, or the puzzle number and image. */
type Day =
  | { comingSoon: true; testing: boolean }
  | { comingSoon: false; number: number; date: string; imageIndex: number; image: PuzzleImage; preview: boolean; testing: boolean }

// Resolved once on the client: the page is static, so the date can't come from the server.
let resolvedDay: Day | undefined
/** "checking" while `/api/test` confirms a `?test=` link. No link is "off" immediately. */
let testAccess: "checking" | "on" | "off" = "checking"
const testListeners = new Set<() => void>()

function testKeyFromUrl() {
  return new URLSearchParams(window.location.search).get("test")
}

/** Whether this page may skip the daily lock. A link with no key is never testing. */
function testAccessNow(): "checking" | "on" | "off" {
  if (!testKeyFromUrl()) return "off"
  return testAccess === "checking" ? "checking" : testAccess
}

function subscribeTest(listener: () => void) {
  testListeners.add(listener)
  return () => testListeners.delete(listener)
}

function publishTest(next: "on" | "off") {
  testAccess = next
  resolvedDay = undefined
  restoredResult = undefined
  testListeners.forEach((listener) => listener())
}

/** Today's day (cached). A confirmed test link skips the daily lock. In that mode, or in development, `?day=N` previews a photo that exists. */
function getDay(): Day | null {
  if (testAccessNow() === "checking") return null
  if (resolvedDay) return resolvedDay
  let dayIndex = dayIndexFor(Date.now(), settings.DAY_0, settings.timeZone)
  let preview = false
  const testing = testAccessNow() === "on"
  if (testing || process.env.NODE_ENV === "development") {
    const param = new URLSearchParams(window.location.search).get("day")
    if (readDayRequest(param, images.length) === "playable") {
      dayIndex = Number(param) - 1
      preview = true
    }
  }
  // A test link never reads or writes today's saved result, even without `?day=`.
  if (testing) preview = true
  const imageIndex = imageIndexFor(Math.max(0, dayIndex), images.length)
  resolvedDay =
    dayIndex < 0
      ? { comingSoon: true, testing }
      : {
          comingSoon: false,
          number: puzzleNumberFor(dayIndex, images.length),
          date: dateForDayIndex(dayIndex, settings.DAY_0),
          imageIndex,
          image: images[imageIndex],
          preview,
          testing,
        }
  return resolvedDay
}

/** Drops a `?day=` that does not name a photo, leaving the address on the real day. */
function dropMissingDayParam() {
  const url = new URL(window.location.href)
  if (readDayRequest(url.searchParams.get("day"), images.length) !== "missing") return
  url.searchParams.delete("day")
  const next = `${url.pathname}${url.search}${url.hash}`
  window.history.replaceState(window.history.state, "", next)
}

// Cached like `resolvedDay`: getSnapshot must return the same reference each call.
let restoredResult: RoundResult | null | undefined
/** Finished result for today's date, if the daily lock has one. Skips `?day=` previews. */
function getRestoredResult(): RoundResult | null {
  if (restoredResult !== undefined) return restoredResult
  const day = getDay()
  if (!day) return null
  restoredResult = day.comingSoon || day.preview ? null : loadDayResult(day.date)
  return restoredResult
}

/** Which screen is showing. Play never changes the URL. */
type Phase = "howToPlay" | "game" | "result"

/** The TEST tab is on locally, and on the live site when the page was opened with the test link. */
function showTestPanel(day: Day | null) {
  return process.env.NODE_ENV === "development" || day?.testing === true
}
/** Screen change: fade out, swap, fade in. The timer waits until the game fade finishes. */
const FADE_MS = 200

/** Dev test panel overrides: display only, never the round itself. */
type TestView = { imageIndex?: number; style?: AnyStyleId; stage?: StageView }

/**
 * The whole app: picks today's puzzle, holds the round state, and switches
 * between How to play, Game and Result.
 */
export default function Mislook() {
  const day = useSyncExternalStore(subscribeTest, getDay, () => null)
  const restored = useSyncExternalStore(subscribeTest, getRestoredResult, () => null)
  const [phase, setPhase] = useState<Phase>("howToPlay")
  const [motion, setMotion] = useState<"out" | "in" | null>(null)
  /** True while Play's fade is running, so the clock doesn't start under the landing screen. */
  const [entering, setEntering] = useState(false)
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
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms))

  /** Fade the current screen out, then show `next`. Reduced motion swaps immediately. */
  const fadeTo = (next: Phase) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPhase(next)
      setMotion(null)
      return
    }
    setMotion("out")
    later(() => {
      setPhase(next)
      setMotion("in")
    }, FADE_MS)
  }

  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), [])
  useEffect(() => dropMissingDayParam(), [])
  // A `?test=` link is checked on the server so the key is not in the page.
  useEffect(() => {
    const key = testKeyFromUrl()
    if (!key) return
    let cancelled = false
    fetch("/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { testing?: boolean } | null) => {
        if (!cancelled) publishTest(body?.testing ? "on" : "off")
      })
      .catch(() => {
        if (!cancelled) publishTest("off")
      })
    return () => {
      cancelled = true
    }
  }, [])
  useEffect(() => {
    if (testAccessNow() === "checking") return
    let cancelled = false
    loadStats(day?.testing === true).then((s) => !cancelled && setSiteStats(s))
    return () => {
      cancelled = true
    }
  }, [day])

  // Live clock for the time bonus and points-available, once per second while playing.
  useEffect(() => {
    if (round.status !== "playing" || round.startedAt === null) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [round.status, round.startedAt])

  // Timer starts when stage 1 has settled: game visible, intro fade done, image ready.
  // A failed image never starts the round.
  useEffect(() => {
    if (phase !== "game" || entering || imageStatus !== "ready") return
    if (round.status !== "ready") return
    dispatch({ type: "start", now: Date.now() })
  }, [phase, entering, imageStatus, round.status])

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
    const id = window.setTimeout(() => fadeTo("result"), TRANSITION_MS)
    return () => window.clearTimeout(id)
    // Only re-run when the round ends; `round` / `day` are read for the save payload.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: status is the trigger
  }, [round.status])

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
  const points = pointsAvailable(round.stage, elapsed, round.wrongGuesses, round.skips, settings.scoring)
  const bonus = timeBonus(elapsed, settings.scoring)
  const liveResult = roundResult(round, settings.scoring)
  const result = liveResult ?? restored
  // A refresh after finishing jumps straight to Result via the daily lock.
  const screen: Phase = phase === "howToPlay" && restored ? "result" : phase
  const controlsBusy = round.busy || round.status === "ready" || round.status === "won" || round.status === "missed"

  /** Fades into the game. The timer starts after that fade, once stage 1 has settled. */
  const play = () => {
    if (entering || motion === "out") return
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (!reduced) setEntering(true)
    fadeTo("game")
    if (!reduced) later(() => setEntering(false), FADE_MS * 2)
  }

  /** Checks a guess: a match wins, a miss locks Guess and costs the wrong-guess penalty. */
  const guess = (text: string) => {
    if (!puzzle) return
    dispatch({ type: "guess", text, accept: shownImage.accept, now: Date.now() })
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
      await navigator.clipboard.writeText(shareText(puzzle.number, puzzle.date, result))
      return true
    } catch {
      return false
    }
  }

  return (
    <main className="relative isolate min-h-dvh overflow-x-hidden">
      <Background dim={screen === "game"} />

      <div className={motion === "out" ? "screen-out" : motion === "in" ? "screen-in" : undefined}>
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
              showTestPanel(day) && (
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
            answer={shownImage.title}
            result={result}
            onCopy={copyResult}
            stats={stats}
          />
        )}
      </div>
    </main>
  )
}
