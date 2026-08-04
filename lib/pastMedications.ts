// Past medications — the profile section's row copy (B-140 extended, PR 2).
//
// `lib/medicationHistory.ts` computes the SHAPE and the FACTS of a course (spec §3);
// THIS module owns the profile "Past medications" section's COPY over that shape — the
// row name, the one fact line, and the two-register pill. It is kept pure and separate
// from the component (`components/profile/PastMedicationsSection.tsx`) for the same
// reason the derivation is: the H1/H2 invariants are pinned by copy tests
// (`pastMedications.test.ts`, spec §5), not left to review.
//
// ── H1 — an ending renders ONLY from an owner action ─────────────────────────────
// The pill says "Ended" solely for `end.kind === 'ended'` (a completed/stopped status).
// Every other course — active, paused, an unknown future status, or a dose-derived one,
// however old its last dose — says "No end recorded", and the fact line states the
// last-dose date instead. Silence never becomes an ending: this module switches on
// `end.kind`, never on a date, so there is no code path from "went quiet" to "Ended".
//
// ── H2 — a COUNT, never an adherence percentage or grade ──────────────────────────
// The fact line states a dose count ("26 doses logged"), never a "%", never "of N
// planned" (that fuller, denominator-bearing phrasing is the med-detail screen's job,
// PR 3, where the report's adherence register belongs). A percentage judges the owner;
// the section is reference material, not a report card.

import type { MedicationCourse } from './medicationHistory';
import { drugDisplayName } from './medications';

// ── Name resolution ──────────────────────────────────────────────────────────────
// A regimen course names itself (`drugName`); a dose-derived (orphan) course exposes
// only a `medicationItemId`, so the surface resolves the owner-facing name from the
// catalog. Brand-first (`drugDisplayName`, B-171) — this is an app surface, so the pet
// owner's word wins; the vet report builds its own clinical (generic-first) names.

export interface MedicationItemName {
  generic_name: string;
  brand_name: string | null;
}

// The honest neutral fallback for a course whose drug we genuinely cannot name — the
// "unspecified" orphan (a dose with no `medication_item_id`), or an item id whose
// catalog row has not cached locally yet. Never a guessed name.
export const FALLBACK_DRUG_NAME = 'Medication';

export function pastCourseName(
  course: MedicationCourse,
  itemNames: Map<string, MedicationItemName>,
): string {
  if (course.drugName) return course.drugName; // regimen course carries its own name
  if (course.medicationItemId) {
    const n = itemNames.get(course.medicationItemId);
    const label = drugDisplayName(n?.generic_name, n?.brand_name);
    if (label) return label;
  }
  return FALLBACK_DRUG_NAME;
}

// ── Dates — clock-free, locale-free, timezone-honest ─────────────────────────────
// Every date here is a 'YYYY-MM-DD' lexical key: a regimen DATE column (zone-
// independent), or a dose's LOCAL day already bucketed by the derivation in the
// caller's zone. They are parsed LEXICALLY (never `new Date('2026-03-03')`, which the
// B-441 trap reads one day low behind UTC) and month names come from a constant, so
// the output has no locale drift and the copy tests pin exact strings under any CI zone.

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

// Range validation only (1–12 / 1–31), NOT full calendar validity — an impossible
// 'YYYY-MM-DD' cannot reach here: every input is a Postgres DATE column or a
// `dayKeyFromIndex` output, both calendar-valid by construction. A `new Date`-based
// round-trip (as `localDayIndexOf` uses) would catch Feb-30, but re-introducing the
// instant parsing this module deliberately avoids (B-441) to guard an unreachable case
// isn't worth it. The regex rejects the shapes that actually vary (nulls, free text).
function parseKey(key: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

// "Mar 3" — no year; used only INSIDE a same-year range, where the year is stated once
// on the range's end.
function shortDay(key: string): string | null {
  const p = parseKey(key);
  return p ? `${MONTHS[p.m - 1]} ${p.d}` : null;
}

// "Mar 3, 2026" — a standalone date always carries its year. A medication history spans
// years by nature ("has she ever been on steroids?"), so a bare "Feb 11" would be
// genuinely ambiguous; the year is the honest choice for this surface (a deliberate
// refinement of the exploratory round-1 mock, which omitted it for compactness).
function shortDayYear(key: string): string | null {
  const p = parseKey(key);
  return p ? `${MONTHS[p.m - 1]} ${p.d}, ${p.y}` : null;
}

// A course window as one scannable string:
//   • single date (start === end, or only one present) → "Feb 11, 2026"
//   • same year                                        → "Mar 3 – Mar 16, 2026"
//   • cross-year                                       → "Dec 28, 2025 – Jan 5, 2026"
// Returns null when neither date parses — the surface omits the range rather than
// printing a guessed one.
export function courseDateRange(startKey: string | null, endKey: string | null): string | null {
  const s = startKey ? parseKey(startKey) : null;
  const e = endKey ? parseKey(endKey) : null;
  if (s && e) {
    if (startKey === endKey) return shortDayYear(startKey as string);
    if (s.y === e.y) return `${shortDay(startKey as string)} – ${shortDayYear(endKey as string)}`;
    return `${shortDayYear(startKey as string)} – ${shortDayYear(endKey as string)}`;
  }
  if (s) return shortDayYear(startKey as string);
  if (e) return shortDayYear(endKey as string);
  return null;
}

// ── Dose count phrase ────────────────────────────────────────────────────────────
// A COUNT, never a rate (H2). The number is `dosesLogged` = `dosesTowardTarget` (given +
// partial — therapy delivered, the H4 predicate), so the verb is "given", NOT "logged":
// "logged" implies the raw count of recorded events and would quietly disown the refused/
// missed doses the count already excludes. Zero reads "No doses given", which is honest
// for both an ended regimen with nothing recorded and a course whose doses were all
// refused — no therapy was delivered either way. (Whether this reference surface should
// additionally SURFACE refusals is a clinical/design call tracked in the backlog, not a
// copy tweak — the count itself is H4-mandated and correct.)
function dosesPhrase(count: number): string {
  if (count === 0) return 'No doses given';
  const noun = count === 1 ? 'dose' : 'doses';
  return `${count} ${noun} given`;
}

// The one fact line under the drug name. The two registers use DISTINCT date grammar on
// purpose, so the line never contradicts the pill above it:
//
//   • Ended — a closed "start – end" window (the owner asserted the end), its length, and
//     the count: "Mar 3 – Mar 16, 2026 · 14 days · 26 doses given". The dates are the
//     regimen's DATE columns (what the owner asserted), never the dose span.
//
//   • No end recorded — the count, then the LAST-dose date framed AS the last dose:
//     "3 doses given · last dose Jun 4, 2026". Deliberately NOT a "start – end" range —
//     that grammar reads as a closed course and would fight the "No end recorded" pill,
//     and a wide span (an ad-hoc drug logged in separate bursts months apart) would read
//     as one continuous course. Showing only the last dose keeps the open register honest.
export function pastCourseMeta(course: MedicationCourse): string {
  if (course.end.kind === 'ended') {
    const parts: string[] = [];
    // A window only reads as a range when BOTH ends exist. An owner CAN end a course
    // without recording a date (H1's null-endedAt case), so a lone start says "Started
    // …" rather than a bare date that reads as ambiguous (start? end?).
    if (course.startedAt && course.end.endedAt) {
      parts.push(courseDateRange(course.startedAt, course.end.endedAt) as string);
    } else if (course.startedAt) {
      parts.push(`Started ${shortDayYear(course.startedAt)}`);
    } else if (course.end.endedAt) {
      parts.push(`Ended ${shortDayYear(course.end.endedAt)}`);
    }
    if (course.runDays != null) {
      parts.push(`${course.runDays} ${course.runDays === 1 ? 'day' : 'days'}`);
    }
    parts.push(dosesPhrase(course.dosesLogged));
    return parts.join(' · ');
  }

  // No end recorded — the count, then the last-dose date. A single dose shows a bare date
  // (no range grammar to disambiguate); multiple doses name it "last dose {date}" so the
  // line reads as an open record, not a closed span. A course with no logged dose falls
  // back to its start date; a bare item-less orphan (vanishingly rare) shows just the count.
  const parts: string[] = [dosesPhrase(course.dosesLogged)];
  if (course.lastDoseDay) {
    parts.push(
      course.firstDoseDay === course.lastDoseDay
        ? (shortDayYear(course.lastDoseDay) as string)
        : `last dose ${shortDayYear(course.lastDoseDay) as string}`,
    );
  } else if (course.startedAt) {
    parts.push(`Started ${shortDayYear(course.startedAt) as string}`);
  }
  return parts.join(' · ');
}

// ── The two-register pill ────────────────────────────────────────────────────────
// The pill is the H1 tell: "Ended" ONLY from an owner action, "No end recorded"
// otherwise. `tone` drives the styling (a neutral grey for the firm, owner-asserted
// ending; the medication-blue family for the open record) without leaking colour into
// this pure module.
export type PastCoursePillTone = 'ended' | 'open';

export interface PastCoursePill {
  label: string;
  tone: PastCoursePillTone;
}

export function pastCoursePill(course: MedicationCourse): PastCoursePill {
  return course.end.kind === 'ended'
    ? { label: 'Ended', tone: 'ended' }
    : { label: 'No end recorded', tone: 'open' };
}

// ── The row view-model ───────────────────────────────────────────────────────────
export interface PastCourseRow {
  key: string;
  name: string;
  meta: string;
  pill: PastCoursePill;
  // The course's catalog item, retained for the PR-3 detail route (which is keyed by a
  // medication_items id). Null for a free-text regimen or an unspecified orphan. NOT used
  // for navigation in PR 2 — past rows are non-tappable until PR 3 builds the destination
  // (a tap into today's editable catalog screen would invite editing the wrong data).
  medicationItemId: string | null;
}

export function buildPastCourseRow(
  course: MedicationCourse,
  itemNames: Map<string, MedicationItemName>,
): PastCourseRow {
  return {
    key: course.key,
    name: pastCourseName(course, itemNames),
    meta: pastCourseMeta(course),
    pill: pastCoursePill(course),
    medicationItemId: course.medicationItemId,
  };
}

// The section reads PAST courses only — active courses live on the "Current
// medications" card, and the derivation makes a course active XOR past, so filtering
// here can never duplicate a course across the two surfaces (QA §7.3). Ordering is the
// derivation's (most-recent last dose first); this preserves it.
export function buildPastCourseRows(
  courses: MedicationCourse[],
  itemNames: Map<string, MedicationItemName>,
): PastCourseRow[] {
  return courses
    .filter((c) => !c.isActive)
    .map((c) => buildPastCourseRow(c, itemNames));
}
