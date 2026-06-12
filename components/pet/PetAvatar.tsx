import { Image, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../constants/theme';
import { getPublicUrl } from '../../lib/storage';

// Same bucket the Pet tab uploads to — every avatar surface reads from it.
const PET_PHOTO_BUCKET = 'nyx-pet-photos';

interface PetAvatarProps {
  name: string;
  photoPath: string | null;
  size: number;
}

// One avatar for every pet-identity surface (home header, switcher sheet,
// archived list): the pet's photo when present, else the soft tinted-disc
// initial from the PM-approved multi-pet mock. Shared so the switcher rows
// can never drift from the header's rendering of the same pet.
export function PetAvatar({ name, photoPath, size }: PetAvatarProps) {
  const photoUri = photoPath ? getPublicUrl(PET_PHOTO_BUCKET, photoPath) : null;
  const round = { width: size, height: size, borderRadius: theme.radiusFull };

  if (photoUri) {
    return <Image source={{ uri: photoUri }} style={round} resizeMode="cover" />;
  }

  return (
    <View style={[styles.placeholder, round]}>
      <Text style={[styles.initial, { fontSize: Math.round(size * 0.4) }]}>
        {name.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: theme.colorAccentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Geist face, not bare fontWeight — RN doesn't synthesize weights for custom
  // fonts (see lib/fonts.ts). Header-scoped face reused here so the switcher's
  // discs match the strip's exactly.
  initial: {
    fontFamily: theme.fontBodySemibold,
    color: theme.colorTextPrimary,
  },
});
