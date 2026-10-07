// The commit beat's tone (CUL-1632). The membership walk names this consumer of
// SYMPTOM_TYPES (constants/eventTypes.membership.test.ts, C-11); the set it rides is
// pinned here, over every event type, so a leaf that joins SYMPTOM_TYPES is calm the
// same day and Other can never fall back through to the celebrate beat.

import { EVENT_TYPES, EventTypeKey, SYMPTOM_TYPES } from '../constants/eventTypes';
import { commitToneOf } from './commitTone';

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
