// The Noticed card's copy, composed from the record rather than typed into the tree
// (CUL-871 / N-4a; docs/nyx-daily-look-requirements.md §3.1a, §3.5, §3.6).
//
// The C-17 shape, applied to a card that is its own completion surface: the sentence
// an owner reads about what she just answered is DERIVED from the draft, through the
// same resolver every record surface uses (`lib/lookDisplay.ts`). No caller can hand
// this card a display string, so no surface can teach it to say "Logged".
//
// It also keeps the strings out of the component for the ordinary reason: the voice
// pass and the guardrail screens read a list, not a JSX tree, and a copy edit should
// not be a diff against a render.
//
// EVERY STRING HERE NAMES THE PET OR THE ACT, NEVER A VERDICT. The card asks about
// *now*, compared with HER usual — never a morning, never a score, and never the app's
// idea of what usual is (R9, and the day-1 line says so out loud).

import { petPronouns } from './utils';
import { lookSpeciesOf, notHerselfLabel } from '../constants/lookWords';
import { describeLook, lookSummary } from './lookDisplay';
import { wordsToLocalText } from './lookWordsCodec';
import type { LookDraft } from './lookSelection';
import { draftToWrite } from './lookSelection';

/** The card's label and its one door — on the card in every state (§3.1a). */
export const LOOK_CARD_LABEL = 'Noticed · today';
export const LOOK_PATTERNS_DOOR = 'Patterns ›';

/** The first row's absence chip. A real answer, at the same cost as a word (§3.2's
 *  falsification of Door D: the observation that matters must never cost more taps
 *  than the reassuring one). */
export const LOOK_ABSENCE_CHIP = 'Nothing unusual';

/** The disclosure controls. The caret says "opens in place", the chevron "goes
 *  somewhere" — so *Not himself* takes ▾ and *Something else* takes › (§3.1a). */
export const LOOK_MORE_WORDS = 'Something else ›';
export const LOOK_FEWER_WORDS = '‹ Show fewer words';

/** The resting hint. Says the two things an owner cannot guess: that a tap is the
 *  whole gesture, and that the words are not exclusive. */
export const LOOK_HINT = 'Tap what you saw · more than one can be true';

/** The line under the opening chip once the grid is open. It says what Done alone will
 *  keep, because the chief complaint IS an answer and an owner who has nothing more
 *  specific must not feel she failed to finish (§3.1a).
 *
 *  A FUNCTION of the pet's sex, not a constant: the phrase it quotes is the chip's own
 *  label, and that label has three forms (E-15 — `pets.sex` is NOT NULL with an
 *  `unknown` member). A hardcoded "not himself" here would quote a chip that says
 *  "Not herself" two rows above it. */
export function lookOpeningChipUnfoldLine(sex: 'male' | 'female' | 'unknown'): string {
  return `What did you see? Done on its own keeps “${notHerselfLabel(sex).toLowerCase()}”.`;
}

export const LOOK_DONE = 'Done';
export const LOOK_UNDO = 'Undo';

/** The question — the same string at 7 AM and 9 PM (R9: it is about *now*, and it
 *  never names a morning). */
export function lookQuestion(petName: string, sex: 'male' | 'female' | 'unknown'): string {
  return `How does ${petName} seem right now, compared with ${petPronouns(sex).possessive} usual?`;
}

/** The folded ask row, once the day holds a look: the question, one line, re-openable
 *  in place (§3.1a — this row IS the second look). */
export function lookFoldedAsk(petName: string): string {
  return `How does ${petName} seem now?`;
}

/** Day one, until the first look exists. It is the whole baseline argument in two
 *  sentences: the app is not going to tell her what her animal's usual is, and it is
 *  not going to pretend it knows yet (§6). */
export function lookFirstLookLine(sex: 'male' | 'female' | 'unknown'): string {
  const p = petPronouns(sex).possessive;
  return `The first look. ${p.charAt(0).toUpperCase()}${p.slice(1)} usual is yours to know, not the app’s.`;
}

/**
 * The Done bar's sentence — *Mochi · off, didn't want the walk*.
 *
 * Composed through `describeLook` + `lookSummary` (the ONE resolver, `lib/lookDisplay`)
 * rather than by joining labels here: the bar, the arrival entry, History's row and the
 * record screen then name the same look identically, in the same case, which is the
 * round-3 product read's "one render for one record".
 *
 * Returns null when there is nothing chosen — the bar does not render at all then,
 * rather than rendering with the pet's name and an empty half.
 */
export function lookDoneSummary(
  petName: string,
  draft: LookDraft,
  pet: { species?: string | null; sex?: 'male' | 'female' | 'unknown' | null },
): string | null {
  const write = draftToWrite(draft);
  if (!write) return null;
  const described = describeLook(
    {
      event_type: 'check_in',
      look_outcome: write.outcome,
      look_words: wordsToLocalText([...write.words]),
    },
    pet,
  );
  const summary = lookSummary(described);
  return summary ? `${petName} · ${summary}` : null;
}

// ── IS THE CARD LIVE, AND WHAT DOES THE TODAY NUDGE SAY (T-9, the review's E-8) ──
//
// TWO SURFACES, ONE PREDICATE. Home's Noticed card and TodayZone's nudge sit one card
// apart and must not disagree about whether the look exists for this account: a nudge
// that yields to a card that never rendered leaves the owner with neither, and a nudge
// that asks "how's Mochi doing?" directly under a card asking the same question is the
// app asking twice. So the gate is HERE and both call it — the diet-trial §5.3 lesson,
// applied before there were two readers rather than after.

/** Eligible × opted in × the pet has a vocabulary. The B-712 two-gate shape plus the
 *  CUL-864 species ruling; the callers own the hook reads, this owns the rule. */
export function lookCardLive(params: {
  eligible: boolean;
  optedIn: boolean;
  species: string | null | undefined;
}): boolean {
  return params.eligible && params.optedIn && lookSpeciesOf(params.species) !== null;
}

/** What TodayZone's empty-state row says, if anything. */
export type TodayNudgeKind = 'none' | 'general' | 'meal';

/**
 * The nudge, decided (T-9 / E-8).
 *
 * THE EMPTY PREDICATE IGNORES `check_in` ROWS, which is the whole of E-8: a look is not
 * a thing that happened to the pet, so a day holding one look and nothing else is still
 * a day with nothing logged in it — and saying "Nothing logged yet" beside a look the
 * owner just made would be the app forgetting her answer one card later.
 *
 * The three states, in the order they are decided:
 *   • Something else is in the day → the strip speaks; no nudge (today's behaviour).
 *   • The look is not live for this account → the shipped general nudge, unchanged, so
 *     Home is byte-identical off the flag.
 *   • The look IS live and today holds none → NOTHING: the Noticed card one row above
 *     is asking this exact question, and asking it twice is not warmer, it is nagging
 *     (Principle 4).
 *   • The look is live and today holds one → the nudge returns, pointed at what is
 *     actually missing: the bowl.
 */
export function todayNudgeKind(params: {
  hasNonLookEvents: boolean;
  lookLive: boolean;
  hasLookToday: boolean;
}): TodayNudgeKind {
  if (params.hasNonLookEvents) return 'none';
  if (!params.lookLive) return 'general';
  return params.hasLookToday ? 'meal' : 'none';
}

/** The shipped general nudge — unchanged wording, kept here so the two copies cannot
 *  drift while the branch above chooses between them. */
export function todayGeneralNudge(petName: string): string {
  return `Nothing logged yet — how's ${petName} doing?`;
}

/** The nudge that returns after a look. It names the one thing the day is missing
 *  rather than claiming the day is empty — the day is not empty, she answered. */
export function todayMealNudge(petName: string): string {
  return `No meals logged yet — did ${petName} eat?`;
}
