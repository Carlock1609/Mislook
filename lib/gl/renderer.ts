/**
 * @file The renderer contract shared by `webgl.ts` and `canvas2d.ts`, plus the
 * requestAnimationFrame helper both use for transitions.
 */

import type { Scene } from "@/lib/gl/scene"

/** How to get to the next scene: instantly, a stage transition, or the final reveal into the clear image. */
export type TransitionKind = "none" | "stage" | "final"

/** Options for `Renderer.show`. */
export type ShowOptions = {
  transition: TransitionKind
  /** prefers-reduced-motion: transitions become crossfades. */
  reduced: boolean
}

/** Draws scenes of one puzzle image onto a square canvas. */
export interface Renderer {
  readonly kind: "webgl" | "canvas2d"
  /** Sets (or replaces) the source image and redraws the current scene. */
  setImage(image: HTMLImageElement): void
  /** Canvas backing size in device pixels (square). */
  resize(size: number): void
  /** Shows `scene`, animating from the previous one according to `options`. */
  show(scene: Scene, options: ShowOptions): void
  /** Stops animations and frees what the renderer created. */
  destroy(): void
}

/** Length of every stage transition and the final reveal. */
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
