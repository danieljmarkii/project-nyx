import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { theme } from '../constants/theme';
import { ThemedText } from './ui/ThemedText';
import { PrimaryButton } from './ui/PrimaryButton';

// The one screen an owner sees when the app fails (CUL-1841), whichever door the failure
// came through (`components/CrashBoundary.tsx`).
//
// It depends on as little as it can: theme tokens, the text primitive and the button. No
// store, no pet, no record, because whatever failed may be any of those. It names no pet
// for the same reason; a calm, generic screen beats a name read off a broken store.
//
// The words (nyx-voice Pattern 8): say plainly that the app went wrong, not the owner;
// say what is safe without promising what may not be (an entry mid-save when the app
// failed may not have landed, so the line is about what was already saved, it names no
// place, since a new phone's record may still be on the server, and the next line asks
// the owner to check the entry they were in the middle of, PM 2026-10-16); point at
// the one action; and since this is a health app, say the vet does not need it.
export const CRASH_COPY = {
  title: 'Culprit hit a problem',
  body: 'Something went wrong on our side, not yours. Everything you had already saved is safe.',
  logging: 'If you were logging something, check it saved.',
  vet: 'If your pet needs care right now, call your vet. You don’t need the app for that.',
  action: 'Try again',
  hint: 'If this keeps happening, close Culprit and open it again.',
} as const;

interface Props {
  onRetry: () => void;
}

export function CrashScreen({ onRetry }: Props) {
  // A failure before the root layout's font gate opens would otherwise sit behind the
  // native splash, which that gate holds until it releases. Hide it here, so the screen
  // is seen whenever it renders.
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <View style={styles.root} testID="crash-screen">
      <StatusBar style="dark" />
      <View style={styles.content}>
        <ThemedText style={styles.title} accessibilityRole="header">
          {CRASH_COPY.title}
        </ThemedText>
        <ThemedText style={styles.body}>{CRASH_COPY.body}</ThemedText>
        <ThemedText style={styles.body}>{CRASH_COPY.logging}</ThemedText>
        <ThemedText style={styles.body}>{CRASH_COPY.vet}</ThemedText>
        <PrimaryButton
          label={CRASH_COPY.action}
          onPress={onRetry}
          style={styles.action}
          testID="crash-screen-retry"
        />
        <ThemedText style={styles.hint}>{CRASH_COPY.hint}</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colorSurface,
    justifyContent: 'center',
    paddingHorizontal: theme.space3,
  },
  content: {
    gap: theme.space2,
  },
  title: {
    fontSize: theme.textXL,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    letterSpacing: theme.trackingTight,
  },
  body: {
    fontSize: theme.textMD,
    lineHeight: theme.lineHeightBody,
    color: theme.colorTextSecondary,
  },
  action: {
    marginTop: theme.space2,
  },
  hint: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextTertiary,
    textAlign: 'center',
  },
});
