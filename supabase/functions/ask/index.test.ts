// Tests for the Ask handler's consent gate (CUL-552 PR 2). Run with:
// deno test --allow-read=supabase/functions supabase/functions/ask/index.test.ts
//
// The handler builds its own clients from the environment, so the gate's ORDER is pinned on
// the source (the generate-signal / EN-F precedent) and the declined answer's behaviour is
// driven through consentOffAnswer with a fake client. The read's own fail-closed rule is
// _shared/aiConsent.test.ts's; the deflection's copy is answer.test.ts's.

import * as assert from 'node:assert/strict'
import { consentOffAnswer, mapEngineFindings, refusedRowsAnswer, refusedRowsClaimed, UNSENT_ROWS_PULL, withUnsentRows } from './index.ts'
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

// CUL-1982: the phone's unsent rows make the server's copy incomplete, so Ask answers nothing over
// it. The client's side (what counts as unsent, a failed read is yes) is lib/ask.test.ts's.
Deno.test('withUnsentRows — strictly true adds the unsent pull; an older build or a non-boolean keeps today', () => {
  assert.deepEqual(withUnsentRows([], true), [UNSENT_ROWS_PULL])
  assert.deepEqual(withUnsentRows(['events'], true), ['events', UNSENT_ROWS_PULL])
  for (const v of [undefined, false, null, 'true', 1, {}]) assert.deepEqual(withUnsentRows(['events'], v), ['events'])
  assert.deepEqual(withUnsentRows([], undefined), [])
})

Deno.test('CUL-1982 wiring — the client flag joins recordIncomplete before the deflect branch, which leads with safety and spends no credit', async () => {
  const { blankComments } = await import('../_shared/sourceScan.testutil.ts')
  const src = blankComments(await Deno.readTextFile(new URL('./index.ts', import.meta.url)))
  const handler = src.slice(src.indexOf('const handler = async'))
  assert.match(handler, /const unsentRows = body\.unsent_rows\n/)
  const merge = handler.indexOf('recordIncomplete: withUnsentRows(fetched.recordIncomplete, unsentRows)')
  assert.ok(merge > 0, 'the unsent flag no longer joins recordIncomplete')
  assert.ok(handler.indexOf('fetchContext(') < merge, 'the flag is merged before the record is read')
  const branch = handler.indexOf('if (ctx.recordIncomplete.length > 0) {')
  assert.ok(branch > merge, 'the deflect branch runs before the unsent flag is merged')
  assert.ok(handler.indexOf('runAskLoop(') > branch, 'the model runs before the incomplete-record branch')
  const body = handler.slice(branch, handler.indexOf('runAskLoop('))
  // Unsent entries among the causes get their own copy; a server-side short pull alone keeps today's.
  assert.match(body, /const withheld = ctx\.recordIncomplete\.includes\(UNSENT_ROWS_PULL\)\s*\? buildDeflection\('unsent_rows', ctx\.petName\)\s*: buildDeflection\('llm_unavailable', ctx\.petName\)/)
  assert.match(body, /safetyLead: leadingSafetyText\(ctx\.engineFindingsRaw, ctx\.petName\)/)
  assert.match(body, /conversationCredited: alreadyCredited/)
  assert.doesNotMatch(body, /recordUsage\(/)
  // No second reading of the record's completeness skips the merged list.
  assert.equal(handler.split('fetched.recordIncomplete').length - 1, 1)
})

// CUL-2004: an entry the server refused is missing from its copy until the owner acts, so Ask
// declines with copy naming the fix. The client's side (which rows count, a failed read) is
// lib/ask.test.ts's; the copy is answer.test.ts's.
Deno.test('refusedRowsClaimed — strictly true; an older build or a non-boolean keeps today', () => {
  assert.equal(refusedRowsClaimed(true), true)
  for (const v of [undefined, false, null, 'true', 1, {}]) assert.equal(refusedRowsClaimed(v), false)
})

Deno.test('refusedRowsAnswer — the live safety finding leads, only the Signal cache is read, the credit is carried not committed', async () => {
  const { client, tables } = fakeSignals(() => ({ data: [{ findings: [BENIGN, SAFETY] }], error: null }))
  const body = await refusedRowsAnswer(client, 'pet-1', 'Biscuit', false)
  assert.equal(body.safetyLead, SAFETY.text)
  assert.equal(body.outcome, 'llm_unavailable')
  assert.equal(body.substantive, false)
  assert.equal(body.conversationCredited, false)
  assert.equal(body.headline, `An entry on this phone couldn't be saved.`)
  assert.deepEqual(tables, ['ai_signals'])
  // A conversation that already committed its credit stays credited (follow-ups never re-commit).
  const { client: c2 } = fakeSignals(() => ({ data: [{ findings: [SAFETY] }], error: null }))
  assert.equal((await refusedRowsAnswer(c2, 'pet-1', 'Biscuit', true)).conversationCredited, true)
})

Deno.test('refusedRowsAnswer — no safety finding, a failed read or a throw lead with nothing, and still decline', async () => {
  for (const answer of [
    () => ({ data: [{ findings: [BENIGN] }], error: null }),
    () => ({ data: null, error: { message: 'unreachable' } }),
    () => { throw new Error('network') },
  ]) {
    const { client } = fakeSignals(answer)
    const body = await quiet(() => refusedRowsAnswer(client, 'pet-1', 'Biscuit', false))
    assert.equal(body.safetyLead, null)
    assert.equal(body.substantive, false)
    assert.match(body.detail, /save it again, or remove it, then ask again/)
  }
})

Deno.test('CUL-2004 wiring — a refused entry declines after consent and before any cap, record read or model call', async () => {
  const { blankComments } = await import('../_shared/sourceScan.testutil.ts')
  const src = blankComments(await Deno.readTextFile(new URL('./index.ts', import.meta.url)))
  const handler = src.slice(src.indexOf('const handler = async'))
  const gate = handler.indexOf('if (refusedRowsClaimed(body.refused_rows)) {')
  assert.ok(gate > 0, 'the refused-rows gate is gone from the handler')
  const branch = handler.slice(gate, handler.indexOf('\n    }', gate))
  assert.match(branch, /return answerResponse\(await refusedRowsAnswer\(client, petId, pet\.name \|\| 'your pet', conversationAlreadyCredited\(conversation\)\)\)/)
  assert.ok(handler.indexOf('readAiBoundaryConsent(') < gate, 'consent no longer decides first')
  for (const before of ['client.auth.getUser()', "from('pets')", 'featureDisabledResponse()']) {
    const at = handler.indexOf(before)
    assert.ok(at > 0 && at < gate, `${before} no longer precedes the refused-rows gate`)
  }
  // Nothing that reads or spends a unit, reads the record or calls a model runs before it, so a
  // closed Ask costs the owner nothing however often they retry.
  for (const after of ['resolveAskCaps(', 'readConversationMonthCount(', 'recordUsage(', 'ANTHROPIC_API_KEY', 'fetchContext(', 'runAskLoop(']) {
    const at = handler.indexOf(after)
    assert.ok(at > gate, `${after} runs before the refused-rows gate`)
  }
  // Refused outranks unsent: the unsent deflection is only reachable past this gate.
  assert.ok(handler.indexOf("buildDeflection('unsent_rows'") > gate)
})
