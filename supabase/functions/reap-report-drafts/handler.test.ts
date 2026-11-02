// reap-report-drafts' request handling (CUL-2437). Run with:
//   deno test supabase/functions/reap-report-drafts/handler.test.ts

import { strict as assert } from 'node:assert'
import type { DraftReaperIO, SweepResult } from '../generate-report/savedCopy.ts'
import { handleSweep, SWEEP_BODY } from './handler.ts'

const io = {} as DraftReaperIO
const post = (body: string) => new Request('http://local/reap-report-drafts', { method: 'POST', body, headers: { 'Content-Type': 'application/json' } })
const clean: SweepResult = { reaped: 3, passes: 1, ok: true, capped: false }

function deps(result: SweepResult = clean) {
  let swept = 0
  return {
    get swept() { return swept },
    reaperIO: () => io,
    sweep: async (got: DraftReaperIO) => {
      assert.equal(got, io)
      swept++
      return result
    },
  }
}

Deno.test("the deploy check's `{}` gets the function's own 4xx and sweeps nothing", async () => {
  // scripts/edge-deploy/verify.ts judgeAnon: a 4xx whose body is a JSON object with a string error.
  for (const body of ['{}', '', 'not json', '[]', '{"sweep":"everything"}', '{"sweep":true}']) {
    const d = deps()
    const res = await handleSweep(post(body), d)
    assert.equal(res.status, 400, body)
    assert.equal(typeof (await res.json()).error, 'string')
    assert.equal(d.swept, 0, body)
  }
})

Deno.test('the job body sweeps once and answers with no count or id', async () => {
  const d = deps()
  const res = await handleSweep(post(JSON.stringify(SWEEP_BODY)), d)
  assert.equal(res.status, 204)
  assert.equal(await res.text(), '')
  assert.equal(d.swept, 1)
})

// A 500 reaches net._http_response only, which pg_net purges after about 6 h, and pg_cron's own
// history records the call as queued either way: nobody sees it. Making a stopped sweep visible is
// CUL-2465. The 500 is still right: it is the one honest answer the response can give.
Deno.test('an incomplete sweep answers 500, never a clean 204', async () => {
  const res = await handleSweep(post(JSON.stringify(SWEEP_BODY)), deps({ reaped: 0, passes: 1, ok: false, capped: false }))
  assert.equal(res.status, 500)
})

Deno.test('a missing service role refuses before sweeping; any other method is refused', async () => {
  const d = deps()
  const res = await handleSweep(post(JSON.stringify(SWEEP_BODY)), { ...d, reaperIO: () => null })
  assert.equal(res.status, 500)
  assert.equal(d.swept, 0)
  assert.equal((await handleSweep(new Request('http://local/x', { method: 'GET' }), deps())).status, 405)
})
