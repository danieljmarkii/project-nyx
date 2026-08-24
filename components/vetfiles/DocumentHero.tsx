import { useState } from 'react';
import { Image, StyleSheet, TouchableOpacity, View } from 'react-native';
import { FileText } from 'lucide-react-native';
import { theme, shadows } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';

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
//   • a REACHABLE PDF         → the glyph plus Open (D5: store-and-view, no PDF
//                               thumbnailing, so a PDF has no preview even when it
//                               is fully available — but it still needs a URI to
//                               open)
//   • nothing reachable       → an honest "needs a connection" line, never a
//                               spinner — for a PDF as much as an image
//
// That last rule is Sam's ER case, and it is why this component has no
// WhorlSpinner anywhere in it. A spinner over a record a vet has just asked for
// reads as "almost there" when the honest answer is "not without a signal" — and
// the owner spends the wait believing the document is coming. The tile rests
// instead, and says which it is.
//
// B-591 — the PDF unreachable state used to be a hole. The branch order tested
// `isPdf` BEFORE reachability, so a never-opened remote PDF (uri == null on a
// second device) fell into the PDF arm and drew the glyph + "PDF" badge with no
// Open pill and no explanation: a tile that looks openable, isn't, and says
// nothing about why. AC 12's honest sentence was structurally unreachable for the
// PDF case. The isPdf arm now requires a URI, so an unreachable PDF falls through
// to the same honest line an unreachable image gets — worded for the PDF.
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
      ) : isPdf && uri != null ? (
        // Reachable PDF: the glyph stands in for the (deliberately absent) preview.
        // The `uri != null` guard is B-591 — without it an unreachable PDF renders
        // this openable-looking tile and never reaches the honest line below.
        <View style={styles.centre}>
          <FileText size={38} color={theme.colorTextTertiary} strokeWidth={1.5} />
          <ThemedText style={styles.pdfBadge}>PDF</ThemedText>
        </View>
      ) : unreachable || failed ? (
        <View style={styles.centre}>
          <FileText size={34} color={theme.colorTextDisabled} strokeWidth={1.5} />
          {/* The sentence names what the owner cannot do: a PDF is opened, never
              previewed (there is no page to "show"), so the two arms of AC 12 read
              differently even though they share this branch. */}
          <ThemedText style={styles.offline}>
            {isPdf ? 'Needs a connection to open this PDF' : 'Needs a connection to show this page'}
          </ThemedText>
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
          <ThemedText style={styles.openText}>Open</ThemedText>
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
