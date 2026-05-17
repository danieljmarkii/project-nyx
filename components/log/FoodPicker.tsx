import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Dimensions,
} from 'react-native';
import { theme } from '../../constants/theme';
import { SectionLabel } from '../ui/SectionLabel';
import { getRecentFoods, getLibraryFoods, PickerFood } from '../../lib/db';
import { FoodThumb } from './FoodThumb';

interface Props {
  petId: string;
  // Fires when the user taps a Recent or Library thumbnail — one-tap log.
  onPickFood: (food: PickerFood) => void;
  // Fires when the user taps "Add new" — opens the photo capture flow.
  onAddNew: () => void;
}

const RECENT_DAYS = 14;
const RECENT_LIMIT = 5;
const GRID_COLUMNS = 2;
const SCREEN_PADDING = theme.space2;
const GRID_GAP = theme.space2;

export function FoodPicker({ petId, onPickFood, onAddNew }: Props) {
  const [recent, setRecent] = useState<PickerFood[]>([]);
  const [library, setLibrary] = useState<PickerFood[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [r, l] = await Promise.all([
        getRecentFoods(petId, RECENT_DAYS, RECENT_LIMIT),
        getLibraryFoods(),
      ]);
      if (!cancelled) {
        setRecent(r);
        setLibrary(l);
      }
    })();
    return () => { cancelled = true; };
  }, [petId]);

  const filteredLibrary = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return library;
    return library.filter(
      (f) =>
        f.brand.toLowerCase().includes(q) ||
        f.product_name.toLowerCase().includes(q),
    );
  }, [library, search]);

  const screenWidth = Dimensions.get('window').width;
  const gridItemSize = Math.floor(
    (screenWidth - SCREEN_PADDING * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS,
  );

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {recent.length > 0 && (
        <View style={styles.zone}>
          <SectionLabel label="Recent" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.recentRow}
          >
            {recent.map((f) => (
              <View key={f.id} style={styles.recentItem}>
                <FoodThumb
                  brand={f.brand}
                  productName={f.product_name}
                  photoPath={f.photo_path}
                  size={96}
                  onPress={() => onPickFood(f)}
                />
              </View>
            ))}
          </ScrollView>
        </View>
      )}

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
              ? 'No foods yet. Add one below.'
              : 'No matches.'}
          </Text>
        ) : (
          <View style={styles.grid}>
            {filteredLibrary.map((f) => (
              <View
                key={f.id}
                style={[styles.gridItem, { width: gridItemSize }]}
              >
                <FoodThumb
                  brand={f.brand}
                  productName={f.product_name}
                  photoPath={f.photo_path}
                  size={gridItemSize}
                  onPress={() => onPickFood(f)}
                />
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.zone}>
        <SectionLabel label="Add new" />
        <TouchableOpacity
          style={styles.addCta}
          onPress={onAddNew}
          activeOpacity={0.7}
        >
          <Text style={styles.addCtaIcon}>📷</Text>
          <View style={styles.addCtaText}>
            <Text style={styles.addCtaTitle}>Snap the package</Text>
            <Text style={styles.addCtaHint}>Or choose from your photos</Text>
          </View>
        </TouchableOpacity>
      </View>
    </ScrollView>
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
  recentItem: {
    width: 96,
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  gridItem: {
    // width set inline based on screen width
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
