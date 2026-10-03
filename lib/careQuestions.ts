import type { CareSign } from './careState';
import { formatCalendarDate, toLocalDayKey } from './utils';

// The one question above a raised concern's answers (Engines v3 PR-35, CUL-1418;
// docs/nyx-care-state-requirements.md §0.3 PMD-4, §3.2, §9; mock round 3 §01 1b and
// round 2's loop, §08 frame 5).
//
// Pure: the screen reads the pet's running trial, its active courses and its latest visit,
// and this decides which of them may be asked about, in what words, and what a "yes" writes.
// At most ONE is drawn (the screen asks `lib/careQuestionAsked.ts` which one may be shown
// today), in this order:
//
//   1. PMD-4 A, the trial. "Did {pet's} vet start it for the {sign}?" once per sign per
//      trial. Yes stores `vet_started_trial`, anchored on the trial's start, scoped to it.
//      It is never matched from the trial's indication: the owner says which sign (§0.3).
//   2. PMD-4 A, a course. The same question for each active course, newest first.
//   3. The visit already on record (§3.2, §9): one question for the latest visit, and only a
//      visit on or after the concern's first onset — a February vaccine visit never
//      acknowledges June's vomiting, and the server refuses one that does (lapse).
//
// The question order follows what the owner was most likely sent home with: a trial is the
// wedge's own case (Jordan's), then a course, then a visit with no plan attached.

export type CareQuestionKind = 'trial' | 'course' | 'visit';

export interface CareQuestion {
  kind: CareQuestionKind;
  /** The ask-once key: one per (thing asked about, sign). */
  key: string;
  /** The question, one sentence, naming the pet and the sign. */
  text: string;
  /** What a yes does, in a line (never a promise about the vet). Null on the visit question,
   *  whose answers say it themselves. */
  hint: string | null;
  /** The answer that writes, and the two that write nothing. */
  yes: string;
  others: [string, string];
  /** What the yes writes. */
  write:
    | { source: 'vet_started_trial'; anchorOn: string; dietTrialId: string }
    | { source: 'vet_started_course'; anchorOn: string; medicationId: string }
    | { source: 'visit_answer'; anchorOn: string; vetVisitId: string };
}

export interface CareQuestionTrial {
  id: string;
  /** `diet_trials.started_at`: a local day or an instant. */
  startedAt: string;
  foodLabel: string | null;
}

export interface CareQuestionCourse {
  id: string;
  drugName: string;
  /** `medications.started_at`, 'YYYY-MM-DD'. */
  startedAt: string;
}

export interface CareQuestionVisit {
  id: string;
  /** `vet_visits.visited_at`, 'YYYY-MM-DD'. */
  visitedAt: string;
}

export interface CareQuestionInput {
  petName: string;
  sign: CareSign;
  /** The owner's word for the sign ("vomiting", "loose stool"). */
  noun: string;
  trial: CareQuestionTrial | null;
  courses: readonly CareQuestionCourse[];
  latestVisit: CareQuestionVisit | null;
  /** The concern's first onset in the engine's lookback (`firstOnsetIso`), or null when the
   *  finding carries none (a worsening card alone): then no visit is asked about. */
  onsetIso: string | null;
  /** Today, 'YYYY-MM-DD', local. */
  today: string;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A stored date as a local day: a bare DATE stays itself, an instant takes its local day. */
export function localDayOf(value: string | null | undefined): string | null {
  if (!value) return null;
  if (DAY_RE.test(value)) return value;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : toLocalDayKey(new Date(t));
}

function possessive(name: string): string {
  return name.endsWith('s') ? `${name}'` : `${name}'s`;
}

/** Every question this concern may be asked, in the order they are offered. The screen shows
 *  the first one the ask-once memory allows. */
export function careQuestionsFor(input: CareQuestionInput): CareQuestion[] {
  const { petName, sign, noun, today } = input;
  const out: CareQuestion[] = [];
  const vets = possessive(petName);

  const trialStart = localDayOf(input.trial?.startedAt);
  if (input.trial && trialStart && trialStart <= today) {
    const since = formatCalendarDate(trialStart);
    const what = input.trial.foodLabel ? `the ${input.trial.foodLabel} trial` : 'a diet trial';
    out.push({
      kind: 'trial',
      key: `trial:${input.trial.id}:${sign}`,
      text: `${petName} has been on ${what} since ${since}. Did ${vets} vet start it for the ${noun}?`,
      hint: 'If you say yes, Home stops asking you to book while the trial runs.',
      yes: 'Yes, for this',
      others: ['No', 'Not sure'],
      write: { source: 'vet_started_trial', anchorOn: trialStart, dietTrialId: input.trial.id },
    });
  }

  for (const c of input.courses) {
    const start = localDayOf(c.startedAt);
    if (!start || start > today) continue;
    out.push({
      kind: 'course',
      key: `course:${c.id}:${sign}`,
      text: `${petName} has been on ${c.drugName} since ${formatCalendarDate(start)}. Did ${vets} vet start it for the ${noun}?`,
      hint: 'If you say yes, Home stops asking you to book while the course runs.',
      yes: 'Yes, for this',
      others: ['No', 'Not sure'],
      write: { source: 'vet_started_course', anchorOn: start, medicationId: c.id },
    });
  }

  const onset = localDayOf(input.onsetIso);
  const visit = input.latestVisit;
  if (visit && onset && DAY_RE.test(visit.visitedAt) && visit.visitedAt >= onset && visit.visitedAt <= today) {
    out.push({
      kind: 'visit',
      key: `visit:${visit.id}:${sign}`,
      text: `${petName} saw the vet on ${formatCalendarDate(visit.visitedAt)}. Did you talk about the ${noun}?`,
      hint: null,
      yes: 'Talked about it',
      others: ['Not this time', 'Later'],
      write: { source: 'visit_answer', anchorOn: visit.visitedAt, vetVisitId: visit.id },
    });
  }
  return out;
}

/** The confirmation after "My vet knows" (mock 2b): what was recorded, its date, and what
 *  Home now does. The promise names only what the record can see (a count the test compares,
 *  refusals the owner logs), never "we'll watch his weight". */
export function myVetKnowsConfirmation(petName: string, noun: string, onDay: string): { said: string; does: string } {
  return {
    said: `You told us on ${formatCalendarDate(onDay)} that ${possessive(petName)} vet knows about the ${noun}.`,
    does: `Home will stop asking you to book. It comes back if the ${noun} comes more often than it has been, or if ${petName} starts refusing meals.`,
  };
}

/** The line under any answer saved before the server has it (mock 3e): the cached Signal
 *  keeps asking until the server recomputes, so the screen says so. */
export const CARE_SAVED_OFFLINE = 'Saved on this phone. Home updates once you’re back online.';
