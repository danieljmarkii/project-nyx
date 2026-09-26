// resolveWeightFieldSave: the Edit profile weight field's save rule (CUL-1283).
//
// The sweep is the defect's own measurement turned into an assertion: of every
// NUMERIC(5,2) weight from 0.01 to 90.00 kg, 7,016 come back different through the
// 0.1 lb display round trip. The sweep pins BOTH halves, so it cannot pass vacuously:
// the round trip really does drift for most of them, and an untouched field writes
// none of them.
import { kgToLbs, kgToLbsNum, lbsToKg, resolveWeightFieldSave } from './weightUnits';

describe('resolveWeightFieldSave', () => {
  it('leaves an untouched 3.73 kg alone, where the round trip would write 3.72', () => {
    expect(lbsToKg(parseFloat(kgToLbs(3.73)))).toBe(3.72);
    expect(resolveWeightFieldSave(kgToLbs(3.73), 3.73)).toEqual({ write: false });
  });

  it('writes nothing for ANY untouched stored weight, over a range where the round trip mostly drifts', () => {
    let drifting = 0;
    const written: number[] = [];
    for (let cents = 1; cents <= 9000; cents++) {
      const kg = cents / 100;
      const seeded = kgToLbs(kg);
      if (lbsToKg(parseFloat(seeded)) !== kg) drifting++;
      if (resolveWeightFieldSave(seeded, kg).write) written.push(kg);
    }
    expect(drifting).toBe(7016);
    expect(written).toEqual([]);
  });

  it('treats a retyped value that reads the same number as untouched', () => {
    expect(resolveWeightFieldSave(' 8.20 ', 3.73)).toEqual({ write: false });
  });

  it('writes the typed value when the owner changes the number', () => {
    expect(resolveWeightFieldSave('9', 3.73)).toEqual({ write: true, weightKg: lbsToKg(9) });
  });

  it('clears the weight when the owner empties the field', () => {
    expect(resolveWeightFieldSave('', 3.73)).toEqual({ write: true, weightKg: null });
    expect(resolveWeightFieldSave('   ', 3.73)).toEqual({ write: true, weightKg: null });
  });

  it('writes nothing for a pet with no weight and an empty field', () => {
    expect(resolveWeightFieldSave('', null)).toEqual({ write: false });
  });

  it('writes a first weight typed onto a pet that had none', () => {
    expect(resolveWeightFieldSave('11.2', null)).toEqual({ write: true, weightKg: lbsToKg(11.2) });
  });

  it('compares against the display the seed produced, at 0.1 lb', () => {
    const seededKg = 5.1;
    expect(resolveWeightFieldSave(String(kgToLbsNum(seededKg)), seededKg)).toEqual({ write: false });
    expect(resolveWeightFieldSave(String(kgToLbsNum(seededKg) + 0.1), seededKg).write).toBe(true);
  });
});
