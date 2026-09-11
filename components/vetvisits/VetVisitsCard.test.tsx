import { fireEvent, render, screen } from '@testing-library/react-native';
import { VetVisitsCard } from './VetVisitsCard';
import {
  buildAppointmentView,
  buildVetVisitsCardModel,
  buildVisitListRow,
  composeScheduledAt,
  type LocalVetAppointment,
  type LocalVetVisit,
} from '../../lib/vetVisits';

// CUL-900 VV-2 — the Pet-tab card (mock A1), including its zero state.
//
// The model is contract-tested in lib/vetVisits.test.ts; what is pinned here is
// the card's own wiring, which is where the two states diverge.

const NOW = new Date(2026, 8, 14);

const visit: LocalVetVisit = {
  id: 'v1',
  pet_id: 'pet-a',
  visited_at: '2026-07-30',
  clinic_name: 'Riverside Animal Hospital',
  vet_name: 'Dr. Chen',
  reason: 'GI follow-up',
  notes: null,
  next_visit_at: null,
  deleted_at: null,
};

const appointment: LocalVetAppointment = {
  id: 'a1',
  pet_id: 'pet-a',
  scheduled_at: composeScheduledAt(new Date(2026, 8, 16), new Date(2026, 8, 16, 15, 0)),
  clinic_name: 'Riverside Animal Hospital',
  vet_name: 'Dr. Chen',
  reason: 'recheck',
  vet_visit_id: null,
  cancelled_at: null,
  deleted_at: null,
};

const NO_LINKS = { medicationNames: [], trialCount: 0, documentCount: 0, hasNextVisit: false };

function renderCard(model: ReturnType<typeof buildVetVisitsCardModel>, handlers = {}) {
  const props = {
    onOpen: jest.fn(),
    onBook: jest.fn(),
    onLogPast: jest.fn(),
    ...handlers,
  };
  render(<VetVisitsCard model={model} petName="Nyx" {...props} />);
  return props;
}

describe('the zero state', () => {
  const empty = buildVetVisitsCardModel({ next: null, awaiting: [], visits: [] }, NOW);

  it('renders E2\'s two doors in place of the appointment and the plan line', () => {
    const props = renderCard(empty);
    fireEvent.press(screen.getByText('Add the next visit'));
    fireEvent.press(screen.getByText('Log a visit that already happened'));
    expect(props.onBook).toHaveBeenCalledTimes(1);
    expect(props.onLogPast).toHaveBeenCalledTimes(1);
    // "Open visits" would be a door onto a screen with nothing on it.
    expect(screen.queryByText('Open visits')).toBeNull();
  });

  it('names the pet, and never calls the state empty at the owner', () => {
    renderCard(empty);
    expect(screen.getByText(/Nyx’s next appointment/)).toBeTruthy();
    expect(screen.queryByText(/no visits|nothing|empty/i)).toBeNull();
  });
});

describe('the populated card', () => {
  it('leads with the appointment and summarises the last visit', () => {
    const model = buildVetVisitsCardModel(
      {
        next: buildAppointmentView(appointment, NOW),
        awaiting: [],
        visits: [buildVisitListRow(visit, { ...NO_LINKS, medicationNames: ['Cerenia'] }, NOW)],
      },
      NOW,
    );
    const props = renderCard(model);

    expect(screen.getByText('1 visit')).toBeTruthy();
    expect(screen.getByText('Wednesday · 3:00 pm')).toBeTruthy();
    expect(screen.getByText('Last visit Jul 30 — GI follow-up. Plan: Cerenia.')).toBeTruthy();

    fireEvent.press(screen.getByText('Open visits'));
    expect(props.onOpen).toHaveBeenCalledTimes(1);
  });

  it('carries no appointment doors — Get ready and Change arrive with their screens', () => {
    // VV-5 owns Get ready and VV-4 owns Change. A control rendered here now would
    // either go nowhere or be `disabled`, which is an accessibility claim that a
    // control exists and is unavailable (C-7).
    const model = buildVetVisitsCardModel(
      { next: buildAppointmentView(appointment, NOW), awaiting: [], visits: [] },
      NOW,
    );
    renderCard(model);
    expect(screen.queryByText(/Get ready/i)).toBeNull();
    expect(screen.queryByText(/^Change$/)).toBeNull();
  });

  it('shows a first booking without the zero state, and with no count or plan line', () => {
    const model = buildVetVisitsCardModel(
      { next: buildAppointmentView(appointment, NOW), awaiting: [], visits: [] },
      NOW,
    );
    renderCard(model);
    expect(screen.getByText('Open visits')).toBeTruthy();
    expect(screen.queryByText('Add the next visit')).toBeNull();
    // No count label: "0 visits" over a real appointment would be a complaint
    // about the record rather than a fact about the card.
    expect(screen.queryByText(/^\d+ visits?$/)).toBeNull();
    expect(screen.queryByText(/^Last visit/)).toBeNull();
  });

  it('reads the appointment as one sentence rather than four fragments', () => {
    const model = buildVetVisitsCardModel(
      { next: buildAppointmentView(appointment, NOW), awaiting: [], visits: [] },
      NOW,
    );
    renderCard(model);
    expect(
      screen.getByLabelText('Wednesday · 3:00 pm, Riverside Animal Hospital · Dr. Chen · recheck'),
    ).toBeTruthy();
  });
});
