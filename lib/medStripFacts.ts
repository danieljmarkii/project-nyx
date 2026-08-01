// The Home medication strip's data loader (B-614 PR M2).
//
// The medication analog of `lib/dietTrialFacts.loadDietTrialFacts`: it turns the
// local mirror into the `MedStripInput` that the PURE `resolveMedStrips`
// (`lib/medStrip.ts`, PR M1) consumes. The split is the same one the diet-trial
// surfaces settled on — every JUDGEMENT lives in the pure resolver, every READ
// lives here — so the ten states are exercised in `medStrip.test.ts` without a
// database, and this file owns only the reads and the shape mapping.
//
// ── WHY THE LOCAL MIRROR, NOT SUPABASE ────────────────────────────────────────
// `app/(tabs)/profile.tsx` reads regimens straight from Supabase, which leaves the
// "Current medications" card blank in airplane mode. Home is the surface the wedge
// owner opens every day, so the strip reads the LOCAL mirror the sync layer keeps
// (migration 020's tables, `MEDICATION_SCHEMA_SQL`) — the same choice B-417 PR 2
// made for the trial card and widget.
//
// ── FAILURE POSTURE: A CONTEXT STRIP RENDERS NOTHING RATHER THAN SOMETHING WRONG ─
// If the core reads fail we return null and Home draws no strips. That is the
// honest degradation here and it is specifically the SAFE direction: a regimen
// card assembled from an unread dose list would print "No dose logged yet today"
// — reassurance-on-absence over a read that merely failed (N4). The pet-level
// intake-decline flag is a SEPARATE safety lane (it also leads the Signal zone
// above), so it is best-effort and defaults to `false` on its own failure without
// taking the whole strip down — the same scoping `dietTrialFacts` gives it.
import { getIntakeDecline, type Species } from './analytics';
import { getDb } from './db';
import {
  MED_STRIP_ADHOC_WINDOW_DAYS,
  type MedStripDoseRow,
  type MedStripInput,
  type MedStripItem,
  type MedStripRegimenRow,
} from './medStrip';

const MS_PER_DAY = 86_400_000;

// ── The reads (exported so a real `node:sqlite` runs the production strings) ───
// The `lib/db.ts` jest harness mocks `getAllAsync`, so these queries are otherwise
// unexercised until a device — and the load-bearing parts ARE the SQL: the
// soft-delete filter read through the parent event, the vehicle join that lets the
// resolver derive the in-doubt state, and the window bound. Same instrument and
// reasoning as `dietTrialFacts.test.ts` / `medicationQueries.test.ts`.

// The active regimens for one pet. `status = 'active'` is the lifecycle authority
// (§4.1, mirroring `diet_trials`); the caller trusts this filter, exactly as
// `resolveMedStrips` trusts that the regimens handed to it are already active.
// Selects only the columns `MedStripRegimenRow` carries — nothing the resolver
// does not read.
export const ACTIVE_REGIMENS_FOR_STRIP_SQL = `
  SELECT id, medication_item_id, drug_name, dose_amount,
         doses_per_day, started_at, target_duration_days
    FROM medications
   WHERE pet_id = ? AND status = 'active'
`;

// This pet's doses within the recency window, in `MedStripDoseRow` shape. Soft-
// delete is read THROUGH the parent event (`e.deleted_at`) — a dose carries no own
// `deleted_at` (migration 020). It is both filtered here AND selected: the resolver
// re-filters `deleted_at == null` as the single enforcement point (AC #10, pinned
// by fixtures), and this filter keeps the read cheap for a years-long chronic-med
// history without changing that contract.
//
// The vehicle LEFT JOIN carries the paired meal's `intake_rating` so the resolver
// can derive the B-156 in-doubt state (`isComboDoseInDoubt`) without a second read
// — the same join `dietTrialFacts.dosesQuery` uses, for the same reason.
//
// Both `ma.pet_id` and `e.pet_id` are filtered: they are equal by invariant
// (migration 023's same-pet trigger), so this is which index the planner can use,
// not a semantic change — `e.pet_id` + `e.occurred_at` is covered by
// `idx_events_pet_time`, the read this runs on every hydration tick.
export const RECENT_DOSES_FOR_STRIP_SQL = `
  SELECT ma.medication_id, ma.medication_item_id, ma.adherence, ma.dose_amount,
         ma.paired_event_id, e.occurred_at, e.deleted_at,
         vm.intake_rating AS paired_vehicle_intake
    FROM medication_administrations ma
    JOIN events e ON e.id = ma.event_id
    LEFT JOIN meals vm ON vm.event_id = ma.paired_event_id
   WHERE ma.pet_id = ? AND e.pet_id = ? AND e.deleted_at IS NULL
     AND e.occurred_at >= ?
`;

// The whole per-account drug cache — a small, organically-built library (B-117
// PR 3), so fetching it entire and indexing by id is cheaper than a per-med
// round-trip. `resolveMedStrips` names the drug via `drugDisplayName` over these.
export const ITEMS_FOR_STRIP_SQL = `
  SELECT id, generic_name, brand_name FROM medication_items_cache
`;

interface ItemRow {
  id: string;
  generic_name: string | null;
  brand_name: string | null;
}

/**
 * Assemble the strip's input from the local mirror, or null when the core record
 * could not be read (Home then draws no strips — see the failure-posture note).
 *
 * The lower bound over-fetches deliberately: `occurred_at` is a UTC instant and
 * the resolver decides recency on the owner's LOCAL day, so a bound one day wider
 * than the window is a guaranteed superset in every zone (max offset < 1 day). The
 * resolver re-clips to its own local-day window, so an extra day of rows is free.
 */
export async function loadMedStripInput(
  pet: { id: string; species: Species },
  nowMs: number = Date.now(),
): Promise<MedStripInput | null> {
  let regimens: MedStripRegimenRow[];
  let doses: MedStripDoseRow[];
  let itemRows: ItemRow[];
  try {
    // `getDb()` and the `Date`→ISO bound are both INSIDE the try: `getDb`
    // (openDatabaseSync) can throw, and the whole point of this block is that any
    // read-path failure resolves to `null` (Home draws no strips) rather than
    // rejecting — a reject would flow past the loader's stated contract.
    const db = getDb();
    const lowerIso = new Date(
      nowMs - (MED_STRIP_ADHOC_WINDOW_DAYS + 1) * MS_PER_DAY,
    ).toISOString();
    [regimens, doses, itemRows] = await Promise.all([
      db.getAllAsync<MedStripRegimenRow>(ACTIVE_REGIMENS_FOR_STRIP_SQL, [pet.id]),
      db.getAllAsync<MedStripDoseRow>(RECENT_DOSES_FOR_STRIP_SQL, [pet.id, pet.id, lowerIso]),
      db.getAllAsync<ItemRow>(ITEMS_FOR_STRIP_SQL),
    ]);
  } catch (e) {
    console.error('[MedStrip] load failed:', e);
    return null;
  }

  const items: Record<string, MedStripItem> = {};
  for (const r of itemRows) {
    items[r.id] = { generic_name: r.generic_name, brand_name: r.brand_name };
  }

  // Best-effort SAFETY lane — a failure here defaults to `false` (no med-strip
  // withhold) and does NOT take the strip down. This is the ONE withholding reason
  // that fails toward NOT-withholding, so it is a deliberate call, not an accident:
  //
  //   (1) It is an INDEPENDENTLY-REDUNDANT surface. The pet-level intake-decline
  //       fact reaches Home through the Signal zone, which is driven by the
  //       server-side `generate-signal` engine — a SEPARATE detection path
  //       (`generate-signal/summary.ts`: "a safety finding (intake_decline /
  //       symptom_worsening) drives the summary"), not this client `getIntakeDecline`
  //       read. Principle 3 leads Home with that safety card. So a failure here
  //       drops a COURTESY suppression on the med strip, never the primary surfacing.
  //   (2) It mirrors the shipped, reviewed `dietTrialFacts.readIntakeDecline`
  //       exactly — the wedge trial card already fails this read soft for the same
  //       reason. The med-SPECIFIC withholds (refused / missed / in-doubt) come from
  //       the core `Promise.all` above and fail CLOSED (a core failure → null → no
  //       card at all), so the only reason that fails soft is the redundant one.
  //
  // Data Scientist ✓ (redundancy verified against `generate-signal`; consistent
  // with the shipped diet-trial precedent). If a future change makes this the ONLY
  // surfacing of a pet-level safety fact, the default must flip to failing closed.
  let intakeDeclineActive = false;
  try {
    const decline = await getIntakeDecline(pet.id, pet.species, nowMs);
    intakeDeclineActive = decline.status === 'watch' && decline.flags.length > 0;
  } catch (e) {
    console.error('[MedStrip] intake-decline read failed:', e);
  }

  return { regimens, doses, items, nowMs, intakeDeclineActive };
}
