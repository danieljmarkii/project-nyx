// B-704 PR 3 — the picker's pure support layer.
//
// The state model (§5's null-column ruling made legible), the option lists (mock
// frame C), and the two resolutions that feed the write path and the row display.
// The load-bearing property here is the one §4 exists to protect: the picker's
// default selection and the row's derived prefill both come from the SAME
// canonicalized walk of the primary foods, so they can never disagree.

import {
  INITIAL_TRIAL_PROTEIN_CHOICE,
  trialProteinToStore,
  effectiveTrialProteinKey,
  buildDerivedProteinOptions,
  commonProteinOptions,
  titleProtein,
  mismatchHeadsUp,
  unsetOption,
  derivedGroupHeader,
  isTrialProteinCorrection,
  trialProteinCorrectionLabel,
  midTrialProteinRow,
  midTrialInitialChoice,
  TRIAL_PROTEIN_CORRECTION_NOTE,
  TRIAL_PROTEIN_SUBLINE_CHOSEN,
  TRIAL_PROTEIN_SUBLINE_DERIVED,
  TRIAL_PROTEIN_SUBLINE_EMPTY,
  TRIAL_PROTEIN_VALUE_UNSET,
  type TrialProteinChoice,
  type DerivedProteinFood,
} from './trialProteinPicker';
import { trialTargetProtein } from './trialProtein';
import { COMMON_PROTEINS } from './protein';

describe('trialProteinToStore — §5: only an explicit protein pick stores a value', () => {
  it('stores the canonical key for a protein choice (TG-4)', () => {
    expect(trialProteinToStore({ kind: 'protein', key: 'rabbit' })).toBe('rabbit');
    // Canonicalized even if a dirty key ever reaches it.
    expect(trialProteinToStore({ kind: 'protein', key: 'Chicken By-Product Meal' })).toBe('chicken');
  });

  it('stores NULL for derived, hydrolyzed and unset — the three states §5 collapses', () => {
    const nullStates: TrialProteinChoice[] = [{ kind: 'derived' }, { kind: 'hydrolyzed' }, { kind: 'unset' }];
    for (const choice of nullStates) expect(trialProteinToStore(choice)).toBeNull();
  });

  it('the initial choice stores null (the untouched golden path is derived)', () => {
    expect(trialProteinToStore(INITIAL_TRIAL_PROTEIN_CHOICE)).toBeNull();
  });
});

describe('effectiveTrialProteinKey — what the row shows and the mismatch reads', () => {
  it('derived resolves to the derivation, even though it stores null', () => {
    expect(effectiveTrialProteinKey({ kind: 'derived' }, 'rabbit')).toBe('rabbit');
    expect(effectiveTrialProteinKey({ kind: 'derived' }, null)).toBeNull();
  });

  it('a protein pick resolves to its canonical key', () => {
    expect(effectiveTrialProteinKey({ kind: 'protein', key: 'duck' }, 'rabbit')).toBe('duck');
  });

  it('hydrolyzed and unset resolve to null — no target named, mismatch goes silent (TG-2)', () => {
    expect(effectiveTrialProteinKey({ kind: 'hydrolyzed' }, 'rabbit')).toBeNull();
    expect(effectiveTrialProteinKey({ kind: 'unset' }, 'rabbit')).toBeNull();
  });
});

describe('buildDerivedProteinOptions — the derived-from-trial-diet group (mock C)', () => {
  it('two foods listing the same protein → one option, "Listed on both trial foods"', () => {
    const foods: DerivedProteinFood[] = [
      { foodLabel: 'Royal Canin Selected Protein PR', primaryProtein: 'rabbit' },
      { foodLabel: 'Instinct LID Rabbit', primaryProtein: 'rabbit' },
    ];
    expect(buildDerivedProteinOptions(foods)).toEqual([
      { key: 'rabbit', label: 'Rabbit', subLabel: 'Listed on both trial foods' },
    ]);
  });

  it('one food → "From {that food}" (mock frame D row provenance)', () => {
    expect(buildDerivedProteinOptions([{ foodLabel: 'Instinct LID Rabbit', primaryProtein: 'rabbit' }])).toEqual([
      { key: 'rabbit', label: 'Rabbit', subLabel: 'From Instinct LID Rabbit' },
    ]);
  });

  it('three foods all listing it → "Listed on all trial foods"', () => {
    const foods: DerivedProteinFood[] = [
      { foodLabel: 'A', primaryProtein: 'rabbit' },
      { foodLabel: 'B', primaryProtein: 'Rabbit' },
      { foodLabel: 'C', primaryProtein: 'rabbit' },
    ];
    expect(buildDerivedProteinOptions(foods)[0].subLabel).toBe('Listed on all trial foods');
  });

  it('distinct primaries → one option each, first-seen order; a null-primary food is skipped', () => {
    const foods: DerivedProteinFood[] = [
      { foodLabel: 'No data', primaryProtein: null },
      { foodLabel: 'Rabbit food', primaryProtein: 'rabbit' },
      { foodLabel: 'Duck food', primaryProtein: 'duck' },
    ];
    const out = buildDerivedProteinOptions(foods);
    expect(out.map((o) => o.key)).toEqual(['rabbit', 'duck']);
    // count=1 of total=3 → names the single food.
    expect(out[0].subLabel).toBe('From Rabbit food');
  });

  it('empty / all-null foods → no derived options', () => {
    expect(buildDerivedProteinOptions([])).toEqual([]);
    expect(buildDerivedProteinOptions([{ foodLabel: 'x', primaryProtein: null }])).toEqual([]);
  });

  it('drops a source-less process word — a hydrolyzed diet offers no derived protein (mock frame E)', () => {
    // Regression (adversarial round 1): the builder filtered only on
    // canonicalizeProtein==null, so it OFFERED "Hydrolyzed protein" as a selectable
    // protein competing with the "No single protein (hydrolyzed)" escape hatch — two
    // ways to say hydrolyzed that behave oppositely. A process word names no antigen,
    // so it is not a derived option; the escape hatch is the answer for that diet.
    expect(buildDerivedProteinOptions([{ foodLabel: "Hill's z/d", primaryProtein: 'hydrolyzed protein' }])).toEqual([]);
    // A source-BEARING hydrolyzed primary still derives (it names chicken).
    expect(buildDerivedProteinOptions([{ foodLabel: "Hill's z/d", primaryProtein: 'hydrolyzed chicken' }]).map((o) => o.key)).toEqual([
      'hydrolyzed chicken',
    ]);
  });

  it("the first derived option's key === trialTargetProtein's derived result (one derivation, §4)", () => {
    // The agreement that keeps the picker default and the row prefill from drifting.
    const cases: DerivedProteinFood[][] = [
      [{ foodLabel: 'a', primaryProtein: 'rabbit' }, { foodLabel: 'b', primaryProtein: 'rabbit' }],
      [{ foodLabel: 'a', primaryProtein: null }, { foodLabel: 'b', primaryProtein: 'chicken' }],
      [{ foodLabel: 'a', primaryProtein: 'Duck By-Product Meal' }],
    ];
    for (const foods of cases) {
      const firstOption = buildDerivedProteinOptions(foods)[0]?.key ?? null;
      const derived = trialTargetProtein({ target_protein: null }, foods.map((f) => ({ primaryProtein: f.primaryProtein }))).protein;
      expect(firstOption).toBe(derived);
    }
  });
});

describe('commonProteinOptions — "Other proteins" excludes the derived group', () => {
  it('lists the common set minus the derived keys, never repeating a derived protein (mock C)', () => {
    const out = commonProteinOptions(['rabbit']);
    expect(out.some((o) => o.key === 'rabbit')).toBe(false);
    expect(out.some((o) => o.key === 'chicken')).toBe(true);
    // Everything else in COMMON_PROTEINS survives.
    expect(out).toHaveLength(COMMON_PROTEINS.length - 1);
  });

  it('the full common set when nothing derives', () => {
    expect(commonProteinOptions([])).toHaveLength(COMMON_PROTEINS.length);
  });
});

describe('titleProtein', () => {
  it('Title-cases a canonical key for display', () => {
    expect(titleProtein('rabbit')).toBe('Rabbit');
    expect(titleProtein('')).toBe('');
  });
});

// ── Copy shape (voice-relevant asserts; full nyx-voice pass in the PR) ─────────
describe('copy builders', () => {
  it('the mismatch heads-up leads with the fact and follows with non-alarming advice (§8)', () => {
    const { fact, advice } = mismatchHeadsUp({
      foodLabel: 'Blue Buffalo Sensitive Stomach',
      foodProtein: 'chicken',
      petName: 'Miso',
      targetProtein: 'rabbit',
    });
    expect(fact).toBe('Blue Buffalo Sensitive Stomach lists chicken as its main protein.');
    expect(advice).toBe("If Miso's trial is rabbit-only, worth checking that bag with your vet.");
    // Never an alarm register.
    expect(`${fact} ${advice}`).not.toMatch(/wrong|mistake|error|!/i);
  });

  it('the unset option copy keeps the "everything still works" reassurance and names the pet', () => {
    const { label, subLabel } = unsetOption('Miso');
    expect(label).toBe('Not sure — leave it unset');
    expect(subLabel).toContain('Everything still works');
    expect(subLabel).toContain("Miso's trial");
  });

  it('the derived group header names the pet (mock C)', () => {
    expect(derivedGroupHeader('Miso')).toBe("From Miso's trial diet");
  });
});

// ── Mid-trial editing (B-704 PR 4 — the correction gate + row, mock frames G/H) ──

describe('isTrialProteinCorrection', () => {
  it('is a correction when an owner value changes to a different protein', () => {
    expect(isTrialProteinCorrection('rabbit', { kind: 'protein', key: 'venison' })).toBe(true);
  });
  it('is a correction when clearing an owner value to an escape hatch', () => {
    expect(isTrialProteinCorrection('rabbit', { kind: 'hydrolyzed' })).toBe(true);
    expect(isTrialProteinCorrection('rabbit', { kind: 'unset' })).toBe(true);
  });
  it('is NOT a correction when re-picking the same owner value', () => {
    expect(isTrialProteinCorrection('rabbit', { kind: 'protein', key: 'rabbit' })).toBe(false);
  });
  it('is NEVER a correction on a non-owner (null) trial — that is a first-set', () => {
    expect(isTrialProteinCorrection(null, { kind: 'protein', key: 'venison' })).toBe(false);
    expect(isTrialProteinCorrection(null, { kind: 'hydrolyzed' })).toBe(false);
    expect(isTrialProteinCorrection(null, { kind: 'derived' })).toBe(false);
  });
});

describe('trialProteinCorrectionLabel', () => {
  it('names the destination protein (mock frame H "Change to venison")', () => {
    expect(trialProteinCorrectionLabel({ kind: 'protein', key: 'venison' })).toBe('Change to venison');
  });
  it('reads as a removal for either escape hatch', () => {
    expect(trialProteinCorrectionLabel({ kind: 'hydrolyzed' })).toBe('Remove the trial protein');
    expect(trialProteinCorrectionLabel({ kind: 'unset' })).toBe('Remove the trial protein');
  });
});

describe('TRIAL_PROTEIN_CORRECTION_NOTE', () => {
  it('states the whole-trial effect and that off-diet counts do not move (§8/TG-1)', () => {
    expect(TRIAL_PROTEIN_CORRECTION_NOTE).toContain("the trial's whole record");
    expect(TRIAL_PROTEIN_CORRECTION_NOTE).toContain("What counted as off-diet doesn't change");
  });
});

describe('midTrialProteinRow', () => {
  it('shows an owner-confirmed protein with the "tap to change" sub-line', () => {
    expect(midTrialProteinRow({ protein: 'rabbit', source: 'owner' })).toEqual({
      value: 'Rabbit',
      valueIsSet: true,
      subLine: TRIAL_PROTEIN_SUBLINE_CHOSEN,
    });
  });
  it('marks a derived protein as from the picked foods, not owner-confirmed', () => {
    expect(midTrialProteinRow({ protein: 'rabbit', source: 'derived' })).toEqual({
      value: 'Rabbit',
      valueIsSet: true,
      subLine: TRIAL_PROTEIN_SUBLINE_DERIVED,
    });
  });
  it('is a set-prompt when nothing resolves (E1) — never a "no protein" verdict', () => {
    expect(midTrialProteinRow({ protein: null, source: null })).toEqual({
      value: TRIAL_PROTEIN_VALUE_UNSET,
      valueIsSet: false,
      subLine: TRIAL_PROTEIN_SUBLINE_EMPTY,
    });
  });
});

describe('midTrialInitialChoice', () => {
  it('pre-selects an owner-set protein', () => {
    expect(midTrialInitialChoice({ protein: 'rabbit', source: 'owner' })).toEqual({
      kind: 'protein',
      key: 'rabbit',
    });
  });
  it('opens on `derived` for a derived or unset trial (the neutral default)', () => {
    expect(midTrialInitialChoice({ protein: 'rabbit', source: 'derived' })).toEqual({ kind: 'derived' });
    expect(midTrialInitialChoice({ protein: null, source: null })).toEqual({ kind: 'derived' });
  });
});
