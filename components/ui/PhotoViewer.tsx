// Fullscreen photo viewer (lightbox). Single shared implementation for every
// detail screen that expands a photo — event detail, edit-event, and the food
// detail carousel. Purely presentational: callers pass already-resolved image
// URIs (local file URIs or signed URLs); this component never fetches.
//
// Renders a single image when one URI is passed, or a paging gallery (opening
// at `initialIndex`) when several are. The black backdrop + white controls are
// intentional lightbox styling, not theme-driven.
import { useEffect, useRef, useState } from 'react';
import {
  View, Image, Text, StyleSheet, Modal, TouchableOpacity, ScrollView,
  Dimensions, NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import { theme } from '../../constants/theme';

interface Props {
  visible: boolean;
  // Resolved image URIs. `null` entries render a "Photo unavailable" slot
  // (e.g. a signed URL that failed to resolve), matching the carousel.
  uris: (string | null)[];
  // Which photo to open on first show; clamped to range.
  initialIndex?: number;
  onClose: () => void;
  // Optional actions — the button renders only when its callback is provided,
  // so single-photo callers can opt into Replace/Remove and the food viewer
  // can omit both.
  onReplace?: () => void;
  onRemove?: () => void;
}

export function PhotoViewer({ visible, uris, initialIndex = 0, onClose, onReplace, onRemove }: Props) {
  const screenWidth = Dimensions.get('window').width;
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(initialIndex);
  const multi = uris.length > 1;

  // Snap to the tapped photo each time the viewer opens. contentOffset alone is
  // unreliable on Android, so we also scrollTo via the ref once mounted.
  useEffect(() => {
    if (!visible) return;
    const clamped = Math.max(0, Math.min(initialIndex, uris.length - 1));
    setPage(clamped);
    if (multi) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ x: clamped * screenWidth, animated: false });
      });
    }
  }, [visible, initialIndex, uris.length, screenWidth, multi]);

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
    if (next !== page) setPage(next);
  }

  function renderImage(uri: string | null, key: string) {
    return (
      <View key={key} style={[styles.slide, { width: screenWidth }]}>
        {uri ? (
          // Tap anywhere on the photo to dismiss (Jordan: thumb went to the
          // image, not the corner). absoluteFill pins the image to the slide so
          // a flex:1 image never collapses; swipe still pages via the ScrollView.
          <TouchableOpacity activeOpacity={1} onPress={onClose} style={StyleSheet.absoluteFill}>
            <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
          </TouchableOpacity>
        ) : (
          <View style={styles.unavailable}>
            <Text style={styles.unavailableText}>Photo unavailable</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.viewer}>
        {multi ? (
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            contentOffset={{ x: initialIndex * screenWidth, y: 0 }}
            onScroll={handleScroll}
            scrollEventThrottle={32}
            style={styles.gallery}
          >
            {uris.map((u, i) => renderImage(u, `${i}`))}
          </ScrollView>
        ) : uris[0] ? (
          // Single image: the touchable takes the proven full-screen box
          // (width:'100%', flex:1) and the image absoluteFills it — tap to
          // dismiss without reintroducing the flex-collapse-to-black bug.
          <TouchableOpacity activeOpacity={1} onPress={onClose} style={styles.image}>
            <Image source={{ uri: uris[0] }} style={StyleSheet.absoluteFill} resizeMode="contain" />
          </TouchableOpacity>
        ) : (
          <View style={styles.unavailable}>
            <Text style={styles.unavailableText}>Photo unavailable</Text>
          </View>
        )}

        {multi && (
          <View style={styles.dotsRow} pointerEvents="none">
            {uris.map((_, i) => (
              <View key={i} style={[styles.dot, i === page && styles.dotActive]} />
            ))}
          </View>
        )}

        <View style={styles.actions}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={12}>
            <Text style={styles.closeText}>✕  Close</Text>
          </TouchableOpacity>
          <View style={styles.rightActions}>
            {onReplace && (
              <TouchableOpacity style={styles.secondary} onPress={onReplace} hitSlop={12}>
                <Text style={styles.secondaryText}>Replace</Text>
              </TouchableOpacity>
            )}
            {onRemove && (
              <TouchableOpacity style={styles.destructive} onPress={onRemove} hitSlop={12}>
                <Text style={styles.destructiveText}>Remove</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  viewer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gallery: {
    flex: 1,
    width: '100%',
  },
  slide: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    flex: 1,
  },
  unavailable: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  unavailableText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
  },
  dotsRow: {
    position: 'absolute',
    bottom: 96,
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
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: {
    backgroundColor: '#fff',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: theme.space3,
    paddingVertical: theme.space3,
    paddingBottom: 40,
  },
  closeBtn: {
    paddingVertical: theme.space1,
    paddingHorizontal: theme.space2,
  },
  closeText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: theme.fontWeightMedium,
  },
  rightActions: {
    flexDirection: 'row',
    gap: theme.space1,
  },
  secondary: {
    paddingVertical: theme.space1,
    paddingHorizontal: theme.space2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: theme.radiusSmall,
  },
  secondaryText: {
    fontSize: 15,
    color: '#fff',
    fontWeight: theme.fontWeightMedium,
  },
  destructive: {
    paddingVertical: theme.space1,
    paddingHorizontal: theme.space2,
    borderRadius: theme.radiusSmall,
  },
  destructiveText: {
    fontSize: 15,
    color: '#ff6b6b',
    fontWeight: theme.fontWeightMedium,
  },
});
