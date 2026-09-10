// The intake door's HOST — the root-layout mount for `IntakeFirstMealSheet`
// (CUL-870 / N-3b; docs/nyx-daily-look-requirements.md §3.1a, §4.5).
//
// Thin on purpose. It exists so the sheet has one owner outside Home's import closure
// (`store/uiStore.ts`'s `IntakeDoorRequest` block carries that argument in full), and so
// the root layout stays a list of mounted surfaces rather than a place store wiring
// accumulates.
//
// KEYED ON THE PET, so a second open mounts a FRESH sheet rather than reviving the last
// one's step, its resolved food and its `nowPoint`. The sheet resolves its pre-fill once
// on mount, which is only correct if "mount" and "open" are the same event.

import { useCallback } from 'react';
import { useUiStore } from '../../store/uiStore';
import { IntakeFirstMealSheet } from './IntakeFirstMealSheet';

export function IntakeDoorHost() {
  const request = useUiStore((st) => st.intakeDoor);
  const closeIntakeDoor = useUiStore((st) => st.closeIntakeDoor);

  // Both outcomes close, and neither touches the Noticed card. `'saved'` is not
  // forwarded anywhere because nothing downstream needs it: the meal speaks for itself
  // through `showMeal`, and the card's selections are React state in a component this
  // sheet never rendered — they are kept by not being touched, which is the strongest
  // form of §3.1a's promise.
  const onClose = useCallback(() => closeIntakeDoor(), [closeIntakeDoor]);

  if (!request) return null;
  return (
    <IntakeFirstMealSheet
      key={request.petId}
      visible
      petId={request.petId}
      petName={request.petName}
      sex={request.sex}
      cardHasSelections={request.cardHasSelections}
      onClose={onClose}
    />
  );
}
