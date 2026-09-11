import { composeScheduledAt, readVetVisitsHome } from './vetVisits';

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

jest.mock('./db', () => ({
  getDb: () => ({
    getAllAsync: async (sql: string) => {
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

beforeEach(() => {
  rows.appointments = [];
  rows.visits = [];
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
