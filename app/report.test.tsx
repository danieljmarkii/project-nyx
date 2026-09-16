// The send moment — R-16 (CUL-998): what the bar above "Send to vet" says BEFORE the
// owner sends.
//
// Two directions of test, split on purpose (C-18). The gap and documents cases are
// GUARDS: run against the pre-R-16 tree their strings do not exist, so each fails at
// its first `findByText` — red for the right reason, since the thing asserted is the
// string's presence. The two "renders neither / renders nothing" cases are refactor-
// safety tests — green before and after — pinning that an ordinary report still gets
// the ordinary send button and that an owner with no documents sees no line.
//
// There is deliberately NO `Set it up` here: the door was cut before shipping
// (CUL-1004, see app/report.tsx's header), and the gap state asserts its ABSENCE so
// the button cannot quietly return without the screen that makes it work.
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
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

import { fireEvent, render, waitFor } from '@testing-library/react-native';
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

// The pet is the REPORT's (C-9), so the line names what the document names.
const GAP_LINE = 'No allowed-food list is set for Mochi’s trial, so the report can’t check feedings against it.';
const DOCS_LINE = 'Your saved vet documents aren’t part of this report. Share them one at a time from Vet Files.';

beforeEach(() => {
  jest.clearAllMocks();
  mockedLibrary.mockResolvedValue([]);
});

describe('the allowed-list gap, before Send (CUL-861)', () => {
  it('a running trial with no list: the line and Send anyway — no plain Send to vet, and no Set it up', async () => {
    mockedGenerate.mockResolvedValue(report({ trialAllowedListMissing: true }));
    const { findByText, queryByText } = render(<ReportScreen />);
    expect(await findByText(GAP_LINE)).toBeTruthy();
    expect(queryByText('Send anyway')).toBeTruthy();
    // ONE send control: "Send anyway" is the send, labelled for what the owner just read.
    expect(queryByText('Send to vet')).toBeNull();
    // The door is CUL-1004; until a screen can set a running trial's diet there is none.
    expect(queryByText('Set it up')).toBeNull();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('the line names the report’s pet, and falls back to "your pet" when the report carries no name', async () => {
    mockedGenerate.mockResolvedValue(report({ trialAllowedListMissing: true, petName: '' }));
    const { findByText } = render(<ReportScreen />);
    expect(
      await findByText('No allowed-food list is set for your pet’s trial, so the report can’t check feedings against it.'),
    ).toBeTruthy();
  });

  it('a trial with a list: neither the line nor Send anyway — the ordinary send button', async () => {
    mockedGenerate.mockResolvedValue(report({ trialAllowedListMissing: false }));
    const { findByText, queryByText } = render(<ReportScreen />);
    expect(await findByText('Send to vet')).toBeTruthy();
    expect(queryByText(GAP_LINE)).toBeNull();
    expect(queryByText('Send anyway')).toBeNull();
    expect(queryByText('Set it up')).toBeNull();
  });

  it('Send anyway is the same send: it shares the report the screen is showing', async () => {
    const r = report({ trialAllowedListMissing: true });
    mockedGenerate.mockResolvedValue(r);
    const { findByText } = render(<ReportScreen />);
    fireEvent.press(await findByText('Send anyway'));
    await waitFor(() => expect(mockedShare).toHaveBeenCalledWith(r));
  });
});

describe('documents do not travel (CUL-457)', () => {
  const doc = { groupId: 'g1', title: 'Bloodwork', untitled: false };

  it('renders the line — fact and remedy — when the pet has a saved vet document', async () => {
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
