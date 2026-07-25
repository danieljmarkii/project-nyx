import {
  canonicalizeProtein,
  COMMON_PROTEINS,
  proteinsToCacheText,
  proteinsFromCacheText,
  normalizeExtractedProtein,
  deriveProteinSet,
  MAX_CAPTURED_PROTEINS,
  seedPickerProteins,
  pickerProteinsToSet,
  proteinSetCompleteness,
  proteinReadConfidence,
  MIN_PROTEIN_READ_CONFIDENCE,
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

// ── B-414: Class-A convergence, as a PROPERTY not an example list ─────────────
// The bug this suite exists to close was live under a docstring that already
// claimed idempotence, next to a test that checked four hand-picked strings —
// none of which happened to expose punctuation when its qualifier was stripped.
// A fixed list can only ever assert the cases someone already thought of, so the
// invariant is checked here over the full cross-product of the artifact forms
// Class A covers (module header: casing / padding / boundary punctuation /
// stacked + hyphen-joined form-qualifiers). Any future edit that leaves a value
// able to re-key on a second pass fails this suite rather than shipping.
describe('canonicalizeProtein — Class-A convergence (B-414)', () => {
  // Built combinatorially rather than randomly: a property test that can't be
  // reproduced from its own source is a worse guard than no guard.
  const HEADS = ['chicken', 'turkey', 'ocean whitefish', 'beef', 'liver', 'oatmeal'];
  const QUALIFIERS = [
    '', ' meal', '-meal', ' by-product', ' by product', ' byproduct',
    ' by-product meal', ' by product meal', ' meal by-product',
  ];
  const PREFIXES = ['', '(', '"', ' ', '  ', '-', ' "'];
  const SUFFIXES = ['', ')', '"', ',', '.', ' -', ' - ', '!', ' ', '  ', ', '];
  const CASINGS: ((s: string) => string)[] = [
    (s) => s,
    (s) => s.toUpperCase(),
    (s) => s.replace(/\b\w/g, (c) => c.toUpperCase()),
  ];

  function* corpus(): Generator<string> {
    for (const head of HEADS)
      for (const qual of QUALIFIERS)
        for (const pre of PREFIXES)
          for (const suf of SUFFIXES)
            for (const casing of CASINGS)
              yield pre + casing(head + qual) + suf;
  }

  it('converges on every generated variant — canonicalize(canonicalize(x)) === canonicalize(x)', () => {
    let checked = 0;
    for (const raw of corpus()) {
      const once = canonicalizeProtein(raw);
      // The second pass is the whole test: it is what a second READ path does.
      expect(canonicalizeProtein(once)).toBe(once);
      checked++;
    }
    // Guards the generator itself — a refactor that empties it must not read as a pass.
    expect(checked).toBeGreaterThan(4000);
  });

  it('never returns a key carrying boundary punctuation', () => {
    for (const raw of corpus()) {
      const key = canonicalizeProtein(raw);
      if (key === null) continue;
      expect(key).toBe(key.trim());
      expect(/^[\p{L}\p{N}]/u.test(key)).toBe(true);
      expect(/[\p{L}\p{N}]$/u.test(key)).toBe(true);
    }
  });

  it('pools every chicken variant onto exactly one key', () => {
    const keys = new Set<string | null>();
    for (const raw of corpus()) {
      if (!/chicken/i.test(raw)) continue;
      keys.add(canonicalizeProtein(raw));
    }
    // One key, and it is the bare animal — no `chicken -`, no `chicken meal`.
    expect([...keys]).toEqual(['chicken']);
  });

  it('regression: the exact B-414 shapes', () => {
    // Each of these returned a non-key before the joint fixpoint landed, which
    // dropped the food out of every correlation and contaminant check.
    expect(canonicalizeProtein('chicken - meal')).toBe('chicken');
    expect(canonicalizeProtein('Chicken - Meal')).toBe('chicken');
    expect(canonicalizeProtein('chicken -')).toBe('chicken');
    expect(canonicalizeProtein('chicken,  meal')).toBe('chicken');
    expect(canonicalizeProtein('chicken-meal')).toBe('chicken');
    expect(canonicalizeProtein('chicken-by-product-meal')).toBe('chicken');
  });

  it('still leaves Class-B judgements alone (the line the ruling draws)', () => {
    // Same-token artifacts converge (above); DIFFERENT tokens claiming the same
    // animal must not be merged on read — that stays at capture.
    expect(canonicalizeProtein('ocean whitefish')).toBe('ocean whitefish');
    expect(canonicalizeProtein('Buffalo')).toBe('buffalo');
    expect(canonicalizeProtein('chicken liver')).toBe('chicken liver');
    // …and the word merely ENDING in a qualifier is still untouched.
    expect(canonicalizeProtein('oatmeal')).toBe('oatmeal');
  });

  it('over-length input degrades to protein-unknown, never a truncated key', () => {
    expect(canonicalizeProtein('chicken ' + 'x'.repeat(200))).toBeNull();
    // The live library's longest real value is 22 chars — nothing real trips it.
    expect(canonicalizeProtein('hydrolyzed chicken by-product meal')).toBe('hydrolyzed chicken');
  });
});

// ── The D8 two-line picker mapping (B-351 PR 3) ────────────────────────────────
// seedPickerProteins carries the spec §11 SEED RULE and the round-trip half of
// §6's auto-demote rule; pickerProteinsToSet is the write half. Between them
// they are the only thing standing between the picker and food_items.proteins,
// so the invariants live here rather than in a component test.
describe('seedPickerProteins / pickerProteinsToSet (B-351 D8 picker)', () => {
  it('splits an extracted set into main + secondaries', () => {
    expect(seedPickerProteins('duck', ['duck', 'chicken'])).toEqual({
      main: 'duck',
      alsoContains: ['chicken'],
    });
  });

  it('keeps the raw stored primary — the picker never rewrites what it shows', () => {
    // A legacy row's verbatim value must survive a seed untouched; the chip is
    // matched by canonicalizing it, exactly as the shipped B-332 picker does.
    const seeded = seedPickerProteins('Chicken By-Product Meal', ['chicken']);
    expect(seeded.main).toBe('Chicken By-Product Meal');
    expect(seeded.alsoContains).toEqual([]);
  });

  it('SEED RULE: the owner primary wins a disagreement, and the set is rewritten', () => {
    // The migration-039 window: primary_protein written alone, `proteins` left
    // at the backfilled value. The primary is what the owner chose, so it must
    // not be demoted by a stale array element.
    expect(seedPickerProteins('duck', ['chicken'])).toEqual({
      main: 'duck',
      alsoContains: ['chicken'],
    });
    // …and the demoted-vs-dropped distinction: `chicken` is kept, not discarded.
    expect(seedPickerProteins('duck', ['chicken', 'duck', 'salmon']).alsoContains)
      .toEqual(['chicken', 'salmon']);
  });

  it('never fires spuriously on a legacy row (equal UNDER canonicalization)', () => {
    // The property the seed rule leans on: a dirty primary and its canonical
    // proteins[0] agree once canonicalized, so no rewrite happens.
    const seeded = seedPickerProteins('Chicken Meal', ['chicken', 'salmon']);
    expect(seeded.main).toBe('Chicken Meal');
    expect(seeded.alsoContains).toEqual(['salmon']);
  });

  it('a null primary means NO main — the whole set reads as secondaries', () => {
    // The round-trip of "clearing the main demotes it": re-opening the food must
    // not silently promote a secondary back into the main slot.
    expect(seedPickerProteins(null, ['chicken', 'salmon'])).toEqual({
      main: null,
      alsoContains: ['chicken', 'salmon'],
    });
  });

  it('treats a junk placeholder primary as unset, not as a custom protein', () => {
    expect(seedPickerProteins('null', []).main).toBeNull();
  });

  it('tolerates a missing/!array proteins column (skewed or pre-039 client)', () => {
    expect(seedPickerProteins('duck', undefined)).toEqual({ main: 'duck', alsoContains: [] });
    expect(seedPickerProteins('duck', 'chicken')).toEqual({ main: 'duck', alsoContains: [] });
    expect(seedPickerProteins('duck', ['chicken', 42, null]).alsoContains).toEqual(['chicken']);
  });

  it('hoists the main to proteins[0] so primary_protein cannot drift', () => {
    expect(pickerProteinsToSet('duck', ['chicken'])).toEqual(['duck', 'chicken']);
    expect(pickerProteinsToSet(null, ['chicken'])).toEqual(['chicken']);
    expect(pickerProteinsToSet(null, [])).toEqual([]);
  });

  it('canonicalizes and dedupes on write', () => {
    expect(pickerProteinsToSet('Chicken By-Product Meal', ['chicken', 'salmon']))
      .toEqual(['chicken', 'salmon']);
    expect(pickerProteinsToSet('null', ['duck'])).toEqual(['duck']);
  });

  it('applies Class-A merges ONLY — a seeded Class-B value is never re-keyed', () => {
    // D3a: `ocean whitefish` (3 live rows) and `buffalo` are SEMANTIC merges.
    // Re-keying them because the owner edited some other field on the food would
    // be a retroactive Class-B merge. The typed escape normalizes at the point of
    // typing instead (D9); re-deriving stored primaries is spec §11's separate,
    // PM-gated backfill question.
    expect(pickerProteinsToSet('ocean whitefish', [])).toEqual(['ocean whitefish']);
    expect(pickerProteinsToSet('buffalo', ['chicken liver']))
      .toEqual(['buffalo', 'chicken liver']);
  });

  it('round-trips: seed → flatten → seed is stable', () => {
    const first = seedPickerProteins('duck', ['duck', 'chicken', 'salmon']);
    const set = pickerProteinsToSet(first.main, first.alsoContains);
    expect(set).toEqual(['duck', 'chicken', 'salmon']);
    expect(seedPickerProteins(set[0], set)).toEqual({
      main: 'duck',
      alsoContains: ['chicken', 'salmon'],
    });
  });

  it('bounds a pathological set at MAX_CAPTURED_PROTEINS', () => {
    const many = Array.from({ length: 40 }, (_, i) => `protein${i}`);
    expect(pickerProteinsToSet('duck', many)).toHaveLength(MAX_CAPTURED_PROTEINS);
  });
});

// ── D10 — the protein-set completeness gate (B-351 slice 4 / B-413) ───────────
//
// The property under test is asymmetric on purpose: the gate may only ever say
// "complete" when BOTH arms attest a read panel, and every other input — missing,
// short, malformed, legacy, low-confidence — must land on "not complete". An
// over-claim here is reassurance-on-absence on the vet report; an under-claim
// costs a qualifier nobody needed.
describe('proteinSetCompleteness (D10)', () => {
  const PANEL =
    'Chicken, chicken by-product meal, brewers rice, corn gluten meal, salmon oil.';

  it('is complete only when panel text AND protein confidence both clear the floor', () => {
    expect(proteinSetCompleteness(PANEL, { proteins: 0.9 })).toEqual({
      complete: true,
      provenance: 'panel_read',
    });
  });

  it('rejects the front-of-pack-only read (no panel text, high confidence)', () => {
    // The provenance B-413 was actually found on: a marketing-name read that
    // yields proteins:['duck'] and looks identical in the column to a real
    // single-protein panel read.
    expect(proteinSetCompleteness(null, { proteins: 1 }).complete).toBe(false);
    expect(proteinSetCompleteness('', { proteins: 1 }).provenance).toBe('no_panel_text');
    expect(proteinSetCompleteness('  ', { proteins: 1 }).provenance).toBe('no_panel_text');
  });

  it('rejects a captured-but-illegible panel (panel text, low confidence)', () => {
    expect(proteinSetCompleteness(PANEL, { proteins: 0.2 })).toEqual({
      complete: false,
      provenance: 'low_confidence',
    });
  });

  it('rejects the manual provenance — no extraction ever ran', () => {
    // An owner may have typed the whole panel AND the whole protein set; nothing
    // in the row attests the second was derived from the first, so the gate
    // under-claims. That is the deliberate safe direction (see the module note).
    expect(proteinSetCompleteness(PANEL, null).complete).toBe(false);
    expect(proteinSetCompleteness(PANEL, undefined).complete).toBe(false);
  });

  it('rejects a legacy row whose confidence JSON predates the proteins field', () => {
    expect(
      proteinSetCompleteness(PANEL, { brand: 0.9, product_name: 0.9, primary_protein: 0.8 })
        .complete,
    ).toBe(false);
  });

  it('never treats garbage as a completeness warrant', () => {
    for (const junk of ['x', 'see bag', 'Ingredients:', '  Ingredients — '] as const) {
      // "Ingredients:" is itself exactly MIN_PANEL_TEXT_LENGTH characters, so the
      // bare heading would clear the raw length floor; the label strip is what
      // stops an empty panel licensing a completeness claim.
      expect(proteinSetCompleteness(junk, { proteins: 1 }).complete).toBe(false);
    }
    // …but the same heading in front of real content still counts.
    expect(proteinSetCompleteness('Ingredients: Deboned chicken.', { proteins: 1 }).complete)
      .toBe(true);
    for (const junk of [42, 'yes', [], { proteins: 'high' }, { proteins: NaN }] as unknown[]) {
      expect(proteinSetCompleteness(PANEL, junk).complete).toBe(false);
    }
  });

  it('reads the confidence floor as inclusive, and clamps nothing above it', () => {
    expect(proteinSetCompleteness(PANEL, { proteins: MIN_PROTEIN_READ_CONFIDENCE }).complete)
      .toBe(true);
    expect(
      proteinSetCompleteness(PANEL, { proteins: MIN_PROTEIN_READ_CONFIDENCE - 0.01 }).complete,
    ).toBe(false);
  });

  it('proteinReadConfidence degrades every non-number to 0', () => {
    expect(proteinReadConfidence({ proteins: 0.7 })).toBe(0.7);
    expect(proteinReadConfidence({})).toBe(0);
    expect(proteinReadConfidence(null)).toBe(0);
    expect(proteinReadConfidence('0.9')).toBe(0);
    expect(proteinReadConfidence({ proteins: Infinity })).toBe(0);
  });
});
