// The Home strip's three acceptance criteria (§4.2, §12 PR 4): it renders ONLY
// while a trial is active, its bar encodes day progress and nothing else, and it
// SITS BELOW SignalZone. The third is a property of the Home screen's layout
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

import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
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

describe('TrialStrip', () => {
  it('renders nothing at all when there is no active trial', () => {
    expect(render(<TrialStrip model={null} />).toJSON()).toBeNull();
    expect(
      render(<TrialStrip model={resolveTrialStrip({ ...input(), trial: null })} />).toJSON(),
    ).toBeNull();
    expect(
      render(<TrialStrip model={resolveTrialStrip(input({
        trial: {
          status: 'completed', startedAt: '2026-07-03', endedAt: '2026-08-27',
          targetDurationDays: 56, foodLabel: FOOD,
        },
      }))} />).toJSON(),
    ).toBeNull();
  });

  it('is a day count, a day bar and one line', () => {
    const tree = render(<TrialStrip model={resolveTrialStrip(input())} />);
    expect(tree.getByText('Diet trial · day 23 of 56')).toBeTruthy();
    expect(tree.getByText(
      'Zignature Kangaroo Formula · ends 27 August · meals logged on 22 of 23 days',
    )).toBeTruthy();
  });

  it('binds the bar to day progress, not to coverage', () => {
    const widthOf = (i: TrialCardInput) => {
      const tree = render(<TrialStrip model={resolveTrialStrip(i)} />);
      const flat = StyleSheet.flatten(
        tree.getByTestId('trial-strip-fill').props.style,
      ) as { width: string };
      return Number(flat.width.replace('%', ''));
    };
    expect(widthOf(input())).toBeCloseTo((23 / 56) * 100, 6);
    // Same day, far worse record — identical bar.
    expect(widthOf(input({ coverage: { daysLogged: 2, daysElapsed: 23 } })))
      .toBeCloseTo((23 / 56) * 100, 6);
  });

  it('renders no percentage and no blended metric', () => {
    const tree = render(<TrialStrip model={resolveTrialStrip(input())} />);
    expect(tree.queryByText(/%/)).toBeNull();
    expect(tree.queryByText(/compliance/i)).toBeNull();
  });

  // Signals v2 (CUL-13, §4.2) — the standing vomit-count line, a second line below the coverage line.
  const trialResponseCounts = {
    trialDayNumber: 23,
    trialCount: 4,
    baselineCount: 20,
    trialLoggedDays: 18,
    baselineLoggedDays: 40,
    baselineWindowDays: 49,
    densityComparable: true,
  };

  it('renders the standing vomit-count line when signals_v2 supplied trialResponse (a second line)', () => {
    const tree = render(<TrialStrip model={resolveTrialStrip(input({ trialResponse: trialResponseCounts }))} />);
    // Both lines present: the coverage line AND the vomit-count line.
    expect(tree.getByText(/meals logged on 22 of 23 days/)).toBeTruthy();
    expect(tree.getByText("Vomiting: 4 in the trial's 23 days · 20 in the 7 weeks before.")).toBeTruthy();
  });

  it('renders NO standing line when the flag is off (no trialResponse) — byte-identical strip', () => {
    const tree = render(<TrialStrip model={resolveTrialStrip(input())} />);
    expect(tree.queryByText(/^Vomiting:/)).toBeNull();
  });

  it('folds the standing line into the strip a11y label (present), leaves it verbatim when absent', () => {
    const withLine = render(
      <TrialStrip model={resolveTrialStrip(input({ trialResponse: trialResponseCounts }))} onPress={jest.fn()} />,
    );
    expect(withLine.getByTestId('trial-strip').props.accessibilityLabel).toBe(
      "Diet trial · day 23 of 56. Vomiting: 4 in the trial's 23 days · 20 in the 7 weeks before. Open the diet trial.",
    );
    // Flag-off: unchanged from the shipped label (asserted verbatim in the tap test above too).
    const without = render(<TrialStrip model={resolveTrialStrip(input())} onPress={jest.fn()} />);
    expect(without.getByTestId('trial-strip').props.accessibilityLabel).toBe(
      'Diet trial · day 23 of 56. Open the diet trial.',
    );
  });

  it('sits below SignalZone and above TodayZone on Home', () => {
    const home = readFileSync(
      join(__dirname, '..', '..', 'app', '(tabs)', 'index.tsx'),
      'utf8',
    );
    // `<SignalZone` (not `<SignalZone />`) — SR-5 passes it a `trialRunning` prop, so the
    // element is no longer self-closing on one token; the layout-order assertion is unchanged.
    const signal = home.indexOf('<SignalZone');
    const strip = home.indexOf('<TrialStrip');
    const today = home.indexOf('<TodayZone />');
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

  it('opens the Pet tab card when tapped', () => {
    const onPress = jest.fn();
    const tree = render(<TrialStrip model={resolveTrialStrip(input())} onPress={onPress} />);
    fireEvent.press(tree.getByTestId('trial-strip'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(tree.getByTestId('trial-strip').props.accessibilityLabel)
      .toBe('Diet trial · day 23 of 56. Open the diet trial.');
  });
});
