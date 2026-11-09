// CUL-2405: an intake trigger this build does not know (shipped server-side before the app build
// that names it) reads at its most cautious on every client surface: no "less than usual", no
// baseline claim ("below the usual", "compared with"), no "if it carries on", and the vet ask kept.
// The consecutive-low card is the control: it keeps its own words, so the default is not simply
// every card turned up.

import {
  UNKNOWN_INTAKE_COPY,
  bannerCopy,
  evidenceText,
  hasBannedSignalVocabulary,
  phoneScript,
  sampleLine,
  stripA11yLabel,
  stripAskLine,
  stripCountLine,
  stripNameLine,
  validateBannerPhrasing,
  type BannerSafetyFinding,
} from './signalCopy';
import { signalHomeAsk, signalHomeLine } from './signalHomeLine';
import type { IntakeDeclineFinding, IntakeDeclineTrigger, RefusedThenVomitedFacts } from './signal';

// CUL-2680: one instant per file, so two fixtures built a millisecond apart stay equal.
const ATE_WELL_2H_AGO = new Date(Date.now() - 2 * 3_600_000).toISOString();

const I5: RefusedThenVomitedFacts = { episodeCount: 2, dayCount: 2, windowMinutes: 30, firstLocalDay: '2026-10-28' } as RefusedThenVomitedFacts;

function card(trigger: string, extra: Partial<IntakeDeclineFinding> = {}): IntakeDeclineFinding {
  return {
    type: 'intake_decline',
    priorityClass: 'safety',
    // Off the wire: a string the type union does not hold.
    trigger: trigger as unknown as IntakeDeclineTrigger,
    species: 'cat',
    daysBelowBaseline: 3,
    refusedFoodLabel: null,
    ratedMealsConsidered: 6,
    // CUL-2680: ate well 2 h ago, so only a card's own trigger can raise the floor.
    lastGoodMealIso: ATE_WELL_2H_AGO,
    ...extra,
  };
}

/** Every owner-facing string the client composes for an intake card, one per surface. */
function surfaces(f: IntakeDeclineFinding): Record<string, string> {
  const banner = bannerCopy(f as BannerSafetyFinding, 'Miso');
  const home = signalHomeLine(f);
  const script = phoneScript(f, 'Miso', false, null, null) ?? [];
  return {
    evidence: evidenceText(f, 'Miso'),
    sample: sampleLine(f),
    script: script.map((r) => `${r.label}: ${r.value}`).join(' | '),
    banner: banner.text,
    stripName: stripNameLine(f) ?? '',
    stripAsk: stripAskLine(f) ?? '',
    stripCount: stripCountLine(f) ?? '',
    stripA11y: stripA11yLabel(f) ?? '',
    homeHeadline: home?.headline ?? '',
    homeCount: home?.count ?? '',
    homeAsk: home?.ask ?? '',
  };
}

const SOFT = /less than usual|below the usual|compared with|than usual|carries on|keeping an eye|\busual\b|recent meals?\b.*\d|\d+ days?\b/i;

describe('an intake trigger this build does not know (CUL-2405)', () => {
  for (const trigger of ['refused_three_days', 'some_future_trigger', '']) {
    it(`"${trigger}" reads at its most cautious on every surface`, () => {
      const s = surfaces(card(trigger));
      for (const [surface, text] of Object.entries(s)) {
        expect([surface, text]).not.toEqual([surface, expect.stringMatching(SOFT)]);
        expect([surface, text]).not.toEqual([surface, expect.stringMatching(/!|picky|fussy/i)]);
      }
      // Every surface says something: a blank line is the silence this must never become.
      for (const [surface, text] of Object.entries(s)) {
        if (surface === 'homeCount') continue; // null by design: no count this build can back
        expect([surface, text.length > 0]).toEqual([surface, true]);
      }
      // The vet ask, kept, at the loudest intake card's words.
      expect(s.evidence).toBe("Something in Miso's recent meals stood out in what you logged. Call your vet today.");
      expect(s.banner).toBe('Miso: something in recent meals stood out — call your vet today.');
      expect(s.homeAsk).toBe(UNKNOWN_INTAKE_COPY.ask);
      expect(signalHomeAsk(card(trigger))).toBe('call your vet today');
      expect(s.stripAsk).toBe('Call your vet');
      expect(s.stripName).toBe(UNKNOWN_INTAKE_COPY.name);
      expect(s.homeHeadline).toBe(UNKNOWN_INTAKE_COPY.name);
      expect(s.sample).toBe(UNKNOWN_INTAKE_COPY.sample);
      expect(s.stripCount).toBe(UNKNOWN_INTAKE_COPY.sample);
      expect(s.script).toBe(`Concern: ${UNKNOWN_INTAKE_COPY.concern}`);
      expect(s.homeCount).toBe('');
    });
  }

  it('the banner passes its own guardrail screen (a failed screen would drop it to silence)', () => {
    const b = bannerCopy(card('some_future_trigger') as BannerSafetyFinding, 'Miso');
    expect(validateBannerPhrasing(b.screened)).toBe(true);
  });

  it('the strip lines pass the banned-vocabulary screen', () => {
    const f = card('some_future_trigger');
    for (const line of [stripNameLine(f), stripAskLine(f), stripCountLine(f)]) {
      expect(hasBannedSignalVocabulary(line ?? '')).toBe(false);
    }
  });

  it('a refused-then-vomited fact on the unknown card still follows its sentence', () => {
    const f = card('some_future_trigger', { refusedThenVomited: I5 });
    expect(evidenceText(f, 'Miso')).toMatch(/^Something in Miso's recent meals stood out in what you logged\. Call your vet today\. Miso vomited within 30 minutes/);
    expect(phoneScript(f, 'Miso', false, null, null)?.map((r) => r.label)).toEqual(['Concern', 'Vomited soon after a refused meal', 'Within', 'First']);
  });

  it('the consecutive-low card keeps its own words (the control)', () => {
    const s = surfaces(card('consecutive_low'));
    expect(s.evidence).toMatch(/^Miso has eaten less than usual for 3 days, compared with 6 recent meals\./);
    expect(s.sample).toBe('3 days below the usual, across 6 recent meals');
    expect(s.banner).toBe('Miso has eaten less than usual for 3 days — worth a look.');
    expect(s.stripName).toBe('Eating less than usual');
    expect(s.stripAsk).toBe('Worth asking a vet');
    expect(s.stripCount).toBe('3 days below the usual, 6 recent meals');
    expect(s.homeCount).toBe('The last three days');
    expect(s.homeAsk).toBe('worth keeping an eye on, and a word with your vet if it carries on');
  });

  it('the refused-normal-food card keeps its conditional ask (the second control)', () => {
    const f = card('refused_normal_food', { refusedFoodLabel: 'Kibble' });
    expect(stripAskLine(f)).toBe('Worth asking a vet');
    expect(signalHomeAsk(f)).toBe('worth keeping an eye on, and a word with your vet if it carries on');
  });
});
