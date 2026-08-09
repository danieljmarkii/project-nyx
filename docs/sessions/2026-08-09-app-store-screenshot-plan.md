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

## Round 2 (same session) — research + design directions

The PM rejected round 1's framing ("take the app, screenshot it, add a title") and asked for
(1) real design research and (2) submission-consultant guidance. Two parallel research passes
produced **`docs/research/2026-08-app-store-creative-landscape.md`** (🧊 frozen): 15 live US
screenshot sets examined via Apple's CDN (Oura/Whoop/Calm/Headspace/AllTrails/Flo/Clue/
Duolingo/Notion/Things/Fabulous + 4 pet apps), the pattern taxonomy, the A/B case corpus
with confidence grades, and Apple's rules verbatim. Headlines: the search card is the real
listing (~60% decide without scrolling); caption overlays are explicitly permitted (2.3.3);
fictional data is required (2.3.9 — Cooper complies by construction); the premium register is
unoccupied in the pet category; every observed set matches ground darkness to its own UI
theme.

Consequences shipped this round: mock **round 2** republished to the same artifact URL with
three composed-frame design directions (A night instrument / B daylight record / C night-
opens-day-carries, C recommended); plan §0.5 added with open PM calls **D-SS1** (direction),
**D-SS2** (designed set as the submission set — recommended — vs plain-capture floor),
**D-SS3** (vet report promoted to frame 3); §5 captions demoted to placeholder-grade pending
a joint caption+keyword pass with step 13. Backlog: **B-727** (post-launch PPO test),
**B-728** (vet-referral CPP), **B-729** (StoreKit review prompt) — all Later, evidence-linked.

**RULINGS (same day):** D-SS1 = **C** (PM). D-SS2 = **(a) designed set ships as the
submission set**, D-SS3 = **report at frame 3** (both PM-delegated to the team; team took
its recommendations). Applied: plan §0/§0.5/§3/§5 rewritten in ruled form (search card =
night hero · quick-log · vet report; Patterns 4, History 5; frame 1's hero is composited
from the Home capture, never redrawn), tracker row 12 + STATUS updated, mock stamped round
2.1. One consequence flagged not ruled: where the full Home screen appears (explorer-tail
frame 6 vs nowhere) — a round-3 template-session call. Next: the C-template build + joint
caption/keyword pass, paired with step 13.

**Round 3 (same session, PM-requested — "I still don't have a feeling for the end
result"):** the mock now leads with the full composed set at judging size — night hero +
four daylight frames + BOTH frame-6 candidates (full Home vs trial picker) side by side as
the open call — plus a **search-card preview** (icon/name/subtitle + frames 1–3 at
thumbnail size, the ~60% decision moment). Round-1's framed pass deleted from the page (git
history keeps it). Composition verified by actual headless-Chromium renders before
republishing (hero line-break + frame-4 caption-clip fixed; the frame-2 scrim confirmed
rendering by pixel value, not by eye). Captions remain placeholder-grade pending the joint
step-13 keyword pass.

**R3-1 + Round 4 (same session):** the PM sent the composed round-3 set back — *"I'm liking
the copy… it's still app on a background"* — keeping copy/order/posture and re-opening the
frame treatment. Round 4 (same artifact URL) renders three **bezel-free** concepts, each
shown as frames 1 and 5, all built from real UI fragments at poster scale: **(1) the
evidence, blown up** (full-bleed cards; History as a ribbon with the treat→vomit pair
threaded), **(2) the constellation** (the dot-lane receipt as night sky over one glowing
real card; amends C's ground split), **(3) the specimen** (giant honest numeral + rule +
annotation + pinned fragment). All three render-verified in headless Chromium before
publishing. **D-SS4 open** (concept or hybrid); round 5 applies the winner to all six frames
and rebuilds the search-card preview. Plan §0.5 + tracker updated.

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
