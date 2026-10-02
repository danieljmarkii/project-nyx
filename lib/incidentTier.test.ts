import {
  INCIDENT_TIERS,
  TIER_RANK,
  effectiveTierRank,
  isIncidentTier,
  tierForVerdict,
  tierRank,
  verdictForTier,
  verdictRank,
} from './incidentTier';
import { QUIET_VERDICTS } from './incidentVerdict';

// The tier order (EN-3, CUL-1133; Engines v3 PR-26). docs/nyx-incident-tiers-requirements.md §1.

describe('the stored values', () => {
  it('are exactly 079 CHECK values, with no stored "pattern" (K2)', () => {
    expect([...INCIDENT_TIERS]).toEqual(['call_now', 'call_today', 'logged', 'not_enough_to_say']);
    expect(isIncidentTier('pattern')).toBe(false);
    expect(isIncidentTier(null)).toBe(false);
  });
});

describe('the order', () => {
  it('ranks call_now above call_today above the two quiet tiers, which share a rank', () => {
    expect(tierRank('call_now')).toBeGreaterThan(tierRank('call_today'));
    expect(tierRank('call_today')).toBeGreaterThan(tierRank('logged'));
    expect(tierRank('logged')).toBe(tierRank('not_enough_to_say'));
  });

  it('reads no tier as quiet, and a tier this build does not know as call now', () => {
    expect(tierRank(null)).toBe(TIER_RANK.quiet);
    expect(tierRank(undefined)).toBe(TIER_RANK.quiet);
    expect(tierRank('call_in_an_hour')).toBe(TIER_RANK.call_now);
  });

  it('ranks the legacy verdicts: quiet list quiet, worth_a_call as call today, unknown as call now', () => {
    for (const v of QUIET_VERDICTS) expect(verdictRank(v)).toBe(TIER_RANK.quiet);
    expect(verdictRank('worth_a_call')).toBe(TIER_RANK.call_today);
    expect(verdictRank('call_now')).toBe(TIER_RANK.call_now);
    expect(verdictRank(null)).toBe(TIER_RANK.quiet);
  });
});

describe('effectiveTierRank, the louder of the two columns', () => {
  it('never reads calmer than the legacy verdict (a missed dual-write)', () => {
    expect(effectiveTierRank({ tier: null, recommendation: 'worth_a_call' })).toBe(TIER_RANK.call_today);
    expect(effectiveTierRank({ tier: 'logged', recommendation: 'worth_a_call' })).toBe(TIER_RANK.call_today);
  });

  it('keeps a stored call when the verdict beside it was lowered (a client edit, a rollback)', () => {
    expect(effectiveTierRank({ tier: 'call_now', recommendation: 'monitor' })).toBe(TIER_RANK.call_now);
    expect(effectiveTierRank({ tier: 'call_today', recommendation: 'monitor' })).toBe(TIER_RANK.call_today);
  });

  it('is quiet only when both columns are', () => {
    expect(effectiveTierRank({ tier: 'logged', recommendation: 'monitor' })).toBe(TIER_RANK.quiet);
    expect(effectiveTierRank({})).toBe(TIER_RANK.quiet);
  });
});

describe('the writer map', () => {
  it('maps today three verdicts to their tiers (spec §1)', () => {
    expect(tierForVerdict('worth_a_call')).toBe('call_today');
    expect(tierForVerdict('monitor')).toBe('logged');
    expect(tierForVerdict('not_enough_to_say')).toBe('not_enough_to_say');
  });

  it('writes a legacy value beside every tier that installed builds read at the same rank', () => {
    for (const tier of INCIDENT_TIERS) {
      const verdict = verdictForTier(tier);
      // Never calmer, and a call is never written as a quiet verdict.
      expect(verdictRank(verdict)).toBe(Math.min(tierRank(tier), TIER_RANK.call_today));
    }
    expect(verdictForTier('call_now')).toBe('worth_a_call');
    expect(verdictForTier('logged')).toBe('monitor');
  });

  it('round-trips: the verdict written beside a mapped tier is the verdict it came from', () => {
    for (const v of ['worth_a_call', 'monitor', 'not_enough_to_say'] as const) {
      expect(verdictForTier(tierForVerdict(v))).toBe(v);
    }
  });
});
