// "Part of a pattern" (K2, CUL-1515). The record's membership read is driven over loads shaped
// exactly like `loadSignalScreen`'s ready answer (C-35); the screen's own gates (visibility,
// masking, the stood-down flag on the episodes) are `signalScreen.test.ts`'s.

jest.mock('./db', () => ({ getDb: () => ({ getAllAsync: jest.fn() }) }));
jest.mock('./supabase', () => ({ supabase: { from: jest.fn() } }));

const mockReadSignalCache = jest.fn();
jest.mock('./signal', () => {
  const actual = jest.requireActual('./signal');
  return { ...actual, readSignalCacheOrLast: async (...a: unknown[]) => ({ row: await mockReadSignalCache(...a), fromLast: false }) };
});

import {
  evidenceIdsOf,
  isPatternRead,
  PATTERN_WORDS,
  patternActionLine,
  readPatternMembership,
} from './incidentPattern';
import type { CachedFinding } from './signal';
import { foldIdentity } from './signalFold';
import type { SignalScreenEpisodes, SignalScreenLoad, SignalScreenModel } from './signalScreen';
import { TIER_WORDS, type TierDisplay } from './incidentTierWords';

const vomitReflection = (rank: number): CachedFinding => ({
  rank,
  text: 'Nyx vomited once this week.',
  finding: {
    type: 'reflection',
    priorityClass: 'insight',
    symptomType: 'vomit',
    currentCount: 3,
    priorCount: 3,
    direction: 'flat',
    windowDays: 7,
  },
});
const itchReflection: CachedFinding = {
  rank: 0,
  text: 'Nyx itched twice.',
  finding: { ...vomitReflection(0).finding, symptomType: 'itch' } as CachedFinding['finding'],
};
const stoodDown: CachedFinding = {
  rank: 0,
  text: 'Quiet.',
  finding: {
    type: 'stood_down',
    priorityClass: 'insight',
    symptomType: 'vomit',
    recencyDays: 14,
    tier: 'standard',
    lastEpisodeIso: '2026-10-01T09:00:00.000Z',
    stoodDownAt: '2026-10-09T09:00:00.000Z',
    formerRank: 1,
  },
};

function episodes(over: Partial<SignalScreenEpisodes> = {}): SignalScreenEpisodes {
  return {
    total: 2,
    photographedCount: 1,
    weeks: 4,
    countLine: '2 in these 4 weeks, one photographed',
    tiles: [
      {
        eventId: 'ev-tile',
        occurredAt: '2026-10-08T09:00:00.000Z',
        dateWord: 'Oct 8',
        timeWord: '9:00 AM',
        verdict: 'logged',
        photo: { localUri: null, storagePath: 'p/ev-tile.jpg' },
        boutIds: ['ev-tile', 'ev-relog'],
      },
    ],
    photoless: [{ eventId: 'ev-bare', boutKey: 'ev-bare|ev-bare-2', call: null }],
    tracksPattern: true,
    ...over,
  };
}

function ready(eps: SignalScreenEpisodes | null, noun: string | null = 'vomiting'): SignalScreenLoad {
  return { status: 'ready', petName: 'Nyx', asOfLine: null, model: { noun, episodes: eps } as unknown as SignalScreenModel };
}

beforeEach(() => mockReadSignalCache.mockReset());

describe('the words', () => {
  it('names the record\'s pet and the screen\'s noun, and restates nothing of Home\'s ask', () => {
    expect(patternActionLine('Nyx', 'vomiting')).toBe("Home is tracking Nyx's vomiting, and this one is part of it.");
    expect(patternActionLine('  ', 'vomiting')).toBe('Home is tracking your pet’s vomiting, and this one is part of it.');
    expect(patternActionLine(null, 'diarrhea')).toBe('Home is tracking your pet’s diarrhea, and this one is part of it.');
  });

  it('is never a word the tier map already holds, and carries no exclamation or wellness word', () => {
    const map = Object.values(TIER_WORDS).flatMap((w) => [w.label, w.short]);
    expect(map).not.toContain(PATTERN_WORDS.label);
    const all = [PATTERN_WORDS.label, PATTERN_WORDS.door, patternActionLine('Nyx', 'vomiting')].join(' ');
    expect(all).not.toMatch(/!|\b(fine|normal|healthy|nothing to worry|okay|ok)\b/i);
  });
});

describe('isPatternRead: only a new-rule logged read in tracked evidence', () => {
  const all: (TierDisplay | null)[] = ['call_now', 'call_today', 'logged', 'not_enough_to_say', 'worth_a_call', 'monitor', null];
  it.each(all.map((v) => [v]))('%s', (verdict) => {
    expect(isPatternRead(verdict, true)).toBe(verdict === 'logged');
    expect(isPatternRead(verdict, false)).toBe(false);
  });
});

describe('evidenceIdsOf', () => {
  it('holds every tile row, every bout row and every photoless bout row', () => {
    expect([...evidenceIdsOf(episodes())].sort()).toEqual(['ev-bare', 'ev-bare-2', 'ev-relog', 'ev-tile']);
  });
  it('is empty with no episodes', () => {
    expect(evidenceIdsOf(null).size).toBe(0);
  });
});

describe('readPatternMembership: the record asks the screen the gallery is drawn from', () => {
  const ask = (eventId: string, load: jest.Mock, eventType = 'vomit') =>
    readPatternMembership({ petId: 'pet-1', eventId, eventType, nowMs: 0 }, load);

  it('finds the record among a tracked finding\'s episodes, a re-log of the bout included, and opens that screen', async () => {
    mockReadSignalCache.mockResolvedValue({ findings: [vomitReflection(0)] });
    const load = jest.fn().mockResolvedValue(ready(episodes()));
    const identity = foldIdentity(vomitReflection(0).finding);
    for (const id of ['ev-tile', 'ev-relog', 'ev-bare-2']) {
      expect(await ask(id, load)).toEqual({
        identity,
        noun: 'vomiting',
        href: `/signal/${encodeURIComponent(identity)}?pet=pet-1`,
      });
    }
    expect(load).toHaveBeenCalledWith('pet-1', identity, 0);
  });

  it('a record outside the drawn episodes is not part of it', async () => {
    mockReadSignalCache.mockResolvedValue({ findings: [vomitReflection(0)] });
    expect(await ask('ev-other', jest.fn().mockResolvedValue(ready(episodes())))).toBeNull();
  });

  it('the stood-down line marks nothing: never loaded, and an untracked screen marks nothing either', async () => {
    mockReadSignalCache.mockResolvedValue({ findings: [stoodDown] });
    const load = jest.fn().mockResolvedValue(ready(episodes()));
    expect(await ask('ev-tile', load)).toBeNull();
    expect(load).not.toHaveBeenCalled();
    mockReadSignalCache.mockResolvedValue({ findings: [vomitReflection(0)] });
    expect(await ask('ev-tile', jest.fn().mockResolvedValue(ready(episodes({ tracksPattern: false }))))).toBeNull();
  });

  it('a finding about improvement, a timing claim or a red flag is never asked (adversarial pass F1, F2)', async () => {
    const improving: CachedFinding = { ...vomitReflection(0), finding: { ...vomitReflection(0).finding, direction: 'improving' } as CachedFinding['finding'] };
    const timing: CachedFinding = {
      rank: 0,
      text: 'Soon after meals.',
      finding: { type: 'postprandial_timing', priorityClass: 'insight', symptomType: 'vomit' } as unknown as CachedFinding['finding'],
    };
    for (const f of [improving, timing]) {
      mockReadSignalCache.mockResolvedValue({ findings: [f] });
      const load = jest.fn().mockResolvedValue(ready(episodes()));
      expect(await ask('ev-tile', load)).toBeNull();
      expect(load).not.toHaveBeenCalled();
    }
  });

  it('only a finding of the record\'s own sign is asked', async () => {
    mockReadSignalCache.mockResolvedValue({ findings: [itchReflection] });
    const load = jest.fn().mockResolvedValue(ready(episodes()));
    expect(await ask('ev-tile', load)).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it('a screen that will not draw the finding (withheld, set aside, missing, unsupported) marks nothing', async () => {
    mockReadSignalCache.mockResolvedValue({ findings: [vomitReflection(0)] });
    for (const status of ['withheld', 'missing', 'unsupported'] as const) {
      expect(await ask('ev-tile', jest.fn().mockResolvedValue({ status, petName: 'Nyx' }))).toBeNull();
    }
    expect(await ask('ev-tile', jest.fn().mockResolvedValue({ status: 'set_aside', petName: 'Nyx', lines: [] }))).toBeNull();
    expect(await ask('ev-tile', jest.fn().mockResolvedValue(ready(null)))).toBeNull();
  });

  it('a failure anywhere is null, never a throw: the read keeps its shipped words', async () => {
    mockReadSignalCache.mockRejectedValue(new Error('offline'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await ask('ev-tile', jest.fn())).toBeNull();
    mockReadSignalCache.mockResolvedValue({ findings: [vomitReflection(0)] });
    expect(await ask('ev-tile', jest.fn().mockRejectedValue(new Error('db')))).toBeNull();
    warn.mockRestore();
  });

  it('a finding that cannot load never hides a lower-ranked one that counts the record (C-4)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const burden: CachedFinding = {
      rank: 1,
      text: 'A lot of vomiting.',
      finding: { type: 'symptom_burden', priorityClass: 'safety', symptomType: 'vomit' } as unknown as CachedFinding['finding'],
    };
    mockReadSignalCache.mockResolvedValue({ findings: [vomitReflection(0), burden] });
    const load = jest.fn().mockRejectedValueOnce(new Error('register')).mockResolvedValueOnce(ready(episodes()));
    expect((await ask('ev-tile', load))?.identity).toBe(foldIdentity(burden.finding));
    warn.mockRestore();
  });

  it('asks in Home\'s rank order, and the first finding holding the record wins', async () => {
    const worsening: CachedFinding = {
      rank: 0,
      text: 'More vomiting.',
      finding: {
        type: 'symptom_worsening',
        priorityClass: 'safety',
        symptomType: 'vomit',
        currentCount: 4,
        priorCount: 1,
        currentDays: 3,
        priorDays: 1,
      } as unknown as CachedFinding['finding'],
    };
    mockReadSignalCache.mockResolvedValue({ findings: [vomitReflection(1), worsening] });
    const load = jest.fn().mockResolvedValue(ready(episodes()));
    const got = await ask('ev-tile', load);
    expect(got?.identity).toBe(foldIdentity(worsening.finding));
    expect(load).toHaveBeenCalledTimes(1);
  });
});
