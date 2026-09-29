import { STOOL_FORMED_CONSISTENCIES, isFormedStoolConsistency, needsEn7Recheck } from './stoolForm';

// EN-7's formed set and the owner-edit re-check (CUL-1138, CUL-1408).

const EN3 = { engine_flags: ['engines_v3_en3'], contextual_flags: [] as string[], stool_consistency: 'type_4_smooth_soft' };

describe('the formed set', () => {
  it('is Bristol 2 to 4 and nothing else', () => {
    expect([...STOOL_FORMED_CONSISTENCIES]).toEqual(['type_2_lumpy', 'type_3_cracked', 'type_4_smooth_soft']);
    for (const c of ['type_1_hard_lumps', 'type_5_soft_blobs', 'type_6_mushy', 'type_7_watery', 'unsure', null, undefined]) {
      expect(isFormedStoolConsistency(c)).toBe(false);
    }
  });
});

describe('needsEn7Recheck', () => {
  it('re-runs when an EN-7 row with no vomiting call is edited away from formed', () => {
    for (const next of ['type_7_watery', 'type_6_mushy', 'type_1_hard_lumps', 'type_5_soft_blobs', 'unsure', null]) {
      expect(needsEn7Recheck(EN3, next)).toBe(true);
    }
  });

  it('never re-runs a row written without the key (dark until engines_v3_en3 is on)', () => {
    expect(needsEn7Recheck({ ...EN3, engine_flags: [] }, 'type_7_watery')).toBe(false);
    expect(needsEn7Recheck({ ...EN3, engine_flags: ['engines_v3_en0'] }, 'type_7_watery')).toBe(false);
    expect(needsEn7Recheck({ ...EN3, engine_flags: null }, 'type_7_watery')).toBe(false);
    expect(needsEn7Recheck({ contextual_flags: [], stool_consistency: 'type_4_smooth_soft' }, 'type_7_watery')).toBe(false);
  });

  it('never re-runs when the call already stands, the edit stays formed, or the consistency did not move', () => {
    expect(needsEn7Recheck({ ...EN3, contextual_flags: ['concurrent_vomiting'] }, 'type_7_watery')).toBe(false);
    expect(needsEn7Recheck(EN3, 'type_2_lumpy')).toBe(false);
    expect(needsEn7Recheck({ ...EN3, stool_consistency: 'type_7_watery' }, 'type_7_watery')).toBe(false);
  });
});
