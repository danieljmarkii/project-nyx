# Store screenshot export pipeline (B-269 · guide step 12)

**Date:** 2026-08-09 · **Outcome:** shipped via #625

## What shipped

**`scripts/store-screenshots/`** — the production path D-SS2 requires (the designed set is the submission set), built in the step-11 waiting time exactly as the ruling planned:

- **`template.html`** — the six ruled frames at **true 1320×2868**. The round-5 mock (`docs/culprit-store-screenshot-mockups.html`, the design authority) ports 1:1: the template lays out in the mock's 300px frame units and scales ×4.4, so both files carry the same numbers and can't drift silently. Typefaces are the **real app faces** — Geist 400/500/600 + Newsreader 400/700 loaded from the same `@expo-google-fonts` packages `lib/fonts.ts` registers (the mock's own footer names them as the production faces; the mock page used system stand-ins). Captions = the round-5 lines, isolated in one `FRAMES` object, marked placeholder-grade pending the joint step-13 caption/keyword pass (plan §5).
- **`render.js`** — zero-npm-dep Node runner over headless Chromium. `--draft` renders all six from built-in stand-in screens (works today, no captures); capture mode validates the five §3 captures, composites them into the frames-2–6 bezel, and builds the **frame-1 night hero by cropping the two Signal cards out of the Home capture** (`captures/hero-crops.json` — composited, never redrawn, per D-SS1). Output contract enforced per frame: exactly 1320×2868, truecolor RGB, **no alpha** (Apple rejects transparency), with an RGBA-flattening safety net. `--only N,M` re-renders a subset (built for the B-742 frame-3 recapture).
- **Deliverable:** the six draft PNGs, rendered and sent to the PM for template review.
- `.gitignore`: `out/` + `captures/` (captures carry demo-account content; renders are reproducible).

## The finding worth keeping (why the renderer self-calibrates)

With `--headless=new`, the layout viewport is **shorter than `--window-size`** (87px on the tested build) and `--screenshot` pads the difference with canvas background — the first render shipped every frame with a dead cream strip at the bottom, and on day frames (ground = the same `#F2EEE4`) it would have been invisible. The renderer now measures the real offset each run with a `position:fixed` marker page, oversizes the window, and crops back to 2868 in the same PNG decode pass that flattens alpha. Documented in the file header; do not "simplify" it away. (Also ruled out en route: CSS `transform` and `zoom` both clip at the same viewport bound — the offset is the viewport itself, not a compositing artifact.)

## Verification

- Six draft frames rendered and **visually QA'd against the round-5 mock** (night hero full-bleed, receipt on the insight card only per S1, captions verbatim, D-SS3 order in the filenames).
- Capture mode smoke-tested end-to-end with stand-in inputs: validation errors, phone-fill compositing, hero crop math, output spec. The cropped hero cards visibly carry the source screen's own content ("Why we're showing this", the receipt lane) — composited, not redrawn.
- Output spec verified programmatically per frame by the pipeline itself (dimensions + color type).

## Judgment calls (small, named)

- The mock's annotation layers (`.fnote` "Real cards, composited from the Home capture" + the `.fmeta` notes) are **not** rendered in exports — they read as review notes, not artwork. Flagged in the README; PM sees the draft PNGs to confirm.
- Draft-mode Home stand-in shows the dot-lane receipt (the ruled hero). At capture time the receipt exists only if `signal_design_v2` is presentable + ON for the demo account — otherwise the hero crops contain plain cards, which is exactly the fallback the ruling names. The pipeline is agnostic; the crops carry whatever the capture shows.

## Tier-2 flag (proposed edit, not written)

Plan §7's QA checklist still carries "No mockups, no composited UI, no fabricated states (Guideline 2.3) — **captures only**" — written under §0's original plain-capture posture and now contradicted by D-SS2/D-SS4 (the composed set IS the submission set; §7's own first line already reflects the designed frames). Proposed edit: reword to "every *product surface shown* is an unedited capture from the live demo account; frame artwork per the ruled template (D-SS2); no fabricated app states." Awaiting PM approval to write.

## DoD

Build tooling only — no app code, no schema, no store/EF/`lib/` logic → `tests: N/A` (Engineer exemption: the pipeline's own per-frame output verification + the rendered-PNG visual QA are the meaningful checks; jest 4763 green via pre-push hook regardless). Anti-pattern scan clean (no app surfaces touched; theme-token rule N/A to standalone export artwork, which deliberately hardcodes the mock's literal brand values — same posture as the mock file itself). No new secrets. Personas: **Designer ✓** (round-5 geometry ported 1:1, faces = the real Geist/Newsreader, captions verbatim, S1 respected in the stand-ins) · **Engineer ✓** (zero-dep runner, self-calibrating viewport, actionable failures, gitignored outputs) · **QA ✓** (six frames eyeballed against the mock; capture path smoke-tested; spec verified programmatically) · Data/Dr. Chen N/A (no clinical logic; the draft card sentences are the mock's, unchanged). Adversarial review N/A — no clinically/statistically load-bearing logic.

## Live-upload follow-up (same session): the ASC slot gotcha + `--size`

The PM test-drove the draft set against App Store Connect immediately and hit a dimensions rejection — **the files were to-spec; the slot wasn't**. ASC slots are exact-match on dimensions, and the version page surfaced the legacy **6.5″ Display** box (accepts only 1284×2778 / 1242×2688), which rejects valid 6.9″ files outright. Verified against Apple's live spec: 6.9″ (1320×2868 / 1290×2796) is the required primary and lives behind **View All Sizes in Media Manager**; smaller sizes derive from it automatically. Shipped in the same PR: a `--size WxH` export override (output in `out/<mode>-<WxH>/`; warns on non-ASC sizes), a native 1284×2778 fallback set delivered to the PM, and a step-12 tip in the submission guide ("upload via Media Manager, not the version page's default box") so this doesn't bite at real submission time. Capture inputs are unaffected — export size is independent of capture size.

## Residuals

- Frame-3's draft shows the by-day chart the *deployed* report doesn't render yet — correct per the mock, but the capture-mode frame will show reality until **B-742** lands (rides the B-494 redeploy). Already flagged in plan §0.5; nothing new filed.
- Hero crop rects are measured by hand at capture time (`hero-crops.json`). Deliberately not auto-detected — the two-card region is a design call on a one-time artifact; auto-detection is complexity without a second use.
