"use client"

import { type FormEvent, useState } from "react"
import { button } from "@/components/ui"
import { copy, settings } from "@/lib/content"

/**
 * Guess field and Reveal button. One guess per stage: an empty or whitespace
 * guess does nothing, and a wrong one locks Guess until Reveal.
 */
export default function GuessBar({
  locked,
  busy,
  lastStage,
  wrongCount,
  onGuess,
  onReveal,
}: {
  /** A wrong guess on this stage locks Guess until Reveal. */
  locked: boolean
  /** A transition is playing. */
  busy: boolean
  /** On stage 5 Reveal ends the round, so its label changes. */
  lastStage: boolean
  /** Changes on every wrong guess, to replay the shake. */
  wrongCount: number
  onGuess: (guess: string) => void
  onReveal: () => void
}) {
  const [value, setValue] = useState("")
  const canGuess = value.trim() !== "" && !locked && !busy

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!canGuess) return
    onGuess(value)
  }

  const reveal = () => {
    setValue("")
    onReveal()
  }

  return (
    <>
      <form className="pt-5 pb-4 md:pt-6" onSubmit={submit}>
        <label htmlFor="guess" className="mb-3 block text-tiny font-bold uppercase tracking-[0.17em]">
          {copy.guessLabel}
        </label>
        <div
          key={wrongCount}
          className={`grid grid-cols-1 gap-2 min-[360px]:grid-cols-[1fr_auto] ${locked ? "animate-shake" : ""}`}
        >
          <input
            id="guess"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            maxLength={settings.guessMaxLength}
            placeholder={copy.guessPlaceholder}
            disabled={locked || busy}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="go"
            className={`min-h-12 min-w-0 rounded-ui border bg-bg px-4 text-base text-ink outline-none placeholder:text-faint focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent disabled:opacity-60 md:text-sm ${
              locked ? "border-miss" : "border-line"
            }`}
          />
          <button type="submit" className={button({ variant: "primary" })} disabled={!canGuess}>
            {copy.guessButton}
          </button>
        </div>
        {locked && (
          <p className="mt-2 text-tiny font-semibold uppercase tracking-[0.07em] text-miss">{copy.wrongGuess}</p>
        )}
      </form>

      <button
        type="button"
        className={button({ variant: "secondary", wide: true, prompted: locked })}
        disabled={busy}
        onClick={reveal}
      >
        <span>{lastStage ? copy.revealLastButton : copy.revealButton}</span>
        <span aria-hidden="true">+1</span>
      </button>
    </>
  )
}
