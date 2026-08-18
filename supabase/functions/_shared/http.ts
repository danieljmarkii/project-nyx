// Supabase Edge Function shared util — fetch with an abort-on-timeout (CUL-258 / B-130).
//
// Every Anthropic `fetch` in the Edge Functions was unbounded: a hung upstream held
// the function open to Supabase's wall-clock ceiling. This wraps fetch in an
// AbortController that fires after `timeoutMs`, turning a stall into a prompt,
// catchable rejection. Applied uniformly to all six Claude call sites.
//
// The thrown message deliberately contains no "Claude API error 400" substring:
// incident-analysis.ts's vision-call catch treats a 400 as a permanently-unreadable
// image (degrade to photoUnreadable) and RE-THROWS everything else as a transient,
// retryable failure. A timeout IS transient, so its message must NOT match the 400
// branch — it belongs on the re-throw path (a `failed` row + retry CTA), never a
// degrade-to-benign read. That fail-safe contract is pinned by http.test.ts.

// Default ceiling for a single Anthropic request. One image + one tool call responds
// well under 30s (CUL-258), so 30s is generous headroom, not a tight bound — it
// exists to cap a HUNG upstream, never to clip a slow-but-healthy call.
export const ANTHROPIC_FETCH_TIMEOUT_MS = 30_000

// fetch(), but aborted after `timeoutMs`. On timeout the returned promise REJECTS
// (it never resolves to a partial or blank Response), so every caller's existing
// error handling — a local try/catch, or a downstream `!res.ok` throw — carries the
// failure through unchanged. `fetchImpl` is injectable for tests only; production
// callers pass just (url, init) and inherit the 30s default.
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = ANTHROPIC_FETCH_TIMEOUT_MS,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal })
  } catch (err) {
    // An abort surfaces as an AbortError from fetch; translate it into a legible,
    // provider-agnostic timeout error. Any non-abort error (a real network failure)
    // propagates unchanged so callers can't mistake it for a timeout.
    if (controller.signal.aborted) {
      throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}
