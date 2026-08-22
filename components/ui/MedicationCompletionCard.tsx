import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Platform, Modal, Pressable, Alert,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Check } from 'lucide-react-native';
import { theme, shadows } from '../../constants/theme';
import { useMomentStore } from '../../store/momentStore';
import { useEventStore } from '../../store/eventStore';
import { usePetStore } from '../../store/petStore';
import { getDoubleDoseFlag, updateDoseAdherence, updateDoseHowGiven, updateEvent } from '../../lib/db';
import { syncPendingMedicationAdministrations, syncPendingEvents } from '../../lib/sync';
import { formatTime } from '../../lib/utils';
import {
  isComboDoseInDoubt, isGivenAssumed, doseAdherencePrompt, comboInDoubtReason, doubleDoseNote,
  type DoseVehicle,
} from '../../lib/medications';
import { AdherenceChipRow, DoseAdherence } from '../log/AdherenceChipRow';
import { VehicleChipRow } from '../log/VehicleChipRow';

// Tab bar height from app/(tabs)/_layout.tsx — the card must clear it so it isn't
// occluded when the user lands back on a tabs screen after a log.
const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 80 : 60;

// Hold the card open this long after a chip tap (adherence OR vehicle) so the
// selection is visibly confirmed before dismiss (same rationale as the meal card's
// intake hold).
const CHIP_CONFIRM_HOLD_MS = 1500;

// Root-mounted MEDICATION completion card (B-117 PR 3) — the dose sibling of
// <MealCompletionCard/>. The same warmed bottom-card presentation of the
// completion moment, carrying the adherence chip row (given / partial / missed /
// refused) as the confirm-over-entry follow-up to a one-tap dose log.
//
// Store-driven (momentStore) via showMedication(), exactly like the meal card via
// showMeal(). Affordances: the adherence chips, the optional vehicle row, and the
// "Change time" backfill picker — the last added to match the meal card (a dose,
// like a meal, is often given minutes before the owner reaches their phone, so the
// auto-stamped time needs an on-the-fly correction without a trip to the detail
// screen). The full retroactive edit (notes, confidence, etc.) still lives on the
// PR 8 event-detail screen; this is the same Linear/Gmail "Undo send" quick edit
// the meal card offers, scoped to the witnessed point-in-time.
//
// Safety (spec §6): the dose is logged 'given' by the owner's affirmative tap; the
// chips let them DOWNGRADE (partial / missed / refused) — never an alarm, just an
// honest correction. A downgrade is persisted + synced like the meal intake edit.
export function MedicationCompletionCard() {
  const {
    visible, payload, hide, patchOccurredAt, patchAdherence, patchHowGiven, patchDoubleDose,
    rescheduleHide,
  } = useMomentStore();
  const { patchInToday } = useEventStore();
  const { activePet } = usePetStore();

  const translateY = useRef(new Animated.Value(80)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0.6)).current;

  const [pickerOpen, setPickerOpen] = useState(false);
  // Local draft separate from the card's authoritative occurredAt so the picker
  // can be opened, scrubbed, and cancelled without mutating the card (meal-card pattern).
  const [draft, setDraft] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);

  const isMedication = payload?.kind === 'medication';
  const shown = visible && isMedication;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: shown ? 0 : 80,
        useNativeDriver: true,
        tension: 80,
        friction: 11,
      }),
      Animated.timing(opacity, {
        toValue: shown ? 1 : 0,
        duration: shown ? 180 : 140,
        useNativeDriver: true,
      }),
      Animated.spring(checkScale, {
        toValue: shown ? 1 : 0.6,
        useNativeDriver: true,
        tension: 60,
        friction: 7,
      }),
    ]).start();
  }, [shown, translateY, opacity, checkScale]);

  function openPicker() {
    if (!isMedication) return;
    setDraft(new Date(payload.occurredAt));
    setPickerOpen(true);
  }

  function cancelPicker() {
    setPickerOpen(false);
    setDraft(null);
  }

  async function savePicker() {
    if (!isMedication || !draft) return;
    setSaving(true);
    try {
      const iso = draft.toISOString();
      // Touching the picker means the owner explicitly chose a time → flip
      // provenance from 'now' to 'manual' so the vet report + correlation engine
      // can tell witnessed-now from owner-backfilled later. Doses are always
      // witnessed point-in-time (you administer the dose yourself — the B-010
      // found/window path never applies to a med, exactly as edit-event.tsx does
      // for medication), and this card only ever edits a dose insertMedicationDose
      // just wrote as witnessed — so re-asserting it is a no-op that keeps the
      // claim explicit. Mirrors the meal card's savePicker.
      await updateEvent(payload.eventId, {
        occurred_at: iso,
        severity: null,
        notes: null,
        occurred_at_source: 'manual',
        confidence: { value: 'witnessed', earliest: null, latest: null },
      });
      patchInToday(payload.eventId, { occurred_at: iso });
      patchOccurredAt(iso);
      setPickerOpen(false);
      setDraft(null);
      // Dismiss on save — the affirmative action is its own confirmation; lingering
      // with an updated time would just be noise (meal-card parity).
      hide();
      syncPendingEvents().catch(console.error);
    } catch (e) {
      console.error('[medication-card] failed to update dose time:', e);
      Alert.alert('Could not update time', 'Try again or edit from History.');
    } finally {
      setSaving(false);
    }
  }

  async function handleAdherenceChange(next: DoseAdherence) {
    if (!isMedication) return;
    const eventId = payload.eventId;
    const prev = payload.adherence;
    // Captured up front, before any await: the payload read after the write is the
    // render-time closure, and these three are immutable for the life of the card.
    const { petId, medicationItemId, occurredAt } = payload;
    if (next === prev) return; // single-select no-op (tapped the active chip)
    // Optimistic update first so the chip lights immediately; persistence + sync
    // follow, and we revert + surface on failure (the meal-intake pattern).
    patchAdherence(next);
    rescheduleHide(CHIP_CONFIRM_HOLD_MS);
    try {
      await updateDoseAdherence(eventId, next);
      syncPendingMedicationAdministrations().catch(console.error);
    } catch (e) {
      console.error('[medication-card] failed to update adherence:', e);
      // Revert local state. The next focus on History/detail refetches ground truth.
      patchAdherence(prev);
      Alert.alert('Could not save', "Try again from the dose's detail screen.");
      return;
    }
    // B-157 (CUL-284) — the write succeeded, so re-run the §6.4 check INDEPENDENTLY,
    // exactly as the dose detail screen does on its own adherence edit. This is what
    // stops the note going stale: the detector fires only on a 'given' focal dose, so
    // a downgrade to missed/refused/partial must RETIRE a note already on screen (the
    // no-conflict result clears it), and a combo dose the owner resolves UP to 'given'
    // can newly surface one. Re-running the shared predicate, rather than reasoning
    // locally about which way the chip moved, keeps this surface on the one definition
    // (lib/medications.ts) — a second, screen-local rule is how the two surfaces would
    // start disagreeing about the same dose.
    //
    // A failure here is a display miss, never data loss, so it must not revert a good
    // adherence write — eat it (the detail screen recomputes on focus either way).
    // `next` is passed twice on purpose: once as the adherence to compute against, and
    // once as the precondition the store re-checks before landing the answer — so a
    // slower recheck from an earlier tap can never overwrite a later tap's verdict.
    getDoubleDoseFlag({ eventId, petId, medicationItemId, occurredAt, adherence: next })
      .then((flag) => patchDoubleDose(eventId, flag, next))
      .catch((e) => console.warn('[medication-card] double-dose recheck failed:', e));
  }

  // The descriptive twin of handleAdherenceChange (B-156 Slice B). The vehicle is
  // OPTIONAL and skippable — a tap on the active chip clears it back to null — and
  // carries no adherence/safety meaning, so this is the same optimistic write the
  // intake row uses, never an escalation. It never blocks the card's auto-dismiss:
  // an unanswered vehicle simply stays null ("not recorded").
  async function handleVehicleChange(next: DoseVehicle | null) {
    if (!isMedication) return;
    const eventId = payload.eventId;
    const prev = payload.howGiven;
    if (next === prev) return;
    patchHowGiven(next);
    rescheduleHide(CHIP_CONFIRM_HOLD_MS);
    try {
      await updateDoseHowGiven(eventId, next);
      syncPendingMedicationAdministrations().catch(console.error);
    } catch (e) {
      console.error('[medication-card] failed to update vehicle:', e);
      patchHowGiven(prev);
      Alert.alert('Could not save', "Try again from the dose's detail screen.");
    }
  }

  // Keep rendering through the dismiss fade (payload preserved by hide()), but
  // never mount for a non-medication payload.
  if (!payload || payload.kind !== 'medication') return null;

  const occurredDate = new Date(payload.occurredAt);
  // B-156 PR B2b — a COMBO dose (logged WITH a meal/treat) frames the card as "Logged
  // together" with a subline naming the drug + the food it rode in, so the one-act link
  // is legible; a STANDALONE dose keeps "Logged · {drug}" + the logged time. Neutral
  // "Logged" (never "Gave") either way: the title must not contradict a downgrade to
  // Missed/Refused on the chips below.
  const isCombo = !!payload.pairedFoodName;
  const title = isCombo
    ? 'Logged together'
    : (payload.drugName ? `Logged · ${payload.drugName}` : 'Logged');
  const subLabel = isCombo
    ? `${payload.drugName} · with ${payload.pairedFoodName}`
    : formatTime(occurredDate);
  const petName = activePet?.name ?? 'your pet';

  // B-156 PR B3 — the intake → adherence safety coupling on the card. A combo dose
  // whose linked vehicle was NOT finished (refused/picked) lands UNCONFIRMED (adherence
  // null, set in handlePickMedication) and is IN DOUBT: the chips show no pre-lit
  // 'given' and the prompt SHARPENS to "Did {pet} still get it?" with a one-line reason,
  // so an auto-dismiss never leaves a false 'given' on the record (clinical-guardrails
  // Pattern 2). The owner tapping any chip resolves it (adherence → non-null), which
  // re-derives inDoubt to false. A finished/standalone dose is unchanged.
  // (isCombo is the coarse display gate off pairedFoodName; the in-doubt decision is
  // vehicleIntake-driven — a finished-vehicle combo is isCombo=true but inDoubt=false —
  // so the two are deliberately distinct inputs, not redundant.)
  const inDoubt = isComboDoseInDoubt({
    isCombo,
    vehicleIntake: payload.vehicleIntake ?? null,
    adherence: payload.adherence,
  });

  // B-157 (CUL-284) — the §6.4 double-dose note, patched in once getDoubleDoseFlag
  // resolves (and re-patched, possibly to nothing, after an adherence change). Same
  // predicate and same copy string as the dose detail screen; the only difference is
  // the drug name, which here is the display-ready one the owner just tapped
  // (B-171 brand-preferred) rather than the detail screen's generic.
  //
  // Note what has no state: there is deliberately no "checked, no repeat" rendering.
  // The detector under-fires by design (§6.4's documented sparse-schedule tradeoff),
  // so a silent card means "nothing to raise", never "nothing happened" — §6.1's
  // absence-is-never-reassurance rule, which is exactly the rule an owner-facing
  // all-clear here would break.
  //
  // It cannot co-render with the in-doubt reason above: inDoubt requires a null
  // adherence and the detector requires 'given', so the two are mutually exclusive by
  // construction. Resolving an in-doubt dose UP to 'given' can surface this note, at
  // which point the in-doubt line is already gone.
  const doubleDoseCopy = payload.doubleDose?.conflict
    ? doubleDoseNote({
        drugName: payload.drugName,
        gapMinutes: payload.doubleDose.gapMinutes ?? 0,
      })
    : null;

  return (
    <>
    <Animated.View
      pointerEvents={shown ? 'box-none' : 'none'}
      style={[styles.wrapper, { opacity, transform: [{ translateY }] }]}
    >
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Animated.View style={[styles.checkBadge, { transform: [{ scale: checkScale }] }]}>
            <Check size={18} color={theme.colorMomentConfirm} strokeWidth={3} />
          </Animated.View>
          <View style={styles.labelCol}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            <Text style={styles.subLabel} numberOfLines={1}>{subLabel}</Text>
          </View>
          {/* "Change time" is scoped to a STANDALONE dose — where the subLabel IS the
              logged time, giving the exact 1:1 with the meal card (the button sits next
              to a shown time). A combo dose repurposes the subLabel to name the pairing
              ("{drug} · with {food}"), so a "Change time" there would point at no visible
              time and crowd an already-dense card; that dose's time stays editable on the
              detail screen. */}
          {!isCombo && (
            <TouchableOpacity
              onPress={openPicker}
              hitSlop={12}
              style={styles.actionBtn}
              accessibilityRole="button"
              accessibilityLabel="Change time of this dose"
            >
              <Text style={styles.action}>Change time</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.adherenceWrap}>
          {/* B-172 — confirm-to-correct. A pre-lit state the OWNER asserted is RESTATED with
              the correction named ("Pixel took it — tap to change."), not re-asked. It still
              ASKS wherever nothing was asserted: an in-doubt dose, an unset one, and a combo
              whose vehicle is not yet rated (isGivenAssumed — that 'given' is the app's
              default under uncertainty, not the owner's word). Passing the live adherence
              keeps this line in step with the chips through the 1500ms post-tap confirm hold. */}
          <Text style={styles.adherenceLabel}>
            {doseAdherencePrompt({
              petName,
              inDoubt,
              adherence: payload.adherence,
              givenIsAssumed: isGivenAssumed({
                isCombo,
                vehicleIntake: payload.vehicleIntake ?? null,
                adherence: payload.adherence,
              }),
            })}
          </Text>
          {/* In-doubt only: the faint reason, so the owner doesn't have to recall they
              marked the food refused on the now-dismissed meal card. Factual, never
              "fussy", never reassuring. */}
          {inDoubt ? (
            <Text style={styles.inDoubtReason}>{comboInDoubtReason({ petName })}</Text>
          ) : null}
          <AdherenceChipRow
            value={payload.adherence}
            onChange={handleAdherenceChange}
            label={null}
            size="compact"
            onDark
          />
        </View>
        {/* B-157 (CUL-284) — the calm double-dose check, at log time. Sits BELOW the
            adherence chips (the meal card's flag convention): the owner's muscle memory
            for the chips is untouched and the note is read on the way out, never in
            place of the thing they came to do. Above the optional vehicle row, though —
            a safety heads-up outranks a descriptive nicety.

            Non-interactive, and read as one summary node so a screen reader speaks the
            fact and its "worth double-checking" tail together instead of as an orphan
            line. Divider-only on the card's dark ground, mirroring the detail screen's
            deliberate NOT-the-rose-tint ruling: §6.4 is a flag, never an alarm, and the
            record cannot yet distinguish a mistaken second tap from a real second dose.
            The correction lives where it can be made properly — the chips here for the
            adherence, the dose's detail screen for a removal. */}
        {doubleDoseCopy && (
          <View
            style={styles.doubleDoseWrap}
            accessibilityRole="summary"
            accessibilityLabel={doubleDoseCopy}
          >
            <Text style={styles.doubleDoseText}>{doubleDoseCopy}</Text>
          </View>
        )}
        {/* B-156 Slice B — the optional, subordinate vehicle row. Skippable and
            default-null: the owner can ignore it entirely and the card still
            auto-dismisses; it never gates dismiss and reads clean when unset. */}
        <View style={styles.vehicleWrap}>
          <Text style={styles.vehicleLabel}>How was it given? (optional)</Text>
          <VehicleChipRow
            value={payload.howGiven}
            onChange={handleVehicleChange}
            label={null}
            size="compact"
            onDark
          />
        </View>
      </View>
    </Animated.View>

    {/* Time-edit picker — mirrors the meal card. Only reachable via the standalone
        dose's "Change time" button (the combo path never mounts it). */}
    <Modal
      visible={pickerOpen}
      transparent
      animationType="fade"
      onRequestClose={cancelPicker}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={cancelPicker} />
      {/* Empty-onPress Pressable around the sheet so taps on the title or whitespace
          are captured here and don't fall through to the absolute-positioned backdrop,
          silently dismissing the picker mid-edit. */}
      <Pressable style={styles.sheet} onPress={() => {}}>
        <Text style={styles.sheetTitle}>When was this dose given?</Text>
        {draft && (
          <DateTimePicker
            value={draft}
            mode="datetime"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            maximumDate={new Date()}
            onChange={(_e, date) => {
              if (Platform.OS === 'android') setPickerOpen(false);
              if (date) setDraft(date);
            }}
          />
        )}
        <View style={styles.sheetActions}>
          <TouchableOpacity onPress={cancelPicker} hitSlop={12} style={styles.sheetBtn}>
            <Text style={styles.sheetCancel}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={savePicker}
            hitSlop={12}
            style={styles.sheetBtn}
            disabled={saving}
          >
            <Text style={[styles.sheetSave, saving && styles.sheetSaveDisabled]}>Save</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // Sits above the FAB so the chip row can span full width without colliding with
  // it — same placement as the meal card.
  wrapper: {
    position: 'absolute',
    bottom: TAB_BAR_HEIGHT + 64,
    left: theme.space2,
    right: theme.space2,
    zIndex: 50,
    elevation: 12,
  },
  card: {
    backgroundColor: theme.colorNeutralDark,
    paddingHorizontal: theme.space2,
    paddingVertical: 12,
    borderRadius: theme.radiusLarge,
    gap: theme.space1,
    ...shadows.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
  },
  checkBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colorFillOnDark,
    borderWidth: 1.5,
    borderColor: theme.colorMomentConfirm,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: theme.colorMomentGlow,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 6,
  },
  labelCol: {
    flexGrow: 1,
    flexShrink: 1,
    gap: 1,
  },
  title: {
    fontSize: theme.textMD,
    color: theme.colorTextOnDark,
    fontWeight: theme.weightMedium,
  },
  subLabel: {
    fontSize: theme.textSM,
    color: theme.colorTextOnDarkSubtle,
    fontWeight: theme.weightRegular,
  },
  // 44pt min touch target (the 3am-test rule) — the underlined label alone is
  // ~15pt; hitSlop helps but the container guarantees the floor. Mirrors the meal card.
  actionBtn: {
    minHeight: 44,
    justifyContent: 'center',
  },
  action: {
    fontSize: theme.textMD,
    color: theme.colorTextOnDark,
    fontWeight: theme.weightMedium,
    textDecorationLine: 'underline',
  },
  adherenceWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colorDividerOnDark,
    paddingTop: theme.space1,
    gap: 6,
  },
  adherenceLabel: {
    fontSize: theme.textSM,
    color: theme.colorTextOnDarkSubtle,
    fontWeight: theme.weightRegular,
  },
  // The in-doubt reason line — fainter than the prompt, sits between it and the chips.
  // Calm, never an alarm colour: the rose flag lives on the chip-row downgrade, not here.
  inDoubtReason: {
    fontSize: theme.textXS,
    color: theme.colorTextOnDarkFaint,
    fontWeight: theme.weightRegular,
  },
  // B-157 — the double-dose note block. Same top-divider treatment as its siblings so
  // the card stays one calm stack (the meal card's flagWrap), and the text sits at the
  // card's readable weight rather than the vehicle row's faint one: it is subordinate
  // to the adherence question but must not read as fine print.
  doubleDoseWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colorDividerOnDark,
    paddingTop: theme.space1,
  },
  doubleDoseText: {
    fontSize: theme.textSM,
    lineHeight: theme.textSM * 1.4,
    color: theme.colorTextOnDarkSubtle,
    fontWeight: theme.weightRegular,
  },
  // Subordinate to the adherence block: a fainter divider + dimmer label so the
  // optional vehicle row reads as a quiet add-on under the primary "did they take
  // it?" question, never a peer of it.
  vehicleWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colorDividerOnDark,
    paddingTop: theme.space1,
    gap: 6,
  },
  vehicleLabel: {
    fontSize: theme.textSM,
    color: theme.colorTextOnDarkFaint,
    fontWeight: theme.weightRegular,
  },

  // Time-edit picker sheet — identical to the meal card's so the two completion
  // cards present the same "Change time" surface.
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: theme.colorScrimBackdrop,
  },
  sheet: {
    position: 'absolute',
    left: theme.space2,
    right: theme.space2,
    bottom: theme.space3,
    backgroundColor: theme.colorSurface,
    borderRadius: theme.radiusMedium,
    padding: theme.space3,
    gap: theme.space2,
    ...shadows.lg,
  },
  sheetTitle: {
    fontSize: theme.textLG,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  sheetActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.space3,
    marginTop: theme.space1,
  },
  sheetBtn: {
    paddingVertical: theme.space1,
    paddingHorizontal: theme.space1,
    minHeight: 44,
    justifyContent: 'center',
  },
  sheetCancel: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
  },
  sheetSave: {
    fontSize: theme.textMD,
    color: theme.colorAccent,
    fontWeight: theme.weightMedium,
  },
  sheetSaveDisabled: {
    opacity: theme.opacityDisabled,
  },
});
