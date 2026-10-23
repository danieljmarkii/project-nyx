// CUL-1947 — every local write that moves a pet's vomit gaps re-reads Home's gap warning
// on its own, whether or not the server regen behind it succeeds. Composed from the REAL
// write paths (`insertSimpleEvent`, `reverseLoggedEvent`), the REAL debounce
// (`triggerSignalRegenDebounced`) and the REAL hook; only the stores underneath them are
// stubbed. The regen is made to FAIL (generate-signal answers an error, so no signalTick)
// or to NEVER RUN (the debounce is never advanced), because that is the case the issue is
// about: a log from Home's root log sheet leaves Home focused, so no focus re-run fires.
//
// The two writes not driven here have their own proof: the completion card's time edit
// schedules no regen at all, so `NamedCompletionCard.test.tsx` (and the meal and dose
// cards' suites, whose times move the logged clock) pin its recordTick bump; a restore
// lands only through sync, so `useGapWarning.test.ts` pins the hydrationTick re-read.
// The edit screen is a modal route, so Home's focus re-read covers it on return.

import { act, renderHook, waitFor } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void | (() => void)) => require('react').useEffect(cb, [cb]),
}));

// The hook reads through `getGapWarningRead`; these suites drive the sentence through
// `getGapWarning` and the clock schedule through `mockNextChangeMs` (null: the ceiling).
jest.mock('../lib/signalWatching', () => {
  const getGapWarning = jest.fn();
  const mockNextChangeMs = jest.fn(() => null);
  return {
    getGapWarning,
    mockNextChangeMs,
    getGapWarningRead: async (petId: string, nowMs: number) => ({
      text: await getGapWarning(petId, nowMs),
      nextChangeMs: mockNextChangeMs(),
    }),
  };
});

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
import { softDeleteEvent } from '../lib/db';
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
  // The re-read must come AFTER the write (adversarial pass 1): a re-read that ran first
  // would read the old rows and settle calm. So the warning answers only once the write
  // under test has landed.
  mockGet.mockImplementation(async () => (writeLanded() ? SENTENCE : null));
  return hook;
}

let writeLanded: () => boolean = () => true;

// Inside act() React holds the re-read until the awaited write returns, so the hook alone
// cannot see a tick bumped BEFORE the write. The order is pinned at the tick itself: the
// moment recordTick moves, the write under test has landed.
function recordAtTick(): boolean[] {
  const seen: boolean[] = [];
  const unsub = useSyncStore.subscribe((st, prev) => {
    if (st.recordTick !== prev.recordTick) seen.push(writeLanded());
  });
  afterThis.push(unsub);
  return seen;
}
const afterThis: Array<() => void> = [];
afterEach(() => afterThis.splice(0).forEach((f) => f()));

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
    writeLanded = () => mockRunAsync.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO events'));
    const { result } = await mountAnswered();
    const atTick = recordAtTick();
    await act(async () => {
      await insertSimpleEvent({ ...VOMIT });
    });
    expect(atTick).toEqual([true]);
    if (runAndFail) await failTheRegen();
    await waitFor(() => expect(result.current.text).toBe(SENTENCE));
    expect(useSyncStore.getState().signalTick).toBe(0);
  });

  it('a vomit removed (reverseLoggedEvent, the card Undo and the event screen)', async () => {
    writeLanded = () => (softDeleteEvent as jest.Mock).mock.calls.length > 0;
    const { result } = await mountAnswered();
    const atTick = recordAtTick();
    await act(async () => {
      await reverseLoggedEvent('ev-1');
    });
    expect(atTick).toEqual([true]);
    if (runAndFail) await failTheRegen();
    await waitFor(() => expect(result.current.text).toBe(SENTENCE));
    expect(useSyncStore.getState().signalTick).toBe(0);
  });

  // The debounce contract only: the edit screen is a modal route over the event screen,
  // so Home is blurred and its focus re-read covers it on return (adversarial pass 1).
  it("the debounce a time edit schedules re-reads on its own", async () => {
    writeLanded = () => true;
    const { result } = await mountAnswered();
    act(() => triggerSignalRegenDebounced('pet-a'));
    if (runAndFail) await failTheRegen();
    await waitFor(() => expect(result.current.text).toBe(SENTENCE));
    expect(useSyncStore.getState().signalTick).toBe(0);
  });
});
