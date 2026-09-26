// The ledger and the lane, drawn (TS-2, CUL-1298). The model's arithmetic is proven
// in `lib/trialLedger.test.ts`; these pin what the drawing owes: one accessible
// element per grid carrying the model's sentence, every row's count on screen, the
// exposure dot in ink and never rose, and a lane that draws the ledger's own row.
jest.mock('../../lib/feedingArrangements', () => ({
  getActiveArrangementsForPet: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: jest.fn(() => false) }));

import React from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { theme } from '../../constants/theme';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { computeTrialFacts, type TrialFeeding } from '../../lib/dietTrial';
import type { TrialCardInput } from '../../lib/dietTrialCard';
import { buildTrialLedger, thisWeekLane, type TrialLedger as Model } from '../../lib/trialLedger';
import { ThisWeekLane } from './ThisWeekLane';
import { TrialLedger } from './TrialLedger';

const START_KEY = '2026-07-03';
const onDay = (n: number, h = 8) => new Date(2026, 6, 3 + n - 1, h).toISOString();

/** Mochi on day 23 of 56: days 1–22 logged but day 11, a treat on day 17. */
function mochi(): { ledger: Model; input: TrialCardInput } {
  const feedings: TrialFeeding[] = [];
  for (let d = 1; d <= 22; d++) {
    if (d === 11) continue;
    feedings.push({
      eventId: `m${d}`, occurredAt: onDay(d), foodItemId: 'f1', foodKey: null,
      label: 'Royal Canin Rabbit', foodType: 'meal', proteins: ['rabbit'], intakeRating: 'all',
    });
  }
  feedings.push({
    eventId: 't17', occurredAt: onDay(17, 19), foodItemId: 'fx', foodKey: null,
    label: 'Acme Chicken Jerky', foodType: 'treat', proteins: ['chicken'], intakeRating: null,
  });
  const nowMs = new Date(2026, 6, 25, 20).getTime();
  const facts = computeTrialFacts({
    trial: { id: 't1', startedAt: START_KEY, endedAt: null, targetDurationDays: 56, species: 'dog' },
    allowedFoods: [{
      foodItemId: 'f1', foodKey: null, label: 'Royal Canin Rabbit', role: 'primary_diet',
      allowedFrom: START_KEY, allowedUntil: null, primaryProtein: 'rabbit', proteins: ['rabbit'],
    }],
    feedings,
    doses: [],
    arrangements: [],
    nowMs,
  });
  const input: TrialCardInput = {
    trial: { id: 't1', status: 'active', startedAt: START_KEY, endedAt: null, targetDurationDays: 56 },
    nowMs,
    petName: 'Mochi',
    coverage: { daysLogged: facts.coverage!.daysLogged, daysElapsed: facts.coverage!.daysElapsed },
  };
  const ledger = buildTrialLedger({ input, facts });
  if (!ledger) throw new Error('fixture drew no ledger');
  return { ledger, input };
}

const flat = (node: { props: { style?: unknown } }): ViewStyle =>
  StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>) ?? {};

describe('TrialLedger', () => {
  // What this CAN prove is that the grid exposes exactly one role-bearing node and
  // that it carries the sentence. It cannot prove VoiceOver merges the subtree —
  // RNTL does not simulate that — so the `accessible` prop is pinned directly too.
  it('is ONE accessible element whose label is the model sentence', () => {
    const { ledger } = mochi();
    render(<TrialLedger ledger={ledger} />);
    const images = screen.getAllByRole('image');
    expect(images).toHaveLength(1);
    expect(images[0].props.accessibilityLabel).toBe(ledger.accessibilityLabel);
    expect(images[0].props.accessible).toBe(true);
    expect(ledger.accessibilityLabel).toMatch(/^Mochi's trial by week: week 1, meals logged 7 of 7 days;/);
  });

  it('draws every row with its count, the two edges and the legend', () => {
    render(<TrialLedger ledger={mochi().ledger} />);
    for (const label of ['7 of 7', '6 of 7', '1 of 2 so far']) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    expect(screen.getByText('Jul 3 · day 1')).toBeTruthy();
    expect(screen.getByText('Aug 27 · day 56, the end you set')).toBeTruthy();
    for (const word of ['meals logged', 'none logged', 'an off-diet feeding logged']) {
      expect(screen.getByText(word)).toBeTruthy();
    }
    expect(screen.queryByText('not tracked')).toBeNull();
    // Eight trial weeks, seven days each.
    for (let w = 1; w <= 8; w++) expect(screen.getByTestId(`trial-ledger-row-${w}`)).toBeTruthy();
    expect(screen.getByTestId('trial-ledger-day-56')).toBeTruthy();
    expect(screen.queryByTestId('trial-ledger-day-57')).toBeNull();
  });

  it('never draws a score, percentage or verdict word', () => {
    render(<TrialLedger ledger={mochi().ledger} />);
    const text = JSON.stringify(screen.toJSON());
    expect(text).not.toMatch(/%|streak|on track|clean|missed|\bate\b|eaten/i);
  });

  it('draws the off-diet dot on day 17 only, in ink and never rose', () => {
    render(<TrialLedger ledger={mochi().ledger} />);
    const dot = screen.getByTestId('trial-ledger-day-17-offdiet');
    const style = flat(dot);
    expect(style.backgroundColor).toBe(theme.colorTextPrimary);
    expect([theme.colorEventSymptom, theme.colorEventSymptomInk]).not.toContain(style.backgroundColor);
    for (let d = 1; d <= 56; d++) {
      if (d !== 17) expect(screen.queryByTestId(`trial-ledger-day-${d}-offdiet`)).toBeNull();
    }
  });

  it('draws each fill distinctly: a gap is hollow, today is dashed, the future faint', () => {
    render(<TrialLedger ledger={mochi().ledger} />);
    const logged = flat(screen.getByTestId('trial-ledger-day-10'));
    const gap = flat(screen.getByTestId('trial-ledger-day-11'));
    const today = flat(screen.getByTestId('trial-ledger-day-23'));
    const future = flat(screen.getByTestId('trial-ledger-day-24'));
    expect(logged.backgroundColor).toBe(theme.colorAccent);
    expect(gap.backgroundColor).toBe(theme.colorSurface);
    expect(gap.borderWidth).toBeGreaterThan(0);
    expect(today.borderStyle).toBe('dashed');
    expect(future.backgroundColor).toBe(theme.colorSurfaceSubtle);
    expect(new Set([logged.backgroundColor, future.backgroundColor, gap.borderColor]).size).toBe(3);
  });

  it('draws in with one fade, and is drawn at rest under Reduce Motion', () => {
    (useReducedMotion as jest.Mock).mockReturnValueOnce(true);
    render(<TrialLedger ledger={mochi().ledger} />);
    expect(flat(screen.getByTestId('trial-ledger')).opacity).toBe(1);
  });
});

describe('ThisWeekLane', () => {
  it("draws the ledger's current row, cell for cell, with its count", () => {
    const { ledger, input } = mochi();
    const lane = thisWeekLane(ledger, input)!;
    expect(lane.row).toBe(ledger.rows[ledger.currentRowIndex!]);
    render(<ThisWeekLane lane={lane} />);
    expect(screen.getByText('Week 4 · 1 of 2 so far')).toBeTruthy();
    const image = screen.getByRole('image');
    expect(image.props.accessibilityLabel).toBe('This trial week, week 4: meals logged on 1 of 2 days so far');
    // Days 22–28: logged, today open, then five not reached.
    const fills = lane.row.days.map((d) => flat(screen.getByTestId(`trial-lane-day-${d.trialDay}`)));
    expect(fills).toHaveLength(7);
    expect(fills[0].backgroundColor).toBe(theme.colorAccent);
    expect(fills[1].borderStyle).toBe('dashed');
    fills.slice(2).forEach((f) => expect(f.backgroundColor).toBe(theme.colorSurfaceSubtle));
  });
});
