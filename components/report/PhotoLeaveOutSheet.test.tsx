// Vet report v2 PR-23b (CUL-2454): the photo picker hands its choice back once, on Done.
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { PhotoLeaveOutSheet } from './PhotoLeaveOutSheet';
import type { ReportPhoto } from '../../lib/reportPhotoPicker';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
const mockThumbs = jest.fn<Promise<Map<string, string>>, [readonly string[]]>();
jest.mock('../../lib/reportPhotoThumbs', () => ({ readPickerThumbs: (ids: readonly string[]) => mockThumbs(ids) }));

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const noon = (m: number, d: number) => new Date(2026, m - 1, d, 12).toISOString();
const PHOTOS: ReportPhoto[] = [
  { attachmentId: A, eventId: 'e1', type: 'vomit', occurredAt: noon(7, 2), safety: 'blood' },
  { attachmentId: B, eventId: 'e2', type: 'diarrhea', occurredAt: noon(6, 28), safety: null },
];

beforeEach(() => {
  mockThumbs.mockReset();
  mockThumbs.mockResolvedValue(new Map([[B, 'file:///b.jpg']]));
});

function setup(leftOut: string[] = []) {
  const onDone = jest.fn();
  const onClose = jest.fn();
  const utils = render(<PhotoLeaveOutSheet visible photos={PHOTOS} leftOut={leftOut} onDone={onDone} onClose={onClose} />);
  return { ...utils, onDone, onClose };
}

it('toggles change nothing until Done, which hands the whole choice back once', async () => {
  const { getByTestId, onDone } = setup();
  await waitFor(() => expect(mockThumbs).toHaveBeenCalledWith([A, B]));
  fireEvent.press(getByTestId(`photo-row-${A}`));
  fireEvent.press(getByTestId(`photo-row-${B}`));
  fireEvent.press(getByTestId(`photo-row-${B}`));
  expect(onDone).not.toHaveBeenCalled();
  fireEvent.press(getByTestId('photo-leave-out-done'));
  expect(onDone).toHaveBeenCalledTimes(1);
  expect(onDone).toHaveBeenCalledWith([A]);
});

it('a flagged photo is marked, and can still be left out', async () => {
  const { getByTestId, getByText, onDone } = setup();
  await act(async () => {});
  expect(getByText('Flagged: blood seen')).toBeTruthy();
  const row = getByTestId(`photo-row-${A}`);
  expect(row.props.accessibilityState).toEqual({ checked: true });
  fireEvent.press(row);
  expect(getByTestId(`photo-row-${A}`).props.accessibilityState).toEqual({ checked: false });
  expect(getByText('Done · sending 1 of 2')).toBeTruthy();
  fireEvent.press(getByTestId('photo-leave-out-done'));
  expect(onDone).toHaveBeenCalledWith([A]);
});

it('opens on the choice the report was built with', async () => {
  const { getByTestId, getAllByText } = setup([B]);
  await act(async () => {});
  expect(getByTestId(`photo-row-${B}`).props.accessibilityState).toEqual({ checked: false });
  expect(getAllByText('Left out')).toHaveLength(1);
});

it('closing without Done never hands a choice back', async () => {
  const { getByTestId, getByLabelText, onDone, onClose } = setup();
  await act(async () => {});
  fireEvent.press(getByTestId(`photo-row-${A}`));
  fireEvent.press(getByLabelText('Close without changes', { includeHiddenElements: true }));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onDone).not.toHaveBeenCalled();
});
