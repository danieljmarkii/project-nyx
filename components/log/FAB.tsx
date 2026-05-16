import { useState, useRef, useCallback, useEffect } from 'react';
import {
  TouchableOpacity, StyleSheet, View, Animated,
  Text, Pressable, Alert, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { theme } from '../../constants/theme';
import { useAttachmentStore } from '../../store/attachmentStore';
import { useEventStore } from '../../store/eventStore';
import { usePetStore } from '../../store/petStore';
import { getDb } from '../../lib/db';
import { uuid, exifDateToISO } from '../../lib/utils';

interface RecentFood {
  id: string;
  brand: string;
  product_name: string;
}

export function FAB() {
  const { setPendingAttachment } = useAttachmentStore();
  const { prependEvent } = useEventStore();
  const { activePet } = usePetStore();

  const [open, setOpen] = useState(false);
  const [recentFoods, setRecentFoods] = useState<RecentFood[]>([]);
  const [logging, setLogging] = useState<string | null>(null);
  const fabAnim = useRef(new Animated.Value(0)).current;

  const openMenu = useCallback(() => {
    setOpen(true);
    Animated.spring(fabAnim, {
      toValue: 1, useNativeDriver: true, tension: 65, friction: 8,
    }).start();
  }, [fabAnim]);

  const closeMenu = useCallback(() => {
    Animated.timing(fabAnim, {
      toValue: 0, duration: 180, useNativeDriver: true,
    }).start(() => setOpen(false));
  }, [fabAnim]);

  const toggleMenu = useCallback(() => {
    if (open) closeMenu(); else openMenu();
  }, [open, openMenu, closeMenu]);

  useEffect(() => {
    if (!open) return;
    const db = getDb();
    const foods = db.getAllSync<RecentFood>(
      'SELECT id, brand, product_name FROM food_items_cache ORDER BY last_used_at DESC LIMIT 3',
    );
    setRecentFoods(foods);
  }, [open]);

  async function handleQuickMeal(food: RecentFood) {
    if (logging || !activePet) return;
    setLogging(food.id);
    try {
      const now = new Date().toISOString();
      const eventId = uuid();
      const mealId = uuid();
      const db = getDb();

      await db.runAsync(
        'INSERT INTO events (id, pet_id, event_type, occurred_at, severity, notes, source, synced) VALUES (?, ?, ?, ?, null, null, ?, 0)',
        [eventId, activePet.id, 'meal', now, 'manual'],
      );
      await db.runAsync(
        'INSERT INTO meals (id, event_id, pet_id, food_item_id, quantity, synced) VALUES (?, ?, ?, ?, ?, 0)',
        [mealId, eventId, activePet.id, food.id, 'unknown'],
      );
      await db.runAsync(
        'UPDATE food_items_cache SET last_used_at = ? WHERE id = ?',
        [now, food.id],
      );

      prependEvent({
        id: eventId,
        pet_id: activePet.id,
        event_type: 'meal',
        occurred_at: now,
        severity: null,
        notes: null,
        source: 'manual',
        deleted_at: null,
        created_at: now,
        updated_at: now,
        food_item_id: food.id,
        food_brand: food.brand,
        food_product_name: food.product_name,
      });
      closeMenu();
    } finally {
      setLogging(null);
    }
  }

  async function handleQuickSymptom(type: 'vomit' | 'diarrhea') {
    if (logging || !activePet) return;
    setLogging(type);
    try {
      const now = new Date().toISOString();
      const eventId = uuid();
      const db = getDb();

      await db.runAsync(
        'INSERT INTO events (id, pet_id, event_type, occurred_at, severity, notes, source, synced) VALUES (?, ?, ?, ?, null, null, ?, 0)',
        [eventId, activePet.id, type, now, 'manual'],
      );

      prependEvent({
        id: eventId,
        pet_id: activePet.id,
        event_type: type,
        occurred_at: now,
        severity: null,
        notes: null,
        source: 'manual',
        deleted_at: null,
        created_at: now,
        updated_at: now,
      });
      closeMenu();
    } finally {
      setLogging(null);
    }
  }

  async function handlePhotoLog() {
    Alert.alert('Add photo', 'Choose a source', [
      {
        text: 'Take photo', onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Camera access needed', 'Allow camera access in Settings.');
            return;
          }
          launchPicker('camera');
        },
      },
      {
        text: 'Choose from library', onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Photo access needed', 'Allow photo access in Settings.');
            return;
          }
          launchPicker('library');
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function launchPicker(source: 'camera' | 'library') {
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.85,
      exif: true,
    };
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const exifRaw = (asset.exif as Record<string, unknown> | undefined);
    const dateRaw = exifRaw?.DateTimeOriginal ?? exifRaw?.DateTime;
    const takenAt = typeof dateRaw === 'string' ? exifDateToISO(dateRaw) : null;

    setPendingAttachment({ localUri: asset.uri, takenAt, mimeType: 'image/jpeg' });
    closeMenu();
    router.push('/log');
  }

  const iconRotate = fabAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] });
  const menuOpacity = fabAnim;
  const menuTranslateY = fabAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] });

  return (
    <>
      {open && <Pressable style={StyleSheet.absoluteFill} onPress={closeMenu} />}

      <View style={styles.fabContainer} pointerEvents="box-none">
        {open && (
          <Animated.View
            style={[styles.menu, { opacity: menuOpacity, transform: [{ translateY: menuTranslateY }] }]}
          >
            {/* Recent meals */}
            <Text style={styles.sectionHeader}>Recent meals</Text>
            {recentFoods.length === 0 ? (
              <Text style={styles.emptyMeals}>No meals logged yet</Text>
            ) : (
              recentFoods.map((food) => (
                <TouchableOpacity
                  key={food.id}
                  style={styles.menuAction}
                  onPress={() => handleQuickMeal(food)}
                  activeOpacity={0.7}
                  disabled={logging !== null}
                >
                  <Text style={styles.menuActionIcon}>🍽</Text>
                  <Text style={styles.menuActionLabel} numberOfLines={1}>
                    {food.brand} {food.product_name}
                  </Text>
                  {logging === food.id && (
                    <ActivityIndicator size="small" color={theme.colorTextSecondary} style={styles.spinner} />
                  )}
                </TouchableOpacity>
              ))
            )}

            <View style={styles.divider} />

            {/* Quick GI symptom taps */}
            <View style={styles.symptomRow}>
              <TouchableOpacity
                style={styles.symptomBtn}
                onPress={() => handleQuickSymptom('vomit')}
                activeOpacity={0.7}
                disabled={logging !== null}
              >
                {logging === 'vomit'
                  ? <ActivityIndicator size="small" color={theme.colorTextSecondary} />
                  : <Text style={styles.symptomBtnText}>Vomit</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.symptomBtn}
                onPress={() => handleQuickSymptom('diarrhea')}
                activeOpacity={0.7}
                disabled={logging !== null}
              >
                {logging === 'diarrhea'
                  ? <ActivityIndicator size="small" color={theme.colorTextSecondary} />
                  : <Text style={styles.symptomBtnText}>Diarrhea</Text>
                }
              </TouchableOpacity>
            </View>

            <View style={styles.divider} />

            {/* Full-flow actions */}
            <TouchableOpacity style={styles.menuAction} onPress={handlePhotoLog} activeOpacity={0.7}>
              <Text style={styles.menuActionIcon}>📷</Text>
              <Text style={styles.menuActionLabel}>Log with photo</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuAction}
              onPress={() => { closeMenu(); router.push('/vet-visit'); }}
              activeOpacity={0.7}
            >
              <Text style={styles.menuActionIcon}>🏥</Text>
              <Text style={styles.menuActionLabel}>Vet appointment</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuAction}
              onPress={() => { closeMenu(); router.push('/log'); }}
              activeOpacity={0.7}
            >
              <Text style={styles.menuActionIcon}>✚</Text>
              <Text style={styles.menuActionLabel}>Log event</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        <TouchableOpacity
          style={styles.fab}
          onPress={toggleMenu}
          accessibilityLabel={open ? 'Close menu' : 'Log event'}
          activeOpacity={0.85}
        >
          <Animated.View style={[styles.fabInner, { transform: [{ rotate: iconRotate }] }]}>
            <View style={styles.plusH} />
            <View style={styles.plusV} />
          </Animated.View>
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  fabContainer: {
    position: 'absolute',
    bottom: 72,
    right: theme.space3,
    alignItems: 'flex-end',
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colorNeutralDark,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  fabInner: {
    width: 20,
    height: 20,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  plusH: { position: 'absolute', width: 20, height: 2, backgroundColor: '#fff', borderRadius: 1 },
  plusV: { position: 'absolute', width: 2, height: 20, backgroundColor: '#fff', borderRadius: 1 },

  menu: {
    backgroundColor: theme.colorSurface,
    borderRadius: theme.radiusMedium,
    marginBottom: theme.space2,
    paddingVertical: theme.space1,
    minWidth: 240,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: theme.colorBorder,
  },

  sectionHeader: {
    fontSize: 11,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: theme.space2,
    paddingTop: theme.space1,
    paddingBottom: theme.space1,
  },
  emptyMeals: {
    fontSize: 13,
    color: theme.colorTextSecondary,
    paddingHorizontal: theme.space2,
    paddingBottom: theme.space1,
  },

  divider: {
    height: 1,
    backgroundColor: theme.colorBorder,
    marginVertical: theme.space1,
  },

  symptomRow: {
    flexDirection: 'row',
    gap: theme.space1,
    paddingHorizontal: theme.space2,
    paddingVertical: theme.space1,
  },
  symptomBtn: {
    flex: 1,
    paddingVertical: theme.space1,
    borderRadius: theme.radiusSmall,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  symptomBtnText: {
    fontSize: 13,
    color: theme.colorTextPrimary,
    fontWeight: theme.fontWeightMedium,
  },

  menuAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    paddingHorizontal: theme.space2,
    paddingVertical: theme.space1,
  },
  menuActionIcon: {
    fontSize: 18,
    width: 24,
    textAlign: 'center',
  },
  menuActionLabel: {
    fontSize: 15,
    color: theme.colorTextPrimary,
    fontWeight: theme.fontWeightMedium,
    flex: 1,
  },
  spinner: {
    marginLeft: theme.space1,
  },
});
