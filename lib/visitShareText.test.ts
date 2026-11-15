import { visitToPlainText } from './visitShareText';
import type { VetVisitDetail } from './vetVisits';

// R8·6 (CUL-2760). The share text is the record, in the visit screen's own words, and
// addressed to no one. Date-only fields are 'YYYY-MM-DD' strings, so no zone moves them;
// `now` is pinned only for the year stamp `formatVisitDate` adds off this year (C-29).

const NOW = new Date(2026, 10, 15, 12, 0, 0);

function detail(over: Partial<VetVisitDetail['visit']> = {}, rest: Partial<VetVisitDetail> = {}): VetVisitDetail {
  return {
    visit: {
      id: 'v1',
      pet_id: 'p1',
      visited_at: '2026-11-14',
      clinic_name: 'Completely Cat Clinic',
      vet_name: 'Dr Miller',
      reason: null,
      notes: 'Left ear still a little red. Keep cleaning it.',
      next_visit_at: '2026-12-26',
      deleted_at: null,
      ...over,
    },
    links: {} as VetVisitDetail['links'],
    questions: [],
    medications: [
      { id: 'm1', drugName: 'Motozol', doseAmount: '2 drops', status: 'active' },
      { id: 'm2', drugName: 'Prednisolone', doseAmount: null, status: 'completed' },
    ],
    trials: [{ id: 't1', label: 'Hydrolyzed salmon', status: 'active' }],
    documents: [],
    ...rest,
  };
}

describe('visitToPlainText', () => {
  it('carries what the vet said, the plan and the recheck, in that order', () => {
    const text = visitToPlainText(detail(), 'Nyx', NOW);
    expect(text).toBe(
      [
        'Nyx · vet visit · Saturday, Nov 14 · Completely Cat Clinic · Dr Miller',
        'What the vet said: Left ear still a little red. Keep cleaning it.',
        [
          'The plan:',
          '• Motozol · 2 drops · still on it',
          '• Prednisolone · ended',
          '• Hydrolyzed salmon · trial running',
          '• Next visit · Dec 26',
        ].join('\n'),
      ].join('\n\n'),
    );
  });

  it('leads with the reason when the visit has one', () => {
    expect(visitToPlainText(detail({ reason: 'Ear recheck' }), 'Nyx', NOW).split('\n')[0]).toBe(
      'Nyx · Ear recheck · Saturday, Nov 14 · Completely Cat Clinic · Dr Miller',
    );
  });

  it('is addressed to no one and claims nothing the record does not hold', () => {
    const text = visitToPlainText(detail(), 'Nyx', NOW);
    expect(text).not.toMatch(/\b(hi|hello|dear|thanks)\b/i);
    expect(text).not.toMatch(/booked/i);
    expect(text).not.toMatch(/!/);
  });

  it('says a bare visit is bare, rather than sharing a date that reads as "nothing decided"', () => {
    const text = visitToPlainText(
      detail({ notes: '  ', next_visit_at: null }, { medications: [], trials: [] }),
      'Nyx',
      NOW,
    );
    expect(text).toBe(
      'Nyx · vet visit · Saturday, Nov 14 · Completely Cat Clinic · Dr Miller\n\nNo notes or plan on this visit yet.',
    );
  });

  it('drops the plan heading when only the notes exist', () => {
    const text = visitToPlainText(detail({ next_visit_at: null }, { medications: [], trials: [] }), 'Nyx', NOW);
    expect(text).not.toMatch(/The plan/);
    expect(text).toMatch(/What the vet said/);
  });

  it('stamps the year on a recheck in another year', () => {
    expect(visitToPlainText(detail({ next_visit_at: '2027-01-09' }), 'Nyx', NOW)).toMatch('• Next visit · Jan 9, 2027');
  });
});
