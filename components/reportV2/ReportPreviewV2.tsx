// The v2 preview (Vet report v2 PR-17, CUL-2297 + CUL-2383; spec §10.2, §10.7, §14).
//
// ONE DOCUMENT, TWO LAYOUTS. The phone frame renders `phoneHtml` (renderPhoneV2) and "View as
// printed" renders `printHtml` (renderPrintV2): the server built both from one DocumentV2, so the
// words, the flags and the order are the same (spec §3.4). The PDF is always `printHtml`.
//
// JAVASCRIPT IS ON IN THE PHONE FRAME, AND ONLY THERE (CUL-2383). The reflow's inline layout
// script does the compaction at large text, the keep-together spacer under the pinned warning and
// `data-tight`; with JS off the band lands four to six screens down at AX5. The document is our
// own server render with no external scripts, and the WebView may load nothing but it
// (`isPreviewLoadAllowed`). The printed frame stays script-free: it has no script to run.
//
// THE FRAME IS THE SCREEN BETWEEN THE BARS. The header above and the send bar below are flex
// siblings, never overlays, so the script's `window.innerHeight` is the frame the owner actually
// sees (the PR-15 note on CUL-2297: an overlaid bar would sit over the pinned warning).
//
// THE WAIT (MOT-2). The Front Page silhouette covers the frame from the first request until the
// phone document's `onLoadEnd`, then crossfades away (instant under Reduce Motion). A new document
// (a window change) brings it back over the old one until the new one has loaded, so no frame is
// ever blank or half-laid. The report itself never moves (Principle 6): only the wait does.
//
// THE BARS NEVER SHOW WITHOUT THEIR WARNING (CUL-2430, PM ruling (a) 2026-11-02). Two views on
// a phone could show the lead chart's bars with "Not a test of the diet alone." out of frame:
//  - "View as printed": the printed layout has no pin and no keep-together spacer. Above it this
//    frame pins the line's own lead sentence, natively (`printedWarningOf`, lib/examRoom.ts: the
//    words the reflow pins, read back from the reflow, never re-cut here). It is a sibling above
//    the printed page, never an overlay, so it is on screen at every scroll and zoom of the page
//    and covers none of it. It never prints; the page below stays the true printed page. No
//    confounder line, no pin, as in the reflow. A record whose line cannot be read back
//    (`printedViewAllowed` false) keeps the phone frame instead of showing the printed bars bare.
//  - Pinch-zoom on the phone frame: the reflow's pin anchors to the layout viewport, so a
//    magnified view of the chart's lower half lost both. The frame takes the exam room's lock
//    (`lockedViewportHtml` → EXAM_VIEWPORT on iOS, `setBuiltInZoomControls={false}` on Android).
//    The system's own Zoom and Magnification stay outside any app (acknowledged by the PM).
//
// PHONE ↔ PRINTED (spec §14). The swap happens in place, in this frame: no push, no flight. The
// printed frame mounts on first ask and then stays mounted, so a second swap is a crossfade with
// nothing to load. Under Reduce Motion it is instant.
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { theme } from '../../constants/theme';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { EXAM_VIEWPORT, lockedViewportHtml, printedViewAllowed, printedWarningOf } from '../../lib/examRoom';
import { ReportFrontSilhouette } from '../surfaces/waits/ReportFrontSilhouette';
import { ThemedText } from '../ui/ThemedText';
import {
  PREVIEW_READY_ANNOUNCEMENT,
  androidTextZoom,
  isPreviewLoadAllowed,
  type PreviewView,
} from '../../lib/reportPreviewV2';

export const PREVIEW_PHONE_TEST_ID = 'report-v2-phone';
export const PREVIEW_PRINTED_TEST_ID = 'report-v2-printed';
export const PREVIEW_PRINTED_WARNING_TEST_ID = 'report-v2-printed-warning';

/**
 * The phone document with its page scale locked (CUL-2430). The reflow's own viewport is swapped
 * for the exam room's; a document that does not carry it (a server render that changed the
 * markup) gets the lock as the last viewport in its head, which is the one the browser keeps.
 * The preview cannot refuse the page the way the room does, since the send flow runs through it,
 * so it locks louder rather than show the frame zoomable.
 */
export function lockedPreviewHtml(phoneHtml: string): string {
  const swapped = lockedViewportHtml(phoneHtml);
  if (swapped !== null) return swapped;
  const head = phoneHtml.indexOf('</head>');
  return head < 0 ? phoneHtml : `${phoneHtml.slice(0, head)}${EXAM_VIEWPORT}${phoneHtml.slice(head)}`;
}

export interface ReportPreviewV2Props {
  /** Null while the first build is in flight: only the silhouette shows. */
  phoneHtml: string | null;
  printHtml: string | null;
  view: PreviewView;
  petName: string | null;
  /** A generate request is in flight (the tick breathes only then). */
  working: boolean;
  /** The composer's outline reported a live flag: the silhouette draws the band's slot. */
  bandSlot: boolean;
}

export function ReportPreviewV2({ phoneHtml, printHtml, view, petName, working, bandSlot }: ReportPreviewV2Props) {
  const reduced = useReducedMotion();
  const { fontScale } = useWindowDimensions();

  // The document the silhouette is waiting on. It clears the moment a new one arrives, so the
  // wait covers the frames between a new `source` and its first paint.
  const [loadedHtml, setLoadedHtml] = useState<string | null>(null);
  const waiting = phoneHtml === null || loadedHtml !== phoneHtml;
  // Each document gets its own WebView instance, so a late onLoadEnd from the previous one can
  // never mark the new one loaded and lift the wait over a page still laying out (adversarial
  // pass 1 on PR-17).
  const docSeq = useRef<{ html: string | null; n: number }>({ html: null, n: 0 });
  if (docSeq.current.html !== phoneHtml) docSeq.current = { html: phoneHtml, n: docSeq.current.n + 1 };
  const docKey = `phone-${docSeq.current.n}`;
  const [silhouetteMounted, setSilhouetteMounted] = useState(true);
  const silhouetteOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (waiting) {
      silhouetteOpacity.stopAnimation();
      silhouetteOpacity.setValue(1);
      setSilhouetteMounted(true);
      return undefined;
    }
    AccessibilityInfo.announceForAccessibility(PREVIEW_READY_ANNOUNCEMENT);
    if (reduced) {
      silhouetteOpacity.setValue(0);
      setSilhouetteMounted(false);
      return undefined;
    }
    const anim = Animated.timing(silhouetteOpacity, {
      toValue: 0,
      duration: theme.durationFast,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    anim.start(({ finished }) => {
      if (finished) setSilhouetteMounted(false);
    });
    return () => anim.stop();
  }, [waiting, reduced, silhouetteOpacity]);

  const lockedPhoneHtml = useMemo(() => (phoneHtml === null ? null : lockedPreviewHtml(phoneHtml)), [phoneHtml]);
  // The printed page shows only where its warning can be pinned (lib/examRoom.ts).
  const printedAllowed = phoneHtml !== null && printHtml !== null && printedViewAllowed(phoneHtml);
  const printedWarning = useMemo(() => (phoneHtml === null ? null : printedWarningOf(phoneHtml)), [phoneHtml]);
  const showingPrinted = view === 'printed' && printedAllowed;

  // The printed frame mounts the first time it is shown, then stays.
  const [printedMounted, setPrintedMounted] = useState(showingPrinted);
  useEffect(() => {
    if (showingPrinted) setPrintedMounted(true);
  }, [showingPrinted]);
  const printedOpacity = useRef(new Animated.Value(showingPrinted ? 1 : 0)).current;
  useEffect(() => {
    const to = showingPrinted ? 1 : 0;
    if (reduced) {
      printedOpacity.setValue(to);
      return undefined;
    }
    const anim = Animated.timing(printedOpacity, {
      toValue: to,
      duration: theme.durationFast,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [showingPrinted, reduced, printedOpacity]);

  return (
    <View style={styles.frame}>
      {lockedPhoneHtml !== null && (
        <View
          style={StyleSheet.absoluteFill}
          importantForAccessibility={showingPrinted ? 'no-hide-descendants' : 'auto'}
          accessibilityElementsHidden={showingPrinted}
          pointerEvents={showingPrinted ? 'none' : 'auto'}
        >
          <WebView
            key={docKey}
            testID={PREVIEW_PHONE_TEST_ID}
            style={styles.web}
            originWhitelist={['about:*', 'data:*']}
            source={{ html: lockedPhoneHtml }}
            // CUL-2383: the reflow's layout script must run (header above).
            javaScriptEnabled
            onShouldStartLoadWithRequest={(req) => isPreviewLoadAllowed(req.url)}
            // No pinch on Android either (CUL-2430; EXAM_VIEWPORT locks it on iOS).
            setBuiltInZoomControls={false}
            textZoom={Platform.OS === 'android' ? androidTextZoom(fontScale) : undefined}
            onLoadEnd={() => setLoadedHtml(phoneHtml)}
            showsVerticalScrollIndicator
          />
        </View>
      )}
      {printedMounted && printedAllowed && printHtml !== null && (
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.printed, { opacity: printedOpacity }]}
          importantForAccessibility={showingPrinted ? 'auto' : 'no-hide-descendants'}
          accessibilityElementsHidden={!showingPrinted}
          pointerEvents={showingPrinted ? 'auto' : 'none'}
        >
          {printedWarning !== null && (
            // The line's own words are in the page below; this repeat is for the eye only, as
            // the reflow's pin is (aria-hidden there).
            <View
              testID={PREVIEW_PRINTED_WARNING_TEST_ID}
              style={styles.printedWarning}
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden
            >
              <ThemedText style={styles.printedWarningText}>{printedWarning}</ThemedText>
            </View>
          )}
          <WebView
            testID={PREVIEW_PRINTED_TEST_ID}
            style={styles.web}
            originWhitelist={['about:*', 'data:*']}
            source={{ html: printHtml }}
            // The printed page carries no script; the surface stays minimal.
            javaScriptEnabled={false}
            onShouldStartLoadWithRequest={(req) => isPreviewLoadAllowed(req.url)}
            showsVerticalScrollIndicator
          />
        </Animated.View>
      )}
      {silhouetteMounted && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: silhouetteOpacity }]} pointerEvents={waiting ? 'auto' : 'none'}>
          <ReportFrontSilhouette petName={petName} working={working} bandSlot={bandSlot} />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: theme.colorSurface },
  web: { flex: 1, backgroundColor: theme.colorSurface },
  printed: { flexDirection: 'column' },
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
});
