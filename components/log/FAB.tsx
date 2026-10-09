import { useState, useRef, useCallback, useEffect, useLayoutEffect, useContext, type ReactNode, type Ref } from 'react';
import {
  StyleSheet, View, Animated, BackHandler,
  Pressable, Alert, ScrollView, useWindowDimensions, AccessibilityInfo,
  type PressableProps, type StyleProp, type ViewStyle,
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react-native';
import { theme, shadows } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';
import { EmptyState } from '../ui/EmptyState';
import { EventIcon } from '../event/EventIcon';
import { PetAvatar } from '../pet/PetAvatar';
import { PetSwitcherSheet } from '../pet/PetSwitcherSheet';
import { useUiStore, type LogSheetConfirmType } from '../../store/uiStore';
import { reducedMotionNow } from '../../store/reducedMotionStore';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useTodayKey } from '../../hooks/useTodayKey';
import { openMenu as openMenuHaptic, slideCross } from '../../lib/haptics';
import { useEventStore } from '../../store/eventStore';
import { useFoodLibraryStore } from '../../store/foodLibraryStore';
import { useRecordChangeStore } from '../../store/recordChangeStore';
import { useSyncStore } from '../../store/syncStore';
import { usePetStore } from '../../store/petStore';
import { useMomentStore, isCornerCardUp, MEAL_FLAGGED_DURATION_MS } from '../../store/momentStore';
import { stageFlight, whenFlightDone } from '../motion/flightMotion';
import { measureNodeInWindow, measureNodeOnPage, type WindowRect } from '../../lib/measureNode';
import { getRecentFoods, PickerFood } from '../../lib/db';
import { fabFoodDay } from '../../lib/fabRecentFoods';
import { insertMeal } from '../../lib/meals';
import { applyMealTrialFlag } from '../../lib/mealTrialFlag';
import { noPetToLogForCopy } from '../../lib/logCopy';
import { focusAccessibility } from '../../lib/a11yFocus';
import { rowFoodLabelOf } from '../../lib/dayEvents';
import { foodFormatTag } from '../../lib/foodFormat';
import { recordCaptureChange } from '../../lib/captureChanges';
import {
  HOLD_TO_OPEN_MS, leftDisc, nextRest, releaseOutcome, spacesAgree, targetAt,
  type Point, type Rect, type Rest, type SlideKind, type SlideTarget,
} from '../../lib/fanSlide';
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
// half). Hold-and-slide (beat 5) is CUL-1278: see THE SLIDE below, and its write rule in
// `lib/fanSlide.ts`.

/** Beat 1: the disc answers the finger on touch-DOWN, before release. */
const PRESS_SCALE = 0.9;
/** CUL-1645 (D3): a pill answers the finger on the disc's vocabulary, at a pill's
 *  weight. 0.97 rather than the disc's 0.9: a 300pt pill at 0.9 would travel 30pt, and
 *  the settle should read as a press, not a jump. Same springs as the disc's. */
const PILL_PRESS_SCALE = 0.97;
const PRESS_IN_SPRING = { tension: 300, friction: 20 } as const;
const PRESS_OUT_SPRING = { tension: 200, friction: 10 } as const;
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
/** CUL-1646 (D3): in a two pet home the "Logging for" chip leads. It springs with the
 *  veil at delay 0, and the choices fan after it, nearest first, this much later (the
 *  mock's §04 figure). Context before choice: the owner sees whose log it is before a
 *  food lands under the thumb. A one pet home has no chip and keeps the plain stagger. */
const CHIP_LEAD_MS = 60;
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
/** CUL-1643 (D3): a choice never plays the cancel. The tapped food holds this long while
 *  the others retract, then fades under the arriving card over the next figure (the
 *  mock's §04 timings, `docs/culprit-fab-mockups.html`). Opacity only, so the same two
 *  numbers serve Reduce Motion: nothing moves either way. */
const CHOSEN_HOLD_MS = 120;
const CHOSEN_FADE_MS = 200;
/** The meal card's interactive dwell, restarted when the meal mark lands so the flight
 *  never eats it (C-21). Mirrors `MEAL_DURATION_MS` in `store/momentStore.ts`, which is
 *  not exported: the same question (how long the card's Undo and intake chips stay
 *  live), so the same number, and `FAB.test.tsx` drives the store to pin the two equal
 *  (C-34). */
export const MEAL_CARD_DWELL_MS = 5000;

// CUL-724 — what a screen reader hears as the fan opens, and how long the announcement
// gets before focus moves onto the fan's top row. A focus move makes VoiceOver read the
// focused row at once, which cuts off anything still being spoken, so the short sentence
// goes first. The delay is a DEVICE number: if the phone check finds the announcement
// clipped or the focus late, this is the one knob.
export const FAN_OPEN_ANNOUNCEMENT = 'Log menu open';
export const FAN_FOCUS_DELAY_MS = 500;
/** Where a fan pill starts, relative to where it lands: tucked into the disc's
 *  corner at 60%, growing out of it (the pills' transformOrigin is that corner). */
const FAN_FROM = { x: 18, y: 26, scale: 0.6 } as const;
/** The most pills the fan can hold: the switcher chip, More events, Stool,
 *  Vomit, Log food, and three recent foods. One Animated.Value per SLOT (a slot is
 *  a distance from the disc), so a row that mounts after the fan has run — the
 *  recent foods answer asynchronously — lands on a slot already at rest. */
const MAX_SLOTS = 8;
/** The doors' labels, top to bottom, as the fan draws them and the budget plans them.
 *  The split stool pill is planned by everything it draws in its row (its label and both
 *  segments), so the budget wraps it as wide as it stands (CUL-1657). */
const DOOR_LABELS = ['More events', 'Stool Normal Loose', 'Vomit', 'Log food'] as const;

interface FanRow {
  key: string;
  node: ReactNode;
}

/** A slide target's key: a pill's row key, or one of the split stool pill's segments. */
type SlideKey = string;

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

/** A food pill's meal disc. Its own component because it is drawn twice: in the pill,
 *  and as the flight's clone at the root (CUL-1643), which must be the same 28pt mark. */
function MealMark({ hidden = false }: { hidden?: boolean }) {
  return (
    <View style={[styles.pillGlyph, styles.pillGlyphMeal, hidden && styles.pillGlyphFlown]}>
      <EventIcon type="meal" size={16} />
    </View>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * THE SPLIT STOOL PILL (CUL-1657, PM ruling D6 on CUL-1655; mock round 2 §04). The
 * sheet's split Stool tile (EventTypePicker's StoolSplitTile), carried into the fan: the
 * glyph and "Stool" name the subject and are not a control; the two segments are. Each
 * opens the same confirm the sheet uses (Saw it or Found it, the optional photo), never
 * a silent write, so a normal stool is two taps from Home and a loose one is unchanged.
 *
 * The pill is a plain View, not a FanPill: a touchable around two touchables would
 * answer a press between them with a third action. Each segment is its own Pressable,
 * a 44pt box (the floor carried by the box, no hitSlop, as on every pill here, C-5), so
 * the two never share hit area and the gap between them only has to be non-negative.
 * Normal against Loose is a clinical distinction, so the boundary stays unambiguous.
 * The visible chip inside each box is smaller; the box is the target.
 *
 * Labels say what the segment does (C-7), the sheet tile's own words. The segments do
 * not scale on press: the fill answers alone, so Reduce Motion has nothing to take
 * away, and the pill arrives on its FanSlot like every other pill.
 *
 * THE RECORD (PR-29, migration 091): the first time this pill shows, every pet of the
 * account gets its `fab_stool_split` row, dated now. Written from this pill's own
 * mount, so it is dated before the first frame anyone can tap Normal on (React flushes
 * a mount's passive effects before it handles the next touch, and the date is taken
 * synchronously at the top of the effect). `recordCaptureChange` writes only the pets
 * that lack a row, so every later open writes nothing, and a pet that joins later gets
 * its own row the first time the fan shows it.
 */
function StoolSplitPill({
  style, petIds, onNormal, onLoose, segRef, slideOver = null,
}: {
  style: StyleProp<ViewStyle>;
  petIds: readonly string[];
  onNormal: () => void;
  onLoose: () => void;
  /** CUL-1278: each segment is its own slide target, measured apart. */
  segRef?: (key: SlideKey, node: View | null) => void;
  /** CUL-1278: the segment a slide is resting over takes its pressed fill. */
  slideOver?: string | null;
}) {
  // Keyed by the set of pets, so a pet that arrives while the fan is open is written too.
  const petKey = [...petIds].sort().join(',');
  const record = useCallback(() => {
    if (!petKey) return;
    recordCaptureChange('fab_stool_split', petKey.split(','), new Date()).catch((err) => {
      console.warn('[FAB] could not record the stool split for the vet report', err);
    });
  }, [petKey]);
  useEffect(record, [record]);
  // The backstop (adversarial review): a mount write that threw (a busy database) is not
  // retried until the pill mounts again, so a segment asks once more as it is tapped. On
  // the normal path the pets already have their rows and this writes nothing; after a
  // failed mount write it dates the row at the tap, still before the event it opens.
  const tapped = (open: () => void) => () => { record(); open(); };

  return (
    <View style={[styles.pill, styles.splitPill, style]} testID="fab-stool-split">
      <View style={[styles.pillGlyph, styles.pillGlyphSymptom]}>
        <EventIcon type="stool_normal" size={16} color={theme.colorEventSymptom} />
      </View>
      <ThemedText style={[styles.pillLabel, styles.splitLabel]}>Stool</ThemedText>
      <View style={styles.splitSegs}>
        <Pressable
          ref={segRef ? (node) => segRef('stool-normal', node) : undefined}
          onPress={tapped(onNormal)}
          style={styles.splitSeg}
          accessibilityRole="button"
          accessibilityLabel="Log normal stool"
          testID="fab-stool-normal"
        >
          {({ pressed }) => (
            <View style={[styles.splitChip, (pressed || slideOver === 'stool-normal') && styles.splitChipPressed]}>
              <ThemedText style={styles.splitChipText}>Normal</ThemedText>
            </View>
          )}
        </Pressable>
        <Pressable
          ref={segRef ? (node) => segRef('stool-loose', node) : undefined}
          onPress={tapped(onLoose)}
          style={styles.splitSeg}
          accessibilityRole="button"
          accessibilityLabel="Log loose stool"
          testID="fab-stool-loose"
        >
          {({ pressed }) => (
            <View style={[styles.splitChip, (pressed || slideOver === 'stool-loose') && styles.splitChipPressed]}>
              <ThemedText style={styles.splitChipText}>Loose</ThemedText>
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );
}

/**
 * A fan pill's press (CUL-1645, D3): on touch DOWN it settles to 0.97 and takes the
 * pressed fill, the disc's own vocabulary on the native driver. Under Reduce Motion
 * the fill alone answers and nothing scales (beat 8). `held` keeps the pressed state
 * up after the finger lifts: a one-tap food holds it through its local write, which is
 * what replaced the spinner (an instant action never spins, CUL-1593). The fill is the
 * neutral pressed ground the app's other rows use, never a colour that reads as
 * success: the completion card is where a write is said.
 *
 * The pill's own box is still the whole hit area: the scale is a transform, so it
 * moves no geometry and the stack's gap still keeps every pill apart (C-5).
 */
function FanPill({
  style, held = false, reducedMotion, ref, children, ...pressable
}: Omit<PressableProps, 'style' | 'children' | 'onPressIn' | 'onPressOut'> & {
  style: StyleProp<ViewStyle>;
  held?: boolean;
  reducedMotion: boolean;
  ref?: Ref<View>;
  children: ReactNode;
}) {
  const [touching, setTouching] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const pressed = touching || held;
  // Driven off the pressed STATE, not the handlers: on release the touch ends and a
  // food's write begins in one event, so React batches them and the pill never springs
  // up for a frame between the two.
  const settled = useRef(false);
  useEffect(() => {
    if (!settled.current) {
      settled.current = true;
      return;
    }
    if (reducedMotion) {
      scale.setValue(1);
      return;
    }
    Animated.spring(scale, pressed
      ? { toValue: PILL_PRESS_SCALE, useNativeDriver: true, ...PRESS_IN_SPRING }
      : { toValue: 1, useNativeDriver: true, ...PRESS_OUT_SPRING }).start();
  }, [pressed, reducedMotion, scale]);

  return (
    <AnimatedPressable
      ref={ref as never}
      {...pressable}
      onPressIn={() => setTouching(true)}
      onPressOut={() => setTouching(false)}
      style={[
        styles.pill,
        style,
        pressed && styles.pillPressed,
        reducedMotion ? null : { transform: [{ scale }] },
      ]}
      testID={pressable.testID ?? 'fab-pill'}
    >
      {children}
    </AnimatedPressable>
  );
}

/**
 * The fan's pill, in motion or still. The pill's CONTENT is the caller's; this owns
 * only how it arrives. `slot` 0 is the pill nearest the disc.
 */
function FanSlot({
  anim, fade, exit, reducedMotion, children,
}: {
  anim: Animated.Value;
  fade: Animated.Value;
  /** CUL-1643: the chosen food's own fade. It stands in for the slot's opacity, so the
   *  pill stays put at full while the others retract, and leaves under the card. */
  exit?: Animated.Value;
  reducedMotion: boolean;
  children: ReactNode;
}) {
  // Reduce Motion: the pill rides the one crossfade and never moves (beat 8). The
  // choice is made at render from the hook (C-43); the handlers write the end state
  // either way, so a setting flipped mid-open still renders a correct frame. The slot's
  // own value multiplies in so a redeal (CUL-1646) can crossfade the foods alone: the
  // open sets every slot to 1, so outside a redeal this is the menu's fade unchanged.
  const style = reducedMotion
    ? { opacity: exit ?? Animated.multiply(fade, anim) }
    : {
        opacity: exit ?? anim.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
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
  // CUL-1642 — the fan's veil is handed to the sheet, not faded under it.
  const logSheetUp = useUiStore((s) => s.logSheet !== null);
  const logSheetVeilTaken = useUiStore((s) => s.logSheetVeilTaken);
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
  // CUL-1643 — the food a one-tap log chose: its pill stays while the others retract,
  // and `flown` hides its mark while the clone carries it to the card. The glyph nodes
  // are what the flight measures, at the tap, so the rect is ready when the write lands.
  const [chosen, setChosen] = useState<{ key: string; flown: boolean } | null>(null);
  const chosenExit = useRef(new Animated.Value(1)).current;
  const foodGlyphs = useRef(new Map<string, View>()).current;
  const flightFrom = useRef<{ foodId: string; rect: WindowRect | null } | null>(null);
  // True once the open's springs have come to rest. A tap that beats them measures a pill
  // still on its way out of the disc, whose clone would start off its glyph and jump, so
  // such a tap flies nothing (the card rises as it always has).
  const fanSettled = useRef(false);

  const pressScale = useRef(new Animated.Value(1)).current;
  const turn = useRef(new Animated.Value(0)).current;
  // The menu's opacity under Reduce Motion, and the glyph's crossfade there.
  const fade = useRef(new Animated.Value(0)).current;
  // The VEIL's opacity, apart from the fade since CUL-1642: a hand-off to the log sheet
  // retracts the fan (the fade, under Reduce Motion) while the veil stays at full.
  const veil = useRef(new Animated.Value(0)).current;
  // True from a hand-off until the sheet's veil is up: the veil outlives the menu.
  const [veilHeld, setVeilHeld] = useState(false);
  const slots = useRef(Array.from({ length: MAX_SLOTS }, () => new Animated.Value(0))).current;
  // How many pills the last render drew — the open and close stagger only the ones on
  // screen, so the close keeps its ~180ms however many slots are idle.
  const slotCount = useRef(0);
  // CUL-1646 — whether the top row the last render drew is the "Logging for" chip, and
  // how many of the rows are recent foods (always the lowest, so slots 0 … n-1).
  const chipLeads = useRef(false);
  const foodSlotCount = useRef(0);
  // The pet the open fan's foods are dealt for, whether a switch is waiting on that
  // pet's read, and whether a redeal is under way. A pill acts on neither a redeal nor
  // a close (`whileOpen`): mid redeal the rows are still arriving under the finger.
  const dealtFor = useRef<string | null>(null);
  const dealPending = useRef(false);
  const dealing = useRef(false);
  const dealAnim = useRef<Animated.CompositeAnimation | null>(null);
  // True between a close starting and its animation finishing. A tap in that window
  // re-opens rather than closing again: the menu is still mounted and on its way out.
  const closing = useRef(false);

  // ── THE SLIDE (CUL-1278, D5 = a; the convening's amendments, CUL-1625) ──────────
  // Press and hold the disc (HOLD_TO_OPEN_MS) and the fan opens as a tap opens it; slide
  // to a pill and let go, and the release does what a tap on that pill does. The write
  // rule is `lib/fanSlide.ts`; this half measures, follows the finger, and runs the tap's
  // own action. No ring (amendment 1): the fan opening is the hold's signal.
  //
  // The finger is followed from the disc: the touch belongs to the disc's Pressable from
  // press to lift, so its moves bubble to the View around it whichever pill they cross,
  // and no pill's own press ever fires during a slide. A pill is hit-tested against its
  // PAGE frame (the space the touch is reported in), measured once the fan has landed and
  // dropped whenever the drawn rows change (a late food, a redeal), so nothing is chosen
  // against a pill still moving. The disc is measured at the hold: its frame says when the
  // finger has left it (a roll on the disc is a slow tap), and whether the measure and the
  // touch share a space at all (rule 2's check). The dwell runs on the events' own clock.
  // The large-text scroll branch takes no slide: a door scrolled under the pinned chip
  // still measures where it hides, so the fan there is tap only.
  //
  // `slide` is the live gesture; null outside one. `slideTargets` is the current measure
  // (empty is "not measured", which the rule reads as no hit). `slideNodes` and
  // `slideActions` are written at render: the node each target measures, and the tap's
  // own action for it, so a release can only ever run what a tap runs (C-17, C-18). Both
  // writes are idempotent (the same render writes the same map), and only handlers and
  // effects read them.
  const slide = useRef<{
    start: Point; origin: Point | null; last: Point; left: boolean; rest: Rest | null; disc: Rect | null;
  } | null>(null);
  const pressPoint = useRef<Point | null>(null);
  // The disc's origin in the touch's own space: the press's page point less its point
  // within the disc. The disc's content takes no touch, so the press's target is always
  // the Pressable's host, which sits exactly on the measured wrapper.
  const pressOrigin = useRef<Point | null>(null);
  const discNode = useRef<View | null>(null);
  const fanScrolls = useRef(false);
  const slideTargets = useRef<SlideTarget[]>([]);
  const slideNodes = useRef(new Map<SlideKey, View>()).current;
  const slideActions = useRef(new Map<SlideKey, { kind: SlideKind; run: () => void }>());
  const rowsSig = useRef('');
  const remeasure = useRef(false);
  const [slideOver, setSlideOver] = useState<SlideKey | null>(null);
  const slideOverNow = useRef<SlideKey | null>(null);
  // Amendment 4: a screen reader cannot drag, and VoiceOver's double-tap-and-hold is a
  // long press. With one running the disc takes no long press at all, so every press
  // is the tap it always was.
  const [screenReaderOn, setScreenReaderOn] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((on) => { if (live && on) setScreenReaderOn(true); })
      // Unknown reads as no screen reader: the change event still corrects it, and the
      // cost of the wrong guess is a long press a reader would not have used.
      .catch((e) => console.warn('[FAB] screen reader probe failed', e));
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', (on: boolean) => setScreenReaderOn(on));
    return () => { live = false; sub?.remove(); };
  }, []);

  /** The pill under the finger, said once per arrival: the pressed fill, and the
   *  selection tick on landing on a new pill (never on leaving one for empty space). */
  const showSlideOver = useCallback((key: SlideKey | null) => {
    if (slideOverNow.current === key) return;
    slideOverNow.current = key;
    setSlideOver(key);
    if (key !== null) slideCross();
  }, []);

  /** Measure every target on the page, once the fan is at rest, no redeal runs, the fan is
   *  not the scroll branch, and the disc's own frame says the measure and the touch share a
   *  space. All the frames land together or not at all: one null drops the batch, since a
   *  column with a hole would hit-test as if the hole were empty. A finger already over a
   *  pill shows it, but its rest has no event time yet, so it cannot write until it moves:
   *  a still finger is never timed from a clock it did not set. */
  const measureSlideTargets = useCallback(() => {
    const s = slide.current;
    if (!s || !s.disc || !fanSettled.current || dealing.current || fanScrolls.current) return;
    if (!spacesAgree(s.disc, s.origin)) {
      console.warn('[FAB] slide measure and touch disagree; the fan stays tap only');
      return;
    }
    const sig = rowsSig.current;
    const entries = [...slideNodes.entries()].filter(([k]) => slideActions.current.has(k));
    if (entries.length === 0) return;
    const out: SlideTarget[] = [];
    let pending = entries.length;
    let whole = true;
    entries.forEach(([key, node]) => {
      const kind = slideActions.current.get(key)!.kind;
      measureNodeOnPage(node as never, (rect) => {
        if (rect) out.push({ key, kind, rect });
        else whole = false;
        if (--pending > 0) return;
        if (!whole) return;
        if (slide.current !== s || rowsSig.current !== sig) return;
        if (!fanSettled.current || dealing.current || fanScrolls.current) return;
        slideTargets.current = out;
        const hit = targetAt(out, s.last);
        s.rest = nextRest(null, hit, s.last, null);
        showSlideOver(hit?.key ?? null);
      });
    });
  }, [slideNodes, showSlideOver]);

  const endSlide = useCallback(() => {
    slide.current = null;
    slideTargets.current = [];
    showSlideOver(null);
  }, [showSlideOver]);

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

  // CUL-1635 — a completion card in the disc's corner, read as a boolean for the same
  // reason as the overlay above.
  const cornerCardUp = useMomentStore(isCornerCardUp);

  // CUL-1636 — the fan's height budget reads the window and the text multiplier. The
  // insets context, not the hook: the hook throws without a provider, and the FAB has
  // no reason to own one (on device expo-router's root always provides it).
  const frame = useWindowDimensions();
  const safeTop = useContext(SafeAreaInsetsContext)?.top ?? 0;
  const fanScroll = useRef<ScrollView>(null);
  const fanSnapped = useRef(false);

  // CUL-724 — VoiceOver focus moves INTO the fan when it opens. The modal layer keeps
  // focus from wandering out, but nothing put it in: it stayed on the disc, and the
  // first swipe went wherever the platform guessed. The fan's top row (the no-pet card,
  // the pet chip, or More events, whichever leads) takes this callback as its ref, so
  // the row's own mount is the trigger: the open, and the swap when the pets land under
  // an open no-pet card, whose node leaves the tree and takes focus with it. A ref, not
  // an effect, because the rows are built below the stand-down's early return, where no
  // hook may run, and so the lead is never restated as a second predicate here.
  //
  // `fanLeadKey` is the lead row's key, written at render. The callback fires far more
  // often than the lead changes: a touchable's ref goes through Animated's merged ref,
  // which re-fires null and then the same node on EVERY render, and a row remounts when
  // the fan switches into its scroll branch. Neither is a new lead, and neither may yank
  // focus back to the top of a list the owner is already in, so only a new key arms. The
  // lead is forgotten when the menu closes, so every open moves focus once.
  const fanLeadKey = useRef<string | null>(null);
  const focusedLead = useRef<string | null>(null);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The lead's LIVE node. The timer reads it when it fires rather than closing over the
  // node it was armed with: a same-key remount inside the beat (the scroll branch flipping)
  // would otherwise hand the platform an unmounted node, and focus would silently stay put.
  const leadNode = useRef<View | null>(null);
  const armFanFocus = useCallback(() => {
    // The open is announced on both platforms: there is no live region here, so nothing
    // else speaks it on Android (C-44), and the call is a no-op without a screen reader.
    // The swap is not: the focus move reads the new top row, which says what changed.
    if (focusedLead.current === null) AccessibilityInfo.announceForAccessibility(FAN_OPEN_ANNOUNCEMENT);
    focusedLead.current = fanLeadKey.current;
    if (focusTimer.current) clearTimeout(focusTimer.current);
    focusTimer.current = setTimeout(() => {
      focusTimer.current = null;
      focusAccessibility(leadNode.current);
    }, FAN_FOCUS_DELAY_MS);
  }, []);
  const fanLeadRef = useCallback((node: View | null) => {
    leadNode.current = node;
    if (!node) return;
    const key = fanLeadKey.current;
    if (key === null || focusedLead.current === key) return;
    armFanFocus();
  }, [armFanFocus]);
  // A close keeps the pills mounted while they retract, so it cancels a pending move at
  // its START: focus never lands on a row on its way out. The effect covers the closes
  // that never run `closeMenu` (the capture overlay's stand-down) and forgets the lead.
  const cancelFanFocus = useCallback(() => {
    if (focusTimer.current) clearTimeout(focusTimer.current);
    focusTimer.current = null;
  }, []);
  useEffect(() => {
    if (open) return;
    focusedLead.current = null;
    cancelFanFocus();
  }, [open, cancelFanFocus]);
  useEffect(() => cancelFanFocus, [cancelFanFocus]);

  const openMenu = useCallback((): boolean => {
    // CUL-1635 — the fan never opens under a completion card. The card paints over the
    // fan (a root sibling) and its Undo row sits on the lowest pill, so a tap meant for
    // the second food of a meal could undo the first. Dismissed on the owner's own tap,
    // before the fan draws: the card's pointerEvents drop with `visible`, so not even
    // its fade can take a touch. A card that is HELD (an unread safety note, an Undo
    // mid-write) wins instead: the fan stays shut until the card's own dwell ends.
    if (useMomentStore.getState().dismissCornerCard() === 'held') return false;
    // Light impact on OPEN only — closing the menu commits to nothing and stays silent.
    openMenuHaptic();
    closing.current = false;
    // A re-open caught mid-close: setValue also stops the chosen pill's fade if it runs.
    setChosen(null);
    chosenExit.setValue(1);
    fanSettled.current = false;
    setOpen(true);
    dealtFor.current = usePetStore.getState().activePet?.id ?? null;
    dealPending.current = false;
    const count = Math.max(slotCount.current, 1);
    if (reducedMotionNow()) {
      // Beat 8: one crossfade. The turn and the slots jump to their end state so a
      // render that still reads motion (the setting flipped mid-open) is correct.
      turn.setValue(1);
      slots.forEach((v) => v.setValue(1));
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: FADE_MS, useNativeDriver: true }),
        Animated.timing(veil, { toValue: 1, duration: FADE_MS, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (!finished) return;
        fanSettled.current = true;
        measureSlideTargets();
      });
      return true;
    }
    // A slot past today's count lands at rest, so a row that mounts late appears in
    // place rather than invisibly at 0. The recent foods are read before the open now
    // (CUL-1634), so this is the backstop for a tap that beats the mount read.
    slots.slice(count).forEach((v) => v.setValue(1));
    const fanIn = (v: Animated.Value) => Animated.spring(v, { toValue: 1, useNativeDriver: true, ...FAN_SPRING });
    // CUL-1646: the chip is the farthest slot, which the nearest first stagger landed
    // LAST. It leads now, with the veil, and the choices follow it.
    const chipSlot = chipLeads.current && count > 1 ? slots[count - 1] : null;
    const choices = Animated.stagger(FAN_STAGGER_MS, slots.slice(0, chipSlot ? count - 1 : count).map(fanIn));
    Animated.parallel([
      Animated.spring(turn, { toValue: 1, useNativeDriver: true, ...TURN_SPRING }),
      Animated.timing(fade, { toValue: 1, duration: SCRIM_IN_MS, useNativeDriver: true }),
      Animated.timing(veil, { toValue: 1, duration: SCRIM_IN_MS, useNativeDriver: true }),
      ...(chipSlot ? [fanIn(chipSlot), Animated.sequence([Animated.delay(CHIP_LEAD_MS), choices])] : [choices]),
    ]).start(({ finished }) => {
      if (!finished) return;
      fanSettled.current = true;
      measureSlideTargets();
    });
    return true;
  }, [turn, fade, veil, slots, chosenExit, measureSlideTargets]);

  // `keepVeil` is the hand-off to the log sheet (CUL-1642): everything retracts as a
  // close does except the veil, which the sheet takes over at full.
  // `chosenSlot` is a quick meal (CUL-1643): that pill is left out of the retract and
  // fades on its own `exit`, so a choice never plays the cancel.
  const retract = useCallback((keepVeil: boolean, chosenSlot: number | null = null) => {
    cancelFanFocus();
    // A close under the finger (a card arriving, a quick meal's hand-over) ends the slide:
    // nothing left to hit-test, and no tick over whatever took the fan's place.
    endSlide();
    fanSettled.current = false;
    closing.current = true;
    // A close ends a redeal: the close's own stagger takes the food slots from here.
    dealAnim.current?.stop();
    dealAnim.current = null;
    dealPending.current = false;
    dealing.current = false;
    const finish = ({ finished }: { finished: boolean }) => {
      // Interrupted by a re-open: the menu stays.
      if (!finished || !closing.current) return;
      closing.current = false;
      setOpen(false);
      setChosen(null);
      slots.forEach((v) => v.setValue(0));
      chosenExit.setValue(1);
    };
    // A tap that beats the open's own spring: the retract stops the open's stagger as a
    // whole, so the chosen pill is carried to rest here rather than frozen mid-fan.
    const chosenRest = chosenSlot === null ? [] : [
      Animated.spring(slots[chosenSlot], { toValue: 1, useNativeDriver: true, ...FAN_SPRING }),
    ];
    const chosenOut = chosenSlot === null ? [] : [Animated.sequence([
      Animated.delay(CHOSEN_HOLD_MS),
      Animated.timing(chosenExit, { toValue: 0, duration: CHOSEN_FADE_MS, useNativeDriver: true }),
    ])];
    const veilOut = (duration: number) =>
      (keepVeil ? [] : [Animated.timing(veil, { toValue: 0, duration, useNativeDriver: true })]);
    if (reducedMotionNow()) {
      if (chosenSlot !== null) slots[chosenSlot].setValue(1);
      Animated.parallel([
        Animated.timing(fade, { toValue: 0, duration: FADE_MS, useNativeDriver: true }),
        ...veilOut(FADE_MS),
        ...chosenOut,
      ]).start((r) => {
        if (r.finished) turn.setValue(0);
        finish(r);
      });
      return;
    }
    const count = Math.max(slotCount.current, 1);
    Animated.parallel([
      Animated.timing(turn, { toValue: 0, duration: CLOSE_MS, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 0, duration: CLOSE_MS, useNativeDriver: true }),
      ...veilOut(CLOSE_MS),
      ...chosenRest,
      ...chosenOut,
      // Reverse order: the farthest pill retracts first. The chosen one stays.
      Animated.stagger(
        CLOSE_STAGGER_MS,
        slots.slice(0, count).filter((_, i) => i !== chosenSlot).reverse().map((v) =>
          Animated.timing(v, { toValue: 0, duration: CLOSE_ITEM_MS, useNativeDriver: true })),
      ),
    ]).start(finish);
  }, [turn, fade, veil, slots, chosenExit, cancelFanFocus, endSlide]);

  const closeMenu = useCallback(() => retract(false), [retract]);

  // ── THE HAND-OFF TO THE LOG SHEET (CUL-1642, D1 = D) ─────────────────────────
  // The fan's three sheet doors no longer fade the fan's veil out while the sheet's
  // Modal slides its own up: the veil STAYS, the fan retracts beneath it, and the sheet
  // takes the veil over at full the tick its Modal is shown (one colour, `colorScrim`,
  // D2), so nothing on screen changes but the sheet rising. A store that refuses the
  // open (a sheet already up) gets the plain close: nobody would take the veil.
  const handOffToLogSheet = (initialType?: LogSheetConfirmType) => {
    if (!openLogSheet(initialType, { veil: 'handed' })) { closeMenu(); return; }
    setVeilHeld(true);
    retract(true);
  };

  // The release: the sheet has the veil, or the sheet went down before it was shown.
  useEffect(() => {
    if (!veilHeld) return;
    if (!logSheetVeilTaken && logSheetUp) return;
    veil.setValue(0);
    setVeilHeld(false);
  }, [veilHeld, logSheetVeilTaken, logSheetUp, veil]);

  const toggleMenu = useCallback(() => {
    if (open && !closing.current) { closeMenu(); return; }
    // A re-open caught mid-close (CUL-724): the rows never unmounted, so no ref fires and
    // `open` never went false to forget the lead. It is a new open all the same, so it
    // speaks and moves focus as one.
    const reopening = open && closing.current;
    openMenu();
    if (reopening && leadNode.current) {
      focusedLead.current = null;
      armFanFocus();
    }
  }, [open, openMenu, closeMenu, armFanFocus]);

  // A pill acts only while the menu is staying open. A close keeps every pill mounted,
  // under the finger, for the ~180ms it animates, so a quick second tap used to act
  // again: a second log-sheet open while the first sheet was still sliding in (the
  // CUL-662 wedge class; the store now refuses that too), a second /log push, the
  // switcher's Modal presenting over the sheet's, or a second meal from a one-tap food
  // (its `logging` guard has already released by then). Read from the ref, so the
  // answer is current at the tap rather than at the last render.
  const whileOpen = (action: () => void) => () => {
    if (closing.current || dealing.current) return;
    action();
  };

  // Beat 1. Motion only: under Reduce Motion the disc does not scale (beat 8).
  const pressIn = useCallback(() => {
    if (reducedMotionNow()) return;
    Animated.spring(pressScale, { toValue: PRESS_SCALE, useNativeDriver: true, ...PRESS_IN_SPRING }).start();
  }, [pressScale]);
  const pressOut = useCallback(() => {
    if (reducedMotionNow()) return;
    Animated.spring(pressScale, { toValue: 1, useNativeDriver: true, ...PRESS_OUT_SPRING }).start();
  }, [pressScale]);

  // The hold. A long press replaces the press it ends (Pressable fires no onPress after
  // one), so on an open menu it does what a tap there does, closes, rather than leaving
  // a slow press on the × answered by nothing. On a closed menu it opens the fan as a
  // tap would and starts following the finger.
  const holdDisc = useCallback(() => {
    if (open && !closing.current) { closeMenu(); return; }
    const start = pressPoint.current;
    if (!openMenu() || !start || fanScrolls.current) return;
    const s = { start, origin: pressOrigin.current, last: start, left: false, rest: null, disc: null as Rect | null };
    slide.current = s;
    slideTargets.current = [];
    // The disc does not move (its press scale aside), so one measure serves the slide.
    measureNodeOnPage(discNode.current as never, (rect) => {
      if (slide.current !== s) return;
      s.disc = rect;
      measureSlideTargets();
    });
  }, [open, openMenu, closeMenu, measureSlideTargets]);

  // `t` is the event's own timestamp, the clock the dwell runs on (rule 1).
  const followSlide = (p: Point, t: number | null) => {
    const s = slide.current;
    if (!s) return;
    if (!s.left && leftDisc(s.disc, s.start, p)) s.left = true;
    s.last = p;
    const hit = targetAt(slideTargets.current, p);
    s.rest = nextRest(s.rest, hit, p, t);
    showSlideOver(hit?.key ?? null);
  };

  const releaseSlide = (p: Point, t: number | null) => {
    const s = slide.current;
    if (!s) return;
    const outcome = releaseOutcome({
      targets: slideTargets.current,
      at: p,
      rest: s.rest,
      left: s.left || leftDisc(s.disc, s.start, p),
      busy: closing.current || dealing.current,
      now: t,
    });
    const action = outcome.kind === 'act' ? slideActions.current.get(outcome.key) : undefined;
    endSlide();
    // A menu that closed under the finger (a card arriving, the overlay) has nothing
    // left to act on or to close.
    if (!openNow.current || closing.current) return;
    if (outcome.kind === 'close') closeMenu();
    else action?.run();
  };

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
    endSlide();
    fanSettled.current = false;
    closing.current = false;
    dealAnim.current?.stop();
    dealAnim.current = null;
    dealPending.current = false;
    dealing.current = false;
    setOpen(false);
    setSwitcherVisible(false);
    setChosen(null);
    chosenExit.setValue(1);
    turn.setValue(0);
    fade.setValue(0);
    veil.setValue(0);
    slots.forEach((v) => v.setValue(0));
  }, [captureOverlayOpen, turn, fade, veil, slots, chosenExit, endSlide]);

  // CUL-1635, the other direction: a card that reveals while the fan is open (the
  // picker path reveals ~450ms after its modal leaves) closes the fan rather than being
  // dismissed itself, since its Undo is a safety net the owner has not yet seen. A close
  // already under way is the FAB's own quick meal handing over to its card. A tap on the
  // disc after this is the owner's own gesture again, and dismisses the card like any
  // other open. `open` only ever turns true through openMenu, which clears the corner
  // first, so this effect needs no case for a card already up when the fan opens.
  useEffect(() => {
    if (cornerCardUp && open && !closing.current) closeMenu();
  }, [cornerCardUp, open, closeMenu]);

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
  // CUL-1647 — the read is bounded to the day: meals in the window before today's local
  // midnight, never today's, so a re-read on any trigger here returns the same order
  // all day and a log never moves a pill. Re-reading rather than freezing the list keeps
  // the record's corrections (PM go, 2026-10-08): a food archived since midnight leaves
  // the fan before its next open, because the library's change counter is a trigger, so
  // the pre-trial food an owner takes out of rotation is never one tap from a log; a sync
  // cycle is one too, and so is a removal: the shared reversal raises the record's
  // change counter (CUL-1665), so a past-day meal deleted from its record leaves the
  // fan before the next open, as an archived food does.
  //
  // The day turns over while the menu is CLOSED, so the new order is never a read that
  // lands under the thumb: `useTodayKey` changes at local midnight and on the return to
  // the foreground, and the effect below re-reads on it unless the menu is open. A menu
  // held open across midnight keeps its rows and re-reads on its close, like every other
  // change.
  const todayKey = useTodayKey();
  const libraryVersion = useFoodLibraryStore((st) => st.version);
  const hydrationTick = useSyncStore((st) => st.hydrationTick);
  const recordVersion = useRecordChangeStore((st) => st.version);
  const latestPetId = useRef(activePetId);
  latestPetId.current = activePetId;
  const openNow = useRef(open);
  openNow.current = open;
  const heldFor = useRef<string | null>(null);
  heldFor.current = recentFoods?.petId ?? null;
  const readingFor = useRef<string | null>(null);
  // Reads can overlap while closed (a library change, then a new row of today); only the
  // newest one's answer lands, so an older read finishing late, one started before
  // midnight above all, never overwrites a newer order.
  const readSeq = useRef(0);
  useEffect(() => {
    if (!activePetId) return;
    if (open && (heldFor.current === activePetId || readingFor.current === activePetId)) return;
    readingFor.current = activePetId;
    const seq = ++readSeq.current;
    // The last 3 foods THIS pet actually ate, newest first. Shares getRecentFoods
    // with the picker (single source of truth), which orders by the pet's real
    // MAX(occurred_at) — not food_items_cache.last_used_at, which is shared across
    // pets and was reset to NULL on every sync, so the old query returned an
    // effectively random 3. No rolling window (`null`): the day's bounds are the
    // window. Async, so the answer is checked against the pet it was read for.
    getRecentFoods(activePetId, null, 3, fabFoodDay(Date.now()))
      .then((foods) => {
        if (seq !== readSeq.current) return;
        if (latestPetId.current !== activePetId) return;
        if (openNow.current && heldFor.current === activePetId) return;
        setRecentFoods({ petId: activePetId, foods });
      })
      .catch((e) => {
        console.warn('[FAB] recent foods load failed:', e);
        // CUL-1646: a redeal waiting on this read would hold every pill untappable for
        // as long as the fan stays open. The foods stay unrendered (no list is not a
        // wrong list), and the doors answer again.
        if (latestPetId.current === activePetId && dealPending.current) {
          dealPending.current = false;
          dealing.current = false;
        }
      })
      .finally(() => {
        if (seq === readSeq.current && readingFor.current === activePetId) readingFor.current = null;
      });
  }, [open, activePetId, todayHeadId, todayKey, libraryVersion, hydrationTick, recordVersion]);

  // Derived in the render body rather than mirrored into state (the C-9 shape): the
  // list is only ever this pet's, or nothing. A pet flip inside the open menu shows
  // no food rows until the new pet's read answers: a wrong absence for a beat, never
  // a wrong list.
  const foodsForActivePet =
    activePet && recentFoods?.petId === activePet.id ? recentFoods.foods : null;

  // ── THE REDEAL (CUL-1646, D3) ──────────────────────────────────────────────────
  // A pet switch inside the open fan deals the food pills again, nearest first on the
  // open's own stagger, once the keyed read for the new pet has landed. Before that the
  // outgoing pet's rows are already gone (CUL-723's key un-renders them the frame the
  // chip changes name), so the "retract" the mock draws is that un-render: the mock
  // plays the old foods back under the new name for 140ms, which CUL-723 forbids, and
  // that rule wins. The pills fan in from the disc rather than appearing in slots
  // already at rest, which is what said "these are new". Under Reduce Motion the foods
  // crossfade in. Every pill is held untappable from the switch until the deal ends
  // (`whileOpen`), since rows arriving under the finger are rows it can mis-hit.
  //
  // A switch is seen at render, where the chip's new name is: the fan adopts the new
  // pet and waits on its read. A→B→A before B answers deals A's rows again too, since
  // they left the screen with the first switch. A fan opened before the pets landed
  // adopts the first pet without a deal: nothing was on screen to deal again.
  //
  // The slots are zeroed DURING the render that first draws the new pet's foods (below,
  // once the rows are built), not in an effect: a FanSlot mounts with its value's
  // current reading, so a zero written after the commit could paint the foods at full
  // for a frame first. Once per deal, and only the slots the budget draws a food on, so
  // a door is never zeroed.
  if (open && !closing.current && activePetId !== null && dealtFor.current !== activePetId) {
    dealPending.current = dealtFor.current !== null;
    dealtFor.current = activePetId;
  }
  dealing.current = dealPending.current || dealAnim.current !== null;
  const dealReady = dealPending.current && foodsForActivePet !== null;
  const zeroedFor = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!dealReady) return;
    dealPending.current = false;
    zeroedFor.current = null;
    const n = foodSlotCount.current;
    const foodSlots = slots.slice(0, n);
    if (n === 0) { dealing.current = false; return; }
    const anim = reducedMotionNow()
      ? Animated.parallel(foodSlots.map((v) =>
          Animated.timing(v, { toValue: 1, duration: FADE_MS, useNativeDriver: true })))
      : Animated.stagger(FAN_STAGGER_MS, foodSlots.map((v) =>
          Animated.spring(v, { toValue: 1, useNativeDriver: true, ...FAN_SPRING })));
    dealAnim.current = anim;
    dealing.current = true;
    anim.start(() => {
      if (dealAnim.current !== anim) return;
      dealAnim.current = null;
      dealing.current = false;
      measureSlideTargets();
    });
  }, [dealReady, activePetId, slots, measureSlideTargets]);
  useEffect(() => () => dealAnim.current?.stop(), []);

  // The drawn rows changed under a slide (a late food, a redeal): the render that drew
  // them dropped the measure, and this re-measures once they are laid out. Every render,
  // because it is declared above the stand-down's early return, where the rows are built.
  useEffect(() => {
    if (!remeasure.current) return;
    remeasure.current = false;
    if (!slide.current) return;
    slide.current.rest = null;
    showSlideOver(null);
    measureSlideTargets();
  });

  async function handleQuickMeal(food: PickerFood, slot: number) {
    // Write-time pet identity (multi-pet spec §6): read the store at the moment
    // of write, not the render-time closure (the queue-then-switch edge).
    const pet = usePetStore.getState().activePet;
    if (logging) return; // a write is already in flight — silence is correct here
    if (!pet) {
      // CUL-717. This used to share the `logging` guard's bare return: the row did
      // not even show its pressed state, so a tap produced no feedback of any kind —
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
    // CUL-1643 — the meal mark's source, measured now so it is ready when the write
    // lands. Under Reduce Motion nothing is measured and nothing flies. A rect that has
    // not answered by then (or never does) flies nothing either: the card rises as it
    // always has, which is a quieter arrival, never a wrong one.
    flightFrom.current = null;
    if (!reducedMotionNow() && fanSettled.current) {
      const from: { foodId: string; rect: WindowRect | null } = { foodId: food.id, rect: null };
      flightFrom.current = from;
      measureNodeInWindow(foodGlyphs.get(food.id), (rect) => { from.rect = rect; });
    }
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
      // ── THE MEAL LANDS IN ITS CARD (CUL-1643, PM ruling D3 of CUL-1625) ──────────
      // A choice never plays the cancel: this pill stays while the others retract,
      // and its meal mark flies into the card's check (`flightMotion.ts`, the Signal
      // chart's flight, lifted). Staged BEFORE the card shows, so the card's first
      // frame already knows to crossfade in place rather than rise. Food pills only:
      // the doors open the sheet, and a symptom never flies. No haptic of its own: the
      // card's reveal plays the commit's one buzz, as on every meal path.
      const from = flightFrom.current;
      flightFrom.current = null;
      const flies = from !== null && from.foodId === food.id && from.rect !== null && !reducedMotionNow();
      if (flies && from.rect) {
        stageFlight({
          identity: eventId,
          title: foodText.get(food.id)?.label ?? 'Food',
          source: from.rect,
          element: <MealMark />,
        });
      }
      setChosen({ key: `food-${food.id}`, flown: flies });
      retract(false, slot);
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
      // card. Fire-and-forget (not awaited here) so the tapped row's held press
      // (setLogging(null) in the finally) releases immediately on the wedge's
      // fastest path. applyMealTrialFlag (lib/mealTrialFlag.ts — the ONE orchestration
      // both meal doors share, CUL-354) waits for the card to be on screen before
      // patching — a no-op here (this path reveals synchronously), but the same
      // guard the picker path needs. The ledger write happens only once the
      // heads-up renders, so one the owner never saw can't spend the food's budget.
      //
      // CUL-1643: with a flight up, both wait for the mark to land. The dwell restarts
      // there, so Undo and the intake chips keep their whole window (C-21), and the
      // heads-up lands after the mark rather than growing the card under it.
      void landThenFlag(flies, { eventId, petId: pet.id, foodId: food.id, occurredAt: occurredAtIso });
    } finally {
      setLogging(null);
    }
  }

  async function landThenFlag(flies: boolean, args: Parameters<typeof applyMealTrialFlag>[0]) {
    try {
      if (flies) {
        await whenFlightDone(args.eventId);
        // Only THIS meal's card, still up and not undone: a restart on a removal line
        // would hold "Removed" past its own short dwell.
        const m = useMomentStore.getState();
        if (m.visible && !m.removed && m.payload?.kind === 'meal' && m.payload.eventId === args.eventId) {
          m.rescheduleHide(m.payload.trialFlag ? MEAL_FLAGGED_DURATION_MS : MEAL_CARD_DWELL_MS);
        }
      }
      await applyMealTrialFlag(args);
    } catch (e) {
      console.error('[FAB] quick meal landing failed:', e);
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
  // CUL-1278 — the pills a slide can let go on, rebuilt with the rows, each with the tap's
  // own action. The pet chip is not one: a switch is not a log, so a slide that ends on
  // it closes (lib/fanSlide.ts rule 4).
  const actions = new Map<SlideKey, { kind: SlideKind; run: () => void }>();
  slideActions.current = actions;
  const slideTarget = (key: SlideKey, kind: SlideKind, run: () => void) => {
    actions.set(key, { kind, run });
    return (node: View | null) => {
      if (node) slideNodes.set(key, node);
      else slideNodes.delete(key);
    };
  };

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
  // The scroll opens at its bottom once per open; a later size change (a food that answers late)
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
        // `accessible`, so the title and the body are one sentence and one focus stop.
        <View ref={fanLeadRef} style={[styles.card, pillWidth]} accessible>
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
          <FanPill
            ref={fanLeadRef}
            style={[styles.logForPill, pillWidth]}
            reducedMotion={reducedMotion}
            onPress={whileOpen(() => setSwitcherVisible(true))}
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
          </FanPill>
        ),
      });
    }

    // More events → the type grid, as a bottom sheet over the current tab (B-745 PR 2;
    // out of beta with CUL-962, so it never pushes /log any more; one root-mounted sheet
    // since CUL-503). The photo-first "Attach photo" entry it used to carry was retired
    // in B-745 PR 1 (R4: every log starts from the event; photos still attach inside
    // each event flow), as was the older "Log with photo" row before it — both were
    // redundant second pathways to this one destination.
    const openMore = whileOpen(() => handOffToLogSheet());
    const moreTarget = slideTarget('more', 'door', openMore);
    const moreLeads = rows.length === 0;
    rows.push({
      key: 'more',
      node: (
        <FanPill
          // The fan's top row when there is no pet chip above it (CUL-724).
          ref={(node: View | null) => { moreTarget(node); if (moreLeads) fanLeadRef(node); }}
          testID="fab-pill-more"
          style={pillWidth}
          held={slideOver === 'more'}
          reducedMotion={reducedMotion}
          onPress={openMore}
          accessibilityRole="button"
        >
          <View style={[styles.pillGlyph, styles.pillGlyphQuiet]}>
            <Plus size={16} color={theme.colorTextSecondary} strokeWidth={1.75} />
          </View>
          <ThemedText style={styles.pillLabel}>More events</ThemedText>
          <DoorChevron />
        </FanPill>
      ),
    });

    // Quick GI symptom taps — open the log sheet straight at the confirm for that event
    // (CUL-504) rather than logging silently. The sheet's confirm carries the optional
    // photo (a vomit or stool photo still triggers the per-incident read and lands on
    // its record) and the B-010 "Saw it / Found it" time affordance, which vomit and
    // loose stool need because they're discovery-prone. Still one tap to the confirm,
    // one tap to save — and the completion card is the sheet's, never this menu's
    // (beat 6, C-17).
    //
    // CUL-1657 (D6): the stool row is the split pill, Normal and Loose. It keeps the
    // row's key and its slot, so the fan's order and its eight slots are unchanged.
    // A slide that lets go on either segment opens its confirm, exactly as the tap does,
    // and never writes (amendment 2, as PR-29b split the pill).
    const openNormal = whileOpen(() => handOffToLogSheet('stool_normal'));
    const openLoose = whileOpen(() => handOffToLogSheet('diarrhea'));
    const segTargets = {
      'stool-normal': slideTarget('stool-normal', 'confirm', openNormal),
      'stool-loose': slideTarget('stool-loose', 'confirm', openLoose),
    } as Record<SlideKey, (node: View | null) => void>;
    rows.push({
      key: 'diarrhea',
      node: (
        <StoolSplitPill
          style={pillWidth}
          petIds={pets.map((p) => p.id)}
          onNormal={openNormal}
          onLoose={openLoose}
          segRef={(key, node) => segTargets[key]?.(node)}
          slideOver={slideOver}
        />
      ),
    });
    // Amendment 2: a slide that lets go on Vomit opens the confirm, where Saw it or Found
    // it is answered, and never writes. A found vomit written "now" would be placed
    // against the nearest meal by the timing lane.
    const openVomit = whileOpen(() => handOffToLogSheet('vomit'));
    rows.push({
      key: 'vomit',
      node: (
        <FanPill
          ref={slideTarget('vomit', 'confirm', openVomit)}
          testID="fab-pill-vomit"
          style={pillWidth}
          held={slideOver === 'vomit'}
          reducedMotion={reducedMotion}
          onPress={openVomit}
          accessibilityRole="button"
        >
          <View style={[styles.pillGlyph, styles.pillGlyphSymptom]}>
            <EventIcon type="vomit" size={16} color={theme.colorEventSymptom} />
          </View>
          <ThemedText style={styles.pillLabel}>Vomit</ThemedText>
          <DoorChevron />
        </FanPill>
      ),
    });

    const openLogFood = whileOpen(() => { closeMenu(); router.push('/log?type=meal'); });
    rows.push({
      key: 'log-food',
      node: (
        <FanPill
          ref={slideTarget('log-food', 'door', openLogFood)}
          testID="fab-pill-log-food"
          style={pillWidth}
          held={slideOver === 'log-food'}
          reducedMotion={reducedMotion}
          onPress={openLogFood}
          accessibilityRole="button"
        >
          <View style={[styles.pillGlyph, styles.pillGlyphQuiet]}>
            <Plus size={16} color={theme.colorTextSecondary} strokeWidth={1.75} />
          </View>
          <ThemedText style={styles.pillLabel}>Log food</ThemedText>
          <DoorChevron />
        </FanPill>
      ),
    });

    // Recent foods — meals AND treats the pet actually ate (the recency query is
    // food_type-agnostic). While `foodsForActivePet` is null the read has not answered
    // for THIS pet, so there are no pills: they would be another pet's (C-12). The
    // query returns newest first; the fan draws newest LOWEST, nearest the thumb.
    const drawnFoods = [...(foodsForActivePet ?? [])].filter((f) => foodLines.has(f.id)).reverse();
    drawnFoods.forEach((food, j) => {
      // CUL-1644 (D3): the food named the way History names it, through the one mapper,
      // with its format as its own tag. The tag is a sibling that holds its width, never
      // text appended to the label that wraps, so wet and dry of one line never read
      // alike (the foodFormat.ts header's rule). The spoken label carries both halves.
      const { label: foodLabel, tag: formatTag } = foodText.get(food.id)!;
      // Its slot, as `slotFor` below picks it: the foods are the last rows, newest
      // lowest, so a food's distance from the disc is the foods drawn after it.
      const foodSlot = drawnFoods.length - 1 - j;
      const foodKey = `food-${food.id}`;
      // The one writer a slide can reach, through the tap's own call: the same write, the
      // same card, the same flight and trial flag. Whether a release may run it is the
      // dwell rule's (lib/fanSlide.ts rule 1), never this row's.
      const logThis = whileOpen(() => { void handleQuickMeal(food, foodSlot); });
      rows.push({
        key: foodKey,
        node: (
          <FanPill
            ref={slideTarget(foodKey, 'food', logThis)}
            testID={`fab-pill-${foodKey}`}
            style={pillWidth}
            reducedMotion={reducedMotion}
            onPress={logThis}
            disabled={logging !== null}
            // The pressed state holds through the local write, in place of a spinner, and
            // shows the pill a slide is resting on.
            held={logging === food.id || slideOver === foodKey}
            accessibilityRole="button"
            accessibilityLabel={formatTag ? `${foodLabel}, ${formatTag.toLowerCase()}` : foodLabel}
            // CUL-724's hint half: every other pill opens something; this one writes.
            accessibilityHint={`Logs it for ${activePet.name} right away`}
          >
            <View
              ref={(node) => { if (node) foodGlyphs.set(food.id, node); else foodGlyphs.delete(food.id); }}
              collapsable={false}
            >
              <MealMark hidden={chosen?.key === `food-${food.id}` && chosen.flown} />
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
          </FanPill>
        ),
      });
    });
  }
  slotCount.current = rows.length;
  chipLeads.current = rows[0]?.key === 'log-for';
  foodSlotCount.current = rows.filter((r) => r.key.startsWith('food-')).length;
  if (dealReady && zeroedFor.current !== activePetId) {
    zeroedFor.current = activePetId;
    slots.slice(0, foodSlotCount.current).forEach((v) => v.setValue(0));
  }
  fanLeadKey.current = open ? rows[0]?.key ?? null : null;
  // CUL-1278: rows drawn differently are pills somewhere else. The measure goes now, in
  // the render that moves them, so no move between this commit and the re-measure can
  // hit-test a stale frame; the effect above measures again once they are laid out.
  // The keys, and everything else that moves a pill without changing its key: the scroll
  // branch, the width cap, each food's line count.
  const sig = [
    rows.map((r) => r.key).join('|'),
    fanPlan.scroll ? 'scroll' : 'column',
    fanPlan.pillMaxWidth,
    fanPlan.foods.map((f) => `${f.id}:${f.numberOfLines}`).join('|'),
  ].join('#');
  fanScrolls.current = fanPlan.scroll;
  if (rowsSig.current !== sig) {
    rowsSig.current = sig;
    slideTargets.current = [];
    remeasure.current = true;
  }

  // Beat 2, and its Reduce Motion frame: in motion the one glyph turns; still, the
  // plus and the × crossfade on the menu's fade, so the open state still reads as
  // "close" without anything turning.
  // A slot is a distance from the disc, so the row's index from the bottom picks it.
  const slotFor = (row: FanRow, i: number) => (
    <FanSlot
      key={row.key}
      anim={slots[Math.min(rows.length - 1 - i, MAX_SLOTS - 1)]}
      fade={fade}
      exit={row.key === chosen?.key ? chosenExit : undefined}
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
        {(open || veilHeld) && (
          <Animated.View
            style={[StyleSheet.absoluteFill, styles.scrim, { opacity: veil }]}
            pointerEvents="box-none"
            testID="fab-veil"
          >
            {/* The scrim's PRESS unmounts while the switcher Modal is up: on Android
                the tap that closes the Modal scrim can bleed through to this
                absolute-fill Pressable and dismiss the menu — the flip-then-log flow
                needs the menu to survive the flip. The veil itself stays. */}
            {!switcherVisible && !veilHeld && (
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

          {/* The slide follows the finger here: the touch belongs to the disc from press
              to lift, so its moves bubble to this View whichever pill they cross. */}
          <View
            ref={discNode}
            collapsable={false}
            testID="fab-disc-touch"
            onTouchMove={(e) => followSlide(
              { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY }, e.nativeEvent.timestamp ?? null)}
            onTouchEnd={(e) => releaseSlide(
              { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY }, e.nativeEvent.timestamp ?? null)}
            onTouchCancel={() => {
              // The system took the touch (a call, a gesture): never a choice. Close.
              if (!slide.current) return;
              endSlide();
              if (openNow.current && !closing.current) closeMenu();
            }}
          >
            <Pressable
              onPress={toggleMenu}
              onPressIn={(e) => {
                // A press with no coordinates (a synthesized one) cannot start a slide.
                const ne = e?.nativeEvent;
                pressPoint.current = ne ? { x: ne.pageX, y: ne.pageY } : null;
                pressOrigin.current = ne && typeof ne.locationX === 'number' && typeof ne.locationY === 'number'
                  ? { x: ne.pageX - ne.locationX, y: ne.pageY - ne.locationY }
                  : null;
                pressIn();
              }}
              onPressOut={pressOut}
              // Amendment 4: no long press under a screen reader, so every press is a tap.
              onLongPress={screenReaderOn ? undefined : holdDisc}
              delayLongPress={HOLD_TO_OPEN_MS}
              accessibilityRole="button"
              accessibilityLabel={open ? 'Close menu' : 'Log event'}
              accessibilityState={{ expanded: open }}
            >
              <Animated.View pointerEvents="none" style={[styles.fab, { transform: [{ scale: pressScale }] }]}>
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
    // The sheet's own veil (CUL-1642, D2, PM 2026-10-07): one colour from the fan to
    // the log sheet, so the hand-off changes nothing but the sheet rising.
    backgroundColor: theme.colorScrim,
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
  // CUL-1645: the pressed ground, the neutral one the app's other rows press to.
  pillPressed: {
    backgroundColor: theme.colorSurfaceSubtle,
  },
  // CUL-1657: the split stool pill. Its segments are 44pt boxes, so the pill drops its
  // vertical padding to keep the doors' height, and its right padding to the segments'
  // own gap, so the Loose box reaches the pill's edge. It wraps rather than squeezing
  // "Stool" letter by letter at the largest type: the segments drop to a second line,
  // still side by side, still apart.
  splitPill: {
    paddingVertical: 0,
    paddingRight: theme.space1,
    flexWrap: 'wrap',
    rowGap: 0,
  },
  splitLabel: {
    flexShrink: 0,
  },
  splitSegs: {
    flexDirection: 'row',
    gap: theme.space1,
    marginLeft: 'auto',
  },
  // The target: the 44pt floor in both directions, carried by the box (no hitSlop).
  splitSeg: {
    minHeight: PILL_MIN_HEIGHT,
    minWidth: PILL_MIN_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // What the eye sees inside the target: the sheet tile's segment, at the pill's weight.
  splitChip: {
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusFull,
    paddingVertical: theme.space1,
    paddingHorizontal: theme.space2,
  },
  splitChipPressed: {
    backgroundColor: theme.colorSurfaceSubtle,
  },
  splitChipText: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
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
  // CUL-1643: the chosen food's mark while its clone flies, so it is never in two places.
  pillGlyphFlown: {
    opacity: 0,
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
});
