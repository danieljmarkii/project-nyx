# Widget round 4 — the informational/data-vis reimagining

**Date:** 2026-08-02

## What happened

The PM installed build 35, lived with the round-3 widget on a real Home Screen, and
re-called the direction: the widget is great for **knowing what's been logged today**
and for **getting back into the app fast** — and bad at logging, because limited real
estate meets "which meal or treat would it even log without complicating things?"
Explicit framing: view W1–W5 as a great start (the infrastructure is there), research
the state of the art, and reimagine the direction — informational, today's-data,
data-vis-forward — consulting the pet-owner personas, delivering a revamped mock
artifact.

## What was produced

1. **A 2026 state-of-the-art research sweep** (subagent, WebSearch/WebFetch): Apple
   HIG/WWDC canon (glanceable/relevant/personalized; "informational" is a first-class
   widget archetype; content over chrome; medium = per-element deep links, small =
   exactly one), the widget canon (Flighty's ~15-state state machine, Gentler
   Streak's value+7-day-trend, Waterllama as the exception that proves the rule —
   one-tap capture works only when one tap = one unambiguous unit), platform shifts
   (iOS 18 tinted mode + iOS 26 Liquid Glass kill hue-only encoding and hand-painted
   grounds; refresh budgets 40–70/day; staleness lies are the #1 real-world widget
   complaint), and calm-technology framing (ignorable on a routine day, instantly
   legible on an abnormal one — Principle 3 in widget form). Key findings + sources
   are digested into the mock itself.

2. **Round 4 of `docs/culprit-widget-mockups.html`** — re-published over the same
   artifact URL per the mock protocol; round 3 remains the as-built v1 reference in
   git history. The design:
   - **Candidate E (recommended), "Today, on one line":** header (pet + trial day) ·
     a 6a→10p **day-axis timeline** where every logged event sits at its actual time
     as a typed, shape-redundant mark (meal = large filled circle, treat = small
     filled circle, med = rounded square, symptom = rotated square, bowl = dotted
     ring, learned-window-not-yet-logged = hollow ring) · a **state-machine
     headline** (symptom fact leads when one exists; else counts + recency; else
     "Nothing logged yet today") · a **footer record strip** (trial-day dots during a
     trial — the discovery doc's sanctioned competence-feedback channel; else the
     calendar-v3 pip vocabulary over the last 7 days) · a dashed **"Log ›" door**
     (round 3's app door, kept — now the only interaction pattern). Every element
     deep-links: timeline → History today, headline → Home, trial strip → trial
     card, pips → calendar, door → quick-log.
   - **Candidate F (alternate):** the flowsheet — class rows (count + last time),
     hospital-whiteboard read; fallback if the timeline reads too abstract on-device.
   - **Candidate G (phase 2):** the small sibling — one synthesized fact; trial ring
     during a trial; symptom fact + 7-day pips otherwise.
   - Five persona reads embedded (Jordan, Sam, Designer, Data Scientist, Dr. Chen,
     Dir. of Eng, T&S).

3. **Backlog row B-663** (Now) — the ratify-then-rebuild path; absorbs the B-481 fix
   path (the surface that must render reliably shrinks with the interaction surface).

## What dies / what survives (pending R4-1)

Dies: capture tiles, flip pickers, widget writes (outbox, undo, revoked pool),
"tap to pick" chrome, the §10 tile-glyph pass. Survives verbatim: W1 `logged_via`,
W2 SDK 57, W3 App Group + snapshot publisher (bumps to schema v2: today's events,
7-day record row), W4 intents (parked as the B-291 Siri/Action-Button rail — those
surfaces make the event unambiguous, so capture stays right *there*), D4 (free),
D5 (per-slot binding), the midnight staleness rule, all deep-link routes.

## Safety notes carried

Filled marks map 1:1 to logged rows; hollow rings are never auto-completed (B-156
G1); "Nothing logged yet today" is a record fact, never an all-clear; med counts use
the confirmation register ("1 of 2 today", never "missed"/"due"); D9 (no AI/Signal
copy) stands; counts stay pet-centric; the 7-day pips describe the record (logging
days / symptom-logged days), the calendar's own shipped vocabulary — no rates, no
verdicts, nothing that can reassure.

## PM decisions filed (in the mock, §PM decisions)

- **R4-1** — ratify: the widget stops writing entirely (reverses D1–D3). Recommended yes.
- **R4-2** — symptom naming on the Home Screen ("Vomiting ×2") vs neutral wording vs
  a per-widget discreet toggle. Recommended: name it, toggle as escape valve.
- **R4-3** — keep or cut the expected-window hollow rings. Recommended: keep.
- **R4-4** — small sibling now or after the medium proves out. Recommended: after (B-481).

## Not done here

No code, no spec rewrite — `docs/nyx-widget-requirements.md` v1.0 is deliberately
untouched until the PM ratifies R4-1–R4-4 (Tier-2 protocol); the rewrite lands with
the ratification session. B-481 (widget unusable on-device) stays open — it needs a
device regardless of direction.

## Round 5 (same session, after PM reaction)

The PM reacted to round 4: **E** ("Today on one line") — love the image, not super
practical; **F** (flowsheet) — looks best, very readable, but a bit of wasted space;
**small cards — don't invest for now** (answers R4-4: medium only). Asked for three
new options.

Round 5 shipped to the same file + artifact URL: readability adopted as the spine
(all text-row/tile registers, the time-axis abstraction retired), the wasted space
attacked three ways, same two fixture days across all options so the comparison is
layout-only:

- **Option H — "The flowsheet, packed":** F's class rows, content-gated (an empty
  class renders no row — the briefing's own card-gating idiom), with the reclaimed
  space spent on names and times ("Meals · 2 · Hill's z/d · 7:42a · 5:12p").
  Symptom class always renders and leads. Footer trial strip / 7-day pips carried.
- **Option I — "The ledger":** today as History's day view — chronological, named,
  timestamped rows, each deep-linking to its event; expected window as a hollow
  bottom row; overflow collapses the earliest rows. Trial line moves to the header.
- **Option J — "The briefing":** a 2×2 content-gated stat-tile grid (count + recency
  + a name sub-line per tile); symptom tile always top-left; trial record and 7-day
  pips as tiles; zero empty space by construction.

All three render from the same snapshot v2 — the option choice changes only the
layout function, not the W3 pipeline work. R4-1/2/3 remain open (all options assume
the round-4 recommendations); new ask **R5-1** = pick a layout or name a hybrid.

— shipped via #563
