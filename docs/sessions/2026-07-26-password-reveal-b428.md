# Password reveal toggle (B-428) — the row was already half-shipped; the residuals were the real work

**Date:** 2026-07-26

Shipped via #488.

## What the row asked for, and what was actually there

B-428 (filed 2026-07-24 by the B-280 design session's `pm-feature-review`) said login, signup, the reset-password screen and the settings change-password screen all mask input with no reveal toggle, and asked for a reveal on the shared primitive rather than a confirm field.

Reading the code first: **`components/ui/TextField` already had it.** The eye toggle, local `revealed` state so the parent never threads it through, the a11y label flipping between "Show password" / "Hide password", and coexistence with the error state — all present, with tests. `app/(auth)/login.tsx:180` and `app/(auth)/signup.tsx:335` already pass `secureTextEntry` to the primitive. `HEAD` was identical to `origin/main` (0 ahead / 0 behind), so this wasn't a sibling session's uncommitted work — it was in `main`.

No session record in `docs/sessions/` mentions a reveal toggle, and `git log` here is shallow (50 commits, `.git/shallow` present), so the oldest commit touching the file is just the edge of the window, not the origin. **There is no PR number to attribute it to.** The honest read is that the row was filed against a state of the code that had already moved — plausibly the login-consolidation work (#311) that created the primitive in the first place, whose docstring already advertises "a built-in password reveal".

Verified there is no per-screen fork to consolidate: `grep -rl secureTextEntry` over the app returns exactly `components/ui/TextField.tsx`, its test, `login.tsx`, and `signup.tsx`. Nothing hand-rolls a masked input. The reset-password and settings change-password screens **do not exist yet** (B-280 PR 2 / PR 3 unbuilt), so they inherit the toggle for free the moment they use `TextField` — which is the outcome B-428 wanted anyway.

## The two residuals that were real

**1. The 44pt target was met only by overlapping the input.** The glyph is 20pt inside a `paddingLeft: space1` box — 28×20 — propped up to 44×44 by `hitSlop={{top:12,bottom:12,left:8,right:8}}`. The arithmetic works, but the *left* 8pt of slop extends over the sibling `TextInput`, and the toggle wins the z-order. So the last few points of the text field toggled the mask when the owner meant to place the cursor at the end of their password. Fixed by giving the button a real `width/height: 44` flex box with the glyph `alignItems: 'flex-end'` — as a flex sibling it now *claims* 44pt of the row instead of borrowing it, the icon lands optically where the old padding put it (no visual change), and `hitSlop` is gone rather than load-bearing.

The `REVEAL_TARGET = 44` constant exists so the test can assert the **resolved box** rather than re-doing slop arithmetic. That matters: the old geometry would have silently dropped below the floor if anyone trimmed the slop, and nothing would have failed.

**2. Reveal was a mode, not a glance.** It survived backgrounding. An owner who reveals their password to check a typo and then gets interrupted — puts the phone down, hands it over, takes a call — returns to plaintext sitting on screen. Now re-masks via the existing `useAppActive`, which already reads `false` on `'inactive'` (it was built for the B-284 motion budget, and `'inactive'` is exactly the iOS app-switcher transition). One shared `AppState` subscription, not a second one.

Deliberately *not* overclaimed, in the code comment and the PR: the guaranteed win is the **return trip**. The app-switcher snapshot is only narrowed, not protected, because the snapshot is taken around the same resign-active transition this fires on, so the JS re-render may or may not land first. The durable fix there is a native blur overlay, which is not this PR.

No confirm field, per B-428's own reasoning — it costs a tap on every auth screen.

## What broke and how

The third new test (`stays masked after the app returns to the foreground`) failed on first run, reporting the field revealed after a background→foreground round trip. **Test artifact, not a product bug:** I'd hoisted the JSX into a `const field` and passed the same element object to `render()` and both `rerender()` calls. React bails out of re-rendering a referentially identical element, so the component never re-ran and never observed the mocked `useAppActive` flip. Fixed by making it a factory (`const field = () => (...)`) so each render gets a fresh element; the comment in the test says why, because the failure mode is invisible and someone will "tidy" it back.

## Verification

`tsc --noEmit` clean. Full jest suite **139 suites / 2668 cases green**. `TextField.test.tsx` went 10 → 14 cases.

The one thing no unit test can catch here is the z-order overlap — a test can assert the button's box is 44×44, but not that it stopped stealing taps from the input. That check is first in the PR's manual QA script for exactly that reason.

## Base drift, and what it cost

`main` moved **five commits across three repairs** while this one-primitive PR sat open: #484 (portrait compression), then #487/#489/#490 (support-email fallback + Vet Files VF-2/VF-3), then #486 (symptom photo hero). Each was merged in, re-verified, and pushed — the ruleset requires branches up-to-date, so a green PR goes stale on its own.

Every merge was **conflict-free, including `docs/backlog.md`**, which four of those commits also touched. That is the one-row-per-line format earning its keep: four sessions edited the same file and git merged all of it on line boundaries. The duplicate-B-ID check was run *after* the final merge, per the wrap rule, and came back empty (highest live ID 523).

One thing worth noting for anyone sizing a small PR: the Vet Files commits added dependencies, so `npm ci` was needed before the post-merge verification meant anything. Testing against a stale `node_modules` would have produced a green run that CI wouldn't reproduce.

## Note for whoever builds B-280 PR 2 / PR 3

The reset-password and change-password screens get the reveal toggle **for free** by using `TextField` with `secureTextEntry`, including the background re-mask. Don't hand-roll a masked input, and don't add a confirm field without revisiting B-428's reasoning about the per-screen tap cost.
