// Fullscreen photo viewer (lightbox). Single shared implementation for every
// detail screen that expands a photo — event detail, edit-event, medication
// detail, and the food detail carousel. Purely presentational: callers pass
// already-resolved image URIs (local file URIs or signed URLs); this component
// never fetches.
//
// Renders a single image when one URI is passed, or a paging gallery (opening
// at `initialIndex`) when several are. The black backdrop + white controls are
// intentional lightbox styling, not theme-driven.
//
// PINCH-TO-ZOOM (B-036, 2026-07-26). Each slide is wrapped in its own zoomable
// ScrollView. Three things about that are deliberate:
//
//  1. It uses RN's BUILT-IN ScrollView zoom (`maximumZoomScale` etc.) rather
//     than react-native-gesture-handler. Those props are iOS-only
//     (ScrollViewPropsIOS) — but iOS is the whole shipping surface today
//     (`supportsTablet: false`, iPhone-only submission runway), and they need no
//     native module, so this ships over the air instead of waiting on an
//     `eas build`. On Android the props are ignored and the slide degrades to
//     exactly the previous non-zooming behaviour. Cross-platform pinch, plus
//     double-tap and swipe-to-dismiss, is B-037's gesture-handler pass.
//  2. It adds NO tap gesture. Single-tap-anywhere-to-dismiss was a deliberate
//     B-022 fix (Jordan's thumb went to the image, not the corner), and
//     double-tap-to-zoom cannot coexist with an undelayed single tap. Pinch has
//     no such conflict, so tap-to-dismiss survives untouched.
//  3. The zoom ceiling is computed per photo from the pixels that actually
//     exist — see lib/photoZoom.ts for why, and for the one judgment call in it.
//
// The media box is MEASURED (onLayout) rather than taken from Dimensions, and
// slides are sized explicitly from it. Zoom needs content that exactly fills its
// frame at scale 1, and explicit sizing is also what retires the two
// flex-collapse-to-black traps the previous implementation carried comments
// about: there is no longer a flex:1 image anywhere to collapse.
import { useEffect, useRef, useState } from 'react';
import {
  View, Image, Text, StyleSheet, Modal, TouchableOpacity, ScrollView,
  PixelRatio, LayoutChangeEvent, NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import { theme } from '../../constants/theme';
import { resolveMaxZoomScale } from '../../lib/photoZoom';

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

interface Box {
  w: number;
  h: number;
}

export function PhotoViewer({ visible, uris, initialIndex = 0, onClose, onReplace, onRemove }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(initialIndex);
  // The measured media area. null until the first layout pass — the gallery
  // waits for it, which costs one frame of black on an already-black backdrop.
  // RN's Modal renders null while hidden, so this (and every slide's zoom state)
  // resets on each open, which is the reset-zoom-on-open behaviour we want.
  const [box, setBox] = useState<Box | null>(null);
  const multi = uris.length > 1;

  function handleMediaLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setBox((cur) => (cur && cur.w === width && cur.h === height ? cur : { w: width, h: height }));
  }

  // Snap to the tapped photo each time the viewer opens. Depends on `box`
  // because the offset is in measured points; contentOffset alone is unreliable
  // on Android, so we also scrollTo via the ref once mounted and measured.
  useEffect(() => {
    if (!visible) return;
    const clamped = clampIndex(initialIndex, uris.length);
    setPage(clamped);
    if (multi && box) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ x: clamped * box.w, animated: false });
      });
    }
  }, [visible, initialIndex, uris.length, multi, box]);

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!box) return;
    const next = Math.round(e.nativeEvent.contentOffset.x / box.w);
    if (next !== page) setPage(next);
  }

  function renderSlide(uri: string | null, key: string, b: Box) {
    if (!uri) {
      return (
        <View key={key} style={[styles.unavailable, { width: b.w, height: b.h }]}>
          <Text style={styles.unavailableText}>Photo unavailable</Text>
        </View>
      );
    }
    return <ZoomableSlide key={key} uri={uri} box={b} onPress={onClose} />;
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.viewer}>
        <View testID="photo-viewer-media" style={styles.media} onLayout={handleMediaLayout}>
          {box && (
            multi ? (
              <ScrollView
                ref={scrollRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                contentOffset={{ x: clampIndex(initialIndex, uris.length) * box.w, y: 0 }}
                onScroll={handleScroll}
                scrollEventThrottle={32}
              >
                {uris.map((u, i) => renderSlide(u, `${i}`, box))}
              </ScrollView>
            ) : (
              renderSlide(uris[0] ?? null, '0', box)
            )
          )}
        </View>

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

function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(index, length - 1));
}

interface SlideProps {
  uri: string;
  box: Box;
  onPress: () => void;
}

/**
 * One pinch-zoomable photo, sized to exactly fill `box` at scale 1.
 *
 * The nested-ScrollView-inside-a-horizontal-pager arrangement is the standard
 * iOS gallery recipe: at scale 1 the content fits its frame so the inner view
 * has nothing to scroll and horizontal swipes reach the outer pager; once
 * zoomed, the inner view consumes the pan so the owner drags around the photo
 * instead of paging away from it (and pinches back out to resume paging).
 */
function ZoomableSlide({ uri, box, onPress }: SlideProps) {
  // Intrinsic pixel size of the source, needed to know where real detail runs
  // out. Read off the image's own onLoad rather than via Image.getSize: getSize
  // would issue a SECOND fetch of the signed URL just to learn dimensions we are
  // already downloading, and onLoad reports them from the load in flight. Stays
  // null until then (and if the load fails), which resolveMaxZoomScale answers
  // with its floor — so a slow or broken load costs precision, never the gesture.
  const [intrinsic, setIntrinsic] = useState<{ w: number; h: number } | null>(null);

  // Re-measure when the slide is pointed at a different photo (Replace).
  useEffect(() => { setIntrinsic(null); }, [uri]);

  const maximumZoomScale = resolveMaxZoomScale({
    imageWidth: intrinsic?.w ?? null,
    imageHeight: intrinsic?.h ?? null,
    boxWidth: box.w,
    boxHeight: box.h,
    pixelRatio: PixelRatio.get(),
  });

  const frame = { width: box.w, height: box.h };

  return (
    <ScrollView
      testID="photo-zoom-slide"
      style={frame}
      contentContainerStyle={frame}
      maximumZoomScale={maximumZoomScale}
      minimumZoomScale={1}
      bouncesZoom
      // Keeps the photo centred if a zoom-out ever leaves content smaller than
      // the frame; a no-op at scale 1, where content and frame are equal.
      centerContent
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    >
      {/* Tap anywhere on the photo to dismiss (B-022 — Jordan's thumb went to the
          image, not the corner). Unaffected by zoom: pinch is not a tap. */}
      <TouchableOpacity activeOpacity={1} onPress={onPress} style={frame}>
        <Image
          testID="photo-zoom-image"
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          resizeMode="contain"
          onLoad={(e) => {
            const src = e.nativeEvent?.source;
            if (src?.width && src?.height) setIntrinsic({ w: src.width, h: src.height });
          }}
        />
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  viewer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // The measured media area. Everything inside is sized in explicit points from
  // this box's onLayout, never by flex — see the header note on zoom needing
  // content that exactly fills its frame.
  media: {
    flex: 1,
    width: '100%',
  },
  unavailable: {
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
    color: theme.colorDestructiveOnDark,
    fontWeight: theme.fontWeightMedium,
  },
});
