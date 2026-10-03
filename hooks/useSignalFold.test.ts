// CUL-1213 — the hook's half of "a key two findings share is never one card's". The store's
// half (reconcileFolds releases the key) is in lib/signalFold.test.ts; this pins that the
// surface renders both cards open, with no Back-because line, and that a fold tap on either
// writes nothing. AsyncStorage is the jest mock, so the write is observable.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { CachedFinding, CorrelationFinding } from '../lib/signal';
import { foldIdentity, foldedEntry, readFoldEntries, SIGNAL_FOLD_STORAGE_KEY } from '../lib/signalFold';
import { usePetStore } from '../store/petStore';
import { useSignalFold } from './useSignalFold';

const NOW_ISO = '2026-09-20T09:00:00.000Z';
const base: CorrelationFinding = {
  type: 'food_symptom_correlation',
  priorityClass: 'insight',
  tier: 'early',
  symptomType: 'vomit',
  protein: 'chicken',
  proteins: ['chicken'],
  jointCandidate: false,
  jointGuidance: null,
  matchedPairs: 3,
  symptomEventCount: 3,
  correlationWindowHours: 12,
};
const cached = (finding: CorrelationFinding, rank: number): CachedFinding => ({ rank, text: 'x', finding });

beforeEach(async () => {
  await AsyncStorage.clear();
  usePetStore.setState({ pets: [{ id: 'pet-1', name: 'Nyx' }] as never });
});

it('two findings under one key (a payload from an older derivation): both open, no line, no fold written', async () => {
  const a = { ...base, symptomType: undefined } as unknown as CorrelationFinding;
  const b = { ...base, symptomType: undefined, tier: 'established', matchedPairs: 7 } as unknown as CorrelationFinding;
  const key = foldIdentity(a);
  expect(foldIdentity(b)).toBe(key);
  await AsyncStorage.setItem(SIGNAL_FOLD_STORAGE_KEY, JSON.stringify({ 'pet-1': { [key]: foldedEntry(a, NOW_ISO) } }));

  const findings = [cached(a, 0), cached(b, 1)];
  const { result } = renderHook(() => useSignalFold({ petId: 'pet-1', findings, answered: true }));
  // The reconcile releases the shared key on disk.
  await waitFor(async () => expect(await readFoldEntries('pet-1')).toEqual({}));
  expect(result.current.stateOf(a)).toBe('open');
  expect(result.current.stateOf(b)).toBe('open');
  expect(result.current.backBecauseOf(b)).toBeNull();

  // The tap itself must not write: a fold written and then released by the next reconcile is
  // a card that collapses and springs back, so the assertion is on the write, not the end state.
  // The AsyncStorage jest mock's setItem is already a jest.fn: clear it, never restore it.
  const setItem = AsyncStorage.setItem as jest.Mock;
  setItem.mockClear();
  act(() => {
    result.current.fold(b);
  });
  expect(result.current.stateOf(b)).toBe('open');
  expect(setItem).not.toHaveBeenCalled();
});

it('two findings on one protein with different symptoms fold one at a time', async () => {
  const itch: CorrelationFinding = { ...base, symptomType: 'itch', tier: 'established', matchedPairs: 7 };
  const findings = [cached(base, 0), cached(itch, 1)];
  const { result } = renderHook(() => useSignalFold({ petId: 'pet-1', findings, answered: true }));
  await act(async () => {
    result.current.fold(base);
  });
  expect(result.current.stateOf(base)).toBe('folded');
  expect(result.current.stateOf(itch)).toBe('open');
});
