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

// ── The one safety net on *Stopped* / *Ended* (CUL-951) ─────────────────────────

/**
 * The confirm an owner sees before *Stopped* ends a course or *Ended* ends a trial.
 *
 * A CONFIRM BEFORE, NOT A WAY BACK AFTER (C-21 — exactly one safety net per
 * destructive action; PM ruling 2026-09-22). Reversal would mean un-ending a course,
 * which the app has no concept of, and the H1 register says *Ended* comes only from
 * an owner action — so the action is made deliberate rather than undoable.
 *
 * The chips are three of equal weight and only one of them is irreversible, which is
 * why the dialog NAMES what ends and WHEN: "Stop it?" over a bare chip would confirm
 * the tap, not the consequence. The date is passed in by the caller as a label, the
 * `courseRowSubtitle` precedent (this module formats no dates of its own), and the
 * caller hands the SAME day to the write, so the date the owner is shown and the date
 * the record gets are one value.
 *
 * *Keep it* is the cancel and mock round 6's A7 wording: it answers "Stop Motozol?"
 * with what actually happens — the course stays. It does NOT select the *Keep* chip;
 * the row goes back to its resting state, unanswered.
 */
export interface EndConfirmCopy {
  title: string;
  body: string;
  /** The cancel — nothing is written. */
  keepLabel: string;
  /** The destructive button. */
  confirmLabel: string;
}

export function stopCourseCopy(args: {
  drugName: string;
  petName: string;
  /** 'Sep 22' — the day `endRegimen` will write, formatted by the caller. */
  endLabel: string;
}): EndConfirmCopy {
  const drug = args.drugName.trim();
  return {
    title: `Stop ${drug}?`,
    // The second sentence is the Pet tab's own end-medication confirm
    // (`confirmEndRegimen`), word for word: the claim is about the DOSES, which are
    // events and untouched by the course's status — so it holds whatever the report
    // does with the ended course itself.
    body: `${args.petName}’s ${drug} course ends today, ${args.endLabel}. Its logged doses stay on the timeline and in vet reports.`,
    keepLabel: 'Keep it',
    confirmLabel: 'Stop it',
  };
}

export function endTrialCopy(args: {
  /** The trial's food, or null — never the row's 'Diet trial' stand-in, which would
   *  read "End the Diet trial trial?". */
  foodLabel: string | null;
  petName: string;
  /** 'Sep 22' — the day `endActiveTrial` will write. */
  endLabel: string;
}): EndConfirmCopy {
  const food = args.foodLabel?.trim();
  return {
    title: food ? `End the ${food} trial?` : 'End the diet trial?',
    // The same claim the course confirm makes about its doses, and for the same
    // reason it holds: it is about the ENTRIES logged during the trial — events, which
    // ending the trial does not touch — not about how the report renders the trial
    // itself (that reads `ended_at` first, `trialEndValue` in generate-report). A
    // first draft said "the timeline" alone, and beside the course confirm's "and in
    // vet reports" the gap read as "ending the trial takes it out of the report"
    // (pm-feature-review, Jordan).
    body: `${args.petName}’s trial ends today, ${args.endLabel}. Everything logged during it stays on the timeline and in vet reports.`,
    keepLabel: 'Keep it',
    confirmLabel: 'End it',
  };
}

/**
 * What a row says once *Stopped* or *Ended* has been confirmed — the row stays where
 * it was and says what happened, instead of vanishing (CUL-951).
 *
 * The vanishing was the only feedback the screen gave: the course re-read filters
 * `status = 'active'`, so an answered row simply left the list, and a trial left
 * behind *Start a trial* — the app asking to start one a second after the owner said
 * the vet stopped one.
 *
 * "today" only while it is still today. A screen left open past midnight would
 * otherwise go on saying "today" about yesterday, so the other branch names the day.
 */
export function settledVerdictLine(args: {
  verdict: 'stopped' | 'ended';
  /** 'YYYY-MM-DD' — the day the write recorded. */
  endedOn: string;
  /** 'YYYY-MM-DD' — the reading device's local today. */
  today: string;
  /** 'Sep 22', for the not-today branch. */
  endLabel: string;
}): string {
  const verb = args.verdict === 'stopped' ? 'Stopped' : 'Ended';
  return args.endedOn === args.today ? `${verb} today` : `${verb} ${args.endLabel}`;
}

/**
 * The course list after a re-read, with every course settled on this screen kept in
 * the place it held (CUL-951).
 *
 * The re-read is the right source for everything ELSE — a course added through the
 * sheet, a dose amount changed through *Changed* — so this only overrides it for the
 * rows the owner has already answered with *Stopped*, which the read can no longer
 * see (it filters `status = 'active'`). Order is the previous render's, with any new
 * course appended: a list that re-sorted under the owner's thumb after every answer
 * would put the next chip where the last one was.
 *
 * Generic over the row so the rule is testable without the record's shape.
 */
export function mergePlanCourses<T extends { id: string }>(
  prev: ReadonlyArray<T>,
  fresh: ReadonlyArray<T>,
  settledIds: ReadonlySet<string>,
): T[] {
  const freshById = new Map(fresh.map((c) => [c.id, c] as const));
  const kept: T[] = [];
  for (const c of prev) {
    if (settledIds.has(c.id)) kept.push(c);
    else {
      const next = freshById.get(c.id);
      if (next) kept.push(next);
    }
  }
  const seen = new Set(kept.map((c) => c.id));
  for (const c of fresh) if (!seen.has(c.id)) kept.push(c);
  return kept;
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
 * Does this visit, as dated, anchor anything the owner can see?
 *
 * A FUTURE-DATED visit anchors nothing and is claimed for nothing — not the report,
 * which skips it until the day arrives, and not Home, whose unbounded
 * `MAX(visited_at)` WOULD adopt it and then render an absence over a window that
 * cannot contain anything. That second case is why this gates both lines rather
 * than only the report's: a true sentence about a false window is the worse of the
 * two.
 *
 * EXPORTED because the saved moment is no longer its only reader. The EDIT screen
 * carried the consequence as an unconditional sentence — *"Moving this date moves
 * where {pet}'s vet report starts"* — under a date field on every visit, so
 * correcting a typo on a March visit told an owner they had moved their report
 * window (CUL-953 item 1). It is the same question, so it is the same function:
 * a second copy of this rule beside an editor is how the two drift, and the
 * screen that drifts is the one making the claim BEFORE the write.
 */
export function visitAnchorsAnything(consequence: VisitConsequence): boolean {
  return consequence.isLatest && consequence.dayRelation !== 'after_today';
}

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
  const anchorsAnything = visitAnchorsAnything(consequence);

  let reportLine: string | null = null;
  if (anchorsAnything && consequence.dayRelation === 'before_today') {
    reportLine = `${petName}’s vet report now starts from this visit.`;
  } else if (anchorsAnything) {
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
    homeLine: anchorsAnything ? '“Since last visit” on Home starts again from here.' : null,
    linked,
    offlineLine: VISIT_OFFLINE_LINE,
  };
}
