// The one writer of every Engines v3 stamp (Engines v3 PR-11a, CUL-1267).
// Run with: deno test supabase/functions/_shared/
//
// Every value is checked against the shape migration 075's CHECK admits. The patterns are
// restated here from supabase/migrations/075_engines_v3_stamps.sql because CI's Deno job
// reads supabase/functions only; a stamp that failed its CHECK would fail the WRITE it rides
// on (the read itself, or the Signal's shown log), so a drift here is a lost read.

import { assertEquals, assertNotEquals, assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  buildIncidentStamps,
  buildShownLogRows,
  canonicalJson,
  engineFingerprint,
  FRAMEWORK_RULE_VERSION,
  photoSetKey,
  sha256Hex,
  signalStampValues,
  standDownMintAllowed,
  stampIncidentWrite,
  type IncidentStamps,
} from './engineStamps.ts'
import { buildFailureWrite } from './incident-analysis.ts'
import type { EngineFlags } from './engineFlags.ts'

// ── 075's CHECKs, restated ───────────────────────────────────────────────────────────
const CHECK = {
  photoSetKey: (v: string) => v.length >= 1 && v.length <= 4000 && /^[0-9a-f,-]+$/.test(v),
  modelId: (v: string) => /^[a-z0-9._:-]{1,100}$/.test(v),
  promptHash: (v: string) => /^[0-9a-f]{64}$/.test(v),
  ruleVersion: (v: string) => /^[a-z0-9._-]{1,64}$/.test(v),
  engineFlags: (v: string[]) => v.length <= 32 && v.every((k) => /^[a-z0-9_]{1,64}$/.test(k)),
  fingerprint: (v: string) => /^[0-9a-f]{64}$/.test(v),
  findingType: (v: string) => /^[a-z0-9_]{1,64}$/.test(v),
  tier: (v: string | null) => v === null || /^[a-z0-9_]{1,32}$/.test(v),
  findingKey: (key: string, type: string) =>
    key.length >= 1 && key.length <= 200 && (key === type || key.startsWith(`${type}:`)),
}

const OFF: EngineFlags = { on: [], readOk: true }
const ON: EngineFlags = { on: ['engines_v3_en0'], readOk: true }
const UUID_A = '0f8e7d6c-5b4a-4938-8271-605f4e3d2c1b'
const UUID_B = '9a8b7c6d-1e2f-4a3b-8c4d-5e6f7a8b9c0d'

const stampsFor = (over: Partial<Parameters<typeof buildIncidentStamps>[0]> = {}) =>
  buildIncidentStamps({
    attachmentIds: [UUID_A],
    descriptorRuleVersion: 'vomit1',
    engineFlags: OFF,
    model: 'claude-sonnet-4-6',
    systemPrompt: 'system',
    tool: { name: 'analyze_vomit', input_schema: { type: 'object' } },
    userMessageText: 'Analyse this photo.',
    ...over,
  })

// ── photo_set_key ────────────────────────────────────────────────────────────────────

Deno.test('photo_set_key: no photo is NULL; photos are their ids, sorted and lowercased', async () => {
  assertStrictEquals(await photoSetKey([]), null)
  assertStrictEquals(await photoSetKey([UUID_B, UUID_A.toUpperCase()]), `${UUID_A},${UUID_B}`)
  assertStrictEquals(await photoSetKey([UUID_A, UUID_B]), await photoSetKey([UUID_B, UUID_A]))
})

Deno.test('photo_set_key: replacing a photo (a new attachment id, B-105) changes the key', async () => {
  assertNotEquals(await photoSetKey([UUID_A]), await photoSetKey([UUID_B]))
  assertNotEquals(await photoSetKey([UUID_A]), await photoSetKey([UUID_A, UUID_B]))
})

Deno.test('photo_set_key: anything that is not a list of ids falls back to a hash, and always passes the CHECK', async () => {
  const cases: unknown[][] = [
    [UUID_A],
    ['not an id, with words'],
    ['a,b'],
    [undefined],
    [42],
    ['https://example.com/signed?token=abc'],
    Array.from({ length: 150 }, (_, i) => `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`),
  ]
  for (const ids of cases) {
    const key = await photoSetKey(ids)
    assertStrictEquals(key !== null && CHECK.photoSetKey(key), true, JSON.stringify(ids).slice(0, 80))
  }
  // The hash form carries no hyphen, so it can never be read as a list of UUIDs.
  const hashed = (await photoSetKey(['https://example.com/x']))!
  assertStrictEquals(/^[0-9a-f]{64}$/.test(hashed), true)
  const long = (await photoSetKey(cases[6]))!
  assertStrictEquals(/^[0-9a-f]{64}$/.test(long), true, 'past 4,000 chars the list is hashed')
})

// ── The per-incident stamps ──────────────────────────────────────────────────────────

Deno.test('the incident stamps: every value passes its 075 CHECK', async () => {
  const s = await stampsFor({ engineFlags: ON })
  assertStrictEquals(CHECK.photoSetKey(s.photoSetKey!), true)
  assertStrictEquals(CHECK.modelId(s.modelId), true)
  assertStrictEquals(CHECK.promptHash(s.promptHash), true)
  assertStrictEquals(CHECK.ruleVersion(s.ruleVersion), true)
  assertStrictEquals(CHECK.engineFlags(s.engineFlags), true)
  assertStrictEquals(s.ruleVersion, `${FRAMEWORK_RULE_VERSION}.vomit1`)
  assertEquals(s.engineFlags, ['engines_v3_en0'])
  assertEquals((await stampsFor({ engineFlags: OFF })).engineFlags, [])
  // A failed flag read runs the flag-off engine, and the stamp says what ran.
  assertEquals((await stampsFor({ engineFlags: { on: [], readOk: false } })).engineFlags, [])
})

Deno.test('prompt_hash moves with anything the model is told, and only with that', async () => {
  const base = (await stampsFor()).promptHash
  assertNotEquals((await stampsFor({ systemPrompt: 'system!' })).promptHash, base)
  assertNotEquals((await stampsFor({ userMessageText: 'Analyse this.' })).promptHash, base)
  assertNotEquals((await stampsFor({ tool: { name: 'analyze_vomit', input_schema: { type: 'array' } } })).promptHash, base)
  // Not with the model (its own stamp), the photos, the rules or the flags.
  assertStrictEquals((await stampsFor({ model: 'claude-other' })).promptHash, base)
  assertStrictEquals((await stampsFor({ attachmentIds: [UUID_B] })).promptHash, base)
  assertStrictEquals((await stampsFor({ engineFlags: ON })).promptHash, base)
  // Not with the order a schema's keys were written in.
  assertStrictEquals((await stampsFor({ tool: { input_schema: { type: 'object' }, name: 'analyze_vomit' } })).promptHash, base)
})

Deno.test('the live descriptors\' model ids and rule versions pass their CHECKs', async () => {
  // Restated: the descriptors are module-private. analyze-vomit/index.ts and
  // analyze-stool/index.ts name these values; change one there, change it here.
  for (const [model, rule] of [['claude-sonnet-4-6', 'vomit1'], ['claude-sonnet-4-6', 'stool1']]) {
    const s = await stampsFor({ model, descriptorRuleVersion: rule })
    assertStrictEquals(CHECK.modelId(s.modelId) && CHECK.ruleVersion(s.ruleVersion), true, `${model} ${rule}`)
  }
})

// ── Which write carries which stamp: a stamp describes the words on the row ───────────

const STAMP_KEYS = ['photo_set_key', 'rule_version', 'engine_flags', 'model_id', 'prompt_hash']
const write = (mode: string, values: Record<string, unknown>) => ({ mode, values })

Deno.test('a full upsert carrying a payload gets every stamp', async () => {
  const s = await stampsFor({ engineFlags: ON })
  const out = stampIncidentWrite(write('upsert', { ai_raw_payload: { x: 1 }, recommendation: 'monitor' }), s)
  assertEquals(out.values, {
    ai_raw_payload: { x: 1 },
    recommendation: 'monitor',
    photo_set_key: UUID_A,
    rule_version: 'f2.vomit1',
    engine_flags: ['engines_v3_en0'],
    model_id: 'claude-sonnet-4-6',
    prompt_hash: s.promptHash,
  })
})

Deno.test('a payload written NULL (no model ran) writes NULL payload stamps, beside the read stamps', async () => {
  const s = await stampsFor()
  const out = stampIncidentWrite(write('upsert', { ai_raw_payload: null }), s)
  assertStrictEquals(out.values.model_id, null)
  assertStrictEquals(out.values.prompt_hash, null)
  assertEquals(out.values.engine_flags, [])
  assertStrictEquals(out.values.rule_version, 'f2.vomit1')
})

Deno.test('a read-only update (owner-edited row) refreshes the read stamps and leaves the payload stamps', async () => {
  const s = await stampsFor()
  const out = stampIncidentWrite(write('update', { recommendation: 'worth_a_call', read_text: 'x' }), s)
  assertStrictEquals('model_id' in out.values, false)
  assertStrictEquals('prompt_hash' in out.values, false)
  assertEquals(Object.keys(out.values).sort(), ['engine_flags', 'photo_set_key', 'read_text', 'recommendation', 'rule_version'])
})

Deno.test('stamping only ADDS stamp columns: every value the builder decided is untouched', async () => {
  const s = await stampsFor({ engineFlags: ON })
  const writes = [
    write('upsert', { event_id: 'e', pet_id: 'p', ai_raw_payload: { a: 1 }, recommendation: 'monitor', dismissed_at: null }),
    write('update', { recommendation: 'worth_a_call', read_text: 'r', status: 'completed', error: null }),
    write('rescue', { event_id: 'e', recommendation: 'worth_a_call', status: 'failed' }),
  ]
  for (const w of writes) {
    const out = stampIncidentWrite(w, s)
    assertStrictEquals(out.mode, w.mode)
    for (const [k, v] of Object.entries(w.values)) assertEquals(out.values[k], v, `${w.mode}.${k}`)
    for (const k of Object.keys(out.values)) {
      assertStrictEquals(k in w.values || STAMP_KEYS.includes(k), true, `${w.mode} gained ${k}`)
    }
  }
})

Deno.test('a stamp overrides a same-named value a builder might carry', async () => {
  const s = await stampsFor()
  const out = stampIncidentWrite(write('update', { engine_flags: ['forged'], rule_version: 'x' }), s)
  assertEquals(out.values.engine_flags, [])
  assertStrictEquals(out.values.rule_version, 'f2.vomit1')
})

Deno.test('the failure write: only the RESCUE (words) is stamped; error-only and the plain upsert are not', async () => {
  const s: IncidentStamps = await stampsFor({ engineFlags: ON })
  const base = {
    eventId: 'evt-1', petId: 'pet-1', incidentType: 'vomit', message: 'Claude API error 529',
    existingReadFailed: false, stamps: s,
  }
  const rescue = { recommendation: 'worth_a_call' as const, read_text: 'Worth a call.', visual_flags: [], contextual_flags: ['repeated_vomiting'] }
  const rescued = buildFailureWrite({ ...base, existing: { recommendation: 'monitor', presentFlags: [] }, rescue })
  assertStrictEquals(rescued.mode, 'rescue')
  if (rescued.mode === 'rescue') {
    assertEquals(rescued.values.engine_flags, ['engines_v3_en0'])
    assertStrictEquals(rescued.values.rule_version, 'f2.vomit1')
    assertStrictEquals(rescued.values.photo_set_key, UUID_A)
    assertStrictEquals('model_id' in rescued.values, false, 'a rescue writes no payload')
  }
  const errorOnly = buildFailureWrite({ ...base, existing: { recommendation: 'worth_a_call', presentFlags: [] }, rescue: null })
  assertStrictEquals(errorOnly.mode, 'error-only')
  if (errorOnly.mode === 'error-only') assertEquals(Object.keys(errorOnly.values), ['error'])
  const plain = buildFailureWrite({ ...base, existing: { recommendation: 'monitor', presentFlags: [] }, rescue: null })
  assertStrictEquals(plain.mode, 'upsert')
  if (plain.mode === 'upsert') {
    for (const k of STAMP_KEYS) assertStrictEquals(k in plain.values, false, `the plain failure write carried ${k}`)
  }
})

// ── The Signal's stamps ──────────────────────────────────────────────────────────────

Deno.test('the cache row stamps pass their CHECKs and record the flags that ran', async () => {
  const fp = await engineFingerprint({ engine: 'generate-signal', version: 'signal.1' })
  assertEquals(signalStampValues(ON, fp), { engine_flags: ['engines_v3_en0'], engine_fingerprint: fp })
  assertStrictEquals(CHECK.fingerprint(fp), true)
  assertEquals(signalStampValues({ on: [], readOk: false }, fp).engine_flags, [])
})

Deno.test('engine_fingerprint: moves with any input, never with key order', async () => {
  const a = await engineFingerprint({ version: 'signal.1', config: { x: 1, y: { z: 2 } }, flags: [] })
  assertStrictEquals(a, await engineFingerprint({ flags: [], config: { y: { z: 2 }, x: 1 }, version: 'signal.1' }))
  assertNotEquals(a, await engineFingerprint({ version: 'signal.2', config: { x: 1, y: { z: 2 } }, flags: [] }))
  assertNotEquals(a, await engineFingerprint({ version: 'signal.1', config: { x: 1, y: { z: 3 } }, flags: [] }))
  assertNotEquals(a, await engineFingerprint({ version: 'signal.1', config: { x: 1, y: { z: 2 } }, flags: ['engines_v3_en0'] }))
  assertStrictEquals(canonicalJson({ b: [1, { d: 1, c: 2 }], a: null }), '{"a":null,"b":[1,{"c":2,"d":1}]}')
})

// A Signal key, as a later phase will add one; the gate's semantics are tested with it.
const READ_BY_SIGNAL = ['engines_v3_en0']

Deno.test('stand-downs: with a key the Signal reads, minted only under the same keys and an answered read', () => {
  assertStrictEquals(standDownMintAllowed([], OFF, READ_BY_SIGNAL), true)
  assertStrictEquals(standDownMintAllowed(['engines_v3_en0'], ON, READ_BY_SIGNAL), true)
  assertStrictEquals(standDownMintAllowed([], ON, READ_BY_SIGNAL), false, 'flag turned on')
  assertStrictEquals(standDownMintAllowed(['engines_v3_en0'], OFF, READ_BY_SIGNAL), false, 'flag rolled back')
  assertStrictEquals(standDownMintAllowed([], { on: [], readOk: false }, READ_BY_SIGNAL), false, 'the read did not answer')
  assertStrictEquals(standDownMintAllowed('engines_v3_en0', ON, READ_BY_SIGNAL), false, 'malformed prior')
  assertStrictEquals(standDownMintAllowed([1], OFF, READ_BY_SIGNAL), false, 'malformed prior element')
})

Deno.test('stand-downs: a key the Signal never reads changes nothing (today: EN-0 flips, failed reads)', () => {
  // The adversarial review's counterexample: allowlisting an owner for EN-0 (a per-incident
  // key) withheld that regen's stand-down, and a withheld stand-down is lost for good.
  assertStrictEquals(standDownMintAllowed([], ON, []), true)
  assertStrictEquals(standDownMintAllowed(['engines_v3_en0'], OFF, []), true)
  assertStrictEquals(standDownMintAllowed([], { on: [], readOk: false }, []), true)
  assertStrictEquals(standDownMintAllowed(['engines_v3_en0'], OFF, ['some_signal_key']), true, 'only the Signal keys are compared')
  assertStrictEquals(standDownMintAllowed([], ON, ['some_signal_key']), true)
})

Deno.test('a PRE-STAMP prior (NULL) was written by the flag-off engine: flag-off mints as today, flag-on does not', () => {
  assertStrictEquals(standDownMintAllowed(null, OFF, READ_BY_SIGNAL), true)
  assertStrictEquals(standDownMintAllowed(undefined, OFF, READ_BY_SIGNAL), true)
  assertStrictEquals(standDownMintAllowed(null, ON, READ_BY_SIGNAL), false)
})

// ── signal_shown_log ────────────────────────────────────────────────────────────────

const GENERATED = '2026-09-27T12:00:00.000Z'
const TEXT = 'Mochi has vomited on 6 of the last 14 days; worth mentioning to your vet.'

Deno.test('the shown log: one row per entry, identity + tier + a hash, and never the text', async () => {
  const rows = await buildShownLogRows({
    petId: 'pet-1',
    generatedAtIso: GENERATED,
    engineFlags: ON,
    fingerprint: await sha256Hex('engine'),
    entries: [
      { text: TEXT, finding: { type: 'symptom_chronicity', symptomType: 'vomit', tier: 'firm' } },
      { text: 'Chicken shows up before…', finding: { type: 'food_symptom_correlation', protein: 'chicken', proteins: ['turkey', 'chicken'], tier: 'early' } },
      { text: 'A possible red flag…', finding: { type: 'incident_red_flag', incidentType: 'vomit' } },
      { text: 'Stood down.', finding: { type: 'stood_down', symptomType: 'vomit', tier: 'standard' } },
      { text: 'Trial day 12.', finding: { type: 'trial_response' } },
    ],
  })
  assertEquals(rows.map((r) => r.finding_key), [
    'symptom_chronicity:vomit',
    'food_symptom_correlation:chicken+turkey',
    'incident_red_flag:vomit',
    'stood_down:vomit',
    'trial_response',
  ])
  assertEquals(rows.map((r) => r.tier), ['firm', 'early', null, 'standard', null])
  assertStrictEquals(rows[0].text_hash, await sha256Hex(TEXT))
  for (const r of rows) {
    assertStrictEquals(CHECK.findingType(r.finding_type), true)
    assertStrictEquals(CHECK.findingKey(r.finding_key, r.finding_type), true, r.finding_key)
    assertStrictEquals(CHECK.tier(r.tier), true)
    assertStrictEquals(CHECK.promptHash(r.text_hash), true)
    assertStrictEquals(CHECK.fingerprint(r.engine_fingerprint), true)
    assertStrictEquals(CHECK.engineFlags(r.engine_flags), true)
    assertEquals(r.engine_flags, ['engines_v3_en0'])
    assertStrictEquals(r.pet_id, 'pet-1')
    assertStrictEquals(r.generated_at, GENERATED)
    // No column carries a word of the sentence.
    assertStrictEquals(JSON.stringify(r).includes('vomited'), false)
  }
})

Deno.test('the shown log skips an entry it cannot shape, rather than failing the batch', async () => {
  const rows = await buildShownLogRows({
    petId: 'pet-1',
    generatedAtIso: GENERATED,
    engineFlags: OFF,
    fingerprint: await sha256Hex('engine'),
    entries: [
      { text: 'ok', finding: { type: 'symptom_worsening', symptomType: 'vomit', tier: 'Not A Tier!' } },
      { text: 'bad', finding: { type: 'Has Spaces' } },
      { text: 'bad', finding: undefined as unknown as { type: string } },
    ],
  })
  assertEquals(rows.map((r) => r.finding_key), ['symptom_worsening:vomit'])
  assertStrictEquals(rows[0].tier, null, 'an out-of-shape tier is dropped, not sent')
})

Deno.test('a key past 200 characters keeps its type and stays one identity', async () => {
  const proteins = Array.from({ length: 40 }, (_, i) => `protein${i}`)
  const entry = { text: 't', finding: { type: 'food_symptom_correlation', protein: 'protein0', proteins } }
  const [row] = await buildShownLogRows({ petId: 'p', generatedAtIso: GENERATED, engineFlags: OFF, fingerprint: 'f'.repeat(64), entries: [entry] })
  assertStrictEquals(CHECK.findingKey(row.finding_key, row.finding_type), true)
  const [again] = await buildShownLogRows({ petId: 'p', generatedAtIso: GENERATED, engineFlags: OFF, fingerprint: 'f'.repeat(64), entries: [entry] })
  assertStrictEquals(row.finding_key, again.finding_key)
})
