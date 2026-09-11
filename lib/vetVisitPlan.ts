// The after-visit screen's view model (CUL-902 / VV-4; spec §4.1 D1–D2, mock D1/D2).
//
// PURE. No database, no clock of its own, no React — every input is passed in. Two
// reasons, and the second is structural: `lib/vetVisits.ts` is the ONE file
// `guards/visitReaders.test.ts` lets read the visit tables, and keeping the derived
// copy out of it keeps that file about rows; and the copy below is the half most
// worth testing exhaustively, which a module that opens a database is not.
//
// WHAT THE ROWS ARE. Each plan row reads the record BEFORE it asks (CUL-825): an
// existing course renders as a confirmation, never as a blank form, and *Add*
// appears only for something the record does not hold. `Later` is not a button — it
// is every row's resting state, which is what makes an open row a non-blocker
// (Principle 1: zero decisions at the moment of the event).

import type { VisitConsequence } from './vetVisits';

// ── The next-visit row ──────────────────────────────────────────────────────────

/**
 * "Recheck in six weeks" is the sentence a vet says, so the row opens on a date the
 * owner confirms rather than a field they compute (§8 VV-4: a date picker seeded at
 * +6 weeks, not free text parsed).
 *
 * Six weeks is the modal recheck interval in the evidence brief's discharge-sheet
 * sample and — more to the point — it is a SEED, not a claim: the picker is the
 * control and the owner moves it. Nothing downstream treats it as what the vet said.
 */
export const DEFAULT_RECHECK_WEEKS = 6;

/**
 * The seeded recheck date, built from LOCAL calendar components (C-29 — a day
 * question is never answered through `toISOString()`, which is the CUL-946 bug on
 * the screen this replaces).
 */
export function defaultRecheckDate(now: Date = new Date()): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  d.setDate(d.getDate() + DEFAULT_RECHECK_WEEKS * 7);
  return d;
}

// ── The plan rows ───────────────────────────────────────────────────────────────

/** What the owner said about an existing course. `null` is *Later* — the resting state. */
export type CourseVerdict = 'keep' | 'changed' | 'stopped';
/** The same for a running trial. */
export type TrialVerdict = 'keep' | 'ended' | 'switched';

/**
 * A course row's sub-line: what the record holds about this course, and nothing it
 * computes. No dose count, no adherence, no "day N of M" — those belong to the
 * course's own surfaces, and a visit is a provenance anchor rather than a source of
 * numbers (CUL-746). `sinceLabel` is the caller's formatted date (C-19: a
 * record-anchored DATE is free; a DURATION is not).
 */
export function courseRowSubtitle(args: {
  doseAmount: string | null;
  sinceLabel: string | null;
}): string {
  return [args.doseAmount?.trim() || null, args.sinceLabel ? `since ${args.sinceLabel}` : null]
    .filter(Boolean)
    .join(' · ');
}

/**
 * The verb each verdict has already performed, in the past tense the moment lists.
 *
 * Dr. Chen signs these (the issue's review line): *Stopped* and *Ended* are OWNER
 * ACTIONS, which is what the H1 register requires before a course may read as ended
 * — silence is never an ending. Nothing here grades a course or an owner.
 */
export function courseVerdictLabel(verdict: CourseVerdict): string {
  switch (verdict) {
    case 'keep': return 'kept';
    case 'changed': return 'changed';
    case 'stopped': return 'stopped';
  }
}

export function trialVerdictLabel(verdict: TrialVerdict): string {
  switch (verdict) {
    case 'keep': return 'continuing';
    case 'ended': return 'ended';
    case 'switched': return 'switched';
  }
}

// ── The saved moment (mock D2) ──────────────────────────────────────────────────

/** One line of "what was linked", in the order the moment lists them. */
export interface LinkedLine {
  /** A stable key for the list — never rendered. */
  key: string;
  /** 'Cerenia kept', 'Oct 28 · recheck'. */
  title: string;
  /** 'linked to this visit', 'added'. */
  note: string;
}

export interface VisitSaveSummary {
  /** 'Saved to Mochi's visits' — the moment names the pet (C-17). */
  heading: string;
  /**
   * What the save did to the report window, or null when it did nothing to it.
   *
   * NULL IS A REAL ANSWER, and it is the one the mock does not draw: a visit logged
   * late, behind one already on record, changes neither the report window nor Home.
   * Saying "your next vet report starts from this visit" there would be false, and
   * the n=1 rule's sibling applies — a surface may state a consequence, never invent
   * one.
   */
  reportLine: string | null;
  /** Home's "since last visit", or null when this visit is not the anchor. */
  homeLine: string | null;
  linked: LinkedLine[];
  /** The Vet Files offline line, verbatim (§4.1 D2). */
  offlineLine: string;
}

/** Vet Files' own offline line, word for word — one promise, one wording. */
export const VISIT_OFFLINE_LINE = 'On this phone now — backs up when you’re online';

/**
 * The moment's copy, derived from what the record now says.
 *
 * THE REPORT LINE IS THE CLINICALLY LOAD-BEARING STRING ON THIS SCREEN, and it has
 * three forms rather than one because the underlying fact has three:
 *
 *   • the visit is the latest and is dated TODAY → it becomes the report's anchor
 *     TOMORROW. The report's rung 1 is strictly before today, so a report the owner
 *     builds in the car park still runs up to yesterday. The line says both, because
 *     an owner who generates one immediately must not think it is wrong;
 *   • the visit is the latest and is dated BEFORE today → it is the anchor already;
 *   • the visit is not the latest → the window is unchanged, and the moment says
 *     nothing about it.
 *
 * "from today" appears nowhere, in any branch (AC 8). The mock's D2 frame reads
 * "starts from today" and is superseded by the §4.1 D2 ruling, which the spec states
 * twice and AC 9 tests.
 */
export function describeVisitSave(args: {
  petName: string;
  consequence: VisitConsequence;
  linked: LinkedLine[];
}): VisitSaveSummary {
  const { petName, consequence, linked } = args;
  const anchorsReport = consequence.isLatest;

  let reportLine: string | null = null;
  if (anchorsReport && consequence.isBeforeToday) {
    reportLine = `${petName}’s vet report now starts from this visit.`;
  } else if (anchorsReport) {
    reportLine =
      `From tomorrow, ${petName}’s vet report starts from this visit. ` +
      'One you build today still covers up to yesterday.';
  }

  return {
    heading: `Saved to ${petName}’s visits`,
    reportLine,
    // Home's "since last visit" is anchored on the pet's most recent visit with no
    // before-today bound, so it moves the moment this visit becomes the latest —
    // which is why it is a separate sentence from the report's, not a clause in it.
    homeLine: anchorsReport ? '“Since last visit” on Home starts again from here.' : null,
    linked,
    offlineLine: VISIT_OFFLINE_LINE,
  };
}
