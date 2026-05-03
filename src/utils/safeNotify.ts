// Wrap a fire-and-forget async notification call with bounded retries +
// permanent on-failure logging, so a transient blip doesn't silently drop
// the notification to owners.

const RETRY_DELAYS_MS = [500, 2000, 5000] // 3 attempts after the initial one

/**
 * Run an async notification function. On failure, retry up to 3 times with
 * backoff. After all retries fail, log a clearly-tagged warning in the
 * console (visible to operators) instead of just dropping it.
 *
 * Use for non-blocking notifications (after the user has already seen
 * "success") — the goal is reliability, not blocking the UI.
 */
export async function safeNotify(
  label: string,
  fn: () => Promise<unknown>
): Promise<void> {
  let lastError: unknown = null
  try {
    await fn()
    return
  } catch (e) {
    lastError = e
  }
  for (const delay of RETRY_DELAYS_MS) {
    await new Promise((r) => setTimeout(r, delay))
    try {
      await fn()
      return
    } catch (e) {
      lastError = e
    }
  }
  // All attempts failed. Surface this loudly to anyone watching the console
  // (e.g. via a remote-logging tool) so it doesn't disappear.
  console.warn(
    `[safeNotify] "${label}" failed after ${1 + RETRY_DELAYS_MS.length} attempts:`,
    lastError
  )
}
