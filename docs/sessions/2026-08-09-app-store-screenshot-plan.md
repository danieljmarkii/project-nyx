# App Store screenshot plan (B-269, guide step 12)

**Date:** 2026-08-09
**PR:** shipped via #619 (draft)
**Track:** App Store submission runway · guide step 12 · `docs/app-store-submission-guide.md`

## What shipped

**`docs/store-screenshot-plan.md`** — the capture plan for the one required 6.9″ iPhone set
(1320×2868; 1290×2796 also accepted in the slot). Docs-only; no app code.

- **Ordered 5-frame list leading with the wedge** (+ an optional 6th): ① Home with the live
  Signal (both Cooper findings — the `intake_decline` safety card leads by Principle 3, the
  beef↔vomiting correlation below it, TrialStrip beneath), ② quick-log (the FAB menu's
  recent-foods 2-tap habit; food picker as the swappable alternate), ③ Patterns, ④ vet
  report (expected range basis "Active diet trial" — no vet visit is seeded), ⑤ History
  positioned on the D-3 beef-treat→vomit pair, ⑥ optional trial-aware picker ("ON THE TRIAL
  LIST").
- **Exact demo state per frame**, pinned to the B-271 Cooper seed (re-seed + re-run
  `generate-signal` ≤24 h before capture; flags off; single pet; no meds).
- **Do-not-capture list** — the Signal's *building* state renders two hardcoded ghost
  preview insights that read as fabricated data in a still (the worst possible frame 1);
  skeletons, NightMoment, "Updating…" pill, freshness prompts, Settings.
- **Caption copy pre-cleared** through nyx-voice + the same Guideline 1.4.1 honesty bar as
  the listing (no diagnosis/reassurance/outcome claims), with a rejected-lines table so
  step 13 inherits the reasoning. Captions are baked-in overlay text = a **post-submission
  polish pass, never the gate** — plain captures ship.

Tracker row 12 → 🔵 Plan ready; B-269 row updated; step 12 body now points at the plan.

**Mock round 1 (same session, PM-requested):** `docs/culprit-store-screenshot-mockups.html`,
published as artifact 📸 — the six frames hand-drawn at iPhone-16-Pro-Max logical size on the
Cooper demo states (theme tokens verbatim; Geist/Newsreader approximated by system faces),
plus the caption-framed polish variants on the brand-night ground. The page names its own
limits: Signal/report copy approximates the deployed phrasing/render layers; the capture is
the truth, the mock is the layout.

## Decisions taken (provisional, non-PM-blocking)

- **Flags stay off for the demo account** (no Ask pill, no `signal_design_v2`) — screenshots
  must match what the reviewer sees on the same account (Guideline 2.3 consistency), and
  flag-off is every real new user's honest default.
- **Captions drafted standalone**: `docs/store-listing-copy.md` doesn't exist yet (step 13
  ⬜), so captions were run against the shared bar rather than matched to an unwritten
  listing; reconciliation is flagged inside the plan for step 13.

## Flags raised

- **Seed addendum → B-271 PR 1:** the demo spec predates migration 040 and seeds
  `diet_trials` but not `diet_trial_foods` membership. Without the venison row marked, the
  picker's trial zone (frame 6) won't render and the TrialStrip may lose its protein name.
- **B-494 interplay (frame 4):** the report frame captures whatever the *deployed*
  `generate-report` renders (redeploy deliberately held). Step 11's CLINIC-READY cold read
  covers it; recapture frame 4 if the redeploy lands before submission.
