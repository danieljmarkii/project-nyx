// The trial heads-up on a meal's own screen (CUL-2088, PM ruling (a); mock frames 7a to 7c).
//
// A food that goes into a meal after the fact (Change on the edit screen, a mix from this
// screen, a bowl-editor save) has no completion card to land on. Its writer hands the
// heads-up to `mealScreenFlagStore`, and this line shows it the next time the meal's
// screen is in front of the owner, under the food and above Intake. Like every heads-up it
// is information and arrives still.
//
// THE LEDGER IS SPENT HERE, AND ONLY ONCE THE LINE IS ON SCREEN — the card's rule
// (`noteTrialFlagShown`): the screen is focused, its own fresh read says the meal still
// holds the food, and the food is still unspent for this trial at that moment (a card on
// another meal may have spoken for it since). A food spoken for elsewhere drops the waiting
// heads-up; one the meal does not hold keeps it waiting; neither spends. One line per
// waiting heads-up: `take` hands it to this screen and forgets it, and the ledger write is
// idempotent, so a food never speaks twice.
import { useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { router, useIsFocused } from 'expo-router';
import { theme } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';
import { AddTrialFoodSheet } from '../profile/AddTrialFoodSheet';
import { useMealScreenFlagStore, type MealScreenFlag } from '../../store/mealScreenFlagStore';
import {
  END_TRIAL_LINE,
  hasFlaggedFoodInTrial,
  mealScreenFlagCopy,
  noteTrialFlagShown,
} from '../../lib/trialContaminant';
import { buildAddTrialFoodSheet, ADD_TRIAL_FOOD_ERROR } from '../../lib/trialFoodsScreen';
import { addTrialFood, foodLabel } from '../../lib/dietTrialSetup';
import { trialScreenHref } from '../../lib/trialRoute';

const ADD_LINE = 'Add to the trial list';

interface Props {
  eventId: string;
  /** The MEAL's pet (C-9): the add sheet's write target and the trial door's pet. */
  petId: string;
  petName: string;
  /** The foods the meal holds, from this screen's own read; null until it answers. The
   *  line waits for it, so a heads-up is never shown for a food an edit took back out. */
  mealFoodIds: readonly string[] | null;
}

export function TrialHeadsUpLine({ eventId, petId, petName, mealFoodIds }: Props) {
  const focused = useIsFocused();
  const waiting = useMealScreenFlagStore((s) => s.pending[eventId] ?? null);
  const [shown, setShown] = useState<MealScreenFlag | null>(null);
  const [adding, setAdding] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    if (!waiting || !focused || mealFoodIds === null) return;
    // Not held YET is not a verdict: back from the edit screen, focus can land a commit
    // before this screen's re-read replaces the old food's ids, and dropping here would
    // lose the heads-up for the food the edit just put in. It stays waiting; the next
    // edit of this meal replaces or clears it.
    if (!mealFoodIds.includes(waiting.flag.foodId)) return;
    let live = true;
    void (async () => {
      const { trialId, foodId } = waiting.flag;
      const spent = await hasFlaggedFoodInTrial(trialId, foodId).catch(() => false);
      // A newer edit's verdict, or a blur, while the ledger was read: the next run decides.
      if (!live || useMealScreenFlagStore.getState().pending[eventId] !== waiting) return;
      useMealScreenFlagStore.getState().take(eventId);
      // Already spoken for since (a card on another meal): dropped, as the card would.
      if (!spent) setShown(waiting);
    })();
    return () => { live = false; };
  }, [waiting, focused, mealFoodIds, eventId]);

  // Spent after the commit that put the line on screen, never before.
  useEffect(() => {
    if (!shown) return;
    noteTrialFlagShown(shown.flag, eventId).catch((e: unknown) => {
      console.warn('[trial heads-up line] ledger write failed:', e);
    });
  }, [shown, eventId]);

  // A later edit can take the food back out while the line is up: it goes with the food.
  if (!shown || !mealFoodIds?.includes(shown.flag.foodId)) return null;

  const { flag, food } = shown;
  const copy = mealScreenFlagCopy(flag, petName);
  const addable = copy.door === 'add_to_list' && flag.kind === 'off_trial_list' && food !== null;
  const label = [copy.eyebrow, copy.headline, copy.detail].filter(Boolean).join('. ');

  async function confirmAdd() {
    if (!food) return;
    setAddSaving(true);
    setAddError(null);
    try {
      // The same write as the card's door: allowed from today, never rewriting the
      // feeding that raised this line (the sheet says so).
      await addTrialFood({ trialId: flag.trialId, petId, food });
      setAdding(false);
      setShown(null);
    } catch (e) {
      // Never silent: the sheet stays open and says so (the card's rule).
      console.error('[trial heads-up line] add to trial list failed:', e);
      setAddError(ADD_TRIAL_FOOD_ERROR);
    } finally {
      setAddSaving(false);
    }
  }

  return (
    <View style={styles.panel}>
      <View style={styles.textBlock} accessibilityRole="summary" accessibilityLabel={label}>
        {copy.eyebrow ? <ThemedText style={styles.eyebrow}>{copy.eyebrow}</ThemedText> : null}
        <ThemedText style={styles.headline}>{copy.headline}</ThemedText>
        <ThemedText style={styles.detail}>{copy.detail}</ThemedText>
      </View>
      {copy.door === 'end_trial' ? (
        <TouchableOpacity
          style={styles.doorRow}
          onPress={() => router.push(trialScreenHref(petId, { open: 'end' }))}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={END_TRIAL_LINE}
        >
          <ThemedText style={styles.doorText}>+ {END_TRIAL_LINE}</ThemedText>
        </TouchableOpacity>
      ) : null}
      {addable ? (
        <TouchableOpacity
          style={styles.doorRow}
          onPress={() => { setAddError(null); setAdding(true); }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={ADD_LINE}
        >
          <ThemedText style={styles.doorText}>+ {ADD_LINE}</ThemedText>
        </TouchableOpacity>
      ) : null}
      {adding && addable && flag.kind === 'off_trial_list' && food ? (
        <AddTrialFoodSheet
          model={buildAddTrialFoodSheet(
            petName,
            foodLabel({ brand: food.brand, product_name: food.product_name }),
            {
              id: flag.trialId,
              startedAt: flag.trialStartedAt,
              targetDurationDays: flag.trialTargetDurationDays,
              endedAt: null,
            },
          )}
          saving={addSaving}
          error={addError}
          onConfirm={confirmAdd}
          onCancel={() => {
            if (addSaving) return;
            setAddError(null);
            setAdding(false);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // The card's attention panel (B-693), on the meal screen's light ground.
  panel: {
    marginTop: theme.space3,
    backgroundColor: theme.colorAttentionLight,
    borderLeftWidth: 3,
    borderLeftColor: theme.colorAttentionRail,
    borderRadius: theme.radiusMedium,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 4,
  },
  textBlock: {
    gap: 2,
  },
  eyebrow: {
    fontSize: theme.textXS,
    fontWeight: theme.weightSemibold,
    color: theme.colorAttentionInk,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  headline: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  detail: {
    fontSize: theme.textSM,
    lineHeight: theme.textSM * 1.4,
    color: theme.colorTextSecondary,
  },
  doorRow: {
    minHeight: 44,
    justifyContent: 'center',
  },
  doorText: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    fontWeight: theme.weightMedium,
  },
});
