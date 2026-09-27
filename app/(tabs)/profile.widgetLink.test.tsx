// The widget's trial taps land on the WIDGET's pet and on its trial card (CUL-1292).
//
// The widget sends `nyx:///profile?pet=<id>&src=widget` from its trial dot band and its
// trial fact tile (`widgets/CulpritWidget.tsx`, frozen, H-7). The Pet tab read neither
// parameter, so Mochi's widget opened Pixel's profile, at the top. This suite drives the
// REAL `useWidgetPetLink` over the REAL pet store with two pets, from the widget's exact URL
// — `profile.focus.test.tsx` stubs the store to one pet and cannot see a switch at all.
import type { ReactElement } from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';

const mockParams: Record<string, string> = {};

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    router: { push: jest.fn() },
    useLocalSearchParams: () => mockParams,
    // expo-router re-runs a focus effect when its callback changes while the screen is
    // focused, which is how the medications card reloads after a pet switch. The sibling
    // suite runs it once; this one needs the switch.
    useFocusEffect: (cb: () => void | (() => void)) => {
      React.useEffect(() => cb(), [cb]);
    },
  };
});
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
  MediaTypeOptions: { Images: 'Images' },
}));

// Table-aware, unlike `profile.test.tsx`'s single empty chain: this suite needs
// real regimen rows, because row-level targeting is the whole point of the fix.
const mockTables: Record<string, unknown[]> = {};
jest.mock('../../lib/supabase', () => {
  const make = (table: string) => {
    const result = Promise.resolve({ data: mockTables[table] ?? [], error: null });
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'is', 'in', 'or', 'order', 'limit', 'gte', 'lte', 'neq']) {
      chain[m] = jest.fn(() => chain);
    }
    Object.assign(chain, { then: result.then.bind(result), catch: result.catch.bind(result) });
    return chain;
  };
  return {
    supabase: {
      from: jest.fn((table: string) => make(table)),
      auth: { getUser: jest.fn(() => Promise.resolve({ data: { user: { id: 'u1' } } })) },
    },
  };
});
jest.mock('../../lib/storage', () => ({
  uploadPhoto: jest.fn(),
  compressForUpload: jest.fn(),
  getPublicUrl: () => 'https://example.test/photo.jpg',
  getSignedUrls: jest.fn(() => Promise.resolve(new Map())),
}));

jest.mock('../../components/vetfiles/VetFilesCard', () => ({ VetFilesCard: () => null }));
// Forwards the anchor like the DietTrialCard stub below; `WeightTrendCard.test.tsx`
// asserts the real card lands it on its own Card (CUL-753).
jest.mock('../../components/profile/WeightTrendCard', () => {
  const { View } = require('react-native');
  return {
    WeightTrendCard: ({ onLayout }: { onLayout?: (e: unknown) => void }) => (
      <View testID="weight-anchor" onLayout={onLayout} />
    ),
  };
});
jest.mock('../../components/profile/EditPetModal', () => ({ EditPetModal: () => null }));
jest.mock('../../components/profile/AddConditionModal', () => ({ AddConditionModal: () => null }));
jest.mock('../../components/profile/AddMedicationModal', () => ({ AddMedicationModal: () => null }));
// Records each render's `visible`, so the start-form hand-off (TS-4) can count opens.
const mockStartTrialVisible: boolean[] = [];
let mockCloseStartTrial: (() => void) | null = null;
jest.mock('../../components/profile/StartTrialModal', () => ({
  StartTrialModal: ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
    mockStartTrialVisible.push(visible);
    mockCloseStartTrial = onClose;
    return null;
  },
}));
jest.mock('../../components/profile/ArchivePetSheet', () => ({ ArchivePetSheet: () => null }));
jest.mock('../../components/profile/TrialCompletionSheet', () => ({ TrialCompletionSheet: () => null }));
jest.mock('../../components/profile/PastMedicationsSection', () => ({ PastMedicationsSection: () => null }));

// A stub that FORWARDS the anchor, so this file asserts the screen's wiring while
// `DietTrialCard.test.tsx` asserts that the real card lands it on its own Card.
jest.mock('../../components/profile/DietTrialCard', () => {
  const { View } = require('react-native');
  return {
    DietTrialCard: ({ onLayout }: { onLayout?: (e: unknown) => void }) => (
      <View testID="trial-anchor" onLayout={onLayout} />
    ),
  };
});
jest.mock('../../lib/dietTrialCard', () => ({ resolveTrialCard: () => ({ kicker: 'Diet trial' }) }));

// Keyed by pet like the real loader (B-789): `inputIsForPet` is true only once the
// read for the pet on screen has answered. The test says which pet that is.
let mockTrialLoadedFor: string | null = null;
// TS-6: the input the loader hands over. `{ trial: null }` is "no trial"; the TS-6 suite sets
// a running one so the door has something to open.
let mockTrialInput: { trial: unknown } = { trial: null };
// TS-6: the flag, off unless a test says otherwise, so every suite above runs flag-off.
let mockTrialScreenLive = false;
jest.mock('../../hooks/useTrialScreen', () => ({ useTrialScreen: () => mockTrialScreenLive }));
// TS-6: the row's model is `lib/trialDoorRow.test.ts`'s business; here it only has to exist
// exactly when there is a trial. A jest.fn so flag-off can assert it was never asked.
const mockBuildTrialDoorRow = jest.fn((input: { trial: unknown } | null) =>
  input?.trial
    ? {
        eyebrow: 'Diet trial',
        title: 'Rabbit trial · day 23 of 56',
        alert: null,
        progressFraction: 0.4,
        subline: 'Royal Canin Rabbit · ends Oct 29',
        accessibilityLabel: 'Rabbit trial · day 23 of 56. Royal Canin Rabbit · ends Oct 29. Open the diet trial.',
      }
    : null,
);
jest.mock('../../lib/trialDoorRow', () => ({
  buildTrialDoorRow: (input: { trial: unknown } | null) => mockBuildTrialDoorRow(input),
}));
jest.mock('../../hooks/useDietTrial', () => {
  const { usePetStore: store } = jest.requireActual('../../store/petStore');
  // Stable, like the real hook's `useCallback`: the focus effect lists it as a dependency.
  const reload = jest.fn();
  return {
    useDietTrial: () => {
      const activeId = store((s: { activePet: { id: string } | null }) => s.activePet?.id ?? null);
      return {
        input: mockTrialInput,
        isLoading: false,
        reload,
        inputIsForPet: activeId !== null && activeId === mockTrialLoadedFor,
      };
    },
  };
});
jest.mock('../../hooks/useTrialAllowedSet', () => ({ useTrialAllowedSet: () => ({ status: 'unknown' }) }));
jest.mock('../../hooks/useWidgetSlotLabel', () => ({ useWidgetSlotLabel: () => null }));

let mockReducedMotion = false;
jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => mockReducedMotion }));
jest.mock('../../lib/vetFilesEntry', () => ({ VET_FILES_ENTRY_ENABLED: false }));
jest.mock('../../lib/vetDocumentLibrary', () => ({
  readVetLibrary: jest.fn(() => Promise.resolve([])),
  buildVetFilesCardModel: () => ({}),
  VET_DOCUMENT_SIGNED_URL_TTL_SEC: 60,
}));
jest.mock('../../store/momentStore', () => {
  const state = { removedEventId: null, showMedication: jest.fn() };
  return {
    useMomentStore: Object.assign(
      (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state),
      { getState: () => state },
    ),
  };
});
jest.mock('../../store/authStore', () => {
  const state = { user: { id: 'u1', email: 'd@example.test' } };
  return {
    useAuthStore: Object.assign(
      (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state),
      { getState: () => state },
    ),
  };
});

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { ScrollView } from 'react-native';
import { router } from 'expo-router';
import ProfileScreen from './profile';
import { PROFILE_FOCUS_INSET, profileStartTrialHref } from '../../lib/profileFocus';
import { usePetStore, type Pet } from '../../store/petStore';
import { clearSpentTaps } from '../../lib/spentTaps';

function makePet(id: string, name: string): Pet {
  return {
    id, name, species: 'cat', breed: null, date_of_birth: null,
    date_of_birth_precision: 'exact', sex: 'unknown', weight_kg: null, photo_path: null,
  };
}
const PIXEL = makePet('pet-pixel', 'Pixel');
const MOCHI = makePet('pet-mochi', 'Mochi');

// The link exactly as the widget builds it (`petLink('profile')`), read the way expo-router
// hands a deep link's query to the screen.
const WIDGET_TRIAL_URL = `nyx:///profile?pet=${MOCHI.id}&src=widget`;
function paramsOf(url: string): Record<string, string> {
  return Object.fromEntries(new URL(url).searchParams.entries());
}
function setParams(next: Record<string, string>) {
  for (const k of Object.keys(mockParams)) delete mockParams[k];
  Object.assign(mockParams, next);
}

function layout(node: unknown, y: number) {
  fireEvent(node as never, 'layout', { nativeEvent: { layout: { x: 0, y, width: 320, height: 80 } } });
}
const active = () => usePetStore.getState().activePet?.id ?? null;
const PIXEL_TRIAL_Y = 400;
const MOCHI_TRIAL_Y = 700;

/** The Pet tab already mounted on Pixel, every read answered and the trial card measured:
 *  the common case, since a tab stays mounted. */
async function mountSettledOnPixel() {
  mockTrialLoadedFor = PIXEL.id;
  const scrollTo = jest.fn();
  const tree = render(<ProfileScreen />);
  await waitFor(() => expect(tree.queryByTestId('med-section')).not.toBeNull());
  await act(async () => {});
  tree.UNSAFE_getByType(ScrollView).instance.scrollTo = scrollTo;
  act(() => layout(tree.getByTestId('trial-anchor'), PIXEL_TRIAL_Y));
  return { ...tree, scrollTo };
}

/** The widget tap arrives on the mounted tab. */
async function tapWidget(tree: { rerender: (el: ReactElement) => void }, url = WIDGET_TRIAL_URL) {
  setParams(paramsOf(url));
  tree.rerender(<ProfileScreen />);
  await act(async () => {});
}

/** Mochi's trial read answers and the card lays out where Mochi's content puts it. */
async function mochiTrialLands(tree: { rerender: (el: ReactElement) => void; getByTestId: (id: string) => unknown }) {
  mockTrialLoadedFor = MOCHI.id;
  tree.rerender(<ProfileScreen />);
  await act(async () => {});
  act(() => layout(tree.getByTestId('trial-anchor'), MOCHI_TRIAL_Y));
}

beforeEach(() => {
  jest.clearAllMocks();
  clearSpentTaps();
  mockStartTrialVisible.length = 0;
  mockTrialLoadedFor = null;
  mockTrialInput = { trial: null };
  mockTrialScreenLive = false;
  mockReducedMotion = false;
  mockTables.medications = [];
  mockTables.medication_administrations = [];
  mockTables.conditions = [];
  setParams({});
  usePetStore.setState({ pets: [PIXEL, MOCHI], activePet: PIXEL });
});

describe('the sender', () => {
  it('is the link this suite drives: both trial senders, pet + src=widget, no focus, no nonce', () => {
    // If CUL-1302 re-points these senders at the trial screen, this reds and the suite
    // moves with them.
    const widget = readFileSync(join(__dirname, '../../widgets/CulpritWidget.tsx'), 'utf8');
    expect(widget.match(/petLink\('profile'\)/g)).toHaveLength(2);
    expect(widget).toContain("'pet=' + panel.petId + '&'");
    expect(widget).toContain("'src=widget'");
    expect(paramsOf(WIDGET_TRIAL_URL)).toEqual({ pet: MOCHI.id, src: 'widget' });
  });
});

describe('a widget trial tap (CUL-1292)', () => {
  it('opens the widget’s pet, not the active one', async () => {
    const tree = await mountSettledOnPixel();
    await tapWidget(tree);
    expect(active()).toBe(MOCHI.id);
  });

  it('lands on that pet’s trial card, and never on the previous pet’s layout', async () => {
    // The race: the switch lands in the tap's own flush, while every read on screen is
    // still Pixel's and "settled". Landing then scrolls to Pixel's card position.
    const tree = await mountSettledOnPixel();
    await tapWidget(tree);
    expect(tree.scrollTo).not.toHaveBeenCalled();

    await mochiTrialLands(tree);
    expect(tree.scrollTo).toHaveBeenCalledTimes(1);
    expect(tree.scrollTo).toHaveBeenCalledWith({ y: MOCHI_TRIAL_Y - PROFILE_FOCUS_INSET, animated: true });
  });

  it('does not land before the new pet’s reads have answered', async () => {
    // A position reported for Mochi while Mochi's reads are still out (here, the trial's) is
    // one the screen is about to move. The real card is not drawn while its own read is out,
    // so this stands for the sections around it; the stub draws it to put a Mochi-tagged
    // position in front of the gate, which is the only thing this case asserts.
    const tree = await mountSettledOnPixel();
    await tapWidget(tree);
    act(() => layout(tree.getByTestId('trial-anchor'), MOCHI_TRIAL_Y - 50));
    expect(tree.scrollTo).not.toHaveBeenCalled();
  });

  it('fires once, then leaves the owner alone', async () => {
    const tree = await mountSettledOnPixel();
    await tapWidget(tree);
    await mochiTrialLands(tree);
    act(() => layout(tree.getByTestId('trial-anchor'), MOCHI_TRIAL_Y + 50));
    expect(tree.scrollTo).toHaveBeenCalledTimes(1);
  });

  it('lands on the active pet’s card when the widget’s pet is already on screen', async () => {
    usePetStore.setState({ activePet: MOCHI });
    mockTrialLoadedFor = MOCHI.id;
    setParams(paramsOf(WIDGET_TRIAL_URL));
    const scrollTo = jest.fn();
    const tree = render(<ProfileScreen />);
    await waitFor(() => expect(tree.queryByTestId('med-section')).not.toBeNull());
    await act(async () => {});
    tree.UNSAFE_getByType(ScrollView).instance.scrollTo = scrollTo;
    act(() => layout(tree.getByTestId('trial-anchor'), MOCHI_TRIAL_Y));
    expect(scrollTo).toHaveBeenCalledWith({ y: MOCHI_TRIAL_Y - PROFILE_FOCUS_INSET, animated: true });
  });

  it('a pet the account no longer has: no switch, no scroll onto the wrong animal', async () => {
    const tree = await mountSettledOnPixel();
    await tapWidget(tree, 'nyx:///profile?pet=pet-archived&src=widget');
    act(() => layout(tree.getByTestId('trial-anchor'), PIXEL_TRIAL_Y + 10));
    expect(active()).toBe(PIXEL.id);
    expect(tree.scrollTo).not.toHaveBeenCalled();
  });

  it('the owner switches away before it lands: dropped, never landed late', async () => {
    const tree = await mountSettledOnPixel();
    await tapWidget(tree);
    expect(active()).toBe(MOCHI.id);

    act(() => usePetStore.getState().selectPet(PIXEL.id));
    tree.rerender(<ProfileScreen />);
    await act(async () => {});
    act(() => layout(tree.getByTestId('trial-anchor'), PIXEL_TRIAL_Y + 10));
    expect(active()).toBe(PIXEL.id);
    expect(tree.scrollTo).not.toHaveBeenCalled();

    // And back to Mochi from the app, minutes later: the old tap must not wake up and
    // scroll an owner who is now doing something else.
    act(() => usePetStore.getState().selectPet(MOCHI.id));
    await mochiTrialLands(tree);
    expect(tree.scrollTo).not.toHaveBeenCalled();
  });

  it('a cold start: waits for the pet list, then switches and lands', async () => {
    usePetStore.setState({ pets: [], activePet: null });
    setParams(paramsOf(WIDGET_TRIAL_URL));
    const scrollTo = jest.fn();
    const tree = render(<ProfileScreen />);
    await act(async () => {});

    act(() => usePetStore.getState().setPets([PIXEL, MOCHI], PIXEL.id));
    await waitFor(() => expect(tree.queryByTestId('med-section')).not.toBeNull());
    await act(async () => {});
    expect(active()).toBe(MOCHI.id);
    tree.UNSAFE_getByType(ScrollView).instance.scrollTo = scrollTo;

    await mochiTrialLands(tree);
    expect(scrollTo).toHaveBeenCalledWith({ y: MOCHI_TRIAL_Y - PROFILE_FOCUS_INSET, animated: true });
  });
});

describe('what it leaves alone', () => {
  it('an in-app trial door still lands on the pet on screen, with no switch', async () => {
    const tree = await mountSettledOnPixel();
    setParams({ focus: 'trial', ts: '1' });
    tree.rerender(<ProfileScreen />);
    await waitFor(() => expect(tree.scrollTo).toHaveBeenCalledTimes(1));
    expect(tree.scrollTo).toHaveBeenCalledWith({ y: PIXEL_TRIAL_Y - PROFILE_FOCUS_INSET, animated: true });
    expect(active()).toBe(PIXEL.id);
  });

  it('a plain visit neither switches nor scrolls', async () => {
    const tree = await mountSettledOnPixel();
    expect(active()).toBe(PIXEL.id);
    expect(tree.scrollTo).not.toHaveBeenCalled();
  });
});

// ── TS-4 (CUL-1300) — the trial screen's Replace / Start hand-off ─────────────────────
//
// The trial screen cannot present `StartTrialModal` (it stays mounted here, B-535), so it
// sends `?pet=<id>&open=start_trial&ts=<nonce>` (`profileStartTrialHref`). The form must
// open once, over the NAMED pet, and only once that pet's trial read has answered here.
describe('the trial screen’s start-form hand-off (TS-4)', () => {
  /** Rising edges of the form's `visible`: how many times it opened. */
  const opens = () =>
    mockStartTrialVisible.filter((v, i) => v && !(mockStartTrialVisible[i - 1] ?? false)).length;

  async function handOff(tree: { rerender: (el: ReactElement) => void }, petId: string, ts = '1') {
    setParams(profileStartTrialHref({ petId, nowMs: Number(ts) }).params);
    tree.rerender(<ProfileScreen />);
    await act(async () => {});
  }

  it('switches to the named pet and opens the form once, after that pet’s read has answered', async () => {
    const tree = await mountSettledOnPixel();
    await handOff(tree, MOCHI.id);
    expect(active()).toBe(MOCHI.id);
    // Mochi's trial read has not answered: the form would open over Pixel's card.
    expect(opens()).toBe(0);
    await mochiTrialLands(tree);
    expect(opens()).toBe(1);
    // A re-render with the same link is not a second request.
    tree.rerender(<ProfileScreen />);
    await act(async () => {});
    expect(opens()).toBe(1);
  });

  it('opens once for the pet already on screen', async () => {
    const tree = await mountSettledOnPixel();
    await handOff(tree, PIXEL.id);
    expect(active()).toBe(PIXEL.id);
    expect(opens()).toBe(1);
  });

  it('drops a request for a pet the account no longer has', async () => {
    const tree = await mountSettledOnPixel();
    await handOff(tree, 'pet-gone');
    expect(active()).toBe(PIXEL.id);
    expect(opens()).toBe(0);
  });

  it('a closed form stays closed; a second tap is a second request', async () => {
    const tree = await mountSettledOnPixel();
    await handOff(tree, PIXEL.id, '1');
    expect(opens()).toBe(1);
    act(() => mockCloseStartTrial!());
    expect(mockStartTrialVisible.at(-1)).toBe(false);
    // The same link re-rendered is not a request (the nonce was spent).
    tree.rerender(<ProfileScreen />);
    await act(async () => {});
    expect(opens()).toBe(1);
    await handOff(tree, PIXEL.id, '2');
    expect(opens()).toBe(2);
  });
});

// ── TS-6 (CUL-1302) — under `trial_screen`, the Pet tab keeps a door ──────────────────
//
// Spec §5.2 / §5.3 / S8: while a trial runs or is in its grace, the trial's slot is one row
// that opens `/trial/{pet}`; with no trial the start card stays; a widget trial tap forwards
// to the screen once the switch to its pet has landed. Flag-off, all of it is today's tree.
describe('the Pet tab’s door to the trial screen (TS-6)', () => {
  const RUNNING = { trial: { id: 't-1', status: 'active' } };

  async function mountOnPixel() {
    mockTrialLoadedFor = PIXEL.id;
    const scrollTo = jest.fn();
    const tree = render(<ProfileScreen />);
    await waitFor(() => expect(tree.queryByTestId('med-section')).not.toBeNull());
    await act(async () => {});
    tree.UNSAFE_getByType(ScrollView).instance.scrollTo = scrollTo;
    return { ...tree, scrollTo };
  }

  it('a running trial: the door and never the card, opening this pet’s screen', async () => {
    mockTrialScreenLive = true;
    mockTrialInput = RUNNING;
    const tree = await mountOnPixel();
    expect(tree.queryByTestId('trial-anchor')).toBeNull();
    const door = tree.getByTestId('trial-door-row');
    expect(door.props.accessibilityRole).toBe('button');
    expect(tree.getByText('Rabbit trial · day 23 of 56')).toBeTruthy();
    fireEvent.press(door);
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith('/trial/pet-pixel');
  });

  it('no trial: the start card, unchanged', async () => {
    mockTrialScreenLive = true;
    const tree = await mountOnPixel();
    expect(tree.getByTestId('trial-anchor')).toBeTruthy();
    expect(tree.queryByTestId('trial-door-row')).toBeNull();
  });

  it('flag off over a trial read that answers: the card, and the door is never built', async () => {
    // The async half the flag-off guard cannot see (C-41): the read answered with a trial,
    // so a door had something to leak.
    mockTrialInput = RUNNING;
    const tree = await mountOnPixel();
    expect(tree.getByTestId('trial-anchor')).toBeTruthy();
    expect(tree.queryByTestId('trial-door-row')).toBeNull();
    expect(mockBuildTrialDoorRow).not.toHaveBeenCalled();
  });

  it('while the read is still the previous pet’s: neither the door nor the card', async () => {
    mockTrialScreenLive = true;
    mockTrialInput = RUNNING;
    const tree = await mountOnPixel();
    act(() => usePetStore.getState().selectPet(MOCHI.id));
    tree.rerender(<ProfileScreen />);
    await act(async () => {});
    expect(tree.queryByTestId('trial-door-row')).toBeNull();
    expect(tree.queryByTestId('trial-anchor')).toBeNull();
  });

  it('a widget trial tap forwards once to the widget pet’s screen, and never scrolls', async () => {
    mockTrialScreenLive = true;
    mockTrialInput = RUNNING;
    const tree = await mountOnPixel();
    await tapWidget(tree);
    expect(active()).toBe(MOCHI.id);
    // The screen reads its pet from the route: no wait on this tab's reads for Mochi.
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith('/trial/pet-mochi');
    await mochiReadAnswers(tree);
    tree.rerender(<ProfileScreen />);
    await act(async () => {});
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(tree.scrollTo).not.toHaveBeenCalled();
  });

  it('a widget tap for a pet the account no longer has: no switch, no forward', async () => {
    mockTrialScreenLive = true;
    mockTrialInput = RUNNING;
    const tree = await mountOnPixel();
    await tapWidget(tree, 'nyx:///profile?pet=pet-archived&src=widget');
    expect(active()).toBe(PIXEL.id);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('an in-app trial door lands on the door row (a leftover focus=trial link)', async () => {
    mockTrialScreenLive = true;
    mockTrialInput = RUNNING;
    const tree = await mountOnPixel();
    act(() => layout(tree.getByTestId('trial-door-row'), PIXEL_TRIAL_Y));
    setParams({ focus: 'trial', ts: '1' });
    tree.rerender(<ProfileScreen />);
    await waitFor(() => expect(tree.scrollTo).toHaveBeenCalledTimes(1));
    expect(tree.scrollTo).toHaveBeenCalledWith({ y: PIXEL_TRIAL_Y - PROFILE_FOCUS_INSET, animated: true });
    expect(router.push).not.toHaveBeenCalled();
  });

  it('Replace / Start from the screen opens the start form here exactly once', async () => {
    mockTrialScreenLive = true;
    mockTrialInput = RUNNING;
    const tree = await mountOnPixel();
    setParams(profileStartTrialHref({ petId: PIXEL.id, nowMs: 1 }).params);
    tree.rerender(<ProfileScreen />);
    await act(async () => {});
    tree.rerender(<ProfileScreen />);
    await act(async () => {});
    const opens = mockStartTrialVisible.filter((v, i) => v && !(mockStartTrialVisible[i - 1] ?? false)).length;
    expect(opens).toBe(1);
  });

  /** Mochi's read answers (the door row is what lays out under the flag). */
  async function mochiReadAnswers(tree: { rerender: (el: ReactElement) => void }) {
    mockTrialLoadedFor = MOCHI.id;
    tree.rerender(<ProfileScreen />);
    await act(async () => {});
  }
});
