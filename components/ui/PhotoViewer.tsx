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
  View,
  Image,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  PixelRatio,
  LayoutChangeEvent,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { theme } from '../../constants/theme';
import { resolveMaxZoomScale } from '../../lib/photoZoom';
import { ThemedText } from './ThemedText';

interface Props {
  visible: boolean;
  // Resolved image URIs. `null` entries render an unavailable slot (e.g. a signed
  // URL that failed to resolve), matching the carousel.
  uris: (string | null)[];
  // Copy for those `null` slots. Defaults to the photo wording every existing
  // caller wants; Vet Files overrides it because the artifact is a clinical
  // document, not a photo, and because AC 12 requires the honest-failure sentence
  // to name the CAUSE ("needs a connection") rather than the symptom. This was the
  // one surface in that feature still saying "unavailable" — reachable by swiping
  // to an un-cached page 2 (B-478 VF-6, found by pm-feature-review).
  unavailableLabel?: string;
  // Which photo to open on first show; clamped to range.
  initialIndex?: number;
  // An optional label for the whole lightbox, rendered in the chrome strip beside
  // Close (B-590). Render-only-when-passed, exactly like onReplace/onRemove below —
  // so the four photo callers that don't pass it are unchanged. Vet Files passes
  // the pet's name here because an image document IS the app's primary capture
  // class (email screenshots, §1/§2), and this is the surface Sam turns around to
  // face an ER vet: a chrome-less black lightbox that named no one was the higher-
  // volume half of B-550's mis-attribution gap, not the lower one. Deliberately NOT
  // a title bar — the strip and the render-only pattern already exist, so a caption
  // costs the other callers nothing and adds no gesture (B-022 tap-dismiss and
  // B-036 pinch both stay untouched).
  caption?: string;
  // A two-line caption UNDER the photo (CUL-803 · incident spec §5.4, mock frame V1).
  // Distinct from `caption` above, which is a one-line label in the chrome strip: this
  // one is for the callers whose lightbox IS the artifact a vet is being shown, so it has
  // to survive beside Replace/Remove and carry a second line without truncating away the
  // clinically load-bearing half. `secondary` renders the TIME through the caller's
  // `describeOccurredAt` path, never a display string — so a found-not-witnessed incident
  // shows its window here and never a point it was not witnessed at.
  mediaCaption?: { primary: string; secondary?: string | null };
  onClose: () => void;
  // Optional actions — the button renders only when its callback is provided,
  // so single-photo callers can opt into Replace/Remove and the food viewer
  // can omit both.
  onReplace?: () => void;
  onRemove?: () => void;
  // Fired when the owner swipes to a different photo (B-478 VF-4, where the
  // caller's hero, its page dots and its Share action all have to follow the
  // page actually on screen).
  //
  // ⚠ A caller that feeds this back into `initialIndex` will fight its own user:
  // the open effect below re-runs on an initialIndex change and scrolls back. Hold
  // the opening index separately from the live one — see app/vet-document/[id].tsx.
  onPageChange?: (index: number) => void;
}

interface Box {
  w: number;
  h: number;
}

export function PhotoViewer({
  visible, uris, initialIndex = 0, onClose, onReplace, onRemove, onPageChange,
  unavailableLabel = 'Photo unavailable', caption, mediaCaption,
}: Props) {
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
    if (next !== page) {
      setPage(next);
      onPageChange?.(next);
    }
  }

  function renderSlide(uri: string | null, key: string, b: Box) {
    if (!uri) {
      return (
        <View key={key} style={[styles.unavailable, { width: b.w, height: b.h }]}>
          <ThemedText style={styles.unavailableText}>{unavailableLabel}</ThemedText>
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

        {/* Under the photo, above the controls. Not truncated: on a window the secondary
            line is a phrase ("found between 4:00 PM and 5:33 PM"), and clipping the half
            that says the time was not witnessed is the one loss this caption exists to
            prevent. */}
        {mediaCaption ? (
          <View style={styles.mediaCaption} pointerEvents="none">
            <ThemedText style={styles.mediaCaptionPrimary}>{mediaCaption.primary}</ThemedText>
            {mediaCaption.secondary ? (
              <ThemedText style={styles.mediaCaptionSecondary}>{mediaCaption.secondary}</ThemedText>
            ) : null}
          </View>
        ) : null}

        {multi && (
          <View style={styles.dotsRow} pointerEvents="none">
            {uris.map((_, i) => (
              <View key={i} style={[styles.dot, i === page && styles.dotActive]} />
            ))}
          </View>
        )}

        <View style={styles.actions}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={12}>
            <ThemedText style={styles.closeText}>✕  Close</ThemedText>
          </TouchableOpacity>
          {/* The lightbox's label — quieter than Close so it reads as a caption,
              not a second button. flex:1 lets it centre in the strip and truncate;
              only Vet Files passes it, and that caller has no Replace/Remove, so it
              never fights the right-hand actions for room. */}
          {caption ? (
            <ThemedText style={styles.caption} numberOfLines={1}>{caption}</ThemedText>
          ) : null}
          <View style={styles.rightActions}>
            {onReplace && (
              <TouchableOpacity style={styles.secondary} onPress={onReplace} hitSlop={12}>
                <ThemedText style={styles.secondaryText}>Replace</ThemedText>
              </TouchableOpacity>
            )}
            {onRemove && (
              <TouchableOpacity style={styles.destructive} onPress={onRemove} hitSlop={12}>
                <ThemedText style={styles.destructiveText}>Remove</ThemedText>
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
    color: theme.colorTextOnDarkSubtle,
  },
  mediaCaption: {
    width: '100%',
    paddingHorizontal: theme.space3,
    paddingTop: theme.space2,
    gap: 2,
  },
  mediaCaptionPrimary: {
    fontSize: theme.textSM,
    color: theme.colorTextOnDark,
    fontWeight: theme.weightSemibold,
  },
  mediaCaptionSecondary: {
    fontSize: theme.textSM,
    color: theme.colorTextOnDarkSubtle,
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
    backgroundColor: theme.colorDotOnDarkInactive,
  },
  dotActive: {
    backgroundColor: theme.colorTextOnDark,
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
    color: theme.colorTextOnDark,
    fontWeight: theme.fontWeightMedium,
  },
  caption: {
    flex: 1,
    textAlign: 'center',
    marginHorizontal: theme.space2,
    fontSize: 15,
    color: theme.colorTextOnDarkSubtle,
    fontWeight: theme.fontWeightMedium,
  },
  rightActions: {
    flexDirection: 'row',
    gap: theme.space1,
  },
  secondary: {
    paddingVertical: theme.space1,
    paddingHorizontal: theme.space2,
    backgroundColor: theme.colorDividerOnDark,
    borderRadius: theme.radiusSmall,
  },
  secondaryText: {
    fontSize: 15,
    color: theme.colorTextOnDark,
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
