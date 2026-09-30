// The tier-word map (EN-3, CUL-1133; Engines v3 PR-27). What each row resolves to, why,
// and the words each tier is spoken in (docs/nyx-incident-tiers-requirements.md §2).

import {
  EN3_ENGINE_KEY,
  HELD_CALL_DISCLOSURE,
  heldCallDisclosureOf,
  INCIDENT_REC_LABEL,
  isCallRow,
  isTieredRow,
  RESCUED_CALL_DISCLOSURE,
  TIER_WORDS,
  tierDisplayOf,
  type TierDisplay,
} from './incidentTierWords';
import { INCIDENT_TIERS } from './incidentTier';
import { EN7_ENGINE_KEY } from './stoolForm';

const STAMP = [EN3_ENGINE_KEY];
const STATUSES = ['completed', 'uncertain', 'failed', 'capped', 'read_disabled', 'pending', 'a_status_from_the_future', null];

describe('which words stand', () => {
  it('an earlier-rule row keeps the shipped words, to the byte, whatever it holds', () => {
    // No tier and no EN-3 stamp: every row on every phone before the key is seeded.
    expect(tierDisplayOf({ status: 'completed', recommendation: 'worth_a_call' })).toBe('worth_a_call');
    expect(tierDisplayOf({ status: 'completed', recommendation: 'monitor' })).toBe('monitor');
    expect(tierDisplayOf({ status: 'uncertain', recommendation: 'not_enough_to_say' })).toBe('not_enough_to_say');
    // A row stamped under OTHER keys is still an earlier-rule read for EN-3.
    expect(tierDisplayOf({ status: 'completed', recommendation: 'worth_a_call', engine_flags: ['engines_v3_en0'] })).toBe('worth_a_call');
    expect(TIER_WORDS.worth_a_call.label).toBe('Worth a call');
    expect(TIER_WORDS.monitor.label).toBe('Keep an eye out');
    expect(INCIDENT_REC_LABEL).toEqual({
      worth_a_call: 'Worth a call',
      monitor: 'Keep an eye out',
      not_enough_to_say: 'Not enough to say yet',
    });
  });

  it('a new-rule row speaks its tier', () => {
    const row = { status: 'completed', engine_flags: STAMP };
    expect(tierDisplayOf({ ...row, recommendation: 'worth_a_call', tier: 'call_now' })).toBe('call_now');
    expect(tierDisplayOf({ ...row, recommendation: 'worth_a_call', tier: 'call_today' })).toBe('call_today');
    expect(tierDisplayOf({ ...row, recommendation: 'monitor', tier: 'logged' })).toBe('logged');
    expect(tierDisplayOf({ ...row, recommendation: 'not_enough_to_say', tier: 'not_enough_to_say' })).toBe('not_enough_to_say');
  });

  it('the stamp alone makes a row new-rule (a missed dual-write), and it reads from the verdict\'s rank', () => {
    expect(tierDisplayOf({ status: 'completed', recommendation: 'worth_a_call', engine_flags: STAMP })).toBe('call_today');
    expect(tierDisplayOf({ status: 'completed', recommendation: 'monitor', engine_flags: STAMP })).toBe('logged');
    // The phone's copy holds the stamps as JSON text; the same answer.
    expect(tierDisplayOf({ status: 'completed', recommendation: 'worth_a_call', engine_flags: JSON.stringify(STAMP) })).toBe('call_today');
    expect(isTieredRow({ engine_flags: 'not json' })).toBe(false);
  });

  it('the louder column wins: a flag-off write of a verdict never lowers a stored call tier', () => {
    // A rolled-back build writes `monitor` over a row the key had tiered call now.
    expect(tierDisplayOf({ status: 'completed', recommendation: 'monitor', tier: 'call_now', engine_flags: STAMP })).toBe('call_now');
    expect(tierDisplayOf({ status: 'completed', recommendation: 'monitor', tier: 'call_today' })).toBe('call_today');
    // And a verdict louder than a quiet tier beside it (a missed tier write) is the call.
    expect(tierDisplayOf({ status: 'completed', recommendation: 'worth_a_call', tier: 'logged' })).toBe('call_today');
  });

  it('status ahead of tier: a call stands at every status, a quiet tier only on a finished read', () => {
    for (const status of STATUSES) {
      expect(tierDisplayOf({ status, recommendation: 'worth_a_call', tier: 'call_now' })).toBe('call_now');
      expect(tierDisplayOf({ status, recommendation: 'worth_a_call', tier: 'call_today' })).toBe('call_today');
      const quiet = tierDisplayOf({ status, recommendation: 'monitor', tier: 'logged' });
      if (status === 'completed' || status === 'uncertain') expect(quiet).toBe('logged');
      else expect(quiet).toBeNull();
    }
  });

  it('between the two quiet tiers the less calm wins, so an unread photo never stands as looked-at', () => {
    expect(tierDisplayOf({ status: 'completed', recommendation: 'monitor', tier: 'not_enough_to_say' })).toBe('not_enough_to_say');
    expect(tierDisplayOf({ status: 'completed', recommendation: 'not_enough_to_say', tier: 'logged' })).toBe('not_enough_to_say');
  });

  it('a value this build does not know is spoken as "Worth a call", and a stored call now is never softened by one', () => {
    expect(tierDisplayOf({ status: 'completed', recommendation: 'monitor', tier: 'call_within_the_hour' })).toBe('worth_a_call');
    expect(tierDisplayOf({ status: 'completed', recommendation: 'call_soon', tier: 'call_today' })).toBe('worth_a_call');
    expect(tierDisplayOf({ status: 'completed', recommendation: 'call_soon', tier: 'call_now' })).toBe('call_now');
    for (const v of ['toString', 'constructor', '__proto__']) {
      expect(tierDisplayOf({ status: 'completed', recommendation: v })).toBe('worth_a_call');
      expect(tierDisplayOf({ status: 'completed', recommendation: 'monitor', tier: v })).toBe('worth_a_call');
    }
  });

  it('no verdict at all is no words, and never null for a call', () => {
    expect(tierDisplayOf(null)).toBeNull();
    expect(tierDisplayOf({ status: 'completed', recommendation: null })).toBeNull();
    for (const tier of INCIDENT_TIERS) {
      for (const recommendation of ['worth_a_call', 'monitor', 'not_enough_to_say', null]) {
        for (const status of STATUSES) {
          const row = { status, recommendation, tier, engine_flags: STAMP };
          if (isCallRow(row)) expect(tierDisplayOf(row)).not.toBeNull();
        }
      }
    }
  });

  it('a call is drawn as a call on every combination (the rose is never grey)', () => {
    for (const tier of [...INCIDENT_TIERS, null, 'zz']) {
      for (const recommendation of ['worth_a_call', 'monitor', 'not_enough_to_say', null, 'zz']) {
        for (const status of STATUSES) {
          for (const engine_flags of [STAMP, null]) {
            const row = { status, recommendation, tier, engine_flags };
            const display = tierDisplayOf(row);
            if (isCallRow(row)) expect(TIER_WORDS[display as TierDisplay].call).toBe(true);
            else if (display) expect(TIER_WORDS[display].call).toBe(false);
          }
        }
      }
    }
  });

  it('EN-3 and EN-7 share one key, named once', () => {
    expect(EN3_ENGINE_KEY).toBe(EN7_ENGINE_KEY);
  });
});

describe('the words (spec §2)', () => {
  it('the lowest tier is "Keep an eye out", and no tier carries a wellness word (Pattern 1)', () => {
    expect(TIER_WORDS.logged.label).toBe('Keep an eye out');
    const WELLNESS = /\b(fine|normal|healthy|nothing to worry|no concern|reassur|all clear|okay|ok)\b/i;
    for (const words of Object.values(TIER_WORDS)) {
      for (const text of [words.label, words.short, words.readAs, words.action ?? '']) expect(text).not.toMatch(WELLNESS);
    }
  });

  it('each call names the service, and "now" is on every call-now word', () => {
    expect(TIER_WORDS.call_now.label).toBe('Call your vet now');
    expect(TIER_WORDS.call_today.label).toBe('Call your vet today');
    for (const text of [TIER_WORDS.call_now.label, TIER_WORDS.call_now.short, TIER_WORDS.call_now.readAs, TIER_WORDS.call_now.action]) {
      expect(text).toMatch(/now/i);
    }
    expect(TIER_WORDS.call_now.action).toMatch(/emergency clinic/);
    expect(TIER_WORDS.call_today.action).toMatch(/first thing tomorrow/);
  });

  it('the two calls share the rose and differ by fill; colour never carries a tier alone', () => {
    expect(TIER_WORDS.call_now.tone).toBe('call_filled');
    expect(TIER_WORDS.call_today.tone).toBe('call_outline');
    expect(TIER_WORDS.call_now.label).not.toBe(TIER_WORDS.call_today.label);
  });

  it('the month counts the two rules apart', () => {
    expect(TIER_WORDS.call_now.rule).toBe('tiered');
    expect(TIER_WORDS.call_today.rule).toBe('tiered');
    expect(TIER_WORDS.worth_a_call.rule).toBe('earlier');
  });

  it('no string carries an exclamation mark (nyx-voice)', () => {
    for (const words of Object.values(TIER_WORDS)) {
      for (const text of Object.values(words)) if (typeof text === 'string') expect(text).not.toContain('!');
    }
    for (const text of [HELD_CALL_DISCLOSURE, RESCUED_CALL_DISCLOSURE]) expect(text).not.toContain('!');
  });
});

describe('CUL-819 (a): a call left standing by a read that did not finish', () => {
  const call = { recommendation: 'worth_a_call', tier: 'call_today', engine_flags: STAMP };

  it('an error on a held call discloses the earlier read; a rescue discloses the record', () => {
    expect(heldCallDisclosureOf({ ...call, status: 'completed', error: 'timeout' })).toBe(HELD_CALL_DISCLOSURE);
    expect(heldCallDisclosureOf({ ...call, status: 'failed', error: 'timeout' })).toBe(RESCUED_CALL_DISCLOSURE);
  });

  it('nothing to disclose: a clean call, a run still going, a quiet row, an earlier-rule row', () => {
    expect(heldCallDisclosureOf({ ...call, status: 'completed', error: null })).toBeNull();
    expect(heldCallDisclosureOf({ ...call, status: 'pending', error: 'timeout' })).toBeNull();
    expect(heldCallDisclosureOf({ recommendation: 'monitor', tier: 'logged', engine_flags: STAMP, status: 'failed', error: 'x' })).toBeNull();
    expect(heldCallDisclosureOf({ recommendation: 'worth_a_call', status: 'completed', error: 'timeout' })).toBeNull();
    expect(heldCallDisclosureOf(null)).toBeNull();
  });
});
