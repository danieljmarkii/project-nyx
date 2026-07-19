// Ask — the deterministic tool layer (B-228, PR A3; requirements §5.2, §6).
//
// This is the "tools" half of the Ask architecture (§5.1): the LLM PLANS over a
// CLOSED set of these functions, the tools COMPUTE the answer, the LLM only PHRASES
// an already-true result, and `validateAnswer` (A4) gates the sentence. Like
// generate-signal/detection.ts, this is a PURE module: every function takes
// already-fetched, plain-shaped rows + parameters and returns a typed result. It
// performs no I/O, no DB access, and NO LLM call. The `ask` Edge Function (A4) is the
// I/O shell that fetches rows (RLS-scoped, ownership-gated) and hands them here.
//
// ── Why a closed, typed tool layer (not text-to-SQL) ────────────────────────────
// The model never authors a query — it selects and parameterizes these functions.
// That closes the injection / hallucinated-column / RLS-bypass surface (§5.1). The
// return TYPES do the load-bearing safety work here, not the prompt:
//
//   • SCOPED RETRIEVAL (§6.1, the D2 boundary). Aggregate tools return ONLY numbers
//     (counts, rates, denominators, ranked labels) — their return types carry no
//     `note` and no cached-read field, so a free-text note can NEVER leak out through
//     an aggregate. Notes and cached photo-reads ride ONLY the event-scoped recall
//     tools (recallEvent / recentEvents / lastSymptom), which return the events the
//     QUESTION picked and nothing else. There is deliberately NO bulk tool: no
//     "all notes", no full-record serializer — whole-record jobs belong to the export
//     track (B-041/B-089), and recentEvents is hard-capped at MAX_RECALL (§6.1).
//
//   • deleted_at IS NULL ON EVERY EVENT READ (§5.2, the B-071 lesson). Every input
//     event row carries `deletedAt`; every tool filters through `liveEvents()` FIRST.
//     The pure layer never trusts the caller to have pre-filtered — the more-deleted-
//     than-live fixture (tools.test.ts) pins this.
//
//   • FLOORS & DENOMINATORS (§5.2). Every aggregate returns its denominator (logged
//     days, rated-meals N); below a minimum-sample floor it returns the typed
//     `NotEnoughData` sentinel — a first-class honest answer ("not enough logged to
//     read that"), never a fabricated rate off 1–2 samples. Raw COUNTS are always
//     honest and are NOT floored (a count of 1 vomit is a true fact).
//
//   • G5 — ONE SOURCE OF TRUTH (§5.2, the Data-Scientist red line). Ask's numbers
//     MUST equal the Timeline/Patterns/Signal/report numbers, or we have built self-
//     contradiction about a health fact. The counting/rate/ranking cores here are a
//     faithful PORT of the client aggregate layer (lib/analytics.ts) + lib/weight.ts
//     — same UTC-day calendar windows (the B-084 lesson), same intake qualifying-meal
//     rules (§11 #1 treats-out, §11 #6 free-fed-out), same ranking floors, same
//     protein canonicalizer (imported, not re-implemented). analytics.ts cannot be
//     imported directly (it pulls in expo-sqlite via ./db); so we PORT and pin the
//     agreement with parity tests (§13 AC-1). KEEP THE TWO IN LOCKSTEP: a change to a
//     counting rule in analytics.ts must be mirrored here, exactly as the DECLINE
//     constants are kept in lockstep between analytics.ts and detection.ts.
//
//   • NEVER REASSURE / INTAKE ≠ PREFERENCE (§7.1). This layer emits FACTS, never
//     verdicts. A 0-count is `count: 0` with its denominator — the phrasing layer
//     turns that into "nothing logged", never "she's well" (absence ≠ wellness). No
//     field here is named or shaped as "picky"/"preference"; a declining intake is a
//     rate + denominator, routed to the safety register by A4. Weight carries only
//     numbers + a neutral direction, never a wellness word (the migration-024 note).
//
//   • NO WRITE TOOLS. Every function is read-only. The one product-wide exception —
//     a live photo read persisting through the analyze-vomit machinery — is A8, and
//     lives in the Edge Function, never here.
//
// The one shared dependency is the protein canonicalizer, imported from the Signal's
// re-export so Ask, the dashboard, and the correlation engine key proteins identically
// (esbuild inlines it into the deploy bundle, keeping the artifact self-contained).

import { canonicalizeProtein } from '../generate-signal/protein.ts'

// ── Shared constants ────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000

/**
 * Adverse/health symptom event types Ask counts. MIRRORS lib/analytics.ts
 * SYMPTOM_EVENT_TYPES (the client aggregate layer named for G5 parity) — vomit,
 * diarrhea, itch, scratch, skin_reaction, lethargy — so an Ask count and the Patterns
 * grid / History filter can never disagree about which types are "symptoms".
 * (`stool_normal` is NOT adverse and is excluded.)
 */
export const ASK_SYMPTOM_TYPES = [
  'vomit',
  'diarrhea',
  'itch',
  'scratch',
  'skin_reaction',
  'lethargy',
] as const
export type AskSymptomType = (typeof ASK_SYMPTOM_TYPES)[number]

export type Species = 'dog' | 'cat' | 'other'

/** B-010 timestamp confidence (G6). `witnessed` = a real instant; `estimated`/`window`
 *  = a discovered event whose stored `occurred_at` is the LATEST edge of a range, never
 *  an observation; null/absent = legacy/unknown. A recall answer must render anything
 *  that is not `witnessed` as a window/estimate, never a false-precise point. */
export type OccurredAtConfidence = 'witnessed' | 'estimated' | 'window'

/** WSAVA 5-point intake scale → ordinal score (0 refused .. 4 all). Ported byte-for-byte
 *  from lib/analytics.ts / detection.ts — the shared ordinal every intake surface uses. */
const INTAKE_SCORE: Record<string, number> = {
  refused: 0,
  picked: 1,
  some: 2,
  most: 3,
  all: 4,
}
/** "Finished" a meal = rated `most` or `all` (score ≥ FINISHED_SCORE). Shared definition. */
const FINISHED_SCORE = 3

/**
 * Minimum-sample floors — a faithful mirror of lib/analytics.ts ANALYTICS_FLOORS, which
 * in turn reuses the Signal's intake-baseline bar (detection.ts). ONE floor across the
 * product: "top protein off 3 meals is noise". Below a floor a tool returns
 * `NotEnoughData`, never a rank/rate. Keep in lockstep with analytics.ts.
 */
export const ASK_FLOORS = {
  /** Min rated, non-treat, non-free-fed meals before a finished-rate is honest. */
  minRatedMealsForIntakeRate: 4,
  /** Min identifiable samples (foods / proteins) before a ranking is non-noise. */
  minMealsForRanking: 4,
} as const

/**
 * Hard cap on how many events a scoped recall list may return (§6.1). This is the
 * structural guarantee that "no bulk tool exists": recentEvents can surface a bounded,
 * question-scoped slice, never the whole record. A request for more than this is
 * clamped — the record-wholesale job is the export track (B-041/B-089), and §7.4's
 * bulk-ask deflection points there.
 */
export const MAX_RECALL = 25

// ── The NotEnoughData sentinel (§5.2 floors; mirrors lib/analytics.ts) ────────────

/**
 * A typed "below the minimum-sample floor" result, returned in place of a rate/rank so
 * a thin dataset can never masquerade as a real finding. `samples` = qualifying samples
 * found; `needed` = the floor that wasn't met. The phrasing layer renders it as a
 * first-class honest answer ("only N logged — not enough to read that yet"), never a
 * guess and never an all-clear (absence ≠ wellness).
 */
export interface NotEnoughData {
  status: 'not_enough_data'
  samples: number
  needed: number
}

export function notEnoughData(samples: number, needed: number): NotEnoughData {
  return { status: 'not_enough_data', samples, needed }
}

export function isNotEnoughData(x: unknown): x is NotEnoughData {
  return (
    typeof x === 'object' &&
    x !== null &&
    !Array.isArray(x) &&
    (x as { status?: unknown }).status === 'not_enough_data'
  )
}

// ── The bounded window enum (§3.4; the rev-1 G-window rule, kept) ─────────────────
//
// Windows are parsed onto this CLOSED enum — never an arbitrary range that could mask
// acute worsening. Default unstated = 7d, and every answer STATES the window it used
// (the ResolvedWindow.label rides into the result of every windowed tool).

export type AskWindow = '7d' | '14d' | '30d' | 'all' | 'since_trial_start'
export const DEFAULT_WINDOW: AskWindow = '7d'
export const ASK_WINDOWS: readonly AskWindow[] = ['7d', '14d', '30d', 'all', 'since_trial_start']

const FIXED_WINDOW_DAYS: Record<'7d' | '14d' | '30d', number> = { '7d': 7, '14d': 14, '30d': 30 }

/**
 * A resolved window: a half-open [startMs, endMs) span, plus the equal-length PRIOR span
 * (for trend deltas) when one is meaningful, plus the owner-facing label the answer
 * states. Day-aligned on both edges (the B-084 lesson — a raw ms span straddles one
 * extra calendar day at a non-midnight `now`), matching lib/analytics.ts calendarWindow
 * so an Ask count over '7d' equals the Patterns "week" count for the same `now`.
 */
export interface ResolvedWindow {
  window: AskWindow
  /** Number of calendar days the current span covers; null for 'all' (unbounded past). */
  windowDays: number | null
  /** Inclusive UTC-day-aligned start; null for 'all' (no lower bound). */
  startMs: number | null
  /** Exclusive end = start of tomorrow (UTC-day-aligned), so today is fully included. */
  endMs: number
  /** Inclusive start of the immediately-preceding equal-length span; null when N/A. */
  priorStartMs: number | null
  /** Exclusive end of the prior span (== startMs); null when N/A. */
  priorEndMs: number | null
  /** Owner-facing phrase the answer states, e.g. "the last 7 days" / "all time". */
  label: string
}

/**
 * Resolve an `AskWindow` against `nowMs`, day-aligned (B-084). `since_trial_start` needs
 * the trial's start ms (from a diet_trials row); when it is absent/unparseable we fall
 * back to the default 7d window rather than inventing an unbounded span — the caller can
 * detect the fallback via the returned `window` field. 'all' has no lower bound and no
 * prior span.
 */
export function resolveWindow(
  window: AskWindow,
  nowMs: number,
  trialStartMs?: number | null,
): ResolvedWindow {
  // Defense-in-depth (adversarial review, A3): coerce FIRST so an off-enum string a model
  // could emit ('90d', '6m') can never reach the FIXED_WINDOW_DAYS lookup and yield a NaN
  // span — which `inSpan` would read as an UNBOUNDED all-time window (masking acute
  // worsening — the exact §3.4 hazard). The bounded-enum guarantee is owned HERE, inside the
  // pure layer, exactly as `deleted_at` is owned by `liveEvents`, not delegated to the A4
  // caller. `window` is typed AskWindow, but the type is not a runtime guard.
  window = coerceWindow(window as string)
  const todayIndex = Math.floor(nowMs / MS_PER_DAY)
  const endMs = (todayIndex + 1) * MS_PER_DAY

  if (window === 'all') {
    return {
      window,
      windowDays: null,
      startMs: null,
      endMs,
      priorStartMs: null,
      priorEndMs: null,
      label: 'all time',
    }
  }

  if (window === 'since_trial_start') {
    if (trialStartMs == null || !Number.isFinite(trialStartMs)) {
      // No trial in hand → honestly fall back to the default window (the caller sees
      // window==='7d' and can phrase "the last 7 days" instead of a false trial span).
      return resolveWindow(DEFAULT_WINDOW, nowMs)
    }
    const startIndex = Math.floor(trialStartMs / MS_PER_DAY)
    const startMs = startIndex * MS_PER_DAY
    return {
      window,
      windowDays: Math.max(1, todayIndex - startIndex + 1),
      startMs,
      endMs,
      // A "since the trial started" span has no natural equal-length prior period.
      priorStartMs: null,
      priorEndMs: null,
      label: 'since the diet trial started',
    }
  }

  const days = FIXED_WINDOW_DAYS[window]
  const startMs = (todayIndex - (days - 1)) * MS_PER_DAY
  return {
    window,
    windowDays: days,
    startMs,
    endMs,
    priorStartMs: (todayIndex - (2 * days - 1)) * MS_PER_DAY,
    priorEndMs: startMs,
    label: `the last ${days} days`,
  }
}

/** Parse a caller-supplied window string onto the enum; anything unrecognised (incl.
 *  undefined) resolves to the default 7d — never an arbitrary range (§3.4). */
export function coerceWindow(raw: string | null | undefined): AskWindow {
  return (ASK_WINDOWS as readonly string[]).includes(raw ?? '') ? (raw as AskWindow) : DEFAULT_WINDOW
}

// ── Input row shapes (what the Edge Function fetches; what the tools consume) ─────
//
// Plain, DB-projection shapes — the pure cores never see a Supabase client. Every
// event-bearing row carries `deletedAt` so the tools enforce the soft-delete contract
// themselves (§5.2 / B-071) rather than trusting the caller.

/** A symptom / generic event reduced to what the count / recall cores need. */
export interface AskEventRow {
  id: string
  /** event_type string. */
  type: string
  /** ISO-8601 UTC. For a windowed/estimated event this is the LATEST edge (B-010). */
  occurredAt: string
  /** B-010 confidence (G6). Absent/null = legacy/unknown (rendered as a plain point). */
  occurredAtConfidence?: OccurredAtConfidence | null
  /** B-010 window edges, when confidence is 'window' — rendered as a range, never a point. */
  occurredAtEarliest?: string | null
  occurredAtLatest?: string | null
  /** events.notes free text (D2). Scoped-retrieval only — read by recall tools, NEVER
   *  by an aggregate (whose return type has no note field). */
  note?: string | null
  /** True iff this event has ≥1 photo attachment (the caller supplies the join result).
   *  Presence only — the bytes never enter this layer (§6.2 mode 1). */
  hasPhoto?: boolean
  /** Soft-delete tombstone; null = live. The tools filter on this FIRST (§5.2). */
  deletedAt: string | null
}

/** A meal/treat event reduced to what the food/protein/intake cores need. Mirrors
 *  lib/analytics.ts AnalyticsMeal + the scoped-retrieval note (D2) + the soft-delete
 *  tombstone. */
export interface AskMealRow {
  id: string
  occurredAt: string
  occurredAtConfidence?: OccurredAtConfidence | null
  foodItemId: string | null
  /** Display label "Brand Product", or null when the food isn't in the local cache. */
  foodLabel: string | null
  /** food_items.food_type: 'meal' | 'treat' | 'other' | null (unclassified/legacy). */
  foodType: string | null
  /** Raw primary_protein — canonicalized INSIDE the protein core, never before. */
  primaryProtein: string | null
  /** WSAVA rating string, or null when unrated. */
  intakeRating: string | null
  /** meals.notes free text (D2) — scoped-retrieval only. */
  note?: string | null
  hasPhoto?: boolean
  deletedAt: string | null
}

/** A weight_check reading reduced for the trend core (mirrors lib/weight.ts WeightReading
 *  + the soft-delete tombstone, since deletedness lives on the parent event). */
export interface AskWeightRow {
  weightKg: number
  occurredAt: string
  deletedAt: string | null
}

/** A medication regimen (a `medications` row) reduced for the current-meds tool. */
export interface AskRegimenRow {
  id: string
  drugLabel: string
  /** The linked library drug (medication_items.id), or null for a free-text regimen. Used to
   *  attribute regimen-UNLINKED one-tap doses to their regimen by drug (the client's
   *  attributeDosesToRegimens item+window match, B-135) — NOT the regimen's own id. Optional so
   *  legacy fixtures compile; absent ⇒ only an explicit medication_id dose links to it. */
  medicationItemId?: string | null
  /**
   * The AUTHORITATIVE lifecycle field (`medications.status`: 'active' | 'ended') — the
   * same source of truth lib/medications.ts and the `idx_medications_active` index key
   * on. "Currently on this drug" is `status === 'active'`, NEVER a computed now ∈
   * [startedAt, endedAt] membership test: started_at/ended_at are DATE-only, so an
   * interval check drifts by the owner's UTC offset for hours around a state change.
   */
  status: string | null
  /** ISO/DATE start (a historical boundary marker; not used for the active test). */
  startedAt: string | null
  /** ISO/DATE end; null = still active. Fallback active signal when `status` is absent. */
  endedAt: string | null
  doseAmount: string | null
  deletedAt: string | null
}

/** A logged medication dose (a `medication` event + its administration child) reduced for
 *  the adherence / last-dose tool. */
export interface AskDoseRow {
  id: string
  medicationId: string | null
  /** The linked library drug (medication_administrations.medication_item_id), or null. This is
   *  how a regimen-UNLINKED one-tap dose (medicationId null — the dominant B-135 shape) is both
   *  NAMED (index.ts resolves drugLabel from the item) and attributed to a same-drug regimen.
   *  Optional so legacy fixtures compile; absent ⇒ ad-hoc with no drug identity to match. */
  medicationItemId?: string | null
  drugLabel: string | null
  occurredAt: string
  /** dose_adherence: 'given'|'partial'|'missed'|'refused'|null (null defaults to given). */
  adherence: string | null
  deletedAt: string | null
}

/** An active free-fed standing fact (a `free_choice` feeding_arrangement), reduced. */
export interface AskFeedingArrangementRow {
  id: string
  foodItemId: string | null
  foodLabel: string | null
  primaryProtein: string | null
  activeFrom: string | null
  activeUntil: string | null
  deletedAt: string | null
}

/**
 * A cached per-incident AI read (an `event_ai_analysis` row), reduced for the recall
 * tools (§6.2 mode 2). The OWNER-EDITABLE STRUCTURED FIELDS are authoritative; the
 * derived red flags come from THOSE fields, never the stale `visual_flags` cache the
 * client edit path deliberately does not refresh (the B-339/B-340 discipline). v1
 * relays cached reads only — a live read is A8.
 */
export interface AskCachedReadRow {
  eventId: string
  incidentType: string
  /** 'pending'|'completed'|'failed'|'uncertain'. */
  status: string
  /** Reversible soft-hide of the n=1 read; non-null = the owner dismissed it → not relayed. */
  dismissedAt: string | null
  /** Non-null = the owner edited a structured field (drives the calm "Edited" marker). */
  editedAt: string | null
  // ── owner-editable structured fields (authoritative) ──
  description: string | null
  colour: string | null
  contents: string[] | null
  consistency: string | null
  bloodPresent: string | null // vomit_blood
  bilePresent: string | null // vomit_tristate
  foreignMaterialPresent: string | null // vomit_tristate
  foreignMaterialNote: string | null
  // ── stool structured fields (migration 034) ──
  stoolConsistency: string | null
  stoolBloodPresent: string | null
  stoolMucusPresent: string | null
  // ── n=1 interpretive read (dismissible, not editable) ──
  recommendation: string | null
  readText: string | null
}

// ── deleted_at contract (§5.2 / B-071) ────────────────────────────────────────────

/** Keep only live (non-soft-deleted) rows. Called FIRST by every tool that reads events,
 *  so the pure layer never counts / recalls a row the owner has removed — even if the
 *  caller forgot to pre-filter (the more-deleted-than-live fixture pins this). */
export function liveEvents<T extends { deletedAt: string | null }>(rows: T[]): T[] {
  return rows.filter((r) => r.deletedAt == null)
}

// ── G6 — honest "when" rendering (B-010) ──────────────────────────────────────────

/** A structured, phrasing-ready "when" for a recalled event. `isApproximate` is true for
 *  anything that is not a witnessed instant — the phrasing layer must render a window /
 *  "around" for those and NEVER a false-precise point (G6). */
export interface AskWhen {
  confidence: OccurredAtConfidence | 'unknown'
  /** The stored point (latest edge for a window) — safe to show ONLY when !isApproximate. */
  occurredAt: string
  earliest: string | null
  latest: string | null
  isApproximate: boolean
}

function toWhen(row: AskEventRow | AskMealRow): AskWhen {
  const confidence = ('occurredAtConfidence' in row ? row.occurredAtConfidence : null) ?? null
  const earliest = ('occurredAtEarliest' in row ? row.occurredAtEarliest : null) ?? null
  const latest = ('occurredAtLatest' in row ? row.occurredAtLatest : null) ?? null
  return {
    confidence: confidence ?? 'unknown',
    occurredAt: row.occurredAt,
    earliest,
    latest,
    // Witnessed (a real instant) OR legacy-null (backfilled point) render as a point;
    // estimated/window must render as a range/estimate.
    isApproximate: confidence === 'estimated' || confidence === 'window',
  }
}

// ══════════════════════════════════════════════════════════════════════════════════
// FAMILY 1 — Counts & frequency
// ══════════════════════════════════════════════════════════════════════════════════

export interface CountSymptomResult {
  kind: 'count_symptom'
  symptomType: string
  window: AskWindow
  windowLabel: string
  /** RAW event count in the window — NOT episode-collapsed, so it matches the History
   *  timeline the owner can scroll (G5; the computeSymptomCounts stance). Always honest,
   *  never floored: a count of 0 is a true fact (rendered "nothing logged", never "well"). */
  count: number
  /** Coverage denominator: distinct days in the window with ≥1 live event of ANY type. */
  loggedDays: number
  /** Total days the window spans (null for 'all' with no events → see spanDays). */
  windowDays: number | null
  /** For 'all': observed span in days (first live event → now); else == windowDays. */
  spanDays: number
}

/** Count live events of `symptomType` in the window, with the coverage denominator the
 *  provenance row states ("7 events · logging on N of M days"). `allEvents` is the pet's
 *  full live event stream (any type) — used only to compute logged-day coverage. */
export function countSymptom(
  allEvents: AskEventRow[],
  params: { symptomType: string; window: AskWindow; nowMs: number; trialStartMs?: number | null },
): CountSymptomResult {
  const w = resolveWindow(params.window, params.nowMs, params.trialStartMs)
  const live = liveEvents(allEvents)
  const inWindow = live.filter((e) => inSpan(e.occurredAt, w))
  const count = inWindow.filter((e) => e.type === params.symptomType).length
  const loggedDays = new Set(inWindow.map((e) => utcDayIndex(e.occurredAt)).filter((d) => d != null)).size
  const spanDays = w.windowDays ?? observedSpanDays(live, params.nowMs)
  return {
    kind: 'count_symptom',
    symptomType: params.symptomType,
    window: w.window,
    windowLabel: w.label,
    count,
    loggedDays,
    windowDays: w.windowDays,
    spanDays,
  }
}

export interface SymptomTrendResult {
  kind: 'symptom_trend'
  symptomType: string
  window: AskWindow
  windowLabel: string
  /** Raw count in the current span (G5 parity with computeSymptomCounts.current). */
  current: number
  /** Raw count in the equal-length prior span; null when the window has no prior ('all',
   *  'since_trial_start'). */
  prior: number | null
  /** current − prior; null when prior is null. */
  delta: number | null
  /** Descriptive direction only. 'up' = MORE symptoms than the prior span. This tool NEVER
   *  mints a safety verdict — whether a rise carries the safety register is A4's G4 job,
   *  which reuses detector ④'s shared `isWorsening` so Ask and the Signal cannot disagree
   *  about "worsening". Here it is a bare, honest count comparison. */
  direction: 'up' | 'down' | 'flat' | null
}

/** Current-vs-prior symptom counts over the window (G5 parity with computeSymptomCounts). */
export function symptomTrend(
  events: AskEventRow[],
  params: { symptomType: string; window: AskWindow; nowMs: number; trialStartMs?: number | null },
): SymptomTrendResult {
  const w = resolveWindow(params.window, params.nowMs, params.trialStartMs)
  const live = liveEvents(events).filter((e) => e.type === params.symptomType)
  const current = live.filter((e) => inSpan(e.occurredAt, w)).length
  let prior: number | null = null
  let delta: number | null = null
  let direction: SymptomTrendResult['direction'] = null
  if (w.priorStartMs != null && w.priorEndMs != null) {
    prior = live.filter((e) => inRange(e.occurredAt, w.priorStartMs as number, w.priorEndMs as number)).length
    delta = current - prior
    direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
  }
  return {
    kind: 'symptom_trend',
    symptomType: params.symptomType,
    window: w.window,
    windowLabel: w.label,
    current,
    prior,
    delta,
    direction,
  }
}

/** Named local-day bands (the owner-facing buckets for a time-of-day distribution). */
export const TIME_OF_DAY_BANDS = [
  { key: 'overnight', label: 'overnight (12–6am)', startHour: 0, endHour: 6 },
  { key: 'morning', label: 'morning (6am–12pm)', startHour: 6, endHour: 12 },
  { key: 'afternoon', label: 'afternoon (12–6pm)', startHour: 12, endHour: 18 },
  { key: 'evening', label: 'evening (6pm–12am)', startHour: 18, endHour: 24 },
] as const
export type TimeOfDayBandKey = (typeof TIME_OF_DAY_BANDS)[number]['key']

export interface TimeOfDayResult {
  kind: 'time_of_day'
  symptomType: string
  window: AskWindow
  windowLabel: string
  /** False when the timezone is absent/invalid — a clock-time answer would be a guess, so
   *  the tool is SILENT (mirrors detection ⑥ §4.2: never guess UTC). */
  available: boolean
  /** Per-band counts of WITNESSED events (the denominator below); [] when unavailable. */
  byBand: { key: TimeOfDayBandKey; label: string; count: number }[]
  /** Witnessed, clock-placeable events (the denominator). A discovered/windowed onset has
   *  no honest clock time and is excluded from BOTH numerator and denominator. */
  eligibleCount: number
  /** In-window events excluded because their time is estimated/windowed/unknown (honesty
   *  context: "M of these couldn't be placed on the clock"). */
  excludedCount: number
}

/**
 * Descriptive distribution of a symptom across the pet's LOCAL-day bands. This RELAYS a
 * count distribution — it never mints the statistical "cluster" the Signal's detector ⑥
 * fires (that's the engine's job; Ask relays, never escalates). Witnessed-only (a
 * discovered onset can't be placed on the clock), timezone-required (absent/invalid ⇒
 * unavailable, never a guessed UTC hour).
 */
export function timeOfDay(
  events: AskEventRow[],
  params: {
    symptomType: string
    window: AskWindow
    nowMs: number
    timezone?: string | null
    trialStartMs?: number | null
  },
): TimeOfDayResult {
  const w = resolveWindow(params.window, params.nowMs, params.trialStartMs)
  const base: TimeOfDayResult = {
    kind: 'time_of_day',
    symptomType: params.symptomType,
    window: w.window,
    windowLabel: w.label,
    available: false,
    byBand: [],
    eligibleCount: 0,
    excludedCount: 0,
  }
  const tz = params.timezone
  // §4.2 — no timezone, or an invalid IANA zone, ⇒ silent. Probe the zone once on `now`.
  if (!tz || localHourOfDay(params.nowMs, tz) === null) return base

  const inWindow = liveEvents(events).filter(
    (e) => e.type === params.symptomType && inSpan(e.occurredAt, w),
  )
  const counts: Record<TimeOfDayBandKey, number> = {
    overnight: 0,
    morning: 0,
    afternoon: 0,
    evening: 0,
  }
  let eligible = 0
  let excluded = 0
  for (const e of inWindow) {
    // Only a witnessed instant can be placed on the clock (G6): estimated/window/unknown
    // are excluded from BOTH numerator and denominator.
    if ((e.occurredAtConfidence ?? null) !== 'witnessed') {
      excluded += 1
      continue
    }
    const ms = Date.parse(e.occurredAt)
    if (!Number.isFinite(ms)) {
      excluded += 1
      continue
    }
    const h = localHourOfDay(ms, tz)
    if (h === null) {
      excluded += 1
      continue
    }
    const band = TIME_OF_DAY_BANDS.find((b) => h >= b.startHour && h < b.endHour)
    if (!band) {
      excluded += 1
      continue
    }
    counts[band.key] += 1
    eligible += 1
  }
  return {
    ...base,
    available: true,
    byBand: TIME_OF_DAY_BANDS.map((b) => ({ key: b.key, label: b.label, count: counts[b.key] })),
    eligibleCount: eligible,
    excludedCount: excluded,
  }
}

// ══════════════════════════════════════════════════════════════════════════════════
// FAMILY 2 — Recall (SCOPED RETRIEVAL, the D2 boundary §6.1)
// ══════════════════════════════════════════════════════════════════════════════════
//
// These are the ONLY tools whose return types carry a `note` and a cached-read
// projection. They return the events the QUESTION picked — one event (recallEvent /
// lastSymptom) or a bounded, hard-capped slice (recentEvents) — never the record
// wholesale. AC-11 pins the scoping: recalling one event surfaces only THAT event's
// note/read; no other event's note appears in the output.

/** A single recalled event's scoped detail (§6.1). Carries the note + the override-aware
 *  cached read for THIS event only. */
export interface RecalledEvent {
  id: string
  type: string
  when: AskWhen
  /** The event's own free-text note (D2), or null. Scoped to this event only. */
  note: string | null
  hasPhoto: boolean
  /** The override-aware cached AI read for this event, or null when no read row exists. A
   *  DISMISSED read still projects (its structured facts / present-only flags remain a
   *  recountable fact — dismissal must never hide a present red flag); only its n=1
   *  interpretive text is nulled (see projectCachedRead). */
  cachedRead: ProjectedRead | null
}

export interface RecallEventResult {
  kind: 'recall_event'
  /** The matched event, or null when no LIVE event matches the id (never a reassurance). */
  event: RecalledEvent | null
}

/**
 * Recall ONE event by id, with its scoped note + cached read (§6.1). The join of reads is
 * passed in; we match the read to THIS event only. A soft-deleted or unknown id ⇒
 * `event: null` — "that isn't in the record", never a wellness verdict.
 */
export function recallEvent(
  events: AskEventRow[],
  reads: AskCachedReadRow[],
  params: { eventId: string },
): RecallEventResult {
  const row = liveEvents(events).find((e) => e.id === params.eventId)
  if (!row) return { kind: 'recall_event', event: null }
  return { kind: 'recall_event', event: toRecalledEvent(row, reads) }
}

export interface RecentEventsResult {
  kind: 'recent_events'
  window: AskWindow
  windowLabel: string
  /** The scoped slice, newest first, capped at min(limit, MAX_RECALL) — the structural
   *  "no bulk tool" guarantee (§6.1). Each entry carries its own note/read; none carries
   *  any other event's. */
  events: RecalledEvent[]
  /** How many live events matched before the cap (so the answer can say "showing N of M"). */
  matched: number
  /** True when `matched` exceeded the cap — the answer points at the vet report / export for
   *  the whole record (§7.4), never dumps it. */
  truncated: boolean
}

/**
 * Recall a bounded, newest-first slice of events (optionally of one type) in a window,
 * each with its scoped note + cached read (§6.1). Hard-capped at MAX_RECALL — there is
 * no path here to serialize the record. This is the closest tool to a "list", and its cap
 * is what keeps it a scoped recall rather than a bulk export.
 */
export function recentEvents(
  events: AskEventRow[],
  reads: AskCachedReadRow[],
  params: {
    window: AskWindow
    nowMs: number
    type?: string | null
    limit?: number
    trialStartMs?: number | null
  },
): RecentEventsResult {
  const w = resolveWindow(params.window, params.nowMs, params.trialStartMs)
  // Number.isInteger guards NaN/Infinity/floats (which `??` lets through) → default cap.
  const requested = Number.isInteger(params.limit) ? (params.limit as number) : MAX_RECALL
  const cap = Math.max(1, Math.min(requested, MAX_RECALL))
  const matches = liveEvents(events)
    .filter((e) => inSpan(e.occurredAt, w))
    .filter((e) => (params.type ? e.type === params.type : true))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  const slice = matches.slice(0, cap).map((e) => toRecalledEvent(e, reads))
  return {
    kind: 'recent_events',
    window: w.window,
    windowLabel: w.label,
    events: slice,
    matched: matches.length,
    truncated: matches.length > cap,
  }
}

export interface LastSymptomResult {
  kind: 'last_symptom'
  symptomType: string
  /** The most recent live event of this type (any time — recall is not window-bound), or
   *  null when none is logged. Null is "nothing logged", NEVER "she's well" (G2). */
  event: RecalledEvent | null
}

/** Recall the single most recent live event of a type, with its scoped detail. */
export function lastSymptom(
  events: AskEventRow[],
  reads: AskCachedReadRow[],
  params: { symptomType: string },
): LastSymptomResult {
  const row = liveEvents(events)
    .filter((e) => e.type === params.symptomType)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0]
  return {
    kind: 'last_symptom',
    symptomType: params.symptomType,
    event: row ? toRecalledEvent(row, reads) : null,
  }
}

/** Build a scoped RecalledEvent from a row + the reads join, matching the read to THIS
 *  event only (the scoped-retrieval guarantee — no other event's note/read leaks in). */
function toRecalledEvent(row: AskEventRow, reads: AskCachedReadRow[]): RecalledEvent {
  const read = reads.find((r) => r.eventId === row.id) ?? null
  return {
    id: row.id,
    type: row.type,
    when: toWhen(row),
    note: row.note ?? null,
    hasPhoto: row.hasPhoto ?? false,
    cachedRead: read ? projectCachedRead(read) : null,
  }
}

// ── Cached-read projection (§6.2 mode 2, override-aware) ──────────────────────────

/** Present-only derived visual red flags (§7 / clinical-guardrails). Derived from the
 *  OWNER-EDITABLE structured fields, never the stale visual_flags cache — so an owner
 *  override that clears a field clears the flag by construction (B-339/B-340). */
export type DerivedFlag = 'blood' | 'foreign_material' | 'stool_blood'

/**
 * The override-aware projection of a cached read that a recall answer may relay. Carries
 * the owner-editable structured fields (authoritative) + the dismissible n=1 read text,
 * and the PRESENT-ONLY derived red flags. NEVER carries the raw visual_flags array. A
 * relayed read may escalate on the PRESENCE of a red flag; it must never let the phrasing
 * layer reassure on ABSENCE (that asymmetry is enforced in A4's validator — this layer
 * simply omits any "all clear" affordance: an empty `flags` is "nothing was flagged in
 * this one", never "she's fine").
 */
export interface ProjectedRead {
  incidentType: string
  status: string
  edited: boolean
  /** Owner-facing plain-language description (editable), or null. */
  description: string | null
  /** Present-only red flags derived from the structured fields (never visual_flags). */
  flags: DerivedFlag[]
  /** The dismissible n=1 read text, or null when dismissed / absent. Relayed verbatim; the
   *  validator gates the surrounding sentence. */
  readText: string | null
  recommendation: string | null
  /** The structured clinical fields, passed through for a factual recount (all owner-
   *  editable / authoritative). Only non-null fields are meaningful. */
  fields: {
    colour: string | null
    contents: string[] | null
    consistency: string | null
    bloodPresent: string | null
    bilePresent: string | null
    foreignMaterialPresent: string | null
    foreignMaterialNote: string | null
    stoolConsistency: string | null
    stoolBloodPresent: string | null
    stoolMucusPresent: string | null
  }
}

/** Present-only flag derivation (mirrors detection.ts deriveIncidentFlags + the report's
 *  unionPresentFlags): only an affirmative value is a flag; every other value — including
 *  'unsure' and null — is NOT (absence is never manufactured, §9). */
export function derivePresentFlags(read: AskCachedReadRow): DerivedFlag[] {
  const flags: DerivedFlag[] = []
  if (read.bloodPresent === 'fresh_red' || read.bloodPresent === 'coffee_ground') flags.push('blood')
  if (read.foreignMaterialPresent === 'yes') flags.push('foreign_material')
  if (read.stoolBloodPresent === 'yes') flags.push('stool_blood')
  return flags
}

/** Project a cached read into the relayable, override-aware shape. A dismissed read hides
 *  its n=1 interpretive text (soft-delete rule) but its structured facts remain recountable;
 *  a non-completed read carries no structured facts yet. */
export function projectCachedRead(read: AskCachedReadRow): ProjectedRead {
  const dismissed = read.dismissedAt != null
  return {
    incidentType: read.incidentType,
    status: read.status,
    edited: read.editedAt != null,
    description: read.description,
    flags: derivePresentFlags(read),
    // The n=1 read (recommendation/read_text) is dismissible; hide it when dismissed.
    readText: dismissed ? null : read.readText,
    recommendation: dismissed ? null : read.recommendation,
    fields: {
      colour: read.colour,
      contents: read.contents,
      consistency: read.consistency,
      bloodPresent: read.bloodPresent,
      bilePresent: read.bilePresent,
      foreignMaterialPresent: read.foreignMaterialPresent,
      foreignMaterialNote: read.foreignMaterialNote,
      stoolConsistency: read.stoolConsistency,
      stoolBloodPresent: read.stoolBloodPresent,
      stoolMucusPresent: read.stoolMucusPresent,
    },
  }
}

// ── Photo presence (§6.2 mode 1) ──────────────────────────────────────────────────

export interface PhotoPresenceResult {
  kind: 'photo_presence'
  window: AskWindow
  windowLabel: string
  /** Count of live events WITH a photo, and the dates — presence only; the bytes never
   *  enter this layer. The tap-through opens the event where the photo lives. */
  count: number
  eventIds: string[]
}

/** Which events in a window carry a photo (presence + references only, §6.2 mode 1). */
export function photoPresence(
  events: AskEventRow[],
  params: { window: AskWindow; nowMs: number; type?: string | null; trialStartMs?: number | null },
): PhotoPresenceResult {
  const w = resolveWindow(params.window, params.nowMs, params.trialStartMs)
  const withPhoto = liveEvents(events)
    .filter((e) => inSpan(e.occurredAt, w))
    .filter((e) => (params.type ? e.type === params.type : true))
    .filter((e) => e.hasPhoto === true)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  return {
    kind: 'photo_presence',
    window: w.window,
    windowLabel: w.label,
    count: withPhoto.length,
    eventIds: withPhoto.map((e) => e.id),
  }
}

// ══════════════════════════════════════════════════════════════════════════════════
// FAMILY 3 — Rates & trends (ported from lib/analytics.ts for G5 parity)
// ══════════════════════════════════════════════════════════════════════════════════

export interface IntakeSummaryResult {
  kind: 'intake_summary'
  window: AskWindow
  windowLabel: string
  /** finishedMeals / ratedMeals in [0,1]. */
  rate: number
  finishedMeals: number
  /** Denominator: rated, non-treat, non-free-fed meals (§11 #1 / #6). */
  ratedMeals: number
  /** How many rated non-treat meals were excluded because the food is free-fed. */
  freeFedExcluded: number
  /** §11 #6 caveat — set when ≥1 free-fed meal was excluded: intake wasn't directly observed. */
  intakeNotDirectlyObserved: boolean
}

/**
 * Share of MEALS the pet finished (most/all) in the window — a faithful port of
 * lib/analytics.ts computeIntakeRate. Denominator is rated, non-treat (§11 #1 — a treat's
 * ceiling rate masks a meal refusal), non-free-fed (§11 #6 — a free-fed bowl's intake
 * isn't directly observed) meals. Below the floor ⇒ NotEnoughData (never a rate off 1–2
 * meals; a food a pet is starting to refuse must not read as a low "preference").
 */
export function intakeSummary(
  meals: AskMealRow[],
  params: { window: AskWindow; nowMs: number; freeFedFoodIds: ReadonlySet<string>; trialStartMs?: number | null },
): IntakeSummaryResult | NotEnoughData {
  const w = resolveWindow(params.window, params.nowMs, params.trialStartMs)
  const inWindow = liveEvents(meals).filter((m) => inSpan(m.occurredAt, w))
  const ratedNonTreat = inWindow.filter((m) => m.foodType !== 'treat' && m.intakeRating != null)
  const freeFedExcluded = ratedNonTreat.filter((m) => isFreeFedMeal(m, params.freeFedFoodIds)).length
  const denominator = ratedNonTreat.filter((m) => !isFreeFedMeal(m, params.freeFedFoodIds))

  if (denominator.length < ASK_FLOORS.minRatedMealsForIntakeRate) {
    return notEnoughData(denominator.length, ASK_FLOORS.minRatedMealsForIntakeRate)
  }
  const finished = denominator.filter(isFinishedMeal).length
  return {
    kind: 'intake_summary',
    window: w.window,
    windowLabel: w.label,
    rate: finished / denominator.length,
    finishedMeals: finished,
    ratedMeals: denominator.length,
    freeFedExcluded,
    intakeNotDirectlyObserved: freeFedExcluded > 0,
  }
}

export interface RankedFoodEntry {
  foodItemId: string
  label: string
  foodType: string | null
  count: number
  shareOfDiet: number
  /** null below the floor, fully free-fed, OR a treat (ceiling rate nulled at the source
   *  so no consumer can render "treats 100% finished → loved", §11 #1). */
  finishedRate: number | null
  ratedMeals: number
  isTreat: boolean
}

export interface TopFoodsResult {
  kind: 'top_foods'
  window: AskWindow
  windowLabel: string
  foods: RankedFoodEntry[]
}

/**
 * Most-LOGGED foods in the window, ranked by meal count — a faithful port of
 * lib/analytics.ts computeTopFoods (incl. the B-115 exact-timestamp same-treat re-log
 * collapse and the treat-if-ANY ceiling-safe rule). Floored on identifiable foods
 * (§11 #5). Positive framing only — this is "what's fed most", never a preference verdict.
 */
export function topFoods(
  meals: AskMealRow[],
  params: {
    window: AskWindow
    nowMs: number
    freeFedFoodIds?: ReadonlySet<string>
    limit?: number
    trialStartMs?: number | null
  },
): TopFoodsResult | NotEnoughData {
  const w = resolveWindow(params.window, params.nowMs, params.trialStartMs)
  const limit = params.limit ?? 5
  const freeFed = params.freeFedFoodIds ?? new Set<string>()
  const inWindow = liveEvents(meals).filter((m) => inSpan(m.occurredAt, w))
  const candidates = collapseTreatRelogs(inWindow).filter((m) => m.foodItemId !== null && !!m.foodLabel)
  if (candidates.length < ASK_FLOORS.minMealsForRanking) {
    return notEnoughData(candidates.length, ASK_FLOORS.minMealsForRanking)
  }
  const byFood = new Map<string, AskMealRow[]>()
  for (const m of candidates) {
    const id = m.foodItemId as string
    const arr = byFood.get(id)
    if (arr) arr.push(m)
    else byFood.set(id, [m])
  }
  const total = candidates.length
  const ranked: RankedFoodEntry[] = []
  for (const [id, group] of byFood) {
    const isTreat = group.some((m) => m.foodType === 'treat')
    const fr = itemFinishedRate(group, freeFed)
    ranked.push({
      foodItemId: id,
      label: group[0].foodLabel as string,
      foodType: group[0].foodType,
      count: group.length,
      shareOfDiet: group.length / total,
      finishedRate: isTreat ? null : fr.rate,
      ratedMeals: fr.ratedMeals,
      isTreat,
    })
  }
  ranked.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  return { kind: 'top_foods', window: w.window, windowLabel: w.label, foods: ranked.slice(0, limit) }
}

export interface RankedProteinEntry {
  protein: string
  count: number
  shareOfDiet: number
  finishedRate: number | null
  ratedMeals: number
  isTreat: boolean
}

export interface TopProteinsResult {
  kind: 'top_proteins'
  window: AskWindow
  windowLabel: string
  proteins: RankedProteinEntry[]
}

/**
 * Most-consumed primary protein by EXPOSURE in the window — a faithful port of
 * lib/analytics.ts computeTopProteins (canonicalized before ranking; treats INCLUDED for
 * exposure and flagged isTreat, B-111; finished-rate over non-treat meals only, §11 #1;
 * B-115 treat-relog collapse). Floored on identifiable feedings (§11 #5). The imported
 * canonicalizeProtein is the SAME key the dashboard and correlation engine use.
 */
export function topProteins(
  meals: AskMealRow[],
  params: {
    window: AskWindow
    nowMs: number
    freeFedFoodIds?: ReadonlySet<string>
    limit?: number
    trialStartMs?: number | null
  },
): TopProteinsResult | NotEnoughData {
  const w = resolveWindow(params.window, params.nowMs, params.trialStartMs)
  const limit = params.limit ?? 5
  const freeFed = params.freeFedFoodIds ?? new Set<string>()
  const inWindow = liveEvents(meals).filter((m) => inSpan(m.occurredAt, w))
  const byProtein = new Map<string, AskMealRow[]>()
  let identified = 0
  for (const m of collapseTreatRelogs(inWindow)) {
    const key = canonicalizeProtein(m.primaryProtein)
    if (key === null) continue
    identified += 1
    const arr = byProtein.get(key)
    if (arr) arr.push(m)
    else byProtein.set(key, [m])
  }
  if (identified < ASK_FLOORS.minMealsForRanking) {
    return notEnoughData(identified, ASK_FLOORS.minMealsForRanking)
  }
  const ranked: RankedProteinEntry[] = []
  for (const [protein, feedings] of byProtein) {
    const mealRows = feedings.filter((m) => m.foodType !== 'treat')
    const isTreat = mealRows.length === 0
    const fr = itemFinishedRate(mealRows, freeFed)
    ranked.push({
      protein,
      count: feedings.length,
      shareOfDiet: feedings.length / identified,
      finishedRate: isTreat ? null : fr.rate,
      ratedMeals: fr.ratedMeals,
      isTreat,
    })
  }
  ranked.sort((a, b) => b.count - a.count || a.protein.localeCompare(b.protein))
  return { kind: 'top_proteins', window: w.window, windowLabel: w.label, proteins: ranked.slice(0, limit) }
}

export interface WeightSummaryResult {
  kind: 'weight_summary'
  window: AskWindow
  windowLabel: string
  readingCount: number
  seriesLbs: number[]
  latestLbs: number | null
  latestOccurredAt: string | null
  earliestOccurredAt: string | null
  /** latest − earliest of the drawn series; null with <2 readings (no trend). */
  deltaLbs: number | null
  /** Descriptive direction ONLY — never a wellness verdict. A falling line can be wasting,
   *  a rising one fluid/edema; the phrasing layer must not say "improving"/"stable" (the
   *  migration-024 clinical note). */
  direction: 'up' | 'down' | 'flat' | null
}

/**
 * Weight trend over the window — a faithful port of lib/weight.ts computeWeightTrend
 * (pounds math, 0.1-lb rounding, single-reading = point-not-trend). Descriptive numbers +
 * a neutral direction; NEVER a verdict. 'all' shows the full history.
 */
export function weightSummary(
  readings: AskWeightRow[],
  params: { window: AskWindow; nowMs: number; trialStartMs?: number | null },
): WeightSummaryResult {
  const w = resolveWindow(params.window, params.nowMs, params.trialStartMs)
  const live = liveEvents(readings).filter((r) => inSpan(r.occurredAt, w))
  const sorted = [...live].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
  const seriesLbs = sorted.map((r) => kgToLbsNum(r.weightKg))
  const count = seriesLbs.length

  const base = {
    kind: 'weight_summary' as const,
    window: w.window,
    windowLabel: w.label,
  }
  if (count === 0) {
    return { ...base, readingCount: 0, seriesLbs: [], latestLbs: null, latestOccurredAt: null, earliestOccurredAt: null, deltaLbs: null, direction: null }
  }
  const latestLbs = seriesLbs[count - 1]
  const latestOccurredAt = sorted[count - 1].occurredAt
  const earliestOccurredAt = sorted[0].occurredAt
  if (count === 1) {
    return { ...base, readingCount: 1, seriesLbs, latestLbs, latestOccurredAt, earliestOccurredAt, deltaLbs: null, direction: null }
  }
  const deltaLbs = Math.round((latestLbs - seriesLbs[0]) * 10) / 10
  const direction = deltaLbs > 0 ? 'up' : deltaLbs < 0 ? 'down' : 'flat'
  return { ...base, readingCount: count, seriesLbs, latestLbs, latestOccurredAt, earliestOccurredAt, deltaLbs, direction }
}

// ══════════════════════════════════════════════════════════════════════════════════
// FAMILY 4 — Regimen & trial state
// ══════════════════════════════════════════════════════════════════════════════════

export interface DietTrialStatusResult {
  kind: 'diet_trial_status'
  active: boolean
  /** Day 1 = the start day; inclusive elapsed days, clamped ≥ 1. Null when no trial. */
  dayCounter: number | null
  targetDays: number | null
  daysRemaining: number | null
  /** dayCounter has reached the target (the milestone). */
  complete: boolean
}

/** Diet-trial progress — a faithful port of lib/analytics.ts getDietTrialProgress. A null OR
 *  soft-deleted trial ⇒ inactive (no trial to report), never an invented span. The trial
 *  carries its own `deletedAt` so this core enforces the soft-delete contract itself (§5.2 /
 *  B-071), rather than trusting the caller — matching `liveEvents` everywhere else. */
export function dietTrialStatus(
  trial: { startedAt: string; targetDurationDays: number; status?: string | null; deletedAt?: string | null } | null,
  nowMs: number,
): DietTrialStatusResult {
  if (!trial || trial.deletedAt != null) {
    return { kind: 'diet_trial_status', active: false, dayCounter: null, targetDays: null, daysRemaining: null, complete: false }
  }
  const startMs = Date.parse(trial.startedAt)
  if (!Number.isFinite(startMs) || !Number.isFinite(nowMs)) {
    return { kind: 'diet_trial_status', active: false, dayCounter: null, targetDays: null, daysRemaining: null, complete: false }
  }
  const startIndex = Math.floor(startMs / MS_PER_DAY)
  const todayIndex = Math.floor(nowMs / MS_PER_DAY)
  const dayCounter = Math.max(1, todayIndex - startIndex + 1)
  const targetDays = Math.max(0, Math.floor(trial.targetDurationDays))
  const daysRemaining = Math.max(0, targetDays - dayCounter)
  const complete = targetDays > 0 && dayCounter >= targetDays
  return { kind: 'diet_trial_status', active: true, dayCounter, targetDays, daysRemaining, complete }
}

export interface FreeFedResult {
  kind: 'free_fed'
  /** Active free-fed standing facts as of `now`. Empty ⇒ nothing free-fed (the pet is
   *  meal-fed, so intake IS directly observed). */
  arrangements: { foodLabel: string | null; protein: string | null }[]
  /** True whenever ≥1 food is free-fed — the "intake not directly observed" caveat the
   *  intake tools also carry (§11 #6). */
  intakeNotDirectlyObserved: boolean
}

/** Which foods are currently free-fed. "Currently active" is `active_until IS NULL` — the
 *  DB's authoritative lifecycle (migration 018 / lib/feedingArrangements.ts isFreeChoiceActive),
 *  NOT a now ∈ [activeFrom, activeUntil] interval check: active_from/until are DATE-only, so an
 *  interval test drifts by the owner's UTC offset for hours around a toggle (code review, A3).
 *  active_from is a historical boundary marker, never a future-dated schedule. The protein is
 *  canonicalized so it pools with logged meals (matching detection.ts). */
export function freeFedStatus(arrangements: AskFeedingArrangementRow[]): FreeFedResult {
  const active = liveEvents(arrangements).filter((a) => a.activeUntil == null)
  return {
    kind: 'free_fed',
    arrangements: active.map((a) => ({ foodLabel: a.foodLabel, protein: canonicalizeProtein(a.primaryProtein) })),
    intakeNotDirectlyObserved: active.length > 0,
  }
}

export interface MedicationEntry {
  medicationId: string | null
  drugLabel: string
  active: boolean
  doseAmount: string | null
  /** Last administered (given/partial) dose time for this drug, or null. Refused/missed
   *  doses are NOT "last given" (they weren't given). */
  lastDoseAt: string | null
  /** Doses logged for this drug in the adherence window: given/partial vs missed/refused. */
  dosesGiven: number
  dosesMissed: number
}

export interface MedicationsResult {
  kind: 'medications'
  window: AskWindow
  windowLabel: string
  medications: MedicationEntry[]
}

/**
 * Current medications + a one-line adherence summary per drug (§3.4 family 4). Regimens
 * define the drugs (active = now within [startedAt, endedAt]); doses in the window give the
 * given/missed counts + last-given time. "Last given" counts only administered doses
 * (given/partial) — a refused/missed dose was NOT given (doseToMedicationWindow's clinical
 * rule). Adherence is never auto-reassuring — it reports counts, and a missed critical dose
 * is A4's escalation call, not a soft "all caught up" here.
 */
export function medications(
  regimens: AskRegimenRow[],
  doses: AskDoseRow[],
  params: { window: AskWindow; nowMs: number; trialStartMs?: number | null },
): MedicationsResult {
  const w = resolveWindow(params.window, params.nowMs, params.trialStartMs)
  const liveRegimens = liveEvents(regimens)
  const windowDoses = liveEvents(doses).filter((d) => inSpan(d.occurredAt, w))

  // Attribute each in-window dose to a regimen with the SAME two-pass precedence as the
  // client's attributeDosesToRegimens (lib/medications.ts) — so an Ask per-regimen dose
  // count equals the pet-profile "Current medications" card exactly (G5). The old code
  // matched ONLY on medicationId, which the one-tap path leaves null (B-135): so a real
  // ad-hoc dose both undercounted its regimen AND (since index.ts didn't resolve its name)
  // collapsed into a single unnamed "a medication" bucket — merging every different drug's
  // ad-hoc doses together (the motozol bug). Keep this in lockstep with the client helper.
  const regimenIdByDoseId = new Map<string, string>()
  for (const d of windowDoses) {
    const regId = attributeDoseToRegimen(d, liveRegimens)
    if (regId) regimenIdByDoseId.set(d.id, regId)
  }

  const entries: MedicationEntry[] = []
  for (const reg of liveRegimens) {
    // Authoritative lifecycle: `status === 'active'` (the DB's own field + index), with a
    // `endedAt == null` fallback when status is absent. NOT a now ∈ [started_at, ended_at]
    // interval test — those are DATE-only and drift by the owner's UTC offset (code review, A3).
    const active = reg.status != null ? reg.status === 'active' : reg.endedAt == null
    const drugDoses = windowDoses.filter((d) => regimenIdByDoseId.get(d.id) === reg.id)
    entries.push(buildMedicationEntry(reg.id, reg.drugLabel, active, reg.doseAmount, drugDoses))
  }

  // Truly ad-hoc doses — matched to NO regimen — grouped by their resolved drug label so a
  // logged dose with no regimen still reports NAMED (B-135; the motozol case). drugLabel is
  // resolved from the library item by index.ts; a genuinely nameless dose (no regimen, no
  // library item) still falls back to "a medication".
  const unlinked = windowDoses.filter((d) => !regimenIdByDoseId.has(d.id))
  const byLabel = new Map<string, AskDoseRow[]>()
  for (const d of unlinked) {
    const label = d.drugLabel ?? 'a medication'
    const arr = byLabel.get(label)
    if (arr) arr.push(d)
    else byLabel.set(label, [d])
  }
  for (const [label, group] of byLabel) {
    entries.push(buildMedicationEntry(null, label, false, null, group))
  }

  return { kind: 'medications', window: w.window, windowLabel: w.label, medications: entries }
}

/**
 * Attribute one dose to a regimen id, or null when it belongs to none — the two-pass
 * precedence PORTED from lib/medications.ts attributeDosesToRegimens (KEEP IN LOCKSTEP):
 *
 *   1. EXPLICIT LINK (B-153/B-154). A dose carrying a medicationId is attributed straight
 *      to that regimen and NEVER re-matched by drug/window. A link to a regimen not in the
 *      live set falls through to ad-hoc (index.ts fetches every regimen for the pet, so in
 *      practice this can't happen; treating it as named-ad-hoc is safer than dropping it).
 *   2. ITEM + WINDOW FALLBACK (the legacy/one-tap unlinked dose, the dominant shape). Match
 *      the regimen for the SAME drug (medicationItemId) whose lifespan contains the dose:
 *      started on/before it, not past its end. ISO date/timestamp strings compare correctly
 *      lexicographically (a DATE-only startedAt vs a full occurredAt works). If two regimens
 *      share a drug, the most-recently-started in-window one wins, so a dose is never double-
 *      counted. An ad-hoc dose with no item id (and no link) matches nothing.
 */
function attributeDoseToRegimen(dose: AskDoseRow, regimens: AskRegimenRow[]): string | null {
  if (dose.medicationId) {
    return regimens.some((r) => r.id === dose.medicationId) ? dose.medicationId : null
  }
  if (!dose.medicationItemId) return null
  let best: AskRegimenRow | null = null
  for (const reg of regimens) {
    if ((reg.medicationItemId ?? null) !== dose.medicationItemId) continue
    if (reg.startedAt == null) continue
    if (dose.occurredAt < reg.startedAt) continue // before this regimen began
    if (reg.endedAt && dose.occurredAt > reg.endedAt) continue // after it ended
    if (!best || (best.startedAt != null && reg.startedAt > best.startedAt)) best = reg
  }
  return best ? best.id : null
}

function buildMedicationEntry(
  medicationId: string | null,
  drugLabel: string,
  active: boolean,
  doseAmount: string | null,
  doses: AskDoseRow[],
): MedicationEntry {
  // A dose counts as "given" at given/partial/null (null defaults to administered — the
  // §5.1 capture default); missed/refused are not given.
  const given = doses.filter((d) => d.adherence == null || d.adherence === 'given' || d.adherence === 'partial')
  const missed = doses.filter((d) => d.adherence === 'missed' || d.adherence === 'refused')
  const lastGiven = given.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0]
  return {
    medicationId,
    drugLabel,
    active,
    doseAmount,
    lastDoseAt: lastGiven ? lastGiven.occurredAt : null,
    dosesGiven: given.length,
    dosesMissed: missed.length,
  }
}

// ══════════════════════════════════════════════════════════════════════════════════
// FAMILY 5 — Engine findings relay (§7.2 — RELAY ONLY, never mint)
// ══════════════════════════════════════════════════════════════════════════════════
//
// Ask can only RELAY safety findings the deterministic engine already fired (free on
// Signal/alerts/report by construction). It never mints an escalation and never
// reassures. This tool is a thin, shape-validating pass-through of the cached
// ai_signals.findings the caller fetched — the register stays the engine's; Ask adds
// nothing. If the engine is silent, this returns an empty list — which A4 must phrase as
// "nothing is flagged right now", NEVER "she's well" (silence ≠ wellness).

export interface RelayedFinding {
  type: string
  priorityClass: 'safety' | 'insight'
  /** The engine's own cached payload for this finding, relayed verbatim (not re-computed). */
  payload: unknown
}

export interface EngineFindingsResult {
  kind: 'engine_findings'
  /** Safety findings first (the §5 ordering), then insights — never dropped to honor a cap. */
  findings: RelayedFinding[]
  /** True when the engine produced findings; false = engine silent (NOT an all-clear). */
  hasFindings: boolean
  relayOnly: true
}

/** Relay the engine's cached findings, safety-first. Pure shape pass-through — it does not
 *  and must not re-derive any finding (G5 / §7.2: one engine, one truth). */
export function engineFindings(
  findings: { type?: unknown; priorityClass?: unknown; payload?: unknown }[] | null | undefined,
): EngineFindingsResult {
  const relayed: RelayedFinding[] = (findings ?? [])
    .filter((f) => typeof f?.type === 'string')
    .map((f) => ({
      type: f.type as string,
      priorityClass: f.priorityClass === 'safety' ? 'safety' : 'insight',
      payload: f.payload ?? f,
    }))
  relayed.sort((a, b) => rankPriority(a.priorityClass) - rankPriority(b.priorityClass))
  return { kind: 'engine_findings', findings: relayed, hasFindings: relayed.length > 0, relayOnly: true }
}

function rankPriority(p: 'safety' | 'insight'): number {
  return p === 'safety' ? 0 : 1
}

// ══════════════════════════════════════════════════════════════════════════════════
// Shared internal helpers (ported from lib/analytics.ts / lib/weight.ts — keep in lockstep)
// ══════════════════════════════════════════════════════════════════════════════════

/** True when a ms instant falls in a ResolvedWindow's current [startMs, endMs) span. A null
 *  startMs ('all') means no lower bound. */
function inSpan(iso: string, w: ResolvedWindow): boolean {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return false
  if (ms >= w.endMs) return false
  if (w.startMs != null && ms < w.startMs) return false
  return true
}

/** True when a ms instant falls in a half-open [startMs, endMs) range. */
function inRange(iso: string, startMs: number, endMs: number): boolean {
  const ms = Date.parse(iso)
  return Number.isFinite(ms) && ms >= startMs && ms < endMs
}

/** UTC day index (floor(ms/day)) for an ISO instant, or null when unparseable. */
function utcDayIndex(iso: string): number | null {
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? Math.floor(ms / MS_PER_DAY) : null
}

/** Observed span in days from the earliest live event to `now` (for 'all' coverage). ≥1. */
function observedSpanDays(events: { occurredAt: string }[], nowMs: number): number {
  let earliest = Infinity
  for (const e of events) {
    const ms = Date.parse(e.occurredAt)
    if (Number.isFinite(ms) && ms < earliest) earliest = ms
  }
  if (!Number.isFinite(earliest)) return 1
  const days = Math.floor(nowMs / MS_PER_DAY) - Math.floor(earliest / MS_PER_DAY) + 1
  return Math.max(1, days)
}

/** True when a meal's food is currently free-fed for this pet (§11 #6). */
function isFreeFedMeal(m: AskMealRow, freeFed: ReadonlySet<string>): boolean {
  return m.foodItemId !== null && freeFed.has(m.foodItemId)
}

/** A meal counts as "finished" at most/all (score ≥ FINISHED_SCORE). One shared definition. */
function isFinishedMeal(m: AskMealRow): boolean {
  return (INTAKE_SCORE[m.intakeRating as string] ?? 0) >= FINISHED_SCORE
}

interface ItemFinishedRate {
  rate: number | null
  ratedMeals: number
}

/** Per-item finished-rate over rated, non-free-fed meals — ported from lib/analytics.ts
 *  itemFinishedRate. Below the floor ⇒ null (never a rate off 1–2 meals). */
function itemFinishedRate(meals: AskMealRow[], freeFed: ReadonlySet<string>): ItemFinishedRate {
  const rated = meals.filter((m) => m.intakeRating != null && !isFreeFedMeal(m, freeFed))
  if (rated.length < ASK_FLOORS.minRatedMealsForIntakeRate) {
    return { rate: null, ratedMeals: rated.length }
  }
  return { rate: rated.filter(isFinishedMeal).length / rated.length, ratedMeals: rated.length }
}

/**
 * Collapse exact-timestamp re-logs of the SAME treat into ONE exposure BEFORE ranking —
 * ported from lib/analytics.ts collapseTreatRelogs. TREATS ONLY (meals untouched, so the
 * finished-rate/decline lane is unaffected), EXACT timestamp only (never a fuzzy window),
 * non-null foodItemId only. Pure + order-independent (first-seen kept). See the analytics.ts
 * original for the full scope rationale + the rapid-per-tap residual.
 */
function collapseTreatRelogs(rows: AskMealRow[]): AskMealRow[] {
  const seen = new Set<string>()
  const out: AskMealRow[] = []
  for (const m of rows) {
    const ms = Date.parse(m.occurredAt)
    if (m.foodType === 'treat' && m.foodItemId !== null && Number.isFinite(ms)) {
      const key = `${m.foodItemId}\u0000${ms}`
      if (seen.has(key)) continue
      seen.add(key)
    }
    out.push(m)
  }
  return out
}

/** kg → lbs as a NUMBER rounded to 0.1 — ported byte-for-byte from lib/weight.ts kgToLbsNum
 *  so the Ask weight series equals the Profile/Patterns series (G5). */
function kgToLbsNum(kg: number): number {
  return Math.round(kg * 2.20462 * 10) / 10
}

/**
 * Convert a UTC instant to the pet's local hour-of-day (0–23) via the IANA `timezone`,
 * or null when the zone is invalid — ported from detection.ts localHourOfDay so Ask's
 * time-of-day bucketing and the Signal's clustering agree on the local clock. Built on
 * Intl (portable across Deno Edge + the Node test runner; DST handled per-instant).
 */
function localHourOfDay(ms: number, timezone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).formatToParts(new Date(ms))
    const hourStr = parts.find((p) => p.type === 'hour')?.value
    if (hourStr == null) return null
    let h = Number.parseInt(hourStr, 10)
    if (!Number.isInteger(h)) return null
    if (h === 24) h = 0
    return h >= 0 && h <= 23 ? h : null
  } catch {
    return null
  }
}
