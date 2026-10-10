// EN-5's question on the record: the words and the instants, pure (Engines v3 PR-30q,
// CUL-1724; docs/nyx-incident-tiers-requirements.md §9; ruling sheet §2.7, I2 and I3).
//
// No database, no store, no clock of its own: every instant is handed in, so the words a
// screen draws are the words a test pins.
//
// WHICH QUESTION. Decided by the record's pet, never the active one (C-9):
//   · a cat with no free-fed bowl: "Has Nyx eaten a meal since 6 PM yesterday?" (meal_fed);
//   · a cat with a free-fed bowl: "Have you seen Pixel eat since 6 PM yesterday?" (free_fed,
//     I2, the pronoun from the recorded sex, `unknown` reads "they");
//   · a dog, or any pet on a running trial: "Could Mochi have eaten something else?"
//     (other_food), or "…something off her rabbit trial?". A cat on a trial gets both.
//   · species "other" gets none (T26: today's rules without the cat intake arm).
//
// WHAT AN ANSWER MEANS. The stored value is the meaning, never the words (097): "Not sure"
// and "Haven't seen" are both `not_observable`, never normal, and "A little" is meal_fed
// only and stores as Picked for the engine (I3). A skipped question writes nothing.

export type IntakeForm = 'meal_fed' | 'free_fed' | 'other_food';
export type IntakeAnswer = 'yes' | 'a_little' | 'no' | 'not_observable';
export type PetSex = 'male' | 'female' | 'unknown' | null | undefined;

export interface IntakeOption {
  answer: IntakeAnswer;
  label: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MS_PER_HOUR = 3_600_000;

/** The span the meal question asks about, back from the vomit (the read's before-vomit half). */
export const INTAKE_QUESTION_HOURS = 24;
/** The hour the "Not sure" safety-net line names. */
export const SAFETY_NET_HOUR = 8;

function subject(sex: PetSex): string {
  return sex === 'female' ? 'she' : sex === 'male' ? 'he' : 'they';
}
function possessive(sex: PetSex): string {
  return sex === 'female' ? 'her' : sex === 'male' ? 'his' : 'their';
}

/**
 * Which questions this record asks, in order. `freeFed` is an active free-choice bowl for
 * the pet; `onTrial` is a trial running at the vomit.
 */
export function intakeFormsFor(species: string | null | undefined, freeFed: boolean, onTrial: boolean): IntakeForm[] {
  if (species === 'cat') {
    const intake: IntakeForm = freeFed ? 'free_fed' : 'meal_fed';
    return onTrial ? [intake, 'other_food'] : [intake];
  }
  if (species === 'dog') return ['other_food'];
  return [];
}

/**
 * The instant the question asks from: 24 hours before the vomit, floored to the hour, so the
 * words name an hour ("6 PM yesterday") and never "since yesterday" (at 7 AM that spans 31
 * hours). Stored as asked, so the reader judges the window the owner saw.
 */
export function intakeSinceFor(vomitAt: string): string | null {
  const ms = Date.parse(vomitAt);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms - INTAKE_QUESTION_HOURS * MS_PER_HOUR);
  d.setMinutes(0, 0, 0);
  return d.toISOString();
}

function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Whole local calendar days from `fromMs`'s day to `toMs`'s day (DST-safe). */
function dayDelta(fromMs: number, toMs: number): number {
  return Math.round((startOfLocalDay(toMs) - startOfLocalDay(fromMs)) / (24 * MS_PER_HOUR));
}

/** "6 PM", "12 AM": the hour in the device's zone. */
export function hourWord(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours();
  const m = d.getMinutes();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mm = m === 0 ? '' : `:${String(m).padStart(2, '0')}`;
  return `${h12}${mm} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "today", "yesterday", "tomorrow", a weekday within the week either side, else "Oct 3". */
export function dayWord(ms: number, nowMs: number): string {
  const delta = dayDelta(nowMs, ms);
  if (delta === 0) return 'today';
  if (delta === -1) return 'yesterday';
  if (delta === 1) return 'tomorrow';
  const d = new Date(ms);
  if (delta < 0 && delta > -7) return WEEKDAYS[d.getDay()];
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** "6 PM yesterday", "6 PM Tuesday", "6 PM Oct 3". */
export function whenWords(ms: number, nowMs: number): string {
  return `${hourWord(ms)} ${dayWord(ms, nowMs)}`;
}

export interface QuestionContext {
  petName: string | null;
  sex: PetSex;
  /** The stored or computed `since` instant (ISO). */
  since: string;
  /** For the trial form: the trial's protein, display-ready ("rabbit"), or null. */
  trialProtein?: string | null;
  /** The trial form applies (a running trial); otherwise other_food is the dog's door. */
  onTrial?: boolean;
  nowMs: number;
}

function name(ctx: QuestionContext): string {
  return ctx.petName && ctx.petName.trim() !== '' ? ctx.petName.trim() : 'your pet';
}

/** The question's heading. */
export function intakeQuestionText(form: IntakeForm, ctx: QuestionContext): string {
  const p = name(ctx);
  const since = whenWords(Date.parse(ctx.since), ctx.nowMs);
  if (form === 'meal_fed') return `Has ${p} eaten a meal since ${since}?`;
  if (form === 'free_fed') return `Have you seen ${p} eat since ${since}?`;
  if (ctx.onTrial) {
    const protein = ctx.trialProtein ? `${ctx.trialProtein} ` : '';
    return `Could ${p} have eaten something off ${possessive(ctx.sex)} ${protein}trial?`;
  }
  return `Could ${p} have eaten something else?`;
}

/** The one line under the heading, or null. Examples, never instructions. */
export function intakeQuestionHint(form: IntakeForm, ctx: Pick<QuestionContext, 'onTrial'>): string | null {
  if (form === 'free_fed') return '"Haven\'t seen" is a fine answer.';
  if (form === 'other_food') {
    return ctx.onTrial ? 'A treat, another pet\'s food, something on the counter.' : 'Scraps, something on a walk, the bin.';
  }
  return null;
}

/** The answers, in the order drawn. */
export function intakeOptions(form: IntakeForm, sex: PetSex): IntakeOption[] {
  if (form === 'meal_fed') {
    return [
      { answer: 'yes', label: 'Yes, ate well' },
      { answer: 'a_little', label: 'A little' },
      { answer: 'no', label: 'No' },
      { answer: 'not_observable', label: 'Not sure' },
    ];
  }
  if (form === 'free_fed') {
    return [
      { answer: 'yes', label: 'Yes' },
      { answer: 'no', label: `No, ${subject(sex)} wouldn't` },
      { answer: 'not_observable', label: "Haven't seen" },
    ];
  }
  return [
    { answer: 'yes', label: 'Yes' },
    { answer: 'no', label: 'No' },
    { answer: 'not_observable', label: 'Not sure' },
  ];
}

/** The answer's own label, for the fold ("You said: A little"). An answer the form does not
 *  offer (a row from a newer build) reads by its meaning, never blank. */
export function answerLabel(form: IntakeForm, answer: string, sex: PetSex): string {
  const hit = intakeOptions(form, sex).find((o) => o.answer === answer);
  if (hit) return hit.label;
  return answer === 'not_observable' ? 'Not sure' : answer === 'no' ? 'No' : answer === 'a_little' ? 'A little' : 'Yes';
}

/** The least lead time a named morning must give: under it, the line asks for today instead
 *  of naming an hour (the adversarial pass on PR-30q, B3 and R2-1). Never a later morning: a
 *  "Not sure" at 6:30 AM is told today, not tomorrow. */
export const SAFETY_NET_LEAD_HOURS = 2;
/** The longest span of unknown intake a named hour may reach, counted from the hour the
 *  question asked from: the hepatic-lipidosis window is why a cat's unknown day is never left
 *  to run on (B3). Past it, the line asks for today. */
export const SAFETY_NET_MAX_HOURS = 48;
/** How long after the hour asked about the line stays on the record at all: it is about this
 *  vomit's day, so an old record's "Not sure" does not keep a call to action on History
 *  forever (R2-1). */
export const SAFETY_NET_SHOWN_HOURS = 72;

/**
 * The hour the line names: the first SAFETY_NET_HOUR strictly after the answer, in the
 * device's zone. Null when the instants cannot be read, when that morning is under
 * SAFETY_NET_LEAD_HOURS away, or when it lies past SAFETY_NET_MAX_HOURS after `since`: in
 * each case the line asks for today rather than naming a later hour.
 */
export function safetyNetDeadline(answeredAt: string, since: string): number | null {
  const ms = Date.parse(answeredAt);
  const sinceMs = Date.parse(since);
  if (!Number.isFinite(ms) || !Number.isFinite(sinceMs)) return null;
  const d = new Date(ms);
  d.setHours(SAFETY_NET_HOUR, 0, 0, 0);
  if (d.getTime() <= ms) d.setDate(d.getDate() + 1);
  const deadline = d.getTime();
  if (deadline - ms < SAFETY_NET_LEAD_HOURS * MS_PER_HOUR) return null;
  if (deadline > sinceMs + SAFETY_NET_MAX_HOURS * MS_PER_HOUR) return null;
  return deadline;
}

/**
 * The dated safety-net line under a "Not sure" or "Haven't seen" on an intake form, derived
 * at render and never stored. Null for every other answer, for the other_food form (it asks
 * about something else entirely), and once SAFETY_NET_SHOWN_HOURS have passed since the hour
 * asked about.
 *
 * Where no hour fits, or once the named one has passed, it asks for today in words that fit
 * an owner who does not know: "If you don't see Nyx eat today, call your vet." Never a
 * sentence about a deadline in the past.
 */
export function safetyNetLine(
  form: IntakeForm,
  answer: string,
  answeredAt: string,
  since: string,
  petName: string | null,
  nowMs: number,
): string | null {
  if (form === 'other_food' || answer !== 'not_observable') return null;
  const sinceMs = Date.parse(since);
  if (!Number.isFinite(Date.parse(answeredAt)) || !Number.isFinite(sinceMs)) return null;
  if (nowMs > sinceMs + SAFETY_NET_SHOWN_HOURS * MS_PER_HOUR) return null;
  const p = petName && petName.trim() !== '' ? petName.trim() : 'your pet';
  const deadline = safetyNetDeadline(answeredAt, since);
  if (deadline === null || nowMs >= deadline) return `If you don't see ${p} eat today, call your vet.`;
  return `If ${p} hasn't eaten by ${hourWord(deadline)} ${dayWord(deadline, nowMs)}, call your vet.`;
}
