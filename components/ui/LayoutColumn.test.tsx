// The content column, held inside each screen (CUL-2237, CUL-2703).
//
// The first Duo device check found Home cut to a 560pt band: one column stood around the
// whole stack, a native stack screen clips to its bounds, and the tabs' step back out to
// the window was cut with the + in it. The browser captures could not see it (nothing
// clips on web), so what keeps it fixed is asserted here, on the structure: no navigator
// is wrapped in a column, and every route that owns one holds its own screens.
import * as fs from 'fs';
import * as path from 'path';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { theme } from '../../constants/theme';
import { heldScreenLayout, LayoutColumn, screenInColumn, SELF_HELD_ROUTES } from './LayoutColumn';

// The edge iOS reports for its vertical bar: null wherever its bars lie flat.
const mockBarEdge = jest.fn<'leading' | 'trailing' | null, []>(() => null);
jest.mock('expo-status-bar', () => ({ useVerticalBarEdgeIOS: () => mockBarEdge() }));

let mockWindowWidth = 390;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWindowWidth, height: 844, scale: 3, fontScale: 1 }),
}));

const STRIP = theme.layoutSystemBarMinWidth;
const flat = (style: unknown) => (StyleSheet.flatten(style as StyleProp<ViewStyle>) ?? {}) as Record<string, unknown>;

type Node = { props: { style?: unknown; onLayout?: (e: unknown) => void; pointerEvents?: string }; children: Node[] };

function renderColumn(width: number, edge: 'leading' | 'trailing' | null = null, overlay = false) {
  mockWindowWidth = width;
  mockBarEdge.mockReturnValue(edge);
  const view = render(
    <LayoutColumn overlay={overlay}>
      <Text>content</Text>
    </LayoutColumn>,
  );
  const outer = () => view.toJSON() as unknown as Node;
  const inner = () => outer().children[0];
  // The host reports its own width, as the platform does on its first layout.
  const measure = (hostWidth: number) => {
    const host = view.UNSAFE_getAllByType(View).find((n) => typeof n.props.onLayout === 'function');
    if (!host) throw new Error('the column is not measuring its host');
    act(() => host.props.onLayout({ nativeEvent: { layout: { width: hostWidth, height: 600, x: 0, y: 0 } } }));
  };
  return { ...view, outer, inner, measure };
}

afterEach(() => {
  mockWindowWidth = 390;
  mockBarEdge.mockReturnValue(null);
});

describe('LayoutColumn', () => {
  it.each([320, 390, 440])('a %ipt phone: both views are flex 1 and nothing else, and nothing is measured', (w) => {
    const { outer, inner } = renderColumn(w);
    expect(flat(outer().props.style)).toEqual({ flex: 1 });
    expect(flat(inner().props.style)).toEqual({ flex: 1 });
    expect(outer().props.onLayout).toBeUndefined();
  });

  it('the unfolded Duo upright (669pt): the column is centred and the gutters show the ground', () => {
    const { outer, inner } = renderColumn(669);
    const gutter = (669 - theme.layoutColumnMaxWidth) / 2;
    expect(flat(outer().props.style)).toEqual({ flex: 1, backgroundColor: theme.colorNeutralLight });
    expect(flat(inner().props.style)).toEqual({ flex: 1, marginLeft: gutter, marginRight: gutter });
  });

  // The device check's second defect: folded, screens ran under the system's strip.
  it('the folded Duo (466pt): the column ends where the strip begins and keeps the left edge', () => {
    const { inner } = renderColumn(466, 'trailing');
    expect(flat(inner().props.style)).toEqual({ flex: 1, marginLeft: 0, marginRight: STRIP });
  });

  it('a strip on the left edge is held the same way, mirrored', () => {
    const { inner } = renderColumn(469, 'leading');
    expect(flat(inner().props.style)).toEqual({ flex: 1, marginLeft: STRIP, marginRight: 0 });
  });

  // A modal route on the unfolded Duo is a card the platform centres: it is clear of the
  // window's sides, so the window's gutters are not its own.
  it('a host narrower than the window is capped and centred in itself, not stepped in by the window’s gutters', () => {
    const { inner, measure } = renderColumn(951, 'trailing');
    expect(flat(inner().props.style).marginRight).toBeGreaterThan(STRIP);
    measure(540);
    const style = flat(inner().props.style);
    expect(style).toEqual({ flex: 1, width: '100%', maxWidth: theme.layoutColumnMaxWidth, alignSelf: 'center' });
  });

  it('a host as wide as the window keeps the window’s gutters after it is measured', () => {
    const { inner, measure } = renderColumn(951, 'trailing');
    const before = flat(inner().props.style);
    measure(951);
    expect(flat(inner().props.style)).toEqual(before);
  });

  it('the overlay is the same column over the stack: it fills, paints nothing and passes touch through', () => {
    const { outer, inner } = renderColumn(669, null, true);
    const gutter = (669 - theme.layoutColumnMaxWidth) / 2;
    expect(flat(outer().props.style)).toEqual(flat(StyleSheet.absoluteFill));
    expect(flat(outer().props.style).backgroundColor).toBeUndefined();
    expect(outer().props.pointerEvents).toBe('box-none');
    expect(inner().props.pointerEvents).toBe('box-none');
    expect(flat(inner().props.style)).toEqual({ flex: 1, marginLeft: gutter, marginRight: gutter });
  });
});

describe('the stacks’ screen layouts', () => {
  const child = <Text>screen</Text>;

  it('screenInColumn wraps a screen in the column', () => {
    expect(screenInColumn({ children: child }).type).toBe(LayoutColumn);
  });

  it('the root wraps every leaf route and leaves a route that owns a navigator to itself', () => {
    expect(heldScreenLayout({ children: child, route: { name: 'event/[id]' } }).type).toBe(LayoutColumn);
    expect(heldScreenLayout({ children: child, route: { name: 'settings' } }).type).toBe(LayoutColumn);
    for (const name of SELF_HELD_ROUTES) {
      expect(heldScreenLayout({ children: child, route: { name } })).toBe(child);
    }
  });
});

// ── No navigator stands inside a column (the clip) ───────────────────────────
describe('no navigator is wrapped in a column (CUL-2703)', () => {
  const APP = path.resolve(__dirname, '../../app');
  const read = (rel: string) => fs.readFileSync(path.join(APP, rel), 'utf8');
  // Comments out, lines kept: the prose above each layout names the things it must not do.
  const code = (src: string) => src.replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));

  const groups = fs
    .readdirSync(APP, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(APP, e.name, '_layout.tsx')))
    .map((e) => e.name);

  it('finds the groups (non-vacuity)', () => {
    expect(groups.length).toBeGreaterThanOrEqual(3);
    expect(groups).toContain('(tabs)');
  });

  it('every folder that owns a navigator is one the root leaves to itself', () => {
    expect(new Set(groups)).toEqual(SELF_HELD_ROUTES);
  });

  it('the root stack fills the window and hands each screen its column', () => {
    const root = code(read('_layout.tsx'));
    expect(root).toMatch(/<Stack\b[^>]*\bscreenLayout=\{heldScreenLayout\}/);
    // The only column the root itself renders is the overlay for the hosts and cards. A
    // bare one here is a column around the stack again.
    const columns = root.match(/<LayoutColumn\b[^>]*>/g) ?? [];
    expect(columns).toEqual(['<LayoutColumn overlay>']);
    // And it closes after the stack does, never around it.
    expect(root.indexOf('</Stack>')).toBeLessThan(root.indexOf('<LayoutColumn overlay>'));
  });

  it.each(['(auth)', 'onboarding'])('%s holds its own screens in the column', (group) => {
    const layout = code(read(`${group}/_layout.tsx`));
    expect(layout).toMatch(/<Stack\b[\s\S]*?\bscreenLayout=\{screenInColumn\}/);
    expect(layout).not.toMatch(/<LayoutColumn\b/);
  });

  it('the tabs stand in the window: no column around them and no step out of one', () => {
    const tabs = code(read('(tabs)/_layout.tsx'));
    expect(tabs).not.toMatch(/<LayoutColumn\b/);
    // The negative margin that tried to escape the root column, and was clipped.
    expect(tabs).not.toMatch(/margin(Horizontal|Left|Right):\s*-/);
    expect(tabs).toMatch(/tabBarPosition:\s*rail\?\.edge \?\? 'bottom'/);
  });
});
