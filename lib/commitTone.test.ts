// The commit beat's tone (CUL-1632). The membership walk names this consumer of
// SYMPTOM_TYPES (constants/eventTypes.membership.test.ts, C-11); the set it rides is
// pinned here, over every event type, so a leaf that joins SYMPTOM_TYPES is calm the
// same day and Other can never fall back through to the celebrate beat.

import { EVENT_TYPES, EventTypeKey, SYMPTOM_TYPES } from '../constants/eventTypes';
import { commitToneOf, doseCelebrates } from './commitTone';

describe('commitToneOf: the calm beat rides SYMPTOM_TYPES, plus Other', () => {
  it('the calm beat is exactly SYMPTOM_TYPES ∪ {other}, over every EVENT_TYPES key', () => {
    const calm = (Object.keys(EVENT_TYPES) as EventTypeKey[]).filter((k) => commitToneOf(k) === 'calm').sort();
    expect(calm).toEqual([...SYMPTOM_TYPES, 'other'].sort());
  });

  it('a normal stool and a meal keep the celebrate beat', () => {
    expect(commitToneOf('stool_normal')).toBe('celebrate');
    expect(commitToneOf('meal')).toBe('celebrate');
  });

  it('no type at all is the celebrate default, as the sheet with no confirm always was', () => {
    expect(commitToneOf(null)).toBe('celebrate');
    expect(commitToneOf(undefined)).toBe('celebrate');
  });
});

describe('doseCelebrates: gold only on a dose the owner said was given (CUL-1691 §2.1)', () => {
  const standalone = { isCombo: false, vehicleIntake: null, doubleDose: null };

  it('a standalone given dose celebrates', () => {
    expect(doseCelebrates({ ...standalone, adherence: 'given' })).toBe(true);
  });

  it('in doubt, Partial, Missed and Refused are calm', () => {
    for (const adherence of [null, 'partial', 'missed', 'refused']) {
      expect(doseCelebrates({ ...standalone, adherence })).toBe(false);
    }
  });

  it('an assumed given on an unrated combo is calm (the card still asks)', () => {
    expect(doseCelebrates({ adherence: 'given', isCombo: true, vehicleIntake: null })).toBe(false);
    expect(doseCelebrates({ adherence: 'given', isCombo: true, vehicleIntake: undefined })).toBe(false);
  });

  it('a combo whose bowl was rated, then given, celebrates', () => {
    expect(doseCelebrates({ adherence: 'given', isCombo: true, vehicleIntake: 'refused' })).toBe(true);
    expect(doseCelebrates({ adherence: 'given', isCombo: true, vehicleIntake: 'all' })).toBe(true);
  });

  it('a given dose carrying a double-dose conflict is calm; a cleared check is not', () => {
    expect(doseCelebrates({ ...standalone, adherence: 'given', doubleDose: { conflict: true } })).toBe(false);
    expect(doseCelebrates({ ...standalone, adherence: 'given', doubleDose: { conflict: false } })).toBe(true);
  });
});
