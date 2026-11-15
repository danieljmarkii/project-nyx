import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { VisitDetailBody, visitDocumentLabel } from './VisitDetailBody';
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

type BodyProps = ComponentProps<typeof VisitDetailBody>;

function renderBody(over: Partial<BodyProps> & { detail: VetVisitDetail }) {
  const props: BodyProps = {
    petName: 'Nyx',
    onOpenDocument: jest.fn(),
    onAddToPlan: jest.fn(),
    courseDoor: () => null,
    trialDoor: () => null,
    onResultsArrived: jest.fn(),
    pdfAvailable: true,
    ...over,
  };
  render(<VisitDetailBody {...props} />);
  return props;
}

// C-6: a press can descend into a sibling, so tappability is asserted by walking up to the
// nearest responder host.
function owningTouchable(node: ReturnType<typeof screen.getByText>) {
  let cur: typeof node | null = node;
  while (cur) {
    if (cur.props && typeof cur.props.onStartShouldSetResponder === 'function'
      && cur.props.accessibilityRole === 'button') return cur;
    cur = cur.parent;
  }
  return null;
}

const EMPTY_LINE = 'This visit has a date and a place so far. Add what the vet decided whenever you have it.';

describe('VisitDetailBody — Add to the plan', () => {
  it('renders the door on a visit with no plan, under the forward-pointing line', () => {
    const onAddToPlan = jest.fn();
    renderBody({ detail: detail(), onAddToPlan });
    expect(screen.getByText(EMPTY_LINE)).toBeTruthy();
    expect(screen.queryByText(/nothing else was written down/)).toBeNull();
    fireEvent.press(screen.getByLabelText('Add — Add to the plan'));
    expect(onAddToPlan).toHaveBeenCalledTimes(1);
  });

  it('keeps the door beside a plan, and drops the empty line once the visit holds anything', () => {
    renderBody({
      detail: detail({ medications: [{ id: 'm1', drugName: 'Motozol', doseAmount: 'left ear', status: 'active' }] }),
    });
    expect(screen.getByText('The plan')).toBeTruthy();
    expect(screen.getByLabelText('Add — Add to the plan')).toBeTruthy();
    expect(screen.queryByText(EMPTY_LINE)).toBeNull();
  });
});

describe('VisitDetailBody — the plan rows open their records (CUL-2759)', () => {
  const planned = detail({
    medications: [
      { id: 'm1', drugName: 'Motozol', doseAmount: 'left ear', status: 'active', medicationItemId: 'item-1' },
      { id: 'm2', drugName: 'Gabapentin', doseAmount: null, status: 'completed', medicationItemId: null },
    ],
    trials: [
      { id: 't1', label: 'Hydrolyzed salmon', status: 'active' },
      { id: 't2', label: 'Rabbit', status: 'completed' },
    ],
  });

  it('opens a course and a trial through the doors handed in, and only those', () => {
    const openCourse = jest.fn();
    const openTrial = jest.fn();
    const courseDoor = jest.fn((med: VetVisitDetail['medications'][number]) => (med.id === 'm1' ? openCourse : null));
    const trialDoor = jest.fn((t: VetVisitDetail['trials'][number]) => (t.id === 't1' ? openTrial : null));
    renderBody({ detail: planned, courseDoor, trialDoor });

    fireEvent.press(screen.getByLabelText('Motozol, left ear · Still on it'));
    expect(openCourse).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByLabelText('Hydrolyzed salmon, Trial running'));
    expect(openTrial).toHaveBeenCalledTimes(1);
    expect(courseDoor).toHaveBeenCalledWith(planned.medications[0]);
    expect(trialDoor).toHaveBeenCalledWith(planned.trials[0]);
  });

  it('leaves a row with no door as text, never a dimmed button (C-7)', () => {
    renderBody({ detail: planned, courseDoor: () => null, trialDoor: () => null });
    expect(owningTouchable(screen.getByText('Gabapentin'))).toBeNull();
    expect(owningTouchable(screen.getByText('Rabbit'))).toBeNull();
    expect(screen.getByLabelText('Rabbit, Trial ended').props.accessibilityState?.disabled).toBeUndefined();
  });

  it('makes the row with a door tappable on its own title (C-6)', () => {
    renderBody({ detail: planned, courseDoor: (m) => (m.id === 'm1' ? jest.fn() : null) });
    expect(owningTouchable(screen.getByText('Motozol'))).not.toBeNull();
    expect(owningTouchable(screen.getByText('Gabapentin'))).toBeNull();
  });
});

describe('VisitDetailBody — the unasked question is named (CUL-2759)', () => {
  const q = (id: string, text: string, asked: boolean) => ({
    id, text, source: 'owner' as const, source_ref: null, asked_at: asked ? '2026-09-16T15:00:00.000Z' : null,
  });

  it('lists each question not asked by its own words, and keeps the count', () => {
    renderBody({
      detail: detail({
        questions: [q('q1', 'Is the ear clearing?', true), q('q2', 'Can she go back on chicken?', false)],
      }),
    });
    expect(screen.getByText('Not asked at the visit')).toBeTruthy();
    expect(screen.getByText('Can she go back on chicken?')).toBeTruthy();
    expect(screen.getByLabelText('Not asked: Can she go back on chicken?')).toBeTruthy();
    expect(screen.queryByLabelText('Not asked: Is the ear clearing?')).toBeNull();
    expect(screen.getByText('Asked 1 of 2 questions')).toBeTruthy();
  });

  it('names nothing when every question was asked', () => {
    renderBody({ detail: detail({ questions: [q('q1', 'Is the ear clearing?', true)] }) });
    expect(screen.queryByText('Not asked at the visit')).toBeNull();
    expect(screen.getByText('Asked 1 of 1 questions')).toBeTruthy();
  });
});

describe('VisitDetailBody — results arrive later (CUL-2759)', () => {
  it('offers Results arrived? on a visit with no paperwork yet, as a photo or a PDF', () => {
    const onResultsArrived = jest.fn();
    renderBody({ detail: detail(), onResultsArrived });
    expect(screen.getByText('Paperwork · in Vet Files')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Photograph — Results arrived?'));
    expect(onResultsArrived).toHaveBeenLastCalledWith('camera');
    fireEvent.press(screen.getByLabelText('PDF — Results arrived?'));
    expect(onResultsArrived).toHaveBeenLastCalledWith('files');
    expect(onResultsArrived).toHaveBeenCalledTimes(2);
  });

  it('drops the PDF button, never dims it, on a binary without the Files picker', () => {
    renderBody({ detail: detail(), pdfAvailable: false });
    expect(screen.getByLabelText('Photograph — Results arrived?')).toBeTruthy();
    expect(screen.queryByLabelText('PDF — Results arrived?')).toBeNull();
  });

  it('names an untitled result as results, and keeps an owner’s title', () => {
    // This year's date, so the label carries no year whatever day the suite runs (C-29).
    const day = `${new Date().getFullYear()}-09-20`;
    expect(visitDocumentLabel({ title: null, kind: 'lab_result', documentDate: day })).toBe('Results — Sep 20');
    expect(visitDocumentLabel({ title: null, kind: 'lab_result', documentDate: null })).toBe('Results');
    expect(visitDocumentLabel({ title: '  Senior panel ', kind: 'lab_result', documentDate: day })).toBe('Senior panel');
    expect(visitDocumentLabel({ title: null, kind: 'other', documentDate: day })).toBe('Document — Sep 20');
  });
});
