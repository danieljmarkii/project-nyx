import { render } from '@testing-library/react-native';
import { NightWatermark } from './NightWatermark';
import { MARK_GEOMETRY } from './CulpritMark';
import { theme } from '../../constants/theme';

// The night watermark (CUL-2224). These pin what would silently regress it:
// (1) the carve rule (§1.1): the crescent is an outline cut by masks, never a filled
// circle laid over the ground; (2) it is drawn from CulpritMark's geometry, not a copy;
// (3) no teal anywhere, since teal stays the mark's own dot; (4) it is invisible to
// touch and to assistive tech.
//
// react-native-svg's test renderer resolves to native `RNSVG*` host components and
// packs colours into ARGB ints: a fill or stroke as {type, payload}, a gradient as
// `gradient: [offset, argb, offset, argb, …]` with the stop's opacity in the alpha
// byte. So colours are compared by their RGB bytes, against the real theme hex.

const rgbOf = (hex: string): number => parseInt(hex.replace('#', '').slice(0, 6), 16);
const rgbOfArgb = (argb: number): number => (argb >>> 0) & 0xffffff;

function findByType(node: any, type: string): any[] {
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

// The RGB of every colour in the tree: fills and strokes, and every gradient stop.
function coloursIn(node: any): number[] {
  const out: number[] = [];
  const visit = (v: any) => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      v.forEach(visit);
      return;
    }
    if (typeof v.payload === 'number') out.push(rgbOfArgb(v.payload));
    if (Array.isArray(v.gradient)) v.gradient.forEach((x: number, i: number) => i % 2 === 1 && out.push(rgbOfArgb(x)));
    Object.values(v).forEach(visit);
  };
  visit(node);
  return out;
}

// The mark is hidden from assistive tech, and RNTL's queries skip hidden elements by
// default, so every query here opts in. Without it a "never draws" check is green over
// nothing.
const HIDDEN = { includeHiddenElements: true } as const;

const SIZE = 468;

describe('NightWatermark', () => {
  it('draws the crescent as two masked outlines plus the dot ring, with no solid fill', () => {
    const tree = render(<NightWatermark size={SIZE} />).toJSON();
    const masks = findByType(tree, 'RNSVGMask');
    const circles = findByType(tree, 'RNSVGCircle');
    // One mask keeps the moon outside the carve, one keeps the carve inside the moon.
    expect(masks).toHaveLength(2);
    // Outside the masks: the faint fill, the moon arc, the carve arc, the dot ring.
    const drawn = circles.filter((c) => !masks.some((m) => findByType(m, 'RNSVGCircle').includes(c)));
    expect(drawn).toHaveLength(4);
    // Three of them are hairlines with no fill of their own.
    const outlines = drawn.filter((c) => c.props.stroke != null);
    expect(outlines).toHaveLength(3);
    outlines.forEach((c) => expect(c.props.fill?.payload).toBeUndefined());
  });

  it('cuts the moon by the carve and the carve by the moon, not the other way round', () => {
    // Swapping the two masks would leave a full circle and lose the inner arc, and every
    // count above would stay the same.
    const tree = render(<NightWatermark size={SIZE} />).toJSON();
    const { moon, carve } = MARK_GEOMETRY;
    const masks = findByType(tree, 'RNSVGMask');
    const maskHolding = (r: number) =>
      masks.find((m) => findByType(m, 'RNSVGCircle').some((c) => Number(c.props.r) === r))?.props.name;
    const cutsByCarve = maskHolding(carve.r);
    const keepsInMoon = maskHolding(moon.r);
    expect(cutsByCarve).toBeTruthy();
    expect(keepsInMoon).toBeTruthy();
    expect(cutsByCarve).not.toBe(keepsInMoon);

    const drawn = findByType(tree, 'RNSVGCircle').filter((c) => !masks.some((m) => findByType(m, 'RNSVGCircle').includes(c)));
    const moonCircles = drawn.filter((c) => Number(c.props.r) === moon.r);
    const carveArc = drawn.find((c) => Number(c.props.r) === carve.r);
    expect(moonCircles).toHaveLength(2);
    moonCircles.forEach((c) => expect(c.props.mask).toBe(cutsByCarve));
    expect(carveArc.props.mask).toBe(keepsInMoon);
  });

  it('reads CulpritMark’s geometry rather than restating it', () => {
    const tree = render(<NightWatermark size={SIZE} />).toJSON();
    const drawn = findByType(tree, 'RNSVGCircle').filter((c) => c.props.stroke != null);
    const { moon, carve, dot } = MARK_GEOMETRY;
    const shapes = drawn.map((c) => [Number(c.props.cx), Number(c.props.cy), Number(c.props.r)]);
    expect(shapes).toEqual([
      [moon.cx, moon.cy, moon.r],
      [carve.cx, carve.cy, carve.r],
      [dot.cx, dot.cy, dot.r],
    ]);
  });

  it('holds a 1pt hairline at any size', () => {
    [234, SIZE].forEach((size) => {
      const tree = render(<NightWatermark size={size} />).toJSON();
      // The 1pt sum only holds if the canvas really is `size` wide over the mark's viewBox.
      const [svg] = findByType(tree, 'RNSVGSvgView');
      expect(Number(svg.props.vbWidth)).toBe(MARK_GEOMETRY.viewBox);
      expect(Number(svg.props.width)).toBe(size);
      const [arc] = findByType(tree, 'RNSVGCircle').filter((c) => c.props.stroke != null);
      expect(Number(arc.props.strokeWidth) * (size / MARK_GEOMETRY.viewBox)).toBeCloseTo(1);
    });
  });

  it('carries no teal', () => {
    const tree = render(<NightWatermark size={SIZE} />).toJSON();
    const colours = coloursIn(tree);
    expect(colours).toContain(rgbOf(theme.colorWatermarkOnNight));
    expect(colours).not.toContain(rgbOf(theme.colorAccent));
    expect(colours).not.toContain(rgbOf(theme.colorMoonlitTeal));
  });

  it('takes no touch and is hidden from assistive tech', () => {
    const { getByTestId } = render(<NightWatermark size={SIZE} />);
    const host = getByTestId('night-watermark', HIDDEN);
    expect(host.props.pointerEvents).toBe('none');
    expect(host.props.accessibilityElementsHidden).toBe(true);
    expect(host.props.importantForAccessibility).toBe('no-hide-descendants');
  });
});
