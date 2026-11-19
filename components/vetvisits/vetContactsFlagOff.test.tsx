import { render, screen } from '@testing-library/react-native';
import { VetVisitsCard } from './VetVisitsCard';
import { VetVisitsEmptyState } from './VetVisitsEmptyState';
import { BookVisitSheet } from './BookVisitSheet';
import {
  buildAppointmentView,
  buildVetVisitsCardModel,
  buildVisitListRow,
  composeScheduledAt,
  type AppointmentDetail,
  type LocalVetVisit,
} from '../../lib/vetVisits';

// Vet contacts PR-04 (CUL-2766), spec AC 1 and AC 17: the flag-off differential (C-36) on
// all three entry surfaces and the sheet behind them.
//
// Compared against the feature's ABSENCE, not against the flag-on tree: the contact sheet's
// whole namespace (`lib/vetContactSheet`) is replaced by a module that THROWS on any read, so a
// flag-off render that so much as reads one of its words reds here. The non-vacuity floor
// (C-36) is the last test: the same surfaces with the flag on DO reach it and throw, so the
// silence of the off renders is the gate, not a module nobody imports.

let mockContactsOn = false;
jest.mock('../../hooks/useVetContacts', () => ({ useVetContactsOn: () => mockContactsOn }));
jest.mock('../../lib/vetContactSheet', () =>
  new Proxy(
    {},
    {
      get(_t, key) {
        // Module plumbing that jest and babel read on import is not a use of the feature.
        if (key === '__esModule' || typeof key === 'symbol' || key === 'then') return undefined;
        throw new Error(`flag-off render read lib/vetContactSheet.${String(key)}`);
      },
    },
  ),
);
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: () => null }));

const NOW = new Date(2026, 8, 14);
const visit: LocalVetVisit = {
  id: 'v1', pet_id: 'pet-a', visited_at: '2026-07-30', clinic_name: 'Riverside Animal Hospital',
  vet_name: 'Dr. Chen', reason: 'GI follow-up', notes: null, next_visit_at: null, deleted_at: null,
  channel: 'in_clinic', contacted_at: null,
};
const appointment: AppointmentDetail = {
  id: 'a1', pet_id: 'pet-a',
  scheduled_at: composeScheduledAt(new Date(2026, 8, 16), new Date(2026, 8, 16, 15, 0)),
  clinic_name: 'Riverside Animal Hospital', vet_name: 'Dr. Chen', reason: 'ear recheck',
  notes_draft: null, questions: null, vet_visit_id: null, cancelled_at: null, deleted_at: null,
};
const NO_LINKS = { medicationNames: [], trialCount: 0, documentCount: 0, hasNextVisit: false };
const noop = () => undefined;

const MODELS = {
  empty: buildVetVisitsCardModel({ next: null, later: [], awaiting: [], visits: [] }, NOW),
  visit: buildVetVisitsCardModel(
    { next: null, later: [], awaiting: [], visits: [buildVisitListRow(visit, NO_LINKS, NOW)] }, NOW,
  ),
  visitAndBooking: buildVetVisitsCardModel(
    { next: buildAppointmentView(appointment, NOW), later: [], awaiting: [], visits: [buildVisitListRow(visit, NO_LINKS, NOW)] },
    NOW,
  ),
};

function card(model: keyof typeof MODELS) {
  return (
    <VetVisitsCard model={MODELS[model]} petName="Nyx" onOpen={noop} onTakeNotes={noop} onGetReady={noop} onBook={noop} onLogPast={noop} />
  );
}

function sheet(initialMode: 'booked' | 'happened') {
  return (
    <BookVisitSheet
      visible initialMode={initialMode} petName="Nyx" otherPets={[{ id: 'p2', name: 'Juniper' }]}
      prefill={{ clinicName: 'Riverside Animal Hospital', vetName: null, suggestedDate: null }}
      onClose={noop} onSubmit={noop}
    />
  );
}

beforeEach(() => {
  mockContactsOn = false;
});

describe('flag off: every entry surface renders as shipped, reading nothing of the feature', () => {
  it('the empty card: both shipped doors', () => {
    render(card('empty'));
    expect(screen.getByText('Add the next visit')).toBeTruthy();
    expect(screen.getByText('Log a visit that already happened')).toBeTruthy();
  });

  it('the card with a visit: Open visits alone (R10 adds nothing)', () => {
    render(card('visit'));
    expect(screen.getByText('Open visits')).toBeTruthy();
    expect(screen.queryByText(/already happened|call, text or email/)).toBeNull();
  });

  it('the card with a visit and a booking: Open visits alone, the appointment as shipped', () => {
    render(card('visitAndBooking'));
    expect(screen.getByText('Wednesday · 3:00 pm')).toBeTruthy();
    expect(screen.queryByText(/already happened|call, text or email/)).toBeNull();
  });

  it('the list’s empty state: the shipped pair', () => {
    render(<VetVisitsEmptyState petName="Nyx" onBook={noop} onLogPast={noop} />);
    expect(screen.getByText('Log a visit that already happened')).toBeTruthy();
    expect(screen.getByText('Your vet report already starts from the last visit you log.')).toBeTruthy();
  });

  it('the sheet from the logging door: the shipped happened arm, its question and no chips', () => {
    render(sheet('happened'));
    expect(screen.getByText('Has this visit happened?')).toBeTruthy();
    expect(screen.getByText('A visit that happened')).toBeTruthy();
    expect(screen.getByText('Reason')).toBeTruthy();
    expect(screen.queryByText('How did you hear from the vet?')).toBeNull();
    expect(screen.queryByText('Also about')).toBeNull();
    expect(screen.getByText('Your next vet report starts from this visit.')).toBeTruthy();
  });

  it('the booking door: as shipped', () => {
    render(sheet('booked'));
    expect(screen.getByText('Next visit')).toBeTruthy();
    expect(screen.getByText('Also for Juniper')).toBeTruthy();
    expect(screen.getByText('Has this visit happened?')).toBeTruthy();
    expect(screen.queryByText('How did you hear from the vet?')).toBeNull();
  });
});

describe('non-vacuity (C-36): the same surfaces with the flag on DO read the feature', () => {
  beforeEach(() => {
    mockContactsOn = true;
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['the empty card', () => card('empty')],
    ['the card with a visit', () => card('visit')],
    ['the card with a visit and a booking', () => card('visitAndBooking')],
    ['the list’s empty state', () => <VetVisitsEmptyState petName="Nyx" onBook={noop} onLogPast={noop} />],
    ['the sheet from the logging door', () => sheet('happened')],
  ])('%s', (_name, el) => {
    expect(() => render(el())).toThrow(/flag-off render read lib\/vetContactSheet/);
  });
});
