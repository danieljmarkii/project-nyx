// A dose's write path, as Home's day row reads it (History v2 HV-6 / CUL-1163):
//   • the optimistic store row a logged dose puts in front of Home is built from the SAME
//     facts the write carried (`optimisticDoseRow`), driven here through the real write,
//     so a column the write gains and the row forgets reds instead of being restated;
//   • a dose re-rated after the fact goes through the one path that re-reads Home
//     (`rateDoseAdherence` / `recordDoseHowGiven`): before it, a dose downgraded to Refused
//     on its card kept a teal *Given* on Home until the next reload (the adversarial pass,
//     B2), and a guard below keeps any other file from writing either field itself.
//
// jest hoists jest.mock() above the imports, so any variable a factory closes over must be
// `mock`-prefixed.

const mockRunAsync = jest.fn().mockResolvedValue({ changes: 1, lastInsertRowId: 0 });
const mockWithTransactionAsync = jest.fn(async (cb: () => Promise<void>) => {
  await cb();
});
const mockUpdateDoseAdherence = jest.fn().mockResolvedValue(undefined);
const mockUpdateDoseHowGiven = jest.fn().mockResolvedValue(undefined);
jest.mock('./db', () => ({
  getDb: () => ({ runAsync: mockRunAsync, withTransactionAsync: mockWithTransactionAsync }),
  getDoubleDoseFlag: jest.fn(),
  updateDoseAdherence: (...a: unknown[]) => mockUpdateDoseAdherence(...a),
  updateDoseHowGiven: (...a: unknown[]) => mockUpdateDoseHowGiven(...a),
}));

const mockSyncPendingEvents = jest.fn().mockResolvedValue(undefined);
const mockSyncPendingAdministrations = jest.fn().mockResolvedValue(undefined);
jest.mock('./sync', () => ({
  syncPendingEvents: (...a: unknown[]) => mockSyncPendingEvents(...a),
  syncPendingMedicationAdministrations: (...a: unknown[]) => mockSyncPendingAdministrations(...a),
}));

jest.mock('../store/momentStore', () => ({
  useMomentStore: { getState: () => ({ patchDoubleDose: jest.fn() }) },
  whenMedicationCardVisible: jest.fn(),
}));

import * as fs from 'fs';
import * as path from 'path';
import { blankComments } from '../guards/blankComments';
import {
  insertMedicationDose,
  optimisticDoseRow,
  rateDoseAdherence,
  recordDoseHowGiven,
  type InsertMedicationDoseParams,
} from './medicationDose';
import { useSyncStore } from '../store/syncStore';

beforeEach(() => {
  jest.clearAllMocks();
});

/** The column → value map one captured INSERT wrote: its column list against its VALUES
 *  list, a `?` taking the next bound parameter and a literal read as written. */
function inserted(table: string): Record<string, unknown> {
  const call = mockRunAsync.mock.calls.find(([sql]) => new RegExp(`INSERT INTO ${table}\\b`).test(String(sql)));
  if (!call) throw new Error(`no INSERT INTO ${table} was written`);
  const [sql, params] = call as [string, unknown[]];
  const columns = /\(([^)]*)\)\s*VALUES/.exec(sql)![1].split(',').map((c) => c.trim());
  const values = /VALUES\s*\(([^)]*)\)/.exec(sql)![1].split(',').map((v) => v.trim());
  expect(values).toHaveLength(columns.length);
  let next = 0;
  return Object.fromEntries(
    columns.map((column, i) => {
      const v = values[i];
      if (v === '?') return [column, params[next++]];
      if (v === 'NULL') return [column, null];
      if (/^'.*'$/.test(v)) return [column, v.slice(1, -1)];
      return [column, Number(v)];
    }),
  );
}

const DRUG = { id: 'pred', generic_name: 'Prednisone', brand_name: null };

async function logAndMirror(write: InsertMedicationDoseParams, pairedVehicleIntake?: string | null) {
  const result = await insertMedicationDose(write);
  const row = optimisticDoseRow(
    {
      petId: write.petId,
      adherence: write.adherence,
      howGiven: write.howGiven,
      pairedEventId: write.pairedEventId,
      pairedVehicleIntake,
      drug: DRUG,
    },
    result,
  ) as unknown as Record<string, unknown>;
  return { row, event: inserted('events'), dose: inserted('medication_administrations') };
}

describe('optimisticDoseRow: the store row says what the write wrote', () => {
  it('a dose given in a meal: every event column the row carries, and the stored pair, agree with the write', async () => {
    const { row, event, dose } = await logAndMirror({
      petId: 'pet-1',
      medicationItemId: DRUG.id,
      adherence: null,
      howGiven: 'in_food',
      pairedEventId: 'meal-1',
      occurredAt: new Date('2026-09-25T17:00:00.000Z'),
    });
    // The event row: whatever the row carries, it carries as written.
    const shared = Object.keys(event).filter((column) => column in row);
    for (const column of shared) expect([column, row[column]]).toEqual([column, event[column]]);
    // Non-vacuity: the columns compared are the ones the day row reads.
    expect(shared).toEqual(
      expect.arrayContaining(['id', 'pet_id', 'event_type', 'occurred_at', 'occurred_at_confidence', 'created_at', 'updated_at']),
    );
    // The child's facts, by the child's own column names: the pair a combo dose rides on,
    // its vehicle, its (unrated) adherence and its item.
    expect(dose.event_id).toBe(row.id);
    for (const column of ['pet_id', 'adherence', 'how_given', 'paired_event_id', 'medication_item_id']) {
      expect([column, row[column]]).toEqual([column, dose[column]]);
    }
    // And the pair really was written, so the loop above compared something.
    expect(dose).toMatchObject({ paired_event_id: 'meal-1', how_given: 'in_food', adherence: null });
    expect(row).toMatchObject({ drug_generic_name: 'Prednisone', drug_brand_name: null });
  });

  it('a combo dose carries the vehicle intake its adherence was decided on, so a cross-day pair is in doubt at once', async () => {
    // The HV-6 second adversarial pass (2): a dose added to an earlier day's refused treat has
    // no meal row on Home's day, so without this the row read "not in doubt" until a reload.
    const write = {
      petId: 'pet-1',
      medicationItemId: DRUG.id,
      adherence: null,
      howGiven: 'in_treat' as const,
      pairedEventId: 'treat-yesterday',
      occurredAt: new Date('2026-09-25T09:00:00.000Z'),
    };
    expect((await logAndMirror(write, 'refused')).row).toMatchObject({ paired_vehicle_intake: 'refused', adherence: null });
    // A value this build does not know reads as none, which is what the in-doubt predicate
    // makes of it anyway; and a standalone dose never carries one.
    expect((await logAndMirror(write, 'half')).row).toMatchObject({ paired_vehicle_intake: null });
    expect((await logAndMirror({ ...write, pairedEventId: null }, 'refused')).row).toMatchObject({ paired_vehicle_intake: null });
  });

  it('a standalone dose: no pair and no vehicle, as null rather than absent', async () => {
    const { row, dose } = await logAndMirror({
      petId: 'pet-1',
      medicationItemId: DRUG.id,
      adherence: 'given',
      occurredAt: new Date('2026-09-25T08:00:00.000Z'),
    });
    expect(dose).toMatchObject({ paired_event_id: null, how_given: null, adherence: 'given' });
    expect(row).toMatchObject({ paired_event_id: null, how_given: null, adherence: 'given' });
  });
});

describe('re-rating a dose re-reads Home (HV-6, B2)', () => {
  it.each([
    ['rateDoseAdherence', () => rateDoseAdherence('d1', 'refused'), mockUpdateDoseAdherence, ['d1', 'refused']],
    ['recordDoseHowGiven', () => recordDoseHowGiven('d1', 'direct'), mockUpdateDoseHowGiven, ['d1', 'direct']],
  ] as const)('%s writes, then bumps the tick Home re-reads on, then pushes', async (_name, run, write, args) => {
    const before = useSyncStore.getState().hydrationTick;
    await run();
    expect(write).toHaveBeenCalledWith(...args);
    expect(useSyncStore.getState().hydrationTick).toBe(before + 1);
    expect(mockSyncPendingAdministrations).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['rateDoseAdherence', () => rateDoseAdherence('d2', 'missed'), mockUpdateDoseAdherence],
    ['recordDoseHowGiven', () => recordDoseHowGiven('d2', null), mockUpdateDoseHowGiven],
  ] as const)('%s: a failed write throws and refreshes nothing, so a revert still means "not saved"', async (_name, run, write) => {
    const before = useSyncStore.getState().hydrationTick;
    write.mockRejectedValueOnce(new Error('No medication_administration row for event d2'));
    await expect(run()).rejects.toThrow('No medication_administration row');
    expect(useSyncStore.getState().hydrationTick).toBe(before);
    expect(mockSyncPendingAdministrations).not.toHaveBeenCalled();
  });
});

describe('one write path for re-rating a dose (HV-6, B2)', () => {
  // The drift CUL-1087 closed for meal ratings, closed for doses: a screen that writes
  // either field itself skips Home's re-read, which is how all four did. Comments are
  // blanked first (C-18), so a sentence about the helper is not a use of it.
  const ROOT = path.resolve(__dirname, '..');
  const SCAN_DIRS = ['app', 'components', 'lib', 'hooks', 'store', 'widgets', 'constants'];
  // The definitions, and the one module allowed to call them.
  const ALLOWED = new Set(['lib/db.ts', 'lib/medicationDose.ts']);

  function walk(dir: string, out: string[] = []): string[] {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs, out);
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(abs);
    }
    return out;
  }

  const namers = SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d)))
    .filter((abs) => /\bupdateDose(Adherence|HowGiven)\b/.test(blankComments(fs.readFileSync(abs, 'utf8'))))
    .map((abs) => path.relative(ROOT, abs).split(path.sep).join('/'));

  it('finds the definitions and the helper’s own calls, so an empty scan cannot pass', () => {
    expect(namers).toContain('lib/db.ts');
    expect(namers).toContain('lib/medicationDose.ts');
  });

  it('no other file names updateDoseAdherence or updateDoseHowGiven: they go through this module', () => {
    // Named, not just called: an import is a reach, and an alias would hide a call.
    expect(namers.filter((f) => !ALLOWED.has(f))).toEqual([]);
  });
});
