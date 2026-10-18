/** The MISLOOK wordmark with its offset echo. `compact` is the top-bar size. */
export default function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div
      role="img"
      aria-label="Mislook"
      className={
        compact
          ? "relative isolate inline-block font-display text-[22px] leading-[0.82] tracking-[-0.06em]"
          : "relative isolate mt-10 mb-8 inline-block font-display text-[clamp(48px,13vw,76px)] leading-[0.82] tracking-[-0.075em]"
      }
    >
      <span aria-hidden="true">MISLOOK</span>
      <span className="wordmark__echo" aria-hidden="true">
        MISLOOK
      </span>
    </div>
  )
}
