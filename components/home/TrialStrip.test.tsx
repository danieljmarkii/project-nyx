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
// The DEFAULT press is the thing under test below: an injected `onPress` is how the bare
// `/(tabs)/profile` push once survived (CUL-170), so the door's own push is asserted.
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
// The door's one read. A fixture that WOULD answer, so an absence under the Design v2 card
// proves the card makes no read rather than an empty record (C-41).
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

const door = { petId: 'pet-1', inputFresh: true, safety: { petId: 'pet-1', live: false } };

describe('TrialStrip', () => {
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

  it('renders nothing when Home names no pet: a door that cannot say whose trial it opens', () => {
    const i = input();
    expect(render(<TrialStrip model={resolveTrialStrip(i)} input={i} inputFresh />).toJSON()).toBeNull();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('is the door: the day count, the one line, and a bar bound to day progress, not coverage', () => {
    const widthOf = (i: TrialCardInput) => {
      const tree = render(<TrialStrip model={resolveTrialStrip(i)} input={i} {...door} />);
      return StyleSheet.flatten(tree.getByTestId('trial-strip-door-fill').props.style).width;
    };
    const tree = render(<TrialStrip model={resolveTrialStrip(input())} input={input()} {...door} />);
    expect(tree.getByText('Diet trial · day 23 of 56')).toBeTruthy();
    expect(tree.getByText(
      'Zignature Kangaroo Formula · ends Aug 27 · meals logged on 22 of 23 days',
    )).toBeTruthy();
    expect(tree.queryByTestId('trial-card-v2')).toBeNull();
    expect(widthOf(input())).toBe(`${(23 / 56) * 100}%`);
    // Same day, far worse record — identical bar.
    expect(widthOf(input({ coverage: { daysLogged: 2, daysElapsed: 23 } }))).toBe(`${(23 / 56) * 100}%`);
  });

  it('renders no percentage and no blended metric', () => {
    const tree = render(<TrialStrip model={resolveTrialStrip(input())} input={input()} {...door} />);
    expect(tree.queryByText(/%/)).toBeNull();
    expect(tree.queryByText(/compliance/i)).toBeNull();
  });

  it('keeps the standing vomit-count line (CUL-13) as a second line', () => {
    const trialResponse = {
      trialDayNumber: 23,
      trialCount: 4,
      trialLastEpisodeDayIndex: null,
      baselineCount: 20,
      trialLoggedDays: 18,
      baselineLoggedDays: 40,
      baselineWindowDays: 49,
      densityComparable: true,
    };
    const i = input({ trialResponse });
    const tree = render(<TrialStrip model={resolveTrialStrip(i)} input={i} {...door} />);
    expect(tree.getByText(/meals logged on 22 of 23 days/)).toBeTruthy();
    expect(tree.getByText("Vomiting: 4 in the trial's 23 days · 20 in the 49 days before, a longer stretch.")).toBeTruthy();
  });

  it('by default opens the strip pet’s trial screen, once, and reads its ledger facts (TS-5, TS-GA)', () => {
    const i = input();
    const tree = render(<TrialStrip model={resolveTrialStrip(i)} input={i} {...door} />);
    fireEvent.press(tree.getByTestId('trial-strip-door'));
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith('/trial/pet-1');
    expect(mockUseTrialFacts).toHaveBeenCalledWith('pet-1');
  });

  it('sits below SignalZone and above TodayZone on Home', () => {
    const home = readFileSync(
      join(__dirname, '..', '..', 'app', '(tabs)', 'index.tsx'),
      'utf8',
    );
    // `<SignalZone` (not `<SignalZone />`) — SR-5 passes it a `trialRunning` prop, so the
    // element is no longer self-closing on one token; the layout-order assertion is unchanged.
    const signal = home.indexOf('<SignalZone');
    // `\b` so a type argument (`useState<TrialStripSafety …>`, TS-5) is not the element.
    const strip = home.search(/<TrialStrip\b/);
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
});

// ── CUL-1526: under design_v2, the ruled card ─────────────────────
describe('TrialStrip: the design_v2 card (CUL-1526)', () => {
  const withOffDiet = () =>
    input({ exposures: { mayStateRecordClean: false, totalFeedings: 68, offDiet: 3 } });

  beforeEach(() => {
    mockUseTrialFacts.mockClear();
    (router.push as jest.Mock).mockClear();
  });

  it('title, a neutral bar and the one end-date line; no ratio, no lane, no ledger read', () => {
    const i = withOffDiet();
    const tree = render(<TrialStrip model={resolveTrialStrip(i)} input={i} {...door} designV2 />);
    expect(tree.queryByTestId('trial-strip-door')).toBeNull();
    expect(tree.getByText('Diet trial · day 23 of 56')).toBeTruthy();
    expect(tree.getByText('Ends Aug 27 · 3 off-diet feedings logged')).toBeTruthy();
    expect(tree.queryByText(/meals logged on/)).toBeNull();
    expect(tree.queryByText(/Vomiting/)).toBeNull();
    expect(tree.queryByTestId('trial-lane', { includeHiddenElements: true })).toBeNull();
    expect(mockUseTrialFacts).not.toHaveBeenCalled();
    const fill = StyleSheet.flatten(tree.getByTestId('trial-card-v2-fill').props.style);
    expect(fill.backgroundColor).toBe(theme.colorTextTertiary);
    expect(fill.width).toBe(`${(23 / 56) * 100}%`);
  });

  it('the spoken label is exactly the visible lines (C-8), and the tap opens the trial once', () => {
    const i = withOffDiet();
    const tree = render(<TrialStrip model={resolveTrialStrip(i)} input={i} {...door} designV2 />);
    const card = tree.getByTestId('trial-card-v2');
    expect(card.props.accessibilityLabel).toBe(
      'Diet trial · day 23 of 56. Ends Aug 27 · 3 off-diet feedings logged.',
    );
    fireEvent.press(card);
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith('/trial/pet-1');
  });

  it('identical under a live safety-class Signal card (G3 B)', () => {
    const i = withOffDiet();
    const clear = render(<TrialStrip model={resolveTrialStrip(i)} input={i} {...door} designV2 />).toJSON();
    const live = render(
      <TrialStrip model={resolveTrialStrip(i)} input={i} {...door} safety={{ petId: 'pet-1', live: true }} designV2 />,
    ).toJSON();
    expect(JSON.stringify(live)).toBe(JSON.stringify(clear));
  });

  it('without design_v2: the door', () => {
    const i = withOffDiet();
    const tree = render(<TrialStrip model={resolveTrialStrip(i)} input={i} {...door} />);
    expect(tree.getByTestId('trial-strip-door')).toBeTruthy();
    expect(tree.queryByTestId('trial-card-v2')).toBeNull();
  });
});
