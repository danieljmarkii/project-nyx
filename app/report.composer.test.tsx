// The composer gate on the report screen (Vet report v2 PR-16, CUL-2296).
//
// Flag on and opted in: the screen opens on the composer and builds NOTHING until Preview; the
// window the owner chose is the one built (the app's own "since the last visit" as no override,
// so the report keeps its principled label; any other as dates); Back from the report returns to
// the composer. Flag off, or eligible but not opted in: the pre-composer screen, building at once
// (the absence differential: the composer namespace is never rendered).
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, useLocalSearchParams: () => ({}) }));
jest.mock('react-native-webview', () => ({ WebView: () => null }));
jest.mock('@react-native-community/datetimepicker', () => () => null);
jest.mock('../components/surfaces/waits/ReportSilhouette', () => ({ ReportSilhouette: () => null }));
jest.mock('../components/surfaces/waits/Tick', () => ({ Tick: () => null }));
jest.mock('../store/petStore', () => {
  const pet = { id: 'p1', name: 'Mochi' };
  const state = { activePet: pet, pets: [pet] };
  return {
    usePetStore: Object.assign(
      (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state),
      { getState: () => state },
    ),
  };
});
jest.mock('../lib/supabase', () => ({ supabase: { functions: { invoke: jest.fn() }, from: jest.fn() } }));
jest.mock('../lib/pdf', () => ({
  flushBeforeReport: jest.fn(async () => ({ pending: 0, quarantined: 0 })),
  reportFreshnessLine: () => null,
  generateVetReport: jest.fn(),
  shareReportPdf: jest.fn(async () => true),
}));
jest.mock('../lib/vetDocumentLibrary', () => ({ readVetLibrary: jest.fn(async () => []) }));
jest.mock('../lib/vetFilesEntry', () => ({ VET_FILES_ENTRY_ENABLED: false }));
let mockEligible = true;
let mockOptedIn = true;
jest.mock('../hooks/useAppConfig', () => ({ useAllowlistFlag: () => mockEligible }));
jest.mock('../lib/betaFeatures', () => ({ useBetaOptIn: () => mockOptedIn }));
// The composer's namespace stands in as a probe: the screen's gate is what is under test here;
// the composer's own states are pinned in components/report/ReportComposer.test.tsx.
const mockWindows = {
  since_visit: { kind: 'since_visit', startDate: '2026-06-01', endDate: '2026-07-02', days: 32, isDefault: true },
  last_30: { kind: 'last_30', startDate: '2026-06-03', endDate: '2026-07-02', days: 30, isDefault: false },
};
jest.mock('../components/report/ReportComposer', () => {
  const { Pressable, Text, View } = require('react-native');
  const React = require('react');
  return {
    ReportComposer: (p: { petName: string; onPreview: (w: unknown) => void; onFallback: () => void }) =>
      React.createElement(
        View,
        { testID: 'composer' },
        React.createElement(Text, null, `composer for ${p.petName}`),
        React.createElement(Pressable, { testID: 'preview-visit', onPress: () => p.onPreview(mockWindows.since_visit) }),
        React.createElement(Pressable, { testID: 'preview-30', onPress: () => p.onPreview(mockWindows.last_30) }),
        React.createElement(Pressable, { testID: 'fallback', onPress: () => p.onFallback() }),
      ),
  };
});

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { generateVetReport, type VetReport } from '../lib/pdf';
import ReportScreen from './report';

const mockedGenerate = generateVetReport as jest.Mock;
const report: VetReport = {
  html: '<html>Mochi</html>',
  petName: 'Mochi',
  startDate: '2026-06-01',
  endDate: '2026-07-02',
  scopeBasis: 'since_visit',
  photoCount: 0,
  trialAllowedListMissing: false,
  reportVersion: 'v1',
  ownerSurname: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockEligible = true;
  mockOptedIn = true;
  mockedGenerate.mockResolvedValue(report);
});

describe('the composer gate (CUL-2296)', () => {
  it('flag on: opens on the composer, names the record’s pet, and builds nothing', async () => {
    const r = render(<ReportScreen />);
    await act(async () => {});
    expect(r.getByTestId('composer')).toBeTruthy();
    expect(r.getByText('Vet report for Mochi')).toBeTruthy();
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  it('the report’s own default window builds with no override, so the report keeps its own label', async () => {
    const r = render(<ReportScreen />);
    fireEvent.press(r.getByTestId('preview-visit'));
    await waitFor(() => expect(mockedGenerate).toHaveBeenCalledTimes(1));
    expect(mockedGenerate.mock.calls[0][0]).toEqual({ petId: 'p1', includeNotes: true });
  });

  it('any other window builds with its dates', async () => {
    const r = render(<ReportScreen />);
    fireEvent.press(r.getByTestId('preview-30'));
    await waitFor(() => expect(mockedGenerate).toHaveBeenCalledTimes(1));
    expect(mockedGenerate.mock.calls[0][0]).toMatchObject({ petId: 'p1', startDate: '2026-06-03', endDate: '2026-07-02' });
  });

  it('Back from the report returns to the composer, not out of the screen', async () => {
    const r = render(<ReportScreen />);
    fireEvent.press(r.getByTestId('preview-30'));
    await r.findByText('Send to vet');
    fireEvent.press(r.getByLabelText('Back'));
    expect(r.getByTestId('composer')).toBeTruthy();
  });

  it('arriving from the composer, the report names the chosen window once and offers no second range control', async () => {
    const r = render(<ReportScreen />);
    fireEvent.press(r.getByTestId('preview-30'));
    await r.findByText('Send to vet');
    expect(r.getByTestId('report-chosen-window')).toHaveTextContent(/^Last 30 days · Jun 3 to Jul 2/);
    expect(r.queryByText('Custom…')).toBeNull();
    expect(r.queryByLabelText(/^Start date,/)).toBeNull();
  });

  it('the fallback builds the report’s own window, no dates sent', async () => {
    const r = render(<ReportScreen />);
    fireEvent.press(r.getByTestId('fallback'));
    await waitFor(() => expect(mockedGenerate).toHaveBeenCalledTimes(1));
    expect(mockedGenerate.mock.calls[0][0]).toEqual({ petId: 'p1', includeNotes: true });
  });

  it.each([
    ['not eligible', false, true],
    ['eligible, not opted in', true, false],
  ])('flag off (%s): the pre-composer screen, building at once', async (_label, eligible, opted) => {
    mockEligible = eligible;
    mockOptedIn = opted;
    const r = render(<ReportScreen />);
    await r.findByText('Send to vet');
    expect(r.queryByTestId('composer')).toBeNull();
    expect(mockedGenerate).toHaveBeenCalledTimes(1);
  });
});
