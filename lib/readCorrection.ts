// The dated correction beside a stored vomit read (Engines v3 PR-13b, CUL-1406; mock
// `docs/culprit-incident-screen-mockups.html` §3b, C-A, PM-ruled 2026-10-07).
//
// Reads written before EN-0 can carry "<pet> has been vomiting and hasn't eaten a full meal
// recently", which concludes from the meal log's silence. The stored words are never
// rewritten and the verdict never moves; the server keeps three FACTS beside the read
// (migration 085: when, meals logged in the 24 hours before the vomit, how many marked Most
// or All) and this module is the ONE place those facts become words, for the incident screen
// and for Ask's relay alike, so the two can never word a correction two ways.
//
// Every clause is pinned to the correction's own date ("That day, the meal log held …"), so
// the sentence stays true when the log changes later; the server re-dates the facts when a
// count moves. No clause concludes whether the pet ate.
//
// Imported by `supabase/functions/ask` (C-26): no imports here, nothing client-only.

/** The three columns as the row carries them (migration 085). */
export interface IntakeCorrectionColumns {
  intake_correction_at?: string | null;
  intake_correction_meals?: number | null;
  intake_correction_most_or_all?: number | null;
}

export interface IntakeCorrection {
  /** The instant the log first held these counts (ISO). */
  at: string;
  mealsLogged: number;
  mostOrAll: number;
}

/** The facts, or null when the row holds none (or holds a shape the CHECK would refuse). */
export function intakeCorrectionOf(row: IntakeCorrectionColumns | null | undefined): IntakeCorrection | null {
  if (!row) return null;
  const at = row.intake_correction_at ?? null;
  const meals = row.intake_correction_meals;
  const most = row.intake_correction_most_or_all;
  if (!at || !Number.isFinite(Date.parse(at))) return null;
  if (typeof meals !== 'number' || typeof most !== 'number') return null;
  if (!Number.isInteger(meals) || !Number.isInteger(most) || meals < 0 || most < 0 || most > meals) return null;
  return { at, mealsLogged: meals, mostOrAll: most };
}

/** "Corrected Oct 7, 2026" — the year always, because the read it sits beside can be old. */
export function intakeCorrectionLabel(c: IntakeCorrection, timeZone?: string): string {
  const date = new Date(c.at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  });
  return `Corrected ${date}`;
}

function recordClause(c: IntakeCorrection, pet: string): string {
  const span = `for ${pet} in the 24 hours before this vomit`;
  if (c.mealsLogged === 0) return `That day, the meal log held no meals ${span}.`;
  if (c.mealsLogged === 1) {
    return c.mostOrAll === 1
      ? `That day, the meal log held 1 meal ${span}, and it was marked Most or All.`
      : `That day, the meal log held 1 meal ${span}, and it wasn't marked Most or All.`;
  }
  const marked =
    c.mostOrAll === 0
      ? 'none was marked Most or All'
      : c.mostOrAll === 1
        ? '1 was marked Most or All'
        : `${c.mostOrAll} were marked Most or All`;
  return `That day, the meal log held ${c.mealsLogged} meals ${span}, and ${marked}.`;
}

export const INTAKE_CORRECTION_OPENER = 'The words above went further than the record.';
export const INTAKE_CORRECTION_CLOSER = "This correction doesn't change the call to your vet.";

/** The correction's body, under its label. */
export function intakeCorrectionText(c: IntakeCorrection, petName?: string | null): string {
  const pet = petName?.trim() || 'your pet';
  return `${INTAKE_CORRECTION_OPENER} ${recordClause(c, pet)} ${INTAKE_CORRECTION_CLOSER}`;
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
