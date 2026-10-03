import { careStateQuietsAsk, careStateValueOf } from './careState';
import type { SignalFinding } from './signal';
import { signalHomeLine } from './signalHomeLine';

// EN-9 (Engines v3 PR-23, CUL-1417): the one client rule, and Home's ask through it.

const chronicity = (careState?: unknown): SignalFinding =>
  ({
    type: 'symptom_chronicity',
    priorityClass: 'safety',
    symptomType: 'vomit',
    episodeCount: 14,
    spanDays: 40,
    activeWeeks: 5,
    symptomDays: 12,
    daysSinceLastEpisode: 1,
    firstOnsetIso: '2026-08-03T12:00:00Z',
    tier: 'firm',
    windowDays: 56,
    ...(careState === undefined ? {} : { careState }),
  }) as unknown as SignalFinding;

describe('careStateValueOf / careStateQuietsAsk', () => {
  it('reads the four states and nothing else', () => {
    expect(careStateValueOf(chronicity())).toBeNull();
    expect(careStateValueOf(chronicity({ state: 'with_vet' }))).toBe('with_vet');
    expect(careStateValueOf(chronicity({ state: 'seen' }))).toBeNull();
    expect(careStateValueOf(chronicity('with_vet'))).toBeNull();
    expect(careStateValueOf(chronicity(null))).toBeNull();
  });

  it('only the two watched states take the ask away', () => {
    expect(careStateQuietsAsk(chronicity({ state: 'with_vet' }))).toBe(true);
    expect(careStateQuietsAsk(chronicity({ state: 'recheck_booked' }))).toBe(true);
    expect(careStateQuietsAsk(chronicity({ state: 'raised' }))).toBe(false);
    expect(careStateQuietsAsk(chronicity({ state: 'raised_again' }))).toBe(false);
    expect(careStateQuietsAsk(chronicity({ state: 'WITH_VET' }))).toBe(false);
  });
});

describe('D1: a care state on an escalation is ignored (AC 3)', () => {
  it('an intake decline or red flag carrying a planted with_vet keeps its ask', () => {
    const intake = { type: 'intake_decline', priorityClass: 'safety', careState: { state: 'with_vet' } } as unknown as SignalFinding;
    const flag = { type: 'incident_red_flag', priorityClass: 'safety', careState: { state: 'with_vet' } } as unknown as SignalFinding;
    expect(careStateQuietsAsk(intake)).toBe(false);
    expect(careStateQuietsAsk(flag)).toBe(false);
  });
});

describe("Home's ask under a care state", () => {
  it('flag off (no field) and raised keep the shipped ask; a watched concern asks nothing', () => {
    expect(signalHomeLine(chronicity())?.ask).toBe('worth booking a vet visit');
    expect(signalHomeLine(chronicity({ state: 'raised' }))?.ask).toBe('worth booking a vet visit');
    expect(signalHomeLine(chronicity({ state: 'raised_again' }))?.ask).toBe('worth booking a vet visit');
    expect(signalHomeLine(chronicity({ state: 'with_vet' }))?.ask).toBeNull();
    expect(signalHomeLine(chronicity({ state: 'recheck_booked' }))?.ask).toBeNull();
    // The row itself stays: a watched concern is never dropped from Home.
    expect(signalHomeLine(chronicity({ state: 'with_vet' }))?.headline).toBe(signalHomeLine(chronicity())?.headline);
  });
});
