import {
  confirmRedirectUrl,
  decideConfirm,
  ownerNameFromMetadata,
  parseConfirmLink,
  resolveConfirmLink,
  stateAfterFailedExchange,
} from './emailConfirm';

// The signup-confirmation deep link (B-432 / B-483). Every branch the owner's
// confirmation can take is decided here, so all four terminal states are reachable
// without a device and a real email — which is the whole reason this module is pure.

describe('confirmRedirectUrl', () => {
  it('is the exact string the Supabase redirect allowlist must carry', () => {
    // Hardcoded, never Linking.createURL(): that helper returns `exp://…` in a dev
    // client, which is not on the allowlist, so every link would dead-end in the one
    // runtime the PM tests in.
    expect(confirmRedirectUrl()).toBe('nyx:///confirm');
  });
});

describe('parseConfirmLink', () => {
  it('claims the confirmation route and nothing else', () => {
    expect(parseConfirmLink('nyx:///confirm?code=abc')).toEqual({ kind: 'valid', code: 'abc' });
    // The recovery link belongs to B-280's handler, not this one.
    expect(parseConfirmLink('nyx:///reset-password?code=abc')).toEqual({ kind: 'unrelated' });
  });
});

describe('resolveConfirmLink — two sources, one answer', () => {
  it('prefers the raw URL, which is the only source that can see a fragment error', () => {
    // expo-router params never carry a fragment, so a params-only screen would show
    // a blank spinner on exactly the links that need to explain themselves.
    expect(resolveConfirmLink('nyx:///confirm#error_code=otp_expired', {})).toEqual({
      kind: 'error',
      errorCode: 'otp_expired',
    });
  });

  it('falls back to route params when no launch URL is available', () => {
    expect(resolveConfirmLink(null, { code: 'abc' })).toEqual({ kind: 'valid', code: 'abc' });
    expect(resolveConfirmLink(null, { error_code: 'otp_expired' })).toEqual({
      kind: 'error',
      errorCode: 'otp_expired',
    });
    expect(resolveConfirmLink(null, { error: 'access_denied' })).toEqual({
      kind: 'error',
      errorCode: 'access_denied',
    });
  });

  it('honours an error ahead of a code in the fallback too, matching the URL parser', () => {
    expect(resolveConfirmLink(null, { code: 'abc', error: 'access_denied' })).toEqual({
      kind: 'error',
      errorCode: 'access_denied',
    });
  });

  it('names an error it cannot label rather than dropping it', () => {
    expect(resolveConfirmLink(null, { error_description: 'Something went wrong' })).toEqual({
      kind: 'error',
      errorCode: null,
    });
  });

  it('takes the first value of a repeated param, as the URL parser does', () => {
    expect(resolveConfirmLink(null, { code: ['abc', 'def'] })).toEqual({
      kind: 'valid',
      code: 'abc',
    });
  });

  it('reports unrelated when neither source says anything — a wait, not a verdict', () => {
    expect(resolveConfirmLink(null, {})).toEqual({ kind: 'unrelated' });
    expect(resolveConfirmLink(null, null)).toEqual({ kind: 'unrelated' });
    // A launch URL that belongs to the widget is not a broken confirmation.
    expect(resolveConfirmLink('nyx:///history?pet=abc', {})).toEqual({ kind: 'unrelated' });
  });
});

describe('decideConfirm', () => {
  it('exchanges a valid code when the device holds no session — the ordinary path', () => {
    expect(decideConfirm({ kind: 'valid', code: 'abc' }, 'absent')).toEqual({
      kind: 'exchange',
      code: 'abc',
    });
  });

  it('REFUSES to exchange while a session is live, rather than swapping it', () => {
    // The safety call of this flow. Exchanging here would replace the session
    // non-null → non-null, the shape wipeLocalSession() was never built for:
    // useSync/useWidgetSnapshots re-arm instead of unmounting and re-publish the
    // previous account's pets — onto the Home Screen widget — after the wipe.
    // B-280's answer (sign out first, then exchange) is unavailable because
    // signOut() deletes the PKCE verifier the exchange needs. Declining costs
    // nothing: the address is already confirmed server-side.
    expect(decideConfirm({ kind: 'valid', code: 'abc' }, 'present')).toEqual({
      kind: 'state',
      state: 'already_signed_in',
    });
  });

  it('treats a transient-refresh-failure device as signed in, not signed out', () => {
    // The caller derives 'present' from coldStartDecision, so a stored session that
    // failed a refresh (null-WITH-error) lands here — the device still holds the
    // other account's local record even though getSession returned nothing.
    expect(decideConfirm({ kind: 'valid', code: 'abc' }, 'present').kind).toBe('state');
  });

  it('collapses error and malformed into one dead-link state', () => {
    // GoTrue returns one indistinguishable shape for expired / already-used /
    // consumed-by-a-mail-scanner, and a truncated link says even less. Both render
    // the same screen and the same forward action, so a taxonomy would be
    // decorative — and naming a cause we cannot observe would be a lie.
    expect(decideConfirm({ kind: 'error', errorCode: 'otp_expired' }, 'absent')).toEqual({
      kind: 'state',
      state: 'link_dead',
    });
    expect(decideConfirm({ kind: 'malformed' }, 'absent')).toEqual({
      kind: 'state',
      state: 'link_dead',
    });
    // A live session does not change the verdict: nothing was confirmed.
    expect(decideConfirm({ kind: 'error', errorCode: null }, 'present')).toEqual({
      kind: 'state',
      state: 'link_dead',
    });
  });

  it('ignores an unrelated URL instead of calling it a broken confirmation', () => {
    expect(decideConfirm({ kind: 'unrelated' }, 'absent')).toEqual({ kind: 'ignore' });
  });
});

describe('stateAfterFailedExchange', () => {
  it('says the account is confirmed, because it is', () => {
    // GoTrue verifies the token server-side BEFORE redirecting, so a link that came
    // back with a code has already confirmed the address — whatever happened next on
    // this device. "Something went wrong" would be both false and unactionable.
    expect(stateAfterFailedExchange()).toBe('confirmed_needs_signin');
  });
});

describe('ownerNameFromMetadata', () => {
  it('reads the name signup parked on the auth user', () => {
    expect(ownerNameFromMetadata({ first_name: 'Jordan', last_name: 'Rivera' })).toEqual({
      firstName: 'Jordan',
      lastName: 'Rivera',
    });
  });

  it('trims, and keeps a half-filled name rather than discarding it', () => {
    expect(ownerNameFromMetadata({ first_name: '  Sam  ', last_name: '' })).toEqual({
      firstName: 'Sam',
      lastName: '',
    });
  });

  it('returns null when there is nothing worth writing', () => {
    expect(ownerNameFromMetadata({ first_name: '   ', last_name: '' })).toBeNull();
    expect(ownerNameFromMetadata({})).toBeNull();
    expect(ownerNameFromMetadata(null)).toBeNull();
    expect(ownerNameFromMetadata(undefined)).toBeNull();
  });

  it('survives malformed metadata instead of breaking a confirmation over it', () => {
    // Untyped JSON from the server. A bad name must never cost the owner their
    // sign-in — the name stays re-enterable in Profile.
    expect(ownerNameFromMetadata({ first_name: 42, last_name: ['x'] })).toBeNull();
    expect(ownerNameFromMetadata('not an object')).toBeNull();
    expect(ownerNameFromMetadata({ first_name: 'Jordan', last_name: 99 })).toEqual({
      firstName: 'Jordan',
      lastName: '',
    });
  });
});
