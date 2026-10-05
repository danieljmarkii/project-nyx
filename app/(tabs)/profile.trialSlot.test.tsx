// The Pet tab's trial SLOT (B-417 §4.2; TS-6, every account since TS-GA · CUL-1307).
//
// The slot is one of three things: the retry when the trial read failed (CUL-1458), the
// one-row door to the trial's own screen while a trial runs or is in its grace, or the
// no-trial start card. The Pet tab hosts none of the trial's lifecycle any more: those
// writes and sheets live on the trial's screen (`components/trial/TrialLifecycleSheets.test.tsx`
// holds their behaviour, re-hosted from this file). The start form stays here (B-535).
//
// The card is a stub that exposes its `actions` as buttons, so this file can assert the
// start card carries exactly one: `DietTrialCard.test.tsx` asserts what the real card draws.

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    router: { push: jest.fn() },
    useLocalSearchParams: () => ({}),
    useFocusEffect: (cb: () => void | (() => void)) => {
      React.useEffect(() => cb(), []);
    },
  };
});
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
  MediaTypeOptions: { Images: 'Images' },
}));
jest.mock('../../lib/supabase', () => {
  const result = Promise.resolve({ data: [], error: null });
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'in', 'or', 'order', 'limit', 'gte', 'lte', 'neq']) {
    chain[m] = jest.fn(() => chain);
  }
  Object.assign(chain, { then: result.then.bind(result), catch: result.catch.bind(result) });
  return { supabase: { from: jest.fn(() => chain), auth: { getUser: jest.fn(() => Promise.resolve({ data: { user: { id: 'u1' } } })) } } };
});
jest.mock('../../lib/storage', () => ({
  uploadPhoto: jest.fn(),
  compressForUpload: jest.fn(),
  getPublicUrl: () => 'https://example.test/photo.jpg',
  getSignedUrls: jest.fn(() => Promise.resolve(new Map())),
}));
jest.mock('../../lib/haptics', () => ({ destructiveConfirm: jest.fn() }));

jest.mock('../../components/vetfiles/VetFilesCard', () => ({ VetFilesCard: () => null }));
jest.mock('../../components/profile/WeightTrendCard', () => ({ WeightTrendCard: () => null }));
jest.mock('../../components/profile/EditPetModal', () => ({ EditPetModal: () => null }));
jest.mock('../../components/profile/AddConditionModal', () => ({ AddConditionModal: () => null }));
jest.mock('../../components/profile/AddMedicationModal', () => ({ AddMedicationModal: () => null }));
jest.mock('../../components/profile/ArchivePetSheet', () => ({ ArchivePetSheet: () => null }));
jest.mock('../../components/profile/PastMedicationsSection', () => ({ PastMedicationsSection: () => null }));

// The start form stays on the Pet tab (B-535). A stub that reports whether it is
// presented, since Replace's whole contract is WHEN it is.
jest.mock('../../components/profile/StartTrialModal', () => {
  const { View } = require('react-native');
  return {
    StartTrialModal: ({ visible }: { visible: boolean }) =>
      visible ? <View testID="start-trial-open" /> : null,
  };
});

// The card, as a row of its own actions.
jest.mock('../../components/profile/DietTrialCard', () => {
  const { Pressable, Text, View } = require('react-native');
  return {
    DietTrialCard: ({
      actions, onManage, busyAction,
    }: { actions: Record<string, () => void>; onManage: () => void; busyAction: string | null }) => (
      <View>
        {Object.entries(actions).map(([id, fn]) => (
          <Pressable key={id} testID={`action-${id}`} onPress={fn}><Text>{id}</Text></Pressable>
        ))}
        <Pressable testID="card-manage" onPress={onManage}><Text>Manage</Text></Pressable>
        <Text testID="busy">{busyAction ?? 'idle'}</Text>
      </View>
    ),
  };
});
// The trial's two sheets, as spies: this tab must never draw either.
const mockCompletionSheet = jest.fn(() => null);
const mockManageSheet = jest.fn(() => null);
jest.mock('../../components/profile/TrialCompletionSheet', () => ({
  TrialCompletionSheet: () => mockCompletionSheet(),
}));
jest.mock('../../components/profile/TrialManageSheet', () => ({
  TrialManageSheet: () => mockManageSheet(),
}));
// The door's model is `lib/trialDoorRow.test.ts`'s business; here it exists exactly when
// the input carries a trial.
jest.mock('../../lib/trialDoorRow', () => ({
  buildTrialDoorRow: (input: { trial: unknown } | null) =>
    input?.trial
      ? {
          eyebrow: 'Diet trial',
          title: 'Diet trial · day 56 of 56',
          alert: null,
          progressFraction: 1,
          subline: null,
          accessibilityLabel: 'Diet trial · day 56 of 56. Open the diet trial.',
        }
      : null,
}));
jest.mock('../../lib/dietTrialCard', () => ({
  resolveTrialCard: () => ({ kicker: 'Diet trial' }),
  // The real line (C-34): the unreadable card's copy is asserted verbatim below.
  trialCardUnreadableLine: jest.requireActual('../../lib/dietTrialCard').trialCardUnreadableLine,
}));

// The trial read: day 56 of a 56-day skin trial, started on a LOCAL day key so the day math
// agrees in every CI timezone (B-514).
const mockReload = jest.fn();
function localDayKeyDaysAgo(n: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - n);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const mockTrialInput = {
  trial: {
    id: 't1',
    status: 'active',
    startedAt: localDayKeyDaysAgo(55),
    targetDurationDays: 56,
    indication: 'skin',
  },
  nowMs: Date.now(),
  intakeDeclineHeadline: null,
};
// Mutable so a test can stand the read in a failed state (CUL-1458); reset in `beforeEach`.
const LOADED_TRIAL = {
  input: mockTrialInput as typeof mockTrialInput | null,
  status: 'loaded' as 'loaded' | 'unreadable',
  isLoading: false,
  inputIsForPet: true,
};
const mockTrialState = { ...LOADED_TRIAL };
jest.mock('../../hooks/useDietTrial', () => ({
  useDietTrial: () => ({ ...mockTrialState, reload: mockReload }),
}));
jest.mock('../../hooks/useWidgetSlotLabel', () => ({ useWidgetSlotLabel: () => null }));
jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
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
const MOCHI = { id: 'p1', name: 'Mochi', species: 'cat', sex: 'female', photo_path: 'a.jpg', weight_kg: 4.1 };
const mockPetState = { activePet: MOCHI, pets: [MOCHI], updatePet: jest.fn() };
jest.mock('../../store/petStore', () => ({
  usePetStore: Object.assign(
    (selector?: (s: unknown) => unknown) => (selector ? selector(mockPetState) : mockPetState),
    { getState: () => mockPetState },
  ),
}));

import { act, fireEvent, render } from '@testing-library/react-native';
import { router } from 'expo-router';
import ProfileScreen from './profile';

type Rendered = ReturnType<typeof render>;

/** Let the screen's mount-time reads settle, so each test starts from a quiet tree. */
async function renderSettled(): Promise<Rendered> {
  const r = render(<ProfileScreen />);
  await act(async () => {});
  // The screen re-reads the trial on focus; count only what the actions cause.
  mockReload.mockClear();
  return r;
}

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockTrialState, LOADED_TRIAL);
});

describe('a running trial: the door, and no lifecycle on this tab (TS-6, TS-GA)', () => {
  it('draws the door and never the card, opening this pet’s trial screen once', async () => {
    const r = await renderSettled();
    expect(r.queryByTestId('card-manage')).toBeNull();
    fireEvent.press(r.getByTestId('trial-door-row'));
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith('/trial/p1');
  });

  it('mounts no trial sheet: the lifecycle lives on the screen', async () => {
    await renderSettled();
    expect(mockCompletionSheet).not.toHaveBeenCalled();
    expect(mockManageSheet).not.toHaveBeenCalled();
  });
});

describe('no trial: the start card, with one action', () => {
  it('carries Start and nothing else, and Start opens the form here', async () => {
    Object.assign(mockTrialState, { input: { ...mockTrialInput, trial: null } });
    const r = await renderSettled();
    expect(r.queryByTestId('trial-door-row')).toBeNull();
    expect(r.getByTestId('action-start_trial')).toBeTruthy();
    expect(r.queryAllByTestId(/^action-/)).toHaveLength(1);
    expect(r.queryByTestId('start-trial-open')).toBeNull();
    fireEvent.press(r.getByTestId('action-start_trial'));
    expect(r.getByTestId('start-trial-open')).toBeTruthy();
  });
});

describe('a trial read that failed (CUL-1458)', () => {
  // The cold-load failure shape `useDietTrial` produces: no input for this pet, status
  // `unreadable` (a same-pet reload failure keeps the last good input and stays `loaded`).
  function failRead(overrides: Partial<typeof LOADED_TRIAL> = {}): void {
    Object.assign(mockTrialState, { input: null, status: 'unreadable', inputIsForPet: false, ...overrides });
  }

  it('says so in the trial slot and offers a retry that re-reads', async () => {
    failRead();
    const r = await renderSettled();
    expect(r.getByTestId('trial-card-unreadable')).toBeTruthy();
    expect(r.getByText('I couldn’t check on Mochi’s diet trial just now.')).toBeTruthy();
    fireEvent.press(r.getByTestId('trial-card-unreadable-action'));
    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  it('draws no Start and no trial card: whether a trial runs is what the read could not say', async () => {
    failRead();
    const r = await renderSettled();
    // The card stand-in draws every action it is handed plus its header door.
    expect(r.queryByTestId('action-start_trial')).toBeNull();
    expect(r.queryByTestId('card-manage')).toBeNull();
    expect(r.queryByTestId('trial-door-row')).toBeNull();
  });

  it('wins over a stale input from another pet still held by the hook', async () => {
    failRead({ input: mockTrialInput });
    const r = await renderSettled();
    expect(r.getByTestId('trial-card-unreadable')).toBeTruthy();
    expect(r.queryByTestId('card-manage')).toBeNull();
    expect(r.queryByTestId('trial-door-row')).toBeNull();
  });

  it('stays up while the retry is in flight, with the button working', async () => {
    failRead({ isLoading: true });
    const r = await renderSettled();
    const button = r.getByTestId('trial-card-unreadable-action');
    expect(button.props.accessibilityState).toMatchObject({ busy: true });
  });

  it('a loaded read draws the door, not the retry', async () => {
    const r = await renderSettled();
    expect(r.queryByTestId('trial-card-unreadable')).toBeNull();
    expect(r.getByTestId('trial-door-row')).toBeTruthy();
  });
});
