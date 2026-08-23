import { render, fireEvent, act } from '@testing-library/react-native';
import { NyxTabBar, PET_ROUTE_NAME, type TabBarProps } from './NyxTabBar';
import { usePetStore } from '../../store/petStore';
import { theme } from '../../constants/theme';
import type { Pet } from '../../store/petStore';

// The tab bar (CUL-599 / spec §1 DP-1). The ladder's arithmetic is pinned in
// lib/petTabLabel.test.ts; this suite pins what the BAR does with it — that the
// glyphs render, that the pet's name reaches the label and the full name always
// reaches VoiceOver, that focus is drawn without moving anything, and that a pet
// switch re-titles the tab (the last of the four acceptance criteria).

jest.mock('../../lib/storage', () => ({
  getPublicUrl: (bucket: string, path: string) => `https://example.test/${bucket}/${path}`,
}));

// The ladder is a function of the window width, and jest-expo's default window is
// 750pt wide — a frame no supported phone has, on which every name fits at the top
// rung and the ladder never engages. Every acceptance criterion here is stated at a
// width on purpose, so a reader can see which frame the ruling is about.
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(() => ({ width: 320, height: 568, scale: 2, fontScale: 1 })),
}));
const mockedUseWindowDimensions =
  require('react-native/Libraries/Utilities/useWindowDimensions').default as jest.Mock;

/** 320pt — the narrowest supported frame (iPhone SE 1st gen), and the AC's frame. */
const NARROWEST = 320;

function setWindowWidth(width: number) {
  mockedUseWindowDimensions.mockReturnValue({ width, height: 568, scale: 2, fontScale: 1 });
}

// react-native-svg resolves to native RNSVG* host components under the test
// renderer, so glyphs are asserted by their host type + drawn path rather than by
// a testID the production tree would otherwise have to carry.
function collect(node: any, type: string): any[] {
  const out: any[] = [];
  const visit = (n: any) => {
    if (!n || typeof n !== 'object') return;
    if (n.type === type) out.push(n);
    (n.children ?? []).forEach(visit);
  };
  visit(node);
  return out;
}

function pathData(tree: any): string[] {
  return collect(tree, 'RNSVGPath')
    .map((n) => n.props?.d)
    .filter((d): d is string => typeof d === 'string');
}

const HOUSE_PATH = 'M4 11 12 4l8 7v9h-5v-5h-6v5H4z';
const CLOCK_HAND_PATH = 'M12 8v4l2.5 2';
const BOWL_PATH = 'M4 13h16a8 8 0 0 1-16 0z';

const ROUTES = [
  { key: 'index-1', name: 'index' },
  { key: 'history-1', name: 'history' },
  { key: 'foods-1', name: 'foods' },
  { key: 'profile-1', name: PET_ROUTE_NAME },
];

const TITLES: Record<string, string> = {
  index: 'Home',
  history: 'History',
  foods: 'Foods',
  [PET_ROUTE_NAME]: 'Pet',
};

function makePet(overrides: Partial<Pet> = {}): Pet {
  return {
    id: 'pet-1',
    name: 'Biscuit',
    species: 'dog',
    photo_path: null,
    ...overrides,
  } as Pet;
}

function makeProps(focusedIndex = 0): TabBarProps & {
  navigation: { emit: jest.Mock; navigate: jest.Mock };
} {
  return {
    state: { routes: ROUTES, index: focusedIndex },
    descriptors: Object.fromEntries(
      ROUTES.map((r) => [r.key, { options: { title: TITLES[r.name] } }]),
    ),
    navigation: {
      emit: jest.fn(() => ({ defaultPrevented: false })),
      navigate: jest.fn(),
    },
  };
}

function setActivePet(pet: Pet | null) {
  usePetStore.setState({ pets: pet ? [pet] : [], activePet: pet });
}

beforeEach(() => {
  setWindowWidth(NARROWEST);
  setActivePet(makePet());
});

afterEach(() => {
  usePetStore.setState({ pets: [], activePet: null });
});

describe('the three house-line glyphs', () => {
  it('draws the house, the clock and the bowl — verbatim from the mock', () => {
    const { toJSON } = render(<NyxTabBar {...makeProps()} />);
    const drawn = pathData(toJSON());
    expect(drawn).toContain(HOUSE_PATH);
    expect(drawn).toContain(CLOCK_HAND_PATH);
    expect(drawn).toContain(BOWL_PATH);
    // The clock's face is a circle, not a path — asserted separately so a swap to
    // a path-drawn ring is a visible test change rather than a silent redraw.
    expect(collect(toJSON(), 'RNSVGCircle').length).toBe(1);
  });

  it('draws no glyph for the pet tab — the pet is the glyph', () => {
    // Three tabs carry a glyph; the fourth carries the avatar. Four SVGs would mean
    // the bar had grown a paw again (round 1's option B, which D1 did not ship).
    const { toJSON } = render(<NyxTabBar {...makeProps()} />);
    expect(collect(toJSON(), 'RNSVGSvgView').length).toBe(3);
  });

  it('tints the focused glyph differently from the unfocused ones', () => {
    // The stroke is set once on the <Svg> (the house line's single point of
    // control), so it is read there rather than off each path. The exact colour
    // packing is react-native-svg's business; the distinction is ours.
    const { toJSON } = render(<NyxTabBar {...makeProps(0)} />);
    const strokes = collect(toJSON(), 'RNSVGSvgView').map((n) => JSON.stringify(n.props?.stroke));
    expect(strokes.length).toBe(3);
    // Home focused, History + Foods not: two distinct tints, one of them used once.
    expect(new Set(strokes).size).toBe(2);
    expect(strokes.filter((s) => s === strokes[0]).length).toBe(1);
  });
});

describe('the Pet tab is the pet', () => {
  it('labels the tab with the pet name, not the word "Pet"', () => {
    const { queryByText, getByText } = render(<NyxTabBar {...makeProps()} />);
    expect(getByText('Biscuit')).toBeTruthy();
    expect(queryByText('Pet')).toBeNull();
  });

  it('renders the initial chip when the pet has no photo', () => {
    const { getByText } = render(<NyxTabBar {...makeProps()} />);
    expect(getByText('B')).toBeTruthy();
  });

  it('renders the photo when the pet has one', () => {
    setActivePet(makePet({ photo_path: 'pet-1/avatar.jpg' }));
    const { UNSAFE_getAllByType, queryByText } = render(<NyxTabBar {...makeProps()} />);
    const { Image } = require('react-native');
    const uris = UNSAFE_getAllByType(Image).map((n: any) => n.props.source?.uri);
    expect(uris).toContain('https://example.test/nyx-pet-photos/pet-1/avatar.jpg');
    // The initial is the fallback, not a companion to the photo.
    expect(queryByText('B')).toBeNull();
  });

  it('re-renders the tab when the active pet changes (AC)', () => {
    const { getByText, queryByText } = render(<NyxTabBar {...makeProps()} />);
    expect(getByText('Biscuit')).toBeTruthy();

    act(() => setActivePet(makePet({ id: 'pet-2', name: 'Mochi' })));

    expect(getByText('Mochi')).toBeTruthy();
    expect(queryByText('Biscuit')).toBeNull();
    expect(getByText('M')).toBeTruthy();
  });

  it('keeps the configured title while no pet has loaded yet', () => {
    // Cold start: the store is empty for a beat. A blank slot in the bar would be
    // worse than the generic word, so the route's own title stands in.
    setActivePet(null);
    const { getByText } = render(<NyxTabBar {...makeProps()} />);
    expect(getByText('Pet')).toBeTruthy();
  });
});

describe('the fallback ladder, as rendered', () => {
  it('falls back to "Pet" for a name that cannot fit (AC)', () => {
    setActivePet(makePet({ name: 'Schrodingers Cat' }));
    const { getByText, queryByText } = render(<NyxTabBar {...makeProps()} />);
    // 320pt is the jest-expo default window width — the narrowest supported frame,
    // which is exactly the one the acceptance criteria are stated against.
    expect(getByText('Pet')).toBeTruthy();
    expect(queryByText('Schrodingers Cat')).toBeNull();
  });

  it('drops "Bartholomew" a rung rather than cutting it (AC)', () => {
    setActivePet(makePet({ name: 'Bartholomew' }));
    const { getByText } = render(<NyxTabBar {...makeProps()} />);
    const label = getByText('Bartholomew');
    const style = Array.isArray(label.props.style)
      ? Object.assign({}, ...label.props.style.filter(Boolean))
      : label.props.style;
    expect(style.fontSize).toBe(theme.textTabLabelTight);
  });

  it('renders an ordinary name at the top rung', () => {
    const { getByText } = render(<NyxTabBar {...makeProps()} />);
    const style = Array.isArray(getByText('Biscuit').props.style)
      ? Object.assign({}, ...getByText('Biscuit').props.style.filter(Boolean))
      : getByText('Biscuit').props.style;
    expect(style.fontSize).toBe(theme.textXS);
  });

  it('keeps the same long name whole on a wider phone', () => {
    // The ladder is width-aware, not a per-name verdict: the name that falls back
    // on an SE keeps its real name on a modern one.
    setWindowWidth(393);
    setActivePet(makePet({ name: 'Schrodingers Cat' }));
    const { getByText, queryByText } = render(<NyxTabBar {...makeProps()} />);
    expect(getByText('Schrodingers Cat')).toBeTruthy();
    expect(queryByText('Pet')).toBeNull();
  });

  it('never renders a truncated name — no ellipsis rung', () => {
    setActivePet(makePet({ name: 'Schrodingers Cat' }));
    const { queryByText } = render(<NyxTabBar {...makeProps()} />);
    ['Schrodinger…', 'Schrodingers…', 'Schrodinge…', 'Schrod…'].forEach((cut) => {
      expect(queryByText(cut)).toBeNull();
    });
  });
});

describe('accessibility', () => {
  it('speaks the full name at the rung that renders "Pet" (AC)', () => {
    setActivePet(makePet({ name: 'Schrodingers Cat' }));
    const { getByLabelText, queryByText } = render(<NyxTabBar {...makeProps()} />);
    expect(queryByText('Pet')).toBeTruthy();
    expect(getByLabelText('Schrodingers Cat — pet profile')).toBeTruthy();
  });

  it('speaks the full name at the other rungs too', () => {
    const { getByLabelText } = render(<NyxTabBar {...makeProps()} />);
    expect(getByLabelText('Biscuit — pet profile')).toBeTruthy();

    act(() => setActivePet(makePet({ name: 'Bartholomew' })));
    expect(getByLabelText('Bartholomew — pet profile')).toBeTruthy();
  });

  it('marks exactly the focused tab as selected', () => {
    const { getAllByRole } = render(<NyxTabBar {...makeProps(2)} />);
    const selected = getAllByRole('button').map((n) => n.props.accessibilityState?.selected);
    expect(selected).toEqual([false, false, true, false]);
  });

  it('leaves the non-pet tabs on their own labels', () => {
    const { getByLabelText } = render(<NyxTabBar {...makeProps()} />);
    ['Home', 'History', 'Foods'].forEach((label) => {
      expect(getByLabelText(label)).toBeTruthy();
    });
  });
});

describe('the active state draws without moving anything', () => {
  const ringStyles = (tree: any) =>
    collect(tree, 'View')
      .map((n) => (Array.isArray(n.props?.style) ? Object.assign({}, ...n.props.style.filter(Boolean)) : n.props?.style))
      .filter((s) => s && s.borderWidth === 2 && s.borderRadius === theme.radiusFull);

  it('rings the avatar in accent when the pet tab is focused', () => {
    const focused = render(<NyxTabBar {...makeProps(3)} />).toJSON();
    expect(ringStyles(focused).map((s) => s.borderColor)).toEqual([theme.colorAccent]);
  });

  it('keeps the ring box laid out (transparent) when it is not', () => {
    // The no-shift rule: an absent border would resize the avatar's box, so the
    // whole bar would twitch on navigation.
    const blurred = render(<NyxTabBar {...makeProps(0)} />).toJSON();
    const rings = ringStyles(blurred);
    expect(rings.length).toBe(1);
    expect(rings[0].borderColor).toBe('transparent');
    expect(rings[0].width).toBe(ringStyles(render(<NyxTabBar {...makeProps(3)} />).toJSON())[0].width);
  });

  it('tints the tick on the focused tab only, and lays it out on every tab', () => {
    const tree = render(<NyxTabBar {...makeProps(1)} />).toJSON();
    const ticks = collect(tree, 'View')
      .map((n) => (Array.isArray(n.props?.style) ? Object.assign({}, ...n.props.style.filter(Boolean)) : n.props?.style))
      .filter((s) => s && s.width === 4 && s.height === 4);
    expect(ticks.length).toBe(4);
    expect(ticks.filter((s) => s.backgroundColor === theme.colorAccent).length).toBe(1);
    expect(ticks.filter((s) => s.backgroundColor === 'transparent').length).toBe(3);
  });

  it('gives every label the same leading, so a rung change cannot move the tick', () => {
    setActivePet(makePet({ name: 'Bartholomew' }));
    const { getByText } = render(<NyxTabBar {...makeProps()} />);
    const leading = (text: string) => {
      const node = getByText(text);
      const style = Array.isArray(node.props.style)
        ? Object.assign({}, ...node.props.style.filter(Boolean))
        : node.props.style;
      return style.lineHeight;
    };
    // 'Bartholomew' renders a rung down from 'Home'; the line box must not follow.
    expect(leading('Bartholomew')).toBe(leading('Home'));
  });
});

describe('geometry', () => {
  const flat = (style: any) =>
    Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style;

  it('pins tab labels against Dynamic Type', () => {
    // Spec §1 — the platform tab-bar convention, and the assumption the ladder
    // rests on: it fits a name to a tab at a KNOWN size, so a scaled label would
    // overflow the tab the ladder just fitted it to. Asserted on every label,
    // because one un-pinned tab is the one that clips.
    const { getByText } = render(<NyxTabBar {...makeProps()} />);
    ['Home', 'History', 'Foods', 'Biscuit'].forEach((label) => {
      expect(getByText(label).props.allowFontScaling).toBe(false);
    });
  });

  it('holds every label on one line', () => {
    const { getByText } = render(<NyxTabBar {...makeProps()} />);
    ['Home', 'History', 'Foods', 'Biscuit'].forEach((label) => {
      expect(getByText(label).props.numberOfLines).toBe(1);
    });
  });

  it('is tall enough for what it draws, and clears the 44pt tap floor', () => {
    // The AC's other half — four tabs render glyph + label at 320pt WITHOUT clip.
    // The ladder covers the horizontal fit; this covers the vertical one, which is
    // what the extra row (glyph, then tick) actually spends.
    const tree = render(<NyxTabBar {...makeProps()} />).toJSON() as any;
    const bar = flat(tree.props.style);
    const content = bar.height - bar.paddingTop - bar.paddingBottom;

    // icon slot 26 + gap 3 + leading 14 + gap 2 + tick 4.
    expect(content).toBeGreaterThanOrEqual(49);
    // The touchable fills that content box, so it is also the tap target's height;
    // at 320pt across four tabs the width is 80. Both clear §8's 44pt floor.
    expect(content).toBeGreaterThanOrEqual(44);
    expect(NARROWEST / ROUTES.length).toBeGreaterThanOrEqual(44);
  });
});

describe('navigation', () => {
  it('navigates to an unfocused tab', () => {
    const props = makeProps(0);
    const { getByLabelText } = render(<NyxTabBar {...props} />);
    fireEvent.press(getByLabelText('History'));
    expect(props.navigation.navigate).toHaveBeenCalledWith('history');
  });

  it('does not re-navigate to the tab already focused', () => {
    const props = makeProps(0);
    const { getByLabelText } = render(<NyxTabBar {...props} />);
    fireEvent.press(getByLabelText('Home'));
    expect(props.navigation.emit).toHaveBeenCalled();
    expect(props.navigation.navigate).not.toHaveBeenCalled();
  });

  it('honours a prevented tabPress', () => {
    const props = makeProps(0);
    props.navigation.emit.mockReturnValue({ defaultPrevented: true });
    const { getByLabelText } = render(<NyxTabBar {...props} />);
    fireEvent.press(getByLabelText('Foods'));
    expect(props.navigation.navigate).not.toHaveBeenCalled();
  });

  it('reaches the pet tab through the pet’s own name', () => {
    const props = makeProps(0);
    const { getByLabelText } = render(<NyxTabBar {...props} />);
    fireEvent.press(getByLabelText('Biscuit — pet profile'));
    expect(props.navigation.navigate).toHaveBeenCalledWith(PET_ROUTE_NAME);
  });
});
