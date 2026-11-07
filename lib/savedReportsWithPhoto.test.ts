// Vet report v2 PR-23b (CUL-2454): "Also in N saved reports" on a photo delete.
jest.mock('./supabase', () => ({ supabase: { from: jest.fn() } }));

import { countSavedReportsWithPhoto, savedReportsLine } from './savedReportsWithPhoto';

const PET = '11111111-2222-4333-8444-555555555555';
const PHOTO = { id: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA', storage_path: `${PET}/ev/1.jpg` };

type Answer = { data: unknown; error: { message: string } | null; count: number | null };

/** A query builder that records every call and answers each `.range()` from `answers` in turn. */
function client(answers: Answer[]) {
  const calls: unknown[][] = [];
  let n = 0;
  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  for (const m of ['from', 'select', 'eq', 'contains']) {
    chain[m] = (...args: unknown[]) => {
      calls.push([m, ...args]);
      return chain;
    };
  }
  chain.range = (...args: unknown[]) => {
    calls.push(['range', ...args]);
    return Promise.resolve(answers[n++]);
  };
  return { client: chain as unknown as Parameters<typeof countSavedReportsWithPhoto>[2], calls };
}

describe('countSavedReportsWithPhoto', () => {
  it('asks for ids of this pet\'s KEPT copies whose frozen photos hold it, by id and by path', async () => {
    const c = client([
      { data: [{ id: 'r1' }, { id: 'r2' }], error: null, count: 2 },
      { data: [{ id: 'r2' }, { id: 'r3' }], error: null, count: 2 },
    ]);
    expect(await countSavedReportsWithPhoto(PET, PHOTO, c.client)).toBe(3);
    expect(c.calls).toEqual([
      ['from', 'vet_reports'], ['select', 'id', { count: 'exact' }], ['eq', 'pet_id', PET], ['eq', 'status', 'kept'],
      ['contains', 'snapshot', { incidentPhotos: [{ attachmentId: PHOTO.id.toLowerCase() }] }], ['range', 0, 999],
      ['from', 'vet_reports'], ['select', 'id', { count: 'exact' }], ['eq', 'pet_id', PET], ['eq', 'status', 'kept'],
      ['contains', 'snapshot', { incidentPhotos: [{ storagePath: PHOTO.storage_path }] }], ['range', 0, 999],
    ]);
    // Never a snapshot, never a left-out list: the read names `incidentPhotos` only.
    expect(JSON.stringify(c.calls)).not.toMatch(/incidentPhotosLeftOut|select', '\*'/);
  });

  it('with no stored path, the id alone', async () => {
    const c = client([{ data: [{ id: 'r1' }], error: null, count: 1 }]);
    expect(await countSavedReportsWithPhoto(PET, { id: PHOTO.id, storage_path: null }, c.client)).toBe(1);
    expect(c.calls.filter((x) => x[0] === 'contains')).toHaveLength(1);
  });

  it('a refused or failed read is null (today\'s confirm), never zero', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await countSavedReportsWithPhoto(PET, PHOTO, client([{ data: null, error: { message: 'no' }, count: null }]).client)).toBeNull();
    const throws = { from: () => { throw new Error('offline'); } } as unknown as Parameters<typeof countSavedReportsWithPhoto>[2];
    expect(await countSavedReportsWithPhoto(PET, PHOTO, throws)).toBeNull();
    warn.mockRestore();
  });

  it('a count past one page is still said', async () => {
    const c = client([{ data: [{ id: 'r1' }], error: null, count: 1200 }, { data: [], error: null, count: 0 }]);
    expect(await countSavedReportsWithPhoto(PET, PHOTO, c.client)).toBe(1200);
  });
});

describe('savedReportsLine', () => {
  it('says the number, and nothing at zero or on a failed read', () => {
    expect(savedReportsLine(1)).toBe('Also in 1 saved report. That copy keeps it.');
    expect(savedReportsLine(3)).toBe('Also in 3 saved reports. Those copies keep it.');
    expect(savedReportsLine(0)).toBeNull();
    expect(savedReportsLine(null)).toBeNull();
  });
});
