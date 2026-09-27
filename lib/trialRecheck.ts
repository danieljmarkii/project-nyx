// Get ready's trial row, grown into the recheck (TS-8 · CUL-1304;
// `docs/nyx-trial-screen-requirements.md` §0.2 T-3, §8; `docs/nyx-vet-visits-requirements.md`
// §4.1 B1). Pure: `buildWorthRaising` calls it, `components/trialScreen/RecheckQuestions`
// draws it.
//
// ── THE QUESTIONS ARE THE VET'S, THE ANSWERS ARE THE SCREEN'S ────────────────────────
// Dr. Chen's recheck checklist (the Zoetis protocol, the August pass §5.2): has anything
// else gone in her mouth, chewables included · is she eating it · what did the symptoms do ·
// what else is she on · weight. Those five headings, in his order, are the only copy this
// module writes, and none of them states a record fact.
//
// Every answer is QUOTED from a module that already renders it:
//   • the trial's answers come from `buildTrialScreenModel`, the trial screen's own model,
//     so every number here IS the screen's number for the same record, by construction
//     (the AC), not by a second resolver kept in step. Quoting the card directly would
//     have skipped the screen's withholding (S7: no coverage ratio over a pet that may not
//     be eating), and Get ready would have been calmer than the screen;
//   • the medication and weight answers come from the rundown's own tiles, the block
//     printed under this list, so the two can never disagree (CUL-967 is the cost of that
//     rule, stated there; the fix for the duplication is its own call).
// Nothing here counts, windows or re-phrases (G6, CUL-746).
//
// ── A QUESTION THE RECORD CAN'T ANSWER IS LEFT OUT (PM ruling D1, 2026-09-27) ────────
// Never answered with a "none" or a gap line. The case that decided it: the vomiting line
// is WITHHELD over a pet that may not be eating, and a heading with nothing under it (or
// "nothing logged") would read as "no vomiting" over exactly that cat. Silence is never
// an answer.
//
// ── ACTIVE TRIALS ONLY (PM ruling D3, 2026-09-27) ─────────────────────────────────────
// Today's trial row renders only while a trial runs (the Home strip's model), and this one
// keeps that scope. An ended trial has no row. CUL-1340 holds the recheck after "This trial
// is done".

import type { TrialScreenModel, TrialScreenTrial } from './trialScreenModel';
import type { Rundown } from './rundown';
import type { TrialFactsState } from '../hooks/useTrialFacts';

/**
 * The facts read Get ready hands `buildTrialScreenModel`: "a trial exists, and no ledger".
 *
 * The screen reads `TrialFacts` for two things only, the day ledger and its freshness
 * gate (`trialScreenModel.ts`), and Get ready draws neither. The gate's job (nothing that
 * counts renders until the read answered FOR THIS PET) is done here by the page's own
 * load, which awaits the trial input for the appointment's pet before building. So this
 * page makes no second facts read, and the parity test proves the record lines and the
 * vomiting sentence equal the screen's with the real facts in place.
 */
export const NO_LEDGER_FACTS: TrialFactsState = { status: 'ready', facts: null };

export type RecheckQuestionKey = 'by_mouth' | 'eating' | 'symptoms' | 'other_meds' | 'weight';

/** Dr. Chen's order. Pinned by the test; a reorder is a clinical call, not a layout one. */
export const RECHECK_QUESTION_ORDER: readonly RecheckQuestionKey[] = [
  'by_mouth',
  'eating',
  'symptoms',
  'other_meds',
  'weight',
];

/** The eyebrow over the questions. States nothing about the record. */
export const RECHECK_EYEBROW = 'What the vet will ask';

/** The heading for each question. The vet's words, with the pet's name. */
export function recheckQuestion(key: RecheckQuestionKey, petName: string): string {
  switch (key) {
    case 'by_mouth':
      return `Has ${petName} had anything besides the trial diet, chewable medicine included?`;
    case 'eating':
      return `Is ${petName} eating the trial diet?`;
    case 'symptoms':
      return `What have ${petName}’s symptoms done?`;
    case 'other_meds':
      return `What else is ${petName} on?`;
    case 'weight':
      return `What does ${petName} weigh?`;
  }
}

/**
 * One quoted answer.
 *   flag      — a safety register line, drawn as the screen's safety face draws it;
 *   fact      — a record statement, drawn as body text;
 *   quiet     — a qualifier or a denominator, drawn as the screen draws its qualifier.
 */
export interface RecheckAnswer {
  text: string;
  /** A tile's label ("Cerenia") when the answer quotes a rundown tile; null otherwise. */
  label: string | null;
  role: 'flag' | 'fact' | 'quiet';
}

export interface RecheckQuestion {
  key: RecheckQuestionKey;
  question: string;
  answers: RecheckAnswer[];
}

export interface TrialRecheck {
  /** The strip's header, verbatim ("Rabbit trial · day 23 of 56"). */
  title: string;
  /** The screen's sub-line ("Royal Canin … · since Sep 4 · ends Oct 29"). */
  subline: string | null;
  questions: RecheckQuestion[];
  /** True when *Is she eating it?* carries a safety register line. The row then leads
   *  the list above the cap, like every other safety row (Principle 3). */
  isSafety: boolean;
}

export interface TrialRecheckArgs {
  /** `buildTrialScreenModel` for this appointment's pet. */
  screen: TrialScreenModel;
  /** The rundown built for this same screen. */
  rundown: Rundown;
  /**
   * Worth raising's weight row, when it fired ("Last weighed Sep 11 — before the last
   * visit"). It FOLDS in here (PM ruling D2): with a trial row on the page the weight is
   * said once, under the vet's question. Null when it did not fire.
   */
  weight: { text: string; detail: string | null } | null;
  /**
   * The intake-decline headlines the list already states in its safety band (the device's
   * own, `input.intakeDecline`). The card's decline register LEADS with that same sentence,
   * so it is dropped here rather than printed twice on the page read aloud (CUL-950's
   * lesson). The ask under it ("needs a call today") stays: the list states it nowhere else.
   */
  statedDeclines: readonly string[];
}

export function buildTrialRecheck(args: TrialRecheckArgs): TrialRecheck | null {
  const { screen } = args;
  if (screen.kind !== 'trial' || !isRunning(screen)) return null;

  const stated = new Set(args.statedDeclines);
  const byMouth: RecheckAnswer[] = [];
  const eating: RecheckAnswer[] = [];

  // The safety face's register lines answer the eating question: a trial refusal is the
  // record saying she is not, and an intake decline is the record saying she stopped.
  for (const line of screen.safety ?? []) {
    if (stated.has(line)) continue;
    eating.push({ text: line, label: null, role: 'flag' });
  }

  // The record region, in the screen's order. Two kinds of line answer the eating
  // question rather than the by-mouth one, and they are routed by the ROLE the card gave
  // them, never by matching their text:
  //   • `teach` — "Most of Mochi's logged meals don't yet say how much was eaten" is the
  //     record saying it cannot answer *is she eating it*, which is the honest answer;
  //   • a free-fed trial's `lead` — the topped-up bowl, so "there's no day-by-day count
  //     of what was eaten". The same answer, for Sam's cat.
  // Everything else (coverage, the exposure sentence, the forward line after a slip, the
  // caveats) is the record of what went in.
  for (const line of screen.facts) {
    if (line.role === 'teach' || (screen.state === 'free_fed' && line.role === 'lead')) {
      eating.push({ text: line.text, label: null, role: 'fact' });
    } else if (line.role === 'qualifier' || line.role === 'caveat') {
      byMouth.push({ text: line.text, label: null, role: 'quiet' });
    } else {
      byMouth.push({ text: line.text, label: null, role: 'fact' });
    }
  }
  // The trial-level contaminant fact (C2): the trial diet itself carries something, which
  // is an answer to "anything else by mouth" if anything is.
  if (screen.standingNote) {
    byMouth.push({
      text: `${screen.standingNote.title}. ${screen.standingNote.body}`,
      label: null,
      role: 'fact',
    });
  }
  // The LOCKED qualifier, once, on the claim it qualifies (§5.2). Only beside a claim:
  // with nothing above it, it would qualify nothing.
  if (screen.qualifier && byMouth.some((a) => a.role === 'fact')) {
    byMouth.push({ text: screen.qualifier, label: null, role: 'quiet' });
  }

  // Home's vomiting sentence, verbatim, and null exactly when Home withholds it (T-1).
  const symptoms: RecheckAnswer[] = screen.vomiting
    ? [{ text: screen.vomiting, label: null, role: 'fact' }]
    : [];

  const answers: Record<RecheckQuestionKey, RecheckAnswer[]> = {
    by_mouth: byMouth,
    eating,
    symptoms,
    other_meds: medAnswers(args.rundown),
    weight: weightAnswers(args.rundown, args.weight),
  };

  return {
    title: screen.title,
    subline: screen.subline,
    questions: RECHECK_QUESTION_ORDER.flatMap((key) =>
      answers[key].length > 0
        ? [{ key, question: recheckQuestion(key, screen.petName), answers: answers[key] }]
        : [],
    ),
    isSafety: eating.some((a) => a.role === 'flag'),
  };
}

/** The strip exists only while a trial is active, and this row with it (D3). */
function isRunning(screen: TrialScreenTrial): boolean {
  return screen.state !== 'completed' && screen.state !== 'abandoned' && screen.state !== 'no_trial';
}

/**
 * The rundown's Current meds tiles, quoted. One tile per active regimen ("Cerenia" · "As
 * needed · last dose Sep 20"), or its own "None active" — a record statement the rundown
 * already prints under this list, over the same regimens, so quoting it adds no claim.
 */
function medAnswers(rundown: Rundown): RecheckAnswer[] {
  return rundown.tiles
    .filter((t) => t.key === 'meds')
    .map((t) =>
      t.empty
        ? { text: t.value, label: null, role: 'fact' as const }
        : { text: t.value, label: t.label, role: 'fact' as const },
    );
}

/**
 * The weight: Worth raising's own weight claim when it fired (its date, then the range
 * under it), else the rundown's weight tile (the range and its weigh-in count, or "No
 * weigh-ins logged").
 */
function weightAnswers(
  rundown: Rundown,
  claim: { text: string; detail: string | null } | null,
): RecheckAnswer[] {
  if (claim) {
    const out: RecheckAnswer[] = [{ text: claim.text, label: null, role: 'fact' }];
    if (claim.detail) out.push({ text: claim.detail, label: null, role: 'quiet' });
    return out;
  }
  const tile = rundown.tiles.find((t) => t.key === 'weight');
  if (!tile) return [];
  const out: RecheckAnswer[] = [{ text: tile.value, label: null, role: 'fact' }];
  if (tile.detail) out.push({ text: tile.detail, label: null, role: 'quiet' });
  return out;
}
