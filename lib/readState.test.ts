// The one read predicate (History v2 §5.4, HV-5 / CUL-1162): every row of the spec's
// table, every precedence edge the header names, and a cross product that holds the
// month's rose (`isWorthACall`) and the full state (`readStateOf`) equal over every
// input this file can build. AC 22: Hide never stands the rose down, and an unknown or
// failed verdict never renders calm. Since the PM's 2026-09-25 ruling (HV-6 / CUL-1163),
// a finished `not_enough_to_say` is never calm either: on a photographed row it is
// `unread`, the grey *Photo not read*.

import {
  isWorthACall,
  readStateOf,
  readVerdictOf,
  type ReadCopy,
  type ReadState,
  type ReadStateInput,
} from './readState';

const copy = (status: string, recommendation: string | null): ReadCopy => ({ status, recommendation });

/** A photographed vomit with nothing in flight and reading on: the common case. */
const base = (over: Partial<ReadStateInput> = {}): ReadStateInput => ({
  eventType: 'vomit',
  hasPhoto: true,
  copy: undefined,
  inFlight: false,
  readingOff: false,
  ...over,
});

describe('the §5.4 table, row by row', () => {
  it('worth_a_call: the copy says worth a call', () => {
    expect(readStateOf(base({ copy: copy('completed', 'worth_a_call') }))).toBe('worth_a_call');
  });

  it('worth_a_call: a verdict the app does not recognise fails toward the rose', () => {
    for (const unknown of ['looks_fine_to_me', 'reassure', '']) {
      expect(readStateOf(base({ copy: copy('completed', unknown) }))).toBe('worth_a_call');
      expect(readVerdictOf(base({ copy: copy('completed', unknown) })).verdict).toBe('worth_a_call');
    }
  });

  it('worth_a_call: a failed, capped or disabled re-read never takes a live one away (CUL-812)', () => {
    for (const status of ['failed', 'capped', 'read_disabled', 'pending', 'a_status_from_the_future']) {
      expect(readStateOf(base({ copy: copy(status, 'worth_a_call') }))).toBe('worth_a_call');
    }
  });

  it('calm: a finished read that said monitor, and only that', () => {
    expect(readVerdictOf(base({ copy: copy('completed', 'monitor') }))).toEqual({ state: 'calm', verdict: 'monitor' });
  });

  it('unread: a finished read that could not say (the photo was unclear), with its verdict riding for word surfaces', () => {
    // Status `uncertain` IS `not_enough_to_say` (`_shared/incident-analysis.ts`); a
    // `completed` row carrying it is handled the same way.
    for (const status of ['uncertain', 'completed']) {
      expect(readVerdictOf(base({ copy: copy(status, 'not_enough_to_say') }))).toEqual({
        state: 'unread',
        verdict: 'not_enough_to_say',
      });
    }
  });

  it('pending: a read in flight, or a row that says pending', () => {
    expect(readStateOf(base({ inFlight: true }))).toBe('pending');
    expect(readStateOf(base({ copy: copy('pending', null) }))).toBe('pending');
  });

  it('unread: a read was expected and none completed', () => {
    // The phone holds no copy at all.
    expect(readStateOf(base())).toBe('unread');
    // It failed, it hit the cap, it was switched off server-side, and nothing escalated.
    for (const status of ['failed', 'capped', 'read_disabled']) {
      expect(readStateOf(base({ copy: copy(status, null) }))).toBe('unread');
    }
  });

  it('off: photo reading is off (CUL-552), so the row is not marked', () => {
    expect(readStateOf(base({ readingOff: true }))).toBe('off');
  });

  it('none: no read is expected', () => {
    // No photo on this device.
    expect(readStateOf(base({ hasPhoto: false }))).toBe('none');
    // A type with no per-incident read, photographed or not.
    for (const eventType of ['cough', 'itch', 'meal', 'check_in', null, undefined]) {
      expect(readStateOf(base({ eventType }))).toBe('none');
    }
  });

  it('both stool types expect a read, like vomit (the shared `hasPerIncidentRead`)', () => {
    expect(readStateOf(base({ eventType: 'stool_normal' }))).toBe('unread');
    expect(readStateOf(base({ eventType: 'diarrhea' }))).toBe('unread');
  });
});

describe('precedence: the edges the header names', () => {
  it('the rose outranks a read in flight: it never waits, and never yields to the tick', () => {
    expect(readStateOf(base({ copy: copy('completed', 'worth_a_call'), inFlight: true }))).toBe('worth_a_call');
  });

  it('the rose outranks the owner turning photo reading off', () => {
    expect(readStateOf(base({ copy: copy('completed', 'worth_a_call'), readingOff: true }))).toBe('worth_a_call');
  });

  it('the rose stands with no photo on the device and on a type that expects no read', () => {
    // A photoless stool's contextual escalation, and a vomit re-typed after its read.
    expect(readStateOf(base({ eventType: 'stool_normal', hasPhoto: false, copy: copy('completed', 'worth_a_call') }))).toBe(
      'worth_a_call',
    );
    expect(readStateOf(base({ eventType: 'cough', copy: copy('completed', 'worth_a_call') }))).toBe('worth_a_call');
  });

  it('a read in flight outranks a calm verdict, which may describe a replaced photo', () => {
    expect(readStateOf(base({ copy: copy('completed', 'monitor'), inFlight: true }))).toBe('pending');
    expect(readStateOf(base({ copy: copy('pending', 'monitor') }))).toBe('pending');
  });

  it('a standing calm read is the record whether or not this device holds the photo', () => {
    expect(readStateOf(base({ eventType: 'stool_normal', hasPhoto: false, copy: copy('completed', 'monitor') }))).toBe('calm');
  });

  it('an unclear read on a row with no photo here is nothing, never "Photo not read" under no photo', () => {
    // A photoless stool's contextual read collapses to not_enough_to_say too.
    expect(readVerdictOf(base({ eventType: 'stool_normal', hasPhoto: false, copy: copy('uncertain', 'not_enough_to_say') }))).toEqual({
      state: 'none',
      verdict: 'not_enough_to_say',
    });
  });

  it('an unclear read with photo reading off is off, never marked (H-4b)', () => {
    expect(readStateOf(base({ copy: copy('uncertain', 'not_enough_to_say'), readingOff: true }))).toBe('off');
  });

  it('a standing calm read outranks the owner turning photo reading off', () => {
    expect(readStateOf(base({ copy: copy('completed', 'monitor'), readingOff: true }))).toBe('calm');
  });

  it('no read expected outranks reading off: an unphotographed row is never "off"', () => {
    expect(readStateOf(base({ hasPhoto: false, readingOff: true }))).toBe('none');
  });

  it('a calm verdict on a read that did not finish is unread, never calm (CUL-812)', () => {
    for (const status of ['failed', 'capped', 'read_disabled', 'a_status_from_the_future']) {
      expect(readStateOf(base({ copy: copy(status, 'monitor') }))).toBe('unread');
      expect(readStateOf(base({ copy: copy(status, 'not_enough_to_say') }))).toBe('unread');
    }
  });

  it('a finished read with no verdict is unread, never calm', () => {
    expect(readStateOf(base({ copy: copy('completed', null) }))).toBe('unread');
  });
});

describe('Hide is not an input (H-4a)', () => {
  it('a copy that somehow carries a dismissal still says worth a call', () => {
    // The type has no field for it, so the cast is the only way to hand one in. The
    // runtime must not care either way.
    const hidden = { ...copy('completed', 'worth_a_call'), dismissed_at: '2026-09-17T20:00:00Z' } as unknown as ReadCopy;
    expect(readStateOf(base({ copy: hidden }))).toBe('worth_a_call');
    expect(isWorthACall(hidden)).toBe(true);
  });
});

describe('the cross product: one predicate, never two answers', () => {
  const STATUSES = ['completed', 'uncertain', 'failed', 'capped', 'read_disabled', 'pending', 'a_status_from_the_future'];
  const VERDICTS: (string | null)[] = [null, 'worth_a_call', 'monitor', 'not_enough_to_say', 'looks_fine_to_me', ''];
  const TYPES: (string | null)[] = ['vomit', 'stool_normal', 'diarrhea', 'cough', 'meal', null];
  const copies: (ReadCopy | undefined)[] = [undefined];
  for (const s of STATUSES) for (const v of VERDICTS) copies.push(copy(s, v));

  const inputs: ReadStateInput[] = [];
  for (const c of copies)
    for (const eventType of TYPES)
      for (const hasPhoto of [true, false])
        for (const inFlight of [true, false])
          for (const readingOff of [true, false]) inputs.push({ eventType, hasPhoto, copy: c, inFlight, readingOff });

  it('builds a non-trivial set of inputs, and every state is reached', () => {
    expect(inputs.length).toBe(copies.length * TYPES.length * 8);
    const reached = new Set<ReadState>(inputs.map(readStateOf));
    expect([...reached].sort()).toEqual(['calm', 'none', 'off', 'pending', 'unread', 'worth_a_call']);
  });

  it('the month’s rose and the full state never disagree', () => {
    const disagree = inputs.filter((i) => isWorthACall(i.copy) !== (readStateOf(i) === 'worth_a_call'));
    expect(disagree).toEqual([]);
  });

  it('a verdict is named exactly for the rose, calm, and a finished read that could not say', () => {
    for (const i of inputs) {
      const { state, verdict } = readVerdictOf(i);
      expect(state).toBe(readStateOf(i));
      if (state === 'worth_a_call') expect(verdict).toBe('worth_a_call');
      else if (state === 'calm') expect(verdict).toBe('monitor');
      else if (state === 'pending') expect(verdict).toBeNull();
      else {
        const finishedUnclear =
          i.copy?.recommendation === 'not_enough_to_say' && ['completed', 'uncertain'].includes(i.copy.status);
        expect(verdict).toBe(finishedUnclear ? 'not_enough_to_say' : null);
      }
    }
  });

  it('an unclear read is never calm, whatever else is true (the 2026-09-25 ruling)', () => {
    const calmOverUnclear = inputs.filter((i) => i.copy?.recommendation === 'not_enough_to_say' && readStateOf(i) === 'calm');
    expect(calmOverUnclear).toEqual([]);
  });

  it('a photographed row expecting a read, reading on, with an unclear finished read, is always the grey mark', () => {
    const shouldBeGrey = inputs.filter(
      (i) =>
        i.hasPhoto &&
        !i.inFlight &&
        !i.readingOff &&
        ['vomit', 'stool_normal', 'diarrhea'].includes(i.eventType ?? '') &&
        i.copy?.recommendation === 'not_enough_to_say' &&
        ['completed', 'uncertain'].includes(i.copy.status),
    );
    expect(shouldBeGrey.length).toBeGreaterThan(0);
    for (const i of shouldBeGrey) expect(readStateOf(i)).toBe('unread');
  });

  it('an escalation or an unknown verdict never renders calm, whatever else is true (AC 22)', () => {
    const calmOverAFlag = inputs.filter(
      (i) =>
        i.copy?.recommendation != null &&
        !['monitor', 'not_enough_to_say'].includes(i.copy.recommendation) &&
        readStateOf(i) !== 'worth_a_call',
    );
    expect(calmOverAFlag).toEqual([]);
  });

  it('calm only ever comes from a finished read', () => {
    const calmUnfinished = inputs.filter(
      (i) => readStateOf(i) === 'calm' && !['completed', 'uncertain'].includes(i.copy?.status ?? ''),
    );
    expect(calmUnfinished).toEqual([]);
  });

  it('nothing but a read in flight or a pending row is ever pending', () => {
    const stray = inputs.filter((i) => readStateOf(i) === 'pending' && !i.inFlight && i.copy?.status !== 'pending');
    expect(stray).toEqual([]);
  });
});
