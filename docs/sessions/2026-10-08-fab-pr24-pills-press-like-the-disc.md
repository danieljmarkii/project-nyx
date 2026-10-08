# FAB PR-24: the pills press like the disc, and the food pill's spinner goes

**Date:** 2026-10-08
**One thing:** D4 L1 — A test that passes before the feature exists has proven nothing · check: pending

Dispatched build of CUL-1645 (PM ruling D3, CUL-1625 brief), shipped via #1111.

**What shipped.** The fan's six pills were `TouchableOpacity` at 70%, so Home showed through a pressed pill. A `FanPill` in `components/log/FAB.tsx` now settles each to 0.97 with the neutral pressed fill (`colorSurfaceSubtle`, the ground the app's other rows press to) on touch down, on the disc's own springs (now shared constants, values unchanged) and the native driver. Under Reduce Motion the fill alone answers and the pill carries no transform. The food pill's `WhorlSpinner` is gone: the pill holds its pressed state through the local write instead (`held`). The animation follows the pressed *state*, not the handlers, so the finger lifting and the write starting batch into one render and the pill never springs up for a frame between them. The `logging` guard, `whileOpen`, `disabled` during a write and C-5's separate hit areas are untouched; the scale is a transform, so it moves no geometry.

**What broke and how it was caught.** The first run of the new suite was green over a missing feature: the edit that should have passed `held` to the food pill never landed (its anchor did not match), and the hold test still passed, because RNTL refuses events on a disabled element and the pill turns disabled the moment its write starts. The release event the test sent after the press was silently dropped, so the finger never "lifted" and the fill stayed for the wrong reason. Mutation caught it (removing `held` from the component left the test green). The test now sends the release before the press, the order Pressability fires them on a real lift; it then failed against the real code, which exposed the missing prop. Both are fixed and the test reds on the mutation.

**Proof.** Against the pre-PR `FAB.tsx` the five motion, fill and hold tests fail. Dropping `held`, scaling under Reduce Motion, and adding `hitSlop` to the pill each red their own test. `tsc` clean; the full jest run is 612 suites, 14,377 tests green; CI green on the head.

**Residual.** `lib/fanBudget.ts:35` still mentions "the spinner a logging food shows"; the file was out of this row's lane, so the stale comment stays for whoever next touches the budget. The feel of 0.97 and the pressed grey on the indigo-veiled fan is the device pass's call.

## Teach

### D4, L1: a test that passes before the feature exists has proven nothing

A test is a small program that checks the app behaves a certain way. It only earns trust if it would fail when the behaviour is missing. So after writing one, you break the code on purpose and watch the test go red. If it stays green, the test is checking something else.

**Like:** a smoke alarm you test by pressing its button. The button only proves the speaker works. To know it smells smoke, you have to hold a match under it.

**In today's work:** `components/log/FAB.test.tsx`, the hold test
```
fireEvent(view.getByText(/Hills/), 'pressIn');   // finger down on the food pill
fireEvent(view.getByText(/Hills/), 'pressOut');  // finger up (now sent BEFORE the press)
fireEvent.press(view.getByText(/Hills/));        // the tap: the meal write starts
```
The first draft sent the finger up *after* the tap. By then the pill was disabled for the write, the test library threw the event away, and the pill looked pressed only because the finger never lifted. The test was green while the feature it named did not exist.

**Why it matters to you as PM:** "tests pass" is a claim about the tests, not the feature; the mutation line in a PR body is what tells you a test can actually fail.

**Check:** If someone deleted the line that keeps the food pill pressed during the write, which of the two versions of this test would have told you, and why would the other stay quiet?
