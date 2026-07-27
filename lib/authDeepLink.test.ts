import {
  APP_SCHEME,
  AUTH_DEEP_LINK_PATHS,
  CONFIRM_PATH,
  authDeepLinkUrl,
  dissectUrl,
  isAuthDeepLink,
  parseAuthDeepLink,
} from './authDeepLink';

// The shared auth-link parser, extracted from lib/passwordRecovery.ts when signup
// confirmation became a second consumer (B-432). passwordRecovery.test.ts still
// exercises the recovery route through parseRecoveryLink — those 39 cases are the
// regression proof that the extraction changed no behaviour. What's covered HERE is
// the generalised contract: route matching against an arbitrary path, and the
// cold-start guard the root layout keys on.

describe('authDeepLinkUrl', () => {
  it('builds the triple-slash custom-scheme URL Supabase redirects to', () => {
    expect(authDeepLinkUrl(CONFIRM_PATH)).toBe('nyx:///confirm');
    expect(authDeepLinkUrl('reset-password')).toBe(`${APP_SCHEME}:///reset-password`);
  });
});

describe('parseAuthDeepLink — route matching', () => {
  it('classifies a link for the requested route and ignores every other one', () => {
    expect(parseAuthDeepLink('nyx:///confirm?code=abc', 'confirm')).toEqual({
      kind: 'valid',
      code: 'abc',
    });
    // The SAME url against a different route is unrelated, not malformed — the
    // distinction that keeps one flow's handler from claiming another's link.
    expect(parseAuthDeepLink('nyx:///confirm?code=abc', 'reset-password')).toEqual({
      kind: 'unrelated',
    });
  });

  it('ignores the widget deep links the app also receives', () => {
    expect(parseAuthDeepLink('nyx:///history?pet=abc', 'confirm')).toEqual({ kind: 'unrelated' });
    expect(parseAuthDeepLink('nyx:///log?type=meal', 'confirm')).toEqual({ kind: 'unrelated' });
  });

  it('matches the route case-insensitively so an uppercasing mail client cannot swallow a link', () => {
    expect(parseAuthDeepLink('nyx:///Confirm?code=abc', 'confirm')).toEqual({
      kind: 'valid',
      code: 'abc',
    });
  });

  it('never treats the opaque code case-insensitively', () => {
    const link = parseAuthDeepLink('nyx:///confirm?code=AbC', 'confirm');
    expect(link).toEqual({ kind: 'valid', code: 'AbC' });
  });

  it('accepts the double-slash host form as well as the triple-slash path form', () => {
    expect(parseAuthDeepLink('nyx://confirm?code=abc', 'confirm')).toEqual({
      kind: 'valid',
      code: 'abc',
    });
  });
});

describe('parseAuthDeepLink — error and malformed shapes', () => {
  it('reads GoTrue errors from the query', () => {
    expect(
      parseAuthDeepLink('nyx:///confirm?error=access_denied&error_code=otp_expired', 'confirm'),
    ).toEqual({ kind: 'error', errorCode: 'otp_expired' });
  });

  it('reads GoTrue errors from the fragment, which route params never carry', () => {
    expect(parseAuthDeepLink('nyx:///confirm#error_code=otp_expired', 'confirm')).toEqual({
      kind: 'error',
      errorCode: 'otp_expired',
    });
  });

  it('honours an error shape ahead of a code, so a known-bad link never burns one', () => {
    expect(parseAuthDeepLink('nyx:///confirm?code=abc&error=access_denied', 'confirm')).toEqual({
      kind: 'error',
      errorCode: 'access_denied',
    });
  });

  it('reports an error with no nameable code rather than inventing one', () => {
    expect(
      parseAuthDeepLink('nyx:///confirm?error_description=Something%20went%20wrong', 'confirm'),
    ).toEqual({ kind: 'error', errorCode: null });
  });

  it('refuses an implicit-flow token shape instead of adopting it', () => {
    // Accepting this would put a long-lived refresh token in a URL — exactly what
    // choosing PKCE bought, on the flow whose job is establishing trust.
    expect(
      parseAuthDeepLink('nyx:///confirm#access_token=xyz&refresh_token=abc', 'confirm'),
    ).toEqual({ kind: 'malformed' });
  });

  it('degrades a truncated link to malformed rather than throwing', () => {
    // A lone `%` makes decodeURIComponent throw; a mangled link must never crash
    // the one screen the owner reached from their inbox.
    expect(() => parseAuthDeepLink('nyx:///confirm?code=%', 'confirm')).not.toThrow();
    expect(parseAuthDeepLink('nyx:///confirm?', 'confirm')).toEqual({ kind: 'malformed' });
    expect(parseAuthDeepLink('nyx:///confirm', 'confirm')).toEqual({ kind: 'malformed' });
  });

  it('treats null, undefined and non-strings as unrelated', () => {
    expect(parseAuthDeepLink(null, 'confirm')).toEqual({ kind: 'unrelated' });
    expect(parseAuthDeepLink(undefined, 'confirm')).toEqual({ kind: 'unrelated' });
    expect(parseAuthDeepLink('', 'confirm')).toEqual({ kind: 'unrelated' });
  });
});

describe('dissectUrl — the hostile-link boundary', () => {
  it('does not let a nested URL smuggle a top-level param', () => {
    // The outer link carries no code of its own; `code=evil` belongs to the VALUE
    // of redirect_to. Surfacing it would make this parser the weak link.
    const { params } = dissectUrl('nyx:///confirm?redirect_to=nyx:///confirm?code=evil');
    expect(params.get('code')).toBeUndefined();
    expect(params.get('redirect_to')).toBe('nyx:///confirm?code=evil');
  });

  it('treats a `?` after the first `#` as fragment content, per RFC 3986', () => {
    const { params } = dissectUrl('nyx:///confirm#a=1?code=evil');
    expect(params.get('code')).toBeUndefined();
  });

  it('lets a query param win over a same-named fragment param', () => {
    const { params } = dissectUrl('nyx:///confirm?code=real#code=fake');
    expect(params.get('code')).toBe('real');
  });
});

describe('isAuthDeepLink — the root layout cold-start guard', () => {
  it('recognises the confirmation route', () => {
    expect(isAuthDeepLink('nyx:///confirm?code=abc')).toBe(true);
    // Shape-only: a confirmation link that arrives with an error still has a
    // designed screen to render, and is ruined just as thoroughly by being routed
    // away from it.
    expect(isAuthDeepLink('nyx:///confirm?error=access_denied')).toBe(true);
    expect(isAuthDeepLink('nyx:///confirm')).toBe(true);
  });

  it('does not claim the widget deep links, which must keep their normal routing', () => {
    expect(isAuthDeepLink('nyx:///history?pet=abc')).toBe(false);
    expect(isAuthDeepLink('nyx:///log?type=meal')).toBe(false);
    expect(isAuthDeepLink(null)).toBe(false);
    expect(isAuthDeepLink('')).toBe(false);
  });

  it('lists only routes whose screen file exists', () => {
    // Suppressing the Landing bounce for an unregistered route would strand the
    // owner on expo-router's not-found screen — strictly worse than the bounce. So
    // reset-password joins this list in the SAME commit that adds its screen
    // (B-280 PR 2), not before.
    expect(AUTH_DEEP_LINK_PATHS).toEqual([CONFIRM_PATH]);
    expect(isAuthDeepLink('nyx:///reset-password?code=abc')).toBe(false);
  });
});
