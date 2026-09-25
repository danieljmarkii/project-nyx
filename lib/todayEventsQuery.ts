// Home's read of today's rows (`hooks/useEvents.ts`, `loadTodayEvents`), as a constant so
// a test can run the production string against the real local schema on `node:sqlite`
// (the `lib/historyPage.test.ts` harness) rather than trusting a mocked row's shape.

import type { SQLiteDatabase } from 'expo-sqlite';

// ── WHY IT JOINS WHAT IT JOINS ────────────────────────────────────────────────
// Every row Home draws goes through the shared day row's rules (History v2 HV-6 /
// CUL-1163, `lib/spineNode.ts`), and a rule can only read a field this query selected. A
// field left out does not fail loudly: the rule quietly reads "unrated", "unpaired", "no
// course". The meal's intake rating is the case that mattered: this read never selected
// it, so on every cold open of Home a refused bowl read as unrated and folded into
// "3 meals" (CUL-1121) however the run rule was written. So, one row per event (every join
// is 1:1, as in `getTimeline`), carrying:
//   • the meal's food and its recorded intake (`m.intake_rating`), for its chip and rule B;
//   • the weight's value (`weight_checks`), for "Weight · 8.2 lbs";
//   • the dose's item name (B-161), its course's name (`rx.drug_name`, CUL-1124: a course
//     typed in by hand has no item, and the join never borrows a name across pets), how it
//     was given, and its STORED pair (`paired_event_id`, GAP-3: the vehicle is never a
//     same-minute guess) with that meal's live intake (a soft-deleted vehicle nulls it,
//     so the dose's in-doubt flag drops with the evidence, B-156);
//   • the look's child (CUL-871): the Noticed card renders today's looks from these rows.
// Not the meal's reverse link to its doses (`PAIRED_DOSE_REVERSE_JOIN`, which the timeline
// read carries): Home learns a meal's doses from today's own rows, which an Undo edits in
// place, where a count read here would go stale over an undone dose and keep saying "with
// Prednisone". So one of TODAY's meals whose dose sits on an earlier day (reachable only by
// re-timing one of the two across midnight) is not seen as a vehicle here: CUL-1229. The
// other direction, today's dose paired to an earlier day's meal (a dose added from that
// meal's record, or a combo logged across midnight), is the dose row's, which reads its
// vehicle's intake off `paired_vehicle_intake` above.
// Home v1's Today strip reads none of the fields HV-6 added, so it draws exactly what it
// drew before.
//
// Read it through `readTodayEvents` (below), never bare: the bound it takes is a lexical
// pre-filter a day early, and the day is decided on parsed instants (C-40).
//
// Params, in placeholder order: pet_id, the SQL bound (`readTodayEvents`).
export const TODAY_EVENTS_SQL = `SELECT e.*, m.food_item_id, m.quantity, m.intake_rating,
        f.brand AS food_brand, f.product_name AS food_product_name, f.food_type,
        f.format AS food_format,
        wc.weight_kg AS weight_kg,
        ma.medication_item_id, ma.adherence, ma.how_given, ma.paired_event_id,
        pm.intake_rating AS paired_vehicle_intake,
        mi.generic_name AS drug_generic_name, mi.brand_name AS drug_brand_name,
        rx.drug_name AS regimen_drug_name,
        lk.outcome AS look_outcome, lk.words AS look_words, lk.notes AS look_note
 FROM events e
 LEFT JOIN meals m ON m.event_id = e.id
 LEFT JOIN food_items_cache f ON f.id = m.food_item_id
 LEFT JOIN weight_checks wc ON wc.event_id = e.id
 LEFT JOIN medication_administrations ma ON ma.event_id = e.id
 LEFT JOIN medication_items_cache mi ON mi.id = ma.medication_item_id
 LEFT JOIN medications rx ON rx.id = ma.medication_id AND rx.pet_id = e.pet_id
 LEFT JOIN events pe ON pe.id = ma.paired_event_id AND pe.deleted_at IS NULL
 LEFT JOIN meals pm ON pm.event_id = pe.id
 LEFT JOIN looks lk ON lk.event_id = e.id
 WHERE e.pet_id = ? AND e.occurred_at >= ? AND e.deleted_at IS NULL
 ORDER BY e.occurred_at DESC`;

// ── C-40: the day's bound is decided on parsed instants ───────────────────────
// `occurred_at` holds two spellings of one instant, a local write's `…T04:00:00.000Z` and a
// pulled row's `…T04:00:00+00:00`, and `'+'` sorts before `'.'`: a TEXT `>=` against local
// midnight dropped a row synced from another phone at exactly 12:00 AM, so a vomit logged
// then was missing from Home, rose included (the HV-6 adversarial pass, P1). The SQL bound
// is taken a whole day early, a generous lexical pre-filter and never the decision (the
// rule `lib/spineReads.ts` follows), and the day is decided here.
const BOUND_SLACK_MS = 24 * 3_600_000;

/** Today's rows for a pet, from `dayStart` (its local midnight) on, newest first. */
export async function readTodayEvents<T extends { occurred_at: string }>(
  db: Pick<SQLiteDatabase, 'getAllAsync'>,
  petId: string,
  dayStart: Date,
): Promise<T[]> {
  const startMs = dayStart.getTime();
  const rows = await db.getAllAsync<T>(TODAY_EVENTS_SQL, [petId, new Date(startMs - BOUND_SLACK_MS).toISOString()]);
  return rows.filter((r) => Date.parse(r.occurred_at) >= startMs);
}
