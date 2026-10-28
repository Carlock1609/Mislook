/**
 * @file The live-site test link. The key itself stays in `MISLOOK_TEST_KEY`
 * on the server. This file only compares a value the server already has.
 */

/** True when `param` is the configured test key. An empty key never matches. */
export function matchesTestKey(param: string | null, key: string) {
  return key.length > 0 && param !== null && param === key
}
