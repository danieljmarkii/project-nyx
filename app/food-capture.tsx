// Food capture + AI-confirm flow. Replaces the legacy text-form food add.
// Hero path: front-of-package snap → optional ingredients + barcode →
// upload + Edge Function extract → confirm brand/product → meal logged.
//
// Constraints:
// - Client-side compression only (compressForUpload in lib/storage.ts).
// - Never block meal logging on extraction — Edge Function runs async and
//   the food_items row flips status in the background.
// - Bucket is private; reads via getSignedUrl.
import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  Animated, Image, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { theme } from '../constants/theme';
import { SectionLabel } from '../components/ui/SectionLabel';
import { FilterChip } from '../components/ui/FilterChip';
import { usePetStore } from '../store/petStore';
import { useAuthStore } from '../store/authStore';
import { useEventStore } from '../store/eventStore';
import { getDb } from '../lib/db';
import { supabase } from '../lib/supabase';
import { syncPendingEvents, syncPendingMeals } from '../lib/sync';
import { uploadPhoto, compressForUpload } from '../lib/storage';
import { uuid, exifDateToISO } from '../lib/utils';

type CaptureStep =
  | 'intro'
  | 'after-front'
  | 'after-ingredients'
  | 'uploading'
  | 'confirm'
  | 'edit'
  | 'complete';

interface CapturedPhoto {
  localUri: string;
  storagePath: string;
  width?: number;
  height?: number;
  exifIso?: string | null;
}

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

// Map AI 'format' enum to the cache's format key (Edge Function emits the
// canonical pet-nutrition enum; cache uses the picker-friendly variant).
function mapAiFormat(ai: string | null | undefined): string {
  switch (ai) {
    case 'dry':          return 'dry_kibble';
    case 'wet':          return 'wet_canned';
    case 'raw':          return 'raw';
    case 'freeze_dried': return 'freeze_dried';
    case 'treats':       return 'treat';
    case 'supplement':   return 'topper';
    default:             return 'other';
  }
}

export default function FoodCaptureScreen() {
  const { activePet } = usePetStore();
  const { user } = useAuthStore();
  const { prependEvent } = useEventStore();
  const { fromLog } = useLocalSearchParams<{ fromLog?: string }>();
  const cameFromMealLog = fromLog === '1';

  const [step, setStep] = useState<CaptureStep>('intro');
  const [foodId] = useState<string>(() => uuid());

  const [frontPhoto, setFrontPhoto] = useState<CapturedPhoto | null>(null);
  const [ingredientsPhoto, setIngredientsPhoto] = useState<CapturedPhoto | null>(null);
  const [barcodePhoto, setBarcodePhoto] = useState<CapturedPhoto | null>(null);

  // Extraction state — populated after Edge Function returns.
  const [extracting, setExtracting] = useState(false);
  const [extractedBrand, setExtractedBrand] = useState<string>('');
  const [extractedProduct, setExtractedProduct] = useState<string>('');
  const [extractedFormat, setExtractedFormat] = useState<string>('dry_kibble');
  const [extractionFailed, setExtractionFailed] = useState(false);

  const checkScale = useRef(new Animated.Value(0.5)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (step !== 'complete') return;
    Animated.parallel([
      Animated.spring(checkScale, { toValue: 1, useNativeDriver: true, tension: 60, friction: 7 }),
      Animated.timing(checkOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();
    const t = setTimeout(() => router.replace('/(tabs)'), 900);
    return () => clearTimeout(t);
  }, [step]);

  async function launchCamera(slot: 'front' | 'ingredients' | 'barcode'): Promise<CapturedPhoto | null> {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Camera access needed',
        'Allow camera access in Settings, or add this food manually.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Enter manually', onPress: () => setStep('edit') },
        ],
      );
      return null;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.9,
      exif: true,
    });
    if (result.canceled || !result.assets[0]) return null;
    const asset = result.assets[0];

    const exifRaw = asset.exif as Record<string, unknown> | undefined;
    const dateRaw = exifRaw?.DateTimeOriginal ?? exifRaw?.DateTime;
    const exifIso = typeof dateRaw === 'string' ? exifDateToISO(dateRaw) : null;

    const slotIndex = slot === 'front' ? 0 : slot === 'ingredients' ? 1 : 2;
    return {
      localUri: asset.uri,
      storagePath: `${foodId}/${slotIndex}-${slot}.jpg`,
      width: asset.width,
      height: asset.height,
      exifIso,
    };
  }

  async function handleSnapFront() {
    const photo = await launchCamera('front');
    if (!photo) return;
    setFrontPhoto(photo);
    setStep('after-front');
  }

  async function handleSnapIngredients() {
    const photo = await launchCamera('ingredients');
    if (!photo) return;
    setIngredientsPhoto(photo);
    setStep('after-ingredients');
  }

  async function handleSnapBarcode() {
    const photo = await launchCamera('barcode');
    if (!photo) return;
    setBarcodePhoto(photo);
    await runUploadAndExtract(frontPhoto!, ingredientsPhoto, photo);
  }

  async function handleSkipToConfirm(opts: { skipIngredients?: boolean; skipBarcode?: boolean } = {}) {
    await runUploadAndExtract(
      frontPhoto!,
      opts.skipIngredients ? null : ingredientsPhoto,
      opts.skipBarcode ? null : barcodePhoto,
    );
  }

  // Upload all captured photos and kick off async extraction. The food_items
  // row is inserted with status='pending' before extraction is invoked so the
  // realtime subscription (Step 6) has something to watch even on slow Claude.
  async function runUploadAndExtract(
    front: CapturedPhoto,
    ingredients: CapturedPhoto | null,
    barcode: CapturedPhoto | null,
  ) {
    setStep('uploading');
    setExtracting(true);
    setExtractionFailed(false);

    const photos = [front, ingredients, barcode].filter((p): p is CapturedPhoto => p !== null);
    const storagePaths = photos.map((p) => p.storagePath);

    try {
      // Compress + upload all photos in parallel
      await Promise.all(photos.map(async (p) => {
        const compressedUri = await compressForUpload(p.localUri, p.width, p.height);
        await uploadPhoto('nyx-food-photos', p.storagePath, compressedUri);
      }));

      // Insert pending food_items row. The brand/product_name/format columns
      // are NOT NULL on the table, so we seed placeholders that the Edge
      // Function overwrites on extraction success. created_by_user_id is
      // required by the RLS insert policy.
      const { error: insertError } = await supabase.from('food_items').insert({
        id: foodId,
        brand: 'Extracting…',
        product_name: 'Extracting…',
        format: 'other',
        created_by_user_id: user?.id ?? null,
        photo_paths: storagePaths,
        ai_extraction_status: 'pending',
        source: 'ai_extracted',
      });
      if (insertError) {
        // If the row already exists (retry path), continue — extraction can still run.
        console.warn('[food-capture] food_items insert:', insertError.message);
      }

      // Invoke extraction. We await it for the confirm screen, but don't block
      // the meal log on it — if it errors, we fall through to manual edit.
      const { data, error } = await supabase.functions.invoke('extract-food-from-photo', {
        body: { food_item_id: foodId, photo_paths: storagePaths },
      });

      if (error || !data?.extraction) {
        console.warn('[food-capture] extraction failed:', error?.message);
        setExtractionFailed(true);
        setStep('edit');
        return;
      }

      const ex = data.extraction;
      setExtractedBrand(ex.brand ?? '');
      setExtractedProduct(ex.product_name ?? '');
      setExtractedFormat(mapAiFormat(ex.format));
      setStep('confirm');
    } catch (err) {
      console.error('[food-capture] upload/extract error:', err);
      setExtractionFailed(true);
      setStep('edit');
    } finally {
      setExtracting(false);
    }
  }

  // Write the food into the local cache and (if from the meal-log flow) log
  // the meal immediately. EXIF from the front-of-package photo seeds the
  // meal's occurred_at — falls back to new Date() per the existing pattern.
  async function commitFood(brand: string, product: string, format: string) {
    if (!brand.trim() || !product.trim()) return;
    const db = getDb();
    const now = new Date().toISOString();
    const frontStoragePath = frontPhoto?.storagePath ?? null;
    await db.runAsync(
      `INSERT OR REPLACE INTO food_items_cache
         (id, brand, product_name, format, photo_path, cached_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [foodId, brand.trim(), product.trim(), format, frontStoragePath, now],
    );

    // If extraction didn't run (manual path), the row may not exist remotely
    // yet — upsert with the user-confirmed values. If it does exist (AI path),
    // the Edge Function already wrote richer fields; we only patch when user
    // edited via the "Edit" screen.
    supabase.from('food_items').upsert({
      id: foodId,
      brand: brand.trim(),
      product_name: product.trim(),
      format,
      created_by_user_id: user?.id ?? null,
      photo_paths: frontPhoto ? [frontPhoto.storagePath, ingredientsPhoto?.storagePath, barcodePhoto?.storagePath].filter(Boolean) : [],
      ai_extraction_status: frontPhoto ? (extractionFailed ? 'failed' : 'completed') : 'manual',
      source: frontPhoto && !extractionFailed ? 'ai_extracted' : 'user',
    }, { onConflict: 'id' }).then(({ error }) => {
      if (error) console.warn('[food-capture] upsert failed:', error.message);
    });

    if (cameFromMealLog && activePet) {
      const eventId = uuid();
      const occurredAt = frontPhoto?.exifIso ?? new Date().toISOString();
      await db.runAsync(
        `INSERT INTO events
           (id, pet_id, event_type, occurred_at, severity, notes, source, created_at, updated_at, synced)
         VALUES (?, ?, 'meal', ?, NULL, NULL, 'manual', ?, ?, 0)`,
        [eventId, activePet.id, occurredAt, now, now],
      );
      const mealId = uuid();
      await db.runAsync(
        `INSERT INTO meals (id, event_id, pet_id, food_item_id, quantity, created_at, synced)
         VALUES (?, ?, ?, ?, 'unknown', ?, 0)`,
        [mealId, eventId, activePet.id, foodId, now],
      );
      await db.runAsync(
        `UPDATE food_items_cache SET last_used_at = ? WHERE id = ?`,
        [now, foodId],
      );
      prependEvent({
        id: eventId,
        pet_id: activePet.id,
        event_type: 'meal',
        occurred_at: occurredAt,
        severity: null,
        notes: null,
        source: 'manual',
        deleted_at: null,
        created_at: now,
        updated_at: now,
        food_item_id: foodId,
        food_brand: brand.trim(),
        food_product_name: product.trim(),
        quantity: 'unknown',
      });
      syncPendingEvents().then(() => syncPendingMeals()).catch(console.error);
    }

    setStep('complete');
  }

  function handleManualEntry() {
    setExtractedBrand('');
    setExtractedProduct('');
    setExtractedFormat('dry_kibble');
    setStep('edit');
  }

  // ── Completion ──
  if (step === 'complete') {
    return (
      <View style={styles.completeContainer}>
        <Animated.View style={[styles.checkCircle, { transform: [{ scale: checkScale }], opacity: checkOpacity }]}>
          <Text style={styles.checkMark}>✓</Text>
        </Animated.View>
        <Animated.Text style={[styles.loggedText, { opacity: checkOpacity }]}>
          {cameFromMealLog ? 'Logged' : 'Added'}
        </Animated.Text>
      </View>
    );
  }

  // ── Intro ──
  if (step === 'intro') {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Add a food" onClose={() => router.back()} />
        <ScrollView contentContainerStyle={styles.introScroll}>
          <Text style={styles.introHeading}>Snap the front of the package</Text>
          <Text style={styles.introBody}>
            One photo is enough to start. The label and barcode are optional
            but make the entry more useful later.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleSnapFront} activeOpacity={0.85}>
            <Text style={styles.primaryBtnIcon}>📷</Text>
            <Text style={styles.primaryBtnText}>Open camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkBtn} onPress={handleManualEntry} hitSlop={8}>
            <Text style={styles.linkBtnText}>Enter manually</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── After front: encourage ingredients ──
  if (step === 'after-front') {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Add a food" onBack={() => setStep('intro')} />
        <ScrollView contentContainerStyle={styles.introScroll}>
          <PhotoChecklist
            front={frontPhoto}
            ingredients={ingredientsPhoto}
            barcode={barcodePhoto}
          />
          <Text style={styles.introHeading}>Snap the ingredients label</Text>
          <Text style={styles.introBody}>
            Optional, but lets us extract the full ingredients list. You can
            skip and add it later.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleSnapIngredients} activeOpacity={0.85}>
            <Text style={styles.primaryBtnIcon}>📷</Text>
            <Text style={styles.primaryBtnText}>Snap ingredients</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => setStep('after-ingredients')}
            hitSlop={8}
            activeOpacity={0.7}
          >
            <Text style={styles.secondaryBtnText}>Skip</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── After ingredients: encourage barcode ──
  if (step === 'after-ingredients') {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Add a food" onBack={() => setStep('after-front')} />
        <ScrollView contentContainerStyle={styles.introScroll}>
          <PhotoChecklist
            front={frontPhoto}
            ingredients={ingredientsPhoto}
            barcode={barcodePhoto}
          />
          <Text style={styles.introHeading}>Snap the barcode</Text>
          <Text style={styles.introBody}>
            Center the barcode in frame. Optional — helps the AI confirm the
            exact product later.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleSnapBarcode} activeOpacity={0.85}>
            <Text style={styles.primaryBtnIcon}>📷</Text>
            <Text style={styles.primaryBtnText}>Snap barcode</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => handleSkipToConfirm()}
            hitSlop={8}
            activeOpacity={0.7}
          >
            <Text style={styles.secondaryBtnText}>Skip and confirm</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Uploading + extracting ──
  if (step === 'uploading') {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Add a food" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colorAccent} />
          <Text style={styles.loadingText}>
            {extracting ? 'Reading the label…' : 'Uploading…'}
          </Text>
          <Text style={styles.loadingHint}>This usually takes a few seconds.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Confirm extracted brand + product ──
  if (step === 'confirm') {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Confirm" />
        <ScrollView contentContainerStyle={styles.confirmScroll}>
          {frontPhoto && (
            <View style={styles.confirmHero}>
              <Image source={{ uri: frontPhoto.localUri }} style={styles.confirmPhoto} resizeMode="cover" />
              <View style={styles.confirmOverlay}>
                <Text style={styles.confirmBrand} numberOfLines={1}>{extractedBrand}</Text>
                <Text style={styles.confirmProduct} numberOfLines={2}>{extractedProduct}</Text>
              </View>
            </View>
          )}
          <Text style={styles.confirmCaption}>Is this right?</Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => commitFood(extractedBrand, extractedProduct, extractedFormat)}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryBtnText}>Looks right</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => setStep('edit')}
            hitSlop={8}
            activeOpacity={0.7}
          >
            <Text style={styles.secondaryBtnText}>Edit</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Edit / manual entry ──
  if (step === 'edit') {
    const canSave = extractedBrand.trim().length > 0 && extractedProduct.trim().length > 0;
    return (
      <SafeAreaView style={styles.container}>
        <Header
          title="Edit food"
          onBack={frontPhoto ? () => setStep('confirm') : () => router.back()}
        />
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
            {extractionFailed && (
              <View style={styles.failedBanner}>
                <Text style={styles.failedBannerText}>
                  Couldn't read the label automatically. You can fill it in below — we'll retry extraction in the background.
                </Text>
              </View>
            )}
            <SectionLabel label="Brand" />
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Royal Canin"
              placeholderTextColor={theme.colorTextSecondary}
              value={extractedBrand}
              onChangeText={setExtractedBrand}
              autoCapitalize="words"
            />
            <SectionLabel label="Product name" />
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Gastrointestinal Adult"
              placeholderTextColor={theme.colorTextSecondary}
              value={extractedProduct}
              onChangeText={setExtractedProduct}
              autoCapitalize="words"
            />
            <SectionLabel label="Format" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.formatRow}>
              {FOOD_FORMATS.map((f) => (
                <View key={f.value} style={{ marginRight: theme.space1 }}>
                  <FilterChip
                    label={f.label}
                    active={extractedFormat === f.value}
                    onPress={() => setExtractedFormat(f.value)}
                    variant="filled"
                  />
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={[styles.primaryBtn, !canSave && styles.primaryBtnDisabled]}
              onPress={() => commitFood(extractedBrand, extractedProduct, extractedFormat)}
              disabled={!canSave}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>
                {cameFromMealLog ? 'Save and log meal' : 'Save'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return null;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Header({ title, onClose, onBack }: { title: string; onClose?: () => void; onBack?: () => void }) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={styles.headerSide} hitSlop={10}>
          <Text style={styles.headerBack}>←</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.headerSide} />
      )}
      <Text style={styles.headerTitle}>{title}</Text>
      {onClose ? (
        <TouchableOpacity onPress={onClose} style={styles.headerSide} hitSlop={10}>
          <Text style={styles.headerClose}>✕</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.headerSide} />
      )}
    </View>
  );
}

// Visual progress through the three encouraged shots. Captured shots show a
// thumbnail; missing shots show a dashed placeholder.
function PhotoChecklist({
  front, ingredients, barcode,
}: {
  front: CapturedPhoto | null;
  ingredients: CapturedPhoto | null;
  barcode: CapturedPhoto | null;
}) {
  return (
    <View style={styles.checklistRow}>
      <ChecklistTile photo={front} label="Front" />
      <ChecklistTile photo={ingredients} label="Label" optional />
      <ChecklistTile photo={barcode} label="Barcode" optional />
    </View>
  );
}

function ChecklistTile({ photo, label, optional }: { photo: CapturedPhoto | null; label: string; optional?: boolean }) {
  return (
    <View style={styles.checklistTile}>
      {photo ? (
        <Image source={{ uri: photo.localUri }} style={styles.checklistThumb} resizeMode="cover" />
      ) : (
        <View style={[styles.checklistThumb, styles.checklistThumbEmpty]}>
          <Text style={styles.checklistEmptyIcon}>{optional ? '+' : '!'}</Text>
        </View>
      )}
      <Text style={styles.checklistLabel}>{label}</Text>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

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
    width: 40,
    height: 32,
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: theme.textLG,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
    textAlign: 'center',
  },
  headerBack: {
    fontSize: 22,
    color: theme.colorTextPrimary,
  },
  headerClose: {
    fontSize: 18,
    color: theme.colorTextSecondary,
    textAlign: 'right',
  },

  introScroll: {
    padding: theme.space3,
    gap: theme.space2,
  },
  introHeading: {
    fontSize: theme.textXL,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
    marginTop: theme.space2,
  },
  introBody: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    lineHeight: 22,
    marginBottom: theme.space2,
  },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space1,
    backgroundColor: theme.colorNeutralDark,
    borderRadius: theme.radiusMedium,
    paddingVertical: theme.space2,
    minHeight: 52,
  },
  primaryBtnDisabled: {
    backgroundColor: theme.colorBorder,
  },
  primaryBtnIcon: {
    fontSize: 18,
  },
  primaryBtnText: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: '#fff',
  },
  secondaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.space2,
    minHeight: 44,
  },
  secondaryBtnText: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
  },
  linkBtn: {
    alignItems: 'center',
    paddingVertical: theme.space1,
    minHeight: 44,
    justifyContent: 'center',
  },
  linkBtnText: {
    fontSize: theme.textMD,
    color: theme.colorAccent,
  },

  checklistRow: {
    flexDirection: 'row',
    gap: theme.space2,
    marginBottom: theme.space2,
  },
  checklistTile: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  checklistThumb: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: theme.radiusSmall,
    backgroundColor: theme.colorNeutralLight,
  },
  checklistThumbEmpty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colorBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checklistEmptyIcon: {
    fontSize: 24,
    color: theme.colorTextTertiary,
  },
  checklistLabel: {
    fontSize: theme.textXS,
    color: theme.colorTextSecondary,
    letterSpacing: theme.trackingWide,
  },

  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space2,
    padding: theme.space3,
  },
  loadingText: {
    fontSize: theme.textLG,
    color: theme.colorTextPrimary,
    fontWeight: theme.weightMedium,
  },
  loadingHint: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },

  confirmScroll: {
    padding: theme.space3,
    gap: theme.space2,
  },
  confirmHero: {
    borderRadius: theme.radiusMedium,
    overflow: 'hidden',
    backgroundColor: theme.colorNeutralLight,
    aspectRatio: 4 / 3,
    position: 'relative',
  },
  confirmPhoto: {
    width: '100%',
    height: '100%',
  },
  confirmOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: theme.space2,
    backgroundColor: 'rgba(0,0,0,0.55)',
    gap: 2,
  },
  confirmBrand: {
    fontSize: theme.textLG,
    fontWeight: theme.weightSemibold,
    color: '#fff',
  },
  confirmProduct: {
    fontSize: theme.textMD,
    color: 'rgba(255,255,255,0.92)',
    lineHeight: 20,
  },
  confirmCaption: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    textAlign: 'center',
    paddingVertical: theme.space1,
  },

  formScroll: {
    padding: theme.space3,
    gap: theme.space2,
  },
  textInput: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    paddingHorizontal: theme.space2,
    height: 48,
  },
  formatRow: {
    marginBottom: theme.space2,
  },
  failedBanner: {
    backgroundColor: theme.colorEventSymptomLight,
    borderRadius: theme.radiusSmall,
    padding: theme.space2,
  },
  failedBannerText: {
    fontSize: theme.textSM,
    color: theme.colorTextPrimary,
    lineHeight: 18,
  },

  completeContainer: {
    flex: 1,
    backgroundColor: theme.colorSurface,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.space2,
  },
  checkCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colorNeutralDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkMark: {
    fontSize: 36,
    color: '#fff',
  },
  loggedText: {
    fontSize: 20,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorNeutralDark,
  },
});
