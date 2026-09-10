// TodayZone × the daily look — the nudge that yields and comes back (CUL-871 / N-4a;
// spec T-9, the review's E-8).
//
// The claim under test is a NEGATIVE one and therefore easy to lose: a `check_in` does
// not fill the day, so the nudge must never read "Nothing logged yet" beside a look the
// owner just made — and while the question is still unanswered it must not ask it a
// second time one card lower.

jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const mockUseEvents = jest.fn();
jest.mock('../../hooks/useEvents', () => ({ useEvents: () => mockUseEvents() }));

const mockUsePetStore = jest.fn();
jest.mock('../../store/petStore', () => ({ usePetStore: () => mockUsePetStore() }));

let mockFlagOn = true;
let mockOptedIn = true;
jest.mock('../../hooks/useAppConfig', () => ({ useAllowlistFlag: () => mockFlagOn }));
jest.mock('../../lib/betaFeatures', () => ({ useBetaOptIn: () => mockOptedIn }));

import { render } from '@testing-library/react-native';
import { TodayZone } from './TodayZone';
import type { NyxEvent } from '../../store/eventStore';

function ev(id: string, event_type: string, extra: Partial<NyxEvent> = {}): NyxEvent {
  return {
    id,
    pet_id: 'p1',
    event_type,
    occurred_at: new Date().toISOString(),
    ...extra,
  } as unknown as NyxEvent;
}

const look = (id: string) =>
  ev(id, 'check_in', { look_outcome: 'observed', look_words: '["subdued"]' } as Partial<NyxEvent>);

beforeEach(() => {
  mockFlagOn = true;
  mockOptedIn = true;
  mockUseEvents.mockReset();
  mockUsePetStore.mockReturnValue({
    activePet: { id: 'p1', name: 'Biscuit', species: 'dog', sex: 'male' },
  });
});

describe('the nudge and the look', () => {
  it('YIELDS while the question is unanswered — the Noticed card is asking it', () => {
    mockUseEvents.mockReturnValue({ todayEvents: [] });
    const t = render(<TodayZone />);
    expect(t.queryByText(/Nothing logged yet/)).toBeNull();
    expect(t.queryByText(/No meals logged yet/)).toBeNull();
    // The band and the empty lane still render — the day is honest, it just isn't asked
    // about twice.
    expect(t.getByText('Today so far')).toBeTruthy();
  });

  it('RETURNS after a look, pointed at the bowl — never "Nothing logged yet"', () => {
    mockUseEvents.mockReturnValue({ todayEvents: [look('l1')] });
    const t = render(<TodayZone />);
    expect(t.getByText('No meals logged yet — did Biscuit eat?')).toBeTruthy();
    expect(t.queryByText(/Nothing logged yet/)).toBeNull();
  });

  it('goes quiet once anything else is in the day', () => {
    mockUseEvents.mockReturnValue({ todayEvents: [look('l1'), ev('m1', 'meal')] });
    const t = render(<TodayZone />);
    expect(t.queryByText(/No meals logged yet/)).toBeNull();
    expect(t.queryByText(/Nothing logged yet/)).toBeNull();
  });

  it('OFF THE FLAG the shipped nudge is unchanged on an empty day', () => {
    mockFlagOn = false;
    mockUseEvents.mockReturnValue({ todayEvents: [] });
    const t = render(<TodayZone />);
    expect(t.getByText("Nothing logged yet — how's Biscuit doing?")).toBeTruthy();
  });

  it('and a pet with no vocabulary keeps the shipped nudge too (species other)', () => {
    // There is no Noticed card to yield to for an Other pet (CUL-864 brief 2), so
    // yielding would leave the owner with neither.
    mockUsePetStore.mockReturnValue({
      activePet: { id: 'p1', name: 'Biscuit', species: 'other', sex: 'unknown' },
    });
    mockUseEvents.mockReturnValue({ todayEvents: [] });
    const t = render(<TodayZone />);
    expect(t.getByText("Nothing logged yet — how's Biscuit doing?")).toBeTruthy();
  });
});
