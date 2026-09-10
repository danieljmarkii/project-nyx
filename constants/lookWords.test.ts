// The look vocabulary, pinned (CUL-868 / N-2). docs/nyx-daily-look-requirements.md §4.
//
// This suite is what makes "the keys freeze here" a fact rather than a sentence.
// It pins the two counts, the seven head words per species, the shape of a label,
// and — the part that matters clinically — that no word an owner can tap carries a
// diagnosis, a verdict, a preference word or an anthropomorphic affect (§4.4 and
// the per-word *Never beside* column, which Dr. Chen's review used as its tool).
//
// The disjointness from the symptom leaf set lives in the membership walk
// (constants/eventTypes.membership.test.ts), with its per-list decision row, not
// here: that is a MEMBERSHIP question about two lists, and the walk is where a
// membership decision is recorded.

import {
  LOOK_WORDS,
  LOOK_HEAD_WORDS,
  LOOK_VOCABULARY,
  LOOK_VOCAB_VERSION,
  LOOK_OPENING_CHIP_KEY,
  notHerselfLabel,
  lookSpeciesOf,
  lookWord,
  type LookSpecies,
} from './lookWords';

const SPECIES: LookSpecies[] = ['cat', 'dog'];

describe('the look vocabulary — the counts and the shape', () => {
  it('cat carries 26 words, dog 28 (§4.2 / §4.3, panting_rest withdrawn — Q-3)', () => {
    expect(LOOK_WORDS.cat).toHaveLength(26);
    expect(LOOK_WORDS.dog).toHaveLength(28);
  });

  // Q-3, signed this session: the dog list ships WITHOUT a panting chip. §4.6's dog
  // "Call your vet now" block already carries "panting while lying still and cool";
  // a chip at the same weight as `restless` would be a softer door to the same sign
  // (T-6). If a later spec revision signs a chip + threshold, this line is what it
  // has to delete — deliberately, not by drift.
  it('panting_rest is not a chip in either list (Q-3 — it stays a door row)', () => {
    for (const s of SPECIES) {
      expect(LOOK_WORDS[s].map((w) => w.key)).not.toContain('panting_rest');
      expect(LOOK_VOCABULARY[s].has('panting_rest')).toBe(false);
    }
  });

  it.each(SPECIES)('%s: keys are unique, and every label has both halves', (s) => {
    const keys = LOOK_WORDS[s].map((w) => w.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const w of LOOK_WORDS[s]) {
      expect(w.head.length).toBeGreaterThan(0);
      // §4.1 rule 12: the gloss is never dropped from the grid, so a word without
      // one would ship a label that is only half a label.
      expect(w.gloss.length).toBeGreaterThan(0);
    }
  });

  it('a key shared by both species means the same thing (HR-23: one key, the label splits)', () => {
    const dog = new Map(LOOK_WORDS.dog.map((w) => [w.key, w]));
    for (const cat of LOOK_WORDS.cat) {
      const twin = dog.get(cat.key);
      if (!twin) continue;
      // The GROUP may legitimately differ (a cat's `outside_box` is the litter box,
      // a dog's is the floor); the DIRECTION may not — a word that is a concern for
      // one species and a positive for the other is two meanings on one key.
      expect(`${cat.key}:${twin.kind}`).toBe(`${cat.key}:${cat.kind}`);
    }
  });

  it('the positives are the activities done, and nothing else is (§4.1 rule 6)', () => {
    const positives = (s: LookSpecies) => LOOK_WORDS[s].filter((w) => w.kind === 'positive').map((w) => w.key);
    expect(positives('cat')).toEqual(['lively', 'played', 'jumped_high']);
    expect(positives('dog')).toEqual(['lively', 'full_walk', 'played']);
  });

  it('the closed set is the words plus the opening chip, and nothing else', () => {
    for (const s of SPECIES) {
      expect([...LOOK_VOCABULARY[s]].sort()).toEqual(
        [...LOOK_WORDS[s].map((w) => w.key), LOOK_OPENING_CHIP_KEY].sort(),
      );
    }
  });

  it('the vocabulary is version 1', () => {
    expect(LOOK_VOCAB_VERSION).toBe(1);
  });
});

describe('the head words (T-13) — a safety list, not a layout', () => {
  it('cat: Off · Sleeping more · Hiding · Not grooming · Lip-licking · Outside the box · Lively', () => {
    expect(LOOK_HEAD_WORDS.cat).toEqual([
      'subdued', 'sleeping_more', 'hiding', 'not_grooming', 'lip_licking', 'outside_box', 'lively',
    ]);
  });

  it('dog: Off · Sleeping more · Didn’t want the walk · Restless · Not greeting · Lip-licking · Lively', () => {
    expect(LOOK_HEAD_WORDS.dog).toEqual([
      'subdued', 'sleeping_more', 'walk_refused', 'restless', 'not_greeting', 'lip_licking', 'lively',
    ]);
  });

  it.each(SPECIES)('%s: seven, every one a real word of that species', (s) => {
    expect(LOOK_HEAD_WORDS[s]).toHaveLength(7);
    const keys = new Set(LOOK_WORDS[s].map((w) => w.key));
    for (const key of LOOK_HEAD_WORDS[s]) expect(keys.has(key)).toBe(true);
  });

  // §4.1 rule 5, made structural on the surface that costs the least: if the good
  // direction were one unfold further away than the bad one, the compact card would
  // be a concern-only instrument and every count it feeds would be selected on the
  // outcome.
  it.each(SPECIES)('%s: the good direction is on the compact card too', (s) => {
    const heads = new Set(LOOK_HEAD_WORDS[s]);
    expect(LOOK_WORDS[s].some((w) => w.kind === 'positive' && heads.has(w.key))).toBe(true);
  });

  it('Off is the head word for both species (Q-7), and the key is unchanged', () => {
    for (const s of SPECIES) expect(lookWord(s, 'subdued')?.head).toBe('Off');
  });
});

describe('§4.4 — what no chip may ever say', () => {
  // Terms banned in ANY context an owner reads on a chip: a diagnosis, a verdict
  // about the animal, a preference word, an anthropomorphic affect, or one of the
  // fold spec's inherited vetoes. Deliberately NOT in this list, with the reason
  // said rather than left as an omission:
  //   • `down` — the fold vetoes it as a TREND direction ("down from 8"); a dog's
  //     tail carriage is a body position, and *Tail down* is a signed §4.3 label.
  //   • `normal` / `well` / `good` — ordinary English whose ban is scoped to a
  //     verdict about the pet; a substring rule over them would fail honest glosses
  //     and teach the next author to delete the guard.
  // Both exclusions are what the per-word *Never beside* column is for: it is
  // reviewed by a human, and this list is the subset a machine can hold.
  const BANNED = [
    'in pain', 'painful', 'anxious', 'stressed', 'depressed', 'nauseous', 'dehydrated',
    'bloated', 'blocked', 'constipated', 'infected', 'allergic', 'dizzy', 'allergies', 'fleas',
    'fine', 'okay', 'healthy', 'improving', 'recovering', 'herself again', 'himself again',
    'back to herself', 'back to himself', 'calm', 'relaxed', 'content', 'comfortable', 'settled',
    'picky', 'fussy', 'bored of it', 'diva', 'happy', 'sad', 'guilty', 'sulking', 'grumpy', 'jealous',
    'lazy', 'stubborn', 'naughty', 'spite', 'protest', 'resolved', 'cleared', 'all clear', 'quieter',
    'very', 'severe', 'mild',
  ];

  const labels = SPECIES.flatMap((s) =>
    LOOK_WORDS[s].map((w) => ({ where: `${s}/${w.key}`, text: `${w.head} ${w.gloss}` })),
  ).concat(
    (['male', 'female', 'unknown'] as const).map((sex) => ({
      where: `opening/${sex}`,
      text: notHerselfLabel(sex),
    })),
  );

  it('no chip carries a diagnosis, a verdict, a preference word or an affect', () => {
    const offenders = labels.filter(({ text }) =>
      BANNED.some((term) => new RegExp(`\\b${term}\\b`, 'i').test(text)),
    );
    expect(offenders.map((o) => o.where)).toEqual([]);
  });

  // nyx-voice, and guards/ownerFacingCopy.test.ts's rule said at the source: this
  // file is a constants module, so the copy guard's display-sink scan never reaches
  // these strings.
  it('no exclamation mark anywhere in the vocabulary', () => {
    expect(labels.filter(({ text }) => text.includes('!')).map((o) => o.where)).toEqual([]);
  });

  // §4.1 rule 1, the video test's negative half: a chip names what was SEEN. These
  // are the inference verbs a label slips into when it stops describing.
  it('no chip infers a feeling ("seems", "looks like", "feeling")', () => {
    const inferring = labels.filter(({ text }) => /\b(seems?|feeling|looks like|probably)\b/i.test(text));
    expect(inferring.map((o) => o.where)).toEqual([]);
  });

  // Red-check: the detector above is only worth its line if it can catch the thing
  // it exists to catch (CUL-613 — a guard that has only ever been green is untested).
  it('red-check: the banned-term detector catches a verdict label', () => {
    const probe = 'Calm, back to herself';
    expect(BANNED.some((term) => new RegExp(`\\b${term}\\b`, 'i').test(probe))).toBe(true);
  });
});

describe('the opening chip and the species lookup', () => {
  it('the label follows pets.sex, and `unknown` has its own form (E-15)', () => {
    expect(notHerselfLabel('female')).toBe('Not herself');
    expect(notHerselfLabel('male')).toBe('Not himself');
    expect(notHerselfLabel('unknown')).toBe('Not themself');
  });

  it('an Other pet has no list — null, never a defaulted one (§4.1 rule 3)', () => {
    expect(lookSpeciesOf('cat')).toBe('cat');
    expect(lookSpeciesOf('dog')).toBe('dog');
    expect(lookSpeciesOf('other')).toBeNull();
    expect(lookSpeciesOf(null)).toBeNull();
    expect(lookSpeciesOf('ferret')).toBeNull();
  });

  it('an unknown key reads as null, never a throw (§8 degradation, applied to words)', () => {
    expect(lookWord('cat', 'full_walk')).toBeNull(); // a dog word on a cat's record
    expect(lookWord('dog', 'not_a_word')).toBeNull();
  });
});
