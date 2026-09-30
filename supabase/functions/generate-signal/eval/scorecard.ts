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

interface KeyRef {
  petKey: string
  lane: Lane
  sign?: Sign
  protein?: string
}

function matchesKey(k: KeyRef, card: ScoredCard): boolean {
  if (card.petKey !== k.petKey) return false
  if (k.sign !== undefined && card.sign !== k.sign) return false
  if (k.protein !== undefined && !card.proteins.includes(k.protein)) return false
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

export interface DetectionScore {
  label: string
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
  /** Eligible pet-runs where a matching card was already showing the evening before the start. */
  showingAtStart: number
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
    safety: new Map<number, number>(),
    ask: { call: 0, book_visit: 0, word_with_vet: 0, mention_to_vet: 0, any: 0 } as Record<Exclude<AskRegister, 'none'> | 'any', number>,
    askDrops: 0,
    laneEvenings: new Map<ScoreLane, number>(),
    firstSafety: [] as number[],
  }
  const detections: DetectionScore[] = sc.key.detect.map((d) => ({
    label: `${d.petKey}:${d.lane}${d.sign ? `:${d.sign}` : ''}${d.protein ? `:${d.protein}` : ''}`,
    scoring: d.scoring,
    eligible: 0,
    detected: 0,
    medianDays: null,
    neverAcknowledged: 0,
    censored: 0,
    showingAtStart: 0,
  }))
  const detectDays: number[][] = sc.key.detect.map(() => [])
  let redFlags: ScenarioScore['redFlags'] = null
  const reRaiseSigns = sc.key.falseCards.filter((f) => f.lane === 're_raise')
  const care = { neverAcknowledged: 0, acknowledged: 0, reRaised: 0, silent: 0, postAck: 0, longest: [] as number[] }

  for (const run of runs) {
    const evenings = cardsOf(run.result)
    const truth = run.result.truth
    for (const petKey of petKeys) {
      acc.petRuns++
      const seenLane = new Map<number, Set<ScoreLane>>(horizons.map((h) => [h, new Set()]))
      const seenFalse = new Set<number>()
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
        if (seenSafety.has(h)) acc.safety.set(h, (acc.safety.get(h) ?? 0) + 1)
      }
      if (firstSafety !== null) acc.firstSafety.push(firstSafety)

      // Detection, per answer-key entry. A hit is an ONSET: the first evening on or after the
      // start where a matching card shows and did not show the evening before. A card already
      // standing when the effect began (a chance worsening card from day 86 on a rise that starts
      // on day 90; a chronicity card that never left) is not the engine seeing the effect, and
      // is counted in `showingAtStart` so the reader can see how often it happened.
      sc.key.detect.forEach((d, i) => {
        if (d.petKey !== petKey) return
        const ackDay = d.sign ? truth.acks.find((a) => a.petKey === petKey && a.sign === d.sign)?.day : truth.acks.find((a) => a.petKey === petKey)?.day
        const from = startDay(d.from, ackDay)
        if (from === undefined) {
          detections[i].neverAcknowledged++
          return
        }
        // Censored: too few evenings left after the start to see anything (an arm that
        // acknowledges late must not collect misses it could never have avoided).
        if (from + DETECT_MIN_WINDOW_DAYS > sc.days) {
          detections[i].censored++
          return
        }
        detections[i].eligible++
        const matching = (ev: (typeof evenings)[number] | undefined) => ev !== undefined && ev.cards.some((c) => matchesKey(d, c))
        const byDay = new Map(evenings.map((ev) => [ev.day, ev]))
        if (matching(byDay.get(from - 1))) detections[i].showingAtStart++
        const hit = evenings.find((ev) => {
          if (ev.day < from || !matching(ev) || matching(byDay.get(ev.day - 1))) return false
          // A re-raise must follow a quiet evening AFTER the acknowledgement: the ask went away
          // and came back, never the standing ask it was acknowledged under.
          return d.lane !== 're_raise' || (ackDay !== undefined && ev.day - 1 > ackDay)
        })
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
        if (after.some((ev) => ev.day <= ack.day + RE_RAISE_WINDOW_DAYS && onSign(ev).some((c) => c.ask !== 'none'))) care.reRaised++
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
  const safetyShare: ScenarioScore['safetyShare'] = {}
  for (const h of horizons) {
    laneShare[h] = {}
    for (const l of SCORE_LANES) {
      const n = acc.lane.get(`${h}|${l}`) ?? 0
      if (n > 0) laneShare[h][l] = share(n)
    }
    falseShare[h] = sc.key.falseCards.some((f) => f.lane !== 're_raise') ? share(acc.falseAny.get(h) ?? 0) : null
    safetyShare[h] = share(acc.safety.get(h) ?? 0)
  }
  detections.forEach((d, i) => { d.medianDays = median(detectDays[i]) })
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
  meta: { arm: string; seeds: string; horizons: readonly number[]; scenarios: number }
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
  }
  const evenings = nulls.reduce((a, s) => a + s.petEvenings, 0)
  for (const r of [...REGISTERS, 'any' as const]) {
    rows[`engine/null/askPerPetMonth/${r}`] = round(nulls.reduce((a, s) => a + s.askPerPetMonth[r] * s.petEvenings, 0) / evenings)
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
    for (const [h, v] of Object.entries(s.safetyShare)) rows[`${p}/safetyCard/${h}d`] = v
    for (const [r, v] of Object.entries(s.askPerPetMonth)) rows[`${p}/askPerPetMonth/${r}`] = v
    for (const [l, v] of Object.entries(s.laneEveningsPerPetMonth)) rows[`${p}/laneEveningsPerPetMonth/${l}`] = v ?? null
    rows[`${p}/askDropWithoutFallPerPetMonth`] = s.askDropWithoutFallPerPetMonth
    rows[`${p}/medianDaysToFirstSafety`] = s.medianDaysToFirstSafety
    for (const d of s.detections) {
      rows[`${p}/detect/${d.label}/probability`] = d.eligible === 0 ? null : round(d.detected / d.eligible)
      rows[`${p}/detect/${d.label}/medianDays`] = d.medianDays
      rows[`${p}/detect/${d.label}/showingAtStart`] = d.showingAtStart
      if (d.censored > 0) rows[`${p}/detect/${d.label}/censored`] = d.censored
      if (d.scoring === 'both_acknowledged') rows[`${p}/detect/${d.label}/neverAcknowledged`] = d.neverAcknowledged
    }
    if (s.redFlags) {
      rows[`${p}/redFlag/injected`] = s.redFlags.injected
      rows[`${p}/redFlag/belowShippedTier`] = s.redFlags.below
    }
    if (s.care) {
      rows[`${p}/care/acknowledged`] = s.care.acknowledged
      rows[`${p}/care/neverAcknowledged`] = s.care.neverAcknowledged
      rows[`${p}/care/reRaisedWithin8Weeks`] = s.care.reRaisedWithin8Weeks
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
