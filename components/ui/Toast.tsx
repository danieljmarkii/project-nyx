import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Platform, Modal, Pressable, Alert,
} from 'react-native';

// Tab bar height from app/(tabs)/_layout.tsx — toast must clear it so it
// isn't occluded when the user lands back on a tabs screen after a log.
const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 80 : 60;
import DateTimePicker from '@react-native-community/datetimepicker';
import { theme, shadows } from '../../constants/theme';
import { useToastStore } from '../../store/toastStore';
import { useEventStore } from '../../store/eventStore';
import { updateEvent } from '../../lib/db';
import { syncPendingEvents } from '../../lib/sync';
import { formatTime } from '../../lib/utils';

// Bottom-anchored post-log confirmation toast. Mounted once at the root
// layout so it persists across modal dismissals (FAB sheet closes, log
// modal dismisses, etc.) and overlays whichever screen the user lands on.
//
// Pattern modeled on Linear/Gmail "Undo send" — the default tap-to-log path
// stays one tap (Principle 1); this surface is the escape hatch when the
// owner backfills a meal logged minutes after the fact.
export function Toast() {
  const { visible, payload, hide, patchOccurredAt } = useToastStore();
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

  if (!payload && !visible) return null;

  const occurredDate = payload ? new Date(payload.occurredAt) : new Date();

  return (
    <>
      <Animated.View
        pointerEvents={visible ? 'box-none' : 'none'}
        style={[
          styles.wrapper,
          { opacity, transform: [{ translateY }] },
        ]}
      >
        <View style={styles.pill}>
          <Text style={styles.label}>Logged at {formatTime(occurredDate)}</Text>
          <TouchableOpacity
            onPress={openPicker}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Change time of this log"
          >
            <Text style={styles.action}>Change time</Text>
          </TouchableOpacity>
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
        <View style={styles.sheet}>
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
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    // Clear the tab bar so the toast isn't occluded when the user lands back
    // on a tabs screen after a log. FAB sits at bottom: 72 (above tab bar);
    // toast sits just above the tab bar with the FAB's column reserved.
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
  label: {
    fontSize: theme.textMD,
    color: '#fff',
    fontWeight: theme.weightRegular,
    flexShrink: 1,
  },
  action: {
    fontSize: theme.textMD,
    color: '#fff',
    fontWeight: theme.weightMedium,
    textDecorationLine: 'underline',
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
