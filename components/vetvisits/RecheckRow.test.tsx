import { render } from '@testing-library/react-native';
import { RecheckRow } from './RecheckRow';
import { composeScheduledAt, readRecheckBooking } from '../../lib/vetVisits';

// CUL-2788 stopgap, driven through the real read: the old "Set a date" wheel booked a
// `vet_appointments` row the owner never made (reason 'recheck', local midnight, made on
// the visit day). The row must read "Not booked yet" with *Book it* over that row, never
// "Booked": an owner who sees Booked has no reason to call the clinic.

const rows: { appointments: Record<string, unknown>[]; visits: Record<string, unknown>[] } = {
  appointments: [],
  visits: [],
};

jest.mock('../../lib/db', () => ({
  getDb: () => ({
    getAllAsync: async (sql: string) => {
      if (/FROM vet_appointments/.test(sql)) return rows.appointments;
      if (/FROM vet_visits/.test(sql)) return rows.visits;
      return [];
    },
  }),
}));

const NOW = new Date(2026, 8, 20, 9, 0);
const VISIT = { id: 'v1', pet_id: 'pet-a', visited_at: '2026-09-16' };

function booking(createdAt: Date) {
  return {
    id: 'a1', pet_id: 'pet-a',
    scheduled_at: composeScheduledAt(new Date(2026, 9, 28), null),
    clinic_name: 'Riverside Animal Hospital', vet_name: null, reason: 'recheck',
    vet_visit_id: null, cancelled_at: null, deleted_at: null,
    created_at: createdAt.toISOString(),
  };
}

async function renderRow() {
  const read = await readRecheckBooking(VISIT, NOW);
  return render(
    <RecheckRow petName="Biscuit" nextVisitAt="2026-10-28" booking={read} busy={false} onSet={jest.fn()} onBook={jest.fn()} />,
  );
}

beforeEach(() => {
  rows.visits = [{ pet_id: 'pet-a', visited_at: '2026-09-16', created_at: new Date(2026, 8, 16, 17, 0).toISOString() }];
  rows.appointments = [];
});

describe('RecheckRow over the old wheel’s phantom booking (CUL-2788)', () => {
  it('reads Not booked yet with Book it, never Booked', async () => {
    rows.appointments = [booking(new Date(2026, 8, 16, 18, 0))];
    const { queryByText, getByText } = await renderRow();
    expect(getByText('Not booked yet')).toBeTruthy();
    expect(getByText('Book it')).toBeTruthy();
    expect(queryByText(/Booked/)).toBeNull();
  });

  it('a recheck booked through Book it after the wheel was retired reads Booked (non-vacuity)', async () => {
    // Made after the cutoff and not near the visit's days: the owner's own booking.
    rows.appointments = [booking(new Date(2026, 10, 20, 14, 0))];
    const { getByText, queryByText } = await renderRow();
    expect(getByText(/Booked/)).toBeTruthy();
    expect(queryByText('Book it')).toBeNull();
  });
});
