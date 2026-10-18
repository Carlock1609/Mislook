import { copy } from "@/lib/content"

export type Stats = { visits: number; visitors: number }

const format = (n: number) => n.toLocaleString("en-US")

/**
 * The small "visits · visitors" line shown on every screen.
 * @param stats - The totals; `undefined` while loading (shows a dash), `null` when the request failed (renders nothing).
 */
export default function SiteStats({ stats, className = "" }: { stats: Stats | null | undefined; className?: string }) {
  if (stats === null) return null
  return (
    <p
      className={`m-0 text-micro leading-tight font-medium lowercase tracking-[0.06em] text-muted tabular-nums ${className}`}
    >
      {stats ? `${format(stats.visits)} ${copy.statsVisits} · ${format(stats.visitors)} ${copy.statsVisitors}` : "—"}
    </p>
  )
}
