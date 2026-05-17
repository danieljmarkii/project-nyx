// Hand-bumped on every meaningful bundle publish. Surfaced in the Profile
// tab's Debug card so we can confirm which build is actually running on a
// given phone (Expo Go can cache aggressively, and `expo.version` in app.json
// is the user-facing app version, not the bundle identity).
//
// Bump format: `vX.Y — short description`. Match CLAUDE.md's Version History.
export const BUILD_VERSION = 'v1.19 — remote→local sync';
