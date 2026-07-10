import { StyleSheet, Text, View } from 'react-native';
import { User } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { ownerInitial } from '../../lib/owner';

interface OwnerAvatarProps {
  /** The account email — the monogram source (spec §D10). */
  email: string | null | undefined;
  size: number;
}

// The owner's avatar for every account-identity surface: the Home-header doorway
// (§4.1) and the You-screen identity header (§4.2). A tinted teal disc with the
// email initial (D10), falling back to a neutral person glyph when there's no
// readable initial (§4.5). Shared so the two entry points can never drift — the
// header disc and the screen header are the same face. Teal-on-teal-tint (accent
// fill, accent text) deliberately reads as the OWNER, distinct from PetAvatar's
// neutral-ink initial, so the two identities never look interchangeable.
export function OwnerAvatar({ email, size }: OwnerAvatarProps) {
  const initial = ownerInitial(email);
  const round = { width: size, height: size, borderRadius: theme.radiusFull };

  return (
    <View style={[styles.disc, round]}>
      {initial ? (
        // Initial scales with the disc (~0.42) rather than a fixed token, so the
        // 32pt header doorway and a larger screen-header disc both read balanced.
        <Text style={[styles.initial, { fontSize: Math.round(size * 0.42) }]}>{initial}</Text>
      ) : (
        <User size={Math.round(size * 0.5)} color={theme.colorAccent} strokeWidth={1.9} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  disc: {
    backgroundColor: theme.colorAccentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Geist face, not bare fontWeight — RN doesn't synthesize weights for custom
  // fonts (see lib/fonts.ts), mirroring PetAvatar's initial.
  initial: {
    fontFamily: theme.fontBodySemibold,
    color: theme.colorAccent,
  },
});
