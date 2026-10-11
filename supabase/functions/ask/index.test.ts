// Tests for the Ask handler's consent gate (CUL-552 PR 2). Run with:
// deno test --allow-read=supabase/functions supabase/functions/ask/index.test.ts
//
// The handler builds its own clients from the environment, so the gate's ORDER is pinned on
// the source (the generate-signal / EN-F precedent) and the declined answer's behaviour is
// driven through consentOffAnswer with a fake client. The read's own fail-closed rule is
// _shared/aiConsent.test.ts's; the deflection's copy is answer.test.ts's.

import * as assert from 'node:assert/strict'
import { consentOffAnswer, mapEngineFindings } from './index.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SAFETY = { rank: 1, text: 'Biscuit has had loose stool on 5 of the last 7 days — worth a word with your vet.', finding: { type: 'symptom_worsening', priorityClass: 'safety' } }
const BENIGN = { rank: 2, text: 'Biscuit eats salmon most.', finding: { type: 'reflection', priorityClass: 'reflective' } }

function fakeSignals(answer: () => { data: unknown; error: { message: string } | null }) {
  const tables: string[] = []
  const client = {
    from(t: string) {
      tables.push(t)
      const q = {
        select() { return q },
        eq() { return q },
        order() { return q },
        limit() { return Promise.resolve().then(answer) },
      }
      return q
    },
  }
  return { client: client as unknown as SupabaseClient, tables }
}

function quiet<T>(fn: () => Promise<T>): Promise<T> {
  const warn = console.warn
  console.warn = () => {}
  return fn().finally(() => { console.warn = warn })
}

Deno.test('consentOffAnswer — the live safety finding still leads the deflection, and only the Signal cache is read', async () => {
  const { client, tables } = fakeSignals(() => ({ data: [{ findings: [BENIGN, SAFETY] }], error: null }))
  const body = await consentOffAnswer(client, 'pet-1', 'Biscuit')
  assert.equal(body.safetyLead, SAFETY.text)
  assert.equal(body.outcome, 'unsupported')
  assert.equal(body.substantive, false)
  assert.equal(body.conversationCredited, false)
  assert.match(body.headline, /AI analysis is off/)
  assert.deepEqual(tables, ['ai_signals'])
})

Deno.test('consentOffAnswer — no safety finding, a failed read or a throw lead with nothing (silence is not wellness)', async () => {
  for (const answer of [
    () => ({ data: [{ findings: [BENIGN] }], error: null }),
    () => ({ data: [], error: null }),
    () => ({ data: null, error: { message: 'unreachable' } }),
    () => { throw new Error('network') },
  ]) {
    const { client } = fakeSignals(answer)
    const body = await quiet(() => consentOffAnswer(client, 'pet-1', 'Biscuit'))
    assert.equal(body.safetyLead, null)
    assert.match(body.detail, /Nothing was sent/)
  }
})

Deno.test('mapEngineFindings — the relay shape, and nothing from a malformed row', () => {
  assert.deepEqual(mapEngineFindings([{ findings: [SAFETY] }]), [
    { type: 'symptom_worsening', priorityClass: 'safety', payload: { text: SAFETY.text, type: 'symptom_worsening', priorityClass: 'safety' } },
  ])
  assert.deepEqual(mapEngineFindings(null), [])
  assert.deepEqual(mapEngineFindings([{ findings: 'x' }]), [])
  assert.deepEqual(mapEngineFindings([{ findings: [{ text: 'no type' }] }]), [])
})

Deno.test('CUL-552 wiring — the consent gate runs for the verified uid before any unit, record read or model call', async () => {
  const { blankComments } = await import('../_shared/sourceScan.testutil.ts')
  const src = blankComments(await Deno.readTextFile(new URL('./index.ts', import.meta.url)))
  const handler = src.slice(src.indexOf('const handler = async'))
  const gate = handler.indexOf('if (!(await readAiBoundaryConsent(serviceClient(), user.id))) {')
  assert.ok(gate > 0, 'the consent gate is gone from the handler, or no longer reads service-role for the verified uid')
  assert.match(handler.slice(gate, gate + 200), /return answerResponse\(await consentOffAnswer\(client, petId, /)
  // Ownership and the flag decide first (a foreign pet is still a 404, a flag-off caller still
  // sees the feature hidden), and getUser before both.
  for (const before of ['client.auth.getUser()', "from('pets')", 'featureDisabledResponse()']) {
    const at = handler.indexOf(before)
    assert.ok(at > 0 && at < gate, `${before} no longer precedes the consent gate`)
  }
  // Nothing that spends a unit, reads the record or calls a model runs before it.
  for (const after of ['readConversationMonthCount(', 'recordUsage(', 'ANTHROPIC_API_KEY', 'fetchContext(', 'runAskLoop(']) {
    const at = handler.indexOf(after)
    assert.ok(at > gate, `${after} runs before the consent gate`)
  }
  assert.equal(handler.split('readAiBoundaryConsent(').length - 1, 1, 'a second consent read in the handler')
})
