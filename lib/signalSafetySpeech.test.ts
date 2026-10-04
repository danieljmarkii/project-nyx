import type { CachedFinding, SignalFinding } from './signal';
import { safetyArrivalSpoken, safetySpeechIdentity, speakableSafety } from './signalSafetySpeech';

// GAP-13 (CUL-1566): which findings speak when they reach Home, and the words they say.

const intake = (over: Partial<CachedFinding> = {}): CachedFinding => ({
  rank: 0,
  text: 'Nyx has eaten less than usual for two days — worth keeping an eye on, and a word with your vet if it carries on.',
  finding: {
    type: 'intake_decline',
    priorityClass: 'safety',
    trigger: 'consecutive_low',
    species: 'cat',
    daysBelowBaseline: 2,
    refusedFoodLabel: null,
    ratedMealsConsidered: 9,
  } as SignalFinding,
  ...over,
});

const chronicity = (careState?: unknown): CachedFinding => ({
  rank: 1,
  text: 'Vomiting has come back again and again over 60 days — worth a word with your vet.',
  finding: {
    type: 'symptom_chronicity',
    priorityClass: 'safety',
    symptomType: 'vomit',
    ...(careState === undefined ? {} : { careState }),
  } as unknown as SignalFinding,
});

const insight: CachedFinding = {
  rank: 2,
  text: 'She tends to eat within an hour of waking.',
  finding: { type: 'timing_story', priorityClass: 'insight', symptomType: 'vomit' } as unknown as SignalFinding,
};

const stoodDown: CachedFinding = {
  rank: 3,
  text: 'No new vomiting logged in the last 14 days.',
  finding: { type: 'stood_down', priorityClass: 'safety' } as unknown as SignalFinding,
};

describe('speakableSafety', () => {
  it('keeps the safety class and drops every benign card', () => {
    expect(speakableSafety([intake(), insight])).toEqual([intake()]);
  });

  it('drops a stand-down line: a sentence about absence is never an escalation', () => {
    expect(speakableSafety([stoodDown])).toEqual([]);
  });

  it('drops a concern whose ask the vet-knows state quieted, and keeps one raised again', () => {
    expect(speakableSafety([chronicity({ state: 'with_vet' })])).toEqual([]);
    expect(speakableSafety([chronicity({ state: 'recheck_booked' })])).toEqual([]);
    expect(speakableSafety([chronicity({ state: 'raised_again' })])).toHaveLength(1);
    expect(speakableSafety([chronicity()])).toHaveLength(1);
  });
});

describe('safetySpeechIdentity', () => {
  it('is the finding identity, so a re-rank is the same finding', () => {
    expect(safetySpeechIdentity(intake({ rank: 0 }))).toBe(safetySpeechIdentity(intake({ rank: 4 })));
    expect(safetySpeechIdentity(intake())).not.toBe(safetySpeechIdentity(chronicity()));
  });
});

describe('safetyArrivalSpoken', () => {
  it('says the sentence verbatim when it already names the pet', () => {
    const f = intake();
    expect(safetyArrivalSpoken('Nyx', [f])).toBe(f.text);
  });

  it('leads with the name when the sentence does not carry it, and adds nothing else', () => {
    const f = chronicity();
    expect(safetyArrivalSpoken('Nyx', [f])).toBe(`Nyx: ${f.text}`);
  });

  it('matches the name as a word, so "Max" is not found inside "Maxwell"', () => {
    const f = intake({ text: 'Maxwell food was refused twice — worth a call to your vet.' });
    expect(safetyArrivalSpoken('Max', [f])).toBe(`Max: ${f.text}`);
  });

  it('says several arrivals once, in rank order, each closed as a sentence', () => {
    const a = chronicity();
    const b = intake({ rank: 0, text: 'Nyx has refused two meals — worth a call to your vet' });
    expect(safetyArrivalSpoken('Nyx', [a, b])).toBe(`${b.text}. ${a.text}`);
  });

  it('is null with nothing to say, and speaks a sentence with no name to lead', () => {
    expect(safetyArrivalSpoken('Nyx', [])).toBeNull();
    expect(safetyArrivalSpoken('Nyx', [intake({ text: '   ' })])).toBeNull();
    const f = chronicity();
    expect(safetyArrivalSpoken(null, [f])).toBe(f.text);
    expect(safetyArrivalSpoken('your pet', [f])).toBe(`Your pet: ${f.text}`);
  });

  it('never carries a reassuring or celebratory word the sentence did not', () => {
    const f = chronicity();
    const spoken = safetyArrivalSpoken('Nyx', [f]) ?? '';
    expect(spoken.replace(f.text, '')).toBe('Nyx: ');
  });
});
