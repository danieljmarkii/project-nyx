import { render } from '@testing-library/react-native';
import { CulpritMark } from './CulpritMark';
import { theme } from '../../constants/theme';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useAppActive } from '../../hooks/useAppActive';

jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: jest.fn(() => false) }));
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: jest.fn(() => true) }));
const mockedUseReducedMotion = useReducedMotion as jest.Mock;
const mockedUseAppActive = useAppActive as jest.Mock;

afterEach(() => {
  mockedUseReducedMotion.mockReturnValue(false);
  mockedUseAppActive.mockReturnValue(true);
});

// The carve rule (spec §1.1): the crescent MUST be a mask/cutout, never a filled
// circle overlaid on the ground. These pin the two things that would silently
// regress that: (1) a <Mask> element still wraps the moon circle, on both
// grounds, and (2) the moon circle is never rendered as two overlapping fills
// (which would be the "filled circle" anti-pattern the rule forbids).
//
// react-native-svg's test renderer resolves to native `RNSVG*` host components
// and packs `fill`/`stroke` colour props into an opaque {type, payload} ARGB
// int — argbPayload() below reproduces that packing so assertions can compare
// against the real theme hex values instead of hardcoded magic numbers.

function argbPayload(hex: string): number {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return ((0xff << 24) | (r << 16) | (g << 8) | b) >>> 0;
}

function findByType(node: any, type: string): any[] {
  if (!node) return [];
  const out: any[] = [];
  const visit = (n: any) => {
    if (!n) return;
    if (Array.isArray(n)) {
      n.forEach(visit);
      return;
    }
    if (n.type === type) out.push(n);
    (n.children ?? []).forEach(visit);
  };
  visit(node);
  return out;
}

describe('CulpritMark — the carve rule', () => {
  it('renders the crescent as a Mask-wrapped circle on the light ground', () => {
    const { toJSON } = render(<CulpritMark size={20} ground="light" />);
    const tree = toJSON();
    const masks = findByType(tree, 'RNSVGMask');
    const circles = findByType(tree, 'RNSVGCircle');
    expect(masks.length).toBe(1);
    // Exactly one circle carries the mask (the moon disc) — the carve is applied
    // once, not simulated with a second overlapping fill.
    const maskedCircles = circles.filter((c) => c.props.mask);
    expect(maskedCircles.length).toBe(1);
    expect(maskedCircles[0].props.fill?.payload).toBe(argbPayload(theme.colorCulpritCrescentOnLight));
  });

  it('renders the same true cutout on the night ground, with the night crescent fill', () => {
    const { toJSON } = render(<CulpritMark size={20} ground="night" />);
    const tree = toJSON();
    const masks = findByType(tree, 'RNSVGMask');
    const circles = findByType(tree, 'RNSVGCircle');
    const maskedCircles = circles.filter((c) => c.props.mask);
    expect(masks.length).toBe(1);
    expect(maskedCircles.length).toBe(1);
    expect(maskedCircles[0].props.fill?.payload).toBe(argbPayload(theme.colorMoonlight));
  });

  it('the mask carve circle punches a hole (its own fill is opaque, distinct from the moon fill) — never two overlapping equal fills', () => {
    const { toJSON } = render(<CulpritMark size={20} ground="night" />);
    const circles = findByType(toJSON(), 'RNSVGCircle');
    const moon = circles.find((c) => c.props.mask);
    // The carve circle lives INSIDE the mask (r=29 at cx61/cy43 per spec §3),
    // never as a second sibling fill matching the moon's own colour.
    const carveInMask = circles.find((c) => c.props.r === 29 && c.props.cx === 61);
    expect(moon).toBeTruthy();
    expect(carveInMask).toBeTruthy();
    expect(carveInMask.props.fill?.payload).not.toBe(moon.props.fill?.payload);
  });

  it('matches a snapshot on both grounds (carve geometry regression guard)', () => {
    expect(render(<CulpritMark size={24} ground="light" />).toJSON()).toMatchSnapshot('light ground');
    expect(render(<CulpritMark size={24} ground="night" />).toJSON()).toMatchSnapshot('night ground');
  });

  it('uses independent mask ids across two simultaneous instances (no cross-instance carve collision)', () => {
    const { toJSON } = render(
      <>
        <CulpritMark size={20} ground="light" />
        <CulpritMark size={20} ground="night" />
      </>,
    );
    const masks = findByType(toJSON(), 'RNSVGMask');
    expect(masks.length).toBe(2);
    expect(masks[0].props.name).not.toBe(masks[1].props.name);
  });
});

describe('CulpritMark — placements and a11y', () => {
  it('self-labels "Culprit" only when it carries the wordmark (the full lockup)', () => {
    const { getByLabelText } = render(<CulpritMark size={16} ground="light" withWordmark />);
    expect(getByLabelText('Culprit')).toBeTruthy();
  });

  it('renders the wordmark text when withWordmark is set', () => {
    const { getByText } = render(<CulpritMark size={16} ground="light" withWordmark />);
    expect(getByText('Culprit')).toBeTruthy();
  });

  it('renders no wordmark text as a bare glyph (AuthBrandMark placement)', () => {
    const { queryByText } = render(<CulpritMark size={20} ground="light" />);
    expect(queryByText('Culprit')).toBeNull();
  });

  it('a bare-glyph instance is not independently accessible (avoids a double a11y node under a labelled parent)', () => {
    const { toJSON } = render(<CulpritMark size={20} ground="light" />);
    const tree: any = toJSON();
    expect(tree.props.accessible).toBeFalsy();
  });

  it('the accessible prop overrides the withWordmark default in both directions (HomeHeader nesting fix)', () => {
    // A full lockup nested inside an already-labelled parent (HomeHeader's
    // wrapping Pressable) must be able to opt OUT of self-labelling...
    const suppressed = render(<CulpritMark size={16} ground="light" withWordmark accessible={false} />);
    expect((suppressed.toJSON() as any).props.accessible).toBeFalsy();
    // ...and a bare glyph must be able to opt IN when it's genuinely standalone.
    const forced = render(<CulpritMark size={20} ground="light" accessible />);
    expect((forced.toJSON() as any).props.accessible).toBe(true);
    expect(forced.getByLabelText('Culprit')).toBeTruthy();
  });
});

// The B-322 fix: the live pulse is driven by native-driver transforms on RN
// `Animated.View`s, NOT react-native-svg's `<G>` (whose `scale` is a JS-side
// matrix conversion the native driver bypasses — so an animated `<G scale>`
// renders FROZEN on a real Fabric build). These pin the structural contract that
// keeps the pulse on a native-eligible path: NO `<G>` carries the pulse, the ring
// and dot are stroked/solid circles inside Animated.View wrappers, and both the
// reduced-motion AND app-blur paths fall back to the same static SVG frame.
const solidDots = (tree: any) =>
  findByType(tree, 'RNSVGCircle').filter(
    (c) => c.props.fill?.payload === argbPayload(theme.colorAccent) && c.props.stroke == null,
  );

// Does a (possibly nested/array) style carry a `transform`? Animated.View flattens
// its style to an array in the test renderer, so search recursively.
function hasTransform(style: any): boolean {
  if (!style) return false;
  if (Array.isArray(style)) return style.some(hasTransform);
  return style.transform != null;
}
const viewsWithTransform = (tree: any) =>
  findByType(tree, 'View').filter((v) => hasTransform(v.props.style));

describe('CulpritMark — the pulse contract', () => {
  it('renders no ping ring when live is false', () => {
    const { toJSON } = render(<CulpritMark size={16} ground="night" live={false} />);
    const circles = findByType(toJSON(), 'RNSVGCircle');
    const ring = circles.filter((c) => c.props.stroke != null);
    expect(ring.length).toBe(0);
  });

  it('renders the three-ring ping train (stroked, no fill) when live is true', () => {
    // Round-2 choreography (2026-07-24): the ping is a staggered THREE-ring
    // concentric train, each ring a stroked accent circle with no fill.
    const { toJSON } = render(<CulpritMark size={16} ground="night" live />);
    const circles = findByType(toJSON(), 'RNSVGCircle');
    const rings = circles.filter((c) => c.props.stroke != null);
    expect(rings.length).toBe(3);
    rings.forEach((ring) => {
      expect(ring.props.fill).toBeNull();
      expect(ring.props.stroke.payload).toBe(argbPayload(theme.colorAccent));
    });
  });

  it('drives the pulse via native-driver-eligible RN View transforms, never a react-native-svg <G> matrix (B-322)', () => {
    // The frozen-on-device regression guard. The old impl scaled the dot/ring via
    // react-native-svg's <G> — whose `scale`→`matrix` conversion runs in JS and is
    // bypassed by useNativeDriver, so it never reached the native thread. The fix
    // carries the motion on RN `Animated.View` transforms (a native-eligible path).
    // So a LIVE mark must render transform-bearing Views (the ring + dot wrappers)
    // AND its animated circles must NOT hang off an SVG group carrying a transform.
    const live = render(<CulpritMark size={64} ground="night" live />).toJSON();
    expect(viewsWithTransform(live).length).toBeGreaterThanOrEqual(4); // 3 train rings + dot
    // No react-native-svg <G> carries a transform/matrix (the frozen shape).
    expect(findByType(live, 'RNSVGGroup').every((g) => g.props.matrix == null && g.props.transform == null)).toBe(true);
    // A resting (non-live) mark has no transform-bearing pulse Views at all.
    const resting = render(<CulpritMark size={64} ground="night" live={false} />).toJSON();
    expect(viewsWithTransform(resting).length).toBe(0);
  });

  it('respects reduced-motion (§1.5): live but reduced shows a clean resting dot — no ring, no glow halo (B-325)', () => {
    mockedUseReducedMotion.mockReturnValue(true);
    const { toJSON } = render(<CulpritMark size={16} ground="night" live />);
    const circles = findByType(toJSON(), 'RNSVGCircle');
    // No stroked ping ring under reduced motion.
    expect(circles.filter((c) => c.props.stroke != null).length).toBe(0);
    // The soft glow halo was REMOVED after on-device QA (B-325) — no low-opacity accent
    // circle behind the dot; teal is the interactive accent, not a decorative haze (§1.3).
    const glow = circles.filter(
      (c) => c.props.cx === 66 && c.props.cy === 53 && c.props.r === 10.5 + 1.5 && c.props.opacity === 0.3,
    );
    expect(glow.length).toBe(0);
    // The resting dot itself is still drawn (full opacity), in the base SVG.
    const restingDot = circles.filter(
      (c) => c.props.cx === 66 && c.props.cy === 53 && c.props.r === 10.5 && c.props.stroke == null,
    );
    expect(restingDot.length).toBe(1);
  });

  it('app blur (not active) also drops to the static frame — the loop pauses, no ring, no glow (B-325)', () => {
    mockedUseAppActive.mockReturnValue(false);
    const circles = findByType(render(<CulpritMark size={16} ground="night" live />).toJSON(), 'RNSVGCircle');
    // No animated ring while paused, and no glow halo — a clean resting dot stands in.
    expect(circles.filter((c) => c.props.stroke != null).length).toBe(0);
    expect(circles.filter((c) => c.props.cx === 66 && c.props.r === 10.5 + 1.5 && c.props.opacity === 0.3).length).toBe(0);
    expect(
      circles.filter((c) => c.props.cx === 66 && c.props.cy === 53 && c.props.r === 10.5 && c.props.stroke == null).length,
    ).toBe(1);
  });

  it('still renders exactly one solid dot fill on every state (the dot itself never disappears)', () => {
    // Animating (default mocks), non-live, reduced-motion, and blurred — always
    // exactly one full-opacity teal dot, wherever it lives in the tree.
    const animating = render(<CulpritMark size={16} ground="night" live />).toJSON();
    expect(solidDots(animating).filter((c) => c.props.opacity == null).length).toBe(1);

    const notLive = render(<CulpritMark size={16} ground="night" live={false} />).toJSON();
    expect(solidDots(notLive).filter((c) => c.props.opacity == null).length).toBe(1);

    mockedUseReducedMotion.mockReturnValue(true);
    const reduced = render(<CulpritMark size={16} ground="night" live />).toJSON();
    expect(solidDots(reduced).filter((c) => c.props.opacity == null).length).toBe(1);
  });
});
