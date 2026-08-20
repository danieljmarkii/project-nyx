# 2026-08-20 — Signal GA graduation, Phase 0 (CUL-546): the four pre-flip gates

**Branch:** `claude/signal-ga-graduation-c80dfh` · **Issues:** CUL-546 (driver) · CUL-72 (B-734) · CUL-28 (B-768) · CUL-29 (B-769) · CUL-239 (B-727 client half) · CUL-430 (B-735)
**Outcome:** Phase 0 of the GA plan built as one PR (shipped via the PR opened off this branch); every ruling the whole GA plan needs was collected up front.

## The decision slate — PM rulings collected 2026-08-20 (chat, this session)

The session located the live position first (all child issues Todo, no GA PRs, `generate-signal` v30 live, both `app_config` rows `{"enabled": false, allowlist: [PM uid]}` — exactly the umbrella's verified state), then front-loaded every open decision as briefs. The PM ruled:

- **D1a (B-768):** the Timing watching row **suppresses** after 14 episode-free days (`WATCHING_TIMING_QUIET_DAYS`, anchored to the change lane's two-compare-week span). Suppression only — never a "quieted" reframe (reassurance-on-absence).
- **D2a (B-768):** the row rewords to carry its own mechanism: *"Timing — 4 of the 6 episodes a pattern needs, timed against meals you've logged."* ("timed episodes" was engine jargon.)
- **D3a (B-769):** the escalate-only gap row leaves the `WATCHING_SUB` "still needs" umbrella — own register, and it **leads** the frame on `no_pattern` (above the coverage nag; Principle 3).
- **D4 (B-769):** the gap row leads with its direction cue: *"Gaps between vomiting episodes **are getting shorter** — 6 days, then 3, then 2."* Descriptive change, never a verdict (the detector only ever supplies strictly-decreasing runs).
- **D5a (B-735):** E1's sub swaps to an events-not-days framing once Day N outruns the first-week promise (`buildingSub`, threshold = the promise's own boundary, 7).
- **D6:** the four provisional v30 redeploy-gate rulings (B-766 / B-775 / "two kinds of time" / FEWER=ship-as-merged) are **RATIFIED** — the deployed v30 behavior is the GA behavior. CUL-31 + CUL-95 close as ruled at GA-4.
- **D7:** B-732 (CUL-422, med-line targeting limitations) — **accepted as known limit**, closed.
- Also established: **B-776 (CUL-98) was already Done** (PR #685, same morning) — dropped from the slate; fix-or-waive on the Phase-0 gates was implicitly ruled **fix** by the PM's go-ahead.

## What was built (one PR)

- **B-734 (CUL-72):** flag-on first-load renders `SignalLoadingSkeleton` (Tier-1 content-shaped skeleton), never the heavy E1 headline; `useSignal`'s pet-switch reset now clears `localCtx` too (the second seam: new pet's name + old pet's counts). `useWatchingRows` disabled while loading. Flag-off loading unchanged (byte-identical). Regression test records **committed frames** and was verified to fail pre-fix.
- **B-768 (CUL-28):** quiet gate (`daysSinceLastVomitEpisode` — raw-event recency, deliberately later-than-collapsed) + the D2a reword. Gate touches only the timing row.
- **B-769 (CUL-29):** `WatchingBlock` split into `GapEscalationRow` (own register, plain primary ink — S1 plainness, position + phrasing carry it) + `WatchingNeedsBlock`; the four frames place gap first; `BUILDING_FLOOR` renders whenever any watching content shows. + the D4 cue.
- **B-727 (CUL-239, client half):** `evidenceText`'s zero-prior worsening arms lead with *"New this week: N episodes of vomiting logged for {pet}…"* — "after none the week before" retired client-side; the card `accessibilityLabel` appends *"New this week."* whenever the New chip shows (load-bearing for GA-3's server-side retirement: VoiceOver keeps the novelty when the server sentence drops it). The server card sentence rides the GA-3 redeploy — until then the two phrase the same fact differently, never contradict.
- **B-735 (CUL-430):** `BUILDING_SUB_SPARSE` + `buildingSub(dayNumber)`.

**FR-FLAG-2 held:** all 8 byte-identical flag-off snapshots pass unchanged; the one deliberate shared-copy edit (evidenceText, per the ruling) follows the #685 precedent of ungated copy fixes and updated its pinned test.

**Mock-what-you-change:** `docs/culprit-signals-v2-mockups.html` gained **§08 — GA Phase 0, as shipped** (four frames: re-registered building frame · gap-leads-on-no_pattern · the quieted pet · the sparse-logger E1 · the B-727 before/after), §05 marked superseded; republished over the same artifact URL.

## Verification

`tsc --noEmit` clean · full jest: 241 suites / 5391 tests green (12 snapshots) · the B-734 regression test fails with the fix reverted · adversarial-reviewer + code-reviewer dispatched on the diff (verdicts recorded in the PR).

## Where the GA plan stands after this session

Phase 0 **built** (PR open, PM merge = the gate) → Phase 1 (CUL-547+548, one combined client flag-removal PR, next session) → Phase 2 flip (CUL-549, after the GA build is on the PM's devices — PM says "go") → Phase 3 (CUL-550 server-gate removal + Codespace redeploy, then CUL-551 row-deletion migration + docs/Linear closeout, incl. executing D6/D7's bookkeeping).
