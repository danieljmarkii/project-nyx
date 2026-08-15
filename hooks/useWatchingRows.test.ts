import { renderHook, waitFor } from '@testing-library/react-native';
import { useWatchingRows } from './useWatchingRows';
import { usePetStore } from '../store/petStore';
import { getWatchingRows } from '../lib/signalWatching';

// useFocusEffect needs a real navigation context bare renderHook doesn't provide; mirror
// its contract with a plain useEffect keyed on the memoized callback (the useSignal test's
// approach). The hook wraps its effect in useCallback keyed on [enabled, petId, dayNumber,
// signalTick], so this preserves the real re-run timing.
jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void | (() => void)) => require('react').useEffect(cb, [cb]),
}));

jest.mock('../lib/signalWatching', () => ({
  getWatchingRows: jest.fn(),
}));

const mockGet = getWatchingRows as jest.Mock;
const PET = { id: 'pet-a', name: 'Nyx' } as any;
const rows = [{ key: 'timing' as const, text: 'Timing — 4 of the 6 timed episodes a pattern needs.' }];

beforeEach(() => {
  jest.clearAllMocks();
  usePetStore.setState({ pets: [PET], activePet: PET } as any);
  mockGet.mockResolvedValue(rows);
});

describe('useWatchingRows — the enablement gate (flag-off does ZERO read)', () => {
  it('returns [] and never reads local data when disabled', () => {
    const { result } = renderHook(() => useWatchingRows(false, 12));
    expect(result.current).toEqual([]);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('returns [] and never reads when there is no active pet, even if enabled', () => {
    usePetStore.setState({ pets: [], activePet: null } as any);
    const { result } = renderHook(() => useWatchingRows(true, 12));
    expect(result.current).toEqual([]);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('reads once and returns the rows when enabled, passing the active pet id + dayNumber', async () => {
    const { result } = renderHook(() => useWatchingRows(true, 12));
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(mockGet).toHaveBeenCalledWith('pet-a', 12, expect.any(Number));
    expect(result.current[0].key).toBe('timing');
  });

  it('is fail-quiet — a read rejection leaves the rows empty, never throws', async () => {
    mockGet.mockRejectedValueOnce(new Error('db closed'));
    const { result } = renderHook(() => useWatchingRows(true, 12));
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(result.current).toEqual([]);
  });
});
