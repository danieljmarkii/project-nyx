import { useEffect } from 'react';
import { usePetStore } from '../store/petStore';

// Honor the `?pet=` a widget deep link carries (widget PR W5).
//
// A Home Screen widget is bound to ONE pet (D5) and deliberately never follows
// the in-app active-pet switch. The reverse direction still has to work: when
// Mochi's widget opens the log screen, the screen must be Mochi's — otherwise
// "when in doubt, app it out" hands the owner a form pointed at the wrong
// patient, which is exactly the multi-pet mis-log the widget track exists to
// avoid.
//
// This is the OPPOSITE of the B-086 hidden-switch hazard rather than an
// instance of it: the switch is the direct consequence of a tap the owner made
// on a widget that names its pet, and it lands on a screen that shows whose
// record it is. Unknown / archived / absent ids are ignored — a stale widget
// can never silently re-point the app at a pet the account no longer has.
export function useWidgetPetLink(petId: string | undefined): void {
  const pets = usePetStore((s) => s.pets);
  const activePetId = usePetStore((s) => s.activePet?.id ?? null);
  const selectPet = usePetStore((s) => s.selectPet);

  useEffect(() => {
    if (!petId || petId === activePetId) return;
    if (!pets.some((p) => p.id === petId)) return;
    selectPet(petId);
  }, [petId, activePetId, pets, selectPet]);
}
