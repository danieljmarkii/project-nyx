import { Image, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Camera } from 'lucide-react-native';
import { colorRoles, theme } from '../../constants/theme';
import { Tick } from '../surfaces/waits/Tick';
import { ThemedText } from './ThemedText';

/** The Pet tab's photo: 96pt (round P1), no single token. */
export const PHOTO_SLOT_SIZE = theme.space6 + theme.space4;
const PHOTO_SLOT_LABEL_MAX_SCALE = 1.3;

interface Props {
  petName: string;
  /** Shown under the photo, and in its place when the photo is missing or failed. */
  initials: string;
  /** The signed link, or null while it signs or after it failed. */
  photoUri: string | null;
  /** Keys the Image so a re-signed link really re-fetches. */
  photoAttempt: string | number;
  onPhotoError: () => void;
  /** Off the record, not the link: a pet whose photo failed to load still has one. */
  hasPhoto: boolean;
  /** An upload is in flight. */
  saving: boolean;
  onPress: () => void;
}

/**
 * The pet's photo as its own button (CUL-1911, the profile round's P1 and its add photo
 * slot): no "Change photo" control beside it. With no photo on record the slot IS the ask,
 * a dashed well that says "Add photo"; with one, the photo over its initials (the floor
 * when the link is slow or fails); while an upload runs, the tick on a scrim.
 */
export function PhotoSlot({
  petName, initials, photoUri, photoAttempt, onPhotoError, hasPhoto, saving, onPress,
}: Props) {
  const showAdd = !hasPhoto && !saving;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={saving}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={showAdd ? `Add a photo of ${petName}` : `${petName}’s photo`}
      accessibilityHint="Opens the photo options"
      accessibilityState={{ disabled: saving, busy: saving }}
      style={[styles.slot, showAdd ? styles.add : styles.disc]}
      testID="photo-slot"
    >
      {showAdd ? (
        <>
          <Camera size={theme.space3} color={colorRoles.action.onLight} strokeWidth={1.75} />
          {/* Inside a fixed 96pt circle, so its scale is capped; the button's label says it in full. */}
          <ThemedText variant="label" style={styles.addLabel} maxFontSizeMultiplier={PHOTO_SLOT_LABEL_MAX_SCALE}>
            Add photo
          </ThemedText>
        </>
      ) : (
        <>
          <ThemedText style={styles.initials}>{initials}</ThemedText>
          {photoUri ? (
            <Image
              key={photoAttempt}
              source={{ uri: photoUri }}
              style={styles.photo}
              resizeMode="cover"
              onError={onPhotoError}
            />
          ) : null}
          {saving ? (
            <View style={styles.overlay}>
              {/* The scrim is the ground, so the tick takes the on-dark ink. */}
              <Tick working={saving} style={styles.tick} testID="photo-saving-tick" />
            </View>
          ) : null}
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  slot: {
    width: PHOTO_SLOT_SIZE,
    height: PHOTO_SLOT_SIZE,
    borderRadius: theme.radiusFull,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  disc: {
    backgroundColor: theme.colorNeutralDark,
  },
  add: {
    backgroundColor: theme.colorSurfaceSubtle,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colorBorderStrong,
    gap: theme.space0_5,
  },
  addLabel: {
    color: colorRoles.action.onLight,
  },
  initials: {
    fontSize: theme.text2XL,
    fontWeight: theme.weightMedium,
    color: theme.colorTextOnDark,
  },
  photo: {
    ...StyleSheet.absoluteFill,
    borderRadius: theme.radiusFull,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: theme.colorScrimPhoto,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tick: {
    backgroundColor: theme.colorTextOnDark,
  },
});
