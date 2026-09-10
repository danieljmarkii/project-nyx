// A look, rendered — the ONE resolver every record surface reads a `check_in`
// through (CUL-869 / N-3).
//
// docs/nyx-daily-look-requirements.md §5.1 row 8 (the degradation contract), §5.4,
// §5.6 (the observed-absence row), §4.1 rule 12 (a label is *head word, gloss*).
//
// WHY ONE MODULE. History's row, the day spine, the drill-in and the record screen
// all name the same look, and the round-3 product read's finding was that they must
// agree on case and clock ("one render for one record", §12). A second surface
// resolving keys its own way is the diet-trial §5.3 shape again — two readers of one
// row, drifting. So the key → words resolution is here, once, and the surfaces
// choose only between the SUMMARY form (a comma-joined fragment: History, the spine,
// the drill-in) and the FULL form (head + gloss per word: the record screen).
//
// ── THE TWO FAILURE DIRECTIONS, AND WHY THEY ARE NOT SYMMETRIC ────────────────
//
// 1. A KEY THIS BUILD CANNOT NAME. Two real causes, and only one of them is a
//    "future build" story. The other is ordinary: an owner CORRECTS a pet's species
//    on the profile after logging, and every word from the other list becomes
//    unresolvable against the pet's new one. Silently dropping those words would
//    erase what she actually recorded, so resolution falls back to the sibling
//    species (HR-23: a key both species share is ONE key; the copy split lives in
//    the label, never in a second key). Only a key in NEITHER list is unnamed, and
//    it is COUNTED and said, never dropped.
//
// 2. A `check_in` WITH NO CHILD. Partial hydration, or a parent that reached this
//    device before its child did. The tempting render is the absence row — it is
//    the one that needs no words. It is also the one thing this module must never
//    invent: "nothing unusual" is the only phrase in the feature that describes the
//    PET rather than the owner's act, and manufacturing it from a missing row would
//    have the record report a quiet day nobody observed. So an unresolved child
//    renders as the bare act (`kind: 'unknown'`) and every summary form returns
//    null. Under-saying is the safe direction here; the absence is never inferred.

import { wordsFromLocalText } from './lookWordsCodec';
import {
  LOOK_OPENING_CHIP_KEY,
  LOOK_WORDS,
  lookWord,
  lookSpeciesOf,
  notHerselfLabel,
  type LookSpecies,
} from '../constants/lookWords';

/** What a surface needs to know about the pet whose record this is. Deliberately
 *  NOT a `Pet` — the resolver is pure and a record screen resolves its pet by id
 *  (C-9), so it hands over the two fields rather than a store object. Both may be
 *  missing: a record whose pet is not in the store names nobody, and the words
 *  still resolve (rule 1 above). */
export interface LookPetContext {
  species?: string | null;
  sex?: 'male' | 'female' | 'unknown' | null;
}

/** One resolved word. `gloss` is null for the opening chip, which has no second
 *  half — it is the chief complaint, not an observation with a findable detail. */
export interface ResolvedLookWord {
  key: string;
  head: string;
  gloss: string | null;
}

export interface DescribedLook {
  /** 'observed' carries words; 'absence' is the observed-absence row (L-6);
   *  'unknown' is a `check_in` whose child this device cannot read — never an
   *  absence, see the header. */
  kind: 'observed' | 'absence' | 'unknown';
  words: ResolvedLookWord[];
  /** Word keys stored on the row that NEITHER species list names. Counted rather
   *  than dropped, so the record can say the row holds more than it can show. */
  unnamed: number;
  /** The note from `looks.notes` — trimmed, and null when empty. The parent's
   *  `notes` is NULL by CHECK for a `check_in` (T-22), so this is the only place a
   *  look's note exists. */
  note: string | null;
}

/** The row shape this module reads. A `TimelineRow` and a `NyxEvent` both satisfy
 *  it, which is why neither is named here — the two types differ only in the
 *  optionality of the joined columns. */
export interface LookRowFields {
  event_type: string;
  look_outcome?: string | null;
  look_words?: string | null;
  look_note?: string | null;
}

/** Is this row a look? The type test, in one place, so no surface re-types the
 *  literal. Never `hasOwnProperty('look_outcome')`: a non-look row carries the
 *  joined columns too, all null. */
export function isLookRow(row: { event_type: string }): boolean {
  return row.event_type === 'check_in';
}

/**
 * Resolve one word key against a pet, or null when neither species list names it.
 *
 * The pet's OWN species is tried first, so a shared key reads in her own copy (the
 * cat's *Accident indoors* is the dog's; `outside_box` is one key with two labels).
 * The sibling is the fallback, never the default.
 */
function resolveWord(key: string, pet: LookPetContext): ResolvedLookWord | null {
  if (key === LOOK_OPENING_CHIP_KEY) {
    // The opening chip is a word key like any other in `looks.words`, but it is not
    // in LOOK_WORDS — its label follows `pets.sex`, and a pet whose sex nobody
    // recorded (or whose row is not in the store) takes the neutral form rather
    // than the app guessing (E-15).
    return { key, head: notHerselfLabel(pet.sex ?? 'unknown'), gloss: null };
  }
  const own = lookSpeciesOf(pet.species);
  const order: LookSpecies[] = own ? [own, own === 'cat' ? 'dog' : 'cat'] : ['cat', 'dog'];
  for (const species of order) {
    const word = lookWord(species, key);
    if (word) return { key, head: word.head, gloss: word.gloss };
  }
  return null;
}

/**
 * One `check_in` row → what a surface may say about it.
 *
 * Total: every degenerate row (no child, an unreadable word list, an outcome value
 * this build does not know) resolves to a `kind` a surface can render honestly. It
 * throws nothing and it invents nothing.
 */
export function describeLook(row: LookRowFields, pet: LookPetContext = {}): DescribedLook {
  const note = row.look_note?.trim() || null;
  // No child row: the bare act. NOT an absence (header, direction 2).
  if (row.look_outcome == null) return { kind: 'unknown', words: [], unnamed: 0, note };

  if (row.look_outcome === 'nothing_unusual') {
    // Words on an absence row are unwritable by `insertLook` and refused nowhere
    // else, so if any arrive they are ignored rather than rendered: the outcome is
    // the row's own claim about itself and it is the half that decides the phrase.
    return { kind: 'absence', words: [], unnamed: 0, note };
  }

  // Any other outcome value reads as an observation — the same safe direction
  // `loadLookDays` takes, and for the same reason: 'absence' is the one kind a
  // surface may describe as nothing-unusual, so it is never reached by inference.
  const keys = wordsFromLocalText(row.look_words);
  const words: ResolvedLookWord[] = [];
  let unnamed = 0;
  for (const key of keys) {
    const resolved = resolveWord(key, pet);
    if (resolved) words.push(resolved);
    else unnamed += 1;
  }
  return { kind: 'observed', words, unnamed, note };
}

/**
 * A head word as it reads INSIDE a sentence — *off*, *didn't want the walk*.
 *
 * Lower-cases the first character only. The vocabulary holds no proper nouns and no
 * initialisms (§4.2 / §4.3), so nothing here loses a capital it needed, and
 * `toLowerCase()` over the whole string would flatten one that did.
 */
function inSentence(head: string): string {
  return head.charAt(0).toLowerCase() + head.slice(1);
}

/**
 * The SUMMARY form — the comma-joined fragment History, the day spine and the
 * drill-in all print after *Noticed ·*, and the one the Recap lead reads (§5.1
 * row 1b's *"You noticed: off, didn't want the walk, eating grass."*).
 *
 * Returns null when there is nothing honest to say — an unknown child, or an
 * observation whose every word this build cannot name. A surface renders the type
 * label alone in that case; it never falls through to the absence phrase.
 */
export function lookSummary(described: DescribedLook): string | null {
  if (described.kind === 'absence') return ABSENCE_PHRASE;
  if (described.kind === 'unknown') return null;
  if (described.words.length === 0) return null;
  return described.words.map((w) => inSentence(w.head)).join(', ');
}

/** The observed-absence row's phrase, in one place because it is the one string in
 *  this feature that describes the PET. It says what the owner marked and stops
 *  there: never *all good*, never *a good day* (§5.6 — a run of quiet days is the
 *  one thing no surface may count aloud). */
export const ABSENCE_PHRASE = 'nothing unusual';

/**
 * The quiet line under the record screen's word list when the row holds keys this
 * build cannot name — the §5.1 row 8 degradation contract, applied to words rather
 * than to the leaf.
 *
 * Says the count and its cause, and nothing else: no instruction to update (there
 * may be nothing to update to) and no placeholder label, which would be this
 * surface inventing a meaning for a word it cannot read.
 */
export function unnamedWordsLine(unnamed: number): string | null {
  if (unnamed <= 0) return null;
  return unnamed === 1
    ? '1 more word this version of the app can’t show yet.'
    : `${unnamed} more words this version of the app can’t show yet.`;
}

export interface GridWord { key: string; head: string; gloss: string }

/** One labelled block of the editor's grid. `label` is null for the head-word block,
 *  which is not a family — it is the seven the compact card shows (T-13). */
export interface GridSection { label: string | null; words: GridWord[] }

/**
 * The family label an owner reads (§3.1a: "the family labels are owner phrases …
 * never the schema's group keys").
 *
 * Most `LookGroup` values already ARE owner phrases and pass through unchanged. Two
 * do not, and both are named in §3.1a's list: `Company` reads *With you*, and
 * `Activity` reads *What {he/she/they} did* — the one label on the grid that follows
 * the pet, for the same reason the opening chip does (E-15), and taking the neutral
 * form when nobody recorded a sex.
 */
export function lookGroupLabel(group: string, sex: 'male' | 'female' | 'unknown'): string {
  if (group === 'Company') return 'With you';
  if (group === 'Activity') {
    return sex === 'male' ? 'What he did' : sex === 'female' ? 'What she did' : 'What they did';
  }
  return group;
}

/**
 * The editor's grid, as LABELLED BLOCKS: the seven head words first, then the rest
 * grouped by family in the vocabulary's own order (§3.1a, "the head words then the
 * families").
 *
 * The labels are not decoration and this shape is not a nicety. A cat's list is 26
 * words and a dog's 28, each rendered as *head word, gloss* — long enough that an
 * unlabelled wrap reads as an unsorted wall, which is the exact failure T-21 was
 * written for after the PM found a long word list unusable in the prototype. The
 * ordering alone is invisible: without the labels there is nothing on screen saying
 * the wall IS ordered.
 *
 * Families come out in the order the vocabulary declares them, so the vet's ordering
 * is inherited rather than restated here — a word added to `LOOK_WORDS` lands in its
 * family with no second edit, and a NEW family appears without one either.
 */
export function gridSectionsFor(
  species: LookSpecies,
  headKeys: readonly string[],
  sex: 'male' | 'female' | 'unknown' = 'unknown',
): readonly GridSection[] {
  const all = LOOK_WORDS[species];
  const shape = (w: (typeof all)[number]): GridWord => ({ key: w.key, head: w.head, gloss: w.gloss });

  const heads = headKeys
    .map((k) => all.find((w) => w.key === k))
    .filter((w): w is (typeof all)[number] => !!w);
  const headSet = new Set(heads.map((w) => w.key));

  const sections: GridSection[] = [{ label: null, words: heads.map(shape) }];
  const byGroup = new Map<string, GridWord[]>();
  for (const w of all) {
    if (headSet.has(w.key)) continue;   // already in the head block; never twice
    const bucket = byGroup.get(w.group);
    if (bucket) bucket.push(shape(w));
    else byGroup.set(w.group, [shape(w)]);
  }
  for (const [group, words] of byGroup) {
    sections.push({ label: lookGroupLabel(group, sex), words });
  }
  return sections;
}

/** The grid chip's label — *head word, gloss*, the ruled full label (§4.1 rule 12).
 *  The gloss is never dropped: "Lip-licking" alone lost the findable half (Sam). */
export function gridChipLabel(word: { head: string; gloss: string }): string {
  return `${word.head}, ${word.gloss}`;
}
