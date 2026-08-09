# App Store Screenshots — Capture Plan (B-269 · guide step 12)

**Created:** 2026-08-09 · **Owner:** PM captures on-device; this doc is the shot list + caption copy
**Guide:** [`docs/app-store-submission-guide.md`](./app-store-submission-guide.md) step 12 · **Backlog:** B-269 · **Demo account:** [`docs/nyx-demo-account-requirements.md`](./nyx-demo-account-requirements.md) (B-271 — the capture prerequisite)
**Status:** 🌱 Plan ready. Capture is gated on guide step 11 (the Cooper demo seed) — every frame below is staged on that account.
**Mock:** [`docs/culprit-store-screenshot-mockups.html`](./culprit-store-screenshot-mockups.html) (round 2, artifact 📸) — round 2 renders the three design directions side by side; round 1's capture states remain the staging spec beneath them.
**Research:** [`docs/research/2026-08-app-store-creative-landscape.md`](./research/2026-08-app-store-creative-landscape.md) (2026-08-09) — 15 live sets examined, Apple's rules verbatim, the A/B case corpus. §0.5's decisions are built on it.

---

## 0.5 Round 2 — the design directions (PM calls D-SS1–D-SS3, open)

The research reframed §0's posture: **caption overlays and marketing frames are explicitly permitted** (Guideline 2.3.3 — "may also include text and image overlays"), the search card (frames 1–3 at thumbnail size) is where ~60% of visitors decide, every published A/B winner moved toward short benefit captions on composed frames, and the premium register is **unoccupied in the pet category**. Plain captures remain the fallback floor — but the recommended submission set is now a designed one. Three PM calls:

**D-SS1 — Visual direction.**
- **Deciding:** the frame template every screenshot is composed in (ground, caption treatment, device treatment).
- **Options:** **(A) Night instrument** — brand-night field on every frame, moonlight serif captions, day UI glowing (the Oura register; risk: every observed premium set matches ground darkness to the app's own UI theme, and ours is daylight). **(B) Daylight record** — moonlight-paper field, indigo bold-lead-phrase captions, UI merges with ground (honest, quieter in the search grid). **(C) Night opens, day carries — recommended (Designer):** frame 1 = night brand hero with the real Signal cards floating lit (2.3.3-satisfying, unmissable next to the category's cream and confetti); frames 2+ = B's daylight template. The single ground exception every premium set allows itself.
- **Consequence:** unblocks the template build + caption pass (round 3); A or C also decides whether the night hero is the one frame that needs bespoke production.

**D-SS2 — Submission posture.**
- **Deciding:** whether the designed set is the *submission* set or a post-launch upgrade.
- **Options:** **(a) Designed set ships — recommended (both lenses):** capture is already gated on step 11, so the template gets built in the waiting time; production = render captures into an HTML template and export at 1320×2868 (a small follow-up session). **(b) Plain captures ship, designed set follows via a later metadata update** — the original §0 posture; costs nothing but launches into the category's weakest creative moment with our strongest differentiator invisible in search.
- **Consequence:** (a) adds one template-build session before upload, zero schedule risk while step 11 is open; PPO can't run pre-launch either way (the launch page is a judgment call), so (a) is also the only way the launch page benefits from any of this research.

**D-SS3 — Order.**
- **Deciding:** which frames occupy the 3-slot search card.
- **Options:** **Promote the vet report to frame 3 — recommended:** Signal → quick-log → vet report is the whole wedge loop (the pattern, the 10-second habit, the clinic payoff); Patterns moves to 4, History 5. **Or keep round 1's order** (Patterns at 3, report at 4) — depth before payoff.
- **Consequence:** reorders §3 and the mock; no other change.

Two compliance facts now on the record here: screenshots must use **fictional data** (2.3.9) — the Cooper demo account satisfies this by construction — and at least one **Dark Mode screenshot** is Apple's own recommendation *if the app supports one* (Culprit's record surface is deliberately daylight-only, so this does not apply; noted so nobody "fixes" it).

---

## 0. The two rules that shape everything below

1. **Plain screenshots pass review.** The required deliverable is 4–6 honest captures of the real app. The §5 captions are a *later polish pass* (framed images with overlay text) — they must never block submission. If in doubt, upload the plain set and ship.
2. **Every frame is the real app on real (demo) data.** Guideline 2.3 requires screenshots to show the app in use — and our own Signal "building" state renders two hardcoded ghost preview sentences that *read as fake data* in a still image. So no empty states, no skeletons, no mocked anything: the Cooper seed exists precisely to make every surface honestly alive. The reviewer's demo account and the screenshots should show the *same* app — see §2's flag rule.

---

## 1. The required set — format facts

- **One set required: 6.9-inch iPhone, portrait.** Accepted pixel sizes for that slot: **1320 × 2868** (iPhone 16/17 Pro Max class) or **1290 × 2796** (6.7″ class — also accepted in the 6.9″ slot). Smaller device sizes scale down automatically; no iPad set (`supportsTablet: false`, shipped 2026-07-24). Spec: <https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications/>
- **Capture device:** if your iPhone is a Pro Max (6.9″) its native screenshots are already 1320 × 2868 — just screenshot normally. A 6.7″ device's native 1290 × 2796 is also directly accepted. Anything smaller → use the iOS Simulator with a dev-client build (Expo Go no longer runs the app since the widget targets landed):
  ```bash
  xcrun simctl status_bar booted override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3
  xcrun simctl io booted screenshot frame-01-home-signal.png
  ```
- **Up to 10 slots; we ship 5 (+1 optional).** The first 2–3 are what search results show — the Signal leads, per the guide.
- PNG or JPEG, no transparency. Portrait only for this set.
- **Status-bar hygiene (on-device):** full battery, strong signal, Do Not Disturb on (no banner can photobomb a frame), no red badge clutter. Light mode (the record surface is daylight by decision — B-284 D8).

---

## 2. Prerequisites — the exact account state

All frames are captured **signed into the demo account** (Cooper — the diet-trial dog, B-271 D1). Before the capture session:

1. **Guide step 11 phases D–E are done:** account created, seed run, and **`generate-signal` re-run within 24 h of capture** (the Signal is a server cache with a 24 h TTL — a stale cache shows the "not enough recent data" state, which is a do-not-capture state).
2. **Re-seed the same day if the seed is more than a day or two old.** The intake-dip finding reads the last 2 days; the script is date-relative for exactly this reason (demo spec §8). Ideal: re-seed + re-generate the morning of the capture session.
3. **Feature flags stay OFF for the demo account** — no `ask_enabled`, no `signal_design_v2`, no `widget_enabled`. Two reasons: those flags fail closed for every real new user, so the honest store representation is flag-off; and the screenshots must match what the *reviewer* sees on the same account (2.3 consistency). Consequence: the Home header is wordmark + avatar only (no Ask pill) — that is correct, not a gap.
4. **Single pet** (no header chevron), **no medications seeded** (D7) — so no MedStrip on Home; expected, no hole.
5. **Seed addendum flagged to the B-271 seed-script session:** the demo spec (§3, written 2026-07-11) predates migration 040 — it seeds a `diet_trials` row but never mentions **`diet_trial_foods` membership rows**. Without the venison staple marked on the trial list, the picker's "ON THE TRIAL LIST" zone (frame 6) won't render and the trial strip's protein naming may fall back to plain "Diet trial." The seed script should add the membership row for the venison food. *(Flagged in this session's summary; the seed PR owns the fix.)*

---

## 3. The shot list (upload in this order)

| # | Frame | Surface / route | One-line story |
|---|---|---|---|
| 1 | Home — live Signal | Home tab, top | The wedge: logs become patterns, with a safety flag leading |
| 2 | Quick-log | `+` FAB menu (alt: food picker) | The 2-tap habit — confirmation, not data entry |
| 3 | Patterns | `/insights` | The month made scannable |
| 4 | Vet report | `/report` | The clinical payoff — hand the record to your vet |
| 5 | History | History tab | Everything kept, filterable, honest |
| 6 | *(optional)* Trial-aware picker | `/log?type=meal` | The diet trial follows you into the log flow |

### Frame 1 — Home with a live Signal (the wedge; leads search results)

- **State:** Signal zone in the **live** state with both seeded findings: ② `intake_decline` ("Cooper's eating less than usual" family — a *safety* card) and ① the beef↔vomiting `food_symptom_correlation` (Early tier, "may be linked" phrasing). **Expect the safety card to rank first** — safety leads by design (Principle 3); don't fight the ordering, it *is* the product. Below the Signal: the **TrialStrip** ("Venison trial · day N of 42" + the accent progress bar). Note: the strip's "ends …" line is suppressed while an intake-decline flag is live — expected, don't chase it. Day math is day-1-inclusive (B-421), so `started_at` 18 days ago renders **day 19** of 42.
- **Stage:** open Home fresh, let everything settle (no Trend skeleton, no pull-to-refresh band mid-frame). Both Signal cards must be fully in-frame; if the TrialStrip falls below the fold, the two cards win — the trial story is retold in frames 4 and 6.
- **Verify in-frame:** uppercase SIGNAL eyebrow, both cards with their priority rails, "Why we're showing this" hint visible on at least one card, no ghost preview sentences anywhere.

### Frame 2 — Quick-log (the 2-tap habit)

- **State:** the **`+` FAB menu open** over Home: "Recent foods" header with the seeded venison rows, then "Log food" / "Vomit" / "Loose stool" / "More events". This *is* the two-tap habit rendered: `+`, then the food you fed yesterday.
- **Stage:** capture with recent foods populated (the seed guarantees this). If the overlay menu reads cluttered against the dimmed Home at capture time, **fall back to the food picker** ("What did Cooper eat?" — search field, All/Meals/Treats/Wet/Dry chips, the tile library) and give frame 6's slot to the FAB menu instead — the two frames are swappable.
- **Avoid:** the free-feeding "Still accurate?" freshness prompt if one is pending — confirm it before capturing so the zone shows its quiet state.

### Frame 3 — Patterns (the month, scannable)

- **State:** `/insights` fully loaded on Cooper: the **Summary** card leading, then the **Vomit** metric card ("Last 30 days", the count, delta line, sparkline), and the top of the **Calendar** card. The seed's 3 vomits + ~40 meals + 2 weights make every card render with a coloured verdict where one is allowed (≥2 samples).
- **Stage:** enter via the Signal footer ("See all of Cooper's patterns →"), wait out the three skeleton cards, capture the top of the scroll. The Summary card renders from the same `generate-signal` run as frame 1 — if it's missing, re-run the function before concluding anything is broken.
- **Verify in-frame:** "Patterns" title, Summary eyebrow + body whose numbers match the cards below it.

### Frame 4 — Vet report (the clinical payoff)

- **State:** `/report` after generation completes: "Report range" chips, the resolved range line — expected **"Active diet trial · <dates>"** (no vet visit is seeded, so the trial is the default basis; it literally names the wedge) — the server-rendered report visible in the WebView (patient header + the top of the record), and the bottom bar: **"Send to vet"** + "Creates a PDF you can email, message, or AirDrop to your vet."
- **Stage:** open, wait out the full-screen "Building Cooper's report…" moment, don't touch the range (the "Updating…" pill is a do-not-capture state). Scroll the WebView so the report's top — the part a vet scans first — is what shows.
- **Note:** the frame captures whatever the *deployed* `generate-report` renders (the redeploy is deliberately held behind B-494). Step 11's own AC already requires a CLINIC-READY cold read on this rendered report; if the B-494 redeploy lands before submission, re-verify and recapture this one frame.

### Frame 5 — History (everything, kept)

- **State:** History tab, **default scopes** (All types · All time — pills quiet/untinted, which is the honest default per the filter invariants). Scroll positioned so the **D-3 beef treat row and its vomit row** sit mid-frame — the contraband-then-symptom pair quietly retells frame 1's correlation — with a mix of Meal / Vomit / Stool / Weight rows and at least one confidence tag visible (the seed varies `occurred_at_confidence` for exactly this realism).
- **Avoid:** the "Load more" footer as the dominant bottom element; any expanded row (View/Edit/Remove buttons read as debug-ish in a still).

### Frame 6 (optional) — the trial-aware food picker

- **State:** "What did Cooper eat?" with the **"ON THE TRIAL LIST"** pinned zone showing the venison staple above the rest of the library. No other pet tracker renders a vet's elimination-diet list inside the meal log — it's the wedge again, from the logging side.
- **Gated on** the §2.5 seed addendum (`diet_trial_foods` membership). If frame 2 fell back to the food picker, this slot takes the FAB menu instead. Five frames is a complete set — skip this one freely rather than delay.

---

## 4. Do-not-capture list (states that read unfinished or fake)

- Signal **"building"** state — the two ghosted preview insights are hardcoded example sentences; in a still image they are indistinguishable from fabricated data. This is the single worst possible frame 1.
- Any **skeleton** (Trend's gray bar, Patterns' three gray cards), the report's full-screen **"Building…"** moment, or the **"Updating…"** pill.
- **Error or retry states**, the free-feeding **"Still accurate?"** prompt, an **expanded History row**, the pull-to-refresh band.
- **Settings** anywhere in the set — the legal rows can render "Coming soon" and the Beta shelf invites questions. No frame needs it.
- Anything with a **notification banner, personal account email, or non-demo data** visible (T&S: demo-pet data only).

---

## 5. Captions — optional overlay copy (the polish pass, never the gate)

**Mechanics:** Apple has no caption field — captions are text baked into the uploaded image, which means a framing pass (canvas + device frame + overlay). That pass is explicitly **post-submission polish**. The copy below is pre-cleared so the pass is paste-ready whenever it happens.

**The bar every line was run against** — nyx-voice (calm, sentence case, no exclamation marks, specific over generic) plus the same Guideline 1.4.1 honesty bar as the listing: no diagnosis claim, no reassurance claim, no outcome guarantee, no endorsement we don't hold. A caption may describe what the app *does* (surface patterns, keep the record, build a report); it may never assert what the owner should *conclude* (pet is fine, cause found, problems caught).

| # | Caption | Why it clears the bar |
|---|---|---|
| 1 | Patterns between foods and symptoms, surfaced. | "Between" is associational, not causal — mirrors the in-app "may be linked" hedge. |
| 2 | Log a meal in two taps. | Mechanically verifiable — **confirm the recent-food path is literally two taps on-device before using; fallback: "Log a meal in seconds."** |
| 3 | A month of meals, symptoms, and weight — together. | Describes the rendered surface; no interpretation claimed. |
| 4 | Hand your vet the record, not your memory. | The record is the artifact; no claim the report diagnoses or replaces the vet. |
| 5 | Everything you log, kept — even the 2am details. | True by construction (soft deletes, auto-timestamps); "2am" is the wedge moment, not a boast. |
| 6 | Trial foods, pinned where you log. | Plain feature description. |

**Rejected lines, kept so step 13 inherits the reasoning:**

| Rejected | Why |
|---|---|
| "Find what's making your pet sick" | Diagnosis/causal claim — the engine surfaces hedged associations, never verdicts (1.4.1 + clinical-guardrails). |
| "Know your pet is okay" / "Peace of mind" | Reassurance on absence — the n=1 invariant binds marketing copy too. Absence of a flag is never wellness. |
| "Catch problems before they start" | Detection-reliability + outcome guarantee. |
| "Vet-approved" / "Built with vets" | An endorsement we don't hold. |
| "Never miss a dose!" | Exclamation mark; "never miss" guarantee; med-reminder implication the product deliberately avoids (notification spec G4). |
| "Peace of mind for pet parents" | Reassurance + the pet-brand register nyx-voice rejects. |

**Reconciliation flag:** `docs/store-listing-copy.md` does not exist yet — step 13 hasn't run — so these captions were drafted standalone against the shared bar rather than matched to a listing. **When step 13 drafts the listing, cross-check vocabulary** (if the subtitle says "patterns," captions shouldn't switch to "insights") and update this table if the listing lands on different framing. Captions were *not* inferred from an unwritten doc.

**Round-2 addendum:** caption text is reportedly OCR-indexed by App Store search as a *reinforcing* ranking signal (Appfigures 2025, observational — see the research brief §4), so the winning direction's caption pass should be written **with** step 13's keyword set, not merely reconciled after. The table above is now placeholder-grade pending that joint pass. One line pre-rejected for that pass: *"Find the culprit"* — the brand pun reads as an outcome promise the correlation engine deliberately never makes.

---

## 6. Upload + confirm

1. App Store Connect → the app → the 1.0 version's **App Store** tab → iPhone 6.9″ display → drag the frames in §3 order (file names `frame-01-…` through `frame-05/06-…` keep the order honest).
2. First 2–3 = search-result real estate; confirm frame 1 is the Signal, not a login screen.
3. Confirm with: **`Guide step 12 complete: N screenshots uploaded.`** — that message updates the tracker, B-269, and STATUS.md.

## 7. QA checklist for the captured set

- [ ] 4–6 portrait frames at 1320 × 2868 (or 1290 × 2796), PNG/JPEG, no alpha
- [ ] Every frame from the live demo account; no empty/building/skeleton/error state visible in any frame
- [ ] Frame 1 shows ≥1 live Signal card with the safety card leading, and zero ghost-preview sentences
- [ ] No mockups, no composited UI, no fabricated states (Guideline 2.3) — captures only
- [ ] No personal data, notification banners, or non-demo content in any frame
- [ ] If captions are used: every line appears verbatim in §5's approved table (or has been re-run through nyx-voice + the 1.4.1 bar)
