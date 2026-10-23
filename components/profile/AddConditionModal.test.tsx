// A condition's "Diagnosed" date is a calendar DAY (a DATE column), read and written in local
// components. It used to round-trip through UTC: `new Date('2026-09-01')` is UTC midnight
// (Aug 31 anywhere west of UTC) and `toISOString()` returns the UTC day, so an evening pick in
// the US saved tomorrow and a morning pick east of UTC saved yesterday, and the vet report
// printed the stored day. Local-component fixtures (B-514); the non-UTC CI job is what reds
// the old code, so prove a change here under a zone, e.g. TZ=Pacific/Honolulu.

const mockInsert = jest.fn();
const mockUpdate = jest.fn();
jest.mock('../../lib/supabase', () => {
  const single = (payload: Record<string, unknown>) => ({
    select: () => ({ single: async () => ({ data: { id: 'c-1', ...payload }, error: null }) }),
  });
  return {
    supabase: {
      from: () => ({
        insert: (payload: Record<string, unknown>) => {
          mockInsert(payload);
          return single(payload);
        },
        update: (payload: Record<string, unknown>) => {
          mockUpdate(payload);
          return { eq: () => single(payload) };
        },
      }),
    },
  };
});
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
let mockOnline = true;
jest.mock('../../hooks/useIsOnline', () => ({ useIsOnline: () => mockOnline }));

import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AddConditionModal, diagnosedMonthLabel, type Condition } from './AddConditionModal';

const EXISTING: Condition = {
  id: 'c-1',
  pet_id: 'pet-1',
  condition_name: 'IBD',
  diagnosed_at: '2026-09-01',
  status: 'active',
  notes: null,
  created_at: '2026-09-01T12:00:00Z',
};

async function pickAndAdd(picked: Date) {
  render(<AddConditionModal visible petId="pet-1" petName="Mochi" onClose={jest.fn()} onAdded={jest.fn()} />);
  fireEvent.changeText(screen.getByPlaceholderText('e.g. Food sensitivity, IBD, atopy'), 'IBD');
  fireEvent.press(screen.getByText('Set date'));
  act(() => {
    screen.UNSAFE_getByType('DateTimePicker' as never).props.onChange(null, picked);
  });
  await act(async () => {
    fireEvent.press(screen.getByText('Add'));
  });
}

beforeEach(() => {
  mockOnline = true;
  mockInsert.mockClear();
  mockUpdate.mockClear();
});

it('an edit shows the stored day, not the day before it', () => {
  render(<AddConditionModal visible petId="pet-1" petName="Mochi" existingCondition={EXISTING} onClose={jest.fn()} onAdded={jest.fn()} />);
  expect(screen.getByText('September 1, 2026')).toBeTruthy();
});

it('a late-evening pick saves the day picked', async () => {
  await pickAndAdd(new Date(2026, 8, 1, 23, 30));
  expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ diagnosed_at: '2026-09-01' }));
});

it('an early-morning pick saves the day picked', async () => {
  await pickAndAdd(new Date(2026, 8, 1, 0, 30));
  expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ diagnosed_at: '2026-09-01' }));
});

it('an untouched edit saves the stored day back unchanged', async () => {
  render(
    <AddConditionModal visible petId="pet-1" petName="Mochi" existingCondition={EXISTING} onClose={jest.fn()} onAdded={jest.fn()} onUpdated={jest.fn()} />,
  );
  await act(async () => {
    fireEvent.press(screen.getByText('Save'));
  });
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ diagnosed_at: '2026-09-01' }));
});

it("the Pet tab's month label reads the stored day's month, and nothing for no date", () => {
  expect(diagnosedMonthLabel('2026-09-01')).toBe('Sep 2026');
  expect(diagnosedMonthLabel(null)).toBeNull();
  expect(diagnosedMonthLabel('not a day')).toBeNull();
});

// CUL-1911 — the design round's pass (P3, P6) and the kit's disabled Save (C-7).
describe('the condition form names its pet and carries the resolve', () => {
  it('names the pet it writes for: the header, and the chosen status\'s caption', () => {
    render(<AddConditionModal visible petId="pet-1" petName="Mochi" onClose={jest.fn()} onAdded={jest.fn()} />);
    expect(screen.getByText('Add a condition for Mochi')).toBeTruthy();
    expect(screen.getByText('Currently affecting Mochi')).toBeTruthy();
    fireEvent.press(screen.getByText('Monitoring'));
    expect(screen.getByText('Being watched, not active right now')).toBeTruthy();
  });

  it('an empty name leaves Add disabled, and its label says why', () => {
    render(<AddConditionModal visible petId="pet-1" petName="Mochi" onClose={jest.fn()} onAdded={jest.fn()} />);
    const add = screen.getByLabelText('Add, name the condition first');
    expect(add.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(add);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('an add form offers no resolve', () => {
    render(<AddConditionModal visible petId="pet-1" petName="Mochi" onClose={jest.fn()} onAdded={jest.fn()} onResolve={jest.fn()} />);
    expect(screen.queryByText('Mark resolved')).toBeNull();
  });

  it('Mark resolved opens the shipped confirm word for word, and resolves the stored row only on confirm', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const onResolve = jest.fn();
    const onClose = jest.fn();
    render(
      <AddConditionModal
        visible petId="pet-1" petName="Mochi" existingCondition={EXISTING}
        onClose={onClose} onAdded={jest.fn()} onResolve={onResolve}
      />,
    );
    // The report line is said before the confirm, too.
    expect(screen.getByText('It will still appear in vet reports for the relevant date range.')).toBeTruthy();
    fireEvent.press(screen.getByText('Mark resolved'));
    expect(alert.mock.calls[0][0]).toBe('Mark as resolved');
    expect(alert.mock.calls[0][1]).toBe(
      'Mark "IBD" as resolved? It will still appear in vet reports for the relevant date range.',
    );
    expect(onResolve).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    expect(buttons.map((b) => b.text)).toEqual(['Cancel', 'Mark resolved']);
    buttons[1].onPress?.();
    expect(onResolve).toHaveBeenCalledWith(EXISTING);
    expect(onClose).toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    alert.mockRestore();
  });
});

// CUL-1911 — P8 on the condition form.
it('offline: the band names the pet, and Add waits with that reason', () => {
  mockOnline = false;
  render(<AddConditionModal visible petId="pet-1" petName="Mochi" onClose={jest.fn()} onAdded={jest.fn()} />);
  expect(screen.getByText('You’re offline. Mochi’s conditions can be saved once you’re back.')).toBeTruthy();
  fireEvent.changeText(screen.getByPlaceholderText('e.g. Food sensitivity, IBD, atopy'), 'IBD');
  fireEvent.press(screen.getByLabelText('Add, you’re offline'));
  expect(mockInsert).not.toHaveBeenCalled();
});
