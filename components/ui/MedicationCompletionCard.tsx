import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Animated, Alert } from 'react-native';
import { Check } from 'lucide-react-native';
import { theme, shadows } from '../../constants/theme';
import { ThemedText } from './ThemedText';
import { sourceAfterPointEdit } from '../../lib/eventTimeEdit';
import { TimeEditSheet } from './TimeEditSheet';
import {
  removedNoticeCopy, HITSLOP_ACTION_LEFT, HITSLOP_ACTION_RIGHT,
} from '../../lib/completionCard';
import { useMomentStore } from '../../store/momentStore';
import { useEventStore } from '../../store/eventStore';
import { usePetStore } from '../../store/petStore';
import { getDoubleDoseFlag, getEventSource, updateDoseAdherence, updateDoseHowGiven, updateEvent } from '../../lib/db';
import { syncPendingMedicationAdministrations, syncPendingEvents } from '../../lib/sync';
import { formatTime } from '../../lib/utils';
import {
  isComboDoseInDoubt, isGivenAssumed, doseAdherencePrompt, comboInDoubtReason, doubleDoseNote,
  type DoseVehicle,
} from '../../lib/medications';
import { AdherenceChipRow, DoseAdherence } from '../log/AdherenceChipRow';
import { VehicleChipRow } from '../log/VehicleChipRow';

// The bar's real height, imported rather than re-derived: this file used to carry
// its own `Platform.OS === 'ios' ? 80 : 60` sourced by comment from
// app/(tabs)/_layout.tsx, which stopped defining it (CUL-599) — and the bar has
// since grown. The card must clear the bar so it is not occluded when the owner
// lands back on a tabs screen after a log.
import { TAB_HEIGHT } from '../nav/NyxTabBar';

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
// CUL-612 — UNDO. The reversal lives in momentStore.undo() so all three R1 cards
// share one definition of "undone"; local to this card is that the removal line
// REPLACES the body. That matters more here than anywhere: the adherence chips are
// the B-156 G1 fail-safe surface, and leaving them live over a removed dose would
// invite an adherence write against a row that is no longer in the record. Undo
// stays a REVERSAL and never becomes a second path to an affirmative — removing a
// dose can only reduce what the record claims, and an unanswered card still lands
// `unconfirmed`, exactly as before.
export function MedicationCompletionCard() {
  const {
    visible, payload, removed, hide, undo, patchOccurredAt, patchAdherence, patchHowGiven,
    patchDoubleDose, rescheduleHide, pauseDwell, resumeDwell,
  } = useMomentStore();
  const { patchInToday } = useEventStore();
  const { activePet, pets } = usePetStore();

  const translateY = useRef(new Animated.Value(80)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0.6)).current;

  const [pickerOpen, setPickerOpen] = useState(false);
  // No local draft: TimeEditSheet owns it, so opening and abandoning the picker
  // cannot touch the card's authoritative occurredAt (meal-card pattern).
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
    setPickerOpen(true);
  }

  async function savePicker(next: Date) {
    if (!isMedication) return;
    setSaving(true);
    try {
      const iso = next.toISOString();
      // Provenance MOVES ONLY WHEN THE TIME MOVES (CUL-701) — see the meal card's
      // savePicker for the full argument. Save is live the moment the sheet opens,
      // so a peek that scrubs nothing used to flip occurred_at_source from the
      // 'now' insertMedicationDose stamped to 'manual', asserting the owner chose
      // a time the app had stamped itself. That column is how the vet report and
      // the correlation engine tell a witnessed-now dose from an owner backfill.
      //
      // Nothing owner-authored is destroyed here, unlike on the meal card: a dose
      // is always 'now' at insert (insertMedicationDose hardcodes it — there is no
      // photo path onto this card), so the cost is the false claim alone. It goes
      // through the same shared predicate anyway, so the two cards cannot drift
      // and a dose path that DID carry a stamp would inherit the rule.
      const changed = next.getTime() !== new Date(payload.occurredAt).getTime();
      const source = sourceAfterPointEdit(await getEventSource(payload.eventId), changed);
      // Doses are always witnessed point-in-time (you administer the dose yourself
      // — the B-010 found/window path never applies to a med, exactly as
      // edit-event.tsx does for medication), and this card only ever edits a dose
      // insertMedicationDose just wrote as witnessed — so re-asserting it is a
      // no-op that keeps the claim explicit. Mirrors the meal card's savePicker.
      await updateEvent(payload.eventId, {
        occurred_at: iso,
        severity: null,
        notes: null,
        occurred_at_source: source,
        confidence: { value: 'witnessed', earliest: null, latest: null },
      });
      patchInToday(payload.eventId, { occurred_at: iso });
      patchOccurredAt(iso);
      setPickerOpen(false);
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

  // 'ignored' is silent (a second tap, or a card already gone); only a real failure
  // gets a word, and it names the other way in.
  async function handleUndo() {
    if (!payload) return;
    if ((await undo(payload.eventId)) === 'failed') {
      Alert.alert('Could not remove that dose', 'Try again, or remove it from History.');
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
  // CUL-614 — the nameless fallback says "Dose logged", never a bare "Logged". §5's
  // sentence rule is that a beat names the record, and a dose card that has lost its
  // drug name still knows it wrote a DOSE — dropping to the same word every other
  // register just retired is the one thing it must not do. Reachable only through
  // app/log.tsx's `drugDisplayName(...) ?? med.generic_name`, where a regimen with a
  // blank generic name yields '' (the profile path's `drug_name` is required by
  // canSaveRegimen), so this is the honest floor rather than dead code.
  const title = isCombo
    ? 'Logged together'
    : (payload.drugName ? `Logged · ${payload.drugName}` : 'Dose logged');
  const subLabel = isCombo
    ? `${payload.drugName} · with ${payload.pairedFoodName}`
    : formatTime(occurredDate);
  const petName = activePet?.name ?? 'your pet';
  // The removal line names the DOSE's pet, resolved from the payload — the
  // queue-then-switch guard the meal and named cards already carry. (The adherence
  // prompt above still reads the ACTIVE pet; that is a pre-existing gap on this
  // card, filed separately rather than widened into here.)
  const notice = removed
    ? removedNoticeCopy(pets.find((p) => p.id === payload.petId)?.name ?? petName)
    : null;

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
      {/* CUL-614 / §5 "Dwell" — the auto-dismiss stops while a finger is on the card
          and any interaction resets it. Wired at the ROOT because touch events bubble
          from every child, so the pause covers the whole gesture including the reading
          pause between two chip taps; a per-control version would only ever cover the
          taps themselves, which were never the part being lost. onTouchCancel matters
          as much as onTouchEnd: a gesture the responder system takes away (a scroll
          claiming it, a Modal mounting over it) ends there and nowhere else.

          NOT wired over the CUL-612 removal line, deliberately. That state has nothing
          to read, tap or answer — it is the one card state the pause is not for — and
          resuming arms a full interactive window, which would let a stray touch stretch
          a 2.4s "Removed" past the dwell chosen so a reversal does not outstay the log
          it reversed. */}
      <View
        style={styles.card}
        testID="medication-card-surface"
        onTouchStart={notice ? undefined : pauseDwell}
        onTouchEnd={notice ? undefined : resumeDwell}
        onTouchCancel={notice ? undefined : resumeDwell}
      >
        {notice ? (
          /* The removal line — no mark, no chips, no note. The adherence row in
             particular must go: it is a question about a dose that is no longer in
             the record. Announced politely; this state has no other confirmation
             for a screen-reader owner. */
          <View
            style={styles.labelCol}
            accessibilityRole="summary"
            accessibilityLiveRegion="polite"
            accessibilityLabel={notice.a11yLabel}
          >
            <ThemedText style={styles.title}>{notice.title}</ThemedText>
            <ThemedText style={styles.subLabel}>{notice.detail}</ThemedText>
          </View>
        ) : (
        <>
        <View style={styles.headerRow}>
          <Animated.View style={[styles.checkBadge, { transform: [{ scale: checkScale }] }]}>
            <Check size={18} color={theme.colorMomentConfirm} strokeWidth={3} />
          </Animated.View>
          <View style={styles.labelCol}>
            <ThemedText style={styles.title} numberOfLines={1}>{title}</ThemedText>
            <ThemedText style={styles.subLabel} numberOfLines={1}>{subLabel}</ThemedText>
          </View>
          {/* "Change time" is scoped to a STANDALONE dose — where the subLabel IS the
              logged time, giving the exact 1:1 with the meal card (the button sits next
              to a shown time). A combo dose repurposes the subLabel to name the pairing
              ("{drug} · with {food}"), so a "Change time" there would point at no visible
              time and crowd an already-dense card; that dose's time stays editable on the
              detail screen. */}
          {/* Undo renders for a COMBO dose too, unlike Change time. A combo is the
              densest, most error-prone path on this card (it was logged from
              another card, against a meal), so the one place a reversal is most
              likely needed is the one place the time picker withholds itself.
              Grouped so the header's wide gap applies once, to the pair. */}
          <View style={styles.actionPair}>
            <TouchableOpacity
              onPress={handleUndo}
              hitSlop={HITSLOP_ACTION_LEFT}
              style={styles.actionBtn}
              accessibilityRole="button"
              accessibilityLabel="Undo — remove this dose"
            >
              <ThemedText style={styles.action}>Undo</ThemedText>
            </TouchableOpacity>
            {!isCombo && (
              <TouchableOpacity
                onPress={openPicker}
                hitSlop={HITSLOP_ACTION_RIGHT}
                style={styles.actionBtn}
                accessibilityRole="button"
                accessibilityLabel="Change time of this dose"
              >
                <ThemedText style={styles.action}>Change time</ThemedText>
              </TouchableOpacity>
            )}
          </View>
        </View>
        <View style={styles.adherenceWrap}>
          {/* B-172 — confirm-to-correct. A pre-lit state the OWNER asserted is RESTATED with
              the correction named ("Pixel took it — tap to change."), not re-asked. It still
              ASKS wherever nothing was asserted: an in-doubt dose, an unset one, and a combo
              whose vehicle is not yet rated (isGivenAssumed — that 'given' is the app's
              default under uncertainty, not the owner's word). Passing the live adherence
              keeps this line in step with the chips through the 1500ms post-tap confirm hold. */}
          <ThemedText style={styles.adherenceLabel}>
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
          </ThemedText>
          {/* In-doubt only: the faint reason, so the owner doesn't have to recall they
              marked the food refused on the now-dismissed meal card. Factual, never
              "fussy", never reassuring. */}
          {inDoubt ? (
            <ThemedText style={styles.inDoubtReason}>{comboInDoubtReason({ petName })}</ThemedText>
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
            <ThemedText style={styles.doubleDoseText}>{doubleDoseCopy}</ThemedText>
          </View>
        )}
        {/* B-156 Slice B — the optional, subordinate vehicle row. Skippable and
            default-null: the owner can ignore it entirely and the card still
            auto-dismisses; it never gates dismiss and reads clean when unset. */}
        <View style={styles.vehicleWrap}>
          <ThemedText style={styles.vehicleLabel}>How was it given? (optional)</ThemedText>
          <VehicleChipRow
            value={payload.howGiven}
            onChange={handleVehicleChange}
            label={null}
            size="compact"
            onDark
          />
        </View>
        </>
        )}
      </View>
    </Animated.View>

    {/* The shared time-edit sheet (CUL-621) — this card carried its own inline copy
        of the meal card's until all three completion surfaces took one. Only
        reachable via the standalone dose's "Change time" button (the combo path
        never mounts it). Mounted conditionally, which is what pins the sheet's
        maximumDate to the moment the owner opened it.

        A dose is administered by the owner, so like a meal it is a witnessed point
        and the question is about occurrence — but it names the DOSE rather than
        inheriting the meal card's wording, because `title` is required precisely
        so each caller states which field it edits (CUL-606). */}
    {pickerOpen && (
      <TimeEditSheet
        value={new Date(payload.occurredAt)}
        title="When was this dose given?"
        saving={saving}
        onCancel={() => setPickerOpen(false)}
        onSave={savePicker}
      />
    )}
    </>
  );
}

const styles = StyleSheet.create({
  // Sits above the FAB so the chip row can span full width without colliding with
  // it — same placement as the meal card.
  wrapper: {
    position: 'absolute',
    bottom: TAB_HEIGHT + 64,
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
  // The reversal/correction cluster (CUL-612) — see the meal card for the sizing
  // rationale; the two R1 presentations keep the same action scale.
  actionPair: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
  },
  actionBtn: {
    minHeight: 44,
    justifyContent: 'center',
  },
  action: {
    fontSize: theme.textSM,
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

});
