import { copy } from "@/lib/content"

export type Stats = { visits: number; visitors: number }

const format = (n: number) => n.toLocaleString("en-US")

/** Shows a dash while loading; render nothing when the request failed. */
export default function SiteStats({ stats, className = "" }: { stats: Stats | null; className?: string }) {
  return (
    <p
      className={`m-0 text-micro leading-tight font-medium lowercase tracking-[0.06em] text-muted tabular-nums ${className}`}
    >
      {stats
        ? `${format(stats.visits)} ${copy.statsVisits} · ${format(stats.visitors)} ${copy.statsVisitors}`
        : "—"}
    </p>
  )
}
