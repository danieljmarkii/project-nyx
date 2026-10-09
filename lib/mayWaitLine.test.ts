// CUL-1629: call today's wait line. Both halves pinned (a TRUE at 10 PM gets the wait line;
// every non-TRUE value gets the louder one at every hour), each gate driven red on its own over
// a fixture that otherwise passes, and the mirrored rules held equal to the server's (C-34).
//
// Local-day fixtures are built from LOCAL components (C-29): the bands and the 6 AM end are the
// device's clock, so a UTC literal would land in a different band under the non-UTC CI job.
import {
  callTodayActionOf,
  clockBandOf,
  intakeFlagAt,
  leaveDecidedAt,
  leaveEndsAt,
  MAY_WAIT_DST_AFTER_HOURS,
  MAY_WAIT_INTAKE_BASELINE_HOURS,
  MAY_WAIT_INTAKE_HOURS,
  MAY_WAIT_LETHARGY_HOURS,
  MAY_WAIT_REACH_HOURS,
  mayWaitRefusalOf,
  offsetChangeBetween,
  photoSetListKey,
  tracksIntakeAt,
  type MayWaitFacts,
  type MayWaitInput,
  type MayWaitRow,
} from './mayWaitLine';
import { TIER_WORDS } from './incidentTierWords';
import * as server from '../supabase/functions/_shared/incidentMayWait';

const LOUDER = TIER_WORDS.call_today.action;
const HOUR = 3_600_000;
const local = (d: number, h: number, m = 0) => new Date(2026, 6, d, h, m).getTime();
const iso = (ms: number) => new Date(ms).toISOString();

const PHOTO = '6f1c0d2e-1111-4a5b-9c3d-000000000001';
const PHOTO_2 = '6f1c0d2e-1111-4a5b-9c3d-000000000002';

// A dog's second vomit in a day, read at 9:30 PM, with a photo the read read.
const ANCHOR = local(15, 21);
function row(over: Partial<MayWaitRow> = {}): MayWaitRow {
  return {
    status: 'completed',
    tier: 'call_today',
    engine_flags: ['engines_v3_en3', 'engines_v3_en4'],
    may_wait: true,
    edited_at: null,
    error: null,
    updated_at: iso(local(15, 21, 30)),
    photo_set_key: PHOTO,
    ai_raw_payload: { appears_to_show_vomit: true, recommendation: 'monitor', read_photo_set_key: PHOTO },
    ...over,
  };
}
// `readAt` NaN means "read just now": `input` stamps it with the test's clock.
function facts(over: Partial<MayWaitFacts> = {}): MayWaitFacts {
  return {
    readAt: Number.NaN,
    anchorAt: iso(ANCHOR),
    serverAttachmentIds: [PHOTO],
    localAttachmentIds: [PHOTO],
    unsynced: false,
    vomits: [
      { at: iso(local(15, 15)), confidence: 'witnessed' },
      { at: iso(ANCHOR), confidence: 'witnessed' },
    ],
    stoolAt: [],
    lethargyAt: [],
    meals: [],
    ...over,
  };
}
function input(over: Partial<MayWaitInput> = {}): MayWaitInput {
  // The server re-read agrees with the row on screen unless a test says otherwise.
  const shown = over.row === undefined ? row() : over.row;
  const base: MayWaitInput = {
    freshReadAt: null,
    row: shown,
    freshRow: shown,
    facts: facts(),
    kind: 'vomit',
    petName: 'Nyx',
    species: 'dog',
    birthDate: '2020-01-01',
    nowMs: local(15, 22),
    offsetAt: () => 0,
    lastLoggedAt: null,
    ...over,
  };
  // Every answer was read just now, unless a test says when.
  const nowMs = base.nowMs;
  return {
    ...base,
    facts: base.facts && Number.isNaN(base.facts.readAt) ? { ...base.facts, readAt: nowMs } : base.facts,
    freshReadAt: over.freshReadAt === undefined ? nowMs : over.freshReadAt,
  };
}

describe('both halves (the issue\'s pinned test)', () => {
  it('a TRUE at 10 PM gets the wait line, naming the call-now signs', () => {
    const line = callTodayActionOf(input());
    expect(mayWaitRefusalOf(input())).toBeNull();
    expect(line).toBe('Call your vet first thing tomorrow, or an emergency clinic tonight if Nyx vomits again or is low on energy.');
    expect(line).not.toBe(LOUDER);
  });

  const NOT_TRUE: unknown[] = [false, null, undefined, 'true', 1, {}];
  const HOURS = [0, 3, 6, 9, 12, 15, 18, 22, 23];
  it.each(NOT_TRUE)('may_wait = %p keeps the louder line at every hour', (value) => {
    for (const h of HOURS) {
      const nowMs = h < 21 ? local(16, h) : local(15, h);
      expect(callTodayActionOf(input({ row: row({ may_wait: value }), nowMs }))).toBe(LOUDER);
    }
  });

  it('an absent column (an old row) keeps the louder line', () => {
    const old = row();
    delete old.may_wait;
    expect(callTodayActionOf(input({ row: old }))).toBe(LOUDER);
  });

  it('an earlier-rule row (no EN-3 stamp) keeps the louder line, even with a TRUE', () => {
    expect(callTodayActionOf(input({ row: row({ engine_flags: ['engines_v3_en4'] }) }))).toBe(LOUDER);
    expect(callTodayActionOf(input({ row: row({ engine_flags: null }) }))).toBe(LOUDER);
  });
});

describe('the clock (D1: 6 AM / 6 PM / midnight)', () => {
  it('names the band in the device\'s own hours', () => {
    expect(clockBandOf(local(16, 5, 59))).toBe('small_hours');
    expect(clockBandOf(local(16, 6))).toBe('day');
    expect(clockBandOf(local(16, 17, 59))).toBe('day');
    expect(clockBandOf(local(16, 18))).toBe('evening');
    expect(clockBandOf(local(16, 0))).toBe('small_hours');
  });

  it('day: today, first thing tomorrow if closed', () => {
    const decided = local(15, 14);
    const line = callTodayActionOf(input({ row: row({ updated_at: iso(decided) }), facts: facts({ anchorAt: iso(local(15, 13)), vomits: [{ at: iso(local(15, 8)), confidence: 'witnessed' }, { at: iso(local(15, 13)), confidence: 'witnessed' }] }), nowMs: local(15, 14, 30) }));
    expect(line).toBe("Call your vet today. If they're closed, first thing tomorrow, or an emergency clinic tonight if Nyx vomits again or is low on energy.");
  });

  it('small hours: first thing this morning, an emergency clinic now if', () => {
    const line = callTodayActionOf(input({ nowMs: local(16, 2) }));
    expect(line).toBe('Call your vet first thing this morning, or an emergency clinic now if Nyx vomits again or is low on energy.');
  });

  it('the leave ends at the first 6 AM after the decision', () => {
    expect(leaveEndsAt(local(15, 21, 30))).toBe(local(16, 6));
    expect(leaveEndsAt(local(15, 10))).toBe(local(16, 6));
    expect(leaveEndsAt(local(16, 3))).toBe(local(16, 6));
    expect(leaveEndsAt(local(16, 6))).toBe(local(17, 6));
    expect(mayWaitRefusalOf(input({ nowMs: local(16, 5, 59) }))).toBeNull();
    expect(mayWaitRefusalOf(input({ nowMs: local(16, 6) }))).toBe('expired');
    // The morning after, the line would offer a second night nobody decided.
    expect(callTodayActionOf(input({ nowMs: local(16, 9) }))).toBe(LOUDER);
  });

  it('a Hide then Show the next morning moves updated_at, and still opens no second night (finding 1)', () => {
    const shown = row({ updated_at: iso(local(16, 7, 31)) });
    expect(mayWaitRefusalOf(input({ row: shown, nowMs: local(16, 12) }))).toBe('expired');
    expect(mayWaitRefusalOf(input({ row: shown, nowMs: local(16, 20) }))).toBe('expired');
  });

  it('the night is bounded by the incident too: a vomit back-dated past a morning never waits', () => {
    const decided = row({ updated_at: iso(local(15, 21, 30)) });
    const old = facts({ anchorAt: iso(local(14, 20)), vomits: [{ at: iso(local(14, 10)), confidence: 'witnessed' }, { at: iso(local(14, 20)), confidence: 'witnessed' }] });
    expect(mayWaitRefusalOf(input({ row: decided, facts: old }))).toBe('expired');
  });
});

describe('the night runs from the server\'s decision stamp (094, PR-27l, CUL-1707)', () => {
  // A vomit from last night, read late tonight: the read decided the leave at 9:30 PM on the 15th.
  const lastNight = facts({ anchorAt: iso(local(14, 20)), vomits: [{ at: iso(local(14, 10)), confidence: 'witnessed' }, { at: iso(local(14, 20)), confidence: 'witnessed' }] });
  const stamped = (over: Partial<MayWaitRow> = {}) => row({ may_wait_decided_at: iso(local(15, 21, 30)), ...over });

  it('a late read of an older vomit runs to the morning after the decision, not the incident', () => {
    expect(mayWaitRefusalOf(input({ row: stamped(), facts: lastNight, nowMs: local(16, 5, 59) }))).toBeNull();
    expect(mayWaitRefusalOf(input({ row: stamped(), facts: lastNight, nowMs: local(16, 6) }))).toBe('expired');
    // The same row with no stamp keeps PR-27f's bound: the incident's night, already gone.
    expect(mayWaitRefusalOf(input({ row: row(), facts: lastNight, nowMs: local(15, 22) }))).toBe('expired');
  });

  it('a Hide then Show the next morning moves updated_at and not the stamp: no second night', () => {
    const shown = stamped({ updated_at: iso(local(16, 7, 31)) });
    expect(mayWaitRefusalOf(input({ row: shown, facts: lastNight, nowMs: local(16, 12) }))).toBe('expired');
    expect(mayWaitRefusalOf(input({ row: shown, facts: lastNight, nowMs: local(16, 20) }))).toBe('expired');
  });

  it('a stamp later than updated_at is read as updated_at: a skewed clock never lengthens the night', () => {
    const skewed = stamped({ may_wait_decided_at: iso(local(16, 7)), updated_at: iso(local(15, 21, 30)) });
    expect(leaveDecidedAt(skewed, local(15, 21))).toBe(local(15, 21, 30));
    expect(mayWaitRefusalOf(input({ row: skewed, nowMs: local(16, 6) }))).toBe('expired');
  });

  it('no stamp keeps the earlier of updated_at and the incident; an unreadable stamp refuses', () => {
    expect(leaveDecidedAt(row({ updated_at: iso(local(15, 21, 30)) }), local(14, 20))).toBe(local(14, 20));
    expect(leaveDecidedAt(row({ may_wait_decided_at: null, updated_at: iso(local(15, 21, 30)) }), local(14, 20))).toBe(local(14, 20));
    expect(leaveDecidedAt(stamped(), local(14, 20))).toBe(local(15, 21, 30));
    expect(mayWaitRefusalOf(input({ row: stamped({ may_wait_decided_at: 'not a time' }) }))).toBe('facts');
    expect(mayWaitRefusalOf(input({ row: stamped({ may_wait_decided_at: 1_760_000_000_000 }) }))).toBe('facts');
    expect(mayWaitRefusalOf(input({ row: stamped({ updated_at: null }) }))).toBe('facts');
  });
});

describe('each gate refuses on its own', () => {
  it.each<[string, Partial<MayWaitRow>]>([
    ['a call now', { tier: 'call_now' }],
    ['a quiet tier', { tier: 'logged' }],
    ['a capped row', { status: 'capped' }],
    ['an uncertain row', { status: 'uncertain' }],
    ['a pending re-read', { status: 'pending' }],
    ['an owner edit', { edited_at: iso(local(15, 21, 40)) }],
    ['an error', { error: 'timeout' }],
  ])('row: %s', (_label, over) => {
    expect(mayWaitRefusalOf(input({ row: row(over) }))).toBe('row');
    expect(callTodayActionOf(input({ row: row(over) }))).toBe(LOUDER);
  });

  it('facts: an unanswered read, an unknown species, an unparseable decision', () => {
    expect(mayWaitRefusalOf(input({ facts: null }))).toBe('facts');
    expect(mayWaitRefusalOf(input({ species: null }))).toBe('facts');
    expect(mayWaitRefusalOf(input({ row: row({ updated_at: null }) }))).toBe('facts');
  });

  describe('photos (PR-27j)', () => {
    it('a photo the server holds that the read never read (the in-flight race)', () => {
      expect(mayWaitRefusalOf(input({ facts: facts({ serverAttachmentIds: [PHOTO, PHOTO_2], localAttachmentIds: [PHOTO, PHOTO_2] }) }))).toBe('photos');
    });
    it('a photo on the phone the server has not got', () => {
      expect(mayWaitRefusalOf(input({ facts: facts({ localAttachmentIds: [PHOTO, PHOTO_2] }) }))).toBe('photos');
    });
    it('a photo removed since the read', () => {
      expect(mayWaitRefusalOf(input({ facts: facts({ serverAttachmentIds: [], localAttachmentIds: [] }) }))).toBe('photos');
    });
    it('a payload with no key (a read from before PR-27e)', () => {
      expect(mayWaitRefusalOf(input({ row: row({ ai_raw_payload: { appears_to_show_vomit: true } }) }))).toBe('photos');
    });
    it('a payload whose key is null (a partial read) over a photo', () => {
      expect(mayWaitRefusalOf(input({ row: row({ ai_raw_payload: { read_photo_set_key: null } }) }))).toBe('photos');
    });
    it('no payload over a photo', () => {
      expect(mayWaitRefusalOf(input({ row: row({ ai_raw_payload: null }) }))).toBe('photos');
    });
    it('a set the server would hash, which the phone cannot compare', () => {
      const odd = 'NOT_AN_ID';
      expect(mayWaitRefusalOf(input({ facts: facts({ serverAttachmentIds: [odd], localAttachmentIds: [odd] }), row: row({ ai_raw_payload: { read_photo_set_key: odd } }) }))).toBe('photos');
    });
    it('D3 = a: a photoless record-alone read stands only over no photo and no stamp', () => {
      const photoless = { serverAttachmentIds: [], localAttachmentIds: [] };
      expect(mayWaitRefusalOf(input({ row: row({ ai_raw_payload: null, photo_set_key: null }), facts: facts(photoless) }))).toBeNull();
      expect(mayWaitRefusalOf(input({ row: row({ ai_raw_payload: null, photo_set_key: PHOTO }), facts: facts(photoless) }))).toBe('photos');
    });
    it('case and order do not matter, as on the server', () => {
      expect(mayWaitRefusalOf(input({
        row: row({ ai_raw_payload: { read_photo_set_key: [PHOTO, PHOTO_2].sort().join(',') } }),
        facts: facts({ serverAttachmentIds: [PHOTO_2.toUpperCase(), PHOTO], localAttachmentIds: [PHOTO, PHOTO_2] }),
      }))).toBeNull();
    });
  });

  it('unsynced: a row the server has not seen', () => {
    expect(mayWaitRefusalOf(input({ facts: facts({ unsynced: true }) }))).toBe('unsynced');
  });

  it('floor: a third vomit inside half an hour on the phone (T1), unsynced or not', () => {
    const vomits = [
      { at: iso(local(15, 15)), confidence: 'witnessed' },
      { at: iso(local(15, 20, 40)), confidence: 'witnessed' },
      { at: iso(local(15, 20, 50)), confidence: 'witnessed' },
      { at: iso(ANCHOR), confidence: 'witnessed' },
    ];
    expect(mayWaitRefusalOf(input({ facts: facts({ vomits }) }))).toBe('floor');
  });

  it('lethargy: within a day of a vomit the floor hears it (T3); around a stool run, this gate does', () => {
    expect(mayWaitRefusalOf(input({ facts: facts({ lethargyAt: [iso(local(15, 21, 50))] }) }))).toBe('floor');
    // A stool read tonight, no vomit anywhere: the floor reads nothing, the lethargy gate does.
    const stool = (lethargyAt: string[]) =>
      input({ kind: 'stool', facts: facts({ vomits: [], stoolAt: [iso(local(15, 12)), iso(ANCHOR)], lethargyAt }) });
    expect(mayWaitRefusalOf(stool([]))).toBeNull();
    expect(mayWaitRefusalOf(stool([iso(local(15, 21, 50))]))).toBe('lethargy'); // logged since
    expect(mayWaitRefusalOf(stool([iso(local(14, 13))]))).toBe('lethargy'); // a day before the run
    expect(mayWaitRefusalOf(stool([iso(local(8, 12))]))).toBeNull(); // a week before
  });

  describe('intake (a cat)', () => {
    const cat = (meals: MayWaitFacts['meals'], over: Partial<MayWaitInput> = {}) =>
      input({ species: 'cat', facts: facts({ meals }), ...over });
    it('a cat whose meals are not rated has no intake record: no wait', () => {
      expect(mayWaitRefusalOf(cat([]))).toBe('intake');
    });
    it('a cat that ate today waits', () => {
      expect(mayWaitRefusalOf(cat([{ at: iso(local(15, 18)), rating: 'all' }]))).toBeNull();
    });
    it('TIME ALONE: the same record refuses once a day passes with no Most or All meal', () => {
      // The last full meal was 2 AM yesterday; read at 1 AM, decided 1:30 AM.
      const meals = [{ at: iso(local(15, 2)), rating: 'all' }];
      const at = (nowMs: number) => cat(meals, {
        nowMs,
        row: row({ updated_at: iso(local(16, 1, 30)) }),
        facts: facts({ meals, anchorAt: iso(local(16, 1)), vomits: [{ at: iso(local(15, 15)), confidence: 'witnessed' }, { at: iso(local(16, 1)), confidence: 'witnessed' }] }),
      });
      expect(mayWaitRefusalOf(at(local(16, 1, 45)))).toBeNull();
      expect(mayWaitRefusalOf(at(local(16, 2, 5)))).toBe('intake');
    });
  });

  it('dst: an offset change in the device\'s own clock around the read refuses; an unreadable one too', () => {
    const shift = local(16, 4);
    expect(mayWaitRefusalOf(input({ offsetAt: (t) => (t < shift ? -60 : 0) }))).toBe('dst');
    expect(mayWaitRefusalOf(input({ offsetAt: () => Number.NaN }))).toBe('dst');
    // A change more than 48 hours past the read is outside the night's reach.
    const far = local(15, 22) + 49 * HOUR;
    expect(mayWaitRefusalOf(input({ offsetAt: (t) => (t < far ? -60 : 0) }))).toBeNull();
  });

  it('fresh: the line stands only while the server\'s copy agrees with the one on screen (finding 2)', () => {
    expect(mayWaitRefusalOf(input({ freshRow: null }))).toBe('fresh');
    // A neighbour's finding took the leave back on the server after this record opened.
    expect(mayWaitRefusalOf(input({ freshRow: row({ may_wait: null, updated_at: iso(local(15, 21, 55)) }) }))).toBe('fresh');
    expect(mayWaitRefusalOf(input({ freshRow: row({ may_wait: true, updated_at: iso(local(15, 21, 55)) }) }))).toBe('fresh');
    expect(callTodayActionOf(input({ freshRow: row({ may_wait: null }) }))).toBe(LOUDER);
  });
});

describe('stale: an answer is as old as the read that started it (second pass, F1)', () => {
  const NOW = local(15, 22);
  it('facts or a fresh row read more than two minutes ago refuse', () => {
    expect(mayWaitRefusalOf(input({ nowMs: NOW, facts: facts({ readAt: NOW - 2 * 60_000 }) }))).toBeNull();
    expect(mayWaitRefusalOf(input({ nowMs: NOW, facts: facts({ readAt: NOW - 2 * 60_000 - 1 }) }))).toBe('stale');
    expect(mayWaitRefusalOf(input({ nowMs: NOW, freshReadAt: NOW - 3 * 60_000 }))).toBe('stale');
    expect(mayWaitRefusalOf(input({ nowMs: NOW, freshReadAt: null }))).toBe('stale');
  });
  it('an answer read before the newest log on this phone cannot have seen it', () => {
    const logged = NOW - 10_000;
    expect(mayWaitRefusalOf(input({ nowMs: NOW, lastLoggedAt: logged, facts: facts({ readAt: logged - 1 }) }))).toBe('stale');
    expect(mayWaitRefusalOf(input({ nowMs: NOW, lastLoggedAt: logged, freshReadAt: logged - 1 }))).toBe('stale');
    expect(mayWaitRefusalOf(input({ nowMs: NOW, lastLoggedAt: logged, facts: facts({ readAt: logged }), freshReadAt: logged + 1 }))).toBe('stale'); // same ms: unproven
    expect(mayWaitRefusalOf(input({ nowMs: NOW, lastLoggedAt: logged, facts: facts({ readAt: logged + 1 }), freshReadAt: logged + 1 }))).toBeNull();
  });
  it('a log stamped in the future (a clock corrected back) keeps the louder line: only louder', () => {
    expect(mayWaitRefusalOf(input({ nowMs: NOW, lastLoggedAt: NOW + 3_600_000, facts: facts({ readAt: NOW }), freshReadAt: NOW }))).toBe('stale');
  });

  it('a read stamped in the future (a clock moved back) refuses', () => {
    expect(mayWaitRefusalOf(input({ nowMs: NOW, facts: facts({ readAt: NOW + 60_000 }) }))).toBe('stale');
  });
});

describe('D2 = a: a stool names its own signs', () => {
  it('the stool line names lethargy and vomiting', () => {
    const line = callTodayActionOf(input({
      kind: 'stool',
      row: row({ ai_raw_payload: { appears_to_show_stool: true, read_photo_set_key: PHOTO } }),
      facts: facts({ vomits: [], stoolAt: [iso(local(15, 15))] }),
    }));
    expect(line).toBe('Call your vet first thing tomorrow, or an emergency clinic tonight if Nyx is low on energy or vomits.');
  });
  it('an unnamed pet reads as "your pet"', () => {
    const line = callTodayActionOf(input({ kind: 'stool', petName: '  ', facts: facts({ vomits: [] }) }));
    expect(line).toContain('if your pet is low on energy or vomits.');
  });
});

describe('the copy (nyx-voice)', () => {
  it('the exception is count-free and deadline-free, so it is never later than the floor (finding 3)', () => {
    // Two onsets 40 minutes apart: one more vomit is already T2's third. "Again" says so.
    const two = facts({ vomits: [{ at: iso(local(15, 20, 20)), confidence: 'witnessed' }, { at: iso(ANCHOR), confidence: 'witnessed' }] });
    const line = callTodayActionOf(input({ facts: two }));
    expect(line).toContain('if Nyx vomits again or is low on energy.');
    expect(line).not.toMatch(/twice|by \d/);
  });

  it('no exclamation marks, never a calmer word than a call', () => {
    for (const nowMs of [local(15, 22), local(16, 2)]) {
      const line = callTodayActionOf(input({ nowMs }));
      expect(line).not.toMatch(/!/);
      expect(line).toMatch(/emergency clinic/);
    }
  });
});

describe('the mirrors equal the server (C-34)', () => {
  it('the constants', () => {
    expect(MAY_WAIT_REACH_HOURS).toBe(server.MAY_WAIT_NEIGHBOUR_HOURS);
    expect(MAY_WAIT_LETHARGY_HOURS).toBe(server.MAY_WAIT_LETHARGY_HOURS);
    expect(MAY_WAIT_INTAKE_HOURS).toBe(server.MAY_WAIT_INTAKE_HOURS);
    expect(MAY_WAIT_INTAKE_BASELINE_HOURS).toBe(server.MAY_WAIT_INTAKE_BASELINE_HOURS);
    expect(MAY_WAIT_DST_AFTER_HOURS).toBe(server.MAY_WAIT_DST_AFTER_HOURS);
  });

  it('intakeFlagAt and tracksIntakeAt over a grid of meals and instants', () => {
    const base = Date.UTC(2026, 6, 15, 12);
    const ratings = [null, 'refused', 'some', 'most', 'all'];
    const offsets = [-200, -170, -160, -30, -25, -24, -23, -1, 0, 1];
    for (const r1 of ratings) for (const o1 of offsets) for (const r2 of ratings) {
      const meals = [{ at: iso(base + o1 * HOUR), rating: r1 }, { at: iso(base - 100 * HOUR), rating: r2 }];
      expect(intakeFlagAt(meals, base)).toBe(server.intakeFlagAt(meals, base));
      expect(tracksIntakeAt(meals, base)).toBe(server.tracksIntakeAt(meals, base));
    }
  });

  it('offsetChangeBetween answers as the server\'s dstChangeBetween over the same offsets', () => {
    const zones = ['UTC', 'America/New_York', 'Europe/London', 'Pacific/Chatham', 'Pacific/Kiritimati', 'Australia/Lord_Howe'];
    const starts = [Date.UTC(2026, 6, 15), Date.UTC(2026, 9, 30), Date.UTC(2026, 2, 7), Date.UTC(2026, 8, 25), Date.UTC(2026, 3, 3)];
    for (const z of zones) for (const st of starts) {
      const offsetAt = (t: number) => server.utcOffsetMinutes(z, t) ?? Number.NaN;
      expect(offsetChangeBetween(offsetAt, st, st + 5 * 24 * HOUR)).toBe(server.dstChangeBetween(z, st, st + 5 * 24 * HOUR));
    }
  });

  // engineStamps.ts imports esm.sh, which the app's tsc cannot resolve, so its list form is
  // pinned here by value: lowercased, sorted, comma-joined, null for none (075's key).
  it('the photo-set list form is the server\'s photoSetKey list form', () => {
    expect(photoSetListKey([])).toBeNull();
    expect(photoSetListKey([PHOTO])).toBe(PHOTO);
    expect(photoSetListKey([PHOTO_2, PHOTO.toUpperCase()])).toBe(`${PHOTO},${PHOTO_2}`);
    // Where the server hashes, the phone answers undefined (cannot compare): never a match.
    expect(photoSetListKey(['NOT_AN_ID'])).toBeUndefined();
    expect(photoSetListKey(Array.from({ length: 120 }, (_, i) => `${PHOTO.slice(0, -3)}${String(i).padStart(3, '0')}`))).toBeUndefined();
  });
});
