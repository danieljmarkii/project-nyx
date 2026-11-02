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
// PHONE ↔ PRINTED (spec §14). The swap happens in place, in this frame: no push, no flight. The
// printed frame mounts on first ask and then stays mounted, so a second swap is a crossfade with
// nothing to load. Under Reduce Motion it is instant.
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { theme } from '../../constants/theme';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { ReportFrontSilhouette } from '../surfaces/waits/ReportFrontSilhouette';
import {
  PREVIEW_READY_ANNOUNCEMENT,
  androidTextZoom,
  isPreviewLoadAllowed,
  type PreviewView,
} from '../../lib/reportPreviewV2';

export const PREVIEW_PHONE_TEST_ID = 'report-v2-phone';
export const PREVIEW_PRINTED_TEST_ID = 'report-v2-printed';

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

  // The printed frame mounts the first time it is asked for, then stays.
  const [printedMounted, setPrintedMounted] = useState(view === 'printed');
  useEffect(() => {
    if (view === 'printed') setPrintedMounted(true);
  }, [view]);
  const printedOpacity = useRef(new Animated.Value(view === 'printed' ? 1 : 0)).current;
  useEffect(() => {
    const to = view === 'printed' ? 1 : 0;
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
  }, [view, reduced, printedOpacity]);

  const showingPrinted = view === 'printed';

  return (
    <View style={styles.frame}>
      {phoneHtml !== null && (
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
            source={{ html: phoneHtml }}
            // CUL-2383: the reflow's layout script must run (header above).
            javaScriptEnabled
            onShouldStartLoadWithRequest={(req) => isPreviewLoadAllowed(req.url)}
            textZoom={Platform.OS === 'android' ? androidTextZoom(fontScale) : undefined}
            onLoadEnd={() => setLoadedHtml(phoneHtml)}
            showsVerticalScrollIndicator
          />
        </View>
      )}
      {printedMounted && printHtml !== null && (
        <Animated.View
          style={[StyleSheet.absoluteFill, { opacity: printedOpacity }]}
          importantForAccessibility={showingPrinted ? 'auto' : 'no-hide-descendants'}
          accessibilityElementsHidden={!showingPrinted}
          pointerEvents={showingPrinted ? 'auto' : 'none'}
        >
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
});
