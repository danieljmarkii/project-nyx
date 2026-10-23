// CUL-2168 (C-12) — a read that hasn't answered is never an empty record. `recent` and
// `library` start as [], so before this the first frame and every failed read said "No
// medications yet" to an owner with a full library, and one who believed it could
// capture the bottle again: a second medication row whose doses sit outside the course.
jest.mock('../../lib/db', () => ({
  getRecentMedications: jest.fn(),
  getLibraryMedications: jest.fn(),
}));
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return {
    // Fire the focus callback on mount and whenever its identity changes, as the real
    // hook does while focused (Try again re-runs the load in place).
    useFocusEffect: (cb: () => void | (() => void)) => {
      React.useEffect(() => cb(), [cb]);
    },
  };
});

import { render, fireEvent } from '@testing-library/react-native';
import { MedicationPicker, MED_READ_FAILED } from './MedicationPicker';
import { PICKER_SILHOUETTE_TEST_ID } from '../surfaces/waits/PickerSilhouette';
import * as db from '../../lib/db';
import type { PickerMedication } from '../../lib/db';

const DB = db as jest.Mocked<typeof db>;
const EMPTY = "No medications yet. Add one above and we'll keep it handy for next time.";
const hidden = { includeHiddenElements: true };

const med = (id: string, generic: string): PickerMedication =>
  ({ id, generic_name: generic, brand_name: null, strength: null, form: null, default_route: null });
const LIBRARY = [med('m1', 'Maropitant'), med('m2', 'Omeprazole')];

function renderPicker() {
  return render(<MedicationPicker petId="p1" onPickMedication={jest.fn()} onAddNew={jest.fn()} />);
}

beforeEach(() => {
  jest.clearAllMocks();
  DB.getRecentMedications.mockResolvedValue([]);
  DB.getLibraryMedications.mockResolvedValue(LIBRARY);
});

describe('MedicationPicker — the read’s three states below "has rows" (CUL-2168)', () => {
  it('while the read is unanswered: the silhouette, never the empty copy', () => {
    DB.getLibraryMedications.mockReturnValue(new Promise(() => {}));
    const { getByTestId, queryByText } = renderPicker();
    expect(getByTestId(PICKER_SILHOUETTE_TEST_ID, hidden)).toBeTruthy();
    expect(queryByText(EMPTY)).toBeNull();
    expect(queryByText(MED_READ_FAILED)).toBeNull();
    expect(queryByText('Add a medication')).toBeTruthy();
  });

  it('once a read answers with nothing: the empty copy, and no silhouette', async () => {
    DB.getLibraryMedications.mockResolvedValue([]);
    const { findByText, queryByTestId, queryByText } = renderPicker();
    expect(await findByText(EMPTY)).toBeTruthy();
    expect(queryByTestId(PICKER_SILHOUETTE_TEST_ID, hidden)).toBeNull();
    expect(queryByText(MED_READ_FAILED)).toBeNull();
  });

  it('once a read answers with rows: the tiles, and no silhouette', async () => {
    const { findByText, queryByTestId, queryByText } = renderPicker();
    expect(await findByText('Maropitant')).toBeTruthy();
    expect(queryByTestId(PICKER_SILHOUETTE_TEST_ID, hidden)).toBeNull();
    expect(queryByText(EMPTY)).toBeNull();
  });

  it('when the read throws: the quiet band, never the empty copy, and Try again reads again', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    DB.getLibraryMedications.mockRejectedValue(new Error('SQLITE_BUSY'));
    const { findByText, getByText, queryByText, queryByTestId } = renderPicker();
    expect(await findByText(MED_READ_FAILED)).toBeTruthy();
    expect(queryByText(EMPTY)).toBeNull();
    expect(queryByTestId(PICKER_SILHOUETTE_TEST_ID, hidden)).toBeNull();
    expect(getByText('Add a medication')).toBeTruthy();

    DB.getLibraryMedications.mockResolvedValue(LIBRARY);
    fireEvent.press(getByText('Try again'));
    expect(await findByText('Maropitant')).toBeTruthy();
    expect(queryByText(MED_READ_FAILED)).toBeNull();
    expect(DB.getLibraryMedications).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
