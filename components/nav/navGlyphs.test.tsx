import { render } from '@testing-library/react-native';
import { HomeGlyph, HistoryGlyph, FoodsGlyph } from './navGlyphs';
import { VomitGlyph } from '../event/eventGlyphs';
import { theme } from '../../constants/theme';

// The tab-bar glyph family (CUL-599 / spec §1 DP-1) and the contract it shares with
// the event family. Not the artwork — that is the Designer's call at 22pt on device
// (and CUL-493's, for the six glyphs still to come) — but the two things about these
// marks that a future edit could silently break:
//
//   1. that both families are still drawn on ONE line, which is the entire argument
//      for hoisting GlyphSvg out of eventGlyphs.tsx in the first place; and
//   2. that the bowl's base line stays clear of the bowl.
//
// (2) needs saying out loud, because navGlyphs.tsx opens with "The paths are VERBATIM
// from the design authority… do not redraw them here" and the bowl is the one path
// that deliberately is not. A reader who trusts the header over the exception —
// exactly what a header is for — restores the mock's geometry in good faith, and the
// defect comes back. This suite is what turns that into a failing test instead.

const NAV_GLYPHS = [
  ['Home', HomeGlyph],
  ['History', HistoryGlyph],
  ['Foods', FoodsGlyph],
] as const;

// Structural node shapes, annotated inline — the house idiom for reaching into a
// rendered tree (see TrialCompletionSheet.test.tsx).
type GlyphNode = { type: unknown; props: Record<string, unknown> };

const displayNameOf = (node: { type: unknown }) =>
  typeof node.type === 'string' ? node.type : (node.type as { displayName?: string })?.displayName;

const nodesOf = (element: React.ReactElement, displayNames: string[]): GlyphNode[] =>
  render(element).UNSAFE_root.findAll((node: { type: unknown }) =>
    displayNames.includes(displayNameOf(node) ?? ''),
  ) as GlyphNode[];

const svgOf = (element: React.ReactElement) => nodesOf(element, ['Svg'])[0];
const drawingOf = (element: React.ReactElement) =>
  nodesOf(element, ['Path', 'Circle', 'Rect', 'Line']).map((node) => JSON.stringify(node.props));

// The line rule, as values rather than as a wrapper reference. Asserting the drawn
// RESULT (rather than that both families import the same module) is what makes this
// survive a refactor: fork the wrapper and keep these identical and nothing is wrong;
// fork it and let one family drift and this fails, which is the actual rule.
const HOUSE_LINE = {
  viewBox: '0 0 24 24',
  fill: 'none',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

const lineOf = (element: React.ReactElement) => {
  const { viewBox, fill, strokeWidth, strokeLinecap, strokeLinejoin } = svgOf(element).props;
  return { viewBox, fill, strokeWidth, strokeLinecap, strokeLinejoin };
};

describe('the nav glyphs are drawn on the house line', () => {
  it.each(NAV_GLYPHS)('%s conforms to the 24-box, no-fill, round-cap line', (_name, Glyph) => {
    expect(lineOf(<Glyph />)).toEqual(HOUSE_LINE);
  });

  it.each(NAV_GLYPHS)('%s passes the icon-kit trio through to the drawing', (_name, Glyph) => {
    const { props } = svgOf(<Glyph size={22} color={theme.colorAccent} strokeWidth={2} />);
    expect(props.width).toBe(22);
    expect(props.height).toBe(22);
    expect(props.stroke).toBe(theme.colorAccent);
    expect(props.strokeWidth).toBe(2);
  });

  it('draws the same line as the event family', () => {
    // The invariant the shared wrapper exists to hold: the tab bar and the event
    // icons are one drawn language. They sit in different folders answering to
    // different maps, so nothing but this stops them diverging a stroke at a time.
    expect(lineOf(<FoodsGlyph />)).toEqual(lineOf(<VomitGlyph />));
  });
});

describe('the three glyphs are three different marks', () => {
  it('gives each tab its own geometry — no glyph masquerades as another', () => {
    const drawings = NAV_GLYPHS.map(([, Glyph]) => drawingOf(<Glyph />).join('|'));
    expect(new Set(drawings).size).toBe(NAV_GLYPHS.length);
  });

  it('does not reuse an event glyph for a tab', () => {
    expect(drawingOf(<FoodsGlyph />)).not.toEqual(drawingOf(<VomitGlyph />));
  });
});

describe('the bowl keeps its base line clear of the bowl', () => {
  // The mock's bowl was a straight rim with `a8 8` beneath it — a true semicircle, so
  // the body descends by the full radius — and a base line at y=20 against a body
  // reaching y=21. At the bar's 22pt that line crosses the bowl's INTERIOR and reads
  // as a fill level rather than the mat the bowl stands on. navGlyphs.tsx re-centres
  // it; these assertions are what keep it re-centred.
  const [body, base] = drawingOf(<FoodsGlyph />).map((props) => JSON.parse(props).d as string);

  // `M4 <rim>h16a<r> <r> 0 0 1-16 0Z` — rim y, then the arc radius.
  const bodyGeometry = /^M[\d.]+ ([\d.]+)h[\d.]+a([\d.]+) /.exec(body);
  // `M<x> <y>h<len>` — the base line's y.
  const baseGeometry = /^M[\d.]+ ([\d.]+)h[\d.]+$/.exec(base);

  it('is drawn as a rim-over-arc body plus a separate straight base line', () => {
    // Guards the parse itself: if the bowl is ever redrawn in another idiom, this
    // fails loudly rather than letting the geometry assertions silently pass on nulls.
    expect(bodyGeometry).not.toBeNull();
    expect(baseGeometry).not.toBeNull();
  });

  it('puts the base line below the bowl, not across it', () => {
    const rimY = Number(bodyGeometry?.[1]);
    const radius = Number(bodyGeometry?.[2]);
    const baseY = Number(baseGeometry?.[1]);
    // A semicircular body bottoms out a full radius below its rim.
    expect(baseY).toBeGreaterThan(rimY + radius);
  });

  it('keeps the whole mark inside the 24 box', () => {
    const baseY = Number(baseGeometry?.[1]);
    // The re-centring is only worth anything if it did not just push the glyph out
    // the bottom — the bar centres all four tabs on one icon row.
    expect(baseY).toBeLessThan(24);
  });

  it('bakes the position in rather than translating the bowl at render time', () => {
    // The mock reached its (broken) position with transform="translate(0 2)". A
    // transform would also put the glyph low against its siblings once every tab
    // shares one icon slot, so the correction is in the path data or it is not made.
    drawingOf(<FoodsGlyph />).forEach((props) => expect(props).not.toContain('transform'));
  });
});
