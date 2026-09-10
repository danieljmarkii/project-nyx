// The RECEIPTS — what the record pays back on the day it matters (CUL-873 / N-4b).
//
// docs/nyx-daily-look-requirements.md §3.3 part 1, R12, §6.9, T-18; the PM rulings of
// 2026-09-10 on this issue.
//
// ── WHAT A RECEIPT IS ────────────────────────────────────────────────────────
// One line of plain ink under the entry that earned it, saying what the record now knows
// that it did not before. Under R1 the look is on forever, so most days there is nothing
// to say and this returns nothing — the return on 118 quiet looks arrives on the one
// morning a word appears, in the sentence a vet wants.
//
// ── THE FOUR RULES THAT MAKE IT HONEST, EACH FROM A BROKEN DRAFT ─────────────
//
//  1. EARNED BY A SYMPTOM-CLASS WORD ONLY. Never by *nothing unusual* — a run of quiet
//     days is the one thing no surface may count aloud — and never by an activity word:
//     *first day Mochi has seemed lively* is a wellness receipt (T-18). The classifier is
//     the vocabulary's own `kind` (`lookWordKind`), never a second list.
//
//  2. DERIVED AT RENDER, NEVER STORED, NEVER LATCHED. From the record AS IT STANDS —
//     soft-deleted rows already dropped by `loadLookDays`, a backdated row placed by its
//     `local_day`. So an Undo of the first *Off* re-arms the form on the next one, and a
//     backdated earlier *Off* moves the first day. Nothing here caches.
//
//  3. THE FLOORS ARE ON THE DENOMINATOR THE CLAIM RESTS ON, and there are two of them
//     because the two forms rest on different numbers. The first-day form's floor is its
//     OWN denominator — the answered days strictly before the first-marked day — because
//     the first draft dropped the denominator and kept the fact, and a naked *First day
//     Mochi has seemed off.* on four days of evidence implies he had been fine until now.
//     That is reassurance by implication, produced by deleting the clause that was the
//     claim's warrant. The count form's floor is the window's answered days (≥ 7), so a
//     month's first day never reads *1 of the 1*.
//
//  4. IT BELONGS TO THE ENTRY THAT EARNED IT. The earliest look of the day carrying the
//     word owns the line, ties broken by `created_at` then row id; a later look the same
//     day never takes it over, because a good afternoon must not remove a concern the
//     card already said. "Derived at render" and "belongs to the entry that earned it"
//     are one rule, not two (T-18).
//
// ── THE FIRST-DAY FORM'S GRAMMAR (PM-RULED 2026-09-10) ───────────────────────
// §3.3's line was written as *First day Mochi has seemed **off***, which makes the word a
// predicate adjective and only parses for about a third of the vocabulary: *"has seemed
// accident indoors"*, *"has seemed eating grass"*, *"has seemed didn't want the walk"*.
// The PM ruled the alternative §3.3 already carried on file — the LABEL frame, which is
// grammatical for all 54 heads and speaks the act (*marked*) in the same voice as the
// footer (*answered*) and the report. The per-word receipt phrase, which would keep the
// pet as the grammatical subject everywhere, is a vocabulary PR and not this one's.
//
// ── AND ONE PER ENTRY (PM-RULED 2026-09-10) ──────────────────────────────────
// `receiptsFor` returns every receipt the entry earned, so Patterns and the report may
// choose differently. The CARD renders `leadReceipt` — one line, first-day before count,
// ties broken by the entry's own word order, which is the order she chose and the only
// ranking the vocabulary does not invent (it carries no severity). T-15: the list never
// becomes a feed.

import { LOOK_COVERAGE_FLOOR_DAYS, LOOK_COVERAGE_WINDOW_DAYS } from './lookCoverage';
import { inSentence, resolveWord, type LookPetContext } from './lookDisplay';
import { lookSpeciesOf, lookWordKind } from '../constants/lookWords';
import { dayKeyToLocalDate, formatCalendarDate, localDayIndex, localDayIndexOf, dayKeyFromIndex } from './utils';
import type { LookDayRow } from './looks';

/**
 * The count form's floor: answered days inside the window, below which the count does not
 * render.
 *
 * ── THE SPEC SAYS SEVEN IN ONE PLACE AND FOURTEEN IN ANOTHER ─────────────────
 * T-18 sets it at "≥ 7 answered days, a floor on its own denominator distinct from
 * Q-13's", so a month's first day never reads *1 of the 1*. Q-13 — the later reconciliation,
 * written after the fourth adversarial pass "having found two" scopes for one floor —
 * enumerates fourteen answered days "in the footer's 28-day window for the footer, THE
 * COUNT FORM and the report's bars".
 *
 * Built at FOURTEEN, and the product review named the reason the lower number cannot ship:
 * at nine answered days the card renders *Off on 1 of the 9 days you've answered in the
 * last four weeks* and then, two lines below, declines to state a denominator at all. A
 * card that prints a denominator it simultaneously refuses to print is not a floor
 * protecting a worried owner, it is the shape floor (2) exists to prevent, restated as a
 * rate instead of a novelty claim.
 *
 * Nothing is hidden by taking the higher number: a rising symptom-class count is never
 * withheld (§6.6), and Patterns prints it with its own denominator from the first look.
 * What waits is the receipt, on the card whose own coverage line is silent anyway.
 *
 * PROVISIONAL, with Q-13, and named for the PM: the device pass may move both, and they
 * move together.
 */
export const LOOK_RECEIPT_COUNT_FLOOR_DAYS = LOOK_COVERAGE_FLOOR_DAYS;

/** T-18's own number, kept as the inner floor it names. Subsumed by the one above today —
 *  stated so a future change that lowers Q-13's floor does not silently take the count form
 *  below the number that stops *1 of the 1*. */
export const LOOK_RECEIPT_COUNT_INNER_FLOOR_DAYS = 7;

/** Q-13's floor, on the first-day form's own denominator. Re-exported from the coverage
 *  module rather than restated: one number, one definition, two readers. */
export const LOOK_RECEIPT_FIRST_DAY_FLOOR_DAYS = LOOK_COVERAGE_FLOOR_DAYS;

export type LookReceiptForm = 'first_day' | 'count' | 'withheld_first';

export interface LookReceipt {
  form: LookReceiptForm;
  /** The word key that earned it — for a consumer that ranks differently (N-5, N-6). */
  word: string;
  /** The rendered line. Composed here so the card cannot be handed a display string it
   *  did not derive (C-17's shape, applied to a receipt). */
  text: string;
}

/** The entry a receipt might hang under — the today list's row, reduced. */
export interface LookReceiptEntry {
  eventId: string;
  localDay: string;
  words: readonly string[];
}

export interface LookReceiptContext {
  petName: string;
  pet: LookPetContext;
  nowMs: number;
  /** Explicit IANA zone for the window arithmetic; production passes nothing (T-19). */
  timeZone?: string;
  /** Is the card withholding (`lookWithheld`)? Under the floor's item 12 a receipt
   *  collapses to the bare first date — never a rate the withheld absence count could be
   *  read back out of by subtraction. */
  withheld: boolean;
}

/**
 * A date that stands alone, with its year — C-19's rule, applied rather than dodged.
 *
 * "A year-less date is safe only inside a bounded range; stamp the year once per band,
 * never per date or CONDITIONALLY." The first-day form's *since {date}* can be years back
 * and sits in no band, so it carries the year always. The count form's date is bounded by
 * the four weeks named in its own sentence, so it does not — that is the band, stated.
 */
function datedWithYear(dayKey: string): string | null {
  const d = dayKeyToLocalDate(dayKey);
  return d ? d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : null;
}

/** The word as it reads inside a sentence, through the ONE resolver — so a receipt names
 *  a word exactly as the entry above it does. `null` when this build cannot name the key,
 *  which earns no receipt rather than a placeholder. */
function wordInSentence(key: string, pet: LookPetContext): string | null {
  const resolved = resolveWord(key, pet);
  return resolved ? inSentence(resolved.head) : null;
}

/** The same word, leading a sentence (the count form). */
function wordLeading(key: string, pet: LookPetContext): string | null {
  const resolved = resolveWord(key, pet);
  return resolved ? resolved.head : null;
}

/** Every day this word was marked, as keys. */
function daysWithWord(record: readonly LookDayRow[], word: string): string[] {
  const days = new Set<string>();
  for (const r of record) if (r.words.includes(word)) days.add(r.localDay);
  return [...days].sort();
}

/**
 * Does THIS entry own the word's line on its day — rule 4.
 *
 * `record` arrives ordered `local_day DESC, created_at ASC, id ASC` from `loadLookDays`,
 * so the first row of a day carrying the word IS the earliest. The order is produced by
 * the reader rather than re-sorted here, which is what keeps two surfaces from disagreeing
 * about which entry earned a line. Re-sorted defensively anyway: a caller handing over a
 * filtered list must not silently change the answer.
 */
function ownsTheLine(entry: LookReceiptEntry, record: readonly LookDayRow[], word: string): boolean {
  const sameDay = record
    .filter((r) => r.localDay === entry.localDay && r.words.includes(word))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.eventId.localeCompare(b.eventId));
  return sameDay.length > 0 && sameDay[0].eventId === entry.eventId;
}

/**
 * Every receipt this entry earned, highest precedence first.
 *
 * PURE (T-18). It reads the record it is handed and nothing else — no clock beyond the
 * `nowMs` passed in, no storage, no store.
 */
export function receiptsFor(
  entry: LookReceiptEntry,
  record: readonly LookDayRow[],
  ctx: LookReceiptContext,
): LookReceipt[] {
  if (entry.words.length === 0) return [];
  const species = lookSpeciesOf(ctx.pet.species);

  const todayIndex = localDayIndex(ctx.nowMs, ctx.timeZone);
  const todayKey = dayKeyFromIndex(todayIndex);
  const windowFirstIndex = todayIndex - (LOOK_COVERAGE_WINDOW_DAYS - 1);

  // The window's own denominator, counted once for every word this entry carries.
  const answeredInWindow = new Set<string>();
  const answeredAll: string[] = [];
  for (const r of record) {
    const index = localDayIndexOf(r.localDay);
    if (index === null) continue;
    answeredAll.push(r.localDay);
    if (index >= windowFirstIndex && index <= todayIndex) answeredInWindow.add(r.localDay);
  }
  const earliestAnswered = answeredAll.length > 0 ? answeredAll.sort()[0] : null;

  const firstDay: LookReceipt[] = [];
  const counts: LookReceipt[] = [];

  for (const word of entry.words) {
    // Rule 1 — the absence carries no words at all, so only the activity words and the
    // unnameable keys are filtered here.
    if (lookWordKind(word, species) !== 'concern') continue;
    if (!ownsTheLine(entry, record, word)) continue;

    const marked = daysWithWord(record, word);
    if (marked.length === 0) continue;
    const firstMarked = marked[0];

    // ── The withheld reduction (§3.3 floor 3) ────────────────────────────────
    // The bare first date and nothing else: never a rate, which the withheld absence
    // count could be read back out of by subtraction, and NEVER today's own date, which
    // would only repeat the entry's hour beside *Call your vet today*.
    if (ctx.withheld) {
      if (firstMarked === todayKey) continue;
      // The WORD LEADS, as it does in the count form, rather than sitting mid-sentence
      // after a verb. `nyx-voice`: *First marked off Sep 2* reads as "marked off [items]
      // on Sep 2" — the head becomes the object of a phrasal verb and the sentence says
      // something the record does not. Leading with it makes the word a label, which is
      // what it is, and the shape then matches the count form the owner sees on every
      // other day (Pattern 5: the plain reading is the one that survives).
      const lead = wordLeading(word, ctx.pet);
      const date = datedWithYear(firstMarked);
      if (!lead || !date) continue;
      firstDay.push({ form: 'withheld_first', word, text: `${lead} — first marked ${date}.` });
      continue;
    }

    // ── The first-day form ───────────────────────────────────────────────────
    if (entry.localDay === firstMarked) {
      const firstIndex = localDayIndexOf(firstMarked);
      // STRICTLY BEFORE — the day itself is never inside its own denominator (§6.9), and
      // every surface says *before it*.
      const before =
        firstIndex === null
          ? 0
          : new Set(
              answeredAll.filter((day) => {
                const i = localDayIndexOf(day);
                return i !== null && i < firstIndex;
              }),
            ).size;
      const head = wordInSentence(word, ctx.pet);
      const since = earliestAnswered ? datedWithYear(earliestAnswered) : null;
      // A zero denominator renders nothing — a backdated first *Off* placed before the
      // record's first answered day is the naked receipt by another route.
      if (before >= LOOK_RECEIPT_FIRST_DAY_FLOOR_DAYS && head && since) {
        firstDay.push({
          form: 'first_day',
          word,
          text: `First day you’ve marked ${head} for ${ctx.petName} — in the ${before} days you’d answered before it, since ${since}.`,
        });
        continue;
      }
      // Below the floor the NOVELTY claim does not render — but a plain count with its
      // own denominator is not a novelty claim, and a rising symptom-class count is never
      // withheld (§6.6). So fall through to the count form rather than returning nothing.
    }

    // ── The count form ───────────────────────────────────────────────────────
    const denominator = answeredInWindow.size;
    if (denominator < Math.max(LOOK_RECEIPT_COUNT_FLOOR_DAYS, LOOK_RECEIPT_COUNT_INNER_FLOOR_DAYS)) {
      continue;
    }
    const numerator = marked.filter((day) => {
      const i = localDayIndexOf(day);
      return i !== null && i >= windowFirstIndex && i <= todayIndex;
    }).length;
    if (numerator === 0) continue;
    const lead = wordLeading(word, ctx.pet);
    if (!lead) continue;
    // The date clause names the word's first marked day, and only when that day is inside
    // the window this sentence is about — a four-week count never carries a five-week-old
    // date (C-3: the scope where the reader meets the claim). Dropped when the first day
    // is TODAY, where it can only repeat the hour on the entry directly above it — the
    // same reasoning §3.3 states for the withheld form, and it is only reachable at a
    // numerator of one.
    const firstIndex = localDayIndexOf(firstMarked);
    const inWindow = firstIndex !== null && firstIndex >= windowFirstIndex && firstIndex <= todayIndex;
    const clause =
      inWindow && firstMarked !== todayKey ? ` · first ${formatCalendarDate(firstMarked)}` : '';
    counts.push({
      form: 'count',
      word,
      text: `${lead} on ${numerator} of the ${denominator} days you’ve answered in the last four weeks${clause}.`,
    });
  }

  return [...firstDay, ...counts];
}

/** The ONE line the card renders (PM-ruled 2026-09-10). `receiptsFor` already orders by
 *  precedence, so this is the head of the list — named rather than inlined, so a second
 *  surface cannot quietly render the second one and call it the same rule. */
export function leadReceipt(receipts: readonly LookReceipt[]): LookReceipt | null {
  return receipts[0] ?? null;
}
