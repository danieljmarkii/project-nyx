import {
  shouldWriteRemoteRow,
  reconcileBatch,
  parseTs,
  advanceWatermark,
  watermarkQueryFloor,
  mealsToDeleteByAbsence,
  HYDRATE_WATERMARK_OVERLAP_MS,
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

  describe('insert-if-absent (attachments — no server updated_at, insert-only)', () => {
    it('never overwrites an existing local row, even if remote looks newer', () => {
      const local: LocalRowMeta = { updated_at: T0 };
      expect(shouldWriteRemoteRow({ id: 'a', updated_at: T1 }, local, 'insert-if-absent')).toBe(false);
    });

    it('does not require an updated_at to make the keep-local decision', () => {
      // attachments carry no updated_at — presence alone protects the local row
      // (and its local-only local_uri column).
      expect(shouldWriteRemoteRow({ id: 'a' }, {}, 'insert-if-absent')).toBe(false);
    });
  });

  describe('lww (events, meals, vet_visits — accepted Phase-2 server-time LWW)', () => {
    it('replaces when the remote row is strictly newer', () => {
      expect(shouldWriteRemoteRow({ id: 'e', updated_at: T1 }, { updated_at: T0 }, 'lww')).toBe(true);
    });

    it('keeps the local row when the remote copy is older (offline-edit guard, AC-3)', () => {
      // A locally-newer edit is not clobbered by an older remote copy.
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

  describe('meals LWW (B-055 — intake_rating correction propagation, replaces refresh-if-synced)', () => {
    it('propagates a converged meal\'s newer remote intake correction', () => {
      // Device A corrected intake_rating at T1; B has the older converged row (T0).
      // Real LWW now carries the correction instead of the synced-flag proxy.
      expect(shouldWriteRemoteRow({ id: 'm', updated_at: T1 }, { updated_at: T0 }, 'lww')).toBe(true);
    });

    it('does not clobber B\'s newer local intake edit with an older remote meal', () => {
      // B rated intake locally at T1 (updated_at bumped by updateMealIntake);
      // the stale remote copy at T0 must not win. (The SQL synced=1 backstop in
      // sync.ts is the second line of defense for the unpushed case.)
      expect(shouldWriteRemoteRow({ id: 'm', updated_at: T0 }, { updated_at: T1 }, 'lww')).toBe(false);
    });

    it('cold-start meal with a backfilled updated_at writes (no NULL special-casing)', () => {
      // Migration 016 backfills updated_at = created_at, so a hydrated meal always
      // has a usable timestamp — no undated-meal branch needed.
      expect(shouldWriteRemoteRow({ id: 'm', updated_at: T0 }, undefined, 'lww')).toBe(true);
    });
  });

  describe('server-time LWW failure mode (FR-5, documented bound — AC-9)', () => {
    it('the later server-arrival wins regardless of wall-clock authorship', () => {
      // Two offline edits to the SAME row: A authored later by wall clock (T1) but
      // B's push reached the server last, so the trigger stamped B's row with the
      // newest updated_at (Tserver > T1). From a third device's view, LWW takes
      // B — the named, bounded surprise. Content is never merged; one whole edit
      // supersedes the other. This is the accepted v1 behavior, not a bug.
      const Tserver = '2026-06-01T11:00:00.001Z'; // server NOW, just after T1
      const remoteB_lastToLand = { id: 'r', updated_at: Tserver };
      const localA_authoredLater = { updated_at: T1 };
      expect(shouldWriteRemoteRow(remoteB_lastToLand, localA_authoredLater, 'lww')).toBe(true);
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

  it('under insert-if-absent, writes only ids not already local (attachments)', () => {
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

describe('advanceWatermark (FR-3 incremental high-water mark)', () => {
  it('returns the max timestamp of the batch on a cold start (null prior)', () => {
    expect(advanceWatermark([T0, T1], null)).toBe(T1);
  });

  it('advances past the prior watermark when the batch is newer', () => {
    expect(advanceWatermark([T1], T0)).toBe(T1);
  });

  it('never regresses below the prior watermark (older batch keeps prior)', () => {
    // An incremental pull at gte(T1) could still surface a row whose updated_at
    // equals/precedes T1 (boundary re-pull); it must not drag the mark backward.
    expect(advanceWatermark([T0], T1)).toBe(T1);
  });

  it('keeps the prior watermark for an empty batch (no rewind on an empty pull)', () => {
    expect(advanceWatermark([], T1)).toBe(T1);
    expect(advanceWatermark([], null)).toBeNull();
  });

  it('ignores unparseable / null timestamps when computing the max', () => {
    expect(advanceWatermark([null, 'not-a-date', T0, undefined], null)).toBe(T0);
  });

  it('compares across timestamp formats on a single clock (SQLite-default vs ISO)', () => {
    // A row carrying the SQLite space form must not be judged newer than a later
    // ISO row just because of the parse-as-local trap parseTs fixes.
    const sqliteForm = '2026-06-01 10:30:00'; // == 10:30Z, between T0 (10:00Z) and T1 (11:00Z)
    expect(advanceWatermark([T0, sqliteForm], null)).toBe(sqliteForm);
    expect(advanceWatermark([sqliteForm, T1], null)).toBe(T1);
  });

  it('boundary: re-running a gte(watermark) pull never skips a row at exactly the watermark', () => {
    // The off-by-one the requirements call out. Model the server-side
    // .gte(updated_at, watermark) filter as an inclusive predicate and prove the
    // round-trip is lossless: after advancing to the batch max, a *new* row
    // stamped at exactly that max (same-microsecond commit, or a row that landed
    // just after the prior snapshot) is still returned by the next pull. A strict
    // (>) bound would drop it silently.
    const pull1 = [{ id: 'a', updated_at: T0 }, { id: 'b', updated_at: T1 }];
    const wm = advanceWatermark(pull1.map((r) => r.updated_at), null);
    expect(wm).toBe(T1);

    const serverNow = [
      { id: 'a', updated_at: T0 },
      { id: 'b', updated_at: T1 },
      { id: 'c', updated_at: T1 }, // arrived at exactly the watermark, after pull1
    ];
    const inclusivePull = serverNow.filter((r) => {
      const t = parseTs(r.updated_at);
      const w = parseTs(wm);
      return t !== null && w !== null && t >= w; // mirrors PostgREST .gte()
    });
    expect(inclusivePull.map((r) => r.id)).toEqual(['b', 'c']);

    // And the boundary re-pull doesn't push the mark forward spuriously.
    expect(advanceWatermark(inclusivePull.map((r) => r.updated_at), wm)).toBe(T1);
  });
});

describe('watermarkQueryFloor (FR-3 commit-skew safety overlap)', () => {
  it('returns null for a cold start (no watermark → full pull)', () => {
    expect(watermarkQueryFloor(null)).toBeNull();
  });

  it('pulls the lower bound back by the overlap so a late-committing row is re-pulled', () => {
    const floor = watermarkQueryFloor(T1);
    expect(parseTs(floor)).toBe(parseTs(T1)! - HYDRATE_WATERMARK_OVERLAP_MS);
  });

  it('honors a custom overlap', () => {
    const floor = watermarkQueryFloor(T1, 1000);
    expect(parseTs(floor)).toBe(parseTs(T1)! - 1000);
  });

  it('falls back to a full pull (null) on an unparseable stored watermark', () => {
    // Defensive: never pass garbage to PostgREST .gte(); a corrupt mark re-pulls all.
    expect(watermarkQueryFloor('not-a-date')).toBeNull();
  });

  it('floor stays below the stored watermark so the boundary stays inclusive', () => {
    // The stored watermark advances to the true max; the query floor is strictly
    // below it, so the next pull always re-covers the boundary plus the skew window.
    const floor = watermarkQueryFloor(T1);
    expect(parseTs(floor)!).toBeLessThan(parseTs(T1)!);
  });
});

describe('mealsToDeleteByAbsence (FR-8 hard-deleted-meal reconciliation)', () => {
  it('deletes a synced local meal the server no longer has (the ghost)', () => {
    const local = [{ id: 'ghost', synced: 1 }, { id: 'keep', synced: 1 }];
    expect(mealsToDeleteByAbsence(new Set(['keep']), local)).toEqual(['ghost']);
  });

  it('NEVER deletes an unsynced local meal absent from the server (not-yet-pushed write)', () => {
    // The load-bearing guard: a synced=0 meal legitimately isn't on the server
    // yet; absence-reconciling it would destroy a fresh local log.
    const local = [{ id: 'fresh', synced: 0 }];
    expect(mealsToDeleteByAbsence(new Set<string>(), local)).toEqual([]);
  });

  it('keeps synced meals the server still has', () => {
    const local = [{ id: 'a', synced: 1 }, { id: 'b', synced: 1 }];
    expect(mealsToDeleteByAbsence(new Set(['a', 'b']), local)).toEqual([]);
  });

  it('reconciles a synced ghost away even when the server set is empty', () => {
    // An empty server set is a valid input (account has no meals); a leftover
    // synced row must be the food-cascade hard-delete and gets dropped. (The I/O
    // shell only calls this on a non-null pull, so [] means "really none".)
    const local = [{ id: 'ghost', synced: 1 }, { id: 'fresh', synced: 0 }];
    expect(mealsToDeleteByAbsence(new Set<string>(), local)).toEqual(['ghost']);
  });

  it('accepts an array of ids as well as a Set', () => {
    const local = [{ id: 'a', synced: 1 }, { id: 'b', synced: 1 }];
    expect(mealsToDeleteByAbsence(['a'], local)).toEqual(['b']);
  });

  it('handles an empty local set', () => {
    expect(mealsToDeleteByAbsence(new Set(['x']), [])).toEqual([]);
  });
});

describe('LOCAL_WIPE_TABLES (FR-9 logout wipe order)', () => {
  const order = (t: string) => LOCAL_WIPE_TABLES.indexOf(t as never);

  it('deletes child tables before their parents (FK-safe)', () => {
    expect(order('meals')).toBeLessThan(order('events'));
    expect(order('event_attachments')).toBeLessThan(order('events'));
    expect(order('vet_visit_attachments')).toBeLessThan(order('vet_visits'));
  });

  it('covers exactly the account-scoped hydration target set plus the food cache and watermarks', () => {
    expect([...LOCAL_WIPE_TABLES].sort()).toEqual(
      [
        'event_attachments',
        'events',
        'food_items_cache',
        'meals',
        'sync_watermarks',
        'vet_visit_attachments',
        'vet_visits',
      ].sort(),
    );
  });

  it('includes sync_watermarks so an account switch cold-starts (FR-3 × FR-9)', () => {
    // A surviving watermark would make the next account's first login an
    // incremental pull from the prior account's mark, skipping its older history.
    expect(LOCAL_WIPE_TABLES).toContain('sync_watermarks');
  });
});
