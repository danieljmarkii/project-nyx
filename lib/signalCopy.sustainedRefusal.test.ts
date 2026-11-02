// The sustained-refusal floor on the phone (the stopgap for a record with no good meals): the
// client's copy over a `sustained_refusal` card, the server-sentence mirror, and the phone's own
// detector twin (`lib/analytics.ts`), which the parity suite drives against the server.

jest.mock('./db', () => ({ getDb: jest.fn() }));
jest.mock('./feedingArrangements', () => ({ getActiveArrangementsForPet: jest.fn() }));

import {
  evidenceText,
  sampleLine,
  stripAskLine,
  stripNameLine,
  sustainedRefusalOf,
  sustainedRefusalSentence,
} from './signalCopy';
import { signalHomeAsk } from './signalHomeLine';
import { detectIntakeDecline, type AnalyticsMeal } from './analytics';
import { declineHeadline } from './dietTrialFacts';
import { sustainedRefusalSentence as serverSentence } from '../supabase/functions/generate-signal/phrasing';
import type { IntakeDeclineFinding, SustainedRefusalFacts } from './signal';

const FACTS: SustainedRefusalFacts = { meals: 6, refused: 4, picked: 2, days: 3, windowHours: 72, firstIso: '2026-07-28T00:00:00.000Z' };

function card(facts: SustainedRefusalFacts | undefined = FACTS): IntakeDeclineFinding {
  return {
    type: 'intake_decline',
    priorityClass: 'safety',
    trigger: 'sustained_refusal',
    species: 'cat',
    daysBelowBaseline: 3,
    refusedFoodLabel: null,
    ratedMealsConsidered: 6,
    sustainedRefusal: facts,
  };
}

describe('the sustained-refusal card on the phone', () => {
  it('mirrors the server sentence word for word', () => {
    for (const f of [FACTS, { ...FACTS, refused: 6, picked: 0 }, { ...FACTS, refused: 0, picked: 6 }]) {
      expect(sustainedRefusalSentence(f, 'Miso')).toBe(serverSentence(f, 'Miso'));
    }
  });

  it('says counts and a call, never "less than usual" or "picky"', () => {
    const f = card();
    const all = [sampleLine(f), evidenceText(f, 'Miso'), stripNameLine(f), signalHomeAsk(f)].join(' | ');
    expect(all).not.toMatch(/less than usual|below the usual|picky|fussy|!/i);
    expect(sampleLine(f)).toBe('6 rated meals on 3 days, none eaten well');
    expect(evidenceText(f, 'Miso')).toMatch(/^Miso has picked at or refused every meal you watched and rated in the last 72 hours, 6 meals on 3 days\. That's worth a call to your vet today\./);
    expect(signalHomeAsk(f)).toBe('worth a call to your vet today');
    expect(stripAskLine(f)).toBe('Call your vet');
    expect(stripNameLine(f)).toBe('No meal eaten well');
  });

  it('a malformed cache reads as absent, and the card still escalates', () => {
    const broken = card({ ...FACTS, meals: Number.NaN });
    expect(sustainedRefusalOf(broken)).toBeNull();
    expect(evidenceText(broken, 'Miso')).toMatch(/worth a call to your vet today/);
    expect(evidenceText(broken, 'Miso')).not.toMatch(/NaN/);
  });
});

describe('the phone twin of the floor', () => {
  const NOW = Date.parse('2026-07-30T20:00:00.000Z');
  const H = 3_600_000;
  const m = (hoursAgo: number, rating: string | null): AnalyticsMeal => ({
    ms: NOW - hoursAgo * H,
    foodItemId: 'f1',
    foodLabel: 'Wet food',
    foodType: 'meal',
    primaryProtein: null,
    intakeRating: rating,
  });

  it('fires on three refusals on two days, below the coverage floor, and names them', () => {
    const res = detectIntakeDecline({ species: 'cat', nowMs: NOW, meals: [m(2, 'refused'), m(20, 'picked'), m(30, 'refused')], freeFedSpans: [], timeZone: 'UTC' });
    expect(res.status).toBe('watch');
    if (res.status !== 'watch') return;
    expect(res.flags[0].trigger).toBe('sustained_refusal');
    expect(declineHeadline(res.flags[0], 'Miso')).toBe('Miso has picked at or refused every meal you watched and rated in the last 72 hours, 3 meals on 2 days.');
  });

  it('one meal rated Some stands it down, and the old "not enough data" stays', () => {
    const res = detectIntakeDecline({ species: 'cat', nowMs: NOW, meals: [m(2, 'refused'), m(20, 'some'), m(30, 'refused')], freeFedSpans: [], timeZone: 'UTC' });
    expect(res.status).not.toBe('watch');
  });
});
