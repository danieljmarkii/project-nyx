import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Image, Alert, Modal, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { theme } from '../../constants/theme';
import { EVENT_TYPES, EventTypeKey } from '../../constants/eventTypes';
import {
  getDb,
  getEventById,
  getEventAttachment,
  getEventSource,
  getMealForEvent,
  softDeleteEvent,
  deleteEventAttachmentLocal,
  updateMealIntake,
  TimelineRow,
} from '../../lib/db';
import { uploadPhoto, getSignedUrl, compressForUpload } from '../../lib/storage';
import { supabase } from '../../lib/supabase';
import { syncPendingEvents, syncPendingMeals } from '../../lib/sync';
import { triggerVomitAnalysis } from '../../lib/analysis';
import { useEventStore } from '../../store/eventStore';
import { uuid, formatExifAttribution, describeOccurredAt } from '../../lib/utils';
import { IntakeChipRow, IntakeRating } from '../../components/log/IntakeChipRow';
import { VomitAnalysisSection } from '../../components/event/VomitAnalysisSection';
import { PhotoViewer } from '../../components/ui';

const HERO_HEIGHT = 320;

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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { removeFromToday } = useEventStore();

  const [event, setEvent] = useState<TimelineRow | null>(null);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  const [occurredAtSource, setOccurredAtSource] = useState<'manual' | 'exif' | 'now'>('manual');
  const [foodLabel, setFoodLabel] = useState<{ brand: string | null; product: string | null } | null>(null);
  const [intakeRating, setIntakeRating] = useState<IntakeRating | null>(null);
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);
  const [actionsVisible, setActionsVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const loadAll = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    // Reset per-event state up-front so navigating from event A → event B
    // doesn't briefly flash A's food label / rating until B's queries return.
    setFoodLabel(null);
    setIntakeRating(null);
    try {
      const row = await getEventById(id);
      setEvent(row);
      if (!row) return;

      const att = await getEventAttachment(id);
      if (att) {
        setAttachment({ id: att.id, local_uri: att.local_uri, storage_path: att.storage_path });
        // Fallback to signed URL when the local file isn't available on this device
        getSignedUrl('nyx-event-attachments', att.storage_path).then(setRemoteUrl).catch(() => {});
      } else {
        setAttachment(null);
        setRemoteUrl(null);
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

  function handleEdit() {
    if (!event) return;
    setActionsVisible(false);
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
    setActionsVisible(false);
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

    const localUri = result.assets[0].uri;
    const attId = uuid();
    const storagePath = `${event.pet_id}/${event.id}/${attId}.jpg`;
    const now = new Date().toISOString();
    setUploadingPhoto(true);
    try {
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
      const uploadUri = await compressForUpload(localUri);
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
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.backText}>‹ History</Text>
          </TouchableOpacity>
        </View>
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
  const photoUri = localUri ?? remoteUrl;
  // Meals' clinical artifact is the food name, not a photo. Don't show an
  // empty-state hero begging for one — flagged by Dr. Chen + Jordan during
  // on-device review. If a meal happens to have a photo, the hero still renders.
  const isMeal = event.event_type === 'meal';
  const showEmptyHero = !photoUri && !isMeal;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Text style={styles.backText}>‹ History</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setActionsVisible(true)} hitSlop={12} style={styles.moreBtn}>
          <Text style={styles.moreText}>•••</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Hero photo — present when a photo exists; on symptom events without
            a photo, an empty-state tap-to-add hero. Meals skip the empty hero. */}
        {photoUri ? (
          <TouchableOpacity activeOpacity={0.95} onPress={() => setPhotoViewerVisible(true)}>
            <Image source={{ uri: photoUri }} style={styles.hero} resizeMode="cover" />
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
                <Text style={styles.heroEmptyIcon}>📷</Text>
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

          {event.notes ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>NOTES</Text>
              <Text style={styles.notes}>{event.notes}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* Edit button — bottom action, jumps to the existing edit form */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.editButton} onPress={handleEdit} activeOpacity={0.85}>
          <Text style={styles.editButtonText}>Edit</Text>
        </TouchableOpacity>
      </View>

      {/* Actions sheet (Edit / Delete) */}
      <Modal
        visible={actionsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setActionsVisible(false)}
      >
        <TouchableOpacity
          style={styles.sheetBackdrop}
          activeOpacity={1}
          onPress={() => setActionsVisible(false)}
        >
          <View style={styles.sheet}>
            <TouchableOpacity style={styles.sheetItem} onPress={handleDelete}>
              <Text style={[styles.sheetItemText, styles.sheetItemDestructive]}>Remove</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.space3,
    paddingVertical: theme.space1,
    height: 44,
  },
  backBtn: {},
  backText: {
    fontSize: 16,
    color: theme.colorAccent,
    fontWeight: theme.fontWeightMedium,
  },
  moreBtn: {},
  moreText: {
    fontSize: 18,
    color: theme.colorTextPrimary,
    fontWeight: theme.fontWeightMedium,
    letterSpacing: 1,
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
  heroEmptyIcon: {
    fontSize: 32,
    opacity: 0.5,
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
  notes: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
    lineHeight: 22,
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
    color: '#fff',
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
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colorSurface,
    margin: theme.space2,
    borderRadius: theme.radiusMedium,
    overflow: 'hidden',
  },
  sheetItem: {
    paddingVertical: theme.space2,
    paddingHorizontal: theme.space3,
    alignItems: 'center',
  },
  sheetItemText: {
    fontSize: 17,
    color: theme.colorAccent,
    fontWeight: theme.fontWeightMedium,
  },
  sheetItemDestructive: {
    color: theme.colorEventSymptom,
  },
});
