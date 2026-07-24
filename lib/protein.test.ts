import {
  canonicalizeProtein,
  COMMON_PROTEINS,
  proteinsToCacheText,
  proteinsFromCacheText,
  normalizeExtractedProtein,
  deriveProteinSet,
  MAX_CAPTURED_PROTEINS,
} from './protein';

// The picker's offered set (B-332) must stay in lockstep with the canonicalizer,
// or an owner-picked chip would key differently from the same protein extracted
// by AI — the exact fragmentation B-052 exists to prevent. These are the guards
// that keep the list honest as anyone edits it.
describe('COMMON_PROTEINS (picker set)', () => {
  it('is non-empty', () => {
    expect(COMMON_PROTEINS.length).toBeGreaterThan(0);
  });

  it('every value is canonicalize-STABLE — canonicalize(v) === v', () => {
    // If this fails, the chip stores a value that would be re-keyed on read, so
    // the chip and its own canonical form would rank as two different proteins.
    for (const p of COMMON_PROTEINS) {
      expect(canonicalizeProtein(p)).toBe(p);
    }
  });

  it('no value canonicalizes to junk/null', () => {
    for (const p of COMMON_PROTEINS) {
      expect(canonicalizeProtein(p)).not.toBeNull();
    }
  });

  it('has no duplicate values', () => {
    expect(new Set(COMMON_PROTEINS).size).toBe(COMMON_PROTEINS.length);
  });

  it('stores lowercase — matches how extraction writes the value', () => {
    for (const p of COMMON_PROTEINS) {
      expect(p).toBe(p.toLowerCase());
    }
  });

  // The load-bearing parity claim: an owner picking a chip and the AI extracting
  // the same protein under any casing land on ONE key. This is why the manual
  // path can be trusted to feed the same correlation the AI path does.
  it('keys owner-picked and AI-cased values identically', () => {
    expect(canonicalizeProtein('Chicken')).toBe('chicken');
    expect(canonicalizeProtein('chicken')).toBe(canonicalizeProtein('Chicken'));
    // A qualifier-laden AI label still collapses onto the same chip key.
    expect(canonicalizeProtein('Chicken By-Product Meal')).toBe('chicken');
    expect(COMMON_PROTEINS).toContain(canonicalizeProtein('Chicken By-Product Meal'));
  });
});

// B-351 PR 2 — the extraction WRITE-path normalization (absorbs B-048). The
// behaviour tests live with the Edge Function that calls this
// (supabase/functions/extract-food-from-photo/index.test.ts, deno); what is
// guarded HERE is the pair of invariants the rest of the app leans on: the write
// path never produces a key the READ path would re-key (fragmenting one protein
// across two), and the narrow read-time canonicalizer is NOT quietly widened by
// the write-time rules (D3 sanctions mapping at capture, not a retroactive
// re-merge of already-stored keys).
describe('normalizeExtractedProtein / deriveProteinSet (B-351 extraction write path)', () => {
  const SAMPLES = [
    'Chicken', 'Deboned Chicken', 'Chicken By-Product Meal', 'Chicken Liver',
    'Ocean Whitefish', 'white fish', 'Dried Egg Product', 'Buffalo', 'Deer', 'Green Tripe', 'liver',
    'Hydrolyzed Soy Protein', 'water buffalo', 'poultry', 'fresh deboned turkey',
  ];

  it('every output is canonicalize-STABLE — the read path can never re-key a stored value', () => {
    for (const raw of SAMPLES) {
      const key = normalizeExtractedProtein(raw);
      expect(key).not.toBeNull();
      expect(canonicalizeProtein(key)).toBe(key);
    }
  });

  it('is idempotent — re-running it over a stored key is a no-op', () => {
    for (const raw of SAMPLES) {
      const once = normalizeExtractedProtein(raw);
      expect(normalizeExtractedProtein(once)).toBe(once);
    }
  });

  it('every alias target is itself a terminal key (no alias chains to resolve)', () => {
    // The implementation takes exactly ONE alias hop, so a target that itself
    // aliased would silently stop half-mapped.
    for (const raw of SAMPLES) {
      const key = normalizeExtractedProtein(raw) as string;
      expect(normalizeExtractedProtein(key)).toBe(key);
    }
  });

  it('does NOT widen the read-time canonicalizer (B-052 §29 scope note holds)', () => {
    // The same inputs the write path maps must still pass through
    // canonicalizeProtein untouched — otherwise every already-stored value in the
    // history would be retroactively re-merged on read, which D3 does not sanction.
    expect(canonicalizeProtein('ocean whitefish')).toBe('ocean whitefish');
    expect(canonicalizeProtein('chicken liver')).toBe('chicken liver');
    expect(canonicalizeProtein('buffalo')).toBe('buffalo');
    expect(normalizeExtractedProtein('ocean whitefish')).toBe('whitefish');
  });

  it('keeps a picker-set protein identical under the write path (B-332 parity)', () => {
    // An owner-picked chip and an AI-extracted value must key identically, so no
    // COMMON_PROTEINS value may be rewritten by an alias or a strip.
    for (const p of COMMON_PROTEINS) {
      expect(normalizeExtractedProtein(p)).toBe(p);
    }
  });

  it('derives an ordered, deduped, bounded set with the primary at [0]', () => {
    expect(deriveProteinSet(['chicken', 'duck'], 'duck')).toEqual(['duck', 'chicken']);
    expect(deriveProteinSet(['Chicken', 'chicken meal'], null)).toEqual(['chicken']);
    expect(deriveProteinSet([], null)).toEqual([]);
    // Over-cap only bites a pathological set — a real 14-protein raw-grind panel
    // is captured whole (the deno suite pins that case).
    expect(deriveProteinSet(Array(MAX_CAPTURED_PROTEINS + 16).fill(null).map((_, i) => `p${i}`), null))
      .toHaveLength(MAX_CAPTURED_PROTEINS);
  });
});

// B-351 PR 1 — the SQLite cache-column encoding for food_items.proteins. The
// contract every future reader (disclosure, contaminant flag, Phase B engine)
// depends on: one JSON encoding, ordered, and a decode that degrades to
// "protein-unknown" ([]) rather than throwing or fabricating an exposure.
describe('proteinsToCacheText / proteinsFromCacheText (B-351 cache column)', () => {
  it('round-trips an ordered set unchanged — prominence order is data, not decoration', () => {
    const set = ['duck', 'chicken', 'salmon'];
    expect(proteinsFromCacheText(proteinsToCacheText(set))).toEqual(set);
  });

  it('round-trips the empty set as KNOWN-empty ("[]"), distinct from NULL-unknown', () => {
    // The server default is '{}' — a food with no captured proteins. That must
    // encode as '[]' (a real value), never collapse to NULL (= not hydrated).
    expect(proteinsToCacheText([])).toBe('[]');
    expect(proteinsFromCacheText('[]')).toEqual([]);
  });

  it('serializes a non-array payload to null (unknown), never an invented empty set', () => {
    // A skewed client pulling from a pre-039 server sees no `proteins` field;
    // undefined/garbage must land as NULL so the row reads "not yet hydrated".
    expect(proteinsToCacheText(undefined)).toBeNull();
    expect(proteinsToCacheText(null)).toBeNull();
    expect(proteinsToCacheText('chicken')).toBeNull();
    expect(proteinsToCacheText({ 0: 'chicken' })).toBeNull();
  });

  it('drops non-string elements on serialize', () => {
    expect(proteinsToCacheText(['duck', 42, null, 'chicken'])).toBe('["duck","chicken"]');
  });

  it('decodes NULL (legacy unhydrated row) as [] without throwing', () => {
    expect(proteinsFromCacheText(null)).toEqual([]);
    expect(proteinsFromCacheText(undefined)).toEqual([]);
  });

  it('decodes malformed JSON / wrong shapes as [] — a cache decode failure is protein-unknown, never a crash', () => {
    expect(proteinsFromCacheText('not json')).toEqual([]);
    expect(proteinsFromCacheText('{"a":1}')).toEqual([]);
    expect(proteinsFromCacheText('"chicken"')).toEqual([]);
    expect(proteinsFromCacheText('[1, {"x":2}, "duck"]')).toEqual(['duck']);
  });
});
