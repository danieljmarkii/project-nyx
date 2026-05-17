import { useEffect, useState } from 'react';
import {
  View, Image, StyleSheet, ScrollView, ActivityIndicator,
  Dimensions, TouchableOpacity, Text,
} from 'react-native';
import { theme } from '../../constants/theme';
import { getSignedUrl } from '../../lib/storage';

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
        <Text style={styles.emptyIcon}>📷</Text>
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

  return (
    <ScrollView
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
    >
      {urls.map((url, idx) => (
        <View key={`${photoPaths[idx]}-${idx}`} style={[styles.slide, { width: screenWidth }]}>
          {url ? (
            <Image source={{ uri: url }} style={styles.image} resizeMode="cover" />
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
});
