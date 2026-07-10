import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Image, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { ChevronRight, Camera } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { theme } from '../../constants/theme';
import { EVENT_TYPES, EventTypeKey } from '../../constants/eventTypes';
import {
  getDb,
  getEventById,
  getEventAttachment,
  getEventSource,
  getMealForEvent,
  getDoseForEvent,
  getDoubleDoseFlag,
  softDeleteEvent,
  deleteEventAttachmentLocal,
  updateMealIntake,
  updateDoseAdherence,
  updateDoseHowGiven,
  TimelineRow,
} from '../../lib/db';
import { uploadPhoto, getSignedUrl, compressForUpload, persistCapture, MAX_EDGE_PX } from '../../lib/storage';
import { resolveEventPhotoDisplay } from '../../lib/eventPhoto';
import { supabase } from '../../lib/supabase';
import { syncPendingEvents, syncPendingMeals, syncPendingMedicationAdministrations } from '../../lib/sync';
import { triggerVomitAnalysis } from '../../lib/analysis';
import { useEventStore } from '../../store/eventStore';
import { usePetStore } from '../../store/petStore';
import { uuid, formatExifAttribution, describeOccurredAt } from '../../lib/utils';
import { IntakeChipRow, IntakeRating } from '../../components/log/IntakeChipRow';
import { AdherenceChipRow, DoseAdherence } from '../../components/log/AdherenceChipRow';
import { VehicleChipRow } from '../../components/log/VehicleChipRow';
import {
  doubleDoseNote, DoubleDoseResult, asDoseVehicle,
  isComboDoseInDoubt, doseInDoubtNote,
  pairedVehicleLinkLabel, pairedDoseLinkLabel, type DoseVehicle,
} from '../../lib/medications';
import { VomitAnalysisSection } from '../../components/event/VomitAnalysisSection';
import { Header, PhotoViewer } from '../../components/ui';

const HERO_HEIGHT = 320;
const SIGNED_URL_TTL_SEC = 60 * 60;
// The hero and the full-screen viewer render the SAME resolved URI, so serving a
// screen-sized transform (imgproxy — Pro) instead of the multi-MB original means
// the hero downloads a ~few-hundred-KB image and the tap reuses that cache — the
// full-screen open is instant (was 5–10s on legacy uncompressed photos, B-207).
// 1600px longest edge matches the app's own client-compression bar and stays
// sharp for a contain fit on any phone.
const EVENT_PHOTO_TRANSFORM = { width: MAX_EDGE_PX, height: MAX_EDGE_PX, resize: 'contain' as const };

interface Attachment {
  id: string;
  local_uri: string;
  storage_path: string;
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// A captured photo's `local_uri` points into the OS cache directory (where
// expo-image-picker drops its output) and is never copied to persistent
// storage. iOS reclaims that directory under storage pressure, leaving a stale
// path whose file no longer exists — which would render the hero <Image> blank.
// Treat a missing local file the same as a hydrated row (no on-device file) so
// rendering falls back to the signed Storage URL, which is always uploaded.
function localFileExists(uri: string): boolean {
  try {
    return new File(uri).exists;
  } catch {
    // Not a managed path (e.g. content:// URI) — assume unavailable and let the
    // signed-URL fallback take over.
    return false;
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

// B-156 PR B4 — the combo cross-link on the detail screen, the larger sibling of
// EventRow's ComboCrossLink. A combo is two independent, cross-linked events (the G2
// model — never merged): each one's detail screen shows a tappable link to the other so
// the "one act" stays legible exactly where the owner lands to edit it. Renders nothing
// when there is nothing to point at (a null label OR no target) — which is how the
// soft-delete drop works: removing the other side nulls the label/target and the link
// vanishes, never dangling at an event gone from History.
function ComboLinkRow({
  label,
  targetEventId,
}: {
  label: string | null;
  targetEventId: string | null | undefined;
}) {
  if (!label || !targetEventId) return null;
  return (
    <TouchableOpacity
      style={styles.comboLink}
      onPress={() => router.push({ pathname: '/event/[id]', params: { id: targetEventId } })}
      activeOpacity={0.7}
      accessibilityRole="link"
      accessibilityLabel={label}
    >
      <Text style={styles.comboLinkText} numberOfLines={1}>{label}</Text>
      <ChevronRight size={16} color={theme.colorAccent} strokeWidth={2} />
    </TouchableOpacity>
  );
}

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { removeFromToday } = useEventStore();
  const { activePet } = usePetStore();

  const [event, setEvent] = useState<TimelineRow | null>(null);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  // Raw (non-transformed) signed URL, resolved in parallel as a fallback for when
  // the transformed URL can't load (image transformations unavailable). B-207.
  const [remoteUrlFull, setRemoteUrlFull] = useState<string | null>(null);
  const [transformFailed, setTransformFailed] = useState(false);
  const [occurredAtSource, setOccurredAtSource] = useState<'manual' | 'exif' | 'now'>('manual');
  const [foodLabel, setFoodLabel] = useState<{ brand: string | null; product: string | null } | null>(null);
  const [intakeRating, setIntakeRating] = useState<IntakeRating | null>(null);
  // Medication (dose) detail — B-117 PR 8. `dose` carries the drug-library display
  // fields; `adherence` is the mutable rating (the intakeRating analog); `doubleDose`
  // is the §6.4 same-drug-too-close check, recomputed after a retroactive edit.
  const [dose, setDose] = useState<{
    genericName: string | null;
    brandName: string | null;
    strength: string | null;
    medicationItemId: string | null;
  } | null>(null);
  const [adherence, setAdherence] = useState<DoseAdherence | null>(null);
  // B-156 Slice B — the dose vehicle (how_given), editable here (the descriptive
  // twin of adherence). Optional/nullable; seeded from the dose row on load.
  const [howGiven, setHowGiven] = useState<DoseVehicle | null>(null);
  const [doubleDose, setDoubleDose] = useState<DoubleDoseResult | null>(null);
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const loadAll = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    // Reset per-event state up-front so navigating from event A → event B
    // doesn't briefly flash A's food label / rating until B's queries return.
    setFoodLabel(null);
    setIntakeRating(null);
    setDose(null);
    setAdherence(null);
    setHowGiven(null);
    setDoubleDose(null);
    setRemoteUrl(null);
    setRemoteUrlFull(null);
    setTransformFailed(false);
    try {
      const row = await getEventById(id);
      setEvent(row);
      if (!row) return;

      const att = await getEventAttachment(id);
      if (att) {
        // Blank a stale local path (cache evicted) so it's indistinguishable
        // from a hydrated '' row — both route to the signed-URL fallback below.
        const usableLocalUri =
          att.local_uri.length > 0 && localFileExists(att.local_uri) ? att.local_uri : '';
        setAttachment({ id: att.id, local_uri: usableLocalUri, storage_path: att.storage_path });
        // Fall back to a signed URL when the local file isn't on this device.
        // Resolve a screen-sized transform (fast) AND the raw URL in parallel; the
        // hero prefers the transform and swaps to raw if it can't load — so image
        // transformations being unavailable degrades to today's behaviour, never a
        // blank photo (B-207). Only the chosen URL is ever downloaded.
        getSignedUrl('nyx-event-attachments', att.storage_path, SIGNED_URL_TTL_SEC, EVENT_PHOTO_TRANSFORM).then(setRemoteUrl).catch(() => {});
        getSignedUrl('nyx-event-attachments', att.storage_path, SIGNED_URL_TTL_SEC).then(setRemoteUrlFull).catch(() => {});
      } else {
        setAttachment(null);
        setRemoteUrl(null);
        setRemoteUrlFull(null);
      }

      if (EVENT_TYPES[row.event_type as EventTypeKey]?.hasFood) {
        const meal = await getMealForEvent(id);
        if (meal) {
          setFoodLabel({ brand: meal.food_brand, product: meal.food_product_name });
          const rating = meal.intake_rating;
          setIntakeRating(
            rating === 'refused' || rating === 'picked' || rating === 'some'
              || rating === 'most' || rating === 'all' ? rating : null,
          );
        }
      }

      if (row.event_type === 'medication') {
        const d = await getDoseForEvent(id);
        if (d) {
          setDose({
            genericName: d.drug_generic_name,
            brandName: d.drug_brand_name,
            strength: d.drug_strength,
            medicationItemId: d.medication_item_id,
          });
          const a = d.adherence;
          const adh: DoseAdherence | null =
            a === 'given' || a === 'partial' || a === 'missed' || a === 'refused' ? a : null;
          setAdherence(adh);
          // Coerce the loose TEXT how_given to the closed vehicle union via the
          // single shared narrower; an unrecognized/legacy value reads as null
          // (renders clean), never a raw token.
          setHowGiven(asDoseVehicle(d.how_given));
          // B-135 (§6.4) — surface a calm check if this given dose sits too close to
          // another given dose of the same drug. Computed from per-dose occurred_at.
          // Own try/catch so a check failure doesn't abort the dose load or mislabel
          // as a generic load error — the note simply won't show.
          try {
            setDoubleDose(await getDoubleDoseFlag({
              eventId: id,
              petId: row.pet_id,
              medicationItemId: d.medication_item_id,
              occurredAt: row.occurred_at,
              adherence: adh,
            }));
          } catch (e) {
            console.warn('[event-detail] double-dose check failed:', e);
          }
        }
      }

      getEventSource(id).then(setOccurredAtSource).catch(() => {});
    } catch (e) {
      console.error('[event-detail] load failed:', e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { loadAll(); }, [loadAll]));

  async function handleIntakeChange(next: IntakeRating | null) {
    if (!event) return;
    const prev = intakeRating;
    // Optimistic update — keep the screen responsive while the write happens.
    setIntakeRating(next);
    try {
      await updateMealIntake(event.id, next);
      syncPendingMeals().catch(console.error);
    } catch (e) {
      console.error('[event-detail] failed to update intake rating:', e);
      setIntakeRating(prev);
      Alert.alert('Could not save', 'Try again in a moment.');
    }
  }

  // Retroactive adherence edit (B-117 PR 8) — the dose twin of handleIntakeChange.
  // Single-select with no clear-to-null (a logged dose always has a state), so a tap
  // on the active chip is a no-op. After persisting, re-run the double-dose check:
  // downgrading away from 'given' clears it; changing back to 'given' can re-surface
  // it (§6.4 must track the live adherence, never go stale on an edit).
  async function handleAdherenceChange(next: DoseAdherence) {
    if (!event || !dose) return;
    const prev = adherence;
    if (next === prev) return;
    setAdherence(next);
    try {
      await updateDoseAdherence(event.id, next);
      syncPendingMedicationAdministrations().catch(console.error);
    } catch (e) {
      console.error('[event-detail] failed to update adherence:', e);
      setAdherence(prev);
      Alert.alert('Could not save', 'Try again in a moment.');
      return;
    }
    // The write succeeded — recompute the §6.4 check INDEPENDENTLY. A failure here is
    // a display miss (a possibly-stale note), never data loss, so it must not revert
    // the persisted adherence; eat it rather than rolling back a good write.
    getDoubleDoseFlag({
      eventId: event.id,
      petId: event.pet_id,
      medicationItemId: dose.medicationItemId,
      occurredAt: event.occurred_at,
      adherence: next,
    }).then(setDoubleDose).catch((e) => console.warn('[event-detail] double-dose recheck failed:', e));
  }

  // Retroactive vehicle edit (B-156 Slice B) — the descriptive twin of
  // handleAdherenceChange. Optional + clearable (tapping the active chip passes
  // null), no double-dose recompute (the vehicle has no timing/safety meaning).
  async function handleVehicleChange(next: DoseVehicle | null) {
    if (!event || !dose) return;
    const prev = howGiven;
    if (next === prev) return;
    setHowGiven(next);
    try {
      await updateDoseHowGiven(event.id, next);
      syncPendingMedicationAdministrations().catch(console.error);
    } catch (e) {
      console.error('[event-detail] failed to update vehicle:', e);
      setHowGiven(prev);
      Alert.alert('Could not save', 'Try again in a moment.');
    }
  }

  function handleEdit() {
    if (!event) return;
    router.push({
      pathname: '/edit-event',
      params: {
        id: event.id,
        type: event.event_type,
        occurredAt: event.occurred_at,
        notes: event.notes ?? '',
      },
    });
  }

  function handleDelete() {
    if (!event) return;
    Alert.alert(
      'Remove this log?',
      `This will remove the ${EVENT_TYPES[event.event_type as EventTypeKey]?.label ?? 'event'} from history.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await softDeleteEvent(event.id);
              removeFromToday(event.id);
              syncPendingEvents().catch(console.error);
              router.back();
            } catch (e) {
              console.error('[event-detail] delete failed:', e);
              Alert.alert('Could not remove', 'Try again.');
            }
          },
        },
      ],
    );
  }

  async function handleAddPhoto() {
    Alert.alert('Add photo', 'Choose a source', [
      {
        text: 'Take photo',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') { Alert.alert('Camera access needed'); return; }
          launchPicker('camera');
        },
      },
      { text: 'Choose from library', onPress: () => launchPicker('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function handleRemovePhoto() {
    if (!attachment) return;
    Alert.alert(
      'Remove photo?',
      'The photo will be detached from this event.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const att = attachment;
            // Optimistic UI: clear immediately, restore on failure
            setAttachment(null);
            setRemoteUrl(null);
            setRemoteUrlFull(null);
            setTransformFailed(false);
            setPhotoViewerVisible(false);
            try {
              await deleteEventAttachmentLocal(att.id);
              // Best-effort remote cleanup; ignore errors (next sync of this
              // device's local state will be authoritative)
              supabase.storage.from('nyx-event-attachments').remove([att.storage_path]).catch(() => {});
              supabase.from('event_attachments').delete().eq('id', att.id).then(() => {}, () => {});
            } catch (e) {
              console.error('[event-detail] remove photo failed:', e);
              setAttachment(att);
              // Re-resolve the signed URLs the optimistic remove cleared, so a
              // remote-only photo reappears (not just the local-file case). B-207.
              setTransformFailed(false);
              getSignedUrl('nyx-event-attachments', att.storage_path, SIGNED_URL_TTL_SEC, EVENT_PHOTO_TRANSFORM).then(setRemoteUrl).catch(() => {});
              getSignedUrl('nyx-event-attachments', att.storage_path, SIGNED_URL_TTL_SEC).then(setRemoteUrlFull).catch(() => {});
              Alert.alert('Could not remove', 'Try again.');
            }
          },
        },
      ],
    );
  }

  async function launchPicker(source: 'camera' | 'library') {
    if (!event) return;
    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.85,
      exif: false,
    };
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts);
    if (result.canceled || !result.assets[0]) return;

    const captureUri = result.assets[0].uri;
    const attId = uuid();
    const storagePath = `${event.pet_id}/${event.id}/${attId}.jpg`;
    const now = new Date().toISOString();
    setUploadingPhoto(true);
    try {
      // B-104 — copy the capture off the OS cache directory (reclaimed under
      // storage pressure) into the app-owned document directory, and store THAT
      // as local_uri so the on-device copy survives. Compression/upload still
      // read the original capture; both point at identical bytes.
      const localUri = persistCapture(captureUri, `${attId}.jpg`);
      const db = getDb();
      await db.runAsync(
        `INSERT OR REPLACE INTO event_attachments
           (id, event_id, pet_id, local_uri, storage_path, mime_type, synced, created_at)
         VALUES (?, ?, ?, ?, ?, 'image/jpeg', 0, ?)`,
        [attId, event.id, event.pet_id, localUri, storagePath, now],
      );
      setAttachment({ id: attId, local_uri: localUri, storage_path: storagePath });
      // Compress before upload (≤1600px, q75) so the file stays under Claude's
      // 5 MB cap — also the recovery path for a historic event whose original
      // full-size photo is too large to analyze.
      const uploadUri = await compressForUpload(captureUri);
      // Fire-and-forget upload; sync retries on reconnect if it fails
      uploadPhoto('nyx-event-attachments', storagePath, uploadUri)
        .then(async () => {
          const { error } = await supabase.from('event_attachments').upsert(
            { id: attId, event_id: event.id, pet_id: event.pet_id, storage_path: storagePath, mime_type: 'image/jpeg' },
            { onConflict: 'id' },
          );
          // supabase-js returns the error rather than throwing — only flag
          // synced when the row truly landed, else leave it for the retry queue.
          if (error) { console.warn('[event-detail] attachment upsert failed:', error.message); return; }
          await db.runAsync('UPDATE event_attachments SET synced = 1 WHERE id = ?', [attId]);
          // Re-analyze a vomit event whose photo just changed (e.g. replacing an
          // oversized historic photo with a compressed one).
          if (event.event_type === 'vomit') triggerVomitAnalysis(event.id).catch(() => {});
        })
        .catch(console.error);
    } catch (e) {
      console.error('[event-detail] photo save failed:', e);
      Alert.alert('Could not attach photo', 'Try again.');
    } finally {
      setUploadingPhoto(false);
    }
  }

  if (loading && !event) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingState}><ActivityIndicator /></View>
      </SafeAreaView>
    );
  }

  if (!event) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header leading="back" onLeadingPress={() => router.back()} />
        <View style={styles.loadingState}>
          <Text style={styles.emptyTitle}>Event not found</Text>
          <Text style={styles.emptyBody}>It may have been removed.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const config = EVENT_TYPES[event.event_type as EventTypeKey];
  const label = config?.label ?? 'Event';
  const timeDisplay = describeOccurredAt({
    confidence: event.occurred_at_confidence as 'witnessed' | 'estimated' | 'window' | null,
    occurredAt: event.occurred_at,
    earliest: event.occurred_at_earliest,
    latest: event.occurred_at_latest,
  });
  // FR-10 (B-054): a hydrated attachment row carries an empty local_uri (no
  // on-device file) — fall back to the signed Storage URL rather than handing
  // an empty string to <Image>.
  const localUri = attachment?.local_uri && attachment.local_uri.length > 0 ? attachment.local_uri : null;
  // Meals' clinical artifact is the food name, not a photo — never beg for one
  // (Dr. Chen + Jordan, on-device review). If a meal has a photo, the hero renders.
  const isMeal = event.event_type === 'meal';
  // Which photo the hero + viewer render, and whether to show the add-photo empty
  // state. Pure + unit-tested in lib/eventPhoto.ts (transform→raw fallback; never
  // flashes an add-photo target over an existing photo mid-fallback). B-207.
  const { photoUri, showEmptyHero } = resolveEventPhotoDisplay({
    localUri,
    remoteUrl,
    remoteUrlFull,
    transformFailed,
    isMeal,
    hasAttachment: !!attachment,
  });
  // Medication dose display (B-117 PR 8). Generic name leads (the clinical
  // identifier); brand + strength form the secondary line. Falls back to the bare
  // type label if the drug's library row hasn't hydrated on this device.
  const isMedication = event.event_type === 'medication';
  const drugPrimary = dose?.genericName ?? label;
  const drugSecondary = dose
    ? [dose.brandName, dose.strength].filter(Boolean).join(' · ') || null
    : null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header
        leading="back"
        title={label}
        onLeadingPress={() => router.back()}
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Hero photo — present when a photo exists; on symptom events without
            a photo, an empty-state tap-to-add hero. Meals skip the empty hero. */}
        {photoUri ? (
          <TouchableOpacity activeOpacity={0.95} onPress={() => setPhotoViewerVisible(true)}>
            <Image
              source={{ uri: photoUri }}
              style={styles.hero}
              resizeMode="cover"
              onError={() => {
                // The transformed URL failed to load (image transformations
                // likely unavailable) — latch to the raw original so the photo
                // still shows. The viewer reads the same photoUri, so it inherits
                // the fallback. B-207.
                if (photoUri === remoteUrl && !transformFailed) setTransformFailed(true);
              }}
            />
          </TouchableOpacity>
        ) : showEmptyHero ? (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleAddPhoto}
            style={styles.heroEmpty}
            disabled={uploadingPhoto}
          >
            {uploadingPhoto ? (
              <ActivityIndicator />
            ) : (
              <>
                {/* B-062 — Lucide Camera (was a 📷 emoji) for a consistent vector
                    glyph set across the photo-affordance empty states. */}
                <Camera size={32} color={theme.colorTextTertiary} strokeWidth={1.5} />
                <Text style={styles.heroEmptyText}>Add photo</Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}

        {/* Body */}
        <View style={styles.body}>
          <Text style={styles.typeLabel}>{label.toUpperCase()}</Text>
          <Text style={styles.dateBig}>{formatDate(event.occurred_at)}</Text>
          <Text style={styles.timeRow}>
            {timeDisplay.primary}
            {timeDisplay.isExact ? ` · ${formatRelative(event.occurred_at)}` : ''}
          </Text>
          {/* B-010 — when the time wasn't witnessed, say so plainly. Honest, not
              alarming (Designer / Dr. Chen): the report must never present a
              found time as a clinically-exact one. */}
          {timeDisplay.tag ? (
            <Text style={styles.confidenceNote}>
              {timeDisplay.tag === 'estimated'
                ? 'Estimated — not witnessed'
                : 'Found, not witnessed'}
            </Text>
          ) : null}
          {/* EXIF attribution only when the time is exact: a found event's photo
              is stamped at discovery, not occurrence, so the window/estimate
              already carries the meaning here. */}
          {occurredAtSource === 'exif' && timeDisplay.isExact ? (
            <Text style={styles.exifAttribution}>
              {formatExifAttribution(event.occurred_at)}
            </Text>
          ) : null}

          {event.event_type === 'vomit' ? (
            <VomitAnalysisSection eventId={event.id} />
          ) : null}

          {foodLabel && (foodLabel.brand || foodLabel.product) ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>FOOD</Text>
              {foodLabel.product ? <Text style={styles.foodProduct}>{foodLabel.product}</Text> : null}
              {foodLabel.brand ? <Text style={styles.foodBrand}>{foodLabel.brand}</Text> : null}
            </View>
          ) : null}

          {isMeal ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>INTAKE</Text>
              <IntakeChipRow
                value={intakeRating}
                onChange={handleIntakeChange}
                label={null}
              />
            </View>
          ) : null}

          {/* B-156 PR B4 — vehicle → dose cross-link. On a meal/treat that carried a
              co-logged dose, a tap opens that dose (where its adherence is edited). The
              two events are edited independently (G2); this keeps the combo legible
              without merging them. Drops cleanly if the only paired dose is removed. */}
          {isMeal ? (
            <ComboLinkRow
              label={pairedDoseLinkLabel({
                count: event.paired_dose_count ?? 0,
                drugName: event.paired_dose_drug_name,
              })}
              targetEventId={event.paired_dose_event_id}
            />
          ) : null}

          {isMedication && dose ? (
            <>
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>MEDICATION</Text>
                {/* The drug name/strength links to the drug-library screen where a
                    correction (fixing a mis-extracted strength) fixes every dose of
                    that drug at once — the only path to that edit from History. Only
                    a library-backed dose has a target; a free-text dose (null
                    medication_item_id) renders the same text, non-tappable. */}
                {dose.medicationItemId ? (
                  <TouchableOpacity
                    style={styles.drugLibraryLink}
                    onPress={() => router.push(`/medication/${dose.medicationItemId}`)}
                    activeOpacity={0.7}
                    accessibilityRole="link"
                    accessibilityLabel={`View drug details for ${drugPrimary}`}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.foodProduct}>{drugPrimary}</Text>
                      {drugSecondary ? <Text style={styles.foodBrand}>{drugSecondary}</Text> : null}
                    </View>
                    <ChevronRight size={18} color={theme.colorAccent} strokeWidth={2} />
                  </TouchableOpacity>
                ) : (
                  <>
                    <Text style={styles.foodProduct}>{drugPrimary}</Text>
                    {drugSecondary ? <Text style={styles.foodBrand}>{drugSecondary}</Text> : null}
                  </>
                )}
                {/* B-156 PR B4 — dose → vehicle cross-link. On a dose given inside a
                    meal/treat, a tap opens that vehicle (where its intake is edited).
                    Drops cleanly if the vehicle is soft-deleted (paired_food_name nulls). */}
                <ComboLinkRow
                  label={pairedVehicleLinkLabel(event.paired_food_name)}
                  targetEventId={event.paired_event_id}
                />
              </View>
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>ADHERENCE</Text>
                <AdherenceChipRow
                  value={adherence}
                  onChange={handleAdherenceChange}
                  label={null}
                />
                {/* B-156 PR B3 — the calm resurface note for an in-doubt combo dose:
                    the vehicle was marked not-finished (refused/picked) and the dose is
                    still unconfirmed (null adherence). Sits directly under the chips so
                    "confirm above" points at them. Derived live from the event's paired
                    vehicle + the current adherence, so tapping a chip clears it at once.
                    Never reassures, never softens to "fussy" (clinical-guardrails). */}
                {isComboDoseInDoubt({
                  isCombo: !!event.paired_event_id,
                  vehicleIntake: event.paired_vehicle_intake,
                  adherence,
                }) ? (
                  <View style={styles.inDoubtNote}>
                    <Text style={styles.inDoubtNoteText}>
                      {doseInDoubtNote({
                        petName: activePet?.name ?? 'your pet',
                        foodName: event.paired_food_name,
                      })}
                    </Text>
                  </View>
                ) : null}
              </View>
              {/* B-156 Slice B — the dose vehicle, editable retroactively. Optional:
                  the chips start empty when nothing was recorded, and the owner can
                  set or clear it any time. Descriptive, never a safety verdict. */}
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>HOW GIVEN</Text>
                <VehicleChipRow
                  value={howGiven}
                  onChange={handleVehicleChange}
                  label={null}
                />
              </View>
              {/* B-135 (§6.4) — a calm, non-alarming double-dose check. Never an
                  alarm: it points the owner to look, and the Edit/Remove actions
                  below are how they fix a mistaken log. */}
              {doubleDose?.conflict ? (
                <View style={styles.doubleDoseNote}>
                  <Text style={styles.doubleDoseText}>
                    {doubleDoseNote({ drugName: dose.genericName, gapMinutes: doubleDose.gapMinutes ?? 0 })}
                  </Text>
                </View>
              ) : null}
            </>
          ) : null}

          {event.notes ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>NOTES</Text>
              <Text style={styles.notes}>{event.notes}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* Bottom actions — Edit is the filled primary; Remove is a subordinate,
          destructive text action below it (PM call: a single secondary action
          doesn't justify a ⋯ menu). Spacing + text-only treatment keep the
          destructive action from reading as a peer of Edit. */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.editButton} onPress={handleEdit} activeOpacity={0.85}>
          <Text style={styles.editButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.removeButton}
          onPress={handleDelete}
          activeOpacity={0.7}
          hitSlop={8}
        >
          <Text style={styles.removeButtonText}>Remove</Text>
        </TouchableOpacity>
      </View>

      {/* Fullscreen photo viewer */}
      <PhotoViewer
        visible={photoViewerVisible}
        uris={[photoUri ?? null]}
        onClose={() => setPhotoViewerVisible(false)}
        onReplace={() => { setPhotoViewerVisible(false); handleAddPhoto(); }}
        onRemove={handleRemovePhoto}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorSurface,
  },
  scroll: {
    paddingBottom: theme.space5,
  },
  hero: {
    width: '100%',
    height: HERO_HEIGHT,
    backgroundColor: theme.colorNeutralLight,
  },
  heroEmpty: {
    width: '100%',
    height: HERO_HEIGHT,
    backgroundColor: theme.colorNeutralLight,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.colorBorder,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.space1,
  },
  heroEmptyText: {
    fontSize: 15,
    color: theme.colorTextSecondary,
    fontWeight: theme.fontWeightMedium,
  },
  body: {
    paddingHorizontal: theme.space3,
    paddingTop: theme.space3,
  },
  typeLabel: {
    fontSize: theme.textXS,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextSecondary,
    letterSpacing: theme.trackingWidest,
    marginBottom: theme.space1,
  },
  dateBig: {
    fontSize: theme.text2XL,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    letterSpacing: theme.trackingTight,
  },
  timeRow: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    marginTop: 4,
  },
  exifAttribution: {
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
    marginTop: 2,
  },
  confidenceNote: {
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
    marginTop: 2,
  },
  section: {
    marginTop: theme.space3,
  },
  sectionLabel: {
    fontSize: theme.textXS,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextSecondary,
    letterSpacing: theme.trackingWidest,
    marginBottom: theme.space1,
  },
  foodProduct: {
    fontSize: theme.textLG,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextPrimary,
  },
  foodBrand: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    marginTop: 2,
  },
  // The drug-name row as a link to the drug-library screen. Row layout so the
  // chevron sits at the trailing edge; minHeight clears the 44pt tap-target floor
  // without padding overshoot over the two-line name/strength block.
  drugLibraryLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    minHeight: 44,
  },
  // The combo cross-link (B-156 PR B4). Accent text + chevron so it reads as a
  // navigation affordance to the paired event. alignSelf flex-start so the tap target
  // hugs the label; minHeight clears the 44pt floor without padding overshoot; maxWidth
  // truncates a long food name at the body edge rather than overflowing.
  comboLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spaceMicro,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    marginTop: theme.space1,
    minHeight: 44,
  },
  comboLinkText: {
    fontSize: theme.textMD,
    color: theme.colorAccent,
    fontWeight: theme.fontWeightMedium,
    flexShrink: 1,
  },
  notes: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
    lineHeight: theme.lineHeightBody,
  },
  // Calm informational box for the §6.4 double-dose check — matches the
  // read-only banner treatment (neutral surface, secondary text), deliberately
  // NOT the rose symptom tint: a gentle heads-up, never an alarm (Principle 4).
  doubleDoseNote: {
    marginTop: theme.space3,
    backgroundColor: theme.colorNeutralLight,
    borderRadius: theme.radiusSmall,
    padding: theme.space2,
  },
  doubleDoseText: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
  },
  // The in-doubt resurface note (B-156 PR B3). A soft-rose box — the same calm concern
  // register as the History "Unconfirmed" tag and the adherence chips' downgrade colour,
  // so the two surfaces agree — but never an alarm (no icon, no exclamation; Principle 4).
  inDoubtNote: {
    marginTop: theme.space2,
    backgroundColor: theme.colorEventSymptomLight,
    borderRadius: theme.radiusSmall,
    padding: theme.space2,
  },
  inDoubtNoteText: {
    fontSize: theme.textSM,
    color: theme.colorTextPrimary,
    lineHeight: theme.lineHeightBody,
  },
  footer: {
    paddingHorizontal: theme.space3,
    paddingTop: theme.space2,
    paddingBottom: theme.space3,
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
    backgroundColor: theme.colorSurface,
  },
  editButton: {
    backgroundColor: theme.colorNeutralDark,
    borderRadius: theme.radiusSmall,
    paddingVertical: 14,
    alignItems: 'center',
  },
  editButtonText: {
    fontSize: theme.textMD,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextOnDark,
  },
  removeButton: {
    marginTop: theme.space1,
    paddingVertical: theme.space1,
    alignItems: 'center',
  },
  removeButtonText: {
    fontSize: theme.textMD,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorDestructive,
  },
  loadingState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.space1,
  },
  emptyTitle: {
    fontSize: theme.textLG,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextPrimary,
  },
  emptyBody: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
  },
});
