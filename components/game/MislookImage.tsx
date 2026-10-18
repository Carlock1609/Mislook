"use client"

import { useEffect, useRef, useState } from "react"
import { copy } from "@/lib/content"
import { createCanvas2DRenderer } from "@/lib/gl/canvas2d"
import type { Renderer, TransitionKind } from "@/lib/gl/renderer"
import { type AnyStyleId, buildScene, type StageView, type Tuning } from "@/lib/gl/scene"
import { createWebGLRenderer } from "@/lib/gl/webgl"

export type ImageStatus = "loading" | "ready" | "error"

const MAX_BACKING_SIZE = 1200

/** The puzzle image: WebGL distortion styles and transitions, with a Canvas 2D fallback. */
export default function MislookImage({
  src,
  style,
  stage,
  seed,
  focus,
  tuning,
  label,
  revealing = false,
  status,
  onStatus,
}: {
  src: string
  style: AnyStyleId
  /** Stage 1–5, or 0 for the clear image. */
  stage: StageView
  seed: string
  focus?: [number, number]
  tuning?: Tuning
  label: string
  revealing?: boolean
  status: ImageStatus
  onStatus: (status: ImageStatus) => void
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<Renderer | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null)

  // What the canvas currently shows, to pick the right transition for the next change.
  const shownRef = useRef<{ src: string; style: AnyStyleId; stage: StageView } | null>(null)
  const onStatusRef = useRef(onStatus)
  useEffect(() => {
    onStatusRef.current = onStatus
  })

  useEffect(() => {
    const canvas = canvasRef.current!
    const renderer = createWebGLRenderer(canvas) ?? createCanvas2DRenderer(canvas)
    rendererRef.current = renderer
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width * window.devicePixelRatio
      renderer?.resize(Math.max(1, Math.min(MAX_BACKING_SIZE, Math.round(width))))
    })
    observer.observe(frameRef.current!)
    return () => {
      observer.disconnect()
      renderer?.destroy()
      rendererRef.current = null
      shownRef.current = null
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const image = new Image()
    image.decoding = "async"
    image.onload = () => {
      if (cancelled) return
      rendererRef.current?.setImage(image)
      setLoadedSrc(src)
      onStatusRef.current("ready")
    }
    image.onerror = () => !cancelled && onStatusRef.current("error")
    image.src = src
    return () => {
      cancelled = true
    }
  }, [src, attempt])

  const focusX = focus?.[0]
  const focusY = focus?.[1]
  useEffect(() => {
    const renderer = rendererRef.current
    if (!renderer || loadedSrc !== src) return
    const scene = buildScene({
      style,
      stage,
      seed,
      tuning,
      focus: focusX === undefined || focusY === undefined ? undefined : [focusX, focusY],
    })
    const shown = shownRef.current
    let transition: TransitionKind = "none"
    if (shown && shown.src === src && shown.style === style && shown.stage !== stage) {
      transition = stage === 0 ? "final" : "stage"
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    renderer.show(scene, { transition, reduced })
    shownRef.current = { src, style, stage }
  }, [loadedSrc, src, style, stage, seed, tuning, focusX, focusY])

  return (
    <div
      ref={frameRef}
      role="img"
      aria-label={label}
      className={`relative aspect-square overflow-hidden border bg-[#0d0d0d] transition-colors duration-(--motion-hover) ${
        revealing ? "border-ink" : "border-line"
      }`}
    >
      <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 size-full" />

      {status !== "ready" && (
        <div className="absolute inset-0 z-10 grid place-content-center gap-4 bg-surface text-center text-label uppercase tracking-[0.13em] text-muted">
          {status === "loading" ? (
            copy.imageLoading
          ) : (
            <>
              <strong className="font-semibold">{copy.imageError}</strong>
              <button
                type="button"
                className="min-h-11 cursor-pointer font-bold text-accent focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent"
                onClick={() => {
                  onStatus("loading")
                  setAttempt((n) => n + 1)
                }}
              >
                {copy.retry}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
