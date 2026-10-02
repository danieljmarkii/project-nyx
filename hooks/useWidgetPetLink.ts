import { useEffect, useRef } from 'react';
import { isWidgetPetTapSpent, spendWidgetPetTap } from '../lib/spentTaps';
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
//
// ── ONCE PER TAP (CUL-1119) ─────────────────────────────────────────────────
// The link is a one-shot request, never a standing instruction. The first version
// re-selected the widget's pet whenever the active pet differed from `?pet=`, and
// History is a tab that stays mounted with the widget's params in place — so every
// later switch in the app (the FAB's "Logging for" chip, the pet switcher) was
// reverted a frame after it happened, and the next log landed on the widget's pet.
// Now a tap is the pair (pet, nonce), spent in a ref BEFORE the switch (C-22): the
// switch re-renders the screen, and the effect's next run finds the tap gone.
//
// `nonce` is the doorway's `ts`. History passes it; the widget's day link carries
// one, and the day filter is consumed on the same nonce, so the pet and the day of
// one tap apply together. The log screen has none to pass (the widget's log links
// carry no `ts`, and the widget is frozen, H-7), so there the tap is the pet alone:
// once per mount, which for a modal is once per open.
//
// A tap WITH a nonce is spent for every instance at once (`lib/spentTaps.ts`, HV-11 /
// CUL-1168): the History tab mounts a fresh screen when `history_v2` flips, and a ref
// would let that screen select the widget's pet a second time. Without a nonce the ref
// is all there is (once per mount).
//
// STATED BLIND SPOT (C-41): the widget mints `ts` when it DRAWS, not when it is
// tapped, so two taps on one drawing send one nonce and the second does not re-apply
// the pet after an in-app switch (nor the day, which has always behaved this way).
// The fix is a per-tap signal from the app's side: CUL-1177.
export function useWidgetPetLink(petId: string | undefined, nonce?: string): void {
  const pets = usePetStore((s) => s.pets);
  const selectPet = usePetStore((s) => s.selectPet);
  const spentRef = useRef<string | null>(null);

  useEffect(() => {
    if (!petId) return;
    const tap = `${petId}|${nonce ?? ''}`;
    if (spentRef.current === tap || isWidgetPetTapSpent(petId, nonce)) return;
    // A cold start from the widget mounts the screen before the pet list has loaded.
    // Wait for it rather than spend the tap on an empty list.
    if (pets.length === 0) return;
    spentRef.current = tap;
    if (nonce) spendWidgetPetTap(petId, nonce);
    if (!pets.some((p) => p.id === petId)) return;
    // Read at the moment of the tap, never subscribed: a later switch must not re-run
    // this effect with a live reason to act.
    if (usePetStore.getState().activePet?.id === petId) return;
    selectPet(petId);
  }, [petId, nonce, pets, selectPet]);
}
