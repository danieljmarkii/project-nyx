// CUL-1124 — what a dose row says about its dose. The row's rendering is pinned in
// components/history/EventRow.dose.test.tsx; this pins the two rules it reads.

import { asDoseAdherence, doseDrugLabel } from './doseDisplay';

describe('doseDrugLabel — the item, else the course, else nothing', () => {
  it('names a dose by its item, the B-161 rule unchanged', () => {
    expect(doseDrugLabel({ genericName: 'Cetirizine HCl', brandName: 'Zyrtec', regimenDrugName: null }))
      .toBe('Cetirizine HCl · Zyrtec');
    // A brand that only repeats the generic is not appended (formatDrugLabel's rule).
    expect(doseDrugLabel({ genericName: 'Zyrtec', brandName: 'Zyrtec', regimenDrugName: null }))
      .toBe('Zyrtec');
  });

  it('the item comes before the course, even when the course says something else', () => {
    expect(doseDrugLabel({ genericName: 'Prednisolone', brandName: null, regimenDrugName: 'Pred' }))
      .toBe('Prednisolone');
    expect(doseDrugLabel({ genericName: null, brandName: 'Zyrtec', regimenDrugName: 'Cetirizine' }))
      .toBe('Zyrtec');
  });

  it('names a dose of a course typed in by hand by its course', () => {
    expect(doseDrugLabel({ genericName: null, brandName: null, regimenDrugName: 'Metronidazole' }))
      .toBe('Metronidazole');
    expect(doseDrugLabel({ genericName: undefined, brandName: undefined, regimenDrugName: '  Metronidazole ' }))
      .toBe('Metronidazole');
  });

  it('a blank name at either source is no name', () => {
    expect(doseDrugLabel({ genericName: '  ', brandName: '', regimenDrugName: 'Metronidazole' }))
      .toBe('Metronidazole');
    expect(doseDrugLabel({ genericName: null, brandName: null, regimenDrugName: '   ' })).toBeNull();
  });

  it('returns null when nothing names the drug, and invents nothing in its place', () => {
    expect(doseDrugLabel({ genericName: null, brandName: null, regimenDrugName: null })).toBeNull();
    expect(doseDrugLabel({ genericName: undefined, brandName: undefined, regimenDrugName: undefined }))
      .toBeNull();
  });
});

describe('asDoseAdherence — the stored value as the chip reads it', () => {
  it.each(['given', 'partial', 'missed', 'refused'] as const)('keeps %s', (value) => {
    expect(asDoseAdherence(value)).toBe(value);
  });

  it('reads a missing or unknown value as unrated, never as a guess', () => {
    expect(asDoseAdherence(null)).toBeNull();
    expect(asDoseAdherence(undefined)).toBeNull();
    expect(asDoseAdherence('')).toBeNull();
    expect(asDoseAdherence('Given')).toBeNull();
    expect(asDoseAdherence('spat_out')).toBeNull();
  });
});
