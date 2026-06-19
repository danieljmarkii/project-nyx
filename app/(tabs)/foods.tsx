import { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { FoodRow } from '../../components/foods/FoodRow';
import { getLibraryFoods, getFoodIntakeStats, PickerFood, FoodIntakeStat } from '../../lib/db';
import {
  groupFoodsByType, groupFoodsByBrand, foodIntakeKey, foodIntakeNote, indexIntakeStats,
  foodFavoriteNote, type ReliableFavorite,
} from '../../lib/food';
import { getReliableFavorites } from '../../lib/foodFavorites';
import { getSignedUrls } from '../../lib/storage';
import { usePetStore } from '../../store/petStore';

// The thumbnail props a row needs (B-004 PR 6), resolved per-food by `thumbFor`
// in the screen and spread onto FoodRow by both the group list and the shelf.
type ThumbProps = { hasPhoto: boolean; photoUrl: string | null; photoLoading: boolean };

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

  // Row thumbnails (B-004 PR 6). The nyx-food-photos bucket is private, so each
  // photo_path needs a signed URL; we batch-sign the whole visible set in ONE
  // request (lib/storage.getSignedUrls) rather than N per-row round-trips. Cached
  // by path in a ref so re-focusing the tab doesn't re-sign paths we already hold
  // — paths are stable and signed URLs outlive a browse session. `photosLoading`
  // distinguishes a row whose URL is still resolving (quiet neutral slot) from one
  // that has no photo at all (placeholder); the Map drives the resolved <Image>.
  const [photoUrls, setPhotoUrls] = useState<Map<string, string>>(new Map());
  const [photosLoading, setPhotosLoading] = useState(false);
  const photoUrlsRef = useRef<Map<string, string>>(new Map());
  // In-flight signing count, so `photosLoading` reflects whether ANY resolve is
  // running — not just the most recent. With a bare boolean, a fast call's `finally`
  // would clear loading while a slower concurrent call (rapid tab/pet switch) was
  // still signing, dropping its rows to the placeholder instead of the pending tile.
  // The flag flips off only when the last concurrent resolve settles.
  const inflightRef = useRef(0);

  // Sign only the distinct paths we don't already hold, then merge. Never throws
  // (getSignedUrls swallows failures), and a path that fails to sign is simply
  // absent from the map → that row keeps its placeholder. Thumbnails are a
  // progressive enhancement, so this runs without blocking the catalog render.
  const resolveThumbnails = useCallback(async (foods: PickerFood[]) => {
    const missing = Array.from(
      new Set(foods.map((f) => f.photo_path).filter((p): p is string => p != null)),
    ).filter((p) => !photoUrlsRef.current.has(p));
    if (missing.length === 0) return;
    inflightRef.current += 1;
    setPhotosLoading(true);
    try {
      // 24h TTL: the ref caches signed URLs for the whole browse session, so a
      // short (1h) token would expire under the cache and strand a long-open tab
      // on broken images with no re-sign (the path is already "known"). A day
      // outlives any realistic foreground session. Matches the AI Signal cache TTL.
      const resolved = await getSignedUrls('nyx-food-photos', missing, 60 * 60 * 24);
      // Merge onto the LATEST ref (re-read after the await), not a pre-await
      // snapshot, so a concurrent resolve's writes aren't clobbered.
      const next = new Map(photoUrlsRef.current);
      resolved.forEach((url, p) => next.set(p, url));
      photoUrlsRef.current = next;
      setPhotoUrls(next);
    } finally {
      inflightRef.current -= 1;
      if (inflightRef.current === 0) setPhotosLoading(false);
    }
  }, []);

  // Single load used by both the focus effect and the error-retry button. No
  // cancel guard is needed: a tab screen stays mounted across tab switches, and
  // the read is idempotent (last load wins on the same global catalog).
  const load = useCallback(async () => {
    try {
      const foods = await getLibraryFoods();
      setLibrary(foods);
      setLoadError(false);
      setLoaded(true);
      // Resolve row thumbnails for the freshly-loaded catalog (B-004 PR 6).
      // Fire-and-forget: it owns its own loading/error state and must not delay
      // the per-pet annotations below (getSignedUrls never throws).
      resolveThumbnails(foods);
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
  }, [activePetId, activePetSpecies, resolveThumbnails]);

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

  // Resolve a row's thumbnail props (B-004 PR 6). hasPhoto drives the pending-vs-
  // placeholder branch in FoodRow; photoUrl is null until that path signs (or if
  // it never does — offline / deleted object — in which case the row shows the
  // placeholder, never a broken image).
  const thumbFor = useCallback(
    (f: PickerFood) => ({
      hasPhoto: f.photo_path != null,
      photoUrl: f.photo_path ? (photoUrls.get(f.photo_path) ?? null) : null,
      photoLoading: photosLoading,
    }),
    [photoUrls, photosLoading],
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
        {/* Add-food entry point (B-110). The FAB → Meal → "Snap a new food"
            path always LOGS a meal; a browse/manage destination needs a way to
            add a food to the library without logging one. Opens the capture
            flow with no `fromLog` flag, so it commits the food_items row but
            skips insertMeal (the capture screen already branches on that). */}
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push('/food-capture')}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Add food"
          hitSlop={{ top: 14, bottom: 14, left: 12, right: 12 }}
        >
          <Plus size={18} color={theme.colorAccent} strokeWidth={2} />
          <Text style={styles.addBtnText}>Add food</Text>
        </TouchableOpacity>
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
            Tap Add food to start your library, or snap one when you log a meal —
            either way it shows up here, ready to reuse.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {favoriteRows.length > 0 ? (
            <FavoritesShelf rows={favoriteRows} petName={activePetName} thumbFor={thumbFor} />
          ) : null}
          <FoodGroup label="Meals" foods={grouped.meals} noteFor={noteFor} thumbFor={thumbFor} />
          <FoodGroup label="Treats" foods={grouped.treats} noteFor={noteFor} thumbFor={thumbFor} />
          <FoodGroup
            label="Unclassified"
            foods={grouped.other}
            hint="Tap a food to set whether it's a meal or a treat."
            noteFor={noteFor}
            thumbFor={thumbFor}
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
  rows, petName, thumbFor,
}: {
  rows: { fav: ReliableFavorite; food: PickerFood }[];
  petName: string | null;
  thumbFor: (f: PickerFood) => ThumbProps;
}) {
  return (
    <View style={styles.group}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Reliable favorites</Text>
        <Text style={styles.groupHint}>
          {petName ? `Foods ${petName} finishes most of the time.` : 'Foods your pet finishes most of the time.'}
        </Text>
      </View>
      <View style={styles.card}>
        {rows.map(({ fav, food }, i) => (
          <View key={fav.key} style={i > 0 ? styles.rowDivider : undefined}>
            <FoodRow
              brand={food.brand}
              productName={food.product_name}
              format={food.format}
              favoriteNote={foodFavoriteNote(fav)}
              {...thumbFor(food)}
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
  label, foods, hint, noteFor, thumbFor,
}: {
  label: string;
  foods: PickerFood[];
  hint?: string;
  // Per-row intake annotation resolver (B-004 PR 4), passed down from the screen
  // so the group stays presentational and the per-pet logic lives in one place.
  noteFor: (f: PickerFood) => string | null;
  // Per-row thumbnail resolver (B-004 PR 6), same pattern as noteFor.
  thumbFor: (f: PickerFood) => ThumbProps;
}) {
  if (foods.length === 0) return null;
  // Foods arrive alpha-by-brand+product from getLibraryFoods, so the brand
  // groups (and the rows within each) read alphabetically.
  const brandGroups = groupFoodsByBrand(foods);
  return (
    <View style={styles.group}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{label}</Text>
        {hint ? <Text style={styles.groupHint}>{hint}</Text> : null}
      </View>
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
                    {...thumbFor(f)}
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
  // White header surface with a single bottom border — shares the History tab's
  // page-title treatment (same surface, border, padding, title token). Laid out
  // as a row so the "Add food" action (B-110) sits opposite the title; the title
  // styling itself is unchanged, so the tabs still read as one family.
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  // "Add food" header action (B-110) — the no-meal entry into the capture flow.
  // Accent text + Plus. No explicit height/padding so the row stays title-driven
  // and the header height still matches the History tab; the 44pt tap floor is
  // carried by hitSlop on the touchable instead — the same way this app's other
  // compact header controls do it (e.g. food-capture's back/close buttons).
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
  },
  addBtnText: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorAccent,
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
    gap: theme.space2,
  },
  // Section header block — Meals / Treats / Unclassified / Reliable favorites. The
  // section (the coarse meal-vs-treat grouping) is the DOMINANT label on this
  // browse surface, so it uses the type scale's in-screen heading token (textXL),
  // sentence case — not the all-caps textXS eyebrow (SectionLabel) the log-path
  // zones use. Fixes the inverted hierarchy where the brand sub-header (textSM,
  // dark) was out-weighing the tiny all-caps section label it sat under.
  sectionHeader: {
    // Shared micro-gap token (B-113) — the picker's harmonized sectionHeader uses
    // the identical value, so the two surfaces' section→hint spacing can't drift.
    gap: theme.spaceMicro,
  },
  sectionTitle: {
    fontSize: theme.textXL,
    fontWeight: theme.weightSemibold,
    color: theme.colorNeutralDark,
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
