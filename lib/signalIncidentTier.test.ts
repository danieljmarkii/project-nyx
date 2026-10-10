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
  incidentRedFlagSentenceAt,
  isCallOnlyFinding,
  phoneScript,
  sampleLine,
  validateBannerPhrasing,
} from './signalCopy';
import { signalHomeLabel, signalHomeLine } from './signalHomeLine';
import { signalTitle } from './signalTitle';
import { TIER_WORDS } from './incidentTierWords';
import { safetyArrivalSpoken } from './signalSafetySpeech';
import { localCallDay } from './callNowDated';

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
    // A later call today under the call now is said on the row and in the evidence too.
    const later = { ...f, laterCallTodayIso: '2026-10-09T07:00:00.000Z' };
    // The later call today is dated by the phone's local day (PR-30c), the call's own read in UTC as PR-30a shipped.
    const L = localCallDay(later.laterCallTodayIso)!;
    expect(signalHomeLine(later)!.count).toBe(`The call is from a read on Oct 8 · A later read on ${L.short} says call today`);
    expect(evidenceText(later, 'Nyx')).toContain(`A later read, on ${L.long}, says to call your vet today.`);
    // One instant, two spellings: one read (C-40).
    expect(signalHomeLine(card({ tier: 'call_now', mostRecentFlaggedIso: '2026-10-08T07:02:00.000Z', tierIso: '2026-10-08T07:02:00+00:00' }))!.count).toBeNull();
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

// ── Engines v3 PR-30c (CUL-1739; PM ruling A, 2026-10-10) ─────────────────────
// A call now says "now" for its read's first 24 hours, then steps to a dated form on Home's row,
// the banner, the screen's sentence and evidence and the arrival speech. The card never leaves,
// never loses its ask, and a call today or an earlier-rule card never moves.
describe('a call now after its first day (PR-30c)', () => {
  const READ = '2026-10-08T07:02:00.000Z';
  const DAY = 24 * 60 * 60 * 1000;
  // The dated day is the phone's LOCAL day of the said-at instant (timezone-honest, B-514).
  const D = localCallDay(READ)!;
  const firstDay = Date.parse(READ) + DAY - 1;
  const dayTwo = Date.parse(READ) + DAY;
  const callNow = (over: Partial<IncidentRedFlagFinding> = {}) => card({ tier: 'call_now', tierIso: READ, tierReadIso: READ, ...over });
  const callNowOnly = (over: Partial<IncidentRedFlagFinding> = {}) => recordCall({ tier: 'call_now', tierIso: READ, tierReadIso: READ, ...over });

  it('the Home row says "now" through the first day and the dated form at 24 hours', () => {
    expect(signalHomeLine(callNow(), null, firstDay)?.ask).toBe('call your vet now');
    const dated = signalHomeLine(callNow(), null, dayTwo)!;
    expect(dated.ask).toBe(`on ${D.short}, the read said: call your vet now`);
    expect(signalHomeLabel(dated)).toBe(`Photo read, Oct 8. Possible blood in a vomit photo. On ${D.short}, the read said: call your vet now.`);
    expect(signalHomeLine(callNowOnly(), null, dayTwo)).toEqual({
      eyebrow: 'Read · Oct 8',
      headline: 'A vomit read says to call',
      count: null,
      ask: `on ${D.short}, the read said: call your vet now`,
    });
  });

  it('no clock keeps "now" (the loud form is the default)', () => {
    expect(signalHomeLine(callNow())?.ask).toBe('call your vet now');
    expect(bannerCopy(callNow(), 'Nyx').text).toBe('Nyx: a vomit read says call your vet now.');
  });

  it('a call today, an earlier-rule card and a call now in its first day are byte-identical with the clock', () => {
    const later = Date.parse(READ) + 13 * DAY;
    for (const f of [card(), card({ tier: 'call_today', tierIso: READ }), recordCall({ tierIso: READ })]) {
      expect(signalHomeLine(f, null, later)).toEqual(signalHomeLine(f));
      expect(bannerCopy(f, 'Nyx', later)).toEqual(bannerCopy(f, 'Nyx'));
      expect(evidenceText(f, 'Nyx', later)).toBe(evidenceText(f, 'Nyx'));
      expect(incidentRedFlagSentenceAt(f, 'Nyx', 'server words', later)).toBe('server words');
    }
    for (const f of EVERY_NEW_RULE_CARD.map((x) => ({ ...x, tierIso: READ, tierReadIso: READ }))) {
      expect(signalHomeLine(f, null, firstDay)).toEqual(signalHomeLine(f));
      expect(bannerCopy(f, 'Nyx', firstDay)).toEqual(bannerCopy(f, 'Nyx'));
      expect(evidenceText(f, 'Nyx', firstDay)).toBe(evidenceText(f, 'Nyx'));
    }
  });

  it('a call from a later read keeps one date on the row (the ask carries it), and a later call today still shows', () => {
    const f = callNow({ mostRecentFlaggedIso: '2026-09-28T07:00:00.000Z' });
    expect(signalHomeLine(f, null, dayTwo)!.count).toBeNull();
    expect(signalHomeLine(f, null, dayTwo)!.ask).toBe(`on ${D.short}, a read said: call your vet now`);
    const later = { ...f, laterCallTodayIso: '2026-10-09T07:00:00.000Z' };
    const L = localCallDay(later.laterCallTodayIso)!;
    expect(signalHomeLine(later, null, dayTwo)!.count).toBe(`A later read on ${L.short} says call today`);
    expect(evidenceText(later, 'Nyx', dayTwo)).toContain(`On ${D.long}, a read said: call your vet now. A later read, on ${L.long}, says to call your vet today.`);
  });

  it('every surface the clock reaches keeps the ask, quotes the call in the past tense, and never claims "now" for it', () => {
    const dated = EVERY_NEW_RULE_CARD.filter((f) => f.tier === 'call_now').map((f) => ({ ...f, tierIso: READ, tierReadIso: READ }));
    expect(dated.length).toBeGreaterThan(0);
    for (const f of dated) {
      const words = [
        signalHomeLine(f, null, dayTwo)!.ask!,
        bannerCopy(f, 'Nyx', dayTwo).text,
        evidenceText(f, 'Nyx', dayTwo),
        incidentRedFlagSentenceAt(f, 'Nyx', 'server words', dayTwo),
      ];
      for (const w of words) {
        expect(w).toMatch(/call your vet now/);
        expect(w.includes(D.short) || w.includes(D.long)).toBe(true);
        expect(w).toMatch(/said/);
        expect(w).not.toMatch(/says (to )?call your vet now/);
        expect(w).not.toMatch(/worth a call|undefined|NaN|!/);
        if (f.callOnly) expect(w).not.toMatch(/photo|possible blood|what you logged/i);
      }
      expect(validateBannerPhrasing(bannerCopy(f, 'Nyx', dayTwo).screened)).toBe(true);
    }
  });

  it('the banner is dated and drops just under a live red flag after its first day (rulings (a), 2a)', () => {
    expect(bannerCopy(callNow(), 'Nyx', dayTwo).text).toBe(`Nyx: on ${D.short}, a vomit read said call your vet now.`);
    const cached = (finding: IncidentRedFlagFinding): CachedFinding => ({ finding, rank: 0, text: '' });
    const today = card({ tier: 'call_today', tierIso: '2026-10-09T08:00:00.000Z' });
    const pets = (a: IncidentRedFlagFinding, b: IncidentRedFlagFinding) => [
      { pet: { id: 'a' }, findings: [cached(a)] },
      { pet: { id: 'b' }, findings: [cached(b)] },
    ];
    // In its first day the call now leads from any place in the list.
    expect(selectCrossPetSafetyFinding(pets(today, callNow()), firstDay)?.pet.id).toBe('b');
    // After it, a live call today on another pet takes the banner from it, whatever the order.
    expect(selectCrossPetSafetyFinding(pets(today, callNow()), dayTwo)?.pet.id).toBe('a');
    expect(selectCrossPetSafetyFinding(pets(callNow(), today), dayTwo)?.pet.id).toBe('b');
    // An earlier-rule red flag is live too.
    expect(selectCrossPetSafetyFinding(pets(callNow(), card()), dayTwo)?.pet.id).toBe('b');
    // A fresh call now on another pet still takes the banner from a dated one.
    const fresh = callNow({ tierIso: '2026-10-09T08:00:00.000Z', tierReadIso: '2026-10-09T08:00:00.000Z' });
    expect(selectCrossPetSafetyFinding(pets(callNow(), fresh), dayTwo)?.pet.id).toBe('b');
  });

  it('within one pet, a fresh call in the other family takes the banner from a dated call now (2a)', () => {
    const stoolToday = card({ incidentType: 'stool', tier: 'call_today', tierIso: '2026-10-09T08:00:00.000Z' });
    const picked = selectCrossPetSafetyFinding(
      [{ pet: { id: 'a' }, findings: [{ finding: callNow(), rank: 0, text: '' }, { finding: stoolToday, rank: 1, text: '' }] }],
      dayTwo,
    );
    expect(picked?.finding).toBe(stoolToday);
  });

  it('a later call today under a dated call now is what the banner says (2a)', () => {
    const f = callNow({ laterCallTodayIso: '2026-10-09T05:00:00.000Z' });
    expect(bannerCopy(f, 'Nyx', dayTwo).text).toBe('Nyx: a vomit read says call your vet today.');
    expect(validateBannerPhrasing(bannerCopy(f, 'Nyx', dayTwo).screened)).toBe(true);
    // It ranks as a live red flag, so it ties a call today on another pet and order decides.
    const today = card({ tier: 'call_today', tierIso: '2026-10-09T08:00:00.000Z' });
    const cached = (finding: IncidentRedFlagFinding): CachedFinding => ({ finding, rank: 0, text: '' });
    expect(selectCrossPetSafetyFinding([{ pet: { id: 'a' }, findings: [cached(f)] }, { pet: { id: 'b' }, findings: [cached(today)] }], dayTwo)?.pet.id).toBe('a');
  });

  it('a call said late (a re-floor) keeps "now" for a day from when it was said, then dates by that day (1a)', () => {
    const refloor = '2026-10-09T09:00:00.000Z';
    const f = callNowOnly({ tierReadIso: refloor });
    // 26 hours after the vomit, 22 after the call: still "now", everywhere, and it still leads the banner.
    expect(signalHomeLine(f, null, Date.parse(READ) + 26 * 3600_000)?.ask).toBe('call your vet now');
    expect(bannerCopy(f, 'Nyx', Date.parse(READ) + 26 * 3600_000).text).toBe('Nyx: a vomit read says call your vet now.');
    const dated = Date.parse(refloor) + DAY;
    expect(signalHomeLine(f, null, dated)?.ask).toBe(`on ${localCallDay(refloor)!.short}, the read said: call your vet now`);
    expect(incidentRedFlagSentenceAt(f, 'Nyx', 'server words', dated)).toContain(`On ${localCallDay(refloor)!.long}, the read`);
  });

  it('a card without the said-at instant (a cache from before the server half) is never dated', () => {
    const f = callNowOnly({ tierReadIso: undefined });
    const later = Date.parse(READ) + 10 * DAY;
    expect(signalHomeLine(f, null, later)?.ask).toBe('call your vet now');
    expect(bannerCopy(f, 'Nyx', later).text).toBe('Nyx: a vomit read says call your vet now.');
    expect(incidentRedFlagSentenceAt(f, 'Nyx', 'server words', later)).toBe('server words');
  });

  it('the screen sentence and the arrival speech are re-phrased at the clock', () => {
    expect(incidentRedFlagSentenceAt(callNowOnly(), 'Nyx', 'server words', firstDay)).toBe('server words');
    expect(incidentRedFlagSentenceAt(callNowOnly(), 'Nyx', 'server words', dayTwo)).toBe(
      `On ${D.long}, the read of Nyx's vomit said: call your vet now. This is a read of your logs, not a diagnosis.`,
    );
    expect(incidentRedFlagSentenceAt(callNow(), 'Nyx', 'server words', dayTwo)).toBe(
      `A photo you logged of Nyx's vomiting showed possible blood, on October 8. On ${D.long}, the read said: call your vet now. This is a read of your logs, not a diagnosis.`,
    );
    const arriving: CachedFinding[] = [{ finding: callNowOnly(), rank: 0, text: "The read of Nyx's vomit on October 8 says to call your vet now." }];
    expect(safetyArrivalSpoken('Nyx', arriving, firstDay)).toBe("The read of Nyx's vomit on October 8 says to call your vet now.");
    expect(safetyArrivalSpoken('Nyx', arriving, dayTwo)).toBe(
      `On ${D.long}, the read of Nyx's vomit said: call your vet now. This is a read of your logs, not a diagnosis.`,
    );
  });
});

describe('2a rank half: a call today said after a dated call now ranks the card, never its words (PR-30c, third pass)', () => {
  const READ = '2026-10-07T07:00:00.000Z';
  const later = Date.parse(READ) + 3 * 24 * 3600_000;
  const cached = (finding: IncidentRedFlagFinding): CachedFinding => ({ finding, rank: 0, text: '' });
  const dated = (over: Partial<IncidentRedFlagFinding> = {}) => card({ tier: 'call_now', tierIso: READ, tierReadIso: READ, ...over });
  const otherPetToday = card({ tier: 'call_today', tierIso: '2026-10-09T08:00:00.000Z' });

  it('an old call today rewritten later (089, a Hide) raises the rank and leaves the words alone', () => {
    const f = dated({ callTodaySaidIso: '2026-10-09T18:00:00.000Z' });
    expect(bannerCopy(f, 'Nyx', later).text).toBe(`Nyx: on ${localCallDay(READ)!.short}, a vomit read said call your vet now.`);
    expect(signalHomeLine(f, null, later)!.count).toBeNull();
    // Ranked as a live red flag, so list order decides against another pet's call today.
    expect(selectCrossPetSafetyFinding([{ pet: { id: 'a' }, findings: [cached(f)] }, { pet: { id: 'b' }, findings: [cached(otherPetToday)] }], later)?.pet.id).toBe('a');
  });

  it('a call today said before the call now leaves the dated card at 0.5', () => {
    const f = dated({ callTodaySaidIso: '2026-10-06T18:00:00.000Z' });
    expect(selectCrossPetSafetyFinding([{ pet: { id: 'a' }, findings: [cached(f)] }, { pet: { id: 'b' }, findings: [cached(otherPetToday)] }], later)?.pet.id).toBe('b');
  });
});
