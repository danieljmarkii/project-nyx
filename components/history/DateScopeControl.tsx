import { useState } from 'react';
import {
  Modal, Pressable, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, ChevronDown } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { SectionLabel } from '../ui/SectionLabel';

// The History time-scope control. Scope (when) is a single mutually-exclusive
// choice with long labels, so it's a quiet menu — NOT a chip rail. The old
// design crammed four date chips into a fixed row beside the title, which clipped
// "Last 30 days" off-screen with no way to scroll to it. A pill + bottom sheet
// (the same pattern as PetSwitcherSheet) never clips, keeps the full friendly
// labels, and frees the chip language for the event-type lens alone.
export type DatePreset = 'today' | '7d' | '30d' | null;

const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: null, label: 'All time' },
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
];

interface Props {
  value: DatePreset;
  onChange: (preset: DatePreset) => void;
}

export function DateScopeControl({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();

  const active = DATE_PRESETS.find((p) => p.key === value) ?? DATE_PRESETS[0];

  function handleSelect(preset: DatePreset) {
    onChange(preset);
    setOpen(false);
  }

  return (
    <>
      <TouchableOpacity
        style={styles.pill}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
        // Pill is ~32pt tall; expand the vertical tap zone to the 44pt floor
        // (Designer anti-pattern: sub-44pt targets without hitSlop).
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={`Date range: ${active.label}`}
      >
        <Text style={styles.pillLabel}>{active.label}</Text>
        <ChevronDown size={15} color={theme.colorTextTertiary} strokeWidth={2} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable style={styles.scrim} onPress={() => setOpen(false)} accessibilityLabel="Close" />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + theme.space2 }]}>
            <View style={styles.grabber} />
            <SectionLabel label="Show events from" style={styles.sheetLabel} />
            {DATE_PRESETS.map((p, i) => {
              const selected = p.key === value;
              const isLast = i === DATE_PRESETS.length - 1;
              return (
                <TouchableOpacity
                  key={p.key ?? 'all'}
                  style={[styles.optionRow, isLast && styles.optionRowLast]}
                  onPress={() => handleSelect(p.key)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={p.label}
                >
                  <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                    {p.label}
                  </Text>
                  {selected ? <Check size={18} color={theme.colorAccent} strokeWidth={2.5} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingLeft: 12,
    paddingRight: 10,
    paddingVertical: 6,
    borderRadius: theme.radiusFull,
    borderWidth: 1,
    borderColor: theme.colorBorderStrong,
    backgroundColor: theme.colorSurface,
  },
  pillLabel: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
  },
  // Sheet styles mirror PetSwitcherSheet so every bottom sheet dims and reads
  // identically (scrim, grabber, radius, safe-area padding).
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colorScrim,
  },
  sheet: {
    backgroundColor: theme.colorSurface,
    borderTopLeftRadius: theme.radiusLarge,
    borderTopRightRadius: theme.radiusLarge,
    paddingTop: 10,
    paddingHorizontal: theme.space3,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorBorderStrong,
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetLabel: {
    marginBottom: theme.space1,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
  },
  optionRowLast: {
    borderBottomWidth: 0,
  },
  optionLabel: {
    fontSize: theme.textLG,
    color: theme.colorTextPrimary,
  },
  optionLabelSelected: {
    color: theme.colorAccent,
    fontWeight: theme.weightMedium,
  },
});
