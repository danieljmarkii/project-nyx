import { renderHook, waitFor } from '@testing-library/react-native';
import { useGapWarning } from './useGapWarning';
import { usePetStore } from '../store/petStore';
import { getGapWarning } from '../lib/signalWatching';

// useFocusEffect needs a navigation context; mirror its contract with a plain useEffect
// keyed on the memoized callback (the useSignal test's approach).
jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void | (() => void)) => require('react').useEffect(cb, [cb]),
}));

jest.mock('../lib/signalWatching', () => ({
  getGapWarning: jest.fn(),
}));

const mockGet = getGapWarning as jest.Mock;
const PET = { id: 'pet-a', name: 'Nyx' } as any;
const SENTENCE = 'Gaps between vomiting episodes are getting shorter — 12 days, then 7, then 3.';

beforeEach(() => {
  jest.clearAllMocks();
  usePetStore.setState({ pets: [PET], activePet: PET } as any);
  mockGet.mockResolvedValue(SENTENCE);
});

describe('useGapWarning', () => {
  it('reads nothing and owes nothing when disabled', () => {
    const { result } = renderHook(() => useGapWarning(false));
    expect(result.current).toEqual({ text: null, answered: true });
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('reads nothing with no active pet', () => {
    usePetStore.setState({ pets: [], activePet: null } as any);
    const { result } = renderHook(() => useGapWarning(true));
    expect(result.current.text).toBeNull();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('is unanswered while the read is in flight, then carries the sentence for the active pet', async () => {
    const { result } = renderHook(() => useGapWarning(true));
    expect(result.current.answered).toBe(false);
    await waitFor(() => expect(result.current.text).toBe(SENTENCE));
    expect(result.current.answered).toBe(true);
    expect(mockGet).toHaveBeenCalledWith('pet-a', expect.any(Number));
  });

  it('a failed read answers with no warning and says so', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockGet.mockRejectedValueOnce(new Error('db closed'));
    const { result } = renderHook(() => useGapWarning(true));
    await waitFor(() => expect(result.current.answered).toBe(true));
    expect(result.current.text).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
