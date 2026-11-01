// The AI lead's one door to the model (CUL-2305; CUL-2331 promises 2 and 3). Each refusal is
// proven on a body that differs from a good one in exactly the way it names, and the fetch stub
// records what was actually sent.
import assert from 'node:assert/strict'
import { assertSendable, requestBody, sendChecked, ticketFor, type Role } from './model.ts'
import { CHECKER_MODEL, WRITER_MODEL } from './prompts.ts'

const PAYLOAD = {
  pet_name: 'Nyx',
  species: 'cat',
  record_start: '2026-09-17',
  record_end: '2026-10-31',
  band: [],
  record_lines: [{ id: 'line-1', kind: 'lead', text: 'Vomiting: 6 entries on 4 days.' }],
  trial_line: null,
  record_edge: [],
}
const TICKET = ticketFor({ allow: true })

function stub(response: unknown, status = 200) {
  const sent: Array<{ url: string; body: string; headers: Record<string, string> }> = []
  const impl = ((url: string, init: RequestInit) => {
    sent.push({ url, body: String(init.body), headers: init.headers as Record<string, string> })
    return Promise.resolve(new Response(JSON.stringify(response), { status }))
  }) as unknown as typeof fetch
  return { sent, impl }
}
const ok = (model: string, json: unknown) => ({ model, stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(json) }] })

Deno.test('a body the code built passes, for every role', () => {
  for (const role of ['writer', 'repair', 'checker'] as Role[]) {
    const r = assertSendable(role, requestBody(role, role === 'writer' ? PAYLOAD : { ...PAYLOAD, draft: { sentences: [] } }))
    assert.equal(r.ok, true, role)
  }
})

Deno.test('promise 3: an owner-words key anywhere in the payload refuses the whole body', () => {
  const r = assertSendable('writer', requestBody('writer', { ...PAYLOAD, record_lines: [{ id: 'x', text: 'y', notes: 'owner typed this' }] }))
  assert.deepEqual(r, { ok: false, refused: ['record_lines[0].notes'] })
})

Deno.test('promise 3: anything in the envelope the constants did not put there refuses', () => {
  const good = JSON.parse(requestBody('writer', PAYLOAD))
  const tampered = [
    { ...good, metadata: { user_id: 'u' } },
    { ...good, system: `${good.system} The owner says hello.` },
    { ...good, messages: [...good.messages, { role: 'user', content: 'more' }] },
    { ...good, messages: [{ role: 'user', content: good.messages[0].content.replace('Write the summary', 'Owner note: limping. Write the summary') }] },
    { ...good, model: 'claude-other' },
    { ...good, fallbacks: 'default' },
  ]
  for (const t of tampered) assert.equal(assertSendable('writer', JSON.stringify(t)).ok, false, JSON.stringify(t).slice(-120))
  // The same object, serialised another way, is a different body: the check is on the bytes.
  assert.equal(assertSendable('writer', JSON.stringify(good, null, 1)).ok, false)
})

Deno.test('promise 2: the URL is Anthropic\'s, and both roles name Anthropic models', async () => {
  const { sent, impl } = stub(ok(WRITER_MODEL, { sentences: [] }))
  const body = requestBody('writer', PAYLOAD)
  const r = await sendChecked('writer', body, TICKET, { timeoutMs: 1000, fetchImpl: impl, apiKey: 'k' })
  assert.equal(r.ok, true)
  assert.equal(sent.length, 1)
  assert.equal(new URL(sent[0].url).host, 'api.anthropic.com')
  assert.equal(sent[0].body, body, 'the bytes sent are the bytes checked')
  assert.match(WRITER_MODEL, /^claude-/)
  assert.match(CHECKER_MODEL, /^claude-/)
  assert.notEqual(WRITER_MODEL, CHECKER_MODEL, 'the checker is never the writer (bake-off spec §5)')
})

Deno.test('no ticket, a refused payload or no key: nothing is sent', async () => {
  const { sent, impl } = stub(ok(WRITER_MODEL, {}))
  const body = requestBody('writer', PAYLOAD)
  assert.equal((await sendChecked('writer', body, null, { timeoutMs: 1000, fetchImpl: impl, apiKey: 'k' })).ok, false)
  assert.equal(ticketFor({ allow: false, reason: 'flag_off', flag: 'report_ai_lead' }), null)
  const bad = requestBody('writer', { ...PAYLOAD, notes: 'x' })
  assert.deepEqual(await sendChecked('writer', bad, TICKET, { timeoutMs: 1000, fetchImpl: impl, apiKey: 'k' }), { ok: false, reason: 'payload_refused', servedModel: null })
  assert.deepEqual(await sendChecked('writer', body, TICKET, { timeoutMs: 1000, fetchImpl: impl, apiKey: null }), { ok: false, reason: 'no_key', servedModel: null })
  assert.equal(sent.length, 0)
})

Deno.test('fallbacks off: a different served model is a failure, never a lead', async () => {
  const { impl } = stub(ok('claude-opus-5', { sentences: [] }))
  const r = await sendChecked('writer', requestBody('writer', PAYLOAD), TICKET, { timeoutMs: 1000, fetchImpl: impl, apiKey: 'k' })
  assert.deepEqual(r, { ok: false, reason: 'model_mismatch', servedModel: 'claude-opus-5' })
})

Deno.test('a refusal, a truncation, an HTTP error or unparseable text is a reason, never a throw', async () => {
  const cases: Array<[unknown, number, string]> = [
    [{ model: WRITER_MODEL, stop_reason: 'refusal', content: [] }, 200, 'refusal'],
    [{ model: WRITER_MODEL, stop_reason: 'max_tokens', content: [] }, 200, 'truncated'],
    [{ error: 'overloaded' }, 529, 'http_error'],
    [{ model: WRITER_MODEL, stop_reason: 'end_turn', content: [{ type: 'text', text: 'not json' }] }, 200, 'unparseable'],
  ]
  for (const [res, status, reason] of cases) {
    const { impl } = stub(res, status)
    const r = await sendChecked('writer', requestBody('writer', PAYLOAD), TICKET, { timeoutMs: 1000, fetchImpl: impl, apiKey: 'k' })
    assert.equal(r.ok ? 'ok' : r.reason, reason)
  }
})

Deno.test('the request: adaptive thinking, effort set, structured output, no fallbacks', () => {
  const b = JSON.parse(requestBody('writer', PAYLOAD))
  assert.equal(b.model, WRITER_MODEL)
  assert.deepEqual(b.thinking, { type: 'adaptive' })
  assert.equal(b.output_config.effort, 'high')
  assert.equal(b.output_config.format.type, 'json_schema')
  assert.equal('fallbacks' in b, false)
  assert.equal(JSON.parse(requestBody('checker', PAYLOAD)).model, CHECKER_MODEL)
})
