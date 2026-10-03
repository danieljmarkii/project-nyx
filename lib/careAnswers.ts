import { getDb } from './db';
import { syncPendingCareAcknowledgements } from './sync';
import { uuid } from './utils';
import type { CareSign } from './careState';
import type { CareQuestionCourse, CareQuestionTrial, CareQuestionVisit } from './careQuestions';
import { getActiveTrialForPet } from './dietTrialSetup';

// The owner's care answers (Engines v3 PR-35, CUL-1418; docs/nyx-care-state-requirements.md
// §3.2, §8.1). One row per answer, one sign per row, written LOCAL-FIRST and pushed by the
// parent-gated insert-only queue in lib/sync.ts.
//
// AN ANSWER IS A DATED FACT THE OWNER CAUSED, NEVER A VERDICT. The care state is derived
// on the server (generate-signal's careState step) and the phone never computes one
// (§3.3, mock 3e): a written answer changes nothing on Home until the server has read it.
// So every write here ends by pushing the queue, and the Signal regenerates only once a
// row has LANDED (the listener below), never on the write itself: a regen that ran ahead
// of the row would recompute the old state and hold it until the next one. The regen is the
// drain's (lib/sync.ts), so a row queued offline regenerates whichever sync lands it, after
// an app restart too.
//
// APPEND-ONLY. 082 grants no UPDATE, so an Undo is a NEW row whose `retracts` names the
// old one, carrying the old row's source and links (the table's CHECKs tie each source to
// its link, and the guard requires a visit source to name its visit).

export type CareSource = 'at_vet_tick' | 'visit_answer' | 'my_vet_knows' | 'vet_started_trial' | 'vet_started_course';

export type CareAnswerInput =
  | { petId: string; sign: CareSign; source: 'my_vet_knows'; anchorOn: string }
  | { petId: string; sign: CareSign; source: 'at_vet_tick' | 'visit_answer'; anchorOn: string; vetVisitId: string }
  | { petId: string; sign: CareSign; source: 'vet_started_trial'; anchorOn: string; dietTrialId: string }
  | { petId: string; sign: CareSign; source: 'vet_started_course'; anchorOn: string; medicationId: string };

interface LocalCareAnswer {
  id: string;
  pet_id: string;
  symptom_type: string;
  source: string;
  anchor_on: string;
  vet_visit_id: string | null;
  diet_trial_id: string | null;
  medication_id: string | null;
  retracts: string | null;
  synced: number;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Push the queue. Never rejects: a failed push leaves the row queued for the next cycle. */
export async function pushCareAnswers(): Promise<void> {
  try {
    await syncPendingCareAcknowledgements();
  } catch (err) {
    console.warn('[careAnswers] push failed (queued):', err);
  }
}

/**
 * Write one answer. Returns its id once it is on this phone; the push follows and is not
 * awaited here (`pushCareAnswers`, or `careAnswerLanded` to ask afterwards).
 *
 * Throws on a malformed input rather than writing a row the server would refuse with a
 * terminal 23514 (quarantined on its first try): a visit source with no visit, a date
 * that is not a local day.
 */
export async function recordCareAnswer(input: CareAnswerInput, newId: () => string = uuid): Promise<string> {
  if (!DAY_RE.test(input.anchorOn)) throw new Error('care answer: anchorOn must be a local day (YYYY-MM-DD)');
  const id = newId();
  const vetVisitId = input.source === 'at_vet_tick' || input.source === 'visit_answer' ? input.vetVisitId : null;
  const dietTrialId = input.source === 'vet_started_trial' ? input.dietTrialId : null;
  const medicationId = input.source === 'vet_started_course' ? input.medicationId : null;
  if ((input.source === 'at_vet_tick' || input.source === 'visit_answer') && !vetVisitId) {
    throw new Error('care answer: a visit source must name its visit');
  }
  await getDb().runAsync(
    `INSERT INTO care_acknowledgements
       (id, pet_id, symptom_type, source, anchor_on, vet_visit_id, diet_trial_id, medication_id, retracts, created_at, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 0)`,
    [id, input.petId, input.sign, input.source, input.anchorOn, vetVisitId, dietTrialId, medicationId, new Date().toISOString()],
  );
  return id;
}

/**
 * Take an answer back (Undo, mock 2b): a new row whose `retracts` names it. The concern is
 * raised again on the server's next run. Throws when the answer is not on this phone:
 * a retraction needs the original's source and links, and inventing them would be refused.
 */
export async function retractCareAnswer(answerId: string, newId: () => string = uuid): Promise<string> {
  const db = getDb();
  const original = await db.getFirstAsync<LocalCareAnswer>(
    `SELECT * FROM care_acknowledgements WHERE id = ? AND retracts IS NULL`,
    [answerId],
  );
  if (!original) throw new Error('care answer: nothing to take back');
  const id = newId();
  await db.runAsync(
    `INSERT INTO care_acknowledgements
       (id, pet_id, symptom_type, source, anchor_on, vet_visit_id, diet_trial_id, medication_id, retracts, created_at, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      id, original.pet_id, original.symptom_type, original.source, original.anchor_on,
      original.vet_visit_id, original.diet_trial_id, original.medication_id, original.id,
      new Date().toISOString(),
    ],
  );
  return id;
}

/** Has this answer reached the server? False while it waits (offline, or behind a parent). */
export async function careAnswerLanded(answerId: string): Promise<boolean> {
  const row = await getDb().getFirstAsync<{ synced: number }>(
    `SELECT synced FROM care_acknowledgements WHERE id = ?`,
    [answerId],
  );
  return row?.synced === 1;
}

/** What the finding screen's one question may ask about: the pet's running trial, its active
 *  courses (newest first) and its latest visit, from the LOCAL mirror. Read only when the
 *  server wrote a care state (the screen's gate), so flag-off this read never runs. */
export async function readCareQuestionRecord(petId: string): Promise<{
  trial: CareQuestionTrial | null;
  courses: CareQuestionCourse[];
  latestVisit: CareQuestionVisit | null;
}> {
  const db = getDb();
  const [trial, courses, visit] = await Promise.all([
    getActiveTrialForPet(petId),
    db.getAllAsync<{ id: string; drug_name: string; started_at: string }>(
      `SELECT id, drug_name, started_at FROM medications
        WHERE pet_id = ? AND status = 'active'
        ORDER BY started_at DESC, created_at DESC`,
      [petId],
    ),
    db.getFirstAsync<{ id: string; visited_at: string }>(
      `SELECT id, visited_at FROM vet_visits
        WHERE pet_id = ? AND deleted_at IS NULL
        ORDER BY visited_at DESC, created_at DESC LIMIT 1`,
      [petId],
    ),
  ]);
  return {
    trial: trial ? { id: trial.id, startedAt: trial.startedAt, foodLabel: trial.foodLabel } : null,
    courses: courses.map((c) => ({ id: c.id, drugName: c.drug_name, startedAt: c.started_at })),
    latestVisit: visit ? { id: visit.id, visitedAt: visit.visited_at } : null,
  };
}
