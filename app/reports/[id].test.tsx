// One saved report (Vet report v2 PR-21, CUL-2301): the stored copy drawn as sent, the states
// that show nothing, whose report it is, and the one action that never reads as updating it.

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
let mockParams: { id?: string; pet?: string } = {};
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('react-native-webview', () => {
  const { View } = require('react-native');
  return { WebView: (props: Record<string, unknown>) => require('react').createElement(View, props) };
});

type MockPet = { id: string; name: string };
let mockPets: MockPet[] = [];
jest.mock('../../store/petStore', () => ({
  ANONYMOUS_PET_NAME: 'your pet',
  usePetStore: (sel: (s: { pets: MockPet[] }) => unknown) => sel({ pets: mockPets }),
  resolveRecordPetName: (pets: MockPet[], id?: string | null) => pets.find((p) => p.id === id)?.name || 'your pet',
}));

const mockReadOne = jest.fn();
const mockOpen = jest.fn();
jest.mock('../../lib/reportLibrary', () => ({
  ...jest.requireActual('../../lib/reportLibrary'),
  readSavedReport: (...a: unknown[]) => mockReadOne(...a),
  openSavedReport: (...a: unknown[]) => mockOpen(...a),
}));
jest.mock('../../lib/supabase', () => ({ supabase: {} }));

import SavedReportScreen from './[id]';

const COOPER = { id: 'pet-cooper', name: 'Cooper' };
const thisYear = new Date().getFullYear();
const ROW = {
  id: 'r1', petId: COOPER.id, shortId: 'Q7K4', startDate: '2026-09-16', endDate: '2026-10-29',
  sharedVia: 'email', sharedAt: new Date(thisYear, 9, 30, 12).toISOString(),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPets = [COOPER, { id: 'pet-mira', name: 'Mira' }];
  mockParams = { id: 'r1', pet: COOPER.id };
  mockReadOne.mockResolvedValue(ROW);
  mockOpen.mockResolvedValue({ kind: 'ok', html: '<html>as sent</html>' });
});

it('draws the stored copy as sent, locked, under its pet and date', async () => {
  const view = render(<SavedReportScreen />);
  await waitFor(() => expect(view.getByTestId('report-copy')).toBeTruthy());
  const web = view.getByTestId('report-copy');
  expect(web.props.source).toEqual({ html: '<html>as sent</html>' });
  expect(web.props.javaScriptEnabled).toBe(false);
  expect(web.props.onShouldStartLoadWithRequest({ url: 'https://example.com/x' })).toBe(false);
  expect(view.getByText('Cooper · Oct 30 report')).toBeTruthy();
  expect(view.getByText('The report as you sent it on Oct 30. Anything logged or changed since isn’t in it.')).toBeTruthy();
  expect(mockOpen).toHaveBeenCalledWith(COOPER.id, 'r1');
});

it('the one action makes a new report and says this copy stays as sent (WBC-4)', async () => {
  const view = render(<SavedReportScreen />);
  await waitFor(() => expect(view.getByTestId('report-new')).toBeTruthy());
  expect(view.getByText('New report through today')).toBeTruthy();
  expect(view.getByText('The Oct 30 copy stays exactly as sent')).toBeTruthy();
  expect(view.queryByText(/update/i)).toBeNull();
  fireEvent.press(view.getByTestId('report-new'));
  expect(mockPush).toHaveBeenCalledWith('/report');
});

it('a pet this account does not hold opens nothing and asks the server nothing', async () => {
  mockParams = { id: 'r1', pet: 'someone-elses-pet' };
  const view = render(<SavedReportScreen />);
  await waitFor(() => expect(view.getByTestId('report-unavailable')).toBeTruthy());
  expect(mockOpen).not.toHaveBeenCalled();
  expect(mockReadOne).not.toHaveBeenCalled();
  expect(view.queryByTestId('report-copy')).toBeNull();
});

it('a copy the server will not show (gone, or no longer the file sent) shows nothing', async () => {
  mockOpen.mockResolvedValue({ kind: 'unavailable' });
  const view = render(<SavedReportScreen />);
  await waitFor(() => expect(view.getByTestId('report-unavailable')).toBeTruthy());
  expect(view.queryByTestId('report-copy')).toBeNull();
  expect(view.queryByTestId('report-as-sent')).toBeNull();
});

it('offline says so and retries', async () => {
  mockOpen.mockResolvedValueOnce({ kind: 'offline' }).mockResolvedValueOnce({ kind: 'ok', html: '<html>as sent</html>' });
  const view = render(<SavedReportScreen />);
  await waitFor(() => expect(view.getByTestId('report-offline')).toBeTruthy());
  fireEvent.press(view.getByText('Try again'));
  await waitFor(() => expect(view.getByTestId('report-copy')).toBeTruthy());
});

it('bytes for an id whose row the owner cannot read are never drawn', async () => {
  mockReadOne.mockResolvedValue(null);
  const view = render(<SavedReportScreen />);
  await waitFor(() => expect(view.getByTestId('report-unavailable')).toBeTruthy());
  expect(view.queryByTestId('report-copy')).toBeNull();
});
