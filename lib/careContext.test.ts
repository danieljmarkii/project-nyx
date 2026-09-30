// EN-10's client reader (Engines v3 PR-38, CUL-1421). The lines are the server's; these tests
// pin that the client relays them whole, in order, and prints nothing it did not receive.

import { careContextLinesOf } from './careContext';
import type { CareContextLine, SignalFinding, SymptomChronicityFinding } from './signal';
import { linesForSign, type CareContextArgs, type CourseFact } from '../supabase/functions/generate-signal/careContext';
import type { SymptomEvent, SymptomType } from '../supabase/functions/generate-signal/detection';

const chronicity = (careContext?: unknown): SignalFinding =>
  ({
    type: 'symptom_chronicity',
    priorityClass: 'safety',
    symptomType: 'vomit',
    episodeCount: 11,
    spanDays: 40,
    activeWeeks: 5,
    symptomDays: 10,
    daysSinceLastEpisode: 1,
    firstOnsetIso: '2026-08-18T09:00:00.000Z',
    tier: 'standard',
    windowDays: 56,
    ...(careContext === undefined ? {} : { careContext }),
  }) as SymptomChronicityFinding;

const line = (kind: CareContextLine['kind'], text: string, over: Partial<CareContextLine> = {}): CareContextLine => ({
  kind,
  anchorOn: '2026-09-16',
  days: 11,
  count: 4,
  loggedDays: 11,
  text,
  ...over,
});

describe('careContextLinesOf', () => {
  it('is empty when the field is absent: the flag-off and old-cache finding', () => {
    expect(careContextLinesOf(chronicity())).toEqual([]);
  });

  it('is empty on a finding type that never carries lines', () => {
    const intake = { type: 'intake_decline', priorityClass: 'safety', trigger: 'consecutive_low', species: 'cat', daysBelowBaseline: 3, refusedFoodLabel: null, ratedMealsConsidered: 6 } as SignalFinding;
    expect(careContextLinesOf(intake)).toEqual([]);
  });

  it('reads no lines off a type the server never decorates, even if a cache carries some', () => {
    // Get ready's trial-response row owns its detail (the other trial's title); a line here
    // would compete with it, so the reader is gated by type, not by the server's restraint.
    const trialResponse = { type: 'trial_response', priorityClass: 'insight', careContext: [line('visit', 'Since the Sep 16 visit, 11 days.')] } as unknown as SignalFinding;
    expect(careContextLinesOf(trialResponse)).toEqual([]);
  });

  it("relays the server's sentences verbatim and in its order (the course above the trial)", () => {
    const f = chronicity([
      line('course', 'Prednisone since Sep 21, 6 days: 2 episodes, with something logged on 6 of 6.', { drugLabel: 'Prednisone' }),
      line('trial', 'Rabbit trial, day 64 of 84: 18 episodes in its 64 days, with something logged on 62.'),
      line('visit', 'Since the Sep 16 visit, 11 days: 4 episodes, with something logged on 11 of 11.'),
    ]);
    expect(careContextLinesOf(f)).toEqual([
      'Prednisone since Sep 21, 6 days: 2 episodes, with something logged on 6 of 6.',
      'Rabbit trial, day 64 of 84: 18 episodes in its 64 days, with something logged on 62.',
      'Since the Sep 16 visit, 11 days: 4 episodes, with something logged on 11 of 11.',
    ]);
  });

  it('never composes from the numbers: a withheld zero stays withheld whatever `count` says', () => {
    // The server withheld the zero in the text. A client that rebuilt the sentence from the
    // structured fields would print "0 episodes" beside a steroid, the "it worked" reading.
    const f = chronicity([line('course', 'Prednisone since Sep 21, 6 days. Started 6 days ago.', { count: 0, loggedDays: 6 })]);
    const out = careContextLinesOf(f);
    expect(out).toEqual(['Prednisone since Sep 21, 6 days. Started 6 days ago.']);
    expect(out.join(' ')).not.toMatch(/\b0 episodes?\b/);
  });

  it.each([
    ['not an array', { kind: 'visit', text: 'x' }],
    ['an empty array', []],
    ['an unknown kind', [line('course', 'Prednisone since Sep 21.'), { ...line('visit', 'x'), kind: 'appointment' }]],
    ['a blank sentence', [line('course', 'Prednisone since Sep 21.'), line('visit', '   ')]],
    ['a missing sentence', [line('course', 'Prednisone since Sep 21.'), { kind: 'trial' }]],
    ['a null member', [line('course', 'Prednisone since Sep 21.'), null]],
  ])('draws nothing at all over %s (one bad line would leave the trial first beside a steroid)', (_, careContext) => {
    expect(careContextLinesOf(chronicity(careContext))).toEqual([]);
  });

  describe("round trip through the server's own composer (PR-22's linesForSign)", () => {
    // The mock's record (§05): today Sep 27, the visit Sep 16, prednisone since Sep 21.
    const DAY = 86_400_000;
    const NOW = Date.parse('2026-09-27T18:00:00.000Z');
    const at = (day: string) => `${day}T09:00:00.000Z`;
    const dayKey = (ago: number) => new Date(NOW - ago * DAY).toISOString().slice(0, 10);
    const symptom = (type: SymptomType, iso: string): SymptomEvent => ({ id: `${type}-${iso}`, type, occurredAt: iso, occurredAtConfidence: null, severity: null });
    const PRED: CourseFact = { drugLabel: 'Prednisone', names: [], startedOn: '2026-09-21', endedOn: null, status: 'active' };
    const args = (symptoms: SymptomEvent[]): CareContextArgs => ({
      facts: {
        lastVisitOn: '2026-09-16',
        loggedAt: Array.from({ length: 61 }, (_, i) => `${dayKey(60 - i)}T07:00:00.000Z`),
        readSinceIso: new Date(NOW - 180 * DAY).toISOString(),
      },
      symptoms,
      courses: [PRED],
      trial: null,
      timezone: 'UTC',
      nowMs: NOW,
      episodeGapHours: 3,
    });

    it('5a: the vomiting screen prints exactly what the server composed', () => {
      const server = linesForSign('vomit', args([at('2026-09-18'), at('2026-09-20'), at('2026-09-23'), at('2026-09-26')].map((d) => symptom('vomit', d))));
      expect(careContextLinesOf(chronicity(server))).toEqual(server.map((l) => l.text));
      expect(careContextLinesOf(chronicity(server))[0]).toMatch(/^Prednisone since Sep 21/);
    });

    it('5b: no cough since the steroid started, and no zero reaches the client', () => {
      const server = linesForSign('cough', args([at('2026-09-17'), at('2026-09-18'), at('2026-09-19')].map((d) => symptom('cough', d))));
      const out = careContextLinesOf(chronicity(server));
      expect(out).toEqual(server.map((l) => l.text));
      expect(out[0]).toBe('Prednisone since Sep 21, 6 days. Started 6 days ago.');
      expect(out.join(' ')).not.toMatch(/\b0 episodes?\b/);
    });
  });
});
