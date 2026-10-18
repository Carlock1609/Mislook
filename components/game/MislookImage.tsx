"use client"

import { copy, STAGES } from "@/lib/content"

export type ImageStatus = "loading" | "ready" | "error"

/**
 * The puzzle image. Build step 1 shows a plain greyscale image;
 * the WebGL distortion styles and transitions arrive in step 2.
 */
export default function MislookImage({
  src,
  stage,
  revealing,
  status,
  onStatus,
}: {
  src: string
  stage: number
  revealing: boolean
  status: ImageStatus
  onStatus: (status: ImageStatus) => void
}) {
  return (
    <div
      role="img"
      aria-label={`Today's image, stage ${stage} of ${STAGES}`}
      className={`relative aspect-square overflow-hidden border bg-[#0d0d0d] transition-colors duration-(--motion-hover) ${
        revealing ? "border-ink" : "border-line"
      }`}
    >
      {status !== "error" && (
        // eslint-disable-next-line @next/next/no-img-element -- replaced by a WebGL canvas in step 2
        <img
          key={src}
          src={src}
          alt=""
          aria-hidden="true"
          draggable={false}
          onLoad={() => onStatus("ready")}
          onError={() => onStatus("error")}
          className={`absolute inset-0 size-full object-cover contrast-[1.12] grayscale transition-opacity duration-(--motion-reveal) ${
            status === "ready" ? "opacity-100" : "opacity-0"
          }`}
        />
      )}

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
                onClick={() => onStatus("loading")}
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
