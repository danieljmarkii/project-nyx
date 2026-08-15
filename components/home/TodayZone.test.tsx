// TodayZone v2 (DR-2 §3) — the recap band's WIRING. The pure lane model is covered by
// lib/todayLane.test.ts and the lane paint by DayLane.test.tsx; this asserts the
// integration this PR introduces: the honest count line, the single "Full day ›" / strip
// door to /day-summary, the removed History-today shortcut, and the zero-log branch.

// buildTodayLane reaches lib/daySummary → lib/analytics → lib/supabase, which throws at
// import without env; stub the leaf (the daySummary.test.ts pattern).
jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const mockUseEvents = jest.fn();
jest.mock('../../hooks/useEvents', () => ({ useEvents: () => mockUseEvents() }));

const mockUsePetStore = jest.fn();
jest.mock('../../store/petStore', () => ({ usePetStore: () => mockUsePetStore() }));

import { fireEvent, render } from '@testing-library/react-native';
import { router } from 'expo-router';
import { TodayZone } from './TodayZone';
import type { NyxEvent } from '../../store/eventStore';

/** A minimal today event — the fields TodayZone + EventStripRow read; the rest are
 *  legitimately absent (an unnamed meal / dose renders no sub-line). */
function ev(id: string, event_type: string): NyxEvent {
  return { id, pet_id: 'p1', event_type, occurred_at: new Date().toISOString() } as unknown as NyxEvent;
}

beforeEach(() => {
  (router.push as jest.Mock).mockReset();
  mockUseEvents.mockReset();
  mockUsePetStore.mockReturnValue({ activePet: { id: 'p1', name: 'Biscuit' } });
});

describe('TodayZone v2 — the recap band', () => {
  it('leads with the band + honest count line, and drops the History shortcut', () => {
    mockUseEvents.mockReturnValue({
      todayEvents: [ev('m1', 'meal'), ev('m2', 'meal'), ev('d1', 'medication')],
    });
    const t = render(<TodayZone />);

    expect(t.getByText('Today so far')).toBeTruthy();
    // The count line: "2 meals · 1 dose logged" — bold counts + muted nouns.
    expect(t.getByTestId('today-count-line')).toBeTruthy();
    expect(t.getByText('2')).toBeTruthy();
    expect(t.getByText('meals', { exact: false })).toBeTruthy();
    expect(t.getByText('dose', { exact: false })).toBeTruthy();
    // The old header door is gone; "Full day ›" replaces it (History is its own tab).
    expect(t.queryByText('History ›')).toBeNull();
    expect(t.getByText('Full day ›')).toBeTruthy();
  });

  it('routes both the band door and the capped strip to the full-day recap (one door)', () => {
    mockUseEvents.mockReturnValue({ todayEvents: [ev('m1', 'meal')] });
    const t = render(<TodayZone />);

    fireEvent.press(t.getByText('Full day ›'));
    expect(router.push).toHaveBeenLastCalledWith('/day-summary');

    fireEvent.press(t.getByTestId('today-strip'));
    expect(router.push).toHaveBeenCalledTimes(2);
    expect(router.push).toHaveBeenLastCalledWith('/day-summary');
  });

  it('zero-log: renders the empty nudge (no count line) and routes it to the quick-log', () => {
    mockUseEvents.mockReturnValue({ todayEvents: [] });
    const t = render(<TodayZone />);

    // The band still leads (empty lane beside the nudge), but nothing is counted.
    expect(t.getByText('Today so far')).toBeTruthy();
    expect(t.queryByTestId('today-count-line')).toBeNull();

    const nudge = t.getByText(/Nothing logged yet/);
    fireEvent.press(nudge);
    expect(router.push).toHaveBeenCalledWith('/log');
  });
});
