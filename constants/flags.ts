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
