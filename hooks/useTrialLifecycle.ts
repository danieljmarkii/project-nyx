// The diet trial's LIFECYCLE host: every write the trial card's own buttons make
// (Keep going, change the window, This trial is done, Stopped early), the state the
// two sheets behind them need, and the Replace hand-off. CUL-1299 (TS-3), trial-screen
// spec §2 S6 / S8, §3.9, §7 "The lifecycle host".
//
// It lived inline in the Pet tab until the trial got its own screen, which carries the
// same buttons (S8: with the flag on, every lifecycle action lives on the screen and
// nowhere else). Moved, not rewritten: every branch and every comment below is the Pet
// tab's, and `app/(tabs)/profile.trialLifecycle.test.tsx` was written against the
// inline version and stays green over this one.
//
// IT TAKES THE HOST'S TRIAL READ, IT DOES NOT MAKE ONE. `useDietTrial` keeps its state
// per instance, so calling it here would be a second loader for the same trial, which
// B-421 forbids and which could disagree with the card for a frame. The host passes the
// `input` and `reload` it already has.
//
// IT NAMES THE PET IT WAS GIVEN (C-9). The sheets and the refusal sentence resolve the
// pet from `petId`, never from `activePet`: on the Pet tab they are the same pet, and on
// the trial screen the route's pet is the one whose trial is on screen.
//
// The Modals it drives are drawn by `components/trial/TrialLifecycleSheets.tsx`.
import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';
import type { TrialCompletionEntry } from '../components/profile/TrialCompletionSheet';
import type { CompletionSheetTrial } from '../components/profile/TrialCompletionSheet';
import type { TrialWindowSheetTrial } from '../components/profile/TrialWindowPanel';
import type { TrialCardInput } from '../lib/dietTrialCard';
import { extensionDays, nextTargetDays } from '../lib/dietTrialCompletion';
import { changeTrialWindow, extendTrial, TrialWindowRefused } from '../lib/dietTrialSetup';
import { windowRefusedLine } from '../lib/trialWindowSheet';
import { trialStartDayKey } from '../lib/trialWindowDates';
import { getDietTrialProgress } from '../lib/analytics';
import { usePetStore, type Pet } from '../store/petStore';

export interface TrialLifecycle {
  /** The record's pet, resolved from `petId` (C-9). Null when the account does not
   *  hold it, and then the sheets draw nothing. */
  pet: Pet | null;
  /** `Keep going` — the card's inline button and the decision sheet's row. */
  extend: () => Promise<void>;
  /** The extension's write is in flight (the card's `busyAction`). */
  extending: boolean;
  /** Open the completion flow on a step. */
  openCompletion: (entry: TrialCompletionEntry) => void;
  /** Open the Manage door (change the window · replace the trial). */
  openManage: () => void;

  // ── What `TrialLifecycleSheets` draws from ───────────────────────────────────
  completionEntry: TrialCompletionEntry | null;
  closeCompletion: () => void;
  /** The trial the completion sheet writes against; null unless it is `active`. */
  sheetTrial: CompletionSheetTrial | null;
  sheetDayCounter: number;
  intakeDeclineHeadline: string | null;
  /** Re-read after the completion sheet's own write. */
  reload: () => void;
  manageVisible: boolean;
  closeManage: () => void;
  /** The window sheet's trial; null unless it is `active`. */
  windowSheetTrial: TrialWindowSheetTrial | null;
  savingWindow: boolean;
  windowError: string | null;
  clearWindowError: () => void;
  changeWindow: (input: { targetDurationDays: number; vetDirected: boolean }) => Promise<void>;
  /** `Replace the trial` chosen: arm the one-shot hand-off (C-22). */
  armReplace: () => void;
  /** The door finished dismissing: consume the armed request, true when it was armed. */
  takeReplace: () => boolean;
}

export function useTrialLifecycle(params: {
  petId: string | null;
  input: TrialCardInput | null;
  reload: () => void;
}): TrialLifecycle {
  const { petId, input: trialInput, reload: reloadTrial } = params;
  const pet = usePetStore((s) => (petId ? s.pets.find((p) => p.id === petId) : undefined)) ?? null;
  const petName = pet?.name;

  // B-417 PR 6 — which completion screen is open, if any. `null` is closed.
  const [completionEntry, setCompletionEntry] = useState<TrialCompletionEntry | null>(null);
  // The extension is a one-tap write with no confirm (see `handleExtendTrial`),
  // which makes a pending state non-optional rather than polish: without one the
  // owner taps the biggest button on the card, nothing visibly happens until the
  // write and reload land, and a slow write earns a second tap — two extensions
  // from one decision.
  const [extendingTrial, setExtendingTrial] = useState(false);

  /**
   * `Keep going` — B-417 PR 6 (§4.3). One implementation, called by BOTH the
   * milestone card's inline button and the overrun sheet's row, because the two
   * must never disagree about which day the extension counts from.
   *
   * ONE TAP, NO CONFIRM, DELIBERATELY. The named default is the whole point of
   * the affordance — Jordan's review said what stops her tapping "done" on day 56
   * is that keep-going "already has the four weeks filled in" — and putting a
   * dialog in front of the option that keeps a diet going would make the safe path
   * the slower one. The change is legible without a dialog: the card immediately
   * re-reads "Day 56 of 84" with a new end date, and the owner can extend again.
   */
  const handleExtendTrial = useCallback(async () => {
    const trial = trialInput?.trial;
    if (!trial?.id || extendingTrial) return;
    const progress = getDietTrialProgress(
      { startedAt: trial.startedAt, targetDurationDays: trial.targetDurationDays },
      Date.now(),
    );
    if (!progress) return;
    setCompletionEntry(null);
    setExtendingTrial(true);
    try {
      await extendTrial({
        trialId: trial.id,
        targetDurationDays: nextTargetDays({
          currentTargetDays: trial.targetDurationDays,
          dayCounter: progress.dayCounter,
          extraDays: extensionDays(trial.indication),
        }),
      });
      reloadTrial();
    } catch (e) {
      // A REFUSAL IS NOT A FAILURE — IT MEANS THIS CARD IS STALE (CUL-1039).
      //
      // Since the write path became one clamp, this tap can be refused where it
      // used to be a harmless no-op, and EVERY refusal arm says the same thing
      // about the same fact: the row is not what the card was rendered from.
      // `not_forward` — the stored window already meets or beats what this tap
      // would set, so the owner's intent is already satisfied. `not_running` — the
      // trial was ended, here or on another device. `not_found` — the row is gone.
      // In all three the write correctly did nothing and the fix is the same: re-read,
      // and let the card say what is true.
      //
      // So no alert on any of them. The existing copy is wrong twice over on the
      // arms it used to reach: "The trial is still running on its current window"
      // is FALSE when the refusal is `not_running`, and "have another go in a
      // moment" is advice to repeat something that cannot succeed, on every arm.
      // Re-routing without re-reading the copy is how a true string becomes a false
      // one (C-28) — so the string keeps the one job it is still true for, a write
      // that actually failed.
      if (e instanceof TrialWindowRefused) {
        reloadTrial();
      } else {
        console.error('[DietTrial] extend failed:', e);
        Alert.alert(
          'That didn’t save',
          'The trial is still running on its current window. Have another go in a moment.',
        );
      }
    } finally {
      setExtendingTrial(false);
    }
  }, [trialInput, reloadTrial, extendingTrial]);

  // ── CUL-1040 — the header's door and the window sheet behind it (§4.1/§4.2) ──
  //
  // TWO SHEETS, NOT ONE, because §4.1's two acts must never be confused: *Change
  // the window* keeps one continuous episode and is reversible; *Replace the trial*
  // ends it and is not. The door names both and opens neither by default.
  const [manageVisible, setManageVisible] = useState(false);
  const [savingWindow, setSavingWindow] = useState(false);
  const [windowError, setWindowError] = useState<string | null>(null);
  /**
   * `Replace the trial` chosen, waiting for the door's Modal to finish dismissing.
   *
   * A REF, NEVER STATE (C-22). It is a one-shot request consumed by a side effect,
   * and held in state an already-scheduled passive effect re-enters with the
   * pre-clear closure and fires twice — here, two presentations of the start form.
   * Cleared BEFORE the side effect, for the same reason.
   *
   * It exists because `StartTrialModal` is the one hand-off that still crosses a
   * Modal boundary: it is reached independently from a terminal card's header and
   * keeps a half-filled form alive across dismissals (`resumeTrialModalOnFocus`), so
   * folding it into the door is a wider change than this PR should make. Sequencing
   * it costs one ref. The start form stays on the Pet tab (B-535, spec §3.9), so the
   * HOST decides what a consumed request presents (`TrialLifecycleSheets`'s
   * `onReplaceTrial`).
   */
  const pendingAfterManage = useRef<'replace_trial' | null>(null);

  /**
   * The §4.2 write. One total, one optional vet statement, no confirm (the sheet's
   * own Save is the confirmation and the act is fully reversible — CUL-645).
   *
   * THE REFUSAL IS PHRASED HERE FROM STRUCTURED FIELDS, NEVER FROM `e.message`.
   * `guards/ownerFacingCopy.test.ts` fails the build on a display sink reading a
   * string off an error, and `TrialWindowRefused` carries `reason` /
   * `requestedDays` / `floorDays` / `currentTargetDays` / `dayCounter` precisely so
   * this can say something true (CUL-1039's handoff, point 2).
   *
   * It is reachable even though the sheet gates against the same floor, and the
   * gap is the point: the sheet gates against the HYDRATED card and the predicate
   * against the ROW. A card a sync behind, or a trial ended on another device, is
   * exactly the case where the owner deserves the reason rather than a silent
   * nothing — so every arm re-reads the trial and says what is true of it.
   */
  const handleChangeWindow = useCallback(
    async (input: { targetDurationDays: number; vetDirected: boolean }) => {
      const trial = trialInput?.trial;
      if (!trial?.id || savingWindow) return;
      setSavingWindow(true);
      setWindowError(null);
      try {
        await changeTrialWindow({
          trialId: trial.id,
          targetDurationDays: input.targetDurationDays,
          // false is recorded as false, never folded into null: the column keeps
          // three states and 0 vs NULL are indistinguishable DOWNSTREAM, which is
          // not the same as being interchangeable here.
          vetDirected: input.vetDirected,
        });
        setManageVisible(false);
        reloadTrial();
      } catch (e) {
        reloadTrial();
        if (e instanceof TrialWindowRefused) {
          setWindowError(
            windowRefusedLine({
              reason: e.reason,
              requestedDays: e.requestedDays,
              currentTargetDays: e.currentTargetDays,
              dayCounter: e.dayCounter,
              // The RECORD's pet (C-9): the pet this host was given, whose trial
              // `trialInput` is. A blank name falls back to second person inside the
              // phrasing, never to "the pet".
              petName: petName ?? '',
            }),
          );
        } else {
          console.error('[DietTrial] change window failed:', e);
          setWindowError('That didn’t save. The trial is still on its current window.');
        }
      } finally {
        setSavingWindow(false);
      }
    },
    [trialInput, reloadTrial, savingWindow, petName],
  );

  // What PR 6's sheets write against. The id rides on the card's INPUT (the
  // resolver never reads it) so the completion flow does not re-query a row this
  // screen already loaded — and so the sheet cannot end a different trial than the
  // one the card is showing.
  //
  // `status === 'active'` HERE IS CORRECT AND MUST NOT BECOME `isTrialRunning`
  // (B-422). The effective end withdraws BEHAVIOUR from a trial nobody ended; it
  // does not end the trial, and this sheet is the only way an owner can. Gating
  // it would take the completion action away from precisely the overrun trials
  // the staleness rule exists to get closed — §4.3's milestone "never expires and
  // re-surfaces until acted on". Same rule at `dietTrialSetup.getActiveTrialForPet`.
  const sheetTrial: CompletionSheetTrial | null =
    petId && trialInput?.trial?.id && trialInput.trial.status === 'active'
      ? {
          id: trialInput.trial.id,
          petId,
          startedAt: trialInput.trial.startedAt,
          targetDurationDays: trialInput.trial.targetDurationDays,
          indication: trialInput.trial.indication,
        }
      : null;
  const sheetDayCounter = trialInput?.trial
    ? getDietTrialProgress(
        {
          startedAt: trialInput.trial.startedAt,
          targetDurationDays: trialInput.trial.targetDurationDays,
        },
        trialInput.nowMs,
      )?.dayCounter ?? 1
    : 1;

  /** CUL-1040 — the window sheet's trial. Denominated the way the sheet is: a start
   *  DAY KEY (the end-date math takes one) and the day counter, not the raw row. It
   *  is null on anything but a running trial, so the sheet cannot open over a window
   *  that is a finished fact. */
  const windowSheetTrial: TrialWindowSheetTrial | null =
    trialInput?.trial?.id && trialInput.trial.status === 'active'
      ? {
          id: trialInput.trial.id,
          // `trialStartDayKey`, never a slice: on an ISO-instant `started_at` the
          // slice yields the UTC day and every chip's end date would sit a day off
          // the card's own (CUL-1040).
          startDayKey: trialStartDayKey(trialInput.trial.startedAt),
          currentTargetDays: trialInput.trial.targetDurationDays,
          dayCounter: sheetDayCounter,
        }
      : null;

  const openCompletion = useCallback((entry: TrialCompletionEntry) => setCompletionEntry(entry), []);
  const closeCompletion = useCallback(() => setCompletionEntry(null), []);
  const openManage = useCallback(() => setManageVisible(true), []);
  const closeManage = useCallback(() => { setManageVisible(false); setWindowError(null); }, []);
  const clearWindowError = useCallback(() => setWindowError(null), []);
  const armReplace = useCallback(() => { pendingAfterManage.current = 'replace_trial'; }, []);
  const takeReplace = useCallback(() => {
    const pending = pendingAfterManage.current;
    pendingAfterManage.current = null;
    return pending === 'replace_trial';
  }, []);

  return {
    pet,
    extend: handleExtendTrial,
    extending: extendingTrial,
    openCompletion,
    openManage,
    completionEntry,
    closeCompletion,
    sheetTrial,
    sheetDayCounter,
    intakeDeclineHeadline: trialInput?.intakeDeclineHeadline ?? null,
    reload: reloadTrial,
    manageVisible,
    closeManage,
    windowSheetTrial,
    savingWindow,
    windowError,
    clearWindowError,
    changeWindow: handleChangeWindow,
    armReplace,
    takeReplace,
  };
}
