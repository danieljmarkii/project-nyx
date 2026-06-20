import { Pressable, StyleSheet, Text } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { usePetStore } from '../../store/petStore';
import { useCrossPetSafetyBanner } from '../../hooks/useSignal';
import { PetAvatar } from '../pet/PetAvatar';

// Cross-pet safety breakthrough banner (multi-pet §4, mock A3). One calm banner
// ABOVE the Signal zone when ANOTHER (non-active, non-archived) pet has a safety
// finding cached — it belongs to a different pet, so it must read as separate from
// the active pet's own Signal. Tap switches the active pet (B-076 makes every zone
// follow), landing one tap from that pet's full home. NOT dismissible — it clears
// when the underlying finding clears (same as the Signal). It can ONLY escalate
// attention; by construction it never reassures (cache read — a stale/missing
// cache renders nothing, and absence of a banner is never an all-clear).
export function CrossPetSafetyBanner() {
  const banner = useCrossPetSafetyBanner();
  const selectPet = usePetStore((s) => s.selectPet);
  if (!banner) return null;

  return (
    <Pressable
      onPress={() => selectPet(banner.petId)}
      accessibilityRole="button"
      accessibilityLabel={banner.text}
      accessibilityHint={`Switches to ${banner.petName}`}
      style={styles.banner}
    >
      <PetAvatar name={banner.petName} photoPath={banner.photoPath} size={26} />
      <Text style={styles.text}>
        {/* The pet name renders bold (mock A3); the rest is the calm sentence.
            System body font here (not a Geist face), so bare fontWeight is fine —
            same as InsightCard's body copy. text === petName + rest by construction. */}
        <Text style={styles.petName}>{banner.petName}</Text>
        {banner.rest}
      </Text>
      <ChevronRight size={16} color={theme.colorTextTertiary} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Tinted safety container, calm border — "worth a look", never alarm (mock A3).
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    backgroundColor: theme.colorEventSymptomLight,
    borderWidth: 1,
    borderColor: theme.colorEventSymptomBorder,
    borderRadius: theme.radiusMedium,
    paddingVertical: theme.space1,
    paddingHorizontal: theme.space2,
    // The whole row is the switch tap-target. minHeight clears the 44pt floor
    // (3am-stumbling rule) on its own, so no hitSlop is needed (it would only
    // overshoot into the surrounding padding).
    minHeight: 44,
  },
  text: {
    flex: 1,
    fontSize: theme.textSM,
    color: theme.colorTextPrimary,
    lineHeight: theme.lineHeightSM,
  },
  petName: {
    fontWeight: theme.weightSemibold,
  },
});
