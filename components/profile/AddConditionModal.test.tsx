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
jest.mock('../brand/WhorlSpinner', () => ({ WhorlSpinner: () => null }));

import React from 'react';
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
  render(<AddConditionModal visible petId="pet-1" onClose={jest.fn()} onAdded={jest.fn()} />);
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
  mockInsert.mockClear();
  mockUpdate.mockClear();
});

it('an edit shows the stored day, not the day before it', () => {
  render(<AddConditionModal visible petId="pet-1" existingCondition={EXISTING} onClose={jest.fn()} onAdded={jest.fn()} />);
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
    <AddConditionModal visible petId="pet-1" existingCondition={EXISTING} onClose={jest.fn()} onAdded={jest.fn()} onUpdated={jest.fn()} />,
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
