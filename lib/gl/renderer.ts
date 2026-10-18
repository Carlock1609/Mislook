import type { Scene } from "@/lib/gl/scene"

export type TransitionKind = "none" | "stage" | "final"

export type ShowOptions = {
  transition: TransitionKind
  /** prefers-reduced-motion: transitions become crossfades. */
  reduced: boolean
}

export interface Renderer {
  readonly kind: "webgl" | "canvas2d"
  setImage(image: HTMLImageElement): void
  /** Canvas backing size in device pixels (square). */
  resize(size: number): void
  show(scene: Scene, options: ShowOptions): void
  destroy(): void
}

export const TRANSITION_MS = 1000

/** Runs `frame(progress)` from 0 to 1 over `ms`, cancelling any earlier run. */
export function createAnimator() {
  let raf = 0
  return {
    run(ms: number, frame: (progress: number) => void, done: () => void) {
      cancelAnimationFrame(raf)
      const start = performance.now()
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / ms)
        frame(p)
        if (p < 1) raf = requestAnimationFrame(tick)
        else done()
      }
      raf = requestAnimationFrame(tick)
    },
    cancel() {
      cancelAnimationFrame(raf)
    },
  }
}
