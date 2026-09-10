// The look vocabulary — Noticed's closed word set, FROZEN AT VERSION 1 (CUL-868 / N-2).
//
// docs/nyx-daily-look-requirements.md §4. This file is the whole vocabulary: the
// keys an owner can send, their owner-facing labels, and which seven per species
// sit on the compact Home card. It is a CONSTANT, never a table and never a
// runtime map — §4.1 rule 10: "Add your own" is a note; a new word is a spec
// revision with Dr. Chen's sign-off, never an owner-minted key.
//
// SIGNED THIS SESSION (the issue: "the keys freeze here"). Dr. Chen's signature on
// §4.2 / §4.3 / T-13 / §4.6 / Q-3 is recorded in
// docs/sessions/2026-09-10-noticed-n2-looks-mirror-vocabulary.md; the two calls
// that changed the shipped set are stated where they bite:
//   • Q-3 `panting_rest` — NOT a chip, in either list. §4.9's gap-11 argument (it
//     would propose labored_breathing's dog arm) died with R10's strike of the
//     symptom link, but the stronger reason stands and is why it stays out: §4.6's
//     dog "Call your vet now" block already carries "panting while lying still and
//     cool". A chip at the same weight as `restless` is a SOFTER DOOR to the same
//     sign (T-6) — it invites logging where the record's own answer is "call".
//   • Q-7 (already ruled, round 3) — `subdued`'s head word is *Off* for BOTH
//     species, with the species gloss on the grid. The key is unchanged.
//
// THE RULES EVERY WORD OBEYS (§4.1), restated because this is where they are
// enforced rather than described:
//   1. The video test — observable, never inferred (*sleeping more*, not *tired*).
//   2. Anchored — "than usual for her"; the reference is her own record.
//   3. Species-keyed — two lists. A key both species share is ONE key (HR-23); the
//      copy split lives in the label, never in a second key.
//   5. Both directions are observations, neither is a verdict.
//   6. The positive half is activities DONE, in ink, never summed (`kind:
//      'positive'`) — a rise in a positive NEVER reassures.
//   8. Intake is never a look word (T-3) — the bowl is the meal path's, and the
//      first row's router opens it.
//   9. Emergency signs are never chips (T-4) — §4.6 is copy behind a door.
//  12. A label is *head word, gloss*. Home shows the head; the full grid shows
//      both; the gloss is the chip's accessibility hint and is NEVER dropped from
//      the grid (Sam: "Lip-licking" alone lost the findable half).
//
// WHAT IS DELIBERATELY ABSENT. There is no map from a look word to a symptom leaf
// (R10): the `Leaf` column of §4.2 / §4.3 is documentation for the report and for
// CUL-845, never runtime. A look writes one row and enters no engine, count, floor
// or coverage line (T-5). The membership walk
// (constants/eventTypes.membership.test.ts) pins that this vocabulary shares NO key
// with the symptom leaf set, so a future link cannot arrive here by accident — and
// this file is deliberately NOT registered in guards/symptomLists.test.ts, because
// registration there is a SKIP: it would exempt the vocabulary from the very scan
// that must catch a symptom leaf appearing in it. See the guard's walk row.

/** The species that have a look vocabulary. `pets.species` also allows `other`;
 *  in v1 an Other pet has no Noticed card at all (§4.1 rule 3, CUL-864 brief 2,
 *  assumed (a) until the PM rules) — so this union is narrower than the column on
 *  purpose, and `lookSpeciesOf` returns null rather than guessing a list. */
export type LookSpecies = 'cat' | 'dog';

/** A word's direction. `concern` words are observations the owner may be worried
 *  by; `positive` words are ACTIVITIES DONE (§4.1 rule 6) — under R1 they are what
 *  a healthy month looks like in the record. The distinction is load-bearing
 *  downstream: a positive is ink on the report's appendix, never a page-1 tally,
 *  and never one half of a two-half comparison (§6.6). */
export type LookWordKind = 'concern' | 'positive';

/** The chip group a word sits in on the unfolded grid (§4.1 rule 4). Presentation
 *  metadata, exactly as `EVENT_FAMILIES` is (taxonomy D2) — never schema, never a
 *  membership list. Where the taxonomy family has not landed yet (Mobility W4,
 *  Urinary & litter W3, Mouth W5+), the look's group names it anyway; the group is
 *  the look's own, and it does not wait on a wave. */
export type LookGroup =
  | 'Energy'
  | 'Company'
  | 'Sounds'
  | 'Grooming & coat'
  | 'Skin & coat'
  | 'Face'
  | 'Mouth'
  | 'Moving'
  | 'Litter box'
  | 'Toilet'
  | 'Drinking'
  | 'Activity';

export interface LookWord {
  /** The stored key. Closed set; the client validates `looks.words` against it
   *  (the 032 `document` precedent — no CHECK, so the vocabulary grows by spec
   *  revision without a migration). */
  readonly key: string;
  /** What Home's compact card shows, and the first half of the grid's label. */
  readonly head: string;
  /** The second half of the grid's label, and the chip's accessibility hint.
   *  Never dropped from the grid (§4.1 rule 12). */
  readonly gloss: string;
  readonly group: LookGroup;
  readonly kind: LookWordKind;
}

// ── The opening chip ─────────────────────────────────────────────────────────

/** *Not herself* — the owner's chief complaint ("ADR"). ONE key across both
 *  species and all three sexes; the LABEL follows `pets.sex`, which is NOT NULL
 *  with an `unknown` member (migration 001), so there are three forms, not two
 *  (E-15). Stored alone only when no word follows; it is a word key like any
 *  other in `looks.words`, but it is not part of the grid's 26 / 28 and so it is
 *  exported separately rather than hidden inside the counts. */
export const LOOK_OPENING_CHIP_KEY = 'not_herself';

/** The opening chip's label for a pet. `unknown` takes *Not themself* — the
 *  `nyx-voice` form (E-15); a pet whose sex nobody recorded is still hers to
 *  describe, and "Not herself" would be the app guessing. */
export function notHerselfLabel(sex: 'male' | 'female' | 'unknown'): string {
  return sex === 'male' ? 'Not himself' : sex === 'female' ? 'Not herself' : 'Not themself';
}

// ── Cat — 26 words (§4.2) ────────────────────────────────────────────────────

const CAT_WORDS: readonly LookWord[] = [
  { key: 'subdued',         head: 'Off',                       gloss: 'flat, lying about',                       group: 'Energy',          kind: 'concern' },
  { key: 'sleeping_more',   head: 'Sleeping more',             gloss: 'asleep when she is usually up',           group: 'Energy',          kind: 'concern' },
  { key: 'restless',        head: 'Restless',                  gloss: 'can’t settle',                            group: 'Energy',          kind: 'concern' },
  { key: 'lively',          head: 'Lively',                    gloss: 'playful',                                 group: 'Energy',          kind: 'positive' },
  { key: 'hiding',          head: 'Hiding',                    gloss: 'under the bed, out of the room',          group: 'Company',         kind: 'concern' },
  { key: 'clingy',          head: 'Clingy',                    gloss: 'following you, on your lap',              group: 'Company',         kind: 'concern' },
  { key: 'not_greeting',    head: 'Not coming to say hello',   gloss: 'when you came in or called',              group: 'Company',         kind: 'concern' },
  { key: 'vocal_more',      head: 'Meowing or crying more',    gloss: 'more vocal, especially at night',         group: 'Sounds',          kind: 'concern' },
  { key: 'not_grooming',    head: 'Not grooming',              gloss: 'coat unattended, scruffy',                group: 'Grooming & coat', kind: 'concern' },
  { key: 'overgrooming',    head: 'Licking or chewing one spot', gloss: 'one place licked raw, wet or bald',     group: 'Grooming & coat', kind: 'concern' },
  { key: 'scratching_more', head: 'Scratching more',           gloss: 'at herself, more than usual',             group: 'Grooming & coat', kind: 'concern' },
  { key: 'coat_dull',       head: 'Coat dull or scruffy',      gloss: 'flat, dull, unkempt',                     group: 'Grooming & coat', kind: 'concern' },
  { key: 'squinting',       head: 'Squinting',                 gloss: 'one or both eyes half shut',              group: 'Face',            kind: 'concern' },
  // The vet's phrase ("third eyelid") is the KEY, never the chip: the chip is what
  // an owner would say seeing it for the first time (§4.2).
  { key: 'third_eyelid',    head: 'A film across the eye',     gloss: 'the whitish inner lid, part way across',   group: 'Face',            kind: 'concern' },
  { key: 'lip_licking',     head: 'Lip-licking',               gloss: 'swallowing a lot, nothing in her mouth',   group: 'Mouth',           kind: 'concern' },
  { key: 'drooling',        head: 'Drooling',                  gloss: 'saliva at the lips or on her chin',        group: 'Mouth',           kind: 'concern' },
  { key: 'hunched',         head: 'Hunched or tucked up',      gloss: 'paws tucked, not stretched out',           group: 'Moving',          kind: 'concern' },
  { key: 'stiff',           head: 'Stiff',                     gloss: 'slow rising, stiff first steps',           group: 'Moving',          kind: 'concern' },
  { key: 'not_jumping',     head: 'Not jumping up',            gloss: 'hesitating at the counter, bed or sill',   group: 'Moving',          kind: 'concern' },
  { key: 'limping',         head: 'Limping',                   gloss: 'favouring a leg',                          group: 'Moving',          kind: 'concern' },
  { key: 'trembling',       head: 'Trembling',                 gloss: 'shaking or shivering at rest',             group: 'Moving',          kind: 'concern' },
  { key: 'outside_box',     head: 'Outside the box',           gloss: 'pee or poo found outside the tray',        group: 'Litter box',      kind: 'concern' },
  { key: 'drinking_more',   head: 'Drinking more',             gloss: 'at the bowl or tap more than usual',       group: 'Drinking',        kind: 'concern' },
  { key: 'drinking_less',   head: 'Drinking less',             gloss: 'the bowl untouched longer than usual',     group: 'Drinking',        kind: 'concern' },
  { key: 'played',          head: 'Played',                    gloss: 'chased, pounced, batted a toy',            group: 'Activity',        kind: 'positive' },
  { key: 'jumped_high',     head: 'Jumped up somewhere high',  gloss: 'the counter, the sill, the wardrobe',      group: 'Activity',        kind: 'positive' },
];

// ── Dog — 28 words (§4.3) ────────────────────────────────────────────────────

const DOG_WORDS: readonly LookWord[] = [
  { key: 'subdued',         head: 'Off',                       gloss: 'not getting up for the things he usually does', group: 'Energy',     kind: 'concern' },
  { key: 'sleeping_more',   head: 'Sleeping more',             gloss: 'asleep when he is usually up',            group: 'Energy',          kind: 'concern' },
  { key: 'restless',        head: 'Restless',                  gloss: 'pacing, circling',                        group: 'Energy',          kind: 'concern' },
  { key: 'restless_night',  head: 'Can’t settle at night',     gloss: 'up in the night, not sleeping through',   group: 'Energy',          kind: 'concern' },
  { key: 'lively',          head: 'Lively',                    gloss: 'bouncy, more play than usual',            group: 'Energy',          kind: 'positive' },
  // Dr. Chen's daily activity test — the one word on this list a vet asks for by name.
  { key: 'walk_refused',    head: 'Didn’t want the walk',      gloss: 'hung back, lay down, turned for home',    group: 'Energy',          kind: 'concern' },
  { key: 'not_greeting',    head: 'Not greeting at the door',  gloss: 'didn’t come when you came in',            group: 'Company',         kind: 'concern' },
  { key: 'not_coming',      head: 'Not coming when called',    gloss: 'no response to his name',                 group: 'Company',         kind: 'concern' },
  { key: 'clingy',          head: 'Clingy',                    gloss: 'under your feet, pressing against you',   group: 'Company',         kind: 'concern' },
  { key: 'hiding',          head: 'Keeping away',              gloss: 'off in another room, under something',    group: 'Company',         kind: 'concern' },
  { key: 'tail_down',       head: 'Tail down',                 gloss: 'carried low or tucked',                   group: 'Company',         kind: 'concern' },
  { key: 'vocal_more',      head: 'Whining or barking more',   gloss: 'more vocal than usual',                   group: 'Sounds',          kind: 'concern' },
  { key: 'scratching_more', head: 'Scratching more',           gloss: 'at himself, more than usual',             group: 'Skin & coat',     kind: 'concern' },
  { key: 'overgrooming',    head: 'Licking or chewing one spot', gloss: 'one paw or flank, licked or chewed',    group: 'Skin & coat',     kind: 'concern' },
  { key: 'coat_dull',       head: 'Coat dull',                 gloss: 'flat and dull',                           group: 'Skin & coat',     kind: 'concern' },
  { key: 'lip_licking',     head: 'Lip-licking',               gloss: 'swallowing a lot, nothing in his mouth',  group: 'Mouth',           kind: 'concern' },
  { key: 'drooling',        head: 'Drooling',                  gloss: 'saliva at the lips, chin or floor',       group: 'Mouth',           kind: 'concern' },
  { key: 'eating_grass',    head: 'Eating grass',              gloss: 'grazing more than his usual',             group: 'Mouth',           kind: 'concern' },
  { key: 'stiff',           head: 'Stiff',                     gloss: 'slow rising, stiff first steps',          group: 'Moving',          kind: 'concern' },
  { key: 'not_jumping',     head: 'Not doing the stairs or the car', gloss: 'hesitating at the stairs, the sofa, the car', group: 'Moving', kind: 'concern' },
  { key: 'limping',         head: 'Limping',                   gloss: 'favouring a leg',                         group: 'Moving',          kind: 'concern' },
  { key: 'hunched',         head: 'Hunched',                   gloss: 'back arched, belly tucked',               group: 'Moving',          kind: 'concern' },
  { key: 'trembling',       head: 'Trembling',                 gloss: 'shaking or shivering at rest',            group: 'Moving',          kind: 'concern' },
  { key: 'outside_box',     head: 'Accident indoors',          gloss: 'peed or pooed inside',                    group: 'Toilet',          kind: 'concern' },
  { key: 'drinking_more',   head: 'Drinking more',             gloss: 'at the bowl more; it empties faster',     group: 'Drinking',        kind: 'concern' },
  { key: 'drinking_less',   head: 'Drinking less',             gloss: 'the bowl untouched longer than usual',    group: 'Drinking',        kind: 'concern' },
  { key: 'full_walk',       head: 'Full walk',                 gloss: 'the whole usual route at the usual pace', group: 'Activity',        kind: 'positive' },
  { key: 'played',          head: 'Played',                    gloss: 'fetched, tugged, played with another dog', group: 'Activity',       kind: 'positive' },
];

/** The grid vocabulary, per species: cat 26 (§4.2), dog 28 (§4.3). The opening
 *  chip (`not_herself`) is NOT in here — it is its own row on the card and its own
 *  export above — and neither is the intake router or the emergency door, because
 *  neither is a word (§4.5, §4.6: the router opens the meal path and writes
 *  nothing to the look; the door reads the record and writes nothing at all). */
export const LOOK_WORDS: Record<LookSpecies, readonly LookWord[]> = {
  cat: CAT_WORDS,
  dog: DOG_WORDS,
};

/**
 * The seven head words per species that sit on the COMPACT card, exempt from the
 * unfold (T-13).
 *
 * A SAFETY LIST, NOT A LAYOUT. The seven are chosen on clinical yield: the highest-
 * yield ambiguous signs — the nausea prodrome (`lip_licking`) and, for a cat, the
 * tray (`outside_box`) — earn a slot over `clingy` and `restless`, which are one
 * unfold away. `lively` is on both lists deliberately: §4.1 rule 5 is only true if
 * the good direction costs the same tap as the bad one.
 *
 * A SUBSET of LOOK_WORDS, pinned as such — a transitive consumer is invisible to a
 * membership scan (C-11), which is why this list is named in LOOK_WORDS's walk row
 * rather than left to be discovered.
 */
export const LOOK_HEAD_WORDS: Record<LookSpecies, readonly string[]> = {
  // Off · Sleeping more · Hiding · Not grooming · Lip-licking · Outside the box · Lively
  cat: ['subdued', 'sleeping_more', 'hiding', 'not_grooming', 'lip_licking', 'outside_box', 'lively'],
  // Off · Sleeping more · Didn't want the walk · Restless · Not greeting · Lip-licking · Lively
  dog: ['subdued', 'sleeping_more', 'walk_refused', 'restless', 'not_greeting', 'lip_licking', 'lively'],
};

/**
 * The vocabulary's version, stored on every row (`looks.vocab_version`).
 *
 * Its whole job is §6.10: rows compare only WITHIN a version. Changing a key's
 * meaning, splitting a word, or retiring one makes the counts either side of the
 * change incomparable, and a count that silently spans the change is a claim the
 * record cannot support. Bump this in the same PR as any such change — never for a
 * copy edit that leaves every key meaning what it meant.
 */
export const LOOK_VOCAB_VERSION = 1;

// ── The closed set the write path validates against ──────────────────────────

/** Every key a look may store for a species: the grid words plus the opening chip.
 *  `insertLook` validates against this; a key outside it is a programming error,
 *  never something an owner can produce (there is no free-text word — §4.1 rule 10). */
export const LOOK_VOCABULARY: Record<LookSpecies, ReadonlySet<string>> = {
  cat: new Set([...CAT_WORDS.map((w) => w.key), LOOK_OPENING_CHIP_KEY]),
  dog: new Set([...DOG_WORDS.map((w) => w.key), LOOK_OPENING_CHIP_KEY]),
};

/** `pets.species` → the vocabulary's species, or null when there is no list.
 *  Null is the honest answer for `other` (and for an unrecognised value): in v1 an
 *  Other pet has no Noticed card, and a neutral list is a follow-up signed when a
 *  real Other account exists (§4.1 rule 3). Callers render nothing rather than
 *  defaulting to the dog's words. */
export function lookSpeciesOf(species: string | null | undefined): LookSpecies | null {
  return species === 'cat' || species === 'dog' ? species : null;
}

/** One word's entry for a species, or null when the key is not in that list.
 *  Null rather than a throw: a row can carry a key this build does not know (an
 *  older or newer vocabulary on the same account), and a record screen must render
 *  it honestly rather than crash — the §8 degradation contract, applied to words. */
export function lookWord(species: LookSpecies, key: string): LookWord | null {
  return LOOK_WORDS[species].find((w) => w.key === key) ?? null;
}

/**
 * A stored key's DIRECTION, across both species — `null` for a key neither list names
 * (CUL-873).
 *
 * WHY IT IS A FUNCTION AND NOT A LIST. The receipts are "earned only by a symptom-class
 * word — never by *nothing unusual*, never by an activity word" (§3.3, T-18: *first day
 * Mochi has seemed lively* is a wellness receipt). That is a membership question, and the
 * honest way to answer it is to read the `kind` each word already carries rather than to
 * copy the concern keys into a second list that can drift — the C-11 problem avoided
 * rather than registered. The set-equality this produces is asserted in the membership
 * walk (`constants/eventTypes.membership.test.ts`), where a decision belongs.
 *
 * THE OPENING CHIP IS A CONCERN, and this is the one classification not already in the
 * table. *Not herself* is the owner's chief complaint — "ADR", the reason a worried owner
 * opens the app — so it is neither an activity word nor the absence, and a receipt about
 * the first day it was marked is exactly the sentence §3.3 wants. It lives outside
 * `LOOK_WORDS` because its label follows `pets.sex` (E-15), not because it is a lesser
 * word.
 *
 * The pet's own species is tried first and the sibling is the fallback, mirroring
 * `lib/lookDisplay`'s resolver: a shared key means the same thing in both lists, so a
 * record whose pet is not in the store still classifies honestly.
 */
export function lookWordKind(key: string, species?: LookSpecies | null): LookWordKind | null {
  if (key === LOOK_OPENING_CHIP_KEY) return 'concern';
  const order: LookSpecies[] = species ? [species, species === 'cat' ? 'dog' : 'cat'] : ['cat', 'dog'];
  for (const s of order) {
    const word = lookWord(s, key);
    if (word) return word.kind;
  }
  return null;
}
