// "Include your Noticed notes" (CUL-875, T-22, §9 rule 4): a property of the DOCUMENT, so it
// lives wherever the owner shapes the report. On the v1 screen that is the range panel; with the
// composer on it is the composer (PM ruling (a) on CUL-2297), so the v2 preview's frame belongs
// to the report and the band reaches the first screen.
//
// A row, not a chip group: a two-state property that carries a sentence of explanation, which
// has to sit beside the control it explains. The hint names which notes it means, because a
// control named "your notes" that governs one of two note fields would otherwise read as a
// promise the report does not keep (CUL-848).
import { StyleSheet, Switch, View } from 'react-native';
import { colorRoles, theme } from '../../constants/theme';
import { ThemedText } from '../ui';

export const NOTES_OPTION_LABEL = 'Include your Noticed notes';
export const NOTES_OPTION_HINT =
  'What you wrote on your daily looks, printed in the report’s Noticed appendix. Notes you add to a meal or a symptom are always included.';

export function ReportNotesOption({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <ThemedText style={styles.label}>{NOTES_OPTION_LABEL}</ThemedText>
        <ThemedText style={styles.hint}>{NOTES_OPTION_HINT}</ThemedText>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colorRoles.action.onLight, false: theme.colorBorderStrong }}
        ios_backgroundColor={theme.colorBorderStrong}
        accessibilityLabel="Include your Noticed notes in the report"
        testID="report-notes-option"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    marginTop: theme.space2,
    paddingTop: theme.space2,
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
  },
  text: {
    flex: 1,
  },
  label: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
  },
  hint: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    marginTop: theme.spaceMicro,
  },
});
