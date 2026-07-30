import { useState } from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { FileText } from 'lucide-react-native';
import { theme } from '../../constants/theme';

interface Props {
  /** Resolved local file:// path or signed URL. null ⇒ nothing to show yet. */
  uri?: string | null;
  isPdf?: boolean;
  /** A signed URL is still resolving — hold the slot, don't show a failure. */
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

// The document tile: a fixed 44×56 paper-proportioned slot that is never a broken
// hole and never a spinner.
//
// The "never a spinner" half is an acceptance criterion, not a preference (§8 AC
// 12, Sam's ER case): a document that can't be reached right now must say so by
// resting, because a spinner over a record a vet just asked for reads as "almost
// there" when the honest answer is "not without a connection". So the states are
// three, and all three are calm:
//   • uri            → the page
//   • loading        → a quiet neutral tile (a signed URL is in flight)
//   • otherwise      → the paper glyph (no local copy, signing failed, or offline)
//
// PDFs never render a preview at all (D5: store-and-view, no thumbnailing), so a
// PDF is the glyph plus its badge in every state — including when it IS available.
export function VetDocumentThumb({ uri, isPdf = false, loading = false, style }: Props) {
  const [failed, setFailed] = useState(false);
  const showImage = !isPdf && uri != null && !failed;

  return (
    <View style={[styles.tile, style]}>
      {showImage ? (
        <Image
          // Remount on a re-signed URL so an expired-token failure doesn't stick.
          key={uri}
          source={{ uri }}
          style={styles.image}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      ) : isPdf ? (
        <View style={styles.glyphWrap}>
          <FileText size={18} color={theme.colorTextTertiary} strokeWidth={1.75} />
          <Text style={styles.pdfBadge}>PDF</Text>
        </View>
      ) : loading ? (
        // Deliberately empty: the tile's own surface IS the pending state. A
        // WhorlSpinner here would be the spinner AC 12 forbids, and a glyph would
        // claim "unavailable" before we know that.
        <View style={styles.pending} />
      ) : (
        <View style={styles.glyphWrap}>
          <FileText size={18} color={theme.colorTextDisabled} strokeWidth={1.75} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: 44,
    height: 56,
    borderRadius: theme.radiusSmall,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    backgroundColor: theme.colorSurface,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  glyphWrap: {
    alignItems: 'center',
    gap: 3,
  },
  pdfBadge: {
    fontSize: 8,
    fontWeight: theme.weightSemibold,
    letterSpacing: theme.trackingWide,
    color: theme.colorTextSecondary,
  },
  pending: {
    width: '100%',
    height: '100%',
    backgroundColor: theme.colorSurfaceSubtle,
  },
});
