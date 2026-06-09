import { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { theme } from '../../constants/theme';
import { SectionLabel } from '../ui/SectionLabel';
import { getRecentFoods, getLibraryFoods, PickerFood } from '../../lib/db';
import {
  getActiveArrangementsForPet, confirmArrangementFresh, ActiveArrangementView,
  formatCalendarDate, isArrangementStale,
} from '../../lib/feedingArrangements';
import { FoodTile } from './FoodTile';

interface Props {
  petId: string;
  // For the "Always available" empty-state copy — addressed by name. Falls back
  // to 'your pet' (nyx-voice Pattern 1) when absent.
  petName?: string;
  // Fires when the user taps a Recent or Library tile — one-tap log.
  onPickFood: (food: PickerFood) => void;
  // Fires when the user taps "Add new" — opens the photo capture flow.
  onAddNew: () => void;
  // Long-press on a tile — opens the food detail screen for editing.
  // Kept separate from onPickFood so the one-tap log path stays clean.
  onOpenDetail?: (food: PickerFood) => void;
}

const RECENT_DAYS = 14;
const RECENT_LIMIT = 5;
const SCREEN_PADDING = theme.space2;

export function FoodPicker({ petId, petName, onPickFood, onAddNew, onOpenDetail }: Props) {
  const [recent, setRecent] = useState<PickerFood[]>([]);
  const [library, setLibrary] = useState<PickerFood[]>([]);
  const [arrangements, setArrangements] = useState<ActiveArrangementView[]>([]);
  const [search, setSearch] = useState('');
  // Brief "Confirmed ✓" acknowledgment after a freshness re-attest, so the tap
  // never reads as a dead control even as the row settles back to fresh.
  const [justConfirmedId, setJustConfirmedId] = useState<string | null>(null);

  // Just the "Always available" arrangements — re-read after a freshness confirm
  // (below) without re-running the whole recent/library load.
  const reloadArrangements = useCallback(async () => {
    try {
      setArrangements(await getActiveArrangementsForPet(petId));
    } catch (err) {
      console.warn('[FoodPicker] arrangements reload failed:', err);
    }
  }, [petId]);

  // Reload on every focus so foods added or deleted from the detail screen — and
  // free-choice arrangements toggled there — are reflected when the picker comes
  // back into view (router.back() doesn't remount the picker, so a mount-only
  // useEffect would show stale data).
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const [r, l, a] = await Promise.all([
            getRecentFoods(petId, RECENT_DAYS, RECENT_LIMIT),
            getLibraryFoods(),
            getActiveArrangementsForPet(petId),
          ]);
          if (!cancelled) {
            setRecent(r);
            setLibrary(l);
            setArrangements(a);
          }
        } catch (err) {
          // No silent failures in the data path (house rule). Leave the prior
          // state intact — navigating away and back re-runs this load.
          console.warn('[FoodPicker] load failed:', err);
        }
      })();
      return () => { cancelled = true; };
    }, [petId]),
  );

  // §6a passive freshness — one-tap re-confirm a bowl is still down, inline in the
  // section (never a push). The re-read settles the row back to fresh (so the
  // nudge disappears); the brief "Confirmed ✓" flash is the visible acknowledgment.
  const handleConfirmFresh = useCallback(async (foodItemId: string) => {
    setJustConfirmedId(foodItemId);
    try {
      await confirmArrangementFresh(petId, foodItemId);
      await reloadArrangements();
    } catch (err) {
      console.warn('[FoodPicker] freshness confirm failed:', err);
    } finally {
      setTimeout(() => {
        setJustConfirmedId((cur) => (cur === foodItemId ? null : cur));
      }, 1500);
    }
  }, [petId, reloadArrangements]);

  const filteredLibrary = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return library;
    return library.filter(
      (f) =>
        f.brand.toLowerCase().includes(q) ||
        f.product_name.toLowerCase().includes(q),
    );
  }, [library, search]);

  // Group the (filtered) library by food_type. B-011: treats and meals are
  // distinct mental models — surfacing them as separate sections lets the
  // owner scan "treats" or "meals" without parsing every tile. Rows the user
  // hasn't classified yet (NULL) plus the explicit 'other' bucket collapse
  // into a third section so nothing is hidden from the picker.
  const groupedLibrary = useMemo(() => {
    const meals: PickerFood[] = [];
    const treats: PickerFood[] = [];
    const other: PickerFood[] = [];
    for (const f of filteredLibrary) {
      if (f.food_type === 'meal') meals.push(f);
      else if (f.food_type === 'treat') treats.push(f);
      else other.push(f);
    }
    return { meals, treats, other };
  }, [filteredLibrary]);

  // Render any group in fixed-size pairs so each row is a 2-col grid with
  // matching tile heights (driven by the tallest tile in the row).
  function toRows(foods: PickerFood[]): PickerFood[][] {
    const rows: PickerFood[][] = [];
    for (let i = 0; i < foods.length; i += 2) {
      rows.push(foods.slice(i, i + 2));
    }
    return rows;
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.zone}>
        <TouchableOpacity
          style={styles.addCta}
          onPress={onAddNew}
          activeOpacity={0.7}
        >
          <Text style={styles.addCtaIcon}>📷</Text>
          <View style={styles.addCtaText}>
            <Text style={styles.addCtaTitle}>Snap a new food</Text>
            <Text style={styles.addCtaHint}>Or choose from your photos</Text>
          </View>
        </TouchableOpacity>
      </View>

      {recent.length > 0 && (
        <View style={styles.zone}>
          <SectionLabel label="Recent" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.recentRow}
          >
            {recent.map((f) => (
              <View key={f.id} style={styles.recentTile}>
                <FoodTile
                  brand={f.brand}
                  productName={f.product_name}
                  format={f.format}
                  onPress={() => onPickFood(f)}
                  onLongPress={onOpenDetail ? () => onOpenDetail(f) : undefined}
                />
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* B-040 R1 — "Always available" (free-choice) standing facts. Pinned above
          the regular food grid (§5). Styled distinctly from log-tap tiles: a quiet
          dot + label, NOT a loud chip (§11), and a tap opens the food's detail
          (where the toggle lives) rather than logging a meal — these are standing
          facts, not events. A designed empty state when there are none (P5). */}
      <View style={styles.zone}>
        <SectionLabel label="Always available" />
        {arrangements.length === 0 ? (
          <Text style={styles.alwaysEmpty}>
            Nothing always-out yet. If {petName ?? 'your pet'} grazes a bowl that's
            down all day, open a food and turn on “Always available” — we'll note it
            as free-choice for the vet.
          </Text>
        ) : (
          <View style={styles.alwaysList}>
            {arrangements.map((a) => {
              const since = formatCalendarDate(a.active_from);
              return (
                <View key={a.id} style={styles.alwaysRow}>
                  <TouchableOpacity
                    style={styles.alwaysMain}
                    // food_type/photo_path are null because this is a display-only
                    // view shape — the detail screen re-fetches the full food row.
                    onPress={() =>
                      onOpenDetail?.({
                        id: a.food_item_id,
                        brand: a.brand,
                        product_name: a.product_name,
                        format: a.format,
                        food_type: null,
                        photo_path: null,
                      })
                    }
                    activeOpacity={0.7}
                    hitSlop={8}
                  >
                    <View style={styles.alwaysDot} />
                    <View style={styles.alwaysRowText}>
                      <Text style={styles.alwaysRowTitle} numberOfLines={1}>
                        {a.brand} {a.product_name}
                      </Text>
                      <Text style={styles.alwaysRowMeta}>
                        Free-choice{since ? ` · since ${since}` : ''}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  {/* §6a passive freshness — a NUDGE, not a persistent link: the
                      one-tap re-attest shows only once the arrangement is stale, so
                      a fresh bowl stays quiet. Separate tap target so the row tap
                      still opens detail; never a push. The "Confirmed ✓" flash is
                      the visible acknowledgment before the row settles to fresh. */}
                  {justConfirmedId === a.food_item_id ? (
                    <Text style={styles.alwaysConfirmed}>Confirmed ✓</Text>
                  ) : isArrangementStale(a.updated_at) ? (
                    <TouchableOpacity
                      onPress={() => handleConfirmFresh(a.food_item_id)}
                      hitSlop={10}
                      activeOpacity={0.7}
                      style={styles.alwaysConfirm}
                    >
                      <Text style={styles.alwaysConfirmText}>Still accurate?</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </View>

      <View style={styles.zone}>
        <SectionLabel label="Library" />
        <TextInput
          style={styles.search}
          placeholder="Search brand or product"
          placeholderTextColor={theme.colorTextTertiary}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {filteredLibrary.length === 0 ? (
          <Text style={styles.empty}>
            {library.length === 0
              ? 'No foods yet. Snap one above.'
              : 'No matches.'}
          </Text>
        ) : (
          <View style={styles.groups}>
            <LibraryGroup label="Meals"        foods={groupedLibrary.meals}
              onPickFood={onPickFood} onOpenDetail={onOpenDetail} toRows={toRows} />
            <LibraryGroup label="Treats"       foods={groupedLibrary.treats}
              onPickFood={onPickFood} onOpenDetail={onOpenDetail} toRows={toRows} />
            <LibraryGroup label="Unclassified" foods={groupedLibrary.other}
              onPickFood={onPickFood} onOpenDetail={onOpenDetail} toRows={toRows}
              hint="Long-press a tile to classify it." />
          </View>
        )}
      </View>
    </ScrollView>
  );
}

// Renders a single grouped section of the library. Hidden when the group is
// empty so the picker doesn't show a "Treats" header with nothing under it.
function LibraryGroup({
  label, foods, onPickFood, onOpenDetail, toRows, hint,
}: {
  label: string;
  foods: PickerFood[];
  onPickFood: (food: PickerFood) => void;
  onOpenDetail?: (food: PickerFood) => void;
  toRows: (foods: PickerFood[]) => PickerFood[][];
  hint?: string;
}) {
  if (foods.length === 0) return null;
  const rows = toRows(foods);
  return (
    <View style={styles.group}>
      <Text style={styles.groupLabel}>{label}</Text>
      {hint && <Text style={styles.groupHint}>{hint}</Text>}
      <View style={styles.grid}>
        {rows.map((row, idx) => (
          <View key={idx} style={styles.gridRow}>
            {row.map((f) => (
              <FoodTile
                key={f.id}
                brand={f.brand}
                productName={f.product_name}
                format={f.format}
                onPress={() => onPickFood(f)}
                onLongPress={onOpenDetail ? () => onOpenDetail(f) : undefined}
              />
            ))}
            {row.length === 1 && <View style={styles.gridSpacer} />}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: SCREEN_PADDING,
    paddingBottom: theme.space4,
    gap: theme.space3,
  },
  zone: {
    gap: theme.space2,
  },
  recentRow: {
    gap: theme.space2,
    paddingRight: theme.space2,
  },
  recentTile: {
    width: 160,
  },
  search: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
    backgroundColor: theme.colorNeutralLight,
    borderRadius: theme.radiusSmall,
    paddingHorizontal: theme.space2,
    height: 44,
  },
  empty: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    paddingVertical: theme.space2,
  },
  alwaysEmpty: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: 19,
  },
  alwaysList: {
    gap: theme.space1,
  },
  alwaysRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    paddingVertical: theme.space1,
    minHeight: 44,
  },
  alwaysMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    minHeight: 44,
  },
  alwaysConfirm: {
    paddingVertical: theme.space1,
    justifyContent: 'center',
    minHeight: 44,
  },
  alwaysConfirmText: {
    fontSize: theme.textSM,
    color: theme.colorAccent,
  },
  alwaysConfirmed: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    minHeight: 44,
    textAlignVertical: 'center',
    paddingVertical: theme.space1,
  },
  alwaysDot: {
    width: 8,
    height: 8,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorAccent,
  },
  alwaysRowText: {
    flex: 1,
  },
  alwaysRowTitle: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
  },
  alwaysRowMeta: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    marginTop: 2,
  },
  groups: {
    gap: theme.space2,
  },
  group: {
    gap: theme.space1,
  },
  groupLabel: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
    letterSpacing: theme.trackingWide,
    textTransform: 'uppercase',
  },
  groupHint: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    marginBottom: theme.space1,
  },
  grid: {
    gap: theme.space2,
  },
  gridRow: {
    flexDirection: 'row',
    gap: theme.space2,
  },
  gridSpacer: {
    flex: 1,
  },
  addCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    backgroundColor: theme.colorAccentLight,
    borderRadius: theme.radiusMedium,
    padding: theme.space2,
    minHeight: 56,
  },
  addCtaIcon: {
    fontSize: 24,
  },
  addCtaText: {
    flex: 1,
  },
  addCtaTitle: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  addCtaHint: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    marginTop: 2,
  },
});
