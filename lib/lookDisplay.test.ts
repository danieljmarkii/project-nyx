import {
  describeLook,
  lookSummary,
  unnamedWordsLine,
  gridSectionsFor,
  lookGroupLabel,
  gridChipLabel,
  isLookRow,
  ABSENCE_PHRASE,
} from './lookDisplay';
import { wordsToLocalText } from './lookWordsCodec';
import { LOOK_HEAD_WORDS, LOOK_WORDS, LOOK_OPENING_CHIP_KEY } from '../constants/lookWords';

// CUL-869 / N-3. The resolver every record surface reads a look through, so the
// tests below are grouped by the question each surface actually asks it.

function row(over: Partial<Parameters<typeof describeLook>[0]> = {}) {
  return {
    event_type: 'check_in',
    look_outcome: 'observed' as string | null,
    look_words: wordsToLocalText(['subdued', 'walk_refused']),
    look_note: null as string | null,
    ...over,
  };
}

const DOG = { species: 'dog', sex: 'male' as const };
const CAT = { species: 'cat', sex: 'female' as const };

describe('describeLook — the three kinds', () => {
  it('an observed look resolves its words in the pet’s own copy', () => {
    const d = describeLook(row(), DOG);
    expect(d.kind).toBe('observed');
    expect(d.words.map((w) => w.key)).toEqual(['subdued', 'walk_refused']);
    expect(d.words[0]).toEqual({
      key: 'subdued',
      head: 'Off',
      gloss: 'not getting up for the things he usually does',
    });
  });

  it('the same key reads in the CAT’s copy for a cat — one key, two labels (HR-23)', () => {
    const cat = describeLook(row({ look_words: wordsToLocalText(['subdued']) }), CAT);
    const dog = describeLook(row({ look_words: wordsToLocalText(['subdued']) }), DOG);
    expect(cat.words[0].head).toBe(dog.words[0].head); // the head word is shared (Q-7)
    expect(cat.words[0].gloss).toBe('flat, lying about');
    expect(dog.words[0].gloss).toBe('not getting up for the things he usually does');
  });

  it('an absence row is the absence, and carries no words even if the column does', () => {
    const d = describeLook(
      row({ look_outcome: 'nothing_unusual', look_words: wordsToLocalText(['subdued']) }),
      DOG,
    );
    expect(d.kind).toBe('absence');
    expect(d.words).toEqual([]);
  });

  it('a check_in with NO child row is `unknown` — never the absence', () => {
    // The safety-relevant one. "Nothing unusual" is the only phrase in this feature
    // that describes the PET, and a missing child (partial hydration, a parent that
    // arrived first) must never be able to produce it.
    const d = describeLook(row({ look_outcome: null, look_words: null }), DOG);
    expect(d.kind).toBe('unknown');
    expect(lookSummary(d)).toBeNull();
    expect(lookSummary(d)).not.toBe(ABSENCE_PHRASE);
  });

  it('an outcome value this build does not know reads as an OBSERVATION', () => {
    // The same direction `loadLookDays` takes. A future third outcome must not fall
    // into the one bucket a surface is allowed to call clear.
    const d = describeLook(row({ look_outcome: 'some_future_outcome' }), DOG);
    expect(d.kind).toBe('observed');
  });

  it('an unreadable word list under-reports rather than throwing', () => {
    const d = describeLook(row({ look_words: '{not json' }), DOG);
    expect(d.kind).toBe('observed');
    expect(d.words).toEqual([]);
    expect(d.unnamed).toBe(0);
  });
});

describe('describeLook — the opening chip’s three forms (E-15)', () => {
  const opening = row({ look_words: wordsToLocalText([LOOK_OPENING_CHIP_KEY]) });

  it.each([
    ['female', 'Not herself'],
    ['male', 'Not himself'],
    ['unknown', 'Not themself'],
  ] as const)('sex %s → %s', (sex, head) => {
    expect(describeLook(opening, { species: 'cat', sex }).words[0].head).toBe(head);
  });

  it('a pet missing from the store takes the neutral form, not a guess', () => {
    expect(describeLook(opening, {}).words[0].head).toBe('Not themself');
  });

  it('is resolved at all — it is NOT in LOOK_WORDS, so a plain lookWord() would drop it', () => {
    // The regression this test exists for: `lookWord()` searches LOOK_WORDS, which
    // deliberately excludes the opening chip, so a resolver that used it alone would
    // silently erase the single most common one-word look.
    expect(LOOK_WORDS.cat.some((w) => w.key === LOOK_OPENING_CHIP_KEY)).toBe(false);
    expect(describeLook(opening, CAT).unnamed).toBe(0);
  });
});

describe('describeLook — a key the pet’s own list does not hold', () => {
  it('falls back to the sibling species rather than erasing the word', () => {
    // The ordinary cause is not a future build: an owner CORRECTS a pet's species
    // after logging, and every dog-only word on her record becomes unresolvable
    // against the cat list. Dropping them would destroy what she actually recorded.
    const d = describeLook(row({ look_words: wordsToLocalText(['walk_refused']) }), CAT);
    expect(d.unnamed).toBe(0);
    expect(d.words[0].head).toBe('Didn’t want the walk');
  });

  it('counts a key in NEITHER list rather than dropping it silently', () => {
    const d = describeLook(
      row({ look_words: wordsToLocalText(['subdued', 'from_vocab_v2']) }),
      DOG,
    );
    expect(d.words.map((w) => w.key)).toEqual(['subdued']);
    expect(d.unnamed).toBe(1);
    expect(unnamedWordsLine(d.unnamed)).toBe('1 more word this version of the app can’t show yet.');
  });

  it('a look whose EVERY word is unnameable summarises as nothing, never as the absence', () => {
    const d = describeLook(row({ look_words: wordsToLocalText(['from_vocab_v2']) }), DOG);
    expect(lookSummary(d)).toBeNull();
    expect(unnamedWordsLine(d.unnamed)).toBe('1 more word this version of the app can’t show yet.');
  });

  it('pluralises', () => {
    expect(unnamedWordsLine(2)).toBe('2 more words this version of the app can’t show yet.');
    expect(unnamedWordsLine(0)).toBeNull();
  });
});

describe('lookSummary — the one fragment History, the spine and the drill-in share', () => {
  it('joins the head words in sentence case, in the order chosen', () => {
    expect(lookSummary(describeLook(row(), DOG))).toBe('off, didn’t want the walk');
  });

  it('lower-cases only the first character — an interior capital survives', () => {
    // Nothing in the shipped vocabulary needs this today; the test pins the RULE so a
    // future word with an interior capital is not flattened by a `.toLowerCase()`.
    const d = describeLook(row({ look_words: wordsToLocalText(['not_greeting']) }), DOG);
    expect(lookSummary(d)).toBe('not greeting at the door');
  });

  it('an absence reads as the marked absence and never as a good day', () => {
    const d = describeLook(row({ look_outcome: 'nothing_unusual' }), DOG);
    expect(lookSummary(d)).toBe('nothing unusual');
    // §5.6 — the phrases this line may never become.
    expect(lookSummary(d)).not.toMatch(/good|fine|well|clear|healthy|normal/i);
  });

  it('the note is trimmed, and empty is no note', () => {
    expect(describeLook(row({ look_note: '  saw it twice  ' }), DOG).note).toBe('saw it twice');
    expect(describeLook(row({ look_note: '   ' }), DOG).note).toBeNull();
  });
});

describe('isLookRow', () => {
  it('is the type test and nothing else', () => {
    expect(isLookRow({ event_type: 'check_in' })).toBe(true);
    expect(isLookRow({ event_type: 'vomit' })).toBe(false);
    expect(isLookRow({ event_type: 'other' })).toBe(false);
  });
});

describe('gridSectionsFor — the editor’s labelled blocks (§3.1a)', () => {
  it.each(['cat', 'dog'] as const)('%s: the head block leads, unlabelled', (species) => {
    const [head] = gridSectionsFor(species, LOOK_HEAD_WORDS[species]);
    expect(head.label).toBeNull();  // not a family — the seven the card shows (T-13)
    expect(head.words.map((w) => w.key)).toEqual([...LOOK_HEAD_WORDS[species]]);
  });

  it.each(['cat', 'dog'] as const)('%s: every word appears exactly once, and none is lost', (species) => {
    const keys = gridSectionsFor(species, LOOK_HEAD_WORDS[species]).flatMap((s) => s.words.map((w) => w.key));
    // No duplication: a head word appears in the head block and NOT again in its family.
    expect(new Set(keys).size).toBe(keys.length);
    // And nothing is dropped — the sections ARE the whole vocabulary, re-grouped.
    expect(new Set(keys)).toEqual(new Set(LOOK_WORDS[species].map((w) => w.key)));
  });

  it.each(['cat', 'dog'] as const)('%s: every family block after the first carries a label', (species) => {
    // The labels are the point: ~29 long chips with nothing naming the groups reads
    // as an unsorted wall, whatever order it is in (T-21).
    const [, ...families] = gridSectionsFor(species, LOOK_HEAD_WORDS[species]);
    expect(families.length).toBeGreaterThan(3);
    for (const f of families) {
      expect(f.label).toBeTruthy();
      expect(f.words.length).toBeGreaterThan(0);
    }
  });

  it('families come out in the vocabulary’s own order — the vet’s, inherited not restated', () => {
    const declared = LOOK_WORDS.dog
      .filter((w) => !LOOK_HEAD_WORDS.dog.includes(w.key))
      .map((w) => w.group);
    const firstSeen = [...new Set(declared)];
    const [, ...families] = gridSectionsFor('dog', LOOK_HEAD_WORDS.dog, 'male');
    expect(families.map((f) => f.label)).toEqual(firstSeen.map((g) => lookGroupLabel(g, 'male')));
  });

  it('re-words the two group keys §3.1a names, and passes the rest through', () => {
    expect(lookGroupLabel('Company', 'unknown')).toBe('With you');
    expect(lookGroupLabel('Energy', 'unknown')).toBe('Energy');
    expect(lookGroupLabel('Mouth', 'unknown')).toBe('Mouth');
  });

  it('the activity family follows the pet, and takes the neutral form when unknown', () => {
    expect(lookGroupLabel('Activity', 'male')).toBe('What he did');
    expect(lookGroupLabel('Activity', 'female')).toBe('What she did');
    expect(lookGroupLabel('Activity', 'unknown')).toBe('What they did');
  });

  it('the chip label carries both halves — the gloss is never dropped (§4.1 rule 12)', () => {
    expect(gridChipLabel({ head: 'Lip-licking', gloss: 'swallowing a lot' }))
      .toBe('Lip-licking, swallowing a lot');
  });
});
