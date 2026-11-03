// reap-report-drafts' request handling (CUL-2437, CUL-2465). Run with:
//   deno test supabase/functions/reap-report-drafts/handler.test.ts

import { strict as assert } from 'node:assert'
import { CHECK_BODY, handleSweep, SWEEP_BODY } from './handler.ts'
import type { SweepIO, SweepResult } from './sweep.ts'

const io = {} as SweepIO
const post = (body: string) => new Request('http://local/reap-report-drafts', { method: 'POST', body, headers: { 'Content-Type': 'application/json' } })
const clean: SweepResult = { reaped: 3, failed: 0, passes: 1, ok: true, capped: false }

function deps(result: SweepResult = clean, overdue: boolean | null = false) {
  let swept = 0
  let checked = 0
  return {
    get swept() { return swept },
    get checked() { return checked },
    reaperIO: () => io,
    sweep: async (got: SweepIO) => {
      assert.equal(got, io)
      swept++
      return result
    },
    check: async (got: SweepIO) => {
      assert.equal(got, io)
      checked++
      return overdue
    },
  }
}

Deno.test("the deploy check's `{}` gets the function's own 4xx and does nothing", async () => {
  // scripts/edge-deploy/verify.ts judgeAnon: a 4xx whose body is a JSON object with a string error.
  for (
    const body of [
      '{}', '', 'not json', '[]', '{"sweep":"everything"}', '{"sweep":true}', '{"check":"all"}',
      '{"sweep":"drafts","check":"overdue"}', '{"sweep":"drafts","id":"x"}',
    ]
  ) {
    const d = deps()
    const res = await handleSweep(post(body), d)
    assert.equal(res.status, 400, body)
    assert.equal(typeof (await res.json()).error, 'string')
    assert.equal(d.swept + d.checked, 0, body)
  }
})

Deno.test('the job body sweeps once and answers with no count or id', async () => {
  const d = deps()
  const res = await handleSweep(post(JSON.stringify(SWEEP_BODY)), d)
  assert.equal(res.status, 204)
  assert.equal(await res.text(), '')
  assert.equal(d.swept, 1)
  assert.equal(d.checked, 0)
})

// A 500 reaches net._http_response only, which pg_net purges after about 6 h, and pg_cron's own
// history records the call as queued either way. What makes a stopped sweep visible is the daily
// overdue check below (CUL-2465), which reads the outcome rather than this answer.
Deno.test('an incomplete sweep answers 500, never a clean 204', async () => {
  const res = await handleSweep(post(JSON.stringify(SWEEP_BODY)), deps({ reaped: 9, failed: 1, passes: 1, ok: false, capped: false }))
  assert.equal(res.status, 500)
})

Deno.test('the check answers one bit and never sweeps (CUL-2465)', async () => {
  const none = deps(clean, false)
  const r0 = await handleSweep(post(JSON.stringify(CHECK_BODY)), none)
  assert.equal(r0.status, 204)
  assert.equal(await r0.text(), '')
  assert.equal(none.swept, 0)

  const some = deps(clean, true)
  const r1 = await handleSweep(post(JSON.stringify(CHECK_BODY)), some)
  assert.equal(r1.status, 200)
  // Exactly this body: no count, id, path, owner or age.
  assert.deepEqual(await r1.json(), { overdue: true })
  assert.equal(some.swept, 0)
})

Deno.test('a check that cannot read answers 500, never "none overdue"', async () => {
  const res = await handleSweep(post(JSON.stringify(CHECK_BODY)), deps(clean, null))
  assert.equal(res.status, 500)
})

Deno.test('a missing service role refuses before any work; any other method is refused', async () => {
  for (const body of [SWEEP_BODY, CHECK_BODY]) {
    const d = deps()
    const res = await handleSweep(post(JSON.stringify(body)), { ...d, reaperIO: () => null })
    assert.equal(res.status, 500)
    assert.equal(d.swept + d.checked, 0)
  }
  assert.equal((await handleSweep(new Request('http://local/x', { method: 'GET' }), deps())).status, 405)
})
