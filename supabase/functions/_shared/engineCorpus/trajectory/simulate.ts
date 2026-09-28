// The trajectory corpus: the simulation (Engines v3 PR-15, CUL-508).
//
//   simulate(scenario, seed, observer) → { record, truth, responses, shown }
//
// It walks the scenario's days. Each day, per pet: the TRUTH (meals eaten, episodes, the true
// weight), then the LOGGING of it (what the owner wrote), then at 21:00 local the observer is
// asked what the owner was shown, and the owner's RESPONSE is queued for the next day. The
// observer is the only seam to an engine: PR-15 ships `NULL_OBSERVER` (nothing is ever shown)
// and PR-16 plugs in PR-11b's pipeline.
//
// HAND-BUILT, NEVER EXPORTED. No row here came from a real pet or the demo account; every
// row is generated from a scenario written by hand (scenarios.*.ts) and a seed.
//
// What it does not model, stated so a blind spot does not read as coverage (C-38):
//   · medications (no scenario has a course; the arrays exist and are empty);
//   · owner edits of a row after the fact, and an owner correcting a photo read;
//   · meal intake as a signal: ratings are drawn independently of health, so no scenario
//     carries an intake-decline truth (D2, CUL-1118, decides whether that is worth adding);
//   · an owner's response to anything but a card's sign and ask register (card text is not read);
//   · stool reads (analyze-stool), and any symptom beyond vomit, diarrhoea and cough.

import { between, chance, gamma, intBetween, mintId, normal, pickWeighted, poisson, stream, type Rng } from './rng.ts'
import type { Effect, FoodSpec, PetSpec, ScenarioSpec, SignSpec } from './spec.ts'
import { addDays, DAY_MS, HOUR_MS, iso, MINUTE_MS, wallToUtcMs } from './time.ts'
import { SIGNS } from './types.ts'
import type {
  EpisodeCause,
  Observer,
  ResponseLogEntry,
  ShownCard,
  Sign,
  SimulationResult,
  SynAnalysis,
  SynEvent,
  SynFood,
  SyntheticRecord,
  TruthEpisode,
  TruthLedger,
} from './types.ts'

export const NULL_OBSERVER: Observer = () => []

const EVENING_HOUR = 21

interface PetState {
  spec: PetSpec
  wander: Record<string, number>
  switchUntilDay: number
  /** The first day each sign was acknowledged (by an answer or a visit that carried it). */
  ackDay: Partial<Record<Sign, number>>
  /** From this day on, the sign is no longer logged (the lapse). */
  lapsedFrom: Partial<Record<Sign, number>>
  consecutiveAsk: Partial<Record<Sign, number>>
  answered: Set<Sign>
  booked: Set<Sign>
  redFlagsPending: number[]
  nextHomeWeighDay: number | null
  weightKg: number | null
  /** 072's bookkeeping: the last displacement, so the next one knows how long the value held. */
  lastDisplacement: { at: number; replacedBy: number } | null
  petCreatedMs: number
}

interface Pending {
  day: number
  run: () => void
}

export function simulate(scenario: ScenarioSpec, seed: number, observer: Observer = NULL_OBSERVER): SimulationResult {
  const { tz, startDate } = scenario
  const S = (...parts: (string | number)[]): Rng => stream(seed, scenario.id, ...parts)
  const id = (...parts: (string | number)[]) => mintId(seed, scenario.id, ...parts)
  const [y0, m0, d0] = startDate.split('-').map(Number)
  const wall0 = Date.UTC(y0, m0 - 1, d0)
  const localMs = (day: number, hour: number) => wallToUtcMs(wall0 + day * DAY_MS + hour * HOUR_MS, tz)

  const foods = new Map<string, SynFood>()
  const food = (f: FoodSpec): SynFood => {
    const known = foods.get(f.id)
    if (known) return known
    const made: SynFood = {
      id: id('food', f.id),
      primaryProtein: f.protein,
      proteins: [f.protein, ...(f.alsoContains ?? [])],
      foodType: f.foodType,
      format: f.foodType === 'dry' ? 'kibble' : f.foodType === 'wet' ? 'pate' : 'jerky',
      brand: 'Corpus',
      productName: `${f.protein} ${f.foodType}`,
    }
    foods.set(f.id, made)
    return made
  }

  const record: SyntheticRecord = {
    scenarioId: scenario.id,
    seed,
    tz,
    pets: [],
    events: [],
    meals: [],
    foods: [],
    trials: [],
    arrangements: [],
    medications: [],
    administrations: [],
    analyses: [],
    weightChecks: [],
    profileWeights: [],
    weightDisplacements: [],
    appointments: [],
    visits: [],
    ownerAnswers: [],
  }
  const truth: TruthLedger = { episodes: [], meals: [], weighIns: [], acks: [] }
  const responses: ResponseLogEntry[] = []
  const shown: SimulationResult['shown'] = []
  let pending: Pending[] = []

  // ── Setup: pets, profile weights, trials, standing arrangements ──
  const states = new Map<string, PetState>()
  for (const spec of scenario.pets) {
    const profile = spec.weight?.profile
    const petCreatedMs = localMs(-(profile?.petCreatedDaysBefore ?? 0), 6)
    record.pets.push({ key: spec.key, name: spec.name, species: spec.species, created_at: iso(petCreatedMs), weight_kg: null })
    const state: PetState = {
      spec,
      wander: {},
      switchUntilDay: -1,
      ackDay: {},
      lapsedFrom: {},
      consecutiveAsk: {},
      answered: new Set(),
      booked: new Set(),
      redFlagsPending: [...(spec.redFlagDays ?? [])].sort((a, b) => a - b),
      nextHomeWeighDay: spec.weight?.cadence.kind === 'home' ? spec.weight.cadence.firstDay : null,
      weightKg: profile ? profile.kg : null,
      lastDisplacement: null,
      petCreatedMs,
    }
    states.set(spec.key, state)
    if (profile) record.profileWeights.push({ petKey: spec.key, weight_kg: profile.kg, pet_created_at: iso(petCreatedMs) })
    if (spec.trial) {
      record.trials.push({
        petKey: spec.key,
        started_at: addDays(startDate, spec.trial.startDay),
        target_duration_days: spec.trial.targetDays,
        status: 'active',
        created_at: iso(localMs(spec.trial.startDay, 9)),
        foodItemId: food(spec.trial.food).id,
      })
    }
    if (spec.feeding.kind === 'free_choice') {
      const bowl = food(spec.feeding.bowl)
      record.arrangements.push({
        id: id('arr', spec.key),
        petKey: spec.key,
        food_item_id: bowl.id,
        is_shared: false,
        active_from: startDate,
        active_until: null,
        method: 'free_choice',
        deleted_at: null,
        created_at: iso(petCreatedMs),
        primary_protein: bowl.primaryProtein,
        proteins: bowl.proteins,
      })
    }
    for (const v of spec.visits ?? []) {
      pending.push({ day: Math.max(0, v.day - 14), run: () => bookAppointment(state, Math.max(0, v.day - 14), v.day, v.reason, v.raises, v.recheckDays, false) })
    }
  }

  // ── Weight: the true value, and a weigh-in written the way the app writes one ──
  function trueWeightKg(spec: PetSpec, atMs: number): number {
    const w = spec.weight!
    if (w.trend.kind === 'flat') return w.startKg
    const fromMs = localMs(w.trend.fromDay, 0)
    const weeks = Math.max(0, (atMs - fromMs) / (7 * DAY_MS))
    return w.startKg * Math.pow(1 - w.trend.pctPerWeek / 100, weeks)
  }

  function weighIn(state: PetState, day: number, hour: number, scale: 'home' | 'clinic') {
    const spec = state.spec
    const atMs = localMs(day, hour)
    const rng = S(spec.key, 'weigh', day, scale)
    const trueKg = trueWeightKg(spec, atMs)
    const sd = scale === 'home' ? spec.weight!.homeSd : 0.02
    const kg = Math.round((trueKg + normal(rng) * sd) * 100) / 100
    const eventId = id('weigh', spec.key, day, scale)
    const cr = atMs + between(rng, 1, 10) * MINUTE_MS
    record.events.push({ id: eventId, petKey: spec.key, ty: 'weight_check', at: iso(atMs), cf: 'witnessed', ea: null, la: null, cr: iso(cr), del: null, sev: null })
    record.weightChecks.push({ event_id: eventId, petKey: spec.key, weight_kg: kg })
    truth.weighIns.push({ eventId, petKey: spec.key, trueKg: Math.round(trueKg * 1000) / 1000, scale })
    // pets.weight_kg follows the latest weigh-in; 072's trigger keeps what it displaced.
    if (state.weightKg != null && state.weightKg !== kg) {
      const prev = state.lastDisplacement
      const heldFrom = prev && prev.replacedBy === state.weightKg ? prev.at : state.petCreatedMs
      record.weightDisplacements.push({
        petKey: spec.key,
        weight_kg: state.weightKg,
        replaced_by_kg: kg,
        source: 'profile',
        held_since_earliest: iso(heldFrom),
        held_since_latest: iso(heldFrom),
        displaced_at: iso(cr),
      })
      state.lastDisplacement = { at: cr, replacedBy: kg }
    }
    state.weightKg = kg
  }

  // ── Owner responses: appointments, visits, answers ──
  function acknowledge(state: PetState, sign: Sign, day: number, via: 'answer' | 'visit') {
    if (state.ackDay[sign] !== undefined) return
    state.ackDay[sign] = day
    truth.acks.push({ petKey: state.spec.key, sign, day, via })
    for (const p of state.spec.owner ?? []) {
      if (p.kind === 'lapse_after_ack' && p.signs.includes(sign)) {
        for (const s of p.signs) if (state.lapsedFrom[s] === undefined) state.lapsedFrom[s] = day + p.delayDays
        responses.push({ petKey: state.spec.key, day: day + p.delayDays, action: 'lapse_started', sign })
      }
    }
  }

  function bookAppointment(
    state: PetState,
    bookedDay: number,
    visitDay: number,
    reason: string,
    concern: Sign | null,
    recheckDays: number | null,
    attendsRecheck: boolean,
    source: 'record' | 'owner' = 'owner',
  ) {
    const key = state.spec.key
    const createdMs = localMs(bookedDay, 12)
    const apptId = id('appt', key, visitDay, reason)
    const appt = {
      id: apptId,
      petKey: key,
      scheduled_at: iso(localMs(visitDay, 10)),
      reason,
      questions: concern ? [{ text: `The ${concern}`, source, source_ref: concern, asked_at: iso(createdMs) }] : null,
      vet_visit_id: null as string | null,
      created_at: iso(createdMs),
    }
    record.appointments.push(appt)
    responses.push({ petKey: key, day: bookedDay, action: reason === 'recheck' ? 'recheck_booked' : 'book', sign: concern })
    if (visitDay >= scenario.days) return
    pending.push({
      day: visitDay,
      run: () => {
        const visitId = id('visit', key, visitDay, reason)
        const next = recheckDays == null ? null : addDays(startDate, visitDay + recheckDays)
        record.visits.push({ id: visitId, petKey: key, visited_at: addDays(startDate, visitDay), reason, next_visit_at: next, created_at: iso(localMs(visitDay, 16)) })
        appt.vet_visit_id = visitId
        responses.push({ petKey: key, day: visitDay, action: 'visit', sign: concern })
        if (state.spec.weight && state.spec.weight.cadence.kind !== 'none') weighIn(state, visitDay, 10.25, 'clinic')
        if (concern) acknowledge(state, concern, visitDay, 'visit')
        if (recheckDays != null && attendsRecheck) {
          bookAppointment(state, visitDay, visitDay + recheckDays, 'recheck', concern, null, false, 'record')
        }
      },
    })
  }

  function respond(state: PetState, day: number, cards: ShownCard[]) {
    const key = state.spec.key
    for (const sign of SIGNS) {
      const asked = cards.some((c) => c.petKey === key && c.sign === sign && c.ask !== 'none')
      state.consecutiveAsk[sign] = asked ? (state.consecutiveAsk[sign] ?? 0) + 1 : 0
      const run = state.consecutiveAsk[sign]!
      for (const p of state.spec.owner ?? []) {
        if (p.kind === 'answer_vet_knows' && run >= p.afterEvenings && !state.answered.has(sign)) {
          state.answered.add(sign)
          const answerDay = day + 1
          pending.push({
            day: answerDay,
            run: () => {
              record.ownerAnswers.push({ petKey: key, sign, kind: 'vet_knows', answeredAt: iso(localMs(answerDay, 19.5)) })
              responses.push({ petKey: key, day: answerDay, action: 'answer', sign })
              acknowledge(state, sign, answerDay, 'answer')
            },
          })
        }
        if (p.kind === 'book_visit' && run >= p.afterEvenings && !state.booked.has(sign)) {
          state.booked.add(sign)
          const bookDay = day + 1
          const lead = intBetween(S(key, 'lead', sign, day), p.leadDays[0], p.leadDays[1])
          pending.push({
            day: bookDay,
            run: () => bookAppointment(state, bookDay, bookDay + lead, p.carriesConcern ? `The ${sign}` : 'Checkup', p.carriesConcern ? sign : null, p.recheckDays, p.attendsRecheck, 'record'),
          })
        }
      }
    }
  }

  // ── The truth for one pet-day ──
  function effectActive(state: PetState, e: Extract<Effect, { kind: 'rate_step' }>, day: number): boolean {
    if ('day' in e.from) return day >= e.from.day
    const ack = state.ackDay[e.sign]
    return ack !== undefined && day >= ack + e.from.afterAck
  }

  function rateToday(state: PetState, s: SignSpec, day: number): number {
    const key = state.spec.key
    let lambda = s.rate.perMonth / 30
    if (s.rate.weeklyDispersion) {
      const k = s.rate.weeklyDispersion
      lambda *= gamma(S(key, 'disp', s.sign, Math.floor(day / 7)), k, 1 / k)
    }
    if (s.rate.wander) {
      const phi = Math.pow(0.5, 1 / s.rate.wander.halfLifeDays)
      const x = (state.wander[s.sign] ?? 0) * phi + s.rate.wander.sd * normal(S(key, 'wander', s.sign, day))
      state.wander[s.sign] = x
      lambda *= Math.exp(x)
    }
    for (const e of state.spec.effects ?? []) {
      if (e.kind === 'rate_step' && e.sign === s.sign && effectActive(state, e, day)) lambda *= e.multiplier
      if (e.kind === 'flare' && e.sign === s.sign && day >= e.fromDay && day < e.fromDay + e.days) lambda *= e.multiplier
    }
    const t = state.spec.trial
    if (t && t.response.kind === 'responder' && s.sign === 'vomit' && day >= t.startDay + t.response.onsetDays) {
      lambda *= t.response.residual
    }
    return lambda
  }

  function causeOf(state: PetState, sign: Sign, day: number): EpisodeCause {
    for (const e of state.spec.effects ?? []) {
      if (e.kind === 'rate_step' && e.sign === sign && effectActive(state, e, day)) return 'rate_step'
      if (e.kind === 'flare' && e.sign === sign && day >= e.fromDay && day < e.fromDay + e.days) return 'flare'
    }
    return 'background'
  }

  interface DayMeal { atMs: number; food: SynFood }

  function mealsToday(state: PetState, day: number): DayMeal[] {
    const spec = state.spec
    const f = spec.feeding
    const rng = S(spec.key, 'meals', day)
    const out: DayMeal[] = []
    const trialOn = spec.trial !== undefined && day >= spec.trial.startDay
    if (f.kind === 'meals') {
      const daily = pickWeighted(rng, f.foods.map((x) => ({ ...x, weight: 1 })))
      for (const h of f.hours) {
        const atMs = localMs(day, h + between(rng, -0.67, 0.67))
        let chosen: FoodSpec
        if (trialOn) chosen = spec.trial!.food
        else if (f.switchAfterLoggedVomit && day <= state.switchUntilDay) chosen = f.switchAfterLoggedVomit.food
        else chosen = f.choose === 'daily' ? daily : pickWeighted(rng, f.foods)
        out.push({ atMs, food: food(chosen) })
      }
      if (f.treat && !trialOn && chance(rng, f.treat.perDay)) out.push({ atMs: localMs(day, between(rng, 12, 20)), food: food(f.treat.food) })
    } else {
      for (const h of f.wetHours) out.push({ atMs: localMs(day, h + between(rng, -0.5, 0.5)), food: food(trialOn ? spec.trial!.food : f.wet) })
    }
    return out.sort((a, b) => a.atMs - b.atMs)
  }

  interface DayEpisode { atMs: number; sign: Sign; cause: EpisodeCause }

  function episodesToday(state: PetState, day: number, meals: DayMeal[]): DayEpisode[] {
    const spec = state.spec
    const out: DayEpisode[] = []
    for (const s of spec.signs) {
      const rng = S(spec.key, 'ep', s.sign, day)
      // Once per sign per day: rateToday advances the wander state.
      const lambda = rateToday(state, s, day)
      const n = poisson(rng, lambda)
      const cause = causeOf(state, s.sign, day)
      for (let i = 0; i < n; i++) {
        let atMs: number
        const timing = s.timing ?? 'any'
        if (timing === 'postprandial' && meals.length > 0) {
          const m = meals[Math.floor(rng() * meals.length)]
          atMs = m.atMs + between(rng, 0.25, 2) * HOUR_MS
        } else if (timing === 'early_morning') {
          atMs = localMs(day, between(rng, 4, 7))
        } else {
          atMs = localMs(day, between(rng, 0, 24))
        }
        out.push({ atMs, sign: s.sign, cause })
      }
      // A protein reaction adds (rr − 1) × the day's rate on a day the protein was eaten, timed
      // after that meal, so the day-level rate ratio (exposed vs not) is rr by construction.
      for (const e of spec.effects ?? []) {
        if (e.kind !== 'protein_reaction' || e.sign !== s.sign) continue
        const exposed = meals.filter((m) => m.food.proteins.includes(e.protein))
        if (exposed.length === 0) continue
        const extra = poisson(S(spec.key, 'protein', s.sign, day), lambda * (e.rr - 1))
        const r2 = S(spec.key, 'protein-time', s.sign, day)
        for (let i = 0; i < extra; i++) {
          const m = exposed[Math.floor(r2() * exposed.length)]
          out.push({ atMs: m.atMs + between(r2, 0.5, 8) * HOUR_MS, sign: s.sign, cause: 'protein' })
        }
      }
    }
    for (const e of spec.effects ?? []) {
      if (e.kind === 'indiscretion') {
        const rng = S(spec.key, 'raid', day)
        if (chance(rng, e.perMonth / 30)) {
          const startMs = localMs(day, between(rng, 8, 20))
          const vomits = intBetween(rng, 2, 3)
          for (let i = 0; i < vomits; i++) out.push({ atMs: startMs + between(rng, 0, 12) * HOUR_MS, sign: 'vomit', cause: 'indiscretion' })
          out.push({ atMs: startMs + between(rng, 4, 16) * HOUR_MS, sign: 'diarrhea', cause: 'indiscretion' })
        }
      }
      if (e.kind === 'kennel_cough' && day >= e.fromDay && day < e.fromDay + e.days) {
        const rng = S(spec.key, 'kc', day)
        const n = poisson(rng, e.perDay)
        for (let i = 0; i < n; i++) out.push({ atMs: localMs(day, between(rng, 6, 23)), sign: 'cough', cause: 'infection' })
      }
    }
    return out.sort((a, b) => a.atMs - b.atMs)
  }

  // ── Logging: what the owner writes ──
  function attrition(spec: PetSpec, day: number): number {
    const h = spec.logging.attritionHalfLifeDays
    return h ? Math.pow(0.5, day / h) : 1
  }

  function createdAfter(rng: Rng, atMs: number, pBackfill: number): number {
    return atMs + (chance(rng, pBackfill) ? between(rng, 6, 36) * HOUR_MS : between(rng, 1, 15) * MINUTE_MS)
  }

  function logEpisode(state: PetState, day: number, ep: DayEpisode, index: number) {
    const spec = state.spec
    const L = spec.logging
    const epId = id('truth-ep', spec.key, day, index)
    const rng = S(spec.key, 'log-ep', day, index)
    const entry: TruthEpisode = { id: epId, petKey: spec.key, sign: ep.sign, at: iso(ep.atMs), cause: ep.cause, loggedEventIds: [], loggedPetKey: null, loggedAs: null }
    truth.episodes.push(entry)

    const redFlag = ep.sign === 'vomit' && state.redFlagsPending.length > 0 && state.redFlagsPending[0] <= day
    const lapsed = state.lapsedFrom[ep.sign] !== undefined && day >= state.lapsedFrom[ep.sign]!
    const pLog = L.pSymptom * attrition(spec, day)
    const captured = redFlag || (!lapsed && chance(rng, pLog))
    if (!captured) return
    if (redFlag) state.redFlagsPending.shift()

    const ty: SynEvent['ty'] = ep.cause === 'infection' && chance(rng, L.pGagAsVomit ?? 0) ? 'vomit' : ep.sign
    const found = !redFlag && ty !== 'cough' && chance(rng, L.pFound)
    const loggedPet = found ? (L.foundPilesGoTo ?? spec.key) : spec.key
    let at: number
    let cf: SynEvent['cf']
    let ea: string | null = null
    let la: string | null = null
    if (found) {
      const discovered = ep.atMs + between(rng, 1, 10) * HOUR_MS
      ea = iso(ep.atMs - between(rng, 0, 8) * HOUR_MS)
      la = iso(discovered)
      at = discovered
      cf = 'window'
    } else if (chance(rng, 0.15)) {
      at = Math.round(ep.atMs / (30 * MINUTE_MS)) * 30 * MINUTE_MS
      cf = 'estimated'
    } else {
      at = ep.atMs
      cf = 'witnessed'
    }
    const cr = Math.max(createdAfter(rng, at, L.pBackfill), at + MINUTE_MS)
    const eventId = id('ev', spec.key, day, index)
    const row: SynEvent = { id: eventId, petKey: loggedPet, ty, at: iso(at), cf, ea, la, cr: iso(cr), del: null, sev: null }
    record.events.push(row)
    entry.loggedEventIds.push(eventId)
    entry.loggedPetKey = loggedPet
    entry.loggedAs = ty

    if (ty === 'vomit' && (redFlag || chance(rng, L.pPhoto))) {
      const blood: SynAnalysis['blood_present'] = redFlag ? 'fresh_red' : chance(rng, 0.05) ? 'unsure' : 'none_visible'
      const bile = spec.signs.some((s) => s.sign === 'vomit' && s.timing === 'early_morning') ? 'yes' : chance(rng, 0.2) ? 'yes' : 'no'
      record.analyses.push({
        event_id: eventId,
        incident_type: 'vomit',
        status: 'completed',
        blood_present: blood,
        stool_blood_present: null,
        foreign_material_present: 'no',
        contents: null,
        bile_present: bile,
        created_at: iso(cr + between(rng, 1, 3) * MINUTE_MS),
        edited_at: null,
        recommendation: null,
        contextual_flags: null,
        visual_flags: null,
        rb: blood,
        rf: 'no',
      })
    }
    if (chance(rng, L.pDuplicate)) {
      const dupId = id('ev-dup', spec.key, day, index)
      const dupCr = cr + between(rng, 1, 20) * MINUTE_MS
      const del = chance(rng, L.pDuplicateCleanedUp) ? iso(dupCr + between(rng, 5, 120) * MINUTE_MS) : null
      record.events.push({ ...row, id: dupId, cr: iso(dupCr), del })
      entry.loggedEventIds.push(dupId)
    }
    if (ty === 'vomit' && loggedPet === spec.key && spec.feeding.kind === 'meals' && spec.feeding.switchAfterLoggedVomit) {
      state.switchUntilDay = Math.max(state.switchUntilDay, day + spec.feeding.switchAfterLoggedVomit.days)
    }
  }

  function logMeal(state: PetState, day: number, meal: DayMeal, index: number) {
    const spec = state.spec
    const rng = S(spec.key, 'log-meal', day, index)
    const captured = chance(rng, spec.logging.pMeal * attrition(spec, day))
    const mealId = id('meal', spec.key, day, index)
    truth.meals.push({ petKey: spec.key, at: iso(meal.atMs), foodItemId: meal.food.id, protein: meal.food.primaryProtein, loggedEventId: captured ? mealId : null })
    if (!captured) return
    const r = rng()
    const rating = chance(rng, spec.logging.pRate) ? (r < 0.8 ? 'all' : r < 0.95 ? 'most' : 'some') : null
    record.meals.push({ id: mealId, petKey: spec.key, at: iso(meal.atMs), cf: 'witnessed', cr: iso(createdAfter(rng, meal.atMs, spec.logging.pBackfill)), del: null, foodItemId: meal.food.id, rating })
  }

  // ── The day loop ──
  for (let day = 0; day < scenario.days; day++) {
    // An action can queue another for the same day (a visit booked for today), so drain until quiet.
    for (let due = pending.filter((p) => p.day === day); due.length > 0; due = pending.filter((p) => p.day === day)) {
      pending = pending.filter((p) => p.day !== day)
      for (const p of due) p.run()
    }

    for (const state of states.values()) {
      const meals = mealsToday(state, day)
      meals.forEach((m, i) => logMeal(state, day, m, i))
      episodesToday(state, day, meals).forEach((ep, i) => logEpisode(state, day, ep, i))
      if (state.nextHomeWeighDay === day && state.spec.weight?.cadence.kind === 'home') {
        weighIn(state, day, 8, 'home')
        const [lo, hi] = state.spec.weight.cadence.everyDays
        state.nextHomeWeighDay = day + intBetween(S(state.spec.key, 'weigh-gap', day), lo, hi)
      }
    }

    const nowIso = iso(localMs(day, EVENING_HOUR))
    const cards = observer({ scenarioId: scenario.id, dayIndex: day, nowIso, record })
    shown.push({ day, nowIso, cards })
    for (const state of states.values()) respond(state, day, cards)
  }

  for (const p of record.pets) p.weight_kg = states.get(p.key)!.weightKg
  record.foods = [...foods.values()]
  // Every `at` is toISOString()'s fixed-width UTC spelling, so text order is time order here
  // (C-40's warning is about mixing spellings, which this corpus never does).
  const byTime = (a: { at: string; id: string }, b: { at: string; id: string }) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : 1)
  record.events.sort(byTime)
  record.meals.sort(byTime)
  return { record, truth, responses, shown }
}
