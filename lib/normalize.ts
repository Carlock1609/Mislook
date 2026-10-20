/**
 * @file Answer matching. Pure: no React.
 * A guess is correct when its normalized form exactly equals the normalized form
 * of one accepted answer. Misspellings are wrong.
 */

// Built with RegExp so the `u` flag doesn't trip the ES2017 compile target.
const ACCENTS = new RegExp("\\p{M}+", "gu")
const NON_ALPHANUMERIC = new RegExp("[^\\p{L}\\p{N}]+", "gu")
const LEADING_ARTICLE = /^(?:a|an|the) /

/**
 * Lowercase, strip accents, `&` → `and`, runs of anything that isn't a letter or
 * digit → one space, trim, then drop one leading `a`, `an` or `the` word.
 */
export function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(ACCENTS, "")
    .replace(/&/g, " and ")
    .replace(NON_ALPHANUMERIC, " ")
    .trim()
    .replace(LEADING_ARTICLE, "")
}

/** True when the guess matches one of the accepted answers. An empty guess never matches. */
export function isCorrect(guess: string, accept: string[]) {
  const g = normalize(guess)
  return g !== "" && accept.some((answer) => normalize(answer) === g)
}
