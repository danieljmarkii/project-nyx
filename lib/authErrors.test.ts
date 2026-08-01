import {
  authErrorCopy,
  isEmailNotConfirmed,
  isInvalidCredentials,
  isOffline,
  isRateLimited,
  retryAfterSeconds,
} from './authErrors';

// The contract these tests defend (B-152 part 2): no Supabase string ever
// reaches an owner. The sweep at the bottom is the load-bearing one — it asserts
// the property across every shape we know of, so a future branch that forgets to
// map something fails here rather than on a stranger's phone.

describe('isEmailNotConfirmed', () => {
  it('matches the modern error code', () => {
    expect(isEmailNotConfirmed({ code: 'email_not_confirmed' })).toBe(true);
  });

  it('matches the legacy message text when no code is present', () => {
    // Older GoTrue responses (and some edge paths) return message-only. This is
    // the exact string the login screen used to render verbatim.
    expect(isEmailNotConfirmed({ message: 'Email not confirmed' })).toBe(true);
  });

  it('does not match an unrelated failure', () => {
    expect(isEmailNotConfirmed({ code: 'invalid_credentials' })).toBe(false);
    expect(isEmailNotConfirmed(null)).toBe(false);
  });
});

describe('isInvalidCredentials', () => {
  it('matches the modern error code', () => {
    expect(isInvalidCredentials({ code: 'invalid_credentials' })).toBe(true);
  });

  it('matches the legacy message text when no code is present', () => {
    // What a wrong current password returns from the change-password re-check.
    expect(isInvalidCredentials({ message: 'Invalid login credentials' })).toBe(true);
  });

  it('does not match an unrelated failure', () => {
    expect(isInvalidCredentials({ code: 'email_not_confirmed' })).toBe(false);
    expect(isInvalidCredentials({ message: 'Network request failed' })).toBe(false);
    expect(isInvalidCredentials(null)).toBe(false);
  });
});

describe('isRateLimited', () => {
  it('matches the email-send rate-limit code', () => {
    expect(isRateLimited({ code: 'over_email_send_rate_limit' })).toBe(true);
  });

  it('matches a bare 429', () => {
    expect(isRateLimited({ status: 429 })).toBe(true);
  });

  it("matches GoTrue's per-user interval prose", () => {
    // Produced by Supabase's "Minimum interval per user" SMTP setting (60s on
    // this project) — the failure an owner hits by tapping Resend twice.
    expect(
      isRateLimited({
        message: 'For security purposes, you can only request this after 47 seconds.',
      }),
    ).toBe(true);
  });
});

describe('retryAfterSeconds', () => {
  it('reads the wait out of the message prose', () => {
    expect(
      retryAfterSeconds({
        message: 'For security purposes, you can only request this after 47 seconds.',
      }),
    ).toBe(47);
  });

  it('handles the singular form', () => {
    expect(retryAfterSeconds({ message: 'you can only request this after 1 second.' })).toBe(1);
  });

  it('returns null when there is no number to read', () => {
    expect(retryAfterSeconds({ code: 'over_email_send_rate_limit' })).toBeNull();
    expect(retryAfterSeconds(null)).toBeNull();
  });
});

describe('isOffline', () => {
  it.each([
    'Network request failed',
    'Failed to fetch',
    'Load failed',
  ])('matches the transport failure %p', (message) => {
    expect(isOffline({ message })).toBe(true);
  });

  it('does not swallow a real auth decision', () => {
    expect(isOffline({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe(
      false,
    );
  });
});

describe('authErrorCopy — unconfirmed email', () => {
  it('names the specific inbox when the email is known', () => {
    const copy = authErrorCopy({ code: 'email_not_confirmed' }, 'login', 'jordan@email.com');
    expect(copy.title).toBe('One step left');
    expect(copy.message).toContain('jordan@email.com');
  });

  it('degrades gracefully when the email is unknown — never prints undefined', () => {
    const copy = authErrorCopy({ code: 'email_not_confirmed' }, 'login');
    expect(copy.message).not.toContain('undefined');
    expect(copy.message).toContain('Tap the link we sent you');
  });

  it('does not read as a rejection — the account exists, one step remains', () => {
    const copy = authErrorCopy({ code: 'email_not_confirmed' }, 'login', 'jordan@email.com');
    // "One step left" / "then sign in" — forward-looking, not a refusal.
    expect(copy.message).toContain('then sign in');
  });
});

describe('authErrorCopy — rate limit', () => {
  it('quotes the specific wait when Supabase gives us one', () => {
    const copy = authErrorCopy(
      { message: 'For security purposes, you can only request this after 47 seconds.' },
      'resend',
    );
    expect(copy.message).toContain('47 seconds');
  });

  it('falls back to "in a moment" rather than inventing a duration', () => {
    const copy = authErrorCopy({ code: 'over_email_send_rate_limit' }, 'resend');
    expect(copy.message).toContain('in a moment');
    expect(copy.message).not.toMatch(/\d/);
  });

  it('gives the resend context its own remedy', () => {
    const resend = authErrorCopy({ status: 429 }, 'resend');
    const login = authErrorCopy({ status: 429 }, 'login');
    expect(resend.message).not.toBe(login.message);
    expect(resend.message).toContain('We just sent a link');
  });
});

describe('authErrorCopy — credentials', () => {
  it('does not disclose whether the email has an account (enumeration)', () => {
    const copy = authErrorCopy({ code: 'invalid_credentials' }, 'login', 'jordan@email.com');
    // Must not confirm or deny that the address is registered — that would undo
    // the project's email-enumeration protection from the client side.
    expect(copy.message).not.toMatch(/no account|not found|doesn't exist|no such/i);
    expect(copy.message).not.toContain('jordan@email.com');
  });
});

describe('authErrorCopy — the no-raw-strings contract', () => {
  // Every failure shape we know of, including ones with no mapped branch.
  const SHAPES = [
    { code: 'email_not_confirmed', message: 'Email not confirmed' },
    { code: 'invalid_credentials', message: 'Invalid login credentials' },
    { code: 'weak_password', message: 'Password should be at least 6 characters' },
    { code: 'email_address_invalid', message: 'Email address "x@y" is invalid' },
    { code: 'user_already_exists', message: 'User already registered' },
    { code: 'email_exists', message: 'Email address already registered by another user' },
    { code: 'signup_disabled', message: 'Signups not allowed for this instance' },
    { code: 'over_email_send_rate_limit', message: 'Email rate limit exceeded' },
    { message: 'For security purposes, you can only request this after 47 seconds.' },
    { message: 'Network request failed' },
    // The genuinely unknown — a future GoTrue code we've never seen.
    { code: 'some_future_code', message: 'AuthApiError: unexpected_failure (500)' },
    { message: 'Database error saving new user' },
    null,
  ];

  const CONTEXTS = ['signup', 'login', 'resend', 'password'] as const;

  it.each(CONTEXTS)('never surfaces the provider string in the %s context', (context) => {
    for (const shape of SHAPES) {
      const copy = authErrorCopy(shape, context, 'jordan@email.com');
      if (shape?.message) {
        expect(copy.message).not.toContain(shape.message);
      }
      // No leaked internals of any kind.
      expect(copy.message).not.toMatch(/AuthApiError|undefined|null|\bcode\b|\b[45]\d\d\b/);
      expect(copy.title).not.toMatch(/AuthApiError|undefined/);
    }
  });

  it.each(CONTEXTS)('always returns non-empty, punctuated copy in the %s context', (context) => {
    for (const shape of SHAPES) {
      const copy = authErrorCopy(shape, context, 'jordan@email.com');
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.message.length).toBeGreaterThan(0);
      expect(copy.message).toMatch(/\.$/);
    }
  });

  it.each(CONTEXTS)('never uses an exclamation mark in the %s context (nyx-voice)', (context) => {
    for (const shape of SHAPES) {
      const copy = authErrorCopy(shape, context, 'jordan@email.com');
      expect(copy.title).not.toContain('!');
      expect(copy.message).not.toContain('!');
    }
  });

  it('uses a context-appropriate fallback title for an unknown failure', () => {
    const unknown = { code: 'some_future_code', message: 'unexpected_failure' };
    expect(authErrorCopy(unknown, 'signup').title).toBe("Couldn't create your account");
    expect(authErrorCopy(unknown, 'login').title).toBe("Couldn't sign you in");
    expect(authErrorCopy(unknown, 'resend').title).toBe("Couldn't send the link");
    // The change-password screen must not read as a sign-in failure (B-280 PR 3).
    expect(authErrorCopy(unknown, 'password').title).toBe("Couldn't change your password");
  });
});
