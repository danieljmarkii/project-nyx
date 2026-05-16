import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, KeyboardAvoidingView, Platform, Image, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { theme } from '../constants/theme';
import { EVENT_TYPES, EventTypeKey } from '../constants/eventTypes';
import { getDb, updateEvent, updateMealFood, getMealForEvent, getEventAttachment } from '../lib/db';
import { syncPendingEvents, syncPendingMeals, syncPendingAttachments } from '../lib/sync';
import { uploadPhoto } from '../lib/storage';
import { useEventStore } from '../store/eventStore';
import { uuid } from '../lib/utils';

interface CachedFood {
  id: string;
  brand: string;
  product_name: string;
  format: string;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function EditEventModal() {
  const { id, type, occurredAt: occurredAtParam, notes: notesParam } =
    useLocalSearchParams<{
      id: string;
      type: string;
      occurredAt: string;
      notes?: string;
    }>();

  const { patchInToday } = useEventStore();

  const eventType = type as EventTypeKey;
  const config = EVENT_TYPES[eventType] ?? { label: 'Event', hasSeverity: false, hasFood: false };

  const [occurredAt, setOccurredAt] = useState(() =>
    occurredAtParam ? new Date(occurredAtParam) : new Date(),
  );
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [notes, setNotes] = useState(notesParam ?? '');

  // Photo attachment
  const [existingAttachmentUri, setExistingAttachmentUri] = useState<string | null>(null);
  const [newAttachmentUri, setNewAttachmentUri] = useState<string | null>(null);

  // Meal food state
  const [currentFoodId, setCurrentFoodId] = useState<string | null>(null);
  const [currentFoodBrand, setCurrentFoodBrand] = useState<string | null>(null);
  const [currentFoodProduct, setCurrentFoodProduct] = useState<string | null>(null);
  const [showFoodPicker, setShowFoodPicker] = useState(false);
  const [foods, setFoods] = useState<CachedFood[]>([]);

  const [saving, setSaving] = useState(false);

  // Load existing meal food and photo attachment on mount
  useEffect(() => {
    if (!id) return;

    if (config.hasFood) {
      getMealForEvent(id).then((meal) => {
        if (meal) {
          setCurrentFoodId(meal.food_item_id);
          setCurrentFoodBrand(meal.food_brand);
          setCurrentFoodProduct(meal.food_product_name);
        }
      }).catch(console.error);
    }

    getEventAttachment(id).then((att) => {
      if (att) setExistingAttachmentUri(att.local_uri);
    }).catch(console.error);
  }, [id]);

  useEffect(() => {
    if (!showFoodPicker) return;
    loadFoods();
  }, [showFoodPicker]);

  async function loadFoods() {
    const db = getDb();
    const rows = await db.getAllAsync<CachedFood>(
      `SELECT id, brand, product_name, format
       FROM food_items_cache
       GROUP BY LOWER(brand), LOWER(product_name)
       ORDER BY MAX(COALESCE(last_used_at, '')) DESC, brand ASC
       LIMIT 30`,
    );
    setFoods(rows);
  }

  async function handlePickPhoto() {
    Alert.alert('Attach photo', 'Choose a source', [
      {
        text: 'Take photo',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') { Alert.alert('Camera access needed'); return; }
          launchPhotoPicker('camera');
        },
      },
      { text: 'Choose from library', onPress: () => launchPhotoPicker('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function launchPhotoPicker(source: 'camera' | 'library') {
    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.85,
      exif: false,
    };
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts);
    if (!result.canceled && result.assets[0]) {
      setNewAttachmentUri(result.assets[0].uri);
    }
  }

  async function handleSave() {
    if (!id) return;
    setSaving(true);
    try {
      await updateEvent(id, {
        occurred_at: occurredAt.toISOString(),
        severity: null,
        notes: notes.trim() || null,
      });

      if (config.hasFood && currentFoodId) {
        await updateMealFood(id, currentFoodId);
      }

      // Persist new photo attachment if one was selected
      if (newAttachmentUri) {
        const db = getDb();
        const petResult = await db.getFirstAsync<{ pet_id: string }>(
          'SELECT pet_id FROM events WHERE id = ?', [id],
        );
        if (petResult) {
          const attId = uuid();
          const storagePath = `${petResult.pet_id}/${id}/${attId}.jpg`;
          const now = new Date().toISOString();
          await db.runAsync(
            `INSERT OR REPLACE INTO event_attachments
               (id, event_id, pet_id, local_uri, storage_path, mime_type, synced, created_at)
             VALUES (?, ?, ?, ?, ?, 'image/jpeg', 0, ?)`,
            [attId, id, petResult.pet_id, newAttachmentUri, storagePath, now],
          );
          uploadPhoto('nyx-event-attachments', storagePath, newAttachmentUri)
            .then(async () => {
              const { supabase } = await import('../lib/supabase');
              await supabase.from('event_attachments').upsert(
                { id: attId, event_id: id, pet_id: petResult.pet_id, storage_path: storagePath, mime_type: 'image/jpeg' },
                { onConflict: 'id' },
              );
              await db.runAsync('UPDATE event_attachments SET synced = 1 WHERE id = ?', [attId]);
            })
            .catch(console.error);
        }
      }

      patchInToday(id, {
        occurred_at: occurredAt.toISOString(),
        severity: null,
        notes: notes.trim() || null,
        food_item_id: currentFoodId,
        food_brand: currentFoodBrand,
        food_product_name: currentFoodProduct,
      });

      syncPendingEvents().then(() => syncPendingMeals()).then(() => syncPendingAttachments()).catch(console.error);
      router.back();
    } catch (e) {
      console.error('[edit-event] save failed:', e);
      Alert.alert('Could not save', 'Something went wrong. Try again.');
    } finally {
      setSaving(false);
    }
  }

  const displayAttachmentUri = newAttachmentUri ?? existingAttachmentUri;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.cancelBtn} hitSlop={8}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit {config.label}</Text>
        <TouchableOpacity
          onPress={handleSave}
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          disabled={saving}
          hitSlop={8}
        >
          <Text style={styles.saveBtnText}>Save</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">

          {/* Time */}
          <Text style={styles.fieldLabel}>Time</Text>
          <TouchableOpacity
            style={styles.timeRow}
            onPress={() => setShowTimePicker(!showTimePicker)}
            activeOpacity={0.7}
          >
            <Text style={styles.timeValue}>
              {occurredAt.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
              {'  '}
              {formatTime(occurredAt)}
            </Text>
            <Text style={styles.changeLabel}>Change</Text>
          </TouchableOpacity>
          {showTimePicker && (
            <DateTimePicker
              value={occurredAt}
              mode="datetime"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              maximumDate={new Date()}
              onChange={(_e: unknown, date?: Date) => {
                if (Platform.OS === 'android') setShowTimePicker(false);
                if (date) setOccurredAt(date);
              }}
            />
          )}

          {/* Photo */}
          <Text style={[styles.fieldLabel, { marginTop: theme.space3 }]}>Photo</Text>
          {displayAttachmentUri ? (
            <TouchableOpacity style={styles.photoAttachedRow} onPress={handlePickPhoto} activeOpacity={0.8}>
              <Image source={{ uri: displayAttachmentUri }} style={styles.photoThumb} resizeMode="cover" />
              <View style={styles.photoAttachedMeta}>
                <Text style={styles.photoAttachedText}>Photo attached</Text>
                <Text style={styles.photoChangeText}>Tap to replace</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.photoRow} onPress={handlePickPhoto} activeOpacity={0.7}>
              <Text style={styles.photoRowIcon}>📷</Text>
              <Text style={styles.photoRowText}>Attach a photo</Text>
            </TouchableOpacity>
          )}

          {/* Food (meal events only) */}
          {config.hasFood ? (
            <>
              <Text style={[styles.fieldLabel, { marginTop: theme.space3 }]}>Food</Text>
              <TouchableOpacity
                style={styles.foodRow}
                onPress={() => setShowFoodPicker(!showFoodPicker)}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  {currentFoodProduct ? (
                    <>
                      <Text style={styles.foodProduct}>{currentFoodProduct}</Text>
                      {currentFoodBrand ? (
                        <Text style={styles.foodBrand}>{currentFoodBrand}</Text>
                      ) : null}
                    </>
                  ) : (
                    <Text style={styles.foodPlaceholder}>No food selected</Text>
                  )}
                </View>
                <Text style={styles.changeLabel}>{showFoodPicker ? 'Done' : 'Change'}</Text>
              </TouchableOpacity>

              {showFoodPicker ? (
                <View style={styles.foodList}>
                  {foods.length === 0 ? (
                    <Text style={styles.foodEmpty}>No foods in library.</Text>
                  ) : null}
                  {foods.map((item: CachedFood) => {
                    const isSelected = item.id === currentFoodId;
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={[styles.foodItem, isSelected && styles.foodItemSelected]}
                        onPress={() => {
                          setCurrentFoodId(item.id);
                          setCurrentFoodBrand(item.brand);
                          setCurrentFoodProduct(item.product_name);
                          setShowFoodPicker(false);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.foodItemName, isSelected && styles.foodItemNameSelected]}>
                          {item.product_name}
                        </Text>
                        <Text style={[styles.foodItemBrand, isSelected && styles.foodItemBrandSelected]}>
                          {item.brand}
                        </Text>
                        {isSelected ? <Text style={styles.foodItemCheck}>✓</Text> : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}
            </>
          ) : null}

          {/* Notes */}
          <Text style={[styles.fieldLabel, { marginTop: theme.space3 }]}>Notes</Text>
          <TextInput
            style={styles.notesInput}
            placeholder="Add a note (optional)"
            placeholderTextColor={theme.colorTextSecondary}
            value={notes}
            onChangeText={setNotes}
            multiline
            maxLength={300}
          />

        </ScrollView>
      </KeyboardAvoidingView>
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
    paddingVertical: theme.space2,
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorNeutralDark,
  },
  cancelBtn: {},
  cancelBtnText: {
    fontSize: 16,
    color: theme.colorTextSecondary,
  },
  saveBtn: {},
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: {
    fontSize: 16,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorAccent,
  },
  form: {
    padding: theme.space3,
    paddingBottom: theme.space6,
    gap: theme.space1,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.space2,
    paddingHorizontal: theme.space2,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    backgroundColor: theme.colorNeutralLight,
  },
  timeValue: {
    fontSize: 15,
    color: theme.colorTextPrimary,
  },
  changeLabel: {
    fontSize: 14,
    color: theme.colorAccent,
    fontWeight: theme.fontWeightMedium,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    paddingVertical: theme.space2,
    paddingHorizontal: theme.space2,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    backgroundColor: theme.colorNeutralLight,
  },
  photoRowIcon: { fontSize: 16 },
  photoRowText: {
    fontSize: 15,
    color: theme.colorTextSecondary,
  },
  photoAttachedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    paddingVertical: theme.space2,
    paddingHorizontal: theme.space2,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    backgroundColor: theme.colorNeutralLight,
  },
  photoThumb: {
    width: 56,
    height: 56,
    borderRadius: theme.radiusSmall,
  },
  photoAttachedMeta: {
    flex: 1,
    gap: 2,
  },
  photoAttachedText: {
    fontSize: 15,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextPrimary,
  },
  photoChangeText: {
    fontSize: 13,
    color: theme.colorTextSecondary,
  },
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.space2,
    paddingHorizontal: theme.space2,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    backgroundColor: theme.colorNeutralLight,
    gap: theme.space2,
  },
  foodProduct: {
    fontSize: 15,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextPrimary,
  },
  foodBrand: {
    fontSize: 13,
    color: theme.colorTextSecondary,
    marginTop: 2,
  },
  foodPlaceholder: {
    fontSize: 15,
    color: theme.colorTextSecondary,
  },
  foodList: {
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    overflow: 'hidden',
    marginTop: 4,
  },
  foodEmpty: {
    fontSize: 14,
    color: theme.colorTextSecondary,
    padding: theme.space2,
    textAlign: 'center',
  },
  foodItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: theme.space2,
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
    backgroundColor: theme.colorSurface,
  },
  foodItemSelected: {
    backgroundColor: theme.colorNeutralDark,
  },
  foodItemName: {
    flex: 1,
    fontSize: 15,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextPrimary,
  },
  foodItemNameSelected: {
    color: '#fff',
  },
  foodItemBrand: {
    fontSize: 13,
    color: theme.colorTextSecondary,
    marginRight: theme.space1,
  },
  foodItemBrandSelected: {
    color: 'rgba(255,255,255,0.7)',
  },
  foodItemCheck: {
    fontSize: 15,
    color: '#fff',
  },
  notesInput: {
    fontSize: 15,
    color: theme.colorTextPrimary,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    paddingHorizontal: theme.space2,
    paddingVertical: theme.space2,
    minHeight: 80,
    maxHeight: 160,
    textAlignVertical: 'top',
  },
});
