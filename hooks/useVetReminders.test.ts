// CUL-2728: the vet visit reminders' switch writer, the status the booking sheet reads,
// and Remind me applied after Save (mock round 2 T3).
import { act, renderHook } from '@testing-library/react-native';

let mockPermission: 'granted' | 'denied' | 'undetermined' = 'granted';
let mockRequestAnswer: 'granted' | 'denied' | 'undetermined' = 'granted';
let mockOn = false;
const mockSetOn = jest.fn(async (v: boolean) => {
  mockOn = v;
});
const mockSync = jest.fn(async () => undefined);
const mockShow = jest.fn();

jest.mock('../lib/notifications', () => ({
  ensurePermission: jest.fn(async (request?: boolean) => (request ? mockRequestAnswer : mockPermission)),
}));
jest.mock('../lib/vetReminderNotifications', () => ({
  setVetRemindersOn: (v: boolean) => mockSetOn(v),
  vetRemindersOn: jest.fn(async () => mockOn),
  syncVetReminderNotifications: () => mockSync(),
}));
jest.mock('../store/snackbarStore', () => ({
  useSnackbarStore: { getState: () => ({ show: mockShow }) },
}));
jest.mock('../store/petStore', () => ({
  usePetStore: Object.assign(() => true, { getState: () => ({ pets: [], petsLoaded: true }) }),
}));
jest.mock('../store/syncStore', () => ({ useSyncStore: () => 0 }));
jest.mock('./useAppActive', () => ({ useAppActive: () => true }));
jest.mock('../lib/vetVisits', () => ({ onAppointmentsChanged: () => () => undefined }));

import {
  PRIMER_AFTER_SHEET_MS,
  readVetReminderStatus,
  setVetReminders,
  useRemindMeAfterSave,
  VET_REMINDERS_FAILED_MESSAGE,
  VET_REMINDERS_ON_MESSAGE,
} from './useVetReminders';

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockPermission = 'granted';
  mockRequestAnswer = 'granted';
  mockOn = false;
});
afterEach(() => {
  jest.useRealTimers();
});

describe('setVetReminders', () => {
  it('writes the switch and then re-plans', async () => {
    await setVetReminders(true);
    expect(mockSetOn).toHaveBeenCalledWith(true);
    expect(mockSync).toHaveBeenCalledTimes(1);
  });
});

describe('readVetReminderStatus', () => {
  it('on only where this phone delivers: the switch AND permission granted', async () => {
    mockOn = true;
    expect(await readVetReminderStatus()).toBe('on');
    mockPermission = 'undetermined';
    expect(await readVetReminderStatus()).toBe('off'); // on for the account, never asked here
    mockPermission = 'denied';
    expect(await readVetReminderStatus()).toBe('denied');
    mockOn = false;
    mockPermission = 'granted';
    expect(await readVetReminderStatus()).toBe('off');
  });
});

describe('useRemindMeAfterSave', () => {
  it('allowed: turns on with no primer, and says so', async () => {
    const { result } = renderHook(() => useRemindMeAfterSave());
    await act(async () => {
      await result.current.apply();
    });
    expect(mockSetOn).toHaveBeenCalledWith(true);
    expect(mockShow).toHaveBeenCalledWith({ message: VET_REMINDERS_ON_MESSAGE }, { delayMs: 300 });
    expect(result.current.primer.visible).toBe(false);
  });

  it('never asked: the primer rises only after the sheet has gone, and turns nothing on yet', async () => {
    mockPermission = 'undetermined';
    const { result } = renderHook(() => useRemindMeAfterSave());
    await act(async () => {
      await result.current.apply();
    });
    expect(result.current.primer.visible).toBe(false);
    act(() => {
      jest.advanceTimersByTime(PRIMER_AFTER_SHEET_MS);
    });
    expect(result.current.primer.visible).toBe(true);
    expect(mockSetOn).not.toHaveBeenCalled();
  });

  it('Turn on → granted turns on; refused turns nothing on and says nothing', async () => {
    mockPermission = 'undetermined';
    const { result } = renderHook(() => useRemindMeAfterSave());
    await act(async () => {
      await result.current.apply();
      jest.advanceTimersByTime(PRIMER_AFTER_SHEET_MS);
    });
    await act(async () => {
      result.current.primer.onConfirm();
    });
    expect(mockSetOn).toHaveBeenCalledWith(true);
    expect(result.current.primer.visible).toBe(false);

    jest.clearAllMocks();
    mockRequestAnswer = 'denied';
    await act(async () => {
      await result.current.apply();
      jest.advanceTimersByTime(PRIMER_AFTER_SHEET_MS);
    });
    await act(async () => {
      result.current.primer.onConfirm();
    });
    expect(mockSetOn).not.toHaveBeenCalled();
    expect(mockShow).not.toHaveBeenCalled();
  });

  it('Not now spends nothing', async () => {
    mockPermission = 'undetermined';
    const { result } = renderHook(() => useRemindMeAfterSave());
    await act(async () => {
      await result.current.apply();
      jest.advanceTimersByTime(PRIMER_AFTER_SHEET_MS);
    });
    act(() => result.current.primer.onDismiss());
    expect(result.current.primer.visible).toBe(false);
    expect(mockSetOn).not.toHaveBeenCalled();
  });

  it('a host that unmounts before the permission read answers never arms the primer', async () => {
    mockPermission = 'undetermined';
    const { result, unmount } = renderHook(() => useRemindMeAfterSave());
    const apply = result.current.apply;
    unmount();
    const before = jest.getTimerCount();
    await apply();
    // No timer armed by apply.
    expect(jest.getTimerCount()).toBe(before);
  });

  it('a failed write after a booking is said, and the booking is not touched', async () => {
    mockSetOn.mockRejectedValueOnce(new Error('disk'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useRemindMeAfterSave());
    await act(async () => {
      await result.current.apply();
    });
    expect(mockShow).toHaveBeenCalledWith({ message: VET_REMINDERS_FAILED_MESSAGE }, { delayMs: 300 });
    warn.mockRestore();
  });
});
