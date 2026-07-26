import {
  resolveMaxZoomScale,
  PhotoZoomInput,
  MIN_MAX_ZOOM_SCALE,
  MAX_MAX_ZOOM_SCALE,
} from './photoZoom';

// A 393pt-wide iPhone media box at 3× — the device the exam-room scenario is
// actually run on. Height is the box left over above the viewer's action row.
const base: PhotoZoomInput = {
  imageWidth: null,
  imageHeight: null,
  boxWidth: 393,
  boxHeight: 700,
  pixelRatio: 3,
};

describe('resolveMaxZoomScale (B-036 — real-pixel zoom ceiling)', () => {
  describe('the cases the feature exists for', () => {
    it('gives a full-sensor local photo real room to zoom (the exam-room case)', () => {
      // app/log.tsx persists the raw picker output, so a photo taken this week on
      // this phone is ~12MP: 393/3024 * 3 = 0.39 device px per image px → ~2.56×
      // of genuine detail. This is the case the PM described at the vet.
      const scale = resolveMaxZoomScale({ ...base, imageWidth: 3024, imageHeight: 4032 });
      expect(scale).toBeCloseTo(2.56, 1);
      expect(scale).toBeGreaterThan(MIN_MAX_ZOOM_SCALE);
    });

    it('floors a remote 1600px portrait, which has ~no real detail left', () => {
      // The 1600px upload cap means a portrait photo renders at ~1:1 already
      // (393/1200 * 3 = 0.98), so the honest ceiling is ~1.02× — indistinguishable
      // from no zoom at all. The floor keeps the gesture responsive; see the
      // module header for why that trade is deliberate.
      const scale = resolveMaxZoomScale({ ...base, imageWidth: 1200, imageHeight: 1600 });
      expect(scale).toBe(MIN_MAX_ZOOM_SCALE);
    });

    it('floors a remote 1600px landscape too (~1.36× honest headroom)', () => {
      const scale = resolveMaxZoomScale({ ...base, imageWidth: 1600, imageHeight: 1200 });
      expect(scale).toBe(MIN_MAX_ZOOM_SCALE);
    });
  });

  describe('clamping', () => {
    it('caps an enormous source rather than letting the photo leave the screen', () => {
      expect(
        resolveMaxZoomScale({ ...base, imageWidth: 8000, imageHeight: 6000 }),
      ).toBe(MAX_MAX_ZOOM_SCALE);
    });

    it('never returns below the floor for any real image size', () => {
      for (const [w, h] of [[1, 1], [64, 64], [800, 600], [1600, 1600], [4032, 3024]]) {
        expect(
          resolveMaxZoomScale({ ...base, imageWidth: w, imageHeight: h }),
        ).toBeGreaterThanOrEqual(MIN_MAX_ZOOM_SCALE);
      }
    });
  });

  describe('degenerate input falls back to the floor, never to no-zoom', () => {
    // The safe direction is "the gesture still works". Returning 1 here would
    // ship a viewer that silently stops zooming whenever Image.getSize is slow.
    it('handles a size lookup that has not resolved yet', () => {
      expect(resolveMaxZoomScale(base)).toBe(MIN_MAX_ZOOM_SCALE);
    });

    it('handles a size lookup that failed on one axis', () => {
      expect(
        resolveMaxZoomScale({ ...base, imageWidth: 1200, imageHeight: null }),
      ).toBe(MIN_MAX_ZOOM_SCALE);
    });

    it('handles a pre-measurement layout pass (zero box)', () => {
      expect(
        resolveMaxZoomScale({ ...base, imageWidth: 3024, imageHeight: 4032, boxWidth: 0, boxHeight: 0 }),
      ).toBe(MIN_MAX_ZOOM_SCALE);
    });

    it('handles NaN / Infinity / negative dimensions', () => {
      const bad = [NaN, Infinity, -1, 0];
      for (const v of bad) {
        expect(resolveMaxZoomScale({ ...base, imageWidth: v, imageHeight: 4032 })).toBe(MIN_MAX_ZOOM_SCALE);
        expect(resolveMaxZoomScale({ ...base, imageWidth: 3024, imageHeight: 4032, pixelRatio: v })).toBe(MIN_MAX_ZOOM_SCALE);
        expect(resolveMaxZoomScale({ ...base, imageWidth: 3024, imageHeight: 4032, boxHeight: v })).toBe(MIN_MAX_ZOOM_SCALE);
      }
    });
  });

  describe('properties that keep the ceiling meaningful', () => {
    it('is monotonic in source size — a bigger photo never zooms less', () => {
      // The property that stops a full-sensor frame being pinned to a thumbnail's
      // limit. Checked across a sweep rather than an example pair, because an
      // example list is exactly what lets a non-monotonic formula through.
      let prev = 0;
      for (let edge = 200; edge <= 9000; edge += 200) {
        const scale = resolveMaxZoomScale({ ...base, imageWidth: edge, imageHeight: edge });
        expect(scale).toBeGreaterThanOrEqual(prev);
        prev = scale;
      }
    });

    it('is monotonic in pixel ratio — a denser screen needs more source to satisfy it', () => {
      const at = (pixelRatio: number) =>
        resolveMaxZoomScale({ ...base, imageWidth: 3024, imageHeight: 4032, pixelRatio });
      expect(at(2)).toBeGreaterThanOrEqual(at(3));
      expect(at(3)).toBeGreaterThanOrEqual(at(4));
    });

    it('is orientation-aware — contain fits the constraining axis', () => {
      // Same pixel count, different shape, in a portrait box: the landscape frame
      // is width-constrained and so has more headroom than the portrait one.
      const portrait = resolveMaxZoomScale({ ...base, imageWidth: 1200, imageHeight: 1600 });
      const landscape = resolveMaxZoomScale({ ...base, imageWidth: 1600, imageHeight: 1200 });
      expect(landscape).toBeGreaterThanOrEqual(portrait);
    });

    it('stays within the declared bounds for every input in a wide sweep', () => {
      for (const w of [1, 500, 1600, 3024, 12000]) {
        for (const h of [1, 500, 1600, 4032, 12000]) {
          for (const pr of [1, 2, 3]) {
            const scale = resolveMaxZoomScale({ ...base, imageWidth: w, imageHeight: h, pixelRatio: pr });
            expect(scale).toBeGreaterThanOrEqual(MIN_MAX_ZOOM_SCALE);
            expect(scale).toBeLessThanOrEqual(MAX_MAX_ZOOM_SCALE);
          }
        }
      }
    });
  });
});
