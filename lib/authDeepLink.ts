// The shared shape of every auth deep link the app can receive (B-432/B-483,
// and B-280's recovery link).
//
// PURE BY CONTRACT: no I/O, no supabase-js import, no expo module — same rule as
// `lib/passwordRecovery.ts`, which this module was extracted from when signup
// confirmation became a second consumer of the identical link shape.
//
// WHY ONE PARSER. Supabase hands every emailed auth link back to us through the
// same redirect mechanism, so a confirmation link and a recovery link differ only
// in their PATH — the query/fragment shapes (`?code=`, `?error=…`,
// `#error_code=…`) are byte-identical. A second hand-rolled URL parser would be
// two definitions of "what does a hostile deep link look like" that drift
// independently, which is the failure this project has already paid for once
// (the three-way off-diet predicate, CLAUDE.md). So the parsing lives here once
// and each flow supplies only its own route.

// The app's custom URL scheme (`app.json` → `scheme`). Deliberately a named
// constant rather than an inlined string: it is the RETIRED brand name, and
// B-278 will flip it to `culprit`. When that happens this constant, the Supabase
// redirect allowlist and the widget's deep links must move together — so the code
// half has exactly one place to change. `lib/passwordRecovery.ts` re-exports it
// rather than declaring a second copy.
export const APP_SCHEME = 'nyx';

// The route the signup-confirmation link lands on. Matches the expo-router file
// path `app/(auth)/confirm.tsx` — the deep link works because that file exists.
export const CONFIRM_PATH = 'confirm';

// The route the password-recovery link lands on (B-280). Matches the expo-router
// file path `app/(auth)/reset-password.tsx`. Kept here beside CONFIRM_PATH so the
// cold-start "no session ⇒ Landing" suppression (below) and `lib/passwordRecovery`
// read ONE definition of the recovery route.
export const RECOVERY_PATH = 'reset-password';

// Every path that is an AUTH link rather than an ordinary in-app deep link (the
// widget's `nyx:///history?pet=…`, `nyx:///log?…`).
//
// This list is read by the root layout's cold-start routing (`app/_layout.tsx`):
// a cold start from an auth link has no session BY DEFINITION — establishing one
// is the entire point of the link — so the "no session ⇒ show the Landing" bounce
// would erase the route expo-router just opened, milliseconds after opening it.
//
// ONLY ADD A PATH ONCE ITS SCREEN FILE EXISTS. Suppressing the Landing bounce for
// a route that isn't registered would strand the owner on expo-router's not-found
// screen, which is strictly worse than the bounce. `reset-password` is added here
// in the same commit that adds `app/(auth)/reset-password.tsx` (B-280 PR 2).
export const AUTH_DEEP_LINK_PATHS: readonly string[] = [CONFIRM_PATH, RECOVERY_PATH];

/** The `emailRedirectTo` / `redirectTo` value for an auth route (e.g. `nyx:///confirm`). */
export function authDeepLinkUrl(path: string): string {
  return `${APP_SCHEME}:///${path}`;
}

export type AuthDeepLink =
  // Not an auth link at all — a widget deep link, a future OAuth return, anything
  // else. The handler must ignore it, NOT treat it as a broken auth attempt.
  | { kind: 'unrelated' }
  // The PKCE success shape: an opaque single-use code in a QUERY parameter.
  | { kind: 'valid'; code: string }
  // Supabase's error shape, e.g. `?error=access_denied&error_code=otp_expired`.
  // Also arrives in the URL FRAGMENT on some GoTrue paths, so both are parsed.
  | { kind: 'error'; errorCode: string | null }
  // The right route, but carrying neither a usable code nor a nameable error: a
  // truncated/mangled query, or an implicit-flow token shape we deliberately
  // refuse (below). Renders a designed state — never a crash.
  | { kind: 'malformed' };

// Split a URL into its path segments and its parameter map, tolerating anything.
// Hand-rolled rather than `new URL()` because RN's URL polyfill has historically
// shipped without working `searchParams`, and a parser that behaves differently
// on device than in jest is worse than no parser at all.
export function dissectUrl(url: string): { segments: string[]; params: Map<string, string> } {
  const params = new Map<string, string>();
  // Everything before the first `?` or `#` is the path portion.
  const cut = url.search(/[?#]/);
  const pathPart = cut === -1 ? url : url.slice(0, cut);

  // Split the remainder on the FIRST `?` and the FIRST `#` only — never on every
  // occurrence. A delimiter inside a parameter VALUE belongs to that value, and
  // treating it as a new boundary lets a nested URL smuggle a top-level param past
  // this parser: `?redirect_to=nyx:///confirm?code=evil` would surface `code=evil`
  // as though the outer link carried it. Real GoTrue links percent-encode their
  // values so they never produce this, and the exchange itself still gates whether
  // any code is honoured — but this is the parser that decides what a hostile deep
  // link even looks like, so it must not be the weak link. Per RFC 3986 the
  // fragment is last, so everything after the first `#` is fragment even if it
  // contains a `?`.
  const qIdx = url.indexOf('?');
  const hIdx = url.indexOf('#');
  let query = '';
  let fragment = '';
  if (hIdx === -1) {
    query = qIdx === -1 ? '' : url.slice(qIdx + 1);
  } else {
    fragment = url.slice(hIdx + 1);
    if (qIdx !== -1 && qIdx < hIdx) query = url.slice(qIdx + 1, hIdx);
  }

  // Strip the scheme (`nyx:`, `exp:`, `https:`) so the remainder is host/path.
  // The host-vs-path distinction is genuinely ambiguous for a custom scheme
  // (`nyx://confirm` — is that a host or a path?), so we don't try to draw it:
  // only the LAST non-empty segment is used for route matching.
  const segments = pathPart
    .replace(/^[a-z][a-z0-9+.-]*:/i, '')
    .split('/')
    .filter((s) => s.length > 0);

  // Parse the query AND the fragment into one map. GoTrue puts errors in the query
  // on the PKCE path but in the fragment on others, and a parser that only read one
  // would render "that link no longer works" as a blank screen instead.
  for (const chunk of [query, fragment]) {
    for (const pair of chunk.split('&')) {
      if (!pair) continue;
      const eq = pair.indexOf('=');
      const rawKey = eq === -1 ? pair : pair.slice(0, eq);
      const rawValue = eq === -1 ? '' : pair.slice(eq + 1);
      const key = safeDecode(rawKey);
      // First value wins, so a query param is never overwritten by a fragment one
      // carrying the same name.
      if (key && !params.has(key)) params.set(key, safeDecode(rawValue));
    }
  }
  return { segments, params };
}

// `decodeURIComponent` throws on a lone `%` — which a truncated link absolutely
// can contain. Never let a mangled URL become a crash.
function safeDecode(value: string): string {
  const plussed = value.replace(/\+/g, ' ');
  try {
    return decodeURIComponent(plussed);
  } catch {
    return plussed;
  }
}

/**
 * Classify an incoming deep link against ONE auth route, WITHOUT touching auth
 * state.
 *
 * Note what this can and cannot tell you: a `valid` result means the URL carries a
 * well-formed code, NOT that the code still works. Expiry, prior use and a
 * resend-overwritten verifier are all indistinguishable from here — they surface
 * only from the exchange.
 */
export function parseAuthDeepLink(
  url: string | null | undefined,
  path: string,
): AuthDeepLink {
  if (!url || typeof url !== 'string') return { kind: 'unrelated' };

  const { segments, params } = dissectUrl(url);
  // Case-insensitive on the ROUTE only (never on the code, which is opaque and
  // case-significant). Our own links are always lowercase, but a mail client that
  // uppercased a segment on tap-through would otherwise make a real link vanish
  // into `unrelated` — silently showing nothing, rather than degrading to a
  // designed state with a forward action.
  const last = segments[segments.length - 1]?.toLowerCase();
  if (last !== path.toLowerCase()) return { kind: 'unrelated' };

  // Error BEFORE code, so a URL carrying both is never exchanged. Fail-closed is
  // free here and the alternative silently burns a code on a known-bad link.
  const errorCode = params.get('error_code') ?? params.get('error') ?? null;
  const hasErrorShape = errorCode !== null || params.has('error_description');
  if (hasErrorShape) return { kind: 'error', errorCode: errorCode || null };

  const code = params.get('code');
  if (code) return { kind: 'valid', code };

  // An implicit-flow shape (`#access_token=…&refresh_token=…`) is refused rather
  // than adopted. Accepting it would re-introduce exactly what choosing PKCE
  // bought — long-lived tokens transiting a URL — on the flows whose entire job is
  // establishing trust.
  return { kind: 'malformed' };
}

/**
 * Is this URL an auth link the app handles on a screen of its own?
 *
 * Used by the root layout to suppress the no-session Landing bounce on a cold
 * start FROM such a link (see `AUTH_DEEP_LINK_PATHS`). Route-shape only — it
 * deliberately does not care whether the link carries a code, an error or
 * nothing: all three render a designed state on that screen, and all three are
 * ruined equally by being routed away from it.
 */
export function isAuthDeepLink(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  const { segments } = dissectUrl(url);
  const last = segments[segments.length - 1]?.toLowerCase();
  if (!last) return false;
  return AUTH_DEEP_LINK_PATHS.some((p) => p.toLowerCase() === last);
}
