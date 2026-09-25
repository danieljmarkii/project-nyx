// The window sheet's wiring (HV-9 / CUL-1166; spec §3.9). The rows are
// `lib/historyControls.ts`'s, from HV-3's one window table, and table-tested there; this
// file proves the sheet draws them, names the pill by the applied window's short name
// while its row stays selected, writes the window a row stands for to the REAL scope
// store, and closes on a pet switch (AC 13).

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
// The rows' module reaches lib/supabase (an import-time env guard) through HV-4's numbers
// (lib/analytics → feedingArrangements → sync); nothing here reads a table.
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../lib/sync', () => ({
  syncPendingFeedingArrangements: jest.fn(),
  syncPendingEvents: jest.fn(),
  ensureEventAttachmentsSynced: jest.fn(),
}));

import { act, fireEvent, render } from '@testing-library/react-native';
import { WindowSheet } from './WindowSheet';
import type { SheetRow } from '../../lib/historyControls';
import type { HistoryWindowKey } from '../../lib/historyWindows';
import { useHistoryScopeStore } from '../../store/historyScopeStore';
import { usePetStore, type Pet } from '../../store/petStore';

const pet = (id: string, name: string) => ({ id, name, species: 'dog' }) as Pet;

const row = (value: HistoryWindowKey, label: string, count: string, extra: Partial<SheetRow<HistoryWindowKey>> = {}): SheetRow<HistoryWindowKey> => ({
  value,
  label,
  count,
  detail: null,
  nested: false,
  section: null,
  accessibilityLabel: `${label}${extra.detail ? `, ${extra.detail}` : ''}, ${count} logged`,
  ...extra,
});

const ROWS: SheetRow<HistoryWindowKey>[] = [
  row({ kind: 'all' }, 'All time', '1,094', { detail: 'since May 14' }),
  row({ kind: 'last', days: 14 }, 'Last 14 days', '92'),
  row({ kind: 'trial' }, 'Since the trial started', '378', { detail: 'Jul 26' }),
  row({ kind: 'month', month: '2026-09' }, 'September', '126', { section: '2026' }),
];

beforeEach(() => {
  act(() => usePetStore.setState({ activePet: null, pets: [] }));
  act(() => usePetStore.setState({ activePet: pet('p1', 'Nyx'), pets: [] }));
});

describe('WindowSheet', () => {
  it('names the pill by the short name, with the window’s own row still selected', () => {
    const view = render(<WindowSheet petId="p1" current={{ kind: 'trial' }} rows={ROWS} pill={{ label: 'Since Jul 26', accessibilityLabel: 'Date range: Since the trial started, Jul 26' }} />);
    fireEvent.press(view.getByLabelText('Date range: Since the trial started, Jul 26'));
    expect(view.getByText('Since Jul 26')).toBeTruthy();
    expect(view.getByText('Show events from')).toBeTruthy();
    expect(view.getByLabelText('Since the trial started, Jul 26, 378 logged').props.accessibilityState.selected).toBe(true);
    expect(view.getByText('2026')).toBeTruthy();
    // The months run past the fold, so the sheet opens at the window on screen.
    expect(typeof view.getByLabelText('Since the trial started, Jul 26, 378 logged').props.onLayout).toBe('function');
  });

  it('a pick writes the window the row stands for: a rolling window, a month, All time', () => {
    const view = render(<WindowSheet petId="p1" current={{ kind: 'all' }} rows={ROWS} pill={{ label: 'All time', accessibilityLabel: 'Date range: All time' }} />);
    fireEvent.press(view.getByLabelText('Date range: All time'));
    fireEvent.press(view.getByLabelText('Last 14 days, 92 logged'));
    expect(useHistoryScopeStore.getState().window).toEqual({ kind: 'last', days: 14 });
    fireEvent.press(view.getByLabelText('Date range: All time'));
    fireEvent.press(view.getByLabelText('September, 126 logged'));
    expect(useHistoryScopeStore.getState().window).toEqual({ kind: 'month', month: '2026-09' });
    fireEvent.press(view.getByLabelText('Date range: All time'));
    fireEvent.press(view.getByLabelText('All time, since May 14, 1,094 logged'));
    expect(useHistoryScopeStore.getState().window).toEqual({ kind: 'all' });
  });

  it('closes when the pet changes: the menu is keyed on the pet (AC 13)', () => {
    const view = render(<WindowSheet petId="p1" current={{ kind: 'all' }} rows={ROWS} pill={{ label: 'All time', accessibilityLabel: 'Date range: All time' }} />);
    fireEvent.press(view.getByLabelText('Date range: All time'));
    view.rerender(<WindowSheet petId="p2" current={{ kind: 'all' }} rows={ROWS} pill={{ label: 'All time', accessibilityLabel: 'Date range: All time' }} />);
    expect(view.queryByText('Show events from')).toBeNull();
  });
});
