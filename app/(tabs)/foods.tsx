import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { theme } from '../../constants/theme';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { FoodRow } from '../../components/foods/FoodRow';
import { getLibraryFoods, PickerFood } from '../../lib/db';
import { groupFoodsByType, groupFoodsByBrand } from '../../lib/food';

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
    }
  }, []);

  // Reload on every focus so foods added, edited, or deleted from the capture
  // flow or the detail screen are reflected when the tab comes back into view —
  // the tab persists across switches, so a mount-only effect would go stale.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const grouped = groupFoodsByType(library);
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
          <FoodGroup label="Meals" foods={grouped.meals} />
          <FoodGroup label="Treats" foods={grouped.treats} />
          <FoodGroup
            label="Unclassified"
            foods={grouped.other}
            hint="Tap a food to set whether it's a meal or a treat."
          />
        </ScrollView>
      )}
    </SafeAreaView>
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
  label, foods, hint,
}: {
  label: string;
  foods: PickerFood[];
  hint?: string;
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
