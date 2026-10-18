/** @file Shared Tailwind class sets for the few repeated UI pieces. */

/** Bordered surface box. */
export const panel = "border border-line bg-surface"

/** Small uppercase row with items pushed to either end. */
export const metaRow =
  "flex items-center justify-between text-label font-semibold uppercase tracking-[0.14em] text-muted"

/** Accent-coloured section label. */
export const label = "text-tiny font-bold uppercase tracking-[0.18em] text-accent"

const buttonBase =
  "min-h-12 rounded-ui border px-5 text-label font-bold uppercase tracking-[0.11em] cursor-pointer " +
  "transition-[transform,background-color,color,border-color] duration-(--motion-hover) " +
  "enabled:hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent " +
  "disabled:cursor-not-allowed disabled:border-line disabled:bg-raised disabled:text-faint"

/**
 * Class names for a button.
 * @param variant - Filled accent (primary) or outlined (secondary).
 * @param wide - Full width with the label and icon at either end.
 * @param prompted - Secondary drawn in accent, to nudge the player (e.g. Reveal after a wrong guess).
 */
export function button({
  variant,
  wide = false,
  prompted = false,
}: {
  variant: "primary" | "secondary"
  wide?: boolean
  prompted?: boolean
}) {
  const look =
    variant === "primary"
      ? "border-accent bg-accent text-bg enabled:hover:border-ink enabled:hover:bg-ink"
      : prompted
        ? "border-accent bg-transparent text-accent"
        : "border-ink bg-transparent enabled:hover:border-accent enabled:hover:text-accent"
  return `${buttonBase} ${look} ${wide ? "flex w-full items-center justify-between" : ""}`
}
