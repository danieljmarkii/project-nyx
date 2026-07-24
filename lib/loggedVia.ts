// Capture-surface provenance (B-289 / migration 038). Which SURFACE performed a
// write — orthogonal to events.source, which describes how the record's CONTENT
// originated (see the migration header for the two-axes argument). Mirrors the
// server `logged_via` enum exactly; any new value lands in the migration first
// (ALTER TYPE), then here.
export type LoggedVia =
  | 'app'
  | 'notification'
  | 'reconciled'
  | 'widget'
  | 'intent'
  | 'watch'
  | 'device';

// The only provenance values an App-Group inbox record may carry (B-290): the
// widget itself, or an App Intent riding outside it (Siri / Shortcuts / NFC —
// the B-291 free riders share the inbox). Everything else is either the app's
// own value ('app' — an inbox record claiming it would be lying about its
// surface) or a surface with its own write path ('notification'/'reconciled' =
// B-288; 'watch'/'device' = reserved). Narrowing here means a compromised or
// buggy extension cannot forge in-app provenance through the inbox.
export type InboxLoggedVia = 'widget' | 'intent';

export function isInboxLoggedVia(value: unknown): value is InboxLoggedVia {
  return value === 'widget' || value === 'intent';
}
