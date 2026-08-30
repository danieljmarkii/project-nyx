// CUL-223 — the weight-readings screen's own wiring.
//
// Two classes are pinned here, and neither is reachable from the pure view-model
// tests in lib/weightHistory.test.ts:
//
//  1. THE THREE READ STATES. A read that hasn't answered is never an empty record
//     (CUL-575). The trap is that `rows=[]` is the natural initial value for BOTH
//     "no readings" and "no answer yet", so the very first frame renders the empty
//     state — "No readings yet" asserted over a query that has not run, on a health
//     record. The `loaded` flag is what separates them, and only a render test can
//     see the first frame.
//
//  2. WHOSE readings these are. The screen resolves its pet from the route param,
//     never from activePet — a list scoped to a record must not re-point itself to
//     the current selection (CUL-574).

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockBack = jest.fn();
let mockParams: { petId?: string } = { petId: 'pet-A' };
jest.mock('expo-router', () => {
  // jest hoists the factory above the imports, so React is required in-scope here.
  const react = require('react');
  return {
    router: { push: (...a: unknown[]) => mockPush(...a), back: () => mockBack() },
    useLocalSearchParams: () => mockParams,
    useFocusEffect: (cb: () => void | (() => void)) => react.useEffect(() => { cb(); }, [cb]),
  };
});
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

let mockPets = [{ id: 'pet-A', name: 'Nyx' }];
jest.mock('../store/petStore', () => ({
  usePetStore: (sel: (s: { pets: { id: string; name: string }[] }) => unknown) => sel({ pets: mockPets }),
  resolveRecordPetName: (pets: { id: string; name: string }[], id?: string | null) =>
    pets.find((p) => p.id === id)?.name || 'your pet',
}));

const mockGetWeightReadings = jest.fn();
jest.mock('../lib/weight', () => ({
  ...jest.requireActual('../lib/weight'),
  getWeightReadings: (...a: unknown[]) => mockGetWeightReadings(...a),
}));
jest.mock('../lib/supabase', () => ({ supabase: {} }));

import WeightHistoryScreen from './weight-history';

const reading = (eventId: string, weightKg: number, at: Date) => ({
  eventId, weightKg, occurredAt: at.toISOString(),
  confidence: 'witnessed' as const, earliest: null, latest: null,
});

// Local components, not a UTC literal (B-514): the year band reads local components,
// and 2026-01-01T00:00:00Z is 2025 in the Americas.
const READINGS = [
  reading('evt-2', 5.6, new Date(2026, 5, 12, 15, 14)),
  reading('evt-1', 5.9, new Date(2026, 2, 3, 9, 0)),
];

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { petId: 'pet-A' };
  mockPets = [{ id: 'pet-A', name: 'Nyx' }];
  mockGetWeightReadings.mockResolvedValue(READINGS);
});

describe('the three read states', () => {
  it('shows a skeleton on the FIRST frame, never the empty state', async () => {
    // The defect: rows=[] is the initial value, so without `loaded` this frame reads
    // "No readings yet" — a false fact about the record, asserted before any query
    // has answered.
    let resolve!: (v: unknown) => void;
    mockGetWeightReadings.mockReturnValueOnce(new Promise((r) => { resolve = r; }));

    // includeHiddenElements: the skeleton is deliberately hidden from assistive tech
    // (it is a placeholder, not content), which is exactly what RTL's default query
    // filters out — the same call shape History and Foods use for theirs.
    const { queryByTestId } = render(<WeightHistoryScreen />);
    expect(queryByTestId('weight-history-skeleton', { includeHiddenElements: true })).toBeTruthy();
    expect(queryByTestId('weight-history-empty')).toBeNull();

    await act(async () => { resolve(READINGS); });
  });

  it('shows the designed empty state ONLY once a read answered with nothing', async () => {
    mockGetWeightReadings.mockResolvedValueOnce([]);
    const { getByTestId, queryByTestId } = render(<WeightHistoryScreen />);
    await waitFor(() => expect(getByTestId('weight-history-empty')).toBeTruthy());
    expect(queryByTestId('weight-history-skeleton', { includeHiddenElements: true })).toBeNull();
  });

  it('SAYS a failed read failed, and offers the retry — it does not render "no readings"', async () => {
    mockGetWeightReadings.mockRejectedValueOnce(new Error('db closed'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const { getByTestId, queryByTestId, getByText } = render(<WeightHistoryScreen />);
    await waitFor(() => expect(getByTestId('weight-history-error')).toBeTruthy());
    expect(queryByTestId('weight-history-empty')).toBeNull();

    // And the retry actually re-reads, rather than being a dead label.
    mockGetWeightReadings.mockResolvedValueOnce(READINGS);
    await act(async () => { fireEvent.press(getByText('Try again')); });
    await waitFor(() => expect(getByText('12.3 lbs')).toBeTruthy());
  });

  it('never leaks a raw error string into owner-facing copy', async () => {
    mockGetWeightReadings.mockRejectedValueOnce(new Error('SQLITE_BUSY: database is locked'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const { getByTestId, queryByText } = render(<WeightHistoryScreen />);
    await waitFor(() => expect(getByTestId('weight-history-error')).toBeTruthy());
    expect(queryByText(/SQLITE_BUSY/)).toBeNull();
  });
});

describe('the list', () => {
  it('renders every reading and opens the event it already is', async () => {
    const { getByText } = render(<WeightHistoryScreen />);
    await waitFor(() => expect(getByText('12.3 lbs')).toBeTruthy());
    expect(getByText('13 lbs')).toBeTruthy();

    fireEvent.press(getByText('12.3 lbs'));
    // The History motion — the row is a weight_check event, and the detail screen is
    // where its edit and its delete already live. This screen adds a way IN only.
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/event/[id]', params: { id: 'evt-2' } });
  });

  it('counts what is ON the screen', async () => {
    const { getByTestId } = render(<WeightHistoryScreen />);
    await waitFor(() => expect(getByTestId('weight-history-subtitle')).toBeTruthy());
    expect(getByTestId('weight-history-subtitle').props.children).toBe('2 readings');
  });
});

describe('whose readings these are', () => {
  it('reads the pet from the ROUTE PARAM, not from the active selection', async () => {
    // The screen is reached by id from two cards. Resolving from activePet would show
    // the selected pet's readings under the tapped pet's card (CUL-574).
    mockParams = { petId: 'pet-B' };
    render(<WeightHistoryScreen />);
    await waitFor(() => expect(mockGetWeightReadings).toHaveBeenCalledWith('pet-B'));
  });

  it('names the pet in a multi-pet household, and stays quiet in a single-pet one', async () => {
    const single = render(<WeightHistoryScreen />);
    await waitFor(() => expect(single.getByTestId('weight-history-subtitle')).toBeTruthy());
    expect(single.getByTestId('weight-history-subtitle').props.children).toBe('2 readings');
    single.unmount();

    mockPets = [{ id: 'pet-A', name: 'Nyx' }, { id: 'pet-B', name: 'Pixel' }];
    const multi = render(<WeightHistoryScreen />);
    await waitFor(() => expect(multi.getByTestId('weight-history-subtitle')).toBeTruthy());
    expect(multi.getByTestId('weight-history-subtitle').props.children).toBe('Nyx · 2 readings');
  });
});
