// analyze-vomit — the PURE context builder (Engines v3 PR-11a, CUL-1267).
//
// What the vomit read knows about the record around the incident, derived from rows and
// a clock, with no I/O. `assembleContext` (index.ts) runs the three reads and hands the
// rows here; the harness and the guard corpus (_shared/engineCorpus/) hand rows here
// directly. Before this file the derivation lived inside the reads, so the only way to
// test a scenario was a fake database.
//
// The shipped windows are measured back from `nowMs`, the moment of analysis (CUL-131).
// That anchoring is the defect EN-0 exists to fix (the 8/19 read two days late, the 6/7
// vomit logged before the morning's meals were back-filled). `buildVomitContext` runs the
// shipped derivation, then the EN-0 step, and the step runs ONLY when `engines_v3_en0` is
// on for the record's owner. PR-13a (CUL-1130) fills the step: each flag becomes the
// UNION of the shipped read-time evaluation and one anchored on the vomit, so the step
// can add a warning and can never remove one (critique BRK-2 / TD-2).
//
// The builder re-applies every window to the rows it is handed, rather than trusting
// the query that fetched them: a predicate about the record takes the record (C-35), and
// a corpus case can then carry rows outside a window to prove they are ignored. The
// re-filter matches the queries' own semantics (Postgres `gte`: inclusive, on parsed
// instants), so on production rows it removes nothing.
//
// Instants are PARSED before any comparison (C-40). The shipped feline-window test
// compared the ISO strings, which drops a meal logged at exactly the window's
// millisecond when PostgREST spells it `+00:00` and the bound `Z`. The parse fixes that
// one boundary; nothing else moves.

import { isEngineKeyOn, type EngineFlags } from '../_shared/engineFlags.ts'
import { FLOOR_LETHARGY_HOURS, FLOOR_READ_HOURS, incidentFloor, type FloorResult } from '../../../lib/incidentFloor.ts'
import type { FreeFedIntakeSpan } from '../../../lib/freeFedIntake.ts'
import {
  isKnownIntakeRating,
  isPositiveIntakeRating,
  isQualifyingIntakeMeal,
  isRefusedOrPickedRating,
  NOTICED_REFUSAL_LOOKBACK,
  NOTICED_REFUSAL_RECENCY_DAYS,
  noticedRefusalAt,
  type IntakeEvidenceMeal,
} from '../../../lib/intakeEvidence.ts'

// ── Context windows (Dr. Chen, 2026-05-24) ─────────────────────────────────────────
// The vomit lookback: every non-deleted vomit in the last 24 h.
export const RECENT_VOMIT_WINDOW_HOURS = 24
// Feline reduced-intake fires at the 24h edge (not the textbook 48h) because
// it only ever fires alongside an active vomit incident — vomiting + anorexia
// compounds risk toward the hepatic-lipidosis window.
export const FELINE_REDUCED_INTAKE_HOURS = 24
export const CONCURRENT_LETHARGY_HOURS = 24
// Intake-tracking baseline window: the feline flag keys off ABSENCE of
// positive intake, which conflates "didn't eat" with "didn't log". Only fire
// it for owners who actually track intake — i.e. who have rated a meal in the
// last week — so we never flag a non-logger. (Data caveat, B-027.)
export const INTAKE_BASELINE_WINDOW_DAYS = 7

export interface ContextInput {
  species: string
  // occurred_at (ISO) of every non-deleted vomit event in the last 24h,
  // INCLUDING the event being analysed. Uses occurred_at (B-010 representative
  // point) — imprecise for windowed events but the agreed sort/representative key.
  recentVomitTimes: string[]
  thisEventOccurredAt: string
  // True if the cat has had a meal rated 'most'/'all' within the feline window.
  hasRecentPositiveIntake: boolean
  // True if the owner actually tracks intake (any rated meal in the baseline
  // window) — guards the feline flag against absence-of-logging false positives.
  tracksIntake: boolean
  // True if a non-deleted lethargy event was logged within the lethargy window.
  hasRecentLethargy: boolean
  // EN-0 only (set by EN0_CONTEXT_STEP, never by the shipped derivation): when the feline
  // intake flag fires, the record its read states. `window` is the evaluation that fired
  // (the vomit-anchored one wins when both did); `mealsLogged` counts every meal in that
  // window, rated or not, so the read can say "6 meals were logged … none was marked Most
  // or All" rather than conclude the cat has not eaten (the 9/4 and 9/22 reads).
  intakeRecord?: IntakeRecord
  // EN-5 only (set by EN5_CONTEXT_STEP): the cat intake arm's answer under "an unrated meal
  // is unknown". When present it decides the flag in place of tracksIntake /
  // hasRecentPositiveIntake, which keep their shipped values for the record.
  en5IntakeFires?: boolean
  // EN-4 only (engines_v3_en4 with engines_v3_en3, set by assembleContext through buildFloor):
  // the floor's answer over the record around this vomit (lib/incidentFloor.ts).
  floor?: FloorResult
}

export interface IntakeRecord {
  // 'before_vomit': the 24 h before the vomit. 'before_read': the 24 h before the read ran
  // (the shipped window, when only it fired, e.g. the cat that ate, vomited, then refused).
  // EN-5 adds 'after_vomit' (from the vomit to the read, at most 24 h) and 'noticed' (the
  // Noticed predicate: two of the last three qualifying meals refused or picked).
  window: 'before_vomit' | 'before_read' | 'after_vomit' | 'noticed' | 'last_rated'
  mealsLogged: number
  // EN-5 only. How many of the meals in the window carried a rating: the sentence speaks
  // about those and says how many more had none, so an unrated meal is never read as
  // "didn't eat". For 'noticed', how many qualifying meals were looked at (at most three).
  mealsRated?: number
  // EN-5 'noticed' only: how many of those were Refused or Picked, and the instant the
  // predicate was read at (the vomit; the read; or 24 h after the vomit, when the read was later).
  refusedOrPicked?: number
  at?: 'vomit' | 'read' | 'after_vomit_24h'
  // EN-5 'after_vomit' only: true when the read ran more than 24 h after the vomit, so the half
  // stopped at 24 h.
  cappedAt24h?: boolean
  // EN-5 'last_rated' only: how many hours before the vomit the newest rated meal was, and its
  // rating.
  hoursBefore?: number
  rating?: 'refused' | 'picked'
}

// The rows, in the shapes the three reads return them.
// `food_item_id` and `food_items` are selected only under engines_v3_en5 (the Noticed
// predicate needs the treat and free-fed filters); the shipped read selects the rating alone.
export type FoodTypeJoin = { food_type: string | null } | { food_type: string | null }[] | null
export interface MealIntakeRow {
  intake_rating: string | null
  food_item_id?: string | null
  food_items?: FoodTypeJoin
}
export type MealIntakeJoin = MealIntakeRow | MealIntakeRow[] | null
export interface VomitContextRows {
  vomits: { occurred_at: string }[]
  lethargy: { occurred_at: string }[]
  meals: { occurred_at: string; meals: MealIntakeJoin }[]
  // EN-5 only: the pet's free-fed bowl spans, active and ended. Absent reads as no bowls,
  // which keeps a free-fed rating counted: the louder reading of an unknown.
  freeFedSpans?: FreeFedIntakeSpan[]
}

export interface BuildVomitContextArgs {
  rows: VomitContextRows
  thisEventOccurredAt: string
  species: string
  nowMs: number
  engineFlags: EngineFlags
}

// The ISO lower bound of each window, for the reads. One derivation for the query and
// the re-filter, so the two can never disagree about where a window starts.
export function vomitContextWindows(nowMs: number): {
  vomitsSinceIso: string
  lethargySinceIso: string
  intakeBaselineSinceIso: string
  felineIntakeSinceIso: string
} {
  const hoursAgo = (h: number) => new Date(nowMs - h * 3_600_000).toISOString()
  return {
    vomitsSinceIso: hoursAgo(RECENT_VOMIT_WINDOW_HOURS),
    lethargySinceIso: hoursAgo(CONCURRENT_LETHARGY_HOURS),
    intakeBaselineSinceIso: hoursAgo(INTAKE_BASELINE_WINDOW_DAYS * 24),
    felineIntakeSinceIso: hoursAgo(FELINE_REDUCED_INTAKE_HOURS),
  }
}

// The vomit-anchored windows (EN-0), as instants. Every one is bounded by the vomit, never
// by the read time: running a window to "now" would judge an old vomit by lethargy or
// refusals logged days later (BRK-2). Repeated vomiting looks both ways, as the shipped
// count does (|t − vomit|), to a fixed 24 h after; intake and its tracking baseline look
// back from the vomit only, so eating AFTER the vomit never cancels this half. Lethargy has
// no anchored half: it keeps its shipped window (TD-2).
export function vomitAnchoredWindows(vomitMs: number): {
  vomitsFromMs: number
  vomitsToMs: number
  felineIntakeFromMs: number
  intakeBaselineFromMs: number
} {
  return {
    vomitsFromMs: vomitMs - RECENT_VOMIT_WINDOW_HOURS * 3_600_000,
    vomitsToMs: vomitMs + RECENT_VOMIT_WINDOW_HOURS * 3_600_000,
    felineIntakeFromMs: vomitMs - FELINE_REDUCED_INTAKE_HOURS * 3_600_000,
    intakeBaselineFromMs: vomitMs - INTAKE_BASELINE_WINDOW_DAYS * 24 * 3_600_000,
  }
}

// The extra reads EN-0 needs, or null when it needs none (flag-off, or an instant that
// cannot anchor). The shipped reads stay exactly as they were; these fetch only the part
// of each anchored window the shipped read does not already cover: [from, to], and
// strictly before the shipped lower bound (`beforeIso`). So no row is read twice (a vomit
// read twice would count twice), and every read is bounded on both sides by the vomit.
// An earlier draft widened the shipped lower bound instead, which left an old vomit's
// read unbounded above and exposed it to PostgREST's max-rows cap, dropping the NEWEST
// rows (C-42, the adversarial pass on this PR).
export interface AnchoredRange {
  fromIso: string
  toIso: string
  beforeIso: string
}
export function vomitAnchoredReads(
  nowMs: number,
  thisEventOccurredAt: string,
  engineFlags: EngineFlags,
): { vomits: AnchoredRange | null; meals: AnchoredRange | null } | null {
  const vomitMs = Date.parse(thisEventOccurredAt)
  // EN-5 reads the same anchored rows: its before-vomit half and its Noticed check at the
  // vomit need the days before an old vomit that the read-time window no longer reaches.
  const wanted = isEngineKeyOn(engineFlags, 'engines_v3_en0') || isEngineKeyOn(engineFlags, 'engines_v3_en5')
  if (!wanted || !Number.isFinite(vomitMs)) return null
  const shipped = vomitContextWindows(nowMs)
  const a = vomitAnchoredWindows(vomitMs)
  const range = (fromMs: number, toMs: number, beforeIso: string): AnchoredRange | null =>
    fromMs < Date.parse(beforeIso) && fromMs <= toMs
      ? { fromIso: new Date(fromMs).toISOString(), toIso: new Date(toMs).toISOString(), beforeIso }
      : null
  return {
    vomits: range(a.vomitsFromMs, a.vomitsToMs, shipped.vomitsSinceIso),
    // EN-5's after-vomit half reads to 24 h after the vomit; for a read more than a week later
    // the shipped window no longer reaches it (the adversarial pass, J). Still bounded both sides.
    meals: range(
      a.intakeBaselineFromMs,
      isEngineKeyOn(engineFlags, 'engines_v3_en5') ? vomitMs + AFTER_VOMIT_INTAKE_HOURS * 3_600_000 : vomitMs,
      shipped.intakeBaselineSinceIso,
    ),
  }
}

// Inclusive, on parsed instants; an unparseable time is outside every window.
function atOrAfter(iso: string, boundIso: string): boolean {
  const t = Date.parse(iso)
  return Number.isFinite(t) && t >= Date.parse(boundIso)
}

// Inclusive at both ends, on parsed instants. A meal at the vomit's own instant counts as
// "before this vomit": the owner logged them together, and the read cannot order them.
function inRange(iso: string, fromMs: number, toMs: number): boolean {
  const t = Date.parse(iso)
  return Number.isFinite(t) && t >= fromMs && t <= toMs
}

const isPositive = (rating: string | null) => rating === 'most' || rating === 'all'

function ratingOf(m: { meals: MealIntakeJoin }): string | null {
  const meal = Array.isArray(m.meals) ? m.meals[0] : m.meals
  return meal?.intake_rating ?? null
}

// The context as it shipped: every window back from `nowMs`.
export function shippedVomitContext(args: Omit<BuildVomitContextArgs, 'engineFlags'>): ContextInput {
  const w = vomitContextWindows(args.nowMs)

  const recentVomitTimes = args.rows.vomits
    .map((r) => r.occurred_at)
    .filter((t) => atOrAfter(t, w.vomitsSinceIso))
  // Ensure this event is represented even if the read raced its own write.
  const thisMs = Date.parse(args.thisEventOccurredAt)
  if (!recentVomitTimes.some((t) => Date.parse(t) === thisMs)) recentVomitTimes.push(args.thisEventOccurredAt)

  const hasRecentLethargy = args.rows.lethargy.some((r) => atOrAfter(r.occurred_at, w.lethargySinceIso))

  const baselineMeals = args.rows.meals.filter((m) => atOrAfter(m.occurred_at, w.intakeBaselineSinceIso))
  const tracksIntake = baselineMeals.some((m) => ratingOf(m) !== null)
  const hasRecentPositiveIntake = baselineMeals.some(
    (m) => atOrAfter(m.occurred_at, w.felineIntakeSinceIso) && (ratingOf(m) === 'most' || ratingOf(m) === 'all'),
  )

  return {
    species: args.species,
    recentVomitTimes,
    thisEventOccurredAt: args.thisEventOccurredAt,
    hasRecentPositiveIntake,
    tracksIntake,
    hasRecentLethargy,
  }
}

// EN-0's step (CUL-1130): handed the shipped context and the same rows, returns the
// context EN-0 reads. It lives here, in the one namespace the flag-off guard stubs, so
// "flag-off" can be asserted against the step's absence (C-36) rather than against a
// snapshot. PR-11a shipped it as the identity; rows stamped ['engines_v3_en0'] +
// 'f1.vomit1' were written by that identity, and the descriptor's 'vomit2' tells them
// apart from this step's.
//
// THE UNION, by construction rather than by comparison. The returned context fires each
// flag computeContextualFlags would fire on the shipped context OR on the vomit-anchored
// one, and nothing else:
//   - repeated vomiting: the vomit list is every row in the shipped window OR the anchored
//     one. A shipped row that counts (within 24 h of this vomit) is inside the anchored
//     window too, so the union's counts are the anchored counts, and those are never
//     below the shipped ones.
//   - feline intake: fires when either evaluation does. The anchored half asks "were meals
//     logged in the 24 h before this vomit, none of them Most or All, for an owner who
//     rated a meal in the week before it" (an empty window adds nothing: ruling (a)); the
//     shipped half still reads the 24 h before the read, which is what keeps the cat that
//     ate, vomited, then refused, read late (Dr. Chen's hold).
//   - lethargy: the shipped value, untouched.
// Property-tested over every read time after the vomit (engineCorpus/en0Union.test.ts).
export type VomitContextStep = (shipped: ContextInput, args: BuildVomitContextArgs) => ContextInput
export const EN0_CONTEXT_STEP: VomitContextStep = (shipped, args) => {
  const vomitMs = Date.parse(args.thisEventOccurredAt)
  // An instant that cannot be read cannot anchor anything; the shipped context stands.
  if (!Number.isFinite(vomitMs)) return shipped
  const a = vomitAnchoredWindows(vomitMs)
  const w = vomitContextWindows(args.nowMs)

  const recentVomitTimes = args.rows.vomits
    .map((r) => r.occurred_at)
    .filter((t) => atOrAfter(t, w.vomitsSinceIso) || inRange(t, a.vomitsFromMs, a.vomitsToMs))
  if (!recentVomitTimes.some((t) => Date.parse(t) === vomitMs)) recentVomitTimes.push(args.thisEventOccurredAt)

  const next: ContextInput = { ...shipped, recentVomitTimes }
  if (args.species !== 'cat') return next

  const shippedFires = shipped.tracksIntake && !shipped.hasRecentPositiveIntake
  const anchoredTracks = args.rows.meals.some(
    (m) => inRange(m.occurred_at, a.intakeBaselineFromMs, vomitMs) && ratingOf(m) !== null,
  )
  const beforeVomit = args.rows.meals.filter((m) => inRange(m.occurred_at, a.felineIntakeFromMs, vomitMs))
  // PM ruling (a), 2026-09-29, CUL-1130: the anchored half never escalates on an empty
  // window. With no meal logged in the 24 h before the vomit, "no Most or All meal" is a
  // gap in the log, not a record of the cat eating poorly, and escalating on it is the
  // Pattern 6 hazard the tracking guard only half covers (it checks the week). The shipped
  // half still fires exactly as it did, so nothing is lost.
  const anchoredFires =
    anchoredTracks && beforeVomit.length > 0 && !beforeVomit.some((m) => isPositive(ratingOf(m)))

  if (anchoredFires) {
    return {
      ...next,
      tracksIntake: true,
      hasRecentPositiveIntake: false,
      intakeRecord: { window: 'before_vomit', mealsLogged: beforeVomit.length },
    }
  }
  if (shippedFires) {
    const beforeRead = args.rows.meals.filter((m) => atOrAfter(m.occurred_at, w.felineIntakeSinceIso))
    return { ...next, intakeRecord: { window: 'before_read', mealsLogged: beforeRead.length } }
  }
  return next
}

// ── EN-5's step (Engines v3 PR-30, CUL-1722): an unrated meal is unknown ───────────────
// PM ruling, 2026-10-09 (threshold A): the cat intake arm fires on a half of the record that
// holds at least one RATED meal and none rated Most or All. Unrated meals count neither way:
// they never fire the arm (the 8/19, 9/4 and 9/22 reads, where every meal was logged and
// none was rated) and never cancel it. The weekly "tracks intake" guard goes with them: a
// half fires only on its own rated meals, so a non-rater can never be flagged.
//
// FOUR HALVES AND ONE BACKSTOP, each independent, the arm firing when any one does:
//   · before_vomit: the 24 h before the vomit (EN-0's anchored half, rated meals only);
//   · after_vomit:  from the vomit to the read, at most 24 h. Eating BEFORE a vomit never
//                   cancels refusals AFTER it (critique BRK-2), so this half never sees the
//                   meals before the vomit; and it stops at 24 h so a late re-read never
//                   judges an old vomit by refusals logged days later;
//   · before_read:  the 24 h before the read (the shipped window, rated meals only), kept so
//                   the arm is never quieter than today except where every meal in that
//                   window was unrated: the one change EN-5 exists to make;
//   · noticed:      the Noticed predicate (`lib/intakeEvidence.ts`, the daily look's arm 3:
//                   two of the last three qualifying meals refused or picked, three-day
//                   recency) at the vomit and at the read capped at 24 h after it. I1, ruled
//                   A 2026-10-02: in union, never in place of the arm;
//   · last_rated:   ⚠ provisional (the adversarial pass, A): the newest rated meal in the
//                   three days before the vomit was Refused or Picked. See the step.
// Treats and free-fed bowls stay in the three rating halves exactly as they are today (a
// rated treat speaks, a treat marked All cancels); only the Noticed check drops them, as it
// always has. Dropping the pill-pocket false alarm from the halves is a quieter row and
// stays the PM's (GAP-28 / MFU-7), not this step's.
//
// Cats only, like the shipped arm. Dogs (T8/T10b) need the "no food seen" answer, PR-30q.
export const AFTER_VOMIT_INTAKE_HOURS = 24

function evidenceOf(m: { occurred_at: string; meals: MealIntakeJoin }): IntakeEvidenceMeal {
  const meal = Array.isArray(m.meals) ? m.meals[0] : m.meals
  const food = Array.isArray(meal?.food_items) ? meal?.food_items[0] : meal?.food_items
  return {
    ms: Date.parse(m.occurred_at),
    foodItemId: meal?.food_item_id ?? null,
    foodType: food?.food_type ?? null,
    intakeRating: meal?.intake_rating ?? null,
  }
}

interface RatedHalf {
  logged: number
  rated: number
  fires: boolean
}
function ratedHalf(meals: readonly IntakeEvidenceMeal[], fromMs: number, toMs: number, includeFrom: boolean): RatedHalf {
  const inWindow = meals.filter(
    (m) => Number.isFinite(m.ms) && (includeFrom ? m.ms >= fromMs : m.ms > fromMs) && m.ms <= toMs,
  )
  const rated = inWindow.filter((m) => isKnownIntakeRating(m.intakeRating))
  return {
    logged: inWindow.length,
    rated: rated.length,
    fires: rated.length > 0 && !rated.some((m) => isPositiveIntakeRating(m.intakeRating)),
  }
}

export const EN5_CONTEXT_STEP: VomitContextStep = (prior, args) => {
  if (args.species !== 'cat') return prior
  const vomitMs = Date.parse(args.thisEventOccurredAt)
  const readMs = args.nowMs
  // An instant that cannot be read anchors nothing: the arm is silent rather than guessing.
  if (!Number.isFinite(vomitMs) || !Number.isFinite(readMs)) return { ...prior, en5IntakeFires: false, intakeRecord: undefined }

  // Each half bounds its own rows. No global "nothing after the read" filter: a vomit stamped a
  // minute ahead of the server's clock must still see the refusal logged just before it (the
  // adversarial pass, L); the halves that run to the read stop at the read themselves.
  const meals = args.rows.meals.map(evidenceOf)
  const spans = args.rows.freeFedSpans ?? []
  const day = FELINE_REDUCED_INTAKE_HOURS * 3_600_000
  const afterEnd = Math.min(readMs, vomitMs + AFTER_VOMIT_INTAKE_HOURS * 3_600_000)

  const before = ratedHalf(meals, vomitMs - day, vomitMs, true)
  const after = afterEnd > vomitMs ? ratedHalf(meals, vomitMs, afterEnd, false) : { logged: 0, rated: 0, fires: false }
  const atRead = ratedHalf(meals, readMs - day, readMs, true)

  const fired = (intakeRecord: IntakeRecord): ContextInput => ({ ...prior, en5IntakeFires: true, intakeRecord })
  if (before.fires) return fired({ window: 'before_vomit', mealsLogged: before.logged, mealsRated: before.rated })
  if (after.fires) {
    // The half stops 24 h after the vomit; when the read ran later, the words say so, or "after
    // this vomit" would claim meals the half never looked at (the adversarial pass, B).
    return fired({ window: 'after_vomit', mealsLogged: after.logged, mealsRated: after.rated, cappedAt24h: afterEnd < readMs })
  }
  if (atRead.fires) return fired({ window: 'before_read', mealsLogged: atRead.logged, mealsRated: atRead.rated })

  // The Noticed predicate, at the vomit and at the after-half's end. The record says WHICH
  // instant fired, so the words are anchored to it and not to the read (the adversarial pass, C).
  const instants: [number, NonNullable<IntakeRecord['at']>][] = [
    [vomitMs, 'vomit'],
    [afterEnd, afterEnd < readMs ? 'after_vomit_24h' : 'read'],
  ]
  for (const [atMs, at] of instants) {
    if (!noticedRefusalAt(meals, spans, atMs)) continue
    const fromMs = atMs - NOTICED_REFUSAL_RECENCY_DAYS * 86_400_000
    const lastFew = meals
      .filter((m) => m.ms >= fromMs && m.ms <= atMs && isQualifyingIntakeMeal(m, spans))
      .sort((a, b) => b.ms - a.ms)
      .slice(0, NOTICED_REFUSAL_LOOKBACK)
    return fired({
      window: 'noticed',
      at,
      mealsLogged: lastFew.length,
      mealsRated: lastFew.length,
      refusedOrPicked: lastFew.filter((m) => isRefusedOrPickedRating(m.intakeRating)).length,
    })
  }

  // ⚠ PROVISIONAL, louder default pending the PM (the adversarial pass, A): the newest rated meal
  // before the vomit, within the Noticed recency bound, was Refused or Picked, and nothing rated
  // since. An absent meal is as unknown as an unrated one, and an unknown never cancels a recorded
  // refusal; without this arm, a refusal 25 h before a vomit with nothing logged since went
  // quieter than today. Today's other empty-window firing (the newest rating Some, Most or All,
  // e.g. the 6/7 vomit logged before its meals were back-filled) stays quiet. Brief on CUL-1136.
  const lastRated = meals
    .filter((m) => Number.isFinite(m.ms) && m.ms <= vomitMs && m.ms >= vomitMs - NOTICED_REFUSAL_RECENCY_DAYS * 86_400_000)
    .filter((m) => isKnownIntakeRating(m.intakeRating))
    .sort((a, b) => b.ms - a.ms)[0]
  if (lastRated && isRefusedOrPickedRating(lastRated.intakeRating)) {
    return fired({
      window: 'last_rated',
      mealsLogged: 1,
      mealsRated: 1,
      hoursBefore: Math.round((vomitMs - lastRated.ms) / 3_600_000),
      rating: lastRated.intakeRating === 'refused' ? 'refused' : 'picked',
    })
  }
  return { ...prior, en5IntakeFires: false, intakeRecord: undefined }
}

// The gate. `step` and `en5Step` are parameters so the guards can hand in steps that change
// something and prove each gate decides whether its step runs (a deleted gate reds either
// way); production always takes EN0_CONTEXT_STEP and EN5_CONTEXT_STEP. EN-5 runs after EN-0
// and decides the intake arm on its own rule, so with both keys on, EN-0's unrated-meal
// intake firing is replaced and its vomit union is kept.
export function buildVomitContext(
  args: BuildVomitContextArgs,
  step: VomitContextStep = EN0_CONTEXT_STEP,
  en5Step: VomitContextStep = EN5_CONTEXT_STEP,
): ContextInput {
  const shipped = shippedVomitContext(args)
  const en0 = isEngineKeyOn(args.engineFlags, 'engines_v3_en0') ? step(shipped, args) : shipped
  return isEngineKeyOn(args.engineFlags, 'engines_v3_en5') ? en5Step(en0, args) : en0
}

// ── EN-4's floor (Engines v3 PR-28, CUL-1134) ───────────────────────────────────────────
// Runs only when both engines_v3_en4 and engines_v3_en3 are on for the owner: the floor's
// answer is a tier, and with no tier written it would be a louder verdict with no tier beside
// it. Flag-off, no read below is made and `floor` stays absent.
export function floorIsOn(engineFlags: EngineFlags): boolean {
  return isEngineKeyOn(engineFlags, 'engines_v3_en4') && isEngineKeyOn(engineFlags, 'engines_v3_en3')
}

// The floor's reads, as instants around the vomit. Both are bounded by the vomit on both sides
// (never by the read time), so an old vomit's re-floor reads the same rows whenever it runs.
export function floorReadWindows(vomitMs: number): { vomitsFromIso: string; vomitsToIso: string; lethargyFromIso: string; lethargyToIso: string } {
  const at = (h: number) => new Date(vomitMs + h * 3_600_000).toISOString()
  return {
    vomitsFromIso: at(-FLOOR_READ_HOURS),
    vomitsToIso: at(FLOOR_READ_HOURS),
    lethargyFromIso: at(-FLOOR_LETHARGY_HOURS),
    lethargyToIso: at(FLOOR_LETHARGY_HOURS),
  }
}

export interface FloorRows {
  vomits: { id: string; occurred_at: string; occurred_at_confidence: string | null }[]
  lethargy: { occurred_at: string }[]
  birthDate: string | null
}

// The floor over the rows the reads returned. The anchor's confidence is its own row's; a read
// that raced this vomit's write (no row with its id) counts it as unclassified, which T1 and T2
// treat as an onset: the louder reading of an unknown.
export function buildFloor(rows: FloorRows, thisEventId: string, thisEventOccurredAt: string, species: string): FloorResult {
  const own = rows.vomits.find((r) => r.id === thisEventId)
  const anchor = { at: own?.occurred_at ?? thisEventOccurredAt, confidence: own?.occurred_at_confidence ?? null }
  return incidentFloor({
    anchor,
    vomits: rows.vomits.map((r) => ({ at: r.occurred_at, confidence: r.occurred_at_confidence })),
    lethargyAt: rows.lethargy.map((r) => r.occurred_at),
    species,
    birthDate: rows.birthDate,
  })
}
