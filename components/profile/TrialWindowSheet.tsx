// *Change the window* — CUL-1040 (spec §4.2, D1a/D3a/D4a; mock §3).
//
// The surface that closes CUL-156: a running trial's window can be changed on any
// day, not only the day it ends.
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
import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../constants/theme';
import { ChipGroup, type ChipGroupOption } from '../ui/ChipGroup';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SectionLabel } from '../ui/SectionLabel';
import { TextField } from '../ui/TextField';
import { ThemedText } from '../ui/ThemedText';
import {
  ladderIsExhausted,
  saveStateFor,
  windowOptionFor,
  windowOptionsFor,
  windowRefusalLine,
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
  visible: boolean;
  trial: TrialWindowSheetTrial | null;
  /** The RECORD's pet. Never `activePet` (C-9) — it is named in the refusals. */
  petName: string;
  busy?: boolean;
  /** A write that was refused, phrased by the host from `TrialWindowRefused`'s
   *  structured fields — never from its `message`, which is a diagnostic
   *  (`guards/ownerFacingCopy.test.ts`). Null clears it. */
  writeError?: string | null;
  onClose: () => void;
  /** The new TOTAL, plus the owner's optional statement about their vet. */
  onSave: (input: { targetDurationDays: number; vetDirected: boolean }) => void;
}

export function TrialWindowSheet({
  visible, trial, petName, busy = false, writeError = null, onClose, onSave,
}: Props) {
  const insets = useSafeAreaInsets();
  const [choice, setChoice] = useState<string | null>(null);
  const [customDays, setCustomDays] = useState('');
  const [vetDirected, setVetDirected] = useState(false);

  // EVERY OPEN STARTS CLEAN. A sheet that remembered the last total would offer a
  // number the owner chose against a window that has since moved — and the vet box
  // is a statement about THIS change, so carrying it over would attribute to a vet
  // a window the vet never named (§5.1, the assertion the report may not make).
  useEffect(() => {
    if (!visible) return;
    setChoice(null);
    setCustomDays('');
    setVetDirected(false);
  }, [visible]);

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

  const save = trial
    ? saveStateFor({
        selectedDays,
        currentTargetDays: trial.currentTargetDays,
        dayCounter: trial.dayCounter,
        petName,
      })
    : { canSave: false, reason: null };

  // The typed total's refusal goes on the FIELD, where the mistake was made; the
  // chip-set refusals (which today can only be the current window) go under the
  // chips. Same phrasing either way — one module owns both.
  const customError =
    choice === CUSTOM && customParsed !== null && trial
      ? windowRefusalLine({
          requestedDays: customParsed,
          currentTargetDays: trial.currentTargetDays,
          dayCounter: trial.dayCounter,
          petName,
        })
      : null;

  const summary =
    selectedOption && trial && !customError
      ? windowSummaryLines({ option: selectedOption, currentTargetDays: trial.currentTargetDays })
      : [];

  if (!trial) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
        <View
          style={[styles.sheet, { paddingBottom: insets.bottom + theme.space2 }]}
          accessibilityViewIsModal
        >
          <View style={styles.grabber} />
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
              onChange={setChoice}
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
                This trial has run past every length Culprit offers. Enter the new
                length in days below.
              </ThemedText>
            )}

            {choice === CUSTOM && (
              <View style={styles.customRow}>
                <TextField
                  testID="trial-window-custom"
                  value={customDays}
                  // Digits only, so the field can never hold a value the refusal
                  // has to explain twice.
                  onChangeText={(t) => setCustomDays(t.replace(/[^0-9]/g, ''))}
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
            <View style={styles.vetRow}>
              <ThemedText style={styles.vetLabel}>My vet asked for this</ThemedText>
              <Switch
                testID="trial-window-vet"
                value={vetDirected}
                onValueChange={setVetDirected}
                disabled={busy}
                trackColor={{ true: theme.colorAccent, false: theme.colorBorderStrong }}
                ios_backgroundColor={theme.colorBorderStrong}
                accessibilityLabel="My vet asked for this"
              />
            </View>

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
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: theme.colorScrim,
  },
  sheet: {
    backgroundColor: theme.colorSurface,
    borderTopLeftRadius: theme.radiusLarge,
    borderTopRightRadius: theme.radiusLarge,
    paddingTop: 10,
    paddingHorizontal: theme.space3,
    maxHeight: '90%',
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorBorderStrong,
    alignSelf: 'center',
    marginBottom: 14,
  },
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
