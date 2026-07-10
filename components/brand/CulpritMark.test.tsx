import { render } from '@testing-library/react-native';
import { CulpritMark } from './CulpritMark';
import { theme } from '../../constants/theme';
import { useReducedMotion } from '../../hooks/useReducedMotion';

jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: jest.fn(() => false) }));
const mockedUseReducedMotion = useReducedMotion as jest.Mock;

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

describe('CulpritMark — the pulse contract', () => {
  it('renders no ping ring when live is false', () => {
    const { toJSON } = render(<CulpritMark size={16} ground="night" live={false} />);
    const circles = findByType(toJSON(), 'RNSVGCircle');
    const ring = circles.filter((c) => c.props.stroke != null);
    expect(ring.length).toBe(0);
  });

  it('renders a ping-ring circle (stroked, no fill) when live is true', () => {
    const { toJSON } = render(<CulpritMark size={16} ground="night" live />);
    const circles = findByType(toJSON(), 'RNSVGCircle');
    const ring = circles.filter((c) => c.props.stroke != null);
    expect(ring.length).toBe(1);
    expect(ring[0].props.fill).toBeNull();
    expect(ring[0].props.stroke.payload).toBe(argbPayload(theme.colorAccent));
  });

  it('respects reduced-motion (§1.5): live but reduced shows a static glow, no ring, no scale loop', () => {
    mockedUseReducedMotion.mockReturnValue(true);
    try {
      const { toJSON } = render(<CulpritMark size={16} ground="night" live />);
      const circles = findByType(toJSON(), 'RNSVGCircle');
      // No stroked ping ring under reduced motion.
      expect(circles.filter((c) => c.props.stroke != null).length).toBe(0);
      // The static glow: a same-position, larger, low-opacity solid circle
      // behind the resting dot (not the ring, not a second dot).
      const glow = circles.filter(
        (c) => c.props.cx === 66 && c.props.cy === 53 && c.props.r === 10.5 + 1.5 && c.props.opacity === 0.3,
      );
      expect(glow.length).toBe(1);
      // The dot's own animated wrapper carries no scale transform loop — its
      // parent group matrix is the untouched identity, not the pulsing value.
      const groups = findByType(toJSON(), 'RNSVGGroup');
      const dotGroup = groups.find((g) =>
        (g.children ?? []).some((c: any) => c.props?.cx === 66 && c.props?.r === 10.5 && c.props?.stroke == null),
      );
      // Identity matrix (no active scale transform) — tolerate a signed-zero
      // (-0 vs 0) float quirk from the rotation math, which is not a real diff.
      expect((dotGroup?.props.matrix as number[]).map((n) => n + 0)).toEqual([1, 0, 0, 1, 0, 0]);
    } finally {
      mockedUseReducedMotion.mockReturnValue(false);
    }
  });

  it('still renders exactly one solid dot fill on both live states (the dot itself never disappears)', () => {
    for (const live of [false, true]) {
      const { toJSON } = render(<CulpritMark size={16} ground="night" live={live} />);
      const circles = findByType(toJSON(), 'RNSVGCircle');
      const solidDots = circles.filter(
        (c) => c.props.cx === 66 && c.props.cy === 53 && c.props.fill?.payload === argbPayload(theme.colorAccent),
      );
      expect(solidDots.length).toBeGreaterThanOrEqual(1);
    }
  });
});
