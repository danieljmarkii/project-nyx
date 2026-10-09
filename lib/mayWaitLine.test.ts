// CUL-1629: call today's wait line. Both halves pinned (a TRUE at 10 PM gets the wait line;
// every non-TRUE value gets the louder one at every hour), each gate driven red on its own over
// a fixture that otherwise passes, and the mirrored rules held equal to the server's (C-34).
//
// Local-day fixtures are built from LOCAL components (C-29): the bands and the 6 AM end are the
// device's clock, so a UTC literal would land in a different band under the non-UTC CI job.
import {
  callTodayActionOf,
  clockBandOf,
  dstChangeBetween,
  intakeFlagAt,
  leaveEndsAt,
  MAY_WAIT_DST_AFTER_HOURS,
  MAY_WAIT_INTAKE_BASELINE_HOURS,
  MAY_WAIT_INTAKE_HOURS,
  MAY_WAIT_LETHARGY_HOURS,
  MAY_WAIT_REACH_HOURS,
  mayWaitRefusalOf,
  photoSetListKey,
  tracksIntakeAt,
  utcOffsetMinutes,
  type MayWaitFacts,
  type MayWaitInput,
  type MayWaitRow,
} from './mayWaitLine';
import { TIER_WORDS } from './incidentTierWords';
import * as server from '../supabase/functions/_shared/incidentMayWait';
import { photoSetKey as serverPhotoSetKey } from '../supabase/functions/_shared/engineStamps';

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
    recommendation: 'monitor',
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
function facts(over: Partial<MayWaitFacts> = {}): MayWaitFacts {
  return {
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
  return {
    row: row(),
    facts: facts(),
    kind: 'vomit',
    petName: 'Nyx',
    species: 'dog',
    birthDate: '2020-01-01',
    nowMs: local(15, 22),
    timeZone: 'UTC',
    ...over,
  };
}

describe('both halves (the issue\'s pinned test)', () => {
  it('a TRUE at 10 PM gets the wait line, naming the call-now signs', () => {
    const line = callTodayActionOf(input());
    expect(mayWaitRefusalOf(input())).toBeNull();
    expect(line).toMatch(/^Call your vet first thing tomorrow, or an emergency clinic tonight if /);
    expect(line).toContain('Nyx is low on energy by 9 PM tomorrow');
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
    expect(line).toMatch(/^Call your vet today\. If they're closed, first thing tomorrow, or an emergency clinic tonight if /);
  });

  it('small hours: first thing this morning, an emergency clinic now if', () => {
    const line = callTodayActionOf(input({ nowMs: local(16, 2) }));
    expect(line).toMatch(/^Call your vet first thing this morning, or an emergency clinic now if /);
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

  it('lethargy: within a day of a vomit the floor hears it (T3); past that, up to now, this gate does', () => {
    expect(mayWaitRefusalOf(input({ facts: facts({ lethargyAt: [iso(local(15, 21, 50))] }) }))).toBe('floor');
    // A stool logged two days back, read tonight: lethargy logged now is past every vomit
    // window the floor reads, and still takes the wait away (the server's "anything since").
    const stool = (lethargyAt: string[]) =>
      input({ kind: 'stool', facts: facts({ anchorAt: iso(local(13, 20)), vomits: [], stoolAt: [iso(local(13, 20))], lethargyAt }) });
    expect(mayWaitRefusalOf(stool([]))).toBeNull();
    expect(mayWaitRefusalOf(stool([iso(local(15, 21, 50))]))).toBe('lethargy');
    expect(mayWaitRefusalOf(stool([iso(local(12, 21))]))).toBe('lethargy'); // a day before the run
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
      const early = cat(meals, {
        row: row({ updated_at: iso(local(16, 1, 30)) }),
        facts: facts({ meals, anchorAt: iso(local(16, 1)), vomits: [{ at: iso(local(15, 15)), confidence: 'witnessed' }, { at: iso(local(16, 1)), confidence: 'witnessed' }] }),
      });
      expect(mayWaitRefusalOf({ ...early, nowMs: local(16, 1, 45) })).toBeNull();
      expect(mayWaitRefusalOf({ ...early, nowMs: local(16, 2, 5) })).toBe('intake');
    });
  });

  it('dst: an offset change in the device zone around the read; an unknown zone', () => {
    const nov = (d: number, h: number) => Date.UTC(2026, 10, d, h);
    const zone = 'America/New_York'; // falls back Nov 1 2026
    expect(dstChangeBetween(zone, nov(2, 0) - 72 * HOUR, nov(2, 0) + 48 * HOUR)).toBe(true);
    expect(mayWaitRefusalOf(input({ timeZone: 'Not/AZone' }))).toBe('dst');
    expect(mayWaitRefusalOf(input({ timeZone: null }))).toBe('dst');
    expect(mayWaitRefusalOf(input({ timeZone: 'Europe/London' }))).toBeNull(); // July: no change
  });

  it('signs: a found pile a day old has no call-now sign left to name, so no wait', () => {
    const anchor = local(14, 20);
    const vomits = [{ at: iso(anchor), confidence: 'window' }, { at: iso(local(14, 10)), confidence: 'witnessed' }];
    expect(mayWaitRefusalOf(input({ facts: facts({ anchorAt: iso(anchor), vomits }) }))).toBe('signs');
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
  it('no exclamation marks, never "missed", never a calmer word than a call', () => {
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

  it('utcOffsetMinutes and dstChangeBetween over zones and spans', () => {
    const zones = ['UTC', 'America/New_York', 'Europe/London', 'Pacific/Chatham', 'Pacific/Kiritimati', 'Australia/Lord_Howe', 'Nope/Zone'];
    const starts = [Date.UTC(2026, 6, 15), Date.UTC(2026, 9, 30), Date.UTC(2026, 2, 7), Date.UTC(2026, 8, 25), Date.UTC(2026, 3, 3)];
    for (const z of zones) for (const s of starts) {
      expect(utcOffsetMinutes(z, s)).toBe(server.utcOffsetMinutes(z, s));
      expect(dstChangeBetween(z, s, s + 5 * 24 * HOUR)).toBe(server.dstChangeBetween(z, s, s + 5 * 24 * HOUR));
    }
  });

  it('the photo-set list form equals the server\'s photoSetKey wherever the server lists', async () => {
    const sets = [[], [PHOTO], [PHOTO_2, PHOTO], [PHOTO.toUpperCase(), PHOTO_2]];
    for (const s of sets) expect(photoSetListKey(s)).toBe(await serverPhotoSetKey(s));
    // Where the server hashes, the phone answers undefined (cannot compare): never a match.
    expect(photoSetListKey(['NOT_AN_ID'])).toBeUndefined();
  });
});
