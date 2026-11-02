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
// "PRINTED PAGE" CARRIES ITS WARNING (PM ruling (a) on CUL-2430). The printed layout on a phone
// has no pin and no keep-together spacer, so its first screen could show the lead chart's bars
// without "Not a test of the diet alone." (adversarial pass on PR-19). Above the printed view the
// room pins the line's own lead sentence (`printedWarningOf`, the words the reflow pins), as a
// sibling of the view, never an overlay, so it is on screen at every scroll and zoom of the page
// and covers none of it. It is native, so it never prints. No confounder line, no pin, as in the
// reflow. The printed page keeps its own zoom: the pin does not depend on where the page is.
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
import { useRotationUnlocked } from '../lib/screenOrientation';
import {
  EXAM_IDLE_MS,
  REPORT_WEBVIEW_ORIGINS,
  clampPage,
  examGoScript,
  examRoomHtml,
  keepAwakeWanted,
  parseExamMessage,
  printedViewAllowed,
  printedWarningOf,
  sheetLabel,
  withExamCsp,
} from '../lib/examRoom';
import { clearExamCopy, readExamCopy } from '../lib/examRoomCopy';
import { androidTextZoom, isPreviewLoadAllowed } from '../lib/reportPreviewV2';

export const EXAM_PAGES_TEST_ID = 'exam-room-pages';
export const EXAM_PAGER_TEST_ID = 'exam-room-pager';
export const EXAM_PRINTED_TEST_ID = 'exam-room-printed';
export const EXAM_PRINTED_WARNING_TEST_ID = 'exam-room-printed-warning';
export const EXAM_KEEP_AWAKE_TAG = 'nyx-exam-room';

export const EXAM_COPY = {
  printed: 'Printed page',
  pages: 'Large type',
  done: 'Done',
  missing: 'This report is no longer on this phone. Open it again from the preview.',
  pagerLabel: 'Report sheets',
} as const;

/** The room opens no window: a link or `window.open` goes nowhere. */
function refuseWindow(): void {}

export default function ExamRoomScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const appActive = useAppActive();
  const { fontScale } = useWindowDimensions();
  // The one route that may turn (lib/screenOrientation.ts, PM ruling on the landscape fork):
  // sideways, the sheet fits the width. Portrait is locked again when the room closes.
  useRotationUnlocked(true);

  // Read once: the copy is fixed for the life of the room.
  const [copy] = useState(() => readExamCopy());
  const html = useMemo(() => (copy ? examRoomHtml(copy.phoneHtml, theme.colorNeutralDark) : null), [copy]);
  // Withheld when the record has a confounder line whose pin cannot be read back (fails loud).
  const printHtml = useMemo(
    () => (copy?.printHtml != null && printedViewAllowed(copy.phoneHtml) ? withExamCsp(copy.printHtml) : null),
    [copy],
  );
  const printedWarning = useMemo(() => (copy ? printedWarningOf(copy.phoneHtml) : null), [copy]);
  // The copy goes when the room closes, however it closes (Done, Android back, a dismissal).
  useEffect(() => () => clearExamCopy(), []);

  const web = useRef<ComponentRef<typeof WebView>>(null);
  const [pager, setPager] = useState<{ page: number; of: number }>({ page: 1, of: 1 });
  const [printed, setPrinted] = useState(false);
  const [printedMounted, setPrintedMounted] = useState(false);

  // Keep-awake: open, foregrounded, touched within the idle window. `idle` is STATE the timer
  // sets unconditionally (code review on PR-19): re-deriving it from the clock at render let a
  // timer that fired a few ms early, or one iOS suspended in the background, leave the screen
  // awake until the next touch. A touch, a scroll of either page, or coming back to the front
  // starts the window again.
  const [idle, setIdle] = useState(false);
  const [touchTick, setTouchTick] = useState(0);
  const lastTouch = useRef(0);
  const touch = () => {
    const now = Date.now();
    if (now - lastTouch.current < 1000) return;
    lastTouch.current = now;
    setIdle(false);
    setTouchTick((n) => n + 1);
  };
  useEffect(() => {
    if (appActive) {
      setIdle(false);
      setTouchTick((n) => n + 1);
    }
  }, [appActive]);
  useEffect(() => {
    const t = setTimeout(() => setIdle(true), EXAM_IDLE_MS);
    return () => clearTimeout(t);
  }, [touchTick]);
  const awake = keepAwakeWanted({ open: true, appActive, idle });
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

  // A text-size change with the room open reloads the pages (the document's key carries the
  // scale): WKWebView does not re-resolve `-apple-system-body` live, and an injected re-measure
  // could run before Android applied the new textZoom (code review on PR-19). The reload lands on
  // sheet 1 and announces it.
  const docKey = `exam-${Math.round(fontScale * 100)}`;

  // The pager is an adjustable element whose VALUE is "Sheet N of M": VoiceOver speaks a value
  // change it caused itself, so a turn from the pager is not announced a second time. A turn
  // from anywhere else (entry, a swipe, a reload) is.
  const pagerTurn = useRef(false);
  const onMessage = (e: WebViewMessageEvent) => {
    const m = parseExamMessage(e.nativeEvent.data);
    if (!m) return;
    touch();
    if (m.kind !== 'page') return;
    setPager({ page: m.page, of: m.of });
    if (pagerTurn.current) {
      pagerTurn.current = false;
      return;
    }
    AccessibilityInfo.announceForAccessibility(sheetLabel(m.page, m.of));
  };

  const go = (page: number) => {
    touch();
    const to = clampPage(page, pager.of);
    if (to === pager.page) return;
    pagerTurn.current = true;
    web.current?.injectJavaScript(examGoScript(to));
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
            accessibilityLabel={EXAM_COPY.pagerLabel}
            accessibilityValue={{ text: sheetLabel(pager.page, pager.of) }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(ev) => go(pager.page + (ev.nativeEvent.actionName === 'increment' ? 1 : -1))}
          >
            <ThemedText style={styles.labelText}>{sheetLabel(pager.page, pager.of)}</ThemedText>
          </View>
        )}
        {html !== null && printHtml !== null && (
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
                key={docKey}
                ref={web}
                testID={EXAM_PAGES_TEST_ID}
                style={styles.web}
                originWhitelist={REPORT_WEBVIEW_ORIGINS}
                source={{ html }}
                // The reflow's layout script and the paging script must run (lib/examRoom.ts).
                javaScriptEnabled
                onShouldStartLoadWithRequest={(req) => isPreviewLoadAllowed(req.url)}
                // Android opens a new window in a fresh WebView that skips the load predicate
                // (privacy review on PR-19): the room opens none.
                onOpenWindow={refuseWindow}
                // No pinch on Android either (lib/examRoom.ts EXAM_VIEWPORT locks it on iOS).
                setBuiltInZoomControls={false}
                textZoom={Platform.OS === 'android' ? androidTextZoom(fontScale) : undefined}
                onMessage={onMessage}
                onScroll={touch}
                showsVerticalScrollIndicator
              />
            </View>
            {printedMounted && printHtml !== null && (
              <View
                style={[StyleSheet.absoluteFill, styles.printed, printed ? styles.shown : styles.hidden]}
                importantForAccessibility={printed ? 'auto' : 'no-hide-descendants'}
                accessibilityElementsHidden={!printed}
                pointerEvents={printed ? 'auto' : 'none'}
              >
                {printedWarning !== null && (
                  // The line's own words are in the page below; this repeat is for the eye only,
                  // as the reflow's pin is (aria-hidden there).
                  <View
                    testID={EXAM_PRINTED_WARNING_TEST_ID}
                    style={styles.printedWarning}
                    importantForAccessibility="no-hide-descendants"
                    accessibilityElementsHidden
                  >
                    <ThemedText style={styles.printedWarningText}>{printedWarning}</ThemedText>
                  </View>
                )}
                <WebView
                  testID={EXAM_PRINTED_TEST_ID}
                  style={styles.web}
                  originWhitelist={REPORT_WEBVIEW_ORIGINS}
                  source={{ html: printHtml }}
                  // The printed page carries no script.
                  javaScriptEnabled={false}
                  onShouldStartLoadWithRequest={(req) => isPreviewLoadAllowed(req.url)}
                  onOpenWindow={refuseWindow}
                  // No script to report a touch, so its scroll keeps the screen awake.
                  onScroll={touch}
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
  printed: { flexDirection: 'column' },
  shown: { opacity: 1 },
  hidden: { opacity: 0 },
  printedWarning: {
    backgroundColor: theme.colorSurface,
    paddingHorizontal: theme.space2,
    paddingVertical: theme.space1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colorBorder,
  },
  printedWarningText: {
    fontSize: theme.textLG,
    lineHeight: theme.lineHeightLG,
    fontWeight: theme.weightSemibold,
    color: theme.colorEventSymptomInk,
  },
  missing: { flex: 1, justifyContent: 'center', paddingHorizontal: theme.space3 },
  missingText: { color: theme.colorTextOnDark, textAlign: 'center' },
});
