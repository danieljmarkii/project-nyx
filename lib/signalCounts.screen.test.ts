// GC-4 PR 1 (CUL-1568), the adversarial pass's counterexamples, through the real screen builder.
// The composed sentence is escalate-only: the chart's numbers speak only where none is lower
// than the engine's and no masking span touches their windows (`countsMayCompose`); otherwise
// the engine's words stand, dated. Where the sentence is composed, the safety phone script reads
// the same numbers and drops its earlier-window row wherever the sentence did.
//
// Day keys only (C-29 / B-514): the three CI zones see one calendar.

jest.mock('./db', () => ({ getDb: () => ({ getAllAsync: jest.fn() }) }));
jest.mock('./supabase', () => ({ supabase: { from: jest.fn() } }));

import { buildSignalScreenModel, type SignalScreenEpisode, type SignalScreenInput } from './signalScreen';
import type { CachedFinding, ReflectionFinding, SymptomChronicityFinding, SymptomWorseningFinding } from './signal';
import { screenMaskingOf } from './screenMasking';
import { phoneScript } from './signalCopy';
import { countsMayCompose, signalCountsOf } from './signalCounts';
import { signalWeeks } from './signalWindows';
import { dayKeyFromIndex, localDayIndexOf } from './utils';

const idx = (key: string): number => {
  const i = localDayIndexOf(key);
  if (i == null) throw new Error(key);
  return i;
};
const shift = (key: string, days: number): string => dayKeyFromIndex(idx(key) + days);

function episode(dayKey: string, hour = 9): SignalScreenEpisode {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!m) throw new Error(dayKey);
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hour, 11);
  return { eventId: `ev-${dayKey}-${hour}`, occurredAt: d.toISOString(), dayKey, minutesSinceMeal: null, photo: null };
}

const ENGINE_TEXT = 'The engine’s own sentence.';
const cachedOf = (finding: CachedFinding['finding']): CachedFinding => ({ rank: 0, text: ENGINE_TEXT, finding });

const TODAY = '2026-09-27';

function inputOf(over: Partial<SignalScreenInput> & Pick<SignalScreenInput, 'cached' | 'episodes'>): SignalScreenInput {
  const today = over.today ?? TODAY;
  const loggedDays: string[] = [];
  for (let i = -120; i <= 0; i++) loggedDays.push(shift(today, i));
  return {
    petName: 'Nyx',
    today,
    trial: null,
    loggedDays,
    gateLoggedDays: loggedDays,
    recordStart: shift(today, -300),
    verdicts: {},
    doses: [],
    notEating: false,
    trialVomitingLine: null,
    trialUnanswered: false,
    masking: null,
    generatedOn: null,
    countedAtMs: new Date(2026, 8, 27, 9, 14).getTime(),
    generatedAtMs: new Date(2026, 8, 27, 1, 2).getTime(),
    ...over,
  };
}

const worsening = (over: Partial<SymptomWorseningFinding> = {}): SymptomWorseningFinding => ({
  type: 'symptom_worsening',
  priorityClass: 'safety',
  symptomType: 'vomit',
  currentCount: 5,
  priorCount: 1,
  currentDays: 4,
  priorDays: 1,
  trigger: 'more_days',
  tier: 'firm',
  windowDays: 7,
  ...over,
});
const chronicity = (over: Partial<SymptomChronicityFinding> = {}): SymptomChronicityFinding => ({
  type: 'symptom_chronicity',
  priorityClass: 'safety',
  symptomType: 'vomit',
  episodeCount: 8,
  spanDays: 50,
  activeWeeks: 5,
  symptomDays: 8,
  daysSinceLastEpisode: 1,
  firstOnsetIso: '2026-08-05T00:00:00Z',
  tier: 'standard',
  windowDays: 56,
  ...over,
});
const reflection = (over: Partial<ReflectionFinding> = {}): ReflectionFinding => ({
  type: 'reflection',
  priorityClass: 'insight',
  symptomType: 'vomit',
  currentCount: 3,
  priorCount: 3,
  direction: 'flat',
  windowDays: 7,
  ...over,
});

const days = (...offsets: number[]) => offsets.map((d) => episode(shift(TODAY, d)));

describe('the escalate-only gate — a recount never reads calmer than the card that fired', () => {
  it('#2: a firm worsening with nothing in the last 7 days on the phone keeps the engine’s words, never "0 of the last 7 days"', () => {
    const model = buildSignalScreenModel(inputOf({ cached: cachedOf(worsening()), episodes: days(-8, -9, -10, -11, -12) }));
    expect(model.sentence).toBe(ENGINE_TEXT);
    expect(model.title).toBe('Vomiting on 4 of the last 7 days');
    expect(`${model.title} ${model.sentence}`).not.toMatch(/\b0 of the last/);
    expect(model.countedAt).toBe(`This was counted when it was raised, today at ${new Date(2026, 8, 27, 1, 2).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. The bars below count what is logged now.`);
    // The script reads the engine's numbers too: the screen's two statements agree.
    expect(model.scriptFinding).toBe(model.finding);
  });

  it('#3: a chronicity the phone has not finished reading (an empty record) is never "0 of the last 8 weeks"', () => {
    const model = buildSignalScreenModel(inputOf({ cached: cachedOf(chronicity()), episodes: [] }));
    expect(model.sentence).toBe(ENGINE_TEXT);
    expect(model.title).toBe('Vomiting in 5 of the last 8 weeks');
    // One old episode: fewer weeks than the engine counted, so still the engine's.
    const one = buildSignalScreenModel(inputOf({ cached: cachedOf(chronicity()), episodes: days(-55) }));
    expect(one.sentence).toBe(ENGINE_TEXT);
  });

  it('#4: a not-eating cat with a flat reflection is never told "0 episodes of vomiting"', () => {
    const model = buildSignalScreenModel(inputOf({ cached: cachedOf(reflection()), episodes: days(-8, -9, -10), notEating: true }));
    expect(model.sentence).toBe(ENGINE_TEXT);
    expect(model.sentence).not.toMatch(/\b0 episodes/);
  });

  it('#1: a masking span touching the windows keeps the engine’s sentence — the one CUL-1440’s verdict judged', () => {
    const masking = screenMaskingOf({
      sign: 'vomit',
      signWord: 'vomiting',
      courses: [{ drugLabel: 'Maropitant', names: [], startedOn: shift(TODAY, -5), endedOn: null, status: 'active' }],
      visitsOn: [],
      today: TODAY,
    });
    // The recount would fall 4 → 3 (a calmer pair); and even one that clears the floor stays quiet.
    const eps = days(-1, -2, -3, -8, -9, -10, -11);
    const model = buildSignalScreenModel(inputOf({ cached: cachedOf(reflection({ currentCount: 3, priorCount: 4 })), episodes: eps, masking }));
    expect(model.sentence).toBe(ENGINE_TEXT);
    // Same record, no drug: it composes.
    const plain = buildSignalScreenModel(inputOf({ cached: cachedOf(reflection({ currentCount: 3, priorCount: 4 })), episodes: eps }));
    expect(plain.sentence).toMatch(/^We've logged 3 episodes of vomiting for Nyx in the last 7 days, and 4 in the 7 before\./);
    expect(plain.countedAt).toMatch(/^Counted at /);
  });
});

describe('one count on one safety screen — the script reads the sentence’s numbers', () => {
  it('a composed worsening: the script states the chart’s week, and drops the week before where the sentence did', () => {
    // Engine: 5 episodes on 4 days. Phone (new logs since): 6 on 5 days; 7 on 6 days the week before.
    const recent = days(-1, -1, -2, -3, -4, -5).map((e, i) => ({ ...e, eventId: `r${i}` }));
    const prior = days(-7, -8, -9, -10, -11, -12, -13).map((e, i) => ({ ...e, eventId: `p${i}` }));
    const model = buildSignalScreenModel(inputOf({ cached: cachedOf(worsening()), episodes: [...recent, ...prior] }));
    expect(model.title).toBe('Vomiting on 5 of the last 7 days');
    expect(model.sentence).toBe('Nyx has had vomiting on 5 of the last 7 days (6 episodes) — worth booking a vet visit soon.');
    const script = phoneScript(model.scriptFinding, 'Nyx', false, model.scriptMasking) ?? [];
    const said = script.map((f) => `${f.label}: ${f.value}`).join(' | ');
    expect(said).toContain('This week: 5 days with vomiting');
    // The 7 before held more: a fall under a safety card is not read aloud either (GC-3).
    expect(said).not.toMatch(/Week before/);
  });

  it('a composed worsening whose earlier window held less keeps the pair in both places', () => {
    const recent = days(-1, -2, -3, -4, -5).map((e, i) => ({ ...e, eventId: `r${i}` }));
    const prior = days(-9).map((e, i) => ({ ...e, eventId: `p${i}` }));
    const model = buildSignalScreenModel(inputOf({ cached: cachedOf(worsening()), episodes: [...recent, ...prior] }));
    expect(model.sentence).toBe('Nyx has had vomiting on 5 of the last 7 days (5 episodes), and on 1 of the 7 before — worth booking a vet visit soon.');
    const said = (phoneScript(model.scriptFinding, 'Nyx', false, model.scriptMasking) ?? []).map((f) => `${f.label}: ${f.value}`).join(' | ');
    expect(said).toContain('This week: 5 days with vomiting');
    expect(said).toContain('Week before: 1 day');
  });

  it('a composed chronicity: the script’s "How often" is the title’s weeks and the sentence’s episodes', () => {
    const eps = days(-1, -9, -16, -23, -30, -37, -44, -51, -52).map((e, i) => ({ ...e, eventId: `c${i}` }));
    const model = buildSignalScreenModel(inputOf({ cached: cachedOf(chronicity()), episodes: eps }));
    expect(model.title).toBe('Vomiting in 8 of the last 8 weeks');
    expect(model.sentence).toMatch(/— 9 episodes in those weeks, the most recent yesterday\./);
    const said = (phoneScript(model.scriptFinding, 'Nyx', false, model.scriptMasking) ?? []).map((f) => `${f.label}: ${f.value}`).join(' | ');
    expect(said).toContain('How often: 9 episodes across 8 of 8 weeks');
    expect(said).toContain('Most recent: yesterday');
  });
});

describe('the second pass — every stated number at least as alarming as the engine’s', () => {
  it('B: a firm worsening (engine 4 days vs 1) whose earlier window grew on the phone never prints a flat pair', () => {
    const recent = days(-1, -2, -3, -4).map((e, i) => ({ ...e, eventId: `r${i}` }));
    const prior = days(-8, -9, -10, -11).map((e, i) => ({ ...e, eventId: `p${i}` }));
    const model = buildSignalScreenModel(
      inputOf({ cached: cachedOf(worsening({ currentCount: 4, currentDays: 4, priorCount: 1, priorDays: 1 })), episodes: [...recent, ...prior] }),
    );
    expect(model.sentence).toBe('Nyx has had vomiting on 4 of the last 7 days (4 episodes) — worth booking a vet visit soon.');
    const said = (phoneScript(model.scriptFinding, 'Nyx', false, model.scriptMasking) ?? []).map((f) => `${f.label}: ${f.value}`).join(' | ');
    expect(said).not.toMatch(/Week before/);
  });

  it('F: a chronicity whose newest episode on the phone is staler than the engine’s keeps the engine’s words', () => {
    // Seven old episodes across six weeks clear the counts, but the newest is 20 days back
    // where the engine counted one yesterday (another device's log has not arrived).
    const eps = days(-20, -27, -34, -41, -48, -55, -54).map((e, i) => ({ ...e, eventId: `c${i}` }));
    const f = chronicity({ episodeCount: 7, activeWeeks: 6, daysSinceLastEpisode: 1 });
    const stale = buildSignalScreenModel(inputOf({ cached: cachedOf(f), episodes: eps }));
    expect(stale.sentence).toBe(ENGINE_TEXT);
    // The same record counted 19 days ago: a "most recent" 20 days back is just that day aged.
    const aged = buildSignalScreenModel(inputOf({ cached: cachedOf(f), episodes: eps, generatedOn: shift(TODAY, -19) }));
    expect(aged.sentence).toMatch(/the most recent 20 days ago\./);
  });

  it('A: an improving reflection whose earlier window grew prints the recent count alone, never a steeper fall', () => {
    const recent = days(-1, -2).map((e, i) => ({ ...e, eventId: `r${i}` }));
    const prior = days(-7, -8, -9, -10, -11, -12, -13).map((e, i) => ({ ...e, eventId: `p${i}` }));
    const model = buildSignalScreenModel(
      inputOf({ cached: cachedOf(reflection({ direction: 'improving', currentCount: 2, priorCount: 3 })), episodes: [...recent, ...prior] }),
    );
    expect(model.sentence).toMatch(/^We've logged 2 episodes of vomiting for Nyx in the last 7 days\. /);
  });

  it('G: a reflection whose count rose on the phone is not drawn in the insight register — the engine’s words stand, dated', () => {
    const recent = days(-1, -1, -2, -3, -4, -5).map((e, i) => ({ ...e, eventId: `r${i}` }));
    const prior = days(-8, -9).map((e, i) => ({ ...e, eventId: `p${i}` }));
    const model = buildSignalScreenModel(inputOf({ cached: cachedOf(reflection({ currentCount: 2, priorCount: 2 })), episodes: [...recent, ...prior] }));
    expect(model.sentence).toBe(ENGINE_TEXT);
    expect(model.countedAt).toMatch(/The bars below count what is logged now\.$/);
  });
});

describe('the third pass — the earlier window follows the axis that rose', () => {
  it('a firm worsening that fired on more episodes over flat days never states a flat days pair', () => {
    // Engine: 6 episodes on 5 days, up from 5 on 5 (firm by density, trigger more_episodes).
    const f = worsening({ tier: 'firm', trigger: 'more_episodes', currentCount: 6, currentDays: 5, priorCount: 5, priorDays: 5 });
    const recent = days(-1, -1, -2, -3, -4, -5).map((e, i) => ({ ...e, eventId: `r${i}` }));
    const prior = days(-7, -8, -9, -10, -11).map((e, i) => ({ ...e, eventId: `p${i}` }));
    const model = buildSignalScreenModel(inputOf({ cached: cachedOf(f), episodes: [...recent, ...prior] }));
    expect(model.sentence).toBe('Nyx has had vomiting on 5 of the last 7 days (6 episodes), and 5 episodes in the 7 before — worth booking a vet visit soon.');
    const said = (phoneScript(model.scriptFinding, 'Nyx', false, model.scriptMasking) ?? []).map((x) => `${x.label}: ${x.value}`).join(' | ');
    expect(said).toContain('This week: 6 episodes on 5 days');
    expect(said).toContain('Week before: 5 episodes');
    expect(model.sentence).not.toMatch(/on 5 of the 7 before/);
  });

  it('a flat pair on the risen axis is not stated under a safety card, in the sentence or the script', () => {
    const f = worsening({ tier: 'standard', trigger: 'more_episodes', currentCount: 3, currentDays: 3, priorCount: 3, priorDays: 3 });
    const model = buildSignalScreenModel(
      inputOf({ cached: cachedOf(f), episodes: [...days(-1, -2, -3).map((e, i) => ({ ...e, eventId: `r${i}` })), ...days(-8, -9, -10).map((e, i) => ({ ...e, eventId: `p${i}` }))] }),
    );
    expect(model.sentence).toBe('Nyx has had 3 episodes of vomiting in the last 7 days — worth a word with your vet.');
    const said = (phoneScript(model.scriptFinding, 'Nyx', false, model.scriptMasking) ?? []).map((x) => x.label).join(' | ');
    expect(said).not.toMatch(/Week before/);
  });

  it('a finding the engine counted over an incomplete read (CUL-989) keeps the engine’s "at least" words', () => {
    const f = { ...worsening(), countIsFloor: true } as SymptomWorseningFinding;
    const recent = days(-1, -1, -2, -3, -4, -5).map((e, i) => ({ ...e, eventId: `r${i}` }));
    const model = buildSignalScreenModel(inputOf({ cached: cachedOf(f), episodes: recent }));
    expect(model.sentence).toBe(ENGINE_TEXT);
  });
});

describe('countsMayCompose', () => {
  it('needs every stated number to be at least the engine’s, and something to state', () => {
    const f = worsening({ currentCount: 2, currentDays: 2 });
    const weekly = (eps: string[]) => signalWeeks({ finding: f, today: TODAY, trial: null, episodeDays: eps, loggedDays: [] });
    const at = (eps: string[]) => signalCountsOf(f, weekly(eps), eps, TODAY);
    expect(countsMayCompose(f, at([shift(TODAY, -1), shift(TODAY, -2)]), { maskTouched: false, elapsedDays: 0 })).toBe(true);
    expect(countsMayCompose(f, at([shift(TODAY, -1), shift(TODAY, -1)]), { maskTouched: false, elapsedDays: 0 })).toBe(false); // 2 episodes, 1 day
    expect(countsMayCompose(f, at([shift(TODAY, -1), shift(TODAY, -2)]), { maskTouched: true, elapsedDays: 0 })).toBe(false); // masked
    const zero = worsening({ currentCount: 0, currentDays: 0 });
    expect(countsMayCompose(zero, signalCountsOf(zero, weekly([]), [], TODAY), { maskTouched: false, elapsedDays: 0 })).toBe(false);
  });
});
