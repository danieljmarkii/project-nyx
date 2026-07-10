import { StyleSheet, Text } from 'react-native';
import { theme } from '../../constants/theme';

// The settings-surface "reserved, not live" trailing marker (§D5 / §S3). One
// definition so every reserved row — the You screen's legal + Notifications rows,
// the Notifications sub-screen's category rows, and PR 4's feedback row — renders
// the identical muted chip instead of re-declaring it per screen.
//
// Deliberately the words "Coming soon", never an on/off word: an on/off marker
// reads as a flippable switch, the exact armed-reading the D7 safety gate forbids
// on the mocked notifications surface.
export function ComingSoonLabel() {
  return <Text style={styles.label}>Coming soon</Text>;
}

const styles = StyleSheet.create({
  label: {
    fontFamily: theme.fontBody,
    fontSize: theme.textSM,
    color: theme.colorTextDisabled,
  },
});
