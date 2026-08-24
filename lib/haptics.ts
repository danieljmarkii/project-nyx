// The haptic vocabulary (CUL-604 · `docs/nyx-app-polish-requirements.md` §5.6, D7).
//
// One module, one verb per moment, so a haptic is chosen by WHAT HAPPENED rather than by
// whichever `expo-haptics` constant a call site reached for. Call sites name the
// moment (`commitSymptom`), never the pattern (`impactAsync(Soft)`) — which is what
// keeps the tone rules below enforceable at review time instead of scattered across
// a dozen screens as raw constants that all look interchangeable.
//
// THE TWO LOAD-BEARING RULES, both of them tone rules rather than ergonomics:
//
//   1. A SYMPTOM COMMIT IS NOT A SUCCESS. `commitRoutine` plays the system success
//      notification — the soft double-tap owners already read as "done, nicely."
//      `commitSymptom` plays a single soft impact instead. A 2am vomit log is
//      acknowledged, never congratulated (Principle 4; the same reasoning that gives
//      CompletionMoment its 'calm' tone and withholds the gold glow). These two must
//      never be collapsed into one verb "because both are commits."
//
//   2. SILENCE ON SAFETY, BY RULE. A safety card arriving, or a red-flag AI read
//      landing, gets NO haptic — deliberately. Plainness is the severity signal
//      (`nyx-signal-home-requirements.md` S1), and a buzz on bad news is the phone
//      rewarding the owner for it. This is enforced STRUCTURALLY rather than by
//      memory: there is no verb here that a safety surface could call, and
//      `guards/haptics.test.ts` fails the build if one of those surfaces imports
//      this module at all. `SignalZone.tsx` carries the codebase's one exemption
//      from that scan (CUL-601), and pays for it with a gate: see `insightArrival`.
//
// THE TABLE THIS IMPLEMENTS is §5.6's seven rows (six verbs + the deliberate silence).
// `insightArrival` is CUL-601's addition — §4's arrival moment needs a tap, and §5.6's
// own rule forbids a call site reaching past this module for one.
//
// COSMETIC, NEVER FATAL. Every verb is fire-and-forget with its rejection swallowed.
// A haptic is decoration on a health write: if the taptic engine is busy, absent, or
// the platform has no such API, the log must still land. No verb returns a promise
// a caller could accidentally await into its write path.
//
// PLATFORM. iOS honours the owner's system haptic setting for free (the OS drops the
// call when System Haptics is off), so there is no in-app toggle to build here. On
// Android the impact/notification/selection APIs map onto the vibrator; on web there
// is nothing to play, so every verb is a no-op there.

import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

// Web has no haptic API at all. Checked once at module scope rather than per call —
// the platform does not change at runtime.
const SUPPORTED = Platform.OS === 'ios' || Platform.OS === 'android';

/**
 * Run one haptic without ever letting it reach the caller's control flow.
 *
 * Deliberately returns `void`, not the promise: the callers are log-commit paths and
 * gesture handlers, and a verb that returned a promise would eventually be awaited
 * inside a write — putting a cosmetic effect on the critical path of a health record.
 * The rejection is swallowed with a debug-level note; a failed buzz is not an event
 * worth an owner-facing word, or even a console warning on a busy device.
 */
function play(run: () => Promise<void>): void {
  if (!SUPPORTED) return;
  try {
    run().catch(() => {
      // Intentionally silent — see above.
    });
  } catch {
    // A synchronous throw (module missing in a bare/dev context) is the same non-event.
  }
}

/**
 * A meal, a dose, or any routine non-symptom commit landed.
 *
 * The system SUCCESS notification — a soft double-tap. Confirming the act of tracking
 * is a small, earned reward on these paths (B-063's "earned completion surface"),
 * and this is the audible half of the same beat.
 */
export function commitRoutine(): void {
  play(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/**
 * A symptom commit landed — vomit, loose stool, lethargy, itch.
 *
 * A SINGLE SOFT TAP, never the success pattern (rule 1 above). The owner gets a clear
 * "that's recorded" without the phone celebrating a worrying event. Pairs with the
 * 'calm' visual tone, which withholds the gold glow for exactly the same reason.
 */
export function commitSymptom(): void {
  play(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft));
}

/**
 * A chip picked up on a completion card — intake (WSAVA), adherence, vehicle.
 *
 * The selection tick: the lightest verb in the set, because these rows are answered
 * in bursts (nine chips can sit on one dose card) and anything heavier turns
 * confirm-over-entry into a drum solo.
 */
export function selectChip(): void {
  play(() => Haptics.selectionAsync());
}

/**
 * A menu-class interaction — opening the FAB, or picking a pet in the switcher.
 *
 * Light impact: it marks a navigational move, not a commitment. Same verb for both
 * because they are the same gesture class, and a pet switch is emphatically NOT a
 * commit (nothing is written).
 *
 * Note the two call sites sit at different points on purpose: the FAB fires on OPEN
 * (the menu appearing is the event), while the switcher fires on SELECT rather than on
 * the sheet appearing — the switch is the thing worth marking there, and the sheet
 * already announces itself by sliding up.
 */
export function openMenu(): void {
  play(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/**
 * A pull-to-refresh crossed its threshold and a refresh actually began.
 *
 * Light impact — the standard platform idiom for "the gesture took." Fired from the
 * `onRefresh` callback, which is the threshold: RN only calls it once the pull is
 * committed, so this cannot fire on an abandoned half-pull.
 */
export function pullThreshold(): void {
  play(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/**
 * A destructive action was CONFIRMED — Remove an event, End a trial, delete a vet
 * document, and (once CUL-612 lands) Undo.
 *
 * Rigid: the firmest verb here, and the only one that maps to removal. It fires on
 * the CONFIRM, never on the button that opens the confirm — a haptic on "Remove…"
 * would say something was destroyed while the owner still has a Cancel in front of
 * them. Undo is destructive in this sense too: it soft-deletes a just-written row.
 *
 * It marks the GESTURE, not the write's outcome: it fires as the owner confirms, so a
 * delete that then fails has already buzzed. Deliberate — the alternative is a
 * confirmed tap that feels like nothing for as long as the write takes, which reads as
 * a dropped tap and invites a second one. The failure path is owned by its own alert
 * copy, which is where an owner learns the row is still there. Revisit only if Design
 * decides the haptic should follow the outcome.
 */
export function destructiveConfirm(): void {
  play(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid));
}

/**
 * The first insight arrived — the once-ever dawn sweep on the Signal card
 * (CUL-601 · `docs/nyx-app-polish-requirements.md` §4).
 *
 * The system SUCCESS notification, matching §4's "one soft success tap at 900ms",
 * fired at the sweep's end rather than at its start: the tap punctuates the moment,
 * it does not announce it.
 *
 * WHY THIS IS ITS OWN VERB rather than a reuse of `commitRoutine`. Nothing was
 * committed here — the owner did not act at all; the engine finished thinking. The
 * two moments happen to share a pattern today, and a call site reading
 * `commitRoutine()` on the Signal card would be a small lie that survives every
 * future retune of either one. The module's whole premise is that a verb names the
 * MOMENT, so a new moment gets a new verb even when the payload matches.
 *
 * THIS DOES NOT BREAK RULE 2 (silence on safety), and the reason is a gate rather
 * than an intention: the arrival never plays when a safety finding is in the set —
 * the card appears plainly and instantly instead (§4 "never for a safety finding";
 * S1 plainness is the severity signal). The caller reaches this line only on the
 * non-safety path, and `SignalZone.test.tsx` holds that a safety-led first arrival
 * plays nothing at all. That gate is also why `components/home/SignalZone.tsx`
 * carries the one `haptics-guard-ok` exemption in the codebase.
 */
export function insightArrival(): void {
  play(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

// The moment with NO verb — a safety card arriving, a red-flag read landing — is last
// on purpose. See rule 2 in the header: the absence is the feature, and adding a
// `safetyArrival()` here would be the whole mistake. If a future surface needs to mark
// a safety arrival, the answer is a visual/copy decision, not a haptic.
//
// Note that `insightArrival` above is NOT a hole in that rule: it is the arrival of an
// insight the safety gate has already excluded, not the arrival of a safety card. The
// two are one line apart in the source and must stay a whole category apart in the head.
