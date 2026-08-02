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
// login screen (B-280 FR-1, spec §8) and the whole flow it fronts: the §5.1b
// failure-alert Reset action, the deep-link handler routing, and the FR-20
// evicted-device banner.
//
// ON since 2026-08-02 (B-280 PR 4). Enabled once its hard prerequisites were met:
// production SMTP is live and verified by a real send (B-152 — Resend on
// getculprit.app), and the redirect allowlist covers nyx:///reset-password
// (nyx://** landed via B-432). While it was off the link was HIDDEN, not
// shown-disabled: a "check your inbox" state that lies is WORSE than the honest
// dead end it replaced, so it stayed off until a real reset email could arrive.
//
// Deliberately a build-time constant and NOT an `app_config` allowlist flag: this
// is not an experiment being dogfooded, it is a submission-blocking capability
// with a one-way flip, and a server-flippable flag would imply a rollback posture
// we don't want on a recovery path.
export const PASSWORD_RECOVERY_ENABLED = true;
