import { useEffect, useState } from 'react';
import { Modal, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { theme } from '../../constants/theme';
import { WhorlSpinner } from '../brand/WhorlSpinner';
import { ThemedText } from '../ui/ThemedText';

interface Props {
  visible: boolean;
  /** A local file:// path or a signed URL. null ⇒ the honest unreachable state. */
  uri: string | null;
  title: string;
  onClose: () => void;
}

// Full-screen PDF view (G2: store-and-view). The "native viewer" half of §4.3.
//
// WKWebView renders PDFs natively — page thumbnails, pinch zoom, text selection —
// so a WebView pointed at the file IS the native viewer on the platform this app
// ships on, with no new native module and therefore no `eas build` gate. That
// matters here specifically: VF-3 already had to ship `expo-document-picker` behind
// a lazy require because neither existing binary contains it, and adding a second
// native dependency in the very next PR would put the whole feature behind a build
// cut instead of one row of it.
//
// Reading a LOCAL pdf needs a permission grant on both platforms and they are not
// the same one: iOS WKWebView needs `allowingReadAccessToURL` scoped to the
// containing directory, Android needs `allowFileAccess`. Both are scoped as
// narrowly as the API allows — the document directory this app owns, never the
// filesystem root — and neither applies to the https case.
//
// `javaScriptEnabled={false}`: a PDF needs no scripting to render, and this is a
// third-party clinical document from an unknown clinic's PIMS. Same posture the
// vet-report WebView takes over its own server-rendered HTML.
export function DocumentPdfViewer({ visible, uri, title, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  // The URI this open is rendering. Latched when the viewer BECOMES visible and
  // held for the life of that open, deliberately ignoring later changes to `uri`.
  //
  // That is not defensive coding, it is the AC-12 cache interacting with this
  // screen: opening a remote PDF starts a background download that rewrites the
  // row's `local_uri`, so the caller's `uri` flips from a signed URL to a file://
  // path a second or two into reading. Following it would tear down a rendered
  // document and restart it behind a spinner, for identical bytes. The next open
  // picks up the local copy.
  const [openUri, setOpenUri] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setOpenUri(uri);
      // Reset per open — a viewer that stayed in its previous failed state would
      // show "couldn't load" over a document that loads fine.
      setLoading(true);
      setFailed(false);
    }
    // `uri` is intentionally absent: see the latch note above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const isLocal = !!openUri && openUri.startsWith('file://');
  // The directory containing the file, which is the narrowest grant WKWebView
  // accepts (it will not take a single-file URL as the read-access scope).
  const readAccessUrl = isLocal ? openUri.slice(0, openUri.lastIndexOf('/') + 1) : undefined;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.bar}>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <ThemedText style={styles.close}>Done</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.title} numberOfLines={1}>{title}</ThemedText>
          {/* Balances the Done button so the title sits centred. */}
          <View style={styles.barSpacer} />
        </View>

        {openUri == null || failed ? (
          // AC 12's honest half. Named separately from a load failure only in the
          // copy, because to the owner in an exam room the two are the same
          // problem and neither is fixed by waiting.
          <View style={styles.centre}>
            <ThemedText style={styles.emptyTitle}>
              {openUri == null ? 'This PDF needs a connection' : 'That PDF wouldn’t open'}
            </ThemedText>
            <ThemedText style={styles.emptyBody}>
              {openUri == null
                ? 'It’s saved to your account — open it once with a signal and it stays on this phone.'
                : 'The file is still saved. Try opening it again in a moment.'}
            </ThemedText>
          </View>
        ) : (
          <View style={styles.body}>
            <WebView
              style={styles.web}
              source={{ uri: openUri }}
              // Pinned to the ONE document being opened, not '*'. This is a
              // third-party clinical file from an unknown clinic's PIMS, and a
              // PDF can carry links: with a permissive whitelist and no
              // navigation handler, tapping one navigated in-WebView and WKWebView
              // sent `Referer: <the current document URL>` — which, for a
              // not-yet-cached document, is the SIGNED URL, i.e. a bearer token
              // for a lab result handed to whatever host the link named. The
              // 15-minute TTL bounded the damage; it was not a control (VF-6,
              // found by rls-privacy-reviewer).
              originWhitelist={[]}
              onShouldStartLoadWithRequest={(req) => req.url === openUri}
              javaScriptEnabled={false}
              // No disk cache and no back-forward list: the bytes and the signed
              // URL would otherwise land in WebKit's own cache, which is outside
              // every wipe path this app controls (§6.2 "never persisted").
              cacheEnabled={false}
              incognito
              allowFileAccess={isLocal && Platform.OS === 'android'}
              allowingReadAccessToURL={readAccessUrl}
              onLoadEnd={() => setLoading(false)}
              onError={() => { setLoading(false); setFailed(true); }}
              onHttpError={() => { setLoading(false); setFailed(true); }}
            />
            {loading && (
              // A real wait over a fetch already in flight, so a spinner is the
              // honest indicator here — unlike the hero's unreachable state, which
              // must never spin because nothing is coming.
              <View style={styles.loading} pointerEvents="none">
                <WhorlSpinner size="md" ground="day" />
              </View>
            )}
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorNeutralLight,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    paddingHorizontal: theme.space2,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
    backgroundColor: theme.colorSurface,
  },
  close: {
    fontSize: theme.textMD,
    fontWeight: theme.weightSemibold,
    color: theme.colorAccentInk,
    width: 52,
  },
  barSpacer: {
    width: 52,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  body: {
    flex: 1,
  },
  web: {
    flex: 1,
    backgroundColor: theme.colorNeutralLight,
  },
  loading: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colorNeutralLight,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space1,
    paddingHorizontal: theme.space3,
  },
  emptyTitle: {
    fontSize: theme.textLG,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightBody,
    color: theme.colorTextTertiary,
    textAlign: 'center',
  },
});
