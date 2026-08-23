import { render } from '@testing-library/react-native';
import { HomeGlyph, HistoryGlyph, FoodsGlyph } from './tabGlyphs';
import { GlyphSvg } from '../ui/GlyphSvg';
import { GlyphSvg as GlyphSvgFromEventFamily } from '../event/eventGlyphs';
import { theme } from '../../constants/theme';

// The point of the shared wrapper is that the house line cannot drift glyph-to-glyph.
// These pin that for the nav trio: not the artwork (which the Designer confirms at
// 22pt on device), but the contract every family glyph is drawn under.

const GLYPHS = [
  ['Home', HomeGlyph],
  ['History', HistoryGlyph],
  ['Foods', FoodsGlyph],
] as const;

// Structural node shapes, annotated inline — the house idiom for reaching into a
// rendered tree (see TrialCompletionSheet.test.tsx).
type SvgNode = { type: unknown; props: Record<string, unknown> };

const displayNameOf = (node: { type: unknown }) =>
  typeof node.type === 'string' ? node.type : (node.type as { displayName?: string })?.displayName;

const svgOf = (element: React.ReactElement): SvgNode =>
  render(element).UNSAFE_root.findAll(
    (node: { type: unknown }) => displayNameOf(node) === 'Svg',
  )[0] as SvgNode;

describe('the tab glyphs are drawn on the house line', () => {
  it.each(GLYPHS)('%s conforms to the 24-box, no-fill, round-cap line', (_name, Glyph) => {
    const svg = svgOf(<Glyph />);
    expect(svg.props.viewBox).toBe('0 0 24 24');
    expect(svg.props.fill).toBe('none');
    expect(svg.props.strokeWidth).toBe(1.75);
    expect(svg.props.strokeLinecap).toBe('round');
    expect(svg.props.strokeLinejoin).toBe('round');
  });

  it.each(GLYPHS)('%s passes the icon-kit trio through to the drawing', (_name, Glyph) => {
    const svg = svgOf(<Glyph size={22} color={theme.colorAccent} strokeWidth={2} />);
    expect(svg.props.width).toBe(22);
    expect(svg.props.height).toBe(22);
    expect(svg.props.stroke).toBe(theme.colorAccent);
    expect(svg.props.strokeWidth).toBe(2);
  });

  it('draws one line, shared with the event family', () => {
    // The wrapper moved to components/ui when the nav glyphs joined the same line
    // (CUL-599). If the families ever ended up on two wrappers, this is what says so.
    expect(GlyphSvgFromEventFamily).toBe(GlyphSvg);
  });
});

describe('the three glyphs are three different marks', () => {
  const pathsOf = (element: React.ReactElement) =>
    render(element)
      .UNSAFE_root.findAll((node: { type: unknown }) =>
        ['Path', 'Circle'].includes(displayNameOf(node) ?? ''),
      )
      .map((node: { props: unknown }) => JSON.stringify(node.props));

  it('gives each tab its own geometry — no glyph masquerades as another', () => {
    const drawings = GLYPHS.map(([, Glyph]) => pathsOf(<Glyph />).join('|'));
    expect(new Set(drawings).size).toBe(GLYPHS.length);
  });

  it('bakes the bowl in place rather than translating it below its siblings', () => {
    // The mock drew the bowl with transform="translate(0 2)", which left it sitting
    // low once every tab shares one icon row — and put its base line inside the bowl.
    pathsOf(<FoodsGlyph />).forEach((props: string) => expect(props).not.toContain('transform'));
  });
});
