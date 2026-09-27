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
// not — AND THE ROW MOVED. The second half is the adversarial pass's (CUL-1275): the wait
// can end without anything being written, and two of those endings would otherwise be
// spoken as landings:
//
//   · the GIVE-UP — the realtime watch exhausts its fallback schedule (offline, a dropped
//     socket) with no row, and the section falls to "Not enough to say about this one
//     yet". Spoken, that is a not_enough_to_say verdict over a record that may hold a
//     Worth a call the client simply never heard about;
//   · a re-run the server SKIPS — capped or flag-off with a real analysis already stored,
//     it writes nothing (`_shared/incident-analysis.ts`, "leave it exactly as-is"), the
//     watch re-reads the unchanged row, and the old verdict would be announced as a fresh
//     read — after a photo replacement, a verdict about an image no model has read.
//
// So the row's own change marker (`updated_at`, bumped by trigger on every write — 013) is
// captured when the wait begins, and a fall with the marker unmoved says nothing. What IS
// spoken is what the stage is SHOWING at that instant, reported by the stage itself from a
// layout effect (the arrival's `noteStage` shape, and for the same reason: a child's layout
// effects run before its parent's, so the edge below reads the current line). A landing
// whose branch renders nothing (`read_disabled`, a photoless `not_enough_to_say`) mounts no
// stage, reports nothing, and says nothing — there is nothing on screen to describe.
//
// EVERY RENDERED VERDICT, ONE FORM. "AI read: Worth a call" and "AI read: Keep an eye out"
// are spoken on the same edge in the same shape. G4 holds a Worth a call to the same
// physics as every other read; on the audio channel the same rule has a clinical edge too:
// if only escalations were spoken, a screen-reader owner would learn that silence means the
// read was calm — reassurance by absence, which n=1 never gives (clinical-guardrails). The
// audio follows the SCREEN, though, and one lane is verdict-correlated on screen already: a
// photoless incident renders no section unless it escalates (B-363), so there a
// not_enough_to_say is silent in both channels. That is B-363's rule, not this hook's.
//
// WHAT NEVER SPEAKS: a read that was already in the record when the screen opened (the
// first render seeds the edge closed), and a read that lands while the section is
// unmounted (the owner went back). A screen pushed OVER the record (edit-event) keeps the
// section mounted, so a landing there is still spoken — the same incident, which is right.
// BOTH PLATFORMS: nothing here pairs with an `accessibilityLiveRegion` (the stage is not
// one — it would re-speak on every edit and fold), so an iOS gate copied from
// `useLiveRegionAnnouncement` would ship this exact defect to TalkBack. SignalZone's
// arrival makes the same call for the same reason.
//
// DEVICE QUESTIONS, not settled here: an utterance posted while VoiceOver's focus is on the
// pending box that unmounts in the same commit may be cut off by the focus move; and there
// is no `appActive` gate, so a landing while the app is backgrounded fires its one edge
// into an utterance iOS may drop and nothing replays. Both are for the device pass
// (CUL-556); `announceForAccessibilityWithOptions` is the knob if the first one bites.

import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { AccessibilityInfo } from 'react-native';

/** The stage's report channel: what the landed section says, or null while it waits. */
export interface ReadLandingAnnouncer {
  note: (line: string | null) => void;
  /** The host is about to show a read the owner has not been shown, outside a wait it can
   *  rely on committing (a failed re-run's restore — see the sections' `handleRetry`). The
   *  next movement of the row is a landing, however React batches the writes around it. */
  expectLanding: () => void;
}

/** What is spoken when a read lands: the section's own label, then its first line. */
export function readLandedCopy(line: string): string {
  return `AI read: ${line}`;
}

export function useReadLandingAnnouncement({
  awaitingRead,
  identity,
  version,
}: {
  /** A read is being PRODUCED — the section's `working || status === 'pending'`, the same
   *  fact the arrival reads (never "the pending box is on screen", which is also true
   *  while a local row is merely being read). */
  awaitingRead: boolean;
  /** The incident's identity. A change re-seeds the edge IN THE SAME COMMIT, so a re-key
   *  that lands one incident's read with another's identity is never spoken. That is all
   *  it guards: the sections' async `start()` shares one `cancelled` ref across a re-key,
   *  so they are not pager-safe, and neither is this — every route into the record pushes
   *  a fresh screen today. */
  identity: string;
  /** The row's change marker (`updated_at`), or null with no row. A wait that ends with it
   *  unmoved wrote nothing, and says nothing. */
  version: string | null;
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
  // (the arrival's shape) runs after this layout effect, so a re-key in place could land
  // one incident's fall and the next incident's line in one commit, and speak the wrong
  // read before any reset ran. The arrival can afford that because it self-heals before a
  // frame paints; an utterance cannot be taken back.
  //
  // THE ROW MUST HAVE MOVED. `waitVersion` is what the record held when the wait began —
  // captured on the rising edge, in the same commit that raised it (`start()` writes the
  // server's first read and the flag together; `handleRetry` re-bases on the server's row
  // only when it shows the same read as the screen, so an unseen verdict still counts) —
  // and a fall that finds it unmoved is a give-up or a skipped re-run, never a landing.
  //
  // KNOWN RESIDUALS (adversarial round 3, stated so they do not read as coverage):
  //   · a re-run whose re-base READ fails (`fetchRow` swallows the error) but whose trigger
  //     succeeds and is skipped falls back to the local baseline, so after an owner's own
  //     write the unchanged verdict can be spoken again (the CUL-1324 root: a failed read
  //     is not "no row");
  //   · an armed quiet end, then the owner's own writes, then one more in-flight tick that
  //     reads the row those writes bumped, re-speaks the CURRENT verdict once. Never a
  //     stale or unseen one — the line is what the screen shows.
  // And from round 4: `handleRetry` writes whole rows, so a late tick from an EARLIER watch
  // that lands during the re-run's re-base read can be overwritten by the older row (M2);
  // `showsSameRead` ignores the observation fields, so a new finding under an unchanged
  // verdict lands silently through a skipped re-run (M4 — the audio never carries
  // observations, only the verdict line); and a legacy `status: 'pending'` row as the
  // re-base read could re-park a failed re-run (M5 — the server never writes `pending`).
  // And from round 5: a failed re-run's restore keeps THIS screen's Hide / Show state over
  // the server's, so a Show made on ANOTHER device while this screen held a hidden copy is
  // undone on screen until the next read (P6 — two devices plus a failed trigger).
  // And from round 7, LATENT (unreachable while the trigger and the re-read both cross
  // native I/O): if both ever failed within microtasks, the pending write and a silent
  // restore could commit together against a lingering arm and re-speak the read the owner
  // was already shown (the R7 class). Close it with a quiet-settle on the restore if the
  // trigger ever gains a client-side fast-fail.
  //
  // A QUIET END STAYS ARMED. The watch's give-up can race one last in-flight re-read: the
  // wait has already ended silently when that read commits a Worth a call, and a one-shot
  // edge would never see it — on screen, unspoken (the second adversarial pass, Q3). So a
  // wait that ends with nothing written leaves the edge armed, and the next movement of the
  // row before another wait begins IS the landing. Nothing else moves the local marker
  // outside a wait: the owner's own writes are optimistic and keep it, and only a read from
  // the server (the watch, the first fetch, the re-run's re-base) changes it. The same arm
  // also covers a future `checkResolved` that lets `working` fall a commit before the row.
  const seen = useRef({
    identity,
    awaiting: awaitingRead,
    waitVersion: awaitingRead ? version : null,
    armed: false,
    // The marker as of the last commit this effect saw, so `expectLanding` (called from a
    // handler, between commits) can arm against it.
    version,
  });
  useLayoutEffect(() => {
    const prev = seen.current;
    if (prev.identity !== identity) {
      seen.current = { identity, awaiting: awaitingRead, waitVersion: awaitingRead ? version : null, armed: false, version };
      return;
    }
    if (awaitingRead) {
      // A wait begins (re-based on the row it began over, and disarmed), or continues (the
      // baseline holds, whatever the row does mid-wait).
      seen.current = prev.awaiting
        ? { ...prev, version }
        : { identity, awaiting: true, waitVersion: version, armed: false, version };
      return;
    }
    if (!prev.awaiting && !prev.armed) {
      seen.current = { ...prev, version };
      return;
    }
    if (version === prev.waitVersion) {
      // Ended with nothing written: silent, and armed for a late write.
      seen.current = { identity, awaiting: false, waitVersion: prev.waitVersion, armed: true, version };
      return;
    }
    seen.current = { identity, awaiting: false, waitVersion: version, armed: false, version };
    if (line.current) AccessibilityInfo.announceForAccessibility(readLandedCopy(line.current));
  }, [awaitingRead, identity, version]);

  // THE EXPLICIT HALF (adversarial round 4, F1). A failed re-run marks the row pending and
  // then restores the server's copy; if React batches those two writes into one commit the
  // wait never rises and never falls, and a read the owner has not seen lands unspoken.
  // It holds today only because the trigger always crosses a native task first — a
  // client-side fast-fail (a cap pre-check) would break it silently. So the host says so:
  // arm against the last committed marker, and the next movement speaks. Inside a wait the
  // fall already owns the baseline and this changes nothing.
  const expectLanding = useCallback(() => {
    const cur = seen.current;
    if (cur.awaiting) return;
    seen.current = { ...cur, armed: true, waitVersion: cur.version };
  }, []);

  // Stable across renders: the stage keys its report effects on this object, and a fresh
  // one every render would run the unmount report (null) and the current one on every
  // commit rather than once.
  return useMemo(() => ({ note, expectLanding }), [note, expectLanding]);
}
