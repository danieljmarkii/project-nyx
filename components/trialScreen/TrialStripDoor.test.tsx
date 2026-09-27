// Home's trial strip as the door, drawn (TS-5, CUL-1301; spec §5.1, §11 TS-5). The lane's
// gate is proven over the real loaders in `lib/trialStripDoor.test.ts`; this pins what the
// drawing owes: the tap opens the strip's pet's screen exactly once, the whole box is one
// responder at the 44pt floor, the lane draws only when the gate opens, and VoiceOver
// hears every visible line.
//
// The READ is stubbed (`useTrialFacts`); the rule is not (C-34: a mock stands in for the
// read, never for the pure function it feeds).
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));

let mockFacts: TrialFactsState = { status: 'unknown' };
const mockUseTrialFacts = jest.fn((_petId: string | null) => mockFacts);
jest.mock('../../hooks/useTrialFacts', () => ({
  useTrialFacts: (petId: string | null) => mockUseTrialFacts(petId),
}));

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { TrialFactsState } from '../../hooks/useTrialFacts';
import { computeTrialFacts, type TrialFacts, type TrialFeeding } from '../../lib/dietTrial';
import { resolveTrialStrip, type TrialCardInput } from '../../lib/dietTrialCard';
import { trialScreenHref } from '../../lib/trialRoute';
import type { TrialStripSafety } from '../../lib/trialStripDoor';
import { flat, owningTouchable } from '../../testUtils/tree';
import { TRIAL_STRIP_DOOR_HINT, TrialStripDoor } from './TrialStripDoor';

const PET = 'pet-1';
const START_KEY = '2026-07-03';
const onDay = (n: number, h = 8) => new Date(2026, 6, 3 + n - 1, h).toISOString();

/** Mochi on day 23 of 56, a meal logged on every day before today. */
function mochi(): { input: TrialCardInput; facts: TrialFacts } {
  const feedings: TrialFeeding[] = [];
  for (let d = 1; d <= 22; d++) {
    feedings.push({
      eventId: `m${d}`, occurredAt: onDay(d), foodItemId: 'f1', foodKey: null,
      label: 'Royal Canin Rabbit', foodType: 'meal', proteins: ['rabbit'], intakeRating: 'all',
    });
  }
  const nowMs = new Date(2026, 6, 25, 20).getTime();
  const facts = computeTrialFacts({
    trial: { id: 't1', startedAt: START_KEY, endedAt: null, targetDurationDays: 56, species: 'cat' },
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
    trial: {
      id: 't1', status: 'active', startedAt: START_KEY, endedAt: null, targetDurationDays: 56,
      foodLabel: 'Royal Canin Rabbit',
    },
    nowMs,
    petName: 'Mochi',
    coverage: { daysLogged: facts.coverage!.daysLogged, daysElapsed: facts.coverage!.daysElapsed },
  };
  return { input, facts };
}

const CLEAR: TrialStripSafety = { petId: PET, live: false };

function draw(safety: TrialStripSafety | null = CLEAR, over: Partial<TrialCardInput> = {}) {
  const { input: base, facts } = mochi();
  const input = { ...base, ...over };
  mockFacts = { status: 'ready', facts };
  const model = resolveTrialStrip(input)!;
  return render(
    <TrialStripDoor model={model} petId={PET} input={input} inputFresh safety={safety} />,
  );
}

beforeEach(() => {
  mockPush.mockClear();
  mockUseTrialFacts.mockClear();
});

describe('TrialStripDoor: the door', () => {
  it('opens the strip pet trial screen, once per tap (count the calls, C-22)', () => {
    draw();
    fireEvent.press(screen.getByTestId('trial-strip-door'));
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith(trialScreenHref(PET));
    expect(mockPush.mock.calls[0][0]).toBe('/trial/pet-1');
  });

  it('reads the ledger facts for the pet it was handed, never another', () => {
    draw();
    expect(mockUseTrialFacts).toHaveBeenCalled();
    for (const [petId] of mockUseTrialFacts.mock.calls) expect(petId).toBe(PET);
  });

  it('is ONE target: the headline, every line, the lane and the chevron share one responder (C-6)', () => {
    draw();
    const door = screen.getByTestId('trial-strip-door');
    const owner = owningTouchable(door);
    expect(owner).not.toBeNull();
    for (const text of [
      'Diet trial · day 23 of 56',
      /meals logged on 22 of 23 days/,
      'Week 4 · 1 of 2 so far',
      '›',
    ]) {
      expect(owningTouchable(screen.getByText(text))).toBe(owner);
    }
    // The floor, read off the RENDERED style of the responder itself (C-5).
    expect(flat(owner).minHeight).toBeGreaterThanOrEqual(44);
  });

  it('binds the day bar to day progress, as the shipped strip does', () => {
    draw();
    expect(flat(screen.getByTestId('trial-strip-door-fill')).width).toBe(`${(23 / 56) * 100}%`);
  });

  it('speaks every visible line, the lane sentence included, and names the action as a hint', () => {
    draw();
    const door = screen.getByTestId('trial-strip-door');
    expect(door.props.accessibilityLabel).toBe(
      'Diet trial · day 23 of 56. Royal Canin Rabbit · ends Aug 27 · meals logged on 22 of 23 days. ' +
        'This trial week, week 4: meals logged on 1 of 2 days so far.',
    );
    expect(door.props.accessibilityHint).toBe(TRIAL_STRIP_DOOR_HINT);
    expect(door.props.accessibilityRole).toBe('button');
  });
});

describe('TrialStripDoor: this week lane', () => {
  it('draws the ledger current row when every gate is open (non-vacuity)', () => {
    draw();
    expect(screen.getByTestId('trial-lane')).toBeTruthy();
    expect(screen.getByText('Week 4 · 1 of 2 so far')).toBeTruthy();
  });

  it('draws no lane under a live safety-class card, and says none', () => {
    draw({ petId: PET, live: true });
    expect(screen.queryByTestId('trial-lane')).toBeNull();
    expect(screen.getByTestId('trial-strip-door').props.accessibilityLabel).not.toMatch(/This trial week/);
  });

  it('draws no lane until the Signal has answered for this pet', () => {
    draw(null);
    expect(screen.queryByTestId('trial-lane')).toBeNull();
    draw({ petId: PET, live: null });
    expect(screen.queryByTestId('trial-lane')).toBeNull();
    draw({ petId: 'pet-2', live: false });
    expect(screen.queryByTestId('trial-lane')).toBeNull();
  });

  it('draws no lane while the ledger facts are still reading', () => {
    const { input } = mochi();
    mockFacts = { status: 'unknown' };
    render(
      <TrialStripDoor model={resolveTrialStrip(input)!} petId={PET} input={input} inputFresh safety={CLEAR} />,
    );
    expect(screen.queryByTestId('trial-lane')).toBeNull();
    // The strip itself still stands: withholding the lane never hides the door.
    expect(screen.getByText('Diet trial · day 23 of 56')).toBeTruthy();
  });

  it('draws no lane over a live intake decline, and the strip drops to its header', () => {
    draw(CLEAR, { intakeDeclineHeadline: 'Mochi ate less' });
    expect(screen.queryByTestId('trial-lane')).toBeNull();
  });
});
