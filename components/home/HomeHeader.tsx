import { Image, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../constants/theme';
import { usePetStore } from '../../store/petStore';
import { getPublicUrl } from '../../lib/storage';
import { petIdentityLine } from '../../lib/utils';

// Same bucket the Pet tab uploads to — the strip shows that photo when present.
const PET_PHOTO_BUCKET = 'nyx-pet-photos';

// Home identity strip (B-076) — a thin orienting band above the Signal: a quiet
// "Project Nyx" wordmark + the active pet's avatar, name, and one slim line.
// Deliberately NOT a profile card (Principle 3): the AI Signal must keep leading
// and the full profile (sex/weight/conditions/diet trial) stays the Pet tab's
// job. It reads the active pet from the store, so when the multi-pet switcher
// later changes activePet this strip updates with no extra wiring — but the
// switcher itself is not built here (single-pet today; designed-for, not built).
export function HomeHeader() {
  const activePet = usePetStore((s) => s.activePet);

  // Home only renders behind a created pet (usePet redirects to onboarding
  // otherwise), but guard anyway so a transient null never throws.
  if (!activePet) return null;

  const photoUri = activePet.photo_path
    ? getPublicUrl(PET_PHOTO_BUCKET, activePet.photo_path)
    : null;
  const initial = activePet.name.charAt(0).toUpperCase();
  const line = petIdentityLine(activePet);

  return (
    <View style={styles.container}>
      <Text style={styles.wordmark}>Project Nyx</Text>
      <View style={styles.identityRow}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.avatar} resizeMode="cover" />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarInitial}>{initial}</Text>
          </View>
        )}
        <View style={styles.textColumn}>
          <Text style={styles.name} numberOfLines={1}>
            {activePet.name}
          </Text>
          {line ? (
            <Text style={styles.line} numberOfLines={1}>
              {line}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const AVATAR = 38;

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colorSurface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
    paddingHorizontal: theme.space2,
    paddingTop: 10,
    paddingBottom: 12,
  },
  // Quiet brand mark in the display face — identity, not a banner. "Project Nyx"
  // is a placeholder name; swaps out with no layout change when it's decided.
  wordmark: {
    fontFamily: theme.fontDisplay,
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
    letterSpacing: theme.trackingTight,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginTop: theme.space1,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: theme.radiusFull,
  },
  avatarPlaceholder: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorNeutralDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: theme.textMD,
    fontWeight: theme.weightSemibold,
    color: theme.colorSurface,
  },
  textColumn: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: theme.textLG,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
  },
  line: {
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
    marginTop: 2,
  },
});
