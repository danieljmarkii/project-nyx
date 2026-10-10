// Engines v3 PR-30a (CUL-1511; docs/nyx-incident-tiers-requirements.md §2, §4, K1 = A; mock §03).
// Home's safety band and the cross-pet banner read the tier. A red-flag card whose family holds a
// new-rule call asks in the tier-word map's words; a call the record raised (no photo flag) is a
// card of its own; every earlier-rule card keeps today's words to the byte (the dark state).

import type { CachedFinding, IncidentRedFlagFinding } from './signal';
import {
  bannerCopy,
  evidenceText,
  selectCrossPetSafetyFinding,
  incidentRedFlagAsk,
  isCallOnlyFinding,
  phoneScript,
  sampleLine,
  validateBannerPhrasing,
} from './signalCopy';
import { signalHomeLabel, signalHomeLine } from './signalHomeLine';
import { signalTitle } from './signalTitle';
import { TIER_WORDS } from './incidentTierWords';

const card = (over: Partial<IncidentRedFlagFinding> = {}): IncidentRedFlagFinding => ({
  type: 'incident_red_flag',
  priorityClass: 'safety',
  incidentType: 'vomit',
  flags: ['blood'],
  mostRecentFlaggedIso: '2026-10-08T07:02:00.000Z',
  flaggedIncidentCount: 1,
  windowDays: 14,
  ...over,
});

const recordCall = (over: Partial<IncidentRedFlagFinding> = {}) =>
  card({ flags: [], callOnly: true, tier: 'call_today', ...over });

const EVERY_NEW_RULE_CARD: IncidentRedFlagFinding[] = (['call_now', 'call_today'] as const).flatMap((tier) =>
  [1, 3].flatMap((n) => [
    card({ tier, flaggedIncidentCount: n }),
    card({ tier, flaggedIncidentCount: n, flags: ['blood', 'foreign_material'] }),
    recordCall({ tier, flaggedIncidentCount: n }),
    recordCall({ tier, flaggedIncidentCount: n, incidentType: 'stool' }),
  ]),
);

describe('the earlier rule keeps today’s words (the dark state)', () => {
  it('the Home row, the banner and the evidence are the shipped strings', () => {
    const line = signalHomeLine(card());
    expect(line).toEqual({
      eyebrow: 'Photo read · Oct 8',
      headline: 'Possible blood in a vomit photo',
      count: null,
      ask: 'worth a call to your vet',
    });
    expect(bannerCopy(card(), 'Nyx').text).toBe('Nyx has a logged photo showing possible blood — worth a look.');
    expect(evidenceText(card(), 'Nyx')).toContain("It's still worth a call to your vet");
    expect(sampleLine(card())).toBe('From an AI read of 1 logged photo');
  });

  it('a tier this build does not know keeps the shipped ask, never a guess', () => {
    const odd = card({ tier: 'call_soon' as unknown as 'call_now' });
    expect(incidentRedFlagAsk(odd)).toBe('worth a call to your vet');
    expect(bannerCopy(odd, 'Nyx').text).toBe(bannerCopy(card(), 'Nyx').text);
  });

  it('a flagless card with no tier is not a record call (a corrupt cache never reads as one)', () => {
    expect(isCallOnlyFinding(card({ flags: [], callOnly: true }))).toBe(false);
    expect(isCallOnlyFinding(card({ flags: [] }))).toBe(false);
  });
});

describe('a new-rule call speaks the map’s words on Home', () => {
  it('the ask is the tier label, lower-cased, and the row says it standing alone', () => {
    expect(signalHomeLine(card({ tier: 'call_now' }))?.ask).toBe('call your vet now');
    expect(signalHomeLine(card({ tier: 'call_today' }))?.ask).toBe('call your vet today');
    expect(signalHomeLabel(signalHomeLine(card({ tier: 'call_now' }))!)).toBe(
      `Photo read, Oct 8. Possible blood in a vomit photo. ${TIER_WORDS.call_now.label}.`,
    );
  });

  it('a call-only card names a read and its day, never a photo or a source', () => {
    const line = signalHomeLine(recordCall({ tier: 'call_now', tierIso: '2026-10-08T07:02:00.000Z' }))!;
    expect(line).toEqual({
      eyebrow: 'Read · Oct 8',
      headline: 'A vomit read says to call',
      count: null,
      ask: 'call your vet now',
    });
    expect(signalHomeLine(recordCall({ flaggedIncidentCount: 2, incidentType: 'stool' }))).toMatchObject({
      eyebrow: 'Read · Oct 8',
      headline: 'A stool read says to call',
    });
  });

  it('a call from a later read than the flagged photo carries that read’s day (never pinned on the photo)', () => {
    const f = card({ tier: 'call_now', mostRecentFlaggedIso: '2026-09-28T07:00:00.000Z', tierIso: '2026-10-08T07:02:00.000Z' });
    const line = signalHomeLine(f)!;
    expect(line.eyebrow).toBe('Photo read · Sep 28');
    expect(line.count).toBe('The call is from a read on Oct 8');
    expect(line.ask).toBe('call your vet now');
    expect(evidenceText(f, 'Nyx')).toContain('A read on October 8 says to call your vet now.');
    // The same read: no second date.
    expect(signalHomeLine(card({ tier: 'call_now', tierIso: '2026-10-08T07:02:00.000Z' }))!.count).toBeNull();
  });

  it('every surface naming a new-rule card carries its ask and never the shipped words or a photo it did not read', () => {
    for (const f of EVERY_NEW_RULE_CARD) {
      const ask = incidentRedFlagAsk(f);
      const words = [
        signalTitle(f, null),
        evidenceText(f, 'Nyx'),
        sampleLine(f),
        bannerCopy(f, 'Nyx').text,
        ...(phoneScript(f, 'Nyx', false, null, null) ?? []).map((r) => `${r.label} ${r.value}`),
      ];
      for (const w of words) {
        expect(w).not.toMatch(/worth a call/i);
        expect(w).not.toMatch(/undefined|NaN/);
        // No source claimed: the row cannot tell a contextual sign from the model's own call on a
        // clean photo or a call whose blood the owner cleared (adversarial pass, #1/#2).
        if (f.callOnly) expect(w).not.toMatch(/photo|possible blood|red flag|what you logged|logged around/i);
      }
      expect(evidenceText(f, 'Nyx').toLowerCase()).toContain(ask);
      expect(bannerCopy(f, 'Nyx').text.toLowerCase()).toContain(ask);
    }
  });
});

describe('the cross-pet banner (mock §03)', () => {
  it('says the tier in the mock’s words, photo or not', () => {
    expect(bannerCopy(card({ tier: 'call_now' }), 'Nyx').text).toBe('Nyx: a vomit read says call your vet now.');
    expect(bannerCopy(recordCall({ incidentType: 'stool' }), 'Nyx').text).toBe('Nyx: a stool read says call your vet today.');
  });

  it('every new-rule banner passes the banner’s own screen (it never fails safe to silence)', () => {
    for (const f of EVERY_NEW_RULE_CARD) {
      expect(validateBannerPhrasing(bannerCopy(f, 'Nyx').screened)).toBe(true);
    }
  });
});

describe('the banner picks the household’s loudest ask', () => {
  const cached = (finding: IncidentRedFlagFinding): CachedFinding => ({ finding, rank: 0, text: '' });
  it('a call now on a later pet takes the banner from an earlier pet’s call today', () => {
    const picked = selectCrossPetSafetyFinding([
      { pet: { id: 'a' }, findings: [cached(card({ tier: 'call_today' }))] },
      { pet: { id: 'b' }, findings: [cached(recordCall({ tier: 'call_now' }))] },
    ]);
    expect(picked?.pet.id).toBe('b');
  });

  it('between two earlier-rule flags the shipped order stands (first pet wins)', () => {
    const picked = selectCrossPetSafetyFinding([
      { pet: { id: 'a' }, findings: [cached(card())] },
      { pet: { id: 'b' }, findings: [cached(card({ flags: ['foreign_material'] }))] },
    ]);
    expect(picked?.pet.id).toBe('a');
  });
});
