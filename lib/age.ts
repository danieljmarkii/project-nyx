// Age ⇄ date-of-birth transforms + honest display (B-251 PR 9, onboarding age step).
//
// The clinical-honesty contract this module exists to enforce (spec §3.6 / §4 S2,
// migration 028): a pet's age can be given two ways — a witnessed birthday the
// owner picked on a calendar (precision 'exact'), or an approximate age like
// "~2 years" for a rescue whose birthday nobody knows (precision 'approximate').
// Both resolve to a single `date_of_birth`, but an approximate DOB is a COMPUTED
// anchor (today − the entered duration, S6), NOT a real birthday — so no surface
// may ever render it as a witnessed birth date. Centralising both the write
// transforms AND the display helpers here gives that rule one tested home; the
// screens (onboarding age, Profile, EditPetModal) call these, never re-derive.

export type DobPrecision = 'exact' | 'approximate';

export interface DobResult {
  /** DATE column value, 'YYYY-MM-DD'. */
  dateOfBirth: string;
  precision: DobPrecision;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Format the LOCAL calendar date of `date` as 'YYYY-MM-DD' (no time, no TZ shift). */
export function dateToYmd(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function parseYmd(dob: string): { y: number; mIndex: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!m) return null;
  const y = Number(m[1]);
  const mIndex = Number(m[2]) - 1;
  const d = Number(m[3]);
  if (mIndex < 0 || mIndex > 11 || d < 1 || d > 31) return null;
  return { y, mIndex, d };
}

/**
 * An entered integer age → an ANCHORED, APPROXIMATE date of birth: `now` minus the
 * duration (S6 anchor convention — "today − entered duration"). The day is clamped
 * to the target month's length so e.g. anchoring off Mar 31 never rolls forward a
 * few days. Precision is always 'approximate' — the returned date is a computed
 * stand-in, never a witnessed birthday (see the module contract).
 */
export function ageToDob(years: number, months: number, now: Date = new Date()): DobResult {
  const totalMonths = Math.max(0, Math.trunc(years) * 12 + Math.trunc(months));
  const targetAbs = now.getFullYear() * 12 + now.getMonth() - totalMonths;
  const ty = Math.floor(targetAbs / 12);
  const tmIndex = targetAbs - ty * 12; // 0–11, non-negative because ty is floored
  // Last day of the target month (day 0 of the next month) — clamp so the anchor
  // never overflows into the following month (Mar 31 − 1mo → Feb 28/29, not Mar 3).
  const lastDay = new Date(ty, tmIndex + 1, 0).getDate();
  const td = Math.min(now.getDate(), lastDay);
  return { dateOfBirth: `${ty}-${pad2(tmIndex + 1)}-${pad2(td)}`, precision: 'approximate' };
}

/**
 * A birthday the owner picked on a calendar → an EXACT date of birth. The stored
 * value is the local calendar date they chose (dateToYmd), so it round-trips to
 * the same day regardless of timezone.
 */
export function birthdayToDob(date: Date): DobResult {
  return { dateOfBirth: dateToYmd(date), precision: 'exact' };
}

/**
 * Honest age string for display (Profile chip, EditPetModal). Mirrors the compact
 * "2yr 3mo" / "5mo" / "Under 1mo" format the Profile already used, but an
 * APPROXIMATE age is prefixed with "~" so it never reads as a precise age. Null /
 * unparseable / future DOB → "—". The birthday itself is never shown here — this
 * is a derived age, honest for both precisions.
 */
export function formatAge(
  dob: string | null,
  precision: DobPrecision = 'exact',
  now: Date = new Date(),
): string {
  if (!dob) return '—';
  const parts = parseYmd(dob);
  if (!parts) return '—';
  const totalMonths =
    (now.getFullYear() - parts.y) * 12 + (now.getMonth() - parts.mIndex);
  if (totalMonths < 0) return '—';
  const prefix = precision === 'approximate' ? '~' : '';
  if (totalMonths < 1) return `${prefix}Under 1mo`;
  if (totalMonths < 12) return `${prefix}${totalMonths}mo`;
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  return `${prefix}${months > 0 ? `${years}yr ${months}mo` : `${years}yr`}`;
}

/**
 * Honest date-of-birth field value for an EDIT surface (EditPetModal), where the
 * stored date itself is shown (not just a derived age). An EXACT DOB renders the
 * full calendar date ("January 15, 2020"); an APPROXIMATE one renders only the
 * anchored month/year behind an "About" hedge ("About April 2024") and drops the
 * fabricated day — the honesty contract: never present a computed anchor as a
 * witnessed birthday. Null / unparseable → null (caller shows its own "Not set").
 */
export function formatBirthdayField(
  dob: string | null,
  precision: DobPrecision = 'exact',
): string | null {
  if (!dob) return null;
  const parts = parseYmd(dob);
  if (!parts) return null;
  const monthName = MONTH_NAMES[parts.mIndex];
  if (precision === 'approximate') return `About ${monthName} ${parts.y}`;
  return `${monthName} ${parts.d}, ${parts.y}`;
}
