// "Outside the trial diet" — the exposures screen (B-616 PR 4 / B-458's second
// half, closing B-475).
// Requirements: docs/nyx-food-library-trial-awareness-requirements.md §2.6.
// Design authority: `docs/nyx-diet-trial-mockups.html` (round 4, design-locked) —
// the "Outside the trial diet" list and the "Why this is on the list" sheet.
//
// PURE, like `trialFoodsScreen.ts` and `trialLibraryChrome.ts` beside it. This is
// the track's only clinically-registered copy, so it lives where a test can hold
// it still rather than inside a component.
//
// ── WHERE EVERY REASON COMES FROM, AND WHY NONE OF THEM IS WRITTEN HERE ──────
//
// B-475 is the whole point of this screen: `lib/dietTrial.explainVerdict` names
// which rung fired for a feeding, and until now it had ZERO callers — so an owner
// told "3 did not [match]" had no way to ask which three, or why. §6.3: a flag the
// owner cannot interrogate is an unfalsifiable accusation.
//
// So the per-row reasons are `explainVerdict` and `oralRouteCopy` verbatim, never
// re-worded here. That is not deference for its own sake — those strings carry
// rulings this module has no business re-litigating: rung 3 hedges ("Culprit hasn't
// read its ingredients") because it is the MODAL case on a real library, and the
// oral-route copy points at the vet for a substitution and never at the next dose,
// because a missed critical dose is a worse outcome than a contaminated trial
// (§6.8). A second wording of either is a second clinical position.
//
// ── WHAT THIS MODULE DOES OWN: THE FRAME, AND G2 ────────────────────────────
//
// Three rules govern every string below.
//
//   • G2 — NO NEGATIVE CLAIM, AT ANY COVERAGE, ON ANY SURFACE. There is no state
//     here that says "no off-diet foods were logged", and there is no empty state
//     that reads as one. Ruled as a RULE rather than a threshold, and it is
//     two-sided: this screen may not reassure on an empty list, and may not alarm
//     on one either.
//   • THE COUNT IS A FLOOR, NEVER A TOTAL (§5.2). It is stated in the footer, in
//     the same breath as the count, and the three blind-spot notes below exist to
//     keep it honest — a free-fed bowl and a feeding that named no food are both
//     real exposures the count structurally cannot hold.
//   • RECORD AND CONTINUE (§6.7). Nothing here says a trial is spoiled, voided or
//     should be restarted, and nothing scores the owner (§6.9). The subject of
//     every sentence is the RECORD.
//
// And one rule inherited from PR 3, which cost a review round to learn: NO SURFACE
// MAY PRINT A COUNT OF ZERO. "0 of 68 logged feedings" is a claim about the record
// dressed as a statistic — so the counting subtitle renders only when there is
// something to count, and the empty screen says what the list is FOR instead.
import {
  explainVerdict,
  oralRouteCopy,
  proteinPhrase,
  type ClassificationRung,
  type OralRouteExposure,
  type TrialExposureItem,
  type TrialFacts,
  type VerdictReason,
} from './dietTrial';
import { formatCalendarDate, formatTime, toLocalDayKey } from './utils';

// ── Copy this module owns ───────────────────────────────────────────────────

export const TRIAL_EXPOSURES_TITLE = 'Outside the trial diet';

/**
 * The design-locked footer, both halves load-bearing.
 *
 * "not a total" is §5.2's floor, stated where the count is read rather than in a
 * legend further down. "Keep going with the trial diet" is §6.7's record-and-
 * continue: an owner who has just read a list of their own logged exposures is
 * exactly the person who might conclude the trial is ruined and stop — and no
 * consulted source instructs a restart. It points at the recheck, which is where
 * this list is actually useful.
 */
export const TRIAL_EXPOSURES_FOOTER =
  'This is what’s been logged, not a total. Keep going with the trial diet — ' +
  'your vet will want this list at the recheck.';

/**
 * The empty screen (Principle 5), and the one string on it G2 constrains hardest.
 *
 * It may not say "nothing outside the trial diet has been logged" — that is the
 * negative claim, deleted from the product at every coverage. It may not congratulate
 * either. What is left, and what is true, is the MECHANISM: what this list holds, and
 * the blind spot that makes it a floor. Reachable in ordinary use, because the card's
 * link is drawn off a count that can be stale by the time the screen renders, and
 * because a feeding can be soft-deleted after the fact.
 */
export const TRIAL_EXPOSURES_EMPTY =
  'Feedings outside the trial diet are listed here, with dates, as they’re logged. ' +
  'Culprit only ever sees what’s been logged.';

/** Rendered instead of the list when the trial ended while the owner was standing
 *  on this screen — the same shape `trialFoodsScreen.noTrialLine` uses, for the
 *  same reason: designed, not blank, and it says where the record went. */
export function noTrialExposuresLine(petName: string): string {
  return (
    `${petName} isn’t on a diet trial right now. While one is running, feedings ` +
    'outside the trial diet are listed here for the recheck.'
  );
}

export const TRIAL_EXPOSURES_GROUP_FEEDINGS = 'Feedings';
/** Rung 4 (C3). Its own group because A DOSE IS NOT A FEEDING: the module returns
 *  the oral route separately and never folds it into the feedings ratio, since
 *  doing so would make `offDiet > totalFeedings` reachable. A flat list under a
 *  "N of M logged feedings" subtitle would re-create that confusion visually even
 *  though the arithmetic stayed correct. */
export const TRIAL_EXPOSURES_GROUP_ORAL = 'Given by mouth';

// ── The model ───────────────────────────────────────────────────────────────

export interface TrialExposureRow {
  key: string;
  /** The food or drug, as the record holds it. */
  label: string;
  /** "Jul 24, 6:40 PM · not recognised" — the when, and which rung fired. */
  meta: string;
  /** `explainVerdict` / `oralRouteCopy`, verbatim. Null only if the module
   *  declines to explain a rung (today: never, for a row that reaches this list) —
   *  and a null reason drops the DISCLOSURE, never the row. An exposure the app
   *  cannot explain still happened. */
  reason: VerdictReason | null;
}

export interface TrialExposureGroup {
  /** Null when this is the only group with rows — a single list under a screen
   *  already titled "Outside the trial diet" needs no second header. */
  title: string | null;
  rows: TrialExposureRow[];
}

export interface TrialExposuresScreenModel {
  title: string;
  /** "3 of 68 logged feedings · Jul 3 – Jul 25", or null when there is nothing to
   *  count (the zero rule) or no readable window to name. */
  subtitle: string | null;
  groups: TrialExposureGroup[];
  /** The blind spots this list structurally cannot hold. Each one exists so the
   *  footer's "not a total" is a description rather than a disclaimer. */
  notes: string[];
  footer: string;
  /** Non-null exactly when every group is empty. */
  empty: string | null;
}

/** The rung, in the four words a row has space for. Never a verdict about the
 *  food — "not recognised" is a statement about what Culprit read, which is
 *  exactly what rung 3 means. */
function rungTag(rung: ClassificationRung, antigens: readonly string[]): string | null {
  switch (rung) {
    case 'derived_protein':
      // The proteins themselves, because on this rung the app genuinely knows
      // something specific and burying it under a generic tag would be a
      // reassurance by omission on the one rung that can name the problem.
      return antigens.length > 0 ? proteinPhrase([...antigens]) : null;
    case 'unrecognised':
      return 'not recognised';
    default:
      return null;
  }
}

/** "Jul 24, 6:40 PM". The LOCAL day and the local time — the owner's own clock is
 *  the one they logged against, and `formatCalendarDate` takes a day key rather
 *  than an instant precisely so a bare calendar day can never shift a date. */
function whenLabel(occurredAt: string): string | null {
  const at = new Date(occurredAt);
  if (Number.isNaN(at.getTime())) return null;
  const date = formatCalendarDate(toLocalDayKey(at));
  if (date === null) return null;
  return `${date}, ${formatTime(at)}`;
}

function metaLine(occurredAt: string, tag: string | null): string {
  const when = whenLabel(occurredAt);
  return [when, tag].filter((p): p is string => p !== null && p !== '').join(' · ');
}

function feedingRow(item: TrialExposureItem): TrialExposureRow {
  const label = item.label ?? 'A food with no name recorded';
  return {
    key: item.eventId,
    label,
    meta: metaLine(item.occurredAt, rungTag(item.classification.rung, item.classification.antigens)),
    // The food label is passed through so the reason names the same food the row
    // does; `explainVerdict` falls back to "This food" on a null.
    reason: explainVerdict(item.classification, item.label),
  };
}

function doseRow(exposure: OralRouteExposure): TrialExposureRow {
  return {
    // Prefixed: a dose and a meal are different events, but a combo dose (B-156)
    // carries the vehicle meal's id in its own row, and two rows sharing a React
    // key is a rendering bug that only appears on the combo path.
    key: `dose:${exposure.eventId}`,
    label: exposure.drugLabel ?? 'A medication',
    meta: metaLine(
      exposure.occurredAt,
      exposure.trigger === 'chewable' ? 'flavoured chewable' : 'given inside food',
    ),
    reason: oralRouteCopy(exposure),
  };
}

/**
 * THE WINDOW THE LIST WAS DRAWN OVER — `exposureRange`, never `range`.
 *
 * This is the rule that cost three adversarial rounds elsewhere in this feature,
 * applied here before it can bite: `range` is the COVERAGE window, clipped at the
 * head (first log) and at the tail (B-422's target end), and re-using it as an
 * evidence bound deletes real logged findings from the artifact that itemises
 * them. A row in this list can sit outside `range` and still be in the record —
 * so the dates printed above the list are the evidence window's, or nothing.
 */
function windowLabel(facts: TrialFacts): string | null {
  const r = facts.exposureRange;
  if (!r) return null;
  const from = formatCalendarDate(dayKeyFromIndex(r.startDayIndex));
  const to = formatCalendarDate(dayKeyFromIndex(r.endDayIndex));
  return from !== null && to !== null ? `${from} – ${to}` : null;
}

/** Day index → day key. The index is an epoch-day of the owner's LOCAL calendar
 *  day (`localDayIndex` builds it from local components via `Date.UTC`), so the
 *  inverse must be read back in UTC or the day shifts for anyone behind it. Two
 *  private copies of this already exist (`dietTrialFacts`, `dietTrialOutcomeFacts`);
 *  consolidating the three is B-632, not this PR. */
function dayKeyFromIndex(index: number): string {
  return new Date(index * 86_400_000).toISOString().slice(0, 10);
}

/**
 * The §2.6 screen.
 *
 * Null when there is no readable record to describe — `facts === null` (a read or
 * the computation failed) or a null range (`computeTrialFacts` could not establish
 * a window at all). The caller renders a spinner for that, NOT an empty list: an
 * empty exposures screen over an unread record is the strongest "nothing happened"
 * claim this track can make, and it would be a fabrication rather than a floor.
 */
export function buildTrialExposuresScreen(
  facts: TrialFacts | null,
): TrialExposuresScreenModel | null {
  if (!facts || !facts.range) return null;

  // NEWEST FIRST. The module sorts ascending because the report reads
  // chronologically; an owner opening this from "4 logged feedings were outside
  // the trial diet" is looking for the most recent one, which is the one they can
  // still do something about.
  const feedings = [...facts.exposures.items].reverse().map(feedingRow);
  const doses = [...facts.oralRoute]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .map(doseRow);

  const groups: TrialExposureGroup[] = [];
  const bothPresent = feedings.length > 0 && doses.length > 0;
  if (feedings.length > 0) {
    groups.push({ title: bothPresent ? TRIAL_EXPOSURES_GROUP_FEEDINGS : null, rows: feedings });
  }
  if (doses.length > 0) {
    groups.push({ title: bothPresent ? TRIAL_EXPOSURES_GROUP_ORAL : null, rows: doses });
  }

  const empty = groups.length === 0;
  const window = windowLabel(facts);
  // The count is FEEDINGS ONLY on both sides of the ratio (§5.1: exposure is
  // feedings over feedings). The doses group is deliberately not in it, and is
  // not silently absorbed either — it has its own header and its own reasons.
  const count =
    facts.exposures.offDiet > 0
      ? `${facts.exposures.offDiet} of ${facts.exposures.totalFeedings} logged feedings`
      : null;

  return {
    title: TRIAL_EXPOSURES_TITLE,
    subtitle: empty ? null : [count, window].filter((p): p is string => p !== null).join(' · ') || null,
    groups,
    notes: blindSpots(facts),
    footer: TRIAL_EXPOSURES_FOOTER,
    empty: empty ? TRIAL_EXPOSURES_EMPTY : null,
  };
}

/**
 * The two exposures this list structurally cannot itemise, named rather than left
 * to the footer's "not a total" to imply.
 *
 * Both are `generate-report`'s own blind-spot sentences, in the owner's register:
 * the vet reads them under "Also during the trial", and the owner reading the same
 * record on their phone is owed the same two facts. Rendering the count without
 * them is where a floor quietly starts reading as a total.
 *
 * The oral route is NOT here — it is a group of rows above, with dates and its own
 * reasons, which is strictly more disclosure than a sentence.
 */
export function blindSpots(facts: TrialFacts): string[] {
  const notes: string[] = [];
  if (facts.arrangementExposures.length > 0) {
    const bowls = facts.arrangementExposures
      .map((a) => a.label ?? 'a free-fed food')
      .join(', ');
    notes.push(
      `A free-fed bowl of ${bowls} was down alongside the trial, and it isn’t on the list. ` +
        'How much came out of a bowl isn’t something Culprit can see, so it can’t be listed here.',
    );
  }
  const unnamed = facts.exposures.unclassifiable;
  if (unnamed > 0) {
    notes.push(
      `${unnamed} logged feeding${unnamed === 1 ? '' : 's'} named no food, so ` +
        `${unnamed === 1 ? 'it isn’t' : 'they aren’t'} counted on either side above.`,
    );
  }
  return notes;
}
