// *Change the window* — CUL-1040 (spec §4.2, D1a/D3a/D4a; mock §3).
//
// The surface that closes CUL-156: a running trial's window can be changed on any
// day, not only the day it ends.
//
// ── A PANEL, WITH NO PRESENTATION OF ITS OWN (C-14) ──────────────────────────
//
// It renders no `Modal`. `TrialManageSheet` is the one Modal, and it swaps THIS
// panel in for its door rows when the owner picks *Change the window*.
//
// That split is not tidiness. Shipped as its own `Modal`, the door's row handler
// closed one sibling Modal and presented another in the SAME React commit — and
// C-14 is the account of how that shape, from one presenter on iOS, wedged the beta
// log sheet until the app was force-quit for every multi-pet account. Measured by
// `code-reviewer`: this was the only site in the tree flipping two independently
// state-held sibling Modals in one handler, and the repo's two apparent precedents
// (`PetSwitcherSheet`, `EventTypeSheet`) both hand off to `router.push`, which is the
// already-solved `onNavigateAway` case and not this one.
//
// The shape it moved to is the shape the SIBLING FILE already ships:
// `TrialCompletionSheet` holds one unconditional `Modal` and switches a `step`
// between its decision rows and the forms behind them. `PetSwitcherPanel` /
// `PetSwitcherSheet` is the same split under C-14's own name for it.
//
// A component test cannot see any of this — jest renders two Modals happily, which
// is exactly how C-14's incident shipped past a well-covered component, and why
// `TrialManageSheet.test.tsx`'s own "exactly ONE Modal" assertion stayed green while
// the composition in `profile.tsx` mounted two clean components that still overlapped
// for a commit.
//
// ── PRESENTATION ONLY. EVERY DECISION IS IN `lib/trialWindowSheet.ts` ─────────
//
// Which totals are offered, which one is current, what each one's end date is,
// what the two refusals say, and whether `Save` can fire — all of it is a function
// over integers there, driven by that module's own tests. This file lays out chips
// and a switch. The forward-only rule (TE-3/D3a) is the reason the sheet exists in
// this shape, and a rule that can only be exercised through a renderer is a rule
// tested by pressing whichever chips happen to be mounted.
//
// ── TOTALS, NEVER DELTAS (TE-2/D1a) ─────────────────────────────────────────
//
// "How long is this trial now?", never "how much longer?". A vet says *"take it to
// twelve weeks"*. The milestone keeps its delta — there the owner has not been
// handed a number and the named one-tap default is what stops them tapping done at
// day 56 (Jordan, §4.3). Two moments, two registers, one write.
//
// ── WHY `Save` CARRIES NO CONFIRM (§4.2, CUL-645) ───────────────────────────
//
// The owner has crossed a sheet and picked a number, so the sheet's own Save IS
// the confirmation — and the act is fully reversible: re-open and change it again.
// That earns confirm-XOR-reversal on the reversal side. What free entry adds is
// not a confirm but a LEGIBILITY beat: `windowSummaryLines` echoes the typed total
// back in weeks and as an end date, in the line §4.2 already requires, which is
// where a fat-fingered `840` becomes visible before Save rather than after.
//
// ── AND WHAT IT MUST NEVER DO (TE-5) ────────────────────────────────────────
//
// Culprit never proposes an extension. Nothing here suggests a length, ranks one
// option above another, or hints that longer is better: the current window is
// marked because it is the current window, and nothing else is emphasised. The
// door is opened by the owner, and the sheet records what their vet decided.
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, TouchableOpacity, View } from 'react-native';
import { theme } from '../../constants/theme';
import { ChipGroup, type ChipGroupOption } from '../ui/ChipGroup';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SectionLabel } from '../ui/SectionLabel';
import { TextField } from '../ui/TextField';
import { ThemedText } from '../ui/ThemedText';
import {
  ladderIsExhausted,
  saveStateFor,
  windowEntryIsSettled,
  windowOptionFor,
  windowOptionsFor,
  windowSummaryLines,
  type WindowOption,
} from '../../lib/trialWindowSheet';
/** The sentinel chip value for free entry. Not a number, so it can never collide
 *  with a total. */
const CUSTOM = 'custom';
export interface TrialWindowSheetTrial {
  id: string;
  /** 'YYYY-MM-DD'. */
  startDayKey: string;
  currentTargetDays: number;
  /** From `getDietTrialProgress` — the day the owner is actually on. */
  dayCounter: number;
}
interface Props {
  /** The panel mounts only while its step is live, so there is no `visible` prop:
   *  the one Modal above it owns presentation. */
  trial: TrialWindowSheetTrial | null;
  /**
    * The pet whose trial this is — named in the refusals, so a wrong one accuses the
    * wrong animal.
    *
    * ⚠️ AN EARLIER WORDING SAID "never `activePet` (C-9)" AND THE CALL SITE PASSES
    * `activePet.name`. Both are fine and the docstring was the wrong half: this sheet
    * only ever opens over `trialInput`, which is read FOR the active pet, so the
    * record's pet and the active pet are the same row by construction. C-9's rule
    * binds a surface that can render a record belonging to some OTHER pet, and there
    * is no such route here. A prop doc that asserts a discipline its only call site
    * does not keep is worse than no doc: the next reader either "fixes" the call site
    * or stops trusting the comment (`pm-feature-review`).
    */
  petName: string;
  busy?: boolean;
  /** A write that was refused, phrased by the host from `TrialWindowRefused`'s
   *  structured fields — never from its `message`, which is a diagnostic
   *  (`guards/ownerFacingCopy.test.ts`). Null clears it. */
  writeError?: string | null;
  onClose: () => void;
  /**
   * The owner picked a different total, so anything said about the LAST one is
   * stale. The host clears `writeError` on this.
   *
   * It is a callback rather than the sheet clearing its own copy because
   * `writeError` describes a SUBMITTED total and the host is what submitted it. And
   * it is load-bearing rather than tidy: `writeError` wins the `??` below, so a
   * refusal left standing after a new selection is both false AND suppresses the live
   * reason for the total now chosen.
   */
  onSelectionChanged?: () => void;
  /** The new TOTAL, plus the owner's optional statement about their vet. */
  onSave: (input: { targetDurationDays: number; vetDirected: boolean }) => void;
}
export function TrialWindowPanel({
  trial, petName, busy = false, writeError = null,
  onClose, onSelectionChanged, onSave,
}: Props) {
  const [choice, setChoice] = useState<string | null>(null);
  const [customDays, setCustomDays] = useState('');
  const [vetDirected, setVetDirected] = useState(false);
  // EVERY OPEN STARTS CLEAN — and the panel UNMOUNTS between opens, so the reset is
  // the mount itself rather than an effect on a `visible` flag.
  //
  // A sheet that remembered the last total would offer a
  // number the owner chose against a window that has since moved — and the vet box
  // is a statement about THIS change, so carrying it over would attribute to a vet
  // a window the vet never named (§5.1, the assertion the report may not make).
  const options: WindowOption[] = useMemo(
    () =>
      trial
        ? windowOptionsFor({
            currentTargetDays: trial.currentTargetDays,
            dayCounter: trial.dayCounter,
            startDayKey: trial.startDayKey,
          })
        : [],
    [trial],
  );
  const chips: ChipGroupOption[] = useMemo(
    () => [
      ...options.map((o) => ({
        value: String(o.days),
        // "· now" marks the window the trial has, so "leave it alone" is an
        // explicit option rather than the Cancel button (§4.2).
        label: o.isCurrent ? `${o.label} · now` : o.label,
      })),
      { value: CUSTOM, label: 'Something else' },
    ],
    [options],
  );
  const customParsed = customDays.trim() === '' ? null : Number.parseInt(customDays, 10);
  const selectedDays =
    choice === null ? null : choice === CUSTOM ? customParsed : Number.parseInt(choice, 10);
  // The chosen chip, or the module's own option for a typed total. Both go through
  // the same summary lines, so free entry gets the end date the chips get.
  const selectedOption: WindowOption | null = useMemo(() => {
    if (selectedDays === null || !trial) return null;
    return (
      options.find((o) => o.days === selectedDays) ??
      windowOptionFor({
        days: selectedDays,
        startDayKey: trial.startDayKey,
        currentTargetDays: trial.currentTargetDays,
      })
    );
  }, [selectedDays, options, trial]);
  // The typed total's refusal goes on the FIELD, where the mistake was made; the
  // chip-set refusals (which today can only be the current window) go under the
  // chips. Same phrasing either way — one module owns both.
  //
  const save = trial
    ? saveStateFor({
        selectedDays,
        currentTargetDays: trial.currentTargetDays,
        dayCounter: trial.dayCounter,
        petName,
      })
    : { canSave: false, reason: null };
  // WITHHELD WHILE THE NUMBER IS STILL A PREFIX (`windowEntryIsSettled`). Recomputing
  // on every keystroke accused every valid total on the way in — `84` reddened at
  // `8`, and iOS announced it — so the refusal waits until another digit could not
  // rescue the value. `saveStateFor` is NOT relaxed by this, so an unsettled prefix
  // still cannot be saved: the silence is "not yet", never "fine".
  //
  // AND IT READS `save.reason`, NOT `windowRefusalLine` DIRECTLY — ONE PRECEDENCE RULE
  // (found by `code-reviewer`). Calling the phrasing function itself bypassed
  // `saveStateFor`'s equality check, and the two orders disagree in overrun: at target
  // 56 on day 61, a typed `56` hit `requested <= day` here and read "Nyx is already on
  // day 61." while the text beside Save read "That is the window you have now." — two
  // framings of one number, on one sheet, for the input the owner is most likely to
  // type (the value their own marked chip shows). Two surfaces over one record must
  // not answer the same question differently (C-4).
  const customError =
    choice === CUSTOM && customParsed !== null && windowEntryIsSettled(customParsed)
      ? save.reason
      : null;
  const summary =
    selectedOption && trial && !customError
      ? windowSummaryLines({ option: selectedOption, currentTargetDays: trial.currentTargetDays })
      : [];
  if (!trial) return null;

  return (
    <>
      <View style={styles.head}>
        <TouchableOpacity
          testID="trial-window-cancel"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.headCancel}
        >
          <ThemedText style={styles.headCancelText}>Cancel</ThemedText>
        </TouchableOpacity>
        <ThemedText style={styles.title}>Change the window</ThemedText>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollInner}
        keyboardShouldPersistTaps="handled"
      >
        {/* WHOSE LENGTH, AND WHOSE DECISION. The second clause is the whole
            reason the sheet is allowed to exist without violating TE-5: the app
            is recording a judgment, not making one. */}
        <ThemedText style={styles.intro}>
          {petName} is on day {trial.dayCounter}. Your vet decides the length — this
          just records it.
        </ThemedText>
        <SectionLabel label="How long is this trial now?" style={styles.label} />
        <ChipGroup
          options={chips}
          value={choice}
          // A NEW SELECTION CLEARS THE LAST WRITE'S REFUSAL. `writeError` wins the
          // `??` below, so a refusal left standing after the owner picks a
          // different total is both false and SUPPRESSES the live reason for the
          // new one. The stale error describes a total she is no longer choosing.
          onChange={(next) => { onSelectionChanged?.(); setChoice(next); }}
          // A closed single-select over a required field: one total is always
          // the answer, so a second tap must not clear back to nothing.
          allowDeselect={false}
          accessibilityLabel="How long is this trial now?"
          disabled={busy}
          style={styles.chips}
        />
        {/* Reachable on a long overrun (day 200 of 112), where every preset is
            behind the day counter. A designed line beats one lonely marked chip
            and no visible way forward (Principle 5). */}
        {ladderIsExhausted(options) && (
          <ThemedText testID="trial-window-exhausted" style={styles.hint}>
            {/* NAMES THE CHIP, not "below" — the day field only mounts once
                `Something else` is tapped, so the owner most likely to meet this
                state was told to type a number below, with nothing below. */}
            This trial has run past every length Culprit offers. Tap Something
            else to enter the new length.
          </ThemedText>
        )}
        {choice === CUSTOM && (
          <View style={styles.customRow}>
            <TextField
              testID="trial-window-custom"
              value={customDays}
              // Digits only, so the field can never hold a value the refusal
              // has to explain twice.
              onChangeText={(t) => {
                onSelectionChanged?.();
                setCustomDays(t.replace(/[^0-9]/g, ''));
              }}
              placeholder={String(trial.currentTargetDays)}
              keyboardType="number-pad"
              accessibilityLabel="The trial's whole length in days"
              error={customError}
              containerStyle={styles.customField}
            />
            <ThemedText style={styles.customUnit}>days</ThemedText>
          </View>
        )}
        {/* THE END DATE IS THE THING THE OWNER PLANS AROUND — shown for every
            option and recomputed per chip (§4.2). */}
        {summary.length > 0 && (
          <View testID="trial-window-summary" style={styles.summary}>
            {summary.map((line, i) => (
              <ThemedText
                key={line}
                style={i === 0 ? styles.summaryLead : styles.summaryDelta}
              >
                {line}
              </ThemedText>
            ))}
          </View>
        )}
        {/* D4a — ONE OPTIONAL QUESTION, UNCHECKED, NEVER REQUIRED. Checking it
            records the owner's statement, which is exactly how the report must
            attribute it: *"owner reports"*, because the app cannot verify a vet
            instruction and must never assert one. Unchecked is SILENCE, and
            silence is never rendered as "the owner did this on their own"
            (§5.1's two-sided rule). */}
        {/* THE LABEL IS PART OF THE TARGET. A bare `View` here left only the
            toggle tappable, where the Manage door's own rows correctly wrap both
            their lines in one responder — and a 15pt label beside a switch is the
            half an owner actually aims at. `accessible` joins the two into one
            announcement rather than a label and an orphaned control (C-6). */}
        <Pressable
          testID="trial-window-vet-row"
          style={styles.vetRow}
          accessible
          accessibilityRole="switch"
          accessibilityState={{ checked: vetDirected, disabled: busy }}
          accessibilityLabel="My vet asked for this"
          onPress={() => { if (!busy) setVetDirected((v) => !v); }}
        >
          <ThemedText style={styles.vetLabel}>My vet asked for this</ThemedText>
          <Switch
            testID="trial-window-vet"
            value={vetDirected}
            onValueChange={setVetDirected}
            disabled={busy}
            // No `accessibilityElementsHidden` here: `accessible` on the row above
            // already collapses its descendants into ONE element on iOS, which is
            // the same mechanism the Manage door's rows use (C-6). Hiding the
            // control outright would be a second, stronger claim — and it removes
            // the toggle from the queryable tree, so the row's own behaviour would
            // become unassertable (C-39's shape: a harness narrower than the API
            // hides what it cannot reach).
            trackColor={{ true: theme.colorAccent, false: theme.colorBorderStrong }}
            ios_backgroundColor={theme.colorBorderStrong}
          />
        </Pressable>
        {/* `disabled` asserts the control exists and is unavailable, so the
            reason is ALWAYS rendered beside it (C-7) — never a dimmed button on
            its own. `writeError` is the host's phrasing of a refused write, so a
            card that was a hydration behind the row says why rather than
            failing silently. */}
        {(save.reason || writeError) && (
          <ThemedText testID="trial-window-reason" style={styles.reason}>
            {writeError ?? save.reason}
          </ThemedText>
        )}
        <PrimaryButton
          testID="trial-window-save"
          label="Save the new window"
          disabled={!save.canSave || busy}
          loading={busy}
          onPress={() => {
            if (!save.canSave || selectedDays === null) return;
            onSave({ targetDurationDays: selectedDays, vetDirected });
          }}
          style={styles.save}
        />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
  },
  headCancel: {
    minHeight: 44,
    minWidth: 60,
    justifyContent: 'center',
  },
  headCancelText: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
  },
  title: {
    fontSize: theme.textLG,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    letterSpacing: theme.trackingTight,
  },
  scroll: {
    marginTop: theme.space1,
  },
  scrollInner: {
    paddingBottom: theme.space2,
  },
  intro: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextSecondary,
  },
  label: {
    marginTop: theme.space2,
  },
  chips: {
    marginTop: theme.space1,
  },
  hint: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextSecondary,
    marginTop: theme.space1,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    marginTop: theme.space2,
  },
  customField: {
    width: 110,
  },
  customUnit: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
  },
  summary: {
    marginTop: theme.space2,
  },
  summaryLead: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  summaryDelta: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextSecondary,
    marginTop: 2,
  },
  vetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space2,
    marginTop: theme.space3,
    minHeight: 44,
  },
  vetLabel: {
    flex: 1,
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
  },
  reason: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextSecondary,
    marginTop: theme.space2,
  },
  save: {
    marginTop: theme.space2,
  },
});
