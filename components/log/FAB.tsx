import { useState, useRef, useCallback } from 'react';
import {
  TouchableOpacity, StyleSheet, View, Animated,
  Text, Pressable, Alert,
} from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { theme } from '../../constants/theme';
import { usePetStore } from '../../store/petStore';
import { useEventStore } from '../../store/eventStore';
import { useAttachmentStore } from '../../store/attachmentStore';
import { getDb } from '../../lib/db';
import { syncPendingEvents, syncPendingMeals } from '../../lib/sync';
import { uuid, exifDateToISO } from '../../lib/utils';
import { EVENT_TYPES, EventTypeKey } from '../../constants/eventTypes';

const TYPE_ICONS: Record<EventTypeKey, string> = {
  meal: '🍽', vomit: '⚡', diarrhea: '⚡',
  stool_normal: '✓', lethargy: '◑', itch: '✦', other: '+',
};

interface RecentEvent {
  id: string;
  event_type: EventTypeKey;
  occurred_at: string;
  food_item_id: string | null;
  food_brand: string | null;
  food_product_name: string | null;
}

export function FAB() {
  const { activePet } = usePetStore();
  const { prependEvent } = useEventStore();
  const { setPendingAttachment } = useAttachmentStore();

  const [open, setOpen] = useState(false);
  const [recents, setRecents] = useState<RecentEvent[]>([]);
  const fabAnim = useRef(new Animated.Value(0)).current;

  const openMenu = useCallback(async () => {
    setOpen(true);
    Animated.spring(fabAnim, {
      toValue: 1, useNativeDriver: true, tension: 65, friction: 8,
    }).start();
    if (activePet) {
      await loadRecents(activePet.id);
    }
  }, [activePet, fabAnim]);

  const closeMenu = useCallback(() => {
    Animated.timing(fabAnim, {
      toValue: 0, duration: 180, useNativeDriver: true,
    }).start(() => setOpen(false));
  }, [fabAnim]);

  const toggleMenu = useCallback(() => {
    if (open) closeMenu(); else openMenu();
  }, [open, openMenu, closeMenu]);

  async function loadRecents(petId: string) {
    const db = getDb();
    const rows = await db.getAllAsync<{
      id: string; event_type: string; occurred_at: string;
      food_item_id: string | null; brand: string | null; product_name: string | null;
    }>(
      `SELECT e.id, e.event_type, e.occurred_at, m.food_item_id, fc.brand, fc.product_name
       FROM events e
       LEFT JOIN meals m ON m.event_id = e.id
       LEFT JOIN food_items_cache fc ON fc.id = m.food_item_id
       WHERE e.pet_id = ? AND e.deleted_at IS NULL
       ORDER BY e.occurred_at DESC LIMIT 20`,
      [petId]
    );
    // Deduplicate by event_type + food_item_id combination, keep the 3 most recent unique
    const seen = new Set<string>();
    const unique: RecentEvent[] = [];
    for (const r of rows) {
      const key = `${r.event_type}:${r.food_item_id ?? ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push({
          id: r.id,
          event_type: r.event_type as EventTypeKey,
          occurred_at: r.occurred_at,
          food_item_id: r.food_item_id,
          food_brand: r.brand,
          food_product_name: r.product_name,
        });
      }
      if (unique.length >= 3) break;
    }
    setRecents(unique);
  }

  async function handleReLog(recent: RecentEvent) {
    if (!activePet) return;
    closeMenu();
    const db = getDb();
    const eventId = uuid();
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT INTO events (id, pet_id, event_type, occurred_at, severity, notes, source, created_at, updated_at, synced)
       VALUES (?, ?, ?, ?, NULL, NULL, 'manual', ?, ?, 0)`,
      [eventId, activePet.id, recent.event_type, now, now, now]
    );
    if (recent.event_type === 'meal' && recent.food_item_id) {
      const mealId = uuid();
      await db.runAsync(
        `INSERT INTO meals (id, event_id, pet_id, food_item_id, quantity, created_at, synced)
         VALUES (?, ?, ?, ?, 'unknown', ?, 0)`,
        [mealId, eventId, activePet.id, recent.food_item_id, now]
      );
      await db.runAsync(
        `UPDATE food_items_cache SET last_used_at = ? WHERE id = ?`,
        [now, recent.food_item_id]
      );
    }
    prependEvent({
      id: eventId,
      pet_id: activePet.id,
      event_type: recent.event_type,
      occurred_at: now,
      severity: null,
      notes: null,
      source: 'manual',
      deleted_at: null,
      created_at: now,
      updated_at: now,
      food_item_id: recent.food_item_id,
      food_brand: recent.food_brand,
      food_product_name: recent.food_product_name,
      quantity: recent.food_item_id ? 'unknown' : null,
    });
    syncPendingEvents().then(() => syncPendingMeals()).catch(console.error);
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

  function recentLabel(r: RecentEvent): string {
    const icon = TYPE_ICONS[r.event_type] ?? '•';
    if (r.event_type === 'meal' && r.food_product_name) {
      return `${icon}  ${r.food_product_name}`;
    }
    return `${icon}  ${EVENT_TYPES[r.event_type]?.label ?? r.event_type}`;
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
            {recents.length > 0 && (
              <View style={styles.recentsSection}>
                <Text style={styles.recentsLabel}>Quick re-log</Text>
                {recents.map((r) => (
                  <TouchableOpacity
                    key={r.id}
                    style={styles.recentRow}
                    onPress={() => handleReLog(r)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.recentText}>{recentLabel(r)}</Text>
                    <Text style={styles.recentArrow}>↑</Text>
                  </TouchableOpacity>
                ))}
                <View style={styles.menuDivider} />
              </View>
            )}

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
    minWidth: 220,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: theme.colorBorder,
  },

  recentsSection: {},
  recentsLabel: {
    fontSize: 11,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: theme.space2,
    paddingTop: theme.space1,
    paddingBottom: theme.space1,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.space2,
    paddingVertical: theme.space1,
  },
  recentText: {
    fontSize: 15,
    color: theme.colorTextPrimary,
    flex: 1,
  },
  recentArrow: {
    fontSize: 16,
    color: theme.colorTextSecondary,
    marginLeft: theme.space1,
  },
  menuDivider: {
    height: 1,
    backgroundColor: theme.colorBorder,
    marginTop: theme.space1,
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
  },
});
