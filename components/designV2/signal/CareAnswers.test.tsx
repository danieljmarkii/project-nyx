// EN-9's answers on the finding screen (Engines v3 PR-35, CUL-1418; mock round 3 §01 1b,
// §02 2a–2b, §03 3e). What must hold: an answer is offered only on a concern that still asks;
// "My vet knows" writes ONE dated fact for ONE sign; "Not yet" writes nothing; Undo is a new
// row; and a save the server has not seen says so.

const mockRecord = jest.fn(async (_input: Record<string, unknown>) => 'answer-1');
const mockRetract = jest.fn(async (_id: string) => 'undo-1');
const mockPush = jest.fn(async () => undefined);
let mockLanded = true;
let mockRecordState: { trial: unknown; courses: unknown[]; latestVisit: unknown } = { trial: null, courses: [], latestVisit: null };
jest.mock('../../../lib/careAnswers', () => ({
  recordCareAnswer: (input: Record<string, unknown>) => mockRecord(input),
  retractCareAnswer: (id: string) => mockRetract(id),
  pushCareAnswers: () => mockPush(),
  careAnswerLanded: jest.fn(async () => mockLanded),
  readCareQuestionRecord: jest.fn(async () => mockRecordState),
}));
const mockSettle = jest.fn(async (_k: string, _d: string) => undefined);
jest.mock('../../../lib/careQuestionAsked', () => ({
  mayAskCareQuestion: jest.fn(async () => true),
  careQuestionShownToday: jest.fn(async () => null),
  markCareQuestionShown: jest.fn(async () => undefined),
  settleCareQuestion: (k: string, d: string) => mockSettle(k, d),
}));
const mockPushRoute = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (a: unknown) => mockPushRoute(a) } }));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { toLocalDayKey } from '../../../lib/utils';
import type { CareStateView } from '../../../lib/careState';
import { CareAnswers, NOT_YET_LINE, TAKEN_BACK } from './CareAnswers';

const RAISED: CareStateView = { state: 'raised', sign: 'diarrhea', text: null, backLine: null };

function renderAnswers(view: CareStateView = RAISED) {
  return render(
    <CareAnswers petId="pet-a" petName="Otis" view={view} noun="loose stool" title="Loose stool in 5 of the last 5 weeks" onsetIso="2026-08-29" />,
  );
}

beforeEach(() => {
  mockRecord.mockClear();
  mockRetract.mockClear();
  mockSettle.mockClear();
  mockPushRoute.mockClear();
  mockLanded = true;
  mockRecordState = { trial: null, courses: [], latestVisit: null };
});

it('renders nothing on a concern the vet already knows about: there is no ask to answer', () => {
  renderAnswers({ state: 'with_vet', sign: 'diarrhea', text: 'x', backLine: null });
  expect(screen.queryByTestId('care-answers')).toBeNull();
  renderAnswers({ state: 'recheck_booked', sign: 'diarrhea', text: 'x', backLine: null });
  expect(screen.queryByTestId('care-answers')).toBeNull();
});

it('"My vet knows" writes one dated fact for this sign, then says what was recorded and what Home now does', async () => {
  renderAnswers();
  fireEvent.press(screen.getByText('My vet knows'));
  await waitFor(() => expect(screen.getByTestId('care-answers-told')).toBeTruthy());
  expect(mockRecord).toHaveBeenCalledTimes(1);
  expect(mockRecord).toHaveBeenCalledWith({ petId: 'pet-a', sign: 'diarrhea', source: 'my_vet_knows', anchorOn: toLocalDayKey(new Date()) });
  expect(screen.getByText(/that Otis' vet knows about the loose stool\./)).toBeTruthy();
  expect(screen.getByText(/Home will stop asking you to book/)).toBeTruthy();
  expect(screen.queryByTestId('care-answers-offline')).toBeNull();
});

it('a save the server has not seen says Home updates once back online (mock 3e)', async () => {
  mockLanded = false;
  renderAnswers();
  fireEvent.press(screen.getByText('My vet knows'));
  expect(await screen.findByTestId('care-answers-offline')).toBeTruthy();
});

it('Undo writes a retraction of that answer, and Home will ask again', async () => {
  renderAnswers();
  fireEvent.press(screen.getByText('My vet knows'));
  fireEvent.press(await screen.findByText('Undo'));
  await waitFor(() => expect(mockRetract).toHaveBeenCalledWith('answer-1'));
  expect(await screen.findByText(TAKEN_BACK)).toBeTruthy();
  // The answers are back: the concern asks again.
  expect(screen.getByText('My vet knows')).toBeTruthy();
});

it('"Not yet" writes nothing, and stays', () => {
  renderAnswers();
  fireEvent.press(screen.getByText('Not yet'));
  expect(mockRecord).not.toHaveBeenCalled();
  expect(screen.getByText(NOT_YET_LINE)).toBeTruthy();
  expect(screen.getByText('Not yet')).toBeTruthy();
});

it('"Book a visit" is a door: the booking form, for THIS pet, with the finding as its reason', () => {
  renderAnswers();
  fireEvent.press(screen.getByText('Book a visit'));
  expect(mockPushRoute).toHaveBeenCalledWith({
    pathname: '/vet-visits',
    params: { add: 'booked', pet: 'pet-a', reason: 'Loose stool in 5 of the last 5 weeks' },
  });
  expect(mockRecord).not.toHaveBeenCalled();
});

it('PMD-4 A: a running trial gets the one question; yes is scoped to the trial, from its first day', async () => {
  mockRecordState = { trial: { id: 't1', startedAt: '2026-09-01', foodLabel: 'hydrolyzed' }, courses: [], latestVisit: null };
  renderAnswers();
  expect(await screen.findByTestId('care-question')).toBeTruthy();
  fireEvent.press(screen.getByText('Yes, for this'));
  await waitFor(() => expect(mockRecord).toHaveBeenCalledTimes(1));
  expect(mockRecord).toHaveBeenCalledWith({
    petId: 'pet-a', sign: 'diarrhea', source: 'vet_started_trial', anchorOn: '2026-09-01', dietTrialId: 't1',
  });
});

it('"No" and "Not sure" write nothing and settle the question; "Later" writes nothing and leaves it askable', async () => {
  mockRecordState = { trial: { id: 't1', startedAt: '2026-09-01', foodLabel: null }, courses: [], latestVisit: null };
  renderAnswers();
  fireEvent.press(await screen.findByText('Not sure'));
  expect(mockSettle).toHaveBeenCalledWith('trial:t1:diarrhea', expect.any(String));
  expect(screen.queryByTestId('care-question')).toBeNull();
  expect(mockRecord).not.toHaveBeenCalled();

  mockSettle.mockClear();
  mockRecordState = { trial: null, courses: [], latestVisit: { id: 'v1', visitedAt: '2026-09-16' } };
  renderAnswers();
  fireEvent.press(await screen.findByText('Later'));
  expect(mockSettle).not.toHaveBeenCalled();
  expect(mockRecord).not.toHaveBeenCalled();
});

it('a double tap writes ONE answer, so an Undo takes back everything it says it does', async () => {
  let release: (v: string) => void = () => {};
  mockRecord.mockImplementationOnce(() => new Promise<string>((r) => { release = r; }));
  renderAnswers();
  const button = screen.getByText('My vet knows');
  // Both taps in ONE act: no re-render between them, as two taps inside one frame on a device.
  act(() => {
    fireEvent.press(button);
    fireEvent.press(button);
  });
  release('answer-1');
  await screen.findByTestId('care-answers-told');
  expect(mockRecord).toHaveBeenCalledTimes(1);
});

it('a concern that came back asks no question about the past (adversarial F1): only the three answers', async () => {
  mockRecordState = {
    trial: { id: 't1', startedAt: '2026-09-01', foodLabel: null },
    courses: [],
    latestVisit: { id: 'v1', visitedAt: '2026-09-16' },
  };
  const { readCareQuestionRecord } = jest.requireMock('../../../lib/careAnswers');
  (readCareQuestionRecord as jest.Mock).mockClear();
  renderAnswers({ state: 'raised_again', sign: 'diarrhea', text: 'Back because x. y', backLine: 'Back because x.' });
  expect(screen.getByText('My vet knows')).toBeTruthy();
  await waitFor(() => expect(screen.queryByTestId('care-question')).toBeNull());
  // The read never runs for it: nothing asks about the trial or the visit.
  expect(readCareQuestionRecord).not.toHaveBeenCalled();
});
