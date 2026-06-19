import { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Animated, Platform, Alert,
} from 'react-native';
import { Check } from 'lucide-react-native';
import { theme, shadows } from '../../constants/theme';
import { useMomentStore } from '../../store/momentStore';
import { usePetStore } from '../../store/petStore';
import { updateDoseAdherence } from '../../lib/db';
import { syncPendingMedicationAdministrations } from '../../lib/sync';
import { formatTime } from '../../lib/utils';
import { AdherenceChipRow, DoseAdherence } from '../log/AdherenceChipRow';

// Tab bar height from app/(tabs)/_layout.tsx — the card must clear it so it isn't
// occluded when the user lands back on a tabs screen after a log.
const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 80 : 60;

// Hold the card open this long after a chip tap so the selection is visibly
// confirmed before dismiss (same rationale as the meal card's intake hold).
const ADHERENCE_CONFIRM_HOLD_MS = 1500;

// Root-mounted MEDICATION completion card (B-117 PR 3) — the dose sibling of
// <MealCompletionCard/>. The same warmed bottom-card presentation of the
// completion moment, carrying the adherence chip row (given / partial / missed /
// refused) as the confirm-over-entry follow-up to a one-tap dose log.
//
// Store-driven (momentStore) via showMedication(), exactly like the meal card via
// showMeal(). Leaner than the meal card by design: the dose is auto-stamped at
// log time (AC: "time auto-stamped"), so there is no "Change time" affordance here
// — backfilling / editing a dose's time is the PR 8 event-detail job. The one
// affordance is the adherence chips.
//
// Safety (spec §6): the dose is logged 'given' by the owner's affirmative tap; the
// chips let them DOWNGRADE (partial / missed / refused) — never an alarm, just an
// honest correction. A downgrade is persisted + synced like the meal intake edit.
export function MedicationCompletionCard() {
  const { visible, payload, patchAdherence, rescheduleHide } = useMomentStore();
  const { activePet } = usePetStore();

  const translateY = useRef(new Animated.Value(80)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0.6)).current;

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

  async function handleAdherenceChange(next: DoseAdherence) {
    if (!isMedication) return;
    const eventId = payload.eventId;
    const prev = payload.adherence;
    if (next === prev) return; // single-select no-op (tapped the active chip)
    // Optimistic update first so the chip lights immediately; persistence + sync
    // follow, and we revert + surface on failure (the meal-intake pattern).
    patchAdherence(next);
    rescheduleHide(ADHERENCE_CONFIRM_HOLD_MS);
    try {
      await updateDoseAdherence(eventId, next);
      syncPendingMedicationAdministrations().catch(console.error);
    } catch (e) {
      console.error('[medication-card] failed to update adherence:', e);
      // Revert local state. The next focus on History/detail refetches ground truth.
      patchAdherence(prev);
      Alert.alert('Could not save', "Try again from the dose's detail screen.");
    }
  }

  // Keep rendering through the dismiss fade (payload preserved by hide()), but
  // never mount for a non-medication payload.
  if (!payload || payload.kind !== 'medication') return null;

  const occurredDate = new Date(payload.occurredAt);
  // Neutral "Logged · {drug}" (never "Gave"): the title must not contradict a
  // downgrade to Missed/Refused on the chips below.
  const title = payload.drugName ? `Logged · ${payload.drugName}` : 'Logged';
  const petName = activePet?.name ?? 'your pet';

  return (
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
            <Text style={styles.subLabel}>{formatTime(occurredDate)}</Text>
          </View>
        </View>
        <View style={styles.adherenceWrap}>
          <Text style={styles.adherenceLabel}>Did {petName} take it?</Text>
          <AdherenceChipRow
            value={payload.adherence}
            onChange={handleAdherenceChange}
            label={null}
            size="compact"
            onDark
          />
        </View>
      </View>
    </Animated.View>
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
  adherenceWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.15)',
    paddingTop: theme.space1,
    gap: 6,
  },
  adherenceLabel: {
    fontSize: theme.textSM,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: theme.weightRegular,
  },
});
