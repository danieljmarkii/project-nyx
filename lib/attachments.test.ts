// B-105 — the write half: replacing an event photo must take the previous one
// with it, and must never cost the owner the photo it just stored.
//
// The three orphans this covers are each invisible in the app: a duplicate
// SQLite row, a Storage object no row names, and a document-directory file the
// sign-out wipe (which walks local_uri) can no longer see. None of them change
// anything on screen, so nothing but a test will notice a regression.

const mockDeleteLocal = jest.fn<Promise<void>, [string]>();
const mockStorageRemove = jest.fn();
const mockRowDelete = jest.fn();

jest.mock('./db', () => ({
  deleteEventAttachmentLocal: (id: string) => mockDeleteLocal(id),
}));
jest.mock('./supabase', () => ({
  supabase: {
    storage: { from: (bucket: string) => ({ remove: (paths: string[]) => mockStorageRemove(bucket, paths) }) },
    from: (table: string) => ({ delete: () => ({ eq: (col: string, val: string) => mockRowDelete(table, col, val) }) }),
  },
}));

import {
  detachEventAttachment,
  detachOtherEventAttachments,
  EVENT_ATTACHMENT_BUCKET,
} from './attachments';

const att = (id: string) => ({ id, storage_path: `pet1/ev1/${id}.jpg` });

beforeEach(() => {
  mockDeleteLocal.mockReset().mockResolvedValue(undefined);
  mockStorageRemove.mockReset().mockResolvedValue({ error: null });
  mockRowDelete.mockReset().mockResolvedValue({ error: null });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('detachEventAttachment', () => {
  it('removes all three copies — local row + file, Storage object, remote row', async () => {
    await detachEventAttachment(att('a1'));
    expect(mockDeleteLocal).toHaveBeenCalledWith('a1');
    expect(mockStorageRemove).toHaveBeenCalledWith(EVENT_ATTACHMENT_BUCKET, ['pet1/ev1/a1.jpg']);
    expect(mockRowDelete).toHaveBeenCalledWith('event_attachments', 'id', 'a1');
  });

  it('removes the Storage object BEFORE the remote row', async () => {
    // A crash between the two should leave a row pointing at a missing object
    // (renders the empty state) rather than bytes no row names — which the
    // sign-out wipe cannot find. Orphaned health photos are the worse failure.
    const order: string[] = [];
    mockStorageRemove.mockImplementation(async () => { order.push('storage'); return { error: null }; });
    mockRowDelete.mockImplementation(async () => { order.push('row'); return { error: null }; });
    await detachEventAttachment(att('a1'));
    expect(order).toEqual(['storage', 'row']);
  });

  it('still deletes the remote row when the Storage remove fails', async () => {
    mockStorageRemove.mockRejectedValue(new Error('offline'));
    await expect(detachEventAttachment(att('a1'))).resolves.toBeUndefined();
    expect(mockRowDelete).toHaveBeenCalled();
  });

  it('does not throw when the remote row delete fails', async () => {
    // Cleanup must work offline: a replace that failed because the network was
    // down would be a far worse bug than an orphan.
    mockRowDelete.mockRejectedValue(new Error('offline'));
    await expect(detachEventAttachment(att('a1'))).resolves.toBeUndefined();
  });

  it('DOES throw when the local delete fails', async () => {
    // The one half whose failure the owner must see: the remove handler shows an
    // optimistic empty state and has to know to put the photo back.
    mockDeleteLocal.mockRejectedValue(new Error('sqlite'));
    await expect(detachEventAttachment(att('a1'))).rejects.toThrow('sqlite');
    expect(mockStorageRemove).not.toHaveBeenCalled();
  });
});

describe('detachOtherEventAttachments (the replace sweep)', () => {
  it('detaches the superseded rows and keeps the replacement', async () => {
    await detachOtherEventAttachments([att('old'), att('new')], 'new');
    expect(mockDeleteLocal.mock.calls.map((c) => c[0])).toEqual(['old']);
  });

  it('sweeps EVERY prior row, repairing an already-duplicated event', async () => {
    // Three production events already carry duplicates from the old behaviour.
    // Sweeping the whole list (not just the row the screen had loaded) is what
    // heals them on the next replace.
    await detachOtherEventAttachments([att('d1'), att('d2'), att('d3'), att('new')], 'new');
    expect(mockDeleteLocal.mock.calls.map((c) => c[0])).toEqual(['d1', 'd2', 'd3']);
  });

  it('never removes the row just written, even if it is not in the priors list', async () => {
    await detachOtherEventAttachments([att('old')], 'brand-new');
    expect(mockDeleteLocal).toHaveBeenCalledTimes(1);
    expect(mockDeleteLocal).not.toHaveBeenCalledWith('brand-new');
  });

  it('keeps going when one detach fails, and never throws', async () => {
    // This runs AFTER the replacement is safely stored, so a failure here costs
    // an orphan — it must not surface as "could not attach photo", and it must
    // not abandon the remaining duplicates.
    mockDeleteLocal.mockImplementation(async (id: string) => {
      if (id === 'd1') throw new Error('sqlite');
    });
    await expect(
      detachOtherEventAttachments([att('d1'), att('d2'), att('new')], 'new'),
    ).resolves.toBeUndefined();
    expect(mockDeleteLocal.mock.calls.map((c) => c[0])).toEqual(['d1', 'd2']);
  });

  it('is a no-op on the first-ever photo', async () => {
    await detachOtherEventAttachments([], 'first');
    expect(mockDeleteLocal).not.toHaveBeenCalled();
    expect(mockStorageRemove).not.toHaveBeenCalled();
    expect(mockRowDelete).not.toHaveBeenCalled();
  });
});
