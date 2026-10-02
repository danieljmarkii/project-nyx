// CUL-1126 — today's History (v1, live for every account until History v2's GA) prints its
// dates through the one formatter (`lib/recordDates.ts`, H-10): bare in the current year,
// stamped outside it. Three places on the screen print a date: the event row, the
// always-available strip and the free-feeding boundary marker. Instants are built from
// LOCAL components (C-29), so the non-UTC CI job reads the same days.

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
// EventRow → lib/weight → lib/supabase, which fails fast at import when the env is unset.
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../store/petStore', () => {
  const pets = [{ id: 'pet-cat', name: 'Pixel', species: 'cat', sex: 'female' }];
  const state = { pets, activePet: pets[0] };
  return {
    usePetStore: Object.assign(
      (sel?: (s: typeof state) => unknown) => (sel ? sel(state) : state),
      { getState: () => state },
    ),
  };
});

import { render } from '@testing-library/react-native';
import { formatDatePart } from './EventRow';
import { boundaryMarkerText } from './BoundaryMarkerRow';
import { FreeFeedingStrip } from './FreeFeedingStrip';
import { toLocalDayKey } from '../../lib/utils';
import type { ActiveArrangementView, BoundaryMarker } from '../../lib/feedingArrangements';

const TODAY = '2026-09-25';

describe('the event row\'s date', () => {
  it('is bare in the current year', () => {
    expect(formatDatePart(new Date(2026, 8, 16, 16, 40).toISOString(), TODAY)).toBe('Sep 16');
  });

  it('carries the year outside it (a row paged back past New Year)', () => {
    expect(formatDatePart(new Date(2025, 8, 16, 16, 40).toISOString(), TODAY)).toBe('Sep 16, 2025');
  });

  it('is the LOCAL day of a late-evening event, not its UTC day', () => {
    expect(formatDatePart(new Date(2025, 11, 31, 23, 30).toISOString(), '2026-01-02')).toBe('Dec 31, 2025');
  });

  it('prints nothing for an unreadable instant, never "Invalid Date"', () => {
    expect(formatDatePart('garbage', TODAY)).toBe('');
  });
});

describe('the free-feeding boundary marker\'s date', () => {
  const marker = (date: string): BoundaryMarker =>
    ({ kind: 'started', date, foodLabel: 'Kibble', sortMs: 0 }) as unknown as BoundaryMarker;

  it('is bare in the current year and stamped outside it', () => {
    expect(boundaryMarkerText(marker('2026-03-04'), TODAY)).toBe('Started free-feeding Kibble · Mar 4');
    expect(boundaryMarkerText(marker('2025-11-03'), TODAY)).toBe('Started free-feeding Kibble · Nov 3, 2025');
  });

  it('omits a date it cannot read rather than guessing one', () => {
    expect(boundaryMarkerText(marker('2026-02-30'), TODAY)).toBe('Started free-feeding Kibble');
  });
});

describe('the always-available strip\'s "since"', () => {
  const bowl = (active_from: string | null): ActiveArrangementView =>
    ({ id: 'a1', brand: 'Acme', product_name: 'Dry', active_from }) as unknown as ActiveArrangementView;

  it('stamps the year on a bowl put down in another year', () => {
    // The strip judges "the current year" by the real clock, so the fixture is a year
    // before whatever today is, not a pinned date (C-29, the time axis).
    const lastYear = new Date().getFullYear() - 1;
    const view = render(<FreeFeedingStrip arrangements={[bowl(`${lastYear}-11-03`)]} />);
    expect(view.getByText(new RegExp(`since Nov 3, ${lastYear}`))).toBeTruthy();
  });

  it('is bare for a bowl put down this year', () => {
    const today = toLocalDayKey(new Date());
    const view = render(<FreeFeedingStrip arrangements={[bowl(today)]} />);
    expect(view.getByText(/since [A-Z][a-z]{2} \d{1,2}$/)).toBeTruthy();
  });
});
