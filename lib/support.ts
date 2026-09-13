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

// The JS-bundle half of "which build is this?" (CUL-690). `formatAppVersion` above
// describes the installed binary and does not move on an `eas update`; this names
// the JavaScript actually running.
//
// Three states, and the third is the point. An `isEmbeddedLaunch` device is running
// the bundle baked into the binary and says so. A device that has taken an update
// reports its id, prefixed by the channel when one is configured, because "which
// channel" is the first thing triage asks after "which bundle". Anything else —
// Expo Go, a dev client, a read that threw — is UNKNOWN, never "embedded": those two
// are only the same answer if you assume the thing you could not read, and a
// diagnostic that guesses is worse than one that abstains.
//
// `abbreviate` is for the version foot, where a full UUID would be a line of noise
// on a screen an owner reads: the leading segment is enough to tell two bundles
// apart by eye, which is the whole on-device question. The mailto carries the id in
// full, because triage matches it against an EAS update rather than eyeballing it.
export function formatJsBundle(
  updateId: string | null | undefined,
  isEmbedded: boolean,
  channel: string | null | undefined,
  opts: { abbreviate?: boolean } = {},
): string {
  if (isEmbedded) return 'embedded';
  const id = (updateId ?? '').trim();
  if (!id) return 'unknown';
  const shown = opts.abbreviate ? id.split('-')[0] : id;
  const ch = (channel ?? '').trim();
  return ch ? `${ch} \u00b7 ${shown}` : shown;
}

export interface SupportMailContext {
  version: string | null | undefined;
  build: string | number | null | undefined;
  platform: string | null | undefined;
  // The JS bundle, already formatted by the caller (CUL-690) — this module stays
  // free of expo-updates for the same reason it stays free of expo-constants.
  // Optional so an existing caller keeps composing a valid mail; an absent one
  // degrades to "unknown" in the footer rather than dropping the line, because a
  // MISSING diagnostic line and a line reading "unknown" are different facts to
  // whoever is reading the report.
  jsBundle?: string | null | undefined;
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
    `JS bundle: ${(ctx.jsBundle ?? '').trim() || 'unknown'}`,
  ].join('\n');

  // Leading blank lines give the owner somewhere to write above the footer when
  // there is no pre-filled note; a feedback note is placed above it directly.
  const note = ctx.body?.trim() ? `${ctx.body.trim()}\n\n` : '\n\n';
  const body = `${note}${footer}`;

  const query = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return `mailto:${email}?${query}`;
}

// The subject for the §D8 "Share feedback" mail: a leading `[Feedback]` tag (the
// filter key that routes product input to the same one inbox as support, via the
// Cloudflare `[Feedback]` rule) plus the chosen category so triage can sort at a
// glance. Category is optional (the composer's ChipGroup allows no selection), so
// an absent category degrades to the brand word — the tag is never left bare
// ("[Feedback] " reads as an empty subject). Pure so it's unit-tested with the
// mailto helper rather than as untested logic inside the screen.
export function buildFeedbackSubject(category: string | null | undefined): string {
  const c = (category ?? '').trim();
  return c ? `[Feedback] ${c}` : '[Feedback] Culprit';
}
