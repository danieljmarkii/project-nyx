// CUL-2424 (PM ruling (a), 2026-11-02; wording option 1, 2026-11-05): a consecutive-low card whose
// recent rated meals were all refused reads as refusal on every client surface, never "eating
// less". The fact is the engine's (`allRefused`); no surface infers it from a score. The plain dip
// is the control: it keeps its own words, so this is not every intake card turned up.
//
// CUL-2415: the composer card's null or unknown intake trigger reads "not eating normally", with
// no baseline claim (the PM's default).

jest.mock('./db', () => ({ getDb: jest.fn() }));
jest.mock('./feedingArrangements', () => ({ getActiveArrangementsForPet: jest.fn() }));
jest.mock('./supabase', () => ({ supabase: {} }));

import {
  bannerCopy,
  evidenceText,
  hasBannedSignalVocabulary,
  intakeAllRefused,
  phoneScript,
  sampleLine,
  stripCountLine,
  stripNameLine,
  validateBannerPhrasing,
  type BannerSafetyFinding,
} from './signalCopy';
import { signalHomeLine } from './signalHomeLine';
import { declineHeadline } from './dietTrialFacts';
import { getReadyIntakeDeclines } from './getReady';
import { detectIntakeDecline, type AnalyticsMeal, type IntakeDeclineFlag } from './analytics';
import {
  liveCardCopy,
  missingFlagsOf,
  parseComposerOpen,
  type ComposerCounts,
  type ComposerFlag,
  type ComposerLive,
} from './reportComposer';
import type { IntakeDeclineFinding } from './signal';

function card(extra: Partial<IntakeDeclineFinding> = {}): IntakeDeclineFinding {
  return {
    type: 'intake_decline',
    priorityClass: 'safety',
    trigger: 'consecutive_low',
    species: 'cat',
    daysBelowBaseline: 1,
    refusedFoodLabel: null,
    ratedMealsConsidered: 6,
    ...extra,
  };
}

function surfaces(f: IntakeDeclineFinding): Record<string, string> {
  const script = phoneScript(f, 'Miso', false, null, null) ?? [];
  return {
    evidence: evidenceText(f, 'Miso'),
    sample: sampleLine(f),
    script: script.map((r) => `${r.label}: ${r.value}`).join(' | '),
    banner: bannerCopy(f as BannerSafetyFinding, 'Miso').text,
    stripName: stripNameLine(f) ?? '',
    stripCount: stripCountLine(f) ?? '',
    homeHeadline: signalHomeLine(f)?.headline ?? '',
  };
}

const LESS = /less|below the usual|picky|fussy|!/i;

describe('a day of nothing but refusals reads as refusal (CUL-2424)', () => {
  it('every Signal surface says refused, none says less', () => {
    const s = surfaces(card({ allRefused: true }));
    for (const [surface, text] of Object.entries(s)) {
      expect([surface, text]).not.toEqual([surface, expect.stringMatching(LESS)]);
      expect([surface, text.length > 0]).toEqual([surface, true]);
    }
    expect(s.evidence).toMatch(/^Miso refused every meal you rated today, compared with 6 recent meals\. Refusing food can be an early sign/);
    expect(s.sample).toBe('1 day of refused meals, against 6 recent meals');
    expect(s.script).toBe('Concern: refused every meal you rated | How long: 1 day | Compared with: 6 recent meals');
    expect(s.banner).toBe('Miso refused every meal you rated today — call your vet today.'); // D4: a cat's floor
    expect(s.stripName).toBe('Refused every meal you rated');
    expect(s.homeHeadline).toBe('Refused every meal you rated');
    expect(s.stripCount).toBe('1 day of refused meals, against 6 recent meals');
  });

  it('two days name the span', () => {
    const s = surfaces(card({ allRefused: true, daysBelowBaseline: 2, species: 'dog' }));
    expect(s.banner).toBe('Miso refused every meal you rated over the last 2 days — worth a look.');
    expect(s.evidence).toMatch(/^Miso refused every meal you rated over the last 2 days,/);
  });

  it('the banner passes its own screen, the strip lines the vocabulary screen', () => {
    const f = card({ allRefused: true });
    expect(validateBannerPhrasing(bannerCopy(f as BannerSafetyFinding, 'Miso').screened)).toBe(true);
    for (const line of [stripNameLine(f), stripCountLine(f)]) expect(hasBannedSignalVocabulary(line ?? '')).toBe(false);
  });

  it('the fact is the engine\'s: an absent or false field keeps the dip words, and only consecutive_low reads it', () => {
    expect(surfaces(card()).banner).toBe('Miso has eaten less than usual today — worth a look.');
    expect(surfaces(card({ allRefused: false })).stripName).toBe('Eating less than usual');
    expect(intakeAllRefused(card({ allRefused: true }))).toBe(true);
    expect(intakeAllRefused(card({ allRefused: true, trigger: 'refused_normal_food' }))).toBe(false);
  });

  it('Get ready keeps a refusal and a dip from two reads as two declines', () => {
    const refused = { trigger: 'consecutive_low' as const, refusedFoodLabel: null, headline: 'Miso refused every meal you rated today.', allRefused: true };
    const dip = { trigger: 'consecutive_low' as const, refusedFoodLabel: null, headline: 'Miso has eaten less than usual today.' };
    expect(getReadyIntakeDeclines([dip], { intakeDeclineHeadline: refused.headline, intakeDeclineFacts: [refused] })).toHaveLength(2);
    expect(getReadyIntakeDeclines([refused], { intakeDeclineHeadline: refused.headline, intakeDeclineFacts: [refused] })).toHaveLength(1);
  });

  it('the device headline says refused', () => {
    const flag: IntakeDeclineFlag = {
      trigger: 'consecutive_low',
      class: 'health_watch',
      species: 'cat',
      baselineScore: 4,
      recentScore: 0,
      daysBelowBaseline: 1,
      refusedFoodLabel: null,
      ratedMealsConsidered: 6,
      allRefused: true,
    };
    expect(declineHeadline(flag, 'Miso')).toBe('Miso refused every meal you rated today.');
    expect(declineHeadline({ ...flag, daysBelowBaseline: 2 }, 'Miso')).toBe('Miso refused every meal you rated over the last 2 days.');
    expect(declineHeadline({ ...flag, allRefused: false }, 'Miso')).toBe('Miso has eaten less than usual today.');
  });

  it('the device detector sets the fact on the issue\'s cat, and not on a dip', () => {
    const nowMs = Date.parse('2026-07-30T20:00:00.000Z');
    const meal = (hoursAgo: number, rating: string, food: string): AnalyticsMeal => ({
      ms: nowMs - hoursAgo * 3_600_000,
      foodItemId: food,
      foodLabel: food,
      foodType: 'meal',
      primaryProtein: null,
      intakeRating: rating as AnalyticsMeal['intakeRating'],
    });
    const record = (today: string[]): AnalyticsMeal[] => [
      ...[2, 3, 4, 5, 6, 7, 8].flatMap((d) => [meal(d * 24 + 6, 'all', 'usual'), meal(d * 24 - 4, 'all', 'usual')]),
      ...today.map((r, i) => meal(2 + i * 3, r, 'new')),
    ];
    const lowOf = (meals: AnalyticsMeal[]) => {
      const res = detectIntakeDecline({ species: 'cat', nowMs, meals, freeFedSpans: [], timeZone: 'UTC' });
      return res.status === 'watch' ? res.flags.find((f) => f.trigger === 'consecutive_low') : undefined;
    };
    expect(lowOf(record(['refused', 'refused']))?.allRefused).toBe(true);
    expect(lowOf(record(['picked', 'refused']))?.allRefused).toBe(false);
  });
});

describe('the composer card words an intake flag by what happened (CUL-2424, CUL-2415)', () => {
  const live = (flags: ComposerFlag[]): ComposerLive => ({ state: 'flags', startDate: '2026-09-10', endDate: '2026-11-05', flags });
  const intake = (trigger: string | null, allRefused?: boolean): ComposerFlag => ({ kind: 'intake_decline', sign: null, trigger, allRefused });
  const body = (f: ComposerFlag) => liveCardCopy(live([f]), 'Miso')?.body ?? '';

  it('a refusal fact reads as refusing, the dip as less', () => {
    expect(body(intake('consecutive_low', true))).toMatch(/refusing every meal you rated/i);
    expect(body(intake('consecutive_low', true))).not.toMatch(/less/);
    expect(body(intake('consecutive_low', false))).toMatch(/eating less than usual/i);
  });

  it('a null or unknown trigger reads "not eating normally", never "less" (CUL-2415)', () => {
    for (const t of [null, 'some_future_trigger', '']) {
      const b = body(intake(t));
      expect(b).toMatch(/not eating normally/i);
      expect(b).not.toMatch(/less|usual/);
    }
  });

  it('the parse keeps only an explicit true', () => {
    const open = (allRefused: unknown) =>
      parseComposerOpen({
        composer: {
          today: '2026-11-05',
          petName: 'Miso',
          live: { state: 'flags', startDate: '2026-09-10', endDate: '2026-11-05', partial: false, flags: [{ kind: 'intake_decline', sign: null, trigger: 'consecutive_low', allRefused }] },
          windows: [{ kind: 'last_30', startDate: '2026-10-06', endDate: '2026-11-05', days: 31, isDefault: true }],
          counts: COUNTS(null),
          after: null,
        },
      }).live.flags[0].allRefused;
    expect(open(true)).toBe(true);
    for (const v of [false, 'true', 1, undefined, null]) expect(open(v)).toBe(false);
  });

  it('a dip in the chosen dates does not cover a day of refusals', () => {
    const counts = COUNTS([intake('consecutive_low', false)]);
    expect(missingFlagsOf(live([intake('consecutive_low', true)]), counts, '2026-11-05').missing).toHaveLength(1);
    expect(missingFlagsOf(live([intake('consecutive_low', true)]), COUNTS([intake('consecutive_low', true)]), '2026-11-05').missing).toHaveLength(0);
  });
});

function COUNTS(flags: ComposerFlag[] | null): ComposerCounts {
  return {
    startDate: '2026-10-06',
    endDate: '2026-11-05',
    windowDays: 31,
    loggedDays: 20,
    symptomEntries: 0,
    weighIns: 0,
    latestWeighIn: null,
    lead: null,
    byType: [],
    flags,
  } as unknown as ComposerCounts;
}
