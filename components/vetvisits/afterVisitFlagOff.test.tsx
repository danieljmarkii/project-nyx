import { render, screen } from '@testing-library/react-native';
import { AfterVisitBody, type AfterVisitBodyProps } from './AfterVisitBody';
import { VisitSavedMoment } from './VisitSavedMoment';
import { describeVisitSave } from '../../lib/vetVisitPlan';

// Vet contacts PR-05 (CUL-2767), spec AC 1: the flag-off differential (C-36) for How did it go?
// and the saved moment. The route hands `contact` and `channelChips` as null flag-off (its own
// suite proves it, `after.reopen.test.tsx`); here the body is held to the feature's ABSENCE:
// both contact namespaces throw on any read, so a visit render that touches one reds. The
// non-vacuity floor is the last test: the same body handed a contact DOES reach them.

function mockThrowing(name: string) {
  return new Proxy(
    {},
    {
      get(_t, key) {
        if (key === '__esModule' || typeof key === 'symbol' || key === 'then') return undefined;
        throw new Error(`flag-off render read ${name}.${String(key)}`);
      },
    },
  );
}
jest.mock('../../lib/vetContactAfter', () => mockThrowing('lib/vetContactAfter'));
jest.mock('../../lib/vetContactSheet', () => mockThrowing('lib/vetContactSheet'));
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: () => null }));

const noop = () => undefined;
const base: AfterVisitBodyProps = {
  petName: 'Nyx',
  fields: { visitedAt: new Date(2026, 8, 16), clinicName: 'Riverside', vetName: '', reason: '', notes: '' },
  onChangeField: noop,
  courses: [],
  courseVerdicts: {},
  settledCourses: {},
  onCourseVerdict: noop,
  onAddCourse: noop,
  trial: {
    id: 't1', label: 'Hydrolyzed salmon', dayLine: 'Day 23 of 42',
    window: { startDayKey: '2026-08-25', currentTargetDays: 42, dayCounter: 23 },
  },
  trialVerdict: null,
  endedTrial: null,
  onTrialVerdict: noop,
  onExtendTrial: noop,
  onStartTrial: noop,
  onAddFood: noop,
  nextVisitAt: null,
  onSetNextVisit: noop,
  onBookRecheck: noop,
  paperworkCount: 1,
  onAddPaperwork: noop,
  busyRow: null,
  saving: false,
  onSave: noop,
};

describe('flag off: How did it go? never reads the contact namespaces', () => {
  it('a visit renders as shipped', () => {
    render(<AfterVisitBody {...base} contact={null} channelChips={null} />);
    expect(screen.getByText('How did it go?')).toBeTruthy();
    expect(screen.getByText('Paperwork')).toBeTruthy();
    expect(screen.getByText('Extended')).toBeTruthy();
  });

  it('a visit’s saved moment renders the shipped check', () => {
    const summary = describeVisitSave({ petName: 'Nyx', consequence: { isLatest: true, dayRelation: 'before_today' }, linked: [] });
    render(<VisitSavedMoment summary={summary} onDone={noop} />);
    expect(screen.getByTestId('saved-mark-check')).toBeTruthy();
  });

  it('non-vacuity: handed a contact, the body does reach the namespace', () => {
    const contact = {
      eyebrow: 'Phone · Mon, Nov 9', documents: [], onOpenDocument: noop, onAddDocument: noop,
      noun: 'call', thisNoun: 'this call', leaveNote: 'Leave any time.', startedHereCourseIds: new Set<string>(),
    };
    jest.spyOn(console, 'error').mockImplementation(noop);
    expect(() => render(<AfterVisitBody {...base} contact={contact} />)).toThrow(/flag-off render read lib\/vetContactAfter/);
  });
});
