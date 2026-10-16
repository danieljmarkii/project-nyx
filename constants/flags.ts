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

// UNHANDLED_REJECTION_SCREEN_ENABLED — whether a promise rejection nobody handled lands on
// the crash screen (CUL-1841). The other two crash doors (a render error, a fatal global
// error) are always on: before this they aborted the app.
//
// OFF until the PM rules. A rejection in a release build has always been silent, and about
// seventy fire-and-forget calls in the app (`void flushDraft()` on the vet visit, the
// Promise.all reads behind it) would each, on a single failure, replace the whole tree with
// the crash screen and drop whatever the owner had half typed. Off keeps today's behaviour
// exactly: the tracker is not installed, so React Native's own development warning stays
// and a release build stays silent. The mechanism is built and tested with this on.
export const UNHANDLED_REJECTION_SCREEN_ENABLED = false;
