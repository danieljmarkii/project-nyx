// The EN-1 scorecard: what the engine does to alert burden and to detection, measured on PR-15's
// synthetic pets (Engines v3 PR-16, CUL-1131). ADEMP.md beside this file is the design; this is
// the arithmetic.
//
// PURE. Simulation results in, numbers out; no clock, no file, no engine call. The observer
// (observer.ts) is what ran the engine; this reads the cards it recorded against the answer
// key each scenario carries (`key`, trajectory/spec.ts) and the truth ledger. The engine is
// never re-derived here (C-34): a lane is read off the card's finding type, never recomputed.
//
// WHAT A ROW MEANS. Every number is over the CURATED output, the cards Home shows after
// suppression, caps and the ⑦→④ valve, so the composition layer is scored as a response
// protocol (G-AMOC, Jiang/Cooper/Neill 2009) and the per-lane rows are that same output grouped
// by lane, never a lane run alone.
//
// REPORTED, NEVER GATING. Nothing here fails a build on a value. passLines.ts states what each
// wave is held to; the offline go-live check (ADEMP.md §5) is where a pass line is read.

import type { ScenarioSpec, Lane, EffectStart } from '../../_shared/engineCorpus/trajectory/spec.ts'
import type { AskRegister, SimulationResult, Sign } from '../../_shared/engineCorpus/trajectory/types.ts'
import type { ScoredCard } from './observer.ts'
import { visibleAt } from './asOf.ts'

// ── Lanes ──────────────────────────────────────────────────────────────────────

/** The scorecard's lanes: the corpus's `Lane` where a finding type maps onto one, plus the
 *  engine's lanes the answer key has no name for (burden, intake, the gap row). */
export type ScoreLane =
  | 'food' | 'timing' | 'worsening' | 'burden' | 'chronic' | 'trial' | 'red_flag'
  | 'reflection_improving' | 'reflection_flat' | 'intake' | 'gap' | 'other'

export const SCORE_LANES: readonly ScoreLane[] = [
  'food', 'timing', 'worsening', 'burden', 'chronic', 'trial', 'red_flag',
  'reflection_improving', 'reflection_flat', 'intake', 'gap', 'other',
]

/** A finding type → its lane. A type not listed is 'other', and shows as its own row. */
export function laneOf(card: Pick<ScoredCard, 'findingType' | 'direction'>): ScoreLane {
  switch (card.findingType) {
    case 'food_symptom_correlation':
      return 'food'
    case 'postprandial_timing':
    case 'timeofday_clustering':
    case 'empty_stomach_timing':
    case 'timing_story':
      return 'timing'
    case 'symptom_worsening':
      return 'worsening'
    case 'symptom_burden':
      return 'burden'
    case 'symptom_chronicity':
      return 'chronic'
    case 'trial_response':
      return 'trial'
    case 'incident_red_flag':
      return 'red_flag'
    case 'reflection':
      return card.direction === 'improving' ? 'reflection_improving' : 'reflection_flat'
    case 'intake_decline':
      return 'intake'
    case 'gap_shortening':
      return 'gap'
    default:
      return 'other'
  }
}

/**
 * Does a card answer the key's lane? `worsening` takes the burden card too: PR-14c's valve drops
 * ④ whenever the burden card shows for the sign (pipeline.ts suppressWorseningUnderBurden), so a
 * doubling the burden card caught would otherwise score as a miss, and a false burden card on a
 * null pet is the same false safety claim. `resolution` is an improving reflection. `weight` and
 * `re_raise` have no finding type today: weight has no lane (EN-8 builds it), and a re-raise is a
 * card on an acknowledged sign, which `matchesKey` answers with the acknowledgement day.
 */
function laneAnswers(keyLane: Lane, card: ScoredCard): boolean {
  const lane = laneOf(card)
  switch (keyLane) {
    case 'worsening':
      return lane === 'worsening' || lane === 'burden'
    case 'resolution':
      return lane === 'reflection_improving'
    case 'weight':
      return false
    case 're_raise':
      return card.ask !== 'none'
    default:
      return lane === keyLane
  }
}

/** Can any card answer this lane today? Weight has no finding type until EN-8 (PR-19): a line
 *  over it would read zero false cards for every engine, so it is `incomplete`, never a pass. */
export function laneCanMatch(keyLane: Lane): boolean {
  return keyLane !== 'weight'
}

interface KeyRef {
  petKey: string
  lane: Lane
  sign?: Sign
  protein?: string
}

function matchesKey(k: KeyRef, card: ScoredCard): boolean {
  if (card.petKey !== k.petKey) return false
  if (k.sign !== undefined && card.sign !== k.sign) return false
  // A food detection names the reacting protein ALONE (PM ruling, 2026-09-30). A joint card, or one
  // naming everything the pet eats, points a vet's elimination diet at proteins that are not the
  // culprit; counted as a detection whenever it merely INCLUDED the culprit, naming more proteins
  // always bought detection, and four rounds of added rows only priced that (eighth adversarial pass).
  if (k.protein !== undefined && !(card.proteins.length === 1 && card.proteins[0] === k.protein)) return false
  // A re-raise is a card on a sign, so a key that names none names every sign.
  return laneAnswers(k.lane, card)
}

// ── One scenario ───────────────────────────────────────────────────────────────

export interface ScenarioRun {
  scenario: ScenarioSpec
  seed: number
  result: SimulationResult
}

const REGISTERS: readonly Exclude<AskRegister, 'none'>[] = ['call', 'book_visit', 'word_with_vet', 'mention_to_vet']
const REGISTER_RANK: Record<AskRegister, number> = { none: 0, mention_to_vet: 1, word_with_vet: 2, book_visit: 3, call: 4 }

/** The chance horizons (E-4: 180 days; the lifetime reading at 365 where the scenario runs that long). */
export const HORIZONS = [180, 365] as const
/** EN-9's re-raise window: eight weeks after the acknowledgement (BRK-4). */
export const RE_RAISE_WINDOW_DAYS = 56
const DAYS_PER_MONTH = 30
/** A detection whose start leaves fewer evenings than this is censored, not scored as a miss. */
export const DETECT_MIN_WINDOW_DAYS = 14
/**
 * Evenings with no matching card before the start for a pet-run to be scored at all. A card
 * standing across the start is not the engine seeing the effect, and neither is one that blinked
 * off for an evening (second adversarial pass: a one-evening gap in a standing latch was credited
 * as a 43-day detection, and a stable correct card scored worse than the same card with a gap).
 */
export const DETECT_CLEAR_EVENINGS = 7
/** A matching card later than this many days after the start is a miss, not a slow detection. */
export const DETECT_WINDOW_DAYS = 56

export interface DetectionScore {
  label: string
  lane: Lane
  scoring: 'paired' | 'both_acknowledged'
  /** Pet-runs the entry is scored on (for both_acknowledged: the ones that reached the acknowledgement). */
  eligible: number
  detected: number
  /** Median days from the effect's start to the first matching card's onset, over the detected. */
  medianDays: number | null
  /** both_acknowledged only: pet-runs where the engine never asked, so the owner never acknowledged. */
  neverAcknowledged: number
  /** Pet-runs whose start left fewer than DETECT_MIN_WINDOW_DAYS evenings: not scored. */
  censored: number
  /** Pet-runs with a matching card in the DETECT_CLEAR_EVENINGS before the start: not scored, reported. */
  showingAtStart: number
  /** re_raise only: of the acknowledged pet-runs, the share with an ask on the sign between the
   *  acknowledgement and the start (a re-raise with nothing to raise it). */
  raisedBeforeStart: number | null
  /** re_raise only: pet-runs acknowledged too close to (or after) the start to score a re-raise. */
  ackTooLate: number
  /**
   * Food entries only, over every pet-run: the share shown, on or after the start, a food card that
   * names ANY protein other than the reacting one, a joint card naming it alongside another
   * included (the PM's ruling, 2026-09-30: to a vet building an elimination diet, a joint card
   * still points at a protein that is not the culprit). An engine naming all nine proteins on every
   * card raised food detection and moved no false-card row (sixth adversarial pass).
   */
  wrongProtein: number | null
  /** Food entries only: the share shown a joint card naming the reacting protein alongside another (a subset of wrongProtein). */
  jointWithReacting: number | null
  /**
   * Food entries only: evenings carrying a food card that names another protein, per pet-month,
   * from the start. The ever-share above saturates: once a pet has seen one wrong card, naming
   * every protein on every later evening cost nothing (seventh adversarial pass).
   */
  wrongProteinEveningsPerPetMonth: number | null
  /** Food entries only: evenings per pet-month, from the start, carrying a food card naming the reacting protein alone. Persistence: a correct card that is dropped, or never shown, lowers it. */
  culpritAloneEveningsPerPetMonth: number | null
  /** Food entries only: of the evenings carrying a food card, the share whose cards name any other protein. Precision: showing fewer food evenings cannot lower it. */
  wrongShareOfFoodEvenings: number | null
}

export interface ScenarioScore {
  id: string
  category: ScenarioSpec['category']
  petRuns: number
  petEvenings: number
  /** Share of pet-runs that saw at least one card of the lane within each horizon. */
  laneShare: Record<string, Partial<Record<ScoreLane, number>>>
  /** Share of pet-runs with at least one card the answer key calls false, within each horizon. */
  falseShare: Record<string, number | null>
  /** The same, per lane the key calls false (0 included), so a lane's false-card cost is a row whatever the engine does. */
  falseLaneShare: Record<string, Partial<Record<Lane, number>>>
  /** Share of pet-runs with at least one safety card within each horizon. */
  safetyShare: Record<string, number>
  /** Evenings carrying an ask, per pet-month, by Home's register; `any` is evenings with at least one. */
  askPerPetMonth: Record<Exclude<AskRegister, 'none'> | 'any', number>
  /** Evenings carrying at least one card of the lane, per pet-month: each lane's share of the burden. */
  laneEveningsPerPetMonth: Partial<Record<ScoreLane, number>>
  /** Evenings a card's ask fell a register while that card stayed and its sign's 7-day logged count did not fall, per pet-month (CUL-1272). */
  askDropWithoutFallPerPetMonth: number
  /** Median evening of the first safety card (ARL to a first alarm, GAP-6), null when fewer than half the pet-runs saw one. */
  medianDaysToFirstSafety: number | null
  detections: DetectionScore[]
  /** The hard property (EN-3/4/7): every injected photo red flag shows on the evening its row is visible, at the shipped tier (a call). */
  redFlags: { injected: number; atShippedTier: number; below: number } | null
  /** EN-9's baseline, where the owner acknowledged a concern about an unchanged sign. */
  care: CareScore | null
}

export interface CareScore {
  /** Pet-runs with an acknowledgement of a sign the key says stays unchanged afterwards. */
  acknowledged: number
  /** Pet-runs where the engine never asked, so the owner never acknowledged: the arm's own failure, never a pass. */
  neverAcknowledged: number
  /** Of those, the share that saw an ask on that sign again within eight weeks. */
  reRaisedWithin8Weeks: number | null
  /** Of those, the share that saw an ask on that sign again at any point after the acknowledgement. */
  reRaisedEver: number | null
  /** Evenings with an ask on that sign after the acknowledgement, per pet-month of those evenings. */
  askPerPetMonthAfterAck: number | null
  /** Evenings after the acknowledgement with no card on that sign, over all such evenings. */
  silentEveningShare: number | null
  /** Median, over those pet-runs, of the longest run of silent evenings after the acknowledgement. */
  medianLongestSilentRun: number | null
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function startDay(from: EffectStart, ackDay: number | undefined): number | undefined {
  if ('day' in from) return from.day
  return ackDay === undefined ? undefined : ackDay + from.afterAck
}

function cardsOf(result: SimulationResult): { day: number; nowIso: string; cards: ScoredCard[] }[] {
  return result.shown as { day: number; nowIso: string; cards: ScoredCard[] }[]
}

/** The sign's logged episodes in the 7 days before `T` (the count the owner can see move). */
function loggedCount7(result: SimulationResult, petKey: string, sign: Sign, T: number): number {
  let n = 0
  for (const e of result.record.events) {
    if (e.petKey === petKey && e.ty === sign && visibleAt(e, T, 7)) n++
  }
  return n
}

export function scoreScenario(runs: readonly ScenarioRun[]): ScenarioScore {
  if (runs.length === 0) throw new Error('scoreScenario: no runs')
  const sc = runs[0].scenario
  const horizons = HORIZONS.filter((h) => h <= sc.days)
  const petKeys = sc.pets.map((p) => p.key)
  const acc = {
    petRuns: 0,
    petEvenings: 0,
    lane: new Map<string, number>(),
    falseAny: new Map<number, number>(),
    falseLane: new Map<string, number>(),
    safety: new Map<number, number>(),
    ask: { call: 0, book_visit: 0, word_with_vet: 0, mention_to_vet: 0, any: 0 } as Record<Exclude<AskRegister, 'none'> | 'any', number>,
    askDrops: 0,
    laneEvenings: new Map<ScoreLane, number>(),
    firstSafety: [] as number[],
  }
  const detections: DetectionScore[] = sc.key.detect.map((d) => ({
    label: `${d.petKey}:${d.lane}${d.sign ? `:${d.sign}` : ''}${d.protein ? `:${d.protein}` : ''}`,
    lane: d.lane,
    scoring: d.scoring,
    eligible: 0,
    detected: 0,
    medianDays: null,
    neverAcknowledged: 0,
    censored: 0,
    showingAtStart: 0,
    raisedBeforeStart: null,
    ackTooLate: 0,
    wrongProtein: null,
    jointWithReacting: null,
    wrongProteinEveningsPerPetMonth: null,
    culpritAloneEveningsPerPetMonth: null,
    wrongShareOfFoodEvenings: null,
  }))
  const detectDays: number[][] = sc.key.detect.map(() => [])
  const preRaise = sc.key.detect.map(() => ({ acked: 0, raised: 0 }))
  const attribution = sc.key.detect.map(() => ({ runs: 0, wrong: 0, joint: 0, wrongEvenings: 0, evenings: 0, aloneEvenings: 0, foodEvenings: 0 }))
  let redFlags: ScenarioScore['redFlags'] = null
  const reRaiseSigns = sc.key.falseCards.filter((f) => f.lane === 're_raise')
  const falseLanes = [...new Set(sc.key.falseCards.map((f) => f.lane).filter((l) => l !== 're_raise'))]
  const care = { neverAcknowledged: 0, acknowledged: 0, reRaised: 0, reRaisedEver: 0, askEvenings: 0, silent: 0, postAck: 0, longest: [] as number[] }

  for (const run of runs) {
    const evenings = cardsOf(run.result)
    const truth = run.result.truth
    for (const petKey of petKeys) {
      acc.petRuns++
      const seenLane = new Map<number, Set<ScoreLane>>(horizons.map((h) => [h, new Set()]))
      const seenFalse = new Set<number>()
      const seenFalseLane = new Set<string>()
      const seenSafety = new Set<number>()
      let firstSafety: number | null = null
      let prev: ScoredCard[] = []
      for (const ev of evenings) {
        const mine = ev.cards.filter((c) => c.petKey === petKey)
        acc.petEvenings++
        const registers = new Set(mine.map((c) => c.ask).filter((a) => a !== 'none'))
        for (const r of registers) acc.ask[r as Exclude<AskRegister, 'none'>]++
        if (registers.size > 0) acc.ask.any++
        for (const l of new Set(mine.map(laneOf))) acc.laneEvenings.set(l, (acc.laneEvenings.get(l) ?? 0) + 1)
        const isFalse = mine.some((c) => sc.key.falseCards.some((f) => f.lane !== 're_raise' && matchesKey(f, c)))
        const hasSafety = mine.some((c) => c.priorityClass === 'safety')
        if (hasSafety && firstSafety === null) firstSafety = ev.day
        for (const h of horizons) {
          if (ev.day >= h) continue
          for (const c of mine) seenLane.get(h)!.add(laneOf(c))
          if (isFalse) seenFalse.add(h)
          for (const f of falseLanes) if (mine.some((c) => sc.key.falseCards.some((k) => k.lane === f && matchesKey(k, c)))) seenFalseLane.add(`${h}|${f}`)
          if (hasSafety) seenSafety.add(h)
        }
        // CUL-1272: the same card (type and sign) on consecutive evenings, its ask a register
        // lower, while the sign's logged 7-day count did not fall.
        for (const c of mine) {
          const before = prev.find((p) => p.findingType === c.findingType && p.sign === c.sign)
          if (!before || c.sign === null || REGISTER_RANK[c.ask] >= REGISTER_RANK[before.ask]) continue
          const T = Date.parse(ev.nowIso)
          if (loggedCount7(run.result, petKey, c.sign, T) >= loggedCount7(run.result, petKey, c.sign, T - 86_400_000)) acc.askDrops++
        }
        prev = mine
      }
      for (const h of horizons) {
        for (const l of seenLane.get(h)!) acc.lane.set(`${h}|${l}`, (acc.lane.get(`${h}|${l}`) ?? 0) + 1)
        if (seenFalse.has(h)) acc.falseAny.set(h, (acc.falseAny.get(h) ?? 0) + 1)
        for (const f of falseLanes) if (seenFalseLane.has(`${h}|${f}`)) acc.falseLane.set(`${h}|${f}`, (acc.falseLane.get(`${h}|${f}`) ?? 0) + 1)
        if (seenSafety.has(h)) acc.safety.set(h, (acc.safety.get(h) ?? 0) + 1)
      }
      if (firstSafety !== null) acc.firstSafety.push(firstSafety)

      // Detection, per answer-key entry. A pet-run is scored only when it was CLEAR: no matching
      // card in the DETECT_CLEAR_EVENINGS before the start. Its hit is then the first matching
      // card on or after the start, within DETECT_WINDOW_DAYS; later is a miss. A pet-run with a
      // card standing (or flickering) across the start is counted in `showingAtStart` and left out
      // of the probability, so neither a latch that never left nor a one-evening gap in it can
      // read as the engine seeing the effect.
      sc.key.detect.forEach((d, i) => {
        if (d.petKey !== petKey) return
        const ackDay = d.sign ? truth.acks.find((a) => a.petKey === petKey && a.sign === d.sign)?.day : truth.acks.find((a) => a.petKey === petKey)?.day
        const from = startDay(d.from, ackDay)
        // Attribution, before any eligibility rule: every pet-run of a food entry counts.
        if (d.protein !== undefined && from !== undefined) {
          const after = evenings.filter((ev) => ev.day >= from)
          const foodOn = (ev: (typeof evenings)[number]) => ev.cards.filter((c) => c.petKey === petKey && laneOf(c) === 'food' && (d.sign === undefined || c.sign === d.sign))
          const food = after.flatMap(foodOn)
          attribution[i].runs++
          attribution[i].evenings += after.length
          attribution[i].wrongEvenings += after.filter((ev) => foodOn(ev).some((c) => c.proteins.some((p) => p !== d.protein))).length
          attribution[i].foodEvenings += after.filter((ev) => foodOn(ev).length > 0).length
          attribution[i].aloneEvenings += after.filter((ev) => foodOn(ev).some((c) => c.proteins.length === 1 && c.proteins[0] === d.protein)).length
          if (food.some((c) => c.proteins.some((p) => p !== d.protein))) attribution[i].wrong++
          if (food.some((c) => c.proteins.includes(d.protein!) && c.proteins.length > 1)) attribution[i].joint++
        }
        // No acknowledgement: an acknowledgement-anchored start has no day, and a re-raise has
        // nothing it raises again (a fixed-day doubling the engine never asked about was scored as
        // a first raise and counted nowhere, fifth adversarial pass). Both are counted and left out.
        if (from === undefined || (d.lane === 're_raise' && ackDay === undefined)) {
          detections[i].neverAcknowledged++
          return
        }
        // A re-raise needs room: CLEAR quiet evenings between the acknowledgement and the start.
        // When the owner acknowledged later than that (a fixed-day doubling acknowledged on or
        // after day 83), the ask that led to the acknowledgement would be read as the re-raise
        // (third adversarial pass), so the pet is left out and counted in `ackTooLate`.
        if (d.lane === 're_raise' && ackDay !== undefined && ackDay + DETECT_CLEAR_EVENINGS >= from) {
          detections[i].ackTooLate++
          return
        }
        // A re-raise with nothing to raise it: an ask on the sign after the acknowledgement and
        // before the effect starts (read before censoring, which only concerns the hit).
        if (d.lane === 're_raise' && ackDay !== undefined) {
          preRaise[i].acked++
          if (evenings.some((ev) => ev.day > ackDay && ev.day < from && ev.cards.some((c) => matchesKey(d, c)))) preRaise[i].raised++
        }
        // Censored: too few evenings left after the start to see anything (an arm that
        // acknowledges late must not collect misses it could never have avoided).
        if (from + DETECT_MIN_WINDOW_DAYS > sc.days) {
          detections[i].censored++
          return
        }
        const matching = (ev: (typeof evenings)[number]) => ev.cards.some((c) => matchesKey(d, c))
        // A re-raise must also be clear of the acknowledgement's own evening onward.
        const clearFrom = d.lane === 're_raise' && ackDay !== undefined ? Math.max(from - DETECT_CLEAR_EVENINGS, ackDay + 1) : from - DETECT_CLEAR_EVENINGS
        if (evenings.some((ev) => ev.day >= clearFrom && ev.day < from && matching(ev))) {
          detections[i].showingAtStart++
          return
        }
        detections[i].eligible++
        const hit = evenings.find((ev) => ev.day >= from && ev.day <= from + DETECT_WINDOW_DAYS && matching(ev))
        if (hit) {
          detections[i].detected++
          detectDays[i].push(hit.day - from)
        }
      })

      // The red-flag property: on the first evening both the flagged row and its photo read are
      // visible (the read is written a few minutes after the row), a red-flag card at the
      // shipped tier. Any red-flag card on the pet counts: every scenario injects one flag.
      for (const flag of truth.redFlags.filter((f) => f.petKey === petKey)) {
        redFlags ??= { injected: 0, atShippedTier: 0, below: 0 }
        redFlags.injected++
        const row = run.result.record.events.find((e) => e.id === flag.eventId)
        const read = run.result.record.analyses.find((a) => a.event_id === flag.eventId)
        const first = row && read
          ? evenings.find((ev) => ev.day >= flag.day && visibleAt(row, Date.parse(ev.nowIso)) && Date.parse(read.created_at) <= Date.parse(ev.nowIso))
          : undefined
        const card = first?.cards.find((c) => c.petKey === petKey && laneOf(c) === 'red_flag')
        if (card && card.ask === 'call') redFlags.atShippedTier++
        else redFlags.below++
      }

      // EN-9's baseline: an acknowledged sign the key says stays unchanged.
      for (const f of reRaiseSigns.filter((x) => x.petKey === petKey)) {
        const ack = truth.acks.find((a) => a.petKey === petKey && (f.sign === undefined || a.sign === f.sign))
        if (!ack) {
          care.neverAcknowledged++
          continue
        }
        care.acknowledged++
        const after = evenings.filter((ev) => ev.day > ack.day)
        const onSign = (ev: (typeof evenings)[number]) => ev.cards.filter((c) => c.petKey === petKey && c.sign === ack.sign)
        const asks = (ev: (typeof evenings)[number]) => onSign(ev).some((c) => c.ask !== 'none')
        if (after.some((ev) => ev.day <= ack.day + RE_RAISE_WINDOW_DAYS && asks(ev))) care.reRaised++
        // The whole horizon after the acknowledgement: a latch that starts after week 8, or a
        // timer, clears the eight-week window and is caught here (second adversarial pass).
        if (after.some(asks)) care.reRaisedEver++
        care.askEvenings += after.filter(asks).length
        let run = 0
        let longest = 0
        for (const ev of after) {
          care.postAck++
          if (onSign(ev).length === 0) {
            care.silent++
            run++
            longest = Math.max(longest, run)
          } else run = 0
        }
        care.longest.push(longest)
      }
    }
  }

  const share = (n: number) => round(n / acc.petRuns)
  const petMonths = acc.petEvenings / DAYS_PER_MONTH
  const perMonth = (n: number) => round(n / petMonths)
  const laneShare: ScenarioScore['laneShare'] = {}
  const falseShare: ScenarioScore['falseShare'] = {}
  const falseLaneShare: ScenarioScore['falseLaneShare'] = {}
  const safetyShare: ScenarioScore['safetyShare'] = {}
  for (const h of horizons) {
    laneShare[h] = {}
    for (const l of SCORE_LANES) {
      const n = acc.lane.get(`${h}|${l}`) ?? 0
      if (n > 0) laneShare[h][l] = share(n)
    }
    falseShare[h] = sc.key.falseCards.some((f) => f.lane !== 're_raise') ? share(acc.falseAny.get(h) ?? 0) : null
    falseLaneShare[h] = Object.fromEntries(falseLanes.map((f) => [f, share(acc.falseLane.get(`${h}|${f}`) ?? 0)]))
    safetyShare[h] = share(acc.safety.get(h) ?? 0)
  }
  detections.forEach((d, i) => {
    d.medianDays = median(detectDays[i])
    if (preRaise[i].acked > 0) d.raisedBeforeStart = round(preRaise[i].raised / preRaise[i].acked)
    if (attribution[i].runs > 0) {
      d.wrongProtein = round(attribution[i].wrong / attribution[i].runs)
      d.jointWithReacting = round(attribution[i].joint / attribution[i].runs)
      d.wrongProteinEveningsPerPetMonth = attribution[i].evenings === 0 ? null : round(attribution[i].wrongEvenings / (attribution[i].evenings / DAYS_PER_MONTH))
      d.culpritAloneEveningsPerPetMonth = attribution[i].evenings === 0 ? null : round(attribution[i].aloneEvenings / (attribution[i].evenings / DAYS_PER_MONTH))
      d.wrongShareOfFoodEvenings = attribution[i].foodEvenings === 0 ? null : round(attribution[i].wrongEvenings / attribution[i].foodEvenings)
    }
  })
  const askPerPetMonth = Object.fromEntries(
    [...REGISTERS, 'any' as const].map((r) => [r, perMonth(acc.ask[r])]),
  ) as ScenarioScore['askPerPetMonth']
  return {
    id: sc.id,
    category: sc.category,
    petRuns: acc.petRuns,
    petEvenings: acc.petEvenings,
    laneShare,
    falseShare,
    falseLaneShare,
    safetyShare,
    askPerPetMonth,
    laneEveningsPerPetMonth: Object.fromEntries([...acc.laneEvenings].map(([l, n]) => [l, perMonth(n)])),
    askDropWithoutFallPerPetMonth: perMonth(acc.askDrops),
    medianDaysToFirstSafety: acc.firstSafety.length * 2 >= acc.petRuns ? median(acc.firstSafety) : null,
    detections,
    redFlags,
    care: care.acknowledged === 0 && reRaiseSigns.length === 0
      ? null
      : {
          acknowledged: care.acknowledged,
          neverAcknowledged: care.neverAcknowledged,
          reRaisedWithin8Weeks: care.acknowledged === 0 ? null : round(care.reRaised / care.acknowledged),
          reRaisedEver: care.acknowledged === 0 ? null : round(care.reRaisedEver / care.acknowledged),
          askPerPetMonthAfterAck: care.postAck === 0 ? null : round(care.askEvenings / (care.postAck / DAYS_PER_MONTH)),
          silentEveningShare: care.postAck === 0 ? null : round(care.silent / care.postAck),
          medianLongestSilentRun: median(care.longest),
        },
  }
}

export function round(x: number): number {
  return Math.round(x * 10_000) / 10_000
}

// ── The whole engine, and the committed file ───────────────────────────────────

export interface Scorecard {
  /** How the numbers were made: the arm, the seeds, the horizons. Never a timestamp (the file must reproduce). */
  meta: { arm: string; seeds: string; horizons: readonly number[]; scenarios: number; scenarioIds: readonly string[]; flagsOn: readonly string[] }
  /** One flat key per number, so a diff is a list of rows and a mutation moves a named row. */
  rows: Record<string, number | null>
}

/** The whole-engine rows over the null scenarios: the worst case per horizon (E-4 restated) and the pooled share. */
function wholeEngineRows(scores: readonly ScenarioScore[], rows: Record<string, number | null>) {
  const nulls = scores.filter((s) => s.category === 'null')
  for (const h of HORIZONS) {
    const withH = nulls.filter((s) => s.falseShare[h] !== undefined && s.falseShare[h] !== null)
    if (withH.length === 0) continue
    rows[`engine/null/falseCard/worst/${h}d`] = Math.max(...withH.map((s) => s.falseShare[h] as number))
    const pets = withH.reduce((a, s) => a + s.petRuns, 0)
    rows[`engine/null/falseCard/pooled/${h}d`] = round(withH.reduce((a, s) => a + (s.falseShare[h] as number) * s.petRuns, 0) / pets)
    rows[`engine/null/safetyCard/worst/${h}d`] = Math.max(...withH.map((s) => s.safetyShare[h]))
    // Per lane, over the null scenarios whose key calls that lane false: EN-11's worsening line is
    // paired with its false-card cost here, so a noisier engine cannot pass it (second adversarial pass).
    for (const lane of ['worsening', 'food', 'timing', 'chronic'] as const) {
      const scored = withH.filter((s) => s.falseLaneShare[h]?.[lane] !== undefined)
      if (scored.length === 0) continue
      rows[`engine/null/falseLane/${lane}/worst/${h}d`] = Math.max(...scored.map((s) => s.falseLaneShare[h][lane] as number))
      const n = scored.reduce((a, s) => a + s.petRuns, 0)
      rows[`engine/null/falseLane/${lane}/pooled/${h}d`] = round(scored.reduce((a, s) => a + (s.falseLaneShare[h][lane] as number) * s.petRuns, 0) / n)
    }
  }
  const evenings = nulls.reduce((a, s) => a + s.petEvenings, 0)
  for (const r of [...REGISTERS, 'any' as const]) {
    rows[`engine/null/askPerPetMonth/${r}`] = round(nulls.reduce((a, s) => a + s.askPerPetMonth[r] * s.petEvenings, 0) / evenings)
  }
  // How MANY evenings the null pets carry a worsening, burden or food card, pooled. A share-of-pets row
  // saturates (the worst null scenario is already at 1.0 under flag off), so an engine that never
  // stands a card down is visible only here (third adversarial pass).
  for (const lane of ['worsening', 'burden', 'food'] as const) {
    rows[`engine/null/laneEveningsPerPetMonth/${lane}`] = round(nulls.reduce((a, s) => a + (s.laneEveningsPerPetMonth[lane] ?? 0) * s.petEvenings, 0) / evenings)
  }
  const flags = scores.flatMap((s) => (s.redFlags ? [s.redFlags] : []))
  rows['engine/redFlag/injected'] = flags.reduce((a, f) => a + f.injected, 0)
  rows['engine/redFlag/belowShippedTier'] = flags.reduce((a, f) => a + f.below, 0)
}

export function buildScorecard(scores: readonly ScenarioScore[], meta: Scorecard['meta']): Scorecard {
  const rows: Record<string, number | null> = {}
  for (const s of scores) {
    const p = s.id
    for (const [h, lanes] of Object.entries(s.laneShare)) {
      for (const [l, v] of Object.entries(lanes)) rows[`${p}/cardShare/${l}/${h}d`] = v ?? null
    }
    for (const [h, v] of Object.entries(s.falseShare)) if (v !== null) rows[`${p}/falseCard/${h}d`] = v
    for (const [h, lanes] of Object.entries(s.falseLaneShare)) for (const [l, v] of Object.entries(lanes)) rows[`${p}/falseLane/${l}/${h}d`] = v ?? null
    for (const [h, v] of Object.entries(s.safetyShare)) rows[`${p}/safetyCard/${h}d`] = v
    for (const [r, v] of Object.entries(s.askPerPetMonth)) rows[`${p}/askPerPetMonth/${r}`] = v
    for (const [l, v] of Object.entries(s.laneEveningsPerPetMonth)) rows[`${p}/laneEveningsPerPetMonth/${l}`] = v ?? null
    rows[`${p}/askDropWithoutFallPerPetMonth`] = s.askDropWithoutFallPerPetMonth
    rows[`${p}/medianDaysToFirstSafety`] = s.medianDaysToFirstSafety
    for (const d of s.detections) {
      rows[`${p}/detect/${d.label}/probability`] = d.eligible === 0 ? null : round(d.detected / d.eligible)
      rows[`${p}/detect/${d.label}/medianDays`] = d.medianDays
      rows[`${p}/detect/${d.label}/showingAtStart`] = d.showingAtStart
      rows[`${p}/detect/${d.label}/eligible`] = d.eligible
      if (d.raisedBeforeStart !== null) rows[`${p}/detect/${d.label}/raisedBeforeStart`] = d.raisedBeforeStart
      if (d.lane === 're_raise') rows[`${p}/detect/${d.label}/ackTooLate`] = d.ackTooLate
      if (d.wrongProtein !== null) rows[`${p}/detect/${d.label}/wrongProtein`] = d.wrongProtein
      if (d.jointWithReacting !== null) rows[`${p}/detect/${d.label}/jointWithReacting`] = d.jointWithReacting
      if (d.wrongProteinEveningsPerPetMonth !== null) rows[`${p}/detect/${d.label}/wrongProteinEveningsPerPetMonth`] = d.wrongProteinEveningsPerPetMonth
      if (d.culpritAloneEveningsPerPetMonth !== null) rows[`${p}/detect/${d.label}/culpritAloneEveningsPerPetMonth`] = d.culpritAloneEveningsPerPetMonth
      if (d.wrongShareOfFoodEvenings !== null) rows[`${p}/detect/${d.label}/wrongShareOfFoodEvenings`] = d.wrongShareOfFoodEvenings
      if (d.censored > 0) rows[`${p}/detect/${d.label}/censored`] = d.censored
      if (d.scoring === 'both_acknowledged' || d.lane === 're_raise') rows[`${p}/detect/${d.label}/neverAcknowledged`] = d.neverAcknowledged
    }
    if (s.redFlags) {
      rows[`${p}/redFlag/injected`] = s.redFlags.injected
      rows[`${p}/redFlag/belowShippedTier`] = s.redFlags.below
    }
    if (s.care) {
      rows[`${p}/care/acknowledged`] = s.care.acknowledged
      rows[`${p}/care/neverAcknowledged`] = s.care.neverAcknowledged
      rows[`${p}/care/reRaisedWithin8Weeks`] = s.care.reRaisedWithin8Weeks
      rows[`${p}/care/reRaisedEver`] = s.care.reRaisedEver
      rows[`${p}/care/askPerPetMonthAfterAck`] = s.care.askPerPetMonthAfterAck
      rows[`${p}/care/silentEveningShare`] = s.care.silentEveningShare
      rows[`${p}/care/medianLongestSilentRun`] = s.care.medianLongestSilentRun
    }
  }
  wholeEngineRows(scores, rows)
  const sorted: Record<string, number | null> = {}
  for (const k of Object.keys(rows).sort()) sorted[k] = rows[k]
  return { meta, rows: sorted }
}

// ── The diff CI prints ─────────────────────────────────────────────────────────

export interface RowChange {
  key: string
  before: number | null | undefined
  after: number | null | undefined
}

export function diffScorecards(before: Scorecard, after: Scorecard): RowChange[] {
  const keys = new Set([...Object.keys(before.rows), ...Object.keys(after.rows)])
  const out: RowChange[] = []
  for (const key of [...keys].sort()) {
    const b = before.rows[key]
    const a = after.rows[key]
    if (b !== a) out.push({ key, before: b, after: a })
  }
  return out
}

const show = (v: number | null | undefined) => (v === undefined ? '(absent)' : v === null ? '—' : String(v))

export function formatDiff(changes: readonly RowChange[], before: Scorecard, after: Scorecard): string {
  const head = [
    '## Engine scorecard (EN-1, reported, never gating)',
    '',
    `Arm: ${after.meta.arm} · seeds: ${after.meta.seeds} · ${after.meta.scenarios} scenarios.`,
  ]
  if (before.meta.seeds !== after.meta.seeds || before.meta.arm !== after.meta.arm) {
    head.push('', `The committed file was made with arm ${before.meta.arm}, seeds ${before.meta.seeds}: rows are not comparable.`)
  }
  if (changes.length === 0) return [...head, '', `No row moved (${Object.keys(after.rows).length} rows).`].join('\n')
  return [
    ...head,
    '',
    `${changes.length} of ${Object.keys(after.rows).length} rows moved. If the change is intended, regenerate the committed file (ADEMP.md §6) and say in the PR which rows moved and why.`,
    '',
    '| row | committed | this branch |',
    '|---|---|---|',
    ...changes.map((c) => `| \`${c.key}\` | ${show(c.before)} | ${show(c.after)} |`),
  ].join('\n')
}
