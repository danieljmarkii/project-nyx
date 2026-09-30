// The EN-1 scorecard's arithmetic and its seams (Engines v3 PR-16, CUL-1131). Run with:
//   deno test --allow-read=supabase/functions supabase/functions/generate-signal/eval/
//
// These run the SHIPPED pipeline through the real observer, with a stand-in `askOf` (Deno cannot
// load lib/signalHomeLine.ts's closure; the jest suite in scripts/engine-scorecard/ runs the real
// one and proves the register table covers it). What is tested here is what the scorecard does
// with the cards: the rows are what the cards say, a broken engine moves the row that names it,
// and the same seeds give the same file.

import { assert, assertEquals, assertNotEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import type { Finding } from '../detection.ts'
import { runSignalPipeline } from '../pipeline.ts'
import { scenarioById, simulate } from '../../_shared/engineCorpus/trajectory/index.ts'
import type { Observer, ShownCard } from '../../_shared/engineCorpus/trajectory/index.ts'
import { FLAG_OFF, makeSignalObserver, registerOfAsk, type ScoredCard } from './observer.ts'
import { runCorpus } from './run.ts'
import { buildScorecard, DETECT_WINDOW_DAYS, diffScorecards, formatDiff, laneOf, scoreScenario } from './scorecard.ts'
import { rowsAt } from './syntheticRows.ts'
import { visibleAt } from './asOf.ts'

/** A stand-in for Home's ask with the same shape of answer: safety rows ask, benign rows do not.
 *  The real ask (and its exact strings) is proven in the jest suite. */
function standInAsk(f: Finding): string | null {
  if (f.type === 'incident_red_flag') return 'worth a call to your vet'
  if (f.priorityClass === 'safety') return 'worth a word with your vet'
  return null
}

const observer = () => makeSignalObserver({ askOf: standInAsk })

Deno.test('the same seeds give the same scorecard, byte for byte', () => {
  const scenarios = [scenarioById('null-staple-1pm'), scenarioById('inj-red-flag')]
  const a = runCorpus({ observer, arm: 'flag_off', flagsOn: [], seeds: (s) => s.ciSeeds.slice(0, 1), seedsLabel: 'first', scenarios })
  const b = runCorpus({ observer, arm: 'flag_off', flagsOn: [], seeds: (s) => s.ciSeeds.slice(0, 1), seedsLabel: 'first', scenarios })
  assertEquals(JSON.stringify(a.scorecard), JSON.stringify(b.scorecard))
  assert(Object.keys(a.scorecard.rows).length > 20, 'the run measured something')
})

Deno.test('rowsAt applies the as-of rule: a back-filled row is absent before it was written', () => {
  const sc = scenarioById('null-staple-3pm-bursty')
  const r = simulate(sc, sc.ciSeeds[0], () => [])
  const late = r.record.events.find((e) => e.ty === 'vomit' && Date.parse(e.cr) - Date.parse(e.at) > 6 * 3_600_000)
  assert(late, 'the corpus back-fills some rows (pBackfill)')
  const between = Date.parse(late.at) + 60_000
  const ids = (T: number) => rowsAt(r.record, late.petKey, T).symptoms.map((s) => s.id)
  assert(!ids(between).includes(late.id), 'occurred, not yet written: not visible')
  assert(ids(Date.parse(late.cr)).includes(late.id), 'visible once written')
})

Deno.test('rowsAt reads one pet: a two-cat home never lends the other cat its rows', () => {
  const sc = scenarioById('null-two-cat-home')
  const r = simulate(sc, sc.ciSeeds[0], () => [])
  const T = Date.parse(r.shown[r.shown.length - 1].nowIso)
  const [a, b] = sc.pets.map((p) => p.key)
  const idsA = new Set(rowsAt(r.record, a, T).symptoms.map((s) => s.id))
  const idsB = new Set(rowsAt(r.record, b, T).symptoms.map((s) => s.id))
  assert(idsA.size > 0 && idsB.size > 0)
  for (const id of idsA) assert(!idsB.has(id))
  for (const e of r.record.events.filter((x) => x.petKey === a && x.ty === 'vomit' && visibleAt(x, T, 180))) assert(idsA.has(e.id))
})

Deno.test('the observer shows what the shipped pipeline returns for the same rows (no second engine)', () => {
  const sc = scenarioById('inj-red-flag')
  let checked = 0
  const obs = observer()
  const wrapped: Observer = (view) => {
    const cards = obs(view) as ScoredCard[]
    if (view.dayIndex % 30 === 29) {
      const T = Date.parse(view.nowIso)
      const direct = runSignalPipeline({
        rows: rowsAt(view.record, 'a', T),
        incompletePulls: [],
        prior: null,
        nowMs: T,
        engineFlags: FLAG_OFF,
        careRecord: { ownerAnswers: [], appointments: [] },
        careContextFacts: null,
      })
      // The prior only mints stand-down markers, which are not cards; the cards must agree.
      assertEquals(cards.map((c) => c.findingType), direct.findings.map((f) => f.finding.type))
      checked++
    }
    return cards
  }
  simulate(sc, sc.ciSeeds[0], wrapped)
  assert(checked >= 5)
})

Deno.test('registerOfAsk refuses an ask it has no register for, and null is no ask', () => {
  assertEquals(registerOfAsk(null), 'none')
  assertEquals(registerOfAsk('worth a call to your vet today'), 'call')
  assertThrows(() => registerOfAsk('worth a chat with your vet'))
})

Deno.test('every finding type the corpus draws out of the engine has a lane (none is "other")', () => {
  const seen = new Set<string>()
  // Four scenarios that between them draw the safety, food, timing, trial and gap lanes (kept
  // small: this directory runs inside generate-signal's pre-deploy test step, 180 s in all).
  for (const sc of ['inj-enteropathy-onset', 'inj-protein-reaction-hidden', 'inj-red-flag', 'inj-trial-responder'].map(scenarioById)) {
    const r = simulate(sc, sc.ciSeeds[0], observer())
    for (const ev of r.shown) for (const c of ev.cards as ScoredCard[]) seen.add(c.findingType)
  }
  assert(seen.size >= 5, `the corpus drew ${seen.size} finding types`)
  for (const t of seen) assertNotEquals(laneOf({ findingType: t, direction: null }), 'other', t)
})

// ── A broken engine moves the row that names it ──

function dropping(pred: (c: ShownCard) => boolean): () => Observer {
  return () => {
    const inner = observer()
    return (view) => inner(view).filter((c) => !pred(c))
  }
}

function demoting(pred: (c: ShownCard) => boolean): () => Observer {
  return () => {
    const inner = observer()
    return (view) => inner(view).map((c) => (pred(c) ? { ...c, ask: 'word_with_vet' as const } : c))
  }
}

Deno.test('the red-flag property: a dropped or demoted red flag is counted below its shipped tier', () => {
  const sc = scenarioById('inj-red-flag')
  const seeds = () => sc.ciSeeds
  const shipped = runCorpus({ observer, arm: 'off', flagsOn: [], seeds, seedsLabel: 'ci', scenarios: [sc] }).scorecard
  assert((shipped.rows['engine/redFlag/injected'] as number) >= 1, 'a seed carries a red flag')
  assertEquals(shipped.rows['engine/redFlag/belowShippedTier'], 0)
  const isFlag = (c: ShownCard) => c.findingType === 'incident_red_flag'
  for (const broken of [dropping(isFlag), demoting(isFlag)]) {
    const card = runCorpus({ observer: broken, arm: 'off', flagsOn: [], seeds, seedsLabel: 'ci', scenarios: [sc] }).scorecard
    assertEquals(card.rows['engine/redFlag/belowShippedTier'], shipped.rows['engine/redFlag/injected'])
  }
})

Deno.test('a detection the engine loses moves its probability row, and the diff names it', () => {
  const sc = scenarioById('inj-enteropathy-onset')
  const run = (obs: () => Observer) => runCorpus({ observer: obs, arm: 'off', flagsOn: [], seeds: () => sc.ciSeeds.slice(0, 1), seedsLabel: 'first', scenarios: [sc] }).scorecard
  const shipped = run(observer)
  const key = Object.keys(shipped.rows).find((k) => /\/detect\/a:chronic:vomit\/probability$/.test(k))!
  assert(key && (shipped.rows[key] as number) > 0, `${key} is detected by the shipped engine`)
  const blind = run(dropping((c) => c.findingType === 'symptom_chronicity'))
  assertEquals(blind.rows[key], 0)
  const changes = diffScorecards(shipped, blind)
  assert(changes.some((c) => c.key === key))
  assert(formatDiff(changes, shipped, blind).includes(key))
  assert(formatDiff([], shipped, shipped).includes('No row moved'))
})

Deno.test('a false card on a null pet moves its false-card, lane, safety and whole-engine rows', () => {
  const nul = scenarioById('null-staple-1pm')
  assert(nul.key.falseCards.some((f) => f.lane === 'chronic'), 'a chronicity card is false on this pet')
  // Inject a chronicity card every evening from day 30: the false-card share must reach 1.
  const loud: () => Observer = () => {
    const inner = observer()
    return (view) => [
      ...inner(view),
      ...(view.dayIndex >= 30 ? [{ petKey: 'a', findingType: 'symptom_chronicity', sign: 'vomit' as const, ask: 'word_with_vet' as const, priorityClass: 'safety', tier: null, proteins: [], direction: null }] : []),
    ]
  }
  const runs = nul.ciSeeds.map((seed) => ({ scenario: nul, seed, result: simulate(nul, seed, loud()) }))
  const score = scoreScenario(runs)
  assertEquals(score.falseShare[180], 1)
  assertEquals(score.laneShare[180].chronic, 1)
  assertEquals(score.safetyShare[180], 1)
  assertEquals(score.medianDaysToFirstSafety !== null && score.medianDaysToFirstSafety <= 30, true)
  const card = buildScorecard([score], { arm: 'x', seeds: 'ci', horizons: [180, 365], scenarios: 1, scenarioIds: ['null-staple-1pm'], flagsOn: [] })
  assertEquals(card.rows['null-staple-1pm/falseCard/180d'], 1)
  assertEquals(card.rows['engine/null/falseCard/worst/180d'], 1)
})

// ── The onset rule against the second adversarial pass's counterexamples ──

Deno.test('detection scores only pets clear before the start: a standing card, or one with a one-evening gap, is never credited', () => {
  const sc = scenarioById('inj-rate-doubling')
  const entry = sc.key.detect.find((d) => d.lane === 'worsening')!
  assert('day' in entry.from)
  const from = entry.from.day
  const label = `a:worsening:${entry.sign}`
  const worsening = { petKey: 'a', findingType: 'symptom_worsening', sign: entry.sign!, ask: 'word_with_vet' as const, priorityClass: 'safety', tier: 'standard', proteins: [], direction: null }
  const scripted = (on: (day: number) => boolean): () => Observer => () => (view) => (on(view.dayIndex) ? [worsening] : [])
  const score = (on: (day: number) => boolean) => {
    const runs = sc.ciSeeds.map((seed) => ({ scenario: sc, seed, result: simulate(sc, seed, scripted(on)()) }))
    return scoreScenario(runs).detections.find((d) => d.label === label)!
  }
  // Standing from four days before the start and never off: not scored, reported.
  const standing = score((d) => d >= from - 4)
  assertEquals([standing.eligible, standing.detected, standing.showingAtStart], [0, 0, sc.ciSeeds.length])
  // The same card with one evening off after the start: still not credited (was a detection before).
  const flicker = score((d) => d >= from - 4 && d !== from + 10)
  assertEquals([flicker.eligible, flicker.detected], [0, 0])
  // Clear before the start, first shown five days in: a five-day detection.
  const fresh = score((d) => d >= from + 5)
  assertEquals([fresh.eligible, fresh.detected, fresh.medianDays], [sc.ciSeeds.length, sc.ciSeeds.length, 5])
  // Clear, and nothing until after the detection window: a miss, not a slow detection.
  const late = score((d) => d >= from + DETECT_WINDOW_DAYS + 1)
  assertEquals([late.eligible, late.detected], [sc.ciSeeds.length, 0])
})

Deno.test('a re-raise is never read off the ask that led to a late acknowledgement', () => {
  // Third adversarial pass: the fixed-day doubling (start day 90), the engine asking days 80 to 94,
  // the acknowledgement on day 95, and nothing after. That pre-acknowledgement ask was scored as a
  // day-0 re-raise; now the pet is left out and counted.
  const sc = scenarioById('own-visit-doubling-fixed')
  const entry = sc.key.detect.find((d) => d.lane === 're_raise')!
  assert('day' in entry.from)
  const from = entry.from.day
  const ask = { petKey: 'a', findingType: 'symptom_chronicity', sign: 'vomit' as const, ask: 'book_visit' as const, priorityClass: 'safety', tier: 'firm', proteins: [], direction: null }
  const late = from + 5
  const runs = sc.ciSeeds.map((seed) => {
    const result = simulate(sc, seed, () => [])
    result.shown = result.shown.map((ev) => ({ ...ev, cards: ev.day >= from - 10 && ev.day < late ? [ask] : [] }))
    result.truth.acks = [{ petKey: 'a', sign: 'vomit', day: late, via: 'visit' }]
    return { scenario: sc, seed, result }
  })
  const d = scoreScenario(runs).detections.find((x) => x.label === 'a:re_raise:vomit')!
  assertEquals([d.ackTooLate, d.eligible, d.detected, d.raisedBeforeStart], [sc.ciSeeds.length, 0, 0, null])
})

Deno.test('wrongProtein counts any card naming another protein, a joint card included; the culprit alone is right', () => {
  const sc = scenarioById('inj-protein-reaction-rr3')
  const entry = sc.key.detect.find((d) => d.lane === 'food')!
  const label = `a:food:${entry.protein}`
  const card = (proteins: string[]) => ({ petKey: 'a', findingType: 'food_symptom_correlation', sign: 'vomit' as const, ask: 'none' as const, priorityClass: 'insight', tier: 'established', proteins, direction: null })
  const score = (proteins: string[]) => {
    const runs = sc.ciSeeds.map((seed) => ({ scenario: sc, seed, result: simulate(sc, seed, (view) => (view.dayIndex >= 30 ? [card(proteins)] : [])) }))
    return scoreScenario(runs).detections.find((d) => d.label === label)!
  }
  const alone = score([entry.protein!])
  assertEquals([alone.wrongProtein, alone.jointWithReacting], [0, 0])
  const joint = score([entry.protein!, 'lamb'])
  assertEquals([joint.wrongProtein, joint.jointWithReacting], [1, 1])
  const other = score(['lamb'])
  assertEquals([other.wrongProtein, other.jointWithReacting], [1, 0])
})
