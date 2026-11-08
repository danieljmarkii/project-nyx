// A saved report's visit (Vet report v2 PR-22, CUL-2302): the reads name the pet and kept rows,
// a visit's reports include its booking's and page to their count, the write maps every server
// answer to a state, and the picker's words.

jest.mock('./supabase', () => ({ supabase: { functions: { invoke: jest.fn() }, from: jest.fn() } }));
jest.mock('./vetVisits', () => ({
  formatVisitDate: (d: string) => {
    const [, m, day] = d.split('-').map(Number);
    return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${day}`;
  },
}));

import {
  linkedLine,
  LINKED_ELSEWHERE,
  linkOptions,
  linkSavedReport,
  pickerEmpty,
  readReportLink,
  readReportsForVisit,
  sameTarget,
  VISIT_REPORTS_PAGE,
} from './reportVisitLink';
import type { VetVisitsHome } from './vetVisits';

const PET = '11111111-2222-4333-8444-555555555555';
const REPORT = '66666666-2222-4333-8444-555555555555';
const VISIT = '77777777-2222-4333-8444-555555555555';
const APPT = '88888888-2222-4333-8444-555555555555';

beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => undefined));
afterEach(() => jest.restoreAllMocks());

type Call = { select: string; eq: Array<[string, unknown]>; or?: string; range?: [number, number] };

/** A fake PostgREST over `rows`, recording every filter. */
function fakeClient(rows: Array<Record<string, unknown>>, opts: { error?: boolean } = {}) {
  const calls: Call[] = [];
  const from = jest.fn((table: string) => {
    expect(table).toBe('vet_reports');
    const call: Call = { select: '', eq: [] };
    calls.push(call);
    const q: Record<string, unknown> = {
      select: (cols: string) => {
        call.select = cols;
        return q;
      },
      eq: (c: string, v: unknown) => {
        call.eq.push([c, v]);
        return q;
      },
      or: (f: string) => {
        call.or = f;
        return q;
      },
      order: () => q,
      range: (a: number, b: number) => {
        call.range = [a, b];
        if (opts.error) return Promise.resolve({ data: null, error: { message: 'x' }, count: null });
        return Promise.resolve({ data: rows.slice(a, b + 1), error: null, count: rows.length });
      },
      maybeSingle: () => Promise.resolve(opts.error ? { data: null, error: { message: 'x' } } : { data: rows[0] ?? null, error: null }),
    };
    return q;
  });
  return { client: { from } as never, calls };
}

const kept = (i: number) => ({
  id: `r${i}`, pet_id: PET, short_id: `K${i}`, date_range_start: '2026-09-16', date_range_end: '2026-10-29',
  shared_via: 'email', shared_at: new Date(2026, 9, 30, 12).toISOString(),
});

describe('readReportLink', () => {
  it('reads one kept copy of this pet and names its visit', async () => {
    const { client, calls } = fakeClient([{ vet_visit_id: VISIT, vet_appointment_id: null }]);
    expect(await readReportLink(PET, REPORT, client)).toEqual({ kind: 'visit', id: VISIT });
    expect(calls[0].eq).toEqual([['id', REPORT], ['pet_id', PET], ['status', 'kept']]);
  });
  it('names an appointment, and null for a copy filed under nothing', async () => {
    expect(await readReportLink(PET, REPORT, fakeClient([{ vet_visit_id: null, vet_appointment_id: APPT }]).client)).toEqual({ kind: 'appointment', id: APPT });
    expect(await readReportLink(PET, REPORT, fakeClient([{ vet_visit_id: null, vet_appointment_id: null }]).client)).toBeNull();
  });
  it('a failed read is "failed", never "for no visit"', async () => {
    expect(await readReportLink(PET, REPORT, fakeClient([], { error: true }).client)).toBe('failed');
  });
});

describe('readReportsForVisit', () => {
  it('includes the copies filed under the booking the visit was logged from', async () => {
    const { client, calls } = fakeClient([kept(1)]);
    await readReportsForVisit(PET, VISIT, APPT, client);
    expect(calls[0].or).toBe(`vet_visit_id.eq.${VISIT},vet_appointment_id.eq.${APPT}`);
    expect(calls[0].eq).toEqual([['pet_id', PET], ['status', 'kept']]);
  });
  it('a visit with no booking asks only for its own', async () => {
    const { client, calls } = fakeClient([]);
    expect(await readReportsForVisit(PET, VISIT, null, client)).toEqual([]);
    expect(calls[0].or).toBe(`vet_visit_id.eq.${VISIT}`);
  });
  it('pages to the count, never stopping on a short page', async () => {
    const rows = Array.from({ length: VISIT_REPORTS_PAGE + 3 }, (_, i) => kept(i));
    const { client, calls } = fakeClient(rows);
    const out = await readReportsForVisit(PET, VISIT, null, client);
    expect(Array.isArray(out) && out.length).toBe(VISIT_REPORTS_PAGE + 3);
    expect(calls.map((c) => c.range)).toEqual([[0, VISIT_REPORTS_PAGE - 1], [VISIT_REPORTS_PAGE, 2 * VISIT_REPORTS_PAGE - 1]]);
  });
  it('a failed read is "failed", never an empty visit', async () => {
    expect(await readReportsForVisit(PET, VISIT, null, fakeClient([], { error: true }).client)).toBe('failed');
  });
});

describe('linkSavedReport', () => {
  const answer = (v: { data?: unknown; error?: unknown }) => jest.fn(() => Promise.resolve({ data: v.data ?? null, error: v.error ?? null }));
  const status = (n: number) => ({ context: { status: n } });

  it('sends the pet, the copy and the target, and reads ok', async () => {
    const invoke = answer({ data: { linked: { kind: 'visit', id: VISIT } } });
    expect(await linkSavedReport(PET, REPORT, { kind: 'visit', id: VISIT }, invoke)).toEqual({ kind: 'ok' });
    expect(invoke).toHaveBeenCalledWith({ petId: PET, reportId: REPORT, target: { kind: 'visit', id: VISIT } });
  });
  it('clears with an explicit null target', async () => {
    const invoke = answer({ data: { linked: null } });
    expect(await linkSavedReport(PET, REPORT, null, invoke)).toEqual({ kind: 'ok' });
    expect(invoke).toHaveBeenCalledWith({ petId: PET, reportId: REPORT, target: null });
  });
  it('maps a 404 to refused, a 500 to failed, and no status to offline', async () => {
    expect(await linkSavedReport(PET, REPORT, null, answer({ error: status(404) }))).toEqual({ kind: 'refused' });
    expect(await linkSavedReport(PET, REPORT, null, answer({ error: status(500) }))).toEqual({ kind: 'failed' });
    expect(await linkSavedReport(PET, REPORT, null, answer({ error: new Error('Network request failed') }))).toEqual({ kind: 'offline' });
  });
  it('an answer without `linked` is a failure, never a success', async () => {
    expect(await linkSavedReport(PET, REPORT, null, answer({ data: {} }))).toEqual({ kind: 'failed' });
  });
});

const appt = (id: string, day: string, when: string, where = '') => ({ id, petId: PET, scheduledAt: '', stamp: null, when, day, where, isToday: day === 'Today', hasNotes: false });

const HOME: VetVisitsHome = {
  next: appt(APPT, 'Tomorrow', 'Tomorrow · 3:00 pm', 'Riverside'),
  later: [appt('a2', 'Tue, Nov 17', 'Tue, Nov 17')],
  awaiting: [appt('a3', 'Friday', 'Friday')],
  visits: [
    { id: VISIT, petId: PET, visitedAt: '2026-10-30', stamp: null, title: 'Recheck', where: 'Riverside · Dr. Chen', tags: [] },
    { id: 'v2', petId: PET, visitedAt: '2026-09-16', stamp: null, title: 'Visit on Sep 16', where: '', tags: [] },
  ],
};

describe('linkOptions and the words', () => {
  it('bookings to come, then passed bookings, then visits', () => {
    expect(linkOptions(HOME).map((o) => o.target.id)).toEqual([APPT, 'a2', 'a3', VISIT, 'v2']);
  });
  it('names each the way the report line reads it', () => {
    const o = linkOptions(HOME);
    expect(o[0]).toMatchObject({ primary: 'Appointment · Tomorrow · 3:00 pm', secondary: 'Riverside', phrase: 'tomorrow’s appointment' });
    expect(o[1].phrase).toBe('the appointment on Tue, Nov 17');
    expect(o[3]).toMatchObject({ primary: 'Oct 30 visit', secondary: 'Recheck · Riverside · Dr. Chen', phrase: 'the Oct 30 visit' });
    // The stand-in title only repeats the date, so it is not shown twice.
    expect(o[4].secondary).toBe('');
  });
  it('the report line says where it is filed, and never "not filed" for a link the list lost', () => {
    const o = linkOptions(HOME);
    expect(linkedLine({ kind: 'visit', id: VISIT }, o)).toBe('For the Oct 30 visit');
    expect(linkedLine({ kind: 'appointment', id: APPT }, o)).toBe('For tomorrow’s appointment');
    expect(linkedLine({ kind: 'visit', id: 'gone' }, o)).toBe(LINKED_ELSEWHERE);
  });
  it('sameTarget compares kind and id, and null only to null', () => {
    expect(sameTarget({ kind: 'visit', id: VISIT }, { kind: 'appointment', id: VISIT })).toBe(false);
    expect(sameTarget(null, null)).toBe(true);
    expect(sameTarget(null, { kind: 'visit', id: VISIT })).toBe(false);
  });
  it('the empty picker names the pet, or says "your pet"', () => {
    expect(pickerEmpty('Cooper', 'your pet')).toBe('No visits on Cooper’s record yet. Add one from the Pet tab, then file this report under it.');
    expect(pickerEmpty('your pet', 'your pet')).toMatch(/^No visits on your pet’s record/);
  });
  it('no owner string shouts', () => {
    const all = linkOptions(HOME).flatMap((o) => [o.primary, o.secondary, o.phrase]);
    expect(all.some((s) => s.includes('!'))).toBe(false);
  });
});
