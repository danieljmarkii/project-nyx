// The dated correction beside a stored vomit read (Engines v3 PR-13b, CUL-1406; mock
// `docs/culprit-incident-screen-mockups.html` §3b; layout C-A and wording ruling (a), PM,
// 2026-10-07).
//
// Reads written before EN-0 can carry "<pet> has been vomiting and hasn't eaten a full meal
// recently". The stored words are never rewritten and the verdict never moves. The server
// keeps the FACTS beside the read (migrations 085 + 086) over the window the words were
// about, the 24 hours before the read ran, and writes them only where that window shows the
// sentence went further than the record (meals never rated, or nothing logged) or a meal
// marked Most or All has since landed in it. Where every meal there was rated below Most the
// words were true and no correction exists, so this module never has to decide that.
//
// This module is the ONE place those facts become words, for the incident screen and Ask's
// relay alike. No clause concludes whether the pet ate. "Went further" is said only where every
// meal in the window was unrated, or none was logged: never beside a meal marked below Most,
// which is evidence for the words (adversarial passes 1 and 2: B1 and its neighbour).
//
// Imported by `supabase/functions/ask` (C-26): no imports here, nothing client-only.

/** The columns as the row carries them (migrations 085, 086). */
export interface IntakeCorrectionColumns {
  intake_correction_at?: string | null;
  intake_correction_meals?: number | null;
  intake_correction_unrated?: number | null;
  intake_correction_most_or_all?: number | null;
}

export interface IntakeCorrection {
  /** The instant the log first held these counts (ISO). */
  at: string;
  mealsLogged: number;
  unrated: number;
  mostOrAll: number;
}

const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;

/** The facts, or null when the row holds none, or a shape the database CHECK would refuse, or
 *  facts that earn no correction (every meal rated below Most: the words stood). The last is
 *  the server's rule restated as a floor: a correction is never worded where none is due. */
export function intakeCorrectionOf(row: IntakeCorrectionColumns | null | undefined): IntakeCorrection | null {
  if (!row) return null;
  const at = row.intake_correction_at ?? null;
  const meals = row.intake_correction_meals;
  const unrated = row.intake_correction_unrated;
  const most = row.intake_correction_most_or_all;
  if (!at || !Number.isFinite(Date.parse(at))) return null;
  if (!isCount(meals) || !isCount(unrated) || !isCount(most) || unrated + most > meals) return null;
  if (!(most > 0 || meals === 0 || unrated > 0)) return null;
  return { at, mealsLogged: meals, unrated, mostOrAll: most };
}

/** A RECORD line, not a correction (R-6, ruled O-iii by the PM, 2026-10-07): meals rated below
 *  Most beside unrated ones, and no Most or All meal. The refusals are evidence for the words, so
 *  the block states the record without claiming the words were wrong: no "Corrected", no "went
 *  further". Otherwise a seventh, unrated meal would summon a correction six refusals did not. */
export function isRecordLine(c: IntakeCorrection): boolean {
  return c.mostOrAll === 0 && c.unrated > 0 && c.mealsLogged - c.unrated > 0;
}

/** "Corrected Oct 7, 2026", or "From the meal log, Oct 7, 2026" on a record line: the year
 *  always, because the read it sits beside can be old. */
export function intakeCorrectionLabel(c: IntakeCorrection, timeZone?: string): string {
  const date = new Date(c.at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  });
  return isRecordLine(c) ? `From the meal log, ${date}` : `Corrected ${date}`;
}

// The opener NAMES the sentence it corrects (second adversarial pass, finding 1): "the words
// above" also covered a blood or foreign-material line that Ask's read line puts before the
// stored words, and read as withdrawing it.
export const INTAKE_CORRECTION_OPENER = 'The note "hasn\'t eaten a full meal recently" went further than the record.';
export const INTAKE_CORRECTION_CLOSER = "This correction doesn't change the call to your vet.";
export const INTAKE_RECORD_LINE_CLOSER = "This doesn't change the call to your vet.";

const SPAN = 'in the 24 hours before I read this';

const meals = (n: number) => (n === 1 ? '1 meal' : `${n} meals`);

function body(c: IntakeCorrection, pet: string): string {
  const below = c.mealsLogged - c.unrated - c.mostOrAll;
  // A Most or All meal in the words' own window: stated plainly, with every other meal there
  // beside it, so refusals are never left out (finding 2). No "went further" (ruling (a)).
  if (c.mostOrAll > 0) {
    if (below === 0 && c.unrated === 0) {
      return `The meal log now shows ${meals(c.mostOrAll)} marked Most or All for ${pet} ${SPAN}.`;
    }
    const parts = [`${c.mostOrAll} marked Most or All`];
    if (below > 0) parts.push(`${below} marked below Most`);
    if (c.unrated > 0) parts.push(`${c.unrated} not rated`);
    return `The meal log now shows ${meals(c.mealsLogged)} for ${pet} ${SPAN}: ${parts.join(', ')}.`;
  }
  const cantSay = `so the log couldn't say whether ${pet} ate a full meal.`;
  if (c.mealsLogged === 0) {
    return `${INTAKE_CORRECTION_OPENER} No meals were logged for ${pet} ${SPAN}, ${cantSay}`;
  }
  // Meals rated below Most beside unrated ones: the refusals are evidence for the words, so
  // "went further" is not said; the record is stated whole, as a record line (R-6, O-iii).
  if (below > 0) {
    const verb = c.unrated === 1 ? "wasn't" : "weren't";
    return `Of the ${c.mealsLogged} meals logged for ${pet} ${SPAN}, ${below} ${below === 1 ? 'was' : 'were'} marked below Most and ${c.unrated} ${verb} rated.`;
  }
  return c.mealsLogged === 1
    ? `${INTAKE_CORRECTION_OPENER} The 1 meal logged for ${pet} ${SPAN} wasn't rated, ${cantSay}`
    : `${INTAKE_CORRECTION_OPENER} None of the ${c.mealsLogged} meals logged for ${pet} ${SPAN} was rated, ${cantSay}`;
}

/** The correction's body, under its label. */
export function intakeCorrectionText(c: IntakeCorrection, petName?: string | null): string {
  const pet = petName?.trim() || 'your pet';
  return `${body(c, pet)} ${isRecordLine(c) ? INTAKE_RECORD_LINE_CLOSER : INTAKE_CORRECTION_CLOSER}`;
}

/** Label and body as one sentence run: the relay form (Ask), and what VoiceOver reads off the
 *  card's grouped block, in the same order the eye meets them. */
export function intakeCorrectionSentence(c: IntakeCorrection, petName?: string | null, timeZone?: string): string {
  return `${intakeCorrectionLabel(c, timeZone)}. ${intakeCorrectionText(c, petName)}`;
}

/** What the incident card draws: the label and the body, or null when the row holds no
 *  correction. One call for both sections, so they cannot word it two ways. */
export function intakeCorrectionDisplay(
  row: IntakeCorrectionColumns | null | undefined,
  petName?: string | null,
  timeZone?: string,
): { label: string; text: string } | null {
  const c = intakeCorrectionOf(row);
  return c ? { label: intakeCorrectionLabel(c, timeZone), text: intakeCorrectionText(c, petName) } : null;
}
