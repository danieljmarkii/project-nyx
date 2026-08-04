// Medication history — the shared course derivation (B-140 extended, PR 1).
//
// The vet asks "what medications has she been on?" and today the app cannot answer it
// anywhere: the profile card, the A6 rundown and the report's medication section all
// filter to `status = 'active'`, so a course vanishes from every surface except the raw
// dose stream the moment it ends (spec §1). This module is the ONE course-grain
// derivation the four B-140 surfaces read — the profile "Past medications" section
// (PR 2), the med-detail past-course facts (PR 3), the rundown block (PR 4), and the
// D2-gated report table (PR 5). It computes the SHAPE and the FACTS; each surface owns
// its own copy/render.
//
// ── The grain rule (spec §2) ─────────────────────────────────────────────────────
// History answers *what happened* (event grain — dose rows, untouched). This answers
// *what has she been on* (course grain — a derived summary over the same rows). Every
// course-grain claim links back down into the event-grain evidence; this is never a
// second source of truth.
//
// ── Two structurally-distinct end registers (H1) ─────────────────────────────────
// `end.kind === 'ended'` renders ONLY from an owner action (`status IN
// (completed, stopped)`). Everything else is `end.kind === 'none'` with a last-dose
// date. There is NO code path from silence to an ending — nothing auto-completes a
// course, so stale-active is the steady state (the B-422 lesson), and a history view
// that promotes silence into an ending fabricates a clinical fact.
//
// ── One count predicate, one attribution pass (H4) ───────────────────────────────
// This module READS the shipped predicates and never rivals them (the diet-trial §5.3
// lesson — a second, contradictory off-diet definition shipped there and had to be
// re-based). Regimen counts come from `attributeDoses` (the single attribution pass
// that `attributeDosesToRegimens` itself delegates to); every headline dose count —
// regimen or ad-hoc — is `dosesTowardTarget` (therapy delivered = given + partial).
// An orphan group is tallied with the shared `tallyDoses` bucketer, not a re-spelled
// switch. So a count here can never contradict the profile card / med strip / report
// for the same course.
//
// ── Deno-compatible by construction (spec §3) ────────────────────────────────────
// No React Native / expo / DOM imports and `.ts`-extension sibling imports, exactly
// like `lib/dietTrial.ts` — so `generate-report` imports it directly in PR 5. The
// module is also PURE and CLOCK-FREE: it is a function of (regimens, doses, timeZone)
// only, with no `Date.now()` — deterministic, and pinnable under the B-514 non-UTC CI
// zones without touching the process clock.
//
// ── Day math (spec §3, B-441/B-421) ──────────────────────────────────────────────
// Every calendar-day fact goes through `localDayIndexOf` and its inverse. A dose's
// `occurred_at` is a full instant, so its LOCAL day depends on the zone — computed once
// here (per the caller's zone) so the on-device surfaces agree with each other and the
// report passes the pet's profile zone. A regimen's `started_at`/`ended_at` are DATE
// columns, indexed verbatim (zone-independent); never round-trip them through
// `new Date(key)` (the B-441 trap that read one day high behind UTC).

import {
  attributeDoses,
  dosesTowardTarget,
  tallyDoses,
  emptyTally,
  type AdherenceTally,
  type AttributableDose,
  type RegimenWindow,
} from './medications.ts';
import { localDayIndexOf, dayKeyFromIndex, trialDayCounter } from './utils.ts';

// ── Input contract ────────────────────────────────────────────────────────────────

// A `medications` regimen row — the pet's whole set (active + completed + stopped),
// NOT pre-filtered to active (that filter is the bug this feature exists to undo). A
// structural superset of `RegimenWindow`, so it is passed straight to `attributeDoses`.
export interface MedicationHistoryRegimen {
  id: string;
  medication_item_id: string | null;
  drug_name: string;                    // the regimen's own display name (medications.drug_name, NOT NULL)
  dose_amount: string | null;
  route: string | null;
  doses_per_day: number | null;         // NULL = PRN / as-needed
  schedule_notes: string | null;
  started_at: string;                   // Postgres DATE 'YYYY-MM-DD' (indexed verbatim)
  target_duration_days: number | null;  // planned length in days (NULL = ongoing / dose-denominated)
  target_duration_doses: number | null; // B-618 — planned length in doses (NULL = ongoing / days-denominated)
  status: string;                       // 'active' | 'completed' | 'stopped' | …
  ended_at: string | null;              // DATE — set by the owner's End action
}

export interface MedicationHistoryInput {
  regimens: MedicationHistoryRegimen[];
  // Every dose row for the pet (soft-delete carried on `deleted_at`, read through the
  // parent event exactly as the tallies this composes with do — spec §3). The caller
  // supplies all of them; attribution decides which belong to a regimen and which are
  // ad-hoc. `AttributableDose` carries no drug name — a dose-derived course exposes its
  // `medicationItemId` for the surface to resolve (the report names it clinically, the
  // app brand-first), never a name baked in here.
  doses: AttributableDose[];
  // IANA zone for bucketing dose instants into local calendar days. OMIT on-device (the
  // device zone is the owner's midnight); `generate-report` passes the pet's profile
  // zone so the report's day labels match the app's. DATE-column math ignores it.
  timeZone?: string;
}

// ── Output contract ────────────────────────────────────────────────────────────────

export type CourseSource = 'regimen' | 'doses';

// H1 — the two registers, made unrepresentable-otherwise by the type. `ended` can only
// be constructed from `status IN (completed, stopped)`; `none` carries the last-dose
// instant instead of an end. A consumer that switches on `kind` cannot accidentally
// print "ended" for a course that merely went quiet.
export type MedicationCourseEnd =
  | { kind: 'ended'; status: 'completed' | 'stopped'; endedAt: string | null }
  | { kind: 'none'; lastDoseIso: string | null };

export interface MedicationCourse {
  // Stable, deterministic identity: the regimen id, or `item:<itemId>` / `item:unspecified`
  // for a dose-derived group. Lets a surface key a list without leaking the source.
  key: string;
  source: CourseSource;
  regimenId: string | null;       // medications.id when source === 'regimen'
  medicationItemId: string | null; // the drug identity; the surface resolves an orphan's name from this
  drugName: string | null;        // the regimen's drug_name; NULL for a dose-derived course (caller names it)
  // status === 'active'. The active card / med strip owns these; the profile "Past
  // medications" section filters them out. Emitted here so the rundown's "current"
  // block and the ordering can read one model.
  isActive: boolean;

  // Dose evidence — both sources. Counts through the one predicate (H4).
  tally: AdherenceTally;
  dosesLogged: number;            // dosesTowardTarget(tally) — therapy delivered (given + partial)
  firstDoseIso: string | null;    // earliest attributed dose instant, exact
  lastDoseIso: string | null;     // latest attributed dose instant, exact (recency + ordering)
  firstDoseDay: string | null;    // its local calendar day in `timeZone`, 'YYYY-MM-DD'
  lastDoseDay: string | null;

  // Regimen enrichment — all null on a dose-derived course, so "renders from doses
  // alone" (mock Frame B) is the natural shape, not a special case.
  startedAt: string | null;       // regimen.started_at DATE — the course's start date
  dosesPerDay: number | null;
  scheduleNotes: string | null;
  route: string | null;
  doseAmount: string | null;
  // The planned course total: target_duration_doses when dose-denominated, else
  // doses_per_day × target_duration_days when both are set, else null (ongoing / PRN /
  // ad-hoc). This is the "of N" in "26 of N planned" — regimen arithmetic over the
  // regimen's OWN target fields, distinct from computeRegimenCompliance.expectedDoses
  // (an ELAPSED pace, a different question); it rivals no dose-count predicate.
  plannedDoses: number | null;
  targetDurationDays: number | null; // raw planned length in days (for the "N days" label)
  // Inclusive span in days from start to the owner-recorded end, ended regimens only
  // (start → ended_at, both DATE → zone-independent, via trialDayCounter). Null for an
  // ongoing/active/ad-hoc course — a length only exists once the course actually ended.
  runDays: number | null;

  end: MedicationCourseEnd;
}

// ── Derivation ──────────────────────────────────────────────────────────────────────

const ENDED_STATUSES: ReadonlySet<string> = new Set(['completed', 'stopped']);

// H1's only constructor. An ending renders solely from an owner action (a completed/
// stopped status); every other status — 'active', 'paused', an unknown future value —
// yields `none` with the last-dose date. Silence never becomes an ending.
function endRegister(status: string, endedAt: string | null, lastDoseIso: string | null): MedicationCourseEnd {
  if (ENDED_STATUSES.has(status)) {
    return { kind: 'ended', status: status as 'completed' | 'stopped', endedAt };
  }
  return { kind: 'none', lastDoseIso };
}

// The planned course total from a regimen's own target fields (see plannedDoses above).
function plannedDosesFor(r: MedicationHistoryRegimen): number | null {
  if (r.target_duration_doses != null && r.target_duration_doses > 0) return r.target_duration_doses;
  if (
    r.doses_per_day != null && r.doses_per_day > 0 &&
    r.target_duration_days != null && r.target_duration_days > 0
  ) {
    return Math.round(r.doses_per_day * r.target_duration_days);
  }
  return null;
}

// The earliest/latest dose INSTANT in a group, chosen by absolute time (an instant
// ordering is zone-independent), returned as the raw ISO so the caller keeps exact
// recency and can bucket the day itself. A dose whose occurred_at won't parse is
// skipped rather than allowed to poison the min/max.
function doseSpan(doses: readonly AttributableDose[]): { firstIso: string | null; lastIso: string | null } {
  let firstMs = Infinity;
  let lastMs = -Infinity;
  let firstIso: string | null = null;
  let lastIso: string | null = null;
  for (const d of doses) {
    const ms = Date.parse(d.occurred_at);
    if (!Number.isFinite(ms)) continue;
    if (ms < firstMs) { firstMs = ms; firstIso = d.occurred_at; }
    if (ms > lastMs) { lastMs = ms; lastIso = d.occurred_at; }
  }
  return { firstIso, lastIso };
}

// The local calendar day ('YYYY-MM-DD') a dose instant falls on, in the given zone.
// `localDayIndexOf` parses the instant and buckets by the zone; `dayKeyFromIndex` is
// its documented inverse (both anchored on Date.UTC), so the round trip is honest.
// Null when the instant is absent or unparseable — the surface omits the date rather
// than printing a guessed one.
function dayKeyOfInstant(iso: string | null, timeZone: string | undefined): string | null {
  if (iso == null) return null;
  const idx = localDayIndexOf(iso, timeZone);
  return idx == null ? null : dayKeyFromIndex(idx);
}

// A course's sort instant: the last dose, or -Infinity when nothing is logged (a
// course with no dose sorts last within its active/past group). Parseable by
// construction — `lastDoseIso` only ever comes from `doseSpan`, which sets it from a
// finite instant.
function sortMs(lastDoseIso: string | null): number {
  return lastDoseIso == null ? -Infinity : Date.parse(lastDoseIso);
}

/**
 * Derive the pet's medication courses — one per regimen (enriched), plus one per drug
 * whose doses attach to no regimen (dose-derived). Pure, clock-free, deterministic.
 *
 * Ordering (spec §3): active first, then most-recent last dose first, with a stable
 * name→key tiebreak so a snapshot never flickers.
 */
export function deriveMedicationCourses(input: MedicationHistoryInput): MedicationCourse[] {
  const { regimens, doses, timeZone } = input;

  // ONE attribution pass — its tallies (counts), grouping (per-regimen doses for
  // first/last), and leftovers (the orphans) are an exact partition of every live dose.
  const { tallies, grouped, unattributed } = attributeDoses(regimens, doses);

  const courses: MedicationCourse[] = [];

  // 1. Regimen courses (enriched). Dates come from the regimen's own DATE columns;
  //    the dose evidence (count, first/last) comes from its attributed doses.
  for (const r of regimens) {
    const tally = tallies.get(r.id) ?? emptyTally();
    const attributed = grouped.get(r.id) ?? [];
    const { firstIso, lastIso } = doseSpan(attributed);
    const isActive = r.status === 'active';
    const end = endRegister(r.status, r.ended_at, lastIso);

    // An ended course's DOSE EVIDENCE (count, first/last dose) can legitimately post-date
    // `ended_at`: a dose carrying an explicit `medication_id` link is authoritative and
    // attributed regardless of the regimen window (B-153), so an owner who kept logging
    // after marking a course complete adds real doses past its end date. `dosesLogged`
    // and `lastDoseDay` stay honest to that; `runDays` does not (it spans the DATE columns
    // only). A consumer that renders BOTH a date range and a count for an ended course —
    // the PR 5 lifetime table — must keep the two coherent (carried into that PR's
    // mandatory vet-report-cold-read). It is not resolved here: overriding the
    // authoritative-link semantics is a base-module change with its own regression surface.

    // A length exists only once the owner ended the course; an ongoing/active regimen
    // has no honest "N days" (that would be a countdown, which §7/N2 forbids). Both
    // dates are DATE columns → zone-independent.
    let runDays: number | null = null;
    if (end.kind === 'ended') {
      const s = localDayIndexOf(r.started_at, timeZone);
      const e = r.ended_at != null ? localDayIndexOf(r.ended_at, timeZone) : null;
      if (s != null && e != null) runDays = trialDayCounter(s, e);
    }

    courses.push({
      key: r.id,
      source: 'regimen',
      regimenId: r.id,
      medicationItemId: r.medication_item_id,
      drugName: r.drug_name,
      isActive,
      tally,
      dosesLogged: dosesTowardTarget(tally),
      firstDoseIso: firstIso,
      lastDoseIso: lastIso,
      firstDoseDay: dayKeyOfInstant(firstIso, timeZone),
      lastDoseDay: dayKeyOfInstant(lastIso, timeZone),
      startedAt: r.started_at,
      dosesPerDay: r.doses_per_day,
      scheduleNotes: r.schedule_notes,
      route: r.route,
      doseAmount: r.dose_amount,
      plannedDoses: plannedDosesFor(r),
      targetDurationDays: r.target_duration_days,
      runDays,
      end,
    });
  }

  // 2. Dose-derived courses — orphan doses grouped by drug. A dose with no
  //    medication_item_id folds into a single "unspecified" bucket (matching the
  //    report's §3.8 handling); with no delete-item UI today every ad-hoc dose carries
  //    an id, so in practice this bucket holds one genuinely-nameless drug at most.
  //    Revisit if item deletion ships (B-305). These NEVER carry an ending (H1 by
  //    construction: no regimen, no status, so `end` is always `none`).
  const orphanGroups = new Map<string, AttributableDose[]>();
  for (const d of unattributed) {
    const key = d.medication_item_id ?? '';
    const arr = orphanGroups.get(key);
    if (arr) arr.push(d);
    else orphanGroups.set(key, [d]);
  }

  for (const [itemKey, group] of orphanGroups) {
    const medicationItemId = itemKey === '' ? null : itemKey;
    const tally = tallyDoses(group);
    const { firstIso, lastIso } = doseSpan(group);
    courses.push({
      key: `item:${medicationItemId ?? 'unspecified'}`,
      source: 'doses',
      regimenId: null,
      medicationItemId,
      drugName: null,
      isActive: false, // no regimen → no lifecycle → never an active card
      tally,
      dosesLogged: dosesTowardTarget(tally),
      firstDoseIso: firstIso,
      lastDoseIso: lastIso,
      firstDoseDay: dayKeyOfInstant(firstIso, timeZone),
      lastDoseDay: dayKeyOfInstant(lastIso, timeZone),
      startedAt: null,
      dosesPerDay: null,
      scheduleNotes: null,
      route: null,
      doseAmount: null,
      plannedDoses: null,
      targetDurationDays: null,
      runDays: null,
      end: { kind: 'none', lastDoseIso: lastIso },
    });
  }

  // Ordering: active first, then most-recent last dose first, then a stable
  // name→key tiebreak (deterministic — no clock, no locale surprise).
  courses.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    const am = sortMs(a.lastDoseIso);
    const bm = sortMs(b.lastDoseIso);
    if (am !== bm) return bm - am;
    const an = a.drugName ?? '';
    const bn = b.drugName ?? '';
    if (an !== bn) return an < bn ? -1 : 1;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });

  return courses;
}
