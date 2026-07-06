// The onboarding completion gate (B-251 PR 4 — docs/nyx-onboarding-requirements.md §6).
//
// Replaces the fragile "user has >=1 pet" inference (the old hooks/usePet.ts
// logic, which silently treated a mid-flow quit as done) with a durable read of
// user_profiles.onboarding_completed_at (migration 027), plus the §6 legacy rule
// so accounts that predate the durable flag are never re-onboarded.
//
// Pure + dependency-free on purpose: this is the one load-bearing decision in the
// shell, so it lives behind a small unit-tested seam. usePet owns the network
// reads and the cold-start retry/error plumbing; this owns ONLY the decision, so
// the routing matrix (§6) can be exercised without a device or a Supabase mock.

export interface OnboardingGateInput {
  // user_profiles.onboarding_completed_at — an ISO timestamp written once, when
  // the "All set" screen is reached (PR 10), or null if onboarding never
  // completed. A TIMESTAMPTZ arrives as an ISO string over the wire.
  onboardingCompletedAt: string | null;
  // Count of the account's ACTIVE pets (archived excluded — matches usePet's
  // `is_active = true` filter, so an owner who archived a pet still counts by
  // whatever remains active).
  petCount: number;
}

export type OnboardingReason =
  // The durable flag is set — the authoritative "done" signal (§6). Wins outright,
  // even with zero active pets (e.g. every pet later archived): a completed owner
  // is never re-onboarded.
  | 'completed-flag'
  // Null flag but the account already has a pet: a legacy account that finished
  // the old, pre-flag flow. Treat as complete — re-onboarding them would be the
  // exact bug D12 set out to kill (§6 legacy rule).
  | 'legacy-has-pet'
  // Null flag AND no pet — a genuinely new / petless account that still needs to
  // run onboarding.
  | 'needs-onboarding';

export interface OnboardingDecision {
  onboarded: boolean;
  reason: OnboardingReason;
}

// The §6 routing rule, in strict priority order:
//   1. onboarding_completed_at set           → complete   (flag is authoritative)
//   2. flag null AND >=1 active pet (legacy) → complete   (never re-onboard)
//   3. flag null AND 0 pets                  → needs onboarding
//
// A truthy check on the timestamp treats null / undefined / '' all as "not
// completed"; a valid ISO timestamp is truthy. (The column is timestamp-or-null,
// so '' should never occur — the truthy check is just belt-and-suspenders against
// a malformed read producing a false "complete".)
export function decideOnboarding(input: OnboardingGateInput): OnboardingDecision {
  if (input.onboardingCompletedAt) {
    return { onboarded: true, reason: 'completed-flag' };
  }
  if (input.petCount > 0) {
    return { onboarded: true, reason: 'legacy-has-pet' };
  }
  return { onboarded: false, reason: 'needs-onboarding' };
}
