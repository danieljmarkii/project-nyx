import { useState, useRef, useCallback, useEffect, useContext, type ReactNode } from 'react';
import {
  TouchableOpacity, StyleSheet, View, Animated, BackHandler,
  Pressable, Alert, ScrollView, useWindowDimensions,
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react-native';
import { theme, shadows } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';
import { EmptyState } from '../ui/EmptyState';
import { WhorlSpinner } from '../brand/WhorlSpinner';
import { EventIcon } from '../event/EventIcon';
import { PetAvatar } from '../pet/PetAvatar';
import { PetSwitcherSheet } from '../pet/PetSwitcherSheet';
import { useUiStore } from '../../store/uiStore';
import { reducedMotionNow } from '../../store/reducedMotionStore';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { openMenu as openMenuHaptic } from '../../lib/haptics';
import { useEventStore } from '../../store/eventStore';
import { usePetStore } from '../../store/petStore';
import { useMomentStore } from '../../store/momentStore';
import { getRecentFoods, PickerFood } from '../../lib/db';
import { insertMeal } from '../../lib/meals';
import { applyMealTrialFlag } from '../../lib/mealTrialFlag';
import { noPetToLogForCopy } from '../../lib/logCopy';
import { rowFoodLabelOf } from '../../lib/dayEvents';
import { foodFormatTag } from '../../lib/foodFormat';
import {
  planFan, FAB_BOTTOM, FAB_DISC, FAN_MARGIN_BOTTOM, FAN_RIGHT_INSET, FAN_GAP,
  PILL_MIN_HEIGHT, PILL_PADDING_V, PILL_PADDING_LEFT, PILL_PADDING_RIGHT, PILL_INNER_GAP,
  PILL_GLYPH, PILL_CHEVRON, PILL_LABEL_SIZE, FOOD_TAG_GAP, FOOD_TAG_PADDING_H, FOOD_TAG_PADDING_V,
  LOG_FOR_LABEL_GAP, LOG_FOR_NAME_LINES,
} from '../../lib/fanBudget';

// Resolved once at module scope — a literal, shared with the log sheet (CUL-717).
const noPetCopy = noPetToLogForCopy();

// ── THE CHOREOGRAPHY (CUL-322, D5 = a; mock round 1 §06 beats 1–4 and 6–8) ─────────
//
// One engine: RN `Animated` on the native driver, every value a transform or an
// opacity (C-30's split — nothing here moves geometry, so there is no LayoutAnimation
// half). Hold-and-slide (beat 5) is CUL-1278 and is deliberately absent.

/** Beat 1: the disc answers the finger on touch-DOWN, before release. */
const PRESS_SCALE = 0.9;
/** Beat 2: the plus turns 135° to land on ×. A 45° turn lands on the same glyph, but
 *  135° is enough travel for the spring's overshoot to read as weight. */
const TURN_DEGREES = 135;
/** Underdamped on purpose: an overshoot past × and back. The PM asked for the bounce to
 *  be slightly more noticeable (CUL-1641, 2026-10-06): friction 7 → 6 takes the damping
 *  ratio from 0.54 to 0.47 (RN's origami conversion: stiffness 411, damping 22 → 19), so
 *  the overshoot grows from about 13% to 19% of the turn (18° → 25° past ×) and it settles
 *  in about 420ms instead of 360ms. Motion & IA preferred the app's 0.7 settle; the PM
 *  ruled for the bounce. */
const TURN_SPRING = { tension: 90, friction: 6 } as const;
/** Beat 4: items leave the disc nearest first, this far apart. */
const FAN_STAGGER_MS = 38;
/** The fan item's own spring: a lighter overshoot than the turn, so eight pills
 *  landing do not wobble as a group. */
const FAN_SPRING = { tension: 120, friction: 9 } as const;
/** Beat 3: the scrim fades up with the fan. */
const SCRIM_IN_MS = 240;
/** Beat 7: close is faster than open, and in reverse order — farthest first. Open is
 *  a moment; close is getting out of the way. ~180ms end to end for a typical fan
 *  (five pills: 4 × 18 + 110). */
const CLOSE_STAGGER_MS = 18;
const CLOSE_ITEM_MS = 110;
const CLOSE_MS = 180;
/** Beat 8: under Reduce Motion everything is one crossfade of this length. */
const FADE_MS = 150;
/** Where a fan pill starts, relative to where it lands: tucked into the disc's
 *  corner at 60%, growing out of it (the pills' transformOrigin is that corner). */
const FAN_FROM = { x: 18, y: 26, scale: 0.6 } as const;
/** The most pills the fan can hold: the switcher chip, More events, Loose stool,
 *  Vomit, Log food, and three recent foods. One Animated.Value per SLOT (a slot is
 *  a distance from the disc), so a row that mounts after the fan has run — the
 *  recent foods answer asynchronously — lands on a slot already at rest. */
const MAX_SLOTS = 8;
/** The doors' labels, top to bottom, as the fan draws them and the budget plans them. */
const DOOR_LABELS = ['More events', 'Loose stool', 'Vomit', 'Log food'] as const;

interface FanRow {
  key: string;
  node: ReactNode;
}

/** CUL-1644 (D3): a pill that OPENS something carries this; a food pill, which writes
 *  at once, does not. Decorative: the pill's own label and role already say what it
 *  is, so the chevron is hidden from assistive tech on both platforms. */
function DoorChevron() {
  return (
    <View
      testID="fab-door-chevron"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <ChevronRight size={PILL_CHEVRON} color={theme.colorTextTertiary} strokeWidth={1.75} />
    </View>
  );
}

/**
 * The fan's pill, in motion or still. The pill's CONTENT is the caller's; this owns
 * only how it arrives. `slot` 0 is the pill nearest the disc.
 */
function FanSlot({
  anim, fade, reducedMotion, children,
}: {
  anim: Animated.Value;
  fade: Animated.Value;
  reducedMotion: boolean;
  children: ReactNode;
}) {
  // Reduce Motion: the pill rides the one crossfade and never moves (beat 8). The
  // choice is made at render from the hook (C-43); the handlers write the end state
  // either way, so a setting flipped mid-open still renders a correct frame.
  const style = reducedMotion
    ? { opacity: fade }
    : {
        opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
        transform: [
          { translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [FAN_FROM.x, 0] }) },
          { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [FAN_FROM.y, 0] }) },
          { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [FAN_FROM.scale, 1] }) },
        ],
      };
  return <Animated.View style={[styles.fanSlot, style]}>{children}</Animated.View>;
}

/**
 * The tabs' content, hidden from assistive tech while the FAB's menu is open
 * (CUL-322, BRK-37; C-14). The menu's layer declares `accessibilityViewIsModal`,
 * which on iOS silences the layer's SIBLINGS — this is that sibling, so the layout
 * wraps the banner and the tabs in it. Android has no modal flag: only the host can
 * take its descendants out of the tree, which is why the host is a component at all.
 */
export function HiddenUnderFabMenu({ children }: { children: ReactNode }) {
  const menuOpen = useUiStore((s) => s.fabMenuOpen);
  return (
    <View
      style={styles.host}
      importantForAccessibility={menuOpen ? 'no-hide-descendants' : 'auto'}
      accessibilityElementsHidden={menuOpen}
    >
      {children}
    </View>
  );
}

export function FAB() {
  const { prependEvent } = useEventStore();
  const { pets, activePet } = usePetStore();
  const showMealMoment = useMomentStore((s) => s.showMeal);
  // The log sheet is not this component's any more (CUL-503): one root mount serves
  // every door, and the FAB is three of them — More events, and the two quick taps.
  const openLogSheet = useUiStore((s) => s.openLogSheet);
  const setFabMenuOpen = useUiStore((s) => s.setFabMenuOpen);
  const reducedMotion = useReducedMotion();

  const [open, setOpen] = useState(false);
  const [switcherVisible, setSwitcherVisible] = useState(false);
  // CUL-723 — the recent-food rows are keyed by the pet they were loaded FOR, and
  // render only on a match. `null` is "this pet's foods have not answered yet",
  // which is not the same fact as "this pet has no foods" (C-12).
  //
  // The menu deliberately stays open across a pet flip, and `selectPet` swaps A → B
  // with no null in between, so CUL-717's render gate — which un-renders this whole
  // block when there is no pet at all — never fires on that transition. The chip
  // above these rows reads `activePet` directly and repaints at once, so for the
  // width of one `getRecentFoods` round-trip the menu read "Logging for Mochi" over
  // Nyx's foods. Every food pill writes a meal in ONE press, and `pill`'s own
  // comment names the stake: a mis-resolved tap means logging the WRONG food, into
  // a diet trial.
  //
  // Keyed rather than cleared. A bare `setRecentFoods([])` at the top of the effect
  // also closes the hole, but it renders nothing to an owner whose pet has foods —
  // trading a wrong list for a wrong absence. Holding the id alongside the list
  // makes the mismatch unrenderable instead of briefly empty.
  const [recentFoods, setRecentFoods] = useState<{ petId: string; foods: PickerFood[] } | null>(null);
  const [logging, setLogging] = useState<string | null>(null);

  const pressScale = useRef(new Animated.Value(1)).current;
  const turn = useRef(new Animated.Value(0)).current;
  // The scrim's opacity, and under Reduce Motion the whole menu's.
  const fade = useRef(new Animated.Value(0)).current;
  const slots = useRef(Array.from({ length: MAX_SLOTS }, () => new Animated.Value(0))).current;
  // How many pills the last render drew — the open and close stagger only the ones on
  // screen, so the close keeps its ~180ms however many slots are idle.
  const slotCount = useRef(0);
  // True between a close starting and its animation finishing. A tap in that window
  // re-opens rather than closing again: the menu is still mounted and on its way out.
  const closing = useRef(false);

  // CUL-871 (T-21) — THE FAB STEPS ASIDE for a Home capture overlay. The Noticed grid's
  // pinned Done bar stands exactly where this button does (its box is 72–128 pt off the
  // screen bottom, the bar sits at the foot of Home's body), and T-21 requires the way
  // back and the way out to be visible together while the word list is open.
  //
  // Read as a boolean, so this component never sees the overlay's handles: the FAB has
  // one question to answer, and widening it is how a "some card is up" flag would start
  // hiding the app's primary control for every future sheet.
  //
  // And only an overlay that can draw a Done bar holds the corner (CUL-1220, BRK-18): the
  // look header publishes an overlay for its pinned way back and never draws a
  // bar, and hiding the + for it took the primary control off every tab.
  const captureOverlayOpen = useUiStore((s) => s.captureOverlay?.drawsDoneBar === true);

  // CUL-1636 — the fan's height budget reads the window and the text multiplier. The
  // insets context, not the hook: the hook throws without a provider, and the FAB has
  // no reason to own one (on device expo-router's root always provides it).
  const frame = useWindowDimensions();
  const safeTop = useContext(SafeAreaInsetsContext)?.top ?? 0;
  const fanScroll = useRef<ScrollView>(null);
  const fanSnapped = useRef(false);

  const openMenu = useCallback(() => {
    // Light impact on OPEN only — closing the menu commits to nothing and stays silent.
    openMenuHaptic();
    closing.current = false;
    setOpen(true);
    const count = Math.max(slotCount.current, 1);
    if (reducedMotionNow()) {
      // Beat 8: one crossfade. The turn and the slots jump to their end state so a
      // render that still reads motion (the setting flipped mid-open) is correct.
      turn.setValue(1);
      slots.forEach((v) => v.setValue(1));
      Animated.timing(fade, { toValue: 1, duration: FADE_MS, useNativeDriver: true }).start();
      return;
    }
    // A slot past today's count lands at rest, so a row that mounts late appears in
    // place rather than invisibly at 0. The recent foods are read before the open now
    // (CUL-1634), so this is the backstop for a tap that beats the mount read.
    slots.slice(count).forEach((v) => v.setValue(1));
    Animated.parallel([
      Animated.spring(turn, { toValue: 1, useNativeDriver: true, ...TURN_SPRING }),
      Animated.timing(fade, { toValue: 1, duration: SCRIM_IN_MS, useNativeDriver: true }),
      Animated.stagger(
        FAN_STAGGER_MS,
        slots.slice(0, count).map((v) =>
          Animated.spring(v, { toValue: 1, useNativeDriver: true, ...FAN_SPRING })),
      ),
    ]).start();
  }, [turn, fade, slots]);

  const closeMenu = useCallback(() => {
    closing.current = true;
    const finish = ({ finished }: { finished: boolean }) => {
      // Interrupted by a re-open: the menu stays.
      if (!finished || !closing.current) return;
      closing.current = false;
      setOpen(false);
      slots.forEach((v) => v.setValue(0));
    };
    if (reducedMotionNow()) {
      Animated.timing(fade, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start((r) => {
        if (r.finished) turn.setValue(0);
        finish(r);
      });
      return;
    }
    const count = Math.max(slotCount.current, 1);
    Animated.parallel([
      Animated.timing(turn, { toValue: 0, duration: CLOSE_MS, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 0, duration: CLOSE_MS, useNativeDriver: true }),
      // Reverse order: the farthest pill retracts first.
      Animated.stagger(
        CLOSE_STAGGER_MS,
        slots.slice(0, count).reverse().map((v) =>
          Animated.timing(v, { toValue: 0, duration: CLOSE_ITEM_MS, useNativeDriver: true })),
      ),
    ]).start(finish);
  }, [turn, fade, slots]);

  const toggleMenu = useCallback(() => {
    if (open && !closing.current) closeMenu(); else openMenu();
  }, [open, openMenu, closeMenu]);

  // A pill acts only while the menu is staying open. A close keeps every pill mounted,
  // under the finger, for the ~180ms it animates, so a quick second tap used to act
  // again: a second log-sheet open while the first sheet was still sliding in (the
  // CUL-662 wedge class; the store now refuses that too), a second /log push, the
  // switcher's Modal presenting over the sheet's, or a second meal from a one-tap food
  // (its `logging` guard has already released by then). Read from the ref, so the
  // answer is current at the tap rather than at the last render.
  const whileOpen = (action: () => void) => () => {
    if (closing.current) return;
    action();
  };

  // Beat 1. Motion only: under Reduce Motion the disc does not scale (beat 8).
  const pressIn = useCallback(() => {
    if (reducedMotionNow()) return;
    Animated.spring(pressScale, { toValue: PRESS_SCALE, useNativeDriver: true, tension: 300, friction: 20 }).start();
  }, [pressScale]);
  const pressOut = useCallback(() => {
    if (reducedMotionNow()) return;
    Animated.spring(pressScale, { toValue: 1, useNativeDriver: true, tension: 200, friction: 10 }).start();
  }, [pressScale]);

  // The host hides everything under the menu from assistive tech (HiddenUnderFabMenu)
  // for exactly as long as the menu is mounted, and never outlives this component.
  useEffect(() => {
    setFabMenuOpen(open);
  }, [open, setFabMenuOpen]);
  useEffect(() => () => setFabMenuOpen(false), [setFabMenuOpen]);

  // The stand-down below un-renders the FAB but keeps this instance mounted, so an
  // open menu would leave `fabMenuOpen` true — Home hidden from assistive tech, with no
  // disc left to close it. Today no overlay can open under the menu (its scrim eats
  // the tap first), but a future non-tap caller of `setCaptureOverlay` (a deep link, a
  // timer) should not be what discovers that; the menu simply closes.
  useEffect(() => {
    if (!captureOverlayOpen) return;
    closing.current = false;
    setOpen(false);
    setSwitcherVisible(false);
    turn.setValue(0);
    fade.setValue(0);
    slots.forEach((v) => v.setValue(0));
  }, [captureOverlayOpen, turn, fade, slots]);

  // A modal menu answers Android's back the way it answers the scrim: it closes.
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeMenu();
      return true;
    });
    return () => sub.remove();
  }, [open, closeMenu]);

  // CUL-1634 — the recent foods are read BEFORE the fan runs: on mount, on a pet
  // change, after each close, and when today's record gains a row, never because the
  // menu opened. The column is bottom anchored, so three rows landing after the fan
  // grew it ~160pt upward and moved every pill above them, Vomit included, under a
  // thumb already on its way. Reading while closed means a cold open's slot count is
  // final on its first render, and a meal logged from the fan or the sheet is in the
  // list by the next open.
  //
  // While open no read starts and none lands over held rows, because a read can only
  // move rows under the finger; the next close refreshes. Two exceptions. CUL-723's:
  // the pet flipped inside the open menu, so the held rows are another pet's
  // (unrendered by the key below) and the new pet's must load. And a tap that beats
  // the mount read: nothing is held, so the answer lands, late, as before. An open
  // never cancels a read already in flight, which would turn the second case into a
  // second round trip. `todayHeadId` is the change signal `useDaySummary` uses: the
  // newest row of today.
  const activePetId = activePet?.id ?? null;
  const todayHeadId = useEventStore((s) => s.todayEvents[0]?.id ?? null);
  const latestPetId = useRef(activePetId);
  latestPetId.current = activePetId;
  const openNow = useRef(open);
  openNow.current = open;
  const heldFor = useRef<string | null>(null);
  heldFor.current = recentFoods?.petId ?? null;
  const readingFor = useRef<string | null>(null);
  useEffect(() => {
    if (!activePetId) return;
    if (open && (heldFor.current === activePetId || readingFor.current === activePetId)) return;
    readingFor.current = activePetId;
    // The last 3 foods THIS pet actually ate, newest first. Shares getRecentFoods
    // with the picker (single source of truth), which orders by the pet's real
    // MAX(occurred_at) — not food_items_cache.last_used_at, which is shared across
    // pets and was reset to NULL on every sync, so the old query returned an
    // effectively random 3. `null` window = no time bound (re-offer staples of
    // any age). Async, so the answer is checked against the pet it was read for.
    getRecentFoods(activePetId, null, 3)
      .then((foods) => {
        if (latestPetId.current !== activePetId) return;
        if (openNow.current && heldFor.current === activePetId) return;
        setRecentFoods({ petId: activePetId, foods });
      })
      .catch((e) => console.warn('[FAB] recent foods load failed:', e))
      .finally(() => {
        if (readingFor.current === activePetId) readingFor.current = null;
      });
  }, [open, activePetId, todayHeadId]);

  // Derived in the render body rather than mirrored into state (the C-9 shape): the
  // list is only ever this pet's, or nothing. A pet flip inside the open menu shows
  // no food rows until the new pet's read answers: a wrong absence for a beat, never
  // a wrong list.
  const foodsForActivePet =
    activePet && recentFoods?.petId === activePet.id ? recentFoods.foods : null;

  async function handleQuickMeal(food: PickerFood) {
    // Write-time pet identity (multi-pet spec §6): read the store at the moment
    // of write, not the render-time closure (the queue-then-switch edge).
    const pet = usePetStore.getState().activePet;
    if (logging) return; // a write is already in flight — silence is correct here
    if (!pet) {
      // CUL-717. This used to share the `logging` guard's bare return: the row did
      // not even show its spinner, so a tap produced no feedback of any kind —
      // CUL-575's "a failed write is always said", applied to a write that never
      // starts. It now stays PUT, and the menu gate below means there is no recent
      // -food row to tap without a pet in the first place, so this is only the
      // write-time re-read's answer for the instant between a render and a tap.
      // Deliberately silent because the surface speaks for itself: losing the pet
      // re-renders the menu into the no-pet copy under the owner's finger, which is
      // the message. Split off the `logging` return above so the warning is
      // accurate — re-entrancy and no-pet are different states.
      console.warn('[FAB] quick-meal tap with no active pet — nothing to write for');
      return;
    }
    setLogging(food.id);
    try {
      // insertMeal owns the event+meal write, the food-recency touch, the sync
      // push, AND the AI-Signal regen (B-059) — so this quick-log path can't
      // drift out of sync with the other entry points the way it once did.
      let written: Awaited<ReturnType<typeof insertMeal>>;
      try {
        written = await insertMeal({
          petId: pet.id,
          foodId: food.id,
          occurredAt: new Date(),
          occurredAtSource: 'now',
        });
      } catch (e) {
        // A failed write is always said (CUL-575), in the words every other log path
        // uses. The pill calls this without awaiting, so before this catch a failure
        // wrote nothing, said nothing, and surfaced only as an unhandled rejection. The
        // menu stays open and the row is the retry. Scoped to the WRITE: below it the
        // meal is on disk, and a step that threw there must never say a saved meal
        // failed, because the retry that invites would write it twice (B-336).
        console.error('[FAB] quick meal write failed:', e);
        Alert.alert("Couldn't save that", 'Something went wrong. Please try again.');
        return;
      }
      const { eventId, occurredAtIso, now } = written;

      const foodType =
        food.food_type === 'meal' || food.food_type === 'treat' || food.food_type === 'other'
          ? food.food_type
          : null;
      prependEvent({
        id: eventId,
        pet_id: pet.id,
        event_type: 'meal',
        occurred_at: occurredAtIso,
        occurred_at_confidence: 'witnessed',
        severity: null,
        notes: null,
        source: 'manual',
        deleted_at: null,
        created_at: now,
        updated_at: now,
        food_item_id: food.id,
        food_brand: food.brand,
        food_product_name: food.product_name,
        food_format: food.format,
        food_type: foodType,
      });
      closeMenu();
      // Meal completion card: the warmed bottom-card presentation of the
      // completion moment (B-064). Carries the gold beat + "Logged {brand}", a
      // one-tap path back to the time picker for owners backfilling a meal fed
      // before they reached their phone, AND the WSAVA intake chip row for
      // food_type 'meal' and 'treat' (B-014; treats added 2026-05-23). Every
      // meal-entry path must route through showMeal — if a non-picker meal flow
      // is added later, mirror this call (otherwise intake capture vanishes for
      // that path). Replaces the retired standalone post-log toast.
      showMealMoment({
        eventId,
        petId: pet.id,
        occurredAt: occurredAtIso,
        foodType,
        foodBrand: food.brand,
        foodProductName: food.product_name,
        foodFormat: food.format,
        intakeRating: null,
      });
      // B-351 slice 4 / B-693 — resolve the trial heads-up and patch it onto the
      // card. Fire-and-forget (not awaited here) so the tapped row's spinner
      // (setLogging(null) in the finally) releases immediately on the wedge's
      // fastest path. applyMealTrialFlag (lib/mealTrialFlag.ts — the ONE orchestration
      // both meal doors share, CUL-354) waits for the card to be on screen before
      // patching — a no-op here (this path reveals synchronously), but the same
      // guard the picker path needs. The ledger write happens only once the
      // heads-up renders, so one the owner never saw can't spend the food's budget.
      void applyMealTrialFlag({ eventId, petId: pet.id, foodId: food.id, occurredAt: occurredAtIso });
    } finally {
      setLogging(null);
    }
  }

  // Standing down is a full un-render rather than an opacity change: an invisible
  // button that still takes touches is worse than a visible one, and the Done bar sits
  // on top of exactly that area. The menu cannot be open here — opening the grid is a
  // tap on Home, which the menu's own full-screen scrim would have eaten first — so
  // there is no half-open state to unwind.
  if (captureOverlayOpen) return null;

  // ── THE FAN, top to bottom ──────────────────────────────────────────────────────
  //
  // Nearest the thumb is what an owner logs most: the recent foods, newest LOWEST
  // (beat 4). The symptom taps sit above them and More events above those. The fan
  // replaced a panel with section headers (CUL-322); a header has no ground to sit on
  // between floating pills — and text on the translucent scrim fails contrast — so
  // "Recent foods" and its "No foods logged yet" line left with the panel. A pet with
  // no foods yet still has `Log food` in the thumb's slot, which is the way forward.
  const rows: FanRow[] = [];

  // CUL-1636 — planned from the window before anything is drawn (lib/fanBudget.ts): the
  // oldest foods leave first when the fan would stand taller than the screen, and the
  // chip is never the row that goes. Each food's label and tag are computed ONCE and
  // read by both the plan and the pill, so what is budgeted is what is drawn. With no
  // pet only the no-pet card renders, so nothing is planned for doors it never draws.
  const foodText = new Map(
    (foodsForActivePet ?? []).map((food) => [food.id, {
      label: rowFoodLabelOf({ brand: food.brand, product: food.product_name, format: food.format }) ?? 'Food',
      tag: foodFormatTag(food.format),
    }]),
  );
  const fanPlan = planFan({
    windowWidth: frame.width,
    windowHeight: frame.height,
    fontScale: frame.fontScale,
    safeTop,
    chipName: activePet && pets.length > 1 ? activePet.name : null,
    doors: activePet ? DOOR_LABELS : [],
    foods: [...foodText].map(([id, text]) => ({ id, ...text })),
  });
  // The two values the plan decides at render, as the style entries the pills and the
  // scroll take (a window-derived number has no token to live in).
  const pillWidth = { maxWidth: fanPlan.pillMaxWidth };
  const scrollCap = { maxHeight: fanPlan.scrollMaxHeight ?? undefined };
  const foodLines = new Map(fanPlan.foods.map((f) => [f.id, f.numberOfLines]));
  // The scroll opens at its bottom once per open; a later size change (a food's spinner)
  // never yanks an owner who has scrolled up back down.
  if (!open) fanSnapped.current = false;

  // ── THE MENU BODY, GATED ON THERE BEING A PET (CUL-717) ─────────────────────────
  // None of the action pills render without an active pet, so there is no pill to tap
  // into a silence — the same gate CUL-681 put on the log sheet's grid one layer down,
  // applied to the surface above it.
  //
  // One gate closes all three paths. A recent-food tap returned with no feedback at
  // all — not even the row's own spinner. `Log food` and the Vomit / Loose stool rows
  // closed the menu and pushed /log, which is worse than it sounds: `Log food` lands on
  // an empty screen under a "What did your pet eat?" header (its FoodPicker is gated on
  // activePet), but the two symptom rows reach the `simple` step, which is NOT gated —
  // it renders the whole form, photo row included, and then handleConfirm returns null
  // on the missing pet. So an owner photographs the vomit, writes a note, taps Log
  // vomit, and nothing happens. The photo cannot be taken again.
  //
  // Not a rare state, either: this FAB mounts unconditionally in the tabs layout while
  // pets hydrate from a NETWORK read (hooks/usePet.ts) that only runs once the session
  // restores — so every cold start has a window, and on a failed double-read that hook
  // leaves the store as-is on purpose. The branch is reactive, so the pills replace
  // this copy the moment the pets land; no need to close and reopen the menu.
  //
  // `More events` goes with the rest even though it could arguably stay: it opens the
  // sheet, which says this for itself, so keeping the pill would put a second surface
  // one tap away only to repeat the message. The menu gets one answer.
  if (!activePet) {
    rows.push({
      key: 'no-pet',
      node: (
        <View style={[styles.card, pillWidth]}>
          <EmptyState
            // Shared with the log sheet (lib/logCopy) — one state, two capture
            // surfaces, one wording. The clause order is load-bearing and its
            // rationale lives with the copy.
            //
            // No action button, same two reasons as the sheet: CUL-678 keeps
            // management rows off a capture surface, and this menu sits over a
            // full-screen scrim that closes it, so a door here would fight its own
            // dismissal.
            title={noPetCopy.title}
            body={noPetCopy.body}
            style={styles.noPet}
          />
        </View>
      ),
    });
  } else {
    // Pet identity leads the fan (multi-pet spec §3.3, mock B1). The flip happens
    // *before* logging — v1 has no move-to-pet, so a wrong-pet log means delete +
    // re-log; the log taps below stay one-tap (Principle 1). Renders only when
    // pets.length > 1 — single-pet households see no multi-pet chrome (§7.8). The
    // menu stays open across a flip: recent foods re-query reactively and every write
    // path reads the store at write time.
    if (pets.length > 1) {
      rows.push({
        key: 'log-for',
        node: (
          <TouchableOpacity
            style={[styles.pill, styles.logForPill, pillWidth]}
            onPress={whileOpen(() => setSwitcherVisible(true))}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Logging for ${activePet.name} — switch pet`}
          >
            <PetAvatar name={activePet.name} photoPath={activePet.photo_path} size={PILL_GLYPH} />
            {/* "Logging for" is a quiet eyebrow; the NAME gets its own line below
                it. The name WRAPS (never truncates) — a pet's name should never be
                cut — and only the genuinely long ones spill to two lines. */}
            <View style={styles.logForTextCol}>
              <ThemedText style={styles.logForLabel} numberOfLines={1}>Logging for</ThemedText>
              <ThemedText style={styles.logForName} numberOfLines={LOG_FOR_NAME_LINES}>{activePet.name}</ThemedText>
            </View>
            <ChevronDown size={PILL_CHEVRON} color={theme.colorTextSecondary} strokeWidth={1.75} />
          </TouchableOpacity>
        ),
      });
    }

    // More events → the type grid, as a bottom sheet over the current tab (B-745 PR 2;
    // out of beta with CUL-962, so it never pushes /log any more; one root-mounted sheet
    // since CUL-503). The photo-first "Attach photo" entry it used to carry was retired
    // in B-745 PR 1 (R4: every log starts from the event; photos still attach inside
    // each event flow), as was the older "Log with photo" row before it — both were
    // redundant second pathways to this one destination.
    rows.push({
      key: 'more',
      node: (
        <TouchableOpacity
          style={[styles.pill, pillWidth]}
          onPress={whileOpen(() => { closeMenu(); openLogSheet(); })}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <View style={[styles.pillGlyph, styles.pillGlyphQuiet]}>
            <Plus size={16} color={theme.colorTextSecondary} strokeWidth={1.75} />
          </View>
          <ThemedText style={styles.pillLabel}>More events</ThemedText>
          <DoorChevron />
        </TouchableOpacity>
      ),
    });

    // Quick GI symptom taps — open the log sheet straight at the confirm for that event
    // (CUL-504) rather than logging silently. The sheet's confirm carries the optional
    // photo (a vomit or stool photo still triggers the per-incident read and lands on
    // its record) and the B-010 "Saw it / Found it" time affordance, which vomit and
    // loose stool need because they're discovery-prone. Still one tap to the confirm,
    // one tap to save — and the completion card is the sheet's, never this menu's
    // (beat 6, C-17).
    rows.push({
      key: 'diarrhea',
      node: (
        <TouchableOpacity
          style={[styles.pill, pillWidth]}
          onPress={whileOpen(() => { closeMenu(); openLogSheet('diarrhea'); })}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <View style={[styles.pillGlyph, styles.pillGlyphSymptom]}>
            <EventIcon type="diarrhea" size={16} color={theme.colorEventSymptom} />
          </View>
          <ThemedText style={styles.pillLabel}>Loose stool</ThemedText>
          <DoorChevron />
        </TouchableOpacity>
      ),
    });
    rows.push({
      key: 'vomit',
      node: (
        <TouchableOpacity
          style={[styles.pill, pillWidth]}
          onPress={whileOpen(() => { closeMenu(); openLogSheet('vomit'); })}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <View style={[styles.pillGlyph, styles.pillGlyphSymptom]}>
            <EventIcon type="vomit" size={16} color={theme.colorEventSymptom} />
          </View>
          <ThemedText style={styles.pillLabel}>Vomit</ThemedText>
          <DoorChevron />
        </TouchableOpacity>
      ),
    });

    rows.push({
      key: 'log-food',
      node: (
        <TouchableOpacity
          style={[styles.pill, pillWidth]}
          onPress={whileOpen(() => { closeMenu(); router.push('/log?type=meal'); })}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <View style={[styles.pillGlyph, styles.pillGlyphQuiet]}>
            <Plus size={16} color={theme.colorTextSecondary} strokeWidth={1.75} />
          </View>
          <ThemedText style={styles.pillLabel}>Log food</ThemedText>
          <DoorChevron />
        </TouchableOpacity>
      ),
    });

    // Recent foods — meals AND treats the pet actually ate (the recency query is
    // food_type-agnostic). While `foodsForActivePet` is null the read has not answered
    // for THIS pet, so there are no pills: they would be another pet's (C-12). The
    // query returns newest first; the fan draws newest LOWEST, nearest the thumb.
    for (const food of [...(foodsForActivePet ?? [])].filter((f) => foodLines.has(f.id)).reverse()) {
      // CUL-1644 (D3): the food named the way History names it, through the one mapper,
      // with its format as its own tag. The tag is a sibling that holds its width, never
      // text appended to the label that wraps, so wet and dry of one line never read
      // alike (the foodFormat.ts header's rule). The spoken label carries both halves.
      const { label: foodLabel, tag: formatTag } = foodText.get(food.id)!;
      rows.push({
        key: `food-${food.id}`,
        node: (
          <TouchableOpacity
            style={[styles.pill, pillWidth]}
            onPress={whileOpen(() => { void handleQuickMeal(food); })}
            activeOpacity={0.7}
            disabled={logging !== null}
            accessibilityRole="button"
            accessibilityLabel={formatTag ? `${foodLabel}, ${formatTag.toLowerCase()}` : foodLabel}
            // CUL-724's hint half: every other pill opens something; this one writes.
            accessibilityHint={`Logs it for ${activePet.name} right away`}
          >
            <View style={[styles.pillGlyph, styles.pillGlyphMeal]}>
              <EventIcon type="meal" size={16} />
            </View>
            <View style={styles.foodLabelRow}>
              <ThemedText style={styles.pillLabel} numberOfLines={foodLines.get(food.id)}>
                {foodLabel}
              </ThemedText>
              {formatTag ? (
                <View style={styles.formatTag} testID="fab-format-tag">
                  <ThemedText style={styles.formatTagText} numberOfLines={1}>
                    {formatTag}
                  </ThemedText>
                </View>
              ) : null}
            </View>
            {logging === food.id && (
              <WhorlSpinner size="sm" ground="day" style={styles.spinner} />
            )}
          </TouchableOpacity>
        ),
      });
    }
  }
  slotCount.current = rows.length;

  // Beat 2, and its Reduce Motion frame: in motion the one glyph turns; still, the
  // plus and the × crossfade on the menu's fade, so the open state still reads as
  // "close" without anything turning.
  // A slot is a distance from the disc, so the row's index from the bottom picks it.
  const slotFor = (row: FanRow, i: number) => (
    <FanSlot
      key={row.key}
      anim={slots[Math.min(rows.length - 1 - i, MAX_SLOTS - 1)]}
      fade={fade}
      reducedMotion={reducedMotion}
    >
      {row.node}
    </FanSlot>
  );

  const glyphTurn = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${TURN_DEGREES}deg`] });

  return (
    <>
      {/* ONE LAYER for the scrim, the fan and the disc (CUL-322, BRK-37; C-14). While
          the menu is open the layer is modal: VoiceOver stays inside it, and its host
          sibling (HiddenUnderFabMenu, in the tabs layout) takes Home out of the tree
          on Android. The disc lives inside the layer so the way out stays reachable.
          box-none, so the closed layer takes no touch of its own. */}
      <View
        style={StyleSheet.absoluteFill}
        pointerEvents="box-none"
        accessibilityViewIsModal={open}
        onAccessibilityEscape={open ? closeMenu : undefined}
      >
        {open && (
          <Animated.View
            style={[StyleSheet.absoluteFill, styles.scrim, { opacity: fade }]}
            pointerEvents="box-none"
          >
            {/* The scrim's PRESS unmounts while the switcher Modal is up: on Android
                the tap that closes the Modal scrim can bleed through to this
                absolute-fill Pressable and dismiss the menu — the flip-then-log flow
                needs the menu to survive the flip. The veil itself stays. */}
            {!switcherVisible && (
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={closeMenu}
                accessible={false}
                testID="fab-scrim"
              />
            )}
          </Animated.View>
        )}

        <View style={styles.fabContainer} pointerEvents="box-none">
          {open && (
            <View style={styles.fan} pointerEvents="box-none">
              {fanPlan.scroll && activePet ? (
                // CUL-1636, the budget's last step: even with no food the doors stand
                // taller than the screen (AX2 and up on a small phone). The chip stays
                // pinned on top, and the doors scroll beneath it, opened at the bottom so
                // the pills nearest the thumb are the ones on screen.
                <>
                  {rows[0]?.key === 'log-for' && slotFor(rows[0], 0)}
                  <ScrollView
                    ref={fanScroll}
                    testID="fab-fan-scroll"
                    style={scrollCap}
                    contentContainerStyle={styles.fanScrollContent}
                    showsVerticalScrollIndicator
                    // A snap to the bottom on layout, never an animated scroll: it is where
                    // the column opens, not motion the owner sees.
                    onContentSizeChange={() => {
                      if (fanSnapped.current) return;
                      fanSnapped.current = true;
                      fanScroll.current?.scrollToEnd({ animated: false });
                    }}
                  >
                    {rows.map((row, i) => (row.key === 'log-for' ? null : slotFor(row, i)))}
                  </ScrollView>
                </>
              ) : (
                rows.map((row, i) => slotFor(row, i))
              )}
            </View>
          )}

          <Pressable
            onPress={toggleMenu}
            onPressIn={pressIn}
            onPressOut={pressOut}
            accessibilityRole="button"
            accessibilityLabel={open ? 'Close menu' : 'Log event'}
            accessibilityState={{ expanded: open }}
          >
            <Animated.View style={[styles.fab, { transform: [{ scale: pressScale }] }]}>
              {reducedMotion ? (
                <>
                  <Animated.View
                    style={[styles.fabInner, { opacity: fade.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}
                  >
                    <View style={styles.plusH} />
                    <View style={styles.plusV} />
                  </Animated.View>
                  <Animated.View style={[styles.fabInner, styles.fabGlyphStacked, styles.fabGlyphCross, { opacity: fade }]}>
                    <View style={styles.plusH} />
                    <View style={styles.plusV} />
                  </Animated.View>
                </>
              ) : (
                <Animated.View style={[styles.fabInner, { transform: [{ rotate: glyphTurn }] }]}>
                  <View style={styles.plusH} />
                  <View style={styles.plusV} />
                </Animated.View>
              )}
            </Animated.View>
          </Pressable>
        </View>
      </View>

      {/* The Modal WRAPPER, not the in-Modal layer: this menu is an in-tree overlay,
          so nothing is presented when the switcher opens and the panel needs a
          presentation of its own (CUL-662's split is for hosts that are themselves a
          Modal — copying its shape here would leave the switcher unpresented).

          captureSurface (CUL-678 D2) drops the management rows: the pills under this
          chip write a meal in one press, so "Add a pet" would hand the owner back a
          one-tap logging menu that is now about a different pet. Same rule as the
          log sheet — the surface class decides, not which of the two it is. */}
      <PetSwitcherSheet
        visible={switcherVisible}
        captureSurface
        onClose={() => setSwitcherVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
  },
  scrim: {
    backgroundColor: theme.colorScrimNight,
  },
  fabContainer: {
    position: 'absolute',
    bottom: FAB_BOTTOM,
    right: FAN_RIGHT_INSET,
    alignItems: 'flex-end',
  },
  fab: {
    width: FAB_DISC,
    height: FAB_DISC,
    borderRadius: FAB_DISC / 2,
    // CUL-322, D3 = C (PM-ruled 2026-09-26): the brand night disc, the one exception
    // in-app brand rule 3 names. It replaces CUL-1063's colorAccentInk disc, which
    // cleared contrast and read drab on device. Its glyph was the bright teal until
    // CUL-1626 (PM, 2026-10-06) took it white: under CUL-1279's G4 = C (2026-10-03)
    // indigo is the action and teal is a good fact, so a teal mark on the app's primary
    // action read against the split. 14.25:1 disc on colorNeutralLight, 14.87:1 glyph
    // on the disc; both pinned in constants/theme.contrast.test.ts, with the failing
    // pairs a "tidy" would reach for (the bright teal as the disc; a white plus on it).
    backgroundColor: theme.colorBrandNightElevated,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.fab,
  },
  fabInner: {
    width: 20,
    height: 20,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // The Reduce Motion × sits exactly over the plus it crossfades with.
  fabGlyphStacked: {
    position: 'absolute',
  },
  fabGlyphCross: {
    transform: [{ rotate: '45deg' }],
  },
  // The plus is drawn in bars, not text, so it is a glyph by construction. White on the
  // indigo disc (CUL-1626): the action's own glyph, never the accent, which G4 = C keeps
  // for a good fact. One glyph turns into the ×, so the × is white too, and so is the
  // Reduce Motion cross; FAB.test.tsx pins the colour every bar renders.
  plusH: { position: 'absolute', width: 20, height: 2.5, backgroundColor: theme.colorTextOnDark, borderRadius: 1.25 },
  plusV: { position: 'absolute', width: 2.5, height: 20, backgroundColor: theme.colorTextOnDark, borderRadius: 1.25 },

  fan: {
    alignItems: 'flex-end',
    gap: FAN_GAP,
    marginBottom: FAN_MARGIN_BOTTOM,
  },
  // A scroll view clips its children, so the content keeps room for the pills' shadow
  // above, below and to the left (the right edge stays flush with the chip and the disc).
  // The open's slide in from the disc's corner is clipped at the right edge here, for the
  // ~300ms it runs: the device check at AX2 / AX3 on an SE is where that is judged.
  fanScrollContent: {
    alignItems: 'flex-end',
    gap: FAN_GAP,
    paddingVertical: theme.space1,
    paddingLeft: theme.space1,
  },
  fanSlot: {
    // Pills grow out of the disc's corner (beat 4), so they scale about theirs.
    transformOrigin: 'bottom right',
    alignItems: 'flex-end',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: PILL_INNER_GAP,
    backgroundColor: theme.colorSurface,
    borderRadius: theme.radiusFull,
    paddingVertical: PILL_PADDING_V,
    paddingLeft: PILL_PADDING_LEFT,
    paddingRight: PILL_PADDING_RIGHT,
    // The 44pt floor is carried by the pill's own box, not hitSlop: the pills stack
    // with a gap and no slop, so no two ever share hit area (C-5) — on the recent-food
    // pills a mis-resolved tap would log the WRONG food, into a diet trial (CUL-612).
    minHeight: PILL_MIN_HEIGHT,
    // Long brand + product names wrap to two lines inside the cap rather than run off
    // a narrow phone. The cap itself is the budget's (`pillWidth`): 300pt, or less where
    // 300 plus the inset would overflow (an SE under Display Zoom is 320pt wide).
    ...shadows.md,
  },
  pillGlyph: {
    width: PILL_GLYPH,
    height: PILL_GLYPH,
    borderRadius: PILL_GLYPH / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillGlyphMeal: {
    backgroundColor: theme.colorEventMealLight,
  },
  pillGlyphSymptom: {
    backgroundColor: theme.colorEventSymptomLight,
  },
  pillGlyphQuiet: {
    backgroundColor: theme.colorNeutralLight,
  },
  pillLabel: {
    fontSize: PILL_LABEL_SIZE,
    color: theme.colorTextPrimary,
    fontWeight: theme.fontWeightMedium,
    flexShrink: 1,
  },
  // CUL-1644: the label and its format tag, side by side. The label yields (flexShrink 1,
  // two lines); the tag holds its width (C-8: the half stated fewest times is protected),
  // capped at the row so the largest Dynamic Type cannot push it out of the pill.
  foodLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: FOOD_TAG_GAP,
    flexShrink: 1,
  },
  formatTag: {
    flexShrink: 0,
    maxWidth: '100%',
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusXS,
    paddingHorizontal: FOOD_TAG_PADDING_H,
    paddingVertical: FOOD_TAG_PADDING_V,
  },
  // History's tag register (SpineNodeRow): tracked uppercase, tertiary ink.
  formatTagText: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    letterSpacing: theme.trackingWide,
    fontWeight: theme.weightMedium,
  },
  logForPill: {
    // Wide enough that a 16-char two-word name ("Schrodingers Cat") sits on one line;
    // the name is the wrong-pet safeguard, so it gets the room.
    minWidth: 220,
    borderRadius: theme.radiusLarge,
  },
  logForTextCol: {
    flexShrink: 1,
  },
  logForLabel: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    marginBottom: LOG_FOR_LABEL_GAP,
  },
  logForName: {
    // The name is the wrong-pet safeguard — make it the chip's hero (textLG), on its
    // own line so it gets the full pill width.
    fontSize: theme.textLG,
    color: theme.colorTextPrimary,
    fontWeight: theme.weightMedium,
  },
  card: {
    backgroundColor: theme.colorSurface,
    borderRadius: theme.radiusMedium,
    ...shadows.md,
  },
  // The no-pet copy sits where the pills would (EmptyState's top-anchored 'inset'),
  // re-padded for a floating card rather than a screen: EmptyState's own inset is
  // sized for a full-width list below a screen header.
  noPet: {
    paddingHorizontal: theme.space2,
    paddingTop: theme.space2,
    paddingBottom: theme.space2,
  },
  spinner: {
    marginLeft: theme.space1,
  },
});
