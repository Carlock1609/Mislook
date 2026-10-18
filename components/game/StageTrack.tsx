import { STAGES } from "@/lib/content"

/** Five numbered dots: past stages filled, the current one ringed in accent. */
export default function StageTrack({ stage }: { stage: number }) {
  return (
    <div className="mt-3 flex gap-2" aria-label={`Stage ${stage} of ${STAGES}`}>
      {Array.from({ length: STAGES }, (_, i) => i + 1).map((step) => (
        <span
          key={step}
          aria-hidden="true"
          className={`grid aspect-square w-[23px] place-items-center rounded-full border text-micro min-[381px]:w-[26px] md:w-7 ${
            step < stage
              ? "border-muted bg-muted text-bg"
              : step === stage
                ? "border-accent text-accent shadow-[0_0_0_3px_rgb(217_243_91/0.12)]"
                : "border-line text-muted"
          }`}
        >
          {step}
        </span>
      ))}
    </div>
  )
}
