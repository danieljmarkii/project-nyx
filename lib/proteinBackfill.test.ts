// Tests for the B-416 re-derivation backfill.
//
// The fixtures below are REAL stored panels from the live library (verbatim,
// truncated only where the tail is vitamins and minerals). That matters: the whole
// risk of a lexicon scan is what it does to text nobody wrote for it, so the
// regression bar is the actual table this pass will run against, not invented
// strings that happen to suit the parser.

import {
  BackfillRow,
  deriveProteinsFromPanel,
  planRow,
} from './proteinBackfill';

const REKEY = { rekeyPrimaryProtein: true };
const NO_REKEY = { rekeyPrimaryProtein: false };

const row = (over: Partial<BackfillRow> = {}): BackfillRow => ({
  id: 'f-1',
  primary_protein: null,
  proteins: [],
  ingredients_notes: null,
  ...over,
});

// ── The panels this feature exists for ───────────────────────────────────────

describe('deriveProteinsFromPanel — live panels', () => {
  it('finds the hidden proteins in the rabbit novel-protein food (the B-416 headline)', () => {
    // Stored as ["rabbit"] today. A rabbit elimination trial run off this row
    // passes the contaminant check clean while the panel names duck AND chicken.
    const panel =
      'Rabbit, duck, chicken broth, chicken liver, chicken heart, natural flavor, ' +
      'brewers dried yeast, potassium chloride, guar gum, choline chloride, taurine';

    expect(deriveProteinsFromPanel(panel)).toEqual(['rabbit', 'duck', 'chicken']);
  });

  it('finds the pork and turkey hidden in a duck entrée, and ignores its chicken FAT', () => {
    // Hill's Sensitive Stomach & Skin Duck & Vegetable Entrée. `chicken fat` is the
    // false positive that would fire a contaminant flag on a novel-protein diet.
    const panel =
      'Water, pork by-products, duck, pork liver, turkey, carrots, whole grain corn, ' +
      'green peas, green beans, potato protein, potato starch, chicken fat, natural flavor, ' +
      'powdered cellulose, calcium sulfate';

    const found = deriveProteinsFromPanel(panel);
    expect(found).toEqual(['pork', 'duck', 'turkey']);
    expect(found).not.toContain('chicken');
  });

  it('finds the tuna in a "lamb" recipe', () => {
    // Weruva Cats in the Kitchen Lamb Burger-ini — sold as lamb, second ingredient tuna.
    const panel =
      'Fish Broth, Tuna, Lamb, Lamb Lung, Locust Bean Gum, Sunflower Seed Oil, ' +
      'Tricalcium Phosphate, Guar Gum, Fish Oil, Taurine';

    expect(deriveProteinsFromPanel(panel)).toEqual(['fish', 'tuna', 'lamb']);
  });

  it('reads by-product meals as their animal', () => {
    const panel =
      'Turkey by-product meal, brewers rice, animal fat preserved with mixed-tocopherols, ' +
      'corn protein meal, animal liver flavor, fish, natural and artificial flavors, ' +
      'chicken by-product meal, phosphoric acid';

    expect(deriveProteinsFromPanel(panel)).toEqual(['turkey', 'fish', 'chicken']);
  });

  it('maps a panel\'s "Ocean Whitefish" through the write-path normalizer (guard 2)', () => {
    const panel = 'Ocean Whitefish, Fish, Meat By-Products, Liver, Fish Broth, Tuna';

    // `whitefish`, not `ocean whitefish` — Class B is in contract on a write path.
    // Bare `liver` and `meat by-products` name no species and are not invented.
    expect(deriveProteinsFromPanel(panel)).toEqual(['whitefish', 'fish', 'tuna']);
  });

  it('reads egg from its label forms', () => {
    const panel = 'Turkey, Turkey Broth, Dried Egg White, Potato Starch, Salt';
    expect(deriveProteinsFromPanel(panel)).toEqual(['turkey', 'egg']);
  });

  it('keeps a vague label term vague rather than inventing a species', () => {
    const panel = 'Water, Chicken, Poultry by-Products, Animal Plasma, Chicken Broth';
    // `poultry` is never folded into `chicken` — the alias table refuses that merge
    // because the bird is genuinely unknown.
    expect(deriveProteinsFromPanel(panel)).toEqual(['chicken', 'poultry']);
  });
});

// ── What the scan must NOT find ──────────────────────────────────────────────

describe('deriveProteinsFromPanel — false positives', () => {
  it.each([
    ['chicken fat', 'Brewers rice, chicken fat, salt'],
    ['beef fat', 'Brewers rice, beef fat preserved with mixed-tocopherols'],
    ['salmon oil', 'Potatoes, Peas, Salmon Oil, Flaxseed'],
    ['menhaden fish oil', 'Peas, Menhaden Fish Oil (preserved with Mixed Tocopherols)'],
    ['chicken flavor', 'Ground corn, chicken flavor, salt'],
    ['liver flavor', 'Brewers rice, animal liver flavor, dried yeast'],
    ['bacon flavor', 'Calcium carbonate, bacon flavor, potassium chloride'],
    ['chicken flavored gravy', 'Phosphoric acid, dried chicken flavored gravy, salt'],
  ])('ignores %s', (_label, panel) => {
    expect(deriveProteinsFromPanel(panel)).toEqual([]);
  });

  it('does not fold a hydrolysed protein into its intact animal', () => {
    // The premise of a hydrolysed prescription diet is that it is NOT the same
    // exposure. Telling a vet the pet ate chicken would be worse than saying nothing.
    expect(deriveProteinsFromPanel('Hydrolyzed Chicken Liver, Rice Starch')).toEqual([]);
    expect(deriveProteinsFromPanel('Hydrolysed Soy Protein, Corn Starch')).toEqual([]);
  });

  it('is not fooled by words that merely contain a protein name', () => {
    const panel = 'Chickpeas, oatmeal, eggplant, backbone meal, wheat gluten, soy flour';
    expect(deriveProteinsFromPanel(panel)).toEqual([]);
  });

  it('returns nothing for an absent, empty, or protein-free panel', () => {
    expect(deriveProteinsFromPanel(null)).toEqual([]);
    expect(deriveProteinsFromPanel(undefined)).toEqual([]);
    expect(deriveProteinsFromPanel('')).toEqual([]);
    expect(deriveProteinsFromPanel('null')).toEqual([]);
    expect(deriveProteinsFromPanel('Water, rice, salt.')).toEqual([]);
  });

  it('does not carry regex state between terms or between calls', () => {
    // `LEXICON_PATTERN` is a module-level /g/ regex; a leaked `lastIndex` would make
    // the scan depend on what it read a moment ago.
    const panel = 'Chicken, Chicken Broth, Duck';
    expect(deriveProteinsFromPanel(panel)).toEqual(['chicken', 'duck']);
    expect(deriveProteinsFromPanel(panel)).toEqual(['chicken', 'duck']);
    expect(deriveProteinsFromPanel('Duck')).toEqual(['duck']);
  });
});

// ── Property 2 — the primary is never re-ranked ──────────────────────────────

describe('planRow — the primary leads, whatever the panel says', () => {
  it('keeps a trial food\'s target protein at proteins[0] when the panel lists it third', () => {
    // `proteins` is left EMPTY on purpose: with the primary already stored at [0]
    // the assertion passes whether or not the hoist exists, and the hoist is the
    // whole point. This shape is what forces the primary to beat panel order.
    const plan = planRow(
      row({
        primary_protein: 'duck',
        proteins: [],
        ingredients_notes: 'Water, pork by-products, duck, pork liver, turkey, carrots',
      }),
      REKEY,
    );

    // Panel order alone would have made this ['pork','duck','turkey'] and the §8
    // contaminant check would compare a duck trial against pork.
    expect(plan.proteins).toEqual(['duck', 'pork', 'turkey']);
    expect(plan.proteins[0]).toBe('duck');
    expect(plan.added).toEqual(['pork', 'turkey']);
  });

  it('never promotes a derived protein into a cleared main slot', () => {
    // A NULL primary means the owner designated no main (slice 3). Hoisting one
    // back would silently undo that clear.
    const plan = planRow(
      row({ primary_protein: null, proteins: [], ingredients_notes: 'Chicken, Duck' }),
      REKEY,
    );

    expect(plan.primaryProtein).toBeNull();
    expect(plan.rekeyedPrimary).toBe(false);
    expect(plan.proteins).toEqual(['chicken', 'duck']);
  });
});

// ── Property 1 — additive only ───────────────────────────────────────────────

describe('planRow — additive only', () => {
  it('preserves stored keys a human would call junk', () => {
    const plan = planRow(
      row({
        primary_protein: 'chicken',
        proteins: ['chicken', 'meat by-products', 'liver', 'fish', 'turkey'],
        ingredients_notes: 'CHICKEN BROTH, CHICKEN, MEAT BY-PRODUCTS, LIVER, FISH, TURKEY',
      }),
      REKEY,
    );

    // `meat by-products` and `liver` are live stored values. A backfill is the worst
    // possible place to litigate whether a recorded exposure deserves to exist.
    expect(plan.proteins).toEqual(['chicken', 'meat by-products', 'liver', 'fish', 'turkey']);
    expect(plan.added).toEqual([]);
    expect(plan.changed).toBe(false);
  });

  it('never blanks a primary that carries no usable key', () => {
    const plan = planRow(
      row({ primary_protein: 'null', proteins: [], ingredients_notes: null }),
      REKEY,
    );

    expect(plan.primaryProtein).toBe('null');
    expect(plan.rekeyedPrimary).toBe(false);
    expect(plan.changed).toBe(false);
  });

  it('repairs a row that walked through the B-412 window (primary set, proteins empty)', () => {
    const plan = planRow(row({ primary_protein: 'rabbit', proteins: [] }), REKEY);
    expect(plan.proteins).toEqual(['rabbit']);
    expect(plan.changed).toBe(true);
  });

  it('caps a pathological panel rather than writing an unbounded array', () => {
    const panel = [
      'chicken', 'turkey', 'duck', 'beef', 'lamb', 'pork', 'salmon', 'tuna',
      'whitefish', 'rabbit', 'venison', 'bison', 'goat', 'kangaroo', 'quail',
      'pheasant', 'ostrich', 'elk', 'boar', 'cod', 'herring', 'mackerel',
      'pollock', 'trout', 'tilapia', 'catfish', 'egg',
    ].join(', ');

    const plan = planRow(row({ primary_protein: 'chicken', ingredients_notes: panel }), REKEY);
    expect(plan.proteins).toHaveLength(24);
    expect(plan.proteins[0]).toBe('chicken');
  });
});

// ── Guard 1 — the two columns can never be applied apart ─────────────────────

describe('planRow — guard 1 (atomic primary + set)', () => {
  const whitefishRow = row({
    primary_protein: 'ocean whitefish',
    proteins: ['ocean whitefish'],
    ingredients_notes: 'Ocean Whitefish, Fish, Meat By-Products, Liver, Fish Broth, Tuna',
  });

  it('re-keys the primary and the set together when the re-key is ratified', () => {
    const plan = planRow(whitefishRow, REKEY);

    expect(plan.primaryProtein).toBe('whitefish');
    expect(plan.proteins[0]).toBe('whitefish');
    expect(plan.rekeyedPrimary).toBe(true);
    // The stored `ocean whitefish` element dedupes INTO the re-keyed primary — the
    // same protein, written once. It does not survive alongside it.
    expect(plan.proteins).toEqual(['whitefish', 'fish', 'tuna']);
    expect(plan.proteins).not.toContain('ocean whitefish');
  });

  it('does NOT append a normalized twin next to a stored primary when the re-key is off', () => {
    // This is the shipped page-1 bug arriving from the secondary side: a set of
    // ['ocean whitefish','whitefish'] makes a whitefish trial food read as
    // contaminated with whitefish.
    const plan = planRow(whitefishRow, NO_REKEY);

    expect(plan.primaryProtein).toBe('ocean whitefish');
    expect(plan.proteins).toEqual(['ocean whitefish', 'fish', 'tuna']);
    expect(plan.proteins).not.toContain('whitefish');
    expect(plan.rekeyedPrimary).toBe(false);
  });

  it('leaves every stored secondary Class-A keyed even under the ratified re-key', () => {
    // The PM ratified a re-key of stored PRIMARIES. Extending it to secondaries
    // would be taking a decision that was never put.
    const plan = planRow(
      row({ primary_protein: 'chicken', proteins: ['chicken', 'ocean whitefish'] }),
      REKEY,
    );

    expect(plan.proteins).toEqual(['chicken', 'ocean whitefish']);
    expect(plan.changed).toBe(false);
  });

  it('holds the read-path invariant the vet report depends on', () => {
    // `readProteinSet` hoists canonicalize(primary) onto the set. If the two
    // disagree the report renders a protein alongside itself.
    for (const options of [REKEY, NO_REKEY]) {
      const plan = planRow(whitefishRow, options);
      expect(plan.proteins[0]).toBe(
        (plan.primaryProtein as string).trim().toLowerCase(),
      );
    }
  });
});

// ── Property 3 — idempotent and re-runnable ──────────────────────────────────

describe('planRow — idempotence', () => {
  // Every distinct (primary, proteins, panel) shape the live table holds, plus the
  // adversarial ones. A fixed example list is what let B-414 ship a broken
  // convergence claim, so this runs as a cross-product rather than a list.
  const PRIMARIES = [null, 'null', 'chicken', 'Chicken', 'Chicken By-Product Meal',
    'ocean whitefish', 'turkey by-product meal', 'rabbit', 'buffalo', 'Deer'];
  const PANELS = [
    null,
    '',
    'null',
    'Rabbit, duck, chicken broth, chicken liver, chicken heart, natural flavor',
    'Ocean Whitefish, Fish, Meat By-Products, Liver, Fish Broth, Tuna',
    'Water, pork by-products, duck, pork liver, turkey, chicken fat, natural flavor',
    'Deboned Chicken, Chicken Meal, Herring Meal, Chicken Fat, Salmon Oil',
    'BEEF, BEEF BROTH, MEAT BY-PRODUCT\'S, LIVER, FISH, ARTIFICIAL AND NATURAL FLAVORS',
  ];

  it.each([REKEY, NO_REKEY])('plan(plan(row)) === plan(row) — rekey=%p', (options) => {
    for (const primary_protein of PRIMARIES) {
      for (const ingredients_notes of PANELS) {
        const first = planRow(row({ primary_protein, ingredients_notes }), options);
        const second = planRow(
          row({
            primary_protein: first.primaryProtein,
            proteins: first.proteins,
            ingredients_notes,
          }),
          options,
        );

        const where = `primary=${JSON.stringify(primary_protein)} panel=${JSON.stringify(
          ingredients_notes,
        )}`;
        expect(`${where} → ${JSON.stringify(second.proteins)}`).toBe(
          `${where} → ${JSON.stringify(first.proteins)}`,
        );
        expect(second.primaryProtein).toBe(first.primaryProtein);
        // A second run must be a no-op, or the pass cannot be safely retried.
        expect(`${where} changed`).toBe(second.changed ? `${where}` : `${where} changed`);
      }
    }
  });

  it('never removes a stored key, for any row shape', () => {
    for (const options of [REKEY, NO_REKEY]) {
      for (const primary_protein of PRIMARIES) {
        for (const ingredients_notes of PANELS) {
          const stored = ['chicken', 'meat by-products', 'liver'];
          const plan = planRow(
            row({ primary_protein, proteins: stored, ingredients_notes }),
            options,
          );
          for (const key of stored) {
            expect(`${key} kept`).toBe(plan.proteins.includes(key) ? `${key} kept` : `${key} DROPPED`);
          }
        }
      }
    }
  });

  it('never invents a key absent from both the stored set and the panel', () => {
    for (const options of [REKEY, NO_REKEY]) {
      for (const primary_protein of PRIMARIES) {
        for (const ingredients_notes of PANELS) {
          const plan = planRow(row({ primary_protein, ingredients_notes }), options);
          const source = `${primary_protein ?? ''} ${ingredients_notes ?? ''}`.toLowerCase();
          for (const key of plan.added) {
            // Every added key traces back to text that was actually stored — either
            // verbatim, or as the head of a label term the normalizer mapped.
            const head = key.split(' ')[0];
            expect(`${key} ∈ source`).toBe(
              source.includes(head) || source.includes('whitefish') || source.includes('buffalo')
                ? `${key} ∈ source`
                : `${key} INVENTED`,
            );
          }
        }
      }
    }
  });
});
