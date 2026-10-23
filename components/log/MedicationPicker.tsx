import { useCallback, useMemo, useState } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { theme } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';
import { SectionLabel } from '../ui/SectionLabel';
import { SearchField } from '../ui/SearchField';
import { getActiveCourseItemIds, getRecentMedications, getLibraryMedications, PickerMedication } from '../../lib/db';
import { PickerSilhouette } from '../surfaces/waits/PickerSilhouette';
import { PickerReadFailed } from './PickerReadFailed';
import { PickerAddDoor } from './PickerAddDoor';
import { usePickerColumns } from './pickerColumns';

// The medication twin of FoodPicker (spec §9), deliberately leaner: a drug
// library has no "always available" free-choice facts and no wall-of-Fancy-Feast
// brand grouping, so this is Recent + a searchable Library + the photo-first "Add
// a medication" CTA (B-117 PR 5 — the CTA opens app/medication-capture, which
// snaps the label and falls back to manual entry, exactly like FoodPicker's
// onAddNew → food-capture). Tap a tile → onPickMedication logs a dose in one tap.
// The two pickers share their structure (shelves → the Add door → Library; the door
// moved under the shelves in CUL-1908's design pass)
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

// CUL-2168 (C-12): `recent` and `library` start as [], so an empty array alone cannot
// tell "no medications" from "not read yet" or "the read threw". Only 'answered' may
// say the library is empty; the empty copy behind a read that never answered was the
// path to capturing a drug twice, and a dose against the copy sits outside its course.
export const MED_READ_FAILED = "Couldn't load your medications.";
type LibraryRead = 'reading' | 'answered' | 'failed';

interface Props {
  petId: string;
  // The pet the dose is written to, for the "{Pet}'s courses" shelf (P7). The caller
  // resolves it from the record's pet (the meal's, on a combo), never the active one.
  petName?: string;
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

export function MedicationPicker({ petId, petName, onPickMedication, onAddNew, onOpenDetail }: Props) {
  const [recent, setRecent] = useState<PickerMedication[]>([]);
  const [library, setLibrary] = useState<PickerMedication[]>([]);
  // CUL-1908 P7 — the drugs this pet has a running course of. Read with the shelves, so a
  // throw is the same failed read the band says (C-12).
  const [courseIds, setCourseIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [read, setRead] = useState<LibraryRead>('reading');
  // Bumped by Try again: a new callback identity re-runs the focus load in place.
  const [retryTick, setRetryTick] = useState(0);

  // Reload on every focus so a drug added (or logged) elsewhere is reflected when
  // the picker comes back into view (router.back() doesn't remount it).
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const [r, l, c] = await Promise.all([
            getRecentMedications(petId, RECENT_DAYS, RECENT_LIMIT),
            getLibraryMedications(),
            getActiveCourseItemIds(petId),
          ]);
          if (!cancelled) {
            setRecent(r);
            setLibrary(l);
            setCourseIds(c);
            setRead('answered');
          }
        } catch (err) {
          // No silent failures in the data path (house rule): the band says so.
          console.warn('[MedicationPicker] load failed:', err);
          if (!cancelled) setRead('failed');
        }
      })();
      return () => { cancelled = true; };
    }, [petId, retryTick]),
  );

  const retry = useCallback(() => {
    setRead('reading');
    setRetryTick((t) => t + 1);
  }, []);

  // P7 — "{Pet}'s courses" pinned first: the trial list's rule applied to medicine.
  // ORDERING ONLY: the tiles are the same tiles, the label is the only signal, and
  // nothing here counts doses or says a course is done (a course's "Dose X of Y" lives
  // on its own card, dose duration spec D7). A course drug leaves Recent so it is not
  // pinned twice above the fold; the library below still holds every drug.
  const courses = useMemo(
    () => library.filter((m) => courseIds.includes(m.id)),
    [library, courseIds],
  );
  const recentShown = useMemo(
    () => recent.filter((m) => !courseIds.includes(m.id)),
    [recent, courseIds],
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
        {read === 'failed' && <PickerReadFailed message={MED_READ_FAILED} onRetry={retry} />}

        {read === 'reading' && <PickerSilhouette />}

        {read === 'answered' && courses.length > 0 && (
          <View style={styles.zone}>
            <SectionLabel label={petName ? `${petName}'s courses` : 'Courses'} header />
            <MedGrid
              meds={courses}
              compact
              onPickMedication={onPickMedication}
              onOpenDetail={onOpenDetail}
            />
          </View>
        )}

        {read === 'answered' && recentShown.length > 0 && (
          <View style={styles.zone}>
            <SectionLabel label="Recent" header />
            {/* B-355 — a wrapped compact 2-up grid (not a horizontal scroll): every
                recent drug is visible at once, no hidden off-screen overflow (the
                B-146 direction, mirroring FoodPicker's B-346 rotation shelf). Compact
                tiles keep the small recent set short so the full library below stays
                reachable. Recency-ordered (newest first) by getRecentMedications. */}
            <MedGrid
              meds={recentShown}
              compact
              onPickMedication={onPickMedication}
              onOpenDetail={onOpenDetail}
            />
          </View>
        )}

        {/* The door follows the shelves (the round's §07): after week one a shelf answers
            most visits, so it takes the top of the fold. Before the read answers, and
            when it fails, it sits under the silhouette or the band. */}
        <View style={styles.zone}>
          <PickerAddDoor title="Add a medication" hint="Snap the label, or enter it by hand" onPress={onAddNew} />
        </View>

        {read === 'answered' && (
          <View style={styles.zone}>
            {library.length > 0 && (
              <SearchField placeholder="Search medications" value={search} onChangeText={setSearch} />
            )}
            {filteredLibrary.length === 0 ? (
              <ThemedText style={styles.empty}>
                {library.length === 0
                  ? "No medications yet. Add one above and we'll keep it handy for next time."
                  : 'No matches.'}
              </ThemedText>
            ) : (
              <MedGrid
                meds={filteredLibrary}
                onPickMedication={onPickMedication}
                onOpenDetail={onOpenDetail}
              />
            )}
          </View>
        )}
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
  const columns = usePickerColumns();
  return (
    <View style={styles.grid}>
      {/* Key on the row's first med id (rows are never empty) rather than the index,
          so a search filter that changes the list can't make React reuse a row view
          and miss a re-layout. */}
      {chunkRows(meds, columns).map((row) => (
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
          {columns === 2 && row.length === 1 && <View style={styles.gridSpacer} />}
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
        <ThemedText style={styles.tileMeta} numberOfLines={1}>{metaLine}</ThemedText>
      ) : null}
      <ThemedText style={styles.tileName} numberOfLines={2}>{med.generic_name}</ThemedText>
    </TouchableOpacity>
  );
}

// Title-case the stored enum form for display ('chewable' → 'Chewable'); blank
// for an unset/unknown form so the eyebrow just drops it.
function formatForm(form: string | null): string {
  if (!form) return '';
  return form.charAt(0).toUpperCase() + form.slice(1);
}

// Chunk into rows (two up, or one at the largest text sizes) so tiles in a row share a
// height; a trailing odd tile gets a spacer to keep the last row left-aligned (the
// FoodPicker grid shape).
function chunkRows<T>(items: T[], columns: 1 | 2): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += columns) rows.push(items.slice(i, i + columns));
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
  empty: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightSMLoose,
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
    minHeight: theme.space6 + theme.space3,
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
    minHeight: theme.space6,
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
    lineHeight: theme.lineHeightBody,
  },
});
