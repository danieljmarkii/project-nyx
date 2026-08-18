// Unit tests for fetchWithTimeout (CUL-258 / B-130).
// Run with: deno test -A supabase/functions/_shared/http.test.ts
//
// Covers the three things the timeout wrapper must get right:
//   1. a healthy response passes through untouched (and the abort timer is cleared —
//      Deno's op-leak sanitizer fails the test if clearTimeout is ever dropped);
//   2. a hung upstream rejects with a legible "timed out" error;
//   3. the FAIL-SAFE CONTRACT — that timeout error carries no "Claude API error 400"
//      substring, so incident-analysis.ts's vision-call catch re-throws it as a
//      transient failure (a `failed` row + retry CTA) instead of misclassifying it as
//      a permanently-unreadable image (degrade to a benign photoUnreadable read).
//   4. a real (non-abort) network error propagates unchanged — never mislabelled a timeout.

import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { fetchWithTimeout, ANTHROPIC_FETCH_TIMEOUT_MS } from './http.ts'

const URL = 'https://api.anthropic.com/v1/messages'

// A fetch that never settles until its signal aborts — models a hung upstream.
const hangingFetch: typeof fetch = (_input, init) =>
  new Promise<Response>((_resolve, reject) => {
    const signal = (init as RequestInit | undefined)?.signal
    if (signal?.aborted) {
      reject(new DOMException('The signal has been aborted', 'AbortError'))
      return
    }
    signal?.addEventListener('abort', () =>
      reject(new DOMException('The signal has been aborted', 'AbortError')),
    )
  })

Deno.test('fetchWithTimeout — the default ceiling is 30s (CUL-258 headroom, not a tight bound)', () => {
  assertEquals(ANTHROPIC_FETCH_TIMEOUT_MS, 30_000)
})

Deno.test('fetchWithTimeout — a healthy response passes straight through, with the abort signal wired in', async () => {
  let sawSignal = false
  const okFetch: typeof fetch = (_input, init) => {
    // The wrapper must attach an AbortSignal so it can actually cancel a hung call.
    sawSignal = (init as RequestInit | undefined)?.signal instanceof AbortSignal
    return Promise.resolve(new Response('ok', { status: 200 }))
  }

  // A generous timeout that will NOT fire; the timer must still be cleared on success
  // (Deno's timer/op-leak sanitizer fails this test if clearTimeout is dropped).
  const res = await fetchWithTimeout(URL, { method: 'POST' }, 30_000, okFetch)

  assertEquals(res.status, 200)
  assertEquals(await res.text(), 'ok')
  assert(sawSignal, 'wrapper should pass an AbortSignal into the underlying fetch')
})

Deno.test('fetchWithTimeout — a hung upstream aborts and rejects with a legible timeout error', async () => {
  let threw: unknown
  try {
    await fetchWithTimeout(URL, { method: 'POST' }, 5, hangingFetch)
  } catch (err) {
    threw = err
  }

  assert(threw instanceof Error, 'a hung call must reject')
  const message = (threw as Error).message
  assertStringIncludes(message, 'timed out')
  assertStringIncludes(message, '5ms')
})

Deno.test('fetchWithTimeout — FAIL-SAFE: the timeout error is NOT a "Claude API error 400" (must re-throw, never degrade to a benign read)', async () => {
  // incident-analysis.ts degrades ONLY on a message containing "Claude API error 400"
  // (a permanently-unreadable image → photoUnreadable) and re-throws everything else as a
  // transient, retryable failure. A timeout is transient, so its message must never match
  // that branch — otherwise a hung upstream would silently produce a reassuring n=1 read.
  let threw: unknown
  try {
    await fetchWithTimeout(URL, { method: 'POST' }, 5, hangingFetch)
  } catch (err) {
    threw = err
  }
  const message = (threw as Error).message
  assert(
    !message.includes('Claude API error 400'),
    'timeout message must not collide with the vision-call degrade branch',
  )
})

Deno.test('fetchWithTimeout — a real network error propagates unchanged (never mislabelled a timeout)', async () => {
  const networkErr = new TypeError('network unreachable')
  const failingFetch: typeof fetch = () => Promise.reject(networkErr)

  let threw: unknown
  try {
    // Large timeout so the timer cannot be the cause; the rejection is the network error.
    await fetchWithTimeout(URL, { method: 'POST' }, 30_000, failingFetch)
  } catch (err) {
    threw = err
  }

  assertEquals(threw, networkErr)
  assert(!(threw as Error).message.includes('timed out'), 'a network error is not a timeout')
})
