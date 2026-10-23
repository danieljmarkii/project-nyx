// A mixed bowl's foods on the edit screen (Mixed meals row 5, CUL-2054; spec §7.1, §7.5).
//
// "Fixing one food is an edit": each food has "Change" and "Take {food} out of this bowl".
// Everything here is STAGED (D-M4): the edit screen's Save writes the whole bowl once,
// through `setMealComponents`, and Cancel leaves the record as it was. Taking a food out
// folds its row away on History's fold beats (`FOLD_MOTION`: lift 180 ms and 8 pt, close
// 300 ms), instant under Reduce Motion. A bowl never goes below one food: with two left,
// taking one out leaves a plain meal, and the last food has no "Take out".
//
// "Change" offers meal foods only (R1) that are not already in the bowl: two rows of one
// food would be one food (the composition key collapses them), not a mix.
//
// The split is an edit too (CUL-2090, PM option A): a two-food bowl carries the card's own
// stepper, "‹ More Chicken · ⅓·⅔ · More Rabbit ›", so a wrong split is fixed without taking
// a food out and mixing again. One tap is one stop toward the named food, never a
// direction of the app's own (R4); staged like everything else here. A measured bowl
// (cans, grams) steps to the nearest stop and becomes the owner's estimate, exactly as the
// card's stepper writes it (`bowlWithShares`).

import { useRef, useState } from 'react';
import { Animated, LayoutAnimation, StyleSheet, TouchableOpacity, View } from 'react-native';
import { theme } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';
import { FOLD_LAYOUT, FOLD_MOTION } from '../motion/foldMotion';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { shareGlyph } from '../../lib/mealBowlLabel';
import { MIX_STOPS, stepEndLine, stepStop, stopIndexOf, stopLabel, type StepToward } from '../../lib/mixRatio';

export interface StagedBowlFood {
  foodItemId: string;
  foodLabel: string;
  rowName: string;
  share: number;
  shareSource: 'preset' | 'custom' | 'amounts';
  amountValue: number | null;
  amountUnit: string | null;
}

export interface BowlPickerFood {
  id: string;
  brand: string;
  product_name: string;
  format: string;
}

interface Props {
  foods: StagedBowlFood[];
  onChange: (next: StagedBowlFood[]) => void;
  /** Meal foods the bowl can take, newest first; read when "Change" opens. */
  loadChoices: () => Promise<BowlPickerFood[]>;
  /** A picked food in the bowl's shape (its stored label and row name). */
  toStaged: (food: BowlPickerFood, replacing: StagedBowlFood) => StagedBowlFood;
}

/** The staged bowl one stop toward more of the named food, or null at the end of the scale
 *  (or for a bowl that is not two foods). The new split is a preset, with no amounts. */
export function stepStagedBowl(foods: readonly StagedBowlFood[], toward: StepToward): StagedBowlFood[] | null {
  if (foods.length !== 2) return null;
  const total = foods[0].share + foods[1].share;
  if (!(total > 0)) return null;
  const stop = stepStop(foods[0].share / total, toward);
  if (stop === null) return null;
  const first = MIX_STOPS[stop];
  return foods.map((f, i) => ({
    ...f,
    share: i === 0 ? first : 1 - first,
    shareSource: 'preset' as const,
    amountValue: null,
    amountUnit: null,
  }));
}

export function BowlEditor({ foods, onChange, loadChoices, toStaged }: Props) {
  const reduced = useReducedMotion();
  const [changing, setChanging] = useState<number | null>(null);
  const [choices, setChoices] = useState<BowlPickerFood[]>([]);
  const [leaving, setLeaving] = useState<string | null>(null);
  const leave = useRef(new Animated.Value(0)).current;

  const total = foods.reduce((s, f) => s + f.share, 0);

  async function openChange(i: number) {
    if (changing === i) {
      setChanging(null);
      return;
    }
    setChanging(i);
    try {
      setChoices(await loadChoices());
    } catch (e) {
      console.warn('[bowl editor] foods read failed:', e);
      setChoices([]);
    }
  }

  function pick(i: number, food: BowlPickerFood) {
    const next = foods.map((f, k) => (k === i ? toStaged(food, f) : f));
    setChanging(null);
    onChange(next);
  }

  function takeOut(i: number) {
    const id = foods[i].foodItemId;
    const commit = () => {
      if (!reduced) LayoutAnimation.configureNext(FOLD_LAYOUT);
      setLeaving(null);
      onChange(foods.filter((_, k) => k !== i));
    };
    setChanging(null);
    if (reduced) {
      commit();
      return;
    }
    setLeaving(id);
    leave.setValue(0);
    Animated.timing(leave, { toValue: 1, duration: FOLD_MOTION.leaveMs, useNativeDriver: true }).start(commit);
  }

  const inBowl = new Set(foods.map((f) => f.foodItemId));

  function step(toward: StepToward) {
    const next = stepStagedBowl(foods, toward);
    if (next) onChange(next);
  }

  // The card's stepper, staged (see the header). Only on a two-food bowl, not while a food
  // is folding away (the bowl it would step is about to be one food), and not while a
  // food's Change list is open (one edit at a time).
  const stepper = (() => {
    if (foods.length !== 2 || total <= 0 || leaving !== null || changing !== null) return null;
    const firstShare = foods[0].share / total;
    const value = stopIndexOf(firstShare) !== null
      ? stopLabel(firstShare)
      : `${shareGlyph(firstShare)}·${shareGlyph(1 - firstShare)}`;
    // The end stop's reason, the card's own line (CUL-2134, `stepEndLine`).
    const endLine = stepEndLine(firstShare, foods[0].rowName, foods[1].rowName);
    const side = (f: StagedBowlFood, toward: StepToward) => {
      const atEnd = stepStop(firstShare, toward) === null;
      return (
        <TouchableOpacity
          style={[styles.stepSide, toward === 'second' && styles.stepSideRight, atEnd && styles.stepEnd]}
          onPress={() => step(toward)}
          disabled={atEnd}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={atEnd && endLine
            ? `More ${f.rowName} in this bowl. ${endLine}`
            : `More ${f.rowName} in this bowl`}
          accessibilityState={{ disabled: atEnd }}
          testID={`bowl-step-${toward}`}
        >
          <ThemedText style={styles.stepText} numberOfLines={1}>
            {toward === 'first' ? `‹ More ${f.rowName}` : `More ${f.rowName} ›`}
          </ThemedText>
        </TouchableOpacity>
      );
    };
    return (
      <View>
        <View style={styles.stepRow}>
          {side(foods[0], 'first')}
          <ThemedText
            style={styles.stepValue}
            accessibilityLabel={`${shareGlyph(firstShare)} ${foods[0].rowName}, ${shareGlyph(1 - firstShare)} ${foods[1].rowName}`}
            testID="bowl-step-value"
          >
            {value}
          </ThemedText>
          {side(foods[1], 'second')}
        </View>
        {/* The dimmed side already speaks it, so assistive tech skips the repeat. */}
        {endLine ? (
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <ThemedText style={styles.stepWhy} testID="bowl-step-why">{endLine}</ThemedText>
          </View>
        ) : null}
      </View>
    );
  })();

  return (
    <View style={styles.root}>
      {foods.map((f, i) => {
        const glyph = total > 0 ? shareGlyph(f.share / total) : null;
        const isLeaving = leaving === f.foodItemId;
        return (
          <Animated.View
            key={f.foodItemId}
            style={[
              styles.row,
              isLeaving && {
                opacity: leave.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
                transform: [{ translateY: leave.interpolate({ inputRange: [0, 1], outputRange: [0, -FOLD_MOTION.driftPt] }) }],
              },
            ]}
          >
            <View style={styles.head}>
              {glyph ? <ThemedText style={styles.share}>{glyph}</ThemedText> : null}
              <ThemedText style={styles.name} numberOfLines={2}>{f.rowName}</ThemedText>
              <TouchableOpacity
                onPress={() => { void openChange(i); }}
                style={styles.action}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Change ${f.rowName}`}
              >
                <ThemedText style={styles.actionText}>{changing === i ? 'Done' : 'Change'}</ThemedText>
              </TouchableOpacity>
            </View>
            {foods.length > 1 ? (
              <TouchableOpacity
                onPress={() => takeOut(i)}
                disabled={leaving !== null}
                style={styles.takeOut}
                hitSlop={8}
                accessibilityRole="button"
              >
                <ThemedText style={styles.takeOutText}>Take {f.rowName} out of this bowl</ThemedText>
              </TouchableOpacity>
            ) : null}
            {changing === i ? (
              <View style={styles.list}>
                {choices.filter((c) => !inBowl.has(c.id)).length === 0 ? (
                  <ThemedText style={styles.empty}>No other meal foods yet. Add one from the Foods tab, then change it here.</ThemedText>
                ) : null}
                {choices.filter((c) => !inBowl.has(c.id)).map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={styles.choice}
                    onPress={() => pick(i, c)}
                    accessibilityRole="button"
                    accessibilityLabel={`${c.brand} ${c.product_name}`}
                  >
                    <ThemedText style={styles.choiceName}>{c.product_name}</ThemedText>
                    <ThemedText style={styles.choiceBrand}>{c.brand}</ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </Animated.View>
        );
      })}
      {stepper}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: theme.space1,
  },
  row: {
    backgroundColor: theme.colorSurface,
    borderRadius: theme.radiusSmall,
    paddingHorizontal: theme.space2,
    paddingVertical: theme.space1,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: theme.space1,
  },
  share: {
    fontSize: theme.textMD,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
  },
  name: {
    flex: 1,
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
  },
  action: {
    minHeight: 44,
    justifyContent: 'center',
  },
  actionText: {
    fontSize: theme.textSM,
    color: theme.colorAccentInk,
    fontWeight: theme.weightMedium,
  },
  takeOut: {
    minHeight: 44,
    justifyContent: 'center',
  },
  takeOutText: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  list: {
    gap: 2,
    paddingBottom: theme.space1,
  },
  choice: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: theme.space1,
  },
  choiceName: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
  },
  choiceBrand: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: theme.space1,
    paddingHorizontal: theme.space2,
  },
  stepSide: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
  },
  stepSideRight: {
    alignItems: 'flex-end',
  },
  // C-7: an end stop dims and its label says why.
  stepEnd: {
    opacity: 0.4,
  },
  stepText: {
    fontSize: theme.textSM,
    color: theme.colorAccentInk,
    fontWeight: theme.weightMedium,
  },
  stepValue: {
    flexShrink: 0,
    fontSize: theme.textMD,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
  },
  // The end stop's reason (CUL-2134), the card's line in the card's quiet type.
  stepWhy: {
    fontSize: theme.textXS,
    color: theme.colorTextSecondary,
    fontWeight: theme.weightRegular,
    paddingHorizontal: theme.space2,
  },
  empty: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
});
