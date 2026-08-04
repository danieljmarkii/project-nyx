// B-407 — the app-side READER for the widget's published pet-slot index.
//
// The widget's "Edit Widget" picker offers a build-time enum of "Pet 1"…"Pet 6"
// (app.json), and the app resolves each slot → pet through the D5 index the
// snapshot publisher writes into the App Group (lib/widgetSnapshot.ts →
// pets-index.json). Nothing in the app told the owner WHICH slot a pet holds, so
// binding a two-pet household was trial-and-error. This module lets the pet
// profile read that same authoritative index and name the pet's slot — a lookup,
// not a guess.
//
// Deliberately reads the PUBLISHED index rather than re-deriving with
// assignPetSlots(null, pets): a fresh derivation loses the tombstones that make
// slots sticky (B-086), so after a pet is removed it would name a DIFFERENT slot
// than the widget actually uses — the precise drift this line exists to prevent.
//
// iOS-only by nature: the App Group container is null on Android / an
// entitlement-less build, so the reader returns null and the profile simply
// renders no slot line (there is no widget to bind on those platforms anyway).
// The parse mirrors widgetSnapshot.readPreviousSlotIndex — a small, deliberate
// duplication that keeps this app-read seam off the publisher's heavy
// expo-sqlite import graph (the profile screen must not drag `getDb` in to show
// one caption).

import { getSnapshotDirectory } from './appGroup';
import { PET_SLOT_INDEX_FILENAME, petSlotLabel, type PetSlotIndex } from './widgetResolution';

// Read the currently-published pet-slot index from the App Group, or null when it
// is unavailable (non-iOS / no entitlement) or absent/corrupt (never published,
// or a partial write). Never throws — a failed read costs the profile its slot
// line, nothing more.
export function readPublishedSlotIndex(): PetSlotIndex | null {
  const dir = getSnapshotDirectory();
  if (!dir) return null;
  try {
    for (const entry of dir.list()) {
      if (entry.name === PET_SLOT_INDEX_FILENAME && 'textSync' in entry && typeof entry.textSync === 'function') {
        const parsed = JSON.parse(entry.textSync()) as PetSlotIndex;
        return parsed && Array.isArray(parsed.assignments) ? parsed : null;
      }
    }
  } catch (e) {
    console.warn('[widgetSlot] pet-slot index read failed:', e);
  }
  return null;
}

// Convenience: the "Pet N" label for one pet, read fresh from the published
// index. Returns null when the pet has no active slot or the index is
// unavailable. Thin wrapper over the pure petSlotLabel so callers import one thing.
export function readPetSlotLabel(petId: string): string | null {
  return petSlotLabel(readPublishedSlotIndex(), petId);
}
