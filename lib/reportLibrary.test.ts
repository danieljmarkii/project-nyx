// The Reports library (Vet report v2 PR-21, CUL-2301): the list read pages to its count and asks
// only for kept rows and listing columns; opening a copy maps every server answer to a state that
// shows nothing it should not; titles, windows, departures and the year fold.

jest.mock('./supabase', () => ({ supabase: { functions: { invoke: jest.fn() }, from: jest.fn() } }));

import {
  asSentLine,
  copyTitle,
  DEPARTURE_COLUMNS,
  departureLine,
  DEPARTURES_PAGE,
  departuresHeading,
  departureWords,
  foldedGroupLabel,
  groupByYear,
  hasSavedReports,
  LIBRARY_COLUMNS,
  LIBRARY_PAGE,
  libraryTitle,
  newReportSubline,
  NEW_REPORT_LABEL,
  openSavedReport,
  readDepartures,
  readSavedReport,
  readSavedReports,
  SENDS_SHOWN,
  showAllSendsLabel,
  windowLabel,
  type SavedReport,
} from './reportLibrary';

const PET = '11111111-2222-4333-8444-555555555555';
const ANON = 'your pet';
/** A local-noon instant: the day it names is the same in every zone CI runs (C-29). */
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).toISOString();
const OCT30 = at(2026, 10, 30);
const OCT30_2025 = at(2025, 10, 30);
const thisYearForWords = 2026;

beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => undefined));
afterEach(() => jest.restoreAllMocks());

/** A fake PostgREST that pages over `rows` and records every filter it was handed. */
function fakeClient(rows: Array<Record<string, unknown>>, opts: { failAt?: number } = {}) {
  const calls: Array<{ select: string; eq: Array<[string, unknown]>; order: string[]; range?: [number, number]; head?: boolean }> = [];
  const from = jest.fn((table: string) => {
    expect(table).toBe('vet_reports');
    const call: (typeof calls)[number] = { select: '', eq: [], order: [] };
    calls.push(call);
    const q: Record<string, unknown> = {
      // A head count resolves when awaited, after its filters (PostgREST's builder is thenable).
      then: (res: (v: unknown) => unknown) => res(call.head ? { count: rows.length, error: null } : { data: null, error: { message: 'not paged' }, count: null }),
      select: (cols: string, o?: { head?: boolean }) => {
        call.select = cols;
        call.head = o?.head;
        return q;
      },
      eq: (c: string, v: unknown) => {
        call.eq.push([c, v]);
        return q;
      },
      order: (c: string) => {
        call.order.push(c);
        return q;
      },
      range: (a: number, b: number) => {
        call.range = [a, b];
        if (opts.failAt !== undefined && calls.length - 1 === opts.failAt) {
          return Promise.resolve({ data: null, error: { message: 'boom' }, count: null });
        }
        return Promise.resolve({ data: rows.slice(a, b + 1), error: null, count: rows.length });
      },
    };
    return q;
  });
  return { client: { from } as never, calls };
}

function raw(i: number, sharedAt: string): Record<string, unknown> {
  return {
    id: `id-${i}`,
    pet_id: PET,
    short_id: `S${i}`,
    date_range_start: '2026-09-16',
    date_range_end: '2026-10-29',
    shared_via: 'email',
    shared_at: sharedAt,
  };
}

describe('readSavedReports', () => {
  it('asks only for kept rows of this pet, listing columns only, on a total order', async () => {
    const { client, calls } = fakeClient([raw(1, OCT30)]);
    const out = await readSavedReports(PET, client);
    expect(out).toEqual({ kind: 'ok', reports: [expect.objectContaining({ id: 'id-1', shortId: 'S1', sharedVia: 'email' })] });
    expect(calls[0].eq).toEqual([['pet_id', PET], ['status', 'kept']]);
    expect(calls[0].order).toEqual(['shared_at', 'id']);
    expect(LIBRARY_COLUMNS).not.toMatch(/snapshot|params|ai_lead|storage_path|content_sha256/);
    expect(calls[0].select).toBe(LIBRARY_COLUMNS);
  });

  it('pages to the count: a library past one page loses nothing', async () => {
    const rows = Array.from({ length: LIBRARY_PAGE * 2 + 7 }, (_, i) => raw(i, OCT30));
    const { client, calls } = fakeClient(rows);
    const out = await readSavedReports(PET, client);
    expect(out.kind === 'ok' && out.reports.length).toBe(rows.length);
    expect(calls.map((c) => c.range)).toEqual([
      [0, LIBRARY_PAGE - 1],
      [LIBRARY_PAGE, LIBRARY_PAGE * 2 - 1],
      [LIBRARY_PAGE * 2, LIBRARY_PAGE * 3 - 1],
    ]);
  });

  it('a failed page fails the whole read: never a short list that reads as complete', async () => {
    const rows = Array.from({ length: LIBRARY_PAGE + 1 }, (_, i) => raw(i, OCT30));
    const { client } = fakeClient(rows, { failAt: 1 });
    expect(await readSavedReports(PET, client)).toEqual({ kind: 'failed' });
  });

  it('an empty library is ok and empty', async () => {
    const { client } = fakeClient([]);
    expect(await readSavedReports(PET, client)).toEqual({ kind: 'ok', reports: [] });
  });

  it('hasSavedReports counts kept rows of this pet only', async () => {
    const { client, calls } = fakeClient([raw(1, OCT30)]);
    expect(await hasSavedReports(PET, client)).toBe(true);
    expect(calls[0].eq).toEqual([['pet_id', PET], ['status', 'kept']]);
    expect(await hasSavedReports(PET, fakeClient([]).client)).toBe(false);
  });
});

describe('openSavedReport', () => {
  const statusError = (status: number) => ({ error: { context: { status } }, data: null });

  it('returns the stored HTML and names the pet and copy', async () => {
    const invoke = jest.fn().mockResolvedValue({ data: { html: '<html>as sent</html>' }, error: null });
    expect(await openSavedReport(PET, 'id-1', invoke)).toEqual({ kind: 'ok', html: '<html>as sent</html>' });
    expect(invoke).toHaveBeenCalledWith({ mode: 'open', petId: PET, reportId: 'id-1' });
  });

  it('maps every refusal to a state that shows nothing', async () => {
    expect(await openSavedReport(PET, 'x', jest.fn().mockResolvedValue(statusError(404)))).toEqual({ kind: 'unavailable' });
    expect(await openSavedReport(PET, 'x', jest.fn().mockResolvedValue(statusError(409)))).toEqual({ kind: 'unavailable' });
    expect(await openSavedReport(PET, 'x', jest.fn().mockResolvedValue(statusError(500)))).toEqual({ kind: 'failed' });
    expect(await openSavedReport(PET, 'x', jest.fn().mockResolvedValue({ error: new Error('Network request failed'), data: null }))).toEqual({ kind: 'offline' });
    expect(await openSavedReport(PET, 'x', jest.fn().mockRejectedValue(new Error('down')))).toEqual({ kind: 'failed' });
    expect(await openSavedReport(PET, 'x', jest.fn().mockResolvedValue({ data: { html: '' }, error: null }))).toEqual({ kind: 'failed' });
  });
});

describe('words', () => {
  it('titles name the record’s pet, or no one when it cannot be named (WBC-9, C-9)', () => {
    expect(libraryTitle('Cooper', ANON)).toBe('Cooper’s vet reports');
    expect(libraryTitle(ANON, ANON)).toBe('Your pet’s vet reports');
    expect(copyTitle('Cooper', ANON, OCT30, 2026)).toBe('Cooper · Oct 30 report');
    expect(copyTitle('Cooper', ANON, OCT30_2025, 2026)).toBe('Cooper · Oct 30, 2025 report');
    expect(copyTitle(ANON, ANON, OCT30, 2026)).toBe('Oct 30 report');
  });

  it('the action makes a new report and says the sent copy stays (WBC-4)', () => {
    expect(NEW_REPORT_LABEL).toBe('New report through today');
    expect(newReportSubline(OCT30, 2026)).toBe('The Oct 30 copy stays exactly as sent');
    expect(asSentLine(OCT30, 2026)).toBe('The report as you sent it on Oct 30. Anything logged or changed since isn’t in it.');
  });

  it('a window carries a year wherever an end sits outside the year in view (C-19)', () => {
    expect(windowLabel('2026-09-16', '2026-10-29', 2026)).toBe('Sep 16 – Oct 29');
    expect(windowLabel('2025-12-20', '2026-01-05', 2026)).toBe('Dec 20, 2025 – Jan 5');
    expect(windowLabel('2025-09-16', '2025-10-29', 2026)).toBe('Sep 16, 2025 – Oct 29, 2025');
  });

  it('departures never claim delivery the app cannot know (WBC-5)', () => {
    expect(departureWords('email')).toBe('Shared by email');
    expect(departureWords('print')).toBe('Printed');
    expect(departureWords('share')).toBe('Shared');
    expect(departureWords('anything else')).toBe('Shared');
    for (const v of ['email', 'print', 'share']) expect(departureWords(v)).not.toMatch(/sent|deliver|emailed/i);
  });
});

describe('groupByYear: 50 copies fold to one open year and one line per older year (GAP-26)', () => {
  const fifty: SavedReport[] = Array.from({ length: 50 }, (_, i) => {
    // 50 departures, newest first, one every 2 weeks back from Oct 30 2026: three calendar years.
    const sharedAt = new Date(2026, 9, 30 - i * 14, 12).toISOString();
    return { id: `id-${i}`, petId: PET, shortId: `S${i}`, startDate: '2026-09-16', endDate: '2026-10-29', sharedVia: 'email', sharedAt };
  });

  it('keeps every copy, newest year open, every older year folded', () => {
    const groups = groupByYear(fifty);
    expect(groups.map((g) => g.year)).toEqual([2026, 2025, 2024]);
    expect(groups.map((g) => g.folded)).toEqual([false, true, true]);
    expect(groups.reduce((n, g) => n + g.reports.length, 0)).toBe(50);
    expect(groups[0].reports[0].id).toBe('id-0');
    expect(foldedGroupLabel(groups[1])).toMatch(/^2025 · \d+ reports$/);
  });

  it('a library from one older year opens that year', () => {
    const groups = groupByYear(fifty.filter((r) => new Date(r.sharedAt).getFullYear() === 2025));
    expect(groups).toHaveLength(1);
    expect(groups[0].folded).toBe(false);
  });

  it('one report is singular', () => {
    expect(foldedGroupLabel({ year: 2024, reports: [fifty[0]], folded: true })).toBe('2024 · 1 report');
  });
});

// CUL-2445 (migration 119): every send of a kept copy.
describe('readDepartures', () => {
  const REPORT = 'aaaaaaaa-0000-4000-8000-000000000001';
  function depClient(rows: Array<Record<string, unknown>>, opts: { failAt?: number; count?: number } = {}) {
    const calls: Array<{ table: string; select: string; eq: Array<[string, unknown]>; order: Array<[string, unknown]>; range?: [number, number] }> = [];
    const from = jest.fn((table: string) => {
      const call: (typeof calls)[number] = { table, select: '', eq: [], order: [] };
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
        order: (c: string, o: unknown) => {
          call.order.push([c, o]);
          return q;
        },
        range: (a: number, b: number) => {
          call.range = [a, b];
          if (opts.failAt !== undefined && calls.length - 1 === opts.failAt) {
            return Promise.resolve({ data: null, error: { message: 'boom' }, count: null });
          }
          return Promise.resolve({ data: rows.slice(a, b + 1), error: null, count: opts.count ?? rows.length });
        },
      };
      return q;
    });
    return { client: { from } as never, calls };
  }
  const dep = (i: number, via = 'email') => ({ id: `d-${i}`, shared_via: via, shared_at: at(2026, 10, 30 - (i % 20)) });

  it('reads one copy of one pet, newest first on a total key, and only its three columns', async () => {
    const { client, calls } = depClient([dep(1, 'print'), dep(2)]);
    const out = await readDepartures(PET, REPORT, client);
    expect(out).toEqual({
      kind: 'ok',
      departures: [
        { id: 'd-1', sharedVia: 'print', sharedAt: dep(1).shared_at },
        { id: 'd-2', sharedVia: 'email', sharedAt: dep(2).shared_at },
      ],
    });
    expect(calls[0].table).toBe('vet_report_departures');
    expect(calls[0].select).toBe(DEPARTURE_COLUMNS);
    expect(DEPARTURE_COLUMNS).toBe('id, shared_via, shared_at');
    expect(calls[0].eq).toEqual([['report_id', REPORT], ['pet_id', PET]]);
    expect(calls[0].order).toEqual([['shared_at', { ascending: false }], ['id', { ascending: false }]]);
  });

  it('pages to the count: a long history loses nothing', async () => {
    const rows = Array.from({ length: DEPARTURES_PAGE + 3 }, (_, i) => dep(i));
    const { client, calls } = depClient(rows);
    const out = await readDepartures(PET, REPORT, client);
    expect(out.kind === 'ok' && out.departures.length).toBe(rows.length);
    expect(calls.map((c) => c.range)).toEqual([
      [0, DEPARTURES_PAGE - 1],
      [DEPARTURES_PAGE, DEPARTURES_PAGE * 2 - 1],
    ]);
  });

  it('a failed page fails the whole read: never a short history that reads as complete', async () => {
    const rows = Array.from({ length: DEPARTURES_PAGE + 1 }, (_, i) => dep(i));
    const { client } = depClient(rows, { failAt: 1 });
    expect(await readDepartures(PET, REPORT, client)).toEqual({ kind: 'failed' });
  });

  it('a row that arrives on two pages (a send landed between them) is listed once', async () => {
    const rows = Array.from({ length: DEPARTURES_PAGE + 1 }, (_, i) => dep(i));
    // Page two starts one row early: the newest send pushed every offset down by one.
    const shifted = [...rows.slice(0, DEPARTURES_PAGE), rows[DEPARTURES_PAGE - 1], rows[DEPARTURES_PAGE]];
    const { client } = depClient(shifted, { count: rows.length });
    const out = await readDepartures(PET, REPORT, client);
    expect(out.kind).toBe('ok');
    const ids = out.kind === 'ok' ? out.departures.map((d) => d.id) : [];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('fewer rows than the count promised is a failure, not a shorter history', async () => {
    const { client } = depClient([dep(1)], { count: 2 });
    expect(await readDepartures(PET, REPORT, client)).toEqual({ kind: 'failed' });
  });

  it('a missing table (119 not applied) or a throw is a failure, never an empty history', async () => {
    const missing = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ order: () => ({
      range: () => Promise.resolve({ data: null, error: { code: '42P01', message: 'relation does not exist' }, count: null }),
    }) }) }) }) }) }) } as never;
    expect(await readDepartures(PET, REPORT, missing)).toEqual({ kind: 'failed' });
    const throwing = { from: () => { throw new Error('boom'); } } as never;
    expect(await readDepartures(PET, REPORT, throwing)).toEqual({ kind: 'failed' });
  });
});

describe('send history words', () => {
  it('counts the whole history in the heading', () => {
    expect(departuresHeading(1)).toBe('Sent once');
    expect(departuresHeading(3)).toBe('Sent 3 times');
  });

  it('names the route, the local date and the local time, so two sends on one day read apart', () => {
    const morning = new Date(thisYearForWords, 10, 3, 9, 5).toISOString();
    const evening = new Date(thisYearForWords, 10, 3, 16, 10).toISOString();
    expect(departureLine({ id: 'a', sharedVia: 'print', sharedAt: evening }, thisYearForWords)).toBe('Printed · Nov 3, 4:10 PM');
    expect(departureLine({ id: 'b', sharedVia: 'email', sharedAt: morning }, thisYearForWords)).toBe('Shared by email · Nov 3, 9:05 AM');
    const midnight = new Date(thisYearForWords, 10, 3, 0, 0).toISOString();
    expect(departureLine({ id: 'c', sharedVia: 'share', sharedAt: midnight }, thisYearForWords)).toBe('Shared · Nov 3, 12:00 AM');
    const noon = new Date(thisYearForWords - 1, 10, 3, 12, 0).toISOString();
    expect(departureLine({ id: 'd', sharedVia: 'share', sharedAt: noon }, thisYearForWords)).toBe(`Shared · Nov 3, ${thisYearForWords - 1}, 12:00 PM`);
  });

  it('offers the rest past the first few', () => {
    expect(SENDS_SHOWN).toBe(3);
    expect(showAllSendsLabel(5)).toBe('Show all 5 sends');
  });
});

describe('a PostgREST refusal is said, never swallowed (CUL-2477)', () => {
  const refusal = { code: '42501', message: 'permission denied' };
  it('the list read warns with the error and fails', async () => {
    const { client } = fakeClient([raw(1, at(2026, 10, 30))], { failAt: 0 });
    expect(await readSavedReports(PET, client)).toEqual({ kind: 'failed' });
    expect(console.warn).toHaveBeenCalledWith('[reportLibrary] the saved reports could not be read:', { message: 'boom' });
  });
  it('the one-row read warns with the error and fails', async () => {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = () => q;
    q.maybeSingle = () => Promise.resolve({ data: null, error: refusal });
    expect(await readSavedReport(PET, 'r1', { from: () => q } as never)).toBe('failed');
    expect(console.warn).toHaveBeenCalledWith('[reportLibrary] the saved report could not be read:', refusal);
  });
  it('the send history warns with the error and fails', async () => {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = () => q;
    q.order = () => q;
    q.range = () => Promise.resolve({ data: null, error: refusal, count: null });
    expect(await readDepartures(PET, 'r1', { from: () => q } as never)).toEqual({ kind: 'failed' });
    expect(console.warn).toHaveBeenCalledWith('[reportLibrary] the send history could not be read:', refusal);
  });
});
