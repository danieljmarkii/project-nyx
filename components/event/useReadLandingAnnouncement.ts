// The per-incident read's screen-reader half (CUL-1275). When a read the owner is WAITING
// for lands on the open record, VoiceOver and TalkBack are told what landed.
//
// WHY THIS IS NOT THE ARRIVAL'S EDGE. `useIncidentArrival` (components/motion) answers a
// VISUAL question — should the landing animate? — and two of its gates are right for that
// question and wrong for this one (C-34: same value, different question → two predicates):
//
//   · `suppressed` — a re-analysis after an owner edit swaps UN-animated, because a read
//     the owner corrected "did not arrive, it was answered". It is still new words on a
//     screen the owner cannot see. If the re-read now says Worth a call, silence is the
//     one thing this surface must not do.
//   · the stage's `pending → content` half — the arrival needs a pending box to grow out
//     of. A PHOTOLESS incident never shows one (B-363: the section stays silent while it
//     waits), so a contextual escalation — repeated vomiting, concurrent lethargy —
//     "pops in clean". Riding the arrival would leave exactly that Worth a call unspoken.
//
// So the edge here is the FACT alone: a read was being produced on this mount, and now is
// not. What is spoken is what the stage is SHOWING at that instant, reported by the stage
// itself from a layout effect (the arrival's `noteStage` shape, and for the same reason: a
// child's layout effects run before its parent's, so the edge below reads the current
// line). A landing whose branch renders nothing (`read_disabled`, a photoless
// `not_enough_to_say`) mounts no stage, reports nothing, and says nothing — there is
// nothing on screen to describe.
//
// EVERY VERDICT, ONE FORM. "AI read: Worth a call" and "AI read: Keep an eye out" are
// spoken on the same edge in the same shape. G4 holds a Worth a call to the same physics
// as every other read; on the audio channel the same rule has a clinical edge too: if
// only escalations were spoken, a screen-reader owner would learn that silence means the
// read was calm — reassurance by absence, which n=1 never gives (clinical-guardrails).
//
// WHAT NEVER SPEAKS: a read that was already in the record when the screen opened (the
// first render seeds `wasAwaiting`, so the edge cannot open), and a read that lands after
// the owner has left (the section is unmounted). BOTH PLATFORMS: nothing here pairs with an
// `accessibilityLiveRegion` (the stage is not one — it would re-speak on every edit and
// fold), so an iOS gate copied from `useLiveRegionAnnouncement` would ship this exact
// defect to TalkBack. SignalZone's arrival makes the same call for the same reason.

import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { AccessibilityInfo } from 'react-native';

/** The stage's report channel: what the landed section says, or null while it waits. */
export interface ReadLandingAnnouncer {
  note: (line: string | null) => void;
}

/** What is spoken when a read lands: the section's own label, then its first line. */
export function readLandedCopy(line: string): string {
  return `AI read: ${line}`;
}

export function useReadLandingAnnouncement({
  awaitingRead,
  identity,
}: {
  /** A read is being PRODUCED — the section's `working || status === 'pending'`, the same
   *  fact the arrival reads (never "the pending box is on screen", which is also true
   *  while a local row is merely being read). */
  awaitingRead: boolean;
  /** The incident's identity — a change re-seeds the edge, so a landing for one incident
   *  is never spoken over another. */
  identity: string;
}): ReadLandingAnnouncer {
  const line = useRef<string | null>(null);
  const note = useCallback((next: string | null) => {
    line.current = next;
  }, []);

  // Seeded from the first render, so a read already in the record on open is never a
  // landing. A LAYOUT effect so it runs in the commit the row lands in, after the stage's
  // own layout effect has reported what that commit shows.
  //
  // The incident's identity is read in the SAME effect, not a sibling one. A passive reset
  // (the arrival's shape) runs after this layout effect, so a host that re-keyed the hook in
  // place — an incident pager — could land one incident's fall and the next incident's line
  // in one commit, and speak the wrong read before any reset ran. The arrival can afford
  // that because it self-heals before a frame paints; an utterance cannot be taken back.
  const seen = useRef({ identity, awaiting: awaitingRead });
  useLayoutEffect(() => {
    const prev = seen.current;
    seen.current = { identity, awaiting: awaitingRead };
    if (prev.identity !== identity) return;
    if (!prev.awaiting || awaitingRead) return;
    if (line.current) AccessibilityInfo.announceForAccessibility(readLandedCopy(line.current));
  }, [awaitingRead, identity]);

  // Stable across renders: the stage keys its report effects on this object, and a fresh
  // one every render would run the unmount report (null) and the current one on every
  // commit rather than once.
  return useMemo(() => ({ note }), [note]);
}
