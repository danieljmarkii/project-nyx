import {
  APP_SCHEME,
  RECOVERY_PATH,
  RESEND_COOLDOWN_SEC,
  canResend,
  classifyExchangeOutcome,
  parseRecoveryLink,
  recoveryRedirectUrl,
  resendLabel,
  resendSecondsRemaining,
  shouldOfferSupport,
} from './passwordRecovery';

describe('recoveryRedirectUrl', () => {
  it('is the exact string the Supabase allowlist must carry (§9.2)', () => {
    expect(recoveryRedirectUrl()).toBe('nyx:///reset-password');
  });

  it('is built from the scheme + route constants, so B-278 has one place to change', () => {
    expect(recoveryRedirectUrl()).toBe(`${APP_SCHEME}:///${RECOVERY_PATH}`);
  });
});

describe('parseRecoveryLink — the URL-shape classification (FR-4a)', () => {
  it('reads the PKCE success shape from a query parameter', () => {
    expect(parseRecoveryLink('nyx:///reset-password?code=abc123')).toEqual({
      kind: 'valid',
      code: 'abc123',
    });
  });

  it('accepts the host-shaped variant of the same link', () => {
    // `nyx://reset-password` vs `nyx:///reset-password` — whether the segment is a
    // host or a path is genuinely ambiguous for a custom scheme, and iOS has
    // handed us both shapes. Neither may be rejected.
    expect(parseRecoveryLink('nyx://reset-password?code=abc123')).toEqual({
      kind: 'valid',
      code: 'abc123',
    });
  });

  it('accepts a dev-client URL so the flow is testable in Runtime B', () => {
    expect(
      parseRecoveryLink('exp://192.168.1.5:8081/--/reset-password?code=abc123'),
    ).toEqual({ kind: 'valid', code: 'abc123' });
  });

  it('tolerates a trailing slash and extra query params', () => {
    expect(parseRecoveryLink('nyx:///reset-password/?foo=1&code=abc&bar=2')).toEqual({
      kind: 'valid',
      code: 'abc',
    });
  });

  it('percent-decodes the code and treats + as a space', () => {
    expect(parseRecoveryLink('nyx:///reset-password?code=a%2Bb')).toEqual({
      kind: 'valid',
      code: 'a+b',
    });
  });

  it('ignores a link for another route — a widget deep link is not a broken reset', () => {
    // §6.5: the shipped widget emits these while the owner may be mid-recovery.
    // Classifying them as `malformed` would render "that link no longer works"
    // over a perfectly innocent Home Screen tap.
    expect(parseRecoveryLink('nyx:///history?pet=abc')).toEqual({ kind: 'unrelated' });
    expect(parseRecoveryLink('nyx:///log?type=meal')).toEqual({ kind: 'unrelated' });
  });

  it('ignores a route that merely looks similar', () => {
    expect(parseRecoveryLink('nyx:///reset-passwor?code=abc')).toEqual({
      kind: 'unrelated',
    });
    expect(parseRecoveryLink('nyx:///reset-password-x?code=abc')).toEqual({
      kind: 'unrelated',
    });
  });

  it('reads the error shape from the query', () => {
    expect(
      parseRecoveryLink(
        'nyx:///reset-password?error=access_denied&error_code=otp_expired' +
          '&error_description=Email+link+is+invalid+or+has+expired',
      ),
    ).toEqual({ kind: 'error', errorCode: 'otp_expired' });
  });

  it('reads the error shape from the FRAGMENT, which GoTrue also uses', () => {
    expect(
      parseRecoveryLink(
        'nyx:///reset-password#error=access_denied&error_code=otp_expired' +
          '&error_description=Email+link+is+invalid+or+has+expired',
      ),
    ).toEqual({ kind: 'error', errorCode: 'otp_expired' });
  });

  it('falls back to `error` when no error_code is present', () => {
    expect(parseRecoveryLink('nyx:///reset-password?error=server_error')).toEqual({
      kind: 'error',
      errorCode: 'server_error',
    });
  });

  it('classifies an error_description-only shape as error, not malformed', () => {
    expect(
      parseRecoveryLink('nyx:///reset-password?error_description=Something+broke'),
    ).toEqual({ kind: 'error', errorCode: null });
  });

  it('prefers error over code when both are present — fail-closed', () => {
    // Never spend a code on a link the server has already told us is bad.
    expect(
      parseRecoveryLink('nyx:///reset-password?code=abc&error_code=otp_expired'),
    ).toEqual({ kind: 'error', errorCode: 'otp_expired' });
  });

  it('refuses an implicit-flow token shape rather than adopting it', () => {
    // D1a: accepting this would re-introduce long-lived tokens transiting a URL,
    // which is precisely what choosing PKCE bought.
    expect(
      parseRecoveryLink(
        'nyx:///reset-password#access_token=eyJ&refresh_token=r1&type=recovery',
      ),
    ).toEqual({ kind: 'malformed' });
  });

  it('classifies a truncated / empty-code link as malformed, never a throw (§10 row 11)', () => {
    expect(parseRecoveryLink('nyx:///reset-password')).toEqual({ kind: 'malformed' });
    expect(parseRecoveryLink('nyx:///reset-password?')).toEqual({ kind: 'malformed' });
    expect(parseRecoveryLink('nyx:///reset-password?code=')).toEqual({ kind: 'malformed' });
    expect(parseRecoveryLink('nyx:///reset-password?cod=abc')).toEqual({
      kind: 'malformed',
    });
  });

  it('survives a malformed percent-escape without throwing', () => {
    // `decodeURIComponent('%')` throws; a truncated link can absolutely contain one.
    expect(() => parseRecoveryLink('nyx:///reset-password?code=%')).not.toThrow();
    expect(parseRecoveryLink('nyx:///reset-password?code=%')).toEqual({
      kind: 'valid',
      code: '%',
    });
  });

  it('treats an absent / non-string URL as unrelated rather than crashing', () => {
    expect(parseRecoveryLink(null)).toEqual({ kind: 'unrelated' });
    expect(parseRecoveryLink(undefined)).toEqual({ kind: 'unrelated' });
    expect(parseRecoveryLink('')).toEqual({ kind: 'unrelated' });
    expect(parseRecoveryLink('not a url at all')).toEqual({ kind: 'unrelated' });
  });
});

describe('classifyExchangeOutcome — the exchange-result classification (FR-4b)', () => {
  it('reads a null error as success', () => {
    expect(classifyExchangeOutcome(null)).toBe('success');
  });

  it('names the wrong-device case from the auth-js verifier error (§5.5b)', () => {
    expect(
      classifyExchangeOutcome({
        message: 'invalid request: both auth code and code verifier should be non-empty',
      }),
    ).toBe('wrong_device');
  });

  it('honours an explicit verifierPresent: false over the error text', () => {
    // §9.3-Q2 asks whether the error shape alone is distinguishable on a real
    // device. This parameter is how PR 2 stays correct whichever way that lands:
    // the locally-knowable fact wins.
    expect(
      classifyExchangeOutcome({ message: 'Email link is invalid or has expired' }, false),
    ).toBe('wrong_device');
  });

  it('does not claim wrong_device when the verifier is present', () => {
    expect(
      classifyExchangeOutcome({ code: 'otp_expired', message: 'x' }, true),
    ).toBe('link_unusable');
  });

  it('classifies expired, used and verifier-overwritten links identically (D8)', () => {
    // GoTrue returns one shape for all three, so a type that told them apart
    // would invite copy asserting a cause the device cannot know. §10 rows
    // 9/10/20 are specified to render the same screen.
    expect(classifyExchangeOutcome({ code: 'otp_expired' })).toBe('link_unusable');
    expect(
      classifyExchangeOutcome({ message: 'Email link is invalid or has expired' }),
    ).toBe('link_unusable');
    expect(classifyExchangeOutcome({ code: 'flow_state_not_found' })).toBe(
      'link_unusable',
    );
    expect(classifyExchangeOutcome({ message: 'invalid flow state, no valid flow state found' })).toBe(
      'link_unusable',
    );
  });

  it('classifies a transport failure as retryable, not as a dead link', () => {
    // Telling an owner their link is spent when the truth is a network blip sends
    // them to burn a fresh link for nothing.
    expect(classifyExchangeOutcome({ message: 'Network request failed' })).toBe('failed');
    expect(classifyExchangeOutcome({ message: 'Load failed' })).toBe('failed');
  });

  it('classifies a 5xx as retryable', () => {
    expect(classifyExchangeOutcome({ message: 'boom', status: 503 })).toBe('failed');
  });

  it('defaults an unnameable rejection to link_unusable', () => {
    // §5.5's "send a new link" is a forward action; §5.6's "try again" would loop
    // the owner back into the same server rejection.
    expect(classifyExchangeOutcome({ message: 'something unexpected', status: 400 })).toBe(
      'link_unusable',
    );
    expect(classifyExchangeOutcome({})).toBe('link_unusable');
  });
});

describe('resend cooldown (D7)', () => {
  const t0 = 1_700_000_000_000;

  it('renders a full cooldown from the INITIAL send, not the first resend', () => {
    // The impatient tap at t≈5s is the single most likely one, and is exactly the
    // tap that hits the server's rate limit. Starting the clock at the first
    // resend would leave it uncooled and defeat the cooldown's own purpose.
    expect(resendSecondsRemaining(t0, t0)).toBe(RESEND_COOLDOWN_SEC);
    expect(resendSecondsRemaining(t0, t0 + 5_000)).toBe(55);
    expect(canResend(t0, t0 + 5_000)).toBe(false);
  });

  it('opens up exactly at the cooldown boundary', () => {
    expect(resendSecondsRemaining(t0, t0 + 59_000)).toBe(1);
    expect(canResend(t0, t0 + 59_000)).toBe(false);
    expect(resendSecondsRemaining(t0, t0 + 60_000)).toBe(0);
    expect(canResend(t0, t0 + 60_000)).toBe(true);
  });

  it('allows a resend when nothing has been sent yet', () => {
    expect(resendSecondsRemaining(null, t0)).toBe(0);
    expect(canResend(null, t0)).toBe(true);
  });

  it('never exceeds the cap when the clock moves backwards', () => {
    // A device clock change (or a restored backup) must not strand the owner on a
    // disabled button for longer than the cooldown itself.
    expect(resendSecondsRemaining(t0, t0 - 600_000)).toBe(RESEND_COOLDOWN_SEC);
  });

  it('labels the control by remaining time', () => {
    expect(resendLabel(42)).toBe('Resend in 42s');
    expect(resendLabel(1)).toBe('Resend in 1s');
    expect(resendLabel(0)).toBe('Resend link');
  });
});

describe('shouldOfferSupport (§5.3)', () => {
  const t0 = 1_700_000_000_000;

  it('stays hidden immediately after the first send', () => {
    expect(shouldOfferSupport(0, t0, t0 + 1_000)).toBe(false);
  });

  it('reveals as soon as the owner resends', () => {
    expect(shouldOfferSupport(1, t0, t0 + 1_000)).toBe(true);
  });

  it('reveals on the cooldown elapsing even with no resend — the typo case', () => {
    // An owner who mistyped their address will never get an email, so resending is
    // the one affordance that cannot help them. Gating support behind a resend
    // would hide it from them forever.
    expect(shouldOfferSupport(0, t0, t0 + 60_000)).toBe(true);
  });

  it('stays hidden before any send at all', () => {
    expect(shouldOfferSupport(0, null, t0)).toBe(false);
  });
});
