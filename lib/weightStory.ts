// The weight lane's one predicate (EN-8, Engines v3 PR-19, CUL-1413).
// Spec: docs/nyx-weight-lane-requirements.md §5. Values: docs/clinical-ruling-sheet-2026-10.md
// §2.3, every row ruled A on 2026-10-02 (§2.0a). Still provisional for GA: PMD-9 is re-run on this
// exact definition, by weighing cadence, before the lane goes live (the sheet's W1 verdict).
//
// Pure and import-free on purpose: it is in the Edge Functions' import closure (generate-signal
// imports it), so it must carry no client dependency, and every weight surface is meant to call it
// (WG-1) rather than compute its own anchor. Kilograms in, kilograms out; owner surfaces convert.
//
// What it decides, in one place:
//   • the SENTENCE every surface says: the latest reading and the highest reading before it in
//     the window, each with its date, source and whether it is a confirmed level (§5.2);
//   • the STATE, which alone decides whether the Signal raises a row (§5.1). A raised row and the
//     noise caveat are one decision, so they can never both hold (WG-6, §5.4).
//
// It never reassures (WG-7): a steady or rising weight is `level_or_up`, a description, never a
// verdict, and silence below the lines is never wellness.

export type WeightSource = 'clinic' | 'home_scale' | 'estimate'
export type WeightSourceBasis = 'entry' | 'owner' | 'legacy'

/** One `weight_checks` row as the lane reads it. Soft-deleted rows are the caller's to exclude. */
export interface WeightReading {
  kg: number
  /** ISO-8601 instant. */
  occurredAt: string
  source: WeightSource
  sourceBasis?: WeightSourceBasis
}

/**
 * A vet-set planned-loss state (ruling sheet W6; who may set it is CUL-1390 W6, PR-37's client
 * work). Nothing writes one yet, so every caller passes none today.
 */
export interface WeightPlan {
  /** ISO instant the plan was set. Readings before it never anchor again (spec §5.6, attack 12). */
  startedAt: string
  /** The recheck date the plan names. Absent ⇒ the plan lapses 12 weeks after `startedAt`. */
  recheckAt?: string | null
  /** A later visit's plan that ends it. */
  endedAt?: string | null
  /** The plan's target loss as a share of the start level (0.1 = 10%). Absent ⇒ 10%. */
  targetLossFrac?: number | null
}

export interface WeightStoryInput {
  readings: readonly WeightReading[]
  nowMs: number
  /** `pets.date_of_birth` ('YYYY-MM-DD' or ISO). Null or unreadable reads YOUNG (W5 as ruled). */
  dateOfBirth: string | null
  plans?: readonly WeightPlan[]
  /**
   * ISO instants of the owner's stand-downs of an earlier weight finding (EN-9, PR-20/PR-23).
   * A stand-down ends that finding: readings at or before the latest one never anchor again
   * (spec §5.5, attack 11). None exist yet.
   */
  standDowns?: readonly string[]
}

// ── The ruled values (ruling sheet §2.3; real-vet list items 2–6, 17, 18) ────────────────────

export const WEIGHT_RULES = {
  /** W4: the soft and firm lines, as a share of the confirmed high. */
  softLossFrac: 0.05,
  firmLossFrac: 0.1,
  /** W4: the window, record-anchored (Freeman 2016's pre-diagnosis year). */
  windowDays: 365,
  /** W4: the noise band is the SMALLER of these two: ≤ 5% and ≤ 0.5 lb. */
  noiseFrac: 0.05,
  noiseKg: 0.5 / 2.20462,
  /** W2: a difference this large confirms both ends (3 × a 0.2 kg scale). */
  noiseScaledConfirmKg: 0.6,
  /** W1's louder fix: a confirmed level this far below a single earlier reading raises the soft row. */
  singleHighSoftFrac: 0.1,
  /** W5: under this age a pet is a juvenile. */
  juvenileMonths: 12,
  /** W6: the planned-loss firm rate, and the gap the rate is measured over. */
  plannedRatePerWeek: 0.02,
  plannedRateMinDays: 7,
  /** W6: a plan with no recheck date lapses after this, and its cumulative line when it names no target. */
  planLapseDays: 84,
  plannedDefaultTargetFrac: 0.1,
  /**
   * DISPLAY only (no row depends on it): a home reading is "one reading" in the sentence unless a
   * neighbouring home reading sits within this share of the band of it. Half the band, so a lone
   * spike between two ordinary readings still reads as one reading (spec §5.3's stable-cat case).
   */
  agreeBandShare: 0.5,
  /** A reading this far past `nowMs` still counts: the weigh-in's own regen must see it (clock skew). */
  futureSlackMs: 10 * 60_000,
} as const

/**
 * The exact-copy rule (spec §4.3, attack 7): two consecutive readings equal to the gram never
 * pair, because the log pre-fills the last value and a pre-fill saved unchanged would confirm
 * whatever it copied. ⚠ QUIETER than the ruling sheet, so it needs the PM's sign-off before GA
 * (E-6; brief on CUL-1413). Its cost, measured by PR-19's adversarial pass: ANY identical repeat
 * blocks pairing (pounds typed to 0.1 lb store identical kilograms; so does a gram scale), so a
 * repeated lower plateau never confirms (9.9 lb ×4 then 8.8 lb ×4, 11%, is silent while it
 * repeats); the sheet's W1 lone-high case is silent; a 1%-a-week loss weighed monthly is caught
 * about 4–9 weeks later. PR-37 removes the pre-fill, after which the rule protects no new row; a
 * narrower form (only rows with `sourceBasis: 'legacy'`) is the option in the brief.
 */
export const EXACT_COPY_NEVER_PAIRS = true

const MS_PER_DAY = 86_400_000

// ── Output ───────────────────────────────────────────────────────────────────

/** A reading as the sentence and the row name it: value, date, source, and whether it is a confirmed level. */
export interface WeightPoint {
  kg: number
  occurredAt: string
  source: Exclude<WeightSource, 'estimate'>
  /** False when this end rests on one reading (the sentence says "one reading"). */
  confirmed: boolean
}

export type WeightState =
  | 'none' // no counted reading in the window
  | 'one_reading' // exactly one
  | 'level_or_up' // the latest is at or above the highest before it, or down by less than a raised row needs
  | 'within_noise' // down inside the band, and one end is a single reading: the caveat's ONLY state
  | 'down_unsupported' // down past the band, but no confirmed level supports a row (descriptive only)
  | 'drop_unconfirmed' // a confirmed level, then one reading below it past the line (CUL-1390 W5's plain row)
  | 'drop_confirmed' // a raised soft row
  | 'drop_firm' // a raised firm row

/** Which rule raised the row. Every one of them names its two ends. */
export type WeightRowBasis =
  | 'confirmed_levels' // PMD-9: both ends are confirmed levels (W1)
  | 'noise_scaled' // a difference ≥ 0.6 kg confirmed both ends (W2)
  | 'single_high' // a confirmed level ≥ 10% below a single earlier reading (W1's fix); soft only
  | 'planned_rate' // during a plan: faster than 2% a week between confirmed levels (W6)

export interface WeightRow {
  /**
   * What the row SAYS (spec §5.2 over the readings the decision may use, WG-5): the latest reading
   * and the highest reading before it after any stand-down or finished plan. Never a reading the
   * decision has stopped anchoring on.
   */
  says: { latest: WeightPoint; highBefore: WeightPoint }
  tier: 'soft' | 'firm'
  basis: WeightRowBasis
  /** The higher end the row compares with. `confirmed: false` only under `single_high`. */
  high: WeightPoint
  /** The lower end: always a confirmed level. */
  low: WeightPoint
  /** One end clinic and the other home scale: the band was added to the line (spec §5.3). */
  mixedInstruments: boolean
  /** A plan was running: the soft line was off (W6). */
  planned: boolean
  /** Juvenile lines applied (under 12 months, or no readable birthday). */
  juvenile: boolean
}

export interface WeightStory {
  state: WeightState
  /** The latest counted reading in the window. Null under `none`. */
  latest: WeightPoint | null
  /** The highest counted reading before the latest, in the window. Null under `none` / `one_reading`. */
  highBefore: WeightPoint | null
  /** Set exactly when `state` is `drop_confirmed` or `drop_firm`. */
  row: WeightRow | null
  /** Readings the owner marked as estimates: listed, never counted (spec §4.2, attack 6). */
  notCounted: WeightReading[]
}

// ── Internals ────────────────────────────────────────────────────────────────

interface Indexed {
  r: WeightReading & { source: 'clinic' | 'home_scale' }
  ms: number
}

/** A confirmed level: a value the record supports, the reading that carries it, and where it ends. */
interface Level {
  kg: number
  reading: Indexed
  /** The index of the latest reading the level rests on ("before" compares these). */
  end: number
}

function isFiniteKg(kg: unknown): kg is number {
  return typeof kg === 'number' && Number.isFinite(kg) && kg > 0
}

/** Exact copy to the gram: the pre-fill rule (spec §4.3, attack 7). Such a pair confirms nothing. */
function isExactCopy(a: WeightReading, b: WeightReading): boolean {
  return EXACT_COPY_NEVER_PAIRS && Math.round(a.kg * 1000) === Math.round(b.kg * 1000)
}

/** The band around a value: the smaller of 5% of it and 0.5 lb. */
export function noiseBandKg(kg: number): number {
  return Math.min(WEIGHT_RULES.noiseFrac * kg, WEIGHT_RULES.noiseKg)
}

/**
 * Juvenile by birthday. Unknown or unreadable reads YOUNG (W5 as ruled, matching T7's "unknown
 * age reads young"): reading adult was the quieter choice for a large-breed puppy.
 */
export function isJuvenile(dateOfBirth: string | null, nowMs: number): boolean {
  if (!dateOfBirth) return true
  const born = Date.parse(dateOfBirth)
  if (!Number.isFinite(born) || born > nowMs) return true
  const d = new Date(born)
  const cutoff = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + WEIGHT_RULES.juvenileMonths, d.getUTCDate())
  return nowMs < cutoff
}

function point(x: Indexed, confirmed: boolean): WeightPoint {
  return { kg: x.r.kg, occurredAt: x.r.occurredAt, source: x.r.source, confirmed }
}

/** The plan running at `nowMs`, if any: started, not ended, not past its recheck (or 12 weeks). */
function runningPlan(plans: readonly WeightPlan[], nowMs: number): { plan: WeightPlan; startMs: number } | null {
  let best: { plan: WeightPlan; startMs: number } | null = null
  for (const plan of plans) {
    const startMs = Date.parse(plan.startedAt)
    if (!Number.isFinite(startMs) || startMs > nowMs) continue
    if (planEndMs(plan, startMs) <= nowMs) continue
    if (best === null || startMs > best.startMs) best = { plan, startMs }
  }
  return best
}

/**
 * The anchor floor: readings at or before it never anchor a decision.
 *   • A running plan: readings before the plan's start never anchor (attack 12).
 *   • A finished plan (ended, or lapsed at its recheck / 12 weeks): the loss is measured from
 *     the plan's END level (ruling sheet W6, counterexample 1): the confirmed level the record
 *     stood at when it ended anchors, nothing earlier, and never anything before the plan's start.
 *   • A stand-down: the same, at the stand-down. Its own level anchors the next finding, so a
 *     relapse after "she's gained it back" is measured from the weight she regained (adversarial
 *     pass on PR-19: the spec's "its readings stop anchoring", read literally, left it silent),
 *     while the drop the owner stood down never re-raises itself.
 */
function anchorFloorMs(input: WeightStoryInput, counted: readonly Indexed[]): number {
  const { nowMs } = input
  // Just before the confirmed level the record stood at, at `t`: the latest low level among the
  // readings at or before `t`, kept with its pair partner so it can stand as a high level after.
  // Everything earlier stops anchoring. With no level (one reading, or copies), nothing before `t`.
  const keepLevelAt = (t: number): number => {
    const before = counted.filter((x) => x.ms <= t)
    const { lows } = levels(before)
    const level = lows.reduce<Level | null>((acc, l) => (acc === null || l.end >= acc.end ? l : acc), null)
    if (level === null) return t
    const standsAlone = level.reading === before[level.end] && level.reading.r.source === 'clinic'
    return before[standsAlone ? level.end : level.end - 1].ms - 1
  }
  let floor = -Infinity
  for (const sd of input.standDowns ?? []) {
    const ms = Date.parse(sd)
    if (Number.isFinite(ms) && ms <= nowMs) floor = Math.max(floor, keepLevelAt(ms))
  }
  for (const p of input.plans ?? []) {
    const startMs = Date.parse(p.startedAt)
    if (!Number.isFinite(startMs) || startMs > nowMs) continue
    const end = planEndMs(p, startMs)
    if (end > nowMs) {
      floor = Math.max(floor, startMs - 1)
    } else {
      floor = Math.max(floor, startMs - 1, keepLevelAt(end))
    }
  }
  return floor
}

/** When a plan stops quieting the lines: its end, else its recheck date, else 12 weeks on. */
function planEndMs(plan: WeightPlan, startMs: number): number {
  const endMs = plan.endedAt ? Date.parse(plan.endedAt) : NaN
  const recheckMs = plan.recheckAt ? Date.parse(plan.recheckAt) : NaN
  const lapseMs = Number.isFinite(recheckMs) ? recheckMs : startMs + WEIGHT_RULES.planLapseDays * MS_PER_DAY
  return Number.isFinite(endMs) ? Math.min(endMs, lapseMs) : lapseMs
}

/**
 * The confirmed levels over a decision set (spec §5.3):
 *   • a clinic reading is a confirmed level on its own, high and low;
 *   • two consecutive home readings confirm the lower as a high level and the higher as a low
 *     level, unless they are an exact copy (§4.3);
 *   • a home reading right after a clinic reading confirms the higher of the two as a low
 *     level (the conservative reading of "the higher of the latest two").
 */
function levels(set: readonly Indexed[]): { highs: Level[]; lows: Level[] } {
  const highs: Level[] = []
  const lows: Level[] = []
  for (let k = 0; k < set.length; k++) {
    const x = set[k]
    if (x.r.source === 'clinic') {
      highs.push({ kg: x.r.kg, reading: x, end: k })
      lows.push({ kg: x.r.kg, reading: x, end: k })
    }
    if (k === 0) continue
    const a = set[k - 1]
    if (isExactCopy(a.r, x.r)) continue
    const lo = a.r.kg <= x.r.kg ? a : x
    const hi = a.r.kg <= x.r.kg ? x : a
    if (a.r.source === 'home_scale' && x.r.source === 'home_scale') {
      highs.push({ kg: lo.r.kg, reading: lo, end: k })
      lows.push({ kg: hi.r.kg, reading: hi, end: k })
    } else if (x.r.source === 'home_scale') {
      // A home reading after a clinic one: the higher of the two. (A clinic reading LAST is
      // its own confirmed low, pushed above, so it is never displaced by its neighbour.)
      lows.push({ kg: hi.r.kg, reading: hi, end: k })
    }
  }
  return { highs, lows }
}

/** The lines that apply, as a required difference in kg against a high of `highKg`. */
function lines(
  highKg: number,
  mixed: boolean,
  juvenile: boolean,
  plan: WeightPlan | null,
): Lines {
  const margin = mixed ? noiseBandKg(highKg) : 0
  if (plan !== null) {
    // W6: while a plan runs the soft line is off and the firm line is the CUMULATIVE line, the
    // plan's target (else 10%) from its start level. A target above 10% is honoured: a cat losing
    // what she was asked to lose is not "further than the plan allows".
    const target = plan.targetLossFrac != null && plan.targetLossFrac > 0 ? plan.targetLossFrac : WEIGHT_RULES.plannedDefaultTargetFrac
    return { softKg: null, softStrict: false, firmKg: target * highKg + margin }
  }
  const firmKg = WEIGHT_RULES.firmLossFrac * highKg + margin
  // A juvenile's soft row needs only a drop that CLEARS the band (strictly beyond it, W5); the
  // adult line is "at or past" 5%. Firm is 10% for both (W5's first §2.9 fix).
  if (juvenile) return { softKg: noiseBandKg(highKg) + margin, softStrict: true, firmKg }
  return { softKg: WEIGHT_RULES.softLossFrac * highKg + margin, softStrict: false, firmKg }
}

interface Lines {
  softKg: number | null
  softStrict: boolean
  firmKg: number
}

// Float slack for "at or past a line": 4.40 − 3.73 is 0.66999… in binary.
const EPS = 1e-9

function clearsSoft(diffKg: number, l: Lines): boolean {
  if (l.softKg === null) return false
  return l.softStrict ? diffKg > l.softKg + EPS : diffKg + EPS >= l.softKg
}

function tierFor(diffKg: number, l: Lines): 'soft' | 'firm' | null {
  if (diffKg + EPS >= l.firmKg) return 'firm'
  if (clearsSoft(diffKg, l)) return 'soft'
  return null
}

function louder(a: WeightRow | null, b: WeightRow | null): WeightRow | null {
  if (a === null) return b
  if (b === null) return a
  if (a.tier !== b.tier) return a.tier === 'firm' ? a : b
  // Same tier: prefer the row whose ends are both confirmed, then the larger drop.
  if (a.high.confirmed !== b.high.confirmed) return a.high.confirmed ? a : b
  return a.high.kg - a.low.kg >= b.high.kg - b.low.kg ? a : b
}

// ── The predicate ────────────────────────────────────────────────────────────

export function weightStory(input: WeightStoryInput): WeightStory {
  const { nowMs } = input
  const windowStart = nowMs - WEIGHT_RULES.windowDays * MS_PER_DAY

  const inWindow = input.readings
    .map((r) => ({ r, ms: Date.parse(r.occurredAt) }))
    .filter(({ r, ms }) => isFiniteKg(r.kg) && Number.isFinite(ms) && ms > windowStart && ms <= nowMs + WEIGHT_RULES.futureSlackMs)
    // Canonical order, so the answer never depends on the order the read chose: time, then value.
    .sort((a, b) => a.ms - b.ms || a.r.kg - b.r.kg || a.r.source.localeCompare(b.r.source))

  const notCounted = inWindow.filter(({ r }) => r.source === 'estimate').map(({ r }) => r)
  const counted: Indexed[] = inWindow
    .filter(({ r }) => r.source === 'clinic' || r.source === 'home_scale')
    .map(({ r, ms }) => ({ r: r as Indexed['r'], ms }))

  if (counted.length === 0) return { state: 'none', latest: null, highBefore: null, row: null, notCounted }

  // The sentence's "one reading" flag, on EITHER end (§5.2): a clinic reading stands alone; a
  // home reading is supported when a neighbouring home reading agrees with it (within half the
  // band, not an exact copy). The DECISION never reads this flag; it reads confirmed levels.
  const supported = (x: Indexed, within: readonly Indexed[]): boolean => {
    if (x.r.source === 'clinic') return true
    const k = within.indexOf(x)
    const agrees = (y: Indexed | undefined) =>
      y !== undefined &&
      y.r.source === 'home_scale' &&
      !isExactCopy(x.r, y.r) &&
      Math.abs(x.r.kg - y.r.kg) <= WEIGHT_RULES.agreeBandShare * noiseBandKg(Math.max(x.r.kg, y.r.kg)) + EPS
    return agrees(within[k - 1]) || agrees(within[k + 1])
  }
  const confirmedHigh = (x: Indexed) => supported(x, counted)
  const confirmedLow = (x: Indexed) => supported(x, counted)

  const last = counted[counted.length - 1]
  if (counted.length === 1) {
    return { state: 'one_reading', latest: point(last, confirmedLow(last)), highBefore: null, row: null, notCounted }
  }

  // The sentence: the latest, and the HIGHEST reading before it (never the earliest, attack 10b;
  // never the latest itself, attack 2). The earlier reading wins a tie of values.
  let hb = counted[0]
  for (let k = 1; k < counted.length - 1; k++) if (counted[k].r.kg > hb.r.kg) hb = counted[k]
  const latest = point(last, confirmedLow(last))
  const highBefore = point(hb, confirmedHigh(hb))

  // ── The decision, over readings after the anchor floor ─────────────────────
  const floor = anchorFloorMs(input, counted)
  const set = counted.filter((x) => x.ms > floor)
  const juvenile = isJuvenile(input.dateOfBirth, nowMs)
  const plan = runningPlan(input.plans ?? [], nowMs)
  const planned = plan !== null
  const planPlan = plan?.plan ?? null

  let row: WeightRow | null = null
  if (set.length >= 2) {
    const { highs, lows } = levels(set)
    // The confirmed low: the most recent low level (spec §5.3).
    const low = lows.reduce<Level | null>((acc, l) => (acc === null || l.end >= acc.end ? l : acc), null)

    if (low !== null) {
      const lowPt = point(low.reading, true)
      const mixedWith = (src: WeightSource) => src !== low.reading.r.source
      const make = (high: WeightPoint, basis: WeightRowBasis, tier: 'soft' | 'firm', mixed: boolean): WeightRow => ({
        says: { latest, highBefore },
        tier,
        basis,
        high,
        low: lowPt,
        mixedInstruments: mixed,
        planned,
        juvenile,
      })

      // (a) PMD-9: the highest confirmed high level before the confirmed low.
      const before = highs.filter((h) => h.end < low.end)
      for (const h of before) {
        const mixed = mixedWith(h.reading.r.source)
        const t = tierFor(h.kg - low.kg, lines(h.kg, mixed, juvenile, planPlan))
        if (t) row = louder(row, make(point(h.reading, true), 'confirmed_levels', t, mixed))
      }

      // (c) W1's louder fix: a confirmed level ≥ 10% below a single earlier home reading raises
      // the SOFT row, and says the high was one reading. Not while a plan runs (its soft line is off).
      if (!planned) {
        for (let k = 0; k < set.length; k++) {
          const x = set[k]
          if (x.r.source !== 'home_scale' || k >= low.end || x === low.reading) continue
          if (x.r.kg <= low.kg) continue
          const mixed = mixedWith(x.r.source)
          const need = WEIGHT_RULES.singleHighSoftFrac * x.r.kg + (mixed ? noiseBandKg(x.r.kg) : 0)
          if (x.r.kg - low.kg + EPS >= need) {
            const confirmed = highs.some((h) => h.reading === x)
            row = louder(row, make(point(x, confirmed), 'single_high', 'soft', mixed))
          }
        }
      }
    }

    // (b) W2: a difference ≥ 0.6 kg between the highest reading before the latest and the latest
    // confirms both ends; the lines still apply.
    const sLast = set[set.length - 1]
    let sHigh = set[0]
    for (let k = 1; k < set.length - 1; k++) if (set[k].r.kg > sHigh.r.kg) sHigh = set[k]
    if (sHigh !== sLast && sHigh.r.kg - sLast.r.kg + EPS >= WEIGHT_RULES.noiseScaledConfirmKg) {
      const mixed = sHigh.r.source !== sLast.r.source
      const t = tierFor(sHigh.r.kg - sLast.r.kg, lines(sHigh.r.kg, mixed, juvenile, planPlan))
      if (t) {
        row = louder(row, {
          says: { latest, highBefore },
          tier: t,
          basis: 'noise_scaled',
          high: point(sHigh, true),
          low: point(sLast, true),
          mixedInstruments: mixed,
          planned,
          juvenile,
        })
      }
    }

    // (d) W6: during a plan, losing faster than 2% a week between confirmed levels ≥ 7 days apart.
    // The cumulative line is (a) and (b) above, through `lines`: the plan's start level is the
    // highest confirmed level after the floor, and the firm line is its target (else 10%).
    if (planned && low !== null) {
      for (const h of highs.filter((h) => h.end < low.end)) {
        const days = (low.reading.ms - h.reading.ms) / MS_PER_DAY
        if (days < WEIGHT_RULES.plannedRateMinDays || h.kg <= low.kg) continue
        const ratePerWeek = (h.kg - low.kg) / h.kg / (days / 7)
        if (ratePerWeek > WEIGHT_RULES.plannedRatePerWeek + EPS) {
          row = louder(row, {
            says: { latest, highBefore },
            tier: 'firm',
            basis: 'planned_rate',
            high: point(h.reading, true),
            low: point(low.reading, true),
            mixedInstruments: h.reading.r.source !== low.reading.r.source,
            planned,
            juvenile,
          })
        }
      }
    }
  }

  if (row !== null) {
    // The row names the readings the decision may use: the latest, and the highest after the floor.
    let shb = set[0]
    for (let k = 1; k < set.length - 1; k++) if (set[k].r.kg > shb.r.kg) shb = set[k]
    row = { ...row, says: { latest, highBefore: point(shb, supported(shb, set)) } }
    return { state: row.tier === 'firm' ? 'drop_firm' : 'drop_confirmed', latest, highBefore, row, notCounted }
  }

  // ── No row: the descriptive states ─────────────────────────────────────────
  const diff = highBefore.kg - latest.kg
  if (diff <= EPS) return { state: 'level_or_up', latest, highBefore, row: null, notCounted }

  // A confirmed level, then one reading below it past the line (CUL-1390 W5's plain row).
  if (set.length >= 2 && set[set.length - 1] === last) {
    const { highs, lows } = levels(set)
    const lastK = set.length - 1
    if (!lows.some((l) => l.reading === last)) {
      for (const h of highs.filter((h) => h.end < lastK)) {
        const l = lines(h.kg, h.reading.r.source !== last.r.source, juvenile, planPlan)
        if (clearsSoft(h.kg - last.r.kg, l)) {
          return { state: 'drop_unconfirmed', latest, highBefore, row: null, notCounted }
        }
      }
    }
  }

  // The caveat: inside the band, AND one end is a single reading, AND not clinic-to-clinic (§5.4).
  const inBand = diff <= noiseBandKg(highBefore.kg) + EPS
  const clinicToClinic = latest.source === 'clinic' && highBefore.source === 'clinic'
  // A change the last two readings agree on never carries it, whatever its size (attack 5): both
  // sit below the high, so the caveat cannot sit over a slow, steady loss.
  const prev = counted[counted.length - 2]
  const lastTwoAgree = prev !== hb && prev.r.kg < hb.r.kg - EPS
  if (inBand && !clinicToClinic && !lastTwoAgree && (!latest.confirmed || !highBefore.confirmed)) {
    return { state: 'within_noise', latest, highBefore, row: null, notCounted }
  }
  // Outside the band with no row: a drop that rests on a single reading at either end says so
  // (`down_unsupported`); one both ends confirm sits under the line and is described as numbers.
  if (inBand || (latest.confirmed && highBefore.confirmed)) {
    return { state: 'level_or_up', latest, highBefore, row: null, notCounted }
  }
  return { state: 'down_unsupported', latest, highBefore, row: null, notCounted }
}
