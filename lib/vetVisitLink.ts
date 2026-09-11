// The visit-link guard (CUL-945), in its own module.
//
// WHY IT IS NOT IN `lib/vetVisits.ts`, where it was first written. That file is the
// companion's whole model — three screens' reads and every one of its writes — and
// the two callers of the check below (`startRegimen`, `startDietTrial`) are reachable
// from HOME's import closure through a chain of type-only imports. Importing the
// model from them pulled ~1,400 lines of visit reads and writes into that closure,
// and `guards/homeWrites.test.ts` said so on the first run: three raw-SQL mutations
// suddenly inside the set it scans for a third Home write class.
//
// The guard was right and a marker would have been the wrong answer — nothing here
// is a Home write, the CLOSURE was the problem. So the check lives in a module that
// holds one SELECT and no mutation at all: small enough to sit in any bundle graph,
// and narrow enough that its presence in one says nothing about what that graph can
// write. C-33's rule, arrived at from the other side: scope by measurement.

import { getDb } from './db';

/**
 * A visit link this device can see is not this pet's.
 *
 * Its own class rather than a bare `Error` so a caller can tell it from a database
 * failure and say something true: the record was NOT written, and the reason is the
 * link rather than anything the owner typed. The message is a diagnostic, never
 * owner-facing — `guards/ownerFacingCopy.test.ts` forbids a display sink reading a
 * string off an error, and the call sites map this to their own copy.
 */
export class VetVisitLinkRefused extends Error {
  constructor(readonly vetVisitId: string, readonly petId: string) {
    super(`vet visit ${vetVisitId} does not belong to pet ${petId}`);
    this.name = 'VetVisitLinkRefused';
  }
}

/**
 * Does this visit belong to this pet, on this device?
 *
 * WHY THIS EXISTS AT ALL. Migration 067's `enforce_vet_visit_link_same_pet` raises
 * `23514` for a link across pets or accounts, and `23514` is TERMINAL
 * (`lib/syncQueue.ts`), so the FIRST push quarantines. What is lost is not the link
 * but the WHOLE PRESCRIPTION — drug, dose, schedule, indication — never recorded
 * server-side while it goes on rendering locally on Home, the widget and the
 * rundown. `updateRegimen` cannot clear the column (by design: provenance is set
 * once), so an owner edit re-arms the row and it re-quarantines. Permanently.
 * That is CUL-945, and it was latent only because no caller passed a link until VV-4.
 *
 * So the device answers first. `false` for a visit that is missing, soft-deleted, or
 * another pet's — a missing visit is refused rather than waved through, because the
 * server will refuse it too and the owner is standing here now.
 *
 * KNOWN LIMIT, stated rather than implied: a device that has not yet hydrated a
 * visit another device logged will answer `false` for a link that would in fact be
 * legal. That is the safe direction — it costs a provenance link the owner can set
 * later from the record, where the bricked state costs the prescription.
 */
export async function visitIsForPet(visitId: string, petId: string): Promise<boolean> {
  const rows = await getDb().getAllAsync<{ id: string }>(
    `SELECT id FROM vet_visits WHERE id = ? AND pet_id = ? AND deleted_at IS NULL LIMIT 1`,
    [visitId, petId],
  );
  return rows.length > 0;
}
