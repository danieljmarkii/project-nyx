// The Pet-tab deep-link vocabulary — CUL-170.
//
// The Home strips (`TrialStrip` / `MedStrip`) and the Daily Recap's mirrors of them
// are DOORS: "Amoxicillin · day 5 of 14" is meant to open that med's card. Every one
// of them pushed the bare `/(tabs)/profile` route, which lands the owner at the top
// of a profile holding the photo, the conditions, the trial card and every other med
// — so the tap ended in a scroll hunt for the thing they had just tapped.
//
// This module is the whole shared surface of the fix: the caller side builds a href,
// the screen side coerces it back and resolves which row it names. Both sides are
// pure and unit-tested here, so the only thing left in the screen is the scrolling
// itself — the part a test cannot meaningfully assert about a real device.
//
// The href shape (route params + a `ts` nonce) is not invented here: it is the
// shipped doorway pattern from `app/(tabs)/history.tsx`. The nonce is load-bearing
// rather than decoration — a tab persists across switches, so a second tap on the
// SAME strip re-pushes identical params and would otherwise be indistinguishable
// from a re-render, and the door would work exactly once per session.
import { theme } from '../constants/theme';
import { medStripKeyForRegimen } from './medStrip';

/** The sections of the Pet tab a doorway can name. Deliberately a closed set: a
 *  focus that no anchor can service is a scroll to nowhere, so the screen refuses
 *  anything outside it rather than guessing. */
export type ProfileFocus = 'trial' | 'medications';

const PROFILE_FOCUS_VALUES: readonly ProfileFocus[] = ['trial', 'medications'];

export const PROFILE_ROUTE = '/(tabs)/profile' as const;

/** Read a `focus` param back. Anything unrecognised — absent, an array (expo-router
 *  hands back `string[]` for a repeated param), a typo — is `null`, which the screen
 *  renders as the unchanged top-of-profile arrival. A bad link degrades to today's
 *  behaviour, never to a scroll somewhere arbitrary. */
export function coerceProfileFocus(raw: unknown): ProfileFocus | null {
  if (typeof raw !== 'string') return null;
  return PROFILE_FOCUS_VALUES.includes(raw as ProfileFocus) ? (raw as ProfileFocus) : null;
}

export interface ProfileFocusHref {
  pathname: typeof PROFILE_ROUTE;
  params: { focus: ProfileFocus; med?: string; ts: string };
}

/**
 * Build the push argument for a strip's door.
 *
 * `nowMs` is a parameter rather than a `Date.now()` read so this stays pure and the
 * nonce is assertable; every call site passes the clock.
 *
 * `medKey` is the `MedStripModel.key` the tapped strip carries — the same key
 * `medStripKeyForRegimen` mints — so the screen can resolve it back to one row
 * without the strip having to know anything about regimen ids.
 */
export function profileFocusHref(input: {
  focus: ProfileFocus;
  medKey?: string | null;
  nowMs: number;
}): ProfileFocusHref {
  return {
    pathname: PROFILE_ROUTE,
    params: {
      focus: input.focus,
      ...(input.medKey ? { med: input.medKey } : {}),
      ts: String(input.nowMs),
    },
  };
}

/** The minimum a regimen row must expose to be matched to a strip. */
export interface FocusableRegimen {
  id: string;
  medication_item_id: string | null;
  started_at: string;
}

/**
 * Which regimen row does a strip key name?
 *
 * `null` is a real answer, not a failure: a strip can stand for an AD-HOC course —
 * recent doses of a drug with no active regimen behind them (`buildCandidates`'s
 * second loop) — and the Pet tab's "Current medications" card lists active regimens
 * only, so there is genuinely no row to land on. The screen falls back to the
 * section rather than inventing a target.
 *
 * The tie-break mirrors `buildCandidates` exactly: two active regimens for one drug
 * collapse to ONE strip, and that strip describes the most-recently-started of them.
 * Landing on the other one would name a different course than the line the owner
 * read, so this is the same resolution, not a second one.
 */
export function resolveMedAnchorRegimenId(
  regimens: readonly FocusableRegimen[],
  medKey: string | null | undefined,
): string | null {
  if (!medKey) return null;
  let winner: FocusableRegimen | null = null;
  for (const reg of regimens) {
    if (medStripKeyForRegimen(reg) !== medKey) continue;
    if (winner === null || reg.started_at > winner.started_at) winner = reg;
  }
  return winner?.id ?? null;
}

/** Breathing room above the anchored card so it does not sit flush against the
 *  top edge — the arrival should read as "here it is", not as a cut-off screen. */
export const PROFILE_FOCUS_INSET = theme.space2;

/**
 * The scroll offset for a med doorway, composed from the two measured anchors.
 *
 * The composition lives here rather than at the call site because the two anchors
 * are in DIFFERENT coordinate spaces — React Native reports a view's `y` inside its
 * parent, so a med row's is relative to the medications card while the card's is
 * relative to the scroll content. Adding them in a layout callback would be a
 * silent off-by-a-card the moment either one arrived first.
 *
 * The first row is deliberately expressed as the SECTION's top rather than its own:
 * a first row sits roughly a card header below the card's edge, so landing on it
 * would slice the "Current medications" header in half for the single-med household
 * — the common case — and buy nothing, since the row is already the first thing
 * under that header. Every later row lands on itself, where the header is genuinely
 * too far above to be worth keeping.
 *
 * `null` means "not measurable yet" — the caller waits for another layout pass
 * rather than scrolling to a position it is about to invalidate.
 */
export function medFocusScrollY(input: {
  sectionY: number | null;
  /** The row's top RELATIVE to the medications card, or `null` when the strip
   *  names no row on this screen (an ad-hoc course — see
   *  `resolveMedAnchorRegimenId`). */
  rowOffsetY: number | null;
  isFirstRow: boolean;
}): number | null {
  if (input.sectionY === null) return null;
  const anchor =
    input.rowOffsetY === null || input.isFirstRow
      ? input.sectionY
      : input.sectionY + input.rowOffsetY;
  return Math.max(0, anchor - PROFILE_FOCUS_INSET);
}

/** The scroll offset for a single-anchor doorway (the trial card). */
export function focusScrollY(anchorY: number | null): number | null {
  if (anchorY === null) return null;
  return Math.max(0, anchorY - PROFILE_FOCUS_INSET);
}
