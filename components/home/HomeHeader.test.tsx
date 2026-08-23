import { render, fireEvent, act } from '@testing-library/react-native';
import { HomeHeader, HOME_HEADER_CONTENT_HEIGHT } from './HomeHeader';
import { usePetStore, type Pet } from '../../store/petStore';
import { useAuthStore } from '../../store/authStore';
import { theme } from '../../constants/theme';
import {
  ASK_BORDER,
  ASK_DOT_GAP,
  ASK_DOT_SIZE,
  ASK_PADDING_X,
  ASK_PILL_LABEL,
  HEADER_AVATAR_SIZE,
  HEADER_NAME_RUNGS,
} from '../../lib/headerName';

// The Home header, H2a (CUL-600 / app-polish spec §2 DP-2, rulings D3 + D4).
//
// The ladder's arithmetic is pinned in lib/headerName.test.ts; this suite pins what
// the HEADER does with it — that the row is one row and the pet's photo leads it,
// that everything D3/D4 removed is actually gone, that the switcher opens from the
// whole left cluster at the 44pt floor, and that a single-pet household sees no
// multi-pet chrome.

jest.mock('../../lib/storage', () => ({
  getPublicUrl: (bucket: string, path: string) => `https://example.test/${bucket}/${path}`,
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));

// The switcher sheet reads Supabase on open; this suite is about the header that
// summons it, not the sheet, so it is stood in for by a marker that records only
// whether it was asked to be visible.
jest.mock('../pet/PetSwitcherSheet', () => ({
  PetSwitcherSheet: ({ visible }: { visible: boolean }) =>
    visible ? require('react').createElement('PetSwitcherSheetOpen') : null,
}));

// `mock`-prefixed so babel-plugin-jest-hoist allows the closure over it.
let mockAskEnabled = true;
jest.mock('../../hooks/useAppConfig', () => ({
  useAllowlistFlag: () => mockAskEnabled,
}));

// jest-expo's default window is 750pt — a frame no supported phone has, on which
// every name fits at the top rung and the ladder never engages. Every assertion that
// turns on width states its own (the CUL-599 lesson: six assertions once passed
// vacuously on that 750pt frame).
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(() => ({ width: 320, height: 568, scale: 2, fontScale: 1 })),
}));
const mockedUseWindowDimensions =
  require('react-native/Libraries/Utilities/useWindowDimensions').default as jest.Mock;

/** 320pt — the narrowest supported frame (iPhone SE 1st gen). */
const NARROWEST = 320;

function setWindowWidth(width: number) {
  mockedUseWindowDimensions.mockReturnValue({ width, height: 568, scale: 2, fontScale: 1 });
}

const pet = (over: Partial<Pet> = {}): Pet =>
  ({ id: 'pet-a', name: 'Biscuit', photo_path: 'pet-a/photo.jpg', ...over }) as Pet;

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

function allText(node: any): string[] {
  return collect(node, 'Text')
    .flatMap((n) => n.children ?? [])
    .filter((c): c is string => typeof c === 'string');
}

beforeEach(() => {
  mockAskEnabled = true;
  setWindowWidth(NARROWEST);
  useAuthStore.setState({ user: { email: 'dan@example.test' } } as never);
  usePetStore.setState({ pets: [pet()], activePet: pet() } as never);
});

describe('one row, and the pet leads it (D3)', () => {
  it('renders the pet name and the pet photo', () => {
    const { getByText, toJSON } = render(<HomeHeader />);
    getByText('Biscuit');
    const images = collect(toJSON(), 'Image');
    expect(images).toHaveLength(1);
    expect(images[0].props.source.uri).toContain('pet-a/photo.jpg');
    expect(images[0].props.style).toEqual(
      expect.objectContaining({ width: HEADER_AVATAR_SIZE, height: HEADER_AVATAR_SIZE }),
    );
  });

  it('is shorter than the two-row header it replaces by more than the ruled 40pt', () => {
    // The AC: "header height shrinks >= 40pt vs today (Signal rises accordingly)".
    // The old header measured 10 + 32 (owner avatar) + 8 + 44 + 12 = 106pt below the
    // inset by the same arithmetic; asserting the constant is how that stays true
    // when a padding moves, since the constant is derived from its parts.
    const PREVIOUS_CONTENT_HEIGHT = 106;
    expect(PREVIOUS_CONTENT_HEIGHT - HOME_HEADER_CONTENT_HEIGHT).toBeGreaterThanOrEqual(40);
  });

  it('bleeds the surface up behind the status bar rather than leaving a grey strip', () => {
    const { toJSON } = render(<HomeHeader />);
    const container = toJSON() as any;
    const style = Object.assign({}, ...[container.props.style].flat(2).filter(Boolean));
    expect(style.paddingTop).toBeGreaterThan(47);
    expect(style.backgroundColor).toBe(theme.colorSurface);
  });

  it('renders nothing at all before a pet is loaded', () => {
    usePetStore.setState({ pets: [], activePet: null } as never);
    expect(render(<HomeHeader />).toJSON()).toBeNull();
  });
});

describe('what D3/D4 removed stays removed', () => {
  it('renders no wordmark and no brand mark', () => {
    const { toJSON, queryByText } = render(<HomeHeader />);
    expect(queryByText('Culprit')).toBeNull();
    // The mark is an SVG; the header should now contain no vector chrome except the
    // multi-pet chevron, which is a lucide icon and renders as RNSVGSvgView too — so
    // this asserts against the single-pet frame, where there is no chevron either.
    expect(collect(toJSON(), 'RNSVGSvgView')).toHaveLength(0);
  });

  it('renders no "new signal" dot, pulse, or any looping animation in chrome', () => {
    // D4 is a standing rule, not a one-off deletion: "no looping animation in app
    // chrome, ever". Nothing in this tree may be an Animated view.
    const { toJSON } = render(<HomeHeader />);
    const json = JSON.stringify(toJSON());
    expect(json).not.toContain('AnimatedComponent');
    expect(json.toLowerCase()).not.toContain('opacityanimation');
  });

  it('renders no breed / age identity line — that lives on the Pet tab now', () => {
    usePetStore.setState({
      pets: [pet({ species: 'dog', breed: 'Beagle', birthdate: '2019-04-02' } as never)],
      activePet: pet({ species: 'dog', breed: 'Beagle', birthdate: '2019-04-02' } as never),
    } as never);
    const text = allText(render(<HomeHeader />).toJSON());
    expect(text.some((t) => t.includes('Beagle'))).toBe(false);
    // Exactly three strings survive on the row, in order: the pet's name, the Ask
    // pill's word, and the owner monogram. Asserted as the whole set rather than as
    // an absence, so a future addition to this row has to be a deliberate edit here.
    expect(text).toEqual(['Biscuit', 'Ask', 'D']);
  });

  it('takes no onPressMark — the jump-to-Signal tap retired with the mark', () => {
    // The SHOULD that replaces it (Home-tab re-tap scrolls to top) lives on the
    // screen, not here. What this pins is that the header exposes no prop for it, so
    // a caller cannot quietly re-add a second door to the same behaviour.
    expect(HomeHeader.length).toBe(0);
  });
});

describe('the switcher (multi-pet chrome appears only for multi-pet households)', () => {
  it('opens the sheet from the whole left cluster', () => {
    const { getByLabelText, toJSON } = render(<HomeHeader />);
    expect(collect(toJSON(), 'PetSwitcherSheetOpen')).toHaveLength(0);
    fireEvent.press(getByLabelText('Biscuit — your pets'));
    expect(collect(toJSON(), 'PetSwitcherSheetOpen')).toHaveLength(1);
  });

  it('gives the cluster the 44pt tap floor, which the 30pt photo alone would undershoot', () => {
    const { getByLabelText } = render(<HomeHeader />);
    const style = Object.assign(
      {},
      ...[getByLabelText('Biscuit — your pets').props.style].flat(2).filter(Boolean),
    );
    expect(style.minHeight).toBe(44);
  });

  it('shows no chevron for a one-pet household, but keeps the row tappable', () => {
    const { getByLabelText, toJSON } = render(<HomeHeader />);
    expect(collect(toJSON(), 'RNSVGSvgView')).toHaveLength(0);
    // Still a button: the sheet is also the only "Add a pet" door.
    expect(getByLabelText('Biscuit — your pets').props.accessibilityRole).toBe('button');
  });

  it('shows the chevron and names the active pet once there is a choice to make', () => {
    usePetStore.setState({
      pets: [pet(), pet({ id: 'pet-b', name: 'Mochi' })],
      activePet: pet(),
    } as never);
    const { getByLabelText, toJSON } = render(<HomeHeader />);
    expect(collect(toJSON(), 'RNSVGSvgView').length).toBeGreaterThan(0);
    getByLabelText('Switch pet — Biscuit active');
  });

  it('re-titles on a pet switch', () => {
    usePetStore.setState({
      pets: [pet(), pet({ id: 'pet-b', name: 'Mochi' })],
      activePet: pet(),
    } as never);
    const { getByText, queryByText } = render(<HomeHeader />);
    getByText('Biscuit');
    act(() => {
      usePetStore.setState({ activePet: pet({ id: 'pet-b', name: 'Mochi' }) } as never);
    });
    getByText('Mochi');
    expect(queryByText('Biscuit')).toBeNull();
  });
});

describe('the name ladder, as the header renders it', () => {
  function renderedName(name: string) {
    usePetStore.setState({ pets: [pet({ name }), pet({ id: 'pet-b' })], activePet: pet({ name }) } as never);
    const node = collect(render(<HomeHeader />).toJSON(), 'Text').find((n) =>
      (n.children ?? []).includes(name),
    );
    return Object.assign({}, ...[node.props.style].flat(2).filter(Boolean));
  }

  it('renders an ordinary name at the top rung on the narrowest phone', () => {
    expect(renderedName('Biscuit').fontSize).toBe(HEADER_NAME_RUNGS[0]);
  });

  it('drops to the tight rung rather than tailing a name that just overruns', () => {
    expect(renderedName('Captain Nibbles').fontSize).toBe(HEADER_NAME_RUNGS[1]);
  });

  it('tails at the tight rung, never back up at 17pt', () => {
    const style = renderedName('Willowbrook Fitzgerald');
    expect(style.fontSize).toBe(HEADER_NAME_RUNGS[1]);
  });

  it('always sets a single line with a TAIL ellipsis, so the name is cut at the end', () => {
    usePetStore.setState({ pets: [pet()], activePet: pet() } as never);
    const node = collect(render(<HomeHeader />).toJSON(), 'Text').find((n) =>
      (n.children ?? []).includes('Biscuit'),
    );
    expect(node.props.numberOfLines).toBe(1);
    expect(node.props.ellipsizeMode).toBe('tail');
  });

  it('lets the name scale with Dynamic Type — the opposite call from the tab bar', () => {
    // The tab pins its labels because a scaled label would overflow a box that cannot
    // grow. This row grows and its floor is already a tail, so scaling degrades the
    // way the ruling says it should; the name is the one thing here an owner may
    // genuinely need larger.
    usePetStore.setState({ pets: [pet()], activePet: pet() } as never);
    const node = collect(render(<HomeHeader />).toJSON(), 'Text').find((n) =>
      (n.children ?? []).includes('Biscuit'),
    );
    expect(node.props.allowFontScaling).not.toBe(false);
  });

  it('renders the whole name at a wider frame that the narrow one had to tail', () => {
    setWindowWidth(430);
    expect(renderedName('Schrodingers Cat').fontSize).toBe(HEADER_NAME_RUNGS[0]);
  });

  it('speaks the full name to VoiceOver at the rung that tails it', () => {
    usePetStore.setState({
      pets: [pet({ name: 'Willowbrook Fitzgerald' })],
      activePet: pet({ name: 'Willowbrook Fitzgerald' }),
    } as never);
    render(<HomeHeader />).getByLabelText('Willowbrook Fitzgerald — your pets');
  });
});

describe('the right cluster is unchanged (B-228 D5 placement)', () => {
  it('renders the Ask pill when the flag resolves on, naming the pet', () => {
    const { getByLabelText } = render(<HomeHeader />);
    getByLabelText('Ask about Biscuit');
  });

  it('renders no Ask pill when the flag is off, and gives the name the room back', () => {
    mockAskEnabled = false;
    const { queryByLabelText } = render(<HomeHeader />);
    expect(queryByLabelText('Ask about Biscuit')).toBeNull();
  });

  it('keeps the owner-avatar doorway into You', () => {
    const { getByLabelText } = render(<HomeHeader />);
    getByLabelText('You — account and settings');
  });

  it('renders the pill from the very constants its width budget subtracts', () => {
    // The name is sized against `askPillWidth()`, which is built from these five
    // values. If the pill RENDERS different numbers, the name is being fitted around
    // a pill that does not exist — and it would be correct only by coincidence, which
    // is how CUL-599 ended up with a budget protected by a padding the tab never
    // drew. This is the assertion that makes it correct by construction.
    const { getByLabelText, toJSON } = render(<HomeHeader />);
    const pill = Object.assign(
      {},
      ...[getByLabelText('Ask about Biscuit').props.style].flat(2).filter(Boolean),
    );
    expect(pill.gap).toBe(ASK_DOT_GAP);
    expect(pill.borderWidth).toBe(ASK_BORDER);
    expect(pill.paddingHorizontal).toBe(ASK_PADDING_X);

    const dot = collect(toJSON(), 'View')
      .map((n) => Object.assign({}, ...[n.props.style].flat(2).filter(Boolean)))
      .find((st) => st.backgroundColor === theme.colorAccent);
    expect(dot.width).toBe(ASK_DOT_SIZE);
    expect(dot.height).toBe(ASK_DOT_SIZE);

    // The label too: its width is estimated from this exact string.
    expect(allText(toJSON())).toContain(ASK_PILL_LABEL);
  });
});
