// Today's links into History, read by v2 (CUL-1164 / HV-7; spec §5.8): every parameter a
// sender sends today lands, read the way v1 reads it, so no sender changes to reach v2.
import { historyDoorRequestOf, historyDoorTapKey } from './historyDoorParams';

describe('historyDoorRequestOf: what each shipped sender asks for', () => {
  it('Ask\'s provenance and the medication screen: a type and a window', () => {
    expect(historyDoorRequestOf({ type: 'vomit', window: '7d', ts: '1' })).toEqual({
      filter: { kind: 'type', type: 'vomit' },
      window: { kind: 'last', days: 7 },
    });
    expect(historyDoorRequestOf({ type: 'medication', ts: '1' })).toEqual({
      filter: { kind: 'type', type: 'medication' },
      window: { kind: 'all' },
    });
  });

  it('the Noticed card and Patterns: a look is the Noticed filter, Today when the card asks for it', () => {
    expect(historyDoorRequestOf({ type: 'check_in', window: 'today', ts: '1' })).toEqual({
      filter: { kind: 'noticed' },
      window: { kind: 'today' },
    });
    expect(historyDoorRequestOf({ type: 'check_in', ts: '1' })).toEqual({ filter: { kind: 'noticed' }, window: { kind: 'all' } });
  });

  it('Ask\'s History chip: the Today window, every type', () => {
    expect(historyDoorRequestOf({ date: 'today', ts: '1' })).toEqual({ filter: { kind: 'all' }, window: { kind: 'today' } });
  });

  it('a day link lands on its day under All types and All time, read by its sender', () => {
    const landing = (day: string) => ({ filter: { kind: 'all' }, window: { kind: 'all' }, landOn: day });
    // The month's door: a local day.
    expect(historyDoorRequestOf({ day: '2026-09-17', ts: '1' })).toEqual(landing('2026-09-17'));
    // The widget: a local day, with its pet (the pet is the hook's to apply).
    expect(historyDoorRequestOf({ date: '2026-09-17', src: 'widget', pet: 'p1', ts: '1' })).toEqual(landing('2026-09-17'));
    // The flag-off calendar's UTC key: the same calendar day.
    expect(historyDoorRequestOf({ date: '2026-09-17', ts: '1' })).toEqual(landing('2026-09-17'));
  });

  it('a bad link asks for nothing, or degrades to showing more, never to a crash', () => {
    expect(historyDoorRequestOf({})).toBeNull();
    expect(historyDoorRequestOf({ ts: '1' })).toBeNull();
    expect(historyDoorRequestOf({ date: '2026-02-30', ts: '1' })).toBeNull();
    expect(historyDoorRequestOf({ type: 'toString', ts: '1' })).toEqual({ filter: { kind: 'all' }, window: { kind: 'all' } });
    expect(historyDoorRequestOf({ type: 'vomit', window: 'forever', ts: '1' })).toEqual({
      filter: { kind: 'type', type: 'vomit' },
      window: { kind: 'all' },
    });
  });

  it('HV-11: a course link is that course over All time, whatever type rides with it', () => {
    // The medication screen sends Medication too, so v1 (which ignores `course`) lands as before.
    expect(historyDoorRequestOf({ type: 'medication', course: 'reg-1', ts: '1' })).toEqual({
      filter: { kind: 'course', courseKey: 'reg-1' },
      window: { kind: 'all' },
    });
    // The rundown's past course sends the course alone.
    expect(historyDoorRequestOf({ course: 'item:med-9', ts: '1' })).toEqual({
      filter: { kind: 'course', courseKey: 'item:med-9' },
      window: { kind: 'all' },
    });
  });

  it('HV-11: All symptoms, and the windows only the flag-on senders send', () => {
    expect(historyDoorRequestOf({ type: 'symptoms', window: '30d', ts: '1' })).toEqual({
      filter: { kind: 'symptoms' },
      window: { kind: 'last', days: 30 },
    });
    expect(historyDoorRequestOf({ type: 'vomit', window: '14d', ts: '1' })?.window).toEqual({ kind: 'last', days: 14 });
    expect(historyDoorRequestOf({ type: 'vomit', window: 'trial', ts: '1' })?.window).toEqual({ kind: 'trial' });
    expect(historyDoorRequestOf({ window: 'visit', ts: '1' })).toEqual({ filter: { kind: 'all' }, window: { kind: 'visit' } });
  });

  it('a type/window link wins over a day link (no sender sends both; v1\'s precedence)', () => {
    expect(historyDoorRequestOf({ type: 'vomit', date: '2026-09-17', ts: '1' })).toEqual({
      filter: { kind: 'type', type: 'vomit' },
      window: { kind: 'all' },
    });
  });
});

describe('historyDoorTapKey: one tap, once', () => {
  it('a new nonce is a new tap; the same nonce and request are the same tap', () => {
    const request = historyDoorRequestOf({ day: '2026-09-17', ts: '1' })!;
    expect(historyDoorTapKey({ ts: '1' }, request)).toBe(historyDoorTapKey({ ts: '1' }, request));
    expect(historyDoorTapKey({ ts: '2' }, request)).not.toBe(historyDoorTapKey({ ts: '1' }, request));
    expect(historyDoorTapKey({}, request)).toBe(historyDoorTapKey({}, request));
  });
});
