// The in-context Daily Recap offer — the decision + its local markers (daily-recap
// DR-3 / CUL-26, spec §4 / R-6). The banner that appears on an IN-APP visit to the
// Daily Recap while the recap notification is off, asking whether Culprit may send
// the 9pm summary — and re-appears once at the next real value moment (starting a
// trial or a med course).
//
// A pure-core + AsyncStorage-shell split, the lib/recoveryMarker precedent:
//   • the decision (`shouldOfferDailyRecap`) and the arrival classifier
//     (`isNotificationArrival`) are PURE and unit-tested with no I/O in sight;
//   • the markers (quiet-until + the two once-ever value-moment flags) live in
//     AsyncStorage — account state OUTSIDE SQLite, so `clearDailyRecapOffer` is
//     wired into `wipeLocalSession` (lib/session.ts) BY NAME, or the next account
//     on a shared device inherits the previous owner's "already offered" state.
//
// TWO GATES THE OFFER HONORS BY CONSTRUCTION (§4):
//   • It is shown ONLY on an IN-APP arrival — never a notification-tap arrival
//     (`shouldOfferDailyRecap` refuses `arrival: 'notification'`). Pitching the
//     notification to someone who just tapped one is nonsense.
//   • "Turn on" is PRIMER-GATED, ALWAYS: the OS permission prompt is unreachable
//     from the banner directly (the screen wires the banner's confirm to the
//     primer, never to `ensurePermission(true)` — the consent-path invariant). This
//     module owns the eligibility markers; the wiring lives in the hook/screen.
//
// OS-DENIED ACCOUNTS NEVER SEE IT: `shouldOfferDailyRecap` returns false for a
// denied permission (Settings owns that recovery, spec §4). A value moment can lift
// the quiet, but the denied gate still refuses — a lifted-quiet-but-denied account
// is offered nothing.

import AsyncStorage from '@react-native-async-storage/async-storage';
// Type-only — erased at compile time, so this file never pulls expo-notifications
// (and stays runnable for real in lib/session.test.ts's AsyncStorage-backed suite).
import type { NotificationPermission } from './notifications';

const STORAGE_KEY = 'nyx.dailyRecapOffer';

// The quiet window a "Not now" dismissal buys. 30 days: long enough that the offer
// is not a nag (Principle 4's spirit — this is an in-app banner, not a nudge, but
// the restraint is the same), short enough that an owner who dismissed once still
// gets asked again in a new season of their pet's care.
export const OFFER_QUIET_MS = 30 * 24 * 60 * 60 * 1000;

/** How the owner reached the Daily Recap screen. The offer is IN-APP-only. */
export type OfferArrival = 'in_app' | 'notification';

/** The two moments that each re-surface the offer once, ever — starting a diet
 *  trial or a medication course (spec §4, "their own markers"). */
export type OfferValueMoment = 'trial' | 'med_course';

/**
 * The persisted offer state. All fields optional; absence is the default (never
 * dismissed, no value moment spent).
 */
export interface DailyRecapOfferState {
  /** Epoch ms until which the banner is suppressed after a "Not now" dismiss. A
   *  value moment DELETES this (lifts the quiet); enabling the recap makes it moot
   *  (the category-enabled gate wins). Absent = not quieted. */
  quietUntilMs?: number;
  /** The trial-start value moment has already re-surfaced the offer once — so it
   *  never fires again, whatever future trials the owner starts (once ever). */
  trialMomentUsed?: boolean;
  /** The med-course-start value moment, same once-ever contract, its own marker. */
  medMomentUsed?: boolean;
}

/**
 * The banner's copy — LOCKED verbatim from the spec (§4 / R-6) and the design mock
 * (`docs/culprit-daily-recap-mockups.html`, section 3). Centralized here so the
 * `nyx-voice` gate has one place to read and a test can assert the exact strings.
 * No exclamation marks; the body speaks to the RITUAL, never asserts the record.
 */
export const DAILY_RECAP_OFFER_COPY = {
  body: 'Culprit can let you know each evening when the day’s record is ready.',
  turnOn: 'Turn on',
  notNow: 'Not now',
} as const;

// ── The arrival classifier (pure) ────────────────────────────────────────────
//
// A notification tap opens /day-summary with a `source: 'notification'` param
// (useNotificationScheduling) and, when the OS delivery instant is readable, a
// `firedAt` param (B-672's fire-day anchor). EITHER marks a notification arrival —
// `source` is the primary signal, `firedAt` a belt-and-braces fallback for the rare
// tap whose delivery instant did not normalize. Anything else is an in-app visit.
// Kept strict (a real, positive `firedAt`) so a stray empty param never mis-flags
// an in-app visit as a tap and silences the offer where it should appear.
export function isNotificationArrival(params: {
  firedAt?: string | string[] | null;
  source?: string | string[] | null;
}): boolean {
  const source = Array.isArray(params.source) ? params.source[0] : params.source;
  if (source === 'notification') return true;
  const firedAt = Array.isArray(params.firedAt) ? params.firedAt[0] : params.firedAt;
  if (typeof firedAt !== 'string') return false;
  const n = Number(firedAt);
  return Number.isFinite(n) && n > 0;
}

// ── The decision (pure) ──────────────────────────────────────────────────────

/**
 * Show the in-context offer? PURE and total. The eligibility rule of §4:
 *   • IN-APP arrivals only — never over a notification-tap arrival;
 *   • the recap category must be OFF (an opted-in owner has nothing to offer);
 *   • OS permission must NOT be denied (Settings owns that recovery — a denied
 *     account never sees the banner, whatever else is true);
 *   • the quiet window (a prior "Not now") must not be active. A value moment lifts
 *     the quiet by clearing `quietUntilMs`, so this reads the marker as-is and the
 *     lift is expressed as the absence of a live quiet.
 */
export function shouldOfferDailyRecap(input: {
  arrival: OfferArrival;
  /** The `daily_summary` product opt-in (readCategoryEnabled). */
  categoryEnabled: boolean;
  permission: NotificationPermission;
  quietUntilMs: number | null | undefined;
  nowMs: number;
}): boolean {
  if (input.arrival !== 'in_app') return false; // never on a notification-tap arrival
  if (input.categoryEnabled) return false; // already on — nothing to offer
  if (input.permission === 'denied') return false; // OS-denied never sees it (§4)
  if (input.quietUntilMs != null && input.nowMs < input.quietUntilMs) return false; // quieted
  return true;
}

// ── The markers (AsyncStorage) ───────────────────────────────────────────────

/** Coerce a stored blob into a well-formed state. A half-written or format-changed
 *  blob reads as the empty default (fail toward "offer eligible", never toward a
 *  stuck quiet). Pure, so it is unit-tested directly. */
export function coerceOfferState(value: unknown): DailyRecapOfferState {
  if (!value || typeof value !== 'object') return {};
  const v = value as Record<string, unknown>;
  const out: DailyRecapOfferState = {};
  if (typeof v.quietUntilMs === 'number' && Number.isFinite(v.quietUntilMs)) {
    out.quietUntilMs = v.quietUntilMs;
  }
  if (v.trialMomentUsed === true) out.trialMomentUsed = true;
  if (v.medMomentUsed === true) out.medMomentUsed = true;
  return out;
}

/** The stored offer state, or the empty default when absent/unreadable. */
export async function readOfferState(): Promise<DailyRecapOfferState> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return coerceOfferState(JSON.parse(raw));
  } catch {
    // A corrupt blob reads as "no marker" — self-healing on the next write rather
    // than throwing on every screen open forever.
    return {};
  }
}

/**
 * Dismiss the offer for 30 days (the banner's "Not now" — spec §4). Read-modify-
 * write so the value-moment flags are preserved. Best-effort: a failed write leaves
 * the banner un-quieted (it re-appears next visit), which is the safe direction — an
 * offer shown twice beats a dismiss that silently never took.
 */
export async function quietDailyRecapOffer(nowMs: number = Date.now()): Promise<void> {
  try {
    const state = await readOfferState();
    const next: DailyRecapOfferState = { ...state, quietUntilMs: nowMs + OFFER_QUIET_MS };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (e) {
    console.warn('[dailyRecapOffer] quiet write failed:', e);
  }
}

/**
 * Re-surface the offer for a value moment — ONCE, EVER, per moment kind (spec §4).
 *
 * Called from the trial-start and med-course-start WRITE PATHS (not the call sites —
 * the next surface to start a course won't know the offer exists, the
 * `notifyTrialChanged` precedent). If this moment's marker is already set, it is a
 * no-op — a second trial never re-nags. Otherwise it marks the moment used AND
 * clears the quiet window, so the NEXT in-app visit re-offers (subject to the
 * off/not-denied gates, which still decide whether the banner actually shows — a
 * lifted quiet over a denied or already-on account offers nothing).
 *
 * Best-effort: a bookkeeping write must never throw into a save handler.
 */
export async function surfaceOfferForValueMoment(moment: OfferValueMoment): Promise<void> {
  try {
    const state = await readOfferState();
    const key = moment === 'trial' ? 'trialMomentUsed' : 'medMomentUsed';
    if (state[key]) return; // once ever — a later trial/course never re-nags
    const next: DailyRecapOfferState = { ...state, [key]: true };
    delete next.quietUntilMs; // lift the quiet so the next in-app visit re-offers
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (e) {
    console.warn('[dailyRecapOffer] value-moment surface failed:', e);
  }
}

/**
 * Wipe the offer markers on sign-out (the CLAUDE.md rule for account state outside
 * SQLite — parity with clearTrialHeadsUpLedger / clearNotificationInteractions).
 * Without this, the next account on a shared device inherits "already offered /
 * quieted for 30 days" and never sees a banner it should. Best-effort.
 */
export async function clearDailyRecapOffer(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('[dailyRecapOffer] clear failed:', e);
  }
}
