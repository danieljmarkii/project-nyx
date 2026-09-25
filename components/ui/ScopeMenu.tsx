import { ComponentType, Fragment, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TouchableOpacity, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, ChevronDown } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { SectionLabel } from './SectionLabel';
import { ThemedText } from './ThemedText';

// Any identity glyph the sheet can render before a label — a Lucide icon OR a
// custom family glyph (B-745). Both take the icon kit's size/color/strokeWidth, so
// this generic shape keeps ScopeMenu decoupled from either icon source (it stays a
// ui/ primitive with no feature-domain import).
type GlyphComponent = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

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
  icon?: GlyphComponent;
  // History v2's sheets (HV-9 / CUL-1166; spec §3.8, §3.9) — each optional, and a
  // row that sets none of them renders exactly as it always has.
  // A count at the row's end, already formatted ('1,094'). The caller decides when a
  // row may carry one (a read that hasn't answered shows none, never a 0).
  count?: string;
  // A quiet second line under the label ('since May 14', '4 not read').
  detail?: string;
  // A sub-row of the option above it, indented and a size down (a medication course
  // under Medication).
  nested?: boolean;
  // A section label drawn above this row, inside the sheet ('What the record holds',
  // a year over its months).
  section?: string;
  // What VoiceOver reads for the row when it says more than its label (its detail and
  // its count). Defaults to the label.
  accessibilityLabel?: string;
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
  // The pill's words when they are not the selected option's label: a window's short
  // name ('Since Jul 26' for the row 'Since the trial started'). Unlike
  // `overrideLabel`, the selected row stays selected. (HV-9)
  pillLabel?: string;
  // A count after the pill's words, semibold, never truncated: 'Vomit · 13'. (HV-9)
  pillCount?: string | null;
  // What VoiceOver reads for the pill when it says more than `prefix: label` (the
  // count, with its noun). (HV-9)
  pillAccessibilityLabel?: string;
  // A set long enough to run past the sheet's fold (History v2's type sheet, ~19 rows):
  // open with the selected row in view rather than at the top, and flash the scroll
  // indicator so the rows past the fold read as there, never as the end of the list
  // (B-146's hidden option, turned vertical). Off by default. (HV-9)
  openAtSelected?: boolean;
}

// How much of the list above the selected row stays in view when a sheet opens at it:
// about one row, so the owner can see it is not the top.
const SELECTED_ROW_PEEK = 48;

export function ScopeMenu({
  options, value, onChange, sheetLabel, accessibilityPrefix, overrideLabel,
  pillLabel: pillText, pillCount, pillAccessibilityLabel, openAtSelected,
}: Props) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  // One jump to the selected row per opening: a later layout (a count arriving and
  // resizing a row) must never pull the list back from where the owner scrolled.
  const landedOnSelected = useRef(false);

  function openSheet() {
    landedOnSelected.current = false;
    setOpen(true);
  }

  function landOnSelected(e: LayoutChangeEvent) {
    if (landedOnSelected.current) return;
    landedOnSelected.current = true;
    // An instant jump on opening, never animated: nothing moves under the owner's eye.
    scrollRef.current?.scrollTo({ y: Math.max(0, e.nativeEvent.layout.y - SELECTED_ROW_PEEK), animated: false });
  }

  const active = options.find((o) => o.key === value) ?? options[0];
  const pillLabel = overrideLabel ?? pillText ?? active.label;
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
        onPress={openSheet}
        activeOpacity={0.7}
        // Pill is ~32pt tall; expand the vertical tap zone to the 44pt floor
        // (Designer anti-pattern: sub-44pt targets without hitSlop). Vertical
        // ONLY — two ScopeMenus sit 8pt apart in the History header, so any
        // horizontal slop would overlap adjacent pills' tap zones (the same
        // reasoning as FilterChip). Width already clears 44pt from content.
        hitSlop={{ top: 8, bottom: 8 }}
        accessibilityRole="button"
        accessibilityLabel={pillAccessibilityLabel ?? `${accessibilityPrefix}: ${pillLabel}`}
      >
        <ThemedText
          style={[styles.pillLabel, filtered && styles.pillLabelActive]}
          numberOfLines={1}
        >
          {pillLabel}
        </ThemedText>
        {pillCount ? (
          // Its own text so the words ellipsize and the number never does: a cut
          // count is a wrong count.
          <ThemedText style={[styles.pillLabel, styles.pillCount, filtered && styles.pillLabelActive]}>
            {`· ${pillCount}`}
          </ThemedText>
        ) : null}
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
            <SectionLabel label={sheetLabel} header style={styles.sheetLabel} />
            {/* Longer sets (the 10-row event-type lens) can outgrow a small
                screen; the sheet caps its height and the rows scroll INSIDE it
                with the native indicator visible — never a hidden overflow. */}
            <ScrollView
              ref={scrollRef}
              style={styles.optionScroll}
              bounces={false}
              {...(openAtSelected ? { onLayout: () => scrollRef.current?.flashScrollIndicators() } : {})}
            >
              {options.map((o, i) => {
                const selected = overrideLabel == null && o.key === value;
                const isLast = i === options.length - 1;
                const Icon = o.icon;
                const check = selected ? <Check size={18} color={theme.colorAccent} strokeWidth={2.5} /> : null;
                const label = (
                  <ThemedText
                    style={
                      o.nested
                        ? [styles.optionLabel, styles.optionLabelNested, selected && styles.optionLabelSelected]
                        : [styles.optionLabel, selected && styles.optionLabelSelected]
                    }
                  >
                    {o.label}
                  </ThemedText>
                );
                // Every History v2 addition is drawn only when its field is set, so a
                // row that sets none renders the tree it always rendered.
                const row = (
                  <TouchableOpacity
                    key={o.section ? undefined : (o.key ?? 'all')}
                    style={
                      o.nested
                        ? [styles.optionRow, styles.optionRowNested, isLast && styles.optionRowLast]
                        : [styles.optionRow, isLast && styles.optionRowLast]
                    }
                    onPress={() => handleSelect(o.key)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={o.accessibilityLabel ?? o.label}
                    {...(openAtSelected && selected ? { onLayout: landOnSelected } : {})}
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
                      {o.detail ? (
                        <View style={styles.optionText}>
                          {label}
                          <ThemedText style={styles.optionDetail}>{o.detail}</ThemedText>
                        </View>
                      ) : (
                        label
                      )}
                    </View>
                    {o.count ? (
                      <View style={styles.optionEnd}>
                        <ThemedText style={[styles.optionCount, selected && styles.optionCountSelected]}>
                          {o.count}
                        </ThemedText>
                        {check}
                      </View>
                    ) : (
                      check
                    )}
                  </TouchableOpacity>
                );
                return o.section ? (
                  <Fragment key={o.key ?? 'all'}>
                    <SectionLabel label={o.section} header style={styles.sectionLabel} />
                    {row}
                  </Fragment>
                ) : (
                  row
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
    color: theme.colorAccentInk,
  },
  pillCount: {
    fontWeight: theme.weightSemibold,
    flexShrink: 0,
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
    color: theme.colorAccentInk,
    fontWeight: theme.weightMedium,
  },
  // ── History v2's rows (HV-9): each drawn only when its option field is set ──
  sectionLabel: {
    marginTop: theme.space2,
    marginBottom: theme.spaceMicro,
  },
  optionRowNested: {
    paddingLeft: theme.space2,
  },
  optionLabelNested: {
    fontSize: theme.textMD,
  },
  optionText: {
    flexShrink: 1,
  },
  optionDetail: {
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
    marginTop: theme.spaceMicro,
  },
  optionEnd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    flexShrink: 0,
  },
  optionCount: {
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
    fontVariant: ['tabular-nums'],
  },
  optionCountSelected: {
    color: theme.colorAccentInk,
  },
});
