// CUL-1947 — every local write that moves a pet's vomit gaps re-reads Home's gap warning
// on its own, whether or not the server regen behind it succeeds. Composed from the REAL
// write paths (`insertSimpleEvent`, `reverseLoggedEvent`), the REAL debounce
// (`triggerSignalRegenDebounced`) and the REAL hook; only the stores underneath them are
// stubbed. The regen is made to FAIL (generate-signal answers an error, so no signalTick)
// or to NEVER RUN (the debounce is never advanced), because that is the case the issue is
// about: a log from Home's root log sheet leaves Home focused, so no focus re-run fires.
//
// The two writes not driven here have their own proof: the completion card's time edit
// schedules no regen at all, so `NamedCompletionCard.test.tsx` pins its recordTick bump;
// a restore lands only through sync, so `useGapWarning.test.ts` pins the hydrationTick
// re-read. The edit screen's time edit calls the same debounce driven below.

import { act, renderHook, waitFor } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void | (() => void)) => require('react').useEffect(cb, [cb]),
}));

jest.mock('../lib/signalWatching', () => ({ getGapWarning: jest.fn() }));

const mockRunAsync = jest.fn().mockResolvedValue({ changes: 1 });
jest.mock('../lib/db', () => ({
  getDb: () => ({ runAsync: mockRunAsync, withTransactionAsync: async (fn: () => Promise<void>) => fn() }),
  softDeleteEvent: jest.fn(async () => {}),
  getEventPetId: jest.fn(async () => 'pet-a'),
}));
jest.mock('../hooks/useAppConfig', () => ({ allowlistFlagNow: () => false }));
jest.mock('../lib/incidentFloorPreview', () => ({ previewFloorAfterWrite: jest.fn(async () => null) }));
jest.mock('../lib/sync', () => ({
  syncPendingEvents: jest.fn(async () => {}),
  syncPendingMeals: jest.fn(async () => {}),
  syncPendingAttachments: jest.fn(async () => {}),
  syncPendingIncidentFloors: jest.fn(async () => {}),
}));
jest.mock('../lib/supabase', () => ({
  supabase: { from: jest.fn(), functions: { invoke: jest.fn() } },
}));
jest.mock('../lib/analysis', () => ({
  triggerVomitAnalysis: jest.fn(async () => ({ error: null })),
  triggerStoolAnalysis: jest.fn(async () => ({ error: null })),
  claimAnalysisChain: jest.fn(() => ({ settle: jest.fn() })),
}));
jest.mock('../lib/storage', () => ({
  uploadPhoto: jest.fn(),
  compressForUpload: jest.fn(),
  persistCapture: jest.fn(),
}));
jest.mock('../lib/attachments', () => ({ queueRemovedLogPhotosForPurge: jest.fn(async () => {}) }));
jest.mock('../lib/weight', () => ({ reconcileWeightSnapshotAfterDelete: jest.fn(async () => null) }));

import { useGapWarning } from './useGapWarning';
import { getGapWarning } from '../lib/signalWatching';
import { supabase } from '../lib/supabase';
import { cancelPendingSignalRegens, triggerSignalRegenDebounced } from '../lib/signal';
import { insertSimpleEvent } from '../lib/simpleEvent';
import { reverseLoggedEvent } from '../lib/undoLog';
import { usePetStore } from '../store/petStore';
import { useSyncStore } from '../store/syncStore';

const mockGet = getGapWarning as jest.Mock;
const mockInvoke = supabase.functions.invoke as jest.Mock;
const PET = { id: 'pet-a', name: 'Nyx' } as any;
const SENTENCE = 'Gaps between vomiting episodes are getting shorter — 12 days, then 7, then 3.';

beforeEach(() => {
  jest.clearAllMocks();
  usePetStore.setState({ pets: [PET], activePet: PET } as any);
  useSyncStore.setState({ signalTick: 0, recordTick: 0, hydrationTick: 0, signalAcknowledging: {} });
  // The calm answer first; the write is what moves the gaps into a warning.
  mockGet.mockResolvedValue(null);
});
afterEach(() => cancelPendingSignalRegens());

async function mountAnswered() {
  const hook = renderHook(() => useGapWarning(true));
  await waitFor(() => expect(hook.result.current.answered).toBe(true));
  expect(hook.result.current.text).toBeNull();
  expect(mockGet).toHaveBeenCalledTimes(1);
  mockGet.mockResolvedValue(SENTENCE);
  return hook;
}

// Run the debounced regen to completion with generate-signal answering an error.
async function failTheRegen() {
  mockInvoke.mockResolvedValue({ error: { message: 'offline' } });
  await act(async () => {
    jest.advanceTimersByTime(60_000);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

const VOMIT = {
  petId: 'pet-a',
  eventType: 'vomit',
  confidence: 'witnessed' as const,
  occurredAt: new Date('2026-10-15T08:00:00.000Z'),
  earliest: null,
  latest: null,
  source: 'now' as const,
  notes: null,
};

describe.each([
  ['the regen never runs', false],
  ['the regen fails', true],
])('a write re-reads the gap warning when %s (CUL-1947)', (_label, runAndFail) => {
  beforeEach(() => jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] }));
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('a vomit logged (insertSimpleEvent, the log sheet and log screen path)', async () => {
    const { result } = await mountAnswered();
    await act(async () => {
      await insertSimpleEvent({ ...VOMIT });
    });
    if (runAndFail) await failTheRegen();
    await waitFor(() => expect(result.current.text).toBe(SENTENCE));
    expect(useSyncStore.getState().signalTick).toBe(0);
  });

  it('a vomit removed (reverseLoggedEvent, the card Undo and the event screen)', async () => {
    const { result } = await mountAnswered();
    await act(async () => {
      await reverseLoggedEvent('ev-1');
    });
    if (runAndFail) await failTheRegen();
    await waitFor(() => expect(result.current.text).toBe(SENTENCE));
    expect(useSyncStore.getState().signalTick).toBe(0);
  });

  it("a vomit's time edited (the edit screen schedules the same debounce after its write)", async () => {
    const { result } = await mountAnswered();
    act(() => triggerSignalRegenDebounced('pet-a'));
    if (runAndFail) await failTheRegen();
    await waitFor(() => expect(result.current.text).toBe(SENTENCE));
    expect(useSyncStore.getState().signalTick).toBe(0);
  });
});
