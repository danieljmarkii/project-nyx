// Medication detail / edit screen — B-117 PR 6.
//
// The medication twin of app/food/[id].tsx: an editable view of a single
// medication_items (drug-product catalog) row, reached by long-pressing a tile in
// the MedicationPicker. Reads the row from Supabase directly (like food/[id]) for
// the columns the local picker cache doesn't carry — photo_paths and, crucially,
// created_by_user_id (used to gate editing; see below).
//
// Deliberate divergences from food/[id].tsx, all spec/safety driven:
//  • Edit is OWNER-GATED. migration 020 creator-locks medication_items writes
//    (`USING (auth.uid() = created_by_user_id)`, and NO `WITH CHECK` — the B-131
//    one-way lock), unlike food_items, which migration 004 loosened to any
//    authenticated user. The catalog is globally READABLE, so refreshMedicationCache
//    can surface a drug another account created; a non-creator who opens it gets a
//    read-only view, so a silently RLS-blocked save can never masquerade as success.
//    created_by_user_id is read ONLY to decide this — it is NEVER rendered as an
//    editable field (B-131).
//  • is_critical is NOT editable here (spec §10 / open sub-decision S2). Owner-set
//    critical-drug classification is out of scope for v1: it is a clinical,
//    curated-match judgement (it gates the §6.3 missed-critical-dose escalation,
//    built at PR 9), not an owner toggle. The §5.3/§12 "mark-critical" line is in
//    direct conflict with §10/S2; resolved on the clinically-safe side and flagged
//    to the PM. Nothing consumes is_critical until PR 9, so deferring it is safe.
//  • `notes` is NOT editable here (B-122). medication_items.notes is globally
//    readable free text that outlives a B-039 hard delete, so no pet/owner identity
//    may flow into it; identifying notes belong on the pet-scoped, RLS-protected
//    medications / medication_administrations rows (PR 7 / PR 8).
//  • No delete (not in the §5.3 PR 6 scope; a drug-delete cascade over dose history
//    is its own careful slice — logged to the backlog) and no AI re-run (the
//    capture screen owns the AI path + its §6.5 strength-confirm gate).
//  • No realtime subscription. Unlike food — whose AI extraction writes the row
//    asynchronously, so it needs realtime to land pending→completed — the
//    medication extractor is stateless and the client commits synchronously at
//    capture, so the catalog row has no async server writer; a fetch-on-mount is
//    sufficient and keeps the screen simple.
import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { theme } from '../../constants/theme';
import { Header } from '../../components/ui/Header';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { FilterChip } from '../../components/ui/FilterChip';
import { ChipGroup } from '../../components/ui/ChipGroup';
import { PhotoViewer } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { getDb } from '../../lib/db';
import { useAuthStore } from '../../store/authStore';
import {
  uploadPhoto, compressForUpload, getSignedUrl,
  buildMedicationPhotoPath, MEDICATION_PHOTOS_BUCKET,
} from '../../lib/storage';
import {
  MEDICATION_FORM_OPTIONS, MEDICATION_ROUTE_OPTIONS,
  buildMedicationItemUpdate, hasMedicationItemChanges, canSaveMedicationItemEdit,
  type MedicationItemEdit,
} from '../../lib/medications';

interface MedicationItemRow {
  id: string;
  generic_name: string;
  brand_name: string | null;
  strength: string | null;
  form: string | null;
  default_route: string | null;
  is_prescription: boolean;
  photo_paths: string[];
  created_by_user_id: string | null;
}

// created_by_user_id is selected ONLY to gate editing (isOwner). It is never put
// into a form field or an UPDATE payload (B-131). is_critical / notes / ai_* are
// intentionally absent — not editable on this screen (see header).
const SELECT_COLS =
  'id, generic_name, brand_name, strength, form, default_route, is_prescription, photo_paths, created_by_user_id';

export default function MedicationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();

  const [row, setRow] = useState<MedicationItemRow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Editable fields — seeded from the row once on load.
  const [genericName, setGenericName] = useState('');
  const [brandName, setBrandName] = useState('');
  const [strength, setStrength] = useState('');
  const [form, setForm] = useState<string | null>(null);
  const [route, setRoute] = useState<string | null>(null);
  const [isPrescription, setIsPrescription] = useState(true);

  const [saving, setSaving] = useState(false);
  const [replacingPhoto, setReplacingPhoto] = useState(false);

  // Resolved signed URL for the label photo. The bucket is private + per-user
  // (migration 021), so a non-owner's sign fails and degrades to a placeholder
  // (intended, B-124). photoNonce busts the URL/image cache after a replace, since
  // the storage path ('0-label') is stable so the path string alone wouldn't change.
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoNonce, setPhotoNonce] = useState(0);
  const [viewerVisible, setViewerVisible] = useState(false);

  const photoPath = row?.photo_paths?.[0] ?? null;
  // The catalog is globally readable but creator-locked for writes; gate the
  // editing UI on ownership so we never offer a control whose save RLS would
  // silently no-op. A row with a null creator (legacy/seed) is treated as
  // non-editable rather than guessing.
  const isOwner = !!row && !!user?.id && row.created_by_user_id === user.id;

  // ── Fetch the row ──
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('medication_items')
        .select(SELECT_COLS)
        .eq('id', id)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setLoadError(error?.message ?? 'Medication not found');
        return;
      }
      const r = data as MedicationItemRow;
      setRow(r);
      setGenericName(r.generic_name);
      setBrandName(r.brand_name ?? '');
      setStrength(r.strength ?? '');
      setForm(r.form);
      setRoute(r.default_route);
      setIsPrescription(r.is_prescription);
    })();
    return () => { cancelled = true; };
  }, [id]);

  // ── Resolve the label photo's signed URL ──
  useEffect(() => {
    if (!photoPath) { setPhotoUrl(null); setPhotoLoading(false); return; }
    let cancelled = false;
    setPhotoLoading(true);
    getSignedUrl(MEDICATION_PHOTOS_BUCKET, photoPath)
      .then((u) => { if (!cancelled) { setPhotoUrl(u); setPhotoLoading(false); } })
      .catch(() => { if (!cancelled) { setPhotoUrl(null); setPhotoLoading(false); } });
    return () => { cancelled = true; };
  }, [photoPath, photoNonce]);

  // Current form state as the pure edit shape (drives the diff + the payload).
  function currentEdit(): MedicationItemEdit {
    return {
      generic_name: genericName,
      brand_name: brandName,
      strength,
      form,
      default_route: route,
      is_prescription: isPrescription,
    };
  }

  // ── Save ──
  async function handleSave() {
    if (!row || !isOwner) return;
    const edit = currentEdit();
    if (!canSaveMedicationItemEdit(edit)) {
      Alert.alert('A medication name is required.');
      return;
    }
    const baseline: MedicationItemEdit = {
      generic_name: row.generic_name,
      brand_name: row.brand_name,
      strength: row.strength,
      form: row.form,
      default_route: row.default_route,
      is_prescription: row.is_prescription,
    };
    if (!hasMedicationItemChanges(baseline, edit)) {
      router.back();
      return;
    }

    setSaving(true);
    try {
      // buildMedicationItemUpdate is the allow-list — it can NEVER carry
      // created_by_user_id (B-131), notes (B-122), or is_critical (§10).
      const payload = buildMedicationItemUpdate(edit);
      // .select() so a silent RLS block (non-creator) surfaces as an error rather
      // than a false success — supabase-js returns success-with-0-rows when the
      // UPDATE policy rejects the write (the food_items 009 cautionary tale).
      const { data, error } = await supabase
        .from('medication_items')
        .update(payload)
        .eq('id', row.id)
        .select('id');

      if (error) {
        Alert.alert('Could not save', error.message);
        return;
      }
      if (!data || data.length === 0) {
        Alert.alert(
          'Could not save',
          "This medication was added by another account, so it can't be edited here.",
        );
        return;
      }

      // Keep the local picker cache in step so the tile reflects the edit without
      // waiting for a refreshMedicationCache pull.
      try {
        await getDb().runAsync(
          `UPDATE medication_items_cache
             SET generic_name = ?, brand_name = ?, strength = ?, form = ?,
                 default_route = ?, is_prescription = ?
           WHERE id = ?`,
          [
            payload.generic_name, payload.brand_name, payload.strength, payload.form,
            payload.default_route, payload.is_prescription ? 1 : 0, row.id,
          ],
        );
      } catch (err) {
        console.warn('[medication-detail] cache update failed:', err);
      }

      router.back();
    } finally {
      // Never strand the Save button disabled — even if supabase-js throws rather
      // than resolving { error } (the inherited food/[id] gap, fixed here).
      setSaving(false);
    }
  }

  // ── Replace the label photo ──
  async function handleReplacePhoto() {
    if (!row || !isOwner) return;
    // isOwner already implies a signed-in user (see the isOwner definition); this
    // only narrows user.id for TypeScript without a non-null assertion. Not a
    // reachable signed-out path, so it returns silently rather than prompting.
    const authedUserId = user?.id;
    if (!authedUserId) return;

    const source = await new Promise<'camera' | 'library' | null>((resolve) => {
      Alert.alert(
        photoPath ? 'Replace label photo' : 'Add label photo',
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

    setReplacingPhoto(true);
    try {
      // Path built ONLY via the helper, from the authed uid — the {uid}/ prefix is
      // the bucket's RLS boundary (migration 021 / B-128), never hand-rolled.
      const storagePath = buildMedicationPhotoPath(authedUserId, row.id, '0-label');
      const compressedUri = await compressForUpload(asset.uri, asset.width, asset.height);
      await uploadPhoto(MEDICATION_PHOTOS_BUCKET, storagePath, compressedUri);

      const nextPaths = [storagePath];
      const { data, error } = await supabase
        .from('medication_items')
        .update({ photo_paths: nextPaths })
        .eq('id', row.id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("This medication was added by another account, so it can't be edited here.");
      }
      setRow({ ...row, photo_paths: nextPaths });
      setPhotoNonce((n) => n + 1); // stable path → bump to refetch a fresh signed URL

      try {
        await getDb().runAsync(
          'UPDATE medication_items_cache SET photo_path = ? WHERE id = ?',
          [storagePath, row.id],
        );
      } catch (err) {
        console.warn('[medication-detail] cache photo update failed:', err);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('Could not update photo', msg);
    } finally {
      setReplacingPhoto(false);
    }
  }

  // ── Render ──
  if (loadError) {
    return (
      <SafeAreaView style={styles.container}>
        <Header leading="back" title="Medication" onLeadingPress={() => router.back()} />
        <View style={styles.centerMessage}>
          <Text style={styles.errorText}>{loadError}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!row) {
    return (
      <SafeAreaView style={styles.container}>
        <Header leading="back" title="Medication" onLeadingPress={() => router.back()} />
        <View style={styles.centerMessage}>
          <ActivityIndicator color={theme.colorAccent} />
        </View>
      </SafeAreaView>
    );
  }

  const canSave = canSaveMedicationItemEdit(currentEdit());

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header leading="back" title="Medication" onLeadingPress={() => router.back()} />
      <KeyboardAvoidingView style={styles.kav} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Label photo. Tap to view full-screen; owners get a replace action. */}
          <TouchableOpacity
            style={styles.hero}
            activeOpacity={photoUrl ? 0.9 : 1}
            onPress={photoUrl ? () => setViewerVisible(true) : (isOwner ? handleReplacePhoto : undefined)}
            disabled={!photoUrl && !isOwner}
          >
            {photoLoading ? (
              <ActivityIndicator color={theme.colorAccent} />
            ) : photoUrl ? (
              <Image source={{ uri: photoUrl }} style={styles.heroImage} resizeMode="cover" />
            ) : (
              <View style={styles.heroEmpty}>
                <Text style={styles.heroEmptyText}>
                  {photoPath
                    ? 'Photo unavailable'
                    : isOwner ? 'Tap to add the label photo' : 'No label photo'}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          {isOwner && (
            <TouchableOpacity
              style={styles.photoAction}
              onPress={handleReplacePhoto}
              disabled={replacingPhoto}
              hitSlop={8}
              activeOpacity={0.7}
            >
              {replacingPhoto
                ? <ActivityIndicator size="small" color={theme.colorAccent} />
                : <Text style={styles.photoActionText}>{photoPath ? 'Replace label photo' : 'Add label photo'}</Text>}
            </TouchableOpacity>
          )}

          {/* pointerEvents gates the whole form for a non-owner in one move (no
              per-control branching); the banner explains why it's not tappable. */}
          {!isOwner && (
            <View style={styles.readOnlyBanner}>
              <Text style={styles.readOnlyText}>
                This medication was added by another account, so it's read-only here.
              </Text>
            </View>
          )}

          {/* bodyReadOnly carries pointerEvents:'none' (RN 0.81: it's a style, not
              a prop), disabling every input + chip for a non-owner in one move. */}
          <View style={[styles.body, !isOwner && styles.bodyReadOnly]}>
            <SectionLabel label="Medication name" />
            <TextInput
              style={styles.textInput}
              value={genericName}
              onChangeText={setGenericName}
              placeholder="e.g. Prednisolone"
              placeholderTextColor={theme.colorTextTertiary}
              autoCapitalize="sentences"
            />

            <SectionLabel label="Brand" />
            <TextInput
              style={styles.textInput}
              value={brandName}
              onChangeText={setBrandName}
              placeholder="e.g. Apoquel"
              placeholderTextColor={theme.colorTextTertiary}
              autoCapitalize="words"
            />

            <SectionLabel label="Strength" />
            <TextInput
              style={styles.textInput}
              value={strength}
              onChangeText={setStrength}
              placeholder="e.g. 5 mg, 16 mg/mL"
              placeholderTextColor={theme.colorTextTertiary}
              autoCapitalize="none"
            />

            <SectionLabel label="Form" />
            <ChipGroup options={MEDICATION_FORM_OPTIONS} value={form} onChange={setForm} accessibilityLabel="Form" style={styles.chipScroll} />

            <SectionLabel label="Route" />
            <ChipGroup options={MEDICATION_ROUTE_OPTIONS} value={route} onChange={setRoute} accessibilityLabel="Route" style={styles.chipScroll} />

            <SectionLabel label="Type" />
            <View style={styles.rxRow}>
              <FilterChip
                label="Prescription"
                active={isPrescription}
                onPress={() => setIsPrescription(true)}
                variant="filled"
              />
              <FilterChip
                label="Over-the-counter"
                active={!isPrescription}
                onPress={() => setIsPrescription(false)}
                variant="filled"
              />
            </View>
          </View>
        </ScrollView>

        {isOwner && (
          <View style={styles.bottomAction}>
            <TouchableOpacity
              style={[styles.saveBtn, (saving || !canSave) && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving || !canSave}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator size="small" color={theme.colorTextOnDark} />
                : <Text style={styles.saveBtnText}>Save</Text>}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>

      <PhotoViewer
        visible={viewerVisible}
        uris={photoUrl ? [photoUrl] : []}
        initialIndex={0}
        onClose={() => setViewerVisible(false)}
      />
    </SafeAreaView>
  );
}

const HERO_HEIGHT = 240;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorSurface,
  },
  kav: {
    flex: 1,
  },
  scroll: {
    paddingBottom: theme.space3,
  },
  body: {
    padding: theme.space3,
    gap: theme.space2,
  },
  bodyReadOnly: {
    opacity: 0.6,
    pointerEvents: 'none',
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
  hero: {
    height: HERO_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colorNeutralLight,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space1,
  },
  heroEmptyText: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  photoAction: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.space2,
    minHeight: 44,
  },
  photoActionText: {
    fontSize: theme.textMD,
    color: theme.colorAccent,
  },
  readOnlyBanner: {
    backgroundColor: theme.colorNeutralLight,
    marginHorizontal: theme.space3,
    marginTop: theme.space2,
    borderRadius: theme.radiusSmall,
    padding: theme.space2,
  },
  readOnlyText: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: 18,
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
  chipScroll: {
    marginBottom: theme.space1,
  },
  rxRow: {
    flexDirection: 'row',
    gap: theme.space1,
    marginBottom: theme.space1,
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
    color: theme.colorTextOnDark,
  },
});
