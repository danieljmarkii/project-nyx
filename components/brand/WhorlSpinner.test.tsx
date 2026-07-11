import { render } from '@testing-library/react-native';
import { WhorlSpinner } from './WhorlSpinner';
import { theme } from '../../constants/theme';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useAppActive } from '../../hooks/useAppActive';

jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: jest.fn(() => false) }));
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: jest.fn(() => true) }));
const mockedReduced = useReducedMotion as jest.Mock;
const mockedActive = useAppActive as jest.Mock;

// react-native-svg's test renderer resolves to native RNSVG* host components and
// packs colour props into an opaque ARGB int — argbPayload reproduces that packing so
// assertions compare against real theme hex, not magic numbers (shared with CulpritMark.test).
function argbPayload(hex: string): number {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return ((0xff << 24) | (r << 16) | (g << 8) | b) >>> 0;
}

function findByType(node: any, type: string): any[] {
  const out: any[] = [];
  const visit = (n: any) => {
    if (!n) return;
    if (Array.isArray(n)) return n.forEach(visit);
    if (n.type === type) out.push(n);
    (n.children ?? []).forEach(visit);
  };
  visit(node);
  return out;
}

const circles = (tree: any) => findByType(tree, 'RNSVGCircle');
const ridges = (tree: any) => circles(tree).filter((c) => c.props.stroke != null); // stroked arcs
const solidFills = (tree: any) => circles(tree).filter((c) => c.props.fill?.payload != null);

afterEach(() => {
  mockedReduced.mockReturnValue(false);
  mockedActive.mockReturnValue(true);
});

describe('WhorlSpinner — geometry', () => {
  it('renders four concentric arc ridges (stroked, dashed, no fill) + one solid dot when animating', () => {
    const { toJSON } = render(<WhorlSpinner size="md" ground="day" />);
    const tree = toJSON();
    const arcs = ridges(tree);
    expect(arcs.length).toBe(4);
    // Every ridge is an ARC, not a full ring — a strokeDasharray gap makes the ridge.
    arcs.forEach((a) => {
      expect(a.props.strokeDasharray).toBeTruthy();
      expect(a.props.fill).toBeNull(); // fill="none" → null in the RNSVG renderer
    });
    // Exactly the dot is a solid fill while animating (no static glow).
    expect(solidFills(tree).length).toBe(1);
    expect(solidFills(tree)[0].props.fill.payload).toBe(argbPayload(theme.colorAccent));
  });

  it('the four ridges sit at distinct radii (concentric, not stacked)', () => {
    const arcs = ridges(render(<WhorlSpinner size="md" />).toJSON());
    const radii = arcs.map((a) => a.props.r).sort((x, y) => x - y);
    expect(new Set(radii).size).toBe(4);
  });
});

describe('WhorlSpinner — grounds (the one-accent rule)', () => {
  it('day ground alternates teal + the lavender world ridge (never a second interactive accent)', () => {
    const strokes = ridges(render(<WhorlSpinner ground="day" size="md" />).toJSON()).map(
      (a) => a.props.stroke.payload,
    );
    expect(strokes).toContain(argbPayload(theme.colorAccent));
    expect(strokes).toContain(argbPayload(theme.colorWhorlRidgeDay));
    // The dot — the only live/interactive mark — is teal, on either ground.
    expect(solidFills(render(<WhorlSpinner ground="day" />).toJSON())[0].props.fill.payload).toBe(
      argbPayload(theme.colorAccent),
    );
  });

  it('night ground alternates teal + moonlight (no lavender day ridge leaks onto night)', () => {
    const strokes = ridges(render(<WhorlSpinner ground="night" size="md" />).toJSON()).map(
      (a) => a.props.stroke.payload,
    );
    expect(strokes).toContain(argbPayload(theme.colorAccent));
    expect(strokes).toContain(argbPayload(theme.colorMoonlight));
    expect(strokes).not.toContain(argbPayload(theme.colorWhorlRidgeDay));
  });

  it('tint overrides both grounds to one colour (a spinner on a coloured button)', () => {
    const tree = render(<WhorlSpinner size="sm" tint={theme.colorTextOnDark} />).toJSON();
    // Every ridge + the dot are the tint — no teal/lavender two-hue on a coloured ground.
    ridges(tree).forEach((a) => expect(a.props.stroke.payload).toBe(argbPayload(theme.colorTextOnDark)));
    expect(solidFills(tree)[0].props.fill.payload).toBe(argbPayload(theme.colorTextOnDark));
  });
});

describe('WhorlSpinner — motion budget (§1.5)', () => {
  it('reduced-motion renders the static frame: a soft glow behind the still dot', () => {
    mockedReduced.mockReturnValue(true);
    const tree = render(<WhorlSpinner size="md" />).toJSON();
    // Two solid accent fills now — the resting dot AND the glow behind it.
    const fills = solidFills(tree).filter((c) => c.props.fill.payload === argbPayload(theme.colorAccent));
    expect(fills.length).toBe(2);
    // The glow is the larger, low-opacity one.
    expect(fills.some((c) => c.props.opacity === 0.22)).toBe(true);
    // The four ridges still render (arcs at rest at their offsets, not removed).
    expect(ridges(tree).length).toBe(4);
  });

  it('app blur (not active) also drops to the static frame — the loop pauses, glow appears', () => {
    mockedActive.mockReturnValue(false);
    const fills = solidFills(render(<WhorlSpinner size="md" />).toJSON()).filter(
      (c) => c.props.fill.payload === argbPayload(theme.colorAccent),
    );
    expect(fills.length).toBe(2); // dot + glow → paused
  });

  it('ridgeOpacity dims the ridges (night-moment texture) but never the core dot', () => {
    const tree = render(<WhorlSpinner size={420} ground="night" ridgeOpacity={0.5} />).toJSON();
    ridges(tree).forEach((a) => expect(a.props.opacity).toBe(0.5));
    // The dot is full opacity (the one focal point) — no opacity prop / undefined.
    const dot = solidFills(tree).find((c) => c.props.fill.payload === argbPayload(theme.colorAccent));
    expect(dot.props.opacity).toBeUndefined();
  });
});

describe('WhorlSpinner — a11y', () => {
  it('is decorative by default (no independent a11y node next to sibling copy)', () => {
    expect((render(<WhorlSpinner />).toJSON() as any).props.accessible).toBeFalsy();
  });

  it('announces itself when given a label (a standalone wait)', () => {
    const { getByLabelText } = render(<WhorlSpinner accessibilityLabel="Loading" />);
    expect(getByLabelText('Loading')).toBeTruthy();
  });
});
