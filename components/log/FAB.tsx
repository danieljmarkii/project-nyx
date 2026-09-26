import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react';
import {
  TouchableOpacity, StyleSheet, View, Animated, BackHandler,
  Pressable,
} from 'react-native';
import { router } from 'expo-router';
import { ChevronDown, Plus } from 'lucide-react-native';
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
/** Underdamped on purpose: a small overshoot past × and back (the mock's
 *  cubic-bezier(.34,1.56,.64,1), ~380ms). */
const TURN_SPRING = { tension: 90, friction: 7 } as const;
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
/** The gap between two stacked pills. No pill carries hitSlop, so any positive gap
 *  keeps neighbours from sharing hit area (C-5); this one is the mock's 10pt. */
const FAN_GAP = 10;

interface FanRow {
  key: string;
  node: ReactNode;
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
  const captureOverlayOpen = useUiStore((s) => s.captureOverlay !== null);

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
    // A slot past today's count lands at rest, so a row that mounts late (the recent
    // foods answer after the fan has run) appears in place rather than invisibly at 0.
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

  useEffect(() => {
    if (!open || !activePet) return;
    let cancelled = false;
    // The last 3 foods THIS pet actually ate, newest first. Shares getRecentFoods
    // with the picker (single source of truth), which orders by the pet's real
    // MAX(occurred_at) — not food_items_cache.last_used_at, which is shared across
    // pets and was reset to NULL on every sync, so the old query returned an
    // effectively random 3. `null` window = no time bound (re-offer staples of
    // any age). Async now, so guard against a resolve after the menu closes.
    getRecentFoods(activePet.id, null, 3)
      .then((foods) => { if (!cancelled) setRecentFoods({ petId: activePet.id, foods }); })
      .catch((e) => console.warn('[FAB] recent foods load failed:', e));
    return () => { cancelled = true; };
  }, [open, activePet]);

  // Derived in the render body rather than mirrored into state (the C-9 shape): the
  // list is only ever this pet's, or nothing. Note a reopen for the SAME pet still
  // shows the held rows immediately while the refetch runs — the key matches, so
  // there is no flash to pay for the safety.
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
      const { eventId, occurredAtIso, now } = await insertMeal({
        petId: pet.id,
        foodId: food.id,
        occurredAt: new Date(),
        occurredAtSource: 'now',
      });

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
        <View style={styles.card}>
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
            style={[styles.pill, styles.logForPill]}
            onPress={() => setSwitcherVisible(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Logging for ${activePet.name} — switch pet`}
          >
            <PetAvatar name={activePet.name} photoPath={activePet.photo_path} size={28} />
            {/* "Logging for" is a quiet eyebrow; the NAME gets its own line below
                it. The name WRAPS (never truncates) — a pet's name should never be
                cut — and only the genuinely long ones spill to two lines. */}
            <View style={styles.logForTextCol}>
              <ThemedText style={styles.logForLabel} numberOfLines={1}>Logging for</ThemedText>
              <ThemedText style={styles.logForName} numberOfLines={2}>{activePet.name}</ThemedText>
            </View>
            <ChevronDown size={16} color={theme.colorTextSecondary} strokeWidth={1.75} />
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
          style={styles.pill}
          onPress={() => { closeMenu(); openLogSheet(); }}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <View style={[styles.pillGlyph, styles.pillGlyphQuiet]}>
            <Plus size={16} color={theme.colorTextSecondary} strokeWidth={1.75} />
          </View>
          <ThemedText style={styles.pillLabel}>More events</ThemedText>
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
          style={styles.pill}
          onPress={() => { closeMenu(); openLogSheet('diarrhea'); }}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <View style={[styles.pillGlyph, styles.pillGlyphSymptom]}>
            <EventIcon type="diarrhea" size={16} color={theme.colorEventSymptom} />
          </View>
          <ThemedText style={styles.pillLabel}>Loose stool</ThemedText>
        </TouchableOpacity>
      ),
    });
    rows.push({
      key: 'vomit',
      node: (
        <TouchableOpacity
          style={styles.pill}
          onPress={() => { closeMenu(); openLogSheet('vomit'); }}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <View style={[styles.pillGlyph, styles.pillGlyphSymptom]}>
            <EventIcon type="vomit" size={16} color={theme.colorEventSymptom} />
          </View>
          <ThemedText style={styles.pillLabel}>Vomit</ThemedText>
        </TouchableOpacity>
      ),
    });

    rows.push({
      key: 'log-food',
      node: (
        <TouchableOpacity
          style={styles.pill}
          onPress={() => { closeMenu(); router.push('/log?type=meal'); }}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <View style={[styles.pillGlyph, styles.pillGlyphQuiet]}>
            <Plus size={16} color={theme.colorTextSecondary} strokeWidth={1.75} />
          </View>
          <ThemedText style={styles.pillLabel}>Log food</ThemedText>
        </TouchableOpacity>
      ),
    });

    // Recent foods — meals AND treats the pet actually ate (the recency query is
    // food_type-agnostic). While `foodsForActivePet` is null the read has not answered
    // for THIS pet, so there are no pills: they would be another pet's (C-12). The
    // query returns newest first; the fan draws newest LOWEST, nearest the thumb.
    for (const food of [...(foodsForActivePet ?? [])].reverse()) {
      rows.push({
        key: `food-${food.id}`,
        node: (
          <TouchableOpacity
            style={styles.pill}
            onPress={() => handleQuickMeal(food)}
            activeOpacity={0.7}
            disabled={logging !== null}
            accessibilityRole="button"
          >
            <View style={[styles.pillGlyph, styles.pillGlyphMeal]}>
              <EventIcon type="meal" size={16} />
            </View>
            <ThemedText style={styles.pillLabel} numberOfLines={2}>
              {food.brand} {food.product_name}
            </ThemedText>
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
              {rows.map((row, i) => (
                <FanSlot
                  key={row.key}
                  anim={slots[Math.min(rows.length - 1 - i, MAX_SLOTS - 1)]}
                  fade={fade}
                  reducedMotion={reducedMotion}
                >
                  {row.node}
                </FanSlot>
              ))}
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
    bottom: 72,
    right: theme.space3,
    alignItems: 'flex-end',
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    // CUL-322, D3 = C (PM-ruled 2026-09-26): the brand night disc carrying the bright
    // teal plus — the Culprit mark in miniature, and the one exception in-app brand
    // rule 3 names. It replaces CUL-1063's colorAccentInk disc, which cleared contrast
    // and read drab on device. 14.25:1 disc on colorNeutralLight, 6.57:1 plus on the
    // disc; both pinned in constants/theme.contrast.test.ts, with the failing pairs a
    // "tidy" would reach for (the bright teal as the disc; a white plus on it).
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
  // The plus is drawn in bars, not text, so it is a glyph by construction — the teal
  // is the accent's GLYPH role (C-1), not text on a light ground.
  plusH: { position: 'absolute', width: 20, height: 2.5, backgroundColor: theme.colorAccent, borderRadius: 1.25 },
  plusV: { position: 'absolute', width: 2.5, height: 20, backgroundColor: theme.colorAccent, borderRadius: 1.25 },

  fan: {
    alignItems: 'flex-end',
    gap: FAN_GAP,
    marginBottom: theme.space2,
  },
  fanSlot: {
    // Pills grow out of the disc's corner (beat 4), so they scale about theirs.
    transformOrigin: 'bottom right',
    alignItems: 'flex-end',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.colorSurface,
    borderRadius: theme.radiusFull,
    paddingVertical: theme.space1,
    paddingLeft: 10,
    paddingRight: theme.space2,
    // The 44pt floor is carried by the pill's own box, not hitSlop: the pills stack
    // with a gap and no slop, so no two ever share hit area (C-5) — on the recent-food
    // pills a mis-resolved tap would log the WRONG food, into a diet trial (CUL-612).
    minHeight: 44,
    // Long brand + product names wrap to two lines inside the cap rather than run off
    // a narrow phone (iPhone SE @ 375pt: 300 + the 24pt right inset leaves a margin).
    maxWidth: 300,
    ...shadows.md,
  },
  pillGlyph: {
    width: 28,
    height: 28,
    borderRadius: 14,
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
    fontSize: 15,
    color: theme.colorTextPrimary,
    fontWeight: theme.fontWeightMedium,
    flexShrink: 1,
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
    marginBottom: 1,
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
    maxWidth: 300,
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
