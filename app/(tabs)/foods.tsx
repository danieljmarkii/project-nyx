import { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { theme } from '../../constants/theme';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { FoodRow } from '../../components/foods/FoodRow';
import { getLibraryFoods, getFoodIntakeStats, PickerFood, FoodIntakeStat } from '../../lib/db';
import {
  groupFoodsByType, groupFoodsByBrand, foodIntakeKey, foodIntakeNote, indexIntakeStats,
  foodFavoriteNote, type ReliableFavorite,
} from '../../lib/food';
import { getReliableFavorites } from '../../lib/foodFavorites';
import { usePetStore } from '../../store/petStore';

// Standalone Foods tab (B-004) — the food library graduates from a FAB-only
// picker into a first-class destination you browse and manage. The catalog is
// globally scoped (no pet_id), so this surface is pet-independent: it shows the
// whole library regardless of the active pet, which is exactly why it can't be
// nested under the Pet tab (design-principles Navigation §). Full-width rows
// (one food per row), grouped by food_type via the shared lib/food helper — the
// same bucketing the quick-log picker uses, from one tested source. Within each
// type section, rows cluster by brand (B-004 PR 3) so a single brand's variants
// — the "wall of Fancy Feast" — collapse under one header instead of repeating
// the brand on every row. A tap opens the food's detail screen; logging stays on
// the FAB picker path. (The picker's 2-up toFoodRows chunker is deliberately not
// used here — these are full-width rows, one food per line, not a 2-col grid.)
export default function FoodsScreen() {
  const [library, setLibrary] = useState<PickerFood[]>([]);
  // Gate the empty state on a completed load so the first paint (before the
  // local read resolves) never flashes "No foods yet" at an owner who has foods.
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // Per-pet intake annotations (B-004 PR 4). The catalog above is pet-independent
  // (the whole rationale for a top-level Foods tab); these notes are the one
  // per-active-pet layer — a row's feeding history for whoever is the active pet.
  // Indexed by foodIntakeKey for O(1) row lookup; `now` is frozen per load so the
  // relative "today / 3 days ago" labels don't drift mid-render.
  const activePetId = usePetStore((s) => s.activePet?.id ?? null);
  const activePetName = usePetStore((s) => s.activePet?.name ?? null);
  // Species drives the favorites' decline-gate thresholds (the feline single-day
  // path); read here so lib/ stays free of the pet store.
  const activePetSpecies = usePetStore((s) => s.activePet?.species ?? null);
  const [intakeStats, setIntakeStats] = useState<Map<string, FoodIntakeStat>>(new Map());
  const intakeNow = useRef(Date.now());

  // Reliable-favorites shelf (B-004 PR 5) — the positive-only, rate-over-N foods
  // the active pet reliably finishes (lib/foodFavorites → the pure selector). Like
  // the intake annotations it keys off the active pet, and it is a curated shelf
  // above the catalog, not a second list (a food on it also appears in its type
  // group below). Empty when nothing clears the bar — the shelf simply doesn't render.
  const [favorites, setFavorites] = useState<ReliableFavorite[]>([]);

  // Single load used by both the focus effect and the error-retry button. No
  // cancel guard is needed: a tab screen stays mounted across tab switches, and
  // the read is idempotent (last load wins on the same global catalog).
  const load = useCallback(async () => {
    try {
      const foods = await getLibraryFoods();
      setLibrary(foods);
      setLoadError(false);
      setLoaded(true);
    } catch (err) {
      // No silent failures in the data path (house rule). Surface a retry rather
      // than stranding the owner on a blank tab with no feedback or recovery.
      console.warn('[foods] library load failed:', err);
      setLoadError(true);
      setLoaded(true);
      return; // catalog is the primary content — skip annotations if it failed
    }
    // Per-pet enhancement layers (intake annotations + favorites shelf): a failure
    // here must NOT blank the catalog, so it has its own guard and just leaves the
    // rows un-annotated and the shelf empty. Both read this pet's logged meals, so
    // they load together.
    try {
      if (!activePetId) { setIntakeStats(new Map()); setFavorites([]); return; }
      const [stats, favs] = await Promise.all([
        getFoodIntakeStats(activePetId),
        getReliableFavorites(activePetId, activePetSpecies ?? 'other'),
      ]);
      intakeNow.current = Date.now();
      setIntakeStats(indexIntakeStats(stats));
      setFavorites(favs);
    } catch (err) {
      console.warn('[foods] per-pet annotations load failed:', err);
      setIntakeStats(new Map());
      setFavorites([]);
    }
  }, [activePetId, activePetSpecies]);

  // Reload on every focus so foods added, edited, or deleted from the capture
  // flow or the detail screen are reflected when the tab comes back into view —
  // the tab persists across switches, so a mount-only effect would go stale.
  // Keying load on activePetId also refreshes annotations when the active pet
  // changes while focused (useFocusEffect re-runs when its callback changes).
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Resolve a row's per-pet note: pure lookup + format. null leaves the row clean.
  const noteFor = useCallback(
    (f: PickerFood): string | null =>
      foodIntakeNote(intakeStats.get(foodIntakeKey(f.brand, f.product_name)), intakeNow.current),
    [intakeStats],
  );

  const grouped = groupFoodsByType(library);
  // Map each favorite (keyed on case-folded brand+product) back to its library row,
  // so the shelf reuses FoodRow + opens the SAME detail screen, and skips any
  // favorite whose food isn't in the current catalog (defensive — a favorite always
  // traces to a logged, cached food, so this normally resolves every entry).
  const libraryByKey = new Map(library.map((f) => [foodIntakeKey(f.brand, f.product_name), f]));
  const favoriteRows = favorites
    .map((fav) => ({ fav, food: libraryByKey.get(fav.key) }))
    .filter((x): x is { fav: ReliableFavorite; food: PickerFood } => x.food != null);

  // The error state wins only when there's nothing to show. A failed *reload*
  // that still has a populated list keeps the (stale-but-present) rows — matching
  // History's "leave prior state intact" behavior — rather than yanking the
  // library out from under the owner for a transient read error.
  const showError = loadError && library.length === 0;
  const isEmpty = loaded && !loadError && library.length === 0;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.title}>Foods</Text>
      </View>

      {showError ? (
        <View style={styles.centered}>
          <Text style={styles.stateTitle}>Couldn't load your foods</Text>
          <Text style={styles.stateBody}>Something went wrong loading your library.</Text>
          <TouchableOpacity
            style={styles.retry}
            onPress={load}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : isEmpty ? (
        <View style={styles.centered}>
          <Text style={styles.stateTitle}>No foods yet</Text>
          <Text style={styles.stateBody}>
            Snap a food when you log a meal and it'll show up here, ready to reuse.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {favoriteRows.length > 0 ? (
            <FavoritesShelf rows={favoriteRows} petName={activePetName} />
          ) : null}
          <FoodGroup label="Meals" foods={grouped.meals} noteFor={noteFor} />
          <FoodGroup label="Treats" foods={grouped.treats} noteFor={noteFor} />
          <FoodGroup
            label="Unclassified"
            foods={grouped.other}
            hint="Tap a food to set whether it's a meal or a treat."
            noteFor={noteFor}
          />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// The reliable-favorites shelf (B-004 PR 5) — a curated strip above the catalog of
// the foods this pet reliably finishes. Positive-only and rate-over-N: each row
// carries the VISIBLE denominator ("Finished 9 of 11 meals"), never a bare score,
// and the entire shelf is suppressed upstream (getReliableFavorites) during an
// intake-decline watch, so it can never read as reassurance over a decline
// (intake-is-not-preference). Brands show per row — favorites span brands, so
// there's no brand grouping here — and a tap opens the same detail screen as the
// catalog rows below (a favorite also appears in its type group; the shelf is a
// promotion, not a second list).
function FavoritesShelf({
  rows, petName,
}: {
  rows: { fav: ReliableFavorite; food: PickerFood }[];
  petName: string | null;
}) {
  return (
    <View style={styles.group}>
      <SectionLabel label="Reliable favorites" />
      <Text style={styles.groupHint}>
        {petName ? `Foods ${petName} finishes most of the time.` : 'Foods your pet finishes most of the time.'}
      </Text>
      <View style={styles.card}>
        {rows.map(({ fav, food }, i) => (
          <View key={fav.key} style={i > 0 ? styles.rowDivider : undefined}>
            <FoodRow
              brand={food.brand}
              productName={food.product_name}
              format={food.format}
              favoriteNote={foodFavoriteNote(fav)}
              onPress={() => router.push(`/food/${food.id}`)}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

// One grouped section of the library (Meals / Treats / Unclassified). Hidden
// when empty so an owner with only meals never sees a "Treats" header with
// nothing under it (B-011 grouping). Within the section, foods cluster by brand
// (B-004 PR 3): each brand is a quiet header above its own white card of rows,
// so a single brand's many flavors collapse under one label — the picky-cat
// "wall of Fancy Feast" — instead of repeating the brand on every row. Variant
// spellings (case, spacing, ™/®, apostrophe style) fold together via
// canonicalizeBrand. The brand-label + card-of-rows pairing reuses the same
// Linear/Oura grouped-list idiom as the section header itself.
function FoodGroup({
  label, foods, hint, noteFor,
}: {
  label: string;
  foods: PickerFood[];
  hint?: string;
  // Per-row intake annotation resolver (B-004 PR 4), passed down from the screen
  // so the group stays presentational and the per-pet logic lives in one place.
  noteFor: (f: PickerFood) => string | null;
}) {
  if (foods.length === 0) return null;
  // Foods arrive alpha-by-brand+product from getLibraryFoods, so the brand
  // groups (and the rows within each) read alphabetically.
  const brandGroups = groupFoodsByBrand(foods);
  return (
    <View style={styles.group}>
      <SectionLabel label={label} />
      {hint ? <Text style={styles.groupHint}>{hint}</Text> : null}
      <View style={styles.brandGroups}>
        {brandGroups.map((bg) => (
          <View key={bg.key} style={styles.brandGroup}>
            {/* A brand can be blank in the catalog (rare); skip the header
                rather than render an empty label, but still show the card. */}
            {bg.brand.trim() ? (
              <Text style={styles.brandLabel} numberOfLines={1} accessibilityRole="header">
                {bg.brand}
              </Text>
            ) : null}
            <View style={styles.card}>
              {bg.foods.map((f, i) => (
                <View key={f.id} style={i > 0 ? styles.rowDivider : undefined}>
                  <FoodRow
                    hideBrand
                    brand={f.brand}
                    productName={f.product_name}
                    format={f.format}
                    intakeNote={noteFor(f)}
                    onPress={() => router.push(`/food/${f.id}`)}
                  />
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorNeutralLight,
  },
  // White header surface with a single bottom border — mirrors the History tab
  // so the four tabs share one page-title treatment.
  header: {
    backgroundColor: theme.colorSurface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
    paddingHorizontal: theme.space3,
    paddingTop: 14,
    paddingBottom: 8,
  },
  title: {
    fontSize: theme.textPageTitle,
    fontWeight: theme.weightMedium,
    color: theme.colorNeutralDark,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.space2,
    // Clear the floating FAB (bottom-right) so the last row never sits under it.
    paddingBottom: theme.space6,
    gap: theme.space3,
  },
  group: {
    gap: theme.space1,
  },
  groupHint: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },
  // Brand sub-groups within a type section. A touch more air between brands
  // (space2) than between a brand's label and its card (space1), so each
  // brand reads as one unit under the section's all-caps eyebrow.
  brandGroups: {
    gap: theme.space2,
  },
  brandGroup: {
    gap: theme.space1,
  },
  // The brand header above each card. Sentence-case + darker than the all-caps
  // section eyebrow so the eye lands on the brand (the meaningful grouping)
  // while the type label stays a quiet coarse bucket above it.
  brandLabel: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  card: {
    backgroundColor: theme.colorSurface,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusMedium,
    overflow: 'hidden',
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
  },
  // Shared by the empty and error states — a centered, calm message near the top.
  centered: {
    paddingHorizontal: theme.space4,
    paddingTop: theme.space6,
    alignItems: 'center',
    gap: theme.space1,
  },
  stateTitle: {
    fontSize: theme.textLG,
    fontWeight: theme.weightMedium,
    color: theme.colorNeutralDark,
    textAlign: 'center',
  },
  stateBody: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    textAlign: 'center',
    lineHeight: theme.lineHeightBody,
  },
  retry: {
    marginTop: theme.space2,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: theme.space2,
  },
  retryText: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorAccent,
  },
});
