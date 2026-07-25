// Pure helpers for the password-recovery flow (B-280, spec §6.1).
//
// PURE BY CONTRACT: no I/O, no supabase-js import, no expo module. Every rule an
// owner's recovery attempt hinges on — is this URL a recovery link? did the
// exchange fail in a way we can name? may they resend yet? — is a plain function
// over plain data, so the states in the §10 QA matrix are reachable in a unit test
// instead of only on a device with a real email in hand. The AsyncStorage-backed
// request marker lives next door in `lib/recoveryMarker.ts` for the same reason.
//
// Two classifications live here, and the spec (FR-4) is emphatic that they are
// SEPARATE because they are discovered at different moments:
//   (a) the URL shape      — knowable before touching auth state (§6.4 step 1)
//   (b) the exchange result — knowable only from the exchange response, because
//                             under PKCE the success shape is an opaque `?code=`
// Conflating them is what made a failed exchange unreachable in the v1 design.

import { AuthErrorLike, isOffline } from './authErrors';

// ── The redirect target (D1b) ────────────────────────────────────────────────────

// The app's custom URL scheme. Deliberately a named constant rather than an
// inlined string: it is the RETIRED brand name (`app.json` → `scheme`), and
// B-278 will flip it to `culprit`. When that happens this constant, the
// Supabase redirect allowlist (§9.2) and the widget's deep links must move
// together — so the code half has exactly one place to change.
export const APP_SCHEME = 'nyx';

// The route the recovery link lands on. Matches the expo-router file path
// `app/(auth)/reset-password.tsx` — the deep link works because that file
// exists, which is also why FR-14's provenance check is mandatory: any app or
// webpage on the device can fire this URL.
export const RECOVERY_PATH = 'reset-password';

/**
 * The `redirectTo` handed to `resetPasswordForEmail` (D1b).
 *
 * Hardcoded rather than derived from `Linking.createURL()` on purpose: in Expo Go
 * / a dev client that helper returns an `exp://…` URL, which is NOT on the
 * Supabase redirect allowlist, so Supabase would refuse the redirect and every
 * link would dead-end — a failure that only shows up in the runtime the PM tests
 * in. The allowlist entry (§9.2) and this string must match exactly.
 */
export function recoveryRedirectUrl(): string {
  return `${APP_SCHEME}:///${RECOVERY_PATH}`;
}

// ── (a) FR-4: the URL-shape classification ──────────────────────────────────────

export type RecoveryLink =
  // Not a recovery link at all — a widget deep link (`nyx:///history?pet=…`), a
  // future OAuth return, anything else. The handler must ignore it, NOT treat it
  // as a broken recovery attempt.
  | { kind: 'unrelated' }
  // The PKCE success shape: an opaque single-use code in a QUERY parameter.
  | { kind: 'valid'; code: string }
  // Supabase's error shape, e.g. `?error=access_denied&error_code=otp_expired`.
  // Also arrives in the URL FRAGMENT on some GoTrue paths, so both are parsed.
  | { kind: 'error'; errorCode: string | null }
  // The recovery route, but carrying neither a usable code nor a nameable error:
  // a truncated/mangled query (§10 row 11), or an implicit-flow token shape we
  // deliberately refuse (below). Renders §5.5 — never a crash.
  | { kind: 'malformed' };

// Split a URL into its path segments and its parameter map, tolerating anything.
// Hand-rolled rather than `new URL()` because RN's URL polyfill has historically
// shipped without working `searchParams`, and a parser that behaves differently
// on device than in jest is worse than no parser at all.
function dissect(url: string): { segments: string[]; params: Map<string, string> } {
  const params = new Map<string, string>();
  // Everything before the first `?` or `#` is the path portion.
  const cut = url.search(/[?#]/);
  const pathPart = cut === -1 ? url : url.slice(0, cut);
  const rest = cut === -1 ? '' : url.slice(cut);

  // Strip the scheme (`nyx:`, `exp:`, `https:`) so the remainder is host/path.
  // The host-vs-path distinction is genuinely ambiguous for a custom scheme
  // (`nyx://reset-password` — is that a host or a path?), so we don't try to
  // draw it: only the LAST non-empty segment is used for route matching.
  const segments = pathPart
    .replace(/^[a-z][a-z0-9+.-]*:/i, '')
    .split('/')
    .filter((s) => s.length > 0);

  // Parse the query AND the fragment into one map. GoTrue puts recovery errors in
  // the query on the PKCE path but in the fragment on others, and a spec that only
  // read one would render "that link no longer works" as a blank screen instead.
  for (const chunk of rest.split(/[?#]/)) {
    for (const pair of chunk.split('&')) {
      if (!pair) continue;
      const eq = pair.indexOf('=');
      const rawKey = eq === -1 ? pair : pair.slice(0, eq);
      const rawValue = eq === -1 ? '' : pair.slice(eq + 1);
      const key = safeDecode(rawKey);
      // First value wins, so a query param is never overwritten by a fragment
      // one carrying the same name.
      if (key && !params.has(key)) params.set(key, safeDecode(rawValue));
    }
  }
  return { segments, params };
}

// `decodeURIComponent` throws on a lone `%` — which a truncated link absolutely
// can contain. Never let a mangled URL become a crash (§10 row 11).
function safeDecode(value: string): string {
  const plussed = value.replace(/\+/g, ' ');
  try {
    return decodeURIComponent(plussed);
  } catch {
    return plussed;
  }
}

/**
 * Classify an incoming deep link WITHOUT touching auth state (§6.4 step 1).
 *
 * Note what this can and cannot tell you: a `valid` result means the URL carries
 * a well-formed code, NOT that the code still works. Expiry, prior use and a
 * resend-overwritten verifier (D8) are all indistinguishable from here — they
 * surface only from the exchange, which is why FR-4 has a second half.
 */
export function parseRecoveryLink(url: string | null | undefined): RecoveryLink {
  if (!url || typeof url !== 'string') return { kind: 'unrelated' };

  const { segments, params } = dissect(url);
  const last = segments[segments.length - 1];
  if (last !== RECOVERY_PATH) return { kind: 'unrelated' };

  // Error BEFORE code, so a URL carrying both is never exchanged. Fail-closed is
  // free here and the alternative silently burns a code on a known-bad link.
  const errorCode = params.get('error_code') ?? params.get('error') ?? null;
  const hasErrorShape =
    errorCode !== null || params.has('error_description');
  if (hasErrorShape) return { kind: 'error', errorCode: errorCode || null };

  const code = params.get('code');
  if (code) return { kind: 'valid', code };

  // An implicit-flow shape (`#access_token=…&refresh_token=…`) is refused rather
  // than adopted. Accepting it would re-introduce exactly what D1a bought by
  // choosing PKCE — long-lived tokens transiting a URL — and would do it on the
  // one flow whose entire job is re-establishing trust.
  return { kind: 'malformed' };
}

// ── (b) FR-4: the exchange-result classification ────────────────────────────────

export type RecoveryExchangeOutcome =
  | 'success'
  // §5.5b — this device holds no PKCE verifier, so the code cannot be exchanged
  // here. Locally knowable and honestly nameable ("open it on the phone you
  // asked from"), which is why it earns its own state.
  | 'wrong_device'
  // §5.5 — the link cannot be used again: expired, already consumed by a mail
  // scanner, or invalidated by a later resend overwriting the verifier (D8).
  | 'link_unusable'
  // §5.6 — a transport or server failure. The link may well still be good, so the
  // forward action is "try again", not "send a new one".
  | 'failed';

// NOTE ON THE THREE-WAY COLLAPSE, because it is a deliberate divergence from
// FR-4's wording. FR-4 lists four results: `expired` · `used` · `wrong_device` ·
// `error`. GoTrue returns ONE indistinguishable shape for expired, already-used
// and verifier-overwritten links ("Email link is invalid or has expired"), so a
// type that claimed to tell them apart would be a lie that invites copy asserting
// a cause the device cannot know — the exact error §5.5's title and §7.2.3's
// banner both exist to avoid. They also render the identical screen (§10 rows
// 9/10/20 are specified as byte-identical). So the two indistinguishable members
// collapse into `link_unusable`, and the distinction survives where it is real:
// `wrong_device` (locally knowable) and `failed` (retryable) stay separate.

// A missing/mismatched local verifier. auth-js raises this client-side before any
// network call ("both auth code and code verifier should be non-empty"); GoTrue
// raises the flow-state variants when the server side of the PKCE flow is gone.
const VERIFIER_ABSENT_RE = /code[_ ]verifier|pkce/i;

// GoTrue's vocabulary for "this link is spent". Codes first (the modern
// discriminator), message text as the fallback for responses that carry none.
const UNUSABLE_CODES = new Set([
  'otp_expired',
  'flow_state_expired',
  'flow_state_not_found',
  'invalid_otp',
]);
const UNUSABLE_TEXT_RE =
  /invalid or has expired|has expired|already been used|invalid flow state|token not found/i;

/**
 * Classify the result of `exchangeCodeForSession` (§6.4 steps 6/9).
 *
 * Pass `null` for the no-error (success) case. Ordering is deliberate:
 * wrong-device before unusable, because a device with no verifier would
 * otherwise be told its perfectly good link had expired — §5.5b exists precisely
 * because that message is both untrue and unactionable for Sam on the household
 * iPad.
 *
 * `verifierPresent` lets the caller assert the locally-knowable half directly
 * (FR-14's marker is the signal). It is the authority when supplied: §9.3-Q2 asks
 * whether the error shape alone is distinguishable on a real device, and this
 * parameter is how PR 2 stays correct either way that check lands.
 */
export function classifyExchangeOutcome(
  error: AuthErrorLike,
  verifierPresent?: boolean,
): RecoveryExchangeOutcome {
  if (!error) return 'success';
  if (verifierPresent === false) return 'wrong_device';

  const text = (error.message ?? '').toLowerCase();
  if (VERIFIER_ABSENT_RE.test(text)) return 'wrong_device';

  // A transport failure is the one case where the link is probably still fine, so
  // it must not be misreported as a dead link. Reuses the shipped predicate
  // rather than restating the strings (lib/authErrors.ts).
  if (isOffline(error)) return 'failed';
  if (error.status != null && error.status >= 500) return 'failed';

  if (error.code && UNUSABLE_CODES.has(error.code)) return 'link_unusable';
  if (UNUSABLE_TEXT_RE.test(text)) return 'link_unusable';

  // Default toward `link_unusable` rather than `failed`. An exchange the server
  // rejected for a reason we can't name is far more likely a spent link than a
  // blip, and §5.5's "send a new link" is a forward action either way — where
  // §5.6's "try again" would loop the owner into the same rejection.
  return 'link_unusable';
}

// ── D7: the resend cooldown state machine ───────────────────────────────────────

export const RESEND_COOLDOWN_SEC = 60;

/**
 * Seconds left on the cooldown, or 0 when a resend is allowed.
 *
 * The clock starts at the INITIAL send, not at the first resend — `lastSentAtMs`
 * is written by the first `resetPasswordForEmail` too. Starting it at the first
 * resend leaves the single most likely tap uncooled (the impatient one at t≈5s),
 * which is exactly the tap that hits the server's rate limit and produces the
 * silent rejection this cooldown exists to explain (D7, after pm-feature-review).
 */
export function resendSecondsRemaining(
  lastSentAtMs: number | null,
  nowMs: number,
): number {
  if (lastSentAtMs == null) return 0;
  const elapsed = (nowMs - lastSentAtMs) / 1000;
  // A negative elapsed (clock moved backwards) must not produce a cooldown
  // LONGER than the cap, which would strand the owner on a disabled button.
  if (!Number.isFinite(elapsed)) return 0;
  const remaining = Math.ceil(RESEND_COOLDOWN_SEC - elapsed);
  return Math.min(Math.max(remaining, 0), RESEND_COOLDOWN_SEC);
}

export function canResend(lastSentAtMs: number | null, nowMs: number): boolean {
  return resendSecondsRemaining(lastSentAtMs, nowMs) === 0;
}

/** §5.3's tertiary control label. Counts down, then invites the tap. */
export function resendLabel(secondsRemaining: number): string {
  return secondsRemaining > 0 ? `Resend in ${secondsRemaining}s` : 'Resend link';
}

/**
 * Whether §5.3's `Still nothing? Contact support` escape is revealed.
 *
 * Shown on the first of (a resend, or the cooldown elapsing). Gating it behind a
 * resend alone strands the owner who mistyped their address: no email will ever
 * arrive, so resending is the one affordance that cannot help them, and support
 * would sit behind it forever (pm-feature-review).
 */
export function shouldOfferSupport(
  resendCount: number,
  lastSentAtMs: number | null,
  nowMs: number,
): boolean {
  if (resendCount > 0) return true;
  if (lastSentAtMs == null) return false;
  return canResend(lastSentAtMs, nowMs);
}
