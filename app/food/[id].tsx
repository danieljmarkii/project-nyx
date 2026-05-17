// Food detail screen. Step 6 of the food-library-redesign track.
// Editable view of a single food_items row. Reaches Supabase directly (not
// the food_items_cache) because we need the richer columns —
// ingredients_notes, primary_protein, photo_paths — that the cache doesn't
// carry.
//
// Realtime: subscribes to postgres_changes on the food_items row so the
// pending → completed transition lands without a manual refresh.
import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { theme } from '../../constants/theme';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { FilterChip } from '../../components/ui/FilterChip';
import { PhotoCarousel } from '../../components/food/PhotoCarousel';
import { supabase } from '../../lib/supabase';
import { uploadPhoto, compressForUpload } from '../../lib/storage';
import { getDb } from '../../lib/db';

const FOOD_FORMATS = [
  { value: 'dry_kibble', label: 'Dry kibble' },
  { value: 'wet_canned', label: 'Wet / canned' },
  { value: 'raw', label: 'Raw' },
  { value: 'freeze_dried', label: 'Freeze-dried' },
  { value: 'fresh_cooked', label: 'Fresh cooked' },
  { value: 'topper', label: 'Topper' },
  { value: 'treat', label: 'Treat' },
  { value: 'other', label: 'Other' },
];

type ExtractionStatus = 'pending' | 'completed' | 'failed' | 'manual';

interface FoodRow {
  id: string;
  brand: string;
  product_name: string;
  format: string;
  ingredients_notes: string | null;
  upc_barcode: string | null;
  photo_paths: string[];
  primary_protein: string | null;
  ai_extraction_status: ExtractionStatus;
  ai_extraction_error: string | null;
  source: string;
}

const SELECT_COLS = 'id, brand, product_name, format, ingredients_notes, upc_barcode, photo_paths, primary_protein, ai_extraction_status, ai_extraction_error, source';

export default function FoodDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [row, setRow] = useState<FoodRow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Editable fields — seeded from row on first load and on realtime updates.
  // Snapshot of the values we loaded from the server (so we can diff on save
  // and flip `source` to 'user' only when the user actually overrode AI fields).
  const [brand, setBrand] = useState('');
  const [productName, setProductName] = useState('');
  const [format, setFormat] = useState('dry_kibble');
  const [ingredients, setIngredients] = useState('');
  const [barcode, setBarcode] = useState('');
  const baseline = useRef<Pick<FoodRow, 'brand' | 'product_name' | 'format' | 'ingredients_notes' | 'upc_barcode'> | null>(null);

  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [addingPhoto, setAddingPhoto] = useState(false);

  // ── Fetch + realtime subscription ──
  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('food_items')
        .select(SELECT_COLS)
        .eq('id', id)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setLoadError(error?.message ?? 'Food not found');
        return;
      }
      applyRow(data as FoodRow);
    })();

    // Realtime postgres_changes — fires when the Edge Function writes back
    // (pending → completed/failed) or when another device edits the row.
    // Filter by id so we only get this row's events.
    const channel = supabase
      .channel(`food_items:${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'food_items', filter: `id=eq.${id}` },
        (payload) => {
          const next = payload.new as FoodRow;
          if (!next) return;
          applyRow(next);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [id]);

  function applyRow(next: FoodRow) {
    setRow(next);
    // Only seed the form fields the first time, or when the server's value
    // changed while the user wasn't actively editing them. We always rebase
    // the baseline so the save-time diff stays accurate.
    baseline.current = {
      brand: next.brand,
      product_name: next.product_name,
      format: next.format,
      ingredients_notes: next.ingredients_notes,
      upc_barcode: next.upc_barcode,
    };
    // Brand/product seeded once; if the AI later corrects them while the
    // user hasn't typed, surface the new value. If they have typed, leave
    // their edit alone.
    setBrand((cur) => (cur === '' || cur === 'Extracting…' ? next.brand : cur));
    setProductName((cur) => (cur === '' || cur === 'Extracting…' ? next.product_name : cur));
    setFormat((cur) => (cur === 'dry_kibble' && next.format ? next.format : cur || next.format));
    setIngredients((cur) => (cur === '' ? (next.ingredients_notes ?? '') : cur));
    setBarcode((cur) => (cur === '' ? (next.upc_barcode ?? '') : cur));
  }

  // ── Save ──
  async function handleSave() {
    if (!row || !baseline.current) return;
    if (!brand.trim() || !productName.trim()) {
      Alert.alert('Brand and product name are required.');
      return;
    }
    const trimmedBarcode = barcode.trim() || null;
    const trimmedIngredients = ingredients.trim() || null;

    const base = baseline.current;
    const changed =
      brand.trim() !== base.brand ||
      productName.trim() !== base.product_name ||
      format !== base.format ||
      trimmedIngredients !== base.ingredients_notes ||
      trimmedBarcode !== base.upc_barcode;

    if (!changed) {
      router.back();
      return;
    }

    setSaving(true);
    // If the user overrode AI-extracted values, flip source to 'user' so
    // future analytics can tell ground truth from model output. Manual rows
    // stay 'user' either way; 'curated' is never auto-downgraded.
    const nextSource = row.source === 'ai_extracted' ? 'user' : row.source;
    const { error } = await supabase
      .from('food_items')
      .update({
        brand: brand.trim(),
        product_name: productName.trim(),
        format,
        ingredients_notes: trimmedIngredients,
        upc_barcode: trimmedBarcode,
        source: nextSource,
      })
      .eq('id', row.id);
    setSaving(false);

    if (error) {
      Alert.alert('Could not save', error.message);
      return;
    }

    // Keep the local picker cache in sync so the tile reflects the edit
    // without waiting for a fresh sync.
    try {
      const db = getDb();
      await db.runAsync(
        `UPDATE food_items_cache
           SET brand = ?, product_name = ?, format = ?
         WHERE id = ?`,
        [brand.trim(), productName.trim(), format, row.id],
      );
    } catch (err) {
      console.warn('[food-detail] cache update failed:', err);
    }

    router.back();
  }

  // ── Add photo (appends to photo_paths) ──
  async function handleAddPhoto() {
    if (!row) return;
    const source = await new Promise<'camera' | 'library' | null>((resolve) => {
      Alert.alert(
        'Add photo',
        undefined,
        [
          { text: 'Take photo', onPress: () => resolve('camera') },
          { text: 'Choose from library', onPress: () => resolve('library') },
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
        ],
        { cancelable: true, onDismiss: () => resolve(null) },
      );
    });
    if (!source) return;

    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Camera access needed', 'Allow camera access in Settings.');
        return;
      }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Photo access needed', 'Allow photo access in Settings.');
        return;
      }
    }

    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.9,
      exif: false,
    };
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts);

    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];

    setAddingPhoto(true);
    try {
      const nextIndex = row.photo_paths.length;
      const storagePath = `${row.id}/${nextIndex}-additional.jpg`;
      const compressedUri = await compressForUpload(asset.uri, asset.width, asset.height);
      await uploadPhoto('nyx-food-photos', storagePath, compressedUri);

      const nextPaths = [...row.photo_paths, storagePath];
      const { error } = await supabase
        .from('food_items')
        .update({ photo_paths: nextPaths })
        .eq('id', row.id);
      if (error) throw error;
      // Optimistic local update; realtime will also deliver this.
      setRow({ ...row, photo_paths: nextPaths });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('Could not add photo', msg);
    } finally {
      setAddingPhoto(false);
    }
  }

  // ── Re-run extraction ──
  async function handleRetry() {
    if (!row) return;
    if (row.photo_paths.length === 0) {
      Alert.alert('Add a photo first', 'The AI needs at least one photo to extract from.');
      return;
    }
    setRetrying(true);
    // Flip status locally so the UI moves out of the 'failed' state immediately —
    // the Edge Function will write the canonical status on completion via realtime.
    setRow({ ...row, ai_extraction_status: 'pending', ai_extraction_error: null });
    // Also write through to the DB so a backgrounded screen or another device
    // sees pending while extraction runs.
    await supabase
      .from('food_items')
      .update({ ai_extraction_status: 'pending', ai_extraction_error: null })
      .eq('id', row.id);

    const { error } = await supabase.functions.invoke('extract-food-from-photo', {
      body: { food_item_id: row.id, photo_paths: row.photo_paths },
    });
    setRetrying(false);
    if (error) {
      Alert.alert('Extraction failed to start', error.message);
    }
  }

  // ── Render ──
  if (loadError) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Food" onClose={() => router.back()} />
        <View style={styles.centerMessage}>
          <Text style={styles.errorText}>{loadError}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!row) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Food" onClose={() => router.back()} />
        <View style={styles.centerMessage}>
          <ActivityIndicator color={theme.colorAccent} />
        </View>
      </SafeAreaView>
    );
  }

  const isPending = row.ai_extraction_status === 'pending';
  const isFailed = row.ai_extraction_status === 'failed';
  const isCompleted = row.ai_extraction_status === 'completed';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header title="Food" onClose={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <PhotoCarousel
            photoPaths={row.photo_paths}
            onAddPhoto={addingPhoto ? undefined : handleAddPhoto}
          />
          {addingPhoto && (
            <View style={styles.photoUploadingRow}>
              <ActivityIndicator size="small" color={theme.colorAccent} />
              <Text style={styles.photoUploadingText}>Adding photo…</Text>
            </View>
          )}

          <View style={styles.body}>
            {isFailed && row.ai_extraction_error && (
              <View style={styles.failedBanner}>
                <Text style={styles.failedTitle}>Extraction failed</Text>
                <Text style={styles.failedDetail}>{row.ai_extraction_error}</Text>
                <TouchableOpacity
                  style={[styles.retryBtn, retrying && styles.retryBtnDisabled]}
                  onPress={handleRetry}
                  disabled={retrying}
                  hitSlop={8}
                  activeOpacity={0.8}
                >
                  {retrying
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.retryBtnText}>Try extraction again</Text>}
                </TouchableOpacity>
              </View>
            )}

            <SectionLabel label="Brand" />
            <TextInput
              style={styles.textInput}
              value={brand}
              onChangeText={setBrand}
              placeholder="e.g. Royal Canin"
              placeholderTextColor={theme.colorTextTertiary}
              autoCapitalize="words"
            />

            <SectionLabel label="Product name" />
            <TextInput
              style={styles.textInput}
              value={productName}
              onChangeText={setProductName}
              placeholder="e.g. Gastrointestinal Adult"
              placeholderTextColor={theme.colorTextTertiary}
              autoCapitalize="words"
            />

            <SectionLabel label="Format" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.formatRow}>
              {FOOD_FORMATS.map((f) => (
                <View key={f.value} style={{ marginRight: theme.space1 }}>
                  <FilterChip
                    label={f.label}
                    active={format === f.value}
                    onPress={() => setFormat(f.value)}
                    variant="filled"
                  />
                </View>
              ))}
            </ScrollView>

            <SectionLabel label="Ingredients" />
            {isPending ? (
              <View style={styles.pendingBox}>
                <ActivityIndicator size="small" color={theme.colorAccent} />
                <Text style={styles.pendingText}>Reading the label…</Text>
              </View>
            ) : (
              <TextInput
                style={[styles.textInput, styles.ingredientsInput]}
                value={ingredients}
                onChangeText={setIngredients}
                placeholder="Full ingredients list, in order as printed"
                placeholderTextColor={theme.colorTextTertiary}
                multiline
                textAlignVertical="top"
              />
            )}

            <SectionLabel label="UPC barcode" />
            <TextInput
              style={styles.textInput}
              value={barcode}
              onChangeText={setBarcode}
              placeholder="Tap to add"
              placeholderTextColor={theme.colorTextTertiary}
              keyboardType="numeric"
              autoCapitalize="none"
              autoCorrect={false}
            />

            {/* A "try again" affordance for completed extractions — useful when
                the AI got it wrong but the user wants to re-run rather than
                hand-edit everything. Hidden during pending to keep the UI calm. */}
            {isCompleted && (
              <TouchableOpacity
                style={styles.secondaryAction}
                onPress={handleRetry}
                disabled={retrying}
                hitSlop={8}
                activeOpacity={0.7}
              >
                {retrying
                  ? <ActivityIndicator size="small" color={theme.colorAccent} />
                  : <Text style={styles.secondaryActionText}>Re-run AI extraction</Text>}
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>

        <View style={styles.bottomAction}>
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.saveBtnText}>Save</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Header({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerSide} />
      <Text style={styles.headerTitle}>{title}</Text>
      <TouchableOpacity onPress={onClose} style={styles.headerSide} hitSlop={10}>
        <Text style={styles.headerClose}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorSurface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.space2,
    paddingVertical: theme.space2,
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
  },
  headerSide: {
    width: 44,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: theme.textLG,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
    textAlign: 'center',
  },
  headerClose: {
    fontSize: 20,
    color: theme.colorTextSecondary,
  },
  scroll: {
    paddingBottom: theme.space3,
  },
  body: {
    padding: theme.space3,
    gap: theme.space2,
  },
  centerMessage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.space3,
  },
  errorText: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    textAlign: 'center',
  },
  textInput: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    paddingHorizontal: theme.space2,
    minHeight: 48,
    paddingVertical: theme.space1,
  },
  ingredientsInput: {
    minHeight: 120,
    paddingTop: theme.space2,
  },
  formatRow: {
    marginBottom: theme.space1,
  },
  pendingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    padding: theme.space2,
    minHeight: 48,
  },
  pendingText: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  failedBanner: {
    backgroundColor: theme.colorEventSymptomLight,
    borderRadius: theme.radiusSmall,
    padding: theme.space2,
    gap: theme.space1,
  },
  failedTitle: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  failedDetail: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: 18,
  },
  retryBtn: {
    marginTop: theme.space1,
    backgroundColor: theme.colorNeutralDark,
    borderRadius: theme.radiusSmall,
    paddingVertical: theme.space1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  retryBtnDisabled: {
    opacity: 0.6,
  },
  retryBtnText: {
    fontSize: theme.textMD,
    color: '#fff',
    fontWeight: theme.weightMedium,
  },
  secondaryAction: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.space2,
    minHeight: 44,
  },
  secondaryActionText: {
    fontSize: theme.textMD,
    color: theme.colorAccent,
  },
  photoUploadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space1,
    paddingVertical: theme.space1,
    backgroundColor: theme.colorNeutralLight,
  },
  photoUploadingText: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  bottomAction: {
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
    padding: theme.space2,
  },
  saveBtn: {
    backgroundColor: theme.colorNeutralDark,
    borderRadius: theme.radiusMedium,
    paddingVertical: theme.space2,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: '#fff',
  },
});
