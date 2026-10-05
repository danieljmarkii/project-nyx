// The Home strip's three acceptance criteria (§4.2, §12 PR 4): it renders ONLY
// while a trial is active, its bar encodes day progress and nothing else, and it
// SITS BELOW SignalZone. Since Design v2's GA (CUL-1071) it draws the ruled card
// (CUL-1526) for every account. The third is a property of the Home screen's layout
// rather than of this component, so it is asserted at the bottom of this file the
// way `dietTrialDayMath.guard.test.ts` asserts its consumers — over the source.
// A blunt instrument, but the alternative is mounting the whole Home screen to
// check an ordering that a one-line edit can silently invert, and the rule it
// protects is a design principle: safety insights always lead.
/// <reference types="node" />
import { readFileSync } from 'fs';
import { join } from 'path';

jest.mock('../../lib/feedingArrangements', () => ({
  getActiveArrangementsForPet: jest.fn().mockResolvedValue([]),
}));
// The DEFAULT press is the thing under test below: an injected `onPress` is how the bare
// `/(tabs)/profile` push once survived (CUL-170), so the card's own push is asserted.
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
// The retired door's one read. A fixture that WOULD answer, so an absence proves the card
// makes no read rather than an empty record (C-41).
const mockUseTrialFacts = jest.fn((_petId: string | null) => ({ status: 'ready' as const, facts: null }));
jest.mock('../../hooks/useTrialFacts', () => ({
  useTrialFacts: (petId: string | null) => mockUseTrialFacts(petId),
}));

import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';
import { router } from 'expo-router';
import { TrialStrip } from './TrialStrip';
import { resolveTrialStrip, type TrialCardInput } from '../../lib/dietTrialCard';

const FOOD = 'Zignature Kangaroo Formula';

function localNoon(y: number, m: number, d: number): number {
  return new Date(y, m - 1, d, 12, 0, 0).getTime();
}

function input(over: Partial<TrialCardInput> = {}): TrialCardInput {
  return {
    trial: {
      status: 'active',
      startedAt: '2026-07-03',
      targetDurationDays: 56,
      foodLabel: FOOD,
    },
    nowMs: localNoon(2026, 7, 25),
    petName: 'Biscuit',
    coverage: { daysLogged: 22, daysElapsed: 23 },
    ...over,
  };
}

const door = { petId: 'pet-1' };

describe('TrialStrip', () => {
  const withOffDiet = () =>
    input({ exposures: { mayStateRecordClean: false, totalFeedings: 68, offDiet: 3 } });

  beforeEach(() => {
    mockUseTrialFacts.mockClear();
    (router.push as jest.Mock).mockClear();
  });

  it('renders nothing at all when there is no active trial', () => {
    expect(render(<TrialStrip model={null} {...door} />).toJSON()).toBeNull();
    expect(
      render(<TrialStrip model={resolveTrialStrip({ ...input(), trial: null })} {...door} />).toJSON(),
    ).toBeNull();
    expect(
      render(<TrialStrip model={resolveTrialStrip(input({
        trial: {
          status: 'completed', startedAt: '2026-07-03', endedAt: '2026-08-27',
          targetDurationDays: 56, foodLabel: FOOD,
        },
      }))} {...door} />).toJSON(),
    ).toBeNull();
  });

  it('renders nothing when Home names no pet: a card that cannot say whose trial it opens', () => {
    expect(render(<TrialStrip model={resolveTrialStrip(input())} />).toJSON()).toBeNull();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('title, a neutral bar bound to day progress, and the one end-date line; no ratio, no lane, no ledger read (CUL-1526)', () => {
    const i = withOffDiet();
    const tree = render(<TrialStrip model={resolveTrialStrip(i)} {...door} />);
    expect(tree.getByText('Diet trial · day 23 of 56')).toBeTruthy();
    expect(tree.getByText('Ends Aug 27 · 3 off-diet feedings logged')).toBeTruthy();
    expect(tree.queryByText(/meals logged on/)).toBeNull();
    expect(tree.queryByText(/Vomiting/)).toBeNull();
    expect(tree.queryByText(/%/)).toBeNull();
    expect(tree.queryByTestId('trial-lane', { includeHiddenElements: true })).toBeNull();
    expect(mockUseTrialFacts).not.toHaveBeenCalled();
    const fill = StyleSheet.flatten(tree.getByTestId('trial-card-v2-fill').props.style);
    expect(fill.backgroundColor).toBe(theme.colorTextTertiary);
    expect(fill.width).toBe(`${(23 / 56) * 100}%`);
    // Same day, far worse record — identical bar.
    const worse = input({ coverage: { daysLogged: 2, daysElapsed: 23 } });
    const worseFill = render(<TrialStrip model={resolveTrialStrip(worse)} {...door} />).getByTestId('trial-card-v2-fill');
    expect(StyleSheet.flatten(worseFill.props.style).width).toBe(`${(23 / 56) * 100}%`);
  });

  it('the spoken label is exactly the visible lines (C-8), and by default the tap opens the trial once', () => {
    const i = withOffDiet();
    const tree = render(<TrialStrip model={resolveTrialStrip(i)} {...door} />);
    const card = tree.getByTestId('trial-card-v2');
    expect(card.props.accessibilityLabel).toBe(
      'Diet trial · day 23 of 56. Ends Aug 27 · 3 off-diet feedings logged.',
    );
    fireEvent.press(card);
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith('/trial/pet-1');
  });

  it('sits below SignalZone and above the Today card on Home', () => {
    const home = readFileSync(
      join(__dirname, '..', '..', 'app', '(tabs)', 'index.tsx'),
      'utf8',
    );
    // `<SignalZone` (not `<SignalZone />`) — SR-5 passes it props, so the element is not
    // self-closing on one token.
    const signal = home.indexOf('<SignalZone');
    const strip = home.search(/<TrialStrip\b/);
    const today = home.search(/<TodayCard\b/);
    // Assert the anchors exist first — `-1 < -1 < -1` would otherwise pass.
    expect(signal).toBeGreaterThan(-1);
    expect(strip).toBeGreaterThan(-1);
    expect(today).toBeGreaterThan(-1);
    // Principle 3: safety insights always lead, and a trial is context, not an
    // insight. Moving this above SignalZone puts an eight-week status line ahead
    // of a red-flag safety card.
    expect(signal).toBeLessThan(strip);
    expect(strip).toBeLessThan(today);
  });
});
