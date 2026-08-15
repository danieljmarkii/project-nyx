// The shared recap node-tint contract (DR-1 §2). One map, so DR-1's spine and DR-2's
// lane cannot drift — and the night med dot resolves to the token minted for it.
import { NODE_TINT_DAY, NODE_TINT_NIGHT } from './nodeTints';
import { theme } from '../../constants/theme';

describe('recap node tints', () => {
  it('the night med dot uses the minted colorEventMedicationOnNight (#93ADCB)', () => {
    expect(theme.colorEventMedicationOnNight).toBe('#93ADCB');
    expect(NODE_TINT_NIGHT.medication).toBe(theme.colorEventMedicationOnNight);
    // …and it is DISTINCT from the light-ground slate (the whole reason it was minted).
    expect(NODE_TINT_NIGHT.medication).not.toBe(NODE_TINT_DAY.medication);
  });

  it('night symptom uses the on-night rose sibling', () => {
    expect(NODE_TINT_NIGHT.symptom).toBe(theme.colorEventSymptomOnNight);
    expect(NODE_TINT_DAY.symptom).toBe(theme.colorEventSymptom);
  });

  it('meal teal carries over to night unchanged', () => {
    expect(NODE_TINT_NIGHT.meal).toBe(theme.colorEventMeal);
    expect(NODE_TINT_DAY.meal).toBe(theme.colorEventMeal);
  });

  it('every category has a day and a night tint', () => {
    for (const cat of ['symptom', 'meal', 'medication', 'other'] as const) {
      expect(typeof NODE_TINT_DAY[cat]).toBe('string');
      expect(typeof NODE_TINT_NIGHT[cat]).toBe('string');
    }
  });
});
