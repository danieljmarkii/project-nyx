// CUL-1440 — the masking a screen reads (lib/screenMasking.ts): the gate, the read, the
// captions, and counterexample 3 (the trial's vomiting sentence beside prednisone).

jest.mock('./db', () => ({ getDb: () => ({ getAllAsync: jest.fn() }) }));
jest.mock('./supabase', () => ({ supabase: { from: jest.fn() } }));

import {
  courseLabel,
  engineCompareWithheld,
  findingWithheldByMask,
  loadScreenMasking,
  maskCaption,
  maskedTrialSentence,
  maskScriptRows,
  screenMaskingOf,
  signalRowHasEn10,
  touches,
  type MaskingDb,
} from './screenMasking';
import { trialResponseStandingLine } from './dietTrialCard';
import type { TrialResponseCounts } from './trialResponseCounts';
import type { MaskCourse } from './maskingSpans';

const TODAY = '2026-09-27';

const pred = (startedOn = '2026-09-21', endedOn: string | null = null): MaskCourse => ({
  drugLabel: 'Prednisone',
  names: [],
  startedOn,
  endedOn,
  status: endedOn ? 'completed' : 'active',
});

const masking = (courses: MaskCourse[], lastVisitOn: string | null = null, sign: 'vomit' | 'cough' = 'vomit') =>
  screenMaskingOf({ sign, signWord: sign === 'vomit' ? 'vomiting' : 'coughing', courses, visitsOn: lastVisitOn ? [lastVisitOn] : [], today: TODAY });

/** Day 30 of a trial that started Aug 29: 0 vomits in it, 7 in the 49 days before. */
const counts = (over: Partial<TrialResponseCounts> = {}): TrialResponseCounts => ({
  trialDayNumber: 30,
  trialCount: 0,
  trialLastEpisodeDayIndex: null,
  baselineCount: 7,
  trialLoggedDays: 28,
  baselineLoggedDays: 40,
  baselineWindowDays: 49,
  densityComparable: true,
  ...over,
});

describe('CUL-1440 · 3 · the trial\'s vomiting sentence beside prednisone', () => {
  it('fixture premise: today the strip prints the zero', () => {
    expect(trialResponseStandingLine(counts())).toBe("Vomiting: 0 in the trial's 30 days · 7 in the 49 days before, a longer stretch.");
  });

  it('a zero in the trial beside prednisone stays quiet', () => {
    const line = trialResponseStandingLine(counts());
    expect(maskedTrialSentence(masking([pred()]), counts(), line, TODAY)).toBeNull();
  });

  it('a falling pair beside prednisone stays quiet too (D2: every fall)', () => {
    const c = counts({ trialCount: 2 });
    expect(maskedTrialSentence(masking([pred()]), c, trialResponseStandingLine(c), TODAY)).toBeNull();
  });

  it('a rise always shows, judged by rate (5 in 30 days against 7 in 49 is a rise)', () => {
    const c = counts({ trialCount: 5 });
    const line = trialResponseStandingLine(c);
    expect(line).not.toBeNull();
    expect(maskedTrialSentence(masking([pred()]), c, line, TODAY)).toBe(line);
  });

  it('a zero BASELINE under a span falls back to the trial-so-far form, never silence over a rise', () => {
    // Prednisone in the 49 days before the trial, ended within the tail; nothing logged then.
    const c = counts({ trialCount: 3, baselineCount: 0 });
    const m = masking([pred('2026-08-01', '2026-08-20')]);
    expect(maskedTrialSentence(m, c, trialResponseStandingLine(c), TODAY)).toBe("Vomiting: 3 in the trial's 30 days.");
  });

  it('no masking (flag off) is the strip\'s sentence, byte for byte', () => {
    const line = trialResponseStandingLine(counts());
    expect(maskedTrialSentence(null, counts(), line, TODAY)).toBe(line);
  });

  it('a span that touches neither window leaves the sentence alone', () => {
    // A steroid that ended well before the baseline window and its tail.
    const m = masking([pred('2026-03-01', '2026-03-20')]);
    const line = trialResponseStandingLine(counts());
    expect(maskedTrialSentence(m, counts(), line, TODAY)).toBe(line);
  });
});

describe('the gate', () => {
  const db = (rows: unknown[], visits: unknown[] = []): MaskingDb => ({
    getAllAsync: jest.fn(async (sql: string) => (/vet_visits/.test(sql) ? visits : rows)) as MaskingDb['getAllAsync'],
  });

  it('reads the stamp off the cache row, and only engines_v3_en10 opens it', () => {
    expect(signalRowHasEn10(['engines_v3_en10'])).toBe(true);
    expect(signalRowHasEn10(['engines_v3_en3'])).toBe(false);
    expect(signalRowHasEn10(null)).toBe(false);
    expect(signalRowHasEn10('engines_v3_en10')).toBe(false);
  });

  it('an unstamped row is the flag-off screen: null, and no read at all', async () => {
    const d = db([{ drug_name: 'Prednisone', started_at: '2026-09-21', ended_at: null, status: 'active', generic_name: null, brand_name: null }]);
    expect(await loadScreenMasking({ petId: 'p', sign: 'vomit', signWord: 'vomiting', today: TODAY, engineFlags: [], db: d })).toBeNull();
    expect(d.getAllAsync).not.toHaveBeenCalled();
  });

  it('a stamped row reads the courses and the last visit into spans', async () => {
    const d = db(
      [{ drug_name: 'Prednisone', started_at: '2026-09-21', ended_at: null, status: 'active', generic_name: null, brand_name: null }],
      [{ visited_at: '2026-09-10' }],
    );
    const m = await loadScreenMasking({ petId: 'p', sign: 'vomit', signWord: 'vomiting', today: TODAY, engineFlags: ['engines_v3_en10'], db: d });
    expect(m?.unreadable).toBe(false);
    expect(m?.spans.map((s) => s.kind)).toEqual(['course', 'visit']);
  });

  it('a failed read masks every window and says it could not check (C-12: never "no drugs")', async () => {
    const d: MaskingDb = { getAllAsync: jest.fn(async () => { throw new Error('locked'); }) as MaskingDb['getAllAsync'] };
    const m = await loadScreenMasking({ petId: 'p', sign: 'vomit', signWord: 'vomiting', today: TODAY, engineFlags: ['engines_v3_en10'], db: d });
    expect(m?.unreadable).toBe(true);
    expect(touches(m, '2020-01-01', '2020-01-02')).toBe(true);
    expect(maskCaption(m, '2026-09-01', TODAY, { zeroWithheld: true, unit: 'week' })).toContain("couldn't be checked just now");
  });
});

describe('the spans and the words', () => {
  it('a course\'s span runs from its start to 42 days past today while it runs', () => {
    const m = masking([pred()]);
    expect(touches(m, '2026-09-14', '2026-09-20')).toBe(false); // the week before the first dose
    expect(touches(m, '2026-09-21', '2026-09-27')).toBe(true);
  });

  it('an ended course keeps masking for 42 days after its last dose (Depo-Medrol acts for weeks)', () => {
    const m = masking([pred('2026-08-01', '2026-08-20')]);
    expect(touches(m, '2026-09-27', '2026-09-27')).toBe(true); // 38 days after the end
    expect(touches(m, '2026-07-20', '2026-07-31')).toBe(false);
  });

  it('a drug that only CAUSES the sign masks nothing (an NSAID beside vomiting)', () => {
    const m = masking([{ drugLabel: 'Metacam', names: [], startedOn: '2026-09-01', endedOn: null, status: 'active' }]);
    expect(m.spans).toEqual([]);
  });

  it('a name the table cannot resolve masks, and says "may"', () => {
    const m = masking([{ drugLabel: "Grandma's drops", names: [], startedOn: '2026-09-21', endedOn: null, status: 'active' }]);
    expect(maskCaption(m, '2026-09-21', TODAY, { zeroWithheld: false, unit: 'week' })).toBe("Grandma's drops from Sep 21 may hide vomiting.");
  });

  it('an owner label that makes a care claim is never printed (the server\'s screen, CUL-1271)', () => {
    const c: MaskCourse = { drugLabel: 'Pred (it is working)', names: ['prednisolone'], startedOn: '2026-09-21', endedOn: null, status: 'active' };
    expect(courseLabel(c)).toBe('Prednisolone');
    expect(maskScriptRows(masking([c]), TODAY)[0].value).toBe('Prednisolone since Sep 21. It may hide vomiting.');
  });

  it('the phone-script rows name each span covering today, the visit as "Last visit"', () => {
    expect(maskScriptRows(masking([pred()], '2026-09-10', 'cough'), TODAY)).toEqual([
      { label: 'On board', value: 'Prednisone since Sep 21. It can hide coughing.' },
      { label: 'Last visit', value: "Sep 10. Anything given there isn't in the record." },
    ]);
    expect(maskScriptRows(null, TODAY)).toEqual([]);
  });

  it('an engine compare goes quiet on a fall or a zero in a touched window, never on a clean rise', () => {
    const m = masking([], '2026-08-20');
    const recent = { fromKey: '2026-08-30', toKey: TODAY, count: 5 };
    expect(engineCompareWithheld(m, recent, { fromKey: '2026-08-01', toKey: '2026-08-29', count: 0 })).toBe(true);
    expect(engineCompareWithheld(m, recent, { fromKey: '2026-08-01', toKey: '2026-08-29', count: 2 })).toBe(false);
    expect(engineCompareWithheld(m, { ...recent, count: 1 }, { fromKey: '2026-08-01', toKey: '2026-08-29', count: 4 })).toBe(true);
    expect(engineCompareWithheld(null, { ...recent, count: 0 }, { fromKey: '2026-08-01', toKey: '2026-08-29', count: 4 })).toBe(false);
  });
});

describe('the adversarial pass · findings whose own sentence compares', () => {
  const trialPair = (pooledTrialCount: number, pooledBaselineCount: number) =>
    ({
      type: 'trial_response',
      priorityClass: 'insight',
      trialDayNumber: 30,
      targetDurationDays: 56,
      trialLoggedDays: 28,
      baselineLoggedDays: 40,
      baselineWindowDays: 49,
      pooledTrialCount,
      pooledBaselineCount,
      rapid: { trial: 0, baseline: 0 },
      long: { trial: 0, baseline: 0 },
      rapidWindowMinutes: 30,
      longGapHours: 6,
    }) as unknown as Parameters<typeof findingWithheldByMask>[0];

  it('1 · a trial pair with 0 in the trial beside prednisone is set aside; a rise is not', () => {
    const m = masking([pred('2026-08-25')]);
    expect(findingWithheldByMask(trialPair(0, 12), m, TODAY, TODAY)).toBe(true);
    expect(findingWithheldByMask(trialPair(4, 12), m, TODAY, TODAY)).toBe(true); // a rate fall
    expect(findingWithheldByMask(trialPair(12, 12), m, TODAY, TODAY)).toBe(false); // a rate rise
    expect(findingWithheldByMask(trialPair(0, 12), null, TODAY, TODAY)).toBe(false); // flag off
  });

  it('2 · a falling reflection beside Cerenia is set aside; a stood-down line inside a span too', () => {
    const cerenia: MaskCourse = { drugLabel: 'Cerenia', names: [], startedOn: '2026-09-05', endedOn: null, status: 'active' };
    const m = masking([cerenia]);
    const reflection = { type: 'reflection', priorityClass: 'insight', symptomType: 'vomit', currentCount: 1, priorCount: 5, direction: 'improving', windowDays: 7 } as unknown as Parameters<typeof findingWithheldByMask>[0];
    expect(findingWithheldByMask(reflection, m, TODAY, TODAY)).toBe(true);
    const stoodDown = { type: 'stood_down', priorityClass: 'insight', symptomType: 'vomit', recencyDays: 14, stoodDownAt: '2026-09-27T08:00:00Z' } as unknown as Parameters<typeof findingWithheldByMask>[0];
    expect(findingWithheldByMask(stoodDown, m, TODAY, TODAY)).toBe(true);
    expect(findingWithheldByMask(stoodDown, masking([]), TODAY, TODAY)).toBe(false);
  });

  it('a course inside its tail is "Recently on", never "On board"', () => {
    expect(maskScriptRows(masking([pred('2026-09-01', '2026-09-10')]), TODAY)).toEqual([
      { label: 'Recently on', value: 'Prednisone, Sep 1 to Sep 10. It can hide vomiting.' },
    ]);
  });
});
