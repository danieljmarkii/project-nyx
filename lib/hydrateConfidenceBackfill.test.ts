// B-526 — the migration-052 occurred_at_confidence backfill only reaches a device
// if the row's updated_at MOVES. This suite pins that dependence.
//
// hydrateEvents (lib/sync.ts) pulls events INCREMENTALLY on updated_at (only rows
// past the device's high-water mark, minus a 2-min overlap) and reconciles
// last-write-wins on updated_at (a remote row wins only when STRICTLY newer). So a
// backfill whose updated_at does NOT move is invisible to an already-hydrated
// device on BOTH gates: the row sits below the watermark floor (never re-pulled)
// and, even on a cold pull, ties the local row's updated_at so LWW skips it. That
// is the behaviour these tests lock down, and the regression guard for any future
// hand-population of the remaining NULL symptom rows.
//
// WHERE THE BUMP ACTUALLY COMES FROM (important, and a correction to B-526's
// framing): in production the `trg_events_updated_at` BEFORE-UPDATE trigger runs
// `set_updated_at()` = `NEW.updated_at = NOW()` UNCONDITIONALLY, so ANY server-side
// UPDATE to events already moves updated_at. So a bare backfill UPDATE does NOT
// silently fail on a normal run — the trigger saves it (it is the same trigger
// that makes hydrate a SERVER-time LWW; lib/hydration.ts header). Migration 052's
// explicit `updated_at = now()` is therefore a defensive backstop for a bulk run
// with triggers suppressed, not the sole source of the bump. Either way the
// reconcile's REQUIREMENT is the same — an un-moved updated_at is skipped — which
// is what this suite proves, independent of who supplies the move.
//
// hydrateEvents is an unexported I/O shell over the pure reconcile functions in
// lib/hydration.ts (that file's header states the split), so its pick-up DECISION
// is tested here through those functions; its WRITE is tested against a real
// node:sqlite engine using the genuine events schema (BASE_SCHEMA_SQL + the
// production column-upgrade path, B-398) and the verbatim hydrate upsert, with a
// drift guard pinning that copy to the real one.

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  shouldWriteRemoteRow,
  watermarkQueryFloor,
  parseTs,
} from './hydration';
import { BASE_SCHEMA_SQL, COLUMN_UPGRADES, applyColumnUpgrades } from './localSchema';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');
type RawDb = InstanceType<typeof DatabaseSync>;

// A legacy NULL row's updated_at == created_at (never edited); this is the B-525
// live vomit's own stamp. BUMPED is what migration 052's `updated_at = now()` writes.
const OLD = '2026-05-30T09:40:00.000Z';
const BUMPED = '2026-08-02T00:00:00.000Z';

describe('the backfill only reaches a device when it bumps updated_at (B-526)', () => {
  it('a bumped backfill row is written — remote strictly newer, so LWW picks it up', () => {
    expect(shouldWriteRemoteRow({ id: 'e1', updated_at: BUMPED }, { updated_at: OLD }, 'lww')).toBe(true);
  });

  it('an UN-moved updated_at is skipped by LWW — the failure the bump/trigger prevents', () => {
    // Leaving updated_at at OLD ties the local row; LWW treats an equal timestamp
    // as a no-op, so the new confidence never lands. In production the
    // trg_events_updated_at trigger moves updated_at on any UPDATE so this cannot
    // arise on a normal run; the requirement it encodes — an un-moved row is
    // skipped — is exactly what the trigger (and the explicit SET) exist to satisfy.
    expect(shouldWriteRemoteRow({ id: 'e1', updated_at: OLD }, { updated_at: OLD }, 'lww')).toBe(false);
  });

  it('an UN-moved row is never even re-pulled by an already-hydrated device', () => {
    // The incremental pull asks only for updated_at >= (watermark − overlap). A
    // device whose watermark has moved past OLD never re-requests the row at all,
    // so a row whose updated_at never moved is invisible before LWW even runs; the
    // moved updated_at lifts it back above the floor.
    const floor = watermarkQueryFloor('2026-07-01T00:00:00.000Z'); // device synced well after OLD
    expect(parseTs(OLD)!).toBeLessThan(parseTs(floor)!);
    expect(parseTs(BUMPED)!).toBeGreaterThan(parseTs(floor)!);
  });
});

describe('the hydrate upsert flips the confidence when it lands (B-526)', () => {
  // Verbatim copy of hydrateEvents' write (lib/sync.ts). The drift guard below
  // fails if the real statement's load-bearing clauses change, so this copy cannot
  // silently stop matching the code it stands in for (the detectionSoftDelete idiom).
  const HYDRATE_UPSERT = `INSERT INTO events
      (id, pet_id, event_type, occurred_at, severity, notes, source,
       occurred_at_source, occurred_at_confidence, occurred_at_earliest, occurred_at_latest,
       logged_via, deleted_at, created_at, updated_at, synced)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)
     ON CONFLICT(id) DO UPDATE SET
       pet_id=excluded.pet_id, event_type=excluded.event_type, occurred_at=excluded.occurred_at,
       severity=excluded.severity, notes=excluded.notes, source=excluded.source,
       occurred_at_source=excluded.occurred_at_source,
       occurred_at_confidence=excluded.occurred_at_confidence,
       occurred_at_earliest=excluded.occurred_at_earliest,
       occurred_at_latest=excluded.occurred_at_latest,
       logged_via=excluded.logged_via,
       deleted_at=excluded.deleted_at, created_at=excluded.created_at,
       updated_at=excluded.updated_at, synced=1
     WHERE events.synced = 1`;

  async function freshDb(): Promise<RawDb> {
    const db = new DatabaseSync(':memory:');
    db.exec(BASE_SCHEMA_SQL);
    // Apply the real events column-upgrade path so occurred_at_confidence / logged_via
    // exist exactly as they do on a device — the genuine article, not a fixture (B-398).
    await applyColumnUpgrades(
      async (sql) => db.exec(sql),
      COLUMN_UPGRADES.filter((u) => u.table === 'events'),
    );
    return db;
  }

  function seedLocalMeal(db: RawDb, opts: { confidence: string | null; synced: number; updatedAt: string }) {
    db.prepare(
      `INSERT INTO events
         (id, pet_id, event_type, occurred_at, source, occurred_at_source,
          occurred_at_confidence, logged_via, created_at, updated_at, synced)
       VALUES ('e1','p1','meal','2026-05-30T09:00:00.000Z','manual','now', ?, 'app',
               '2026-05-30T09:40:00.000Z', ?, ?)`,
    ).run(opts.confidence, opts.updatedAt, opts.synced);
  }

  // The backfilled remote row migration 052 produces for that meal: confidence
  // 'witnessed', updated_at bumped, everything else unchanged.
  function applyBackfill(db: RawDb) {
    db.prepare(HYDRATE_UPSERT).run(
      'e1', 'p1', 'meal', '2026-05-30T09:00:00.000Z', null, null, 'manual',
      'now', 'witnessed', null, null, 'app', null, '2026-05-30T09:40:00.000Z', BUMPED,
    );
  }

  function read(db: RawDb): { occurred_at_confidence: string | null; updated_at: string } {
    return db.prepare('SELECT occurred_at_confidence, updated_at FROM events WHERE id = ?')
      .get('e1') as unknown as { occurred_at_confidence: string | null; updated_at: string };
  }

  it('flips a synced NULL meal to witnessed and carries the bumped updated_at', async () => {
    const db = await freshDb();
    seedLocalMeal(db, { confidence: null, synced: 1, updatedAt: OLD });
    applyBackfill(db);
    const row = read(db);
    expect(row.occurred_at_confidence).toBe('witnessed');
    expect(row.updated_at).toBe(BUMPED);
  });

  it('does NOT overwrite a row carrying a pending local edit (synced = 0) — the timing caveat', async () => {
    // hydrateEvents guards its write with WHERE events.synced = 1, so a device
    // mid-edit keeps its own row and push-before-pull ships that edit up first.
    // This is exactly why B-526 says the backfill should run when no device has
    // unsynced edits pending — otherwise the pushed local NULL wins.
    const db = await freshDb();
    seedLocalMeal(db, { confidence: null, synced: 0, updatedAt: OLD });
    applyBackfill(db);
    expect(read(db).occurred_at_confidence).toBeNull();
  });
});

describe('the replicated upsert still matches hydrateEvents (drift guard)', () => {
  const src = readFileSync(join(__dirname, 'sync.ts'), 'utf8');
  const start = src.indexOf('async function hydrateEvents');
  const end = src.indexOf('async function hydrateMeals');
  const body = start >= 0 && end > start ? src.slice(start, end) : '';

  it('found the hydrateEvents function body to scan', () => {
    expect(body).not.toBe('');
  });

  it('writes occurred_at_confidence from the incoming (excluded) row', () => {
    // If this clause is dropped, hydrateEvents stops propagating the backfilled
    // confidence and the block above is testing a statement the app no longer runs.
    expect(body).toContain('occurred_at_confidence=excluded.occurred_at_confidence');
  });

  it('bumps updated_at from the incoming row', () => {
    expect(body).toContain('updated_at=excluded.updated_at');
  });

  it('guards the write on synced = 1 so a pending local edit is never clobbered', () => {
    expect(body).toMatch(/WHERE events\.synced = 1/);
  });
});
