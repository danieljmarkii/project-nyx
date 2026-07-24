import { useState } from 'react';
import {
  Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, ChevronDown, type LucideIcon } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { SectionLabel } from './SectionLabel';

// The pill + bottom-sheet single-select scope control. This is the generalized
// form of the History date-scope pattern: a closed, mutually-exclusive choice
// rendered as a quiet pill that opens a sheet listing EVERY option as a
// full-width row — nothing can ever sit hidden off-screen, which is the failure
// mode of the h-scroll chip rail it replaces (B-146's original sin: the
// History event-type rail kept its edge-fade carve-out until a real owner
// couldn't find the Medication filter at all).
//
// ChipGroup is the other B-146-sanctioned shape for these sets. The split:
// ChipGroup wraps in-line where the options ARE the screen's content (capture
// forms); ScopeMenu tucks the set behind a pill where the options are a lens
// over the screen's content (list filters) and header space is scarce.

export interface ScopeMenuOption {
  // null is the default "everything" scope (no filter applied).
  key: string | null;
  label: string;
  // Optional identity glyph rendered before the label in the sheet. When any
  // option carries one, icon-less siblings get an empty slot so labels align.
  icon?: LucideIcon;
}

interface Props {
  options: ScopeMenuOption[];
  value: string | null;
  onChange: (key: string | null) => void;
  // SectionLabel shown at the top of the sheet (e.g. "Show events from").
  sheetLabel: string;
  // Prefix for the pill's accessibility label (e.g. "Date range: Last 7 days").
  accessibilityPrefix: string;
  // A transient scope that isn't one of the options (History's single-day
  // drill-in, B-308). When set it labels the pill and no option row reads
  // selected; picking any option switches away from it (upstream clears it).
  overrideLabel?: string | null;
}

export function ScopeMenu({
  options, value, onChange, sheetLabel, accessibilityPrefix, overrideLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();

  const active = options.find((o) => o.key === value) ?? options[0];
  const pillLabel = overrideLabel ?? active.label;
  // The pill tints when any non-default scope is applied so a filtered list is
  // always legible AS filtered from the header alone — "why is my history
  // short?" should never require opening the sheet to answer.
  const filtered = overrideLabel != null || value !== null;
  const hasIcons = options.some((o) => o.icon != null);

  function handleSelect(key: string | null) {
    onChange(key);
    setOpen(false);
  }

  return (
    <>
      <TouchableOpacity
        style={[styles.pill, filtered && styles.pillActive]}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
        // Pill is ~32pt tall; expand the vertical tap zone to the 44pt floor
        // (Designer anti-pattern: sub-44pt targets without hitSlop). Vertical
        // ONLY — two ScopeMenus sit 8pt apart in the History header, so any
        // horizontal slop would overlap adjacent pills' tap zones (the same
        // reasoning as FilterChip). Width already clears 44pt from content.
        hitSlop={{ top: 8, bottom: 8 }}
        accessibilityRole="button"
        accessibilityLabel={`${accessibilityPrefix}: ${pillLabel}`}
      >
        <Text
          style={[styles.pillLabel, filtered && styles.pillLabelActive]}
          numberOfLines={1}
        >
          {pillLabel}
        </Text>
        <ChevronDown
          size={15}
          color={filtered ? theme.colorAccent : theme.colorTextTertiary}
          strokeWidth={2}
        />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable style={styles.scrim} onPress={() => setOpen(false)} accessibilityLabel="Close" />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + theme.space2 }]}>
            <View style={styles.grabber} />
            <SectionLabel label={sheetLabel} style={styles.sheetLabel} />
            {/* Longer sets (the 10-row event-type lens) can outgrow a small
                screen; the sheet caps its height and the rows scroll INSIDE it
                with the native indicator visible — never a hidden overflow. */}
            <ScrollView style={styles.optionScroll} bounces={false}>
              {options.map((o, i) => {
                const selected = overrideLabel == null && o.key === value;
                const isLast = i === options.length - 1;
                const Icon = o.icon;
                return (
                  <TouchableOpacity
                    key={o.key ?? 'all'}
                    style={[styles.optionRow, isLast && styles.optionRowLast]}
                    onPress={() => handleSelect(o.key)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={o.label}
                  >
                    <View style={styles.optionMain}>
                      {hasIcons ? (
                        <View style={styles.optionIconSlot}>
                          {Icon ? (
                            <Icon
                              size={18}
                              color={selected ? theme.colorAccent : theme.colorTextSecondary}
                              strokeWidth={1.75}
                            />
                          ) : null}
                        </View>
                      ) : null}
                      <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                        {o.label}
                      </Text>
                    </View>
                    {selected ? <Check size={18} color={theme.colorAccent} strokeWidth={2.5} /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
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
    // Two pills can share a header row with a title; let each give ground
    // (ellipsizing its label) instead of pushing siblings off-screen.
    flexShrink: 1,
  },
  // Mirrors FilterChip's default active state so "this control is filtering"
  // reads in the same visual language everywhere.
  pillActive: {
    borderColor: theme.colorAccent,
    backgroundColor: theme.colorAccentLight,
  },
  pillLabel: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
    flexShrink: 1,
  },
  pillLabelActive: {
    color: theme.colorAccent,
  },
  // Sheet styles mirror PetSwitcherSheet so every bottom sheet dims and reads
  // identically (scrim, grabber, radius, safe-area padding).
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    // absoluteFill (not absoluteFillObject) — the SDK 57 idiom (#423).
    ...StyleSheet.absoluteFill,
    backgroundColor: theme.colorScrim,
  },
  sheet: {
    backgroundColor: theme.colorSurface,
    borderTopLeftRadius: theme.radiusLarge,
    borderTopRightRadius: theme.radiusLarge,
    paddingTop: 10,
    paddingHorizontal: theme.space3,
    maxHeight: '75%',
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
  optionScroll: {
    flexGrow: 0,
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
  optionMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    flexShrink: 1,
  },
  optionIconSlot: {
    width: 20,
    alignItems: 'center',
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
