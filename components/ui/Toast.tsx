import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Platform, Modal, Pressable, Alert,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { theme, shadows } from '../../constants/theme';
import { useToastStore } from '../../store/toastStore';
import { useEventStore } from '../../store/eventStore';
import { updateEvent, updateMealIntake } from '../../lib/db';
import { syncPendingEvents, syncPendingMeals } from '../../lib/sync';
import { formatTime } from '../../lib/utils';
import { IntakeChipRow, IntakeRating } from '../log/IntakeChipRow';

// Tab bar height from app/(tabs)/_layout.tsx — toast must clear it so it
// isn't occluded when the user lands back on a tabs screen after a log.
const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 80 : 60;

// Hold the toast open this long after a chip tap so the selected chip is
// visibly confirmed before dismiss. Per persona round in B-014 planning:
// snatching the toast immediately reads as the system overriding the
// input, and ~5s of pre-tap window is too short to honestly read all
// five WSAVA labels and tap deliberately.
const INTAKE_CONFIRM_HOLD_MS = 1500;

// Bottom-anchored post-log toast. Two affordances live here, both triggered
// by the same event (meal logged via the one-tap picker) and visible in the
// same moment:
//
//   1. "Change time" — backfill path for meals fed before the owner reached
//      their phone (Linear/Gmail "Undo send" pattern). Preserves Principle 1:
//      tap-to-log stays one tap.
//   2. WSAVA intake chips — owner-reported intake (refused / picked / some
//      / most / all). Rendered for food_type 'meal' and 'treat' (B-014;
//      treats added 2026-05-23 — treat refusal is a clinical signal).
//      Default stays null; never pre-stamped. 'other' opts out.
//
// Both affordances are skippable: the toast auto-dismisses with the user's
// last input preserved. If a third affordance is proposed for this toast,
// stop and reconsider — the surface is intentionally narrow.
export function Toast() {
  const { visible, payload, hide, patchOccurredAt, patchIntakeRating, rescheduleHide } = useToastStore();
  const { patchInToday } = useEventStore();

  const translateY = useRef(new Animated.Value(80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const [pickerOpen, setPickerOpen] = useState(false);
  // Local draft separate from the toast's authoritative occurredAt so the
  // picker can be opened, scrubbed, and cancelled without mutating the toast.
  const [draft, setDraft] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: visible ? 0 : 80,
        useNativeDriver: true,
        tension: 80,
        friction: 11,
      }),
      Animated.timing(opacity, {
        toValue: visible ? 1 : 0,
        duration: visible ? 180 : 140,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, translateY, opacity]);

  function openPicker() {
    if (!payload) return;
    setDraft(new Date(payload.occurredAt));
    setPickerOpen(true);
  }

  function cancelPicker() {
    setPickerOpen(false);
    setDraft(null);
  }

  async function savePicker() {
    if (!payload || !draft) return;
    setSaving(true);
    try {
      const iso = draft.toISOString();
      // Touching the picker means the user explicitly chose a time → flip
      // provenance from 'now' to 'manual' so the vet report and correlation
      // engine can distinguish witnessed-now from owner-backfilled later.
      await updateEvent(payload.eventId, {
        occurred_at: iso,
        severity: null,
        notes: null,
        occurred_at_source: 'manual',
      });
      patchInToday(payload.eventId, { occurred_at: iso });
      patchOccurredAt(iso);
      setPickerOpen(false);
      setDraft(null);
      // Dismiss the toast on save — the affirmative action is its own
      // confirmation; lingering with an updated time would just be noise.
      hide();
      syncPendingEvents().catch(console.error);
    } catch (e) {
      console.error('[toast] failed to update event time:', e);
      Alert.alert('Could not update time', 'Try again or edit from History.');
    } finally {
      setSaving(false);
    }
  }

  async function handleIntakeChange(next: IntakeRating | null) {
    if (!payload) return;
    // Optimistic update first so the chip lights immediately. Persistence and
    // sync follow; if either fails we surface and revert by reloading the
    // detail screen — the row in History will reload on next focus anyway.
    patchIntakeRating(next);
    patchInToday(payload.eventId, { intake_rating: next });
    // Cancel the original 5s dismiss in favour of a brief 1.5s confirmation
    // window so the user sees the selection light up before the toast goes.
    rescheduleHide(INTAKE_CONFIRM_HOLD_MS);
    try {
      await updateMealIntake(payload.eventId, next);
      syncPendingMeals().catch(console.error);
    } catch (e) {
      console.error('[toast] failed to update intake rating:', e);
      // Revert local state. The next focus on History/detail will refetch
      // from SQLite and confirm ground truth.
      patchIntakeRating(payload.intakeRating);
      patchInToday(payload.eventId, { intake_rating: payload.intakeRating });
      Alert.alert('Could not save intake', 'Try again from the meal\'s detail screen.');
    }
  }

  if (!payload && !visible) return null;

  const occurredDate = payload ? new Date(payload.occurredAt) : new Date();
  // One-glance reminder of what was just logged. Brand + product, trimmed
  // so a missing brand/product doesn't leave a stray space. Falls back to
  // the bare "Logged at HH:MM" line when neither is present.
  const foodName = [payload?.foodBrand, payload?.foodProductName]
    .filter(Boolean)
    .join(' ')
    .trim();
  // Intake capture renders for meals and treats. Treats opt in (PM call
  // 2026-05-23) because treat refusal is itself a clinical signal — a pet
  // declining a treat often precedes declining meals. Default stays null;
  // we never pre-stamp 'all', which would bias the intake data. 'other'
  // and unclassified foods stay opted out.
  const showIntake = payload?.foodType === 'meal' || payload?.foodType === 'treat';

  return (
    <>
      <Animated.View
        pointerEvents={visible ? 'box-none' : 'none'}
        style={[
          showIntake ? styles.wrapperCard : styles.wrapperPill,
          { opacity, transform: [{ translateY }] },
        ]}
      >
        <View style={showIntake ? styles.card : styles.pill}>
          <View style={styles.headerRow}>
            <View style={styles.labelCol}>
              {foodName ? (
                <Text style={styles.foodName} numberOfLines={1}>{foodName}</Text>
              ) : null}
              <Text style={foodName ? styles.subLabel : styles.label}>
                Logged at {formatTime(occurredDate)}
              </Text>
            </View>
            <TouchableOpacity
              onPress={openPicker}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Change time of this log"
            >
              <Text style={styles.action}>Change time</Text>
            </TouchableOpacity>
          </View>
          {showIntake && (
            <View style={styles.intakeWrap}>
              <IntakeChipRow
                value={payload?.intakeRating ?? null}
                onChange={handleIntakeChange}
                label={null}
                size="compact"
                onDark
              />
            </View>
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
        {/* Empty-onPress Pressable around the sheet so taps on the title
            or whitespace are captured here and don't fall through to the
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
  // Pill: original "Logged at HH:MM · Change time" shape for non-meal events.
  wrapperPill: {
    position: 'absolute',
    bottom: TAB_BAR_HEIGHT + 8,
    left: theme.space2,
    right: 88,
    alignItems: 'flex-start',
    zIndex: 50,
    elevation: 12,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colorNeutralDark,
    paddingHorizontal: theme.space2,
    paddingVertical: 12,
    borderRadius: theme.radiusFull,
    minHeight: 44,
    gap: theme.space2,
    ...shadows.md,
  },
  // Card: taller multi-row container for meal events with intake chips.
  // Sits ABOVE the FAB (not beside it like the pill) so the chip row can
  // span full width without colliding with the FAB. FAB is at bottom: 72,
  // height 56 → its top is at 128; card sits at 144 to clear it with a bit
  // of breathing room.
  wrapperCard: {
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
    justifyContent: 'space-between',
    gap: theme.space2,
  },
  labelCol: {
    flexShrink: 1,
    gap: 1,
  },
  foodName: {
    fontSize: theme.textMD,
    color: '#fff',
    fontWeight: theme.weightMedium,
  },
  label: {
    fontSize: theme.textMD,
    color: '#fff',
    fontWeight: theme.weightRegular,
    flexShrink: 1,
  },
  // Demoted "Logged at HH:MM" line shown beneath the food name.
  subLabel: {
    fontSize: theme.textSM,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: theme.weightRegular,
  },
  action: {
    fontSize: theme.textMD,
    color: '#fff',
    fontWeight: theme.weightMedium,
    textDecorationLine: 'underline',
  },
  intakeWrap: {
    // Subtle separator so the chip row reads as a related-but-distinct
    // affordance, not a second clickable action on the same line.
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.15)',
    paddingTop: theme.space1,
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
