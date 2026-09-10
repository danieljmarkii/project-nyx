// The shared recap node-tint contract (DR-1 §2). One map, so DR-1's spine and DR-2's
// lane cannot drift — and the night med dot resolves to the token minted for it.
import { NODE_TINT_DAY, NODE_TINT_NIGHT, nodeDotColors } from './nodeTints';
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
    for (const cat of ['symptom', 'meal', 'medication', 'other', 'look'] as const) {
      expect(typeof NODE_TINT_DAY[cat]).toBe('string');
      expect(typeof NODE_TINT_NIGHT[cat]).toBe('string');
    }
  });

  // CUL-868 — a look is the muted neutral on both grounds, never rose. The hue says
  // "not a symptom"; the hollowness below says "not an event that happened to her".
  it('a look takes the muted neutral, never a category hue of its own', () => {
    expect(NODE_TINT_DAY.look).toBe(NODE_TINT_DAY.other);
    expect(NODE_TINT_NIGHT.look).toBe(NODE_TINT_NIGHT.other);
    expect(NODE_TINT_DAY.look).not.toBe(NODE_TINT_DAY.symptom);
    expect(NODE_TINT_NIGHT.look).not.toBe(NODE_TINT_NIGHT.symptom);
  });
});

describe('nodeDotColors — the hollow look mark (CUL-868)', () => {
  const GROUND = '#FFFFFF';

  it.each(['symptom', 'meal', 'medication', 'other'] as const)(
    'a %s dot is FILLED with its tint and ringed in the ground',
    (cat) => {
      expect(nodeDotColors(cat, NODE_TINT_DAY, GROUND)).toEqual({
        fill: NODE_TINT_DAY[cat],
        ring: GROUND,
      });
    },
  );

  it('a look INVERTS that — the ground is the fill and the tint is the ring', () => {
    expect(nodeDotColors('look', NODE_TINT_DAY, GROUND)).toEqual({
      fill: GROUND,
      ring: NODE_TINT_DAY.look,
    });
  });

  // The reason the rule is expressed as fill/ring rather than as an extra border:
  // `borderWidth` is inside the box in RN, so swapping the two colours changes what
  // the dot looks like and nothing about how much room it takes (C-5 — never grow
  // the box). Both arms return exactly two colours and no geometry.
  it('says nothing about geometry — only which colour goes where', () => {
    const look = nodeDotColors('look', NODE_TINT_DAY, GROUND);
    const meal = nodeDotColors('meal', NODE_TINT_DAY, GROUND);
    expect(Object.keys(look).sort()).toEqual(['fill', 'ring']);
    expect(Object.keys(look).sort()).toEqual(Object.keys(meal).sort());
  });

  it('works on the night ground too, so the spine can share it (N-3)', () => {
    const night = '#13112E';
    expect(nodeDotColors('look', NODE_TINT_NIGHT, night)).toEqual({
      fill: night,
      ring: NODE_TINT_NIGHT.look,
    });
  });
});
