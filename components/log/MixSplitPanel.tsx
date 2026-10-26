// "About how much of each?" — the split step of a first mix (Mixed meals row 5, CUL-2054;
// spec §7.1, §7.5, §11, P-2, P-3; CUL-2133).
//
// A split bar and the five fraction chips, first food on the left, NOTHING preselected: a
// default would be the app guessing the owner's bowl. A chip tap PICKS: the bar draws in on
// the shipped "compare" kind, and another tap redraws it. Save writes the bowl (PM,
// 2026-10-23, CUL-2133: the chip tap used to be the save, and on device a mistap was
// recorded before the owner could change their mind). The bar has already answered the
// pick, so Save closes at once; the old 540 ms hold is gone with the tap-as-save.
// "Other amounts…" takes what the owner measured, one unit for both foods, and its save
// stays off until both amounts are above zero. There is no "Not sure" (P-3).
//
// A panel, not a Modal: the mix route renders it in its own sheet layer, and the route is
// itself the platform modal, so nothing here stacks a second RN Modal (C-14).

import { useMemo, useState } from 'react';
import { Animated, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { colorRoles, theme } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';
import { ChipGroup } from '../ui/ChipGroup';
import { PrimaryButton } from '../ui/PrimaryButton';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useAppActive } from '../../hooks/useAppActive';
import { DRAW_IN_ORIGIN, useDrawIn } from '../motion/drawInMotion';
import {
  MIX_STOPS,
  MIX_UNITS,
  MIX_UNIT_LABEL,
  amountComponents,
  parseAmount,
  presetComponents,
  stopLabel,
  type MixFood,
  type MixUnit,
} from '../../lib/mixRatio';
import { shareGlyph } from '../../lib/mealBowlLabel';
import type { ComponentInput } from '../../lib/mealComposition';

type Food = MixFood & { rowName: string };

interface Props {
  first: Food;
  second: Food;
  /** Writes the bowl. Resolves false when the write failed (and said so). */
  onSave: (components: ComponentInput[]) => Promise<boolean>;
  /** The bowl is saved and the step can close. */
  onDone: (components: ComponentInput[]) => void;
}

export function MixSplitPanel({ first, second, onSave, onDone }: Props) {
  const reduced = useReducedMotion();
  const appActive = useAppActive();
  const [stop, setStop] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<'chips' | 'amounts'>('chips');
  const [unit, setUnit] = useState<MixUnit | null>(null);
  const [firstAmount, setFirstAmount] = useState('');
  const [secondAmount, setSecondAmount] = useState('');

  const { markStyle } = useDrawIn({
    kind: 'compare',
    count: 2,
    drawIn: stop !== null,
    identity: `split-${stop ?? 'none'}`,
    reducedMotion: reduced,
    appActive,
  });

  const measured = useMemo(
    () => (unit ? amountComponents(first, second, unit, parseAmount(firstAmount), parseAmount(secondAmount)) : null),
    [unit, first, second, firstAmount, secondAmount],
  );

  async function save(components: ComponentInput[]) {
    if (saving) return;
    setSaving(true);
    const ok = await onSave(components);
    // A failed write keeps the pick: the owner already chose it, and Save is one tap again.
    if (!ok) {
      setSaving(false);
      return;
    }
    onDone(components);
  }

  // A tap on the picked chip is not a way back to nothing: the pick stays.
  function pickStop(next: string | null) {
    if (next === null || saving) return;
    setStop(Number(next));
  }

  function savePicked() {
    if (stop === null) return;
    void save(presetComponents(first, second, stop));
  }

  function saveMeasured() {
    // The button is off until both amounts are above zero; this is the same rule, held.
    if (!measured) return;
    void save(measured);
  }

  const firstShare = stop !== null ? MIX_STOPS[stop] : null;

  return (
    <View style={styles.root}>
      <ThemedText style={styles.title} accessibilityRole="header">
        About how much of each?
      </ThemedText>

      {mode === 'chips' ? (
        <>
          {/* The bar: an outline until a split is picked (a grey fill read as a loading
              skeleton on device, CUL-2133), then the two foods as two segments, first on
              the left, drawing in from their left edges, each carrying its own fraction.
              Decorative to assistive tech: the chip just picked says the same in words. */}
          <View
            style={[styles.track, firstShare === null && styles.trackEmpty]}
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
          >
            {firstShare !== null && (
              <>
                <Animated.View style={[styles.segment, styles.segmentFirst, { flex: firstShare }, markStyle(0)]}>
                  <ThemedText style={styles.segmentText}>{shareGlyph(firstShare)}</ThemedText>
                </Animated.View>
                <Animated.View style={[styles.segment, styles.segmentSecond, { flex: 1 - firstShare }, markStyle(1)]}>
                  <ThemedText style={styles.segmentText}>{shareGlyph(1 - firstShare)}</ThemedText>
                </Animated.View>
              </>
            )}
          </View>
          <View style={styles.names}>
            <ThemedText style={styles.name} numberOfLines={1}>{first.rowName}</ThemedText>
            <ThemedText style={[styles.name, styles.nameRight]} numberOfLines={1}>{second.rowName}</ThemedText>
          </View>
          <ChipGroup
            options={MIX_STOPS.map((share, i) => ({ value: String(i), label: stopLabel(share) }))}
            value={stop === null ? null : String(stop)}
            onChange={pickStop}
            disabled={saving}
            accessibilityLabel={`How much ${first.rowName} and ${second.rowName}`}
          />
          <PrimaryButton
            label="Save"
            onPress={savePicked}
            disabled={stop === null}
            loading={saving}
            testID="mix-split-save"
          />
          <TouchableOpacity
            onPress={() => setMode('amounts')}
            disabled={saving}
            style={styles.otherRow}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Other amounts"
          >
            <ThemedText style={styles.otherText}>Other amounts…</ThemedText>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <ThemedText style={styles.caption}>Amounts, as you measured them</ThemedText>
          <ChipGroup
            options={MIX_UNITS.map((u) => ({ value: u, label: MIX_UNIT_LABEL[u] }))}
            value={unit}
            onChange={(v) => setUnit((v as MixUnit | null) ?? null)}
            accessibilityLabel="Unit, the same for both foods"
          />
          {[
            { food: first, value: firstAmount, set: setFirstAmount },
            { food: second, value: secondAmount, set: setSecondAmount },
          ].map(({ food, value, set }) => (
            <View key={food.foodItemId} style={styles.amountRow}>
              <ThemedText style={styles.amountName} numberOfLines={1}>{food.rowName}</ThemedText>
              <TextInput
                style={styles.amountInput}
                value={value}
                onChangeText={set}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={theme.colorTextTertiary}
                accessibilityLabel={`${food.rowName}, amount${unit ? ` in ${MIX_UNIT_LABEL[unit].toLowerCase()}` : ''}`}
              />
            </View>
          ))}
          <PrimaryButton
            label="Save"
            onPress={saveMeasured}
            disabled={!measured}
            loading={saving}
            testID="mix-amounts-save"
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    padding: theme.space2,
    gap: theme.space2,
  },
  title: {
    fontSize: theme.textLG,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
  },
  track: {
    height: 22,
    borderRadius: theme.radiusSmall,
    flexDirection: 'row',
    overflow: 'hidden',
    columnGap: 2,
  },
  trackEmpty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colorBorderStrong,
  },
  segment: {
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    transformOrigin: DRAW_IN_ORIGIN.compare,
  },
  // Near-black on both fills: white on the meal teal fails contrast (PrimaryButton's
  // accent note), and the tint needs the dark ink anyway.
  segmentText: {
    fontSize: theme.textXS,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
  },
  // Two fills, never text (C-1): the meal colour and its light tint, so the two foods
  // read apart without a legend; the names beneath say which is which.
  segmentFirst: {
    backgroundColor: colorRoles.positive.fillOnLight,
  },
  segmentSecond: {
    backgroundColor: theme.colorEventMealLight,
  },
  names: {
    flexDirection: 'row',
    columnGap: theme.space2,
  },
  name: {
    flex: 1,
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  nameRight: {
    textAlign: 'right',
  },
  otherRow: {
    minHeight: 44,
    justifyContent: 'center',
  },
  otherText: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    fontWeight: theme.weightMedium,
  },
  caption: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: theme.space2,
  },
  amountName: {
    flex: 1,
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
  },
  amountInput: {
    // A TextInput is outside ThemedText's reach, so it names its face (C-2).
    fontFamily: theme.fontBody,
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
    backgroundColor: theme.colorNeutralLight,
    borderRadius: theme.radiusSmall,
    paddingHorizontal: theme.space2,
    height: 44,
    width: 96,
    textAlign: 'right',
  },
});
