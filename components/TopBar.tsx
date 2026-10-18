import type { ReactNode } from "react"
import Wordmark from "@/components/fx/Wordmark"
import { metaRow, panel } from "@/components/ui"

export default function TopBar({ meta, stats }: { meta: ReactNode; stats: ReactNode }) {
  return (
    <header className={`${panel} ${metaRow} min-h-[50px] px-4 md:min-h-[58px] md:px-5`}>
      <Wordmark compact />
      <div className="grid justify-items-end gap-0.5 md:gap-1">
        <span>{meta}</span>
        {stats}
      </div>
    </header>
  )
}
