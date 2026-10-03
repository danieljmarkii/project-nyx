// EN-9's care state (Engines v3 PR-23, CUL-1417): docs/nyx-care-state-requirements.md §3–§4 and
// §4.6's tested-on list, the C1a co-signs (clinical ruling sheet §2.0a), and AC 1, 4–6, 8, 14–19.
// Run with: deno test supabase/functions/generate-signal/careState.test.ts
//
// Every fixture is built the way the shell hands the step its input: symptom events, the
// logging instants (meals every day unless a case says otherwise), and the owner's answers.

import { assert, assertEquals, assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import type { Finding, SymptomType } from './detection.ts'
import { careClaimReason } from '../../../lib/careClaimScreens.ts'
import {
  binomialUpperTail,
  CARE_STATE_CONFIG,
  careStateOf,
  EMPTY_CARE_RECORD,
  EN9_CARE_STATE_STEP,
  rankWatchedLast,
  rateTestFires,
  type AckFact,
  type CareRecord,
  type CareStateArgs,
  type CareStateFact,
} from './careState.ts'

const DAY = 86_400_000
const NOW_MS = Date.UTC(2026, 8, 30, 21) // Sep 30, 21:00 UTC
const at = (daysAgo: number, hour = 12) => new Date(Date.UTC(2026, 8, 30 - daysAgo, hour)).toISOString()
const dayOf = (daysAgo: number) => at(daysAgo).slice(0, 10)

function chronicity(sign: SymptomType = 'vomit', tier: 'firm' | 'standard' = 'firm'): Finding {
  return {
    type: 'symptom_chronicity', priorityClass: 'safety', symptomType: sign, episodeCount: 20, spanDays: 80,
    activeWeeks: 10, symptomDays: 20, daysSinceLastEpisode: 1, firstOnsetIso: at(160), tier, windowDays: 56,
    associationalOnly: true,
  } as unknown as Finding
}
const burden = (sign: SymptomType = 'vomit'): Finding =>
  ({ type: 'symptom_burden', priorityClass: 'safety', symptomType: sign, tier: 'today', count: 5 } as unknown as Finding)
const insight = (): Finding => ({ type: 'timeofday_clustering', priorityClass: 'insight', symptomType: 'vomit' } as unknown as Finding)

/** Episodes of `sign` on each listed day-ago (one per day at noon unless repeated). */
const events = (sign: SymptomType, daysAgo: number[], hour = 12) =>
  daysAgo.map((d, i) => ({ id: `${sign}-${i}-${d}`, type: sign, occurredAt: at(d, hour), severity: null, occurredAtConfidence: null }))
const everyNth = (n: number, from: number, to = 0) => {
  const out: number[] = []
  for (let d = from; d >= to; d -= n) out.push(d)
  return out
}
const range = (from: number, to: number) => everyNth(1, from, to)

function ack(over: Partial<AckFact> & { daysAgo: number }): AckFact {
  return {
    id: over.id ?? `ack-${over.daysAgo}`,
    sign: over.sign ?? 'vomit',
    source: over.source ?? 'my_vet_knows',
    anchorOn: over.anchorOn ?? dayOf(over.daysAgo),
    createdAt: over.createdAt ?? at(over.daysAgo, 19),
    retracts: over.retracts ?? null,
    trial: over.trial ?? null,
    course: over.course ?? null,
  }
}

interface Case {
  findings?: Finding[]
  symptoms: ReturnType<typeof events>
  acks?: AckFact[]
  record?: Partial<CareRecord>
  loggedDaysAgo?: number[]
  priorFindings?: unknown
  priorGeneratedAtMs?: number | null
  courses?: CareStateArgs['courses']
  lastVisitOn?: string | null
  nowMs?: number
}

function args(c: Case): CareStateArgs {
  const now = c.nowMs ?? NOW_MS
  const nowDaysAgo = Math.round((NOW_MS - now) / DAY)
  return {
    record: { ...EMPTY_CARE_RECORD, acknowledgements: c.acks ?? [], ...c.record },
    symptoms: c.symptoms,
    loggedAt: (c.loggedDaysAgo ?? range(175, nowDaysAgo)).map((d) => at(d, 8)),
    readSinceIso: new Date(now - 180 * DAY).toISOString(),
    lastVisitOn: c.lastVisitOn ?? null,
    courses: c.courses ?? [],
    timezone: 'UTC',
    nowMs: now,
    petName: 'Nyx',
    episodeGapHours: 3,
    recencyDaysFor: () => 14,
    priorFindings: c.priorFindings ?? null,
    priorGeneratedAtMs: c.priorGeneratedAtMs ?? null,
  }
}

function step(c: Case) {
  const findings = (c.findings ?? [chronicity()]).map((finding, rank) => ({ rank, finding }))
  return EN9_CARE_STATE_STEP(findings, args(c))
}
const stateOf = (c: Case, type: Finding['type'] = 'symptom_chronicity', sign: SymptomType = 'vomit'): CareStateFact =>
  careStateOf(step(c).find((r) => r.finding.type === type && (r.finding as { symptomType?: string }).symptomType === sign)!.finding)!

// A stable cat at 2/week across the whole read.
const STABLE = events('vomit', everyNth(3.5, 170).map(Math.round))

// ── The test itself ──

Deno.test('the exact conditional binomial: tails are right, and the test needs both p and the ratio', () => {
  assertStrictEquals(binomialUpperTail(0, 10, 0.5), 1)
  assertStrictEquals(Math.abs(binomialUpperTail(10, 10, 0.5) - 1 / 1024) < 1e-12, true)
  assertStrictEquals(Math.abs(binomialUpperTail(8, 10, 0.5) - 56 / 1024) < 1e-12, true)
  // 8 in 14 logged days against 4 in 28: a quadrupled rate, p ≈ 0.0002.
  assertStrictEquals(rateTestFires(8, 4, 14, 28, CARE_STATE_CONFIG), true)
  // The same rate: never.
  assertStrictEquals(rateTestFires(2, 4, 14, 28, CARE_STATE_CONFIG), false)
  // A big ratio on tiny counts: p too large.
  assertStrictEquals(rateTestFires(1, 0, 14, 28, CARE_STATE_CONFIG), false)
})

// ── §4.6, tested on ──

Deno.test('§4.6 a stable cat at 2/week stays with your vet, and the row asks nothing (AC 4)', () => {
  const s = stateOf({ symptoms: STABLE, acks: [ack({ daysAgo: 40 })] })
  assertStrictEquals(s.state, 'with_vet')
  assert(s.text!.startsWith("Nyx's vomiting, with your vet. You said on Aug 21 Nyx's vet knows. Since Aug 21, 40 days: "), s.text!)
  assert(/: \d+ episodes, with something logged on 40 of 40\.$/.test(s.text!), s.text!)
  assertStrictEquals(/worth/i.test(s.text!), false, 'a watched row carries no ask')
})

Deno.test('§4.6 a true doubling at full logging comes back, with the compared pair and its ask', () => {
  // 2/week until 21 days ago, then daily-ish (6/week).
  const doubling = events('vomit', [...everyNth(3.5, 170, 22).map(Math.round), ...range(20, 0).filter((d) => d % 7 !== 0)])
  const out = step({ symptoms: doubling, acks: [ack({ daysAgo: 60 })] })
  const s = careStateOf(out[0].finding)!
  assertStrictEquals(s.state, 'raised_again')
  assert(s.text!.startsWith('Back because '), s.text!)
  assert(s.text!.includes('worth booking a vet visit'), 'the lane\'s own ask comes back word for word')
  assert(s.text!.includes('You said on Aug 1 Nyx\'s vet knows.'), 'the earlier answer stays, as a fact')
})

Deno.test('§4.2 the rate arm alone: a rise the dense-day arm cannot see comes back, naming the compared pair', () => {
  // 2/week before; then 6 episodes a week packed into 3 days (two a day, 6 h apart): never
  // 4 of 7 days, so only the count can bring it back.
  const packed = [0, 1, 2].flatMap((w) => [1, 3, 5].map((d) => 21 - w * 7 - d + 7)).filter((d) => d >= 0)
  const sym = [
    ...events('vomit', everyNth(3.5, 170, 22).map(Math.round)),
    ...events('vomit', packed, 6),
    ...events('vomit', packed, 14),
  ]
  const a = args({ symptoms: sym, acks: [ack({ daysAgo: 60 })] })
  const out = EN9_CARE_STATE_STEP([{ rank: 0, finding: chronicity() }], { ...a, config: { ...CARE_STATE_CONFIG, denseDayFloor: 8 } })
  const s = careStateOf(out[0].finding)!
  assertStrictEquals(s.state, 'raised_again')
  assertStrictEquals(s.reason, 'rate')
  assert(s.text!.startsWith('Back because the vomiting is coming more often.'), s.text!)
  assert(/\d+ episodes in the last 2 weeks; 8 in the 4 weeks before Aug 1\./.test(s.text!), s.text!)
})

Deno.test('§4.6 a doubling behind a 50% logging lapse does not count, and the row says so', () => {
  const doubling = events('vomit', [...everyNth(3.5, 170, 22).map(Math.round), ...everyNth(2, 20, 0)])
  const logged = [...range(175, 21), ...everyNth(2, 20, 0)]
  const s = stateOf({ symptoms: doubling, acks: [ack({ daysAgo: 60 })], loggedDaysAgo: logged })
  assertStrictEquals(s.state, 'with_vet')
  assert(s.text!.endsWith('Something logged on 7 of the last 14 days, too few to count from.'), s.text!)
})

Deno.test('§4.6 every other day going to daily comes back (the old ceiling is gone)', () => {
  const sym = events('vomit', [...everyNth(2, 170, 22), ...range(21, 0)])
  assertStrictEquals(stateOf({ symptoms: sym, acks: [ack({ daysAgo: 60 })] }).state, 'raised_again')
})

Deno.test('§4.6 a dog with one-day spikes never comes back on one bad day (AC 5)', () => {
  // Stable 2/week plus one garbage-raid day with four episodes 4 h apart, 10 days ago.
  const spike = [...STABLE, ...[6, 10, 14, 18].map((h, i) => ({ id: `spike-${i}`, type: 'vomit' as const, occurredAt: at(10, h), severity: null, occurredAtConfidence: null }))]
  assertStrictEquals(stateOf({ symptoms: spike, acks: [ack({ daysAgo: 40 })] }).state, 'with_vet')
})

Deno.test('§4.6 a January answer, a stand-down, then a recurrence: born raised (AC 14)', () => {
  // Course 1 from 170 to 100 days ago, a 50-day quiet gap, course 2 from 50 days ago.
  const sym = events('vomit', [...everyNth(3, 170, 100), ...everyNth(3, 50, 0)])
  assertStrictEquals(stateOf({ symptoms: sym, acks: [ack({ daysAgo: 120 })] }).state, 'raised')
  // The same answer given inside the current course stands.
  assertStrictEquals(stateOf({ symptoms: sym, acks: [ack({ daysAgo: 30 })] }).state, 'with_vet')
})

Deno.test('§4.6 a visit answer for a visit before the concern\'s onset is refused (AC 14)', () => {
  const sym = events('vomit', everyNth(3, 60, 0))
  const before = ack({ daysAgo: 5, source: 'visit_answer', anchorOn: dayOf(90) })
  const after = ack({ daysAgo: 5, source: 'visit_answer', anchorOn: dayOf(30) })
  assertStrictEquals(stateOf({ symptoms: sym, acks: [before] }).state, 'raised')
  assertStrictEquals(stateOf({ symptoms: sym, acks: [after] }).state, 'with_vet')
})

Deno.test('§4.6 a trial ending mid-concern, and an extension, end the trial-scoped answer', () => {
  const trialAck = (endedOn: string | null, initialTargetDays: number) =>
    ack({ daysAgo: 20, source: 'vet_started_trial', anchorOn: dayOf(30), trial: { startedOn: dayOf(30), endedOn, initialTargetDays } })
  assertStrictEquals(stateOf({ symptoms: STABLE, acks: [trialAck(null, 56)] }).state, 'with_vet')
  assertStrictEquals(stateOf({ symptoms: STABLE, acks: [trialAck(dayOf(3), 56)] }).state, 'raised')
  // Past the INITIAL target: an extended trial re-asks rather than silently extending.
  assertStrictEquals(stateOf({ symptoms: STABLE, acks: [trialAck(null, 28)] }).state, 'raised')
  // The trial-scoped count starts on the trial's first day, and names the trial.
  const s = stateOf({ symptoms: STABLE, acks: [trialAck(null, 56)] })
  assert(s.text!.includes("You said Nyx's vet started the trial for it. Since Aug 31, 31 days: "), s.text!)
})

Deno.test('a vet-started course lapses at its end, 14 days after its last dose, or 56 days with no target', () => {
  const courseAck = (over: Partial<NonNullable<AckFact['course']>>, daysAgo = 20) =>
    ack({ daysAgo, source: 'vet_started_course', anchorOn: dayOf(30), course: { drugLabel: 'Cerenia', startedOn: dayOf(30), endedOn: null, status: 'active', hasTarget: true, lastDoseAt: at(1), ...over } })
  assertStrictEquals(stateOf({ symptoms: STABLE, acks: [courseAck({})] }).state, 'with_vet')
  assert(stateOf({ symptoms: STABLE, acks: [courseAck({})] }).text!.includes("You said Nyx's vet started Cerenia for it."))
  assertStrictEquals(stateOf({ symptoms: STABLE, acks: [courseAck({ endedOn: dayOf(2) })] }).state, 'raised')
  assertStrictEquals(stateOf({ symptoms: STABLE, acks: [courseAck({ status: 'stopped' })] }).state, 'raised')
  assertStrictEquals(stateOf({ symptoms: STABLE, acks: [courseAck({ lastDoseAt: at(20) })] }).state, 'raised')
  assertStrictEquals(stateOf({ symptoms: STABLE, acks: [courseAck({ hasTarget: false, lastDoseAt: null }, 60)] }).state, 'raised')
  // A drug name that makes a care claim is never printed.
  assert(!stateOf({ symptoms: STABLE, acks: [courseAck({ drugLabel: 'Cerenia (helped last time)' })] }).text!.includes('helped'))
})

Deno.test('a retracted answer is not an answer; the newest live one wins', () => {
  const a = ack({ id: 'a', daysAgo: 30 })
  const undo = ack({ id: 'undo', daysAgo: 10, retracts: 'a' })
  assertStrictEquals(stateOf({ symptoms: STABLE, acks: [a, undo] }).state, 'raised')
  const b = ack({ id: 'b', daysAgo: 5 })
  assertEquals(stateOf({ symptoms: STABLE, acks: [a, undo, b] }).ackId, 'b')
})

Deno.test('§4.6 meals logged with symptoms not logged: "something logged", never a bare "logged on" (§4.2)', () => {
  // Vomiting logged until the answer, then none; meals every day.
  const sym = events('vomit', everyNth(3, 170, 15))
  const s = stateOf({ symptoms: sym, acks: [ack({ daysAgo: 14 })] })
  assertStrictEquals(s.state, 'with_vet')
  assert(s.text!.includes('with something logged on 14 of 14'), s.text!)
  assertStrictEquals(/(?<!something )logged on \d+ of \d+/.test(s.text!), false)
})

// ── The reference (§4.2, AC 18) ──

Deno.test('the reference is taken before the anchor when it can be, after it when it cannot, and never slides (AC 18)', () => {
  const pre = stateOf({ symptoms: STABLE, acks: [ack({ daysAgo: 40 })] })
  assertEquals([pre.reference!.beforeAnchor, pre.reference!.loggedDays], [true, 28])
  // Thin logging before the anchor (none for 60 days before it): the first qualifying window after.
  const logged = [...range(175, 101), ...range(40, 0)]
  const post = (now: number) => stateOf({ symptoms: STABLE, acks: [ack({ daysAgo: 45 })], loggedDaysAgo: logged.filter((d) => d >= Math.round((NOW_MS - now) / DAY)), nowMs: now })
  const first = post(NOW_MS)
  assertStrictEquals(first.reference!.beforeAnchor, false)
  const later = post(NOW_MS + 5 * DAY)
  assertEquals(later.reference, first.reference, 'the reference slid')
})

Deno.test('a relabelled record keeps the frozen reference once the record no longer reaches it', () => {
  const frozen = { fromDay: 1, toDay: 28, episodes: 3, loggedDays: 28, beforeAnchor: true }
  // An answer whose 28 days before the anchor are outside the read, no post-anchor window logged.
  const prior = [{ rank: 0, finding: { type: 'symptom_chronicity', symptomType: 'vomit', careState: { state: 'with_vet', ackId: 'old', reference: frozen } } }]
  const old = ack({ id: 'old', daysAgo: 160, anchorOn: dayOf(165) })
  const s = stateOf({ symptoms: events('vomit', everyNth(3, 175, 0)), acks: [old], priorFindings: prior, loggedDaysAgo: range(175, 150) })
  assertEquals(s.reference, frozen)
})

// ── The latch (§4.5, AC 15) ──

Deno.test('raised_again latches until an answer dated after it (AC 15)', () => {
  const prior = [{ rank: 0, finding: { type: 'symptom_chronicity', symptomType: 'vomit', careState: { state: 'raised_again', ackId: 'a', reason: 'rate' } } }]
  const a = ack({ id: 'a', daysAgo: 40 })
  // The record is quiet again; the prior said raised_again for this answer: it stays.
  const s = stateOf({ symptoms: STABLE, acks: [a], priorFindings: prior })
  assertStrictEquals(s.state, 'raised_again')
  assert(s.text!.includes('worth booking a vet visit'))
  // A newer answer clears it.
  assertStrictEquals(stateOf({ symptoms: STABLE, acks: [a, ack({ id: 'b', daysAgo: 2 })], priorFindings: prior }).state, 'with_vet')
  // A prior for a DIFFERENT answer never latches this one (an owner-writable row cannot reach across).
  const other = [{ rank: 0, finding: { type: 'symptom_chronicity', symptomType: 'vomit', careState: { state: 'with_vet', ackId: 'a' } } }]
  assertStrictEquals(stateOf({ symptoms: STABLE, acks: [a], priorFindings: other }).state, 'with_vet')
})

// ── C1a co-signs ──

Deno.test('C1a: diarrhea on two days after the answer brings a watched vomiting concern back, in the ruled words', () => {
  const sym = [...STABLE, ...events('diarrhea', [6, 3])]
  const s = stateOf({ symptoms: sym, acks: [ack({ daysAgo: 40 })] })
  assertStrictEquals(s.state, 'raised_again')
  assertStrictEquals(s.reason, 'co_sign')
  assert(s.text!.startsWith('Back because Nyx has also had loose stools on 2 days since Sep 24.'), s.text!)
})

Deno.test('C1a: one day never; a sign present in the 28 days before the anchor is not new; rows before the answer do not count', () => {
  assertStrictEquals(stateOf({ symptoms: [...STABLE, ...events('diarrhea', [3])], acks: [ack({ daysAgo: 40 })] }).state, 'with_vet')
  assertStrictEquals(stateOf({ symptoms: [...STABLE, ...events('diarrhea', [50, 6, 3])], acks: [ack({ daysAgo: 40 })] }).state, 'with_vet')
  // A re-answer after the diarrhea: the earlier rows do not bounce it straight back.
  const sym = [...STABLE, ...events('diarrhea', [8, 6])]
  assertStrictEquals(stateOf({ symptoms: sym, acks: [ack({ daysAgo: 40 }), ack({ id: 'again', daysAgo: 4 })] }).state, 'with_vet')
})

Deno.test('C1a: lethargy on two days brings back vomiting or diarrhea; cough and itch take no co-signs', () => {
  const lethargyAt = [at(5, 9), at(2, 9)]
  assertStrictEquals(stateOf({ symptoms: STABLE, acks: [ack({ daysAgo: 40 })], record: { lethargyAt } }).state, 'raised_again')
  const cough = events('cough', everyNth(3.5, 170).map(Math.round))
  const s = stateOf({ findings: [chronicity('cough')], symptoms: cough, acks: [ack({ daysAgo: 40, sign: 'cough' })], record: { lethargyAt } }, 'symptom_chronicity', 'cough')
  assertStrictEquals(s.state, 'with_vet')
})

// ── One sign, one state (AC 1) and the pair (GAP-29) ──

Deno.test('an answer about vomiting never changes coughing (AC 1)', () => {
  const sym = [...STABLE, ...events('cough', everyNth(3.5, 170).map(Math.round), 9)]
  const out = step({ findings: [chronicity('vomit'), chronicity('cough')], symptoms: sym, acks: [ack({ daysAgo: 40 })] })
  const byS = Object.fromEntries(out.map((r) => [(r.finding as { symptomType: string }).symptomType, careStateOf(r.finding)!.state]))
  assertEquals(byS, { vomit: 'with_vet', cough: 'raised' })
  // The raised cough leads the watched vomiting.
  assertEquals(out.map((r) => (r.finding as { symptomType: string }).symptomType), ['cough', 'vomit'])
})

Deno.test('the pair: coughing turning chronic after the answer brings watched vomiting back', () => {
  const cough = { ...chronicity('cough'), firstOnsetIso: at(20) } as Finding
  const s = stateOf({ findings: [chronicity('vomit'), cough], symptoms: [...STABLE, ...events('cough', everyNth(2, 20, 0), 9)], acks: [ack({ daysAgo: 40 })] })
  assertStrictEquals(s.state, 'raised_again')
  assertStrictEquals(s.reason, 'pair')
  // A cough course already running before the answer, and already on the prior row, is not a change.
  const old = { ...chronicity('cough'), firstOnsetIso: at(100) } as Finding
  const prior = [{ rank: 0, finding: { type: 'symptom_chronicity', symptomType: 'cough' } }]
  assertStrictEquals(stateOf({ findings: [chronicity('vomit'), old], symptoms: STABLE, acks: [ack({ daysAgo: 40 })], priorFindings: prior, priorGeneratedAtMs: NOW_MS - DAY }).state, 'with_vet')
})

// ── A booked recheck (§4.7, AC 6, AC 16) ──

Deno.test('a recheck about the sign moves with_vet to recheck_booked; anything else does not (AC 6, AC 16)', () => {
  const appt = (over: Partial<CareRecord['appointments'][number]>) => ({ id: 'x', scheduledAt: at(-10, 10), cancelledAt: null, deletedAt: null, aboutSigns: ['vomit' as SymptomType], ...over })
  const with_ = (a: ReturnType<typeof appt>) => stateOf({ symptoms: STABLE, acks: [ack({ daysAgo: 40 })], record: { appointments: [a] } })
  const booked = with_(appt({}))
  assertStrictEquals(booked.state, 'recheck_booked')
  assert(booked.text!.endsWith('Recheck booked for Oct 10.'), booked.text!)
  assertStrictEquals(with_(appt({ cancelledAt: at(1) })).state, 'with_vet')
  assertStrictEquals(with_(appt({ deletedAt: at(1) })).state, 'with_vet')
  assertStrictEquals(with_(appt({ scheduledAt: at(3) })).state, 'with_vet')
  assertStrictEquals(with_(appt({ aboutSigns: ['itch'] })).state, 'with_vet', 'a dental never quiets vomiting')
  // A worsening re-raises straight through a booked recheck.
  const doubling = events('vomit', [...everyNth(3.5, 170, 22).map(Math.round), ...range(20, 0).filter((d) => d % 7 !== 0)])
  assertStrictEquals(stateOf({ symptoms: doubling, acks: [ack({ daysAgo: 60 })], record: { appointments: [appt({})] } }).state, 'raised_again')
})

// ── No zero beside a masking drug or a recent visit (AC 17) ──

Deno.test('no zero on the row beside a masking drug or within 42 days of a visit (AC 17)', () => {
  const quiet = events('vomit', everyNth(3, 170, 15))
  const pred = { drugLabel: 'Prednisolone', names: ['prednisolone'], startedOn: dayOf(14), endedOn: null, status: 'active' }
  const course = stateOf({ symptoms: quiet, acks: [ack({ daysAgo: 14 })], courses: [pred] })
  assertStrictEquals(/\b0 episodes\b/.test(course.text!), false, course.text!)
  assert(course.text!.endsWith('Since Sep 16, 14 days, with something logged on 14 of 14.'), course.text!)
  const visit = stateOf({ symptoms: quiet, acks: [ack({ daysAgo: 14, source: 'at_vet_tick' })] })
  assertStrictEquals(/\b0 episodes\b/.test(visit.text!), false, visit.text!)
  // With neither, the honest zero stands (a count over full logging, never "it worked").
  const plain = stateOf({ symptoms: quiet, acks: [ack({ daysAgo: 14 })] })
  assert(plain.text!.includes(': 0 episodes, with something logged on 14 of 14.'), plain.text!)
})

// ── Ranking (§3.3) and copy (AC 8, AC 19) ──

Deno.test('a watched concern ranks below every other safety finding; nothing else moves', () => {
  const out = step({ findings: [chronicity('vomit'), burden('vomit'), insight()], symptoms: STABLE, acks: [ack({ daysAgo: 40 })] })
  assertEquals(out.map((r) => r.finding.type), ['symptom_burden', 'symptom_chronicity', 'timeofday_clustering'])
  assertEquals(out.map((r) => r.rank), [0, 1, 2])
  // The burden card's object is untouched (AC-3).
  assertEquals(out[0].finding, burden('vomit'))
  // No watched row: the order is returned as it came.
  const rows = [{ rank: 0, finding: insight() }]
  assertStrictEquals(rankWatchedLast(rows), rows)
})

Deno.test('every care-state sentence names the pet and the sign, passes the care-claim screens, and avoids the barred words (AC 8, AC 19)', () => {
  const cases: Case[] = [
    { symptoms: STABLE, acks: [ack({ daysAgo: 40 })] },
    { symptoms: STABLE, acks: [ack({ daysAgo: 40, source: 'at_vet_tick' })] },
    { symptoms: [...STABLE, ...events('diarrhea', [6, 3])], acks: [ack({ daysAgo: 40 })] },
    { symptoms: events('vomit', [...everyNth(2, 170, 22), ...range(21, 0)]), acks: [ack({ daysAgo: 60 })] },
  ]
  for (const c of cases) {
    const s = stateOf(c)
    const t = s.text!
    assert(t.includes('Nyx'), t)
    assert(/vomit/i.test(t), t)
    assertStrictEquals(careClaimReason(t.replace(/worth[^.]*\./g, '')), null, t)
    assertStrictEquals(t.includes('!'), false, t)
    for (const w of ['seen', 'acknowledged', 'resolved', 'watching', 'stood down', 'under control', 'helping']) {
      assertStrictEquals(t.toLowerCase().includes(w), false, `${w}: ${t}`)
    }
  }
})

Deno.test('no answer: the concern is raised and its own sentence stands (text null)', () => {
  const s = stateOf({ symptoms: STABLE })
  assertEquals([s.state, s.text, s.ackId], ['raised', null, null])
})
