// B-704 PR 4 — the trial-protein picker model, the editor row, and the correction
// gate. These are the pure decisions the sheet lays out; the component owns only
// the confirm-step UI state, so the logic that matters is asserted here.

import {
  buildProteinCorrectionConfirm,
  buildTrialProteinPicker,
  buildTrialProteinRow,
  derivedProteinSubLabel,
  isProteinCorrection,
  proteinValueOf,
  TRIAL_PROTEIN_CORRECTION_NOTE,
  TRIAL_PROTEIN_HYDROLYZED,
  TRIAL_PROTEIN_ROW_SUB_DERIVED,
  TRIAL_PROTEIN_ROW_SUB_EMPTY,
  TRIAL_PROTEIN_ROW_SUB_OWNER,
  TRIAL_PROTEIN_UNSET,
  type TrialProteinOption,
} from './trialProteinPicker';
import { COMMON_PROTEINS } from './protein';

const RABBIT_FOODS = [{ primaryProtein: 'rabbit' }, { primaryProtein: 'rabbit' }];

// ── The editor row (frame G) ─────────────────────────────────────────────────

describe('buildTrialProteinRow', () => {
  it('names an owner-confirmed protein, capitalized, with the owner sub-line', () => {
    const row = buildTrialProteinRow({ protein: 'rabbit', source: 'owner' });
    expect(row.value).toBe('Rabbit');
    expect(row.valueSet).toBe(true);
    expect(row.subLine).toBe(TRIAL_PROTEIN_ROW_SUB_OWNER);
  });

  it('marks a derived protein as from the trial diet, not owner-confirmed', () => {
    const row = buildTrialProteinRow({ protein: 'rabbit', source: 'derived' });
    expect(row.value).toBe('Rabbit');
    expect(row.subLine).toBe(TRIAL_PROTEIN_ROW_SUB_DERIVED);
  });

  it('is a set-prompt when nothing resolves (TP-1 E1 — never a "no protein" verdict)', () => {
    const row = buildTrialProteinRow({ protein: null, source: null });
    expect(row.value).toBe('Not set');
    expect(row.valueSet).toBe(false);
    expect(row.subLine).toBe(TRIAL_PROTEIN_ROW_SUB_EMPTY);
  });
});

// ── The picker groups (frame C) ──────────────────────────────────────────────

describe('buildTrialProteinPicker', () => {
  it('leads with the derived group when the trial foods name a protein', () => {
    const model = buildTrialProteinPicker({
      petName: 'Miso',
      primaryFoods: RABBIT_FOODS,
      resolved: { protein: 'rabbit', source: 'derived' },
    });
    expect(model.groups[0].title).toBe('From Miso’s trial diet');
    expect(model.groups[0].options.map((o) => o.id)).toEqual(['rabbit']);
    // Both foods list it — the mock's provenance sub-label.
    expect(model.groups[0].options[0].subLabel).toBe('Listed on both trial foods');
  });

  it('omits the derived group entirely when no primary protein resolves (E1 case)', () => {
    const model = buildTrialProteinPicker({
      petName: 'Miso',
      primaryFoods: [{ primaryProtein: null }],
      resolved: { protein: null, source: null },
    });
    expect(model.groups.some((g) => g.title.startsWith('From'))).toBe(false);
    // Nothing selected — never the escape hatches pre-selected (§5).
    expect(model.selectedId).toBeNull();
  });

  it('offers the common proteins, minus anything already in the derived group', () => {
    const model = buildTrialProteinPicker({
      petName: 'Miso',
      primaryFoods: RABBIT_FOODS,
      resolved: { protein: 'rabbit', source: 'derived' },
    });
    const other = model.groups.find((g) => g.title === 'Other proteins');
    expect(other).toBeDefined();
    const ids = other!.options.map((o) => o.id);
    // rabbit is in the derived group, so it is NOT duplicated here.
    expect(ids).not.toContain('rabbit');
    expect(ids).toEqual(COMMON_PROTEINS.filter((p) => p !== 'rabbit'));
  });

  it('carries the two null-writing escape hatches last, with the pet-named unset copy', () => {
    const model = buildTrialProteinPicker({
      petName: 'Miso',
      primaryFoods: RABBIT_FOODS,
      resolved: { protein: 'rabbit', source: 'owner' },
    });
    const escape = model.groups[model.groups.length - 1];
    expect(escape.title).toBe('Neither of these?');
    const hydrolyzed = escape.options.find((o) => o.id === TRIAL_PROTEIN_HYDROLYZED);
    const unset = escape.options.find((o) => o.id === TRIAL_PROTEIN_UNSET);
    expect(hydrolyzed?.writesNull).toBe(true);
    expect(unset?.writesNull).toBe(true);
    expect(unset?.subLabel).toContain('Miso’s trial');
  });

  it('marks the filled radio from the resolved protein, and reports owner-set', () => {
    const owner = buildTrialProteinPicker({
      petName: 'Miso',
      primaryFoods: RABBIT_FOODS,
      resolved: { protein: 'rabbit', source: 'owner' },
    });
    expect(owner.selectedId).toBe('rabbit');
    expect(owner.isOwnerSet).toBe(true);

    const derived = buildTrialProteinPicker({
      petName: 'Miso',
      primaryFoods: RABBIT_FOODS,
      resolved: { protein: 'rabbit', source: 'derived' },
    });
    expect(derived.selectedId).toBe('rabbit');
    expect(derived.isOwnerSet).toBe(false);
  });

  it('dedupes and canonicalizes the derived group across mixed casing', () => {
    const model = buildTrialProteinPicker({
      petName: 'Rex',
      primaryFoods: [{ primaryProtein: 'Duck' }, { primaryProtein: 'duck' }, { primaryProtein: 'salmon' }],
      resolved: { protein: 'duck', source: 'derived' },
    });
    expect(model.groups[0].options.map((o) => o.id)).toEqual(['duck', 'salmon']);
  });
});

describe('derivedProteinSubLabel', () => {
  it('says "both" for two-of-two, and counts otherwise', () => {
    expect(derivedProteinSubLabel(2, 2)).toBe('Listed on both trial foods');
    expect(derivedProteinSubLabel(3, 3)).toBe('Listed on all 3 trial foods');
    expect(derivedProteinSubLabel(2, 3)).toBe('Listed on 2 of your trial foods');
    expect(derivedProteinSubLabel(1, 1)).toBe('Listed on the trial diet');
  });
});

// ── The correction gate (TP-3) ───────────────────────────────────────────────

const rabbitOption: TrialProteinOption = {
  id: 'rabbit',
  label: 'Rabbit',
  subLabel: null,
  writesNull: false,
};
const venisonOption: TrialProteinOption = {
  id: 'venison',
  label: 'Venison',
  subLabel: null,
  writesNull: false,
};
const hydrolyzedOption: TrialProteinOption = {
  id: TRIAL_PROTEIN_HYDROLYZED,
  label: 'No single protein',
  subLabel: 'x',
  writesNull: true,
};

describe('isProteinCorrection — the confirm fires only on a change to an owner value', () => {
  it('is a correction when the current value is owner-set and the new value differs', () => {
    const model = { selectedId: 'rabbit', isOwnerSet: true };
    expect(isProteinCorrection(model, venisonOption)).toBe(true);
  });

  it('is a correction when clearing an owner value to an escape hatch', () => {
    const model = { selectedId: 'rabbit', isOwnerSet: true };
    expect(isProteinCorrection(model, hydrolyzedOption)).toBe(true);
  });

  it('is NOT a correction when re-selecting the same owner value', () => {
    const model = { selectedId: 'rabbit', isOwnerSet: true };
    expect(isProteinCorrection(model, rabbitOption)).toBe(false);
  });

  it('is NEVER a correction over a derived value — that is a first-set, no confirm', () => {
    const model = { selectedId: 'rabbit', isOwnerSet: false };
    expect(isProteinCorrection(model, venisonOption)).toBe(false);
    expect(isProteinCorrection(model, rabbitOption)).toBe(false);
  });

  it('is NEVER a correction from unset', () => {
    const model = { selectedId: null, isOwnerSet: false };
    expect(isProteinCorrection(model, rabbitOption)).toBe(false);
  });
});

describe('proteinValueOf', () => {
  it('maps a protein option to its key and an escape hatch to null', () => {
    expect(proteinValueOf(rabbitOption)).toBe('rabbit');
    expect(proteinValueOf(hydrolyzedOption)).toBeNull();
  });
});

describe('buildProteinCorrectionConfirm — frame H', () => {
  it('states the §8 whole-trial note verbatim, and names the destination protein', () => {
    const confirm = buildProteinCorrectionConfirm(venisonOption);
    expect(confirm.note).toBe(TRIAL_PROTEIN_CORRECTION_NOTE);
    expect(confirm.confirmLabel).toBe('Change to venison');
  });

  it('reads as a removal when the change clears the protein', () => {
    const confirm = buildProteinCorrectionConfirm(hydrolyzedOption);
    expect(confirm.confirmLabel).toBe('Remove the trial protein');
  });

  it('the note never implies the off-diet counts move (TG-1/TG-5)', () => {
    // The load-bearing second sentence: naming changes, verdicts do not.
    expect(TRIAL_PROTEIN_CORRECTION_NOTE).toContain('What counted as off-diet doesn’t change');
  });
});
