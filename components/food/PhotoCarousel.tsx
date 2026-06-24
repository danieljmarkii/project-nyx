import { useEffect, useState } from 'react';
import {
  View, Image, StyleSheet, ScrollView, ActivityIndicator,
  Dimensions, TouchableOpacity, Text,
  NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import { Camera } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { getSignedUrl } from '../../lib/storage';
import { PhotoViewer } from '../ui';

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
    return (
      <TouchableOpacity
        style={[styles.hero, styles.heroEmpty]}
        onPress={onAddPhoto}
        activeOpacity={onAddPhoto ? 0.7 : 1}
        disabled={!onAddPhoto}
      >
        {/* B-062 — Lucide Camera (was a 📷 emoji) so the photo affordances are all
            vector glyphs. The trailing "＋ Add another" slide stays a plain glyph —
            it's a plus, not a camera, and never renders alongside this empty state. */}
        <Camera size={36} color={theme.colorTextTertiary} strokeWidth={1.5} />
        <Text style={styles.emptyText}>
          {onAddPhoto ? 'Tap to add a photo' : 'No photos yet'}
        </Text>
      </TouchableOpacity>
    );
  }

  if (loading) {
    return (
      <View style={[styles.hero, styles.heroLoading]}>
        <ActivityIndicator color={theme.colorAccent} />
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
                <Text style={styles.emptyText}>Photo unavailable</Text>
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
            >
              <Text style={styles.emptyIcon}>＋</Text>
              <Text style={styles.emptyText}>Add another photo</Text>
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
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  dotActive: {
    backgroundColor: '#fff',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
