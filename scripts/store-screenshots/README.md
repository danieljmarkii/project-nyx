# Store screenshot export pipeline (B-269 · guide step 12)

Renders the ruled six-frame App Store set — **1320 × 2868 portrait, RGB PNG, no
alpha** (the 6.9″ App Store Connect spec) — from `template.html` through
headless Chromium.

**Design authority:** `docs/culprit-store-screenshot-mockups.html` (round 5).
The template ports that mock's frame geometry 1:1 (mock units × 4.4 = export
pixels) and swaps the mock's system stand-in typefaces for the app's real
faces: Geist (UI sans) and Newsreader (display serif), loaded from the same
`@expo-google-fonts` packages `lib/fonts.ts` registers. Plan + rulings:
`docs/store-screenshot-plan.md` (§0.5 D-SS1–D-SS4, §3 order).

## Draft mode — works today, no captures needed

```bash
node scripts/store-screenshots/render.js --draft
```

Renders all six frames from built-in stand-in screens (the mock's interiors)
into `out/draft/`. This is the template-preview mode: it exists so the frame
artwork, captions, and typography can be reviewed **before** the demo account
exists. Draft frames are NOT uploadable — guideline 2.3 wants the real app,
and the plan's §0 rule 2 wants real (demo) data.

## Capture mode — the production path (gated on guide step 11)

1. Capture the five screens from the plan's §3 shot list on the Cooper demo
   account (Pro Max class device or Simulator → native 1320×2868; a 6.7″
   device's 1290×2796 is also accepted — output is 1320×2868 either way):

   | File in `captures/` | Screen | Feeds frame(s) |
   |---|---|---|
   | `home.png` | Home, live Signal (plan §3 frame 1 staging) | 1 (hero crops) + 6 |
   | `quicklog.png` | `+` FAB menu open over Home | 2 |
   | `report.png` | `/report`, generation complete | 3 |
   | `patterns.png` | `/insights`, loaded | 4 |
   | `history.png` | History tab, default scopes | 5 |

2. Write `captures/hero-crops.json` — the pixel rects of the two Signal cards
   in `home.png`. The night hero is **composited from the capture, never
   redrawn** (D-SS1), so the crops are the design contract:

   ```json
   { "safety":  { "x": 0, "y": 0, "w": 0, "h": 0 },
     "insight": { "x": 0, "y": 0, "w": 0, "h": 0 } }
   ```

   Measure in any editor that shows pixel coordinates: each rect is the white
   card region (safety = the intake-decline card, insight = the beef↔vomiting
   card with the dot-lane receipt). The renderer validates the rects against
   the capture's dimensions and fails with instructions if the file is missing.

3. ```bash
   node scripts/store-screenshots/render.js
   ```

   Outputs `out/capture/frame-01-night-hero.png` … `frame-06-home.png` —
   named in the ruled upload order (D-SS3), so dragging them into App Store
   Connect in filename order is the §6 upload step.

`--only 2,3` renders a subset (e.g. re-render frame 3 after the B-742 report
chart lands and that screen is recaptured).

## What the renderer guarantees

- Exactly **1320 × 2868**, color type 2 (truecolor RGB — Apple rejects alpha).
- The headless-Chromium viewport quirk is self-calibrated per run: with
  `--headless=new` the layout viewport is shorter than `--window-size` (87px on
  the builds tested) and `--screenshot` silently pads the gap with background —
  the renderer measures the real offset with a marker page, oversizes the
  window, and crops back. Do not remove the calibration step.
- Chromium resolution: `CHROMIUM_BIN` env → `/opt/pw-browsers/chromium` (cloud
  session) → `chromium`/`google-chrome` on PATH. Zero npm dependencies.

## Editing the template

- **Captions** live in one place: the `FRAMES` object at the top of
  `template.html`'s script. They are the round-5 lines and are
  **placeholder-grade until the joint caption/keyword pass with step 13**
  (plan §5) — that pass edits only those strings.
- Frame geometry is in mock units (a 300px-wide frame, scaled ×4.4). Change
  the mock and this template together, same numbers — they are the same design.
- The mock page's annotation layers (`.fnote` "Real cards, composited from the
  Home capture", the numbered `.fmeta` notes) are review notes, not artwork —
  deliberately not rendered here.
- `signal_design_v2` note: the draft Home stand-in shows the dot-lane receipt
  (the ruled hero). At capture time the receipt only appears if the flag is ON
  for the demo account (plan §2.3); if the SR track hasn't deemed v2
  presentable, the hero crops simply contain plain cards — the fallback the
  ruling names.
