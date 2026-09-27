// For the call (TS-7 · CUL-1303). The rules under test are §3.3 and T-4 of
// `docs/nyx-trial-screen-requirements.md`; each case names the one it pins.
//
// Every fixture day is built from LOCAL components (B-514), and the vomiting counts are driven
// through the real `computeTrialResponseCounts` wherever the count or its date is the claim, so
// a fixture can only hold a shape the loader can produce (C-34, C-35).

// `lib/analytics` (the trial's day math) imports the arrangements module, which pulls
// `lib/sync` → `lib/supabase` and its fail-fast env check. Nothing under test touches it, so
// stub the edge of the graph exactly as `lib/dietTrialCard.test.ts` does.
jest.mock('./feedingArrangements', () => ({
  getActiveArrangementsForPet: jest.fn().mockResolvedValue([]),
}));

import { buildForTheCall, forTheCallSwapLine, FOR_THE_CALL_HEADING } from './trialForTheCall';
import { resolveTrialCard, type TrialCardInput } from './dietTrialCard';
import type { TrialDietRefusal } from './dietTrial';
import { computeTrialResponseCounts, type TrialResponseCounts } from './trialResponseCounts';
import { localDayIndexOf } from './utils';

/** Midday, Sep 27 2026, in whatever zone the suite runs in. */
const NOW = new Date(2026, 8, 27, 12, 0, 0).getTime();

function keyDaysAgo(n: number): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function atLocal(daysAgo: number, hour: number, minute = 0): number {
  const d = new Date(NOW);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

const REFUSAL: TrialDietRefusal = { refusedFeedings: 4, ratedFeedings: 5, days: 2, population: 'trial_diet' };

function refusing(over: Partial<TrialCardInput> = {}, dayCounter = 5): TrialCardInput {
  return {
    trial: {
      id: 't-1',
      status: 'active',
      startedAt: keyDaysAgo(dayCounter - 1),
      targetDurationDays: 56,
      foodLabel: 'Royal Canin Selected Protein PD',
    },
    nowMs: NOW,
    petName: 'Pixel',
    species: 'cat',
    coverage: { daysLogged: dayCounter, daysElapsed: dayCounter },
    exposures: { totalFeedings: 10, offDiet: 0, mayStateRecordClean: false, mostRecent: null },
    otherPetNames: [],
    trialDietRefusal: REFUSAL,
    ...over,
  };
}

function counts(startedAt: string, vomitOnsetsMs: number[]): TrialResponseCounts {
  const c = computeTrialResponseCounts({ vomitOnsetsMs, loggedEventMs: vomitOnsetsMs, trialStartedAt: startedAt, nowMs: NOW });
  if (!c) throw new Error('counts did not place the trial');
  return c;
}

/** Resolve the card exactly as the screen does, then build the block from its own state. */
function build(input: TrialCardInput) {
  const card = resolveTrialCard(input);
  return { card, call: buildForTheCall(input, card.state, card.foodLabel) };
}

describe('For the call — the refusal face only', () => {
  it('renders the round-2 frame: offered, the day, the vomiting pair with its last date, then the swap line', () => {
    const input = refusing({}, 5);
    const trialResponse = counts(input.trial!.startedAt, [atLocal(3, 8), atLocal(2, 19)]);
    const { card, call } = build({ ...input, trialResponse });
    expect(card.state).toBe('trial_refusal');
    expect(call).toEqual({
      heading: FOR_THE_CALL_HEADING,
      facts: [
        'Offered: Royal Canin Selected Protein PD',
        'Day 5 of the trial',
        "Vomiting logged: 2 in the trial's 5 days, the last on Sep 25",
      ],
      vomiting: "Vomiting logged: 2 in the trial's 5 days, the last on Sep 25",
      swap: 'Veterinary diets are usually guaranteed, so the clinic can swap this one if Pixel isn’t eating it.',
    });
  });

  it('is absent on an intake decline, even with a refusal fact under it (the decline outranks the register)', () => {
    const { card, call } = build(refusing({ intakeDeclineHeadline: 'Pixel has left most of her food for 3 days.' }));
    expect(card.state).toBe('intake_decline');
    expect(call).toBeNull();
  });

  it('is absent the day the register stands down, though the screen still treats the pet as possibly not eating', () => {
    // A range refusal the recent record has answered: 4 of 4 recent rated bowls finished. The
    // card's register stands down, so the block that sits under it goes with it.
    const { card, call } = build(
      refusing({
        trialDietRefusal: null,
        rangeRefusal: { refusedFeedings: 30, ratedFeedings: 30, days: 15, population: 'trial_diet' },
        rangeRefusalSpansEpisodes: true,
        recentRatedFeedings: 4,
        recentFinishedFeedings: 4,
      }, 30),
    );
    expect(card.state).not.toBe('trial_refusal');
    expect(call).toBeNull();
  });

  it('speaks from the range fact while the recent record is silent (silence never cancels the alarm)', () => {
    const { card, call } = build(
      refusing({
        trialDietRefusal: null,
        rangeRefusal: { refusedFeedings: 42, ratedFeedings: 42, days: 21, population: 'trial_diet' },
        rangeRefusalSpansEpisodes: true,
        recentRatedFeedings: 0,
        recentFinishedFeedings: 0,
      }, 30),
    );
    expect(card.state).toBe('trial_refusal');
    expect(call?.facts).toEqual(['Offered: Royal Canin Selected Protein PD', 'Day 30 of the trial']);
  });

  it('is absent on every non-safety state', () => {
    const { card, call } = build(refusing({ trialDietRefusal: null }));
    expect(card.state).not.toBe('trial_refusal');
    expect(call).toBeNull();
    expect(buildForTheCall(refusing(), 'clean', 'Royal Canin Selected Protein PD')).toBeNull();
  });
});

describe('Offered (B-530)', () => {
  it('names no diet, and offers no swap, when the refusal is over the meal record', () => {
    // The register's note says the app can't tell which food went untouched; "swap this one"
    // beneath it would point at nothing, or at a food the pet is eating fine.
    const { card, call } = build(refusing({ trialDietRefusal: { ...REFUSAL, population: 'meal_record' } }));
    expect(card.lines.some((l) => /can’t name which one went untouched/.test(l.text))).toBe(true);
    expect(call?.facts).toEqual(['Day 5 of the trial']);
    expect(call?.swap).toBeNull();
  });

  it('names no diet when the trial carries no label', () => {
    const input = refusing();
    const { call } = build({ ...input, trial: { ...input.trial!, foodLabel: '  ' } });
    expect(call?.facts).toEqual(['Day 5 of the trial']);
  });
});

describe('Vomiting logged (T-4: presence only, always with its last date)', () => {
  it('says nothing at zero: no count, no "none", no baseline', () => {
    const input = refusing();
    const trialResponse = counts(input.trial!.startedAt, [atLocal(20, 9)]); // baseline only
    expect(trialResponse.trialCount).toBe(0);
    expect(trialResponse.baselineCount).toBe(1);
    const { call } = build({ ...input, trialResponse });
    expect(call?.facts.some((l) => /vomit/i.test(l))).toBe(false);
  });

  it('says nothing when the counts were not computed', () => {
    const { call } = build(refusing({ trialResponse: null }));
    expect(call?.facts.some((l) => /vomit/i.test(l))).toBe(false);
  });

  it('counts episodes, not events: a re-logged bout is one', () => {
    const input = refusing();
    const trialResponse = counts(input.trial!.startedAt, [atLocal(1, 8, 0), atLocal(1, 8, 40), atLocal(1, 9, 30)]);
    const { call } = build({ ...input, trialResponse });
    expect(call?.facts).toContain("Vomiting logged: 1 in the trial's 5 days, on Sep 26");
  });

  it('keeps a recent cluster visible over a long trial: 3 in the last 36 hours on day 40', () => {
    const input = refusing({}, 40);
    const trialResponse = counts(input.trial!.startedAt, [atLocal(1, 22), atLocal(0, 6), atLocal(0, 11)]);
    const { call } = build({ ...input, trialResponse });
    expect(call?.facts).toEqual([
      'Offered: Royal Canin Selected Protein PD',
      'Day 40 of the trial',
      "Vomiting logged: 3 in the trial's 40 days, the last on Sep 27",
    ]);
  });

  it('says nothing at zero even when handed a date (an out-of-contract pair the loader cannot build today)', () => {
    // The shipped counts couple the two (no episode ⇒ no date), which is exactly why a dropped
    // k ≥ 1 gate would survive every in-contract fixture. This pins the gate itself.
    const input = refusing();
    const { call } = build({
      ...input,
      trialResponse: { ...counts(input.trial!.startedAt, []), trialLastEpisodeDayIndex: localDayIndexOf(keyDaysAgo(2)) },
    });
    expect(call?.facts.some((l) => /vomit/i.test(l))).toBe(false);
  });

  it('never carries a count without its date', () => {
    const input = refusing();
    const { call } = build({
      ...input,
      trialResponse: { ...counts(input.trial!.startedAt, [atLocal(2, 9)]), trialLastEpisodeDayIndex: null },
    });
    expect(call?.facts.some((l) => /vomit/i.test(l))).toBe(false);
  });

  it('never states a baseline or a direction, whatever the baseline holds', () => {
    const input = refusing({}, 20);
    const baseline = [30, 32, 35, 40, 45, 50].map((d) => atLocal(d, 10));
    const trialResponse = counts(input.trial!.startedAt, [...baseline, atLocal(4, 10)]);
    expect(trialResponse.baselineCount).toBeGreaterThan(trialResponse.trialCount);
    const { call } = build({ ...input, trialResponse });
    const line = call?.facts.find((l) => /vomit/i.test(l)) ?? '';
    expect(line).toBe("Vomiting logged: 1 in the trial's 20 days, on Sep 23");
    expect(line).not.toMatch(/before|baseline|fewer|less|down|drop|improv|was\b/i);
  });

  it('dates the last episode by the owner’s local day, at both edges of it', () => {
    const input = refusing();
    const late = counts(input.trial!.startedAt, [atLocal(2, 23, 59)]);
    const early = counts(input.trial!.startedAt, [atLocal(2, 0, 1)]);
    expect(late.trialLastEpisodeDayIndex).toBe(localDayIndexOf(keyDaysAgo(2)));
    expect(early.trialLastEpisodeDayIndex).toBe(localDayIndexOf(keyDaysAgo(2)));
    expect(build({ ...input, trialResponse: late }).call?.facts).toContain(
      "Vomiting logged: 1 in the trial's 5 days, on Sep 25",
    );
  });
});

describe('the words', () => {
  it('never uses volitional wording about the pet, on any line the block can produce', () => {
    const inputs: TrialCardInput[] = [
      refusing(),
      refusing({ trialDietRefusal: { ...REFUSAL, population: 'meal_record' } }),
      refusing({ species: 'dog', petName: 'Biscuit' }),
    ];
    for (const input of inputs) {
      const trialResponse = counts(input.trial!.startedAt, [atLocal(1, 9), atLocal(3, 9)]);
      const { call } = build({ ...input, trialResponse });
      expect(call).not.toBeNull();
      const text = [call!.heading, ...call!.facts, call!.swap ?? ''].join('\n');
      expect(text).not.toMatch(/won[’']t|refus|reject|picky|fussy|doesn[’']t want|!/i);
    }
  });

  it('restates nothing the register said: no count of the unfinished feedings', () => {
    const { card, call } = build(refusing());
    const register = card.lines.filter((l) => l.role === 'flag').map((l) => l.text).join(' ');
    expect(register).toMatch(/4 feedings of the 5/);
    const text = [...call!.facts, call!.swap ?? ''].join(' ');
    expect(text).not.toMatch(/unfinished|\b4\b|\b5 trial/);
  });

  it('names the pet in the swap line', () => {
    expect(forTheCallSwapLine('Biscuit')).toBe(
      'Veterinary diets are usually guaranteed, so the clinic can swap this one if Biscuit isn’t eating it.',
    );
  });
});
