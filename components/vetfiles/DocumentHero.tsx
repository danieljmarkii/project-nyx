import { useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FileText } from 'lucide-react-native';
import { theme, shadows } from '../../constants/theme';

interface Props {
  /** Resolved cover URI — a local file:// path or a signed URL. */
  uri: string | null;
  isPdf: boolean;
  pageCount: number;
  /** Which page the viewer would open on; drives the dots. */
  pageIndex: number;
  /** A signed URL is still in flight — hold the slot, claim nothing. */
  loading?: boolean;
  onOpen: () => void;
}

// The detail hero (mock E-img-r2 / E-pdf-r2): the document itself, an Open
// affordance, and page dots when there is more than one page.
//
// THREE STATES, AND THE THIRD IS AN ACCEPTANCE CRITERION (§8 AC 12).
//   • a page to show          → the page, with Open overlaid
//   • a PDF                   → the glyph plus Open, always (D5: store-and-view,
//                               no PDF thumbnailing, so a PDF has no preview even
//                               when it is fully available)
//   • nothing reachable       → an honest "needs a connection" line, never a
//                               spinner
//
// That last rule is Sam's ER case, and it is why this component has no
// WhorlSpinner anywhere in it. A spinner over a record a vet has just asked for
// reads as "almost there" when the honest answer is "not without a signal" — and
// the owner spends the wait believing the document is coming. The tile rests
// instead, and says which it is.
//
// The hero is not itself the viewer: tapping anywhere on it calls `onOpen`, and the
// screen decides whether that means the full-screen image viewer or the PDF one.
export function DocumentHero({
  uri, isPdf, pageCount, pageIndex, loading = false, onOpen,
}: Props) {
  const [failed, setFailed] = useState(false);
  const showImage = !isPdf && uri != null && !failed;
  // A PDF is openable whenever we have any URI at all; an image is openable when
  // its preview actually rendered. Offering Open on a page we could not fetch would
  // hand the owner a black viewer instead of a sentence.
  const openable = isPdf ? uri != null : showImage;
  const unreachable = uri == null && !loading;

  return (
    <TouchableOpacity
      style={styles.hero}
      onPress={onOpen}
      disabled={!openable}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={
        openable
          ? isPdf ? 'Open this PDF' : 'Open this document full screen'
          : 'This document needs a connection'
      }
    >
      {showImage ? (
        <Image
          // Remount on a re-signed URL so an expired-token failure doesn't stick.
          key={uri}
          source={{ uri: uri as string }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      ) : isPdf ? (
        <View style={styles.centre}>
          <FileText size={38} color={theme.colorTextTertiary} strokeWidth={1.5} />
          <Text style={styles.pdfBadge}>PDF</Text>
        </View>
      ) : unreachable || failed ? (
        <View style={styles.centre}>
          <FileText size={34} color={theme.colorTextDisabled} strokeWidth={1.5} />
          <Text style={styles.offline}>Needs a connection to show this page</Text>
        </View>
      ) : (
        // Loading: the surface itself is the pending state. Deliberately empty —
        // see the header note on why there is no spinner here.
        <View style={styles.pending} />
      )}

      {pageCount > 1 && (
        <View style={styles.dots} pointerEvents="none">
          {Array.from({ length: pageCount }, (_, i) => (
            <View key={i} style={[styles.dot, i === pageIndex && styles.dotOn]} />
          ))}
        </View>
      )}

      {openable && (
        <View
          style={[styles.openPill, !isPdf && styles.openPillOverlay]}
          pointerEvents="none"
        >
          <Text style={styles.openText}>Open</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  hero: {
    height: 190,
    borderRadius: theme.radiusMedium,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    backgroundColor: theme.colorSurface,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  centre: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: theme.space3,
  },
  pending: {
    ...StyleSheet.absoluteFill,
    backgroundColor: theme.colorSurfaceSubtle,
  },
  pdfBadge: {
    fontSize: theme.textXS,
    fontWeight: theme.weightSemibold,
    letterSpacing: theme.trackingWide,
    color: theme.colorTextSecondary,
  },
  offline: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextTertiary,
    textAlign: 'center',
  },
  dots: {
    position: 'absolute',
    left: 14,
    bottom: 12,
    flexDirection: 'row',
    gap: 5,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorBorderStrong,
  },
  dotOn: {
    backgroundColor: theme.colorAccent,
  },
  openPill: {
    backgroundColor: theme.colorAccentLight,
    borderRadius: theme.radiusFull,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginTop: 10,
  },
  // Over a rendered page the pill sits in the corner; over the PDF glyph it sits
  // in the stack under it (mock: `.open-pill.overlay` vs the pdfhero's flow pill).
  openPillOverlay: {
    position: 'absolute',
    right: 10,
    bottom: 8,
    marginTop: 0,
    ...shadows.sm,
  },
  openText: {
    fontSize: theme.textSM,
    fontWeight: theme.weightSemibold,
    color: theme.colorAccentInk,
  },
});
