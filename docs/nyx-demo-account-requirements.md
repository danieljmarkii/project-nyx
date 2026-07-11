# App Review Demo Account — Requirements

**Created:** 2026-07-11 · **Owner:** PM, with Data Scientist / Trust & Safety / Dr. Chen / Designer / QA lenses
**Backlog:** B-271 · **Guide:** [`docs/app-store-submission-guide.md`](./app-store-submission-guide.md) step 11 · **Register:** [`docs/app-store-readiness.md`](./app-store-readiness.md) Tier 2
**Status:** Decisions **proposed this session — awaiting PM ratification** before the seed script is authored (PR 1). The v1 story is Claude's pick (PM deferred the narrative choice); everything else is a recommend-and-proceed default, flagged below.

---

## 1. Context — why we're doing this

Culprit is **login-gated**: after the B-251 revamp, App Review's first screen is Landing → account → pet setup. Nothing real is reachable without an account. There are three escalating reasons a seeded demo account is a submission gate, not a nicety:

1. **Apple requires working credentials (Guideline 2.1).** Any login-gated app must supply demo sign-in credentials in App Review Information, or it's rejected on sight.
2. **An *empty* account is nearly as bad as no account.** Every surface that differentiates Culprit is an *intelligence* surface that needs weeks of data to render anything — the Home Signal, Trend, Patterns, the vet report all show designed empty states on day one (Principle 3). A reviewer who can't make the app do its distinctive thing writes the stock rejection *"we were unable to evaluate the app's features"* — the most common rejection for data-driven apps.
3. **The demo account is Apple's only window into the wedge.** Our whole positioning is that we're *not* a generic tracker — logging becomes a clinical-grade Signal and vet report. That claim is invisible in an empty account. This is the one chance to show the reviewer the Signal firing and the report rendering.

**Bonus:** a pre-seeded, already-confirmed account sidesteps the B-152 email-confirmation dependency — the reviewer never has to receive and click a confirmation email.

The hard part — and the reason this needs a spec rather than "insert some rows": **the Signal must *genuinely* fire, and the `clinical-guardrails` invariants forbid faking it.** The detection engine only emits a finding when a real pattern clears real thresholds, and n=1 never reassures. So the demo data has to tell an honest clinical story that legitimately trips a detector. That's a product-narrative decision with a clinical-integrity constraint on top — §3.

---

## 2. Decisions (proposed this session — PM ratification requested before PR 1)

| # | Decision | Rationale |
|---|---|---|
| **D1** | **v1 story = a diet-trial dog** (Cooper), leading with the flagship food↔symptom correlation Signal + a safety intake-decline backstop. | The literal primary wedge; lights up the most surfaces; matches the `detection.test.ts` golden fixture we can model against. PM deferred the narrative to Claude. Cat (picky-vs-sick) is the clean alternative held for demo account #2 (§6). |
| **D2** | **Seed as an idempotent, date-relative, parameterized SQL script** (`scripts/seed-demo-account.sql`), re-run right before submission. | Detectors read recent windows + the Signal cache has a 24h TTL, so fixed dates age out (§8). Parameterization is what makes the PM's "multiple demo accounts later" cheap (§6, B-324). |
| **D3** | **`generate-signal` is invoked for the demo pet after seeding** — the Home Signal is a **server cache**, not computed on-device. | Seeding rows is necessary but not sufficient; without the Edge Function run, the reviewer sees a "still building" card (§4). |
| **D4** | **Credentials live only in App Store Connect.** The account is created through the real signup flow; the password never enters the repo. `docs/app-review-notes.md` uses a placeholder. | Trust & Safety: no secret in version control. |
| **D5** | **Reference existing global `food_items` only** — never create catalog rows that degrade the real-user picker. | `food_items` are globally scoped (no `user_id`); a stray demo row shows up for everyone. |
| **D6** | **Seed 1–2 real event photos**; leave live camera as the reviewer's own demo (pointed at in the notes). | Timeline looks alive without shipping a fake camera flow; one photo also feeds the per-incident vomit read (D7). |
| **D7** | **Include the per-incident vomit AI read** (run `analyze-vomit` on one photo'd vomit event). **Skip** the medication/adherence thread for v1 review. | (a) is another visible "intelligence" moment for cheap; (b) is scope the reviewer doesn't need to evaluate the app. |

---

## 3. The v1 demo story — "Cooper"

**The owner & pet.** A reactive owner (Jordan persona) whose dog **Cooper** (~12 kg, medium breed) was sent home on a **novel-protein elimination trial** to chase down a food trigger. This is the exact wedge scenario.

**The trial.** One active `diet_trials` row: a limited-ingredient **venison** food, `started_at` = 18 days ago, `target_duration_days: 42`, vet named. → the Trend zone renders in **compliance mode** ("Day 18 of 42").

**The ~3-week event sequence** (relative to "now"; all timestamps stored UTC). The design encodes two honest findings and a rich, scrollable timeline:

| Day | Events | Why it's there | Detector effect |
|---|---|---|---|
| D-21 → D0 | 1–2 **venison** trial meals/day, rated mostly `all` / `most` | Establishes the ≥4-meal baseline; as the daily **staple** it correctly **washes out** of the correlation | baseline for ① and ② |
| D-16, D-9, D-3 | a **beef** treat (the "contraband" that breaks the trial), each followed within ~4h by a **vomit** | The sneaked-in non-staple protein present only on symptom days | **① food↔symptom correlation** (Early tier) — *"beef may be linked to Cooper's vomiting"* |
| D-3 vomit | + a **photo** attachment | Feeds the per-incident read (D7) + timeline realism | **`analyze-vomit`** → `event_ai_analysis` read (worth_a_call / monitor — never reassuring) |
| D-20, D-6 | two **weight_checks** | Two samples = trend + coloured verdict allowed | Patterns weight card + Profile weight trend |
| D-14, D-7 | a normal **stool** each | Timeline realism | — |
| D-1, D0 | trial meals dip to `some` / `picked` (≥1 WSAVA point below the `all`/`most` baseline) on 2 consecutive days | The **safety backstop** so the Signal is never empty even if the correlation drifts a day out of window | **② intake_decline** (`consecutive_low`) — *"Cooper's eating less than usual"* |

**Why two findings.** The correlation (①) is the flagship but the hardest to fire and most drift-sensitive; the intake decline (②, a *safety* detector) fires from far less data and anchors the demo so the reviewer's Signal card is **never** empty. Both are clinically honest — a real trigger being *found*, a real dip being *flagged*, zero reassurance.

**The honesty check (Data Scientist + Dr. Chen).** The trial food (venison) washing out of the correlation is the exact correctness property the `nearest-preceding-meal` bug violated and the adversarial reviews exist to protect — verify it against the golden fixture before trusting the seed. The vet report must read clinic-grade cold (`vet-report-cold-read`), and no surface may reassure on the *absence* of a red flag (n=1 invariant).

Event volume (~50+ events over 21 days) comfortably clears `SUBSTANTIAL_MIN_EVENTS = 8` / `SUBSTANTIAL_MIN_DAYS = 7`, so the Signal card is past "still building."

---

## 4. The two rendering paths (the mechanism that must be right)

Seeding is split by *how each surface renders*. Getting this wrong is how the reviewer ends up staring at empty states on a fully-seeded account.

| Surface | Renders from | Requirement |
|---|---|---|
| **Home Signal** + AI Summary | **Server cache** (`ai_signals`), read cache-only — never computed on open (`hooks/useSignal.ts`) | Events seeded **AND** `generate-signal` POSTed for the pet (or Home opened once so the background regen lands) |
| **Trend zone** | On-device, hydrated SQLite (last 14 days) | ≥3 distinct days with any event; **compliance mode** when an active `diet_trials` row exists (read directly from Supabase) |
| **Patterns dashboard** | On-device, hydrated SQLite (last 30 days) | ≥1 symptom **or** feeding **or** weight; coloured verdict needs ≥2 samples |
| **Timeline** | On-device, hydrated SQLite | any non-deleted events |
| **Vet report** | Generated on demand → writes a `vet_reports` row + PDF | substantive events inside the report's date range |
| **Per-incident vomit read** | `event_ai_analysis`, written by `analyze-vomit` (service role) | run the function on a photo'd vomit event |

**Hydration (B-054, already shipped).** On the reviewer's device, login → `syncNow()` → `hydrateFromCloud()` pulls `events, meals, weight_checks, event_attachments, vet_visits, feeding_arrangements, medications, medication_administrations` into local SQLite + refreshes the food/med caches. `diet_trials` and `ai_signals` are **not** hydrated but are read directly (network / cache), so server-side seeding reaches every surface. This is why we can seed server-side and trust it renders on their device.

---

## 5. Data model & conventions

The seed writes to (v1.0 schema + migrations 001–029): `user_profiles` (set `timezone` — a detector reads it), `pets` (`is_active` true), `events` (`deleted_at` NULL), `meals` (`intake_rating` enum), `weight_checks`, `diet_trials`, and — for the stretch — one `event_attachments` + one `event_ai_analysis`. Conventions that must hold:

- **All timestamps UTC**; the app converts at display using `user_profiles.timezone`.
- **Soft-delete asymmetry:** `pets` uses `is_active` (boolean); `events` use `deleted_at` (NULL = active). Seed active rows.
- **`meals.intake_rating`** ∈ `refused | picked | some | most | all` (WSAVA 5-point); `events.occurred_at_confidence` ∈ `witnessed | estimated | window` — vary it (some witnessed, some discovered) so the timeline is realistic and the per-incident/timing detectors have honest inputs.
- **`food_items` are global** — query and reference existing rows at seed time (D5). If the needed proteins (venison, beef) aren't present, reuse the closest existing match rather than minting catalog rows; if a demo row is truly unavoidable, mark it unmistakably and log it as debt.
- **RLS:** everything is the demo user's own pet data; the seed runs with the **service role** via the Supabase MCP (`execute_sql`), so it isn't RLS-gated on write, but the *shapes* must satisfy the same ownership graph (`pet_id ∈ pets WHERE user_id = <demo user>`).

---

## 6. Multi-account architecture (PM steer — "multiple demo accounts in the long term")

The PM's note that we'll likely want several demo accounts is a **v1 design constraint**, not just a future item: build the seed so a second account is a *config*, not a rewrite.

- **Parameterize** the script by `(target_user_id / email, story_profile)` — the account identity is an input, never hardcoded (contrast `scripts/export-pet-timeline.sql`, which hardcodes a prod `pet_id`).
- **Story profiles as data.** Cooper (diet-trial dog) is profile #1. The picky-vs-sick **cat** (Sam persona — a single below-baseline day fires the safety Signal) is the obvious profile #2, and a two-pet household a profile #3. Each profile is a declarative event list the same engine applies.
- Tracked as **B-324** (Later) so the expansion is on the record; v1 ships one profile but with the seam in place.

Why it matters beyond convenience: multiple honest stories let us demo different surfaces (correlation vs. the picky-eater safety read vs. multi-pet-is-free) and give resubmission flexibility if a reviewer asks to see something specific.

---

## 7. Reviewer notes — `docs/app-review-notes.md`

A short doc the PM pastes into ASC → App Review Information → Notes. Outline:

- **What Culprit is** (one paragraph): frictionless pet-health logging → a clinical-grade Signal and vet report; the reactive-owner wedge.
- **Demo credentials:** `<placeholder — real values entered only in ASC>`.
- **Where to look:** Home Signal card (the AI read); Trend (diet-trial progress); Patterns; a vet event → the per-incident vomit read; generate/open the vet report.
- **Framing to expect:** every AI read is explicitly *"not a diagnosis"* and never reassures on absence — this is deliberate clinical posture (helps against Guideline 1.4.1 scrutiny; pairs with the B-270 disclaimer).
- **Camera:** "to test camera/photo permissions, log a meal or symptom with a photo" (the live demo of the surfaces we didn't pre-seed).
- Runs through `nyx-voice` (owner-facing tone) and stays clinically honest.

---

## 8. Freshness, lifecycle & the re-seed protocol

Detectors read recent windows (intake = 14d, worsening = 7d, chronicity = 56d, descriptive = 60d) and `ai_signals` has a **24h TTL**. Consequences the script must handle:

- **Date-relative seeding** — every timestamp computed from "now," so the last-2-days intake dip and the recent vomit stay inside their windows whenever the script runs.
- **Re-seed before submit, and if review slips.** The script is idempotent (safe to re-run: clear the demo pet's prior seeded events, or upsert deterministically) so we can refresh the window the day we hit Submit and again if App Review is delayed.
- **Re-run `generate-signal` after every re-seed** (D3) — a fresh cache, not a 25-hour-stale one.

---

## 9. Trust & Safety

- **No secret in the repo** (D4): password only in ASC; placeholder in the notes doc.
- **Account isolation:** the demo account is a normal, RLS-scoped user; it can see only its own pet. The seed touches only that user's graph. `rls-privacy-reviewer` is *not* required for a single-owner seed, but the service-role `execute_sql` step must be scoped to the demo `pet_id` — never a blanket write.
- **Global-catalog hygiene** (D5): reference existing `food_items`; a demo row would leak into every real user's picker.
- **Post-launch teardown:** note in the notes doc / backlog that the demo account and its data can be deleted after approval (it exercises the B-039 deletion path — a nice bonus check), or kept for future submissions.

---

## 10. Deliberately excluded from v1 (with rationale)

- **Medication / adherence thread** — real surfaces, but the reviewer doesn't need them to evaluate the app; adds seed + re-seed surface (D7).
- **A second demo account** — the *seam* ships in v1 (§6); the second profile is B-324.
- **Descriptive timing detectors (⑤/⑥)** as an explicit target — they need witnessed vomit onsets ≤30 min post-meal and a set timezone; nice if they fire from the data, not worth contorting the story for. ① + ② are the committed findings.
- **A fabricated "improving/healthy" reassurance state** — forbidden by `clinical-guardrails`; the honest story is a trigger being found + a dip being watched.

---

## 11. Open sub-decisions (build-time — not PM-blocking)

- **S1 — idempotency mechanism:** delete-then-insert scoped to the demo `pet_id` vs. deterministic upsert keys. Recommend delete-then-insert (simplest to reason about for a throwaway-ish account).
- **S2 — exact breed / name / weight** for Cooper (cosmetic; pick something unremarkable and real).
- **S3 — which existing `food_items`** map to the venison staple and beef contraband — resolve by querying the live catalog at seed time.
- **S4 — how the script runs:** committed `.sql` executed via the Supabase MCP `execute_sql` (service role) at PM-gated time, vs. a parameterized template the session fills in. Recommend committed script + MCP execution, matching the guide.

---

## 12. Build plan (phases → PR / PM actions)

The work is a small committed-code part + a PM-gated live-execution part. It cannot fully complete until the account exists, which needs email confirmation ON (guide step 9).

| Phase | Type | What |
|---|---|---|
| **A — Story design** | ✅ this doc | Pet, event sequence, findings validated against real thresholds. |
| **B — Seed script** | **[PR]** | `scripts/seed-demo-account.sql` (parameterized, idempotent, date-relative) + a dry-run validation (or a `detection.ts` unit-style check) proving ① and ② fire on the seeded shape **before** touching a live account. Adversarial-reviewer on the "staple washes out / never reassures" property. |
| **C — Reviewer notes** | **[PR]** | `docs/app-review-notes.md` per §7 (nyx-voice). Can ride Phase B's PR or its own. |
| **D — Live seed + generate** | **[PM + Claude]** | PM creates the account via real signup (confirmation ON) + a pet, hands over the email. Claude runs the seed via Supabase MCP, POSTs `generate-signal`, runs `analyze-vomit` on the photo'd vomit. |
| **E — Verify** | **[Mixed]** | Confirm ① and/or ② fire (`ai_signals.findings` non-empty); vet report renders; Trend/Patterns/Timeline leave empty states; `vet-report-cold-read` on the rendered report; on-device spot-check on the reviewer's install. Re-seed + re-generate right before Submit. |

Dependencies: **needs** guide step 9 (email confirmation ON) to create the account; **benefits from** step 10 (real build) and B-054 hydration (done); **unblocked by** B-272 (ASC record, done). Feeds step 12 (screenshots are taken on this account).

---

## 13. Acceptance criteria (QA)

- [ ] Seed script is **idempotent** (re-run leaves one clean copy, not duplicates) and **date-relative** (findings stay in-window whenever run).
- [ ] On the seeded pet, **at least one Signal finding fires** after `generate-signal` — ② (intake decline) at minimum; ① (correlation) as the flagship. Verified in `ai_signals.findings`, not assumed.
- [ ] The trial-food staple **washes out** of the correlation (no false implication of the venison) — adversarial-reviewer confirmed.
- [ ] **No surface shows an empty state** for the demo pet: Home Signal (card, not "building"), Trend (compliance mode), Patterns (cards), Timeline (populated), vet report (renders with a real date range).
- [ ] The per-incident vomit read renders on the event detail and **does not reassure** (n=1 invariant).
- [ ] `docs/app-review-notes.md` exists, is nyx-voice-clean, and contains **no real credentials**.
- [ ] No new global `food_items` rows created (or any created are logged as debt).
- [ ] `vet-report-cold-read` returns CLINIC-READY on the rendered report.

---

## 14. References & backlog reconciliation

- **B-271** — App Review demo account + reviewer notes (this spec is its build-ready plan).
- **B-324** (new, Later) — multiple demo accounts / parameterized story profiles (the §6 expansion; PM steer this session).
- Guide **step 11** (`docs/app-store-submission-guide.md`); register **Tier 2** (`docs/app-store-readiness.md`).
- Depends on: **B-152** (email confirmation ON), **B-054** (hydration, done), **B-272** (ASC record, done).
- Thresholds sourced from `supabase/functions/generate-signal/detection.ts` `DEFAULT_CONFIG`; realistic-sequence shape from `detection.test.ts` (the correlation golden fixture); hydration from `lib/sync.ts` / `lib/hydration.ts`.
