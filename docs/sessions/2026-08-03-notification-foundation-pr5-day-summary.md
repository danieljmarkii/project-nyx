# 2026-08-03 — Notification foundation PR 5 (B-661): mock round 2 + the finish pass

**Outcome:** shipped via #574. Branch `claude/notification-foundation-pr5-f4p7cl`. Mock round 2 (the Day Summary + lock-screen frames) published; the three deferred-piece rulings made; the PR 5 copy/safety pass, `pm-feature-review`, and the Dr. Chen read run; the Tier-2 `design-principles.md` §4 carve-out surfaced for PM wording sign-off (not written). **On-device verified 2026-08-03 (PM): a fresh native build + opt-in → the 9pm notification fires** (closes the AC-3 fire gap). Merged to `main` after resolving the STATUS.md / backlog.md collision against 33 intervening commits.

## On-device verification (PM, 2026-08-03)
The PM cut a fresh native build (required — `expo-notifications` is a native module added in PR 1, absent from TestFlight build 35 and the dev client), opted in via Settings → Notifications → Daily summary → Allow, and confirmed the **9pm notification fires**. That closes AC 3's fire path (the notification delivers with the neutral G1 body). The remaining device checks are not-yet-confirmed but non-blocking for the merge: tap → Day Summary render, the zero-log state, OS-revocation reconcile (AC 6), and sign-out cancellation (AC 7) — carried on the on-device checklist.

## Merge reconciliation (at merge)
`main` advanced 33 commits while this PR was open (Signal/Home uplift B-721, Beta features B-712, Trial protein B-704, Med history B-140). Conflicts were the expected two — `STATUS.md` and `docs/backlog.md` — resolved by taking main's version and re-applying this session's additive edits (the notification-foundation section update; backlog rows B-670–B-674, whose IDs main had not claimed). `app/settings/notifications.tsx` auto-merged cleanly: this session's apostrophe normalization coexists with **B-665** (the post-grant confirmation snackbar), which shipped independently to main via #586 — that PR-3 residual is now closed.

## Mock round 2 (`docs/culprit-notifications-mockups.html`)
Re-published over the **round-1 URL** (`af80ad9e-…`, house rule — kept `<title>` + favicon 🔔 stable, named the round inside the page). Added the two PR 4 surfaces:
- **The lock-screen notification** — the 9pm banner on an iOS lock screen ("Today's summary" / "Today's record is ready to read."), with the G1 / D3 / fires-whether-or-not annotations and the §10.3 neutral-body ruling callout.
- **The Day Summary screen, four states** — ordinary / incident / zero-log / multi-pet, on the real app device frame with the real `constants/theme.ts` tokens (category tints: meal teal, medication slate, symptom rose, other neutral). Plus a **three-ruling table** (DEFER / ADD / NEUTRAL).

Round 1 (primer + settings) is preserved below, marked "unchanged." Verified both light + dark render via headless Chromium (document chrome darkens; app frames stay light; the lock screen stays dark).

## The three deferred-piece rulings (PR 4 → mock round 2)
1. **Trial/med context strips (§5.1/§5.3) — DEFER (B-670).** v1 stays doorway-rows-only. The trial-diet meal and each dose already render as rows; re-hosting the trial card's viability states or the med strip's course state would make the summary a **rival Home** (its own §5.3 forbids that), re-open the same-record/two-surfaces/two-answers drift those modules spent nine adversarial rounds closing, and render a *reading* on a surface **G3** says must only describe-and-door. If ever built: factual day-count only, from the existing predicates, dooring to the full card.
2. **Zero-log log CTA — ADD.** The screen has **no FAB**, so the body's "…ten seconds to add" invitation would dead-end. Added a low-emphasis link (`EmptyState.action`, accent text, not a filled button) → `/log` (the door TodayZone's empty nudge opens). Not the §4.2 "second door": on a FAB-less screen with nothing else on it, it is the *only* door. Whole-screen zero-log only — a per-pet inline line stays a plain fact (a per-pet CTA can't pre-select the empty pet).
3. **Single-pet lock-screen naming (§10 #3) — NEUTRAL (unchanged; B-671).** Designer + T&S call: the lock screen is *involuntarily* public and can't be scoped to the owner's iOS preview setting, and the body asserts nothing (G1) either way — so naming buys only warmth, bought with the owner's exposure. The split is already correct: **warm where private (the in-app primer names the pet), neutral where involuntarily public (the lock-screen body).** Designer dissent recorded; recoverable later as an opt-in.

## Code changes (the finish pass)
- **`app/day-summary.tsx`** — the zero-log CTA (`logEvent` → `/log`, whole-screen zero-log only); the empty title names the pet on a single-pet account via `daySummaryEmptyTitle`; the a11y row label reordered to match visual order (`title · detail … tag … time`, pm-review).
- **`lib/daySummary.ts`** — `DAY_SUMMARY_ZERO_LOG.cta` ("Log an event", G2-safe); `daySummaryEmptyTitle(petName?)` (names the pet on single-pet, neutral otherwise, no trailing period); the stale header comment ("doorway into … trial card, med card") corrected to doorway-rows-only + the B-670 deferral note.
- **`components/notifications/NotificationPrimerSheet.tsx`** + **`app/settings/notifications.tsx`** — apostrophe normalization (straight ' → curly ', matching the app's 67-file convention; the primer test's regex `.` wildcards stay green). nyx-voice pass, no substantive copy change.
- **`lib/daySummary.test.ts`** — cover the new `cta` + `daySummaryEmptyTitle` in the G2 copy-safety assertion; a dedicated title-naming test.

## Gates
- **nyx-voice** ✓ — every string reviewed against the 8 patterns. On-voice throughout (calm, no `!`, plain language, refusals surface plainly). Two fixes: named the single-pet empty title (Pattern 1 — the wedge owner's commonest empty state), normalized the apostrophe drift (Pattern-level consistency).
- **clinical-guardrails G1–G3** ✓ — G1 (static neutral body asserts no record contents), G2 (every zero-log string a record fact, never a verdict; error state never a false-clear; all test-asserted), G3 (describes + doors, never concludes; Ruling 1 keeps viability readings off the surface). No per-incident AI read of its own — it links (so Patterns 1–4 don't apply directly).
- **pm-feature-review** — **Flow 2 (settings + primer) SHIP-SHAPED**; **Flow 1 (Day Summary) NEEDS-WORK** on one finding: the **midnight day-handoff** (a 9pm notification tapped after midnight opens the new empty day, so a logged day reads "Nothing in {pet}'s record today"). Genuine PM decision with a real tradeoff (fire-date anchoring introduces stale-summary confusion) → **B-672 (Next)**, surfaced as the top PM decision; not fixed in this finish pass. Fixed in-PR: the a11y label order, the apostrophe drift, the stale builder comment. Filed: B-673 (in-app discovery), B-674 (4th-state hint). Deferred-strips wedge angle homed at B-670. Also flagged for on-device: the denied banner's red+triangle register vs. the app's own calmer health safety banner (`CrossPetSafetyBanner`) — a PM call the PM already leaned "prominent" on; verify on device.
- **Dr. Chen (in-context read of the zero-log + incident-day states)** ✓ — falsification attempts all held: (1) an unlogged-but-sick pet's empty screen reads "no record", never "fine"; (2) a read failure is an error state, never a false-clear; (3) no per-category cap hides a repeated incident (every vomit renders, unlike TodayZone's cap); (4) the summary doors to the per-incident read rather than re-rendering/contradicting its verdict; (5) a refusal reads "refused", never "picky". The `vet-report-cold-read` subagent is N/A here (it reviews a rendered vet report, not an owner screen).
- `tsc` clean · jest: the 4 touched suites green (69 cases); daySummary 18.

## On-device QA script (PR 5)
See the PR body. Covers the consent flow (states a/b/c + primer + decline-spends-nothing), the four Day Summary states via direct `/day-summary` navigation (no in-app entry yet — B-673), the neutral notification body, and sign-out cancellation. The 9pm fire itself needs a timing workaround (temporarily set the registry hour in dev, or wait until 21:00).

## Tier-2 edit flagged (NOT written — awaits PM wording approval)
`design-principles.md` §4 gains the D1 carve-out paragraph (spec §11). Proposed wording in the PR body + the session summary. This is the last piece of D1 (the Principle-4 carve-out) and needs the PM's sign-off before it can be written.

## Owed / next
- **B-672** — the midnight day-handoff (PM decision, then a focused PR).
- **PR 3 residuals:** B-666 (one-shot-prompt stakes line) + B-667 (sheet-chrome consolidation) still open; **B-665 (post-grant confirmation) shipped independently via #586.**
- The **Tier-2 §4 edit** — PM wording sign-off, then write.
- Part 1 is otherwise complete: PRs 1–5 shipped; consumers (B-288/B-227/B-015/B-543/B-662) unblocked.
