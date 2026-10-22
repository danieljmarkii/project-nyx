// The first mix of a bowl (Mixed meals row 5, CUL-2054; spec §7.1, §7.5, §11).
//
// Opened from the meal card's "+ Mixed with another food" (`from=card`) or the event
// detail's after-the-fact line (`from=detail`), always bound to ONE meal: the route
// carries the meal's event and pet, never the active pet (C-9). Two steps:
//
//   1. pick the other food — the food picker with the bowl's first food shown locked and
//      only meal foods offered (R1), under the banner that names what is being mixed;
//   2. the split — `MixSplitPanel`, whose chip tap is the save.
//
// The write is `setMealComponents`, the bowl's one writer. From the card, the card comes
// back AS the mix with a full arrival (D-M1), 450 ms after the route closes (the med-combo
// path's own beat), carrying the card it left (lib/mixReturn.ts). From the detail screen
// the route just closes; that screen re-reads on focus.
//
// Its own route rather than a mode of `app/log.tsx`: the single-food log path is not
// touched at all, which is how row 5 keeps "a single-food meal logs exactly as before"
// true by construction rather than by a flag.

import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { theme } from '../constants/theme';
import { Header } from '../components/ui/Header';
import { ThemedText } from '../components/ui/ThemedText';
import { FoodPicker } from '../components/log/FoodPicker';
import { MixSplitPanel } from '../components/log/MixSplitPanel';
import { usePetStore, resolveRecordPetName } from '../store/petStore';
import { useMomentStore } from '../store/momentStore';
import { getMealForEvent, type PickerFood } from '../lib/db';
import { setMealComponents } from '../lib/mealComponents';
import { MealComponentInputError, type ComponentInput } from '../lib/mealComposition';
import { cardBowlFrom, mixFoodOf } from '../lib/mixCard';
import { takeMixReturn } from '../lib/mixReturn';

/** The card returns this long after the route closes: the med-combo path's beat
 *  (`app/log.tsx`'s `delayMs: 450`), so the platform modal is gone before it rises. */
export const CARD_RETURN_DELAY_MS = 450;

type Food = ReturnType<typeof mixFoodOf>;

export default function MixRoute() {
  const params = useLocalSearchParams<{ event?: string; pet?: string; from?: string }>();
  const eventId = typeof params.event === 'string' ? params.event : null;
  const petId = typeof params.pet === 'string' ? params.pet : null;
  const fromCard = params.from === 'card';
  const pets = usePetStore((s) => s.pets);
  const petName = petId ? resolveRecordPetName(pets, petId) || 'your pet' : 'your pet';

  const [first, setFirst] = useState<Food | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [second, setSecond] = useState<Food | null>(null);

  // The bowl's first food is the meal's own food, read from the record (never a param a
  // stale link could carry). A meal that is already a mix has no single food here, and
  // this route does not open for one; it says so rather than guessing.
  useEffect(() => {
    if (!eventId) return;
    let live = true;
    getMealForEvent(eventId)
      .then((m) => {
        if (!live) return;
        if (!m?.food_item_id) {
          setLoadFailed(true);
          return;
        }
        setFirst(mixFoodOf({
          id: m.food_item_id,
          brand: m.food_brand,
          product_name: m.food_product_name,
          format: m.food_format,
        }));
      })
      .catch((e) => {
        console.warn('[mix] meal read failed:', e);
        if (live) setLoadFailed(true);
      });
    return () => { live = false; };
  }, [eventId]);

  // Backing out returns the card the owner left (pm-feature-review): its intake chips and
  // its Undo, unchanged, so the meal never seems to have vanished. Nothing was written.
  function close() {
    const held = fromCard && eventId ? takeMixReturn(eventId) : null;
    router.back();
    if (held) useMomentStore.getState().showMeal(held, { delayMs: CARD_RETURN_DELAY_MS });
  }

  function pickSecond(food: PickerFood) {
    if (!first || food.id === first.foodItemId) return;
    setSecond(mixFoodOf(food));
  }

  async function save(components: ComponentInput[]): Promise<boolean> {
    if (!eventId) return false;
    try {
      // From the detail screen no card is up, so the heads-up waits for that screen (CUL-2088).
      await setMealComponents(eventId, components, new Date(), { headsUp: fromCard ? 'card' : 'meal_screen' });
      return true;
    } catch (e) {
      console.error('[mix] bowl write failed:', e);
      // copy-guard-ok: fixed copy chosen by the error's class, never its message.
      Alert.alert(
        'Couldn’t save that',
        e instanceof MealComponentInputError
          ? 'Only meal foods can go in a bowl together.'
          : 'Something went wrong. Please try again.',
      );
      return false;
    }
  }

  function done(components: ComponentInput[]) {
    const held = fromCard && eventId ? takeMixReturn(eventId) : null;
    router.back();
    if (!held || !first || !second) return;
    // D-M1: the card returns as the mix, a real arrival with its commit haptic, carrying
    // the card it left (its intake answer and any heads-up already shown and spent).
    useMomentStore.getState().showMeal(
      {
        ...held,
        bowl: cardBowlFrom(components, {
          [first.foodItemId]: first.rowName,
          [second.foodItemId]: second.rowName,
        }),
      },
      { delayMs: CARD_RETURN_DELAY_MS },
    );
  }

  if (!eventId || !petId || loadFailed) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Mixed with another food" leading="back" onLeadingPress={close} />
        <View style={styles.body}>
          <ThemedText style={styles.note}>
            This meal can’t take a second food here. To change its foods, open the meal and tap Edit.
          </ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  if (!second) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Mixed with another food" leading="back" onLeadingPress={close} />
        {first && (
          <>
            <View style={styles.banner} accessibilityRole="summary">
              <ThemedText style={styles.bannerText}>
                Mixing with {first.rowName} in {petName}’s bowl. Pick the other food.
              </ThemedText>
            </View>
            <FoodPicker
              petId={petId}
              petName={petName}
              selectedFoodIds={[first.foodItemId]}
              mixableOnly
              onPickFood={pickSecond}
              onAddNew={() => undefined}
            />
          </>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Header title="Mixed with another food" leading="back" onLeadingPress={() => setSecond(null)} />
      {first && <MixSplitPanel first={first} second={second} onSave={save} onDone={done} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorNeutralLight,
  },
  body: {
    padding: theme.space2,
  },
  note: {
    fontSize: theme.textMD,
    lineHeight: theme.lineHeightBody,
    color: theme.colorTextSecondary,
  },
  banner: {
    marginHorizontal: theme.space2,
    marginBottom: theme.space1,
    padding: theme.space2,
    borderRadius: theme.radiusSmall,
    backgroundColor: theme.colorEventMealLight,
  },
  bannerText: {
    fontSize: theme.textSM,
    color: theme.colorTextPrimary,
  },
});
