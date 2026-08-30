import { useEffect, useState } from 'react';
import {
  View, Image, StyleSheet, ScrollView,
  Dimensions, TouchableOpacity, Text,
  NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import { Camera } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { WhorlSpinner } from '../brand/WhorlSpinner';
import { getSignedUrl } from '../../lib/storage';
import { PhotoViewer } from '../ui';
import { ThemedText } from '../ui/ThemedText';

interface Props {
  // Storage paths into the nyx-food-photos bucket. Bucket is private so we
  // resolve signed URLs (getPublicUrl returns a 400ing URL for private buckets).
  photoPaths: string[];
  // Optional add-photo CTA appended after the last image.
  onAddPhoto?: () => void;
}

const HERO_HEIGHT = 280;

export function PhotoCarousel({ photoPaths, onAddPhoto }: Props) {
  const [urls, setUrls] = useState<(string | null)[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  // Tap a photo to expand it fullscreen for in-hand product comparison (B-022).
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all(photoPaths.map((p) => getSignedUrl('nyx-food-photos', p)))
      .then((resolved) => {
        if (!cancelled) {
          setUrls(resolved);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [photoPaths.join('|')]);

  if (photoPaths.length === 0) {
    // B-062 — Lucide Camera (was a 📷 emoji) so the photo affordances are all
    // vector glyphs. The trailing "＋ Add another" slide stays a plain glyph —
    // it's a plus, not a camera, and never renders alongside this empty state.
    const glyph = <Camera size={36} color={theme.colorTextTertiary} strokeWidth={1.5} />;

    // ── ONE HERO, TWO HOSTS (CUL-728) ────────────────────────────────────────
    //
    // This was one TouchableOpacity with `disabled={!onAddPhoto}`, no role and no
    // label. RN copies `disabled` into `accessibilityState.disabled`
    // (TouchableOpacity.js) and iOS maps that to UIAccessibilityTraitNotEnabled,
    // which VoiceOver speaks as "dimmed" — so a hero with nothing to tap
    // announced a control that is unavailable. The copy swap beside it is the
    // tell: one prop was choosing the sentence AND claiming a control exists.
    //
    // Not the shape CUL-728 assumed, and worth stating because it is the reason
    // this is still the right fix: the one caller (`app/food/[id].tsx`) drops
    // `onAddPhoto` only WHILE AN UPLOAD RUNS, not because it is a read-only host.
    // From in here those are the same absent prop, and the caller renders its own
    // "Adding photo…" row beside this hero — which is where a transient status
    // belongs. A hero that stops being a control is not a control that is off.
    //
    // `accessible` is load-bearing on the inert branch: without it the label is
    // inert and the Camera glyph can take a focus of its own beside the text.
    // No `accessibilityRole` — unlike RundownTileRow's sibling fix, there was
    // never an author decision here to preserve, and `text` would only restate
    // what a labelled, roleless node already announces.
    if (!onAddPhoto) {
      return (
        <View
          style={[styles.hero, styles.heroEmpty]}
          accessible
          accessibilityLabel="No photos yet"
        >
          {glyph}
          <ThemedText style={styles.emptyText}>No photos yet</ThemedText>
        </View>
      );
    }

    return (
      <TouchableOpacity
        style={[styles.hero, styles.heroEmpty]}
        onPress={onAddPhoto}
        activeOpacity={0.7}
        // The mirror of the same defect: a real button that never said it was
        // one. No `accessibilityLabel` — the visible line is the right
        // announcement, and an invented label is a string Voice Control cannot
        // match against what the owner can actually read on screen.
        accessibilityRole="button"
      >
        {glyph}
        <ThemedText style={styles.emptyText}>Tap to add a photo</ThemedText>
      </TouchableOpacity>
    );
  }

  if (loading) {
    return (
      <View style={[styles.hero, styles.heroLoading]}>
        <WhorlSpinner size="sm" ground="day" />
      </View>
    );
  }

  const screenWidth = Dimensions.get('window').width;
  const totalPages = urls.length + (onAddPhoto ? 1 : 0);

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const x = e.nativeEvent.contentOffset.x;
    const next = Math.round(x / screenWidth);
    if (next !== page) setPage(next);
  }

  return (
    <View>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        onScroll={handleScroll}
        scrollEventThrottle={32}
      >
        {urls.map((url, idx) => (
          <View key={`${photoPaths[idx]}-${idx}`} style={[styles.slide, { width: screenWidth }]}>
            {url ? (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => { setViewerIndex(idx); setViewerVisible(true); }}
              >
                <Image source={{ uri: url }} style={styles.image} resizeMode="cover" />
              </TouchableOpacity>
            ) : (
              <View style={[styles.image, styles.imageMissing]}>
                <ThemedText style={styles.emptyText}>Photo unavailable</ThemedText>
              </View>
            )}
          </View>
        ))}
        {onAddPhoto && (
          <View style={[styles.slide, { width: screenWidth }]}>
            <TouchableOpacity
              style={[styles.image, styles.addSlide]}
              onPress={onAddPhoto}
              activeOpacity={0.7}
              // Same affordance as the empty hero above, so it announces the same
              // way. This one does carry a label, because its visible line leads
              // with a ＋ glyph that would otherwise be read out as part of the
              // sentence; the label is the same words minus the glyph, so Voice
              // Control still matches what is on screen.
              accessibilityRole="button"
              accessibilityLabel="Add another photo"
            >
              {/* geist-ok: Icon glyph, not copy — stays raw so it keeps the system face. Geist's
                  cmap has no U+FF0B at all, so sweeping this one would buy nothing and
                  hand the render to OS fallback (CUL-364 §7). */}
              <Text style={styles.emptyIcon}>＋</Text>
              <ThemedText style={styles.emptyText}>Add another photo</ThemedText>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
      {totalPages > 1 && (
        <View style={styles.dotsRow} pointerEvents="none">
          {Array.from({ length: totalPages }).map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === page && styles.dotActive]}
            />
          ))}
        </View>
      )}

      <PhotoViewer
        visible={viewerVisible}
        uris={urls}
        initialIndex={viewerIndex}
        onClose={() => setViewerVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    height: HERO_HEIGHT,
  },
  slide: {
    height: HERO_HEIGHT,
  },
  hero: {
    height: HERO_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colorNeutralLight,
  },
  heroEmpty: {
    gap: theme.space1,
  },
  heroLoading: {
    backgroundColor: theme.colorNeutralLight,
  },
  image: {
    width: '100%',
    height: '100%',
    backgroundColor: theme.colorNeutralLight,
  },
  imageMissing: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  addSlide: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space1,
    backgroundColor: theme.colorNeutralLight,
  },
  emptyIcon: {
    fontSize: 36,
    color: theme.colorTextTertiary,
  },
  emptyText: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  dotsRow: {
    position: 'absolute',
    bottom: theme.space1,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colorTextOnDarkFaint,
  },
  dotActive: {
    backgroundColor: theme.colorTextOnDark,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
