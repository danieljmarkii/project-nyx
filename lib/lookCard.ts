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

/**
 * The first row's INTAKE ROUTER — the door to the meal path (§4.5, CUL-870 / N-3b).
 *
 * It is not a look word. It writes nothing to the look, and a tap on it changes nothing
 * on this card (T-3) — it opens a sheet. Hence the chevron: it goes somewhere, where
 * *Not himself ▾* opens in place (§3.1a's caret/chevron rule).
 *
 * ── ONE LABEL, DECIDED BY PET COUNT ──────────────────────────────────────────
 * E-16, which exists because v1.0 said this three different ways across §3.1a, §3.5 and
 * §4.2. The fork is PET COUNT and nothing else — never species, and never the feeding
 * arrangement: a shared bowl is not knowable (`lib/feedingArrangements.ts` is inert in
 * R1, CUL-222 owns the bowl), so on a multi-pet account the label says what the owner
 * SAW — this animal left her food — instead of asserting that a bowl went uneaten.
 *
 * The possessive inflects, as `notHerselfLabel` two rows along already does: `pets.sex`
 * is NOT NULL with an `unknown` member (E-15), and "Left her food" over a male dog would
 * be a second chip in the same row disagreeing with the first about who he is.
 */
export function intakeDoorLabel(
  multiPet: boolean,
  sex: 'male' | 'female' | 'unknown',
): string {
  return multiPet ? `Left ${petPronouns(sex).possessive} food ›` : 'Didn’t eat ›';
}

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

// ── THE TODAY LIST, ITS CAP, AND THE NOTE (CUL-873 / N-4b) ──────────────────

/**
 * The list cap's door (E-10, T-15) — *2 more today ›*.
 *
 * **The list never becomes a feed.** Principle 3 names a log feed among the things Home
 * is not, so the card shows the two newest entries and folds the rest behind this line.
 * It is a trivial cap and it is deliberately NOT the med strip's §7 collapse, which is a
 * per-med rule about cadence coverage (`isMedCadenceCoveredToday`) and has nothing to say
 * about a list.
 *
 * The chevron is load-bearing: it GOES somewhere (§3.1a's caret/chevron rule) — History,
 * on the look lens — because Home holds a day and History holds the log.
 */
export const LOOK_TODAY_CAP = 2;

export function lookMoreToday(hidden: number): string {
  return `${hidden} more today ›`;
}

/** Where that door lands: History, filtered to looks, scoped to today. `ts` is the
 *  re-application key the screen reads so a second tap re-seeds the filter (B-378). */
export function lookMoreTodayHref(nowMs: number = Date.now()): string {
  return `/history?type=check_in&window=today&ts=${nowMs}`;
}

/**
 * The note's invitation (T-22) — *Say more ›*, under the newest entry's words.
 *
 * The word *note* is the object's name where it is STORED and PRINTED; the invitation is
 * the placeholder's own register. Nothing on the way IN asks for typing (Principle 1): a
 * look with no note is complete, and this appears only after Done.
 */
export const LOOK_NOTE_LINK = 'Say more ›';
export const LOOK_NOTE_PLACEHOLDER = 'Say more — what did you see?';

/** The shipped notes cap (`app/log.tsx` / `components/log/SimpleEventConfirm.tsx`). The
 *  140 first cited in the spec was a photo-fields editor's limit, not a note's. */
export const LOOK_NOTE_MAX_LENGTH = 300;

/**
 * The second half of the note's cue, shared by BOTH surfaces that carry one.
 *
 * There are two cues — the Home card's (pet-named) and the record/edit screens'
 * (`LOOK_NOTE_CUE`, which has no pet name to hand) — and until CUL-875 they said
 * different things about the same column: the record screen claimed the vet report while
 * N-4b's Home cue said the note stayed in the record. One of them was false at any given
 * moment, and which one changed with this PR. C-12's rule applies to a privacy
 * disclosure at least as hard as it applies to a sync banner: the same fact told to the
 * same owner on another surface must not use different words. So the clause that carries
 * the actual promise lives here, once.
 */
const LOOK_NOTE_SHARED_CLAUSE = 'never on a shared link unless you choose it';

/**
 * The cue under the open field, and it is a Trust & Safety requirement rather than a
 * nicety (T-22, §9).
 *
 * ── IT NAMES THE REPORT AGAIN, AS OF CUL-875 / N-6 ───────────────────────────
 * N-4b shipped this as *Kept in {pet}'s record*, because T-22's own wording assumed an
 * Appendix G that did not exist: `generate-report` selected nothing from `looks`, so
 * *Printed on the vet report you make* was a promise the app did not keep, printed at the
 * exact moment it was asking an owner to type something private. N-6 lands that appendix,
 * so the clause comes back — in the same diff, because `guards/lookNotes.test.ts` binds
 * the two in both directions and would otherwise stop the PR.
 *
 * ── IT LEADS WITH THE EXPOSURE, NOT THE REASSURANCE ──────────────────────────
 * *Kept in {pet}'s record* is not carried forward in front of it. With the report clause
 * present, an opening that says the note is kept in her record reads as "it stays here"
 * and softens the disclosure that follows it — and this line's whole job is the
 * disclosure. The pet is still named, inside the clause, where it identifies the document
 * rather than reassuring about the column.
 *
 * ── AND IT LEADS THE DEPLOY, WHICH IS THE POINT OF KEYING THE GUARD ON SOURCE ─
 * `generate-report` is held at v14 by CUL-19, so between this merge and that deploy the
 * cue names a document that does not yet print the note. That asymmetry is deliberate and
 * runs the safe way: this sentence is a WARNING, so over-warning costs an owner a
 * sentence she chose not to write, while under-warning is a document that silently
 * carries her words to a clinic. The client build and the function deploy are independent
 * releases in either order, and only the over-warning is safe in both — which is exactly
 * why the guard is keyed on what the SOURCE selects rather than on what production runs.
 */
export function lookNoteCue(petName: string): string {
  return `Printed on the vet report you make for ${petName} · ${LOOK_NOTE_SHARED_CLAUSE}`;
}

/** The same cue where the surface has no pet name in hand — the look's record screen and
 *  the event editor. Same two facts, same second clause, no second wording. */
export const LOOK_NOTE_CUE_UNNAMED = `Printed on the vet report you make · ${LOOK_NOTE_SHARED_CLAUSE}`;

/**
 * Undo over a look that carries a note — the confirm, and the note NAMED (T-22, C-21).
 *
 * C-21's rule is that every destructive action carries exactly one safety net, a confirm
 * BEFORE or a way back AFTER, and that a one-tap destructive action is earned by
 * RECREATABILITY. Re-logging a look is easy; re-writing the sentence she typed at 2am
 * about what she saw is not, and no surface in the app exposes a removed one. So a look
 * with a note earns the confirm the photo-bearing record gets, and the body names the
 * thing the owner would not otherwise know is going.
 *
 * The quote is truncated because an alert body is not a reader: the opening words are what
 * make her recognise the note, and the whole 300 characters would push the buttons off a
 * small screen.
 */
export const LOOK_UNDO_NOTE_TITLE = 'Take back this look?';

export function lookUndoNoteBody(note: string): string {
  const trimmed = note.trim();
  const quoted = trimmed.length > 100 ? `${trimmed.slice(0, 100).trimEnd()}…` : trimmed;
  return `Its note goes with it: “${quoted}”`;
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
