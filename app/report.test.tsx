// The send moment — R-16 (CUL-998): what the bar above "Send to vet" says BEFORE the
// owner sends, and the two doors it opens.
//
// Two directions of test, split on purpose (C-18): the gap and documents cases are
// GUARDS and were run red against the pre-R-16 tree (the strings did not exist); the
// "a trial with a list renders neither" case is a refactor-safety test — green before
// and after — pinning that an ordinary report still gets the ordinary send button.
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
// The one-shot re-focus regenerate is only testable if the harness can FIRE a re-focus:
// the registered callback is kept so a test can call it, as rundown.test.tsx does.
const focusCb: { current: null | (() => void | (() => void)) } = { current: null };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = require('react');
    focusCb.current = cb;
    useEffect(() => cb(), [cb]);
  },
}));
jest.mock('react-native-webview', () => ({ WebView: () => null }));
jest.mock('@react-native-community/datetimepicker', () => () => null);
jest.mock('../components/brand/NightMoment', () => ({ NightMoment: () => null }));
jest.mock('../components/brand/WhorlSpinner', () => ({ WhorlSpinner: () => null }));
// Noticed's toggle stays off: its gate is not this suite's subject.
jest.mock('../hooks/useAppConfig', () => ({ useAllowlistFlag: () => false }));
jest.mock('../lib/betaFeatures', () => ({ useBetaOptIn: () => false }));
jest.mock('../store/petStore', () => {
  const state = { activePet: { id: 'p1', name: 'Mochi' } };
  return {
    usePetStore: Object.assign(
      (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state),
      { getState: () => state },
    ),
  };
});
jest.mock('../lib/pdf', () => ({
  flushBeforeReport: jest.fn(async () => ({ pending: 0, quarantined: 0 })),
  reportFreshnessLine: () => null,
  generateVetReport: jest.fn(),
  shareReportPdf: jest.fn(async () => true),
}));
// The documents read is the profile card's read; the entry gate is on, as shipped.
jest.mock('../lib/vetDocumentLibrary', () => ({ readVetLibrary: jest.fn(async () => []) }));
jest.mock('../lib/vetFilesEntry', () => ({ VET_FILES_ENTRY_ENABLED: true }));

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { generateVetReport, shareReportPdf, type VetReport } from '../lib/pdf';
import { readVetLibrary } from '../lib/vetDocumentLibrary';
import ReportScreen from './report';

const mockedGenerate = generateVetReport as jest.Mock;
const mockedShare = shareReportPdf as jest.Mock;
const mockedLibrary = readVetLibrary as jest.Mock;

const report = (over: Partial<VetReport> = {}): VetReport => ({
  html: '<html>Mochi</html>',
  petName: 'Mochi',
  startDate: '2026-06-22',
  endDate: '2026-07-02',
  scopeBasis: 'diet_trial',
  photoCount: 0,
  trialAllowedListMissing: false,
  ...over,
});

const GAP_LINE = 'No allowed-food list is set for this trial, so the report can’t check feedings against it.';
const DOCS_LINE = 'Your saved vet documents aren’t part of this report.';

beforeEach(() => {
  jest.clearAllMocks();
  focusCb.current = null;
  mockedLibrary.mockResolvedValue([]);
});

describe('the allowed-list gap, before Send (CUL-861)', () => {
  it('a running trial with no list: the line, Set it up and Send anyway — and no plain Send to vet', async () => {
    mockedGenerate.mockResolvedValue(report({ trialAllowedListMissing: true }));
    const { findByText, queryByText } = render(<ReportScreen />);
    expect(await findByText(GAP_LINE)).toBeTruthy();
    expect(queryByText('Set it up')).toBeTruthy();
    expect(queryByText('Send anyway')).toBeTruthy();
    // ONE send control: "Send anyway" is the send, labelled for what the owner just read.
    expect(queryByText('Send to vet')).toBeNull();
  });

  it('a trial with a list: neither the line nor the two controls — the ordinary send button', async () => {
    mockedGenerate.mockResolvedValue(report({ trialAllowedListMissing: false }));
    const { findByText, queryByText } = render(<ReportScreen />);
    expect(await findByText('Send to vet')).toBeTruthy();
    expect(queryByText(GAP_LINE)).toBeNull();
    expect(queryByText('Set it up')).toBeNull();
    expect(queryByText('Send anyway')).toBeNull();
  });

  it('Send anyway is the same send: it shares the report the screen is showing', async () => {
    const r = report({ trialAllowedListMissing: true });
    mockedGenerate.mockResolvedValue(r);
    const { findByText } = render(<ReportScreen />);
    fireEvent.press(await findByText('Send anyway'));
    await waitFor(() => expect(mockedShare).toHaveBeenCalledWith(r));
  });

  it('Set it up opens the allowed-set screen, and coming back rebuilds the report ONCE', async () => {
    mockedGenerate.mockResolvedValue(report({ trialAllowedListMissing: true }));
    const { findByText } = render(<ReportScreen />);
    fireEvent.press(await findByText('Set it up'));
    expect(router.push).toHaveBeenCalledWith('/trial-foods');
    expect(mockedGenerate).toHaveBeenCalledTimes(1);

    // The owner comes back with a list made: one rebuild, so the line and the document
    // reflect it. The rebuilt report says the list exists → the ordinary send returns.
    mockedGenerate.mockResolvedValue(report({ trialAllowedListMissing: false }));
    await act(async () => {
      focusCb.current?.();
    });
    await waitFor(() => expect(mockedGenerate).toHaveBeenCalledTimes(2));
    expect(await findByText('Send to vet')).toBeTruthy();

    // A SECOND focus with no Set it up in between is not a rebuild — the request was
    // consumed, not left armed (the C-22 double-fire is exactly what a ref prevents).
    await act(async () => {
      focusCb.current?.();
    });
    expect(mockedGenerate).toHaveBeenCalledTimes(2);
  });

  it('a plain re-focus (no Set it up) never rebuilds', async () => {
    mockedGenerate.mockResolvedValue(report({ trialAllowedListMissing: true }));
    const { findByText } = render(<ReportScreen />);
    await findByText('Set it up');
    await act(async () => {
      focusCb.current?.();
    });
    expect(mockedGenerate).toHaveBeenCalledTimes(1);
  });
});

describe('documents do not travel (CUL-457)', () => {
  const doc = { groupId: 'g1', title: 'Bloodwork', untitled: false };

  it('renders the line when the pet has a saved vet document', async () => {
    mockedGenerate.mockResolvedValue(report());
    mockedLibrary.mockResolvedValue([doc]);
    const { findByText } = render(<ReportScreen />);
    expect(await findByText(DOCS_LINE)).toBeTruthy();
    expect(mockedLibrary).toHaveBeenCalledWith('p1');
  });

  it('renders nothing about documents when the pet has none', async () => {
    mockedGenerate.mockResolvedValue(report());
    mockedLibrary.mockResolvedValue([]);
    const { findByText, queryByText } = render(<ReportScreen />);
    await findByText('Send to vet');
    expect(queryByText(DOCS_LINE)).toBeNull();
  });

  it('a failed read is silence, never a claim — and never blocks the send', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockedGenerate.mockResolvedValue(report());
    mockedLibrary.mockRejectedValue(new Error('sqlite closed'));
    const { findByText, queryByText } = render(<ReportScreen />);
    await findByText('Send to vet');
    await waitFor(() => expect(warn).toHaveBeenCalled());
    expect(queryByText(DOCS_LINE)).toBeNull();
    warn.mockRestore();
  });
});
