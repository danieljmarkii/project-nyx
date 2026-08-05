// B-704 PR 2 — the TG spine for the stored-first trial-protein predicate.
//
// `trialTargetProtein` (lib/trialProtein.ts) is THE one predicate every consumer
// reads to NAME a trial's protein: stored-first (the owner's confirmed word),
// derivation fallback (the trial foods' own designated primary), and — because the
// vet report renders the two differently — the PROVENANCE of the answer alongside
// it. The naming it produces feeds `offTrialProteins` (which proteins here are not
// the trial's) and, in PR 5, the report's identity line.
//
// The spec routes the whole track's safety to four invariants (§3), and this file
// is where they become tests before a third, contradictory definition can exist:
//
//   TG-1 · Never permits.  The value only NAMES; it never permits a feeding or
//          removes an off-diet verdict. `classifyFeeding` (the off-diet decision)
//          is a pure function of the ALLOWED SET and the feeding — it takes no
//          target-protein input at all — so its verdict is invariant under every
//          value of `target_protein`, including one chosen to look like a permit.
//   TG-2 · Silence is never an all-clear. A null resolution yields no naming
//          anywhere (never "no off-target proteins"), and no null/junk input ever
//          produces a non-null protein.
//   TG-4 · Class-A canonical key. Stored and derived values alike are
//          `canonicalizeProtein` output — a raw label never survives as the target.
//   TG-5 · A protein edit never moves a number. Every count / denominator drawn
//          from the corpus is byte-identical before and after a target edit; only
//          the naming moves.

import {
  trialTargetProtein,
  offTrialProteins,
  capitalizeProtein,
  type TrialProteinSource,
} from './trialProtein';
import {
  buildTrialContext,
  classifyFeeding,
  type AllowedFood,
  type TrialFeeding,
  type TrialSpec,
} from './dietTrial';
import { canonicalizeProtein } from './protein';

// ── Fixtures ─────────────────────────────────────────────────────────────────
//
// Rex, a dog, on a duck elimination trial. One primary-diet duck food and one
// vet-approved rabbit treat (which also lists chicken — the D-A worked example).
// The world is concrete so a verdict can be reasoned about, not just asserted.

const TRIAL: TrialSpec = {
  id: 'trial-1',
  startedAt: '2026-07-01',
  targetDurationDays: 56,
  species: 'dog',
};

/** Local noon on a given local day — never midnight, so day-bucketing never
 *  depends on the CI runner's zone straddling a boundary (B-514). */
function at(day: string, hour = 12): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, hour, 0, 0).toISOString();
}

function food(over: Partial<AllowedFood> & Pick<AllowedFood, 'foodItemId'>): AllowedFood {
  return {
    foodKey: null,
    label: 'Food',
    role: 'primary_diet',
    allowedFrom: '2026-07-01',
    allowedUntil: null,
    primaryProtein: null,
    proteins: [],
    ...over,
  };
}

const DUCK_PRIMARY = food({
  foodItemId: 'duck-primary',
  foodKey: 'royal caninduck',
  label: 'Royal Canin Duck',
  primaryProtein: 'duck',
  proteins: ['duck'],
});

const RABBIT_TREAT = food({
  foodItemId: 'rabbit-treat',
  foodKey: 'barkworthiesrabbit',
  label: 'Barkworthies Rabbit Jerky',
  role: 'permitted_treat',
  primaryProtein: 'rabbit',
  proteins: ['rabbit', 'chicken'],
});

const ALLOWED = [DUCK_PRIMARY, RABBIT_TREAT];

// The derivation source `trialTargetProtein` reads when nothing is stored: the
// primary-diet foods' owner-designated primary proteins.
const PRIMARY_FOODS: { primaryProtein: string | null }[] = [{ primaryProtein: 'duck' }];

function feeding(over: Partial<TrialFeeding> & Pick<TrialFeeding, 'eventId'>): TrialFeeding {
  return {
    occurredAt: at('2026-07-10'),
    foodItemId: null,
    foodKey: null,
    label: null,
    foodType: 'meal',
    proteins: [],
    ...over,
  };
}

// A corpus that lands on every rung of `classifyFeeding` — the surfaces whose
// verdicts TG-1 says the target protein may never move.
const CORPUS: readonly TrialFeeding[] = [
  // Rung 1 — the duck primary diet is permitted.
  feeding({ eventId: 'permitted', foodItemId: 'duck-primary', foodKey: 'royal caninduck', proteins: ['duck'] }),
  // Rung 2 — an off-diet chicken kibble carries a protein outside the sanctioned set.
  feeding({ eventId: 'off-protein', foodItemId: 'chicken-kibble', foodKey: 'bchicken', proteins: ['chicken'] }),
  // Rung 3 — THE CRUX. A food whose only protein IS the trial's protein (duck),
  // fed OFF the allowed set. Being the trial protein must never permit it: the
  // sanctioned set already contains 'duck', so no antigen is raised, and it falls
  // to rung 3 as off-diet regardless. This is the exact shape a naive "the food's
  // protein matches the target, so it's fine" implementation would mis-permit.
  feeding({ eventId: 'matching-protein', foodItemId: 'sneaky-duck', foodKey: 'bsneaky', proteins: ['duck'] }),
  // no_identity — a feeding naming no food carries no verdict either way.
  feeding({ eventId: 'no-identity', proteins: ['chicken'] }),
  // out_of_window — a feeding before the trial started.
  feeding({ eventId: 'before', foodItemId: 'duck-primary', foodKey: 'royal caninduck', proteins: ['duck'], occurredAt: at('2026-06-15') }),
];

// Every value the stored column could ever hold, plus junk and a "no single
// protein" null. If any one of these moved a verdict, target_protein would be a
// permit — which is the whole thing the track forbids.
const TARGET_VALUES: readonly (string | null)[] = [
  null, // unset / hydrolyzed-option / cleared — all store null
  'duck', // the real target, owner-confirmed
  'chicken', // a DIFFERENT protein — the mismatch case
  'rabbit',
  'Poultry', // mixed case → canonicalizes to 'poultry', accepted as owner
  'hydrolyzed', // a PROCESS WORD — names no source, so it drops to derivation, not owner
  'NOT A REAL KEY!!! $$$', // keys to the fixpoint 'not a real key' (canonicalizeProtein is a
                           // keyer, not a dictionary) → survives as owner; the write path is
                           // the validator of record (PR 3), not this read gate
];

/** The classification, reduced to the fields a number or a verdict is drawn from.
 *  Excludes `permittedBy` (an object reference) so the JSON compare is stable. */
function verdictShape(c: ReturnType<typeof classifyFeeding>) {
  return {
    verdict: c.verdict,
    rung: c.rung,
    offDiet: c.offDiet,
    countsAsFeeding: c.countsAsFeeding,
    antigens: c.antigens,
    role: c.role,
    attributionChecked: c.attributionChecked,
  };
}

// ── The predicate: stored-first + provenance ─────────────────────────────────

describe('trialTargetProtein — stored-first resolution with provenance', () => {
  it('returns the owner-stored protein with source "owner"', () => {
    expect(trialTargetProtein({ target_protein: 'duck' }, PRIMARY_FOODS)).toEqual({
      protein: 'duck',
      source: 'owner',
    });
  });

  it('the stored value WINS over a conflicting derivation (the whole point of storing it)', () => {
    // The vet named rabbit; the picked food's label says chicken. Storing the
    // owner's word is what makes "a wrong-primary trial food" nameable at all —
    // derivation alone can only ever report what the food says (§1).
    expect(trialTargetProtein({ target_protein: 'rabbit' }, [{ primaryProtein: 'chicken' }])).toEqual({
      protein: 'rabbit',
      source: 'owner',
    });
  });

  it('falls back to the derived primary with source "derived" when nothing is stored', () => {
    expect(trialTargetProtein({ target_protein: null }, PRIMARY_FOODS)).toEqual({
      protein: 'duck',
      source: 'derived',
    });
  });

  it('derives the FIRST designated primary, in prominence order, skipping undesignated foods', () => {
    // A null-primary food (owner cleared its main protein) is skipped, not treated
    // as a null target — the next food's designation is the derived answer.
    expect(
      trialTargetProtein({ target_protein: null }, [
        { primaryProtein: null },
        { primaryProtein: 'chicken' },
        { primaryProtein: 'duck' },
      ]),
    ).toEqual({ protein: 'chicken', source: 'derived' });
  });

  it('a single-food derivation is exactly canonicalizeProtein(primaryProtein) — the old resolveTargetProtein, unchanged', () => {
    // The migrated coverage of the now-internal fallback arm: owner-designated
    // primary → key; cleared / junk / missing → null. Routing an existing
    // single-food caller through the predicate changes nothing.
    expect(trialTargetProtein({ target_protein: null }, [{ primaryProtein: 'Duck' }]).protein).toBe('duck');
    expect(trialTargetProtein({ target_protein: null }, [{ primaryProtein: 'Duck By-Product Meal' }]).protein).toBe('duck');
    expect(trialTargetProtein({ target_protein: null }, [{ primaryProtein: null }]).protein).toBeNull();
    expect(trialTargetProtein({ target_protein: null }, [{ primaryProtein: 'null' }]).protein).toBeNull();
    expect(trialTargetProtein({ target_protein: null }, [{ primaryProtein: '  ' }]).protein).toBeNull();
  });
});

// ── TG-4 · Class-A canonical key ─────────────────────────────────────────────

describe('TG-4 — the resolved protein is always a Class-A canonical key', () => {
  it('canonicalizes a stored owner value on read (a raw label never survives as the target)', () => {
    // The write path canonicalizes (§5), but reading through canonicalizeProtein
    // is a convergent no-op there and a genuine guard if a raw value ever lands.
    expect(trialTargetProtein({ target_protein: 'Chicken By-Product Meal' }, [])).toEqual({
      protein: 'chicken',
      source: 'owner',
    });
    expect(trialTargetProtein({ target_protein: '  Turkey  ' }, [])).toEqual({
      protein: 'turkey',
      source: 'owner',
    });
  });

  it('a stored value that names no protein SOURCE falls through to derivation (the proteinSourceBase gate)', () => {
    // The stored arm uses the SAME usable-source gate the antigen path
    // (isUncharacterizedTrialDiet, lib/dietTrial.ts) uses, so the two never disagree
    // about whether a value is a protein. A value that canonicalizes to null ('meal',
    // whitespace) AND a bare process word ('hydrolyzed', 'protein', 'hydrolysate') all
    // name no source, so all drop to derivation — never asserted as the owner's word.
    for (const notASource of ['meal', '   ', 'hydrolyzed', 'protein', 'hydrolysate']) {
      expect(trialTargetProtein({ target_protein: notASource }, [{ primaryProtein: 'duck' }])).toEqual({
        protein: 'duck',
        source: 'derived',
      });
    }
  });

  it('the "hydrolyzed" case agrees with isUncharacterizedTrialDiet — never named owner-confirmed', () => {
    // The clinically-pointed case (found by adversarial review). canonicalizeProtein
    // ('hydrolyzed') === 'hydrolyzed' is a non-null fixpoint, so a naive `stored != null`
    // check would render "Elimination diet trial — hydrolyzed (owner-confirmed)" on a
    // vet report while the antigen arm treats that diet as uncharacterized. The source
    // gate closes that disagreement: a stored 'hydrolyzed' is not the owner's protein.
    expect(trialTargetProtein({ target_protein: 'hydrolyzed' }, []).source).not.toBe('owner');
    expect(trialTargetProtein({ target_protein: 'hydrolyzed' }, []).protein).toBeNull();
  });

  it('KNOWN RESIDUAL — arbitrary non-protein text survives as owner; the write path is the validator, not this gate', () => {
    // Honest boundary. canonicalizeProtein is a keyer, not a protein dictionary:
    // 'not a real key' carries no process qualifier to strip, so proteinSourceBase
    // returns it unchanged and it is accepted as the owner's word. Closing THIS is the
    // picker's typed-"Other" sanitisation (PR 3, B-412/D9 pattern) — the read gate here
    // deliberately handles only the process-word class. If this ever returns null, the
    // write-path guard has arrived: update the expectation then.
    expect(trialTargetProtein({ target_protein: 'NOT A REAL KEY!!! $$$' }, [{ primaryProtein: 'duck' }])).toEqual({
      protein: 'not a real key',
      source: 'owner',
    });
  });

  it('every resolved protein satisfies canonicalizeProtein(p) === p (convergent output)', () => {
    // The invariant, checked over stored and derived arms and dirty inputs: the
    // output is a fixpoint of canonicalizeProtein, so no downstream re-keying can
    // ever split it (the B-414 lesson, applied to the target).
    const inputs: { target_protein: string | null; foods: { primaryProtein: string | null }[] }[] = [
      { target_protein: 'Duck', foods: [] },
      { target_protein: 'Chicken By-Product Meal', foods: [] },
      { target_protein: null, foods: [{ primaryProtein: 'Turkey By Product Meal' }] },
      { target_protein: null, foods: [{ primaryProtein: 'ocean whitefish' }] },
      { target_protein: 'RABBIT', foods: [{ primaryProtein: 'chicken' }] },
    ];
    for (const { target_protein, foods } of inputs) {
      const { protein } = trialTargetProtein({ target_protein }, foods);
      expect(protein).not.toBeNull();
      expect(canonicalizeProtein(protein)).toBe(protein);
    }
  });
});

// ── TG-2 · Silence is never an all-clear ─────────────────────────────────────

describe('TG-2 — a null resolution is silence, never an all-clear', () => {
  it('resolves to { protein: null, source: null } when nothing is stored and nothing derives', () => {
    expect(trialTargetProtein({ target_protein: null }, [])).toEqual({ protein: null, source: null });
    expect(trialTargetProtein({ target_protein: null }, [{ primaryProtein: null }])).toEqual({
      protein: null,
      source: null,
    });
  });

  it('the hydrolyzed / cleared case (null column, no designated food primary) yields no naming', () => {
    // "No single protein (hydrolyzed)" stores null and is deliberately
    // indistinguishable from unset (§5). Silence comes from the foods carrying no
    // designated primary — the predicate has no special branch and needs none.
    expect(trialTargetProtein({ target_protein: null }, [{ primaryProtein: null }, { primaryProtein: '  ' }])).toEqual({
      protein: null,
      source: null,
    });
  });

  it('no null / junk input ever manufactures a non-null protein', () => {
    const nullish: (string | null)[] = [null, '', '   ', 'null', 'unknown', 'meal'];
    for (const stored of nullish) {
      for (const primary of nullish) {
        expect(trialTargetProtein({ target_protein: stored }, [{ primaryProtein: primary }]).protein).toBeNull();
      }
    }
  });

  it('a null target names nothing off-target — silence, not "all clear"', () => {
    // The downstream contract: offTrialProteins over a null target is [], and that
    // empty list means "nothing was compared", never "nothing is off-target". The
    // consumer copy layer (PR 3+) must never render it as a clean verdict.
    expect(offTrialProteins(['chicken', 'duck'], trialTargetProtein({ target_protein: null }, []).protein)).toEqual([]);
  });
});

// ── TG-1 · Never permits ─────────────────────────────────────────────────────

describe('TG-1 — the target protein NAMES, it never permits', () => {
  const CTX = buildTrialContext(TRIAL, ALLOWED);

  it('a food whose protein EQUALS the trial protein, fed off the allowed set, is still off-diet', () => {
    // The crux, stated directly. `sneaky-duck` carries only 'duck' — the trial's
    // own protein — but is not in the allowed set. It classifies off-diet (rung 3),
    // and `offTrialProteins` correctly reports NOTHING off-target for it (its
    // protein IS the target). An empty off-target list is not a permit: the verdict
    // comes from the allowed set, the naming from the protein, and they are
    // different questions.
    const sneaky = CORPUS.find((f) => f.eventId === 'matching-protein')!;
    const c = classifyFeeding(CTX, sneaky);
    expect(c.offDiet).toBe(true);
    expect(c.verdict).toBe('off_diet_unrecognised');
    // The naming layer, over the same food, against the target it matches:
    expect(offTrialProteins(sneaky.proteins, trialTargetProtein({ target_protein: 'duck' }, PRIMARY_FOODS).protein)).toEqual([]);
  });

  it('every feeding\'s verdict is byte-identical under EVERY value of target_protein (incl. null and junk)', () => {
    // The property. `classifyFeeding` takes no target-protein input, so no value of
    // the column can reach it — this proves it behaviourally over the whole corpus.
    // The trial object passed to buildTrialContext deliberately CARRIES the varying
    // target_protein (as a superset of TrialSpec), so if a future change ever
    // threaded it into the off-diet decision, the verdict set would grow and this
    // fails — the regression tripwire the invariant needs.
    const verdictSets = new Set<string>();
    const namings = new Set<string | null>();

    for (const tp of TARGET_VALUES) {
      const ctx = buildTrialContext({ ...TRIAL, target_protein: tp } as TrialSpec, ALLOWED);
      const verdicts = CORPUS.map((f) => verdictShape(classifyFeeding(ctx, f)));
      verdictSets.add(JSON.stringify(verdicts));
      namings.add(trialTargetProtein({ target_protein: tp }, PRIMARY_FOODS).protein);
    }

    // TG-1: one and only one verdict shape across the corpus, whatever the target.
    expect(verdictSets.size).toBe(1);
    // …and the test is NOT vacuous: the target genuinely varies the NAMING, so the
    // invariant above is "naming moved, verdict did not", not "nothing happened".
    expect(namings.size).toBeGreaterThan(1);
  });

  it('setting target_protein to a food\'s protein does not permit that food', () => {
    // Same corpus, but the target is set to the off-diet chicken kibble's own
    // protein. If naming leaked into permitting, `off-protein` would flip on-diet.
    const withChickenTarget = buildTrialContext({ ...TRIAL, target_protein: 'chicken' } as TrialSpec, ALLOWED);
    const withNoTarget = buildTrialContext(TRIAL, ALLOWED);
    for (const f of CORPUS) {
      expect(verdictShape(classifyFeeding(withChickenTarget, f))).toEqual(
        verdictShape(classifyFeeding(withNoTarget, f)),
      );
    }
  });
});

// ── TG-5 · A protein edit never moves a number ───────────────────────────────

describe('TG-5 — editing the target protein never moves a count, denominator, or verdict', () => {
  // The tally every trial surface is built on: the exposure NUMERATOR (offDiet),
  // the DENOMINATOR (countsAsFeeding), and the per-rung breakdown. All are drawn
  // from classifyFeeding, which never sees the target.
  function tally(targetProtein: string | null) {
    const ctx = buildTrialContext({ ...TRIAL, target_protein: targetProtein } as TrialSpec, ALLOWED);
    const rows = CORPUS.map((f) => classifyFeeding(ctx, f));
    return {
      offDiet: rows.filter((r) => r.offDiet).length,
      denominator: rows.filter((r) => r.countsAsFeeding).length,
      permitted: rows.filter((r) => r.verdict === 'permitted').length,
      byRung: rows.reduce<Record<string, number>>((acc, r) => {
        acc[r.rung] = (acc[r.rung] ?? 0) + 1;
        return acc;
      }, {}),
    };
  }

  it('the numerator, denominator and rung breakdown are byte-identical before and after an edit', () => {
    // Edit from derived-duck to owner-chicken — the largest possible change to the
    // naming — and every number is unchanged.
    const before = tally(null); // resolves to derived 'duck'
    const after = tally('chicken'); // owner overrides to a DIFFERENT protein
    expect(after).toEqual(before);
  });

  it('the edit that leaves the numbers alone genuinely MOVES the naming (not a no-op test)', () => {
    // Proof the previous test isn't vacuous: the same edit changes what each food
    // reports as off-target. Numbers frozen, names moved — exactly TG-5's claim.
    const namedBefore = offTrialProteins(RABBIT_TREAT.proteins, trialTargetProtein({ target_protein: null }, PRIMARY_FOODS).protein);
    const namedAfter = offTrialProteins(RABBIT_TREAT.proteins, trialTargetProtein({ target_protein: 'chicken' }, PRIMARY_FOODS).protein);
    // duck target → rabbit+chicken are both off-target; chicken target → only rabbit.
    expect(namedBefore).toEqual(['rabbit', 'chicken']);
    expect(namedAfter).toEqual(['rabbit']);
    expect(namedAfter).not.toEqual(namedBefore);
  });
});

// A type-level anchor: the provenance union is exactly {owner, derived}, so a new
// source can't be added without updating the consumers that branch on it (the
// report renders 'owner' and 'derived' differently — §4).
describe('TrialProteinSource', () => {
  it('is one of owner | derived on a non-null resolution', () => {
    const sources: (TrialProteinSource | null)[] = [
      trialTargetProtein({ target_protein: 'duck' }, []).source,
      trialTargetProtein({ target_protein: null }, PRIMARY_FOODS).source,
      trialTargetProtein({ target_protein: null }, []).source,
    ];
    expect(sources).toEqual(['owner', 'derived', null]);
  });
});

// ── capitalizeProtein (B-704 §8 "capitalized protein") ───────────────────────

describe('capitalizeProtein', () => {
  it('Title-cases the first letter of a stored-lowercase key', () => {
    expect(capitalizeProtein('rabbit')).toBe('Rabbit');
    expect(capitalizeProtein('whitefish')).toBe('Whitefish');
  });

  it('is a no-op on the empty string', () => {
    expect(capitalizeProtein('')).toBe('');
  });
});
