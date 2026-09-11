import { composeScheduledAt, readVetVisitsHome, readVisitsForHistory } from './vetVisits';
import { toLocalDayKey } from './utils';

// CUL-900 VV-2 — `readVetVisitsHome`'s day split, driven against a stubbed DB.
//
// Its own file because it needs `getDb` mocked, and `lib/vetVisits.test.ts` is a
// pure-function suite that deliberately touches no database.
//
// This exists because the first version of its assertion did NOT bite. It checked
// that `new Date(spelling).getTime() >= dayStart` — the parsing, in isolation —
// which is true of the fix and equally true of the bug, so it survived the
// mutation that put the lexical compare back. A test that re-derives the rule
// rather than driving the shipped function is a tautology with fixtures (C-34,
// and the lesson was already written down before this session repeated it).

const rows: { appointments: Record<string, unknown>[]; visits: Record<string, unknown>[] } = {
  appointments: [],
  visits: [],
};

/** Every SQL string the readers under test issued, for the filter assertions. */
const sqlSeen: string[] = [];

jest.mock('./db', () => ({
  getDb: () => ({
    getAllAsync: async (sql: string) => {
      sqlSeen.push(sql);
      if (/FROM vet_appointments/.test(sql)) return rows.appointments;
      if (/FROM vet_visits/.test(sql)) return rows.visits;
      // The three link reads (medications / diet_trials / vet_documents).
      return [];
    },
  }),
}));

function appointmentRow(scheduledAt: string) {
  return {
    id: 'a1',
    pet_id: 'pet-a',
    scheduled_at: scheduledAt,
    clinic_name: 'Riverside Animal Hospital',
    vet_name: null,
    reason: 'recheck',
    vet_visit_id: null,
    cancelled_at: null,
    deleted_at: null,
  };
}

function visitRow(over: Record<string, unknown> = {}) {
  return {
    id: 'v1',
    pet_id: 'pet-a',
    visited_at: '2026-07-30',
    clinic_name: 'Riverside Animal Hospital',
    vet_name: 'Dr. Chen',
    reason: 'GI follow-up',
    notes: null,
    next_visit_at: null,
    deleted_at: null,
    ...over,
  };
}

beforeEach(() => {
  rows.appointments = [];
  rows.visits = [];
  sqlSeen.length = 0;
});

describe('a no-time booking for today survives the server round-trip', () => {
  // The two spellings of one instant. A local write produces `…T04:00:00.000Z`;
  // PostgREST hands back `…T04:00:00+00:00`. `'+'` (0x2B) sorts before `'.'`
  // (0x2E), so a lexical `>=` against an ISO bound drops the hydrated row at the
  // exact-equality second — which is LOCAL MIDNIGHT, the no-time sentinel.
  //
  // So the row it dropped was "a booking for today, no time given" — the default
  // the sheet's own "Optional" placeholder steers every owner toward — and it
  // dropped it on the day the card matters most, moving it from *Next* to
  // *Waiting on you* with a caption reading "This day has passed" over a row
  // whose own label said "Today".
  //
  // Reached by any second device, any sign-out/in, any reinstall, and by any
  // later UPDATE to the row — which is precisely VV-5's job (it writes
  // `vet_visit_id` onto these).
  const NOW = new Date(2026, 8, 16, 9, 30);

  function bothSpellings(): [string, string] {
    const local = composeScheduledAt(new Date(2026, 8, 16), null);
    return [local, local.replace(/\.\d{3}Z$/, '+00:00')];
  }

  it('is the SAME instant in both spellings — the premise, asserted', () => {
    const [local, hydrated] = bothSpellings();
    expect(new Date(local).getTime()).toBe(new Date(hydrated).getTime());
    // …and they really do compare differently as text, which is the whole defect.
    // If a future runtime changed this, the two tests below would be measuring
    // nothing and this line is what would say so.
    expect(hydrated >= local).toBe(false);
  });

  it.each([
    ['just booked on this device', 0],
    ['after a sync brought it back', 1],
  ])('reads as Next %s', async (_label, index) => {
    rows.appointments = [appointmentRow(bothSpellings()[index])];

    const home = await readVetVisitsHome('pet-a', NOW);

    expect(home.next).not.toBeNull();
    expect(home.next?.when).toBe('Today');
    // The half that had the owner-visible consequence: not stranded in the
    // section that tells her the day has passed.
    expect(home.awaiting).toEqual([]);
  });

  it('a booking whose day really HAS passed still lands in awaiting', async () => {
    // The guard above must not have been bought by making everything "Next".
    rows.appointments = [appointmentRow(composeScheduledAt(new Date(2026, 8, 14), null))];

    const home = await readVetVisitsHome('pet-a', NOW);

    expect(home.next).toBeNull();
    expect(home.awaiting).toHaveLength(1);
  });
});

// ── readVisitsForHistory (CUL-904 VV-6) ─────────────────────────────────────────

describe('readVisitsForHistory — the History timeline row', () => {
  it('sorts a visit at LOCAL midnight of its calendar day, not UTC midnight', async () => {
    rows.visits = [visitRow({ visited_at: '2026-07-30' })];

    const [out] = await readVisitsForHistory('pet-a');

    // Built from the key's PARTS, which is the whole distinction: the wrong
    // implementation is `new Date('2026-07-30')`, and that is UTC midnight — the
    // PREVIOUS calendar day for every owner behind UTC, and a different one ahead
    // of it. A visit would then sort into the wrong day and be filtered out by the
    // wrong day's scope bound.
    expect(out.sortMs).toBe(new Date(2026, 6, 30).getTime());
    // The same claim from the other side: whatever instant it picked, the LOCAL
    // calendar day of that instant is the day the owner recorded.
    expect(toLocalDayKey(new Date(out.sortMs))).toBe('2026-07-30');

    // HONEST LIMIT: in a UTC environment local and UTC midnight are the same
    // instant, so both assertions above are true of the bug as well. What makes
    // this bite is the `App (jest, non-UTC timezones)` CI job (UTC+14 / +12:45 /
    // −10) — the C-29 matrix, which exists for exactly this class. Run this file
    // with TZ=Pacific/Auckland to see it fail against `new Date(key)`.
  });

  it('asks the database for live rows only — the delete control lands on a reader that already filters', async () => {
    rows.visits = [visitRow()];
    await readVisitsForHistory('pet-a');

    const visitSql = sqlSeen.find((q) => /FROM vet_visits/.test(q));
    // VV-1 shipped `deleted_at` ahead of its control precisely so every reader
    // would already honour it. A reader written without the filter is the thing
    // that makes the control unshippable later (spec §5.3), and this row is the
    // newest reader of the table.
    expect(visitSql).toMatch(/deleted_at IS NULL/);
  });

  it('drops a row whose date cannot be parsed rather than placing it somewhere wrong', async () => {
    rows.visits = [visitRow({ id: 'bad', visited_at: 'not-a-date' }), visitRow({ id: 'ok' })];

    const out = await readVisitsForHistory('pet-a');

    // A row with no usable day has no honest position in a chronological stream:
    // at the epoch it sits silently under the owner's entire history, and at `now`
    // it claims to have happened today. It keeps its place in the Vet visits list,
    // which is not ordered against events.
    expect(out.map((v) => v.id)).toEqual(['ok']);
  });

  it('carries the reason and the where-line, and nulls an empty reason rather than inventing one', async () => {
    rows.visits = [
      visitRow({ id: 'a', reason: '  ', clinic_name: 'Riverside', vet_name: null }),
      visitRow({ id: 'b', reason: 'GI follow-up', clinic_name: null, vet_name: null }),
    ];

    const out = await readVisitsForHistory('pet-a');

    // A visit logged with only a date is an ordinary record. `null` lets the row
    // omit the line; a stand-in string would make it read as a gap.
    expect(out[0]).toMatchObject({ reason: null, where: 'Riverside' });
    expect(out[1]).toMatchObject({ reason: 'GI follow-up', where: '' });
  });
});
