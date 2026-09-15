// Turns an unknown thrown value into a short, greppable code for a LOG LINE.
//
// Why this exists (CUL-193 / B-584): `nyx-pet-photos` holds zero objects and
// carries a standing "uploads fail with 42501" open question, so the first real
// pet-photo upload in this product's life is also the first exercise of 047's
// bucket limits. Every failure on that path was logged as one bare error object,
// which made an RLS rejection, a dropped connection and a rejected object
// indistinguishable at a glance — and the standing bug makes "the 42501 bug is
// back" the default misdiagnosis of all three.
//
// Deliberately NOT owner-facing. Nothing this returns may reach a sink an owner
// reads: the codes are provider vocabulary (`42501`, `PGRST116`, a bare HTTP
// status), which is exactly what `guards/ownerFacingCopy.test.ts` exists to keep
// off screen. It goes next to the raw error in a `console.error`, never into an
// Alert — the alert stays the mapped, actionable sentence.
//
// The error shapes it has to survive, all reachable from one `catch`:
//   • StorageApiError  — `statusCode` as a STRING ('413'), plus `status`
//   • PostgrestError   — `code` ('42501', 'PGRST116'), no status
//   • a fetch/network failure — neither, just a message
//   • a plain string, or something that is not an object at all

/** Extracts a short provider code from a thrown value, for logs only. */
export function failureCode(err: unknown): string {
  if (err == null) return 'unknown';
  if (typeof err !== 'object') return String(err);

  const e = err as Record<string, unknown>;

  // Read the code fields in order of how specific they are. `code` first: a
  // Postgrest `42501` says far more than the `400` that carries it, and a
  // Storage error that has both is telling us the same thing twice.
  const code = firstString(e.code, e.statusCode, e.status);
  const name = typeof e.name === 'string' && e.name ? e.name : null;

  if (code && name) return `${name} ${code}`;
  if (code) return code;
  if (name) return name;
  return 'unknown';
}

/**
 * First value that is a non-empty string or a finite number, as a string.
 * Storage reports `statusCode: '413'` while Postgrest reports a numeric-free
 * `code`, and HTTP `status` arrives as a number — so a `typeof x === 'string'`
 * check alone silently drops the status and reports `unknown`.
 */
function firstString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return null;
}
