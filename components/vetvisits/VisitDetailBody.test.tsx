import { fireEvent, render, screen } from '@testing-library/react-native';
import { VisitDetailBody } from './VisitDetailBody';
import type { VetVisitDetail } from '../../lib/vetVisits';

// CUL-2754 (§4.4 R1, AC 14): *Add to the plan* is on every saved visit, the empty one first,
// and the empty visit's line points forward at it rather than closing the record.

function detail(over: Partial<VetVisitDetail> = {}): VetVisitDetail {
  return {
    visit: {
      id: 'v-sep', pet_id: 'pet-a', visited_at: '2026-09-16', clinic_name: 'Completely Cat Clinic',
      vet_name: null, reason: null, notes: null, next_visit_at: null, deleted_at: null,
    },
    links: { medicationNames: [], trialCount: 0, documentCount: 0, hasNextVisit: false },
    questions: [],
    medications: [],
    trials: [],
    documents: [],
    ...over,
  };
}

const EMPTY_LINE = 'This visit has a date and a place so far. Add what the vet decided whenever you have it.';

describe('VisitDetailBody — Add to the plan', () => {
  it('renders the door on a visit with no plan, under the forward-pointing line', () => {
    const onAddToPlan = jest.fn();
    render(<VisitDetailBody detail={detail()} petName="Nyx" onOpenDocument={jest.fn()} onAddToPlan={onAddToPlan} />);
    expect(screen.getByText(EMPTY_LINE)).toBeTruthy();
    expect(screen.queryByText(/nothing else was written down/)).toBeNull();
    fireEvent.press(screen.getByLabelText('Add — Add to the plan'));
    expect(onAddToPlan).toHaveBeenCalledTimes(1);
  });

  it('keeps the door beside a plan, and drops the empty line once the visit holds anything', () => {
    render(
      <VisitDetailBody
        detail={detail({ medications: [{ id: 'm1', drugName: 'Motozol', doseAmount: 'left ear', status: 'active' }] })}
        petName="Nyx"
        onOpenDocument={jest.fn()}
        onAddToPlan={jest.fn()}
      />,
    );
    expect(screen.getByText('The plan')).toBeTruthy();
    expect(screen.getByLabelText('Add — Add to the plan')).toBeTruthy();
    expect(screen.queryByText(EMPTY_LINE)).toBeNull();
  });
});
