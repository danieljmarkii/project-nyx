// The Day Summary's loader re-reads when the record changes under it (QA, 1.2.0).
//
// The summary's own door ("Log an event") opens the root log sheet OVER this screen, and
// a sheet is an overlay: nothing about a save re-focuses or re-mounts the screen. The
// read re-ran only on the pet set, the active pet and the hydration tick, so after an
// owner logged from here the screen went on saying "Nothing in {pet}'s record today"
// under the row they had just added. The sheet's save prepends to the Today store and
// Undo removes from it, so that store is the trigger pinned here.
//
// Only the reads are stubbed. The builder runs for real, so `isEmpty` is the screen's own
// empty-state answer, and the stores are real because the wiring under test IS the
// hook's reaction to their state (the useDietTrial.test.ts shape).

// lib/daySummary reaches the sync layer, whose client fails fast without env.
jest.mock('../lib/supabase', () => ({ supabase: {} }));
jest.mock('../lib/db', () => ({ getTimeline: jest.fn() }));
jest.mock('../lib/dietTrialFacts', () => ({ loadTrialPredicateFacts: jest.fn(async () => null) }));
jest.mock('../lib/medStripFacts', () => ({ loadMedStripInput: jest.fn(async () => null) }));

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useDaySummary } from './useDaySummary';
import { getTimeline } from '../lib/db';
import { usePetStore } from '../store/petStore';
import { useSyncStore } from '../store/syncStore';
import { useEventStore, type NyxEvent } from '../store/eventStore';

const mockedTimeline = getTimeline as jest.Mock;

const PET = {
  id: 'pet-1',
  name: 'Pixel',
  species: 'cat',
  breed: null,
  date_of_birth: null,
  date_of_birth_precision: 'exact',
  sex: 'unknown',
  weight_kg: null,
  photo_path: null,
} as const;

/** The row an owner just logged, stamped with the suite's own "now" so it falls in the
 *  summary's day whatever the runner's zone or clock skew (C-29). */
function justLogged(id: string): NyxEvent {
  const now = new Date().toISOString();
  return {
    id,
    pet_id: PET.id,
    event_type: 'vomit',
    occurred_at: now,
    occurred_at_confidence: 'witnessed',
    occurred_at_earliest: null,
    occurred_at_latest: null,
    severity: null,
    notes: null,
    source: 'manual',
    deleted_at: null,
    created_at: now,
    updated_at: now,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  useSyncStore.setState({ hydrationTick: 0 });
  usePetStore.setState({ pets: [PET] as never, activePet: PET as never });
  useEventStore.setState({ todayEvents: [] });
});

describe('useDaySummary — a log saved from the sheet over the summary', () => {
  it('re-reads when the save lands in the Today store, and again when Undo removes it', async () => {
    const row = justLogged('ev-1');
    mockedTimeline.mockResolvedValueOnce([]).mockResolvedValueOnce([row]).mockResolvedValueOnce([]);

    const { result } = renderHook(() => useDaySummary());
    await waitFor(() => expect(result.current.model?.isEmpty).toBe(true));
    expect(mockedTimeline).toHaveBeenCalledTimes(1);

    // The sheet's confirm: the write lands, then the optimistic row goes into Today.
    act(() => useEventStore.getState().prependEvent(row));
    await waitFor(() => expect(result.current.model?.isEmpty).toBe(false));
    expect(mockedTimeline).toHaveBeenCalledTimes(2);

    // Undo on the completion beat drops the row from Today (momentStore.undo).
    act(() => useEventStore.getState().removeFromToday(row.id));
    await waitFor(() => expect(result.current.model?.isEmpty).toBe(true));
    expect(mockedTimeline).toHaveBeenCalledTimes(3);
  });
});
