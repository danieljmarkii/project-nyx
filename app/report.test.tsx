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
// The route's `?pet=` (CUL-1334). Absent unless a test sets it: every pre-existing case
// is the active pet's report, the fallback every door but the trial screen's takes.
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('react-native-webview', () => ({ WebView: () => null }));
jest.mock('@react-native-community/datetimepicker', () => () => null);
// The two retired waits and the two Design v2 ones, each a marker: the D2-7 cases below
// assert the retired ones never come back, and the send-moment cases never see any of them.
jest.mock('../components/brand/NightMoment', () => {
  const { Text } = require('react-native');
  const React = require('react');
  return {
    NightMoment: ({ visible }: { visible: boolean }) =>
      visible ? React.createElement(Text, { testID: 'night-moment' }, 'night') : null,
  };
});
jest.mock('../components/brand/WhorlSpinner', () => {
  const { Text } = require('react-native');
  const React = require('react');
  return { WhorlSpinner: () => React.createElement(Text, { testID: 'whorl' }, 'whorl') };
});
jest.mock('../components/designV2/waits/ReportSilhouette', () => {
  const { Text } = require('react-native');
  const React = require('react');
  return {
    ReportSilhouette: ({ petName, working }: { petName: string; working: boolean }) =>
      React.createElement(Text, { testID: 'report-silhouette' }, `${petName} ${working}`),
  };
});
jest.mock('../components/designV2/waits/Tick', () => {
  const { Text } = require('react-native');
  const React = require('react');
  return {
    Tick: ({ working }: { working: boolean }) => React.createElement(Text, { testID: 'tick' }, String(working)),
  };
});
jest.mock('../store/petStore', () => {
  // Two pets, Mochi active. Biscuit is the one a `?pet=` names; `p-archived` is in
  // neither list, as an archived pet or a stale link is (the list holds non-archived pets).
  const mochi = { id: 'p1', name: 'Mochi' };
  const state = { activePet: mochi, pets: [mochi, { id: 'p2', name: 'Biscuit' }] };
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

// The pet is the REPORT's (C-9), so the line names what the document names.
const GAP_LINE = 'No allowed-food list is set for Mochi’s trial, so the report can’t check feedings against it.';
const DOCS_LINE = 'Your saved vet documents aren’t part of this report. Share them one at a time from Vet Files.';

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockedLibrary.mockResolvedValue([]);
});

// D2-7 (CUL-1068; GA by CUL-1071) — the report's waits: its own silhouette and the tick.
describe('the waits (D2-7)', () => {
  it('the first build is the silhouette naming the pet with the tick working; no night moment', () => {
    mockedGenerate.mockReturnValue(new Promise(() => {}));
    const { getByTestId, queryByTestId } = render(<ReportScreen />);
    expect(getByTestId('report-silhouette').props.children).toBe('Mochi true');
    expect(queryByTestId('night-moment')).toBeNull();
    expect(queryByTestId('whorl')).toBeNull();
  });

  it('the silhouette leaves when the report lands, and a refresh is the tick, not the whorl', async () => {
    mockedGenerate.mockResolvedValue(report());
    const { getByTestId, queryByTestId, findByText } = render(<ReportScreen />);
    await findByText('Send to vet');
    expect(queryByTestId('report-silhouette')).toBeNull();
    mockedGenerate.mockReturnValue(new Promise(() => {}));
    fireEvent.press(await findByText('Custom…'));
    expect((await screenFind(getByTestId, 'tick')).props.children).toBe('true');
    expect(queryByTestId('whorl')).toBeNull();
    expect(queryByTestId('night-moment')).toBeNull();
  });
});

async function screenFind(getByTestId: (id: string) => ReturnType<typeof render>['UNSAFE_root'], id: string) {
  let node: unknown;
  await waitFor(() => {
    node = getByTestId(id);
  });
  return node as { props: { children: unknown } };
}

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

// CUL-1334 — the report takes a pet. The two GUARD cases (a named non-active pet, an
// unknown one) red on the pre-CUL-1334 tree, which read `activePet` and ignored the
// route: the first builds Mochi's report, the second builds Mochi's report instead of
// refusing. The no-param case is refactor-safety (green before and after).
describe('whose report: /report?pet= (CUL-1334)', () => {
  it('no ?pet=: the active pet’s report, as every existing door expects', async () => {
    mockedGenerate.mockResolvedValue(report());
    const { findByText } = render(<ReportScreen />);
    await findByText('Send to vet');
    expect(mockedGenerate).toHaveBeenCalledWith({ petId: 'p1', includeNotes: true });
    expect(mockedLibrary).toHaveBeenCalledWith('p1');
  });

  it('?pet= a pet that is not the active one: every read takes THAT pet, and the wait names it', async () => {
    mockParams = { pet: 'p2' };
    mockedGenerate.mockReturnValue(new Promise(() => {}));
    const { getByTestId } = render(<ReportScreen />);
    // The wait names the report's pet, never the active one (C-9).
    expect(getByTestId('report-silhouette').props.children).toBe('Biscuit true');
    await waitFor(() => expect(mockedGenerate).toHaveBeenCalled());
    expect(mockedGenerate.mock.calls.every(([p]) => p.petId === 'p2')).toBe(true);
    expect(mockedLibrary.mock.calls).toEqual([['p2']]);
  });

  it('?pet= a pet the account does not hold: the pet-gone line, no report built, no fallback', async () => {
    mockParams = { pet: 'p-archived' };
    mockedGenerate.mockResolvedValue(report());
    const { findByTestId, queryByText, queryByTestId } = render(<ReportScreen />);
    expect((await findByTestId('report-pet-gone')).props.children).toBe(
      'This pet isn’t in your account any more.',
    );
    // An absence proves the refusal only because the generator WOULD answer if asked.
    await act(async () => {});
    expect(mockedGenerate).not.toHaveBeenCalled();
    expect(mockedLibrary).not.toHaveBeenCalled();
    expect(queryByText('Send to vet')).toBeNull();
    expect(queryByText('Report range')).toBeNull();
    expect(queryByTestId('night-moment')).toBeNull();
  });
});

// Noticed is GA (CUL-876): the notes switch is on every report screen, defaults on,
// and governs the build. (CUL-1464's hidden-switch cases went with the flag that hid it.)
describe('Noticed notes in the build (CUL-876)', () => {
  const sent = () => mockedGenerate.mock.calls.map(([p]) => p.includeNotes);

  it('the switch shows, defaults on, and turning it off rebuilds with false', async () => {
    mockedGenerate.mockResolvedValue(report());
    const { findByText, getByLabelText } = render(<ReportScreen />);
    await findByText('Send to vet');
    expect(sent()).toEqual([true]);
    fireEvent(getByLabelText('Include your Noticed notes in the report'), 'valueChange', false);
    await waitFor(() => expect(sent()).toEqual([true, false]));
  });

  // The retired CUL-1464 bug was a build issued under a HIDDEN switch. The switch and the
  // build share one condition today (a resolved pet); this pins it, so a refactor that
  // moves the switch under a range or species gate reds here.
  it.each([
    ['the active pet', {}],
    ['?pet= another pet the account holds', { pet: 'p2' }],
  ])('a build for %s is always issued under a visible switch, and sends its value', async (_name, params) => {
    mockParams = params;
    mockedGenerate.mockResolvedValue(report());
    const { findByText, getByLabelText } = render(<ReportScreen />);
    await findByText('Send to vet');
    expect(mockedGenerate).toHaveBeenCalled();
    expect(getByLabelText('Include your Noticed notes in the report').props.value).toBe(true);
    expect(sent().every((v) => v === true)).toBe(true);
  });
});
