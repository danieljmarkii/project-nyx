// EN-5's answer on the phone: read and write `intake_checks` (Engines v3 PR-30q, CUL-1724;
// migration 097 is the server side; the words are `lib/intakeQuestion.ts`).
//
// LOCAL-FIRST. An answer is written here and pushed by `syncPendingIntakeChecks`, which holds
// it until its vomit has landed (097's guard refuses an unseen parent with a TERMINAL 23514).
//
// THE SERVER RE-READS THE RECORD. Every answer owes the vomit one re-check: the write takes
// EN-4's marker in the same transaction (`writeOwingFloorCheck`), and the server's refloor,
// which never lowers a stored call, reads the answer into the cat intake arm. With EN-4's
// keys off no marker is written and the answer waits for the next read of that vomit.
//
// READ RULE (097): per (vomit, form), the newest live row by answered_at, then id, under a
// live vomit. Instants are parsed before they are compared (C-40): a row written here says
// `…Z`, the same instant hydrated says `+00:00`.

import { getDb } from './db';
import { uuid } from './utils';
import { writeOwingFloorCheck } from './incidentFloorQueue';
import { trialTargetProtein } from './trialProtein';
import type { IntakeAnswer, IntakeForm } from './intakeQuestion';

export interface IntakeCheckRow {
  id: string;
  pet_id: string;
  event_id: string;
  since: string;
  form: IntakeForm;
  answer: IntakeAnswer;
  answered_at: string;
}

const FORMS: readonly IntakeForm[] = ['meal_fed', 'free_fed', 'other_food'];
const ANSWERS: readonly IntakeAnswer[] = ['yes', 'a_little', 'no', 'not_observable'];

/** The newest live answer per form under one vomit. A row under a deleted or re-typed vomit
 *  counts for nothing. */
export async function readIntakeChecks(eventId: string): Promise<Partial<Record<IntakeForm, IntakeCheckRow>>> {
  const rows = await getDb().getAllAsync<IntakeCheckRow>(
    `SELECT ic.id, ic.pet_id, ic.event_id, ic.since, ic.form, ic.answer, ic.answered_at
       FROM intake_checks ic
       JOIN events e ON e.id = ic.event_id
      WHERE ic.event_id = ?
        AND ic.deleted_at IS NULL
        AND e.deleted_at IS NULL
        AND e.event_type = 'vomit'
        AND e.pet_id = ic.pet_id`,
    [eventId],
  );
  return newestPerForm(rows);
}

/** Exported for its test: the read rule over rows already filtered to live ones. */
export function newestPerForm(rows: readonly IntakeCheckRow[]): Partial<Record<IntakeForm, IntakeCheckRow>> {
  const out: Partial<Record<IntakeForm, IntakeCheckRow>> = {};
  for (const r of rows) {
    if (!FORMS.includes(r.form)) continue;
    const held = out[r.form];
    if (!held) {
      out[r.form] = r;
      continue;
    }
    const a = Date.parse(r.answered_at);
    const b = Date.parse(held.answered_at);
    if (a > b || (a === b && r.id > held.id)) out[r.form] = r;
  }
  return out;
}

export interface SaveIntakeAnswer {
  eventId: string;
  petId: string;
  form: IntakeForm;
  answer: IntakeAnswer;
  since: string;
  /** The row being changed ("Change"), or absent for a first answer. */
  existingId?: string | null;
  /** Injected for tests; the device's time of the tap. */
  now?: Date;
}

/**
 * Write an answer: a new row, or an UPDATE of the row being changed. The update moves
 * updated_at and re-queues the row (C-23), and throws when it matched nothing (C-39), so a
 * Change over a row the phone no longer holds is said, never silently dropped.
 */
export async function saveIntakeAnswer(input: SaveIntakeAnswer): Promise<IntakeCheckRow> {
  if (!FORMS.includes(input.form) || !ANSWERS.includes(input.answer)) throw new Error('Unknown intake answer');
  // 097's CHECK: "A little" is offered only on the meal question (I3).
  if (input.answer === 'a_little' && input.form !== 'meal_fed') throw new Error('"A little" is meal_fed only');
  const at = (input.now ?? new Date()).toISOString();
  const db = getDb();
  if (input.existingId) {
    const existingId = input.existingId;
    await writeOwingFloorCheck(input.eventId, async () => {
      const res = await db.runAsync(
        `UPDATE intake_checks SET answer = ?, answered_at = ?, updated_at = ?, synced = 0, sync_attempts = 0, sync_error = NULL
          WHERE id = ? AND event_id = ? AND deleted_at IS NULL`,
        [input.answer, at, at, existingId, input.eventId],
      );
      if ((res as { changes?: number } | undefined)?.changes === 0 || res == null) {
        throw new Error('The answer to change was not found');
      }
    });
    const row = await db.getFirstAsync<IntakeCheckRow>(
      'SELECT id, pet_id, event_id, since, form, answer, answered_at FROM intake_checks WHERE id = ?',
      [existingId],
    );
    if (!row) throw new Error('The answer to change was not found');
    return row;
  }
  const row: IntakeCheckRow = {
    id: uuid(),
    pet_id: input.petId,
    event_id: input.eventId,
    since: input.since,
    form: input.form,
    answer: input.answer,
    answered_at: at,
  };
  await writeOwingFloorCheck(input.eventId, () =>
    db.runAsync(
      `INSERT INTO intake_checks (id, pet_id, event_id, since, form, answer, answered_at, created_at, updated_at, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [row.id, row.pet_id, row.event_id, row.since, row.form, row.answer, row.answered_at, at, at],
    ),
  );
  return row;
}

/** Push what is queued, fire-and-forget. The drain holds an answer until its vomit lands. */
export function pushIntakeChecks(): void {
  // Lazy: lib/sync.ts sits under the modules this one imports.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { syncPendingIntakeChecks } = require('./sync') as typeof import('./sync');
  syncPendingIntakeChecks().catch((e: unknown) => console.warn('[intake] answer push failed (queued):', e));
}

/** The facts that decide which questions a record asks, from the local mirror. */
export interface IntakeQuestionFacts {
  freeFed: boolean;
  trial: { startedAt: string; targetDurationDays: number | null; status: string | null; endedAt: string | null; protein: string | null } | null;
}

export async function readIntakeQuestionFacts(petId: string): Promise<IntakeQuestionFacts> {
  const db = getDb();
  const bowl = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM feeding_arrangements
      WHERE pet_id = ? AND method = 'free_choice' AND active_until IS NULL AND deleted_at IS NULL
      LIMIT 1`,
    [petId],
  );
  const trial = await db.getFirstAsync<{
    started_at: string; target_duration_days: number | null; status: string | null; ended_at: string | null;
    target_protein: string | null; primary_protein: string | null;
  }>(
    `SELECT t.started_at, t.target_duration_days, t.status, t.ended_at, t.target_protein,
            f.primary_protein
       FROM diet_trials t
       LEFT JOIN food_items_cache f ON f.id = t.food_item_id
      WHERE t.pet_id = ? AND t.status = 'active'
      ORDER BY t.started_at DESC, t.id
      LIMIT 1`,
    [petId],
  );
  return {
    freeFed: !!bowl,
    trial: trial
      ? {
          startedAt: trial.started_at,
          targetDurationDays: trial.target_duration_days == null ? null : Number(trial.target_duration_days),
          status: trial.status,
          endedAt: trial.ended_at,
          // The one trial-protein predicate (B-704): stored first, else derived from the
          // trial's food. Lower case, mid-sentence ("off her rabbit trial").
          protein: trialTargetProtein(
            { target_protein: trial.target_protein },
            [{ primaryProtein: trial.primary_protein }],
          ).protein,
        }
      : null,
  };
}
