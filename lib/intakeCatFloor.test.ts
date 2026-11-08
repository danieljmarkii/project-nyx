// CUL-2680: a cat 24 h or more without a meal rated Most or All gets the floor on Home, the banner,
// the strip, the card's text and the trial card, whatever kind of card raised it (clinical-guardrails
// line 85: the predicate wins over the card type). The fixture is the issue's own: nine days of
// "All", the last at 07:00 yesterday, then "Some" at 18:00, 08:00 and 18:00, and now is 20:00.

import { FLOOR_ASK } from './incidentAskWords';
import { detectIntakeDecline, type AnalyticsMeal } from './analytics';
import { trialDeclineVetLine } from './dietTrialCompletion';
import { intakeDeclineFacts } from './dietTrialFacts';
import type { IntakeDeclineFinding } from './signal';
import { bannerCopy, evidenceText, intakeMeetsCatFloor, NO_GOOD_MEAL_CLAUSE, safetyAskLevel, STRIP_ASKS, stripAskLine } from './signalCopy';
import { signalHomeAsk } from './signalHomeLine';

const HOUR = 3_600_000;
const NOW = Date.parse('2026-11-08T20:00:00Z');
const LAST_ALL = '2026-11-07T07:00:00.000Z'; // 37 h before NOW

function card(over: Partial<IntakeDeclineFinding> = {}): IntakeDeclineFinding {
  return {
    type: 'intake_decline',
    priorityClass: 'safety',
    trigger: 'consecutive_low',
    species: 'cat',
    daysBelowBaseline: 1,
    refusedFoodLabel: null,
    ratedMealsConsidered: 18,
    allRefused: false,
    lastFullMealIso: LAST_ALL,
    lastGoodMealIso: LAST_ALL,
    noGoodMeal24h: true,
    ...over,
  };
}

/** Every surface's ask for the card, at NOW. */
function asks(f: IntakeDeclineFinding) {
  return {
    home: signalHomeAsk(f, NOW),
    banner: bannerCopy(f, 'Kiki', NOW).text,
    strip: stripAskLine(f, { nowMs: NOW }),
    evidence: evidenceText(f, 'Kiki', NOW),
    level: safetyAskLevel(f),
  };
}

describe('the 37-hour cat under an "eating less" card meets the floor everywhere (CUL-2680)', () => {
  it.each(['consecutive_low', 'refused_normal_food', 'refused_then_vomited'] as const)('%s', (trigger) => {
    const a = asks(card({ trigger, refusedFoodLabel: trigger === 'refused_normal_food' ? 'tuna pâté' : null }));
    expect(a.home).toBe(FLOOR_ASK.inline);
    expect(a.banner).toContain(FLOOR_ASK.inline);
    expect(a.banner).not.toMatch(/worth a look/);
    expect(a.strip).toBe(STRIP_ASKS.call);
    expect(a.evidence).toContain(FLOOR_ASK.inline);
    expect(a.evidence).not.toMatch(/if it carries on/);
    expect(a.level).toBe(1);
  });

  it('the card’s text says why: no meal eaten well in the last day', () => {
    expect(asks(card()).evidence).toContain(NO_GOOD_MEAL_CLAUSE);
  });

  it('a dog under the same facts keeps its conditional ask (Pattern 11)', () => {
    const a = asks(card({ species: 'dog' }));
    expect(a.home).toBe('worth keeping an eye on, and a word with your vet if it carries on');
    expect(a.banner).toMatch(/worth a look/);
    expect(a.strip).toBe(STRIP_ASKS.check);
  });

  it('a cat who ate well two hours ago keeps the card’s own ask', () => {
    const a = asks(card({ lastGoodMealIso: new Date(NOW - 2 * HOUR).toISOString(), noGoodMeal24h: false }));
    expect(a.home).toBe('worth keeping an eye on, and a word with your vet if it carries on');
    expect(a.banner).toMatch(/worth a look/);
    expect(a.strip).toBe(STRIP_ASKS.check);
    expect(a.level).toBe(0);
  });
});

describe('intakeMeetsCatFloor: the engine’s fact, then the clock, failing toward the floor', () => {
  it('a cat 20 h past her last good meal at the run firms up once the clock passes 24 h, with no new run', () => {
    const f = card({ lastGoodMealIso: new Date(NOW - 20 * HOUR).toISOString(), noGoodMeal24h: false });
    expect(intakeMeetsCatFloor(f, NOW)).toBe(false);
    expect(intakeMeetsCatFloor(f, NOW + 4 * HOUR)).toBe(true);
    expect(stripAskLine(f, { nowMs: NOW + 5 * HOUR })).toBe(STRIP_ASKS.call);
  });

  it('a cache from before the field reads the stricter All-only anchor; neither fact counts as met', () => {
    const legacy = card({ lastGoodMealIso: undefined, noGoodMeal24h: undefined });
    expect(intakeMeetsCatFloor({ ...legacy, lastFullMealIso: new Date(NOW - 3 * HOUR).toISOString() }, NOW)).toBe(false);
    expect(intakeMeetsCatFloor({ ...legacy, lastFullMealIso: LAST_ALL }, NOW)).toBe(true);
    expect(intakeMeetsCatFloor({ ...legacy, lastFullMealIso: null }, NOW)).toBe(true);
    expect(intakeMeetsCatFloor({ ...legacy, lastFullMealIso: undefined }, NOW)).toBe(true);
  });

  it('a caller’s own live check can only add the floor', () => {
    const fed = card({ lastGoodMealIso: new Date(NOW - HOUR).toISOString(), noGoodMeal24h: false });
    expect(intakeMeetsCatFloor(fed, NOW, true)).toBe(true);
    expect(intakeMeetsCatFloor(card(), NOW, false)).toBe(true);
  });

  it('a dog never meets it, and an `other` follows the Signal’s every-species-but-a-dog rule', () => {
    expect(intakeMeetsCatFloor(card({ species: 'dog' }), NOW)).toBe(false);
    expect(intakeMeetsCatFloor(card({ species: 'other' }), NOW)).toBe(true);
  });
});

describe('the diet trial card and closing sheet take the phone detector’s D3 fact', () => {
  const meal = (iso: string, intakeRating: string): AnalyticsMeal =>
    ({ ms: Date.parse(iso), foodItemId: 'f1', foodLabel: 'Kibble', foodType: 'meal', primaryProtein: 'chicken', intakeRating }) as AnalyticsMeal;
  const days = Array.from({ length: 9 }, (_, i) => meal(new Date(Date.parse(LAST_ALL) - i * 24 * HOUR).toISOString(), 'all'));
  const meals = [...days, meal('2026-11-07T18:00:00Z', 'some'), meal('2026-11-08T08:00:00Z', 'some'), meal('2026-11-08T18:00:00Z', 'some')];

  it('the issue’s cat: the detector says D3 is met, and the vet line keeps the floor', () => {
    const out = detectIntakeDecline({ timeZone: 'UTC', species: 'cat', nowMs: NOW, meals, freeFedSpans: [] });
    expect(out.status).toBe('watch');
    if (out.status !== 'watch') return;
    expect(out.flags.every((f) => f.noGoodMeal24h === true)).toBe(true);
    const [fact] = intakeDeclineFacts(out.flags, 'Kiki');
    expect(fact.noGoodMeal24h).toBe(true);
    expect(trialDeclineVetLine('cat', fact, 'Kiki', fact.noGoodMeal24h)).toBe('A cat that stops eating needs a call today, whatever the trial is doing.');
  });

  it('a cat who ate Most this morning: the fact is false, and the line is deferential with the floor as its condition', () => {
    // Most at 07:00 instead of the issue's 08:00 Some: a good meal 13 h ago, and the day still low.
    const fed = meals.map((m) => (m.ms === Date.parse('2026-11-08T08:00:00Z') ? { ...m, ms: Date.parse('2026-11-08T07:00:00Z'), intakeRating: 'most' } : m));
    const flags = detectIntakeDecline({ timeZone: 'UTC', species: 'cat', nowMs: NOW, meals: fed, freeFedSpans: [] });
    if (flags.status === 'watch') expect(flags.flags.every((f) => f.noGoodMeal24h === false)).toBe(true);
    const [fact] = intakeDeclineFacts([{ trigger: 'consecutive_low', class: 'health_watch', species: 'cat', baselineScore: 4, recentScore: 2, daysBelowBaseline: 1, refusedFoodLabel: null, ratedMealsConsidered: 9, allRefused: false, noGoodMeal24h: false }], 'Kiki');
    expect(fact.noGoodMeal24h).toBe(false);
    expect(trialDeclineVetLine('cat', fact, 'Kiki', fact.noGoodMeal24h)).toContain(`If Kiki goes a day without a full meal, ${FLOOR_ASK.inline}`);
  });
});
