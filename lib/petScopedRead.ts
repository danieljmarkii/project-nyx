// A list read for ONE pet, held with the pet it was read for (CUL-2174).
//
// The Pet tab switches pets in place (CUL-618), so its lists outlive the pet they
// were read for. Held as bare rows, a failed read for the new pet left the previous
// pet's conditions and medicines on screen under the new pet's name, and their row
// actions wrote against them ("Log a dose" put a dose for the new pet on the old
// pet's course). A first failure, with nothing held, rendered the designed empty
// state over a read that never answered (C-12).
//
// So the rows carry their pet, and the screen asks for them BY pet: rows read for
// another pet are never returned, and a failed read for this pet is its own state
// with a retry, never the empty list. The vet visits card's `vetVisitsLoadedFor` is
// the same idea for one record; this is it for a list, with the failure kept.

export type PetScopedRead<T> =
  | { petId: string; status: 'loaded'; rows: T[] }
  | { petId: string; status: 'failed' };

export type PetScopedView<T> =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'loaded'; rows: T[] };

/** What the screen may draw for `petId`. Another pet's read, or none yet, is a wait:
 *  its rows are never handed back, whatever the loading flag says. */
export function viewForPet<T>(
  read: PetScopedRead<T> | null,
  petId: string | null,
  loading: boolean,
): PetScopedView<T> {
  if (loading || read === null || petId === null || read.petId !== petId) return { kind: 'loading' };
  if (read.status === 'failed') return { kind: 'failed' };
  return { kind: 'loaded', rows: read.rows };
}

/** The read after a load for `petId` settled. A failure keeps the last good rows only
 *  when they are THIS pet's (a same-pet refetch must not blank a history it already
 *  showed; the trial loader's stance); any other failure is the failed state. */
export function settlePetRead<T>(
  prev: PetScopedRead<T> | null,
  petId: string,
  outcome: { ok: true; rows: T[] } | { ok: false },
): PetScopedRead<T> {
  if (outcome.ok) return { petId, status: 'loaded', rows: outcome.rows };
  if (prev !== null && prev.petId === petId && prev.status === 'loaded') return prev;
  return { petId, status: 'failed' };
}

/** An in-place edit (an optimistic add, an end, a tally) applied only to `petId`'s
 *  loaded rows. Aimed at another pet's read, or a failed one, it changes nothing. */
export function updatePetRows<T>(
  prev: PetScopedRead<T> | null,
  petId: string,
  update: (rows: T[]) => T[],
): PetScopedRead<T> | null {
  if (prev === null || prev.petId !== petId || prev.status !== 'loaded') return prev;
  return { ...prev, rows: update(prev.rows) };
}
