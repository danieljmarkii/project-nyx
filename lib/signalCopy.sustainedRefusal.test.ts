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
import { parseFreeFedIntakeSpans } from './freeFedIntake';
import { sustainedRefusalSentence as serverSentence } from '../supabase/functions/generate-signal/phrasing';
import type { IntakeDeclineFinding, SustainedRefusalFacts } from './signal';

const FACTS = { meals: 6, refused: 4, picked: 2, some: 0, days: 3, windowHours: 72, firstIso: '2026-07-28T00:00:00.000Z', endIso: '2026-07-30T20:00:00.000Z', endLocalDay: '2026-07-30', anchoredToLastRating: false };

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
    for (const f of [FACTS, { ...FACTS, refused: 6, picked: 0 }, { ...FACTS, refused: 1, picked: 2, some: 3 }, { ...FACTS, anchoredToLastRating: true }]) {
      // Every species the card can carry, and none (CUL-2668: a dog's is deferential, every other the floor).
      for (const sp of ['cat', 'dog', 'other', undefined] as const) {
        expect(sustainedRefusalSentence(f, 'Miso', sp)).toBe(serverSentence(f, 'Miso', sp));
      }
    }
  });

  it('says counts and a call, never "less than usual" or "picky"', () => {
    const f = card();
    const all = [sampleLine(f), evidenceText(f, 'Miso'), stripNameLine(f), signalHomeAsk(f)].join(' | ');
    expect(all).not.toMatch(/less than usual|below the usual|picky|fussy|!/i);
    expect(sampleLine(f)).toBe('6 rated meals on 3 days, none eaten well');
    expect(evidenceText(f, 'Miso')).toMatch(/^Miso hasn't eaten well at any meal you watched and rated in the last 72 hours: 6 meals on 3 days \(4 refused, 2 picked at\) — call your vet today\./);
    // CUL-2667 / CUL-2668: a cat's sustained refusal is the floor on Home and in its sentence.
    expect(evidenceText(f, 'Miso')).toContain(signalHomeAsk(f) as string);
    expect(evidenceText({ ...f, species: 'dog' }, 'Miso')).toMatch(/\(4 refused, 2 picked at\)\. That's worth a call to your vet today\./);
    expect(signalHomeAsk(f)).toBe(f.species === 'dog' ? 'worth a call to your vet today' : 'call your vet today');
    expect(stripAskLine(f)).toBe('Call your vet');
    expect(stripNameLine(f)).toBe('No meal eaten well');
  });

  it('a malformed cache reads as absent, and the card still escalates', () => {
    const broken = card({ ...FACTS, meals: Number.NaN });
    expect(sustainedRefusalOf(broken)).toBeNull();
    expect(evidenceText(broken, 'Miso')).toMatch(/ — call your vet today\./);
    expect(evidenceText({ ...broken, species: 'dog' }, 'Miso')).toMatch(/lately\. That's worth a call to your vet today\./);
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
    expect(declineHeadline(res.flags[0], 'Miso')).toBe("Miso hasn't eaten well at any meal you watched and rated in the 72 hours to now: 3 meals on 2 days.");
  });

  it('adversarial pass 2: a pre-076 take-up day\'s bowl "ate it all" does not stand the floor down', () => {
    const now = Date.parse('2026-07-31T00:00:00.000Z');
    const at = (iso: string, rating: string, foodItemId = 'f1'): AnalyticsMeal => ({
      ms: Date.parse(iso), foodItemId, foodLabel: null, foodType: 'meal', primaryProtein: null, intakeRating: rating,
    });
    const meals = ['2026-07-28T12', '2026-07-28T22', '2026-07-29T12', '2026-07-29T22', '2026-07-30T12', '2026-07-30T22'].map((h) =>
      at(`${h}:00:00.000Z`, 'refused'),
    );
    meals.push(at('2026-07-30T13:00:00.000Z', 'all', 'kibble'));
    const spans = parseFreeFedIntakeSpans([
      { foodItemId: 'kibble', createdAt: '2026-07-01T12:00:00.000Z', activeFrom: '2026-07-01', activeUntil: '2026-07-30', endedAt: null },
    ]);
    const res = detectIntakeDecline({ species: 'cat', nowMs: now, meals, freeFedSpans: spans, timeZone: 'America/New_York' });
    expect(res.status).toBe('watch');
    if (res.status !== 'watch') return;
    expect(res.flags[0].trigger).toBe('sustained_refusal');
    expect(res.flags[0].sustainedRefusal?.meals).toBe(6);
  });

  it('adversarial pass 3: record B1 fires on the phone too (the anchored window is a fallback only)', () => {
    const at = (iso: string, rating: string): AnalyticsMeal => ({
      ms: Date.parse(iso), foodItemId: 'f1', foodLabel: null, foodType: 'meal', primaryProtein: null, intakeRating: rating,
    });
    const meals = [
      at('2026-07-27T00:30:00.000Z', 'all'),
      at('2026-07-27T12:00:00.000Z', 'refused'), at('2026-07-28T12:00:00.000Z', 'refused'),
      at('2026-07-29T12:00:00.000Z', 'picked'), at('2026-07-29T23:59:00.000Z', 'refused'),
    ];
    const res = detectIntakeDecline({ species: 'cat', nowMs: Date.parse('2026-07-30T06:00:00.000Z'), meals, freeFedSpans: [], timeZone: 'UTC' });
    expect(res.status).toBe('watch');
    if (res.status !== 'watch') return;
    expect(res.flags[0].trigger).toBe('sustained_refusal');
  });

  it('CUL-2406 instance 2: a free-fed mix rated "ate it all" does not clear the floor on the phone', () => {
    const meals = [m(2, 'refused'), m(20, 'refused'), m(30, 'refused'), m(44, 'refused')];
    const comp = (foodItemId: string) => ({ foodItemId, foodLabel: foodItemId, foodType: 'meal', primaryProtein: null, proteins: [] });
    meals.push({ ...m(25, 'all'), foodItemId: null, bowl: { status: 'mix', compositionKey: 'kibble+f1', components: [comp('kibble'), comp('f1')] } });
    const spans = parseFreeFedIntakeSpans([
      { foodItemId: 'kibble', createdAt: '2026-07-01T00:00:00.000Z', activeFrom: '2026-07-01', activeUntil: null, endedAt: null },
    ]);
    const res = detectIntakeDecline({ species: 'cat', nowMs: NOW, meals, freeFedSpans: spans, timeZone: 'UTC' });
    expect(res.status).toBe('watch');
    if (res.status !== 'watch') return;
    expect(res.flags[0].trigger).toBe('sustained_refusal');
  });

  it('one meal rated "ate most" stands it down, and the old "not enough data" stays', () => {
    const res = detectIntakeDecline({ species: 'cat', nowMs: NOW, meals: [m(2, 'refused'), m(20, 'most'), m(30, 'refused')], freeFedSpans: [], timeZone: 'UTC' });
    expect(res.status).not.toBe('watch');
  });
});
