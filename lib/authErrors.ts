// Owner-facing copy for Supabase auth failures (B-152 part 2).
//
// Why this file exists: every auth screen used to pass Supabase's raw
// `error.message` straight into an Alert. That was survivable while email
// confirmation was OFF — the only realistic failure was a mistyped password —
// but the day confirmation flips ON, the most common failure in the whole app
// becomes an owner seeing the literal string "Email not confirmed", which names
// a system state rather than telling them what to do next. Same for the resend
// rate limit, whose raw form ("For security purposes, you can only request this
// after 47 seconds") reads like a security incident rather than "hang on a sec".
//
// So: one pure mapper, three callers (signup submit, login submit, verify
// resend), no raw provider string ever reaching an owner. Pure and offline —
// it takes a plain object, not a Supabase client — so the copy is unit-testable
// without a network or a mocked auth module.
//
// Voice (nyx-voice): second person, specific over generic, no exclamation marks,
// never blames the owner, and always says what happens next. The fallback is
// deliberately honest ("something went wrong") rather than inventing a cause we
// don't know — an inaccurate-but-confident error message is worse than a vague
// one, because it sends the owner off fixing the wrong thing.

// Structurally what a Supabase AuthError gives us, without importing the type —
// keeps this module free of the supabase-js dependency so it stays trivially
// testable. `code` is the modern discriminator; `message` is matched as a
// fallback because older GoTrue responses (and some edge paths) omit `code`.
export type AuthErrorLike = {
  code?: string | null;
  message?: string | null;
  status?: number | null;
} | null;

export type AuthErrorCopy = {
  title: string;
  message: string;
};

// Which screen is asking. The remedy differs even when the underlying failure is
// identical — a rate-limited resend says "we'll send another shortly", a
// rate-limited sign-in says "try again shortly" — so the caller names its context
// rather than the mapper guessing from the error alone.
export type AuthContext = 'signup' | 'login' | 'resend';

const FALLBACK_TITLE: Record<AuthContext, string> = {
  signup: "Couldn't create your account",
  login: "Couldn't sign you in",
  resend: "Couldn't send the link",
};

// Supabase's rate-limit message carries the wait in its prose, not in a
// structured field, so the number has to be read out of the string. When it's
// there we can say something specific ("in about 45 seconds"); when it isn't we
// fall back to "in a moment" rather than inventing a duration.
const RETRY_SECONDS_RE = /after (\d+) seconds?/i;

export function retryAfterSeconds(error: AuthErrorLike): number | null {
  const match = error?.message?.match(RETRY_SECONDS_RE);
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

function waitPhrase(error: AuthErrorLike): string {
  const seconds = retryAfterSeconds(error);
  return seconds ? `in about ${seconds} seconds` : 'in a moment';
}

// Normalized haystack for the message-text fallbacks below.
function messageText(error: AuthErrorLike): string {
  return (error?.message ?? '').toLowerCase();
}

// The single most important classification in this file: it decides whether the
// login screen offers a "Resend link" affordance instead of a dead-end alert.
// Matches on the modern code first, then the legacy message text.
export function isEmailNotConfirmed(error: AuthErrorLike): boolean {
  if (!error) return false;
  if (error.code === 'email_not_confirmed') return true;
  return messageText(error).includes('email not confirmed');
}

// Wrong email/password. On the change-password screen (B-280 PR 3) this is the
// "that's not your current password" case: the re-check is a `signInWithPassword`
// (Supabase has no verify-only endpoint), and a mismatch comes back as
// invalid_credentials. Exported so the screen can render it inline on the
// current-password field rather than as an alert — the same code/message pair the
// `authErrorCopy` switch already keys on, factored out so both stay in step.
// Deliberately does NOT weave in the account email: this predicate is the *client*
// side of the enumeration posture (D2), so its callers must not disclose whether
// an address is registered.
export function isInvalidCredentials(error: AuthErrorLike): boolean {
  if (!error) return false;
  if (error.code === 'invalid_credentials') return true;
  return messageText(error).includes('invalid login credentials');
}

export function isRateLimited(error: AuthErrorLike): boolean {
  if (!error) return false;
  if (
    error.code === 'over_email_send_rate_limit' ||
    error.code === 'over_request_rate_limit'
  ) {
    return true;
  }
  if (error.status === 429) return true;
  // The "for security purposes" phrasing is GoTrue's per-user email interval —
  // the one the Supabase "Minimum interval per user" SMTP setting produces.
  return messageText(error).includes('for security purposes');
}

// A transport failure, not an auth decision. Worth its own branch because the
// remedy is entirely different (check your connection, nothing is wrong with
// your account) and because it's the one case where retrying immediately is
// actually the right advice.
export function isOffline(error: AuthErrorLike): boolean {
  if (!error) return false;
  const text = messageText(error);
  return (
    text.includes('network request failed') ||
    text.includes('failed to fetch') ||
    text.includes('load failed')
  );
}

/**
 * Maps a Supabase auth error to calm, specific, owner-facing copy.
 *
 * `email` is the address the owner just typed; when supplied it's woven into the
 * unconfirmed-email copy so the message names the actual inbox to go look in
 * (specific over generic). Omit it and the copy degrades gracefully to "your
 * inbox" rather than printing "undefined".
 */
export function authErrorCopy(
  error: AuthErrorLike,
  context: AuthContext,
  email?: string,
): AuthErrorCopy {
  const fallbackTitle = FALLBACK_TITLE[context];

  if (isOffline(error)) {
    return {
      title: "Couldn't reach Culprit",
      message: 'Check your connection and try again.',
    };
  }

  if (isEmailNotConfirmed(error)) {
    // Never phrased as a rejection — the account exists and is fine; there's just
    // one step left. The owner is told exactly where to look and what to tap.
    return {
      title: 'One step left',
      message: email
        ? `Confirm your email address first. We sent a link to ${email} — tap it, then sign in.`
        : 'Confirm your email address first. Tap the link we sent you, then sign in.',
    };
  }

  if (isRateLimited(error)) {
    const wait = waitPhrase(error);
    return {
      title: 'Give it a moment',
      message:
        context === 'resend'
          ? `We just sent a link. You can ask for another one ${wait}.`
          : `Too many tries just now. Try again ${wait}.`,
    };
  }

  // Message-text fallbacks for responses that carry no `code`. Older GoTrue
  // versions and some edge paths return message-only, and the generic fallback
  // would otherwise swallow the two commonest failures in the app.
  const text = messageText(error);
  const code =
    error?.code ??
    (text.includes('invalid login credentials')
      ? 'invalid_credentials'
      : text.includes('already registered')
        ? 'user_already_exists'
        : undefined);

  switch (code) {
    case 'invalid_credentials':
      // Deliberately does NOT say which of the two was wrong. Confirming that an
      // email has an account is exactly the enumeration leak Supabase's own
      // "email enumeration protection" setting exists to prevent (B-152's rls
      // dashboard check) — the client must not undo it in its copy.
      return {
        title: "That didn't match",
        message: 'Check your email and password, then try again.',
      };

    case 'weak_password':
      return {
        title: 'Choose a stronger password',
        message: 'Use at least 8 characters.',
      };

    case 'email_address_invalid':
      return {
        title: "That address wasn't accepted",
        message: 'Check it for a typo and try again.',
      };

    case 'user_already_exists':
    case 'email_exists':
      return {
        title: 'You already have an account',
        message: 'That email is already set up. Try logging in instead.',
      };

    case 'signup_disabled':
      return {
        title: "Sign-ups are paused",
        message: 'New accounts are closed right now. Try again later.',
      };

    default:
      // Honest and non-specific, because we genuinely don't know. Crucially this
      // still never leaks the provider string — an owner should never read
      // "AuthApiError" or a status code on a screen in this app.
      // "Something went wrong" is deliberately vague, which Pattern 2 normally
      // forbids — but this branch fires precisely when we DON'T know the cause,
      // and inventing a specific one ("check your connection") would send the
      // owner off fixing the wrong thing. Vague-but-honest beats specific-and-
      // wrong; the action is still concrete.
      return {
        title: fallbackTitle,
        message: 'Something went wrong. Try again in a moment.',
      };
  }
}
