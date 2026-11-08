// CUL-2593 (PM ruling option (1), 2026-11-06): an all-refused consecutive-low card asks for a call
// today unless the pet is a dog, on every client surface that carries the card's ask: the
// evidence sentence, Home's ask and the strip's ask. `'other'` and a finding with no species take
// the louder ask. Home's ask is held to the server's own sentence (one source per fact), and the
// strip's verb to Home's, so no surface can out-escalate or under-ask its own card.

jest.mock('./db', () => ({ getDb: jest.fn() }));
jest.mock('./feedingArrangements', () => ({ getActiveArrangementsForPet: jest.fn() }));
jest.mock('./supabase', () => ({ supabase: {} }));

import { bannerCopy, evidenceText, intakeAllRefusedCallsToday, STRIP_ASKS, stripAskLine, type BannerSafetyFinding } from './signalCopy';
import { signalHomeAsk } from './signalHomeLine';
import { templateIntakeDecline } from '../supabase/functions/generate-signal/phrasing';
import type { IntakeDeclineFinding as ServerIntakeDeclineFinding } from '../supabase/functions/generate-signal/detection';
import type { IntakeDeclineFinding } from './signal';

const CALL = 'worth a call to your vet today';
const SOFT = 'worth keeping an eye on, and a word with your vet if it carries on';

function card(extra: Partial<IntakeDeclineFinding> = {}): IntakeDeclineFinding {
  return {
    type: 'intake_decline',
    priorityClass: 'safety',
    trigger: 'consecutive_low',
    species: 'cat',
    daysBelowBaseline: 1,
    refusedFoodLabel: null,
    ratedMealsConsidered: 6,
    allRefused: true,
    ...extra,
  };
}

/** The same card as the server holds it (the extra fields the client does not render). */
function serverOf(f: IntakeDeclineFinding): ServerIntakeDeclineFinding {
  return { ...f, baselineScore: 4, recentScore: 0 } as unknown as ServerIntakeDeclineFinding;
}

function noSpecies(): IntakeDeclineFinding {
  const { species: _drop, ...rest } = card();
  return rest as IntakeDeclineFinding;
}

const LOUD: [string, IntakeDeclineFinding][] = [
  ['cat', card()],
  ['other', card({ species: 'other', daysBelowBaseline: 2 })],
  ['missing species', noSpecies()],
];

describe("a full day of refusal asks for a call today, except for a dog (CUL-2593)", () => {
  it.each(LOUD)('%s: every surface asks for the call', (_name, f) => {
    expect(intakeAllRefusedCallsToday(f)).toBe(true);
    // CUL-2667 (D3, D4): a non-dog all-refused card is the floor, so Home says the floor's words.
    expect(signalHomeAsk(f)).toBe('call your vet today');
    expect(stripAskLine(f)).toBe(STRIP_ASKS.call);
    const evidence = evidenceText(f, 'Miso');
    expect(evidence).toMatch(/^Miso refused every meal you rated .*, so it's worth a call to your vet today\.$/);
    expect(evidence).not.toMatch(/carries on/);
    // The server sentence still says the earlier call today until row 3 (CUL-2668) moves it.
    expect(templateIntakeDecline(serverOf(f), 'Miso')).toContain(CALL);
  });

  it('a dog keeps "if it carries on" on every surface', () => {
    const f = card({ species: 'dog', daysBelowBaseline: 2 });
    expect(intakeAllRefusedCallsToday(f)).toBe(false);
    expect(signalHomeAsk(f)).toBe(SOFT);
    expect(stripAskLine(f)).toBe(STRIP_ASKS.check);
    expect(evidenceText(f, 'Rex')).toMatch(/worth keeping an eye on — and a word with your vet if it carries on\.$/);
    expect(templateIntakeDecline(serverOf(f), 'Rex')).toContain(signalHomeAsk(f) ?? '<none>');
  });

  it("only the all-refused card moves: a cat's plain dip, a legacy cache and another trigger keep their asks", () => {
    for (const f of [card({ allRefused: false }), card({ allRefused: undefined }), card({ trigger: 'refused_normal_food' })]) {
      expect(intakeAllRefusedCallsToday(f)).toBe(false);
      expect(signalHomeAsk(f)).toBe(SOFT);
      expect(stripAskLine(f)).toBe(STRIP_ASKS.check);
    }
  });

  it('the banner firms up to the floor for every species but a dog (CUL-2667, D4)', () => {
    expect(bannerCopy(card() as BannerSafetyFinding, 'Miso').text).toBe('Miso refused every meal you rated today — call your vet today.');
    expect(bannerCopy(card({ species: 'dog' }) as BannerSafetyFinding, 'Miso').text).toBe('Miso refused every meal you rated today — worth a look.');
  });
});
