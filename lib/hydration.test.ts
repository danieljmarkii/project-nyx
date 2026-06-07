import {
  shouldWriteRemoteRow,
  reconcileBatch,
  parseTs,
  LOCAL_WIPE_TABLES,
  type LocalRowMeta,
} from './hydration';

const T0 = '2026-06-01T10:00:00.000Z';
const T1 = '2026-06-01T11:00:00.000Z'; // one hour after T0

describe('shouldWriteRemoteRow', () => {
  describe('cold start (no local row)', () => {
    it('writes an absent row under lww (FR-1 cold start)', () => {
      expect(shouldWriteRemoteRow({ id: 'a', updated_at: T0 }, undefined, 'lww')).toBe(true);
    });

    it('writes an absent row under insert-if-absent', () => {
      expect(shouldWriteRemoteRow({ id: 'a' }, undefined, 'insert-if-absent')).toBe(true);
    });
  });

  describe('insert-if-absent (meals FR-6, attachments)', () => {
    it('never overwrites an existing local row, even if remote looks newer', () => {
      const local: LocalRowMeta = { updated_at: T0 };
      expect(shouldWriteRemoteRow({ id: 'm', updated_at: T1 }, local, 'insert-if-absent')).toBe(false);
    });

    it('does not require an updated_at to make the keep-local decision', () => {
      // meals carry no updated_at at all — presence alone protects the local row.
      expect(shouldWriteRemoteRow({ id: 'm' }, {}, 'insert-if-absent')).toBe(false);
    });
  });

  describe('lww naive guard', () => {
    it('replaces when the remote row is strictly newer', () => {
      expect(shouldWriteRemoteRow({ id: 'e', updated_at: T1 }, { updated_at: T0 }, 'lww')).toBe(true);
    });

    it('keeps the local row when the remote copy is older (offline-edit guard)', () => {
      // The Phase-1 stand-in for AC-3: a locally-newer edit is not clobbered by
      // an older remote copy. (Trigger-correct LWW is Phase 2.)
      expect(shouldWriteRemoteRow({ id: 'e', updated_at: T0 }, { updated_at: T1 }, 'lww')).toBe(false);
    });

    it('treats equal timestamps as a no-op (no spurious rewrite on converge)', () => {
      expect(shouldWriteRemoteRow({ id: 'e', updated_at: T0 }, { updated_at: T0 }, 'lww')).toBe(false);
    });

    it('does not clobber a local row with an undated remote copy', () => {
      expect(shouldWriteRemoteRow({ id: 'e', updated_at: null }, { updated_at: T0 }, 'lww')).toBe(false);
    });

    it('trusts a dated remote row over a local row with no usable timestamp', () => {
      expect(shouldWriteRemoteRow({ id: 'e', updated_at: T0 }, { updated_at: null }, 'lww')).toBe(true);
    });

    it('treats an unparseable remote timestamp as not-newer', () => {
      expect(shouldWriteRemoteRow({ id: 'e', updated_at: 'not-a-date' }, { updated_at: T0 }, 'lww')).toBe(false);
    });
  });

  describe('refresh-if-synced (meals FR-6 — mutable, no updated_at)', () => {
    it('inserts an absent meal (cold start)', () => {
      expect(shouldWriteRemoteRow({ id: 'm' }, undefined, 'refresh-if-synced')).toBe(true);
    });

    it('refreshes a converged local meal so another device\'s correction propagates', () => {
      // Device A corrected intake_rating; B already has the row, synced=1.
      expect(shouldWriteRemoteRow({ id: 'm' }, { synced: 1 }, 'refresh-if-synced')).toBe(true);
    });

    it('never clobbers a meal with a pending local edit (synced=0)', () => {
      // B made its own intake correction not yet pushed — push-before-pull
      // sends it up first; the older remote copy must not overwrite it.
      expect(shouldWriteRemoteRow({ id: 'm' }, { synced: 0 }, 'refresh-if-synced')).toBe(false);
    });

    it('treats a missing synced flag as unsynced (conservative — do not clobber)', () => {
      expect(shouldWriteRemoteRow({ id: 'm' }, { synced: null }, 'refresh-if-synced')).toBe(false);
      expect(shouldWriteRemoteRow({ id: 'm' }, {}, 'refresh-if-synced')).toBe(false);
    });
  });

  describe('soft-delete propagation (FR-7)', () => {
    it('writes a newer remote row even when it carries a deleted_at (delete rides the updated_at)', () => {
      // A soft-delete on device A bumps updated_at; hydration must pull it so the
      // WHERE deleted_at IS NULL read filter hides the row on device B.
      const remote = { id: 'e', updated_at: T1, deleted_at: T1 };
      expect(shouldWriteRemoteRow(remote, { updated_at: T0 }, 'lww')).toBe(true);
    });
  });
});

describe('parseTs — timestamp format normalization', () => {
  // The SQLite datetime('now') default form must be read as UTC, not local —
  // asserted against the explicit-Z parse so this holds in any test-runner
  // timezone (the bug only manifests in non-UTC zones).
  it('treats the SQLite space-separated form as UTC', () => {
    expect(parseTs('2026-06-06 14:23:05')).toBe(Date.parse('2026-06-06T14:23:05Z'));
  });

  it('parses ISO-8601 (client toISOString / Postgres TIMESTAMPTZ) unchanged', () => {
    expect(parseTs('2026-06-06T14:25:05.000Z')).toBe(Date.parse('2026-06-06T14:25:05.000Z'));
  });

  it('returns null for empty / unparseable input', () => {
    expect(parseTs(null)).toBeNull();
    expect(parseTs(undefined)).toBeNull();
    expect(parseTs('not-a-date')).toBeNull();
  });

  it('regression: an ISO delete is newer than an earlier SQLite-default create (cross-device delete propagation)', () => {
    // The exact failing case: wife's device CREATED the row (local updated_at =
    // SQLite space form), husband soft-deletes it 2 min later (ISO). The delete
    // must win so it propagates back to her device. Pre-fix, the space form
    // parsed as local time and (in a negative-offset zone) looked newer, so the
    // delete was skipped and the row lingered.
    const localCreate = { updated_at: '2026-06-06 14:23:05' }; // SQLite default
    const remoteDelete = { id: 'e', updated_at: '2026-06-06T14:25:05.000Z' };
    expect(shouldWriteRemoteRow(remoteDelete, localCreate, 'lww')).toBe(true);
  });
});

describe('reconcileBatch', () => {
  it('partitions a mixed batch into writes and skips under lww', () => {
    const remote = [
      { id: 'new', updated_at: T0 }, // absent locally -> write
      { id: 'newer', updated_at: T1 }, // remote newer -> write
      { id: 'older', updated_at: T0 }, // remote older -> skip
      { id: 'same', updated_at: T0 }, // equal -> skip
    ];
    const localById = new Map<string, LocalRowMeta>([
      ['newer', { updated_at: T0 }],
      ['older', { updated_at: T1 }],
      ['same', { updated_at: T0 }],
    ]);

    const { toWrite, skipped } = reconcileBatch(remote, localById, 'lww');
    expect(toWrite.map((r) => r.id)).toEqual(['new', 'newer']);
    expect(skipped.map((r) => r.id)).toEqual(['older', 'same']);
  });

  it('under insert-if-absent, writes only ids not already local (FR-6 meals)', () => {
    const remote = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const localById = new Map<string, LocalRowMeta>([['b', {}]]);
    const { toWrite, skipped } = reconcileBatch(remote, localById, 'insert-if-absent');
    expect(toWrite.map((r) => r.id)).toEqual(['a', 'c']);
    expect(skipped.map((r) => r.id)).toEqual(['b']);
  });

  it('handles an empty remote batch', () => {
    const { toWrite, skipped } = reconcileBatch([], new Map(), 'lww');
    expect(toWrite).toEqual([]);
    expect(skipped).toEqual([]);
  });
});

describe('LOCAL_WIPE_TABLES (FR-9 logout wipe order)', () => {
  const order = (t: string) => LOCAL_WIPE_TABLES.indexOf(t as never);

  it('deletes child tables before their parents (FK-safe)', () => {
    expect(order('meals')).toBeLessThan(order('events'));
    expect(order('event_attachments')).toBeLessThan(order('events'));
    expect(order('vet_visit_attachments')).toBeLessThan(order('vet_visits'));
  });

  it('covers exactly the account-scoped hydration target set plus the food cache', () => {
    expect([...LOCAL_WIPE_TABLES].sort()).toEqual(
      [
        'event_attachments',
        'events',
        'food_items_cache',
        'meals',
        'vet_visit_attachments',
        'vet_visits',
      ].sort(),
    );
  });
});
