// CUL-2680: a cat 24 h or more without a meal rated Most or All gets the floor on Home, the banner,
// the strip, the card's text and the trial card, whatever kind of card raised it (clinical-guardrails
// line 85: the predicate wins over the card type). The fixture is the issue's own: nine days of
// "All", the last at 07:00 yesterday, then "Some" at 18:00, 08:00 and 18:00, and now is 20:00.

import { FLOOR_ASK } from './incidentAskWords';
import { detectIntakeDecline, type AnalyticsMeal } from './analytics';
import { trialDeclineVetLine } from './dietTrialCompletion';
import { intakeDeclineFacts } from './dietTrialFacts';
import type { IntakeDeclineFinding } from './signal';
import { bannerCopy, evidenceText, intakeMeetsCatFloor, intakeSentenceAt, withIntakeSentencesAt, NO_GOOD_MEAL_CLAUSE, safetyAskLevel, STRIP_ASKS, stripAskLine } from './signalCopy';
import { signalHomeAsk } from './signalHomeLine';
import { safetyArrivalSpoken } from './signalSafetySpeech';
import type { CachedFinding } from './signal';

const HOUR = 3_600_000;
const NOW = Date.parse('2026-11-08T20:00:00Z');
const LAST_ALL = '2026-11-07T07:00:00.000Z'; // 37 h before NOW

// `safetyAskLevel` reads the real clock (`intakeMeetsCatFloor`'s default `nowMs`), so the suite
// pins it to NOW. Unpinned, this date-pinned fixture aged past 24 h on 2026-11-09 and the cat who
// ate well "two hours ago" read as floored (C-29's time axis).
beforeEach(() => { jest.spyOn(Date, 'now').mockReturnValue(NOW); });
afterEach(() => { jest.restoreAllMocks(); });

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

  it('a cache from before the field counts as met; its All-only anchor is no stand-in (it counts a free-fed bowl)', () => {
    const legacy = card({ lastGoodMealIso: undefined, noGoodMeal24h: undefined });
    for (const lastFullMealIso of [new Date(NOW - 3 * HOUR).toISOString(), LAST_ALL, null, undefined]) {
      expect(intakeMeetsCatFloor({ ...legacy, lastFullMealIso } as IntakeDeclineFinding, NOW)).toBe(true);
    }
    expect(intakeMeetsCatFloor({ ...legacy, lastGoodMealIso: null }, NOW)).toBe(true);
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

describe('the diet trial card and closing sheet hold the floor (CUL-2680; the softer split waits on CUL-2694)', () => {
  const meal = (iso: string, intakeRating: string): AnalyticsMeal =>
    ({ ms: Date.parse(iso), foodItemId: 'f1', foodLabel: 'Kibble', foodType: 'meal', primaryProtein: 'chicken', intakeRating }) as AnalyticsMeal;
  const days = Array.from({ length: 9 }, (_, i) => meal(new Date(Date.parse(LAST_ALL) - i * 24 * HOUR).toISOString(), 'all'));
  const meals = [...days, meal('2026-11-07T18:00:00Z', 'some'), meal('2026-11-08T08:00:00Z', 'some'), meal('2026-11-08T18:00:00Z', 'some')];

  it('the issue’s cat: the phone detector says D3 is met (the mirror of the server), and the vet line is the floor', () => {
    const out = detectIntakeDecline({ timeZone: 'UTC', species: 'cat', nowMs: NOW, meals, freeFedSpans: [] });
    expect(out.status).toBe('watch');
    if (out.status !== 'watch') return;
    expect(out.flags.every((f) => f.noGoodMeal24h === true)).toBe(true);
    const [fact] = intakeDeclineFacts(out.flags, 'Kiki');
    expect(trialDeclineVetLine('cat', fact, 'Kiki')).toBe('A cat that stops eating needs a call today, whatever the trial is doing.');
  });

  it('an `other` pet’s partial decline holds the floor too, as the Signal does', () => {
    expect(trialDeclineVetLine('other', { trigger: 'consecutive_low', allRefused: false }, 'Pip')).toBe('A pet that stops eating needs a call today, whatever the trial is doing.');
  });
});

describe('the card’s own sentence firms up with the clock (intakeSentenceAt, adversarial pass 1 F4)', () => {
  // The last run was at 18:00 yesterday, 11 h after the 07:00 All: the engine said "not yet".
  const STALE = 'Kiki has eaten less than usual today — worth keeping an eye on, and a word with your vet if it carries on.';
  const stale = card({ noGoodMeal24h: false });

  it('a stale "eating less" sentence is said in the floor’s form once the 24 h have passed', () => {
    expect(intakeSentenceAt(stale, 'Kiki', STALE, NOW)).toBe(`Kiki has eaten less than usual today, and ${NO_GOOD_MEAL_CLAUSE} — ${FLOOR_ASK.inline}.`);
    expect(intakeSentenceAt({ ...stale, daysBelowBaseline: 2 }, 'Kiki', STALE, NOW)).toContain('less than usual for 2 days, and');
    expect(intakeSentenceAt({ ...stale, trigger: 'refused_normal_food', refusedFoodLabel: 'tuna pâté' }, 'Kiki', STALE, NOW)).toBe(
      `Kiki just turned down tuna pâté, which Kiki normally eats, and ${NO_GOOD_MEAL_CLAUSE} — ${FLOOR_ASK.inline}.`,
    );
  });

  it('any other sentence keeps its words and the floor follows; one already at the floor is verbatim', () => {
    const i5 = 'Kiki vomited within 30 minutes of turning down a meal on 2 days since Nov 6. That’s worth mentioning to your vet.';
    expect(intakeSentenceAt({ ...stale, trigger: 'refused_then_vomited' }, 'Kiki', i5, NOW)).toBe(`${i5} Kiki ${NO_GOOD_MEAL_CLAUSE}, so ${FLOOR_ASK.inline}.`);
    const floor = `Kiki has eaten less than usual today, and ${NO_GOOD_MEAL_CLAUSE} — ${FLOOR_ASK.inline}.`;
    expect(intakeSentenceAt(card(), 'Kiki', floor, NOW)).toBe(floor);
  });

  it('a cat who ate well, a dog, and every other card keep the server’s sentence', () => {
    const fed = card({ lastGoodMealIso: new Date(NOW - HOUR).toISOString(), noGoodMeal24h: false });
    expect(intakeSentenceAt(fed, 'Kiki', STALE, NOW)).toBe(STALE);
    expect(intakeSentenceAt({ ...stale, species: 'dog' }, 'Rex', STALE, NOW)).toBe(STALE);
  });

  it('Home’s arrival speech says the same floor sentence, a pet with no name included (pass 2, B4)', () => {
    const cached = { rank: 0, text: STALE, finding: stale } as CachedFinding;
    expect(safetyArrivalSpoken('Kiki', [cached], NOW)).toContain(FLOOR_ASK.inline);
    expect(safetyArrivalSpoken(null, [cached], NOW)).toContain(FLOOR_ASK.inline);
    expect(intakeSentenceAt(stale, '  ', STALE, NOW)).toMatch(/^Your pet has eaten less than usual today/);
  });

  it('Get ready’s rows quote the floor sentence, and keep every other row as it was (pass 2, B3)', () => {
    const fed = card({ lastGoodMealIso: new Date(NOW - HOUR).toISOString(), noGoodMeal24h: false });
    const rows = [
      { rank: 0, text: STALE, finding: stale },
      { rank: 1, text: STALE, finding: fed },
    ] as CachedFinding[];
    const out = withIntakeSentencesAt(rows, 'Kiki', NOW);
    expect(out[0].text).toContain(`— ${FLOOR_ASK.inline}.`);
    expect(out[0].finding).toBe(rows[0].finding);
    expect(out[1]).toBe(rows[1]);
  });
});

