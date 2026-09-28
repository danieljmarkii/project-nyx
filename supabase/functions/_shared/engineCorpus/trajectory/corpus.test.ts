// The trajectory corpus is what it says it is (Engines v3 PR-15, CUL-508).
// Run with: deno test --allow-read=supabase/functions supabase/functions/_shared/engineCorpus/
//
// Every truth claim is MEASURED from generated rows, over many seeds, never re-derived from
// the generator's own constants (C-34: a test that restates the rule is a tautology with
// fixtures). The expected values are the scenario's stated effect (rr 3, a doubling), read off
// the scenario spec, and the tolerances are wide enough for seed noise and narrow enough that
// a generator that silently dropped the effect goes red.

import { assert, assertEquals, assertNotEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { NULL_OBSERVER, REQUIRED_COVERAGE, scenarioById, simulate, TRAJECTORY_CORPUS, withRate } from './index.ts'
import type { CoverageTag, EffectStart, Observer, ScenarioSpec, SimulationResult, Sign } from './index.ts'
import { MINTED_ID } from './rng.ts'
import { DAY_MS, localDayIndex, localHour } from './time.ts'

// ─── helpers ───────────────────────────────────────────────────────────────────────────

/** An engine stand-in that asks about `sign` for every pet from `fromDay` on. */
function askFrom(fromDay: number, sign: Sign = 'vomit', ask: 'book_visit' | 'none' = 'book_visit'): Observer {
  return (v) => (v.dayIndex >= fromDay ? v.record.pets.map((p) => ({ petKey: p.key, findingType: 'chronicity', sign, ask, priorityClass: 'safety' })) : [])
}

const SEEDS = (n: number) => Array.from({ length: n }, (_, i) => 1000 + i)

// Simulations are pure functions of (scenario, seed, observer), so the pooled measurements
// share them. This keeps the file fast enough for deploy-edge.sh, which runs every _shared
// suite before each deploy under a 180-second timeout.
const OBSERVERS = { null: NULL_OBSERVER, ask20: askFrom(20) } as const
const memo = new Map<string, SimulationResult>()
function sim(sc: ScenarioSpec, seed: number, observer: keyof typeof OBSERVERS = 'null'): SimulationResult {
  const key = `${sc.id}|${seed}|${observer}`
  let r = memo.get(key)
  if (!r) {
    r = simulate(sc, seed, OBSERVERS[observer])
    memo.set(key, r)
  }
  return r
}

/** The day an instant belongs to, with days starting at 06:00 local (see time.ts). */
function careDay(sc: ScenarioSpec, isoAt: string): number {
  return localDayIndex(Date.parse(isoAt), sc.startDate, sc.tz, 6)
}

/** Truth episodes per day, by care day, for one pet and sign. */
function episodesByDay(sc: ScenarioSpec, r: SimulationResult, petKey: string, sign: Sign): Map<number, number> {
  const out = new Map<number, number>()
  for (const e of r.truth.episodes) if (e.petKey === petKey && e.sign === sign) out.set(careDay(sc, e.at), (out.get(careDay(sc, e.at)) ?? 0) + 1)
  return out
}

/** Pooled over seeds: episode rate on days the pet ate `protein` over the rate on days it did not. */
function proteinRateRatio(sc: ScenarioSpec, protein: string, seeds: number[], source: 'truth' | 'logged'): number {
  let expDays = 0, expEp = 0, unDays = 0, unEp = 0
  for (const seed of seeds) {
    const r = sim(sc, seed)
    const proteinsOf = new Map(r.record.foods.map((f) => [f.id, f.proteins]))
    const exposed = new Set<number>()
    const meals = source === 'truth' ? r.truth.meals.map((m) => ({ at: m.at, foodItemId: m.foodItemId })) : r.record.meals
    for (const m of meals) if (proteinsOf.get(m.foodItemId)!.includes(protein)) exposed.add(careDay(sc, m.at))
    const counts = new Map<number, number>()
    if (source === 'truth') for (const [d, n] of episodesByDay(sc, r, 'a', 'vomit')) counts.set(d, n)
    else for (const e of r.record.events) if (e.ty === 'vomit' && e.del === null) counts.set(careDay(sc, e.at), (counts.get(careDay(sc, e.at)) ?? 0) + 1)
    for (let d = 1; d < sc.days - 1; d++) {
      if (exposed.has(d)) { expDays++; expEp += counts.get(d) ?? 0 } else { unDays++; unEp += counts.get(d) ?? 0 }
    }
  }
  return expEp / expDays / (unEp / unDays)
}

/** Pooled over seeds: truth episodes per day in [from, to) for pet 'a'. */
function ratePerDay(sc: ScenarioSpec, sign: Sign, seeds: number[], from: number, to: number, observer: keyof typeof OBSERVERS = 'null', anchor?: (r: SimulationResult) => number | null): number {
  let n = 0, days = 0
  for (const seed of seeds) {
    const r = sim(sc, seed, observer)
    const base = anchor ? anchor(r) : 0
    if (base === null) continue
    const lo = base + from, hi = Math.min(base + to, sc.days)
    if (hi <= lo) continue
    days += hi - lo
    for (const e of r.truth.episodes) {
      if (e.petKey !== 'a' || e.sign !== sign) continue
      const d = localDayIndex(Date.parse(e.at), sc.startDate, sc.tz)
      if (d >= lo && d < hi) n++
    }
  }
  return n / days
}

const within = (x: number, lo: number, hi: number, what: string) => assert(x >= lo && x <= hi, `${what}: ${x.toFixed(3)} not in [${lo}, ${hi}]`)

// ─── the record is well-formed, synthetic and deterministic ────────────────────────────

Deno.test('the same seed gives the same pet, byte for byte; another seed gives another', () => {
  for (const sc of TRAJECTORY_CORPUS) {
    const a = JSON.stringify(simulate(sc, 7))
    assertEquals(JSON.stringify(simulate(sc, 7)), a, sc.id)
    assertNotEquals(JSON.stringify(simulate(sc, 8)), a, sc.id)
  }
})

Deno.test('scenario ids are unique and every scenario says why it exists', () => {
  const ids = TRAJECTORY_CORPUS.map((s) => s.id)
  assertEquals(new Set(ids).size, ids.length)
  for (const sc of TRAJECTORY_CORPUS) {
    assert(sc.rationale.length > 80, `${sc.id}: a rationale says where the numbers come from`)
    assert(sc.truth.length > 20, `${sc.id}: states its answer key`)
    assert(sc.ciSeeds.length > 0, `${sc.id}: has committed CI seeds`)
  }
})

Deno.test('every id was minted by the corpus, and no pet is a demo or dogfood pet', () => {
  // Demo pet (scripts/demo/demoStory.ts) and the evaluation subjects (scripts/engine-replay/evaluationSubjects.ts).
  const FORBIDDEN_NAMES = ['cooper', 'nyx', 'schrodingers cat']
  for (const sc of TRAJECTORY_CORPUS) {
    for (const p of sc.pets) assert(!FORBIDDEN_NAMES.includes(p.name.toLowerCase()), `${sc.id}: ${p.name}`)
    const r = simulate(sc, sc.ciSeeds[0], askFrom(15))
    const rec = r.record
    const ids = [
      ...rec.events.map((e) => e.id),
      ...rec.meals.map((m) => m.id),
      ...rec.meals.map((m) => m.foodItemId),
      ...rec.foods.map((f) => f.id),
      ...rec.arrangements.map((a) => a.id),
      ...rec.analyses.map((a) => a.event_id),
      ...rec.weightChecks.map((w) => w.event_id),
      ...rec.appointments.map((a) => a.id),
      ...rec.visits.map((v) => v.id),
      ...r.truth.episodes.map((e) => e.id),
    ]
    for (const id of ids) assert(MINTED_ID.test(id), `${sc.id}: ${id} was not minted here`)
  }
})

Deno.test('logged rows keep the app’s invariants: UTC, created after occurred, windows bounded, deletes soft', () => {
  const isUtc = (s: string) => /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s)
  for (const sc of TRAJECTORY_CORPUS) {
    for (const seed of sc.ciSeeds) {
      const { record: rec, truth } = simulate(sc, seed, askFrom(15))
      const petKeys = new Set(rec.pets.map((p) => p.key))
      const byId = new Map(rec.events.map((e) => [e.id, e]))
      for (const e of rec.events) {
        assert(petKeys.has(e.petKey), `${sc.id}: ${e.id} names a pet`)
        assert(isUtc(e.at) && isUtc(e.cr), `${sc.id}: ${e.id} UTC`)
        assert(Date.parse(e.at) <= Date.parse(e.cr), `${sc.id}: ${e.id} created before it occurred`)
        if (e.cf === 'window') {
          assert(e.ea !== null && e.la !== null && Date.parse(e.ea) <= Date.parse(e.la) && e.la === e.at, `${sc.id}: ${e.id} window`)
        } else {
          assertEquals([e.ea, e.la], [null, null], `${sc.id}: ${e.id} a point row carries no window`)
        }
        if (e.del !== null) assert(Date.parse(e.del) > Date.parse(e.cr), `${sc.id}: ${e.id} deleted after it was written`)
      }
      for (const m of rec.meals) assert(isUtc(m.at) && Date.parse(m.at) <= Date.parse(m.cr), `${sc.id}: meal ${m.id}`)
      for (const a of rec.analyses) {
        const ev = byId.get(a.event_id)
        assert(ev && ev.ty === 'vomit', `${sc.id}: a photo read belongs to a vomit row`)
        assert(Date.parse(a.created_at) > Date.parse(ev.cr), `${sc.id}: a read is written after its row`)
      }
      for (const w of rec.weightChecks) assertEquals(byId.get(w.event_id)?.ty, 'weight_check', `${sc.id}: weight child`)
      // The truth ledger's logged ids point at real rows, and a found pile's true time sits inside its window.
      for (const t of truth.episodes) {
        for (const id of t.loggedEventIds) {
          const ev = byId.get(id)!
          assert(ev, `${sc.id}: truth points at ${id}`)
          if (ev.cf === 'window') assert(Date.parse(ev.ea!) <= Date.parse(t.at) && Date.parse(t.at) <= Date.parse(ev.la!), `${sc.id}: true time inside its window`)
        }
      }
    }
  }
})

// ─── truth: null pets are null ─────────────────────────────────────────────────────────

Deno.test('null rates land on their stated monthly rate, and the bursty ones are overdispersed', () => {
  for (const [id, perMonth, bursty] of [['null-staple-1pm', 1, false], ['null-staple-3pm-bursty', 3, true], ['null-rotating-1pm', 1, false]] as const) {
    const sc = scenarioById(id)
    assertEquals(sc.pets[0].signs[0].rate.perMonth, perMonth)
    const monthly: number[] = []
    for (const seed of SEEDS(60)) {
      const r = sim(sc, seed)
      for (let m = 0; m < 6; m++) monthly.push(r.truth.episodes.filter((e) => { const d = localDayIndex(Date.parse(e.at), sc.startDate, sc.tz); return d >= m * 30 && d < (m + 1) * 30 }).length)
    }
    const mean = monthly.reduce((s, x) => s + x, 0) / monthly.length
    const variance = monthly.reduce((s, x) => s + (x - mean) ** 2, 0) / (monthly.length - 1)
    within(mean, perMonth * 0.85, perMonth * 1.15, `${id} mean per month`)
    if (bursty) assert(variance > mean * 1.5, `${id}: variance ${variance.toFixed(2)} vs mean ${mean.toFixed(2)}`)
    else within(variance / mean, 0.75, 1.3, `${id} Poisson dispersion`)
  }
})

Deno.test('null feeders: no protein raises the vomit rate (staple and rotation)', () => {
  within(proteinRateRatio(scenarioById('null-rotating-3pm-bursty'), 'beef', SEEDS(200), 'truth'), 0.85, 1.15, 'rotation, beef')
  within(proteinRateRatio(scenarioById('null-rotating-3pm-bursty'), 'chicken', SEEDS(200), 'truth'), 0.85, 1.15, 'rotation, chicken')
  within(proteinRateRatio(scenarioById('null-staple-3pm-bursty'), 'salmon', SEEDS(200), 'truth'), 0.8, 1.2, 'staple, the 10% food')
})

Deno.test('null timing: vomits fall after meals only as often as chance puts them there', () => {
  let after = 0, total = 0
  const sc = scenarioById('null-staple-3pm-bursty')
  for (const seed of SEEDS(40)) {
    const r = sim(sc, seed)
    const meals = r.truth.meals.map((m) => Date.parse(m.at))
    for (const e of r.truth.episodes) {
      total++
      const t = Date.parse(e.at)
      if (meals.some((m) => t - m >= 0.25 * 3_600_000 && t - m <= 2 * 3_600_000)) after++
    }
  }
  // Two meals a day, a 1.75-hour window after each: about 15% by chance.
  within(after / total, 0.08, 0.22, 'share of null vomits in a post-meal window')
})

Deno.test('logging attrition thins the record while the truth stays flat', () => {
  const sc = scenarioById('null-attrition-365')
  let loggedEarly = 0, loggedLate = 0, trueEarly = 0, trueLate = 0
  for (const seed of SEEDS(40)) {
    const r = sim(sc, seed)
    for (const e of r.truth.episodes) {
      const d = localDayIndex(Date.parse(e.at), sc.startDate, sc.tz)
      const logged = e.loggedEventIds.length > 0
      if (d < 60) { trueEarly++; if (logged) loggedEarly++ }
      if (d >= 305) { trueLate++; if (logged) loggedLate++ }
    }
  }
  within(trueLate / trueEarly, 0.75, 1.3, 'true rate, last 60 days over first 60')
  assert(loggedLate / trueLate < 0.4 * (loggedEarly / trueEarly), 'logged share falls by more than half')
})

Deno.test('the trial started at a peak does nothing: the fall is the flare ending', () => {
  const sc = scenarioById('null-trial-at-peak')
  const seeds = SEEDS(80)
  const before = ratePerDay(sc, 'vomit', seeds, 0, 30)
  const flare = ratePerDay(sc, 'vomit', seeds, 30, 58)
  const onTrialAfterFlare = ratePerDay(sc, 'vomit', seeds, 58, 100)
  within(flare / before, 3.0, 5.2, 'flare over baseline')
  within(onTrialAfterFlare / before, 0.75, 1.3, 'on the trial food after the flare, over baseline')
})

Deno.test('event-dependent feeding: white fish only ever follows a logged vomit, and causes nothing', () => {
  const sc = scenarioById('null-event-dependent-feeding')
  for (const seed of SEEDS(10)) {
    const r = sim(sc, seed)
    const whitefish = r.record.foods.find((f) => f.primaryProtein === 'whitefish')!.id
    const vomitDays = r.record.events.filter((e) => e.ty === 'vomit' && e.petKey === 'a').map((e) => localDayIndex(Date.parse(e.at), sc.startDate, sc.tz))
    const fishDays = r.truth.meals.filter((m) => m.foodItemId === whitefish).map((m) => localDayIndex(Date.parse(m.at), sc.startDate, sc.tz))
    assert(fishDays.length > 0, 'the owner switched at least once')
    // Allow a day either side for a vomit logged in the small hours of the switch day.
    for (const d of fishDays) assert(vomitDays.some((v) => d - v >= 0 && d - v <= 4), `white fish on day ${d} follows a logged vomit`)
  }
  within(proteinRateRatio(sc, 'whitefish', SEEDS(120), 'truth'), 0.7, 1.4, 'white fish days carry the baseline rate')
})

Deno.test('the two-cat home: found piles go to the cat on screen, witnessed ones to the cat that vomited', () => {
  const sc = scenarioById('null-two-cat-home')
  let misattributed = 0, witnessedB = 0
  for (const seed of SEEDS(10)) {
    const r = simulate(sc, seed)
    const byId = new Map(r.record.events.map((e) => [e.id, e]))
    for (const t of r.truth.episodes) {
      if (t.loggedEventIds.length === 0) continue
      const ev = byId.get(t.loggedEventIds[0])!
      if (ev.cf === 'window') assertEquals(ev.petKey, 'a', 'every found pile lands on cat A')
      else assertEquals(ev.petKey, t.petKey, 'a witnessed vomit lands on the cat that vomited')
      if (t.petKey === 'b' && ev.petKey === 'a') misattributed++
      if (t.petKey === 'b' && ev.petKey === 'b') witnessedB++
    }
  }
  assert(misattributed > 5 && witnessedB > 5, `both paths exercised (${misattributed} misattributed, ${witnessedB} witnessed)`)
})

// ─── truth: injected problems are there, from when they say ────────────────────────────

Deno.test('a protein reaction lands at its stated relative risk (±10%), in the truth and in the logged rows', () => {
  const sc = scenarioById('inj-protein-reaction-rr3')
  const effect = sc.pets[0].effects!.find((e) => e.kind === 'protein_reaction')!
  assert(effect.kind === 'protein_reaction')
  within(proteinRateRatio(sc, effect.protein, SEEDS(300), 'truth'), effect.rr * 0.9, effect.rr * 1.1, 'rr3 in truth')
  within(proteinRateRatio(sc, effect.protein, SEEDS(300), 'logged'), effect.rr * 0.85, effect.rr * 1.15, 'rr3 in logged rows')
  // The hidden-chicken cat: chicken days (the chicken food and the duck food) carry the effect.
  within(proteinRateRatio(scenarioById('inj-protein-reaction-hidden'), 'chicken', SEEDS(300), 'truth'), 2.7, 3.3, 'hidden chicken')
})

Deno.test('a protein reaction is timed after the meal that carried it, and its food leaves days without it', () => {
  for (const sc of TRAJECTORY_CORPUS) {
    for (const pet of sc.pets) {
      for (const e of pet.effects ?? []) {
        if (e.kind !== 'protein_reaction') continue
        let exposedDays = 0, allDays = 0
        for (const seed of SEEDS(20)) {
          const r = sim(sc, seed)
          const proteinsOf = new Map(r.record.foods.map((f) => [f.id, f.proteins]))
          const exposedMeals = r.truth.meals.filter((m) => m.petKey === pet.key && proteinsOf.get(m.foodItemId)!.includes(e.protein)).map((m) => Date.parse(m.at))
          for (const ep of r.truth.episodes.filter((x) => x.cause === 'protein')) {
            const t = Date.parse(ep.at)
            assert(exposedMeals.some((m) => t - m >= 0.5 * 3_600_000 - 1 && t - m <= 8 * 3_600_000 + 1), `${sc.id}: a protein episode follows its meal by 0.5 to 8 hours`)
          }
          const days = new Set(exposedMeals.map((m) => careDay(sc, new Date(m).toISOString())))
          exposedDays += days.size
          allDays += sc.days
        }
        // A reaction on a food eaten nearly every day is a rate step no food lane can see.
        assert(1 - exposedDays / allDays >= 0.3, `${sc.id}: at least 30% of days without ${e.protein}`)
      }
    }
  }
})

Deno.test('rate steps land on their stated day at their stated size (±10%)', () => {
  const onset = scenarioById('inj-enteropathy-onset')
  const multOf = (sc: ScenarioSpec, sign: Sign) => {
    const e = sc.pets[0].effects!.find((x) => x.kind === 'rate_step' && x.sign === sign)!
    assert(e.kind === 'rate_step' && 'day' in e.from)
    return { m: e.multiplier, day: (e.from as { day: number }).day }
  }
  const v = multOf(onset, 'vomit')
  within(ratePerDay(onset, 'vomit', SEEDS(200), v.day, onset.days) / ratePerDay(onset, 'vomit', SEEDS(200), 0, v.day), v.m * 0.9, v.m * 1.1, 'enteropathy vomiting')
  // Diarrhoea starts at 0.3 a month, so its baseline needs more seeds to be measured at all.
  const d = multOf(onset, 'diarrhea')
  within(ratePerDay(onset, 'diarrhea', SEEDS(400), d.day, onset.days) / ratePerDay(onset, 'diarrhea', SEEDS(400), 0, d.day), d.m * 0.85, d.m * 1.15, 'enteropathy diarrhoea')
  const dbl = scenarioById('inj-rate-doubling')
  const s = multOf(dbl, 'vomit')
  within(ratePerDay(dbl, 'vomit', SEEDS(300), s.day, dbl.days) / ratePerDay(dbl, 'vomit', SEEDS(300), 0, s.day), s.m * 0.9, s.m * 1.1, 'doubling')
  within(ratePerDay(dbl, 'vomit', SEEDS(300), s.day - 10, s.day) / ratePerDay(dbl, 'vomit', SEEDS(300), 0, s.day - 10), 0.8, 1.25, 'not before its day')
})

Deno.test('a cause label means "would not have happened without the effect": half the doubled rate is background', () => {
  const sc = scenarioById('inj-rate-doubling')
  let bg = 0, step = 0
  for (const seed of SEEDS(200)) {
    for (const e of sim(sc, seed).truth.episodes) {
      if (localDayIndex(Date.parse(e.at), sc.startDate, sc.tz) < 101) continue
      if (e.cause === 'background') bg++
      if (e.cause === 'rate_step') step++
    }
  }
  within(step / (bg + step), 0.45, 0.55, 'share labelled rate_step after a doubling')
})

Deno.test('the unmeasured-by-default effects are there at their stated size', () => {
  const monthlyDispersion = (sc: ScenarioSpec, seeds: number[]) => {
    const monthly: number[] = []
    for (const seed of seeds) {
      const r = sim(sc, seed)
      for (let m = 0; m < Math.floor(sc.days / 30); m++) {
        monthly.push(r.truth.episodes.filter((e) => e.sign === 'vomit' && e.petKey === 'a' && Math.floor(localDayIndex(Date.parse(e.at), sc.startDate, sc.tz) / 30) === m).length)
      }
    }
    const mean = monthly.reduce((a, b) => a + b, 0) / monthly.length
    return monthly.reduce((a, b) => a + (b - mean) ** 2, 0) / (monthly.length - 1) / mean
  }
  assert(monthlyDispersion(scenarioById('null-wandering-365'), SEEDS(60)) > 1.3, 'the wander widens monthly counts beyond Poisson')
  assert(monthlyDispersion(scenarioById('null-rotating-3pm-bursty'), SEEDS(60)) > 1.3, 'weekly dispersion widens monthly counts')
  within(monthlyDispersion(scenarioById('null-rotating-1pm'), SEEDS(60)), 0.75, 1.3, 'a plain Poisson pet does not')

  const monthlyRate = (id: string, sign: Sign) => {
    const sc = scenarioById(id)
    return ratePerDay(sc, sign, SEEDS(200), 0, sc.days) * 30
  }
  within(monthlyRate('inj-postprandial', 'vomit'), 2.7, 3.3, 'post-prandial rate, 3 a month')
  within(monthlyRate('inj-cough-and-vomit', 'cough'), 5.4, 6.6, 'cough, 6 a month')

  const dog = scenarioById('null-dog-indiscretion')
  const raid = dog.pets[0].effects!.find((e) => e.kind === 'indiscretion')!
  assert(raid.kind === 'indiscretion')
  let raidDays = 0
  for (const seed of SEEDS(100)) raidDays += new Set(sim(dog, seed).truth.episodes.filter((e) => e.cause === 'indiscretion').map((e) => careDay(dog, e.at))).size
  within(raidDays / 100 / (dog.days / 30), raid.perMonth * 0.85, raid.perMonth * 1.15, 'raids per month')

  const kcs = scenarioById('inj-kennel-cough-gag')
  const kc = kcs.pets[0].effects!.find((e) => e.kind === 'kennel_cough')!
  assert(kc.kind === 'kennel_cough')
  let coughs = 0, logged = 0, asVomit = 0
  for (const seed of SEEDS(100)) {
    for (const e of sim(kcs, seed).truth.episodes) {
      if (e.cause !== 'infection') continue
      coughs++
      if (e.loggedAs !== null) logged++
      if (e.loggedAs === 'vomit') asVomit++
    }
  }
  within(coughs / 100 / kc.days, kc.perDay * 0.9, kc.perDay * 1.1, 'kennel-cough coughs per day')
  within(asVomit / logged, 0.25, 0.35, 'share of logged coughs written as vomits')
})

Deno.test('phenotypes: post-prandial vomits all follow a meal; bilious ones all fall 04:00 to 07:00 with bile', () => {
  const pp = scenarioById('inj-postprandial')
  const bil = scenarioById('inj-early-morning-bilious')
  for (const seed of SEEDS(10)) {
    const r = simulate(pp, seed)
    const meals = r.truth.meals.map((m) => Date.parse(m.at))
    for (const e of r.truth.episodes) {
      const t = Date.parse(e.at)
      assert(meals.some((m) => t - m >= 0.25 * 3_600_000 - 1 && t - m <= 2 * 3_600_000 + 1), `${e.at} follows a meal`)
    }
    const b = simulate(bil, seed)
    for (const e of b.truth.episodes) within(localHour(Date.parse(e.at), bil.tz), 4, 7, 'bilious hour')
    for (const a of b.record.analyses) assertEquals(a.bile_present, 'yes')
  }
})

Deno.test('the red flag: one bloody read, on the first vomit on or after its day, recorded in the truth ledger', () => {
  const sc = scenarioById('inj-red-flag')
  const flagDay = sc.pets[0].redFlagDays![0]
  let flagged = 0
  for (const seed of SEEDS(40)) {
    const r = sim(sc, seed)
    const bloody = r.record.analyses.filter((a) => a.blood_present === 'fresh_red')
    assertEquals(bloody.length, r.truth.redFlags.length, `seed ${seed}: a bloody read iff the ledger records one`)
    if (bloody.length === 0) continue
    flagged++
    assertEquals(bloody.length, 1)
    const entry = r.truth.redFlags[0]
    assertEquals(entry.eventId, bloody[0].event_id)
    const ep = r.truth.episodes.find((e) => e.id === entry.episodeId)!
    const day = localDayIndex(Date.parse(ep.at), sc.startDate, sc.tz)
    assert(day >= flagDay, `bloody read on day ${day}`)
    const earlier = r.truth.episodes.filter((e) => e !== ep && e.sign === 'vomit' && localDayIndex(Date.parse(e.at), sc.startDate, sc.tz) >= flagDay && Date.parse(e.at) < Date.parse(ep.at))
    assertEquals(earlier.length, 0, 'it is the first vomit on or after the day')
  }
  assert(flagged >= 35, `most seeds carry the flag (${flagged}/40)`)
})

Deno.test('overnight vomits are mostly found in the morning, not witnessed', () => {
  const sc = scenarioById('inj-early-morning-bilious')
  let windows = 0, total = 0
  for (const seed of SEEDS(40)) {
    const r = sim(sc, seed)
    const byId = new Map(r.record.events.map((e) => [e.id, e]))
    for (const e of r.truth.episodes) {
      if (e.loggedEventIds.length === 0 || r.truth.redFlags.some((f) => f.episodeId === e.id)) continue
      total++
      if (byId.get(e.loggedEventIds[0])!.cf === 'window') windows++
    }
  }
  within(windows / total, 0.52, 0.68, 'share of 04:00–07:00 vomits logged as found')
})

Deno.test('the trial responder falls to its stated residual; the non-responder does not move', () => {
  const resp = scenarioById('inj-trial-responder')
  const t = resp.pets[0].trial!
  assert(t.response.kind === 'responder')
  const onset = t.startDay + t.response.onsetDays
  within(ratePerDay(resp, 'vomit', SEEDS(200), onset, resp.days) / ratePerDay(resp, 'vomit', SEEDS(200), 0, t.startDay), t.response.residual - 0.04, t.response.residual + 0.04, 'responder')
  const non = scenarioById('inj-trial-non-responder')
  within(ratePerDay(non, 'vomit', SEEDS(200), onset, non.days) / ratePerDay(non, 'vomit', SEEDS(200), 0, t.startDay), 0.9, 1.1, 'non-responder')
})

Deno.test('kennel cough: gags logged as vomits sit inside the cough, and the cough is real', () => {
  const sc = scenarioById('inj-kennel-cough-gag')
  const kc = sc.pets[0].effects!.find((e) => e.kind === 'kennel_cough')!
  assert(kc.kind === 'kennel_cough')
  let gags = 0
  for (const seed of SEEDS(10)) {
    for (const e of simulate(sc, seed).truth.episodes) {
      if (e.cause !== 'infection') continue
      const d = localDayIndex(Date.parse(e.at), sc.startDate, sc.tz)
      assert(d >= kc.fromDay && d < kc.fromDay + kc.days, 'the cough is inside its span')
      if (e.loggedAs === 'vomit') gags++
    }
  }
  assert(gags > 10, `gags logged as vomits: ${gags}`)
})

// ─── truth: weights ────────────────────────────────────────────────────────────────────

Deno.test('weights: the loss is on the true line, the scale adds its stated noise, and cadence is as written', () => {
  const weekly = scenarioById('wt-loss-weekly')
  const w = weekly.pets[0].weight!
  assert(w.trend.kind === 'loss')
  const residuals: number[] = []
  for (const seed of SEEDS(20)) {
    const r = simulate(weekly, seed)
    const byEvent = new Map(r.record.weightChecks.map((c) => [c.event_id, c.weight_kg]))
    const truths = r.truth.weighIns
    for (const t of truths) residuals.push(byEvent.get(t.eventId)! - t.trueKg)
    const last = truths[truths.length - 1]
    const lastDay = localDayIndex(Date.parse(r.record.events.find((e) => e.id === last.eventId)!.at), weekly.startDate, weekly.tz)
    const expected = w.startKg * Math.pow(1 - w.trend.pctPerWeek / 100, (lastDay - w.trend.fromDay) / 7)
    within(last.trueKg / expected, 0.99, 1.01, 'true weight follows 1% a week')
  }
  const sd = Math.sqrt(residuals.reduce((s, x) => s + x * x, 0) / residuals.length)
  within(sd, w.homeSd * 0.8, w.homeSd * 1.2, 'home scale noise')

  const sparse = scenarioById('wt-null-sparse-home')
  const r = simulate(sparse, 1)
  const days = r.record.events.filter((e) => e.ty === 'weight_check').map((e) => localDayIndex(Date.parse(e.at), sparse.startDate, sparse.tz))
  for (let i = 1; i < days.length; i++) within(days[i] - days[i - 1], 42, 70, 'sparse gap')
  assert(new Set(r.truth.weighIns.map((t) => t.trueKg)).size === 1, 'a stable cat has one true weight')

  const clinic = scenarioById('wt-clinic-only-loss')
  const c = simulate(clinic, 1)
  assertEquals(c.truth.weighIns.map((t) => t.scale), ['clinic', 'clinic'])
  const visitDays = c.record.visits.map((v) => v.visited_at)
  for (const t of c.truth.weighIns) assert(visitDays.includes(c.record.events.find((e) => e.id === t.eventId)!.at.slice(0, 10)), 'weighed at a visit')
})

Deno.test('the legacy profile weight has no date or source, and the first weigh-in displaces it the way 072 does', () => {
  for (const id of ['wt-legacy-profile-true-loss', 'wt-legacy-profile-guess']) {
    const sc = scenarioById(id)
    const profile = sc.pets[0].weight!.profile!
    const r = simulate(sc, 1)
    assertEquals(r.record.profileWeights.length, 1)
    assertEquals(Object.keys(r.record.profileWeights[0]).sort(), ['petKey', 'pet_created_at', 'weight_kg'], 'no date or source of its own')
    const created = Date.parse(r.record.pets[0].created_at)
    within((Date.parse(`${sc.startDate}T12:00:00Z`) - created) / DAY_MS, profile.petCreatedDaysBefore - 1, profile.petCreatedDaysBefore + 1, 'created long before')
    const first = r.record.weightDisplacements[0]
    assertEquals(first.weight_kg, profile.kg)
    assertEquals(first.held_since_earliest, r.record.pets[0].created_at, 'never edited: held since creation (072 case b)')
    assertEquals(first.replaced_by_kg, r.record.weightChecks[0].weight_kg)
    const second = r.record.weightDisplacements[1]
    assert(second !== undefined, 'a second weigh-in displaces the first')
    assertEquals(second.held_since_earliest, first.displaced_at, 'a later one held since the last displacement (072 case a)')
    assertEquals(r.truth.profileWeights, [{ petKey: 'a', enteredKg: profile.kg, trueKgAtCreation: profile.trueAtCreationKg }])
  }
  // The pair differs in truth only: the guess had no loss behind it.
  const guess = simulate(scenarioById('wt-legacy-profile-guess'), 1)
  assertEquals(new Set(guess.truth.weighIns.map((t) => t.trueKg)).size, 1)
})

// ─── the response layer ────────────────────────────────────────────────────────────────

Deno.test('under the null observer no owner ever responds; only scheduled visits happen', () => {
  for (const sc of TRAJECTORY_CORPUS) {
    const r = simulate(sc, sc.ciSeeds[0], NULL_OBSERVER)
    assertEquals(r.record.ownerAnswers, [], sc.id)
    const scheduled = sc.pets.flatMap((p) => p.visits ?? []).filter((v) => v.day < sc.days)
    assertEquals(r.record.visits.length, scheduled.length, `${sc.id}: only the scheduled visits`)
    assert(r.responses.every((x) => x.action === 'book' || x.action === 'visit'), sc.id)
    assert(r.shown.every((s) => s.cards.length === 0), sc.id)
  }
})

Deno.test('"My vet knows" is answered the day after the third evening of asking, once, and is dated', () => {
  const sc = scenarioById('own-answers-vet-knows')
  const r = simulate(sc, 1, askFrom(20))
  assertEquals(r.record.ownerAnswers.length, 1)
  const a = r.record.ownerAnswers[0]
  assertEquals([a.sign, a.kind], ['vomit', 'vet_knows'])
  assertEquals(localDayIndex(Date.parse(a.answeredAt), sc.startDate, sc.tz), 23, 'asked on 20, 21, 22; answered on 23')
  assertEquals(r.truth.acks, [{ petKey: 'a', sign: 'vomit', day: 23, via: 'answer' }])
})

Deno.test('an ask that breaks its run, that asks nothing, or that is about another pet is not answered', () => {
  const sc = scenarioById('own-answers-vet-knows')
  const alternate: Observer = (v) => (v.dayIndex % 2 === 0 ? askFrom(0)(v) : [])
  assertEquals(simulate(sc, 1, alternate).record.ownerAnswers, [], 'never three in a row')
  assertEquals(simulate(sc, 1, askFrom(20, 'vomit', 'none')).record.ownerAnswers, [], 'a card with no ask')
  const otherPet: Observer = (v) => (v.dayIndex >= 20 ? [{ petKey: 'b', findingType: 'x', sign: 'vomit', ask: 'call', priorityClass: 'safety' }] : [])
  assertEquals(simulate(sc, 1, otherPet).record.ownerAnswers, [], 'another pet')
  assertEquals(simulate(sc, 1, askFrom(20, 'cough')).record.ownerAnswers.map((x) => x.sign), ['cough'], 'the answer is per sign')
})

Deno.test('a booked visit carries the concern, sets a recheck, and the recheck is attended', () => {
  const sc = scenarioById('own-visit-with-recheck')
  for (const seed of SEEDS(10)) {
    const r = simulate(sc, seed, askFrom(20))
    const [first, recheck] = r.record.visits
    const firstDay = localDayIndex(Date.parse(`${first.visited_at}T12:00:00Z`), sc.startDate, 'UTC')
    within(firstDay, 22 + 3, 22 + 10, 'visit 3 to 10 days after booking on day 22')
    assertEquals(first.next_visit_at, recheck.visited_at, 'the recheck happens on the date the vet set')
    const appt = r.record.appointments.find((x) => x.visitId === first.id)!
    assertEquals(appt.questions?.map((q) => [q.source, q.source_ref]), [['record', 'vomit']], 'the concern was on the list')
    assertEquals(r.truth.acks.map((x) => [x.via, x.day]), [['visit', firstDay]])
    assert(r.truth.weighIns.some((t) => t.scale === 'clinic'), 'weighed at the clinic')
  }
})

Deno.test('a vaccine visit does not acknowledge the concern', () => {
  const r = simulate(scenarioById('own-vaccine-visit'), 1, askFrom(20))
  assertEquals(r.record.visits.map((v) => v.reason), ['Annual vaccines'])
  assertEquals(r.record.appointments[0].questions, null)
  assertEquals(r.truth.acks, [])
})

Deno.test('the lapse: after the answer only symptoms stop being logged; meals and the truth carry on', () => {
  const sc = scenarioById('own-lapse-flat')
  for (const seed of SEEDS(10)) {
    const r = sim(sc, seed, 'ask20')
    const ackDay = r.truth.acks[0].day
    const after = (at: string) => localDayIndex(Date.parse(at), sc.startDate, sc.tz) >= ackDay
    assertEquals(r.record.events.filter((e) => e.ty === 'vomit' && after(e.at)).length, 0, 'no vomit logged after the answer')
    assert(r.truth.episodes.filter((e) => after(e.at)).length > 10, 'the cat keeps vomiting')
    assert(r.record.meals.filter((m) => after(m.at)).length > 100, 'meals keep being logged')
  }
  const flatAfter = ratePerDay(sc, 'vomit', SEEDS(60), 0, 150, 'ask20', (r) => r.truth.acks[0]?.day ?? null)
  within(flatAfter / ratePerDay(sc, 'vomit', SEEDS(60), 0, 23), 0.8, 1.25, 'the truth after the answer is unchanged')
})

Deno.test('the doubling behind the lapse happens 21 days after the answer, and none of it is logged', () => {
  const sc = scenarioById('own-lapse-doubling')
  const ack = (r: SimulationResult) => r.truth.acks[0]?.day ?? null
  const before = ratePerDay(sc, 'vomit', SEEDS(60), 0, 21, 'ask20', ack)
  const doubled = ratePerDay(sc, 'vomit', SEEDS(60), 21, 180, 'ask20', ack)
  within(doubled / before, 1.6, 2.5, 'doubling after ack + 21')
  const r = sim(sc, 1000, 'ask20')
  assert(r.truth.episodes.filter((e) => e.cause === 'rate_step').length > 5)
  assert(r.truth.episodes.filter((e) => e.cause === 'rate_step').every((e) => e.loggedEventIds.length === 0))
  // Without an acknowledgement the effect never starts: it is anchored to the owner, not the calendar.
  assertEquals(simulate(sc, 1, NULL_OBSERVER).truth.episodes.filter((e) => e.cause === 'rate_step').length, 0)
})

Deno.test('common random numbers: two observers see the same background and meals for the whole run', () => {
  for (const id of ['own-visit-then-doubling', 'own-visit-doubling-fixed', 'own-lapse-doubling']) {
    const sc = scenarioById(id)
    for (const seed of SEEDS(5)) {
      const a = simulate(sc, seed, NULL_OBSERVER)
      const b = simulate(sc, seed, askFrom(20))
      const background = (r: SimulationResult) => r.truth.episodes.filter((e) => e.cause === 'background').map((e) => [e.id, e.at])
      assertEquals(background(a), background(b), `${id}: same background episodes`)
      assertEquals(a.truth.meals.map((m) => [m.at, m.foodItemId]), b.truth.meals.map((m) => [m.at, m.foodItemId]), `${id}: same meals`)
    }
  }
  // The fixed-day sibling is the paired comparison: its injected truth is identical across arms.
  const fixed = scenarioById('own-visit-doubling-fixed')
  const injected = (r: SimulationResult) => r.truth.episodes.filter((e) => e.cause === 'rate_step').map((e) => e.at)
  assertEquals(injected(simulate(fixed, 1000, NULL_OBSERVER)), injected(simulate(fixed, 1000, askFrom(20))))
})

Deno.test('every evening the observer can resolve what it sees: foods, the current weight, and no trial before it starts', () => {
  for (const sc of TRAJECTORY_CORPUS) {
    let checked = 0
    const probe: Observer = (v) => {
      const foods = new Set(v.record.foods.map((f) => f.id))
      for (const m of v.record.meals) assert(foods.has(m.foodItemId), `${sc.id} day ${v.dayIndex}: meal food is resolvable`)
      for (const t of v.record.trials) assert(Date.parse(t.created_at) <= Date.parse(v.nowIso), `${sc.id}: no trial row before it starts`)
      for (const p of v.record.pets) {
        const mine = v.record.weightChecks.filter((w) => w.petKey === p.key)
        const expected = mine.length > 0 ? mine[mine.length - 1].weight_kg : (v.record.profileWeights.find((w) => w.petKey === p.key)?.weight_kg ?? null)
        assertEquals(p.weight_kg, expected, `${sc.id} day ${v.dayIndex}: pets.weight_kg is the current value`)
      }
      checked++
      return askFrom(20)(v)
    }
    simulate(sc, sc.ciSeeds[0], probe)
    assertEquals(checked, sc.days)
  }
})

// ─── the floor: every scenario the PR-15 row names exists, and shows in its rows ───────

type Exhibit = (r: SimulationResult, sc: ScenarioSpec) => boolean
/** Mean and variance/mean of 30-day vomit counts over 30 seeds: for the tags one seed cannot show. */
function monthlyStats(sc: ScenarioSpec): { mean: number; dispersion: number } {
  const monthly: number[] = []
  for (const seed of SEEDS(30)) {
    const r = sim(sc, seed)
    for (let m = 0; m < Math.floor(sc.days / 30); m++) {
      monthly.push(r.truth.episodes.filter((e) => e.sign === 'vomit' && e.petKey === 'a' && Math.floor(localDayIndex(Date.parse(e.at), sc.startDate, sc.tz) / 30) === m).length)
    }
  }
  const mean = monthly.reduce((a, b) => a + b, 0) / monthly.length
  return { mean, dispersion: monthly.reduce((a, b) => a + (b - mean) ** 2, 0) / (monthly.length - 1) / mean }
}
const vomitsOf = (r: SimulationResult) => r.truth.episodes.filter((e) => e.sign === 'vomit')
const shareOfTopFood = (r: SimulationResult) => {
  const counts = new Map<string, number>()
  for (const m of r.truth.meals) counts.set(m.protein, (counts.get(m.protein) ?? 0) + 1)
  return Math.max(...counts.values()) / r.truth.meals.length
}
const EXHIBITS: Record<CoverageTag, Exhibit> = {
  staple_feeder: (r) => shareOfTopFood(r) >= 0.8,
  rotating_feeder: (r) => new Set(r.truth.meals.map((m) => m.protein)).size >= 5 && shareOfTopFood(r) < 0.3,
  grazer: (r) => r.record.arrangements.some((a) => a.method === 'free_choice'),
  vomit_1_per_month: (_r, sc) => Math.abs(monthlyStats(sc).mean - 1) < 0.25,
  vomit_3_per_month: (_r, sc) => Math.abs(monthlyStats(sc).mean - 3) < 0.6,
  overdispersed: (_r, sc) => monthlyStats(sc).dispersion > 1.3,
  wandering_rate: (_r, sc) => monthlyStats(sc).dispersion > 1.3,
  logging_attrition: (r, sc) => {
    const early = r.truth.episodes.filter((e) => localDayIndex(Date.parse(e.at), sc.startDate, sc.tz) < 90)
    const late = r.truth.episodes.filter((e) => localDayIndex(Date.parse(e.at), sc.startDate, sc.tz) >= sc.days - 90)
    const share = (xs: typeof early) => xs.filter((e) => e.loggedEventIds.length > 0).length / Math.max(1, xs.length)
    return late.length > 0 && share(late) < share(early)
  },
  found_piles: (r) => r.record.events.some((e) => e.cf === 'window'),
  two_cat_home: (r) => r.record.pets.length === 2 && r.truth.episodes.some((e) => e.loggedPetKey !== null && e.loggedPetKey !== e.petKey),
  dog: (r) => r.record.pets.some((p) => p.species === 'dog'),
  species_other: (r) => r.record.pets.some((p) => p.species === 'other') && r.record.events.length > 0,
  dietary_indiscretion: (r) => r.truth.episodes.some((e) => e.cause === 'indiscretion'),
  trial_at_peak: (r) => r.record.trials.length > 0 && r.truth.episodes.some((e) => e.cause === 'flare'),
  event_dependent_feeding: (r) => r.truth.meals.some((m) => m.protein === 'whitefish'),
  enteropathy_onset: (r) => r.truth.episodes.some((e) => e.cause === 'rate_step') && r.truth.episodes.some((e) => e.sign === 'diarrhea'),
  protein_reaction: (r) => r.truth.episodes.some((e) => e.cause === 'protein'),
  postprandial: (r) => {
    const meals = r.truth.meals.map((m) => Date.parse(m.at))
    const v = vomitsOf(r)
    return v.length > 0 && v.every((e) => meals.some((m) => Date.parse(e.at) - m >= 0.25 * 3_600_000 - 1 && Date.parse(e.at) - m <= 2 * 3_600_000 + 1))
  },
  early_morning: (r, sc) => vomitsOf(r).length > 0 && vomitsOf(r).every((e) => { const h = localHour(Date.parse(e.at), sc.tz); return h >= 4 && h < 7 }),
  rate_doubling: (r, sc) => sc.pets.some((p) => (p.effects ?? []).some((e) => e.kind === 'rate_step' && e.multiplier === 2)) && r.truth.episodes.some((e) => e.cause === 'rate_step'),
  red_flag: (r) => r.record.analyses.some((a) => a.blood_present === 'fresh_red'),
  weight_loss: (r) => r.truth.weighIns.length >= 2 && r.truth.weighIns[r.truth.weighIns.length - 1].trueKg < 0.97 * r.truth.weighIns[0].trueKg,
  trial_responder: (r, sc) => {
    const t = sc.pets[0].trial!
    return r.record.trials.length > 0 && ratePerDay(sc, 'vomit', SEEDS(30), t.startDay + 14, sc.days) < 0.5 * ratePerDay(sc, 'vomit', SEEDS(30), 0, t.startDay)
  },
  trial_non_responder: (r, sc) => {
    const t = sc.pets[0].trial!
    return r.record.trials.length > 0 && ratePerDay(sc, 'vomit', SEEDS(30), t.startDay + 14, sc.days) > 0.75 * ratePerDay(sc, 'vomit', SEEDS(30), 0, t.startDay)
  },
  cough_and_vomit: (r) => r.record.events.some((e) => e.ty === 'cough') && r.record.events.some((e) => e.ty === 'vomit') && !r.truth.episodes.some((e) => e.cause === 'infection'),
  kennel_cough_gag: (r) => r.truth.episodes.some((e) => e.cause === 'infection' && e.loggedAs === 'vomit'),
  sparse_weigh_ins: (r, sc) => {
    const days = r.truth.weighIns.filter((t) => t.scale === 'home').map((t) => localDayIndex(Date.parse(r.record.events.find((e) => e.id === t.eventId)!.at), sc.startDate, sc.tz))
    return days.length >= 2 && days.slice(1).every((d, i) => d - days[i] >= 42)
  },
  clinic_only_weights: (r) => r.truth.weighIns.length > 0 && r.truth.weighIns.every((t) => t.scale === 'clinic'),
  legacy_weight_no_source: (r) => r.record.profileWeights.length > 0 && r.record.weightDisplacements.length > 0,
  answers_vet_knows: (r) => r.record.ownerAnswers.length > 0,
  visit_carries_concern: (r) => r.record.visits.some((v) => r.record.appointments.some((a) => a.visitId === v.id && a.questions?.some((q) => q.source === 'record'))),
  visit_without_concern: (r) => r.record.visits.some((v) => r.record.appointments.some((a) => a.visitId === v.id && a.questions === null)),
  recheck_date: (r) => r.record.visits.some((v) => v.next_visit_at !== null),
  symptom_only_lapse: (r, sc) => {
    const lapse = r.responses.find((x) => x.action === 'lapse_started')
    if (!lapse) return false
    const after = (at: string) => localDayIndex(Date.parse(at), sc.startDate, sc.tz) >= lapse.day
    return r.record.events.filter((e) => e.ty === 'vomit' && after(e.at)).length === 0 && r.record.meals.some((m) => after(m.at))
  },
  doubling_behind_lapse: (r) => r.responses.some((x) => x.action === 'lapse_started') && r.truth.episodes.some((e) => e.cause === 'rate_step' && e.loggedEventIds.length === 0),
}

Deno.test('the answer key is consistent with the effects, and says how each detection may be scored', () => {
  for (const sc of TRAJECTORY_CORPUS) {
    const petKeys = new Set(sc.pets.map((p) => p.key))
    for (const f of sc.key.falseCards) assert(petKeys.has(f.petKey), `${sc.id}: false card names a pet`)
    for (const d of sc.key.detect) {
      assert(petKeys.has(d.petKey), `${sc.id}: detection names a pet`)
      // An acknowledgement-anchored truth differs between arms, so it can never be scored paired.
      assertEquals(d.scoring, 'afterAck' in d.from ? 'both_acknowledged' : 'paired', `${sc.id}: ${d.lane} scoring`)
      // No lane is both a detection and a false card for the same sign.
      assert(!sc.key.falseCards.some((f) => f.petKey === d.petKey && f.lane === d.lane && f.sign === d.sign), `${sc.id}: ${d.lane} both detect and false`)
    }
    if (sc.category === 'null') {
      assertEquals(sc.key.detect, [], `${sc.id}: a null pet has nothing to detect`)
      assert(sc.key.falseCards.length > 0, `${sc.id}: a null pet names what must not be found`)
    } else {
      assert(sc.key.detect.length > 0 || sc.key.falseCards.length > 0, `${sc.id}: scored somehow`)
    }
    if (sc.category === 'injected') assert(sc.key.detect.some((d) => d.scoring === 'paired'), `${sc.id}: an injected pet has a paired detection`)
    // Every effect that starts after day 0 is named by a detection starting on its day.
    for (const pet of sc.pets) {
      const starts: EffectStart[] = []
      for (const e of pet.effects ?? []) if (e.kind === 'rate_step') starts.push(e.from)
      for (const day of pet.redFlagDays ?? []) starts.push({ day })
      if (pet.trial?.response.kind === 'responder') starts.push({ day: pet.trial.startDay + pet.trial.response.onsetDays })
      if (pet.weight?.trend.kind === 'loss' && pet.weight.trend.fromDay > 0) starts.push({ day: pet.weight.trend.fromDay })
      for (const st of starts) {
        assert(sc.key.detect.some((d) => d.petKey === pet.key && JSON.stringify(d.from) === JSON.stringify(st)), `${sc.id}: an effect from ${JSON.stringify(st)} has a detection`)
      }
    }
  }
})

Deno.test('the floor: every tag the PR-15 row names is carried by a scenario whose rows show it', () => {
  const carried = new Set(TRAJECTORY_CORPUS.flatMap((s) => s.covers))
  for (const tag of REQUIRED_COVERAGE) {
    assert(carried.has(tag), `no scenario covers ${tag}`)
    const holders = TRAJECTORY_CORPUS.filter((s) => s.covers.includes(tag))
    for (const sc of holders) {
      const r = simulate(sc, sc.ciSeeds[0], sc.category === 'owner' ? askFrom(20) : NULL_OBSERVER)
      assert(EXHIBITS[tag](r, sc), `${sc.id} claims ${tag} but its rows do not show it`)
    }
  }
  // The required list and the declared tags are the same set: no scenario claims a tag nobody requires.
  assertEquals([...carried].sort(), [...REQUIRED_COVERAGE].sort())
})

Deno.test('a sweep variant keeps its scenario and replaces only the rate', () => {
  const base = scenarioById('null-rotating-1pm')
  const v = withRate(base, 'vomit', { perMonth: 3, weeklyDispersion: 0.5 })
  assertNotEquals(v.id, base.id)
  assertEquals(v.pets[0].feeding, base.pets[0].feeding)
  assertEquals(v.pets[0].signs[0].rate, { perMonth: 3, weeklyDispersion: 0.5 })
  assertEquals(base.pets[0].signs[0].rate, { perMonth: 1 }, 'the committed scenario is untouched')
})
