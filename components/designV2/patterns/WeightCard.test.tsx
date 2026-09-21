// The v2 weight card (CUL-1067) against §04 option A and its acceptance criteria: x by
// date, the fixed band, no fill, the n = 1 and n = 2 states, the delta spoken with its
// (gated) caveat, and the 4.6 kg fixture's 0.2 kg reading as a SMALL move — asserted off
// the rendered dot positions against the band, never off a number restated here.

jest.mock('../../../hooks/useReducedMotion', () => ({ useReducedMotion: jest.fn(() => false) }));
jest.mock('../../../hooks/useAppActive', () => ({ useAppActive: jest.fn(() => true) }));
// lib/weight and lib/dayEvents reach lib/supabase (a fail-fast env check under jest) through
// lib/sync; stubbed the way every sibling component suite stubs them.
jest.mock('../../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('../../../lib/sync', () => ({
  syncPendingEvents: jest.fn(),
  ensureEventAttachmentsSynced: jest.fn(),
  syncPendingFeedingArrangements: jest.fn(),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

import { configure, fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { WeightCard } from './WeightCard';
import { HOME_SCALE_CAVEAT } from '../../../lib/chartCopy';
import { theme } from '../../../constants/theme';

configure({ defaultIncludeHiddenElements: true });

const flat = (style: unknown): Record<string, number> => StyleSheet.flatten(style as never) as Record<string, number>;
// Instants built from LOCAL calendar components (C-29): the card names a reading's LOCAL
// date, so a UTC literal would read "Jul 2" in Honolulu and "Jul 3" in Kiritimati.
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 8, 0).toISOString();
const r = (weightKg: number, occurredAt: string) => ({ weightKg, occurredAt });
const PLOT_HEIGHT = 56;

function measured(ui: React.ReactElement, width = 340) {
  const api = render(ui);
  fireEvent(api.getByTestId('weight-plot'), 'layout', { nativeEvent: { layout: { width, height: PLOT_HEIGHT } } });
  return api;
}

// The mock's fixture: 4.6 kg falling to 4.4 over six readings, Jul 3 → Sep 12.
const SIX = [
  r(4.6, at(2026, 7, 3)),
  r(4.6, at(2026, 7, 20)),
  r(4.5, at(2026, 8, 4)),
  r(4.5, at(2026, 8, 18)),
  r(4.4, at(2026, 9, 1)),
  r(4.4, at(2026, 9, 12)),
];

describe('WeightCard (Design v2)', () => {
  it('six readings: dots by date, the band, the delta spoken beside the caveat, the record count in the header', () => {
    const { getByTestId, getByText } = measured(<WeightCard readings={SIX} readingCount={6} petName="Nyx" petId="p1" />);
    expect(getByTestId('weight-card-header').props.children).toBe('Weight · 6 readings');
    // x BY DATE, not by index: Jul 3 → Jul 20 is 17 of 71 days, so the second dot sits at
    // ~24 % of the plot, not at 1/5 of it.
    const plotW = 340 - 40;
    // Dot CENTRES (the last dot is drawn larger, so its `left` is not its position).
    const cx = (i: number) => {
      const st = flat(getByTestId(`weight-dot-${i}`).props.style);
      return st.left + st.width / 2;
    };
    expect((cx(1) - cx(0)) / (cx(5) - cx(0))).toBeCloseTo(17 / 71, 2);
    expect(cx(5) - cx(0)).toBeCloseTo(plotW, 0);
    // The band's edges are drawn and labelled.
    expect(getByTestId('weight-edge-hi').props.children).toBe('+10%');
    expect(getByTestId('weight-edge-lo').props.children).toBe('−10%');
    // The delta, in the display unit, with the caveat (a 4 % move is inside a home
    // scale's noise).
    expect(getByTestId('weight-card-delta').props.children).toBe(`Down 0.4 lbs (4%) since Jul 3 · ${HOME_SCALE_CAVEAT}`);
    expect(getByText('Log a weigh-in')).toBeTruthy();
  });

  it("the 4.6 kg fixture's 0.2 kg reads as a SMALL move: the dots' height against the band", () => {
    const { getByTestId } = measured(<WeightCard readings={SIX} readingCount={6} petId="p1" />);
    const cy = (i: number) => {
      const st = flat(getByTestId(`weight-dot-${i}`).props.style);
      return st.top + st.height / 2;
    };
    const y0 = cy(0);
    const y5 = cy(5);
    // The band is ±10 % of the first reading, so a 4.3 % fall is ~22 % of the band's
    // height — a visible step, nowhere near a cliff. Both bounds are asserted so the
    // test cannot pass on a flat line either.
    const moveFrac = (y5 - y0) / PLOT_HEIGHT;
    expect(moveFrac).toBeGreaterThan(0.1);
    expect(moveFrac).toBeLessThan(0.3);
    // And the first reading sits on the band's centre line.
    expect(y0).toBeCloseTo(PLOT_HEIGHT / 2, 0);
  });

  it('no fill: no area node in the tree', () => {
    const { queryByTestId } = measured(<WeightCard readings={SIX} readingCount={6} petId="p1" />);
    expect(queryByTestId('weight-fill')).toBeNull();
    expect(queryByTestId('weight-area')).toBeNull();
  });

  it('n = 1: the number and its date, the note, no band; the door is "Add ›" into the weigh-in (§04)', () => {
    const { getByTestId, queryByTestId } = render(<WeightCard readings={[r(4.6, at(2026, 9, 12))]} readingCount={1} petId="p1" />);
    expect(getByTestId('weight-card-header').props.children).toBe('Weight · 1 reading');
    expect(getByTestId('weight-card-door').props.accessibilityLabel).toBe('Add a second reading');
    fireEvent.press(getByTestId('weight-card-door'));
    expect(router.push).toHaveBeenLastCalledWith('/log?type=weight_check');
    expect(getByTestId('weight-number-value').props.children).toBe('10.1 lbs');
    expect(getByTestId('weight-card-note').props.children).toBe('One reading is a number, not a line. The second one draws the band.');
    expect(queryByTestId('weight-plot')).toBeNull();
    expect(queryByTestId('weight-card-delta')).toBeNull();
  });

  it('n = 2: the pair on the same fixed band, the delta spoken', () => {
    const { getByTestId } = measured(
      <WeightCard readings={[r(4.6, at(2026, 8, 26)), r(4.5, at(2026, 9, 12))]} readingCount={2} petId="p1" />,
    );
    expect(getByTestId('weight-dot-0')).toBeTruthy();
    expect(getByTestId('weight-dot-1')).toBeTruthy();
    expect(getByTestId('weight-edge-hi')).toBeTruthy();
    expect(getByTestId('weight-card-delta').props.children).toBe(`Down 0.2 lbs (2%) since Aug 26 · ${HOME_SCALE_CAVEAT}`);
  });

  it('past the noise bound the delta prints alone — a loss is never softened (Dr. Chen)', () => {
    const { getByTestId } = measured(
      <WeightCard readings={[r(5.0, at(2026, 7, 3)), r(4.2, at(2026, 9, 12))]} readingCount={2} petId="p1" />,
    );
    const line = getByTestId('weight-card-delta').props.children as string;
    // 5.0 kg → 11.0 lbs, 4.2 kg → 9.3 lbs: the delta is over the DISPLAYED numbers.
    expect(line).toMatch(/^Down 1\.7 lbs \(15%\) since Jul 3$/);
    expect(line).not.toContain('home scale');
  });

  it('the dots are neutral grey — never the accent, never the rose', () => {
    const { getByTestId } = measured(<WeightCard readings={SIX} readingCount={6} petId="p1" />);
    const bg = flat(getByTestId('weight-dot-0').props.style).backgroundColor as unknown as string;
    expect(bg).not.toBe(theme.colorAccent);
    expect(bg).not.toBe(theme.colorEventSymptom);
  });

  it('empty: the invitation to weigh, no door, the action', () => {
    const { getByText, queryByTestId } = render(<WeightCard readings={[]} readingCount={0} petName="Nyx" petId="p1" />);
    expect(getByText(/no weigh-ins logged yet/i)).toBeTruthy();
    expect(queryByTestId('weight-card-door')).toBeNull();
    expect(getByText('Log a weigh-in')).toBeTruthy();
  });

  it('the header speaks the RECORD count, and the door opens the history scoped to the card\'s pet (CUL-223, CUL-574)', () => {
    const { getByTestId } = measured(<WeightCard readings={SIX} readingCount={20} petId="pet-x" />);
    expect(getByTestId('weight-card-header').props.children).toBe('Weight · 20 readings');
    fireEvent.press(getByTestId('weight-card-door'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/weight-history', params: { petId: 'pet-x' } });
  });
});
