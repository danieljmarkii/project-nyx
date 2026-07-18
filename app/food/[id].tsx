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
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { theme } from '../../constants/theme';
import { WhorlSpinner } from '../../components/brand/WhorlSpinner';
import { Header } from '../../components/ui/Header';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { FilterChip } from '../../components/ui/FilterChip';
import { ChipGroup } from '../../components/ui/ChipGroup';
import { ProteinPicker } from '../../components/food/ProteinPicker';
import { PhotoCarousel } from '../../components/food/PhotoCarousel';
import { AlwaysAvailableCard } from '../../components/food/AlwaysAvailableCard';
import { supabase } from '../../lib/supabase';
import { uploadPhoto, compressForUpload } from '../../lib/storage';
import { getDb } from '../../lib/db';
import { archiveFood, restoreFood, type ArchiveResult } from '../../lib/foodArchive';
import { useSnackbarStore } from '../../store/snackbarStore';
import { useFoodLibraryStore } from '../../store/foodLibraryStore';

const FOOD_FORMATS = [
  { value: 'dry_kibble', label: 'Dry kibble' },
  { value: 'wet_canned', label: 'Wet / canned' },
  { value: 'raw', label: 'Raw' },
  { value: 'freeze_dried', label: 'Freeze-dried' },
  { value: 'jerky', label: 'Jerky' },
  { value: 'fresh_cooked', label: 'Fresh cooked' },
  // B-102: people-food given to a pet (deli meat, rotisserie chicken). This
  // screen is the re-classification surface for existing rows (requirements
  // D8), so the chip must live here too. After 'fresh_cooked' per migration 019.
  { value: 'human_food', label: 'Human food' },
  { value: 'topper', label: 'Topper' },
  { value: 'treat', label: 'Treat' },
  { value: 'other', label: 'Other' },
];

// B-011 usage classification. NULL preserved for legacy rows the user hasn't
// classified yet — this screen is the only manual-backfill entry point.
type FoodType = 'meal' | 'treat' | 'other';
const FOOD_TYPES: { value: FoodType; label: string }[] = [
  { value: 'meal',  label: 'Meal' },
  { value: 'treat', label: 'Treat' },
  { value: 'other', label: 'Other' },
];

type ExtractionStatus = 'pending' | 'completed' | 'failed' | 'manual';

interface FoodRow {
  id: string;
  brand: string;
  product_name: string;
  format: string;
  food_type: FoodType | null;
  ingredients_notes: string | null;
  upc_barcode: string | null;
  photo_paths: string[];
  primary_protein: string | null;
  ai_extraction_status: ExtractionStatus;
  ai_extraction_error: string | null;
  source: string;
}

const SELECT_COLS = 'id, brand, product_name, format, food_type, ingredients_notes, upc_barcode, photo_paths, primary_protein, ai_extraction_status, ai_extraction_error, source';

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
  const [foodType, setFoodType] = useState<FoodType | null>(null);
  const [ingredients, setIngredients] = useState('');
  const [barcode, setBarcode] = useState('');
  // B-332: primary_protein is now owner-editable here (was extraction-only).
  const [primaryProtein, setPrimaryProtein] = useState<string | null>(null);
  const baseline = useRef<Pick<FoodRow, 'brand' | 'product_name' | 'format' | 'food_type' | 'ingredients_notes' | 'upc_barcode' | 'primary_protein'> | null>(null);

  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [addingPhoto, setAddingPhoto] = useState(false);
  const [removing, setRemoving] = useState(false);

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
    // Capture the *previous* baseline before we mutate it — the field-seeding
    // logic below uses it to detect "user has not edited this field" (i.e.
    // form value still equals the last value we loaded from the server). If
    // it matches, we update from the server (so AI completion lands cleanly).
    // If it diverges, the user has typed — leave their edit alone.
    const prev = baseline.current;
    setRow(next);
    baseline.current = {
      brand: next.brand,
      product_name: next.product_name,
      format: next.format,
      food_type: next.food_type,
      ingredients_notes: next.ingredients_notes,
      upc_barcode: next.upc_barcode,
      primary_protein: next.primary_protein,
    };
    const nextIngredients = next.ingredients_notes ?? '';
    const nextBarcode = next.upc_barcode ?? '';
    setBrand((cur) => (!prev || cur === prev.brand) ? next.brand : cur);
    setProductName((cur) => (!prev || cur === prev.product_name) ? next.product_name : cur);
    setFormat((cur) => (!prev || cur === prev.format) ? next.format : cur);
    setFoodType((cur) => (!prev || cur === prev.food_type) ? next.food_type : cur);
    setIngredients((cur) => (!prev || cur === (prev.ingredients_notes ?? '')) ? nextIngredients : cur);
    setBarcode((cur) => (!prev || cur === (prev.upc_barcode ?? '')) ? nextBarcode : cur);
    // Reseed protein only when the owner hasn't diverged from the last loaded
    // value — so an AI completion landing via realtime shows the read protein,
    // but an in-progress owner edit is never stomped.
    setPrimaryProtein((cur) => (!prev || cur === prev.primary_protein) ? next.primary_protein : cur);
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
      foodType !== base.food_type ||
      trimmedIngredients !== base.ingredients_notes ||
      trimmedBarcode !== base.upc_barcode ||
      primaryProtein !== base.primary_protein;

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
        food_type: foodType,
        ingredients_notes: trimmedIngredients,
        upc_barcode: trimmedBarcode,
        primary_protein: primaryProtein,
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
           SET brand = ?, product_name = ?, format = ?, food_type = ?, primary_protein = ?
         WHERE id = ?`,
        [brand.trim(), productName.trim(), format, foodType, primaryProtein, row.id],
      );
    } catch (err) {
      console.warn('[food-detail] cache update failed:', err);
    }

    router.back();
  }

  // ── Add photo ─────────────────────────────────────────────────────────────
  // Two-step prompt: which slot, then where the photo comes from. Replacing
  // a slot overwrites the existing storage object at the canonical path; new
  // photos beyond the three canonical slots append as "additional". The
  // storage path's slot suffix is how we later identify which photo is what
  // (the array itself is positional but can be sparse when ingredients was
  // skipped at capture).
  type AddSlot = 'front' | 'ingredients' | 'barcode' | 'additional';
  async function handleAddPhoto() {
    if (!row) return;
    const slot = await new Promise<AddSlot | null>((resolve) => {
      Alert.alert(
        'Which photo?',
        'Replace or add a specific shot of the package.',
        [
          { text: 'Front of package', onPress: () => resolve('front') },
          { text: 'Ingredients label', onPress: () => resolve('ingredients') },
          { text: 'Barcode',           onPress: () => resolve('barcode') },
          { text: 'Other',             onPress: () => resolve('additional') },
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
        ],
        { cancelable: true, onDismiss: () => resolve(null) },
      );
    });
    if (!slot) return;

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
      // Build the storage path. Canonical slots reuse a stable name so the
      // bucket doesn't accumulate dupes when the user replaces a shot;
      // additional slots get a unique index.
      const storagePath = slot === 'additional'
        ? `${row.id}/${row.photo_paths.length}-additional.jpg`
        : `${row.id}/${slot === 'front' ? 0 : slot === 'ingredients' ? 1 : 2}-${slot}.jpg`;

      const compressedUri = await compressForUpload(asset.uri, asset.width, asset.height);
      await uploadPhoto('nyx-food-photos', storagePath, compressedUri);

      // Replace the existing path for this slot if one already exists; else
      // append. Match by suffix because the canonical names include the slot.
      const suffix = slot === 'additional' ? null : `-${slot}.jpg`;
      const existingIdx = suffix
        ? row.photo_paths.findIndex((p) => p.endsWith(suffix))
        : -1;
      const nextPaths = [...row.photo_paths];
      if (existingIdx >= 0) {
        nextPaths[existingIdx] = storagePath;
      } else {
        nextPaths.push(storagePath);
      }

      const { error } = await supabase
        .from('food_items')
        .update({ photo_paths: nextPaths })
        .eq('id', row.id);
      if (error) throw error;
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

  // ── Remove from library (archive) ─────────────────────────────────────────
  // B-005 PR 2: replaces the old destructive delete cascade. "Remove from
  // library" now ARCHIVES the food — a reversible flag flip (archiveFood) that
  // hides it from the picker/library while leaving every logged meal, diet trial,
  // and the vet report untouched (the load-bearing invariant: archive filters
  // picker/library reads only). Erasing a specific meal's history stays a
  // per-event Timeline action, as before.
  //
  // No confirmation dialog: the undo snackbar is the safety net (the Linear/Gmail
  // undo-over-confirm pattern), and nothing is destroyed, so a modal asking
  // "are you sure?" for a reversible tidy-up would be friction, not safety.
  async function handleArchive() {
    if (!row || removing) return;
    setRemoving(true);
    try {
      const result = await archiveFood({
        id: row.id,
        brand: row.brand,
        product_name: row.product_name,
        format: row.format,
      });
      // Refresh the (mounted-but-unfocused) Foods tab / picker so the tile drops
      // out, then dismiss this modal and arm Undo over the surface underneath.
      useFoodLibraryStore.getState().notifyChanged();
      const foodName = row.product_name.trim() || row.brand.trim() || 'this food';
      armUndo(result, foodName);
      router.back();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('Could not remove food', msg);
      setRemoving(false);
    }
  }

  // Arm the undo snackbar. Factored out so an Undo that fails (network) can
  // re-arm itself, keeping the reversal retryable rather than stranding the food
  // as silently archived. Reads the stores via getState so the closure stays
  // valid after this modal unmounts (router.back). delayMs lets the dismissing
  // modal clear before the root overlay reveals (the momentStore pattern).
  function armUndo(result: ArchiveResult, foodName: string) {
    useSnackbarStore.getState().show(
      {
        // Reassure at the moment of removal that this is NOT the old destructive
        // delete — the pet's logged meals + reports survive (B-005 invariant). The
        // owner's live anxiety ("did I just erase weeks of diet-trial history?")
        // is answered here, not only in the Archived-section hint they'd have to
        // go find (pm-feature-review, B-005 PR 3).
        message: `Removed ${foodName} — your logged meals stay in your history`,
        actionLabel: 'Undo',
        onAction: async () => {
          try {
            await restoreFood(result);
            useFoodLibraryStore.getState().notifyChanged();
          } catch (err) {
            console.warn('[food-detail] restore failed:', err);
            Alert.alert('Could not undo', 'Something went wrong. Try again in a moment.');
            armUndo(result, foodName);
          }
        },
      },
      { delayMs: 300 },
    );
  }

  // ── Render ──
  if (loadError) {
    return (
      <SafeAreaView style={styles.container}>
        <Header leading="back" title="Food" onLeadingPress={() => router.back()} />
        <View style={styles.centerMessage}>
          <Text style={styles.errorText}>{loadError}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!row) {
    return (
      <SafeAreaView style={styles.container}>
        <Header leading="back" title="Food" onLeadingPress={() => router.back()} />
        <View style={styles.centerMessage}>
          <WhorlSpinner size="md" ground="day" />
        </View>
      </SafeAreaView>
    );
  }

  const isPending = row.ai_extraction_status === 'pending';
  const isFailed = row.ai_extraction_status === 'failed';
  const isCompleted = row.ai_extraction_status === 'completed';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header leading="back" title="Food" onLeadingPress={() => router.back()} />
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
              <WhorlSpinner size="sm" ground="day" />
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
                    ? <WhorlSpinner size="sm" tint="#fff" />
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
            <ChipGroup
              options={FOOD_FORMATS}
              value={format}
              // allowDeselect={false} guarantees a non-null value at runtime; the guard
              // also narrows ChipGroup's (string | null) onChange to the string this setter wants.
              onChange={(v) => { if (v !== null) setFormat(v); }}
              allowDeselect={false}
              accessibilityLabel="Format"
              style={styles.formatRow}
            />

            <SectionLabel label="Primary protein" />
            <ProteinPicker
              value={primaryProtein}
              onChange={setPrimaryProtein}
              accessibilityLabel="Primary protein"
            />

            <SectionLabel label="Type" />
            <View style={styles.foodTypeRow}>
              {FOOD_TYPES.map((t) => (
                <FilterChip
                  key={t.value}
                  label={t.label}
                  active={foodType === t.value}
                  onPress={() => setFoodType(t.value)}
                  variant="filled"
                />
              ))}
            </View>

            <SectionLabel label="Ingredients" />
            {isPending ? (
              <View style={styles.pendingBox}>
                <WhorlSpinner size="sm" ground="day" />
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

            {/* B-040 R1 + multi-pet §3.4 — "Always available" standing fact.
                Set-once, lives in the food domain (never the pet page). Renders
                one toggle row per active pet in multi-pet households; the
                single toggle otherwise. */}
            <AlwaysAvailableCard foodItemId={row.id} />

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
                  ? <WhorlSpinner size="sm" ground="day" />
                  : <Text style={styles.secondaryActionText}>Re-run AI extraction</Text>}
              </TouchableOpacity>
            )}

            {/* B-005 PR 2 — "Remove from library" ARCHIVES (reversible); it no
                longer erases meal history. Styled calm, not alarm-red: the action
                is undoable and destroys nothing. */}
            <TouchableOpacity
              style={styles.removeAction}
              onPress={handleArchive}
              disabled={removing}
              hitSlop={8}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Remove this food from your library"
            >
              {removing
                ? <WhorlSpinner size="sm" ground="day" />
                : <Text style={styles.removeActionText}>Remove from library</Text>}
            </TouchableOpacity>
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
              ? <WhorlSpinner size="sm" tint="#fff" />
              : <Text style={styles.saveBtnText}>Save</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorSurface,
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
  foodTypeRow: {
    flexDirection: 'row',
    gap: theme.space1,
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
  removeAction: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.space2,
    marginTop: theme.space1,
    minHeight: 44,
  },
  removeActionText: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
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
