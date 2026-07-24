# Culprit Home Screen Widget — Requirements

**Version:** 1.0 (build-ready) | **Date:** 2026-07-24 | **Status:** PM-ratified 2026-07-24 (three mock rounds + reaction cycle, PR #419)
**Pairs with:** `docs/culprit-widget-mockups.html` (the design-locked round-3 mock) · `docs/logging-capture-discovery.md` (the evidence base — widgets = Direction B) · backlog B-289 / B-290 / B-291

---

## 0. Decision record

Rulings from the 2026-07-23/24 ideation sessions. D1–D6 and D8–D9 are PM rulings; D7 was PM-delegated to the Dir. of Engineering and is taken recommend-and-proceed.

| # | Decision | Ruling |
|---|---|---|
| **D1** | Direction | **Candidate A** — one `systemMedium` widget ("most promise, most real estate"). The jobs-to-be-done frame is the spine (§1). Candidates B/C/D parked, not dropped (§9). |
| **D2** | The no-garbage rule | **The widget only one-press-logs what it can name.** No generic events exist in any write path — "log a generic treat, edit later" is dead (PM: "no one is editing it later"). Every ambiguous path opens the app. |
| **D3** | Interaction model | Resting state = packed status column + two big tiles (Meal / Treat). **Tap a tile → the widget flips in place to that category's named choices** (1–2 one-tap named options + a dashed "Something else… — opens Culprit" row, always last). Status rows are glance-only; tapping one deep-links into the app. One interaction model for both categories. |
| **D4** | Monetization | **The widget ships free** (PM 2026-07-24: "easier logging means better retention; more data means more insights"). This **amends D-M1's "Home-screen widgets" Premium bullet** — Premium may later wrap widget *styles/extras*, never the capture surface. Tier-2 doc edits flagged in §10. |
| **D5** | Multi-pet | **Per-widget pet binding at placement** (long-press → Edit Widget → pick pet); a multi-pet household stacks one widget per pet. PM: "good v1." The widget deliberately never follows the in-app active-pet switch (the B-086 hidden-switch hazard). |
| **D6** | Feeding arrangements | Status rows are **driven by the pet's declared feeding arrangement** (B-040 machinery): scheduled slots → slot rows; a free-fed component → a bowl row; **hybrid (free-fed AND meals) coexists per pet** (the PM's own cat). A bowl "top up" is an arrangement event, never an intake claim. |
| **D7** | Platform path + sequencing (OQ3) | **Native extension targets are ratified as inside the managed-workflow constraint, via the `expo-widgets` path**: SDK 54→56/57 upgrade (module stable in SDK 56; JS-authored widgets, no SwiftUI in repo, CNG intact, EAS-built). Runtime B becomes a custom dev client (one-time switch, §6). Runs **parallel to B-288**, not instead of it (B-288's notification pilot remains independently valuable and separately gated). Resolves the CLAUDE.md native-targets Open Question. |
| **D8** | v1 event scope | **Meals + treats only.** No medication, symptom, or incident capture on the widget in v1 (med dosing carries safety semantics — B-156 G1 fail-safe, critical-drug escalation — that must not be compressed into a glanceable surface before those questions are settled; incidents are already well-served by camera-first capture). |
| **D9** | AI on the widget | **None in v1.** No Signal/AI-read copy (widget refresh cadence can leave a clinical sentence stale on the Home Screen; a "no signal" state is reassurance-on-absence). Escalate-only surfaces may be revisited post-v1 with the refresh mechanics understood. |

---

## 1. The widget's jobs (PM-defined)

The widget will never be as robust as the app. It has exactly two jobs:

1. **Keep Culprit top of mind** so logging happens, so we can help pets. The status column is the ambient half (the kitchen-counter "did you log it?" answered at a glance); the tiles are the capture half.
2. **"When in doubt, app it out."** Any path that can't produce a *named* event in ≤2 taps opens the app instead. The dashed "Something else…" row is this job made visible — present in every picker, always last, always honest about what it does.

**Non-goals (v1):** not a mini-app; no notifications (the widget is the anti-nag surface — Principle 4 untouched); no monetization state (D5 parity with Home); no reassurance of any kind; no streaks/scores; no per-person household stats (pet-centric only).

---

## 2. The design (design-locked to the round-3 mock)

One `systemMedium` widget, four states. Reference: `docs/culprit-widget-mockups.html`.

### 2.1 Resting state
- **Header:** CulpritMark (crescent + teal Signal dot — real `CulpritMark` geometry, static, never pulsing on the widget) · pet name · right-aligned context line (`Day 12 of 28` during a trial; `free-fed + meals` for hybrid; empty otherwise).
- **Status column (left, ~45%):** up to 2–3 chip rows from the feeding arrangement (D6). A logged slot shows `✓ + time`; an unlogged slot shows an open teal ring + expected window (`~6p`). **An unanswered slot is a visible gap — never an assumed ✓** (B-156 G1 generalized).
- **Tiles (right, ~55%):** two full-height tiles — **Meal** (accent, the primary action) and **Treat** (neutral). Whole tile is the target. Glyphs come from the app's `EventIcon` set (species-neutral by default; the mock's emoji are placeholders — icon pass owed, §10).

### 2.2 Picker states (the flip)
- Tapping a tile flips the widget in place (iOS 17 interactive widget state) to that category's picker: header (`Which meal?` / `Which treat?` + `‹ back`), then:
  - **Meal:** the next unlogged slot with its named food leads as the accent row (`Dinner — Hill's z/d · one tap · logs now`). During a diet trial the slot's food *is* the trial diet by definition. Hybrid pets also get their bowl row (`Top up bowl`). If a slot has no stable learned/declared usual food, it does not render as a one-tap row.
  - **Treat:** the pet's 2 most-logged treat items as one-tap rows.
  - **Always last:** `Something else… — opens Culprit` (dashed ghost row) → deep-link into quick-log with the category preselected.
- The picker auto-reverts to resting after a short idle or `‹ back`.

### 2.3 What a tap writes
- A one-tap row writes the **named item** immediately: meal → `meals` row with the slot's `food_item_id`, assumed portion, **no `intake_rating`** (a widget tap is not a witnessed rating); treat → the named treat item; bowl → the arrangement event.
- Post-write, the affected row shows `✓ just now · tap to undo` for ~60s (widget-local); the event is otherwise editable in-app like any other. (Undo interaction detail = build-time design pass, not a PM blocker.)
- Every write carries `logged_via='widget'` (§3).

### 2.4 Copy
All strings get the `nyx-voice` pass at build time (draft copy in the mock). Register: plain, warm, zero exclamation marks; the widget never praises, never warns, never reassures.

---

## 3. Data & provenance

- **B-289 `logged_via` lands first** (PR W1, own schema PR). Enum reserved values: `app` (default/backfill) · `notification` · `reconciled` · `widget` · `intent` · `watch` · `device`. Applied to `events`, `meals`, `medication_administrations`. Additive, non-destructive; unbackfillable later — this is why it precedes every capture surface.
- Widget writes: `logged_via='widget'`. Future Siri/NFC/Action Button paths (the B-291 free riders) write `logged_via='intent'` through the same App Intents.
- The engine/report treat a widget meal as **assumed-portion, unrated** intake — never conflated with a witnessed `intake_rating` (Data Scientist invariant from the discovery).
- No new tables. The widget writes the same rows the app writes, through the same sync rules (LWW unchanged).

---

## 4. Architecture

- **Module:** `expo-widgets` (stable SDK 56+; requires the SDK 54→56/57 upgrade, PR W2). Widget UI authored as JS components; App Group data sharing via the module's config plugin. No SwiftUI in the repo. CNG intact; EAS builds the extension.
- **Write path (B-290, PR W3):** App Group container shared app↔extension. The widget/intents append capture records to an **inbox**; the RN app ingests into SQLite + the existing sync queue on next foreground (and the intent may attempt a direct Supabase REST write when online — inbox is the source of truth for reconciliation). Session token shared via Keychain access group — must compose with the chunked SecureStore adapter (#306). `rls-privacy-reviewer` mandatory on this PR (a new authenticated path to pet data outside the app process).
- **Read path (widget state):** the app pushes a per-pet snapshot (slot states, named foods, treat shortlist, trial day) into App Group storage on every relevant change + on background refresh; the widget renders snapshots only — it never queries Supabase for display.
- **App Intents:** `LogMeal(pet, foodItem, slot)` / `LogTreat(pet, foodItem)` / `TopUpBowl(pet)` defined once (PR W4); the widget buttons execute them in-process. Siri phrases / NFC / Action Button / Back Tap / Controls ride the same intents later (Phase 2 recipe, B-291).
- **Deep links:** status rows → the day view; "Something else…" → quick-log with category preselected; all via existing routes.

### 4.1 Spike checklist (answer in PR W3, before W5 is committed)
1. Configurable widgets (per-widget pet binding, D5) supported by `expo-widgets`? (If not: fallback = a widget-kind per pet or `expo-apple-targets` for the config intent — decision returns to Dir. of Eng.)
2. In-place interactive state flip (picker states) achievable within the module's `UserInteractionEvent` model? Latency acceptable?
3. Timeline/refresh behavior: how stale can the status column get; what refresh budget do we get in practice?
4. Cold-start reliability of the background write (inbox ingest) — no lost taps.
5. Undo semantics (§2.3) — widget-local state vs a real revert write.

---

## 5. Acceptance criteria (v1)

1. From the Home Screen, a **named** treat is logged in ≤2 taps with no app launch; the record carries the item id + `logged_via='widget'`.
2. During an active diet trial, the meal picker's lead row is the trial diet; one tap logs it against the correct slot.
3. An unlogged slot renders as a gap on the widget; it is never auto-completed by time passing.
4. A hybrid pet (free-fed + scheduled meals) renders both row types; "Top up bowl" writes an arrangement event, not an intake rating.
5. Two widgets bound to two different pets on one Home Screen write to the correct pets independently of the in-app active-pet selection.
6. A widget write made offline appears in the app and syncs on reconnect through the existing queue (LWW intact).
7. No widget state ever renders Signal/AI copy, reassurance, praise, or monetization state.
8. **Kill criterion (B-291, unchanged):** ≥20% of spontaneous-event volume on dogfood devices after a month, or the watch app doesn't get funded.

---

## 6. Dev & QA workflow changes

- **Runtime B changes once:** widgets don't run in Expo Go → per-push on-device testing moves to a custom dev client (`expo-dev-client` build installed once per device; Metro + tunnel workflow otherwise unchanged). Update `docs/dev-handoff-runbook.md` when PR W2 lands.
- **Widget UI changes are not OTA-able:** each widget iteration needs a new binary (EAS build). PM previews ride **TestFlight builds** (Runtime A sessions) — expect a slower react-and-iterate cadence on widget visuals than the app's `eas update` path.

---

## 7. PR plan

Schema isolation, one-PR-per-session, and the Migration Safety Pre-flight all apply as usual.

| PR | What | Gates / notes |
|---|---|---|
| **W1** | **B-289 `logged_via` migration** — additive column + enum on `events`/`meals`/`medication_administrations`; own schema PR; pre-flight (rollback = `DROP COLUMN`; destructive **n**; backfill = default `'app'`) | Land before anything else; also unblocks B-288's provenance |
| **W2** | **Expo SDK 54→56/57 upgrade** — no features; dev-client switch documented; full regression QA on-device | Its own session; the riskiest-blast-radius PR of the chain |
| **W3** | **B-290 write path** — App Group + inbox + foreground ingest + Keychain-shared session + snapshot publisher; spike checklist §4.1 answered in the PR body | `rls-privacy-reviewer` **mandatory**; `code-reviewer` |
| **W4** | **App Intents + resolution logic** — `LogMeal`/`LogTreat`/`TopUpBowl`; pure, unit-tested resolution lib (slot→named-food, treat shortlist, trial-day) | Tests required (lib logic); `code-reviewer` |
| **W5** | **The widget** — round-3 states 1–4, pet binding, undo, deep links, EventIcon glyphs | `nyx-voice` + Designer + `pm-feature-review`; on-device QA via dev client |
| **W6** | **TestFlight cut** (Runtime A session) — PM previews the real widget | The PM's original ask: "ideally these run in TestFlight" |

**Phase 2 (parked, in rough order):** Candidate B small sibling (ships if A's interaction tests well) · free-rider owner recipe (Siri/NFC/Action Button/Back Tap — B-291's zero-marginal-code half) · Candidate C adaptive small (ground question = the D8 sibling call) · Candidate D Lock Screen accessories · StandBy audit · B-293 Live Activity (own track).

**Parallelism:** W1 is independent and can land immediately. W2 is independent of W1. B-288 (notification pilot) remains parallel to this entire chain and shares only W1. The Ask track (A5/A7) is disjoint. The one shared-file collision across all of these: `STATUS.md` at wrap.

---

## 8. Safety & privacy invariants (inherited, restated for this surface)

- **Fail-safe honesty:** no surface assumes an event into existence; unanswered = nothing recorded (B-156 G1 generalized).
- **n=1 never reassures / intake is not preference:** the widget records; it never interprets. No "all clear," no "doing great," no per-incident language.
- **Household visibility is pet-centric only:** counts like "2 logged today" never decompose per person; no partner-directed state (T&S surveillance guardrail).
- **Pre-auth surfaces (Phase 2 Lock Screen):** slot state + counts only; never symptom text or AI language.
- **Access control:** the extension's Supabase access uses the owner's own session (never a service key on device); RLS unchanged; `rls-privacy-reviewer` at W3.

---

## 9. Parked (not dropped)

| Item | State |
|---|---|
| Candidate B (small one-press treat logger) | Small sibling of A's treat path; same flip interaction stacked vertically; needs the species-neutral icon pass. Ships behind A. |
| Candidate C (adaptive status small) | Trial-aware small widget; **ground (day vs night) is an open brand question** — same call as the Signal card's D8 (`docs/culprit-in-app-brand-requirements.md`). |
| Candidate D (Lock Screen accessories) | Phase 2; T&S pre-auth rule recorded (§8). |
| Med / incident capture on the widget | Excluded by D8 (v1 scope); revisit after the med-completion-card safety questions settle. |
| Signal/AI on the widget | Excluded by D9; escalate-only revisit post-v1. |

---

## 10. Follow-ups & flagged doc edits

**Build-time (no PM gate):** EventIcon glyph pass for the tiles (species-neutral default) · undo interaction design · `nyx-voice` copy pass · `dev-handoff-runbook.md` update at W2.

**Tier-2 doc edits (PM confirmation before writing):**
1. `docs/monetization-and-throttling-requirements.md` — remove/reframe the "Home-screen widgets" Premium bullet per D4 (Premium may wrap widget styles, never the capture surface).
2. B-263 paywall bullet list — same swap when the paywall copy is next touched.
3. `docs/logging-capture-discovery.md` is a frozen artifact — not edited; this doc supersedes its Direction-B sketch with the ratified design.

**CLAUDE.md (Tier 1, applied with this doc):** the native-targets Open Question resolved per D7; this doc added to the Read-These table.
