# App Review Demo Account — Requirements

**Version:** v2 · **Created:** 2026-07-11 · **Last Updated:** 2026-08-09 · **Owner:** PM, with Data Scientist / Trust & Safety / Dr. Chen / Designer / QA lenses
**Backlog:** B-271 · **Guide:** [`docs/app-store-submission-guide.md`](./app-store-submission-guide.md) step 11 · **Register:** [`docs/app-store-readiness.md`](./app-store-readiness.md) Tier 2
**Status:** v1 decisions **D1–D7 ratified 2026-07-11 (#336)**. This **v2 (2026-08-09)** refreshes the plan to the app as actually shipped — the diet-trial lifecycle went from a zero-row table to a full feature, `food_items` went per-account, and a dozen new surfaces exist. The **v2 deltas (D5 inversion, D8–D10, the tiered scope menu)** await PM ratification before PR 1. §12 now carries the detailed **PR-by-PR + live-execution plan**. The seed (PR 1) and reviewer notes (PR 2) are **not yet built**.

---

## 0. What changed in v2 (read this if you knew v1)

The v1 plan was written against migrations 001–029, before the wedge feature had a write path. Five things moved the ground under it:

1. **`food_items` is per-account now (migration 033 / B-354), so v1's D5 is *inverted*.** The old rule was "reference existing *global* food rows only, never create any" — because a food row was visible to everyone. That is no longer true: food rows are owned (`created_by_user_id`), RLS default-deny to other accounts. So the demo now **creates its own** venison/beef rows — and *must*, because the `diet_trial_foods` RLS `WITH CHECK` rejects a food the demo user doesn't own.
2. **The diet-trial lifecycle shipped (B-417, PRs #450–#481).** `diet_trials` held zero rows when v1 was written; the story faked a bare row. It now seeds the **real** schema — `diet_trials` (with `indication`, `phase`, `ended_at`, `transition_started_at`), the dated **`diet_trial_foods`** allowed set, and `target_protein` (053) — and the "contraband beef" is caught by the **shipped** off-diet detector (`lib/dietTrial.ts`), not a fake.
3. **The trial tables are now mirrored on-device (B-417 PR 2).** v1's §4 said `diet_trials` wasn't hydrated; it is now (in `LOCAL_WIPE_TABLES`). Server-side seeding still reaches every on-device surface — the conclusion holds, the mechanism is updated.
4. **The bar is now tiered (D8).** v1 treated "make the Signal genuinely fire + ~50 events" as *the* standard. v2 restructures around a **defensible minimum → optional richness** menu (§3.5) so the App Store consultant sets the line, rather than baking in the maximal seed.
5. **Rebrand Nyx → Culprit** + a wave of new surfaces (Ask, notifications, Vet Files, med strip/history, the widget, the Signal redesign). Each gets an explicit in/out call in the tier menu (§3.5) and the exclusions list (§10). The one that's a *correction* not a choice: **Ask is out because its client screen isn't shipped** (A5 ⬜), so it isn't reviewable regardless.

---

## 1. Context — why we're doing this

Culprit is **login-gated**: after the B-251 revamp, App Review's first screen is Landing → account → pet setup. Nothing real is reachable without an account. There are three escalating reasons a seeded demo account is a submission gate, not a nicety:

1. **Apple requires working credentials (Guideline 2.1).** Any login-gated app must supply demo sign-in credentials in App Review Information, or it's rejected on sight.
2. **An *empty* account is nearly as bad as no account.** Every surface that differentiates Culprit is an *intelligence* surface that needs weeks of data to render anything — the Home Signal, Trend, Patterns, the vet report all show designed empty states on day one (Principle 3). A reviewer who can't make the app do its distinctive thing writes the stock rejection *"we were unable to evaluate the app's features"* — the most common rejection for data-driven apps.
3. **The demo account is Apple's only window into the wedge.** Our whole positioning is that we're *not* a generic tracker — logging becomes a clinical-grade Signal and vet report. That claim is invisible in an empty account. This is the one chance to show the reviewer the Signal firing and the report rendering. **New in v2:** the wedge is now a *genuinely shipped feature* (the diet-trial lifecycle), so the demo shows the real thing working, not a hand-built row.

**Bonus:** a pre-seeded, already-confirmed account sidesteps the B-152 email-confirmation dependency — the reviewer never has to receive and click a confirmation email.

The hard part — and the reason this needs a spec rather than "insert some rows": **the Signal must *genuinely* fire, and the `clinical-guardrails` invariants forbid faking it.** The detection engine only emits a finding when a real pattern clears real thresholds, and n=1 never reassures. So the demo data has to tell an honest clinical story that legitimately trips a detector. That's a product-narrative decision with a clinical-integrity constraint on top — §3.

---

## 2. Decisions

**v1 (ratified 2026-07-11, #336):**

| # | Decision | Rationale |
|---|---|---|
| **D1** | **v1 story = a diet-trial dog** (Cooper), leading with the flagship food↔symptom correlation Signal + a safety intake-decline backstop. | The literal primary wedge; lights up the most surfaces. **v2:** now seeds the shipped B-417 lifecycle, not a bare row. Cat (picky-vs-sick) is held for demo account #2 (§6). |
| **D2** | **Seed as an idempotent, date-relative, parameterized SQL script** (`scripts/seed-demo-account.sql`), re-run right before submission. | Detectors read recent windows + the Signal cache has a 24h TTL, so fixed dates age out (§8). Parameterization is what makes "multiple demo accounts later" cheap (§6, B-324). |
| **D3** | **`generate-signal` is invoked for the demo pet after seeding** — the Home Signal is a **server cache**, not computed on-device. | Seeding rows is necessary but not sufficient; without the Edge Function run, the reviewer sees a "still building" card (§4). |
| **D4** | **Credentials live only in App Store Connect.** The account is created through the real signup flow; the password never enters the repo. `docs/app-review-notes.md` uses a placeholder. | Trust & Safety: no secret in version control. |
| **D6** | **Seed 1–2 real event photos**; leave live camera as the reviewer's own demo (pointed at in the notes). | Timeline looks alive without shipping a fake camera flow; one photo also feeds the per-incident vomit read (D7). |
| **D7** | **Include the per-incident vomit AI read** (run `analyze-vomit` on one photo'd vomit event). **Skip** the medication/adherence thread for v1 review. | (a) is another visible "intelligence" moment for cheap; (b) is scope the reviewer doesn't need. **v2:** now governed by the D8 tier menu — the vomit read is Tier 2, medication is Tier 3. |

**v2 (proposed 2026-08-09 — awaiting PM ratification):**

| # | Decision | Rationale |
|---|---|---|
| **D5** ⟳ | **INVERTED. Seed the demo account's OWN `food_items`** (a venison staple + a beef "contraband" row). | Migration 033 (B-354) re-scoped `food_items` to per-account: demo rows are RLS-scoped to the demo user and **cannot** leak into any real user's picker. Moreover the `diet_trial_foods` RLS `WITH CHECK` (040) *requires* the demo user to own the food, so the v1 "reference global rows" rule would now **fail the write**. The old hazard became the new requirement. |
| **D8** ✚ | **Tiered scope.** Build the seed as a **defensible minimum (Tier 1) + optional additive richness (Tiers 2–3)**; the App Store consultant sets the line (§3.5). | PM steer 2026-08-09: "we don't necessarily need data in every feature." The doc becomes a decision surface for the consultant, not a fixed maximal spec. Tiers 2–3 are additive toggles in the script. |
| **D9** ✚ | **Ask OUT of the demo; Signal-v2 and the widget NOT allowlisted for the review account.** | **Ask** — its client surface (A5) isn't shipped, so it isn't reviewable (a correction, not a choice). **Signal-v2** (`signal_design_v2`) is flag-dark/GA-held — the reviewer should see what actually ships (the classic Signal); allowlisting to preview an unshipped design is wrong. **Widget** — per the B-712 beta ruling, don't allowlist the review account; adding the widget shows the neutral "No pet in this slot yet" empty state, which is honest. |
| **D10** ✚ | **Seed against the shipped diet-trial lifecycle**, not a bare `diet_trials` row: one active trial + a dated `diet_trial_foods` allowed set + `target_protein`; the off-diet exposure is **detected** by `lib/dietTrial.ts`, never asserted. | The wedge shipped; the demo must exercise the real feature (card v2, TrialStrip, trend compliance mode, off-diet detection) so the reviewer sees the product, and so the seed can't drift from production behavior. |

---

## 3. The v1 demo story — "Cooper"

**The owner & pet.** A reactive owner (Jordan persona) whose dog **Cooper** (~12 kg, medium breed) was sent home on a **novel-protein elimination trial** to chase down a food trigger behind his vomiting. This is the exact wedge scenario.

### 3.1 The trial (seeded against the real B-417 schema)

One active `diet_trials` row for Cooper:
- `status = 'active'` (the one-active-trial UNIQUE index means exactly one — 040 §3)
- `indication = 'gi'` (vomiting is a GI sign; ENUM, not free text — 040 §1)
- `phase = 'elimination'`, `food_label = 'Venison LID'`
- `started_at` = 18 days ago; `target_duration_days = 42` (owner-set 6-week target → the Trend zone renders in **compliance mode**, "Day 18 of 42")
- `transition_started_at` ≈ 25 days ago (a realistic ≥1-week transition before exclusive feeding)
- `target_protein = 'venison'` (migration 053 / B-704 → the trial card names the protein)

Plus the **allowed set** in `diet_trial_foods` (D3 / 040 §2):
- the venison food as `role = 'primary_diet'`, `allowed_from` = `started_at`, `food_label` captured at write time

The **beef treat is deliberately NOT in the allowed set** → the shipped off-diet predicate (`lib/dietTrial.ts`) flags each beef feeding as an **off-diet exposure**, dated correctly against membership. This is the real feature detecting a real contraband, not a fabricated flag.

### 3.2 The ~3-week event sequence

(Relative to "now"; all timestamps stored UTC.) The design encodes two honest findings and a rich, scrollable timeline:

| Day | Events | Why it's there | Detector effect |
|---|---|---|---|
| D-21 → D0 | 1–2 **venison** trial meals/day, rated mostly `all` / `most` | Establishes the ≥4-meal baseline; as the daily **staple** it correctly **washes out** of the correlation, and it's the in-allowed-set adherence record | baseline for ① and ②; trial adherence |
| D-16, D-9, D-3 | a **beef** treat (the "contraband" that breaks the trial), each followed within ~4h by a **vomit** | The sneaked-in non-staple protein present only on symptom days; not in `diet_trial_foods` → an **off-diet exposure** | **① food↔symptom correlation** (Early tier) — *"beef may be linked to Cooper's vomiting"* + the trial's off-diet-exposure surface |
| D-3 vomit | + a **photo** attachment | Feeds the per-incident read (D7, Tier 2) + timeline realism | **`analyze-vomit`** → `event_ai_analysis` read (worth_a_call / monitor — never reassuring) |
| D-20, D-6 | two **weight_checks** | Two samples = trend + coloured verdict allowed | Patterns weight card + Profile weight trend |
| D-14, D-7 | a normal **stool** each | Timeline realism | — |
| D-1, D0 | trial meals dip to `some` / `picked` (≥1 WSAVA point below the `all`/`most` baseline) on 2 consecutive days | The **safety backstop** so the Signal is never empty even if the correlation drifts a day out of window | **② intake_decline** (`consecutive_low`) — *"Cooper's eating less than usual"* |

**Why two findings.** The correlation (①) is the flagship but the hardest to fire and most drift-sensitive; the intake decline (②, a *safety* detector) fires from far less data and anchors the demo so the reviewer's Signal card is **never** empty. Both are clinically honest — a real trigger being *found*, a real dip being *flagged*, zero reassurance.

**Why this story dodges the B-494 hold.** The live `generate-report` (v14) still carries the pre-refusal-band heuristic (the B-494 redeploy is held; see the diet-trial review). That hold bites a *refusing* patient — an empty safety band read as reassurance. Cooper is a **found-trigger + mild-dip** story, not a refusal, so the held detector isn't the one his report needs, and the report renders correctly at v14. (Do not reshape the story into a refusal case to "show more" — that would walk straight into the held gate.)

### 3.3 The honesty check (Data Scientist + Dr. Chen)

The trial food (venison) washing out of the correlation is the exact correctness property the `nearest-preceding-meal` bug violated and the adversarial reviews exist to protect — verify it against the golden fixture before trusting the seed. The vet report must read clinic-grade cold (`vet-report-cold-read`), and no surface may reassure on the *absence* of a red flag (n=1 invariant).

Event volume (~50+ events over 21 days) comfortably clears `SUBSTANTIAL_MIN_EVENTS = 8` / `SUBSTANTIAL_MIN_DAYS = 7`, so the Signal card is past "still building."

### 3.5 The tiered inclusion menu (D8 — consultant sets the line)

The seed is built so the tiers below are **additive toggles**. Tier 1 is the defensible submission floor; Tiers 2–3 are richness the consultant can call for or wave off. Nothing here is a hard blocker except Tier 1.

| Tier | Surfaces | What it takes | Recommendation |
|---|---|---|---|
| **Tier 1 — must-have (the floor)** | Working credentials · a non-empty account · the **wedge visible**: the diet-trial card + Trend compliance mode + a populated Timeline + Patterns rendering + the **Signal firing** (② at minimum, ① as flagship) + a **vet report that renders** | The §3.1–§3.2 trial + event sequence + `generate-signal` run | **Ship this.** It's the line between "evaluated" and the "unable to evaluate the app's features" rejection. |
| **Tier 2 — nice-to-have (cheap intelligence)** | The per-incident **vomit AI read** (1 photo, D7) · the **weight trend** · **stool** events | 1 photo'd vomit + `analyze-vomit` run; 2 weight_checks; 2 stool events (all already in §3.2) | **Include** — low cost, high "not a generic tracker" payoff. Already in the story. |
| **Tier 3 — skip for v1 (present as designed empty/neutral states)** | **Medication** (strip/history) · **Vet Files** · **Ask** · **Signal-v2** · **home widget** · **notifications** | Nothing — these render their designed empty/neutral states with no seed | **Skip.** Each is honest empty (or, for Ask/Signal-v2/widget, not shown per D9). Consultant may promote any to Tier 2 (med course + vet doc are the cheapest promotions). |

---

## 4. The two rendering paths (the mechanism that must be right)

Seeding is split by *how each surface renders*. Getting this wrong is how the reviewer ends up staring at empty states on a fully-seeded account.

| Surface | Renders from | Requirement |
|---|---|---|
| **Home Signal** + AI Summary | **Server cache** (`ai_signals`), read cache-only — never computed on open (`hooks/useSignal.ts`) | Events seeded **AND** `generate-signal` POSTed for the pet (or Home opened once so the background regen lands) |
| **Trend zone** | On-device, hydrated SQLite (last 14 days) | ≥3 distinct days with any event; **compliance mode** when an active `diet_trials` row exists |
| **Diet trial card + `TrialStrip`** | On-device, the **local `diet_trials` + `diet_trial_foods` mirror** (B-417 PR 2) | the seeded active trial + its allowed set sync down on login (see hydration below) |
| **Patterns dashboard** | On-device, hydrated SQLite (last 30 days) | ≥1 symptom **or** feeding **or** weight; coloured verdict needs ≥2 samples |
| **Timeline** | On-device, hydrated SQLite | any non-deleted events |
| **Vet report** | Generated on demand → writes a `vet_reports` row + PDF (`generate-report` v14) | substantive events inside the report's date range |
| **Per-incident vomit read** | `event_ai_analysis`, written by `analyze-vomit` (service role) | run the function on a photo'd vomit event |

**Hydration (B-054 + the B-417 mirror).** On the reviewer's device, login → `syncNow()` → down-sync pulls the account's rows into local SQLite. The current mirrored set (`lib/hydration.ts` `LOCAL_WIPE_TABLES`) now includes `events, meals, event_attachments, vet_visit_attachments, medication_*, weight_checks, diet_trial_foods, diet_trials, vet_documents, vet_visits, feeding_arrangements, notification_preferences` + the food cache. So **server-side seeding reaches every on-device surface, including the diet trial** — the one thing that is *not* hydrated is `ai_signals`, which is read cache-only, which is exactly why D3's explicit `generate-signal` run is required. (Re-verify the exact set against `lib/sync.ts` / `lib/hydration.ts` at build time; it grows.)

---

## 5. Data model & conventions

The seed writes to (schema through migration 055): `user_profiles` (set `timezone` — a detector reads it), `pets` (`is_active` true), `events` (`deleted_at` NULL; `occurred_at` + `occurred_at_confidence`; `logged_via`), `meals` (`intake_rating` enum), `weight_checks`, **`food_items` (the demo user's own — per-account)**, **`diet_trials`** + **`diet_trial_foods`** (the allowed set), and — for Tier 2 — one `event_attachments` + one `event_ai_analysis`. Conventions that must hold:

- **All timestamps UTC**; the app converts at display using `user_profiles.timezone`. (The day boundary is *local* midnight — B-421 — so set a real timezone and keep the last-2-days dip and recent vomit inside their windows for that zone.)
- **Soft-delete asymmetry:** `pets` uses `is_active` (boolean); `events` use `deleted_at` (NULL = active). Seed active rows.
- **`meals.intake_rating`** ∈ `refused | picked | some | most | all` (WSAVA 5-point); **`events.occurred_at_confidence`** ∈ `witnessed | estimated | window` — vary it (some witnessed, some discovered) so the timeline is realistic and the per-incident/timing detectors have honest inputs. Set `logged_via` to a plausible capture path (e.g. `quick_log`).
- **`food_items` are PER-ACCOUNT (D5 inverted).** Create the demo user's own venison + beef rows (`created_by_user_id` = the demo user). They are RLS-scoped and invisible to every other account, so there is **no** catalog-leak hazard — the opposite of v1's rule. The `diet_trial_foods` allowed-set rows must reference these owned food ids (the RLS `WITH CHECK` enforces it).
- **`diet_trial_foods` membership is DATED.** `allowed_from` on the venison primary-diet row = the trial start; do not backdate edits (040 §2 — dated membership is what stops a retroactive rewrite of exposure history).
- **RLS:** everything is the demo user's own pet data; the seed runs with the **service role** via the Supabase MCP (`execute_sql`), so it isn't RLS-gated on write, but the *shapes* must satisfy the same ownership graph (`pet_id ∈ pets WHERE user_id = <demo user>`, and `food_item_id ∈ food_items WHERE created_by_user_id = <demo user>`).

---

## 6. Multi-account architecture (PM steer — "multiple demo accounts in the long term")

The PM's note that we'll likely want several demo accounts is a **v1 design constraint**, not just a future item: build the seed so a second account is a *config*, not a rewrite.

- **Parameterize** the script by `(target_user_id / email, story_profile)` — the account identity is an input, never hardcoded (contrast `scripts/export-pet-timeline.sql`, which hardcodes a prod `pet_id`).
- **Story profiles as data.** Cooper (diet-trial dog) is profile #1. The picky-vs-sick **cat** (Sam persona — a single below-baseline day fires the safety Signal) is the obvious profile #2, and a two-pet household (multi-pet is free — B-086) a profile #3. Each profile is a declarative event list the same engine applies.
- Tracked as **B-324** (Later) so the expansion is on the record; v1 ships one profile but with the seam in place.

Why it matters beyond convenience: multiple honest stories let us demo different surfaces (correlation vs. the picky-eater safety read vs. multi-pet-is-free) and give resubmission flexibility if a reviewer asks to see something specific.

---

## 7. Reviewer notes — `docs/app-review-notes.md`

A short doc the PM pastes into ASC → App Review Information → Notes (the demo **credentials** go in the dedicated *Sign-In Required* username/password fields, not the free-text notes). Outline:

- **What Culprit is** (one paragraph): frictionless pet-health logging → a clinical-grade Signal and vet report; the reactive-owner wedge. (Brand = **Culprit**.)
- **Demo credentials:** `<placeholder — real values entered only in ASC>`.
- **Where to look:** Home **Signal** card (the AI read); the **diet-trial card** + **Trend** (Day 18 of 42, off-diet exposures); **Patterns**; a vomit event → the **per-incident vomit read**; generate/open the **vet report**.
- **Framing to expect:** every AI read is explicitly *"not a diagnosis"* and never reassures on absence — this is deliberate clinical posture (helps against Guideline 1.4.1 scrutiny; pairs with the B-270 disclaimer).
- **Permissions the reviewer may see:** a **camera/photo** prompt (log a meal or symptom with a photo — the live demo of the surfaces we didn't pre-seed) and, if they open notification settings, a **notification** permission prompt (off by default — Culprit never nags; Principle 4).
- **Out of scope for this review (so the reviewer isn't hunting for them):** Ask (not yet shipped), the home-screen widget (shows a neutral empty slot on this account), and any Premium/paywall (not live — Principle 7, core care is always free).
- Runs through `nyx-voice` (owner-facing tone) and stays clinically honest.

---

## 8. Freshness, lifecycle & the re-seed protocol

Detectors read recent windows (intake = 14d, worsening = 7d, chronicity = 56d, descriptive = 60d) and `ai_signals` has a **24h TTL**. Consequences the script must handle:

- **Date-relative seeding** — every timestamp computed from "now," so the last-2-days intake dip and the recent vomit stay inside their windows whenever the script runs.
- **Re-seed before submit, and if review slips.** The script is idempotent (safe to re-run: clear the demo pet's prior seeded rows scoped to the demo `pet_id`, or upsert deterministically) so we can refresh the window the day we hit Submit and again if App Review is delayed. **Clear children before parents** (`diet_trial_foods` before `diet_trials`; meal/weight/attachment children before `events`) to respect FK cascade.
- **Re-run `generate-signal` after every re-seed** (D3) — a fresh cache, not a 25-hour-stale one.

---

## 9. Trust & Safety

- **No secret in the repo** (D4): password only in ASC; placeholder in the notes doc.
- **Account isolation:** the demo account is a normal, RLS-scoped user; it can see only its own pet. The seed touches only that user's graph. `rls-privacy-reviewer` is *not* required for a single-owner seed, but the service-role `execute_sql` step must be scoped to the demo `pet_id` / demo user — never a blanket write.
- **Catalog hygiene is now automatic, not a rule to remember (D5 inverted).** Because `food_items` is per-account (033), the demo's venison/beef rows are RLS-scoped to the demo user and invisible to every real user's picker by construction. The v1 hazard ("a demo row leaks into everyone's catalog") **cannot happen** — this is why v2 seeds its own rows freely.
- **Post-launch teardown:** note in the notes doc / backlog that the demo account and its data can be deleted after approval (it exercises the B-039 deletion path via `delete-account` — a nice bonus check), or kept for future submissions.

---

## 10. Deliberately excluded from v1 (with rationale)

- **Ask (the AI Q&A surface)** — **not a choice: its client screen (A5) isn't shipped**, so there is no entry point in the build to review. If we want Ask in front of Apple, that's a "ship A5 first" decision, not a seeding one.
- **The Signal redesign (`signal_design_v2`)** — flag-dark, GA held. The reviewer sees the shipping (classic) Signal; we do **not** allowlist the demo to preview an unshipped design (D9).
- **The home-screen widget** — not allowlisted for the review account (D9 / B-712 ruling); adding it shows the neutral "No pet in this slot yet" empty state. (It's also native — only present in a fresh TestFlight build cut, not via OTA.)
- **Medication / adherence thread, Vet Files, notifications data** — real surfaces, but the reviewer doesn't need them to evaluate the app; they render designed empty states. Tier-3 (§3.5); consultant may promote the cheapest (a med course or one vet document) to Tier 2.
- **Descriptive timing detectors (⑤/⑥)** as an explicit target — they need witnessed vomit onsets ≤30 min post-meal and a set timezone; nice if they fire from the data, not worth contorting the story for. ① + ② are the committed findings.
- **A fabricated "improving/healthy" reassurance state** — forbidden by `clinical-guardrails`; the honest story is a trigger being found + a dip being watched. (And a refusal story would hit the B-494 hold — §3.2.)

---

## 11. Open sub-decisions (build-time — not PM-blocking)

- **S1 — idempotency mechanism:** delete-then-insert scoped to the demo `pet_id` (children-first) vs. deterministic upsert keys. Recommend delete-then-insert (simplest to reason about for a throwaway-ish account).
- **S2 — exact breed / name / weight** for Cooper (cosmetic; pick something unremarkable and real).
- **S3 — the demo's food rows** (D5 inverted): **create** the venison staple + beef contraband as the demo user's own `food_items` (no live-catalog query needed anymore — that was the v1 global-catalog constraint). Pick realistic labels; set `proteins` (039) so the correlation/protein surfaces read cleanly.
- **S4 — how the script runs:** committed `.sql` executed via the Supabase MCP `execute_sql` (service role) at PM-gated time, vs. a parameterized template the session fills in. Recommend committed script + MCP execution, matching the guide.

---

## 12. Build plan — PR-by-PR + live-execution runbook

The work is **two committed-code PRs** + a **PM-gated live-execution runbook**. Note what it is *not*: **a data seed, not a migration.** Nothing goes in `supabase/migrations/`; the seed writes rows to existing tables and is run with the service role via the Supabase MCP `execute_sql`, never `apply_migration`. The account-creation dependency (B-152) is cleared (email confirmation ON, SMTP verified), so the only gate on the live phase is the account existing.

**At a glance:** PR 1 (seed + validation) → PR 2 (reviewer notes) → live runbook (steps 1–6). Phase A (story design) is done — it's this doc.

### 12.1 The one implementation decision that shapes PR 1 — single source of truth (resolves S4)

The whole point of this plan is that the Signal fires **honestly and verifiably** (§3.3). A seed whose validation drifts from what it actually writes would defeat that. So PR 1's structure is a real choice:

- **Recommended — one declarative story module.** A pure-data TypeScript module (`scripts/demo/demoStory.ts` — no I/O, no runtime-specific imports) is the single source of truth for the story: the pet, the demo's own `food_items`, the `diet_trials` + dated `diet_trial_foods` + `target_protein`, and the date-relative event/meal/weight/stool sequence — parameterized by `(userId, timezone, now)`. Three consumers import the *same* module: the SQL emitter, the Deno detection test, and the jest off-diet test. Drift is impossible by construction.
- **Lighter — pure `.sql` + a parallel fixture.** A hand-written `scripts/seed-demo-account.sql` plus a separate detection fixture. Simpler to eyeball, but the two can silently diverge — exactly the failure mode §3.3 exists to prevent. If chosen, add a guard test that diffs the two shapes.

**Recommendation: the declarative module** — it's what makes the adversarial gate meaningful. The cross-runtime wrinkle (detection is Deno; `lib/dietTrial.ts` is jest) is handled by keeping the module pure-data so both runtimes import it; PR 1 owns picking a location both test roots reach.

### 12.2 Committed-code PRs

**PR 1 — Demo story + seed emitter + honest-firing validation** · `[PR]` · **adversarial-mandatory**
- **Goal:** produce the Tier-1 seed *and* prove, before any live account is touched, that it fires the two findings honestly.
- **Deliverables:** `scripts/demo/demoStory.ts` (the declarative story, parameterized + date-relative); `scripts/demo/emitSeedSql.ts` (renders it → idempotent, `pet_id`-scoped SQL, children cleared before parents); a **Deno** validation under `supabase/functions/generate-signal/` that runs the story through `detection.ts` and asserts **① beef↔vomit fires (Early)**, **② `intake_decline` (`consecutive_low`) fires**, and **the venison staple washes out**; a **jest** validation that `lib/dietTrial.ts` flags each beef feeding off-diet and the venison in-set.
- **Gates:** `adversarial-reviewer` **mandatory** — must state the counterexample it tried against "staple washes out / never reassures on absence" and why it held (the DoD adversarial line; this is the nearest-preceding-meal class of bug the gate exists to catch) + `code-reviewer`. No `nyx-voice` (no owner-facing copy).
- **AC:** both validations pass in CI; the emitter is **idempotent** (re-emit → one clean copy) and **date-relative** (findings stay in-window for any `now`); the seed references only the demo user's own `food_items` (D5); it is not a migration.
- **Depends on:** nothing external — runs entirely offline against the engine. **This is why PR 1 can be built now**, in parallel with the consultant's Tier 2/3 call.

**PR 2 — Reviewer notes** · `[PR]` · can ride PR 1 or ship standalone
- **Goal:** the doc the PM pastes into App Store Connect.
- **Deliverables:** `docs/app-review-notes.md` per §7 — what Culprit is, where to look, the "not a diagnosis / never reassures" framing (Guideline 1.4.1), the camera + notification permission notes, the out-of-scope list, and **placeholder credentials only** (D4).
- **Gates:** `nyx-voice` + `clinical-guardrails` (no reassuring phrasing).
- **AC:** Culprit-branded; no real credentials; nyx-voice-clean.

### 12.3 Live-execution runbook (PM-gated — not PRs)

Runs once the account exists; the seed steps re-run before Submit (§8).

1. **[PM] Create the demo account** via the real signup flow (email confirmation ON) and create Cooper through onboarding, so `onboarding_completed_at` is set and the reviewer lands in a finished account. Set the credentials (email convention + password → **only in ASC**, D4) and hand Claude the demo email.
2. **[Claude] Resolve the demo `user_id` / `pet_id`** (`execute_sql` lookup by email), then **run the emitted seed** scoped to that `pet_id` via the Supabase MCP (service role). Re-run is safe (idempotent).
3. **[Claude/PM] Tier-2 photo + AI read:** upload one vomit image to the event-attachments bucket, insert the `event_attachments` row, and produce the `analyze-vomit` read on it (`analyze-vomit` is `verify_jwt=true`, so this runs under the demo user's session — Claude with the demo password, or the PM logs one vomit-with-photo in-app, which triggers the read naturally). The read must not reassure.
4. **[Claude] POST `generate-signal`** for the demo pet (D3) so the Home Signal cache is populated (not "still building").
5. **[Mixed] Verify (Phase E):** `ai_signals.findings` non-empty (① and/or ②); the diet-trial card + Trend compliance render on-device from the mirror; the vet report renders over a real range; `vet-report-cold-read` → CLINIC-READY; Timeline/Patterns populated; the Tier-3 surfaces show their designed empty/neutral states. Spot-check on the reviewer's install.
6. **[Claude] Re-seed + re-`generate-signal` right before Submit** (and again if review slips) so the recent-window findings and the 24h Signal cache are fresh.

### 12.4 Prerequisites & dependencies
- **Cleared:** B-152 (email confirm ON, SMTP verified) · B-054 hydration · B-417 trial mirror · B-272 (ASC record).
- **PM dashboard item in the same submission window (not a demo blocker, but a reviewer sees it):** auth email templates still say "Nyx" (hardening audit §B7) — rename before a reviewer creates their own account. Also delete the `+smtp1` test user (STATUS housekeeping).
- **Feeds:** submission-guide step 12 (store screenshots are captured on this account).

### 12.5 Sequencing & parallelism
- **PR 1 is unblocked now** and independent of the consultant's Tier 2/3 decision — Tier 1 is the floor regardless. Build it in parallel with the consultant review.
- **PR 2** can be written any time (no code dependency).
- The **live runbook** waits only on the PM creating the account; everything before it is offline.

---

## 13. Acceptance criteria (QA)

- [ ] Seed script is **idempotent** (re-run leaves one clean copy, not duplicates; children cleared before parents) and **date-relative** (findings stay in-window whenever run).
- [ ] On the seeded pet, **at least one Signal finding fires** after `generate-signal` — ② (intake decline) at minimum; ① (correlation) as the flagship. Verified in `ai_signals.findings`, not assumed.
- [ ] The trial-food staple (venison) **washes out** of the correlation (no false implication) **and** the off-diet beef is flagged as an exposure by `lib/dietTrial.ts` — adversarial-reviewer confirmed.
- [ ] **Tier 1 — no surface shows an empty state:** Home Signal (card, not "building"), the **diet-trial card + Trend compliance mode** (rendered from the seeded lifecycle, not a bare row), Patterns (cards), Timeline (populated), vet report (renders with a real date range).
- [ ] The per-incident vomit read renders on the event detail and **does not reassure** (n=1 invariant). *(Tier 2)*
- [ ] `docs/app-review-notes.md` exists, is nyx-voice-clean, Culprit-branded, and contains **no real credentials**.
- [ ] The demo's `food_items` are **per-account scoped to the demo user** (verified: they do not appear in another account's picker) — the D5-inverted replacement for v1's "no global rows" criterion.
- [ ] `vet-report-cold-read` returns CLINIC-READY on the rendered report.

---

## 14. References & backlog reconciliation

- **B-271** — App Review demo account + reviewer notes (this spec is its build-ready plan).
- **B-324** (Later) — multiple demo accounts / parameterized story profiles (the §6 expansion).
- **B-417** — the diet-trial lifecycle the demo now seeds against (migrations 040/041; `lib/dietTrial.ts`). **B-354** — per-account `food_items` (migration 033, the D5 inversion). **B-704** — trial `target_protein` (migration 053).
- Guide **step 11** (`docs/app-store-submission-guide.md`); register **Tier 2** (`docs/app-store-readiness.md`).
- Depends on: **B-152** (email confirmation ON — done), **B-054** (hydration, done), **B-272** (ASC record, done).
- Thresholds sourced from `supabase/functions/generate-signal/detection.ts` `DEFAULT_CONFIG`; realistic-sequence shape from `detection.test.ts` (the correlation golden fixture); off-diet detection from `lib/dietTrial.ts`; hydration from `lib/sync.ts` / `lib/hydration.ts`; the diet-trial schema from `supabase/migrations/040_diet_trial_lifecycle.sql`.
