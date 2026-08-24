import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../../constants/theme';
import { PrimaryButton } from '../ui/PrimaryButton';
import { ThemedText } from '../ui/ThemedText';

interface Props {
  petName: string;
  onAdd: () => void;
}

// E1-r2 — and per §4.1 this is **the feature's primary screen**, because most
// owners will have an empty library most of the time. Principle 5 in its strongest
// form: it has to make someone want to fill it, not apologise for being blank.
//
// Three things are load-bearing and were each argued for in review:
//   • the pet's NAME — in a two-cat household it is the only filing cue the screen
//     gives, and both persona reviews asked for it;
//   • "whatever you save here", not "every record" — the library holds what the
//     owner put in it. A completeness claim on a screen a vet may look at is a
//     claim the app cannot keep;
//   • one concrete first document. "Add documents" is a chore; "the rabies
//     certificate — boarding and groomers ask for it more than anyone" is a task
//     with a reason, and it is the §2 evidence base's highest-frequency record.
export function VetFilesEmptyState({ petName, onAdd }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.art} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={[styles.sheet, styles.sheetBack]} />
        <View style={styles.sheet} />
        <View style={[styles.sheet, styles.sheetFront]} />
      </View>

      <ThemedText style={styles.headline}>A home for {petName}’s paperwork</ThemedText>
      <ThemedText style={styles.body}>
        Lab results, vaccine certificates, discharge notes, the email thread with your
        clinic — whatever you save here is ready when a vet asks for it.
      </ThemedText>

      <View style={styles.example}>
        <ThemedText style={styles.exampleText}>
          <ThemedText style={styles.exampleLead}>A good first one: </ThemedText>
          the rabies certificate. Boarding and groomers ask for it more than anyone.
        </ThemedText>
      </View>

      <PrimaryButton label="Add documents" onPress={onAdd} style={styles.cta} />
      <ThemedText style={styles.foot}>Photos, screenshots and PDFs — several at once is fine</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: theme.space2,
    paddingBottom: theme.space4,
  },
  art: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    marginBottom: 4,
  },
  sheet: {
    width: 34,
    height: 44,
    borderRadius: theme.radiusSmall,
    borderWidth: 1.5,
    borderColor: theme.colorBorderStrong,
    backgroundColor: theme.colorSurface,
  },
  sheetBack: {
    transform: [{ rotate: '-6deg' }, { translateY: 3 }],
  },
  sheetFront: {
    borderColor: theme.colorAccentSoft,
    transform: [{ rotate: '4deg' }],
  },
  headline: {
    fontSize: theme.textXL,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    letterSpacing: theme.trackingTight,
    textAlign: 'center',
    maxWidth: 280,
  },
  body: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightBody,
    color: theme.colorTextSecondary,
    textAlign: 'center',
    maxWidth: 300,
  },
  example: {
    backgroundColor: theme.colorSurface,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusMedium,
    paddingVertical: 9,
    paddingHorizontal: 13,
  },
  exampleText: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextSecondary,
    textAlign: 'center',
  },
  exampleLead: {
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
  },
  cta: {
    alignSelf: 'stretch',
    marginTop: theme.space1,
  },
  foot: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    textAlign: 'center',
  },
});
