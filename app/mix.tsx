// The first mix of a bowl (Mixed meals row 5, CUL-2054; spec §7.1, §7.5, §11).
//
// Opened from the meal card's "+ Mixed with another food" (`from=card`) or the event
// detail's after-the-fact line (`from=detail`), always bound to ONE meal: the route
// carries the meal's event and pet, never the active pet (C-9). Two steps:
//
//   1. pick the other food — the food picker with the bowl's first food shown locked and
//      only meal foods offered (R1), under the banner that names what is being mixed;
//   2. the split — `MixSplitPanel`, rising as a compact sheet OVER the picker (mock M2;
//      CUL-2133: it was built as a second full page, most of it empty). A chip tap picks,
//      Save writes. Tapping the veil goes back to the picker.
//
// The write is `setMealComponents`, the bowl's one writer. From the card, the card comes
// back AS the mix with a full arrival (D-M1), 450 ms after the route closes (the med-combo
// path's own beat), carrying the card it left (lib/mixReturn.ts). From the detail screen
// the route just closes; that screen re-reads on focus.
//
// Its own route rather than a mode of `app/log.tsx`: the single-food log path is not
// touched at all, which is how row 5 keeps "a single-food meal logs exactly as before"
// true by construction rather than by a flag.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { theme, shadows } from '../constants/theme';
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
import { takeCapturedFood } from '../lib/captureHandBack';
import { isMixableFood } from '../lib/food';
import { useSheetMotion } from '../components/motion/sheetMotion';
import { useAppActive } from '../hooks/useAppActive';

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
  // The FACT the sheet moves on (C-30): asked up. `second` outlives it by the exit, so
  // the panel still has its foods while it sinks, and clears on `onExited`.
  const [splitUp, setSplitUp] = useState(false);
  const [saving, setSaving] = useState(false);
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const appActive = useAppActive();

  // The shared sheet motion (CUL-1642), lifted rather than restated. It was written for a
  // Modal's `onShow`; this layer has no Modal of its own (C-14), so the rise starts at the
  // first commit of the asked-up state, the moment the layer is on screen.
  const sheet = useSheetMotion({
    visible: splitUp,
    veil: 'own',
    travelPt: windowHeight,
    appActive,
    onExited: () => setSecond(null),
  });
  const { phase: sheetPhase, onShow: sheetShown } = sheet;
  useEffect(() => {
    if (sheetPhase === 'presenting') sheetShown();
  }, [sheetPhase, sheetShown]);

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
    if (!first || food.id === first.foodItemId || splitUp) return;
    setSecond(mixFoodOf(food));
    setSplitUp(true);
  }

  // CUL-2089 (mock A1/A2): a food that isn't in the picker yet is added from it. Capture
  // runs add only (no meal of its own; the bowl stays the one record) and hands the new food
  // back under this meal's id, so the split rises with it as if it had been tapped. One
  // saved as a treat, topper or "Other" is not handed to the bowl: the owner lands on the
  // picker, where its tile says why.
  function addNew() {
    if (!eventId) return;
    router.push(`/food-capture?returnTo=back&handBack=${encodeURIComponent(eventId)}`);
  }
  // Every focus takes the offer, so it is spent once. The first focus is this route opening,
  // before the meal is read: `pickSecond` refuses without a first food, so an offer left by
  // a capture that never made it back here (its exit fell to dismissAll) is dropped there.
  const pickSecondRef = useRef(pickSecond);
  pickSecondRef.current = pickSecond;
  useFocusEffect(
    useCallback(() => {
      if (!eventId) return;
      const food = takeCapturedFood(eventId);
      if (food && isMixableFood(food)) pickSecondRef.current(food);
    }, [eventId]),
  );

  // Back to the picker: nothing was written. Not while a write is in flight, which would
  // otherwise land after the owner had seemingly backed out of it.
  function backToPicker() {
    if (saving) return;
    setSplitUp(false);
  }

  async function save(components: ComponentInput[]): Promise<boolean> {
    if (!eventId) return false;
    setSaving(true);
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
      setSaving(false);
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

  const layerOpen = sheet.modalVisible && !!first && !!second;

  return (
    <SafeAreaView style={styles.container}>
      <View
        style={styles.container}
        importantForAccessibility={layerOpen ? 'no-hide-descendants' : 'auto'}
        accessibilityElementsHidden={layerOpen}
      >
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
              onAddNew={addNew}
              onOpenDetail={(food) => router.push(`/food/${food.id}`)}
            />
          </>
        )}
      </View>

      {layerOpen && first && second && (
        <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
          <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, sheet.scrimStyle]}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={backToPicker}
              accessibilityRole="button"
              accessibilityLabel="Back to the foods"
            />
          </Animated.View>
          <KeyboardAvoidingView
            style={styles.sheetWrap}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            pointerEvents="box-none"
          >
            <Animated.View
              style={[styles.sheet, { paddingBottom: insets.bottom + theme.space2 }, sheet.sheetStyle]}
            >
              <View style={styles.grabber} />
              <MixSplitPanel first={first} second={second} onSave={save} onDone={done} />
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      )}
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
  scrim: {
    backgroundColor: theme.colorScrim,
  },
  sheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colorSurface,
    borderTopLeftRadius: theme.radiusMedium,
    borderTopRightRadius: theme.radiusMedium,
    paddingTop: theme.space1,
    ...shadows.lg,
  },
  grabber: {
    alignSelf: 'center',
    width: 34,
    height: 4,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorBorderStrong,
  },
});
