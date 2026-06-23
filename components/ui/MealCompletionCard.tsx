import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Platform, Modal, Pressable, Alert,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { Check } from 'lucide-react-native';
import { theme, shadows } from '../../constants/theme';
import { useMomentStore } from '../../store/momentStore';
import { useEventStore } from '../../store/eventStore';
import { usePetStore } from '../../store/petStore';
import { updateEvent, updateMealIntake } from '../../lib/db';
import { syncPendingEvents, syncPendingMeals } from '../../lib/sync';
import { formatTime } from '../../lib/utils';
import { IntakeChipRow, IntakeRating } from '../log/IntakeChipRow';

// Tab bar height from app/(tabs)/_layout.tsx — the card must clear it so it
// isn't occluded when the user lands back on a tabs screen after a log.
const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 80 : 60;

// Hold the card open this long after a chip tap so the selected chip is visibly
// confirmed before dismiss. Per the B-014 persona round: snatching it away
// immediately reads as the system overriding the input.
const INTAKE_CONFIRM_HOLD_MS = 1500;

// Root-mounted MEAL completion card — the warmed bottom-card presentation of the
// completion moment (B-064). Replaces the old standalone post-log toast: a meal
// log is now ONE warm surface (gold beat + "Logged {brand}") that ALSO carries
// the meal follow-ups, instead of a full-screen beat chased by a separate toast.
//
// Store-driven (momentStore) so every meal-entry path — the /log picker
// (handlePickFood) and the FAB quick-meal (handleQuickMeal) — fires the same
// surface via showMeal(). The full-screen terminal beat for non-meal logs is a
// sibling presentation rendered by <CompletionMoment/>.
//
// Two affordances live here, both visible in the same moment:
//   1. "Change time" — backfill path for meals fed before the owner reached
//      their phone (Linear/Gmail "Undo send" pattern). Preserves Principle 1:
//      tap-to-log stays one tap.
//   2. WSAVA intake chips — owner-reported intake (refused / picked / some /
//      most / all). Rendered for food_type 'meal' and 'treat' (B-014; treats
//      added 2026-05-23 — treat refusal is itself a clinical signal). Default
//      stays null; NEVER pre-stamped. 'other' opts out.
//
// Both are skippable: the card auto-dismisses with the user's last input
// preserved (the "intake is not preference" invariant — capture stays optional,
// default-null, at peak recall).
//
// A THIRD affordance was deliberately spent here under B-156 PR B2b: the opt-in
// "+ Add a med given with this" combo line (meal/treat only). The surface's standing
// warning — "if a third affordance is proposed, stop and reconsider, it's
// intentionally narrow" — was honored, not waived: it's a quiet, visually-quietest
// line the ~99% no-med majority reads past (Principle 1), it never adds a tap to
// the no-med path, and it only renders for foods you'd actually hide a pill in. It
// hands off to the medication picker pre-bound to THIS meal (event id = the link,
// the meal's pet = the same-pet write target, food type = the inferred vehicle).
// The intake→adherence SAFETY coupling is deliberately NOT here — that's the gated,
// adversarial-reviewed PR B3. Before proposing a FOURTH affordance: stop.
export function MealCompletionCard() {
  const { visible, payload, hide, patchOccurredAt, patchIntakeRating, rescheduleHide } = useMomentStore();
  const { patchInToday } = useEventStore();
  const { activePet } = usePetStore();

  const translateY = useRef(new Animated.Value(80)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  // The gold "beat" — the mint check springs in with a warm-gold halo so the
  // card carries the moment's warmth without a full-screen takeover.
  const checkScale = useRef(new Animated.Value(0.6)).current;

  const [pickerOpen, setPickerOpen] = useState(false);
  // Local draft separate from the card's authoritative occurredAt so the picker
  // can be opened, scrubbed, and cancelled without mutating the card.
  const [draft, setDraft] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);

  // Only the meal presentation renders here; the beat is the sibling overlay.
  const isMeal = payload?.kind === 'meal';
  const shown = visible && isMeal;

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
    if (!isMeal) return;
    setDraft(new Date(payload.occurredAt));
    setPickerOpen(true);
  }

  function cancelPicker() {
    setPickerOpen(false);
    setDraft(null);
  }

  async function savePicker() {
    if (!isMeal || !draft) return;
    setSaving(true);
    try {
      const iso = draft.toISOString();
      // Touching the picker means the user explicitly chose a time → flip
      // provenance from 'now' to 'manual' so the vet report and correlation
      // engine can distinguish witnessed-now from owner-backfilled later.
      // Re-assert occurred_at_confidence: 'witnessed' — meals are always
      // witnessed (you see yourself put the bowl down; the B-010 found path
      // never applies), and updateEvent writes confidence on every UPDATE, so
      // omitting it would silently wipe the row's confidence to NULL. This is a
      // time edit, not a confidence reclassification; window bounds stay null.
      await updateEvent(payload.eventId, {
        occurred_at: iso,
        severity: null,
        notes: null,
        occurred_at_source: 'manual',
        occurred_at_confidence: 'witnessed',
      });
      patchInToday(payload.eventId, { occurred_at: iso });
      patchOccurredAt(iso);
      setPickerOpen(false);
      setDraft(null);
      // Dismiss on save — the affirmative action is its own confirmation;
      // lingering with an updated time would just be noise.
      hide();
      syncPendingEvents().catch(console.error);
    } catch (e) {
      console.error('[meal-card] failed to update event time:', e);
      Alert.alert('Could not update time', 'Try again or edit from History.');
    } finally {
      setSaving(false);
    }
  }

  async function handleIntakeChange(next: IntakeRating | null) {
    if (!isMeal) return;
    const eventId = payload.eventId;
    const prevRating = payload.intakeRating;
    // Optimistic update first so the chip lights immediately. Persistence and
    // sync follow; if either fails we surface and revert.
    patchIntakeRating(next);
    patchInToday(eventId, { intake_rating: next });
    // Swap the auto-dismiss for a brief confirmation window so the user sees the
    // selection light up before the card goes.
    rescheduleHide(INTAKE_CONFIRM_HOLD_MS);
    try {
      await updateMealIntake(eventId, next);
      syncPendingMeals().catch(console.error);
    } catch (e) {
      console.error('[meal-card] failed to update intake rating:', e);
      // Revert local state. The next focus on History/detail will refetch from
      // SQLite and confirm ground truth.
      patchIntakeRating(prevRating);
      patchInToday(eventId, { intake_rating: prevRating });
      Alert.alert('Could not save intake', 'Try again from the meal\'s detail screen.');
    }
  }

  // B-156 PR B2b — the opt-in combo entry. Dismiss THIS card and open the medication
  // picker pre-bound to this meal: the meal's event id (the paired_event_id link), the
  // meal's pet (the same-pet dose-write target — read from the payload, captured at
  // log time, never a re-read active pet), and the food type (→ inferred vehicle) flow
  // as route params; the picked dose lands linked via insertMedicationDose. Hiding the
  // card first avoids it lingering behind the picker modal or racing its auto-dismiss;
  // the dose confirmation will present its own "Logged together" card on return.
  function handleAddMed() {
    if (!isMeal) return;
    const foodName = [payload.foodBrand, payload.foodProductName].filter(Boolean).join(' ').trim();
    hide();
    router.push({
      pathname: '/log',
      params: {
        type: 'medication',
        pairedEventId: payload.eventId,
        pairedPetId: payload.petId,
        pairedFoodType: payload.foodType ?? '',
        pairedFoodName: foodName,
      },
    });
  }

  // Keep rendering through the dismiss fade (payload is preserved by hide()),
  // but never mount for a beat payload.
  if (!payload || payload.kind !== 'meal') return null;

  const occurredDate = new Date(payload.occurredAt);
  // One-glance reminder of what was just logged. Brand + product, trimmed so a
  // missing brand/product doesn't leave a stray space.
  const foodName = [payload.foodBrand, payload.foodProductName]
    .filter(Boolean)
    .join(' ')
    .trim();
  // Intake capture renders for meals and treats. Treats opt in (PM call
  // 2026-05-23) because treat refusal is itself a clinical signal. Default stays
  // null; never pre-stamped. 'other' and unclassified foods stay opted out.
  const showIntake = payload.foodType === 'meal' || payload.foodType === 'treat';
  const petName = activePet?.name ?? 'your pet';

  return (
    <>
      <Animated.View
        pointerEvents={shown ? 'box-none' : 'none'}
        style={[styles.wrapper, { opacity, transform: [{ translateY }] }]}
      >
        <View style={styles.card}>
          <View style={styles.headerRow}>
            {/* Gold beat: mint check + warm-gold halo, carrying the moment's
                warmth into the non-blocking card. */}
            <Animated.View style={[styles.checkBadge, { transform: [{ scale: checkScale }] }]}>
              <Check size={18} color={theme.colorMomentConfirm} strokeWidth={3} />
            </Animated.View>
            <View style={styles.labelCol}>
              <Text style={styles.title} numberOfLines={1}>
                {foodName ? `Logged · ${foodName}` : 'Logged'}
              </Text>
              <Text style={styles.subLabel}>{formatTime(occurredDate)}</Text>
            </View>
            <TouchableOpacity
              onPress={openPicker}
              hitSlop={12}
              style={styles.actionBtn}
              accessibilityRole="button"
              accessibilityLabel="Change time of this log"
            >
              <Text style={styles.action}>Change time</Text>
            </TouchableOpacity>
          </View>
          {showIntake && (
            <View style={styles.intakeWrap}>
              <Text style={styles.intakeLabel}>How much did {petName} eat?</Text>
              <IntakeChipRow
                value={payload.intakeRating ?? null}
                onChange={handleIntakeChange}
                label={null}
                size="compact"
                onDark
              />
            </View>
          )}
          {/* B-156 PR B2b — the opt-in combo line (meal/treat only). The quietest line
              on the card; the no-med majority reads past it, the few who hid a pill in
              the food tap it to add the linked dose. */}
          {showIntake && (
            <TouchableOpacity
              style={styles.comboRow}
              onPress={handleAddMed}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Add a medication given with ${petName}'s ${foodName || 'food'}`}
            >
              {/* Copy: "+ Add … given with this" — the "+ Add" frames it as logging an
                  existing fact and "given with this" pins the PAST tense to the meal, so
                  it can't read as "go give a med now" (the tense ambiguity the bare
                  "Gave a med with this?" carried — flagged in investigation §9 + the
                  B2b pm-feature-review). The banner on the next screen echoes it
                  ("…you gave with it"). */}
              <Text style={styles.comboText}>+ Add a med given with this</Text>
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>

      <Modal
        visible={pickerOpen}
        transparent
        animationType="fade"
        onRequestClose={cancelPicker}
        statusBarTranslucent
      >
        <Pressable style={styles.backdrop} onPress={cancelPicker} />
        {/* Empty-onPress Pressable around the sheet so taps on the title or
            whitespace are captured here and don't fall through to the
            absolute-positioned backdrop, silently dismissing the picker
            mid-edit. */}
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.sheetTitle}>When did this happen?</Text>
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
  // Sits ABOVE the FAB so the chip row can span full width without colliding
  // with it. FAB is at bottom: 72, height 56 → its top is at 128; the card
  // clears that with breathing room.
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
  // Mint ring on the dark card with a warm-gold halo — the celebrate warmth.
  checkBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
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
    color: '#fff',
    fontWeight: theme.weightMedium,
  },
  subLabel: {
    fontSize: theme.textSM,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: theme.weightRegular,
  },
  // 44pt min touch target (the 3am-test rule) — the underlined label alone is
  // 15pt; hitSlop helps but the container guarantees the floor.
  actionBtn: {
    minHeight: 44,
    justifyContent: 'center',
  },
  action: {
    fontSize: theme.textMD,
    color: '#fff',
    fontWeight: theme.weightMedium,
    textDecorationLine: 'underline',
  },
  intakeWrap: {
    // Subtle separator so the chip row reads as a related-but-distinct
    // affordance, not a second action on the same line.
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.15)',
    paddingTop: theme.space1,
    gap: 6,
  },
  intakeLabel: {
    fontSize: theme.textSM,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: theme.weightRegular,
  },
  // The opt-in combo entry (B-156 PR B2b). ≥44pt tappable (the 3am-test floor) via
  // minHeight; a faint divider so it reads as a separate, optional add-on beneath the
  // intake row, never a peer of the logged act. Deliberately the quietest line.
  comboRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
    paddingTop: theme.space1,
    minHeight: 44,
    justifyContent: 'center',
  },
  comboText: {
    fontSize: theme.textSM,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: theme.weightMedium,
  },

  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
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
    opacity: 0.4,
  },
});
