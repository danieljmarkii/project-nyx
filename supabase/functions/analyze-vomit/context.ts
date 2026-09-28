// analyze-vomit — the PURE context builder (Engines v3 PR-11a, CUL-1267).
//
// What the vomit read knows about the record around the incident, derived from rows and
// a clock, with no I/O. `assembleContext` (index.ts) runs the three reads and hands the
// rows here; the harness and the guard corpus (_shared/engineCorpus/) hand rows here
// directly. Before this file the derivation lived inside the reads, so the only way to
// test a scenario was a fake database.
//
// Every window is measured back from `nowMs`, the moment of analysis, exactly as it
// shipped (CUL-131). That anchoring is the defect EN-0 exists to fix (the 8/19 read two
// days late, the 6/7 vomit logged before the morning's meals were back-filled); this
// file does not fix it. It gives EN-0 one seam to fix it in: `buildVomitContext` runs
// the shipped derivation, then the EN-0 step, and the step runs ONLY when
// `engines_v3_en0` is on for the record's owner. PR-11a ships the step as the identity,
// so with the key on or off the context is today's. PR-13a fills it (the union of the
// shipped and a vomit-anchored evaluation, so no warning is lost).
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
}

// The rows, in the shapes the three reads return them.
export type MealIntakeJoin = { intake_rating: string | null } | { intake_rating: string | null }[] | null
export interface VomitContextRows {
  vomits: { occurred_at: string }[]
  lethargy: { occurred_at: string }[]
  meals: { occurred_at: string; meals: MealIntakeJoin }[]
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

// Inclusive, on parsed instants; an unparseable time is outside every window.
function atOrAfter(iso: string, boundIso: string): boolean {
  const t = Date.parse(iso)
  return Number.isFinite(t) && t >= Date.parse(boundIso)
}

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
// context EN-0 reads. PR-11a ships the identity; PR-13a replaces it. It lives here, in
// the one namespace the flag-off guard stubs, so "flag-off" can be asserted against
// the step's absence (C-36) rather than against a snapshot.
export type VomitContextStep = (shipped: ContextInput, args: BuildVomitContextArgs) => ContextInput
export const EN0_CONTEXT_STEP: VomitContextStep = (shipped) => shipped

// The gate. `step` is a parameter so the guard can hand in a step that changes
// something and prove the gate decides whether it runs (a deleted gate reds either
// way); production always takes EN0_CONTEXT_STEP.
export function buildVomitContext(args: BuildVomitContextArgs, step: VomitContextStep = EN0_CONTEXT_STEP): ContextInput {
  const shipped = shippedVomitContext(args)
  return isEngineKeyOn(args.engineFlags, 'engines_v3_en0') ? step(shipped, args) : shipped
}
