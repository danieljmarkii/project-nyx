# Beta features PR 4 — voice pass + resolve the round-1 open items

**Date:** 2026-08-09

**Shipped via #614** (merged at wrap, at the PM's request). The nyx-voice + pm-feature-review copy/legibility pass over the Beta features shelf (B-712, Phase 2, final PR). Closes the three round-1 open items and folds the product review's cheap legibility fixes. No schema, no new secret, no clinical/statistical logic — reuses the `app_config` allowlist (Gate 1) and the local opt-in store (Gate 2) from PRs 1–3.

## What shipped

**OPEN-1 (name) → "Beta features".** The plainest, most honest label — every owner reads "beta" as *unfinished, may change*, which is exactly the expectation the program needs to set (nyx-voice Pattern 5). "Labs" is dev-culture jargon (wrong register for a calm pet-health app — the benchmark is Calm/Oura, not a developer tool); "Early access" pre-optimises for a Premium future D1 explicitly deferred and carries a subtle "you're first in line" promise "beta" doesn't. Already the mock's + the code's word, so zero churn; if Premium reframes it later, renaming is a one-string change. **This is the team's recommendation, surfaced as PM-overridable before submission** (a name is ultimately the PM's call; the code already reflects the recommendation so nothing is blocked either way).

**OPEN-2 ("N on" count) → shipped, minimal.** A quiet accent-ink trailing note on the Settings → Beta features row (`app/settings.tsx`), counting betas that are **eligible ∧ opted-in** — never a beta opted-in-but-killed (the widget path has already stopped publishing for that account, so the row must not claim it's on). **Hidden at 0** so an eligible owner who's turned nothing on sees a clean doorway, not a deadening "0 on" (Principle 5). The count is folded into the row's `accessibilityLabel` ("Beta features, 1 on") so a screen reader announces it rather than the decorative trailing `Text`. Implemented as a direct read (`betaEligible && widgetOptedIn ? 1 : 0`) mirroring PR 3's own hardcoded `betaEligible` pattern — one beta in v1; the comment names the exact fold-point for when a second beta lands (and, per code-review, warns that the future registry count must bulk-read each store once and reduce in plain JS, not call a hook per `BETA_REGISTRY` entry — rules-of-hooks).

**OPEN-3 (feedback) → confirmed already resolved by D8** — reuse Settings → Support "Share feedback"; no change. Recorded for completeness.

**Softened the widget on-state hint** (`app/settings/beta.tsx`, `presentationFor`). It read as a flat to-do ("To add it, touch and hold your home screen…") that was wrong for an owner who'd already added the widget. Now conditional and carried through to a *placed* widget:

> It's on. If it isn't on your home screen yet, touch and hold an empty area, tap +, then find Culprit and add it.

## pm-feature-review (both flows SHIP-SHAPED) — fixes folded in

- **Swapped the hint's leading `+` glyph for an info mark.** A "+" in an accent tile reads as a tappable "add" affordance on a row whose whole job is "go do this yourself" — and the `View` is non-interactive. The "+" step stays *in the text*, where it names the real iOS button.
- **Folded "beta" into the card switch's accessibility label** ("Home screen widget, beta") — the pill is a separate `Text`, and the control shouldn't rely on adjacency to say what kind of feature it gates.
- **Completed the add-widget instruction** ("…find Culprit and add it") rather than stopping at the gallery search, so a first-timer isn't stranded.

Three review findings were routed to the backlog rather than built (proportionate — v1 is one beta, reachable only via an eligibility-gated row):

- **B-729** (Next) — designed zero-card shelf empty state for the mid-session eligibility-loss race (all cards self-gate away → intro promises an action with no card to act on). _(Filed as B-727; renumbered to B-729 at the merge from `main` — #616 took B-727/B-728.)_
- **B-730** (Later) — platform-guard the iOS-only hint copy (or assert an iOS-only cohort).
- The off-toggle / kill-path widget-door finding **maps to the existing B-725** (the not-live widget door) — no duplicate row added.

## Reviews / gates

- **nyx-voice** — applied to every string (intro, blurb, hint, honesty note, the row sublabel). Warm, honest, reversible, specific, no exclamation, plain language.
- **pm-feature-review** — both flows **SHIP-SHAPED**; two legibility fixes folded in; three follow-ups backlogged. It flagged four device-pass items (the actual iOS gesture, the +-glyph tappability, the toggle-off widget state, cold-start flicker) — the static read can't close these; they need the on-device pass.
- **code-reviewer** — **ship-ready**. Confirmed the count's eligible-∧-opted-in semantics, no rules-of-hooks issue, no accessibility double-announcement, theme-token/house-rule compliance. One NIT (steer the future registry-count implementer away from a hook-in-a-loop) — addressed in a comment. One CLEANUP (extract a pure tested count now) — **deferred**: it would make the count asymmetric with PR 3's own hardcoded `betaEligible`, and both fold together when beta #2 lands; the comment documents the safe path.
- **Designer** (in-context) — the "1 on" note uses the app's Geist **body** font, not the mock's doc-chrome **monospace** (mono is documentation styling in the mock system, never in-product); accent-ink deliberately echoes the Beta pill's "active" register.
- **Adversarial / RLS reviewers** — N/A (no clinical/statistical logic, no new access path; spec §7).

## A formatter footgun, resolved

Mid-session, `app/settings.tsx` was reformatted single→double quotes (a whole-file requote, 131/65 diff) against the repo's universal single-quote convention. Root cause: the `code-reviewer` subagent mistyped `prettier --check` as `prettier --write` in its own working tree (it self-reverted; it also noted the concurrent edits). The repo has **no** Prettier/ESLint config and no format hook, so nothing would re-trigger it. Restored `app/settings.tsx` to the pristine HEAD blob and re-applied the four logical edits by hand → clean 36/5 diff, single-quote consistent with the rest of the codebase and my other touched files.

## Verification

`tsc --noEmit` clean; full `jest` green (212 suites / 4696 tests) on the final state; the pre-push hook (tsc + jest) passed on both pushes. The `lib/betaFeatures.ts` change is comment-only (the blurb voice-pass note), so its 15-case suite is unaffected.

## Docs

- Spec `docs/nyx-beta-features-requirements.md` §0 (OPEN-1/OPEN-2 rows) + §8 marked resolved; `Last Updated` → 2026-08-09.
- Mock `docs/culprit-beta-features-mockups.html` refreshed to the shipped hint copy (+ info glyph), naming call and footer open-items marked resolved; **artifact republished to the same round-1 URL** (mock-what-you-change).
- `docs/backlog.md` — B-729 / B-730 filed (originally B-727/B-728; renumbered at the merge from `main`).

## Post-ship: on-device debugging detour + merge

The PM couldn't see the Beta features row on device. Chased it live:

- **Eligibility was never the problem.** Read production `app_config` directly — the PM's uid (`2eeeaef5-753a-467c-8c17-2b9fed40ee34`) is **already in `widget_enabled.allowlist`**, so Gate 1 resolves true. STATUS.md's "enablement still pending" note was stale (corrected this session). The resolver enables on allowlist membership alone (`enabled:false` + uid-in-array; flipping `enabled:true` would enable *everyone*), and the branch code (`ALLOWLIST_FLAG_KEYS`, `extractAllowlistFlags`, `resolveAllowlistFlag`) is correct — verified by reading it.
- **Actual cause — a runtime mismatch.** The project carries `expo-dev-client` (+ `expo-notifications`, the widget's native extension), so `expo start` runs a **development build**, not Expo Go — the Metro QR is a dev-client URL Expo Go can't open. The PM had been scanning it with Expo Go, so nothing loaded and no logs appeared. Diagnosed from the PM's pasted Metro output ("Using development build" / "Press s │ switch to Expo Go") + `package.json`. The dev-handoff runbook still documents Runtime B as "Expo Go" — stale, and it cost the detour → **B-731** filed.
- **Resolution:** the PM elected to test on **TestFlight** directly (correct — the home-screen widget needs a native build regardless). A temporary `[beta-debug]` log pushed to `useAllowlistFlag` to instrument the device was **removed before merge** (added `7cf7bde`, removed at wrap).

Merged at the PM's request during this wrap — CI green, branch current with `main`.

## Owed (not blocking this PR)

- The **native opt-in-aware not-live widget door (B-725)** — must ride the next native TestFlight cut with PR 3's gate (can't ride OTA).
- The **on-device pass** — the four pm-feature-review device-pass items (needs the TestFlight build).
- **B-731** — fix the dev-handoff runbook + CLAUDE.md so Runtime B reads "development build," not Expo Go.
