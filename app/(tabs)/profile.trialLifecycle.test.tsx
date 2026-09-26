// The Pet tab's trial LIFECYCLE, driven through the Pet tab — CUL-1299 (TS-3).
//
// TS-3 moves the extend and window writes, the refusal handling, both sheets and the
// Replace hand-off out of this screen into `hooks/useTrialLifecycle.ts` and
// `components/trial/TrialLifecycleSheets.tsx`, byte-identical. This file is the
// REFACTOR-SAFETY half of that: it was written against the screen BEFORE the move, run
// green there, and must stay green after it. It asserts behaviour an owner can reach —
// what each of the card's buttons writes, what a refusal does, which sheet opens over
// which trial — and nothing about where the code lives, so the move cannot change it.
//
// The card is a stub that exposes its `actions` as buttons: this file asserts the
// screen's WIRING, and `DietTrialCard.test.tsx` asserts which actions the real card
// draws. The two sheets are the REAL components with a prop spy around them, so the
// Modal count (C-14) is counted over real Modals rather than stand-ins.

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
jest.mock('../../lib/dietTrialCard', () => ({
  resolveTrialCard: () => ({ kicker: 'Diet trial' }),
  trialManageTarget: () => 'manage',
}));

// The real sheets, spied. `mockSheetProps` holds each one's latest props.
const mockSheetProps: { completion?: any; manage?: any } = {};
jest.mock('../../components/profile/TrialCompletionSheet', () => {
  const actual = jest.requireActual('../../components/profile/TrialCompletionSheet');
  return {
    ...actual,
    TrialCompletionSheet: (props: any) => {
      mockSheetProps.completion = props;
      return <actual.TrialCompletionSheet {...props} />;
    },
  };
});
jest.mock('../../components/profile/TrialManageSheet', () => {
  const actual = jest.requireActual('../../components/profile/TrialManageSheet');
  return {
    ...actual,
    TrialManageSheet: (props: any) => {
      mockSheetProps.manage = props;
      return <actual.TrialManageSheet {...props} />;
    },
  };
});
// The outcome step's counts — never reached by these tests, held pending so nothing
// resolves after a test ends.
jest.mock('../../lib/dietTrialOutcomeFacts', () => ({
  loadTrialOutcomeFacts: jest.fn(() => new Promise(() => {})),
}));

// The write path. `TrialWindowRefused` is a stand-in with the real class's structured
// fields; the screen's `instanceof` reads the same (mocked) export this file constructs.
jest.mock('../../lib/dietTrialSetup', () => {
  class TrialWindowRefused extends Error {
    reason: string;
    requestedDays: number;
    floorDays: number | null;
    currentTargetDays: number | null;
    dayCounter: number | null;
    constructor(args: {
      reason: string; requestedDays: number; floorDays?: number | null;
      currentTargetDays?: number | null; dayCounter?: number | null;
    }) {
      super(`refused: ${args.reason}`);
      this.reason = args.reason;
      this.requestedDays = args.requestedDays;
      this.floorDays = args.floorDays ?? null;
      this.currentTargetDays = args.currentTargetDays ?? null;
      this.dayCounter = args.dayCounter ?? null;
    }
  }
  return {
    TrialWindowRefused,
    extendTrial: jest.fn(() => Promise.resolve()),
    changeTrialWindow: jest.fn(() => Promise.resolve()),
    endActiveTrial: jest.fn(() => Promise.resolve()),
  };
});

// The trial read: day 56 of a 56-day skin trial (the milestone), started on a LOCAL day
// key so the day math agrees in every CI timezone (B-514).
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
jest.mock('../../hooks/useDietTrial', () => ({
  useDietTrial: () => ({
    input: mockTrialInput,
    status: 'loaded',
    isLoading: false,
    reload: mockReload,
    inputIsForPet: true,
  }),
}));
jest.mock('../../hooks/useTrialAllowedSet', () => ({ useTrialAllowedSet: () => ({ status: 'unknown' }) }));
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

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, Modal } from 'react-native';
import ProfileScreen from './profile';
import {
  changeTrialWindow, endActiveTrial, extendTrial, TrialWindowRefused,
} from '../../lib/dietTrialSetup';

const mockExtend = extendTrial as jest.Mock;
const mockChangeWindow = changeTrialWindow as jest.Mock;
const mockEnd = endActiveTrial as jest.Mock;

type Rendered = ReturnType<typeof render>;

function visibleModals(r: Rendered): number {
  return r.UNSAFE_queryAllByType(Modal).filter((m) => m.props.visible !== false).length;
}

/** Let the screen's mount-time reads settle, so each test starts from a quiet tree. */
async function renderSettled(): Promise<Rendered> {
  const r = render(<ProfileScreen />);
  await act(async () => {});
  // The screen re-reads the trial on focus; count only what the actions cause.
  mockReload.mockClear();
  return r;
}

let alertSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  delete mockSheetProps.completion;
  delete mockSheetProps.manage;
  mockExtend.mockImplementation(() => Promise.resolve());
  mockChangeWindow.mockImplementation(() => Promise.resolve());
  mockEnd.mockImplementation(() => Promise.resolve());
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => alertSpy.mockRestore());

describe('Keep going (trial_extend)', () => {
  it('extends from the day it is, by the indication’s weeks, then re-reads', async () => {
    const r = await renderSettled();
    await act(async () => { fireEvent.press(r.getByTestId('action-trial_extend')); });

    // Day 56 of 56, skin → four more weeks from today: 84.
    expect(mockExtend).toHaveBeenCalledTimes(1);
    expect(mockExtend).toHaveBeenCalledWith({ trialId: 't1', targetDurationDays: 84 });
    expect(mockReload).toHaveBeenCalledTimes(1);
    expect(alertSpy).not.toHaveBeenCalled();
    expect(r.getByTestId('busy').props.children).toBe('idle');
  });

  it('shows the card busy while the write is in flight, and a second tap writes nothing', async () => {
    let finish: () => void = () => {};
    mockExtend.mockImplementation(() => new Promise<void>((res) => { finish = res; }));
    const r = await renderSettled();
    await act(async () => { fireEvent.press(r.getByTestId('action-trial_extend')); });
    expect(r.getByTestId('busy').props.children).toBe('trial_extend');

    await act(async () => { fireEvent.press(r.getByTestId('action-trial_extend')); });
    expect(mockExtend).toHaveBeenCalledTimes(1);

    await act(async () => { finish(); });
    expect(r.getByTestId('busy').props.children).toBe('idle');
  });

  it('a refusal means the card is stale: re-read, and no alert (CUL-1039)', async () => {
    mockExtend.mockImplementation(() =>
      Promise.reject(new TrialWindowRefused({ reason: 'not_running', requestedDays: 84 })));
    const r = await renderSettled();
    await act(async () => { fireEvent.press(r.getByTestId('action-trial_extend')); });

    expect(mockReload).toHaveBeenCalledTimes(1);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('a write that actually failed says so, and does not re-read', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockExtend.mockImplementation(() => Promise.reject(new Error('disk')));
    const r = await renderSettled();
    await act(async () => { fireEvent.press(r.getByTestId('action-trial_extend')); });

    expect(alertSpy).toHaveBeenCalledWith(
      'That didn’t save',
      'The trial is still running on its current window. Have another go in a moment.',
    );
    expect(mockReload).not.toHaveBeenCalled();
    err.mockRestore();
  });
});

describe('the completion sheets (This trial is done, Stopped early, the milestone)', () => {
  it.each([
    ['trial_complete', 'complete'],
    ['trial_stopped_early', 'stopped_early'],
    ['milestone', 'decision'],
  ])('%s opens the sheet on the %s step, over the card’s own trial', async (action, entry) => {
    const r = await renderSettled();
    expect(mockSheetProps.completion.entry).toBeNull();
    fireEvent.press(r.getByTestId(`action-${action}`));

    expect(mockSheetProps.completion.entry).toBe(entry);
    expect(mockSheetProps.completion.trial).toEqual({
      id: 't1',
      petId: 'p1',
      startedAt: mockTrialInput.trial.startedAt,
      targetDurationDays: 56,
      indication: 'skin',
    });
    expect(mockSheetProps.completion.dayCounter).toBe(56);
    expect(mockSheetProps.completion.petName).toBe('Mochi');
    expect(mockSheetProps.completion.species).toBe('cat');
    expect(mockSheetProps.completion.pronouns).toMatchObject({ object: 'her', possessive: 'her' });
    expect(mockSheetProps.completion.intakeDeclineHeadline).toBeNull();
  });

  it('Stopped early ends the trial through the sheet, re-reads, and closes', async () => {
    const r = await renderSettled();
    fireEvent.press(r.getByTestId('action-trial_stopped_early'));
    expect(visibleModals(r)).toBe(1);

    // The sheet's own write path, reached through the host's `onChanged` / `onClose`.
    await act(async () => {
      mockSheetProps.completion.onChanged();
      mockSheetProps.completion.onClose();
    });
    expect(mockReload).toHaveBeenCalledTimes(1);
    expect(mockSheetProps.completion.entry).toBeNull();
    expect(visibleModals(r)).toBe(0);
  });

  it('the decision sheet’s Keep going is the same write as the card’s, and closes the sheet first', async () => {
    const r = await renderSettled();
    fireEvent.press(r.getByTestId('action-milestone'));
    await act(async () => { mockSheetProps.completion.onExtend(); });

    expect(mockExtend).toHaveBeenCalledWith({ trialId: 't1', targetDurationDays: 84 });
    expect(mockSheetProps.completion.entry).toBeNull();
    expect(visibleModals(r)).toBe(0);
  });
});

describe('Change the window (the Manage door)', () => {
  it('opens the door from the header and from the card’s trial_manage, over the running window', async () => {
    const r = await renderSettled();
    expect(mockSheetProps.manage.visible).toBe(false);
    fireEvent.press(r.getByTestId('card-manage'));
    expect(mockSheetProps.manage.visible).toBe(true);
    expect(mockSheetProps.manage.trial).toEqual({
      id: 't1',
      startDayKey: mockTrialInput.trial.startedAt,
      currentTargetDays: 56,
      dayCounter: 56,
    });
    expect(mockSheetProps.manage.petName).toBe('Mochi');

    act(() => { mockSheetProps.manage.onClose(); });
    expect(mockSheetProps.manage.visible).toBe(false);
    fireEvent.press(r.getByTestId('action-trial_manage'));
    expect(mockSheetProps.manage.visible).toBe(true);
  });

  it('saves the new total, records an unchecked vet box as false (never null), closes, re-reads', async () => {
    const r = await renderSettled();
    fireEvent.press(r.getByTestId('card-manage'));
    await act(async () => {
      mockSheetProps.manage.onSave({ targetDurationDays: 70, vetDirected: false });
    });

    expect(mockChangeWindow).toHaveBeenCalledWith({
      trialId: 't1', targetDurationDays: 70, vetDirected: false,
    });
    expect(mockReload).toHaveBeenCalledTimes(1);
    expect(mockSheetProps.manage.visible).toBe(false);
    expect(mockSheetProps.manage.busy).toBe(false);
    void r;
  });

  it('a trial ended elsewhere: the refusal re-reads, keeps the sheet open, and says so, naming the pet', async () => {
    mockChangeWindow.mockImplementation(() =>
      Promise.reject(new TrialWindowRefused({ reason: 'not_running', requestedDays: 40 })));
    const r = await renderSettled();
    fireEvent.press(r.getByTestId('card-manage'));
    await act(async () => {
      mockSheetProps.manage.onSave({ targetDurationDays: 40, vetDirected: true });
    });

    expect(mockReload).toHaveBeenCalledTimes(1);
    expect(mockSheetProps.manage.visible).toBe(true);
    expect(mockSheetProps.manage.writeError).toBe(
      'Mochi’s trial has ended, so its window cannot change.',
    );

    // A new total clears the stale refusal (the host clears what the host set).
    act(() => { mockSheetProps.manage.onSelectionChanged(); });
    expect(mockSheetProps.manage.writeError).toBeNull();
    void r;
  });

  it('a write that actually failed re-reads and says the trial is unchanged', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockChangeWindow.mockImplementation(() => Promise.reject(new Error('disk')));
    const r = await renderSettled();
    fireEvent.press(r.getByTestId('card-manage'));
    await act(async () => {
      mockSheetProps.manage.onSave({ targetDurationDays: 70, vetDirected: false });
    });

    expect(mockReload).toHaveBeenCalledTimes(1);
    expect(mockSheetProps.manage.writeError).toBe(
      'That didn’t save. The trial is still on its current window.',
    );
    act(() => { mockSheetProps.manage.onClose(); });
    expect(mockSheetProps.manage.writeError).toBeNull();
    void r;
    err.mockRestore();
  });
});

describe('Replace the trial', () => {
  it('is armed by the row and presented only once the door has dismissed (C-14, C-22)', async () => {
    const r = await renderSettled();
    fireEvent.press(r.getByTestId('card-manage'));
    act(() => { mockSheetProps.manage.onReplaceTrial(); });
    expect(r.queryByTestId('start-trial-open')).toBeNull();

    act(() => { mockSheetProps.manage.onClose(); });
    expect(r.queryByTestId('start-trial-open')).toBeNull();

    act(() => { mockSheetProps.manage.onDismissed(); });
    expect(r.getByTestId('start-trial-open')).toBeTruthy();
  });

  it('is a one-shot: a second dismissal does not present the form again', async () => {
    const r = await renderSettled();
    fireEvent.press(r.getByTestId('card-manage'));
    act(() => { mockSheetProps.manage.onReplaceTrial(); });
    act(() => { mockSheetProps.manage.onClose(); mockSheetProps.manage.onDismissed(); });
    expect(r.getByTestId('start-trial-open')).toBeTruthy();

    // A dismissal with nothing armed presents nothing.
    await waitFor(() => expect(mockSheetProps.manage.visible).toBe(false));
    fireEvent.press(r.getByTestId('card-manage'));
    act(() => { mockSheetProps.manage.onClose(); mockSheetProps.manage.onDismissed(); });
    expect(mockSheetProps.manage.visible).toBe(false);
  });
});

describe('one Modal at a time (C-14)', () => {
  it('no trial sheet presents while both are closed', async () => {
    const r = await renderSettled();
    expect(visibleModals(r)).toBe(0);
  });

  it('exactly one with the completion sheet open', async () => {
    const r = await renderSettled();
    fireEvent.press(r.getByTestId('action-trial_complete'));
    expect(visibleModals(r)).toBe(1);
  });

  it('exactly one with the Manage door open, and none once it closes', async () => {
    const r = await renderSettled();
    fireEvent.press(r.getByTestId('card-manage'));
    expect(visibleModals(r)).toBe(1);
    act(() => { mockSheetProps.manage.onClose(); });
    expect(visibleModals(r)).toBe(0);
  });
});
