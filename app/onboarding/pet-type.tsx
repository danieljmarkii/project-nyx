import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Cat, Dog, Check, type LucideIcon } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { OnboardingHeader } from '../../components/onboarding/OnboardingHeader';

// Onboarding captures only Cat/Dog — the pets enum's third value ('other') stays
// for the in-app add-pet path but is intentionally dropped here (spec §2 / D5).
type PetType = 'cat' | 'dog';

const TYPES: { value: PetType; label: string; subtitle: string; Icon: LucideIcon }[] = [
  { value: 'cat', label: 'Cat', subtitle: 'Whiskers, grazing, the works', Icon: Cat },
  { value: 'dog', label: 'Dog', subtitle: 'Walks, treats, tail wags', Icon: Dog },
];

// Pet type — the first REQUIRED pet-setup step (B-251 PR 7, spec §2, mockup 06).
// Two large tiles, no default selection (Principle 1: no decision is pre-made for
// the owner); an explicit tap selects and Continue advances, carrying the chosen
// species to the name step. The pet row itself is written on the name step (§4:
// insert type+name, later steps update breed/gender/age).
export default function PetTypeScreen() {
  const [selected, setSelected] = useState<PetType | null>(null);

  function handleContinue() {
    if (!selected) return;
    router.push({ pathname: '/onboarding/pet-name', params: { species: selected } });
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <OnboardingHeader step={1} />

      <View style={styles.body}>
        <Text style={styles.title}>Who are we tracking?</Text>
        {/* Multi-pet reassurance (Sam's ask, spec §5) — capture is one pet, the
            rest are added in-app, so a multi-pet owner isn't stalled here. */}
        <Text style={styles.subtitle}>
          Built for every pet in your home — you can add the rest anytime.
        </Text>

        <View style={styles.tiles}>
          {TYPES.map(({ value, label, subtitle, Icon }) => {
            const isSelected = selected === value;
            return (
              <TouchableOpacity
                key={value}
                style={[styles.tile, isSelected && styles.tileSelected]}
                onPress={() => setSelected(value)}
                activeOpacity={0.8}
                accessibilityRole="radio"
                accessibilityState={{ checked: isSelected }}
                accessibilityLabel={label}
                testID={`pet-type-${value}`}
              >
                <View style={[styles.avatar, isSelected && styles.avatarSelected]}>
                  <Icon size={30} color={theme.colorAccent} strokeWidth={1.75} />
                </View>
                <View style={styles.tileText}>
                  <Text style={styles.tileTitle}>{label}</Text>
                  <Text style={styles.tileSubtitle}>{subtitle}</Text>
                </View>
                <View style={[styles.radio, isSelected && styles.radioSelected]}>
                  {isSelected ? (
                    <Check size={14} color={theme.colorTextOnDark} strokeWidth={3} />
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.grow} />

        <PrimaryButton
          label="Continue"
          onPress={handleContinue}
          disabled={!selected}
          testID="pet-type-continue"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorNeutralLight,
    paddingHorizontal: theme.space3,
  },
  body: {
    flex: 1,
  },
  title: {
    fontSize: theme.text2XL,
    fontWeight: theme.weightMedium,
    color: theme.colorNeutralDark,
    letterSpacing: theme.trackingTight,
    marginTop: theme.space3,
    marginBottom: theme.space1,
  },
  subtitle: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
    marginBottom: theme.space4,
  },
  tiles: {
    gap: theme.space2,
  },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    padding: theme.space2,
    borderRadius: theme.radiusLarge,
    backgroundColor: theme.colorSurface,
    // Constant-width border so selecting only swaps the colour — no layout shift
    // between the resting and selected states. (1pt matches the app-wide border
    // convention; selection also carries the accent fill + the filled radio.)
    borderWidth: 1,
    borderColor: theme.colorBorder,
  },
  tileSelected: {
    borderColor: theme.colorAccent,
    backgroundColor: theme.colorAccentLight,
  },
  avatar: {
    width: theme.space6, // 64
    height: theme.space6,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorAccentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // On a selected (tinted) tile the avatar flips to white so it still reads.
  avatarSelected: {
    backgroundColor: theme.colorSurface,
  },
  tileText: {
    flex: 1,
  },
  tileTitle: {
    fontSize: theme.textLG,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
  },
  tileSubtitle: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    marginTop: theme.spaceMicro,
  },
  radio: {
    width: theme.space3, // 24
    height: theme.space3,
    borderRadius: theme.radiusFull,
    borderWidth: 1,
    borderColor: theme.colorBorderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    backgroundColor: theme.colorAccent,
    borderColor: theme.colorAccent,
  },
  grow: {
    flex: 1,
    // Floor the whitespace between the tiles and the CTA so a short list still
    // pushes Continue to the bottom without the tiles floating mid-screen.
    minHeight: theme.space4,
  },
});
