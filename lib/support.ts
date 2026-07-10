// Pure primitives for the "You"/settings support paths (B-283, spec §D6/§D8).
// No expo-constants, no Platform, no I/O here — the caller reads the live app
// version/build (expo-constants, B-231) and platform, and passes them in. That
// keeps these two helpers pure and unit-testable, and lets both "Contact support"
// (§D6) and "Share feedback" (§D8) compose their mailto from one place.

// Format the app version + native build into the human string shown at the foot
// of the You screen and appended to every support/feedback mail: "1.0.0 (build 1)".
// Robust to a missing read (spec §4.5 — the version foot is never blank, and a
// bug report is never version-less): an absent version reads "unknown", and an
// absent build drops the "(build N)" suffix rather than printing "(build )".
export function formatAppVersion(
  version: string | null | undefined,
  build: string | number | null | undefined,
): string {
  const v = (version ?? '').trim() || 'unknown';
  const rawBuild = build == null ? '' : String(build).trim();
  return rawBuild ? `${v} (build ${rawBuild})` : v;
}

export interface SupportMailContext {
  version: string | null | undefined;
  build: string | number | null | undefined;
  platform: string | null | undefined;
  // Optional overrides so the §D8 feedback composer can reuse this helper:
  // a "[Feedback]"-tagged subject and the owner's typed note above the footer.
  subject?: string;
  body?: string;
}

const DEFAULT_SUBJECT = 'Culprit support';

// Compose a percent-encoded `mailto:` to the support inbox, prefilled with the
// app version + platform so triage never starts with "what version are you on?"
// (spec §D6). The diagnostic footer sits below a divider with room to type above
// it; any owner-typed note (feedback, §D8) is placed above the footer. subject
// and body ARE percent-encoded, so newlines and brackets (e.g. a "[Feedback]"
// subject) survive intact across mail clients.
//
// Contract: `email` must be a bare, pre-validated addr-spec (our SUPPORT_EMAIL
// constant). It is placed in the URI unencoded to keep the canonical
// `mailto:a@b.c` form — do NOT pass a display-name form ("Name <a@b.c>") or an
// address containing URI-structural characters (`?`, `#`, `&`, spaces).
export function buildSupportMailto(email: string, ctx: SupportMailContext): string {
  const subject = ctx.subject?.trim() || DEFAULT_SUBJECT;

  const footer = [
    '—',
    `App version: ${formatAppVersion(ctx.version, ctx.build)}`,
    `Platform: ${(ctx.platform ?? '').trim() || 'unknown'}`,
  ].join('\n');

  // Leading blank lines give the owner somewhere to write above the footer when
  // there is no pre-filled note; a feedback note is placed above it directly.
  const note = ctx.body?.trim() ? `${ctx.body.trim()}\n\n` : '\n\n';
  const body = `${note}${footer}`;

  const query = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return `mailto:${email}?${query}`;
}
