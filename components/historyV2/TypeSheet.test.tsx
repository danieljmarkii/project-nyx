// The type sheet's wiring (HV-9 / CUL-1166; spec §3.8). The rows are `lib/historyControls.ts`'s
// and table-tested there; this file proves the sheet draws them on ScopeMenu, writes the
// filter a row stands for to the REAL scope store, and closes on a pet switch (AC 13).

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
import { TypeSheet } from './TypeSheet';
import type { SheetRow, TypePill } from '../../lib/historyControls';
import type { HistoryFilter } from '../../lib/historyDays';
import { useHistoryScopeStore } from '../../store/historyScopeStore';
import { usePetStore, type Pet } from '../../store/petStore';

const pet = (id: string, name: string) => ({ id, name, species: 'dog' }) as Pet;

const row = (value: HistoryFilter, label: string, count: string | null, extra: Partial<SheetRow<HistoryFilter>> = {}): SheetRow<HistoryFilter> => ({
  value,
  label,
  count,
  detail: null,
  nested: false,
  section: null,
  accessibilityLabel: count === null ? label : `${label}, ${count} logged`,
  ...extra,
});

const ROWS: SheetRow<HistoryFilter>[] = [
  row({ kind: 'all' }, 'All types', '12'),
  row({ kind: 'type', type: 'vomit' }, 'Vomit', '3'),
  row({ kind: 'type', type: 'medication' }, 'Medication', '4'),
  row({ kind: 'course', courseKey: 'reg-cet' }, 'Cetirizine HCl', '3', { nested: true, detail: 'Jul 1 – Sep 5' }),
  row({ kind: 'noticed' }, 'Noticed', null, { section: 'The daily look' }),
];
const PILL: TypePill = { label: 'All types', count: null, accessibilityLabel: 'Filter: All types' };

beforeEach(() => {
  act(() => usePetStore.setState({ activePet: null, pets: [] }));
  act(() => usePetStore.setState({ activePet: pet('p1', 'Nyx'), pets: [] }));
});

describe('TypeSheet', () => {
  it('draws every row it is handed, and marks the filter on screen selected', () => {
    const view = render(<TypeSheet petId="p1" filter={{ kind: 'course', courseKey: 'reg-cet' }} rows={ROWS} pill={{ ...PILL, label: 'Cetirizine HCl', count: '3', accessibilityLabel: 'Filter: Cetirizine HCl, 3 logged' }} />);
    fireEvent.press(view.getByLabelText('Filter: Cetirizine HCl, 3 logged'));
    expect(view.getByText('Show only')).toBeTruthy();
    for (const r of ROWS) expect(view.getByLabelText(r.accessibilityLabel)).toBeTruthy();
    expect(view.getByLabelText('Cetirizine HCl, 3 logged').props.accessibilityState.selected).toBe(true);
    expect(view.getByLabelText('All types, 12 logged').props.accessibilityState.selected).toBe(false);
  });

  it('a pick writes the filter the row stands for, for the pet it was made for', () => {
    const view = render(<TypeSheet petId="p1" filter={{ kind: 'all' }} rows={ROWS} pill={PILL} />);
    fireEvent.press(view.getByLabelText('Filter: All types'));
    fireEvent.press(view.getByLabelText('Cetirizine HCl, 3 logged'));
    expect(useHistoryScopeStore.getState().filter).toEqual({ kind: 'course', courseKey: 'reg-cet' });
    fireEvent.press(view.getByLabelText('Filter: All types'));
    fireEvent.press(view.getByLabelText('All types, 12 logged'));
    expect(useHistoryScopeStore.getState().filter).toEqual({ kind: 'all' });
  });

  it('a sheet opened for one pet never writes into another’s scope', () => {
    const view = render(<TypeSheet petId="p1" filter={{ kind: 'all' }} rows={ROWS} pill={PILL} />);
    fireEvent.press(view.getByLabelText('Filter: All types'));
    // The store moves on underneath the open sheet (a widget link, say) before the tap.
    act(() => usePetStore.setState({ activePet: pet('p2', 'Rex') }));
    fireEvent.press(view.getByLabelText('Vomit, 3 logged'));
    expect(useHistoryScopeStore.getState()).toMatchObject({ petId: 'p2', filter: { kind: 'all' } });
  });

  it('closes when the pet changes: the menu is keyed on the pet (AC 13)', () => {
    const view = render(<TypeSheet petId="p1" filter={{ kind: 'all' }} rows={ROWS} pill={PILL} />);
    fireEvent.press(view.getByLabelText('Filter: All types'));
    expect(view.getByText('Show only')).toBeTruthy();
    view.rerender(<TypeSheet petId="p2" filter={{ kind: 'all' }} rows={ROWS} pill={PILL} />);
    expect(view.queryByText('Show only')).toBeNull();
  });
});
