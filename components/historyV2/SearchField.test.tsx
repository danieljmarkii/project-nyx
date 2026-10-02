// The search field (HV-9 / CUL-1166; spec §3.7, AC 7, AC 39). It writes the REAL scope
// store after a pause, at once on the search key, and clears it on Cancel; it names only
// what search reads; and it spells its font family (the geistRollout guard's TextInput rule).

import { StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { SEARCH_WRITE_DELAY_MS, SearchField } from './SearchField';
import { theme } from '../../constants/theme';
import { searchPlaceholderOf } from '../../lib/historyControls';
import { SEARCH_READS_NOTES } from '../../lib/historyQueries';
import { useHistoryScopeStore } from '../../store/historyScopeStore';
import { usePetStore, type Pet } from '../../store/petStore';

jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../lib/sync', () => ({
  syncPendingFeedingArrangements: jest.fn(),
  syncPendingEvents: jest.fn(),
  ensureEventAttachmentsSynced: jest.fn(),
}));

const pet = (id: string, name: string) => ({ id, name, species: 'dog' }) as Pet;
const store = () => useHistoryScopeStore.getState();

beforeEach(() => {
  jest.useFakeTimers();
  act(() => usePetStore.setState({ activePet: null, pets: [] }));
  act(() => usePetStore.setState({ activePet: pet('p1', 'Nyx'), pets: [] }));
  act(() => {
    store().openSearch('p1');
  });
});
afterEach(() => jest.useRealTimers());

const field = () => render(<SearchField petId="p1" petName="Nyx" focusTick={0} />);

describe('SearchField', () => {
  it('names only what search reads: no notes until search reads them (AC 39)', () => {
    const view = field();
    const input = view.getByLabelText('Search Nyx\'s record');
    expect(input.props.placeholder).toBe(searchPlaceholderOf(SEARCH_READS_NOTES));
    expect(SEARCH_READS_NOTES).toBe(false);
    expect(input.props.placeholder).not.toMatch(/note/i);
  });

  it('spells its font family, since a TextInput has no ThemedText to derive one (geistRollout)', () => {
    const view = field();
    const style = StyleSheet.flatten(view.getByLabelText('Search Nyx\'s record').props.style) as { fontFamily?: string };
    expect(style.fontFamily).toBe(theme.fontBody);
  });

  it('hands the store one write after the typing rests, not one per keystroke', () => {
    const view = field();
    const writes: string[] = [];
    const unsubscribe = useHistoryScopeStore.subscribe((s, prev) => {
      if (s.searchText !== prev.searchText) writes.push(s.searchText);
    });
    const input = view.getByLabelText('Search Nyx\'s record');
    for (const text of ['r', 'ra', 'rab']) {
      fireEvent.changeText(input, text);
      act(() => {
        jest.advanceTimersByTime(SEARCH_WRITE_DELAY_MS - 1);
      });
    }
    expect(writes).toEqual([]);
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(writes).toEqual(['rab']);
    unsubscribe();
  });

  it('the search key hands the words over at once, and the pause after it writes nothing more', () => {
    const view = field();
    const input = view.getByLabelText('Search Nyx\'s record');
    fireEvent.changeText(input, 'motozol');
    fireEvent(input, 'submitEditing');
    expect(store().searchText).toBe('motozol');
    act(() => {
      store().setSearchText('p1', 'changed elsewhere');
      jest.advanceTimersByTime(SEARCH_WRITE_DELAY_MS * 2);
    });
    expect(store().searchText).toBe('changed elsewhere');
  });

  it('Cancel closes the search and clears it: nothing is kept', () => {
    const view = field();
    fireEvent.changeText(view.getByLabelText('Search Nyx\'s record'), 'rabbit');
    fireEvent.press(view.getByText('Cancel'));
    expect(store()).toMatchObject({ searchOpen: false, searchText: '' });
    act(() => {
      jest.advanceTimersByTime(SEARCH_WRITE_DELAY_MS * 2);
    });
    // The pending pause was cancelled with it: the field did not reopen the search.
    expect(store()).toMatchObject({ searchOpen: false, searchText: '' });
  });

  it('a field that unmounts mid-pause writes nothing afterwards', () => {
    const view = field();
    fireEvent.changeText(view.getByLabelText('Search Nyx\'s record'), 'rab');
    view.unmount();
    act(() => {
      jest.advanceTimersByTime(SEARCH_WRITE_DELAY_MS * 2);
    });
    expect(store().searchText).toBe('');
  });

  it('the Cancel control is a real button at the 44pt floor, labelled by its own words', () => {
    const view = field();
    const done = view.getByRole('button');
    expect(done.props.accessibilityLabel).toBeUndefined();
    // The platform's word for a control that throws the search away is Cancel; "Done"
    // promised to keep it (HV-12). The hint says what it does to the list.
    expect(done.props.accessibilityHint).toBe('Clears the search');
    const style = StyleSheet.flatten(done.props.style) as { minHeight?: number; minWidth?: number };
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
    expect(style.minWidth).toBeGreaterThanOrEqual(44);
  });
});
