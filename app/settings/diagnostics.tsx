import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { theme } from '../../constants/theme';
import { Header } from '../../components/ui';
import { APP_BUILD, APP_VERSION, PLATFORM } from '../../lib/appInfo';
import { clearAuthLog, readAuthLog, type Breadcrumb } from '../../lib/authDebug';

// TEMPORARY diagnostic viewer for the auth session-persistence investigation.
// Not a user feature — reachable only by long-pressing the version foot on the
// "You" screen. Shows the breadcrumb trail written by lib/authDebug so the PM can
// reproduce the frequent-logout bug on-device and share the exact trail back.
// Expected to be removed with the rest of the probe once the root cause is fixed.

// One breadcrumb rendered as a single paste-friendly line.
function formatLine(b: Breadcrumb): string {
  const detail = b.detail ? ' ' + JSON.stringify(b.detail) : '';
  return `#${b.seq} ${b.t} [${b.launch}] ${b.event}${detail}`;
}

export default function DiagnosticsScreen() {
  const [entries, setEntries] = useState<Breadcrumb[]>([]);

  const load = useCallback(() => {
    readAuthLog().then(setEntries);
  }, []);

  // Reload every time the screen regains focus so a fresh reproduction shows up
  // without a manual refresh.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function handleBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/settings');
  }

  async function handleShare() {
    const header = `Culprit auth diagnostics — v${APP_VERSION} (build ${APP_BUILD}) ${PLATFORM}\n${entries.length} breadcrumbs\n`;
    const body = entries.map(formatLine).join('\n');
    try {
      await Share.share({ message: header + '\n' + body });
    } catch (e) {
      // A user-cancel resolves (not throws), so reaching here is a genuine share
      // failure — surface it to the console so a "nothing happened" isn't silent
      // (this screen's whole job is getting the trail off the device).
      console.warn('[diagnostics] share failed:', e);
    }
  }

  function handleClear() {
    clearAuthLog().then(load);
  }

  // Count distinct launches so the PM (and I) can see at a glance how many
  // app-process lifetimes the trail spans — the idle gap sits between two.
  const launches = new Set(entries.map((e) => e.launch)).size;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header title="Auth diagnostics" leading="back" onLeadingPress={handleBack} />

      <View style={styles.toolbar}>
        <Text style={styles.summary}>
          {entries.length} breadcrumbs · {launches} launch{launches === 1 ? '' : 'es'}
        </Text>
        <View style={styles.actions}>
          <Pressable
            onPress={handleShare}
            style={styles.primaryBtn}
            accessibilityRole="button"
            accessibilityLabel="Share the diagnostic log"
            hitSlop={8}
          >
            <Text style={styles.primaryBtnText}>Share log</Text>
          </Pressable>
          <Pressable
            onPress={handleClear}
            style={styles.subtleBtn}
            accessibilityRole="button"
            accessibilityLabel="Clear the diagnostic log"
            hitSlop={8}
          >
            <Text style={styles.subtleBtnText}>Clear</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator>
        {entries.length === 0 ? (
          <Text style={styles.empty}>
            No breadcrumbs yet. Reopen the app after being logged out, then come back here —
            the trail from the cold start will show up.
          </Text>
        ) : (
          entries.map((b) => (
            <Text key={b.seq} style={styles.line} selectable>
              {formatLine(b)}
            </Text>
          ))
        )}
        <View style={styles.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorNeutralLight,
  },
  toolbar: {
    paddingHorizontal: theme.space3,
    paddingVertical: theme.space2,
    gap: theme.space2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colorBorder,
  },
  summary: {
    fontFamily: theme.fontBody,
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  actions: {
    flexDirection: 'row',
    gap: theme.space2,
  },
  primaryBtn: {
    backgroundColor: theme.colorAccent,
    paddingVertical: theme.space2,
    paddingHorizontal: theme.space3,
    borderRadius: theme.radiusMedium,
  },
  primaryBtnText: {
    fontFamily: theme.fontBody,
    fontSize: theme.textSM,
    color: theme.colorNeutralLight,
  },
  subtleBtn: {
    backgroundColor: theme.colorSurfaceSubtle,
    paddingVertical: theme.space2,
    paddingHorizontal: theme.space3,
    borderRadius: theme.radiusMedium,
  },
  subtleBtnText: {
    fontFamily: theme.fontBody,
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  scroll: {
    padding: theme.space3,
    gap: theme.space1,
  },
  empty: {
    fontFamily: theme.fontBody,
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
  },
  line: {
    fontFamily: theme.fontBody,
    fontSize: theme.textXS,
    color: theme.colorTextPrimary,
  },
  bottomPad: {
    height: theme.space4,
  },
});
