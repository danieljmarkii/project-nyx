// Vet Report (Build Step 9) — pure data / assembly layer.
//
// This is the report's analog of generate-signal/detection.ts: a PURE module
// (no I/O, no DB access, no LLM, no rendering) that takes already-fetched, plain-
// shaped rows plus a report window and returns the structured report SNAPSHOT.
// The I/O shell (generate-report/index.ts, PR 5) pulls the rows and calls this;
// render.ts (PR 2) turns the snapshot into HTML. Splitting the load-bearing
// assembly out here is what makes it offline `deno test`-able and keeps every
// honesty invariant in one auditable place — see docs/nyx-vet-report-requirements.md
// (hereafter "the spec"): §7 (architecture), §7.1 (the real-data data-layer
// requirements the Nyx dry-run surfaced), §5 (the honesty rules), §6 (scope).
//
// THE HONESTY INVARIANTS (spec §5) ARE BAKED IN HERE, DETERMINISTICALLY — there
// is NO generative phrasing on clinical content (the report's `validatePhrasing`
// analog is "assemble only already-true structured facts"). Enforced by construction:
//   §5.1  Denominators + window on every count — every symptom aggregate carries
//         windowDays + loggedDays; a bare count is never emitted alone.
//   §5.3  Absence ≠ wellness — the safety-leads slot is EMPTY when no flag is
//         present (never a fabricated "all clear"); an empty section is a designed
//         empty state, never a reassuring blank.
//   §5.5  Frequency over severity — trend is read from frequency; severity is
//         carried ONLY per-event in the appendix log, NEVER averaged (there is no
//         severity-average field anywhere in the snapshot, by design).
//   §5.9  Present-only for blood / foreign / mucus — these render only when
//         PRESENT in an incident; the snapshot exposes them as arrays of the
//         present incidents ONLY, so a "0 of N" is structurally unrepresentable
//         (the enum emits `unsure`, which a shared "0 of N" would fold into a
//         reassuring zero).
//   §5.10 Assessed denominators for AI reads — the vomit phenotype aggregates over
//         the `completed` set; completed / uncertain / failed / pending stay
//         distinct and are disclosed, never collapsed into the denominator.
//   §5.11 De-duplicate before counting — near-simultaneous duplicate logs of the
//         same event type collapse to one incident before ANY count (pseudo-
//         replication makes a frequency look worse and a "0 of N" look safer).
//
// THE CORRELATION / SAFETY line reuses generate-signal's engine over the report
// window (spec §7): ONE statistical METHOD (detection.ts) computes both surfaces, so
// they can never disagree on HOW a finding is derived. They can differ at the margin on
// WHAT is derived, and by design: the report additionally de-dups its input (§5.11) —
// the more-correct input — before calling the engine, whereas the rolling Signal feeds
// raw rows and leans on the engine's own 3-hour episode-collapse (which already subsumes
// same-minute symptom duplicates for the correlation/chronicity/worsening EPISODE counts,
// and meal exposures are protein-keyed sets, so the divergence is bounded and, where it
// exists, the report's de-duped version is the intended clinical truth). The report reads
// ONLY `Established`-tier correlations (spec §8.5 — `Early` implies rigor the data lacks)
// and the safety-class findings (chronicity / intake-decline / worsening) for the
// safety-leads slot; it NEVER reads the rolling Signal cache (the windows differ).
// Window-consistency is load-bearing (Data Scientist sign-off, spec §7): see
// buildDetectionInput for the exact windowing contract (windowed events, now = window end).

import {
  detectSignals,
  detectCoverage,
  doseToMedicationWindow,
  DEFAULT_CONFIG,
  CORRELATION_SYMPTOM_TYPES,
  type Species,
  type IntakeRating,
  type FoodFormat,
  type OccurredAtConfidence,
  type SymptomType,
  type SymptomEvent,
  type MealEvent,
  type FeedingArrangement,
  type MedicationWindow,
  type DetectionInput,
  type CorrelationFinding,
  type IntakeDeclineFinding,
  type SymptomChronicityFinding,
  type SymptomWorseningFinding,
  type PostprandialTimingFinding,
  type TimeOfDayClusteringFinding,
  type StapleWashoutDiagnostic,
} from '../generate-signal/detection.ts'

// ── Constants ────────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000
const WEEK_DAYS = 7

/**
 * §6 default scope cascade, rung 3: the 90-day fallback (bumped from discovery's
 * 30d by the synthetic GP — "a snapshot, not the full year"). Ship 90; the exact
 * number is a real-vet-confirmable input (spec §14 S3). Inclusive calendar days.
 */
export const FALLBACK_DAYS = 90

/**
 * §5.11 de-dup window. Two events of the SAME type whose derived occurred_at points
 * fall within this delta collapse to ONE incident — a duplicate-log guard (an
 * offline-sync retry, a double-tap), NOT clinical episode-collapsing (that lives in
 * the detection engine's `symptomEpisodeGapHours` and stays there). The spec names
 * "same minute"; 60s is that, robust to a minute-boundary straddle (10:00:59 vs
 * 10:01:01 are 2s apart but different minute buckets). Meals additionally require the
 * SAME food_item_id to collapse (two different foods a few seconds apart are two real
 * feedings). Tunable; the reference dry-run (Nyx: same-minute vomit re-logs on May 15
 * / May 30 / Jun 21) is what it must catch.
 */
export const DEDUP_WINDOW_MS = 60_000

/**
 * B-213 — cap on the recent-meals intake appendix (most-recent-first). The intake flag's
 * evidence is always recent (a decline is measured over days), so the most-recent N rows
 * carry it; older rated meals beyond the cap are COUNTED and disclosed (intakeLogHiddenOlder),
 * never silently dropped (the "no silent caps" house rule). 40 rows ≈ 20 days of twice-daily
 * feeding — ample to show the baseline-then-decline the flag rests on.
 */
export const INTAKE_LOG_CAP = 40

/** ms per hour — the "hours since last full meal" unit (B-213). */
const MS_PER_HOUR = 3_600_000

/**
 * The symptom types the report's frequency section covers. Superset of the engine's
 * CORRELATION_SYMPTOM_TYPES (which drives the reused correlation line) by `lethargy`
 * — a real symptom an owner logs and a vet wants counted, but one the correlation
 * engine deliberately does not correlate. Detection reuse is scoped to
 * CORRELATION_SYMPTOM_TYPES only; the frequency aggregation covers all of these.
 */
export const REPORT_SYMPTOM_TYPES = [
  'vomit',
  'diarrhea',
  'itch',
  'scratch',
  'skin_reaction',
  'lethargy',
] as const
export type ReportSymptomType = (typeof REPORT_SYMPTOM_TYPES)[number]

/** Stool event types feeding the stool-characteristics strip (§3.7). */
const STOOL_NORMAL_TYPE = 'stool_normal'
const DIARRHEA_TYPE = 'diarrhea'

const CORRELATION_TYPE_SET = new Set<string>(CORRELATION_SYMPTOM_TYPES)
const REPORT_SYMPTOM_SET = new Set<string>(REPORT_SYMPTOM_TYPES)

/**
 * Event types where "same type, same minute" genuinely means a DUPLICATE LOG (§5.11) —
 * the observation events: an owner logs the SAME vomit/diarrhea/stool bout twice and the
 * two rows are indistinguishable, so they collapse. This is DELIBERATELY narrow: a
 * `medication` event or a `weight_check` carries a distinguishing identity (which drug,
 * which reading) that is NOT on the event row (it lives on the joined child), so collapsing
 * two of them by type-and-minute would DESTROY real data — two different drugs given
 * together (the B-156 combo) or two genuine weigh-ins are NOT duplicates. Meals are handled
 * separately (keyed by food_item_id). Every other type passes through un-clustered.
 */
const DEDUP_OBSERVATION_TYPES = new Set<string>([...REPORT_SYMPTOM_TYPES, STOOL_NORMAL_TYPE])

// ── Input row types (plain, DB-projected; the PR-5 I/O shell maps supabase → these) ──

/** Pet signalment. `neuterStatus` is NOT stored today (spec §7.1 gap) → undefined/null ⇒ "not recorded". */
export interface ReportPetInput {
  id: string
  name: string
  species: Species
  breed: string | null
  sex: 'male' | 'female' | 'unknown'
  dateOfBirth: string | null // DATE 'YYYY-MM-DD'
  neuterStatus?: 'neutered' | 'intact' | null
  /** pets.weight_kg onboarding snapshot. NOT a weigh-in — never rendered as the weight trend (spec §7.1). */
  weightKg: number | null
}

/** Meal detail (events⋈meals⋈food_items). Present only on a type==='meal' event. */
export interface ReportMealDetail {
  foodItemId: string | null
  intakeRating: IntakeRating | null
  quantity: string | null
  foodType: 'meal' | 'treat' | 'other' | null
  format: FoodFormat | null
  primaryProtein: string | null
  brand: string | null
  productName: string | null
}

/** One event row from reference query [4] (caller pre-filters deleted_at IS NULL). */
export interface ReportEventInput {
  id: string
  type: string // event_type
  occurredAt: string // ISO — the derived point (events.occurred_at)
  occurredAtConfidence: OccurredAtConfidence | null
  occurredAtEarliest: string | null // window lower edge (confidence='window')
  occurredAtLatest: string | null // window upper edge
  severity: number | null // owner-reported 1–5; NULL = unrated (never invented, never averaged)
  notes: string | null
  loggedAt: string // events.created_at — the "logged" column of appendix A (occurred-vs-logged)
  meal: ReportMealDetail | null
}

/** event_ai_analysis row (migration 013), keyed by eventId — the vomit phenotype source. */
export interface ReportAiAnalysisInput {
  eventId: string
  status: string // 'pending' | 'completed' | 'failed' | 'uncertain'
  colour: string | null // vomit_colour
  contents: string[] | null // vomit_content[]
  consistency: string | null // vomit_consistency
  bloodPresent: string | null // vomit_blood: 'none_visible'|'fresh_red'|'coffee_ground'|'unsure'
  bilePresent: string | null // vomit_tristate
  foreignMaterialPresent: string | null // vomit_tristate
  foreignMaterialNote: string | null
  editedAt: string | null // owner-edited ⇒ "owner-reviewed"; else raw AI ("owner-reviewable")
}

/** weight_checks row (migration 024) joined to its parent event's occurred_at. */
export interface ReportWeightCheckInput {
  eventId: string
  weightKg: number
  occurredAt: string // ISO, from the parent event
}

/** medication_administrations row (migration 020/023) joined to its parent event. */
export interface ReportDoseInput {
  eventId: string
  occurredAt: string // parent event occurred_at
  medicationId: string | null // the regimen (medications.id); NULL = ad-hoc dose
  medicationItemId: string | null
  adherence: string | null // dose_adherence: 'given'|'partial'|'missed'|'refused'|null(unconfirmed)
  doseAmount: string | null
  pairedEventId: string | null // B-156 combo: the meal/treat this dose rode inside
}

/** medications regimen row (migration 020). `isPrescription`/`strength` come from the joined item. */
export interface ReportMedicationInput {
  id: string
  medicationItemId: string | null
  drugName: string
  doseAmount: string | null
  route: string | null
  dosesPerDay: number | null // NULL = PRN/as-needed
  scheduleNotes: string | null
  indication: string | null
  prescribedBy: string | null
  startedAt: string // DATE 'YYYY-MM-DD'
  targetDurationDays: number | null
  status: string // 'active'|'completed'|'stopped'
  endedAt: string | null // DATE
  isPrescription?: boolean | null // false ⇒ treated as a supplement (concurrent intervention)
  strength?: string | null
}

/** diet_trials row (schema migration 001) + optional joined food label/protein. */
export interface ReportDietTrialInput {
  id: string
  foodItemId: string | null
  startedAt: string // DATE
  targetDurationDays: number
  status: string // 'active'|'completed'|'abandoned'
  completedAt: string | null
  vetName: string | null
  foodLabel?: string | null
  primaryProtein?: string | null
}

/** vet_visits row (schema migration 001) — feeds the scope cascade rung 1. */
export interface ReportVetVisitInput {
  visitedAt: string // DATE
  clinicName: string | null
  vetName: string | null
  reason: string | null
}

/** feeding_arrangements row (migration 018) + joined food label/protein — B-040. */
export interface ReportFeedingArrangementInput {
  id: string
  foodItemId: string
  method: string // 'free_choice'|'meal_fed'
  activeFrom: string | null // DATE
  activeUntil: string | null // DATE; NULL = still active (bowl still down)
  isShared: boolean
  primaryProtein: string | null
  foodLabel: string | null
}

/** conditions row (schema migration 001) — WSAVA appendix context. */
export interface ReportConditionInput {
  conditionName: string
  status: string // 'active'|'monitoring'|'resolved'
  diagnosedAt: string | null // DATE
}

/**
 * The full pure-assembly input. The caller pulls a GENEROUS lookback (≥ the
 * report window; the live Signal pulls 180d) so the detection reuse has enough
 * history for its natural sub-windows; report.ts scopes everything to the resolved
 * window itself. `requestedWindow` present ⇒ owner override (custom scope + the
 * cherry-pick guard, §6); absent ⇒ the default cascade.
 */
export interface ReportInput {
  now: string // ISO — injected reference "now" (determinism; no Date.now() in this module)
  timezone: string | null // owner IANA tz (user_profiles.timezone) — day-boundary + local-week math
  pet: ReportPetInput
  ownerName: string | null // profile/auth display name — PIMS filing (spec §7.1); NULL ⇒ "not recorded"
  requestedWindow?: { startDate: string; endDate: string } | null // owner override (DATE strings)
  events: ReportEventInput[]
  aiAnalyses: ReportAiAnalysisInput[]
  weightChecks: ReportWeightCheckInput[]
  doses: ReportDoseInput[]
  medications: ReportMedicationInput[]
  dietTrials: ReportDietTrialInput[]
  vetVisits: ReportVetVisitInput[]
  feedingArrangements: ReportFeedingArrangementInput[]
  conditions: ReportConditionInput[]
}

// ── Date / window helpers (tz-aware calendar-day math) ───────────────────────
// Timestamps are stored UTC (hard constraint); day boundaries and week buckets
// are the OWNER's local calendar days (schema note: "convert at the app layer").
// tz absent/invalid ⇒ fall back to UTC day-keys so the report STILL RENDERS (a
// missing tz never blanks a clinical count — unlike detector ⑥, which goes silent).

/** Milliseconds since epoch, or null when the ISO is unparseable. */
function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : ms
}

/** Local calendar day 'YYYY-MM-DD' for an instant, in the owner's tz (UTC fallback). */
function localDayKey(iso: string, tz: string | null): string | null {
  const ms = parseMs(iso)
  if (ms === null) return null
  if (tz) {
    try {
      // en-CA renders as YYYY-MM-DD; timeZone converts the UTC instant to the local day.
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(ms))
    } catch {
      // Invalid IANA zone — fall through to UTC.
    }
  }
  return new Date(ms).toISOString().slice(0, 10)
}

/** A calendar-day key ('YYYY-MM-DD', already a local day OR a DATE column) → an integer day index. */
function dayNumber(dayKey: string): number | null {
  const ms = Date.parse(`${dayKey}T00:00:00Z`)
  return Number.isNaN(ms) ? null : Math.round(ms / MS_PER_DAY)
}

/** Inverse of dayNumber — an integer day index → 'YYYY-MM-DD'. */
function dayKeyFromNumber(n: number): string {
  return new Date(n * MS_PER_DAY).toISOString().slice(0, 10)
}

/** The local-day index of an event instant (null when unparseable). */
function eventDayNumber(iso: string, tz: string | null): number | null {
  const key = localDayKey(iso, tz)
  return key === null ? null : dayNumber(key)
}

// ── §6 scope cascade ─────────────────────────────────────────────────────────

export type ScopeBasis = 'since_visit' | 'diet_trial' | 'fallback_90d' | 'custom'

export interface ReportScope {
  basis: ScopeBasis
  /** Inclusive local calendar-day bounds of the window. */
  startDate: string
  endDate: string
  startDayNum: number
  endDayNum: number
  /** Inclusive calendar-day count of the window (the "N of D days" denominator). */
  windowDays: number
  /** The instant handed to the detection engine as `now` (window end, ≤ input.now). */
  detectionNowIso: string
  /** Rung-1 anchor: the most-recent vet visit before today, when basis==='since_visit'. */
  lastVisitDate: string | null
  /** Rung-2 anchor: the active diet trial's start, when basis==='diet_trial'. */
  trialStartDate: string | null
  /** True when basis==='custom' — triggers the §6 cherry-pick disclosure. */
  isCustomOverride: boolean
}

/**
 * Resolve the report window (spec §6). Default cascade:
 *   (1) since the most-recent vet visit strictly before today  → basis 'since_visit'
 *   (2) else the most-recent active diet trial's start          → basis 'diet_trial'
 *   (3) else a 90-day fallback                                   → basis 'fallback_90d'
 * A `requestedWindow` overrides all three → basis 'custom' (the cherry-pick guard fires).
 * All bounds are inclusive local calendar days; detectionNow is the window end instant.
 */
export function resolveScope(input: ReportInput): ReportScope {
  const tz = input.timezone
  const nowMs = parseMs(input.now) ?? 0
  const todayKey = localDayKey(input.now, tz) ?? new Date(nowMs).toISOString().slice(0, 10)
  const todayNum = dayNumber(todayKey) ?? Math.round(nowMs / MS_PER_DAY)

  // Owner override — a hand-picked window. Clamp the end to today (a report never
  // covers the future) and take the window verbatim; the cherry-pick disclosure is
  // computed by the caller against the full symptom set.
  if (input.requestedWindow) {
    const reqStart = input.requestedWindow.startDate
    const reqEndNum = Math.min(dayNumber(input.requestedWindow.endDate) ?? todayNum, todayNum)
    const startNum = dayNumber(reqStart) ?? todayNum
    const endNum = Math.max(startNum, reqEndNum)
    return {
      basis: 'custom',
      startDate: dayKeyFromNumber(startNum),
      endDate: dayKeyFromNumber(endNum),
      startDayNum: startNum,
      endDayNum: endNum,
      windowDays: endNum - startNum + 1,
      detectionNowIso: detectionNowFor(endNum, todayNum, input.now),
      lastVisitDate: null,
      trialStartDate: null,
      isCustomOverride: true,
    }
  }

  // Rung 1 — since the most-recent vet visit strictly before today.
  let lastVisit: string | null = null
  for (const v of input.vetVisits) {
    const vNum = dayNumber(v.visitedAt)
    if (vNum === null || vNum >= todayNum) continue // ignore today/future-dated visits
    if (lastVisit === null || vNum > (dayNumber(lastVisit) ?? -Infinity)) lastVisit = v.visitedAt
  }
  if (lastVisit !== null) {
    const startNum = dayNumber(lastVisit) as number
    return scopeFromRange('since_visit', startNum, todayNum, input.now, {
      lastVisitDate: lastVisit,
      trialStartDate: null,
    })
  }

  // Rung 2 — the most-recent ACTIVE diet trial's start.
  let trialStart: string | null = null
  for (const t of input.dietTrials) {
    if (t.status !== 'active') continue
    const tNum = dayNumber(t.startedAt)
    if (tNum === null) continue
    if (trialStart === null || tNum > (dayNumber(trialStart) ?? -Infinity)) trialStart = t.startedAt
  }
  if (trialStart !== null) {
    const startNum = Math.min(dayNumber(trialStart) as number, todayNum)
    return scopeFromRange('diet_trial', startNum, todayNum, input.now, {
      lastVisitDate: null,
      trialStartDate: trialStart,
    })
  }

  // Rung 3 — the 90-day fallback (inclusive calendar days).
  const startNum = todayNum - (FALLBACK_DAYS - 1)
  return scopeFromRange('fallback_90d', startNum, todayNum, input.now, {
    lastVisitDate: null,
    trialStartDate: null,
  })
}

function scopeFromRange(
  basis: ScopeBasis,
  startNum: number,
  endNum: number,
  nowIso: string,
  anchors: { lastVisitDate: string | null; trialStartDate: string | null },
): ReportScope {
  const s = Math.min(startNum, endNum)
  return {
    basis,
    startDate: dayKeyFromNumber(s),
    endDate: dayKeyFromNumber(endNum),
    startDayNum: s,
    endDayNum: endNum,
    windowDays: endNum - s + 1,
    detectionNowIso: nowIso,
    lastVisitDate: anchors.lastVisitDate,
    trialStartDate: anchors.trialStartDate,
    isCustomOverride: false,
  }
}

/**
 * The instant handed to detection as `now`. For the default cascade the window
 * ends today, so it is input.now (the live reference). For a custom window ending
 * in the PAST, it is the end of that last day (UTC end-of-day) so the report reads
 * "as of the window end" — chronicity's "still ongoing" recency floor and its
 * lookback are then measured from the window end, not real-now.
 */
function detectionNowFor(endNum: number, todayNum: number, nowIso: string): string {
  if (endNum >= todayNum) return nowIso
  return `${dayKeyFromNumber(endNum)}T23:59:59.999Z`
}

// ── §5.11 de-duplication ─────────────────────────────────────────────────────

/**
 * Collapse near-simultaneous duplicate logs of the same event type to ONE incident
 * (spec §5.11). Deterministic: events are grouped (§DEDUP_OBSERVATION_TYPES by type,
 * meals by food_item_id, everything else never clusters) then swept in occurred_at
 * order; an event within DEDUP_WINDOW_MS **of the cluster's FIRST member** joins it —
 * anchoring to the first (not the running previous) bounds a cluster's total span to
 * one DEDUP_WINDOW_MS, so a slow chain of sub-window gaps can never collapse an
 * arbitrarily long run of distinct incidents (adversarial finding 3).
 *
 * The REPRESENTATIVE (which anchors the incident's id + timing) is chosen WINDOW-FIRST:
 * an in-window member is preferred over an out-of-window one, so a duplicate that
 * straddles the window boundary at local midnight can NEVER pull a genuine in-window
 * bout out of the window (adversarial finding 1). Then completed-AI, then earliest,
 * then id — a total, input-order-independent order. The clinical read is NOT tied to
 * the representative: the survivor carries `memberEventIds` (every raw member of the
 * collapsed bout), and assembleReport reads the phenotype across ALL of them — the
 * four-state/assessed aggregate from the best-status member, and present blood/foreign
 * escalating on a flag in ANY member (§5.9 escalate-on-presence), so a photographed
 * flag on a dropped duplicate is never lost regardless of which member represents.
 *
 * Owner-entered severity/notes on a dropped duplicate are merged onto the survivor
 * (severity = MAX across the cluster — never understate; note = first non-null), so
 * the collapse loses no clinically-relevant owner input.
 *
 * Returns the surviving events (each tagged with dupCount + memberEventIds) AND the
 * set of dropped event ids (so every downstream join — AI analyses, doses, weight —
 * excludes the collapsed duplicates too).
 */
export interface DedupResult {
  events: Array<ReportEventInput & { dupCount: number; memberEventIds: string[] }>
  droppedEventIds: Set<string>
}

export function dedupeEvents(
  events: ReportEventInput[],
  completedAnalysisEventIds: Set<string>,
  // Window predicate — makes the representative window-aware (default: everything
  // in-window, so the pure-dedup unit tests behave identically). See finding 1.
  isInWindow: (e: ReportEventInput) => boolean = () => true,
): DedupResult {
  // Group key. Meals cluster by food_item_id (two DIFFERENT foods seconds apart are two
  // real feedings). Observation events (vomit/diarrhea/stool/…) cluster by type (a bout
  // logged twice). EVERYTHING ELSE (medication, weight_check, other) gets a UNIQUE key so
  // it never clusters — its distinguishing identity is on the joined child, not the event
  // row, so a type-and-minute collapse would silently drop a real dose/reading (the B-156
  // "two drugs together" data-loss bug this narrow scope closes).
  const groupKey = (e: ReportEventInput): string => {
    if (e.type === 'meal') return `meal|${e.meal?.foodItemId ?? 'null'}`
    if (DEDUP_OBSERVATION_TYPES.has(e.type)) return e.type
    return `keep|${e.id}`
  }

  // A stable, total order for picking the representative: in-window first (never let a
  // duplicate pull the incident out of the window), then completed-AI, then earliest, then id.
  const rank = (e: ReportEventInput): [number, number, number, string] => [
    isInWindow(e) ? 0 : 1,
    completedAnalysisEventIds.has(e.id) ? 0 : 1,
    parseMs(e.occurredAt) ?? Number.POSITIVE_INFINITY,
    e.id,
  ]
  const rankLess = (a: ReportEventInput, b: ReportEventInput): boolean => {
    const ra = rank(a)
    const rb = rank(b)
    for (let i = 0; i < 4; i++) {
      if (ra[i] !== rb[i]) return ra[i] < rb[i]
    }
    return false
  }

  const byGroup = new Map<string, ReportEventInput[]>()
  for (const e of events) {
    const k = groupKey(e)
    const arr = byGroup.get(k)
    if (arr) arr.push(e)
    else byGroup.set(k, [e])
  }

  const survivors: Array<ReportEventInput & { dupCount: number; memberEventIds: string[] }> = []
  const droppedEventIds = new Set<string>()

  for (const arr of byGroup.values()) {
    // Sweep in occurred_at order so "near-simultaneous" is a local comparison.
    const sorted = [...arr].sort((a, b) => {
      const am = parseMs(a.occurredAt) ?? Number.POSITIVE_INFINITY
      const bm = parseMs(b.occurredAt) ?? Number.POSITIVE_INFINITY
      if (am !== bm) return am - bm
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })
    let cluster: ReportEventInput[] = []
    const flush = () => {
      if (cluster.length === 0) return
      let rep = cluster[0]
      for (const e of cluster) if (rankLess(e, rep)) rep = e
      for (const e of cluster) if (e.id !== rep.id) droppedEventIds.add(e.id)
      // Merge owner-entered severity/notes so the collapse loses no clinical input.
      let severity = rep.severity
      for (const e of cluster) {
        if (e.severity != null && (severity == null || e.severity > severity)) severity = e.severity
      }
      const note = rep.notes ?? cluster.find((e) => e.notes != null)?.notes ?? null
      // Every raw member id (sorted, deterministic). assembleReport reads the phenotype
      // across ALL of them — best-status member for the four-state/assessed aggregate, and
      // present blood/foreign unioned over any member (§5.9 escalate-on-presence).
      const memberEventIds = cluster.map((e) => e.id).sort()
      survivors.push({ ...rep, severity, notes: note, dupCount: cluster.length, memberEventIds })
      cluster = []
    }
    let clusterAnchorMs: number | null = null
    for (const e of sorted) {
      const ms = parseMs(e.occurredAt)
      if (cluster.length === 0) {
        cluster = [e]
        clusterAnchorMs = ms
        continue
      }
      // Join iff within DEDUP_WINDOW_MS of the cluster's FIRST member (the anchor stays
      // fixed for the cluster's life), bounding total span to one window. An unparseable
      // time never absorbs into a cluster (it can't be "near" anything).
      if (ms !== null && clusterAnchorMs !== null && ms - clusterAnchorMs <= DEDUP_WINDOW_MS) {
        cluster.push(e)
      } else {
        flush()
        cluster = [e]
        clusterAnchorMs = ms
      }
    }
    flush()
  }

  // Restore chronological order for the appendix log + weekly bucketing.
  survivors.sort((a, b) => {
    const am = parseMs(a.occurredAt) ?? Number.POSITIVE_INFINITY
    const bm = parseMs(b.occurredAt) ?? Number.POSITIVE_INFINITY
    if (am !== bm) return am - bm
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
  return { events: survivors, droppedEventIds }
}

// ── Output snapshot types ─────────────────────────────────────────────────────

export interface Signalment {
  name: string
  species: Species
  breed: string | null
  sex: 'male' | 'female' | 'unknown'
  /** NOT stored today (spec §7.1) → 'not_recorded', rendered honestly, never guessed. */
  neuterStatus: 'neutered' | 'intact' | 'not_recorded'
  ageYears: number | null
  ageMonths: number | null
  dateOfBirth: string | null
  /** Owner/client name for PIMS filing (spec §7.1). Null ⇒ render "not recorded". */
  ownerName: string | null
  /** Latest weigh-in overall (weight_checks), NEVER the pets.weight_kg onboarding snapshot (spec §7.1). */
  latestWeight: { kg: number; lbs: number; date: string } | null
}

export interface ScopeInfo extends ReportScope {
  /**
   * §6 cherry-pick guard: on a CUSTOM window only, the count of this pet's in-record
   * symptom incidents that fall OUTSIDE the chosen window (so a vet can see the owner
   * did not crop to a good week). 0 on the principled default cascade (guard not shown).
   */
  outOfWindowSymptomCount: number
  outOfWindowMostRecent: string | null
}

export type ClinicalQuestionType = 'diet_trial_working' | 'symptom_monitoring'

export interface ClinicalQuestion {
  question: ClinicalQuestionType
  primarySymptom: ReportSymptomType | null
}

export type SafetyFlag =
  | {
      kind: 'present_blood'
      /** PRESENT-only (§5.9): the incidents where blood was actually seen; never a "0 of N". */
      incidents: Array<{ eventId: string; occurredAt: string; kind: 'fresh_red' | 'coffee_ground' }>
    }
  | {
      kind: 'present_foreign'
      incidents: Array<{ eventId: string; occurredAt: string; note: string | null }>
    }
  | {
      kind: 'intake_decline'
      trigger: IntakeDeclineFinding['trigger']
      species: Species
      baselineScore: number
      recentScore: number
      daysBelowBaseline: number
      refusedFoodLabel: string | null
      ratedMealsConsidered: number
      /** B-213 — occurred_at of the most recent fully-eaten meal, or null when none in the window. */
      lastFullMealIso: string | null
      /**
       * B-213 — whole hours from the report's `now` (the window end, = scope.detectionNowIso, the
       * SAME instant the detector used) to the last full meal; null when there is no full meal. The
       * "how long off food?" number that sets urgency inside the feline hepatic-lipidosis window.
       * Computed here (not in the finding) so the finding stays a raw fact and the report owns the
       * window-relative arithmetic. Never negative (clamped).
       */
      hoursSinceLastFullMeal: number | null
    }
  | {
      kind: 'chronicity'
      symptomType: SymptomType
      episodeCount: number
      spanDays: number
      activeWeeks: number
      symptomDays: number
      daysSinceLastEpisode: number
      firstOnsetIso: string
      tier: SymptomChronicityFinding['tier']
      windowDays: number
    }
  | {
      kind: 'symptom_worsening'
      symptomType: SymptomType
      currentCount: number
      priorCount: number
      currentDays: number
      priorDays: number
      trigger: SymptomWorseningFinding['trigger']
      tier: SymptomWorseningFinding['tier']
      windowDays: number
    }

export interface SymptomAggregate {
  type: ReportSymptomType
  /** Deduped incidents of this type in the window (§5.11). */
  count: number
  /** Distinct local-days carrying an incident of this type (density). */
  symptomDays: number
  /** §5.1 denominators, on every aggregate. */
  windowDays: number
  loggedDays: number
  firstOnset: string | null
  lastOnset: string | null
  /** Bar heights: incident count per 7-day bucket from the window start (§3.5). */
  weeklyBuckets: number[]
  /** The local start date of each bucket (the date anchors under the chart). */
  bucketStartDates: string[]
}

export type VomitContentCategory = 'food' | 'bile' | 'hairball' | 'foam_liquid' | 'grass' | 'unsure'

export interface VomitPhenotype {
  totalIncidents: number
  withAnalysis: number
  /** The four AI-pipeline states, kept DISTINCT (§5.10). Sum === withAnalysis. */
  states: { completed: number; uncertain: number; failed: number; pending: number }
  /** The assessed denominator = states.completed (a legible AI read). */
  assessedCount: number
  /** Primary contents category per assessed incident; the counts sum to assessedCount. */
  contentsMix: Record<VomitContentCategory, number>
  consistencyDistribution: Record<string, number>
  /** PRESENT-only (§5.9) — arrays of the incidents where it was actually seen. Empty ⇒ render a de-weighted limitation note, NEVER "0 of N". */
  bloodPresent: Array<{ eventId: string; occurredAt: string; kind: 'fresh_red' | 'coffee_ground' }>
  foreignPresent: Array<{ eventId: string; occurredAt: string; note: string | null }>
  /** Assessed analyses the owner has edited (owner-reviewed); the rest are raw AI ("owner-reviewable", §5.10). */
  reviewedCount: number
}

export interface StoolCharacteristics {
  total: number
  normalCount: number
  looseCount: number
  windowDays: number
  loggedDays: number
}

export interface WeightTrendView {
  readingCount: number
  seriesLbs: number[]
  seriesKg: number[]
  latestLbs: number | null
  latestKg: number | null
  earliestDate: string | null
  latestDate: string | null
  deltaLbs: number | null
  deltaKg: number | null
  /** Descriptive direction only — NEVER a verdict/colour/reassurance (guardrail travels from migration 024). */
  direction: 'up' | 'down' | 'flat' | null
}

export interface WeightSection {
  /** No weigh-ins anywhere ⇒ a designed logging-nudge empty state (spec §7.1), never a fabricated value. */
  isEmpty: boolean
  latest: { kg: number; lbs: number; date: string } | null
  /** Trajectory over IN-WINDOW readings; null when the window has none. */
  trend: WeightTrendView | null
}

export interface DietSummary {
  activeTrial: {
    foodLabel: string | null
    primaryProtein: string | null
    startedAt: string
    targetDurationDays: number
    daysElapsed: number
    vetName: string | null
  } | null
  /** Active free_choice arrangements → "Intake not directly observed" (B-040, verbatim in render). */
  freeFed: Array<{ foodLabel: string | null; primaryProtein: string | null; activeFrom: string | null; activeUntil: string | null }>
  intakeNotDirectlyObserved: boolean
  /** MEALS-ONLY completion (treats + free-fed excluded, B-040). Null when no rated meals. */
  mealCompletion: { ratedMeals: number; finishedMeals: number; rate: number } | null
  treats: { count: number; distinctItems: number }
  /** The #1 diet-trial confounder, on its own line (B-102). */
  humanFood: { count: number; days: number; items: Array<{ date: string; label: string | null }> }
}

export interface MedicationAdherence {
  regimenId: string
  drugName: string
  strength: string | null
  doseAmount: string | null
  route: string | null
  dosesPerDay: number | null
  scheduleNotes: string | null
  indication: string | null
  startedAt: string
  endedAt: string | null
  status: string
  isSupplement: boolean
  overlapsWindow: boolean
  /** 'not_tracked' when ZERO dose events fell in the window — NEVER read as "compliant" (spec §4 trap). */
  adherenceState: 'tracked' | 'not_tracked'
  elapsedDaysInWindow: number
  daysWithDose: number
  expectedDoses: number | null
  givenDoses: number
  partialDoses: number
  missedDoses: number
  refusedDoses: number
  /** Unconfirmed ≠ missed ≠ refused (adherence null) — kept distinct (spec §4). */
  unconfirmedDoses: number
}

export interface EstablishedCorrelation {
  symptomType: SymptomType
  protein: string
  matchedPairs: number
  caseExposed: number
  controlExposed: number
  riskDifference: number
  pValue: number
  symptomEventCount: number
  correlationWindowHours: number
}

export interface TimingFinding {
  kind: 'postprandial_timing' | 'timeofday_clustering'
  symptomType: SymptomType
  windowDays: number
  /** postprandial: rapid/eligible/total + median minutes; timeofday: cluster band + counts. */
  detail:
    | { rapidCount: number; eligibleCount: number; totalEpisodes: number; rapidWindowMinutes: number; medianMinutesSinceFeeding: number }
    | { clusterStartLocalHour: number; clusterWindowHours: number; clusterCount: number; eligibleCount: number; totalEpisodes: number; timezone: string }
}

export interface CorrelationSummary {
  /** ONLY `Established`-tier (spec §8.5); `Early` never reaches the report. */
  established: EstablishedCorrelation[]
  hasEstablished: boolean
  /** Honest "no established threshold over this window" state when established is empty. */
  noThreshold: boolean
  /** The dominant staple that washes out (from the reused staple-washout diagnostic) — for the honest "X is in most of what the pet eats". */
  stapleProtein: string | null
  /** The §3.8 "associational timing finding" (descriptive lanes ⑤/⑥). */
  timing: TimingFinding[]
}

export type InterventionKind = 'diet_trial' | 'medication' | 'supplement' | 'free_fed'

export interface ConcurrentChange {
  kind: InterventionKind
  label: string
  /** The intervention's start date; NULL when a standing arrangement's start was never recorded (a free-fed bowl "always down") — rendered "ongoing (start not recorded)". */
  startDate: string | null
  /** The 7-day bucket index where this intervention started (the dashed marker, §3.5); null if it started outside the window (a standing confounder gets no marker). */
  bucketIndex: number | null
  /**
   * True when the intervention STARTED before the window but is active within it — a
   * STANDING confounder (e.g. a steroid begun before the report range, running throughout).
   * It carries no chart marker (there is no start point in-window) but MUST still be named in
   * the "Reading the trend" note; otherwise a drug that suppresses the very signs the trial
   * measures is invisible and the diet silently takes its credit — spec §4/B-117, the
   * single highest-consequence misread. false ⇒ the intervention started inside the window.
   */
  ongoing: boolean
  /**
   * The end date IF the intervention STOPPED strictly before the window end (a trial completed
   * mid-window, a course that ended). NULL ⇒ still active at the window end. Without it a
   * pre-window drug that stopped mid-window rendered a false present-tense "ongoing since …"
   * (adversarial finding) — the note must say "until <date>" instead.
   */
  endInWindow: string | null
}

export interface SymptomLogPhenotype {
  status: string
  contentsCategory: VomitContentCategory | null
  consistency: string | null
  colour: string | null
  bloodPresent: 'fresh_red' | 'coffee_ground' | null // PRESENT-only; null when not present or not assessed
  /** PRESENT-only: true when foreign material was seen; null on absence/uncertainty (never a positive "no", §5.9). */
  foreignPresent: boolean | null
  foreignNote: string | null
  /** edited_at present ⇒ owner-reviewed; else raw AI (owner-reviewable). */
  edited: boolean
}

export interface SymptomLogEntry {
  eventId: string
  type: string
  occurredAt: string
  occurredAtConfidence: OccurredAtConfidence | null
  occurredAtEarliest: string | null
  occurredAtLatest: string | null
  loggedAt: string
  /** Owner-reported 1–5; NULL renders BLANK — never invented, never averaged (§5.5). */
  severity: number | null
  notes: string | null
  /** How many raw logs collapsed into this incident (§5.11 transparency; 1 = no duplicate). */
  dupCount: number
  phenotype: SymptomLogPhenotype | null
}

export interface ConfounderExposure {
  eventId: string
  occurredAt: string
  dayKey: string | null
  foodLabel: string | null
  primaryProtein: string | null
  format: FoodFormat | null
  foodType: 'meal' | 'treat' | 'other' | null
  note: string | null
}

/**
 * B-213 — one rated meal, for the recent-meals intake appendix. Populated ONLY when an
 * intake-decline flag is present (the traceability the cold-read asked for: the page-1
 * intake figures — "declined N of last M", the last full meal — must trace to real meal
 * rows). Raw ratings only; no derived "below baseline" verdict (two co-firing findings can
 * carry different baselines, and the vet reads the decline directly from the ratings).
 */
export interface IntakeLogEntry {
  eventId: string
  occurredAt: string
  foodLabel: string | null
  intakeRating: IntakeRating
  /**
   * True for the page-1 anchor — the most recent fully-eaten meal (the same meal detection.ts
   * anchors `lastFullMealIso` on). Render tags this row "last full meal" so the page-1 "how long
   * off food" number always points at a VISIBLE row (adversarial finding: the anchor can predate
   * the 40 most-recent meals in a chronic-inappetence case).
   */
  isLastFullMeal: boolean
  /**
   * True when this row is the anchor PINNED back in past the most-recent cap (it is older than
   * every other shown row, with omitted meals between). Render draws an "earlier meals omitted"
   * break before it so it never reads as contiguous with the recent rows.
   */
  pinned: boolean
}

export interface Provenance {
  ownerReported: true
  totalSymptomIncidents: number
  /** Count of in-window symptom incidents whose time is estimated/windowed (B-010) — a limitation disclosed on the report. */
  estimatedOrWindowCount: number
  deletedExcluded: true
  /** Appendix A — every in-window symptom incident, occurred-vs-logged, with per-event phenotype. */
  symptomLog: SymptomLogEntry[]
  /**
   * B-213 — recent rated meals for the intake appendix, most-recent-first. EMPTY unless an
   * intake-decline flag fired (so calm reports carry no meal dump). Capped; older rated meals
   * beyond the cap are counted in intakeLogHiddenOlder, never silently dropped.
   */
  intakeLog: IntakeLogEntry[]
  /** Count of in-window rated meals older than the intakeLog cap (disclosed, never a silent truncation). */
  intakeLogHiddenOlder: number
  /** Appendix B — off-diet exposures (treats + human food). */
  confounders: ConfounderExposure[]
  /** Protein tally over non-meal feedings (the poultry-antigen reconciliation, appendix B). */
  proteinExposureTally: Record<string, number>
  /** Appendix C context — active/monitored conditions. */
  conditions: Array<{ name: string; status: string; diagnosedAt: string | null }>
}

export interface AtAGlance {
  primarySymptom: { type: ReportSymptomType; count: number } | null
  totalSymptomIncidents: number
  windowDays: number
  loggedDays: number
  trialDaysLogged: number | null
  weightState: 'trend' | 'single' | 'empty'
}

export interface ReportSnapshot {
  generatedAt: string
  timezone: string | null
  scope: ScopeInfo
  signalment: Signalment
  clinicalQuestion: ClinicalQuestion
  /** §5.3: EMPTY when no flag is present — never a fabricated "all clear". Ordered: present blood/foreign lead, then engine safety order. */
  safetyFlags: SafetyFlag[]
  weight: WeightSection
  atAGlance: AtAGlance
  symptoms: SymptomAggregate[]
  vomitPhenotype: VomitPhenotype | null
  stool: StoolCharacteristics | null
  diet: DietSummary
  medications: MedicationAdherence[]
  correlation: CorrelationSummary
  concurrentChanges: ConcurrentChange[]
  provenance: Provenance
}

// ── Small pure helpers ────────────────────────────────────────────────────────

const LBS_PER_KG = 2.20462
/** kg → lbs, rounded to 0.1 lb — the SAME rule as lib/weight.ts so the report and the app agree. */
function kgToLbsNum(kg: number): number {
  return Math.round(kg * LBS_PER_KG * 10) / 10
}

/** "Brand Product" for a food, or null when neither is set — one home for the label rule. */
function mealFoodLabel(meal: { brand: string | null; productName: string | null }): string | null {
  return meal.brand || meal.productName ? `${meal.brand ?? ''} ${meal.productName ?? ''}`.trim() : null
}

function computeAge(dob: string | null, nowMs: number): { years: number | null; months: number | null } {
  if (!dob) return { years: null, months: null }
  const dobMs = Date.parse(`${dob}T00:00:00Z`)
  if (Number.isNaN(dobMs) || dobMs > nowMs) return { years: null, months: null }
  const d0 = new Date(dobMs)
  const d1 = new Date(nowMs)
  let months = (d1.getUTCFullYear() - d0.getUTCFullYear()) * 12 + (d1.getUTCMonth() - d0.getUTCMonth())
  if (d1.getUTCDate() < d0.getUTCDate()) months -= 1
  if (months < 0) months = 0
  return { years: Math.floor(months / 12), months: months % 12 }
}

/** Map a raw event_ai_analysis into its single PRIMARY vomit-contents category (mutually exclusive). */
function classifyVomitContents(a: ReportAiAnalysisInput): VomitContentCategory {
  const contents = new Set(a.contents ?? [])
  // Hairball is the most distinctive marker → highest priority.
  if (contents.has('hair')) return 'hairball'
  const hasFood = contents.has('undigested_food') || contents.has('partially_digested_food')
  if (hasFood) return 'food'
  // Bilious = bile present and NO food (empty-stomach bilious vomiting).
  if (contents.has('bile') || a.bilePresent === 'yes') return 'bile'
  if (contents.has('foam') || contents.has('liquid_only')) return 'foam_liquid'
  if (contents.has('grass_or_plant')) return 'grass'
  return 'unsure'
}

/** Status informativeness for picking a collapsed incident's representative analysis (completed = most informative). */
const AI_STATUS_PRIORITY: Record<string, number> = { completed: 0, uncertain: 1, failed: 2, pending: 3 }

/**
 * The single analysis that represents a (possibly de-duplicated) incident's four-state /
 * assessed aggregate — the best-status member (completed > uncertain > failed > pending),
 * earliest-id on ties, or null when no member was analysed. Reading across ALL member ids
 * (not just the representative log) means a photographed bout keeps its read even when the
 * representative is an empty duplicate log.
 */
function pickIncidentAnalysis(
  memberEventIds: string[],
  analysisByEvent: Map<string, ReportAiAnalysisInput>,
): ReportAiAnalysisInput | null {
  let best: ReportAiAnalysisInput | null = null
  let bestPri = Number.POSITIVE_INFINITY
  for (const id of memberEventIds) {
    const a = analysisByEvent.get(id)
    if (!a) continue
    const pri = AI_STATUS_PRIORITY[a.status] ?? 4
    if (pri < bestPri || (pri === bestPri && best !== null && a.eventId < best.eventId)) {
      bestPri = pri
      best = a
    }
  }
  return best
}

/**
 * Union present blood / foreign across ALL members of a collapsed incident (§5.9
 * escalate-on-presence). ANY member's flag counts, REGARDLESS of that member's status —
 * a `fresh_red` on a `failed` read still escalates; only 'yes'/present values are folded,
 * never `unsure`/`none_visible`/`no`, so absence is never manufactured. This is why a bout
 * logged twice cannot hide a blood/foreign flag behind whichever duplicate got dropped.
 */
function unionPresentFlags(
  memberEventIds: string[],
  analysisByEvent: Map<string, ReportAiAnalysisInput>,
): { bloodKind: 'fresh_red' | 'coffee_ground' | null; foreignPresent: boolean; foreignNote: string | null } {
  let bloodKind: 'fresh_red' | 'coffee_ground' | null = null
  let foreignPresent = false
  let foreignNote: string | null = null
  for (const id of memberEventIds) {
    const a = analysisByEvent.get(id)
    if (!a) continue
    // fresh_red (acute) outranks coffee_ground (digested) when both appear across duplicates.
    if (a.bloodPresent === 'fresh_red') bloodKind = 'fresh_red'
    else if (a.bloodPresent === 'coffee_ground' && bloodKind !== 'fresh_red') bloodKind = 'coffee_ground'
    if (a.foreignMaterialPresent === 'yes') {
      foreignPresent = true
      if (foreignNote == null) foreignNote = a.foreignMaterialNote
    }
  }
  return { bloodKind, foreignPresent, foreignNote }
}

// ── Detection reuse (spec §7 / §8.5) ─────────────────────────────────────────
// Build a DetectionInput from the WINDOWED rows and run the shared engine, so the
// report's correlation line and safety flags come from the ONE statistical source
// (detection.ts) and can never contradict the rolling Signal. WINDOWING CONTRACT
// (Data Scientist sign-off, spec §7): the engine sees exactly the symptom/meal
// events whose local day falls in [scope.start, scope.end], with now = the window
// end. Correlations therefore span exactly the report window; the safety detectors'
// own natural sub-windows (chronicity's 56d lookback, worsening's week-over-week)
// are measured backward FROM the window end and intersected with it — for the
// primary cases (90-day fallback ⊃ 56d chronicity window; a 21–84d diet trial) this
// reproduces the live Signal's firing exactly. A short custom window can legitimately
// under-fire a safety detector; that is honest to the chosen scope, not a bug.

export interface DetectionExtract {
  established: EstablishedCorrelation[]
  timing: TimingFinding[]
  intakeDecline: IntakeDeclineFinding | null
  chronicity: SymptomChronicityFinding | null
  worsening: SymptomWorseningFinding[]
  stapleProtein: string | null
}

function buildDetectionInput(
  input: ReportInput,
  scope: ReportScope,
  windowEvents: Array<ReportEventInput & { dupCount: number }>,
  droppedEventIds: Set<string>,
): DetectionInput {
  const tz = input.timezone

  const symptomEvents: SymptomEvent[] = windowEvents
    .filter((e) => CORRELATION_TYPE_SET.has(e.type))
    .map((e) => ({
      id: e.id,
      type: e.type as SymptomType,
      occurredAt: e.occurredAt,
      severity: e.severity,
      occurredAtConfidence: e.occurredAtConfidence,
    }))

  // Which in-window meals are drug VEHICLES (a dose rode inside), and each meal's
  // intake — mirrors generate-signal/index.ts exactly (B-156 PR C1 / B-174).
  const liveDoses = input.doses.filter((d) => !droppedEventIds.has(d.eventId))
  const pairedEventIds = new Set<string>()
  for (const d of liveDoses) if (d.pairedEventId) pairedEventIds.add(d.pairedEventId)

  const mealEvents: MealEvent[] = []
  const mealIntakeById = new Map<string, IntakeRating | null>()
  for (const e of windowEvents) {
    if (e.type !== 'meal' || !e.meal) continue
    mealIntakeById.set(e.id, e.meal.intakeRating)
    mealEvents.push({
      id: e.id,
      occurredAt: e.occurredAt,
      isMedicationVehicle: pairedEventIds.has(e.id),
      occurredAtConfidence: e.occurredAtConfidence,
      foodItemId: e.meal.foodItemId,
      primaryProtein: e.meal.primaryProtein,
      intakeRating: e.meal.intakeRating,
      foodType: e.meal.foodType,
      format: e.meal.format,
      foodLabel: mealFoodLabel(e.meal),
    })
  }

  // Free-fed standing exposures overlapping the window (B-040). meal_fed rows are
  // vet-report metadata, never standing exposures (detection contract).
  const feedingArrangements: FeedingArrangement[] = input.feedingArrangements
    .filter((a) => a.method === 'free_choice')
    .filter((a) => {
      const fromNum = a.activeFrom ? dayNumber(a.activeFrom) : -Infinity
      const untilNum = a.activeUntil ? dayNumber(a.activeUntil) : Infinity
      return (fromNum ?? -Infinity) <= scope.endDayNum && scope.startDayNum <= (untilNum ?? Infinity)
    })
    .map((a) => ({
      id: a.id,
      primaryProtein: a.primaryProtein,
      activeFrom: a.activeFrom,
      activeUntil: a.activeUntil,
      attributionConfidence: a.isShared ? ('low' as const) : ('high' as const),
    }))

  // Medication confounder windows — regimen spans + administered dose POINTS in the
  // window (spec §8 / B-117 PR 9). Regimen DATE end pushed to end-of-day-inclusive,
  // and refused/missed/in-doubt-combo doses dropped, exactly as index.ts does.
  const medicationWindows: MedicationWindow[] = []
  for (const m of input.medications) {
    medicationWindows.push({
      medicationItemId: m.medicationItemId,
      activeFrom: m.startedAt,
      activeUntil: regimenEndIso(m.endedAt),
    })
  }
  for (const d of liveDoses) {
    const dn = eventDayNumber(d.occurredAt, tz)
    if (dn === null || dn < scope.startDayNum || dn > scope.endDayNum) continue
    const w = doseToMedicationWindow({
      medicationItemId: d.medicationItemId,
      occurredAt: d.occurredAt,
      adherence: d.adherence,
      pairedVehicleIntake: d.pairedEventId ? (mealIntakeById.get(d.pairedEventId) ?? null) : null,
    })
    if (w) medicationWindows.push(w)
  }

  return {
    pet: {
      name: input.pet.name,
      species: input.pet.species,
      dietTrialActive: input.dietTrials.some((t) => t.status === 'active'),
    },
    symptomEvents,
    mealEvents,
    feedingArrangements,
    medicationWindows,
    timezone: input.timezone ?? undefined,
    now: scope.detectionNowIso,
  }
}

/** A regimen's DATE end is inclusive of the whole day → push to end-of-day (mirrors generate-signal/index.ts). */
function regimenEndIso(endedAt: string | null): string | null {
  if (endedAt == null) return null
  const ms = Date.parse(`${endedAt}T00:00:00Z`)
  if (Number.isNaN(ms)) return endedAt
  return new Date(ms + MS_PER_DAY).toISOString()
}

function runDetection(detInput: DetectionInput): DetectionExtract {
  const ranked = detectSignals(detInput, DEFAULT_CONFIG)
  const established: EstablishedCorrelation[] = []
  const timing: TimingFinding[] = []
  let intakeDecline: IntakeDeclineFinding | null = null
  let chronicity: SymptomChronicityFinding | null = null
  const worsening: SymptomWorseningFinding[] = []

  for (const { finding } of ranked) {
    switch (finding.type) {
      case 'food_symptom_correlation': {
        const f = finding as CorrelationFinding
        // §8.5: ONLY Established reaches the report; Early is dropped here, deterministically.
        if (f.tier !== 'established') break
        established.push({
          symptomType: f.symptomType,
          protein: f.protein,
          matchedPairs: f.matchedPairs,
          caseExposed: f.caseExposed,
          controlExposed: f.controlExposed,
          riskDifference: f.riskDifference,
          pValue: f.pValue,
          symptomEventCount: f.symptomEventCount,
          correlationWindowHours: f.correlationWindowHours,
        })
        break
      }
      case 'intake_decline':
        if (!intakeDecline) intakeDecline = finding as IntakeDeclineFinding
        break
      case 'symptom_chronicity':
        if (!chronicity) chronicity = finding as SymptomChronicityFinding
        break
      case 'symptom_worsening':
        worsening.push(finding as SymptomWorseningFinding)
        break
      case 'postprandial_timing': {
        const f = finding as PostprandialTimingFinding
        timing.push({
          kind: 'postprandial_timing',
          symptomType: f.symptomType,
          windowDays: f.windowDays,
          detail: {
            rapidCount: f.rapidCount,
            eligibleCount: f.eligibleCount,
            totalEpisodes: f.totalEpisodes,
            rapidWindowMinutes: f.rapidWindowMinutes,
            medianMinutesSinceFeeding: f.medianMinutesSinceFeeding,
          },
        })
        break
      }
      case 'timeofday_clustering': {
        const f = finding as TimeOfDayClusteringFinding
        timing.push({
          kind: 'timeofday_clustering',
          symptomType: f.symptomType,
          windowDays: f.windowDays,
          detail: {
            clusterStartLocalHour: f.clusterStartLocalHour,
            clusterWindowHours: f.clusterWindowHours,
            clusterCount: f.clusterCount,
            eligibleCount: f.eligibleCount,
            totalEpisodes: f.totalEpisodes,
            timezone: f.timezone,
          },
        })
        break
      }
      // 'reflection' is owner-side only — never on the clinical report.
      default:
        break
    }
  }

  // The honest "no established threshold — X is in most of what the pet eats" needs the
  // staple. Reuse the coverage engine (it computes exactly this), don't re-derive — but
  // only when there's NO established correlation, since the staple line is the copy for
  // exactly the no-threshold case (skip the extra engine pass otherwise).
  let stapleProtein: string | null = null
  if (established.length === 0) {
    for (const c of detectCoverage(detInput, DEFAULT_CONFIG)) {
      if (c.type === 'staple_washout') {
        stapleProtein = (c as StapleWashoutDiagnostic).protein
        break
      }
    }
  }

  return { established, timing, intakeDecline, chronicity, worsening, stapleProtein }
}

// ── Top-level assembly ────────────────────────────────────────────────────────

/**
 * Assemble the immutable report snapshot from pulled rows + the resolved window.
 * Pure and deterministic — the ONLY entry point. Order of operations matters:
 *   1. resolve the scope window (§6)
 *   2. de-dup ALL events (§5.11), then scope to the window
 *   3. aggregate every section over the deduped, windowed set (denominators baked in)
 *   4. reuse the detection engine over the window for correlations + safety flags
 *   5. compose safety flags (present blood/foreign lead, §2/§5.9), never a false all-clear (§5.3)
 */
export function assembleReport(input: ReportInput): ReportSnapshot {
  const tz = input.timezone
  const nowMs = parseMs(input.now) ?? 0
  const scope = resolveScope(input)
  const { startDayNum, endDayNum, windowDays } = scope

  const inWindowDay = (dn: number | null): boolean => dn !== null && dn >= startDayNum && dn <= endDayNum
  const inWindow = (iso: string): boolean => inWindowDay(eventDayNumber(iso, tz))

  // Analysis lookups + the completed set (drives dedup representative choice).
  const analysisByEvent = new Map<string, ReportAiAnalysisInput>()
  const completedAnalysisEventIds = new Set<string>()
  for (const a of input.aiAnalyses) {
    analysisByEvent.set(a.eventId, a)
    if (a.status === 'completed') completedAnalysisEventIds.add(a.eventId)
  }

  // §5.11 — de-dup across the full pull (window-aware representative so a boundary-
  // straddling duplicate can't drop a genuine in-window bout), then scope to the window.
  const { events: dedupedAll, droppedEventIds } = dedupeEvents(
    input.events,
    completedAnalysisEventIds,
    (e) => inWindow(e.occurredAt),
  )
  const windowEvents = dedupedAll.filter((e) => inWindow(e.occurredAt))

  // Logging-coverage denominators (§5.1) — distinct local days with ANY logged event.
  const loggedDayNums = new Set<number>()
  let firstLoggedDayNum: number | null = null
  let lastLoggedDayNum: number | null = null
  for (const e of windowEvents) {
    const dn = eventDayNumber(e.occurredAt, tz)
    if (dn === null) continue
    loggedDayNums.add(dn)
    if (firstLoggedDayNum === null || dn < firstLoggedDayNum) firstLoggedDayNum = dn
    if (lastLoggedDayNum === null || dn > lastLoggedDayNum) lastLoggedDayNum = dn
  }
  const loggedDays = loggedDayNums.size

  const numBuckets = Math.max(1, Math.ceil(windowDays / WEEK_DAYS))
  const bucketIndexOfDay = (dn: number): number =>
    Math.min(numBuckets - 1, Math.max(0, Math.floor((dn - startDayNum) / WEEK_DAYS)))
  const bucketStartDates = Array.from({ length: numBuckets }, (_, i) =>
    dayKeyFromNumber(startDayNum + i * WEEK_DAYS),
  )

  // ── Per-symptom aggregates (§3.5, §5.1) ──────────────────────────────────────
  const symptoms: SymptomAggregate[] = []
  for (const type of REPORT_SYMPTOM_TYPES) {
    const incidents = windowEvents.filter((e) => e.type === type)
    if (incidents.length === 0) continue
    const dayNums = new Set<number>()
    const weeklyBuckets = new Array(numBuckets).fill(0)
    let firstOnset: string | null = null
    let lastOnset: string | null = null
    for (const e of incidents) {
      const dn = eventDayNumber(e.occurredAt, tz)
      if (dn !== null) {
        dayNums.add(dn)
        weeklyBuckets[bucketIndexOfDay(dn)]++
      }
      if (firstOnset === null || e.occurredAt < firstOnset) firstOnset = e.occurredAt
      if (lastOnset === null || e.occurredAt > lastOnset) lastOnset = e.occurredAt
    }
    symptoms.push({
      type,
      count: incidents.length,
      symptomDays: dayNums.size,
      windowDays,
      loggedDays,
      firstOnset,
      lastOnset,
      weeklyBuckets,
      bucketStartDates,
    })
  }
  symptoms.sort((a, b) => b.count - a.count || a.type.localeCompare(b.type))
  const primarySymptom = symptoms.length > 0 ? { type: symptoms[0].type, count: symptoms[0].count } : null
  const totalSymptomIncidents = symptoms.reduce((s, x) => s + x.count, 0)

  // ── Vomit phenotype (§3.6, §5.9, §5.10) ──────────────────────────────────────
  const vomitIncidents = windowEvents.filter((e) => e.type === 'vomit')
  let vomitPhenotype: VomitPhenotype | null = null
  if (vomitIncidents.length > 0) {
    const states = { completed: 0, uncertain: 0, failed: 0, pending: 0 }
    const contentsMix: Record<VomitContentCategory, number> = {
      food: 0,
      bile: 0,
      hairball: 0,
      foam_liquid: 0,
      grass: 0,
      unsure: 0,
    }
    const consistencyDistribution: Record<string, number> = {}
    const bloodPresent: VomitPhenotype['bloodPresent'] = []
    const foreignPresent: VomitPhenotype['foreignPresent'] = []
    let withAnalysis = 0
    let reviewedCount = 0
    for (const e of vomitIncidents) {
      // §5.9 present-only — escalate on blood/foreign present in ANY member of the collapsed
      // bout (any status), NEVER folding `unsure`/`none_visible`/`no` into a "0 of N". A flag
      // on a dropped duplicate must still lead the safety band.
      const present = unionPresentFlags(e.memberEventIds, analysisByEvent)
      if (present.bloodKind) bloodPresent.push({ eventId: e.id, occurredAt: e.occurredAt, kind: present.bloodKind })
      if (present.foreignPresent) foreignPresent.push({ eventId: e.id, occurredAt: e.occurredAt, note: present.foreignNote })

      // The four-state disclosure + assessed aggregate use the incident's BEST-status member
      // (completed preferred) — read across all members so a photographed bout keeps its read
      // even when the representative log is an empty duplicate.
      const a = pickIncidentAnalysis(e.memberEventIds, analysisByEvent)
      if (!a) continue
      withAnalysis++
      switch (a.status) {
        case 'completed':
          states.completed++
          break
        case 'uncertain':
          states.uncertain++
          break
        case 'failed':
          states.failed++
          break
        default:
          states.pending++
          break
      }
      // §5.10 — the descriptive contents/consistency aggregate is over the ASSESSED
      // (completed) set only; uncertain/failed/pending contribute NO phenotype content.
      if (a.status === 'completed') {
        contentsMix[classifyVomitContents(a)]++
        if (a.consistency) consistencyDistribution[a.consistency] = (consistencyDistribution[a.consistency] ?? 0) + 1
        if (a.editedAt) reviewedCount++
      }
    }
    vomitPhenotype = {
      totalIncidents: vomitIncidents.length,
      withAnalysis,
      states,
      assessedCount: states.completed,
      contentsMix,
      consistencyDistribution,
      bloodPresent,
      foreignPresent,
      reviewedCount,
    }
  }

  // ── Stool characteristics (§3.7) — normal vs loose; null when no stool events ─
  const stoolNormal = windowEvents.filter((e) => e.type === STOOL_NORMAL_TYPE).length
  const stoolLoose = windowEvents.filter((e) => e.type === DIARRHEA_TYPE).length
  const stool: StoolCharacteristics | null =
    stoolNormal + stoolLoose > 0
      ? { total: stoolNormal + stoolLoose, normalCount: stoolNormal, looseCount: stoolLoose, windowDays, loggedDays }
      : null

  // ── Weight (§3.3, B-186) ──────────────────────────────────────────────────────
  // Weigh-ins arrive in their OWN array (weightChecks), NOT in input.events, so the
  // type-and-minute event de-dup never sees them — and it deliberately excludes
  // weight_check anyway, because a distinct weight VALUE means two genuine readings are
  // not duplicates (DEDUP_OBSERVATION_TYPES note). But a double-tap / offline-sync retry
  // produces two near-simultaneous rows for ONE weigh-in, which would inflate readingCount
  // and draw a phantom point on the sparkline (adversarial finding A5). So collapse readings
  // within DEDUP_WINDOW_MS of the prior kept one, keeping the LATER row (last-write-wins,
  // the project's sync-conflict rule) — a correction 5 s later wins, a retry of the same
  // value is idempotent. Distinct readings minutes+ apart are always preserved.
  // First drop any weigh-in whose PARENT event was collapsed by the type-and-minute event
  // de-dup (only reachable if the I/O shell also placed the weight_check event in input.events
  // — weight_check is in DEDUP_OBSERVATION_TYPES; a no-op when weightChecks is a standalone
  // pull), then apply the near-simultaneous collapse below for the standalone-array case.
  const sortedReadings = [...input.weightChecks]
    .filter((r) => !droppedEventIds.has(r.eventId))
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
  const allReadings: ReportWeightCheckInput[] = []
  for (const r of sortedReadings) {
    const prev = allReadings[allReadings.length - 1]
    const prevMs = prev ? parseMs(prev.occurredAt) : null
    const curMs = parseMs(r.occurredAt)
    if (prev && prevMs !== null && curMs !== null && curMs - prevMs < DEDUP_WINDOW_MS) {
      allReadings[allReadings.length - 1] = r // collapse the retry/correction pair, keep the later
    } else {
      allReadings.push(r)
    }
  }
  const latestOverall = allReadings.length > 0 ? allReadings[allReadings.length - 1] : null
  const windowReadings = allReadings.filter((r) => inWindow(r.occurredAt))
  const weight = buildWeightSection(latestOverall, windowReadings, tz)

  // ── Diet / confounder summary (§3.8) ─────────────────────────────────────────
  const activeTrialInput = input.dietTrials.find((t) => t.status === 'active') ?? null
  const activeTrial = activeTrialInput
    ? {
        foodLabel: activeTrialInput.foodLabel ?? null,
        primaryProtein: activeTrialInput.primaryProtein ?? null,
        startedAt: activeTrialInput.startedAt,
        targetDurationDays: activeTrialInput.targetDurationDays,
        daysElapsed: Math.max(0, endDayNum - (dayNumber(activeTrialInput.startedAt) ?? endDayNum) + 1),
        vetName: activeTrialInput.vetName,
      }
    : null

  const freeFed = input.feedingArrangements
    .filter((a) => a.method === 'free_choice')
    .filter((a) => {
      const fromNum = a.activeFrom ? dayNumber(a.activeFrom) : -Infinity
      const untilNum = a.activeUntil ? dayNumber(a.activeUntil) : Infinity
      return (fromNum ?? -Infinity) <= endDayNum && startDayNum <= (untilNum ?? Infinity)
    })
    .map((a) => ({
      foodLabel: a.foodLabel,
      primaryProtein: a.primaryProtein,
      activeFrom: a.activeFrom,
      activeUntil: a.activeUntil,
    }))

  const windowMeals = windowEvents.filter((e) => e.type === 'meal' && e.meal)
  const ratedMeals = windowMeals.filter((e) => e.meal!.foodType === 'meal' && e.meal!.intakeRating != null)
  const finishedMeals = ratedMeals.filter((e) => e.meal!.intakeRating === 'all').length
  const mealCompletion =
    ratedMeals.length > 0
      ? { ratedMeals: ratedMeals.length, finishedMeals, rate: finishedMeals / ratedMeals.length }
      : null

  // human_food format is the STRONGER confounder signal (B-102, the #1 diet-trial confounder),
  // so it takes precedence: a table-scrap "treat" (foodType='treat' AND format='human_food')
  // counts ONCE, as human food, and is excluded from the treats tally. Without this the same
  // feeding was summed on BOTH the page-1 human-food line and the treats line (adversarial
  // finding A3 — page 1 disagreed with the de-duplicated Appendix B). Appendix B's category
  // ternary is ordered human_food-first to match.
  const humanFoodFeedings = windowMeals.filter((e) => e.meal!.format === 'human_food')
  const treatFeedings = windowMeals.filter(
    (e) => (e.meal!.foodType === 'treat' || e.meal!.format === 'treat') && e.meal!.format !== 'human_food',
  )
  const treatItemIds = new Set(treatFeedings.map((e) => e.meal!.foodItemId ?? e.id))
  const humanFoodDays = new Set<number>()
  const humanFoodItems: Array<{ date: string; label: string | null }> = []
  for (const e of humanFoodFeedings) {
    const key = localDayKey(e.occurredAt, tz)
    const dn = key === null ? null : dayNumber(key)
    if (dn !== null) humanFoodDays.add(dn)
    humanFoodItems.push({ date: key ?? e.occurredAt.slice(0, 10), label: mealFoodLabel(e.meal!) })
  }

  const diet: DietSummary = {
    activeTrial,
    freeFed,
    intakeNotDirectlyObserved: freeFed.length > 0,
    mealCompletion,
    treats: { count: treatFeedings.length, distinctItems: treatItemIds.size },
    humanFood: { count: humanFoodFeedings.length, days: humanFoodDays.size, items: humanFoodItems },
  }

  // ── Medication adherence (§3.8, B-117 §7) ────────────────────────────────────
  const liveDoses = input.doses.filter((d) => !droppedEventIds.has(d.eventId))
  const medications = input.medications.map((m) =>
    buildMedicationAdherence(m, liveDoses, scope, tz),
  )

  // ── Detection reuse (§7 / §8.5) ──────────────────────────────────────────────
  const detInput = buildDetectionInput(input, scope, windowEvents, droppedEventIds)
  const detection = runDetection(detInput)

  const correlation: CorrelationSummary = {
    established: detection.established,
    hasEstablished: detection.established.length > 0,
    noThreshold: detection.established.length === 0,
    stapleProtein: detection.stapleProtein,
    timing: detection.timing,
  }

  // ── Concurrent interventions (GP-0 note, §3.5/§3.8) ──────────────────────────
  const concurrentChanges = buildConcurrentChanges(input, scope, startDayNum, bucketIndexOfDay)

  // ── Safety flags (§3.1 order; §5.3 empty when none) ──────────────────────────
  const safetyFlags: SafetyFlag[] = []
  // Present blood / foreign LEAD the safety band (§2 present-only decision).
  if (vomitPhenotype && vomitPhenotype.bloodPresent.length > 0) {
    safetyFlags.push({ kind: 'present_blood', incidents: vomitPhenotype.bloodPresent })
  }
  if (vomitPhenotype && vomitPhenotype.foreignPresent.length > 0) {
    safetyFlags.push({ kind: 'present_foreign', incidents: vomitPhenotype.foreignPresent })
  }
  if (detection.intakeDecline) {
    const f = detection.intakeDecline
    // B-213 — the "how long off food?" number, measured from the report's `now` (window end,
    // = the detector's own `now`) to the last fully-eaten meal. Whole hours; clamped ≥0 so a
    // boundary meal can never read as a negative gap. null when no full meal exists in-window.
    const detNowMs = parseMs(scope.detectionNowIso)
    const lastFullMs = parseMs(f.lastFullMealIso)
    const hoursSinceLastFullMeal =
      detNowMs !== null && lastFullMs !== null
        ? Math.max(0, Math.round((detNowMs - lastFullMs) / MS_PER_HOUR))
        : null
    safetyFlags.push({
      kind: 'intake_decline',
      trigger: f.trigger,
      species: f.species,
      baselineScore: f.baselineScore,
      recentScore: f.recentScore,
      daysBelowBaseline: f.daysBelowBaseline,
      refusedFoodLabel: f.refusedFoodLabel,
      ratedMealsConsidered: f.ratedMealsConsidered,
      lastFullMealIso: f.lastFullMealIso,
      hoursSinceLastFullMeal,
    })
  }
  if (detection.chronicity) {
    const f = detection.chronicity
    safetyFlags.push({
      kind: 'chronicity',
      symptomType: f.symptomType,
      episodeCount: f.episodeCount,
      spanDays: f.spanDays,
      activeWeeks: f.activeWeeks,
      symptomDays: f.symptomDays,
      daysSinceLastEpisode: f.daysSinceLastEpisode,
      firstOnsetIso: f.firstOnsetIso,
      tier: f.tier,
      windowDays: f.windowDays,
    })
  }
  for (const f of detection.worsening) {
    safetyFlags.push({
      kind: 'symptom_worsening',
      symptomType: f.symptomType,
      currentCount: f.currentCount,
      priorCount: f.priorCount,
      currentDays: f.currentDays,
      priorDays: f.priorDays,
      trigger: f.trigger,
      tier: f.tier,
      windowDays: f.windowDays,
    })
  }

  // ── Provenance / appendices (§3.9, appendix A/B/C) ───────────────────────────
  const symptomLog: SymptomLogEntry[] = windowEvents
    .filter((e) => REPORT_SYMPTOM_SET.has(e.type))
    .map((e) => {
      const a = e.type === 'vomit' ? pickIncidentAnalysis(e.memberEventIds, analysisByEvent) : null
      // Present blood/foreign union over ALL members (§5.9), same as the aggregate — so the
      // appendix row for a de-duplicated bout still shows a flag carried by a dropped twin.
      const present = a ? unionPresentFlags(e.memberEventIds, analysisByEvent) : null
      const phenotype: SymptomLogPhenotype | null = a
        ? {
            status: a.status,
            contentsCategory: a.status === 'completed' ? classifyVomitContents(a) : null,
            consistency: a.consistency,
            colour: a.colour,
            // PRESENT-only, per-event (§5.9): render nothing on absence/uncertainty.
            bloodPresent: present!.bloodKind,
            // null (not false) when absent OR unsure OR not-yet-assessed — never a positive
            // "no foreign material" on a read the AI could not clear (adversarial finding 2).
            foreignPresent: present!.foreignPresent ? true : null,
            foreignNote: present!.foreignNote,
            edited: a.editedAt != null,
          }
        : null
      return {
        eventId: e.id,
        type: e.type,
        occurredAt: e.occurredAt,
        occurredAtConfidence: e.occurredAtConfidence,
        occurredAtEarliest: e.occurredAtEarliest,
        occurredAtLatest: e.occurredAtLatest,
        loggedAt: e.loggedAt,
        severity: e.severity,
        notes: e.notes,
        dupCount: e.dupCount,
        phenotype,
      }
    })
  const estimatedOrWindowCount = symptomLog.filter(
    (e) => e.occurredAtConfidence === 'estimated' || e.occurredAtConfidence === 'window',
  ).length

  // MUST mirror the treatFeedings + humanFoodFeedings union exactly, or an off-diet exposure
  // counted on page 1 (treats) vanishes from Appendix B and the antigen tally — a hidden
  // trial-breaking antigen (adversarial finding: a `format==='treat'` item with a non-'treat'
  // foodType was in page-1 treats but absent from the reconciliation). `format==='treat'` is a
  // legitimate FoodFormat, so the treat arm needs BOTH predicates here too.
  const confounderFeedings = windowMeals.filter(
    (e) => e.meal!.foodType === 'treat' || e.meal!.format === 'treat' || e.meal!.format === 'human_food',
  )
  const confounders: ConfounderExposure[] = confounderFeedings.map((e) => ({
    eventId: e.id,
    occurredAt: e.occurredAt,
    dayKey: localDayKey(e.occurredAt, tz),
    foodLabel: mealFoodLabel(e.meal!),
    primaryProtein: e.meal!.primaryProtein,
    format: e.meal!.format,
    foodType: e.meal!.foodType,
    note: e.notes,
  }))
  const proteinExposureTally: Record<string, number> = {}
  for (const c of confounders) {
    if (c.primaryProtein) proteinExposureTally[c.primaryProtein] = (proteinExposureTally[c.primaryProtein] ?? 0) + 1
  }

  // ── Intake appendix (B-213) — recent rated meals, ONLY when an intake flag fired ─────
  // The page-1 intake numbers (baseline, decline, last full meal) must trace to real meal
  // rows. Built from the deduped, windowed rated meals — the SAME set the detector saw — so
  // "declined N of last M" and the last-full-meal date line up with appendix rows. Empty on
  // calm reports (no meal dump when there's no intake concern). Most-recent-first + capped.
  const hasIntakeFlag = safetyFlags.some((f) => f.kind === 'intake_decline')
  let intakeLog: IntakeLogEntry[] = []
  let intakeLogHiddenOlder = 0
  if (hasIntakeFlag) {
    const ratedForLog = windowMeals
      .filter((e) => e.meal!.foodType === 'meal' && e.meal!.intakeRating != null)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
    // The page-1 anchor = the most recent fully-eaten meal (ratedForLog is most-recent-first,
    // so the first `all` is exactly the meal detection.ts anchored `lastFullMealIso` on — one
    // rule, no divergence). May be null (no full meal in the window → flag says so honestly).
    const anchorMeal = ratedForLog.find((e) => e.meal!.intakeRating === 'all') ?? null
    const head = ratedForLog.slice(0, INTAKE_LOG_CAP)
    // TRACEABILITY (adversarial finding): the "how long off food" number must point at a VISIBLE
    // row. If the anchor predates the most-recent cap (a chronically-inappetent pet with >cap
    // non-full meals since its last full meal), PIN it back in as a trailing row so it is shown
    // and taggable — never left cited-but-invisible. Everything between is disclosed as omitted.
    const anchorInHead = anchorMeal !== null && head.includes(anchorMeal)
    const shownRows = anchorMeal !== null && !anchorInHead ? [...head, anchorMeal] : head
    const shownIds = new Set(shownRows.map((e) => e.id))
    intakeLogHiddenOlder = ratedForLog.filter((e) => !shownIds.has(e.id)).length
    intakeLog = shownRows.map((e) => ({
      eventId: e.id,
      occurredAt: e.occurredAt,
      foodLabel: mealFoodLabel(e.meal!),
      intakeRating: e.meal!.intakeRating as IntakeRating,
      isLastFullMeal: anchorMeal !== null && e.id === anchorMeal.id,
      pinned: !anchorInHead && anchorMeal !== null && e.id === anchorMeal.id,
    }))
  }

  const provenance: Provenance = {
    ownerReported: true,
    totalSymptomIncidents,
    estimatedOrWindowCount,
    deletedExcluded: true,
    symptomLog,
    intakeLog,
    intakeLogHiddenOlder,
    confounders,
    proteinExposureTally,
    conditions: input.conditions.map((c) => ({
      name: c.conditionName,
      status: c.status,
      diagnosedAt: c.diagnosedAt,
    })),
  }

  // ── Cherry-pick guard (§6) — custom window only ──────────────────────────────
  let outOfWindowSymptomCount = 0
  let outOfWindowMostRecent: string | null = null
  if (scope.isCustomOverride) {
    for (const e of dedupedAll) {
      if (!REPORT_SYMPTOM_SET.has(e.type)) continue
      // An undateable event is not evidence of an out-of-window incident — skip it.
      if (eventDayNumber(e.occurredAt, tz) === null) continue
      if (inWindow(e.occurredAt)) continue
      outOfWindowSymptomCount++
      if (outOfWindowMostRecent === null || e.occurredAt > outOfWindowMostRecent) outOfWindowMostRecent = e.occurredAt
    }
  }

  // ── Signalment ────────────────────────────────────────────────────────────────
  const age = computeAge(input.pet.dateOfBirth, nowMs)
  const signalment: Signalment = {
    name: input.pet.name,
    species: input.pet.species,
    breed: input.pet.breed,
    sex: input.pet.sex,
    neuterStatus: input.pet.neuterStatus ?? 'not_recorded',
    ageYears: age.years,
    ageMonths: age.months,
    dateOfBirth: input.pet.dateOfBirth,
    ownerName: input.ownerName,
    latestWeight: latestOverall
      ? {
          kg: latestOverall.weightKg,
          lbs: kgToLbsNum(latestOverall.weightKg),
          date: localDayKey(latestOverall.occurredAt, tz) ?? latestOverall.occurredAt.slice(0, 10),
        }
      : null,
  }

  const clinicalQuestion: ClinicalQuestion = {
    question: activeTrial ? 'diet_trial_working' : 'symptom_monitoring',
    primarySymptom: primarySymptom?.type ?? null,
  }

  const atAGlance: AtAGlance = {
    primarySymptom,
    totalSymptomIncidents,
    windowDays,
    loggedDays,
    trialDaysLogged: activeTrial ? countTrialDaysLogged(windowEvents, activeTrialInput!, tz) : null,
    weightState: weight.isEmpty ? 'empty' : weight.trend && weight.trend.readingCount >= 2 ? 'trend' : 'single',
  }

  return {
    generatedAt: input.now,
    timezone: tz,
    scope: { ...scope, outOfWindowSymptomCount, outOfWindowMostRecent },
    signalment,
    clinicalQuestion,
    safetyFlags,
    weight,
    atAGlance,
    symptoms,
    vomitPhenotype,
    stool,
    diet,
    medications,
    correlation,
    concurrentChanges,
    provenance,
  }
}

// ── Assembly sub-helpers ──────────────────────────────────────────────────────

function buildWeightSection(
  latestOverall: ReportWeightCheckInput | null,
  windowReadings: ReportWeightCheckInput[],
  tz: string | null,
): WeightSection {
  const isEmpty = latestOverall === null
  const latest = latestOverall
    ? {
        kg: latestOverall.weightKg,
        lbs: kgToLbsNum(latestOverall.weightKg),
        date: localDayKey(latestOverall.occurredAt, tz) ?? latestOverall.occurredAt.slice(0, 10),
      }
    : null

  let trend: WeightTrendView | null = null
  if (windowReadings.length > 0) {
    const seriesKg = windowReadings.map((r) => r.weightKg)
    const seriesLbs = seriesKg.map(kgToLbsNum)
    const count = seriesLbs.length
    const latestLbs = seriesLbs[count - 1]
    const latestKg = seriesKg[count - 1]
    const deltaLbs = count >= 2 ? Math.round((latestLbs - seriesLbs[0]) * 10) / 10 : null
    const deltaKg = count >= 2 ? Math.round((latestKg - seriesKg[0]) * 100) / 100 : null
    trend = {
      readingCount: count,
      seriesLbs,
      seriesKg,
      latestLbs,
      latestKg,
      earliestDate: localDayKey(windowReadings[0].occurredAt, tz),
      latestDate: localDayKey(windowReadings[count - 1].occurredAt, tz),
      deltaLbs,
      deltaKg,
      // Descriptive direction only — never a verdict (guardrail from lib/weight.ts / migration 024).
      direction: deltaLbs == null ? null : deltaLbs > 0 ? 'up' : deltaLbs < 0 ? 'down' : 'flat',
    }
  }
  return { isEmpty, latest, trend }
}

function buildMedicationAdherence(
  m: ReportMedicationInput,
  liveDoses: ReportDoseInput[],
  scope: ReportScope,
  tz: string | null,
): MedicationAdherence {
  const startNum = dayNumber(m.startedAt)
  const endNum = m.endedAt ? dayNumber(m.endedAt) : null
  // Regimen's active span intersected with the report window (inclusive days).
  const spanStart = Math.max(startNum ?? scope.startDayNum, scope.startDayNum)
  const spanEnd = Math.min(endNum ?? scope.endDayNum, scope.endDayNum)
  const overlapsWindow = spanStart <= spanEnd
  const elapsedDaysInWindow = overlapsWindow ? spanEnd - spanStart + 1 : 0

  // Doses linked to THIS regimen, administered in the window.
  const regimenDoses = liveDoses.filter((d) => {
    if (d.medicationId !== m.id) return false
    const dn = eventDayNumber(d.occurredAt, tz)
    return dn !== null && dn >= scope.startDayNum && dn <= scope.endDayNum
  })
  let given = 0
  let partial = 0
  let missed = 0
  let refused = 0
  let unconfirmed = 0
  const doseDayNums = new Set<number>()
  for (const d of regimenDoses) {
    switch (d.adherence) {
      case 'given':
        given++
        break
      case 'partial':
        partial++
        break
      case 'missed':
        missed++
        break
      case 'refused':
        refused++
        break
      default:
        unconfirmed++
        break
    }
    // Days with an ADMINISTERED dose — given OR partial ONLY. An UNCONFIRMED dose
    // (adherence null) is deliberately NOT counted here: bundling it as administered
    // would overstate compliance for a critical drug (adversarial finding 4). It stays
    // visible as unconfirmedDoses so the render can be honest about it.
    if (d.adherence === 'given' || d.adherence === 'partial') {
      const dn = eventDayNumber(d.occurredAt, tz)
      if (dn !== null) doseDayNums.add(dn)
    }
  }

  const expectedDoses =
    m.dosesPerDay != null && overlapsWindow ? Math.round(m.dosesPerDay * elapsedDaysInWindow) : null

  // A regimen with ZERO dose EVENTS in the window is "adherence not tracked", NEVER
  // "compliant" (spec §4 trap) — baked into the state, not left to the renderer.
  const adherenceState: 'tracked' | 'not_tracked' = regimenDoses.length === 0 ? 'not_tracked' : 'tracked'

  return {
    regimenId: m.id,
    drugName: m.drugName,
    strength: m.strength ?? null,
    doseAmount: m.doseAmount,
    route: m.route,
    dosesPerDay: m.dosesPerDay,
    scheduleNotes: m.scheduleNotes,
    indication: m.indication,
    startedAt: m.startedAt,
    endedAt: m.endedAt,
    status: m.status,
    // Non-prescription ⇒ a supplement (concurrent intervention, §2). Unknown ⇒ not a supplement.
    isSupplement: m.isPrescription === false,
    overlapsWindow,
    adherenceState,
    elapsedDaysInWindow,
    daysWithDose: doseDayNums.size,
    expectedDoses,
    givenDoses: given,
    partialDoses: partial,
    missedDoses: missed,
    refusedDoses: refused,
    unconfirmedDoses: unconfirmed,
  }
}

/**
 * Interventions that STARTED within the window (GP-0, spec §3.5/§3.8): a diet trial,
 * a medication regimen, a supplement, or a free-fed arrangement introduced mid-window.
 * The single highest-consequence misread to prevent — a co-started drug letting the
 * diet silently take credit — so the concurrent-change data is computed here for the
 * render's "Reading the trend" note.
 */
function buildConcurrentChanges(
  input: ReportInput,
  scope: ReportScope,
  startDayNum: number,
  bucketIndexOfDay: (dn: number) => number,
): ConcurrentChange[] {
  const out: ConcurrentChange[] = []
  // An intervention is a concurrent confounder if its ACTIVE SPAN overlaps the window at
  // all — NOT only if it STARTED inside it. A steroid begun before the range and running
  // throughout suppresses exactly the signs the trial measures, so dropping it (the old
  // in-window-start-only gate) let the diet take its credit — adversarial finding A1, the
  // spec §4/B-117 highest-consequence misread. An open-ended (still-active) intervention
  // runs to the window end; one that ENDED before the window never overlaps and is dropped.
  const consider = (kind: InterventionKind, label: string, startDate: string | null, endDate: string | null) => {
    // A NULL startDate = a standing arrangement whose start was never recorded (a free-fed bowl
    // "always down"). Treat it as active from before the window (spanStart -Infinity) so it is
    // never dropped from the confounder note just because its start date is missing (adversarial
    // finding: a null-activeFrom bowl escaped the GP-0 guard). A malformed non-null date bails.
    const startDn = startDate ? dayNumber(startDate) : null
    if (startDate !== null && startDn === null) return
    const spanStart = startDn ?? -Infinity
    const activeEndDn = endDate ? dayNumber(endDate) : null
    const spanEnd = activeEndDn ?? scope.endDayNum // open-ended → active through the window end
    if (spanStart > scope.endDayNum || spanEnd < scope.startDayNum) return // no overlap with the window
    const startedInWindow = startDn !== null && startDn >= scope.startDayNum && startDn <= scope.endDayNum
    // The end date ONLY when it stopped strictly before the window end — so the render says
    // "until <date>" instead of a false present-tense "ongoing since <start>" (adversarial finding).
    const endInWindow = activeEndDn !== null && activeEndDn < scope.endDayNum ? endDate : null
    out.push({
      kind,
      label,
      startDate,
      // A marker only where there is a real start point in-window; a standing confounder gets none.
      bucketIndex: startedInWindow ? bucketIndexOfDay(startDn as number) : null,
      ongoing: !startedInWindow,
      endInWindow,
    })
  }
  for (const t of input.dietTrials) {
    consider('diet_trial', t.foodLabel ?? 'Diet trial', t.startedAt, t.completedAt)
  }
  for (const m of input.medications) {
    consider(m.isPrescription === false ? 'supplement' : 'medication', m.drugName, m.startedAt, m.endedAt)
  }
  for (const a of input.feedingArrangements) {
    // Drop the old `&& a.activeFrom` guard: a free-fed bowl with an unrecorded start still
    // overlaps the window and must reach the confounder note (consider() handles the null start).
    if (a.method === 'free_choice') consider('free_fed', a.foodLabel ?? 'Free-fed food', a.activeFrom, a.activeUntil)
  }
  // Explicit total order (matches the determinism discipline of every other sort here) —
  // by start date, then kind, then label, so same-day interventions never depend on push order.
  // A null start sorts first (a standing arrangement of unrecorded, hence earliest, origin).
  out.sort(
    (x, y) => (x.startDate ?? '').localeCompare(y.startDate ?? '') || x.kind.localeCompare(y.kind) || x.label.localeCompare(y.label),
  )
  return out
}

/** Distinct local days in-window with ≥1 logged meal — the trial-compliance numerator (reference query [3]). */
function countTrialDaysLogged(
  windowEvents: Array<ReportEventInput & { dupCount: number }>,
  trial: ReportDietTrialInput,
  tz: string | null,
): number {
  const trialStartNum = dayNumber(trial.startedAt) ?? -Infinity
  const days = new Set<number>()
  for (const e of windowEvents) {
    if (e.type !== 'meal') continue
    const dn = eventDayNumber(e.occurredAt, tz)
    if (dn !== null && dn >= trialStartNum) days.add(dn)
  }
  return days.size
}


