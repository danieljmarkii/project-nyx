import { View, StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';
import { ThemedText } from './ThemedText';

type Variant = 'symptom' | 'accent' | 'muted';

interface Props {
  label: string;
  variant?: Variant;
}

export function Badge({ label, variant = 'muted' }: Props) {
  return (
    <View style={[styles.badge, styles[variant]]}>
      <ThemedText style={[styles.label, styles[`${variant}Text` as `${Variant}Text`]]}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: theme.radiusXS + 2,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  symptom: {
    backgroundColor: theme.colorEventSymptomLight,
  },
  accent: {
    backgroundColor: theme.colorAccentLight,
  },
  muted: {
    backgroundColor: theme.colorNeutralLight,
  },
  label: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
  },
  // Both tinted variants carry TEXT on a tint, so both take the INK, not the bright
  // category colour: #F43F5E on colorEventSymptomLight is 3.06:1 and #00C2A8 on
  // colorAccentLight is 2.08:1, and this label is 11px — normal-size text, so the bar
  // is AA's 4.5:1, not the 3:1 non-text target those brights are tuned for. The inks
  // are 6.68:1 and 4.75:1 on the same tints. Same accent and same rose, so the "one
  // accent" rule holds; this is the pairing colorAccentInk was minted for
  // (constants/theme.ts:51-58) and the fix CUL-27 already made on TodayZone's door.
  symptomText: {
    color: theme.colorEventSymptomInk,
  },
  accentText: {
    color: theme.colorAccentInk,
  },
  mutedText: {
    color: theme.colorTextSecondary,
  },
});
