/**
 * @file Minimal Upstash Redis client over its REST API (server only).
 *
 * The visit counter is the app's only storage, so this sends plain `fetch`
 * requests instead of pulling in an SDK. Credentials come from the
 * environment variables Upstash sets when connected through Vercel:
 * `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`, or the older
 * `KV_REST_API_URL` / `KV_REST_API_TOKEN` names.
 *
 * Never import this from client code: the token must stay on the server.
 */

/** One Redis command as its words, e.g. `["INCR", "mislook:visits"]`. */
export type RedisCommand = (string | number)[]

/** Thrown when Redis isn't configured or a request fails. */
export class RedisError extends Error {}

function credentials() {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN
  if (!url || !token) throw new RedisError("Redis is not configured")
  return { url: url.replace(/\/$/, ""), token }
}

/**
 * A server-only secret for hashing (rate-limit keys). Uses `STATS_SECRET` when
 * set, otherwise the Redis token, which is already secret and server-only.
 * @throws RedisError when neither is configured.
 */
export function serverSecret() {
  return process.env.STATS_SECRET ?? credentials().token
}

/**
 * Runs several commands in one round trip (Upstash's `/pipeline` endpoint).
 * @returns Each command's result, in order.
 * @throws RedisError when not configured, on a network/HTTP failure, or if any command errors.
 */
export async function pipeline(commands: RedisCommand[]): Promise<unknown[]> {
  const { url, token } = credentials()
  const response = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
    cache: "no-store",
  })
  if (!response.ok) throw new RedisError(`Redis request failed: ${response.status}`)
  const results = (await response.json()) as { result?: unknown; error?: string }[]
  const failed = results.find((r) => r.error)
  if (failed) throw new RedisError(failed.error)
  return results.map((r) => r.result)
}
