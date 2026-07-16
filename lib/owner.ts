// Owner-identity presentation helpers for the "You"/settings surface (B-283).
// Kept pure (no expo-constants, no React, no I/O) so the monogram derivation is
// unit-testable and shared verbatim by the Home-header avatar (§4.1) and the
// You-screen identity header (§4.2) — one place decides "what letter shows".

// The monogram letter for the owner avatar (spec §D10): the owner's initial,
// derived from the account email. Returns the FIRST alphanumeric character of
// the email, uppercased — so "danieljmarkii@gmail.com" → "D" and a leading
// stray "." or "+" is skipped rather than rendered. Returns null when there is
// no readable initial (no email, or nothing alphanumeric before/at the start),
// which the avatar reads as "show the neutral person glyph instead" (§4.5) — a
// monogram is never fabricated from punctuation.
export function ownerInitial(email: string | null | undefined): string | null {
  const trimmed = (email ?? '').trim();
  for (const ch of trimmed) {
    // ASCII letter/digit only — an accented or non-Latin first char would render
    // fine, but we keep the monogram to the unambiguous set and fall back to the
    // glyph otherwise (calmer than a mojibake letter on a tinted disc).
    if (/[a-z0-9]/i.test(ch)) return ch.toUpperCase();
  }
  return null;
}
