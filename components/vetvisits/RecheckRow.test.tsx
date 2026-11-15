import { render } from '@testing-library/react-native';
import { RecheckRow } from './RecheckRow';
import { composeScheduledAt, readRecheckBooking } from '../../lib/vetVisits';

// CUL-2788 stopgap, driven through the real read: the old "Set a date" wheel booked a
// `vet_appointments` row the owner never made (reason 'recheck', local midnight), and
// installed builds keep writing them, so every reason-'recheck' booking is treated as one. The row must read "Not booked yet" with *Book it* over that row, never
// "Booked": an owner who sees Booked has no reason to call the clinic.

const rows: { appointments: Record<string, unknown>[] } = { appointments: [] };

jest.mock('../../lib/db', () => ({
  getDb: () => ({
    getAllAsync: async (sql: string) => {
      if (/FROM vet_appointments/.test(sql)) return rows.appointments;
      return [];
    },
  }),
}));

const NOW = new Date(2026, 8, 20, 9, 0);
const VISIT = { id: 'v1', pet_id: 'pet-a', visited_at: '2026-09-16' };

function booking(reason: string | null) {
  return {
    id: 'a1', pet_id: 'pet-a',
    scheduled_at: composeScheduledAt(new Date(2026, 9, 28), null),
    clinic_name: 'Riverside Animal Hospital', vet_name: null, reason,
    vet_visit_id: null, cancelled_at: null, deleted_at: null,
  };
}

async function renderRow() {
  const read = await readRecheckBooking(VISIT, NOW);
  return render(
    <RecheckRow petName="Biscuit" nextVisitAt="2026-10-28" booking={read} busy={false} onSet={jest.fn()} onBook={jest.fn()} />,
  );
}

beforeEach(() => {
  rows.appointments = [];
});

describe('RecheckRow over the old wheel’s phantom booking (CUL-2788)', () => {
  it('reads Not booked yet with Book it, never Booked', async () => {
    rows.appointments = [booking('recheck')];
    const { queryByText, getByText } = await renderRow();
    expect(getByText('Not booked yet')).toBeTruthy();
    expect(getByText('Book it')).toBeTruthy();
    expect(queryByText(/Booked/)).toBeNull();
  });

  it('the same booking with another reason reads Booked (non-vacuity)', async () => {
    rows.appointments = [booking('Dental cleaning')];
    const { getByText, queryByText } = await renderRow();
    expect(getByText(/Booked/)).toBeTruthy();
    expect(queryByText('Book it')).toBeNull();
  });
});
