import { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { SectionLabel } from '../ui/SectionLabel';
import { getRecentMedications, getLibraryMedications, PickerMedication } from '../../lib/db';
import { AddMedicationModal } from './AddMedicationModal';

// The medication twin of FoodPicker (spec §9), deliberately leaner: a drug
// library has no "always available" free-choice facts and no wall-of-Fancy-Feast
// brand grouping, so this is Recent + a searchable Library + the text-first "Add
// medication" CTA. Tap a tile → onPickMedication logs a dose in one tap. The two
// pickers share their structure (Add CTA on top → Recent strip → Library) so they
// read as one family.

const RECENT_DAYS = 14;
const RECENT_LIMIT = 5;
const SCREEN_PADDING = theme.space2;

interface Props {
  petId: string;
  // Fires when the user taps a Recent or Library tile — one-tap dose log.
  onPickMedication: (med: PickerMedication) => void;
}

export function MedicationPicker({ petId, onPickMedication }: Props) {
  const [recent, setRecent] = useState<PickerMedication[]>([]);
  const [library, setLibrary] = useState<PickerMedication[]>([]);
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);

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

  // A just-added drug logs its first dose immediately (add-then-log), the same
  // one-tap path as picking an existing one. Close the add sheet FIRST (while
  // this picker is still mounted), THEN log the dose: handlePickMedication's
  // router.back() dismisses /log on success, so closing here avoids a setState on
  // an unmounting picker, and a dose-write failure surfaces its alert on the live
  // picker rather than on the dismissed sheet.
  const handleAdded = useCallback((item: PickerMedication) => {
    setAddOpen(false);
    onPickMedication(item);
  }, [onPickMedication]);

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.zone}>
          <TouchableOpacity
            style={styles.addCta}
            onPress={() => setAddOpen(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Add a medication"
          >
            <View style={styles.addCtaIcon}>
              <Plus size={20} color={theme.colorAccent} strokeWidth={2} />
            </View>
            <View style={styles.addCtaText}>
              <Text style={styles.addCtaTitle}>Add a medication</Text>
              <Text style={styles.addCtaHint}>Enter the name, strength, and form</Text>
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
              {recent.map((m) => (
                <View key={m.id} style={styles.recentTile}>
                  <MedTile med={m} onPress={() => onPickMedication(m)} />
                </View>
              ))}
            </ScrollView>
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
            <View style={styles.grid}>
              {chunkPairs(filteredLibrary).map((row) => (
                <View key={row[0].id} style={styles.gridRow}>
                  {row.map((m) => (
                    <MedTile key={m.id} med={m} onPress={() => onPickMedication(m)} />
                  ))}
                  {row.length === 1 && <View style={styles.gridSpacer} />}
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <AddMedicationModal
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={handleAdded}
      />
    </>
  );
}

// Text-only drug tile — drug name owns the centre (the disambiguator), with
// brand · strength · form on a quiet tertiary eyebrow. Mirrors FoodTile: the whole
// tile is one button that LOGS on tap (≥44pt via minHeight), labelled with the
// drug's plain name for screen readers.
function MedTile({ med, onPress }: { med: PickerMedication; onPress: () => void }) {
  const metaLine = [med.brand_name, med.strength, formatForm(med.form)]
    .filter(Boolean)
    .join(' · ')
    .toUpperCase();
  return (
    <TouchableOpacity
      style={styles.tile}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={med.generic_name}
      accessibilityHint="Logs a dose"
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
