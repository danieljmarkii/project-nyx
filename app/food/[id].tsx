// Food detail screen. Step 6 of the food-library-redesign track.
// Editable view of a single food_items row. Reaches Supabase directly (not
// the food_items_cache) because we need the richer columns —
// ingredients_notes, primary_protein, photo_paths — that the cache doesn't
// carry.
//
// Realtime: subscribes to postgres_changes on the food_items row so the
// pending → completed transition lands without a manual refresh.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Switch,
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
import {
  startFreeChoice, endFreeChoice, getActiveArrangementMeta, confirmArrangementFresh,
  confirmedLabel, ActiveArrangementMeta,
} from '../../lib/feedingArrangements';
import { useEventStore } from '../../store/eventStore';
import { usePetStore } from '../../store/petStore';

const FOOD_FORMATS = [
  { value: 'dry_kibble', label: 'Dry kibble' },
  { value: 'wet_canned', label: 'Wet / canned' },
  { value: 'raw', label: 'Raw' },
  { value: 'freeze_dried', label: 'Freeze-dried' },
  { value: 'jerky', label: 'Jerky' },
  { value: 'fresh_cooked', label: 'Fresh cooked' },
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
  const baseline = useRef<Pick<FoodRow, 'brand' | 'product_name' | 'format' | 'food_type' | 'ingredients_notes' | 'upc_barcode'> | null>(null);

  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [addingPhoto, setAddingPhoto] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const removeFromToday = useEventStore((s) => s.removeFromToday);
  const activePet = usePetStore((s) => s.activePet);

  // B-040 R1 — "Always available" (free-choice) standing fact for the active pet.
  // Read from local SQLite; toggling writes locally + queues a sync push. Optimistic
  // with revert-on-failure so the switch never lies about a write that didn't land.
  const [freeChoice, setFreeChoice] = useState(false);
  const [freeChoiceSaving, setFreeChoiceSaving] = useState(false);
  // The active arrangement's meta (null = not free-fed). updated_at backs the
  // §6a passive "last confirmed" freshness line.
  const [arrangementMeta, setArrangementMeta] = useState<ActiveArrangementMeta | null>(null);
  const [confirming, setConfirming] = useState(false);

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

  // Load the current free-choice state + freshness meta for this (pet, food).
  // Re-runs if the active pet changes. Local read — hydration fills the row on a
  // fresh device.
  const reloadArrangement = useCallback(async () => {
    if (!id || !activePet) return;
    const meta = await getActiveArrangementMeta(activePet.id, id);
    setArrangementMeta(meta);
    setFreeChoice(!!meta);
  }, [id, activePet?.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!cancelled) await reloadArrangement();
      } catch (err) {
        console.warn('[food-detail] free-choice load failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [reloadArrangement]);

  async function handleToggleFreeChoice(next: boolean) {
    if (!activePet || !id) return;
    setFreeChoice(next); // optimistic
    setFreeChoiceSaving(true);
    try {
      if (next) await startFreeChoice(activePet.id, id);
      else await endFreeChoice(activePet.id, id);
      // Re-read so the freshness line reflects the new arrangement (or clears).
      await reloadArrangement();
    } catch (err) {
      setFreeChoice(!next); // revert — the write didn't land
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert("Couldn't update", msg);
    } finally {
      setFreeChoiceSaving(false);
    }
  }

  // §6a passive freshness — one-tap re-confirm that the bowl is still down. Never
  // a push; shown only here (and in the library), only when the owner is already
  // looking. Bumps updated_at so the line reads "Last confirmed today".
  async function handleConfirmFresh() {
    if (!activePet || !id) return;
    setConfirming(true);
    try {
      await confirmArrangementFresh(activePet.id, id);
      await reloadArrangement();
    } catch (err) {
      console.warn('[food-detail] freshness confirm failed:', err);
    } finally {
      setConfirming(false);
    }
  }

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
    };
    const nextIngredients = next.ingredients_notes ?? '';
    const nextBarcode = next.upc_barcode ?? '';
    setBrand((cur) => (!prev || cur === prev.brand) ? next.brand : cur);
    setProductName((cur) => (!prev || cur === prev.product_name) ? next.product_name : cur);
    setFormat((cur) => (!prev || cur === prev.format) ? next.format : cur);
    setFoodType((cur) => (!prev || cur === prev.food_type) ? next.food_type : cur);
    setIngredients((cur) => (!prev || cur === (prev.ingredients_notes ?? '')) ? nextIngredients : cur);
    setBarcode((cur) => (!prev || cur === (prev.upc_barcode ?? '')) ? nextBarcode : cur);
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
        food_type: foodType,
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
           SET brand = ?, product_name = ?, format = ?, food_type = ?
         WHERE id = ?`,
        [brand.trim(), productName.trim(), format, foodType, row.id],
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

  // ── Delete food + all logged meals of it ──────────────────────────────────
  // PM call (May 2026): deleting a food from the library also kills every
  // meal log that referenced it. Engineering anti-pattern says "never DELETE
  // events" — so we hard-delete food_items + meals (no soft-delete column on
  // either) and soft-delete the parent events (set deleted_at). The net
  // owner-visible effect is "the food and its history are gone."
  function handleDelete() {
    if (!row) return;
    Alert.alert(
      'Delete this food?',
      'This will also remove every meal you\'ve logged for it. This can\'t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => runDelete() },
      ],
    );
  }

  async function runDelete() {
    if (!row) return;
    setDeleting(true);
    try {
      const nowIso = new Date().toISOString();

      // 1. Collect every food_items row with the same brand+product+format.
      //    Captures of the same package via food-capture produce distinct
      //    rows (fresh uuid per capture); the library tile collapses them
      //    via GROUP BY in getLibraryFoods, so deleting by the current row's
      //    id alone would leave the duplicates visible.
      const { data: dupFoods, error: dupErr } = await supabase
        .from('food_items')
        .select('id')
        .eq('brand', row.brand)
        .eq('product_name', row.product_name)
        .eq('format', row.format);
      if (dupErr) throw dupErr;
      const allFoodIds = Array.from(
        new Set([row.id, ...(dupFoods ?? []).map((f) => f.id as string)]),
      );

      // 2. Collect event_ids of meals referencing any of those foods.
      const { data: remoteMeals, error: mealQueryErr } = await supabase
        .from('meals')
        .select('event_id')
        .in('food_item_id', allFoodIds);
      if (mealQueryErr) throw mealQueryErr;
      const remoteEventIds = (remoteMeals ?? []).map((m) => m.event_id as string);

      const db = getDb();
      const foodPlaceholders = allFoodIds.map(() => '?').join(',');
      const localMeals = await db.getAllAsync<{ event_id: string }>(
        `SELECT event_id FROM meals WHERE food_item_id IN (${foodPlaceholders})`,
        allFoodIds,
      );
      const localEventIds = localMeals.map((m) => m.event_id);
      const allEventIds = Array.from(new Set([...remoteEventIds, ...localEventIds]));

      // 3. Soft-delete the parent events (remote + local). Anti-pattern says
      //    never DELETE events, so we soft-delete.
      if (allEventIds.length > 0) {
        const { error: remoteSoftErr } = await supabase
          .from('events')
          .update({ deleted_at: nowIso })
          .in('id', allEventIds);
        if (remoteSoftErr) throw remoteSoftErr;

        const eventPlaceholders = allEventIds.map(() => '?').join(',');
        await db.runAsync(
          `UPDATE events SET deleted_at = ?, updated_at = ?, synced = 0
             WHERE id IN (${eventPlaceholders})`,
          [nowIso, nowIso, ...allEventIds],
        );
      }

      // 4. Hard-delete meals (no soft-delete column on meals).
      const { error: mealsDelErr } = await supabase
        .from('meals')
        .delete()
        .in('food_item_id', allFoodIds);
      if (mealsDelErr) throw mealsDelErr;
      await db.runAsync(
        `DELETE FROM meals WHERE food_item_id IN (${foodPlaceholders})`,
        allFoodIds,
      );

      // 5. Hard-delete every matching food_items row. Use .select() so we
      //    detect a silent RLS block (supabase-js returns success with 0
      //    rows affected when the DELETE policy is missing).
      const { data: deletedFoods, error: foodDelErr } = await supabase
        .from('food_items')
        .delete()
        .in('id', allFoodIds)
        .select('id');
      if (foodDelErr) throw foodDelErr;
      if (!deletedFoods || deletedFoods.length === 0) {
        throw new Error(
          'Server rejected the delete (permission denied). Make sure migration 009_food_items_delete_policy.sql has been applied in the Supabase SQL Editor.',
        );
      }

      // 6. Sweep the local cache by brand+product+format too, so duplicates
      //    with the same descriptive fields but different ids are removed
      //    even if they hadn't synced to the server yet.
      await db.runAsync(
        `DELETE FROM food_items_cache
           WHERE LOWER(brand) = LOWER(?)
             AND LOWER(product_name) = LOWER(?)
             AND format = ?`,
        [row.brand, row.product_name, row.format],
      );

      // 7. Drop any of the affected events from the in-memory event store
      //    so Home / Timeline update without a remount.
      allEventIds.forEach((id) => removeFromToday(id));

      router.back();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('Could not delete food', msg);
      setDeleting(false);
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

            {/* B-040 R1 — "Always available" standing fact. Set-once, lives in the
                food domain (never the pet page). A free-fed food means intake is
                NOT directly observed; the vet report carries that caveat (§2/§6). */}
            {activePet && (
              <View style={styles.freeChoiceCard}>
                <View style={styles.freeChoiceRow}>
                  <View style={styles.freeChoiceText}>
                    <Text style={styles.freeChoiceLabel}>
                      Always available for {activePet.name}?
                    </Text>
                    <Text style={styles.freeChoiceHelper}>
                      {activePet.name} can graze this throughout the day — we'll note it
                      as free-choice on the vet report.
                    </Text>
                  </View>
                  <Switch
                    value={freeChoice}
                    onValueChange={handleToggleFreeChoice}
                    disabled={freeChoiceSaving}
                    trackColor={{ true: theme.colorAccent, false: theme.colorBorderStrong }}
                    ios_backgroundColor={theme.colorBorderStrong}
                  />
                </View>

                {/* §6a passive freshness — last-confirmed + one-tap re-confirm.
                    Shown only while free-fed; updated_at backs "last confirmed". */}
                {freeChoice && arrangementMeta && (
                  <View style={styles.freshnessRow}>
                    <Text style={styles.freshnessText}>
                      Last confirmed {confirmedLabel(arrangementMeta.updated_at)}
                    </Text>
                    <TouchableOpacity
                      onPress={handleConfirmFresh}
                      disabled={confirming}
                      hitSlop={12}
                      activeOpacity={0.7}
                      style={styles.freshnessActionBtn}
                    >
                      <Text style={styles.freshnessAction}>
                        {confirming ? 'Confirming…' : 'Still accurate?'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

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

            <TouchableOpacity
              style={styles.deleteAction}
              onPress={handleDelete}
              disabled={deleting}
              hitSlop={8}
              activeOpacity={0.7}
            >
              {deleting
                ? <ActivityIndicator size="small" color={theme.colorEventSymptom} />
                : <Text style={styles.deleteActionText}>Delete this food</Text>}
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
  freeChoiceCard: {
    backgroundColor: theme.colorNeutralLight,
    borderRadius: theme.radiusMedium,
    padding: theme.space2,
    marginTop: theme.space1,
  },
  freeChoiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
  },
  freeChoiceText: {
    flex: 1,
    gap: 4,
  },
  freeChoiceLabel: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  freeChoiceHelper: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: 18,
  },
  freshnessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.space2,
    paddingTop: theme.space1,
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
    minHeight: 32,
  },
  freshnessText: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },
  freshnessActionBtn: {
    paddingVertical: theme.space1,
    justifyContent: 'center',
  },
  freshnessAction: {
    fontSize: theme.textSM,
    color: theme.colorAccent,
  },
  deleteAction: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.space2,
    marginTop: theme.space1,
    minHeight: 44,
  },
  deleteActionText: {
    fontSize: theme.textMD,
    color: theme.colorEventSymptom,
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
