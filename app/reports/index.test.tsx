// The Reports library screen (Vet report v2 PR-21, CUL-2301): the three read states, whose
// reports these are, the year fold and the stillness of the list.

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
let mockParams: { pet?: string } = {};
jest.mock('expo-router', () => {
  const react = require('react');
  return {
    router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn() },
    useLocalSearchParams: () => mockParams,
    useFocusEffect: (cb: () => void | (() => void)) => react.useEffect(() => { cb(); }, [cb]),
  };
});
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

type MockPet = { id: string; name: string };
let mockPets: MockPet[] = [];
let mockActive: MockPet | null = null;
jest.mock('../../store/petStore', () => ({
  ANONYMOUS_PET_NAME: 'your pet',
  usePetStore: (sel: (s: { pets: MockPet[]; activePet: MockPet | null }) => unknown) => sel({ pets: mockPets, activePet: mockActive }),
  resolveRecordPetName: (pets: MockPet[], id?: string | null) => pets.find((p) => p.id === id)?.name || 'your pet',
}));

const mockRead = jest.fn();
jest.mock('../../lib/reportLibrary', () => ({
  ...jest.requireActual('../../lib/reportLibrary'),
  readSavedReports: (...a: unknown[]) => mockRead(...a),
}));
jest.mock('../../lib/supabase', () => ({ supabase: {} }));

import ReportsLibraryScreen from './index';

const COOPER = { id: 'pet-cooper', name: 'Cooper' };
const MIRA = { id: 'pet-mira', name: 'Mira' };
const copy = (id: string, sharedAt: Date, via = 'email') => ({
  id, petId: COOPER.id, shortId: 'Q7K4', startDate: '2026-09-16', endDate: '2026-10-29', sharedVia: via, sharedAt: sharedAt.toISOString(),
});
const thisYear = new Date().getFullYear();

beforeEach(() => {
  jest.clearAllMocks();
  mockPets = [COOPER, MIRA];
  mockActive = MIRA;
  mockParams = { pet: COOPER.id };
});

it('a read that has not answered shows a skeleton, never the empty state', () => {
  mockRead.mockReturnValue(new Promise(() => undefined));
  const view = render(<ReportsLibraryScreen />);
  expect(view.getByTestId('reports-loading', { includeHiddenElements: true })).toBeTruthy();
  expect(view.queryByTestId('reports-empty')).toBeNull();
});

it('names the pet the door named, not the active pet (C-9, WBC-9), and reads that pet', async () => {
  mockRead.mockResolvedValue({ kind: 'ok', reports: [copy('a', new Date(thisYear, 9, 30, 12))] });
  const view = render(<ReportsLibraryScreen />);
  await waitFor(() => expect(view.getByTestId('reports-list')).toBeTruthy());
  expect(view.getByText('Cooper’s vet reports')).toBeTruthy();
  expect(view.queryByText(/Mira/)).toBeNull();
  expect(mockRead).toHaveBeenCalledWith(COOPER.id);
});

it('a door naming a pet this account does not hold falls back to the active pet', async () => {
  mockParams = { pet: 'someone-elses-pet' };
  mockRead.mockResolvedValue({ kind: 'ok', reports: [] });
  const view = render(<ReportsLibraryScreen />);
  await waitFor(() => expect(view.getByTestId('reports-empty')).toBeTruthy());
  expect(mockRead).toHaveBeenCalledWith(MIRA.id);
  expect(view.getByText('Mira’s vet reports')).toBeTruthy();
});

it('a failed read says so and retries; it is never shown as no reports', async () => {
  mockRead.mockResolvedValueOnce({ kind: 'failed' }).mockResolvedValueOnce({ kind: 'ok', reports: [] });
  const view = render(<ReportsLibraryScreen />);
  await waitFor(() => expect(view.getByTestId('reports-failed')).toBeTruthy());
  expect(view.queryByTestId('reports-empty')).toBeNull();
  fireEvent.press(view.getByText('Try again'));
  await waitFor(() => expect(view.getByTestId('reports-empty')).toBeTruthy());
});

it('a row shows when it went, what it covers and how it left, and opens that copy', async () => {
  mockRead.mockResolvedValue({ kind: 'ok', reports: [copy('a', new Date(thisYear, 9, 30, 12), 'print')] });
  const view = render(<ReportsLibraryScreen />);
  await waitFor(() => expect(view.getByText('Oct 30')).toBeTruthy());
  expect(view.getByText('Sep 16 – Oct 29 · Printed')).toBeTruthy();
  fireEvent.press(view.getByTestId('reports-row-a'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/reports/[id]', params: { id: 'a', pet: COOPER.id } });
});

it('older years fold to one line each and open on a tap', async () => {
  mockRead.mockResolvedValue({
    kind: 'ok',
    reports: [copy('new', new Date(thisYear, 1, 2, 12)), copy('old1', new Date(thisYear - 1, 9, 30, 12)), copy('old2', new Date(thisYear - 1, 3, 1, 12))],
  });
  const view = render(<ReportsLibraryScreen />);
  await waitFor(() => expect(view.getByTestId('reports-row-new')).toBeTruthy());
  expect(view.queryByTestId('reports-row-old1')).toBeNull();
  expect(view.getByText(`${thisYear - 1} · 2 reports`)).toBeTruthy();
  fireEvent.press(view.getByTestId(`reports-year-${thisYear - 1}`));
  expect(view.getByTestId('reports-row-old1')).toBeTruthy();
  expect(view.getByTestId('reports-row-old2')).toBeTruthy();
});
