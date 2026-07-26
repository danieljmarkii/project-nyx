import { render, fireEvent } from '@testing-library/react-native';
import { PixelRatio } from 'react-native';
import { PhotoViewer } from './PhotoViewer';
import { resolveMaxZoomScale, MIN_MAX_ZOOM_SCALE } from '../../lib/photoZoom';

// The zoom CEILING arithmetic is unit-tested in lib/photoZoom.test.ts. What can
// only be checked here is the wiring: that the props actually reach the slide's
// ScrollView, that tap-to-dismiss survived the extra scroll layer (B-022), and
// that a null URI still renders the honest placeholder instead of a zoom frame.
// A correct formula whose output never reaches the native view ships as no zoom
// at all, and nothing else in the suite would notice.

// jest gives onLayout no dimensions, so fire it by hand — every slide is sized
// from this box, and without it the gallery renders nothing at all.
function layout(tree: ReturnType<typeof render>, w = 393, h = 700) {
  fireEvent(tree.getByTestId('photo-viewer-media'), 'layout', {
    nativeEvent: { layout: { width: w, height: h, x: 0, y: 0 } },
  });
}

// The slide learns its source's pixel size from the image's own onLoad, so
// simulate that to exercise the computed ceiling rather than only the fallback.
function loadImage(tree: ReturnType<typeof render>, w: number, h: number, index = 0) {
  fireEvent(tree.getAllByTestId('photo-zoom-image')[index], 'load', {
    nativeEvent: { source: { width: w, height: h } },
  });
}

describe('PhotoViewer — pinch-zoom wiring (B-036)', () => {
  it('renders nothing until the media box is measured', () => {
    const tree = render(<PhotoViewer visible uris={['file:///a.jpg']} onClose={() => {}} />);
    expect(tree.queryByTestId('photo-zoom-slide')).toBeNull();
  });

  it('wraps a single photo in a zoomable slide once measured', () => {
    const tree = render(<PhotoViewer visible uris={['file:///a.jpg']} onClose={() => {}} />);
    layout(tree);

    const slide = tree.getByTestId('photo-zoom-slide');
    // minimumZoomScale must be exactly 1: anything less lets the owner pinch the
    // photo smaller than its frame, which reads as the viewer falling apart.
    expect(slide.props.minimumZoomScale).toBe(1);
    // Before onLoad reports a size this is the floor — which is the point: an
    // unresolved or still-loading source must still leave the gesture usable.
    expect(slide.props.maximumZoomScale).toBe(MIN_MAX_ZOOM_SCALE);
  });

  it('raises the ceiling once a full-sensor photo reports its size', () => {
    // The whole point of the feature, and the only test that proves the computed
    // ceiling reaches the native view: a ~12MP local capture (the exam-room case)
    // must zoom past the floor, on real pixels.
    //
    // The expectation is derived rather than hardcoded — jest reports a pixel
    // ratio of 2, so a literal here would be asserting the test runner's screen
    // density instead of the wiring. The arithmetic itself is covered by
    // lib/photoZoom.test.ts against a real 3x device; what this pins down is that
    // the component feeds it the measured box and the loaded source size, and
    // hands the result to the ScrollView.
    const tree = render(<PhotoViewer visible uris={['file:///a.jpg']} onClose={() => {}} />);
    layout(tree, 393, 700);
    loadImage(tree, 3024, 4032);

    const expected = resolveMaxZoomScale({
      imageWidth: 3024, imageHeight: 4032,
      boxWidth: 393, boxHeight: 700,
      pixelRatio: PixelRatio.get(),
    });
    expect(expected).toBeGreaterThan(MIN_MAX_ZOOM_SCALE); // guard: the case must be interesting
    expect(tree.getByTestId('photo-zoom-slide').props.maximumZoomScale).toBeCloseTo(expected, 5);
  });

  it('leaves a remote 1600px photo at the floor — it has no real detail to give', () => {
    const tree = render(<PhotoViewer visible uris={['https://signed/a.jpg']} onClose={() => {}} />);
    layout(tree);
    loadImage(tree, 1200, 1600);

    expect(tree.getByTestId('photo-zoom-slide').props.maximumZoomScale).toBe(MIN_MAX_ZOOM_SCALE);
  });

  it('scales each gallery slide independently from its own source', () => {
    // A food carousel routinely mixes a full-res local capture with 1600px remote
    // photos; one shared ceiling would either waste detail or overstate it.
    const tree = render(
      <PhotoViewer visible uris={['file:///big.jpg', 'https://signed/small.jpg']} onClose={() => {}} />,
    );
    layout(tree);
    loadImage(tree, 3024, 4032, 0);
    loadImage(tree, 1200, 1600, 1);

    const [big, small] = tree.getAllByTestId('photo-zoom-slide');
    expect(big.props.maximumZoomScale).toBeGreaterThan(small.props.maximumZoomScale);
    expect(small.props.maximumZoomScale).toBe(MIN_MAX_ZOOM_SCALE);
  });

  it('ignores a malformed onLoad payload instead of computing a garbage ceiling', () => {
    const tree = render(<PhotoViewer visible uris={['file:///a.jpg']} onClose={() => {}} />);
    layout(tree);
    fireEvent(tree.getByTestId('photo-zoom-image'), 'load', { nativeEvent: {} });

    expect(tree.getByTestId('photo-zoom-slide').props.maximumZoomScale).toBe(MIN_MAX_ZOOM_SCALE);
  });

  it('sizes the slide content to exactly fill the measured frame at scale 1', () => {
    // Zoom only behaves if content and frame are equal at rest — a content view
    // smaller than its frame cannot be panned once zoomed.
    const tree = render(<PhotoViewer visible uris={['file:///a.jpg']} onClose={() => {}} />);
    layout(tree, 400, 800);

    const slide = tree.getByTestId('photo-zoom-slide');
    expect(slide.props.contentContainerStyle).toEqual({ width: 400, height: 800 });
  });

  it('keeps tap-to-dismiss working through the new scroll layer (B-022)', () => {
    // The regression this guards: wrapping the image in a ScrollView is exactly
    // the kind of change that silently swallows the tap Jordan relies on.
    const onClose = jest.fn();
    const tree = render(<PhotoViewer visible uris={['file:///a.jpg']} onClose={onClose} />);
    layout(tree);

    fireEvent.press(tree.getByTestId('photo-zoom-image'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('gives every photo in a gallery its own zoomable slide', () => {
    const tree = render(
      <PhotoViewer visible uris={['file:///a.jpg', 'file:///b.jpg', 'file:///c.jpg']} onClose={() => {}} />,
    );
    layout(tree);
    expect(tree.getAllByTestId('photo-zoom-slide')).toHaveLength(3);
  });

  it('renders a placeholder rather than a zoom frame for an unresolved URI', () => {
    const tree = render(<PhotoViewer visible uris={[null]} onClose={() => {}} />);
    layout(tree);

    expect(tree.getByText('Photo unavailable')).toBeTruthy();
    expect(tree.queryByTestId('photo-zoom-slide')).toBeNull();
  });

  it('zooms the photos that resolve and skips the ones that do not, in one gallery', () => {
    const tree = render(
      <PhotoViewer visible uris={['file:///a.jpg', null, 'file:///c.jpg']} onClose={() => {}} />,
    );
    layout(tree);

    expect(tree.getAllByTestId('photo-zoom-slide')).toHaveLength(2);
    expect(tree.getByText('Photo unavailable')).toBeTruthy();
  });

  it('renders nothing while hidden, which is what resets zoom between opens', () => {
    // RN's Modal returns null when not visible, so each open remounts the slides
    // and their zoom state. If that ever changes, zoom would persist across
    // opens and this test is the tripwire.
    const tree = render(<PhotoViewer visible={false} uris={['file:///a.jpg']} onClose={() => {}} />);
    expect(tree.toJSON()).toBeNull();
  });
});
