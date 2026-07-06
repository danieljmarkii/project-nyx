// Pure, offline-testable validation for the auth / account-creation forms
// (B-251 PR 6). Kept out of the screen component so the rules have a small
// unit-tested seam and can be reused by the login screen later.
//
// Calm-by-design (Principle 4 / the TextField's calm error state): each function
// returns a specific, warm message string — or null when the field is fine —
// never a bare boolean alarm. The caller decides WHEN to surface it (on submit,
// not on the first keystroke), so a half-typed email is never scolded mid-word.

// Client-side minimum password length. The Supabase server enforces the project's
// configured minimum independently; if the server rejects a shorter password the
// signUp error still surfaces to the user. 8 is the store-readiness floor and is
// >= Supabase's default of 6, so a password we accept on the client is never one a
// default-configured server would reject — the safe direction for the mismatch
// (client stricter than server, never more lenient).
export const MIN_PASSWORD_LENGTH = 8;

// Deliberately liberal: a single "@" with a non-empty local part and a dotted
// domain. We are NOT trying to fully validate RFC 5322 (impossible, and
// user-hostile) — only to catch the obvious typo ("no @", "trailing @", "no dot")
// before a network round-trip. The real authority on a working address is the
// confirmation email actually arriving.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

// Null when valid; otherwise a calm, specific message.
export function emailError(email: string): string | null {
  if (!email.trim()) return 'Enter your email address';
  if (!isValidEmail(email)) return "That doesn't look like an email address";
  return null;
}

export function passwordError(password: string): string | null {
  if (!password) return 'Choose a password';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  return null;
}

// A required free-text name field (first / last). Non-empty after trim is the only
// rule — we do not police what a real name looks like (mononyms, non-Latin scripts,
// hyphens all pass). The message names the specific field so a two-field row is
// unambiguous about which one to fix.
export function requiredNameError(value: string, label: string): string | null {
  return value.trim() ? null : `Add your ${label}`;
}
