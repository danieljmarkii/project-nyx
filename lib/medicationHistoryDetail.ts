// Medication history — the med-detail past-course presentation (B-140 extended, PR 3).
//
// The PURE copy layer for surface 2 (`app/medication/[id].tsx`, spec §4.2 + mock §03).
// `lib/medicationHistory.ts` (PR 1) computes the SHAPE and the FACTS of a course; this
// module turns ONE past course into the labelled fact rows + the evidence-link count
// this screen renders. Per the PR-1 header, "each surface owns its own copy/render" —
// so the detail-screen copy lives here (the profile section and the rundown own theirs),
// and it is PURE so the H1/H2/H4 invariants are pinned by `medicationHistoryDetail.test.ts`
// (spec §5 — "enforced by tests over the derivation AND the copy, not by review").
//
// The three rules this copy must hold, restated at the point they are written:
//   H1  An ending is stated ONLY from an owner action (`end.kind === 'ended'`). A course
//       that merely went quiet renders "Last dose logged {day}", never "Ended" — silence
//       is never promoted into a clinical fact. A dose-derived course can never be
//       ended at all (no regimen, no status).
//   H2  Counted facts, never an adherence percentage or grade. "26 of 28 planned" is a
//       count; a "%"/"93%"/a letter grade judges the owner and is forbidden here (the
//       report's adherence narrative owns that clinical register).
//   H4  Every count is the derivation's `dosesLogged` (= `dosesTowardTarget`, therapy
//       delivered). This module never re-counts a tally — it reads the field, so the
//       screen can never contradict the profile card / strip / report for the same course.
import { formatUtcDayShort } from './utils';
import { totalTally } from './medications';
import type { MedicationCourse, MedicationCourseEnd } from './medicationHistory';

export interface CourseFactRow {
  label: string;
  value: string;
}

export interface PastCoursePresentation {
  facts: CourseFactRow[];
  // Whether this course has any logged dose event to open in History. Gated on the TOTAL
  // administrations (every adherence state), NOT just delivered doses — so a course the
  // pet REFUSED entirely (dosesLogged 0, but real refusal events) keeps its doorway to
  // those events. Intake is not preference: a refusal record is a signal, never stranded.
  // A course with zero logged events (an owner-ended regimen with nothing dosed) has no
  // doorway — there is nothing to open.
  hasEvidence: boolean;
}

// The evidence-link label. Deliberately NOT "All N doses in History" (the exploratory
// mock's pre-nyx-voice copy): the link lands on History's WHOLE medication stream — a
// per-drug filter is B-688, not v1 — and a course's delivered count (given + partial)
// excludes the refused/missed events that are also in History, so "All N" would
// over-promise in two directions. A plain, honest doorway; the count already lives in the
// facts above. Final wording is a PM call (see the PR) once B-688 makes a per-drug count true.
export const EVIDENCE_LINK_LABEL = 'See doses in History';

// ── Date formatting ─────────────────────────────────────────────────────────────────
// The course dates are all DATE-style 'YYYY-MM-DD' keys (a regimen's started_at/ended_at
// verbatim; a dose's local-day bucket). They are named by their LITERAL calendar day, so
// they are parsed at UTC midnight and formatted in UTC — the B-441/B-308 idiom that keeps
// a near-midnight day from sliding under the device zone. A malformed key is shown raw
// rather than as a guessed date (the derivation only emits well-formed keys; this is a
// belt-and-braces against a bad column).

function dayMs(dayKey: string): number | null {
  const ms = Date.parse(`${dayKey}T00:00:00Z`);
  return Number.isFinite(ms) ? ms : null;
}

/** 'YYYY-MM-DD' → "Mar 3, 2026" (year-inclusive — a course's year matters to a vet). */
export function formatCourseDay(dayKey: string): string {
  const ms = dayMs(dayKey);
  if (ms == null) return dayKey;
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
}

/** ("2026-03-03","2026-03-16") → "Mar 3 – Mar 16, 2026" (year once when shared). */
export function formatCourseDateRange(startKey: string, endKey: string): string {
  const s = dayMs(startKey);
  const e = dayMs(endKey);
  if (s == null || e == null) return `${formatCourseDay(startKey)} – ${formatCourseDay(endKey)}`;
  const start = new Date(s);
  const end = new Date(e);
  if (start.getUTCFullYear() === end.getUTCFullYear()) {
    const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    return `${startLabel} – ${formatCourseDay(endKey)}`;
  }
  return `${formatCourseDay(startKey)} – ${formatCourseDay(endKey)}`;
}

// ── Fact-row helpers ────────────────────────────────────────────────────────────────

// The dose count line. H4: reads `course.dosesLogged` (never a re-count). H2: a bare
// count, optionally "of N planned" when the regimen carried a planned total — never a %.
// The "of N planned" frame shows ONLY while delivered ≤ planned: doses can legitimately
// post-date a course's end via an authoritative regimen link (lib/medicationHistory.ts),
// so dosesLogged can exceed plannedDoses, and "30 of 28 planned" reads as a bug. Never
// clamp the count (that hides a logged dose); drop the frame, which is meaningless once
// the plan is exceeded — the bare count stays honest.
function dosesLoggedValue(course: MedicationCourse): string {
  return course.plannedDoses != null && course.dosesLogged <= course.plannedDoses
    ? `${course.dosesLogged} of ${course.plannedDoses} planned`
    : `${course.dosesLogged}`;
}


// H1's ONLY ending copy — reached solely from `end.kind === 'ended'`. The register (an
// owner marked it complete vs. stopped it) is the point; the short date echoes the
// Course row's end without repeating its year.
function endedValue(end: Extract<MedicationCourseEnd, { kind: 'ended' }>): string {
  const verb = end.status === 'completed' ? 'Marked complete' : 'Stopped';
  return end.endedAt ? `${verb} ${formatUtcDayShort(end.endedAt)}` : verb;
}

// Cadence + notes → "Twice a day, with food". `doses_per_day = null` is PRN → "As needed"
// (the AddMedicationModal maps "As needed" to null). Named-frequency for the common 1–4
// presets; "N× a day" beyond them.
function formatSchedule(dosesPerDay: number | null, scheduleNotes: string | null): string | null {
  const notes = scheduleNotes?.trim() || null;
  let freq: string;
  if (dosesPerDay == null) freq = 'As needed';
  else if (dosesPerDay === 1) freq = 'Once a day';
  else if (dosesPerDay === 2) freq = 'Twice a day';
  else freq = `${dosesPerDay}× a day`;
  if (freq && notes) return `${freq}, ${notes}`;
  return freq ?? notes;
}

/**
 * Build the labelled fact rows + the evidence-link count for ONE past course.
 * Two shapes, mirroring mock §03: an ended/regimen course (Frame A — dates, length,
 * doses, schedule, ending) and a dose-derived course (Frame B — doses, first/last dose,
 * "No regimen set up"). The caller filters to this drug's PAST courses first — an active
 * course lives on the profile card / med strip, never here (AC #3).
 */
export function buildPastCourseFacts(course: MedicationCourse): PastCoursePresentation {
  const facts: CourseFactRow[] = [];

  if (course.source === 'regimen') {
    // Course dates — the owner-recorded span (DATE columns), or the start alone when no
    // end was recorded. runDays only exists once both dates do, so it never implies a
    // countdown on an open course.
    const endedAt = course.end.kind === 'ended' ? course.end.endedAt : null;
    if (course.startedAt && endedAt) {
      facts.push({ label: 'Course', value: formatCourseDateRange(course.startedAt, endedAt) });
    } else if (course.startedAt) {
      facts.push({ label: 'Course', value: `Started ${formatCourseDay(course.startedAt)}` });
    }
    if (course.runDays != null) {
      facts.push({ label: 'Length', value: `${course.runDays} ${course.runDays === 1 ? 'day' : 'days'}` });
    }
    facts.push({ label: 'Doses logged', value: dosesLoggedValue(course) });
    const schedule = formatSchedule(course.dosesPerDay, course.scheduleNotes);
    if (schedule) facts.push({ label: 'Schedule', value: schedule });
    // H1 — an ending renders ONLY from the owner action; anything else (a paused or
    // unknown status that still isn't active) states the last dose, never an ending.
    if (course.end.kind === 'ended') {
      facts.push({ label: 'Ended', value: endedValue(course.end) });
    } else if (course.lastDoseDay) {
      facts.push({ label: 'Last dose logged', value: formatCourseDay(course.lastDoseDay) });
    }
  } else {
    // Dose-derived (orphan) course — renders from doses alone, NEVER an ending (H1 by
    // construction). One date when every dose fell on one day (a single ad-hoc dose,
    // the Cerenia case); first + last when they span more than a day.
    facts.push({ label: 'Doses logged', value: dosesLoggedValue(course) });
    if (course.firstDoseDay && course.lastDoseDay && course.firstDoseDay !== course.lastDoseDay) {
      facts.push({ label: 'First dose', value: formatCourseDay(course.firstDoseDay) });
      facts.push({ label: 'Last dose logged', value: formatCourseDay(course.lastDoseDay) });
    } else {
      const only = course.lastDoseDay ?? course.firstDoseDay;
      if (only) facts.push({ label: 'Dose logged', value: formatCourseDay(only) });
    }
    facts.push({ label: 'Course', value: 'No regimen set up' });
  }

  return {
    facts,
    // The doorway to History. Gated on TOTAL logged administrations (the shared
    // `totalTally`, every adherence state), not delivered doses — so a fully-refused
    // course keeps its route to those refusal events.
    hasEvidence: totalTally(course.tally) > 0,
  };
}
