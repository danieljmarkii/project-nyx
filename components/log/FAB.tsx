import { useState, useRef, useCallback, useEffect } from 'react';
import {
  TouchableOpacity, StyleSheet, View, Animated,
  Text, Pressable, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { ChevronDown, Plus } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { EventIcon } from '../event/EventIcon';
import { PetAvatar } from '../pet/PetAvatar';
import { PetSwitcherSheet } from '../pet/PetSwitcherSheet';
import { useEventStore } from '../../store/eventStore';
import { usePetStore } from '../../store/petStore';
import { useMomentStore } from '../../store/momentStore';
import { getRecentFoods, PickerFood } from '../../lib/db';
import { insertMeal } from '../../lib/meals';

export function FAB() {
  const { prependEvent } = useEventStore();
  const { pets, activePet } = usePetStore();
  const showMealMoment = useMomentStore((s) => s.showMeal);

  const [open, setOpen] = useState(false);
  const [switcherVisible, setSwitcherVisible] = useState(false);
  const [recentFoods, setRecentFoods] = useState<PickerFood[]>([]);
  const [logging, setLogging] = useState<string | null>(null);
  const fabAnim = useRef(new Animated.Value(0)).current;

  const openMenu = useCallback(() => {
    setOpen(true);
    Animated.spring(fabAnim, {
      toValue: 1, useNativeDriver: true, tension: 65, friction: 8,
    }).start();
  }, [fabAnim]);

  const closeMenu = useCallback(() => {
    Animated.timing(fabAnim, {
      toValue: 0, duration: 180, useNativeDriver: true,
    }).start(() => setOpen(false));
  }, [fabAnim]);

  const toggleMenu = useCallback(() => {
    if (open) closeMenu(); else openMenu();
  }, [open, openMenu, closeMenu]);

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
      .then((foods) => { if (!cancelled) setRecentFoods(foods); })
      .catch((e) => console.warn('[FAB] recent foods load failed:', e));
    return () => { cancelled = true; };
  }, [open, activePet]);

  async function handleQuickMeal(food: PickerFood) {
    // Write-time pet identity (multi-pet spec §6): read the store at the moment
    // of write, not the render-time closure (the queue-then-switch edge).
    const pet = usePetStore.getState().activePet;
    if (logging || !pet) return;
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
        intakeRating: null,
      });
    } finally {
      setLogging(null);
    }
  }

  const iconRotate = fabAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] });
  const menuOpacity = fabAnim;
  const menuTranslateY = fabAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] });

  return (
    <>
      {/* Backdrop unmounts while the switcher Modal is up: on Android the tap
          that closes the Modal scrim can bleed through to this absolute-fill
          Pressable and dismiss the menu — the flip-then-log flow needs the
          menu to survive the flip. */}
      {open && !switcherVisible && (
        <Pressable style={StyleSheet.absoluteFill} onPress={closeMenu} />
      )}

      <View style={styles.fabContainer} pointerEvents="box-none">
        {open && (
          <Animated.View
            style={[styles.menu, { opacity: menuOpacity, transform: [{ translateY: menuTranslateY }] }]}
          >
            {/* Pet identity leads the log sheet (multi-pet spec §3.3, mock B1).
                The flip happens *before* logging — v1 has no move-to-pet, so a
                wrong-pet log means delete + re-log; the log taps below stay
                one-tap (Principle 1). Renders only when pets.length > 1 —
                single-pet households see no multi-pet chrome (§7.8). The menu
                stays open across a flip: recent foods re-query reactively and
                every write path reads the store at write time. */}
            {pets.length > 1 && activePet && (
              <>
                <TouchableOpacity
                  style={styles.logForChip}
                  onPress={() => setSwitcherVisible(true)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Logging for ${activePet.name} — switch pet`}
                >
                  <PetAvatar name={activePet.name} photoPath={activePet.photo_path} size={28} />
                  {/* "Logging for" is a quiet eyebrow; the NAME gets its own
                      line below it. The name WRAPS (never truncates) — a pet's
                      name should never be cut — and the widened menu keeps
                      common 1–2 word names (incl. "Schrodingers Cat", 16 ch) on
                      a single line; only the genuinely long ones spill to two. */}
                  <View style={styles.logForTextCol}>
                    <Text style={styles.logForLabel} numberOfLines={1}>Logging for</Text>
                    <Text style={styles.logForName} numberOfLines={2}>{activePet.name}</Text>
                  </View>
                  <ChevronDown size={16} color={theme.colorTextSecondary} strokeWidth={1.75} />
                </TouchableOpacity>
                <View style={styles.divider} />
              </>
            )}

            {/* Recent foods — meals AND treats the pet actually ate (the recency
                query is food_type-agnostic), so "foods" not "meals". */}
            <Text style={styles.sectionHeader}>Recent foods</Text>
            {recentFoods.length === 0 ? (
              <Text style={styles.emptyFoods}>No foods logged yet</Text>
            ) : (
              recentFoods.map((food) => (
                <TouchableOpacity
                  key={food.id}
                  style={styles.menuAction}
                  onPress={() => handleQuickMeal(food)}
                  activeOpacity={0.7}
                  disabled={logging !== null}
                >
                  <View style={styles.menuActionIcon}>
                    <EventIcon type="meal" size={20} />
                  </View>
                  <Text style={styles.menuActionLabel} numberOfLines={2}>
                    {food.brand} {food.product_name}
                  </Text>
                  {logging === food.id && (
                    <ActivityIndicator size="small" color={theme.colorTextSecondary} style={styles.spinner} />
                  )}
                </TouchableOpacity>
              ))
            )}
            <TouchableOpacity
              style={styles.menuAction}
              onPress={() => { closeMenu(); router.push('/log?type=meal'); }}
              activeOpacity={0.7}
            >
              <View style={styles.menuActionIcon}>
                <Plus size={20} color={theme.colorTextSecondary} strokeWidth={1.75} />
              </View>
              <Text style={[styles.menuActionLabel, styles.newFoodLabel]}>Log food</Text>
            </TouchableOpacity>

            <View style={styles.divider} />

            {/* Quick GI symptom taps — route into the full log flow (the `simple`
                step) rather than logging silently. That flow already carries the
                optional photo step (a vomit photo auto-triggers the AI read) and
                the B-010 "Saw it / Found it" time affordance, which vomit/loose
                stool need because they're discovery-prone. The photo is optional,
                so this stays fast — one tap to the screen, one tap to save — while
                closing the old no-photo gap (was FAB.tsx handleQuickSymptom TODO). */}
            <View style={styles.symptomRow}>
              <TouchableOpacity
                style={styles.symptomBtn}
                onPress={() => { closeMenu(); router.push('/log?type=vomit'); }}
                activeOpacity={0.7}
              >
                <EventIcon type="vomit" size={20} color={theme.colorEventSymptom} />
                <Text style={styles.symptomBtnText}>Vomit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.symptomBtn}
                onPress={() => { closeMenu(); router.push('/log?type=diarrhea'); }}
                activeOpacity={0.7}
              >
                <EventIcon type="diarrhea" size={20} color={theme.colorEventSymptom} />
                <Text style={styles.symptomBtnText}>Loose stool</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.divider} />

            {/* More events → the full type grid (which itself carries the
                photo-first "Attach photo" entry). The old "Log with photo" row
                was removed: it landed on this same type grid, just with a photo
                pre-attached — a redundant second pathway to one destination. */}
            <TouchableOpacity
              style={styles.menuAction}
              onPress={() => { closeMenu(); router.push('/log'); }}
              activeOpacity={0.7}
            >
              <View style={styles.menuActionIcon}>
                <Plus size={20} color={theme.colorTextSecondary} strokeWidth={1.75} />
              </View>
              <Text style={styles.menuActionLabel}>More events</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        <TouchableOpacity
          style={styles.fab}
          onPress={toggleMenu}
          accessibilityLabel={open ? 'Close menu' : 'Log event'}
          activeOpacity={0.85}
        >
          <Animated.View style={[styles.fabInner, { transform: [{ rotate: iconRotate }] }]}>
            <View style={styles.plusH} />
            <View style={styles.plusV} />
          </Animated.View>
        </TouchableOpacity>
      </View>

      <PetSwitcherSheet
        visible={switcherVisible}
        onClose={() => setSwitcherVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: theme.colorNeutralDark,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  fabInner: {
    width: 20,
    height: 20,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  plusH: { position: 'absolute', width: 20, height: 2, backgroundColor: '#fff', borderRadius: 1 },
  plusV: { position: 'absolute', width: 2, height: 20, backgroundColor: '#fff', borderRadius: 1 },

  menu: {
    backgroundColor: theme.colorSurface,
    borderRadius: theme.radiusMedium,
    marginBottom: theme.space2,
    paddingVertical: theme.space1,
    // Wide enough that a 16-char two-word name ("Schrodingers Cat") fits the
    // pet-identity line without wrapping; long brand+product names + the name
    // both wrap rather than truncate inside it.
    minWidth: 290,
    // Cap so the right-anchored menu can't run off-screen on narrow phones
    // (iPhone SE @ 375pt: 330 + the 24pt right inset still leaves a margin).
    maxWidth: 330,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: theme.colorBorder,
  },

  sectionHeader: {
    fontSize: 11,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: theme.space2,
    paddingTop: theme.space1,
    paddingBottom: theme.space1,
  },
  emptyFoods: {
    fontSize: 13,
    color: theme.colorTextSecondary,
    paddingHorizontal: theme.space2,
    paddingBottom: theme.space1,
  },

  divider: {
    height: 1,
    backgroundColor: theme.colorBorder,
    marginVertical: theme.space1,
  },

  symptomRow: {
    flexDirection: 'row',
    gap: theme.space1,
    paddingHorizontal: theme.space2,
    paddingVertical: theme.space1,
  },
  symptomBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: theme.radiusMedium,
    backgroundColor: theme.colorEventSymptomLight,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 52,
  },
  symptomBtnText: {
    fontSize: 12,
    color: theme.colorEventSymptom,
    fontWeight: theme.weightMedium,
  },

  menuAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    paddingHorizontal: theme.space2,
    paddingVertical: theme.space1,
  },
  logForChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    paddingHorizontal: theme.space2,
    paddingVertical: theme.space1,
    // The quiet chip still gets the full 44pt tap-target floor.
    minHeight: 44,
  },
  logForTextCol: {
    flex: 1,
  },
  logForLabel: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    marginBottom: 1,
  },
  logForName: {
    // The name is the wrong-pet safeguard — make it the chip's hero (textLG),
    // on its own line so it gets the full chip width.
    fontSize: theme.textLG,
    color: theme.colorTextPrimary,
    fontWeight: theme.weightMedium,
  },
  menuActionIcon: {
    width: 24,
    alignItems: 'center',
  },
  menuActionLabel: {
    fontSize: 15,
    color: theme.colorTextPrimary,
    fontWeight: theme.fontWeightMedium,
    flex: 1,
  },
  spinner: {
    marginLeft: theme.space1,
  },
  newFoodLabel: {
    color: theme.colorTextSecondary,
  },
});
