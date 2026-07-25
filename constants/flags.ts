// Build-time feature flags, kept in one discoverable place so a flag's default and
// its flip point are both obvious. This is the project's first flag (B-251).
//
// SOCIAL_AUTH_ENABLED — gates the Apple + Google sign-in buttons on the account
// screen. OFF in v1: the functional social path (Apple/Google OAuth + deep-link
// handling) ships in B-251 PR 11, which flips this on. While off, the buttons AND
// the "or" divider are HIDDEN — not shown-disabled — for a clean store submission
// (spec §8, S7). The layout is designed with them present so PR 11 is a flag flip,
// not a re-layout.
export const SOCIAL_AUTH_ENABLED = false;

// PASSWORD_RECOVERY_ENABLED — gates the "Forgot password?" entry point on the
// login screen (B-280 FR-1, spec §8). OFF until production SMTP is provisioned
// (B-152, submission-guide step 4): Supabase's built-in sender is explicitly not
// for production, so with it a real owner's reset email does not arrive — and a
// "check your inbox" state that lies is WORSE than the honest dead end it
// replaces, because it consumes the owner's trust before stranding them.
//
// While off the link is HIDDEN, not shown-disabled, per the same §8/S7 reasoning
// that governs the social block above.
//
// Deliberately a build-time constant and NOT an `app_config` allowlist flag: this
// is not an experiment being dogfooded, it is a submission-blocking capability
// with a one-way flip, and a server-flippable flag would imply a rollback posture
// we don't want on a recovery path. Flip it on in the same session that verifies
// the first real reset email lands end-to-end on device (PR 4).
export const PASSWORD_RECOVERY_ENABLED = false;
