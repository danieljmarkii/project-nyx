// The diet trial's lifecycle SHEETS, drawn from `useTrialLifecycle` — CUL-1299 (TS-3).
//
// One host, mounted by whichever surface carries the trial's buttons: the Pet tab
// today, the trial's own screen behind `trial_screen` (spec §7 "The lifecycle host").
// It draws the two Modals the card's actions open and nothing else. A pushed stack
// screen is not a Modal, so it can present them; the rule that holds is C-14's, one
// Modal at a time, which the sequencing below keeps (`onDismissed`, never the row's
// own commit).
//
// `StartTrialModal` is NOT here. It stays mounted on the Pet tab, because
// `food-capture` exits with `router.dismissAll()` (which would pop a pushed screen and
// lose a half-filled form) and B-535's resume hangs off the Pet tab's focus effect. So
// Replace is the host's to decide: `onReplaceTrial` runs once the door has dismissed.
import { petPronouns } from '../../lib/utils';
import type { TrialLifecycle } from '../../hooks/useTrialLifecycle';
import { TrialCompletionSheet } from '../profile/TrialCompletionSheet';
import { TrialManageSheet } from '../profile/TrialManageSheet';

export function TrialLifecycleSheets({
  lifecycle,
  onReplaceTrial,
}: {
  lifecycle: TrialLifecycle;
  /** `Replace the trial`, consumed after the door's Modal has finished dismissing. */
  onReplaceTrial: () => void;
}) {
  const { pet } = lifecycle;
  if (!pet) return null;

  return (
    <>
      {/* B-417 PR 6 — the completion milestone's sheets (§4.3). Not mounted while
          closed: unlike StartTrialModal it has no half-filled form to preserve
          across a dismissal, and every answer on it is deliberately discarded on
          Cancel rather than pre-filled from a previous attempt. */}
      <TrialCompletionSheet
        entry={lifecycle.completionEntry}
        trial={lifecycle.sheetTrial}
        petName={pet.name}
        species={pet.species}
        pronouns={petPronouns(pet.sex ?? 'unknown')}
        dayCounter={lifecycle.sheetDayCounter}
        intakeDeclineHeadline={lifecycle.intakeDeclineHeadline}
        onClose={lifecycle.closeCompletion}
        onExtend={lifecycle.extend}
        onChanged={lifecycle.reload}
      />

      {/* CUL-1040 §4.1/§4.2 — ONE Modal, two steps: the door's two rows, and
          *Change the window* behind the first of them. `windowSheetTrial` is null on
          a terminal card, which disables that row rather than opening a window
          change over a trial that has ended. */}
      <TrialManageSheet
        visible={lifecycle.manageVisible}
        trial={lifecycle.windowSheetTrial}
        petName={pet.name}
        busy={lifecycle.savingWindow}
        writeError={lifecycle.windowError}
        onClose={lifecycle.closeManage}
        // The EXISTING flow, with its existing confirm. One active trial per pet is
        // a DB constraint, so the start form is the ordered end-the-running-one-first
        // sheet — which is what "Replace the trial" has always meant. It is ARMED
        // here and presented on `onDismissed`, never in the row's own commit (C-14).
        onReplaceTrial={lifecycle.armReplace}
        onDismissed={() => {
          if (lifecycle.takeReplace()) onReplaceTrial();
        }}
        // A new total makes the last refusal stale, and a stale refusal outranks the
        // live reason on the sheet — so the host clears what the host set.
        onSelectionChanged={lifecycle.clearWindowError}
        onSave={lifecycle.changeWindow}
      />
    </>
  );
}
