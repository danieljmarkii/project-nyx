import { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Camera } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { SectionLabel } from '../ui/SectionLabel';
import { getRecentMedications, getLibraryMedications, PickerMedication } from '../../lib/db';

// The medication twin of FoodPicker (spec §9), deliberately leaner: a drug
// library has no "always available" free-choice facts and no wall-of-Fancy-Feast
// brand grouping, so this is Recent + a searchable Library + the photo-first "Add
// a medication" CTA (B-117 PR 5 — the CTA opens app/medication-capture, which
// snaps the label and falls back to manual entry, exactly like FoodPicker's
// onAddNew → food-capture). Tap a tile → onPickMedication logs a dose in one tap.
// The two pickers share their structure (Add CTA on top → Recent grid → Library)
// so they read as one family.

// B-355 — Recent is a WRAPPED compact 2-up grid, not a hidden horizontal scroll.
// Mirrors the B-346 fix to FoodPicker's rotation shelf: a horizontal ScrollView +
// edge-fade silently hid tiles off-screen (the B-146 no-hidden-overflow direction),
// so every Recent/Library tile now wraps and stays visible. Deliberately NOT widened
// past 14d/5 the way food's rotation was (30/12): a drug list is small, so 5 already
// holds the whole set, and a wider window would surface a *discontinued* drug one tap
// from the top of the log surface — the med analog of the diet-trial seam (B-357), an
// unwanted re-log affordance a "recent doses" shelf shouldn't grow. The wrap is the
// point here; the widen isn't warranted.
const RECENT_DAYS = 14;
const RECENT_LIMIT = 5;
const SCREEN_PADDING = theme.space2;

interface Props {
  petId: string;
  // Fires when the user taps a Recent or Library tile — one-tap dose log.
  onPickMedication: (med: PickerMedication) => void;
  // Fires when the user taps "Add a medication" — opens the photo-capture flow
  // (app/medication-capture). Mirrors FoodPicker's onAddNew.
  onAddNew: () => void;
  // Long-press on a tile — opens the medication detail/edit screen (B-117 PR 6).
  // Kept separate from onPickMedication so the one-tap dose-log path stays clean,
  // exactly like FoodPicker's onOpenDetail.
  onOpenDetail?: (med: PickerMedication) => void;
}

export function MedicationPicker({ petId, onPickMedication, onAddNew, onOpenDetail }: Props) {
  const [recent, setRecent] = useState<PickerMedication[]>([]);
  const [library, setLibrary] = useState<PickerMedication[]>([]);
  const [search, setSearch] = useState('');

  // Reload on every focus so a drug added (or logged) elsewhere is reflected when
  // the picker comes back into view (router.back() doesn't remount it).
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const [r, l] = await Promise.all([
            getRecentMedications(petId, RECENT_DAYS, RECENT_LIMIT),
            getLibraryMedications(),
          ]);
          if (!cancelled) {
            setRecent(r);
            setLibrary(l);
          }
        } catch (err) {
          // No silent failures in the data path (house rule). Leave prior state
          // intact — navigating away and back re-runs this load.
          console.warn('[MedicationPicker] load failed:', err);
        }
      })();
      return () => { cancelled = true; };
    }, [petId]),
  );

  const filteredLibrary = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return library;
    return library.filter(
      (m) =>
        m.generic_name.toLowerCase().includes(q) ||
        (m.brand_name?.toLowerCase().includes(q) ?? false),
    );
  }, [library, search]);

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
            accessibilityLabel="Add a medication"
          >
            <View style={styles.addCtaIcon}>
              <Camera size={20} color={theme.colorAccent} strokeWidth={2} />
            </View>
            <View style={styles.addCtaText}>
              <Text style={styles.addCtaTitle}>Add a medication</Text>
              <Text style={styles.addCtaHint}>Snap the label, or enter it by hand</Text>
            </View>
          </TouchableOpacity>
        </View>

        {recent.length > 0 && (
          <View style={styles.zone}>
            <SectionLabel label="Recent" />
            {/* B-355 — a wrapped compact 2-up grid (not a horizontal scroll): every
                recent drug is visible at once, no hidden off-screen overflow (the
                B-146 direction, mirroring FoodPicker's B-346 rotation shelf). Compact
                tiles keep the small recent set short so the full library below stays
                reachable. Recency-ordered (newest first) by getRecentMedications. */}
            <MedGrid
              meds={recent}
              compact
              onPickMedication={onPickMedication}
              onOpenDetail={onOpenDetail}
            />
          </View>
        )}

        <View style={styles.zone}>
          {library.length > 0 && (
            <TextInput
              style={styles.search}
              placeholder="Search medications"
              placeholderTextColor={theme.colorTextTertiary}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
          )}
          {filteredLibrary.length === 0 ? (
            <Text style={styles.empty}>
              {library.length === 0
                ? "No medications yet. Add one above and we'll keep it handy for next time."
                : 'No matches.'}
            </Text>
          ) : (
            <MedGrid
              meds={filteredLibrary}
              onPickMedication={onPickMedication}
              onOpenDetail={onOpenDetail}
            />
          )}
        </View>
    </ScrollView>
  );
}

// The 2-up tile grid shared by the Recent shelf (compact) and the Library. Chunks
// the meds into 2-col rows so tiles in a row share a height; a trailing odd tile gets
// a spacer to keep the last row left-aligned. Mirrors FoodPicker's TileGrid — one
// wrapped-grid renderer, so Recent and Library read as one family and neither hides
// tiles off-screen (B-355 / B-146).
function MedGrid({
  meds, compact = false, onPickMedication, onOpenDetail,
}: {
  meds: PickerMedication[];
  // Compact tiles for the Recent shelf — smaller footprint, same tap target.
  compact?: boolean;
  onPickMedication: (med: PickerMedication) => void;
  onOpenDetail?: (med: PickerMedication) => void;
}) {
  return (
    <View style={styles.grid}>
      {/* Key on the row's first med id (rows are never empty) rather than the index,
          so a search filter that changes the list can't make React reuse a row view
          and miss a re-layout. */}
      {chunkPairs(meds).map((row) => (
        <View key={row[0].id} style={styles.gridRow}>
          {row.map((m) => (
            <MedTile
              key={m.id}
              med={m}
              compact={compact}
              onPress={() => onPickMedication(m)}
              onLongPress={onOpenDetail ? () => onOpenDetail(m) : undefined}
            />
          ))}
          {row.length === 1 && <View style={styles.gridSpacer} />}
        </View>
      ))}
    </View>
  );
}

// Text-only drug tile — drug name owns the centre (the disambiguator), with
// brand · strength · form on a quiet tertiary eyebrow. Mirrors FoodTile: the whole
// tile is one button that LOGS on tap (≥44pt via minHeight), labelled with the
// drug's plain name for screen readers. The compact variant (B-355 Recent shelf)
// shrinks only the vertical footprint — same eyebrow, same two-line name, same tap
// target — matching FoodTile's compact prop.
function MedTile({
  med, onPress, onLongPress, compact = false,
}: {
  med: PickerMedication;
  onPress: () => void;
  onLongPress?: () => void;
  compact?: boolean;
}) {
  const metaLine = [med.brand_name, med.strength, formatForm(med.form)]
    .filter(Boolean)
    .join(' · ')
    .toUpperCase();
  return (
    <TouchableOpacity
      style={[styles.tile, compact && styles.tileCompact]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={med.generic_name}
      accessibilityHint={onLongPress ? 'Logs a dose. Long-press to edit.' : 'Logs a dose'}
    >
      {metaLine ? (
        <Text style={styles.tileMeta} numberOfLines={1}>{metaLine}</Text>
      ) : null}
      <Text style={styles.tileName} numberOfLines={2}>{med.generic_name}</Text>
    </TouchableOpacity>
  );
}

// Title-case the stored enum form for display ('chewable' → 'Chewable'); blank
// for an unset/unknown form so the eyebrow just drops it.
function formatForm(form: string | null): string {
  if (!form) return '';
  return form.charAt(0).toUpperCase() + form.slice(1);
}

// Chunk into 2-up rows so tiles in a row share a height; a trailing odd tile gets
// a spacer to keep the last row left-aligned (the FoodPicker grid shape).
function chunkPairs<T>(items: T[]): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return rows;
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
    lineHeight: 19,
    paddingVertical: theme.space2,
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
  tile: {
    flex: 1,
    minHeight: 88,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusMedium,
    backgroundColor: theme.colorSurface,
    padding: theme.space2,
    gap: theme.space1,
  },
  // B-355 Recent shelf — a shorter tile (min-height stays above the 44pt tap floor)
  // with tighter vertical padding, matching FoodTile's tileCompact. Longhand
  // paddingVertical wins over the base `padding` shorthand in RN's style merge, so
  // horizontal padding is kept.
  tileCompact: {
    minHeight: 62,
    paddingVertical: theme.space1,
    gap: theme.spaceMicro,
  },
  tileMeta: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    color: theme.colorTextTertiary,
    letterSpacing: theme.trackingWidest,
  },
  tileName: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
    lineHeight: 20,
  },
});
