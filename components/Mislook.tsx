"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import Background from "@/components/fx/Background"
import Game from "@/components/game/Game"
import type { ImageStatus } from "@/components/game/MislookImage"
import HowToPlay from "@/components/HowToPlay"
import Result, { type RoundResult } from "@/components/result/Result"
import SiteStats, { type Stats } from "@/components/SiteStats"
import { imageSrc, images, type PuzzleImage, STAGES, settings } from "@/lib/content"
import { dayIndexFor, imageIndexFor } from "@/lib/daily"

type Day = { comingSoon: true } | { comingSoon: false; number: number; image: PuzzleImage }

// Resolved once on the client: the page is static, so the date can't come from the server.
let resolvedDay: Day | undefined
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
      : { comingSoon: false, number: dayIndex + 1, image: images[imageIndexFor(dayIndex, images.length)] }
  return resolvedDay
}
const noSubscribe = () => () => {}

// Placeholder numbers until the stats route lands in build step 6.
const DUMMY_STATS: Stats = { visits: 12481, visitors: 3207 }

type Phase = "howToPlay" | "game" | "result"

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
  const startedAt = useRef(0)
  const timers = useRef<number[]>([])

  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), [])
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms))

  const stats = <SiteStats stats={day ? DUMMY_STATS : null} />
  const puzzle = day && !day.comingSoon ? day : null
  const bonus = settings.scoring.timeBonusMax
  const points = Math.max(
    settings.scoring.winFloor,
    settings.scoring.stageBase[stage - 1] + bonus - wrongGuesses * settings.scoring.wrongPenalty,
  )

  const play = () => {
    setTunneling(true)
    later(() => {
      startedAt.current = Date.now()
      setPhase("game")
    }, 500)
    later(() => setTunneling(false), 1000)
  }

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

  const guess = (text: string) => {
    if (!puzzle || busy || locked) return
    if (puzzle.image.accept.includes(text.trim().toLowerCase())) {
      finish(true)
    } else {
      setLocked(true)
      setWrongGuesses((n) => n + 1)
    }
  }

  const reveal = () => {
    if (busy) return
    if (stage === STAGES) return finish(false)
    setBusy(true)
    setStage((s) => s + 1)
    setLocked(false)
    later(() => setBusy(false), 1000)
  }

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
          imageSrc={imageSrc(puzzle.image)}
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
        />
      )}

      {phase === "result" && puzzle && result && (
        <Result
          number={puzzle.number}
          imageSrc={imageSrc(puzzle.image)}
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
