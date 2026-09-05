// B-745 PR 3 — the shared simple-event write (symptom / stool / Other).
//
// What matters here mirrors insertMeal/insertWeightCheck's tests:
//  1. The event row is written with the exact B-010 shape (confidence + window
//     bounds + source), so the in-sheet confirm and the full-screen /log flow can
//     never drift to different rows for the same event.
//  2. A photo attaches its row AND fires the per-incident AI read — for vomit and
//     BOTH stool types, and never for a non-photographed event (B-027/B-247).
//  3. The event write throwing propagates (so the caller's guard releases); a
//     photo failure does NOT (the committed event must never read back as failed).
//  4. The sync push + Signal regen always fire.
//
// jest hoists jest.mock() above the imports, so any variable a factory closes over
// must be `mock`-prefixed.

const mockRunAsync = jest.fn().mockResolvedValue(undefined);
jest.mock('./db', () => ({
  getDb: () => ({ runAsync: mockRunAsync }),
}));

const mockSyncPendingEvents = jest.fn().mockResolvedValue(undefined);
const mockSyncPendingMeals = jest.fn().mockResolvedValue(undefined);
jest.mock('./sync', () => ({
  syncPendingEvents: (...a: unknown[]) => mockSyncPendingEvents(...a),
  syncPendingMeals: (...a: unknown[]) => mockSyncPendingMeals(...a),
}));

const mockRegen = jest.fn();
jest.mock('./signal', () => ({
  triggerSignalRegenDebounced: (...a: unknown[]) => mockRegen(...a),
}));

const mockVomit = jest.fn().mockResolvedValue({ error: null });
const mockStool = jest.fn().mockResolvedValue({ error: null });
// CUL-801 — the claim the log path takes before its upload starts. Recorded so a
// test can assert WHICH events are claimed and how each chain settled.
const mockSettle = jest.fn();
const mockClaim = jest.fn((..._a: unknown[]) => ({ settle: mockSettle }));
jest.mock('./analysis', () => ({
  triggerVomitAnalysis: (...a: unknown[]) => mockVomit(...a),
  triggerStoolAnalysis: (...a: unknown[]) => mockStool(...a),
  claimAnalysisChain: (...a: unknown[]) => mockClaim(...a),
}));

const mockCompress = jest.fn().mockResolvedValue('file://compressed.jpg');
const mockUpload = jest.fn().mockResolvedValue(undefined);
const mockPersist = jest.fn((uri: string, name: string) => `file://docs/${name}`);
jest.mock('./storage', () => ({
  uploadPhoto: (...a: unknown[]) => mockUpload(...a),
  compressForUpload: (...a: unknown[]) => mockCompress(...a),
  persistCapture: (uri: string, name: string) => mockPersist(uri, name),
}));

const mockUpsert = jest.fn().mockResolvedValue({ error: null });
jest.mock('./supabase', () => ({
  supabase: { from: jest.fn(() => ({ upsert: (...a: unknown[]) => mockUpsert(...a) })) },
}));

let mockIdCounter = 0;
jest.mock('./utils', () => {
  const actual = jest.requireActual('./utils');
  return { ...actual, uuid: () => `id-${++mockIdCounter}` };
});

import { insertSimpleEvent } from './simpleEvent';

// Let the fire-and-forget photo/upload chain settle.
const flush = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  jest.clearAllMocks();
  mockIdCounter = 0;
  mockRunAsync.mockResolvedValue(undefined);
  mockUpsert.mockResolvedValue({ error: null });
});

const base = {
  petId: 'pet-1',
  eventType: 'vomit',
  confidence: 'witnessed' as const,
  occurredAt: new Date('2026-08-13T17:33:00.000Z'),
  earliest: null,
  latest: null,
  source: 'now' as const,
  notes: null,
};

describe('insertSimpleEvent — event row', () => {
  it('writes a witnessed event with null window bounds', async () => {
    const res = await insertSimpleEvent({ ...base });
    expect(res.eventId).toBe('id-1');
    expect(res.occurredAtIso).toBe('2026-08-13T17:33:00.000Z');

    const [sql, args] = mockRunAsync.mock.calls[0];
    expect(sql).toContain('INSERT INTO events');
    // id, pet_id, event_type, occurred_at, severity, notes, source(literal),
    // occurred_at_source, confidence, earliest, latest, now, now
    expect(args[0]).toBe('id-1');
    expect(args[1]).toBe('pet-1');
    expect(args[2]).toBe('vomit');
    expect(args[3]).toBe('2026-08-13T17:33:00.000Z');
    expect(args[4]).toBeNull();          // severity
    expect(args[5]).toBeNull();          // notes
    expect(args[6]).toBe('now');         // occurred_at_source
    expect(args[7]).toBe('witnessed');   // confidence
    expect(args[8]).toBeNull();          // earliest
    expect(args[9]).toBeNull();          // latest
  });

  it('writes a bounded window event with both edges as ISO', async () => {
    const earliest = new Date('2026-08-13T14:00:00.000Z');
    const latest = new Date('2026-08-13T17:33:00.000Z');
    await insertSimpleEvent({
      ...base, eventType: 'diarrhea', confidence: 'window',
      occurredAt: latest, earliest, latest, source: 'manual', notes: 'on the rug',
    });
    const [, args] = mockRunAsync.mock.calls[0];
    expect(args[2]).toBe('diarrhea');
    expect(args[5]).toBe('on the rug');            // notes
    expect(args[6]).toBe('manual');                // source
    expect(args[7]).toBe('window');                // confidence
    expect(args[8]).toBe('2026-08-13T14:00:00.000Z'); // earliest ISO
    expect(args[9]).toBe('2026-08-13T17:33:00.000Z'); // latest ISO
  });

  it('propagates a write failure (nothing committed → caller can retry)', async () => {
    mockRunAsync.mockRejectedValueOnce(new Error('disk full'));
    await expect(insertSimpleEvent({ ...base })).rejects.toThrow('disk full');
    expect(mockRegen).not.toHaveBeenCalled();
  });

  it('always fires the sync push and the Signal regen', async () => {
    await insertSimpleEvent({ ...base, eventType: 'other' });
    expect(mockSyncPendingEvents).toHaveBeenCalledTimes(1);
    expect(mockRegen).toHaveBeenCalledWith('pet-1');
    await flush();
  });
});

describe('insertSimpleEvent — photo + AI read trigger', () => {
  it('no attachment → no attachment row, no analysis', async () => {
    await insertSimpleEvent({ ...base });
    await flush();
    // Only the events INSERT ran.
    expect(mockRunAsync).toHaveBeenCalledTimes(1);
    expect(mockVomit).not.toHaveBeenCalled();
    expect(mockStool).not.toHaveBeenCalled();
  });

  it('vomit photo → attachment row + upload + triggerVomitAnalysis', async () => {
    await insertSimpleEvent({
      ...base, eventType: 'vomit',
      attachment: { uri: 'file://shot.jpg', takenAt: '2026-08-13T17:30:00.000Z', width: 3000, height: 2000 },
    });
    await flush();
    // events INSERT + event_attachments INSERT + the synced=1 UPDATE.
    const attachInsert = mockRunAsync.mock.calls.find(([sql]) => String(sql).includes('event_attachments'));
    expect(attachInsert).toBeTruthy();
    expect(mockCompress).toHaveBeenCalledWith('file://shot.jpg', 3000, 2000);
    expect(mockUpload).toHaveBeenCalled();
    expect(mockVomit).toHaveBeenCalledWith('id-1'); // the event id, not the attachment id
    expect(mockStool).not.toHaveBeenCalled();
  });

  it('formed stool photo → triggerStoolAnalysis', async () => {
    await insertSimpleEvent({
      ...base, eventType: 'stool_normal',
      attachment: { uri: 'file://s.jpg', takenAt: null },
    });
    await flush();
    expect(mockStool).toHaveBeenCalledWith('id-1');
    expect(mockVomit).not.toHaveBeenCalled();
  });

  it('loose stool photo → triggerStoolAnalysis', async () => {
    await insertSimpleEvent({
      ...base, eventType: 'diarrhea',
      attachment: { uri: 'file://s.jpg', takenAt: null },
    });
    await flush();
    expect(mockStool).toHaveBeenCalledWith('id-1');
  });

  it('Other with a photo → no per-incident read (only vomit/stool analyze)', async () => {
    await insertSimpleEvent({
      ...base, eventType: 'other',
      attachment: { uri: 'file://s.jpg', takenAt: null },
    });
    await flush();
    expect(mockVomit).not.toHaveBeenCalled();
    expect(mockStool).not.toHaveBeenCalled();
    // but the photo still attached + uploaded
    expect(mockUpload).toHaveBeenCalled();
  });

  it('does not mark synced or analyze when the Supabase upsert errors', async () => {
    mockUpsert.mockResolvedValueOnce({ error: { message: 'RLS denied' } });
    await insertSimpleEvent({
      ...base, eventType: 'vomit',
      attachment: { uri: 'file://s.jpg', takenAt: null },
    });
    await flush();
    // The synced=1 UPDATE must not run, and the read must not fire, on a failed upload.
    const syncedUpdate = mockRunAsync.mock.calls.find(([sql]) => String(sql).includes('SET synced = 1'));
    expect(syncedUpdate).toBeUndefined();
    expect(mockVomit).not.toHaveBeenCalled();
  });

  it('a photo-row failure never fails the committed event', async () => {
    // First call = events INSERT (ok); second = event_attachments INSERT (throws).
    mockRunAsync.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('attach boom'));
    const res = await insertSimpleEvent({
      ...base, eventType: 'vomit',
      attachment: { uri: 'file://s.jpg', takenAt: null },
    });
    await flush();
    // The event still resolved successfully.
    expect(res.eventId).toBe('id-1');
    expect(mockRegen).toHaveBeenCalledWith('pet-1');
  });
});

describe('insertSimpleEvent — the analysis-chain claim (CUL-801)', () => {
  // The log path owns the event's first read so the incident screen (CUL-800)
  // awaits it instead of firing a second invoke at the same photo. Two calls burn
  // two units of the daily-10 cap and race each other's write-back.

  it('claims the chain for a photographed vomit, and settles TRUE once the read is invoked', async () => {
    await insertSimpleEvent({
      ...base, eventType: 'vomit',
      attachment: { uri: 'file://shot.jpg', takenAt: null },
    });
    // The claim must be in place before insertSimpleEvent RESOLVES — that is what
    // closes the gap an owner routed straight to the record would otherwise mount
    // into. Asserted here, before flush() lets the upload chain run.
    expect(mockClaim).toHaveBeenCalledWith('id-1');

    await flush();
    expect(mockVomit).toHaveBeenCalledWith('id-1');
    expect(mockSettle).toHaveBeenCalledWith(true);
  });

  it('claims for BOTH stool types', async () => {
    await insertSimpleEvent({
      ...base, eventType: 'diarrhea', attachment: { uri: 'file://s.jpg', takenAt: null },
    });
    expect(mockClaim).toHaveBeenCalledWith('id-1');
    await flush();
    expect(mockSettle).toHaveBeenCalledWith(true);
  });

  it('takes NO claim for a photo event with no per-incident read', async () => {
    await insertSimpleEvent({
      ...base, eventType: 'other', attachment: { uri: 'file://s.jpg', takenAt: null },
    });
    await flush();
    expect(mockClaim).not.toHaveBeenCalled();
    expect(mockSettle).not.toHaveBeenCalled();
  });

  it('settles FALSE when the attachment upsert errors — the chain died before its read', async () => {
    // The screen waiting on this chain must be told to trigger its own read, or
    // the incident ends up with no descriptive read AND no contextual escalation.
    mockUpsert.mockResolvedValueOnce({ error: { message: 'RLS denied' } });
    await insertSimpleEvent({
      ...base, eventType: 'vomit', attachment: { uri: 'file://s.jpg', takenAt: null },
    });
    await flush();
    expect(mockVomit).not.toHaveBeenCalled();
    expect(mockSettle).toHaveBeenCalledWith(false);
  });

  it('settles FALSE when the upload throws', async () => {
    mockUpload.mockRejectedValueOnce(new Error('offline'));
    await insertSimpleEvent({
      ...base, eventType: 'vomit', attachment: { uri: 'file://s.jpg', takenAt: null },
    });
    await flush();
    expect(mockVomit).not.toHaveBeenCalled();
    expect(mockSettle).toHaveBeenCalledWith(false);
  });

  it('settles FALSE when the invoke itself is refused', async () => {
    mockVomit.mockResolvedValueOnce({ error: 'network down' });
    await insertSimpleEvent({
      ...base, eventType: 'vomit', attachment: { uri: 'file://s.jpg', takenAt: null },
    });
    await flush();
    expect(mockSettle).toHaveBeenCalledWith(false);
  });

  it('always settles — a claim is never left outstanding for the life of the process', async () => {
    // A stuck claim would suppress the mount trigger forever: the screen would
    // wait on a chain that is never going to invoke.
    mockRunAsync.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('synced update boom'));
    await insertSimpleEvent({
      ...base, eventType: 'vomit', attachment: { uri: 'file://s.jpg', takenAt: null },
    });
    await flush();
    expect(mockSettle).toHaveBeenCalledWith(false);
  });
});
