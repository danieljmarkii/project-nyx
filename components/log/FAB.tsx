import { useState, useRef, useCallback } from 'react';
import {
  TouchableOpacity, StyleSheet, View, Animated,
  Text, Pressable, Alert,
} from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { theme } from '../../constants/theme';
import { useAttachmentStore } from '../../store/attachmentStore';
import { exifDateToISO } from '../../lib/utils';

export function FAB() {
  const { setPendingAttachment } = useAttachmentStore();

  const [open, setOpen] = useState(false);
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
