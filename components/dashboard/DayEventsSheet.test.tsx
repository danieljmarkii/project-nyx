// DayEventsSheet pulls lib/dayEvents → dashboardCards → analytics → db (expo-sqlite) +
// feedingArrangements; stub the native chain. useSafeAreaInsets needs a provider jest-expo
// doesn't stand up — stub the module (the app/insights test pattern).
jest.mock('../../lib/db', () => ({ getDb: () => ({}) }));
jest.mock('../../lib/feedingArrangements', () => ({ getActiveArrangementsForPet: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

import { render, fireEvent } from '@testing-library/react-native';
import { DayEventsSheet } from './DayEventsSheet';
import type { TimelineRow } from '../../lib/db';

function row(over: Partial<TimelineRow>): TimelineRow {
  return {
    event_type: 'other',
    occurred_at: '2026-06-24T12:00:00.000Z',
    occurred_at_confidence: null,
    occurred_at_earliest: null,
    occurred_at_latest: null,
    food_brand: null,
    food_product_name: null,
    food_type: null,
    intake_rating: null,
    drug_generic_name: null,
    drug_brand_name: null,
    adherence: null,
    ...over,
  } as unknown as TimelineRow;
}

const dayRows: TimelineRow[] = [
  row({ event_type: 'vomit', occurred_at: '2026-06-24T06:00:00.000Z' }),
  row({ event_type: 'meal', food_brand: 'Acme', food_product_name: 'Salmon', intake_rating: 'refused', occurred_at: '2026-06-24T07:30:00.000Z' }),
];

describe('DayEventsSheet (B-284 N5b drill-in)', () => {
  it('renders the day title, subtitle, each event, and the History deep-link', () => {
    const onOpen = jest.fn();
    const { getByText, getByLabelText } = render(
      <DayEventsSheet
        visible
        dayKey="2026-06-24"
        symptomLabel="Vomiting"
        symptomCount={1}
        rows={dayRows}
        onClose={jest.fn()}
        onOpenInHistory={onOpen}
      />,
    );
    expect(getByText('Jun 24')).toBeTruthy();
    expect(getByText('Vomiting logged 1 time · everything this day:')).toBeTruthy();
    // Every event that day, not just the symptom (B-226 #1): the vomit + the meal.
    // The meal's title + intake detail concatenate into one Text node, so match loosely.
    expect(getByText('Vomit')).toBeTruthy();
    expect(getByText(/Acme · Salmon/)).toBeTruthy();
    expect(getByText(/refused/)).toBeTruthy();

    fireEvent.press(getByLabelText('Open Jun 24 in History'));
    expect(onOpen).toHaveBeenCalledWith('2026-06-24');
  });

  it('shows a loading state (no subtitle/rows) while rows are null', () => {
    const { getByText, queryByText } = render(
      <DayEventsSheet
        visible
        dayKey="2026-06-24"
        symptomLabel="Vomiting"
        symptomCount={0}
        rows={null}
        onClose={jest.fn()}
        onOpenInHistory={jest.fn()}
      />,
    );
    expect(getByText('Jun 24')).toBeTruthy();
    expect(queryByText(/everything this day/)).toBeNull(); // subtitle withheld until loaded
  });

  it('an empty day reads "Nothing logged this day." and still offers the History link', () => {
    const { getByText, getByLabelText } = render(
      <DayEventsSheet
        visible
        dayKey="2026-06-24"
        symptomLabel="Vomiting"
        symptomCount={0}
        rows={[]}
        onClose={jest.fn()}
        onOpenInHistory={jest.fn()}
      />,
    );
    expect(getByText('Nothing logged this day.')).toBeTruthy();
    expect(getByLabelText('Open Jun 24 in History')).toBeTruthy();
  });

  it('renders nothing when there is no selected day', () => {
    const { queryByText } = render(
      <DayEventsSheet
        visible={false}
        dayKey={null}
        symptomLabel="Vomiting"
        symptomCount={0}
        rows={null}
        onClose={jest.fn()}
        onOpenInHistory={jest.fn()}
      />,
    );
    expect(queryByText('Jun 24')).toBeNull();
  });
});
