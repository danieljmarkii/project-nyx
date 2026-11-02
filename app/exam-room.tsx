// Vet report v2 exam-room mode (CUL-2299, row VR2-19; spec §10.6, §14; mock d4).
//
// The owner hands the phone across the table. The report fills the screen on black, one sheet
// at a time, at the larger of the arm's-length size and the owner's own text size; each sheet
// scrolls vertically and a horizontal swipe turns it. Pages, type and the keep-together rule
// live in the document (lib/examRoom.ts); this screen is the frame around it.
//
// ENTRY (spec §14): the root fades in from transparent to black over 250 ms, so the report
// screen underneath crossfades to black; instant under Reduce Motion. The route is a
// transparent modal with no native animation (app/_layout.tsx), so this fade is the only one.
//
// THE SCREEN STAYS AWAKE ONLY WHILE IT IS BEING USED (spec §10.6). Keep-awake holds while the
// room is open, the app is in front and someone touched it in the last EXAM_IDLE_MS; it is
// released on Done, on unmount, on background and on idle. The app never changes system
// brightness (exam-room.test.tsx greps for it).
//
// THE OFFLINE COPY (lib/examRoomCopy.ts) lives in the transient directory the sign-out wipe
// deletes, and this screen deletes it when it closes.
//
// VOICEOVER. The pager is one adjustable element: it says "Sheet N of M", swipe up or down turns
// the sheet, and every turn is announced, because a horizontal swipe on the page is a gesture
// VoiceOver keeps for itself.
import { type ComponentRef, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { ThemedText } from '../components/ui/ThemedText';
import { theme } from '../constants/theme';
import { useAppActive } from '../hooks/useAppActive';
import { useReducedMotion } from '../hooks/useReducedMotion';
import {
  EXAM_IDLE_MS,
  EXAM_RETYPE_SCRIPT,
  clampPage,
  examGoScript,
  examRoomHtml,
  keepAwakeWanted,
  parseExamMessage,
  sheetLabel,
} from '../lib/examRoom';
import { clearExamCopy, readExamCopy } from '../lib/examRoomCopy';
import { androidTextZoom, isPreviewLoadAllowed } from '../lib/reportPreviewV2';

export const EXAM_PAGES_TEST_ID = 'exam-room-pages';
export const EXAM_PRINTED_TEST_ID = 'exam-room-printed';
export const EXAM_PAGER_TEST_ID = 'exam-room-pager';
export const EXAM_KEEP_AWAKE_TAG = 'nyx-exam-room';

export const EXAM_COPY = {
  printed: 'Printed page',
  pages: 'Large type',
  done: 'Done',
  missing: 'This report is no longer on this phone. Open it again from the preview.',
} as const;

export default function ExamRoomScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const appActive = useAppActive();
  const { fontScale } = useWindowDimensions();

  // Read once: the copy is fixed for the life of the room.
  const [copy] = useState(() => readExamCopy());
  const html = useMemo(() => (copy ? examRoomHtml(copy.phoneHtml, theme.colorNeutralDark) : null), [copy]);
  // The copy goes when the room closes, however it closes (Done, Android back, a dismissal).
  useEffect(() => () => clearExamCopy(), []);

  const web = useRef<ComponentRef<typeof WebView>>(null);
  const [pager, setPager] = useState<{ page: number; of: number }>({ page: 1, of: 1 });
  const [printed, setPrinted] = useState(false);
  const [printedMounted, setPrintedMounted] = useState(false);

  // Keep-awake: open, foregrounded, touched within the idle window.
  const [lastTouchAt, setLastTouchAt] = useState(() => Date.now());
  const [, setIdleTick] = useState(0);
  const touch = () => {
    const now = Date.now();
    if (now - lastTouchAt > 1000) setLastTouchAt(now);
  };
  useEffect(() => {
    const t = setTimeout(() => setIdleTick((n) => n + 1), EXAM_IDLE_MS);
    return () => clearTimeout(t);
  }, [lastTouchAt]);
  const awake = keepAwakeWanted({ open: true, appActive, lastTouchAt, now: Date.now() });
  useEffect(() => {
    if (!awake) {
      deactivateKeepAwake(EXAM_KEEP_AWAKE_TAG).catch(() => undefined);
      return undefined;
    }
    activateKeepAwakeAsync(EXAM_KEEP_AWAKE_TAG).catch(() => undefined);
    return () => {
      deactivateKeepAwake(EXAM_KEEP_AWAKE_TAG).catch(() => undefined);
    };
  }, [awake]);

  // The crossfade to black.
  const fade = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) {
      fade.setValue(1);
      return undefined;
    }
    const anim = Animated.timing(fade, {
      toValue: 1,
      duration: theme.durationMedium,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [reduced, fade]);

  // A text-size change with the room open: the document re-measures (iOS); Android's textZoom
  // follows the prop.
  const firstScale = useRef(fontScale);
  useEffect(() => {
    if (fontScale === firstScale.current) return;
    firstScale.current = fontScale;
    web.current?.injectJavaScript(EXAM_RETYPE_SCRIPT);
  }, [fontScale]);

  const announced = useRef<string | null>(null);
  const onMessage = (e: WebViewMessageEvent) => {
    const m = parseExamMessage(e.nativeEvent.data);
    if (!m) return;
    touch();
    if (m.kind !== 'page') return;
    setPager({ page: m.page, of: m.of });
    const words = sheetLabel(m.page, m.of);
    if (announced.current !== words) {
      announced.current = words;
      AccessibilityInfo.announceForAccessibility(words);
    }
  };

  const go = (page: number) => {
    touch();
    web.current?.injectJavaScript(examGoScript(clampPage(page, pager.of)));
  };

  const togglePrinted = () => {
    touch();
    setPrintedMounted(true);
    setPrinted((p) => !p);
  };

  const done = () => {
    deactivateKeepAwake(EXAM_KEEP_AWAKE_TAG).catch(() => undefined);
    router.back();
  };

  return (
    <Animated.View style={[styles.root, { opacity: fade }]} onTouchStart={touch} accessibilityViewIsModal>
      <StatusBar style="light" />
      <View style={[styles.pager, { paddingTop: insets.top + theme.space1 }]}>
        {printed ? (
          <View style={styles.label} />
        ) : (
          <View
            testID={EXAM_PAGER_TEST_ID}
            style={styles.label}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={sheetLabel(pager.page, pager.of)}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(ev) => go(pager.page + (ev.nativeEvent.actionName === 'increment' ? 1 : -1))}
          >
            <ThemedText style={styles.labelText}>{sheetLabel(pager.page, pager.of)}</ThemedText>
          </View>
        )}
        {html !== null && (
          <Pressable style={styles.pill} onPress={togglePrinted} accessibilityRole="button">
            <ThemedText style={styles.pillText}>{printed ? EXAM_COPY.pages : EXAM_COPY.printed}</ThemedText>
          </Pressable>
        )}
        <Pressable style={styles.pill} onPress={done} accessibilityRole="button">
          <ThemedText style={styles.pillText}>{EXAM_COPY.done}</ThemedText>
        </Pressable>
      </View>
      <View style={styles.frame}>
        {html === null ? (
          <View style={styles.missing}>
            <ThemedText style={styles.missingText}>{EXAM_COPY.missing}</ThemedText>
          </View>
        ) : (
          <>
            <View
              style={StyleSheet.absoluteFill}
              importantForAccessibility={printed ? 'no-hide-descendants' : 'auto'}
              accessibilityElementsHidden={printed}
              pointerEvents={printed ? 'none' : 'auto'}
            >
              <WebView
                ref={web}
                testID={EXAM_PAGES_TEST_ID}
                style={styles.web}
                originWhitelist={['about:*', 'data:*']}
                source={{ html }}
                // The reflow's layout script and the paging script must run (lib/examRoom.ts).
                javaScriptEnabled
                onShouldStartLoadWithRequest={(req) => isPreviewLoadAllowed(req.url)}
                textZoom={Platform.OS === 'android' ? androidTextZoom(fontScale) : undefined}
                onMessage={onMessage}
                showsVerticalScrollIndicator
              />
            </View>
            {printedMounted && copy?.printHtml != null && (
              <View
                style={[StyleSheet.absoluteFill, printed ? styles.shown : styles.hidden]}
                importantForAccessibility={printed ? 'auto' : 'no-hide-descendants'}
                accessibilityElementsHidden={!printed}
                pointerEvents={printed ? 'auto' : 'none'}
              >
                <WebView
                  testID={EXAM_PRINTED_TEST_ID}
                  style={styles.web}
                  originWhitelist={['about:*', 'data:*']}
                  source={{ html: copy.printHtml }}
                  // The printed page carries no script.
                  javaScriptEnabled={false}
                  onShouldStartLoadWithRequest={(req) => isPreviewLoadAllowed(req.url)}
                />
              </View>
            )}
          </>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colorNeutralDark },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    paddingHorizontal: theme.space2,
    paddingBottom: theme.space1,
  },
  label: { flex: 1, minHeight: theme.hitTarget, justifyContent: 'center' },
  labelText: { fontSize: theme.textSM, color: theme.colorTextOnDarkSecondary },
  pill: {
    minHeight: theme.hitTarget,
    justifyContent: 'center',
    paddingHorizontal: theme.space1_5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colorBorderOnDark,
    borderRadius: theme.radiusFull,
  },
  pillText: { fontSize: theme.textSM, fontWeight: theme.weightMedium, color: theme.colorTextOnDark },
  frame: { flex: 1 },
  web: { flex: 1, backgroundColor: theme.colorNeutralDark },
  shown: { opacity: 1 },
  hidden: { opacity: 0 },
  missing: { flex: 1, justifyContent: 'center', paddingHorizontal: theme.space3 },
  missingText: { color: theme.colorTextOnDark, textAlign: 'center' },
});
