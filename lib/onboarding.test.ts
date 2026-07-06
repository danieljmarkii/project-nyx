import { decideOnboarding } from './onboarding';

// The §6 routing matrix (docs/nyx-onboarding-requirements.md). The three named
// cases from the PR-4 plan — legacy, resume/fresh, completed — plus the
// boundaries where the durable flag and the legacy pet-count rule interact.
describe('decideOnboarding', () => {
  const TS = '2026-07-06T12:00:00.000Z'; // a completed timestamp

  describe('completed-flag (the durable gate is authoritative)', () => {
    it('a set flag means complete, even with a pet', () => {
      expect(decideOnboarding({ onboardingCompletedAt: TS, petCount: 1 })).toEqual({
        onboarded: true,
        reason: 'completed-flag',
      });
    });

    // The archived-every-pet edge: the flag still wins, so a completed owner who
    // later archived all their pets is NOT bounced back into onboarding.
    it('a set flag means complete even with zero active pets', () => {
      expect(decideOnboarding({ onboardingCompletedAt: TS, petCount: 0 })).toEqual({
        onboarded: true,
        reason: 'completed-flag',
      });
    });
  });

  describe('legacy-has-pet (null flag, but predates the flag)', () => {
    // The dogfood accounts: they finished the old, pre-flag flow, so they have a
    // pet but a null completion timestamp. §6: treat complete, never re-onboard.
    it('null flag + a pet is treated complete (not re-onboarded)', () => {
      expect(decideOnboarding({ onboardingCompletedAt: null, petCount: 1 })).toEqual({
        onboarded: true,
        reason: 'legacy-has-pet',
      });
    });

    it('null flag + several pets is still legacy-complete', () => {
      expect(decideOnboarding({ onboardingCompletedAt: null, petCount: 3 })).toEqual({
        onboarded: true,
        reason: 'legacy-has-pet',
      });
    });
  });

  describe('needs-onboarding (fresh / mid-flow-quit account)', () => {
    // A brand-new account (created, no pet yet) OR a user who quit before creating
    // a pet: null flag + 0 pets ⇒ run onboarding. This is the case the old
    // "has >=1 pet" inference got right by accident but couldn't distinguish from
    // a mid-flow quit — the durable flag now makes it explicit.
    it('null flag + no pet needs onboarding', () => {
      expect(decideOnboarding({ onboardingCompletedAt: null, petCount: 0 })).toEqual({
        onboarded: false,
        reason: 'needs-onboarding',
      });
    });
  });

  describe('boundary / defensive', () => {
    // A malformed read must not fabricate a "complete" — an empty-string timestamp
    // is falsy, so it falls through to the pet-count rule rather than skipping
    // onboarding on garbage.
    it('an empty-string timestamp is not treated as completed', () => {
      expect(decideOnboarding({ onboardingCompletedAt: '', petCount: 0 })).toEqual({
        onboarded: false,
        reason: 'needs-onboarding',
      });
      expect(decideOnboarding({ onboardingCompletedAt: '', petCount: 1 })).toEqual({
        onboarded: true,
        reason: 'legacy-has-pet',
      });
    });
  });
});
