// The Signal row's words (CUL-1270 · D1 = B). The load-bearing claim is PARITY: every
// number the Home row states is a number the screen's sentence states, and the ask is the
// sentence's own words — so the owner carries one count from Home to the screen (the
// issue's review line: "a count on Home must equal the screen's").
//
// The sentence is not re-derived here (C-34: a test that restates the rule is a tautology
// with fixtures). It is RENDERED, by the server's own module: `generate-signal/phrasing.ts`
// imports types only, so jest loads it as-is, and `templateForFinding` is the exact
// function that writes `cached.text` for every template-only type and the validation floor
// for the rest. The fixtures are engine-shaped (every field the detector emits, in the
// ranges it emits them) and swept over the boundaries each composer branches on.

import { templateForFinding } from '../supabase/functions/generate-signal/phrasing';
import type {
  CorrelationFinding,
  EmptyStomachTimingFinding,
  IncidentRedFlagFinding,
  IntakeDeclineFinding,
  PostprandialTimingFinding,
  ReflectionFinding,
  SignalFinding,
  SignalSymptomType,
  SymptomChronicityFinding,
  SymptomWorseningFinding,
  TimeOfDayClusteringFinding,
  TimingStoryFinding,
  TrialResponseFinding,
} from './signal';
import { signalTitle } from './signalTitle';
import { hasTitleVerdictWord } from './signalTitle';
import { askStandalone, signalHomeAsk, signalHomeLabel, signalHomeLine, type SignalHomeLine } from './signalHomeLine';

const PET = 'Nyx';
const SYMPTOMS: SignalSymptomType[] = ['vomit', 'diarrhea', 'itch', 'scratch', 'skin_reaction', 'cough', 'sneeze'];

function sentence(f: SignalFinding): string {
  // The server's Finding union and the client's mirror are the same shapes (the client
  // type file says so); the cast crosses the module boundary, not the data.
  return templateForFinding(f as never, PET);
}

function numbersIn(s: string): string[] {
  return s.match(/\d+/g) ?? [];
}

function line(f: SignalFinding): SignalHomeLine {
  const l = signalHomeLine(f);
  if (!l) throw new Error(`no row for ${f.type}`);
  return l;
}

// ── Engine-shaped fixtures, swept ─────────────────────────────────────────────

// Onsets at the UTC month boundary: a local-time read would name the next month in
// UTC+14 and the previous one in UTC−10 (the non-UTC CI job runs this file in both).
const ONSETS = ['2026-08-01T00:10:00Z', '2026-08-31T23:50:00Z', '2026-01-15T12:00:00Z', '2026-12-31T23:59:00Z'];

function chronicities(s: SignalSymptomType): SymptomChronicityFinding[] {
  const out: SymptomChronicityFinding[] = [];
  for (const tier of ['standard', 'firm'] as const)
    for (const [episodeCount, activeWeeks, windowDays] of [
      [1, 1, 56],
      [14, 5, 56],
      [23, 7, 56],
      [120, 12, 84],
      // Not a whole number of weeks: round (the template) and ceil part ways at 57.
      [9, 4, 57],
    ])
      for (const firstOnsetIso of ONSETS)
        out.push({
          type: 'symptom_chronicity',
          priorityClass: 'safety',
          symptomType: s,
          episodeCount,
          spanDays: 40,
          activeWeeks,
          symptomDays: 12,
          daysSinceLastEpisode: 1,
          firstOnsetIso,
          tier,
          windowDays,
          ...(s === 'vomit' || s === 'cough' ? { coughVomitAdjacent: true as const } : {}),
        });
  return out;
}

function worsenings(s: SignalSymptomType): SymptomWorseningFinding[] {
  const out: SymptomWorseningFinding[] = [];
  for (const tier of ['firm', 'standard', 'soft'] as const)
    for (const trigger of ['more_days', 'more_episodes'] as const)
      for (const [currentCount, priorCount, currentDays, priorDays] of [
        [5, 0, 4, 0],
        [7, 2, 5, 2],
        [1, 0, 1, 0],
        [12, 12, 6, 3],
      ])
        out.push({ type: 'symptom_worsening', priorityClass: 'safety', symptomType: s, currentCount, priorCount, currentDays, priorDays, trigger, tier, windowDays: 7 });
  return out;
}

function reflections(s: SignalSymptomType): ReflectionFinding[] {
  const out: ReflectionFinding[] = [];
  for (const direction of ['flat', 'improving'] as const)
    for (const [currentCount, priorCount] of [
      [1, 1],
      [3, 5],
      [0, 4],
    ])
      for (const density of [undefined, { comparable: true }, { comparable: false }] as const)
        out.push({
          type: 'reflection',
          priorityClass: 'insight',
          symptomType: s,
          currentCount,
          priorCount,
          direction,
          windowDays: 14,
          ...(density ? { density: { ...density, currentLoggedDays: 3, priorLoggedDays: 6 } as never } : {}),
        });
  return out;
}

function timings(s: SignalSymptomType): SignalFinding[] {
  const post: PostprandialTimingFinding = {
    type: 'postprandial_timing',
    priorityClass: 'insight',
    symptomType: s,
    rapidCount: 9,
    eligibleCount: 10,
    totalEpisodes: 12,
    rapidWindowMinutes: 30,
    lastTwoEligibleRapid: true,
    medianMinutesSinceFeeding: 12,
    feedingFormsInEvidence: [],
    windowDays: 60,
  };
  const clock: TimeOfDayClusteringFinding = {
    type: 'timeofday_clustering',
    priorityClass: 'insight',
    symptomType: s,
    clusterStartLocalHour: 23,
    clusterWindowHours: 4,
    clusterCount: 5,
    eligibleCount: 8,
    totalEpisodes: 9,
    timezone: 'America/Chicago',
    windowDays: 56,
  };
  const empty: EmptyStomachTimingFinding = {
    type: 'empty_stomach_timing',
    priorityClass: 'insight',
    symptomType: s,
    longCount: 4,
    eligibleCount: 6,
    bandCounts: { rapid: 1, mid: 1, long: 4 },
    totalEpisodes: 8,
    longGapHours: 6,
    lastTwoEligibleLong: false,
    medianHoursSinceFeeding: 8,
    feedingFormsInEvidence: [],
    windowDays: 56,
  };
  const story: TimingStoryFinding = {
    type: 'timing_story',
    priorityClass: 'insight',
    symptomType: s,
    bandCounts: { rapid: 3, mid: 2, long: 4 },
    eligibleCount: 9,
    totalEpisodes: 11,
    rapidWindowMinutes: 30,
    longGapHours: 6,
    windowDays: 56,
    rapid: { count: 3, medianMinutesSinceFeeding: 10, lastTwoEligible: false, feedingFormsInEvidence: [] },
    long: { count: 4, medianHoursSinceFeeding: 8, lastTwoEligible: false, feedingFormsInEvidence: [], clockBand: { startLocalHour: 4, windowHours: 4 }, clockCount: 3 },
  };
  return [post, { ...post, rapidCount: 1, eligibleCount: 1, lastTwoEligibleRapid: false }, clock, { ...clock, clusterStartLocalHour: 4 }, empty, story];
}

function correlations(s: SignalSymptomType): CorrelationFinding[] {
  const base: CorrelationFinding = {
    type: 'food_symptom_correlation',
    priorityClass: 'insight',
    tier: 'early',
    symptomType: s,
    protein: 'chicken',
    matchedPairs: 4,
    symptomEventCount: 6,
    correlationWindowHours: 11.6,
  };
  return [
    base,
    { ...base, tier: 'established', matchedPairs: 9 },
    { ...base, protein: 'chicken and duck', proteins: ['chicken', 'duck'], jointCandidate: true, jointGuidance: 'ask_vet' },
    { ...base, tier: 'established', protein: 'chicken and duck', proteins: ['chicken', 'duck'], jointCandidate: true, jointGuidance: 'feed_apart' },
  ];
}

const trialCard: TrialResponseFinding = {
  type: 'trial_response',
  priorityClass: 'insight',
  trialDayNumber: 21,
  targetDurationDays: 56,
  trialLoggedDays: 20,
  baselineLoggedDays: 40,
  baselineWindowDays: 49,
  pooledTrialCount: 4,
  pooledBaselineCount: 20,
  rapid: { trial: 2, baseline: 9 },
  long: { trial: 0, baseline: 3 },
  rapidWindowMinutes: 30,
  longGapHours: 6,
  treatShare: { trial: null, baseline: null },
  mealsPerDay: { trial: null, baseline: null },
  comparisonDirection: 'fewer_during_trial',
  trialWindowDays: 21,
};

function intakes(): IntakeDeclineFinding[] {
  const low: IntakeDeclineFinding = {
    type: 'intake_decline',
    priorityClass: 'safety',
    trigger: 'consecutive_low',
    species: 'cat',
    daysBelowBaseline: 3,
    refusedFoodLabel: null,
    ratedMealsConsidered: 9,
  };
  return [
    low,
    { ...low, daysBelowBaseline: 1 },
    { ...low, daysBelowBaseline: 2 },
    { ...low, daysBelowBaseline: 7 },
    { ...low, daysBelowBaseline: 8 },
    { ...low, daysBelowBaseline: 9 },
    { ...low, trigger: 'refused_normal_food', refusedFoodLabel: 'Kibble' },
    { ...low, trigger: 'refused_normal_food', refusedFoodLabel: null },
  ];
}

function redFlags(): IncidentRedFlagFinding[] {
  const out: IncidentRedFlagFinding[] = [];
  for (const incidentType of ['vomit', 'stool'] as const)
    for (const flags of [['blood'], ['foreign_material'], ['blood', 'foreign_material']] as const)
      for (const flaggedIncidentCount of [1, 3])
        // 23:30 UTC: the local day is the NEXT day east of UTC — the eyebrow must say the UTC one.
        out.push({ type: 'incident_red_flag', priorityClass: 'safety', incidentType, flags: [...flags], mostRecentFlaggedIso: '2026-09-22T23:30:00Z', flaggedIncidentCount, windowDays: 14 });
  return out;
}

function everyFinding(): SignalFinding[] {
  const out: SignalFinding[] = [trialCard, ...intakes(), ...redFlags()];
  for (const s of SYMPTOMS) out.push(...chronicities(s), ...worsenings(s), ...reflections(s), ...timings(s), ...correlations(s));
  return out;
}

// ── Parity ────────────────────────────────────────────────────────────────────

describe('PARITY: the Home row counts from the sentence’s own fields (the screen and Home say one number)', () => {
  it('every number on the row appears in the server’s sentence, across every engine-shaped finding', () => {
    let checked = 0;
    for (const f of everyFinding()) {
      const l = line(f);
      const said = new Set(numbersIn(sentence(f)));
      // One declared exception: the trial card's title is the trial's own day-of-target
      // (D2-3's rule, unchanged), which the screen's title prints too.
      const onRow = [
        ...(l.eyebrow ? numbersIn(l.eyebrow) : []),
        ...(f.type === 'trial_response' ? [] : numbersIn(l.headline)),
        ...(l.count ? numbersIn(l.count) : []),
      ];
      // A MULTISET check: the row may say a number no more often than the sentence does, so
      // a line that prints this week's count where last week's belongs (7 and 7 for a
      // sentence's 7 and 2) cannot hide behind set membership.
      const budget = new Map<string, number>();
      for (const n of numbersIn(sentence(f))) budget.set(n, (budget.get(n) ?? 0) + 1);
      for (const n of onRow) {
        const left = budget.get(n) ?? 0;
        if (left === 0) throw new Error(`${f.type}: "${n}" is on the row (${JSON.stringify(l)}) more often than in the sentence: ${sentence(f)}`);
        budget.set(n, left - 1);
      }
      checked += 1;
    }
    expect(checked).toBeGreaterThan(400);
  });

  it('the ask is the sentence’s own words, verbatim, on every safety finding', () => {
    for (const f of everyFinding().filter((x) => x.priorityClass === 'safety')) {
      const ask = line(f).ask;
      expect(ask).not.toBeNull();
      expect(sentence(f)).toContain(ask as string);
    }
  });

  it('the photo read’s headline is the sentence’s own phrase (“possible …”) and its date the sentence’s UTC day', () => {
    for (const f of redFlags()) {
      const l = line(f);
      const phrase = l.headline.replace(/ in (a )?\w+ photos?$/, '').toLowerCase();
      expect(sentence(f).toLowerCase()).toContain(phrase);
      expect(l.eyebrow).toMatch(/Sep 22$/);
    }
  });

  it('intake’s span is the sentence’s own words — it spells small counts out, so digits cannot check it', () => {
    for (const f of intakes().filter((i) => i.trigger === 'consecutive_low')) {
      expect(sentence(f)).toContain((line(f).count as string).toLowerCase());
    }
  });

  it('the recurrence names the sentence’s UTC onset month, in every zone the suite runs in', () => {
    const f = chronicities('vomit').find((c) => c.firstOnsetIso === '2026-08-31T23:50:00Z') as SymptomChronicityFinding;
    expect(line(f).count).toBe('1 episode since August');
    expect(sentence(f)).toContain('since August');
  });
});

// ── Roles: every number in its place ──────────────────────────────────────────
//
// Membership cannot see a swap (a rise read as flat when the prior slot prints the current
// count), so each type is also pinned with ALL-DISTINCT field values, where the only way to
// print the right string is to read the right field.

describe('ROLES: with every field distinct, each number comes from the field its words name', () => {
  const W = { type: 'symptom_worsening', priorityClass: 'safety', symptomType: 'vomit', currentCount: 7, priorCount: 2, currentDays: 5, priorDays: 3, windowDays: 9 } as const;
  const cases: [SignalFinding, string, string | null][] = [
    [{ ...W, trigger: 'more_days', tier: 'firm' }, 'Vomiting on 5 of the last 9 days', '3 days the week before'],
    [{ ...W, trigger: 'more_episodes', tier: 'firm' }, 'Vomiting on 5 of the last 9 days', '7 episodes, 2 the week before'],
    [{ ...W, trigger: 'more_days', tier: 'soft' }, 'Vomiting on 5 separate days this week', '3 days last week'],
    [{ ...W, trigger: 'more_episodes', tier: 'standard' }, 'Vomiting, 7 episodes this week', '2 last week'],
    [
      { type: 'symptom_chronicity', priorityClass: 'safety', symptomType: 'vomit', episodeCount: 14, spanDays: 40, activeWeeks: 5, symptomDays: 12, daysSinceLastEpisode: 1, firstOnsetIso: '2026-08-03T12:00:00Z', tier: 'firm', windowDays: 56 },
      'Vomiting in 5 of the last 8 weeks',
      '14 episodes since August',
    ],
    [{ type: 'reflection', priorityClass: 'insight', symptomType: 'vomit', currentCount: 3, priorCount: 5, direction: 'improving', windowDays: 14 }, 'Vomiting, week over week', '3 this week, 5 last week'],
    [timings('vomit')[0], 'Vomiting soon after meals', '9 of 10 timed episodes within 30 min of eating'],
    [timings('vomit')[2], 'Vomiting between 11pm and 3am', '5 of 8 timed episodes'],
    [timings('vomit')[4], 'Vomiting long after meals', '4 of 6 timed episodes, at least 6 hours after eating'],
    [{ ...correlations('vomit')[1] }, 'Vomiting after chicken', 'A tendency, compared across 9 days of logs'],
    [trialCard, 'Diet trial, day 21 of 56', '4 episodes of vomiting in the trial, 20 in the 49 days before, a longer stretch'],
    [intakes()[0], 'Eating less than usual', 'The last three days'],
    [{ ...intakes()[0], daysBelowBaseline: 2 }, 'Eating less than usual', 'The last two days'],
    [{ ...intakes()[0], daysBelowBaseline: 1 }, 'Eating less than usual', 'Today'],
  ];
  it.each(cases.map(([f, h, c]) => [f.type, f, h, c] as const))('%s', (_t, f, headline, count) => {
    const l = line(f);
    expect(l.headline).toBe(headline);
    expect(l.count).toBe(count);
    expect(l.headline).toBe(signalTitle(f, null));
  });
});

// ── The words ─────────────────────────────────────────────────────────────────

describe('the row’s words', () => {
  it('Nyx’s live Signal, as the mock draws it', () => {
    const [redFlag] = redFlags().filter((f) => f.incidentType === 'vomit' && f.flags.length === 1 && f.flags[0] === 'foreign_material');
    expect(line(redFlag)).toEqual({
      eyebrow: 'Photo read · Sep 22',
      headline: 'Possible foreign material in a vomit photo',
      count: null,
      ask: 'worth a call to your vet',
    });
    const vomiting = chronicities('vomit').find((c) => c.episodeCount === 14 && c.tier === 'firm' && c.firstOnsetIso.startsWith('2026-08-01')) as SymptomChronicityFinding;
    expect(line(vomiting)).toEqual({
      eyebrow: null,
      headline: 'Vomiting in 5 of the last 8 weeks',
      count: '14 episodes since August',
      ask: 'worth booking a vet visit',
    });
    expect(line(timings('vomit')[0])).toEqual({
      eyebrow: null,
      headline: 'Vomiting soon after meals',
      count: '9 of 10 timed episodes within 30 min of eating',
      ask: null,
    });
  });

  it('benign rows carry no ask (the PM’s ruling on CUL-1270, build call ii); every safety row carries one', () => {
    for (const f of everyFinding()) {
      if (f.priorityClass === 'safety') expect(line(f).ask).not.toBeNull();
      else expect(line(f).ask).toBeNull();
    }
  });

  it('the ask map covers every safety tier, and nothing else', () => {
    for (const f of everyFinding()) expect(signalHomeAsk(f) !== null).toBe(f.priorityClass === 'safety');
  });

  it('the density gate withholds the prior exactly as the sentence does (SR-4)', () => {
    const [withheld] = reflections('vomit').filter((r) => r.direction === 'improving' && r.density?.comparable === false);
    expect(line(withheld).count).toBe(`${withheld.currentCount} this week`);
    expect(sentence(withheld)).not.toMatch(/last week/);
  });

  it('a flat week says “about the same”, as its sentence does, never a prior the sentence omits', () => {
    const [flat] = reflections('vomit').filter((r) => r.direction === 'flat' && r.currentCount === 3);
    expect(line(flat).count).toBe('3 this week, about the same as last week');
  });

  it('no row line carries a direction word, a glyph or a percentage (S5; the title list)', () => {
    for (const f of everyFinding()) {
      const l = line(f);
      for (const text of [l.eyebrow, l.headline, l.count].filter((x): x is string => x != null)) {
        if (hasTitleVerdictWord(text)) throw new Error(`${f.type}: ${text}`);
        expect(text).not.toMatch(/!/);
      }
    }
  });

  it('the trial row keeps the sentence’s B-775 guard and its noun (pm-feature-review)', () => {
    // Day 21 against a 49-day baseline: ≥ 1.5×, so the fall is over-stated without the cue.
    expect(line(trialCard).count).toBe('4 episodes of vomiting in the trial, 20 in the 49 days before, a longer stretch');
    expect(sentence(trialCard)).toContain(', a longer stretch');
    const older = { ...trialCard, trialDayNumber: 40, trialWindowDays: 40 };
    expect(line(older).count).toBe('4 episodes of vomiting in the trial, 20 in the 49 days before');
    expect(sentence(older)).not.toContain('a longer stretch');
  });

  it('the cue is on the row exactly when the sentence carries it, at every trial day', () => {
    for (let day = 1; day <= 60; day++) {
      const f = { ...trialCard, trialDayNumber: day, trialWindowDays: day };
      expect((line(f).count as string).includes('a longer stretch')).toBe(sentence(f).includes('a longer stretch'));
    }
  });

  it('a dense worsening says “the week before” under “the last 7 days”, never “last week”', () => {
    for (const f of worsenings('vomit').filter((w) => w.tier === 'firm')) expect(line(f).count).not.toMatch(/last week/);
  });

  it('the conditional asks keep their verb', () => {
    for (const f of [...intakes(), ...worsenings('vomit').filter((w) => w.tier === 'soft')]) {
      expect(line(f).ask).toBe('worth keeping an eye on, and a word with your vet if it carries on');
    }
  });

  it('the refusal carries the sentence’s time anchor and the food it names', () => {
    const [refused, unnamed] = intakes().filter((i) => i.trigger === 'refused_normal_food');
    expect(line(refused).count).toBe('Kibble, just now');
    expect(line(unnamed).count).toBe('Just now');
  });

  it('the stand-down marker is not a row', () => {
    expect(
      signalHomeLine({
        type: 'stood_down',
        priorityClass: 'insight',
        symptomType: 'vomit',
        recencyDays: 9,
        tier: 'standard',
        lastEpisodeIso: '2026-09-01T00:00:00Z',
        stoodDownAt: '2026-09-10T00:00:00Z',
        formerRank: 0,
      }),
    ).toBeNull();
  });
});

describe('the spoken label', () => {
  it('says every line, the eyebrow’s dot as a comma, and the ask with a capital', () => {
    const [redFlag] = redFlags();
    expect(signalHomeLabel(line(redFlag))).toBe('Photo read, Sep 22. Possible blood in a vomit photo. Worth a call to your vet.');
  });

  it('every safety row speaks its ask — never behind a tap, for any reader', () => {
    for (const f of everyFinding().filter((x) => x.priorityClass === 'safety')) {
      expect(signalHomeLabel(line(f))).toContain(askStandalone(line(f).ask as string));
    }
  });
});
