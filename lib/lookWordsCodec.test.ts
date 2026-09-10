// The look-words codec's contract (CUL-868 / N-2).
//
// A 25-line module, but it sits on the boundary between a `TEXT[]` server column and a
// `TEXT` local one, on both the push and the pull path — so its stated contract
// ("lossy-toward-empty, never inventing a word") is worth an assertion rather than an
// inference from the round-trips in lib/looks.test.ts.
//
// Why the failure direction matters: every count over words is a count of DAYS a word
// was marked. A row that decodes to `[]` simply does not vote — it under-reports what
// the owner noticed, which is the safe direction. A decoder that threw would crash a
// record screen the owner is already looking at; one that guessed would put a word in
// her mouth.

import { wordsToLocalText, wordsFromLocalText } from './lookWordsCodec';

describe('wordsToLocalText', () => {
  it('encodes a word list as a JSON array string', () => {
    expect(wordsToLocalText(['subdued', 'lip_licking'])).toBe('["subdued","lip_licking"]');
  });

  it('encodes NO words as "[]", never null — the column is NOT NULL DEFAULT \'[]\'', () => {
    // "No words" is a real, legal state: the observed-absence row (outcome
    // 'nothing_unusual') has exactly none, and it is an ANSWER, not missing data.
    expect(wordsToLocalText([])).toBe('[]');
  });

  it('preserves order — the owner’s tap order is what the record holds', () => {
    expect(wordsToLocalText(['b', 'a', 'c'])).toBe('["b","a","c"]');
  });

  it('copies rather than aliasing its input', () => {
    const input = ['subdued'];
    const encoded = wordsToLocalText(input);
    input.push('lively');
    expect(encoded).toBe('["subdued"]');
  });
});

describe('wordsFromLocalText — total, and lossy toward empty', () => {
  it('decodes what it encoded', () => {
    const words = ['subdued', 'walk_refused', 'lip_licking'];
    expect(wordsFromLocalText(wordsToLocalText(words))).toEqual(words);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty string', ''],
    ['malformed JSON', '["subdued"'],
    ['a JSON object', '{"subdued":true}'],
    ['a bare string', '"subdued"'],
    ['a number', '7'],
  ])('reads %s as no words, and does not throw', (_name, stored) => {
    expect(wordsFromLocalText(stored as string | null | undefined)).toEqual([]);
  });

  it('drops non-string members and keeps the rest — it never invents a word', () => {
    expect(wordsFromLocalText('["subdued",7,null,{"a":1},"lively"]')).toEqual(['subdued', 'lively']);
  });

  it('an empty array decodes to an empty list — the absence row round-trips', () => {
    expect(wordsFromLocalText('[]')).toEqual([]);
  });
});
