// Medication capture + AI-confirm flow (B-117 PR 5). The medication twin of
// app/food-capture.tsx, reached from the medication picker's "Add a medication"
// CTA. Hero path: snap the drug label → upload to the private per-user
// nyx-medication-photos bucket → extract-medication-from-photo (Sonnet 4.6) →
// confirm name/strength/form/route → first dose logged.
//
// Three things make this NOT a copy of food-capture (spec §5.2 / §6):
//  • Single photo (the label), no ingredients/barcode slots, no EXIF meal-time —
//    a dose is witnessed-now, so insertMedicationDose stamps occurred_at = now.
//  • DOSE-CONFIRM-REQUIRED (§6.5): a strength is never silently trusted — AI-
//    extracted OR hand-typed (a transposed 5 mg → 50 mg is a 10× error whoever
//    keyed it). Save is BLOCKED (canSaveMedicationCapture) until the owner
//    deliberately ticks "matches the label", on EVERY screen that can save it.
//    Editing the strength re-closes the gate; only the tick opens it. The gate
//    logic is the pure, unit-tested initialStrengthConfirmed / canSaveMedicationCapture
//    in lib/medications.ts, so the invariant is a test, not navigation choreography.
//  • The extractor is STATELESS — it returns the extraction and writes nothing.
//    Only this screen's commit (post-gate) writes the globally-readable catalog,
//    so no AI value reaches the shared library without passing the owner's gate.
//    The label path is built ONLY via buildMedicationPhotoPath (lib/storage.ts)
//    from the authed uid — the per-user RLS prefix is never hand-rolled here.
import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  Animated, Image, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Check } from 'lucide-react-native';
import { theme } from '../constants/theme';
import { SectionLabel } from '../components/ui/SectionLabel';
import { ChipGroup } from '../components/ui/ChipGroup';
import { usePetStore } from '../store/petStore';
import { useAuthStore } from '../store/authStore';
import { useEventStore } from '../store/eventStore';
import { getDb } from '../lib/db';
import { supabase } from '../lib/supabase';
import { insertMedicationDose } from '../lib/medicationDose';
import {
  initialStrengthConfirmed, canSaveMedicationCapture,
  MEDICATION_FORM_OPTIONS, MEDICATION_ROUTE_OPTIONS,
} from '../lib/medications';
import {
  uploadPhoto, compressForUpload, buildMedicationPhotoPath, MEDICATION_PHOTOS_BUCKET,
} from '../lib/storage';
import { uuid } from '../lib/utils';

type CaptureStep = 'intro' | 'uploading' | 'confirm' | 'edit' | 'complete';

interface CapturedPhoto {
  localUri: string;
  storagePath: string;
  width?: number;
  height?: number;
}

// Form/route option lists live in lib/medications (MEDICATION_FORM_OPTIONS /
// MEDICATION_ROUTE_OPTIONS) — one source of truth shared with the PR 6 detail
// screen, since the values must match the migration 020 DB enums exactly and the
// two screens must never drift.
const FORM_OPTIONS = MEDICATION_FORM_OPTIONS;
const ROUTE_OPTIONS = MEDICATION_ROUTE_OPTIONS;

interface MedicationExtraction {
  generic_name?: string;
  brand_name?: string | null;
  strength?: string | null;
  form?: string | null;
  route?: string | null;
  is_prescription?: boolean | null;
}

export default function MedicationCaptureScreen() {
  const { activePet } = usePetStore();
  const { user } = useAuthStore();
  const { prependEvent } = useEventStore();
  const { fromLog } = useLocalSearchParams<{ fromLog?: string }>();
  // When launched from the log flow the first dose is logged on confirm
  // (add-then-log, exactly like picking an existing drug). Without it, this is a
  // library-only add (forward-compat for a future Meds tab).
  const logFirstDose = fromLog === '1';

  const [step, setStep] = useState<CaptureStep>('intro');
  const [medicationItemId] = useState<string>(() => uuid());

  const [labelPhoto, setLabelPhoto] = useState<CapturedPhoto | null>(null);

  // Extracted / editable fields.
  const [extracting, setExtracting] = useState(false);
  const [genericName, setGenericName] = useState('');
  const [brandName, setBrandName] = useState('');
  const [strength, setStrength] = useState('');
  const [form, setForm] = useState<string | null>(null);
  const [route, setRoute] = useState<string | null>(null);
  // Rx vs OTC. null = unknown → defaults to prescription (the safe default and the
  // catalog column default). The owner toggles it on the PR 6 detail screen.
  const [isPrescription, setIsPrescription] = useState<boolean | null>(null);
  const [extractionFailed, setExtractionFailed] = useState(false);

  // §6.5 dose-confirm gate. True = the owner has DELIBERATELY confirmed the
  // strength by ticking "matches the label". Seeded CLOSED (false): a present
  // strength — AI-extracted OR hand-typed — must be confirmed before save, since a
  // transposed dose (5 mg → 50 mg) is a 10× error whoever keyed it. An empty
  // strength has nothing to confirm and never blocks save (canSaveMedicationCapture).
  const [strengthConfirmed, setStrengthConfirmed] = useState(false);

  const checkScale = useRef(new Animated.Value(0.5)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;

  // Submission guard — prevents a double-tap on Save from writing two items/doses.
  const submitting = useRef(false);

  useEffect(() => {
    if (step !== 'complete') return;
    Animated.parallel([
      Animated.spring(checkScale, { toValue: 1, useNativeDriver: true, tension: 60, friction: 7 }),
      Animated.timing(checkOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();
    // dismissAll() unwinds both this modal and the underlying medication picker so
    // the owner lands on Home, not on a stale picker.
    const t = setTimeout(() => router.dismissAll(), 900);
    return () => clearTimeout(t);
  }, [step]);

  // Editing the strength INVALIDATES any prior confirmation — a changed value is an
  // unverified value, so the §6.5 gate re-closes and the owner must tick to confirm
  // it. Typing is not verifying: only the deliberate tick opens the gate.
  function onEditStrength(next: string) {
    setStrength(next);
    setStrengthConfirmed(false);
  }

  async function pickPhoto(presetSource?: 'camera' | 'library'): Promise<CapturedPhoto | null> {
    const authedUserId = user?.id;
    if (!authedUserId) {
      Alert.alert('Please sign in', 'You need to be signed in to add a medication.');
      return null;
    }
    const source = presetSource ?? await new Promise<'camera' | 'library' | null>((resolve) => {
      Alert.alert('Add photo', undefined, [
        { text: 'Take photo', onPress: () => resolve('camera') },
        { text: 'Choose from library', onPress: () => resolve('library') },
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      ], { cancelable: true, onDismiss: () => resolve(null) });
    });
    if (!source) return null;

    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Camera access needed',
          'Allow camera access in Settings, choose from your library, or add this medication manually.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Enter manually', onPress: () => setStep('edit') },
          ],
        );
        return null;
      }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Photo access needed', 'Allow photo access in Settings to choose a photo.');
        return null;
      }
    }

    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.9,
    };
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts);

    if (result.canceled || !result.assets[0]) return null;
    const asset = result.assets[0];

    // Path built ONLY via the helper, from the authed uid — the {uid}/ prefix is
    // the bucket's RLS security boundary (migration 021), never hand-rolled here.
    return {
      localUri: asset.uri,
      storagePath: buildMedicationPhotoPath(authedUserId, medicationItemId, '0-label'),
      width: asset.width,
      height: asset.height,
    };
  }

  async function handleSnap(source: 'camera' | 'library') {
    const photo = await pickPhoto(source);
    if (!photo) return;
    setLabelPhoto(photo);
    await runUploadAndExtract(photo);
  }

  // Upload the label, then extract. The Edge Function is stateless — it reads the
  // caller's own label (path pinned to the authed uid) and RETURNS the fields; it
  // writes nothing. So no pending catalog row is seeded here: the row is created
  // only on commit (post-gate), which is what keeps an abandoned capture from ever
  // touching the globally-readable library. Any failure falls through to manual.
  async function runUploadAndExtract(photo: CapturedPhoto) {
    setStep('uploading');
    setExtracting(true);
    setExtractionFailed(false);

    try {
      const compressedUri = await compressForUpload(photo.localUri, photo.width, photo.height);
      await uploadPhoto(MEDICATION_PHOTOS_BUCKET, photo.storagePath, compressedUri);

      // Body carries ONLY the item id — the function builds the label path from
      // the authed uid server-side (never a body path, B-123).
      const { data, error } = await supabase.functions.invoke('extract-medication-from-photo', {
        body: { medication_item_id: medicationItemId },
      });

      if (error || !data?.extraction) {
        console.warn('[medication-capture] extraction failed:', error?.message);
        setExtractionFailed(true);
        setStep('edit');
        return;
      }

      applyExtraction(data.extraction as MedicationExtraction);
      setStep('confirm');
    } catch (err) {
      console.error('[medication-capture] upload/extract error:', err);
      setExtractionFailed(true);
      setStep('edit');
    } finally {
      setExtracting(false);
    }
  }

  function applyExtraction(ex: MedicationExtraction) {
    setGenericName(ex.generic_name ?? '');
    setBrandName(ex.brand_name ?? '');
    const s = ex.strength ?? '';
    setStrength(s);
    setForm(ex.form ?? null);
    setRoute(ex.route ?? null);
    setIsPrescription(ex.is_prescription ?? null);
    // §6.5: only a present AI strength must be confirmed. No strength → nothing to
    // mistrust → gate already open.
    setStrengthConfirmed(initialStrengthConfirmed(s));
  }

  async function commitMedication() {
    if (!canSaveMedicationCapture({ genericName, strength, strengthConfirmed })) return;
    if (submitting.current) return;
    submitting.current = true;
    try {
      await commitInner();
    } catch (err) {
      console.error('[medication-capture] commit failed:', err);
      submitting.current = false; // allow retry
      Alert.alert("Couldn't save that", 'Something went wrong. Please try again.');
    }
  }

  async function commitInner() {
    const db = getDb();
    const now = new Date().toISOString();
    const labelPath = labelPhoto?.storagePath ?? null;
    const trimmedGeneric = genericName.trim();
    const trimmedBrand = brandName.trim() || null;
    const trimmedStrength = strength.trim() || null;
    // Rx unless the label was clearly OTC (is_prescription === false). null/unknown
    // → the safe prescription default, matching the catalog column default.
    const isRx = isPrescription !== false;

    // Local cache (so the drug shows in the picker immediately). ON CONFLICT DO
    // UPDATE — never REPLACE, which would null is_critical / the AI confidence the
    // server holds. is_prescription is written (not hardcoded) so an OTC label
    // isn't silently flagged prescription-only. Mirrors food-capture's cache write.
    await db.runAsync(
      `INSERT INTO medication_items_cache
         (id, generic_name, brand_name, strength, form, default_route,
          is_prescription, is_critical, photo_path, notes, cached_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, NULL, ?)
       ON CONFLICT(id) DO UPDATE SET
         generic_name    = excluded.generic_name,
         brand_name      = excluded.brand_name,
         strength        = excluded.strength,
         form            = excluded.form,
         default_route   = excluded.default_route,
         is_prescription = excluded.is_prescription,
         photo_path      = excluded.photo_path,
         cached_at       = excluded.cached_at`,
      [medicationItemId, trimmedGeneric, trimmedBrand, trimmedStrength, form, route,
       isRx ? 1 : 0, labelPath, now],
    );

    // Remote upsert with the owner-confirmed values — the ONLY writer of the
    // globally-readable catalog row (the extractor writes nothing). Fire-and-forget
    // (mirrors food-capture); the dose's presyncMedicationItems uses
    // ignoreDuplicates so it never clobbers this richer row.
    supabase.from('medication_items').upsert({
      id: medicationItemId,
      generic_name: trimmedGeneric,
      brand_name: trimmedBrand,
      strength: trimmedStrength,
      form,
      default_route: route,
      is_prescription: isRx,
      created_by_user_id: user?.id ?? null,
      photo_paths: labelPath ? [labelPath] : [],
      ai_extraction_status: labelPhoto ? (extractionFailed ? 'failed' : 'completed') : 'manual',
      ai_extraction_error: null,
    }, { onConflict: 'id' }).then(({ error }) => {
      if (error) console.warn('[medication-capture] upsert failed:', error.message);
    });

    // Write-time pet identity (multi-pet spec §6): read the store at the moment of
    // write, not the render-time closure (the queue-then-switch edge).
    const pet = usePetStore.getState().activePet;
    if (logFirstDose && pet) {
      // insertMedicationDose owns the event + dose-child write and the sync push,
      // so this path can't write one without the other. adherence='given' = the
      // affirmative "I'm logging this dose"; dose is witnessed-now.
      const result = await insertMedicationDose({
        petId: pet.id,
        medicationItemId,
        medicationId: null, // no regimen in PR 5 → an ad-hoc one-off dose (PR 7 adds regimens)
        adherence: 'given',
        doseAmount: null,   // honest-null; the drug's strength is NOT the dose
        occurredAt: new Date(),
      });
      prependEvent({
        id: result.eventId,
        pet_id: pet.id,
        event_type: 'medication',
        occurred_at: result.occurredAtIso,
        occurred_at_confidence: 'witnessed',
        severity: null,
        notes: null,
        source: 'manual',
        deleted_at: null,
        created_at: result.now,
        updated_at: result.now,
      });
    }

    setStep('complete');
  }

  function handleManualEntry() {
    setGenericName('');
    setBrandName('');
    setStrength('');
    setForm(null);
    setRoute(null);
    setIsPrescription(null);
    setStrengthConfirmed(false); // a hand-typed strength must be deliberately confirmed too (§6.5)
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
          {logFirstDose ? 'Logged' : 'Added'}
        </Animated.Text>
      </View>
    );
  }

  // ── Intro ──
  if (step === 'intro') {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Add a medication" onClose={() => router.back()} />
        <ScrollView contentContainerStyle={styles.introScroll}>
          <Text style={styles.introHeading}>Snap the medication label</Text>
          <Text style={styles.introBody}>
            A clear photo of the label lets us read the name and strength, so you
            can confirm them instead of typing. You can also enter it by hand.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => handleSnap('camera')} activeOpacity={0.85}>
            <Text style={styles.primaryBtnIcon}>📷</Text>
            <Text style={styles.primaryBtnText}>Take a photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.outlineBtn} onPress={() => handleSnap('library')} activeOpacity={0.85}>
            <Text style={styles.outlineBtnIcon}>🖼</Text>
            <Text style={styles.outlineBtnText}>Choose from library</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkBtn} onPress={handleManualEntry} hitSlop={8}>
            <Text style={styles.linkBtnText}>Enter manually</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Uploading + extracting ──
  if (step === 'uploading') {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Add a medication" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colorAccent} />
          <Text style={styles.loadingText}>{extracting ? 'Reading the label…' : 'Uploading…'}</Text>
          <Text style={styles.loadingHint}>This usually takes a few seconds.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Confirm (dose-confirm-required, §6.5) ──
  if (step === 'confirm') {
    const canSave = canSaveMedicationCapture({ genericName, strength, strengthConfirmed });
    const strengthNeedsConfirm = strength.trim().length > 0 && !strengthConfirmed;
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Confirm" />
        <KeyboardAvoidingView style={styles.kav} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.confirmScroll} keyboardShouldPersistTaps="handled">
            {labelPhoto && (
              <View style={styles.confirmHero}>
                <Image source={{ uri: labelPhoto.localUri }} style={styles.confirmPhoto} resizeMode="cover" />
                <View style={styles.confirmOverlay}>
                  <Text style={styles.confirmName} numberOfLines={2}>{genericName || 'Medication'}</Text>
                  {brandName ? <Text style={styles.confirmBrand} numberOfLines={1}>{brandName}</Text> : null}
                </View>
              </View>
            )}
            <Text style={styles.confirmCaption}>Check this against the label</Text>

            <SectionLabel label="Medication name" />
            <TextInput
              style={styles.textInput}
              value={genericName}
              onChangeText={setGenericName}
              placeholder="e.g. Prednisolone"
              placeholderTextColor={theme.colorTextSecondary}
              autoCapitalize="sentences"
            />

            <SectionLabel label="Strength" />
            <TextInput
              style={[styles.textInput, strengthNeedsConfirm && styles.textInputUnconfirmed]}
              value={strength}
              onChangeText={onEditStrength}
              placeholder="e.g. 5 mg, 16 mg/mL"
              placeholderTextColor={theme.colorTextSecondary}
              autoCapitalize="none"
            />
            <StrengthGate
              strength={strength}
              confirmed={strengthConfirmed}
              onToggle={() => setStrengthConfirmed((v) => !v)}
            />

            <SectionLabel label="Form" />
            <ChipGroup options={FORM_OPTIONS} value={form} onChange={setForm} accessibilityLabel="Form" style={styles.chipScroll} />

            <SectionLabel label="Route" />
            <ChipGroup options={ROUTE_OPTIONS} value={route} onChange={setRoute} accessibilityLabel="Route" style={styles.chipScroll} />

            <TouchableOpacity
              style={[styles.primaryBtn, !canSave && styles.primaryBtnDisabled]}
              onPress={commitMedication}
              disabled={!canSave}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>{logFirstDose ? 'Looks right — log dose' : 'Looks right'}</Text>
            </TouchableOpacity>
            {strengthNeedsConfirm && (
              <Text style={styles.gateHint}>Check the strength against the label to continue.</Text>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Edit / manual entry ──
  if (step === 'edit') {
    const canSave = canSaveMedicationCapture({ genericName, strength, strengthConfirmed });
    const strengthNeedsConfirm = strength.trim().length > 0 && !strengthConfirmed;
    return (
      <SafeAreaView style={styles.container}>
        <Header
          title="Medication details"
          // Return to Confirm only when there is AI-extracted data to show.
          onBack={labelPhoto && !extractionFailed ? () => setStep('confirm') : () => router.back()}
        />
        <KeyboardAvoidingView style={styles.kav} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
            {extractionFailed && (
              <View style={styles.failedBanner}>
                <Text style={styles.failedBannerText}>
                  Couldn't read the label automatically. You can fill it in below —
                  the label photo is saved either way.
                </Text>
              </View>
            )}
            <SectionLabel label="Medication name" />
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Prednisolone, Apoquel"
              placeholderTextColor={theme.colorTextSecondary}
              value={genericName}
              onChangeText={setGenericName}
              autoCapitalize="sentences"
            />
            <SectionLabel label="Brand (optional)" />
            <TextInput
              style={styles.textInput}
              placeholder="e.g. the brand on the label"
              placeholderTextColor={theme.colorTextSecondary}
              value={brandName}
              onChangeText={setBrandName}
              autoCapitalize="words"
            />
            <SectionLabel label="Strength (optional)" />
            <TextInput
              style={[styles.textInput, strengthNeedsConfirm && styles.textInputUnconfirmed]}
              placeholder="e.g. 5 mg, 16 mg/mL"
              placeholderTextColor={theme.colorTextSecondary}
              value={strength}
              onChangeText={onEditStrength}
              autoCapitalize="none"
            />
            {/* The gate follows the strength wherever it can be saved, so the edit
                screen can never save an unverified strength either — a hand-typed
                dose is gated exactly like an AI-extracted one (§6.5). */}
            <StrengthGate
              strength={strength}
              confirmed={strengthConfirmed}
              onToggle={() => setStrengthConfirmed((v) => !v)}
            />
            <SectionLabel label="Form" />
            <ChipGroup options={FORM_OPTIONS} value={form} onChange={setForm} accessibilityLabel="Form" style={styles.chipScroll} />
            <SectionLabel label="Route" />
            <ChipGroup options={ROUTE_OPTIONS} value={route} onChange={setRoute} accessibilityLabel="Route" style={styles.chipScroll} />
            <TouchableOpacity
              style={[styles.primaryBtn, !canSave && styles.primaryBtnDisabled]}
              onPress={commitMedication}
              disabled={!canSave}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>{logFirstDose ? 'Save and log dose' : 'Save'}</Text>
            </TouchableOpacity>
            {strengthNeedsConfirm && (
              <Text style={styles.gateHint}>Confirm the strength to continue.</Text>
            )}
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

// The §6.5 strength-confirmation control. Shown wherever a strength can be saved,
// so the gate is uniform across the confirm and edit screens. It's a real toggle —
// ticking confirms, tapping again takes the confirmation back. Editing the strength
// also re-closes the gate (onEditStrength), so a changed value is never left
// silently "confirmed".
function StrengthGate({
  strength, confirmed, onToggle,
}: {
  strength: string;
  confirmed: boolean;
  onToggle: () => void;
}) {
  if (strength.trim().length === 0) return null;
  return (
    <>
      <TouchableOpacity
        style={styles.confirmCheckRow}
        onPress={onToggle}
        activeOpacity={0.7}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: confirmed }}
        accessibilityLabel="The strength matches the label"
        hitSlop={8}
      >
        <View style={[styles.checkbox, confirmed && styles.checkboxChecked]}>
          {confirmed && <Check size={16} color="#fff" strokeWidth={3} />}
        </View>
        <Text style={styles.confirmCheckText}>The strength matches the label</Text>
      </TouchableOpacity>
      <Text style={styles.strengthHint}>
        Worth a quick check — the strength is the one thing worth getting exactly right.
      </Text>
    </>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorSurface,
  },
  kav: {
    flex: 1,
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
    lineHeight: theme.lineHeightBody,
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
    color: theme.colorTextOnDark,
  },
  outlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space1,
    backgroundColor: theme.colorSurface,
    borderWidth: 1,
    borderColor: theme.colorBorderStrong,
    borderRadius: theme.radiusMedium,
    paddingVertical: theme.space2,
    minHeight: 52,
  },
  outlineBtnIcon: {
    fontSize: 18,
  },
  outlineBtnText: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
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
    backgroundColor: theme.colorScrimDark,
    gap: 2,
  },
  confirmName: {
    fontSize: theme.textLG,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextOnDark,
  },
  confirmBrand: {
    fontSize: theme.textMD,
    color: theme.colorTextOnDarkMuted,
  },
  confirmCaption: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    textAlign: 'center',
    paddingVertical: theme.space1,
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
  // The strength field while still unverified — a stronger border to draw the eye
  // to the one safety-critical value, calmly (no alarm colour).
  textInputUnconfirmed: {
    borderColor: theme.colorBorderStrong,
    borderWidth: 2,
  },
  confirmCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    paddingVertical: theme.space1,
    minHeight: 44,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: theme.colorBorderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: theme.colorAccent,
    borderColor: theme.colorAccent,
  },
  confirmCheckText: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
  },
  strengthHint: {
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
    lineHeight: 18,
  },
  gateHint: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    textAlign: 'center',
  },
  chipScroll: {
    marginBottom: theme.space1,
  },

  formScroll: {
    padding: theme.space3,
    gap: theme.space2,
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
    color: theme.colorTextOnDark,
  },
  loggedText: {
    fontSize: 20,
    fontWeight: theme.weightMedium,
    color: theme.colorNeutralDark,
  },
});
