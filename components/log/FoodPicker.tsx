import { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Camera } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { SectionLabel } from '../ui/SectionLabel';
import { getRecentFoods, getLibraryFoods, PickerFood } from '../../lib/db';
import { groupFoodsByType, toFoodRows, splitBrandGroupsForPicker } from '../../lib/food';
import {
  getActiveArrangementsForPets, confirmArrangementFresh, endFreeChoice,
  groupArrangementsByFood, arrangementPetsLine, petNameList, FoodArrangementGroup,
  formatCalendarDate, isArrangementStale,
} from '../../lib/feedingArrangements';
import { usePetStore, orderPetsActiveFirst } from '../../store/petStore';
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
  const [arrangements, setArrangements] = useState<FoodArrangementGroup[]>([]);
  const [search, setSearch] = useState('');

  // Multi-pet spec §3.4: the "Always available" section is a HOUSEHOLD view —
  // it shows every active pet's standing facts, each entry labeled with its
  // pet(s). The logging pet (petId, the active pet) sorts first. Single-pet
  // households keep today's unlabeled rendering (§7.8 — zero new chrome).
  // The synthetic fallback covers the brief window before the pet store loads.
  const storePets = usePetStore((s) => s.pets);
  const householdPets = useMemo(() => {
    const list: { id: string; name: string; species?: string }[] =
      storePets.some((p) => p.id === petId)
        ? storePets
        : [...storePets, { id: petId, name: petName ?? 'your pet' }];
    return orderPetsActiveFirst(list, petId);
  }, [storePets, petId, petName]);
  const multiPet = householdPets.length > 1;
  const petIdsKey = householdPets.map((p) => p.id).join(',');
  // Brief "Confirmed ✓" acknowledgment after a freshness re-attest, so the tap
  // never reads as a dead control even as the row settles back to fresh.
  const [justConfirmedId, setJustConfirmedId] = useState<string | null>(null);
  // Which row has its "still out? yes / no" choices open. The stale nudge is a
  // QUESTION, so tapping it reveals a two-way answer rather than silently
  // auto-confirming "yes" — and "no" (the bowl ended) is the outcome freshness
  // exists to catch (§6a; Data Scientist), so it's a first-class choice.
  const [choosingId, setChoosingId] = useState<string | null>(null);

  // Just the "Always available" arrangements — re-read after a freshness confirm
  // (below) without re-running the whole recent/library load. Household-wide,
  // grouped one entry per food with its pet(s).
  const loadArrangements = useCallback(async () => {
    const rows = await getActiveArrangementsForPets(householdPets.map((p) => p.id));
    return groupArrangementsByFood(rows, householdPets);
    // householdPets is identity-unstable across renders; the joined ids are
    // the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petIdsKey]);

  const reloadArrangements = useCallback(async () => {
    try {
      setArrangements(await loadArrangements());
    } catch (err) {
      console.warn('[FoodPicker] arrangements reload failed:', err);
    }
  }, [loadArrangements]);

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
            loadArrangements(),
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
    }, [petId, loadArrangements]),
  );

  // §6a passive freshness — "Yes, still out": re-attest the bowl is still down
  // (never a push). The re-read settles the row back to fresh (so the nudge
  // disappears); the brief "Confirmed ✓" flash is the visible acknowledgment.
  // Per-(pet, food): in a multi-pet household each pet's arrangement is
  // re-attested independently (spec §7.7).
  const handleConfirmYes = useCallback(async (forPetId: string, foodItemId: string) => {
    setChoosingId(null);
    setJustConfirmedId(foodItemId);
    try {
      await confirmArrangementFresh(forPetId, foodItemId);
      await reloadArrangements();
    } catch (err) {
      console.warn('[FoodPicker] freshness confirm failed:', err);
    } finally {
      setTimeout(() => {
        setJustConfirmedId((cur) => (cur === foodItemId ? null : cur));
      }, 1500);
    }
  }, [reloadArrangements]);

  // "No, it's stopped": end the arrangement (soft — writes the active_until
  // "Stopped" boundary History renders). The row drops out of the active list
  // for that pet only.
  const handleStopped = useCallback(async (forPetId: string, foodItemId: string) => {
    setChoosingId(null);
    try {
      await endFreeChoice(forPetId, foodItemId);
      await reloadArrangements();
    } catch (err) {
      console.warn('[FoodPicker] end arrangement failed:', err);
    }
  }, [reloadArrangements]);

  const filteredLibrary = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return library;
    return library.filter(
      (f) =>
        f.brand.toLowerCase().includes(q) ||
        f.product_name.toLowerCase().includes(q),
    );
  }, [library, search]);

  // Group the (filtered) library by food_type via the shared helper (lib/food,
  // tested there + reused by the standalone Foods tab). B-011: treats and meals
  // are distinct mental models — separate sections let the owner scan one
  // without parsing the other; unclassified (NULL) + 'other' collapse into a
  // third bucket so nothing is hidden from the picker.
  const groupedLibrary = useMemo(() => groupFoodsByType(filteredLibrary), [filteredLibrary]);

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
          accessibilityRole="button"
          accessibilityLabel="Snap a new food"
        >
          {/* B-062 — Lucide Camera (was a 📷 emoji), matching MedicationPicker's
              identical "Add" CTA so the two pickers read as one family of vector
              glyphs rather than mixed emoji/icon. */}
          <View style={styles.addCtaIcon}>
            <Camera size={20} color={theme.colorAccent} strokeWidth={2} />
          </View>
          <View style={styles.addCtaText}>
            <Text style={styles.addCtaTitle}>Snap a new food</Text>
            <Text style={styles.addCtaHint}>Or choose from your photos</Text>
          </View>
        </TouchableOpacity>
      </View>

      {recent.length > 0 && (
        <View style={styles.zone}>
          <SectionLabel label="Recent" />
          {/* Wrapper is the positioning context for the absolute edge-fade below
              (a View is position:relative by default — matches History's lens row). */}
          <View>
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
            {/* B-166 — right-edge "there's more →" fade, mirroring the History lens
                row. A Recent shelf is a BROWSE row (the full library sits right
                below), so a fade is the correct cue — unlike the option pickers,
                where hidden overflow was wrong and B-146 switched them to a wrap.
                The 0-alpha stop is white's zero-alpha form, NOT 'transparent' (RN
                fades 'transparent' through black and dirties the edge); keep in
                sync with the surface the picker sits on (log.tsx = colorSurface). */}
            <LinearGradient
              colors={['rgba(255,255,255,0)', theme.colorSurface]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.recentFade}
              pointerEvents="none"
            />
          </View>
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
            Nothing always-out yet. If {multiPet
              ? petNameList(householdPets.map((p) => p.name), 'or')
              : petName ?? 'your pet'} grazes a bowl that's
            down all day, open a food and turn on “Always available” — we'll note it
            as free-choice for the vet.
          </Text>
        ) : (
          <View style={styles.alwaysList}>
            {arrangements.map((g) => {
              // Single-pet: today's unlabeled meta line. Multi-pet: each entry
              // labeled with the pet(s) it's down for (spec §3.4).
              const since = formatCalendarDate(g.perPet[0]?.active_from ?? null);
              const metaLine = multiPet
                ? `Free-choice · ${arrangementPetsLine(g.perPet)}`
                : `Free-choice${since ? ` · since ${since}` : ''}`;
              // §6a staleness stays per-arrangement: the nudge shows when ANY
              // pet's row is stale, and the answer below asks per stale pet.
              const staleEntries = g.perPet.filter((p) => isArrangementStale(p.updated_at));
              return (
                <View key={g.food_item_id} style={styles.alwaysItem}>
                  <View style={styles.alwaysRow}>
                    <TouchableOpacity
                      style={styles.alwaysMain}
                      // food_type/photo_path are null because this is a display-only
                      // view shape — the detail screen re-fetches the full food row.
                      onPress={() =>
                        onOpenDetail?.({
                          id: g.food_item_id,
                          brand: g.brand,
                          product_name: g.product_name,
                          format: g.format,
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
                          {g.brand} {g.product_name}
                        </Text>
                        <Text style={styles.alwaysRowMeta}>{metaLine}</Text>
                      </View>
                    </TouchableOpacity>
                    {/* §6a passive freshness — a NUDGE, not a persistent link: the
                        re-attest shows only once an arrangement is stale, so a fresh
                        bowl stays quiet. Tapping it opens a two-way answer (below)
                        rather than silently auto-confirming "yes"; never a push. */}
                    {justConfirmedId === g.food_item_id ? (
                      <Text style={styles.alwaysConfirmed}>Confirmed ✓</Text>
                    ) : staleEntries.length > 0 && choosingId !== g.food_item_id ? (
                      <TouchableOpacity
                        onPress={() => setChoosingId(g.food_item_id)}
                        hitSlop={10}
                        activeOpacity={0.7}
                        style={styles.alwaysConfirm}
                      >
                        <Text style={styles.alwaysConfirmText}>Still accurate?</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  {choosingId === g.food_item_id && staleEntries.map((entry) => (
                    <View key={entry.pet_id} style={styles.freshnessChoices}>
                      <Text style={styles.freshnessPrompt}>
                        Still always out for {multiPet ? entry.petName : petName ?? 'your pet'}?
                      </Text>
                      <View style={styles.freshnessChoiceBtns}>
                        <TouchableOpacity
                          onPress={() => handleConfirmYes(entry.pet_id, g.food_item_id)}
                          hitSlop={8}
                          activeOpacity={0.7}
                          style={styles.freshnessChoiceBtn}
                        >
                          <Text style={styles.choiceYes}>Yes, still out</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleStopped(entry.pet_id, g.food_item_id)}
                          hitSlop={8}
                          activeOpacity={0.7}
                          style={styles.freshnessChoiceBtn}
                        >
                          <Text style={styles.choiceNo}>No, it's stopped</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* No "LIBRARY" zone label here (B-113 Option C): the per-type section
          titles below ("Meals"/"Treats") ARE the headers, matching the Foods tab's
          two-level structure (section → brand → items). A small all-caps "LIBRARY"
          eyebrow above a prominent "Meals" title would re-create the inverted
          hierarchy the Foods tab just fixed. The search field opens the zone. */}
      <View style={styles.zone}>
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
              onPickFood={onPickFood} onOpenDetail={onOpenDetail} />
            <LibraryGroup label="Treats"       foods={groupedLibrary.treats}
              onPickFood={onPickFood} onOpenDetail={onOpenDetail} />
            <LibraryGroup label="Unclassified" foods={groupedLibrary.other}
              onPickFood={onPickFood} onOpenDetail={onOpenDetail}
              hint="Long-press a tile to classify it." />
          </View>
        )}
      </View>
    </ScrollView>
  );
}

// Renders one type section of the library (Meals / Treats / Unclassified). Hidden
// when the section is empty so the picker never shows a "Treats" header with
// nothing under it.
//
// B-113 Option C — the picker shares the Foods tab's *organizing structure*
// (type section title → brand grouping → items) so the two surfaces read as one
// family, while the *unit* stays deliberately different: 2-up tap-to-LOG FoodTiles
// here, full-width tap-to-OPEN FoodRows there. The tile is still the right unit on
// the hot path — it shows ~2× the candidates per screen, carries no chevron (which
// would lie: a tap logs) and no intake/favorite annotation (which mustn't sit by a
// one-tap-log control — intake-is-not-preference), and stays text-only (§4.1 retired
// photo thumbnails from this grid). So FoodTile and FoodRow remain two components
// for two jobs; do NOT unify them onto the hot path.
//
// Brand grouping (B-109) is the shared structure, applied with the picker-only
// ≥2-variant rule (splitBrandGroupsForPicker): a brand earns a header only when it
// collapses ≥2 variants (the picky-cat wall of Fancy Feast); single-variant brands
// stay one flat 2-up grid with the brand in the tile eyebrow — so a diet-trial
// owner's all-distinct library renders ~as before (no header per food, no
// 10-second-test regression). The Foods tab headers every brand; the picker does
// not, by design.
function LibraryGroup({
  label, foods, onPickFood, onOpenDetail, hint,
}: {
  label: string;
  foods: PickerFood[];
  onPickFood: (food: PickerFood) => void;
  onOpenDetail?: (food: PickerFood) => void;
  hint?: string;
}) {
  if (foods.length === 0) return null;
  const { brandGroups, singles } = splitBrandGroupsForPicker(foods);
  return (
    <View style={styles.group}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{label}</Text>
        {hint ? <Text style={styles.groupHint}>{hint}</Text> : null}
      </View>
      <View style={styles.brandGroups}>
        {brandGroups.map((bg) => (
          <View key={bg.key} style={styles.brandGroup}>
            {/* A brand can be blank in the catalog (rare); skip the header rather
                than render an empty label, but still show its tiles. */}
            {bg.brand.trim() ? (
              <Text style={styles.brandLabel} numberOfLines={1} accessibilityRole="header">
                {bg.brand}
              </Text>
            ) : null}
            <TileGrid foods={bg.foods} hideBrand onPickFood={onPickFood} onOpenDetail={onOpenDetail} />
          </View>
        ))}
        {/* Single-variant brands: one flat grid, brand kept in each tile's eyebrow. */}
        {singles.length > 0 ? (
          <TileGrid foods={singles} onPickFood={onPickFood} onOpenDetail={onOpenDetail} />
        ) : null}
      </View>
    </View>
  );
}

// The 2-up tile grid shared by every brand group and the singles list. Chunks the
// foods into 2-col rows (toFoodRows) so tiles in a row share a height; a trailing
// odd tile gets a spacer to keep the last row left-aligned.
function TileGrid({
  foods, hideBrand = false, onPickFood, onOpenDetail,
}: {
  foods: PickerFood[];
  hideBrand?: boolean;
  onPickFood: (food: PickerFood) => void;
  onOpenDetail?: (food: PickerFood) => void;
}) {
  return (
    <View style={styles.grid}>
      {/* Key on the row's first food id (rows are never empty) rather than the
          index, so a search filter that changes the list can't make React reuse a
          row view and miss a re-layout. */}
      {toFoodRows(foods).map((row) => (
        <View key={row[0].id} style={styles.gridRow}>
          {row.map((f) => (
            <FoodTile
              key={f.id}
              brand={f.brand}
              productName={f.product_name}
              format={f.format}
              hideBrand={hideBrand}
              onPress={() => onPickFood(f)}
              onLongPress={onOpenDetail ? () => onOpenDetail(f) : undefined}
            />
          ))}
          {row.length === 1 && <View style={styles.gridSpacer} />}
        </View>
      ))}
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
  // B-166 — the right-edge "there's more →" fade over the Recent shelf (top/bottom 0
  // spans the shelf's content height; no explicit height needed).
  recentFade: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 28,
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
  alwaysItem: {
    gap: theme.space1,
  },
  alwaysRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    paddingVertical: theme.space1,
    minHeight: 44,
  },
  freshnessChoices: {
    paddingLeft: theme.space2,
    paddingBottom: theme.space1,
    gap: theme.space1,
  },
  freshnessPrompt: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  freshnessChoiceBtns: {
    flexDirection: 'row',
    gap: theme.space3,
  },
  freshnessChoiceBtn: {
    minHeight: 44,
    justifyContent: 'center',
  },
  choiceYes: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorAccent,
  },
  choiceNo: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
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
    gap: theme.space3,
  },
  group: {
    gap: theme.space2,
  },
  // Type section header (Meals / Treats / Unclassified) — harmonized with the
  // Foods tab's sectionTitle treatment (B-113 Option C): sentence-case textXL, so
  // the section out-weighs the brand sub-header beneath it. A small all-caps label
  // here would invert the hierarchy (the bug the Foods tab fixed), so the picker
  // uses the SAME prominent title the browse tab does.
  sectionHeader: {
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
  // Brand sub-groups within a type section (B-109) — mirrors the Foods tab so the
  // two surfaces cluster a brand's variants identically. A touch of air between
  // brands (space2), tighter between a brand label and its tiles (space1).
  brandGroups: {
    gap: theme.space2,
  },
  brandGroup: {
    gap: theme.space1,
  },
  brandLabel: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
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
    width: 24,
    alignItems: 'center',
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
