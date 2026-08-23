import { render, fireEvent, act } from '@testing-library/react-native';
import { Image, StyleSheet, View, type TextStyle, type ViewStyle } from 'react-native';
import { NyxTabBar, type TabBarProps } from './NyxTabBar';
import { usePetStore, type Pet } from '../../store/petStore';
import { theme } from '../../constants/theme';

// PetAvatar resolves a photo URL through the Storage client; the bar's behaviour has
// nothing to do with which URL comes back, so the client stays out of the suite.
jest.mock('../../lib/storage', () => ({
  getPublicUrl: (bucket: string, path: string) => `https://cdn.test/${bucket}/${path}`,
}));

// The ladder is a function of the tab's width, so the width is pinned rather than
// inherited from whatever the test renderer defaults to. 320pt is the AC's frame.
const mockWindow = { width: 320, height: 568, scale: 2, fontScale: 1 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindow,
}));

// Structural node shapes, annotated inline — the house idiom for reaching into a
// rendered tree (see TrialCompletionSheet.test.tsx).
type StyledNode = { props: { style?: unknown } };
type TreeRoot = {
  findAll: (predicate: (node: { type: unknown }) => boolean) => unknown[];
  findAllByType: (type: unknown) => StyledNode[];
};

const isSvg = (node: { type: unknown }) =>
  typeof node.type !== 'string' && (node.type as { displayName?: string })?.displayName === 'Svg';

const styleOf = (node: StyledNode) =>
  (StyleSheet.flatten(node.props.style as TextStyle) ?? {}) as TextStyle & ViewStyle;

const viewStylesIn = (root: TreeRoot) => root.findAllByType(View).map(styleOf);

const ROUTES = [
  { key: 'index-1', name: 'index' },
  { key: 'history-1', name: 'history' },
  { key: 'foods-1', name: 'foods' },
  { key: 'profile-1', name: 'profile' },
];

const DESCRIPTORS = {
  'index-1': { options: { title: 'Home' } },
  'history-1': { options: { title: 'History' } },
  'foods-1': { options: { title: 'Foods' } },
  'profile-1': { options: { title: 'Pet' } },
};

function makePet(overrides: Partial<Pet> = {}): Pet {
  return {
    id: 'pet-1',
    name: 'Biscuit',
    species: 'dog',
    breed: null,
    date_of_birth: null,
    date_of_birth_precision: 'exact',
    sex: 'unknown',
    weight_kg: null,
    photo_path: null,
    ...overrides,
  };
}

function renderBar(focusedIndex = 0) {
  const navigation = {
    emit: jest.fn(() => ({ defaultPrevented: false })),
    navigate: jest.fn(),
  };
  const props: TabBarProps = {
    state: { routes: ROUTES, index: focusedIndex },
    descriptors: DESCRIPTORS,
    navigation,
  };
  return { navigation, ...render(<NyxTabBar {...props} />) };
}

const setActivePet = (pet: Pet | null) => act(() => usePetStore.setState({ activePet: pet }));

beforeEach(() => setActivePet(makePet()));
afterEach(() => act(() => usePetStore.getState().reset()));

describe('NyxTabBar — the four tabs', () => {
  it('renders every tab, each with a label beside its glyph', () => {
    const { getByText } = renderBar();
    ['Home', 'History', 'Foods', 'Biscuit'].forEach((label) => {
      expect(getByText(label)).toBeTruthy();
    });
  });

  it('draws three glyphs — the Pet tab is the pet, not an icon', () => {
    // The glyphs are the only <Svg> in the bar; the Pet tab renders PetAvatar
    // instead, which is why there are three and not four.
    const { UNSAFE_root } = renderBar();
    expect(UNSAFE_root.findAll(isSvg)).toHaveLength(3);
  });

  it('navigates on a press of an unfocused tab, and stays put on the focused one', () => {
    const { navigation, getByLabelText } = renderBar(0);
    fireEvent.press(getByLabelText('History'));
    expect(navigation.navigate).toHaveBeenCalledWith('history');

    navigation.navigate.mockClear();
    fireEvent.press(getByLabelText('Home'));
    expect(navigation.navigate).not.toHaveBeenCalled();
  });
});

describe('NyxTabBar — the active state', () => {
  it('inks the focused label and leaves the rest tertiary', () => {
    const { getByText } = renderBar(1);
    expect(styleOf(getByText('History')).color).toBe(theme.colorTextPrimary);
    expect(styleOf(getByText('Home')).color).toBe(theme.colorTextTertiary);
  });

  it('tints the tick only under the focused tab, without moving the row', () => {
    const { UNSAFE_root } = renderBar(2);
    const ticks = viewStylesIn(UNSAFE_root).filter(
      (style) => style.width === 4 && style.height === 4,
    );

    expect(ticks).toHaveLength(4);
    expect(ticks.filter((tick) => tick.backgroundColor === theme.colorAccent)).toHaveLength(1);
    // Every other tick keeps its footprint — the tick is hidden by colour, never by
    // being absent, so selecting a tab cannot nudge the labels above it.
    expect(ticks.filter((tick) => tick.backgroundColor === 'transparent')).toHaveLength(3);
  });

  it('rings the avatar when the Pet tab is focused, and only then', () => {
    const ringOf = (focused: number) => {
      const { UNSAFE_root } = renderBar(focused);
      const rings = viewStylesIn(UNSAFE_root).filter(
        (style) => style.borderWidth === 2 && style.borderRadius === theme.radiusFull,
      );
      expect(rings).toHaveLength(1);
      return rings[0].borderColor;
    };

    expect(ringOf(3)).toBe(theme.colorAccent);
    expect(ringOf(0)).toBe('transparent');
  });
});

describe('NyxTabBar — the Pet tab is the pet', () => {
  it('re-renders the tab when the active pet switches', () => {
    const { getByText, queryByText } = renderBar();
    expect(getByText('Biscuit')).toBeTruthy();

    setActivePet(makePet({ id: 'pet-2', name: 'Nyx' }));
    expect(getByText('Nyx')).toBeTruthy();
    expect(queryByText('Biscuit')).toBeNull();
  });

  it('renders the pet photo when there is one, and the initial disc when there is not', () => {
    setActivePet(makePet({ photo_path: 'pet-1/avatar.jpg' }));
    const { UNSAFE_root, rerender } = renderBar(3);
    const images = UNSAFE_root.findAllByType(Image);
    expect(images).toHaveLength(1);
    expect(String((images[0].props as { source: { uri: string } }).source.uri)).toContain(
      'pet-1/avatar.jpg',
    );

    setActivePet(makePet({ photo_path: null }));
    rerender(
      <NyxTabBar
        state={{ routes: ROUTES, index: 3 }}
        descriptors={DESCRIPTORS}
        navigation={{ emit: jest.fn(() => ({ defaultPrevented: false })), navigate: jest.fn() }}
      />,
    );
    expect(UNSAFE_root.findAllByType(Image)).toHaveLength(0);
    expect(UNSAFE_root.findByProps({ children: 'B' })).toBeTruthy();
  });

  it('falls back to the generic word when no pet is loaded yet', () => {
    setActivePet(null);
    const { getByText, getByLabelText } = renderBar();
    expect(getByText('Pet')).toBeTruthy();
    expect(getByLabelText('Pet')).toBeTruthy();
  });
});

describe('NyxTabBar — VoiceOver reads the whole name at every rung', () => {
  const petTabLabelOf = (name: string) => {
    setActivePet(makePet({ name }));
    return renderBar(3);
  };

  it('speaks the full name when the label shows it whole', () => {
    const { getByLabelText, getByText } = petTabLabelOf('Biscuit');
    expect(getByText('Biscuit')).toBeTruthy();
    expect(getByLabelText('Biscuit — pet profile')).toBeTruthy();
  });

  it('speaks the full name at the smaller rung', () => {
    const { getByLabelText, getByText } = petTabLabelOf('Bartholomew');
    // The visible label steps down a point; the spoken one does not change at all.
    expect(styleOf(getByText('Bartholomew')).fontSize).toBe(10);
    expect(getByLabelText('Bartholomew — pet profile')).toBeTruthy();
  });

  it('speaks the full name even when the label has fallen back to "Pet"', () => {
    // The rung the ladder exists for: the tab says "Pet", VoiceOver must not.
    const { getByLabelText, getByText } = petTabLabelOf('Schrodingers Cat');
    expect(getByText('Pet')).toBeTruthy();
    expect(getByLabelText('Schrodingers Cat — pet profile')).toBeTruthy();
  });

  it('holds the label at a fixed size under Dynamic Type', () => {
    const { getByText } = petTabLabelOf('Biscuit');
    expect(getByText('Biscuit').props.allowFontScaling).toBe(false);
    expect(getByText('Home').props.allowFontScaling).toBe(false);
  });
});
