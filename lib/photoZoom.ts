// How far a photo may be pinch-zoomed in the fullscreen PhotoViewer (B-036).
//
// Extracted from the component for the same reason as lib/eventPhoto.ts: this is
// the one piece of the zoom feature with real arithmetic in it, the inputs are
// device-dependent (pixel ratio, measured box) and so awkward to exercise through
// a render, and getting it wrong is silent — a too-low ceiling makes the pinch
// feel broken, a too-high one invites the failure mode below.
//
// WHY THERE IS A CEILING AT ALL. Uploads are capped at MAX_EDGE_PX = 1600 / JPEG
// q75 (see lib/storage.ts), so a remote photo has very little real detail left to
// reveal: a 1200×1600 portrait shown `contain` on a 393pt-wide 3× screen already
// renders at ~1:1, and every pixel past that is interpolation. Dr. Chen's
// objection (2026-07-26) is that magnified JPEG artifacts on a suspected-blood or
// foreign-material photo can read as clinical texture — mottling and colour
// fringing that are not in the sample. So the ceiling is computed per photo from
// the pixels that actually exist rather than hardcoded.
//
// The capturing device is the good case and the one the PM's exam-room scenario
// actually hits: app/log.tsx persists the RAW picker output (full sensor, q85)
// and resolveEventPhotoDisplay prefers that local file, so a photo taken this
// week zooms ~2.5–3× on genuine pixels.
//
// WHY THERE IS ALSO A FLOOR. A pinch that visibly does nothing reads as a broken
// gesture, and magnification has communicative value independent of detail —
// in an exam room you zoom to *point at* a region ("this bit here"), not only to
// resolve it. Interpolation also discloses itself: an upscaled JPEG goes soft,
// which is legible as blur rather than mistakable for detail. So zoom is allowed
// past the real-pixel ceiling, down to MIN_MAX_ZOOM_SCALE.
//
// That floor is the one judgment call in this module and the PM's open decision
// #4 from the 2026-07-26 discussion. Flipping to the strict "never show an
// interpolated pixel" reading is a one-line change: set MIN_MAX_ZOOM_SCALE to 1.

/**
 * Never offer less than this, even when the photo has no real detail left to
 * give. Below ~2× a pinch registers as "nothing happened". See the floor
 * rationale above — this is the deliberately generous side of the trade.
 */
export const MIN_MAX_ZOOM_SCALE = 2.5;

/**
 * Never offer more than this, however many pixels the source has. A 48MP frame
 * computes a ceiling near 8×, at which point the photo has left the screen and
 * panning to find it costs more than the detail is worth.
 */
export const MAX_MAX_ZOOM_SCALE = 6;

export interface PhotoZoomInput {
  /**
   * Intrinsic size of the source image in IMAGE PIXELS (Image.getSize).
   * `null` while the lookup is in flight or if it failed — a remote photo whose
   * size we cannot read still gets the floor, never zero zoom.
   */
  imageWidth: number | null;
  imageHeight: number | null;
  /** The viewer's media box in LAYOUT POINTS, as measured by onLayout. */
  boxWidth: number;
  boxHeight: number;
  /** Device pixels per layout point — PixelRatio.get(). */
  pixelRatio: number;
}

/**
 * The `maximumZoomScale` to hand the slide's ScrollView.
 *
 * Derivation, being careful about the two different units involved:
 *   1. `resizeMode="contain"` fits the image inside the box, so the smaller of
 *      the two axis ratios wins. That ratio is POINTS per image pixel.
 *   2. Multiplying by pixelRatio converts it to DEVICE pixels per image pixel.
 *      When that product reaches 1 the photo is at true 1:1 and there is no
 *      further real detail to uncover.
 *   3. So the honest ceiling is its reciprocal — zoom this much and no more to
 *      stay on real pixels.
 * The result is then clamped into [MIN_MAX_ZOOM_SCALE, MAX_MAX_ZOOM_SCALE].
 *
 * Monotonic in image size by construction: a larger source never yields a
 * smaller ceiling, which is the property that keeps a full-sensor photo from
 * being pinned to the same limit as a thumbnail.
 */
export function resolveMaxZoomScale(input: PhotoZoomInput): number {
  const { imageWidth, imageHeight, boxWidth, boxHeight, pixelRatio } = input;

  // Any degenerate input — size not yet known, a zero/NaN dimension from a
  // pre-measurement layout pass, a nonsense pixel ratio — falls back to the
  // floor rather than to 1. Failing toward "the gesture still works" is the
  // safe direction: the alternative is a viewer that silently stops zooming.
  if (
    !isUsable(imageWidth) || !isUsable(imageHeight) ||
    !isUsable(boxWidth) || !isUsable(boxHeight) ||
    !isUsable(pixelRatio)
  ) {
    return MIN_MAX_ZOOM_SCALE;
  }

  const pointsPerImagePixel = Math.min(boxWidth / imageWidth, boxHeight / imageHeight);
  const devicePixelsPerImagePixel = pointsPerImagePixel * pixelRatio;
  if (!isUsable(devicePixelsPerImagePixel)) return MIN_MAX_ZOOM_SCALE;

  const realDetailCeiling = 1 / devicePixelsPerImagePixel;
  return clamp(realDetailCeiling, MIN_MAX_ZOOM_SCALE, MAX_MAX_ZOOM_SCALE);
}

/** Finite and strictly positive — the only shape any of this arithmetic accepts. */
function isUsable(n: number | null): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
