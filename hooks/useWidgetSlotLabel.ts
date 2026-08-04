import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { readPetSlotLabel } from '../lib/widgetSlot';

// B-407 — the "Pet N" widget-slot label for a pet, read from the published D5
// index (lib/widgetSlot). Returns null when the pet has no active slot or the
// index is unavailable (non-iOS / no entitlement / not published yet), so the
// caller renders nothing rather than a placeholder.
//
// Re-reads on focus (like the rest of the profile screen): the snapshot publisher
// writes the index on a debounce, so a just-added pet's slot may only exist by the
// time the owner next lands on the tab — and switching the active pet re-keys this
// on the new petId. The read is a small synchronous App Group file read; kept in a
// hook so the pure petSlotLabel stays independently testable.
export function useWidgetSlotLabel(petId: string | null | undefined): string | null {
  const [label, setLabel] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!petId) {
        setLabel(null);
        return;
      }
      try {
        setLabel(readPetSlotLabel(petId));
      } catch (e) {
        // Never let a slot-label read cost the profile its render.
        console.warn('[useWidgetSlotLabel] read failed:', e);
        setLabel(null);
      }
    }, [petId]),
  );
  return label;
}
