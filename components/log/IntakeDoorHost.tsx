// The intake door's HOST — the root-layout mount for `IntakeFirstMealSheet`
// (CUL-870 / N-3b; docs/nyx-daily-look-requirements.md §3.1a, §4.5).
//
// Thin on purpose. It exists so the sheet has one owner outside Home's import closure
// (`store/uiStore.ts`'s `IntakeDoorRequest` block carries that argument in full), and so
// the root layout stays a list of mounted surfaces rather than a place store wiring
// accumulates.
//
// A SECOND OPEN IS A SECOND SHEET, which is what the panel's one-shot pre-fill read
// rests on: it resolves once on mount, so "mount" and "open" have to be the same event
// or a reopen would show the previous open's food and its `nowPoint` — a stale promise on
// a sheet whose title is a timestamp (C-10). What actually delivers that today is the
// `if (!request) return null` below: every close unmounts the sheet, and the one call
// site that opens it is unreachable while the Modal is up, so a reopen always passes
// through null. `key` is defensive against a future with two doors, not the mechanism —
// stated accurately here because the first draft credited the key, and a comment that
// names the wrong load-bearing line is what makes the real one look safe to remove.
// `IntakeDoorHost.test.tsx` asserts the lifecycle rather than either explanation.

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
