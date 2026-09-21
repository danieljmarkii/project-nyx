// The coverage door (D2-4 / CUL-1066): speaks coverage, opens Patterns, keeps nothing
// tappable at the row's right edge under the FAB (C-5).

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
const mockReadMonth = jest.fn();
jest.mock('../../../lib/spineReads', () => ({
  readMonthOccurredAts: (...a: unknown[]) => mockReadMonth(...a),
}));
jest.mock('../../../store/petStore', () => ({
  usePetStore: (sel: (s: { activePet: { id: string } }) => unknown) => sel({ activePet: { id: 'p1' } }),
}));
jest.mock('../../../store/syncStore', () => ({
  useSyncStore: (sel: (s: { hydrationTick: number }) => unknown) => sel({ hydrationTick: 0 }),
}));
jest.mock('../../../store/eventStore', () => ({
  useEventStore: (sel: (s: { todayEvents: unknown[] }) => unknown) => sel({ todayEvents: [] }),
}));

import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { CoverageDoor, COVERAGE_DOOR_LABEL } from './CoverageDoor';

function local(day: number, hour: number): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), day, hour).toISOString();
}

beforeEach(() => {
  mockReadMonth.mockReset();
  (router.push as jest.Mock).mockReset();
});

describe('CoverageDoor', () => {
  it('speaks the month’s coverage once the record has answered, and opens Patterns', async () => {
    const today = new Date().getDate();
    mockReadMonth.mockResolvedValue([local(1, 9), local(1, 21), local(today, 8)]);
    const t = render(<CoverageDoor />);
    // Before the read answers: the door, with no number (C-12).
    expect(t.getByText(COVERAGE_DOOR_LABEL)).toBeTruthy();
    await waitFor(() => expect(t.getByText(/logged/)).toBeTruthy());
    const logged = today === 1 ? 1 : 2;
    expect(t.getByText(new RegExp(`logged ${logged} of ${today} day`))).toBeTruthy();
    fireEvent.press(t.getByTestId('coverage-door'));
    expect(router.push).toHaveBeenCalledWith('/insights');
  });

  it('the row hugs its content on the left — nothing sits at the right edge under the FAB (C-5)', async () => {
    mockReadMonth.mockResolvedValue([]);
    const t = render(<CoverageDoor />);
    await waitFor(() => expect(t.getByText(/logged/)).toBeTruthy());
    const row = t.getByTestId('coverage-door-row');
    const style = StyleSheet.flatten(row.props.style) as { alignSelf?: string; flexDirection?: string };
    expect(style.alignSelf).toBe('flex-start');
    expect(style.flexDirection).toBe('row');
  });

  it('is one control with one label that carries the line', async () => {
    const today = new Date().getDate();
    mockReadMonth.mockResolvedValue([local(today, 8)]);
    const t = render(<CoverageDoor />);
    await waitFor(() =>
      expect(t.getByTestId('coverage-door').props.accessibilityLabel).toMatch(/logged 1 of \d+ days?\. Open Patterns$/),
    );
    expect(t.getAllByRole('button')).toHaveLength(1);
  });
});
