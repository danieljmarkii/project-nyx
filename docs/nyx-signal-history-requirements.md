# Nyx — Signal Surface: Resilience, Empty States & Signal History Requirements

**Status:** DRAFT — awaiting PM ratification. Build-ready once §9 decisions are confirmed.
**Owner build step:** Step 10 evolution (AI Signal) — companion to `docs/nyx-ai-signal-requirements.md`.
**Created:** 2026-07-01
**Parent spec:** `docs/nyx-ai-signal-requirements.md` (the governing Signal-surface architecture — rev 6, FINALIZED). This doc extends it; it does not supersede it. Section references like "governing §9" point there.
**Also read:** `clinical-guardrails` skill (the n=1 never-reassures asymmetry, inherited and extended to *history*), `nyx-voice`, `docs/nyx-descriptive-signals-requirements.md`, `docs/nyx-chronicity-signal-requirements.md`.

> Origin: the 2026-07-01 production diagnosis of a **blank Signal card on TestFlight** for cat Nyx. The card was blank not because there was no signal, but because a real **firm safety finding could not be rendered by the installed client and was silently dropped** — and because the surface has **no memory**, a previously-seen insight (Nyx's "vomiting mostly 3–7am" timing pattern) was unrecoverable. This spec fixes both, plus the empty-state gap the PM flagged.

---

## 0. TL;DR

Three gaps in the Signal surface, one spec:

1. **Resilience (Tier 1 — urgent, safety).** The client silently drops any finding type it can't render (`InsightCard.tsx:88-91` → `return null`). In production this swallowed a *safety* finding ("Nyx has been vomiting across 5 of 8 weeks — worth booking a vet visit"). The one guarantee the surface makes — *safety findings are never dropped* (governing §5/§9, Principle 3) — is violated by a client/server version skew. Fix: a **generic fallback renderer** so any finding always renders at least its (always-present, guardrail-clean) sentence on the correct priority rail. Never blank again.
2. **Memory / history (Tier 3 — the core new build).** `ai_signals` is a **single-row-per-pet, delete-then-insert, 24h-TTL cache**. Every regeneration overwrites the last. Nothing is persisted, so past signals are lost and cannot be revisited by the owner (or, later, carried into the vet report). Fix: a durable, deduplicated **signal history** (new table, migration 025), surfaced as a browsable log on the **Patterns** screen the Signal card already links to.
3. **Empty state (Tier 2).** When there is *genuinely* no live finding, the surface must be a designed moment (governing §3.3 / Principle 5), never a void — and never an all-clear (governing §9). The designed states already exist (`building` / `no_pattern` / `stale`); this tier polishes them and wires them to the new history.

PM direction (2026-07-01): **build all three; deliver both retrievable history and richer present-state; spec first, don't build yet.** This is the spec.

---

## 1. The production incident (diagnosis)

**What the owner saw:** the Home Signal card rendered its "SIGNAL" label and the "See all of Nyx's patterns →" footer with **nothing in between** — an empty card.

**Root cause — a client/server version skew that silently drops a safety finding:**

| Layer | State (2026-07-01) | Evidence |
|---|---|---|
| Live engine `generate-signal` | **v23**, deployed *with* the chronicity detector ⑦ (B-182). Emits `symptom_chronicity` findings. | `list_edge_functions` → generate-signal v23 ACTIVE. STATUS.md still said v22 / "redeploy pending" — **doc drift**, fix separately. |
| Cache `ai_signals` (Nyx) | 1 finding, `type: symptom_chronicity`, `tier: firm`, `is_building: false`, fresh (expires +24h). | Live query. Text: *"We've logged vomiting for Nyx across 5 of the last 8 weeks — 21 episodes since May. A symptom that keeps recurring over weeks is worth booking a vet visit…"* |
| Installed TestFlight client | Predates PR #250 (`81c0894`) — the commit that added the `symptom_chronicity` **renderer** to `InsightCard.tsx` + `lib/signal.ts`. | Git: #250 is the most recent Signal client change on `main`; the detector (#246) and v23 deploy landed around it. |
| `InsightCard.tsx:88-91` | `INSIGHT_RENDERERS['symptom_chronicity']` is `undefined` → `if (!Body) return null` → **card dropped**. `LiveStack` then renders an empty container. | Code read. Reproduces the screenshot exactly. |

This is the precise hazard the B-182 open question warned about ("do NOT redeploy `generate-signal` until the PR1→3 chain + client land"). The engine was redeployed to a state that emits a finding type the shipped client can't render.

**Severity:** this is not cosmetic. The swallowed finding is **safety-class**. An owner whose 2-year-old cat has persistent vomiting (21 episodes across 5 of 8 weeks, most recent 3 days ago) saw a blank box instead of "book a vet visit." Governing §9 and Principle 3 both promise this can never happen; the render-layer fallback defeated them.

**Immediate remediation (out-of-band, not gated on this spec):** `main` already contains the renderer (#250). A fresh TestFlight/OTA build surfaces the safety card immediately. See §10.

### 1.1 The data (why this signal, and the "3am–7am" pattern the PM remembers)

Nyx (cat, American Shorthair, 2 yrs) is a heavily-logged pet — **379 active meals + 22 active vomit episodes** in the 56-day window (5 vomits in the last 14 days). This is emphatically *not* a "building" pet.

- **Chronicity ⑦ fired correctly:** 21 episodes (event-collapsed) across 5 of the last 8 weeks, span 44 days, most recent 3 days ago → firm tier → "book a vet visit." Clinically the right lead.
- **The "vomiting mostly 3–7am" pattern (detector ⑥, time-of-day clustering) is real but currently just under its firing floor.** Of 22 vomits, ~12 (55%) fall 3–7am. Among the **11 witnessed** episodes (⑥ counts witnessed-only), **6 land in a 3–7am band = 54.5%**, just below the **`minClusterFraction: 0.6`** threshold. Four scattered daytime witnessed episodes (10am, 1pm, 4pm, 8pm) dilute it under the line. It fired earlier (when the concentration was higher) — which is when the PM saw it — and has since dropped ~5 points under threshold.
- **Why the PM can't get back to it:** `ai_signals` overwrote it (single row, delete-then-insert). It is not archived anywhere. The Patterns dashboard computes symptom/day and composition views live, but **has no hour-of-day view**, so the timing pattern isn't recoverable there either. This is the amnesia Tier 3 fixes.

> **Note on floor-tuning (Data Scientist, binding):** we do **not** lower ⑥'s 0.6 floor to force the 3am–7am card back onto the push surface. The floor guards against the 24-position sliding-window multiple-comparison (governing §6/§7); reactively tuning it to catch one pet is exactly the anti-pattern the governing spec warns against. The *history* gives us the "richer" without the statistical risk — see §7.5.

---

## 2. Problem statement — three distinct gaps

- **Gap A — brittleness / safety (Tier 1).** An unrenderable finding type is silently dropped. When it is a safety finding, the never-drop guarantee fails. The `return null` was written as forward-compatibility ("skip an unknown future type rather than crash") but it trades a crash for a *silent safety omission*, which is worse.
- **Gap B — amnesia (Tier 3).** Findings are ephemeral (24h TTL, one row/pet, overwritten each regen). Consequences: (1) owners can't revisit a past insight; (2) there is no arc for the future vet report; (3) "richer present-state" is impossible because the surface discards everything it computed a day ago.
- **Gap C — the quiet state (Tier 2).** When there's legitimately no live finding, the surface must read as a designed feature, never a broken void, and never an all-clear.

---

## 3. Goals & non-goals

**Goals**
1. **Never silently drop a finding** — especially a safety finding — across any client/server version skew.
2. **Persist a durable, deduplicated signal history** per pet.
3. **Make it retrievable** by the owner today, and a clean input to the Step-9 vet report tomorrow.
4. **Richer present-state** — surface more than the single top card *without* weakening detection floors (via history + already-computed descriptive views).
5. **Designed empty states** wired to the history, never an all-clear.

**Non-goals (explicitly out of scope for this spec)**
- **No reactive lowering of detector floors** to force more cards (§1.1 note). Any change to ⑥'s floor or a new sub-floor surface is a separate, PM-gated decision tied to the existing **"Emerging-signals tier"** open question in CLAUDE.md.
- **No emerging / sub-floor associational tier** and **no gestalt-LLM-reviewer** — both are live, contested open questions (CLAUDE.md) with the product team dissenting; this spec neither resolves nor depends on them.
- **No change to the detection statistics** (case-crossover, Bonferroni, tier floors) — untouched.
- **No new live LLM call on the render path** — the cache-only rule (governing §2) holds; history is written server-side during regen, read cache-style on the client.

---

## 4. Inherited invariants (carry into every tier)

- **Cache-only reads on render** (governing §2). History is written during `generate-signal` regen; the client reads it like any other cache, never triggering a live model call on open.
- **Deterministic detection + LLM phrasing unchanged** (governing §2). History stores the *already-true, already-phrased* finding; no new model surface.
- **Absence ≠ wellness; never all-clear** (governing §9). Extended to history: a past safety flag is *"we flagged this on {date}"* — **never** "resolved," "cleared," "back to normal," or "all better." A thread going quiet is recorded, never reassured.
- **Safety findings never dropped** (governing §5). Now enforced at the **render layer** (Tier 1), not only in server curation.
- **Data minimization** (Trust & Safety). History stores computed findings + counts + phrased text — **never** raw event logs or photos. This keeps the future vet-report / any-LLM boundary clean (matches the governing "the model never sees a raw event log" rule).
- **Multi-pet safety.** Every history read is RLS-scoped and active-pet-guarded; a stale finding from pet A can never flash on pet B (the `loadIdRef`/`loadedPetRef` guards already on `/insights`, and `useSignal`'s pet-switch clear).

---

## 5. Tier 1 — Surface resilience (never blank, never silently drop a safety finding)

**Ship first. This closes the live safety bug and permanently defangs the version-skew hazard.**

### 5.1 Generic fallback renderer (the durable fix)
Every `CachedFinding` **always** carries two render-safe fields, regardless of type:
- `text` — the server-phrased sentence, already guardrail-validated server-side (`validatePhrasing`), with a deterministic template fallback guaranteed even when the LLM is down (governing §2 step 5). It is never empty.
- `finding.priorityClass` — `'safety' | 'insight'`, which selects the rail colour.

So instead of dropping an unrecognized type, `InsightCard` renders a **`GenericSentenceBody`**: the `text` on the rail derived from `priorityClass`. It loses the type-specific extras (`sampleLine`, `confidenceTag`, tap-to-expand `evidenceText`) — but it **never goes blank**, and a safety finding always shows its sentence on the safety rail.

Replace `InsightCard.tsx:88-91`:
- Look up the type-specific renderer; if present, use it (unchanged).
- If absent, use `GenericSentenceBody` (renders `cached.text` + rail from `priorityClass`).
- If `priorityClass` is *also* unrecognized/missing: still render `text`, on a neutral rail. **The text is the safety content; the rail is cosmetic. We never drop the text.**

Even the *pre-#250* client, had this shipped, would have shown *"…worth booking a vet visit"* rather than a blank card.

### 5.2 Version-skew prevention (defense at the source — mostly process, once 5.1 ships)
Once 5.1 is in the shipped client, **any** future finding type degrades safely to its sentence, so the deploy-ordering hazard is permanently contained for *content*. On top of that:
- **Deploy discipline (codify):** a `generate-signal` deploy that introduces a **new surfaced finding type** must be preceded by a shipped client that can render it — or rely on 5.1 as the universal floor. Add this as a one-line gate to `docs/edge-deploy-runbook.md` and the DoD note for Signal-engine PRs.
- **Belt-and-suspenders (backlog, not v1):** an optional client-capability signal (the client passes its supported-types set / build version to `generate-signal`, which could down-rank a type the client can't richly render). Deferred — 5.1 makes it non-urgent.

### 5.3 Tests (Engineer + QA)
- `InsightCard`: an **unknown** finding type with `priorityClass: 'safety'` renders its `text` on the safety rail (asserts **not null**, asserts rail colour).
- A finding with an unknown `priorityClass` still renders its `text` (never null, never throws).
- Regression: the seven known types still render their type-specific bodies unchanged.

### 5.4 Companion cleanup (rides this PR)
- Fix STATUS.md drift: v22 → **v23** live; ⑦ chronicity is **deployed & emitting**, not "redeploy pending." Note the skew incident in Recent Sessions.

---

## 6. Tier 2 — Empty state as a feature

The designed states already exist and were **not** what the owner saw (the blank was Gap A). This tier polishes them and wires them to history:

- **When there is no live finding but history exists:** the empty state points to it — e.g. *"No new patterns for Nyx today — see the signals we've tracked so far →"* (links to the §7.4 history surface). This is where Gap B and Gap C converge.
- **Keep the honest register** (governing §9 / `clinical-guardrails`): `no_pattern` / `stale` / `building` copy stays about *data coverage*, never wellness. No "all quiet," no "looking good."
- **Never a bare void:** the quiet surface should always carry either a coverage diagnostic (B-053, already built), a pointer to history, or a calm descriptive line — never just whitespace.
- **Designer-owned visual pass** (governing §11f style): the exact composition of the quiet state is a design-phase task, not a pre-decision.

---

## 7. Tier 3 — Signal history (the core new build)

A durable, deduplicated record of the findings the engine has surfaced over time, per pet — browsable by the owner, and a future vet-report input. This is where **retrievable history** and **richer present-state** both land.

### 7.1 Concept — threads, not snapshots
A naive "append every finding on every regen" floods the log (Nyx's chronicity finding would write a near-identical row every 24h + on every logged event). Instead the history is a set of **threads**: one thread per distinct pattern, carrying a **date range**, refreshed counts, and an **active/ended** status. A thread is identified by a stable **`signal_key`** that survives count-drift (see §7.2). This directly serves "get back to the 3am–7am signal": it becomes one ended thread — *"Vomiting mostly 3–7am — last flagged {date}."*

### 7.2 Identity, dedup, and flicker (the technical crux)
- **`signal_key`** — a stable fingerprint of a finding's *identity*, not its drifting counts. Proposed:
  - chronicity → `chronicity:vomit`
  - worsening → `worsening:vomit`
  - correlation → `correlation:vomit:chicken` (include the correlated protein)
  - time-of-day → `timeofday:vomit`
  - postprandial → `postprandial:vomit`
  - intake-decline → `intake_decline` (per pet; trigger-agnostic)
  - reflection → `reflection:vomit`
  - (Granularity per type is **D2**, §9.)
- **On each regen** (server, inside `generate-signal`, after `curateFindings`):
  1. Compute the current surfaced set → its `signal_key`s.
  2. For each surfaced finding, **upsert its active thread by `signal_key`**: if an active thread exists, refresh `text`/`payload`/`tier`/`last_seen_at`; else insert a new active thread (`first_seen_at = now`).
  3. **End threads no longer present** — but only on **sustained** absence, to survive flicker (see below), never phrased as "resolved."
- **Flicker guard (matters concretely for Nyx — the 3am–7am pattern hovers at the 0.6 floor and will oscillate):**
  - **Don't end on a single absent regen.** A thread ends only after it's been absent from every regen for a **sustained window** (recommended default: **48h**, ≥ the debounce cadence). This stops a one-log flicker from churning the log.
  - **Re-open within a grace window.** If an ended thread with the same `signal_key` reappears within a **re-open window** (recommended default: **14 days**), reactivate *that* thread (clear `ended_at`, bump `last_seen_at`) rather than spawning a second thread — so one pattern = one thread across flicker.
  - Both defaults are **D3** (§9), tunable on real data, not a re-decision.

### 7.3 Schema — migration 025 (own PR; schema-isolation rule)
New table `signal_history` (child of `pets`, mirrors the `ai_signals` RLS pattern):

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `uuid_generate_v4()` |
| `pet_id` | uuid NOT NULL | `REFERENCES pets(id) ON DELETE CASCADE` |
| `signal_key` | text NOT NULL | stable thread identity (§7.2) |
| `type` | text NOT NULL | finding type discriminator |
| `priority_class` | text NOT NULL | `'safety' \| 'insight'` |
| `tier` | text NULL | evidence tier where applicable |
| `text` | text NOT NULL | the phrased sentence (guardrail-clean) |
| `payload` | jsonb NOT NULL | the structured finding (counts, sample sizes) — **computed data only, never raw logs** |
| `first_seen_at` | timestamptz NOT NULL | thread start |
| `last_seen_at` | timestamptz NOT NULL | last regen that produced it |
| `ended_at` | timestamptz NULL | set on sustained absence; NULL = active |
| `created_at` | timestamptz NOT NULL | `DEFAULT now()` |

- **Partial unique index** `(pet_id, signal_key) WHERE ended_at IS NULL` — enables `INSERT … ON CONFLICT` upsert of the single active thread per pattern.
- **Read index** `(pet_id, last_seen_at DESC)`.
- **RLS:** copy `ai_signals_owner` verbatim (`pet_id IN (SELECT id FROM pets WHERE user_id = auth.uid())`, `FOR ALL`, `USING` + `WITH CHECK`). The function runs with the caller's JWT — **no service role** (consistent with `generate-signal` today).
- **Deletion:** covered automatically. `ON DELETE CASCADE` from `pets` means pet-delete and the B-039 account-deletion cascade (`auth.users` → `pets` → children) purge it with no change to `delete-account`. Trust & Safety to confirm in review.
- **Migration Safety Pre-flight:** Destructive **n** (net-new table). Rollback: `DROP TABLE signal_history;`. Backfill: **N/A** — history accrues from deploy forward (we cannot reconstruct overwritten past findings; §7.6). No existing data touched.

### 7.4 The owner-facing surface — where the log lives
On the **Patterns** screen (`/insights`) — the destination the Home Signal card's "See all of {pet}'s patterns →" already navigates to (no new nav, no new tab; Principle 3).

- **Placement:** an inline **"Signal history"** section in the ready branch of the ScrollView, directly after the card block (`app/insights/index.tsx:202`), parallel to how `AiSummaryCard` sits above the cards. It reads from the new history source and stays **out** of the priority-ordered card registry (a chronological log is not a priority-ranked metric — the agent-confirmed cleaner seam).
- **Row treatment:** reuse `SignalZone`'s `LiveStack`/`InsightCard` row idiom (sentence + rail + tap-to-expand evidence) so the log reads as the same calm surface, each row annotated with its **date range** and **active/ended** status.
- **If it grows:** promote to a pushed child route (mirror `app/(tabs)/history.tsx` — FlatList, filter chips, paging, designed empty states — the canonical browsable-history pattern), reached via a "See all" affordance. **v1 = inline last-N threads + "See all"; the full pushed log is a fast-follow** (keeps v1 tight).
- **Ordering:** active safety threads first, then active insight threads, then ended threads by recency.
- **Clinical framing (Dr. Chen + Trust & Safety + `clinical-guardrails` — non-negotiable):**
  - An **ended** thread reads *"Last flagged {date}"* or *"Not seen since {date}"* — **never** "resolved / cleared / better."
  - A past **safety** thread keeps its safety framing and rail; the log is a record, not a reassurance surface.
  - **No "all clear" header, no summary count that implies wellness.** The log is neutral history.
  - Load path joins the existing `loadIdRef`/`loadedPetRef` stale-guard machinery (`app/insights/index.tsx:92/117/136`).

### 7.5 "Richer now" — delivered by history, not by weaker floors
Because history persists what we computed, the present surface gets richer with **zero** change to detection floors:
- Home card: unchanged — top live finding(s), capped, safety-led.
- Patterns "Signal history": the fuller picture — including a pattern that has just dropped under a floor (the 3am–7am case at 6/11) shown honestly as a **recently-ended thread** (*"Last flagged {date}"*), which is retrievable and truthful without pushing a sub-floor claim as a current alert.
- **Optional adjacent enhancement (D4, §9):** add an **hour-of-day view** to the existing symptom `MetricDetailScreen` (`app/insights/[metric].tsx`) so the timing shape is inspectable live from the raw data (independent of whether ⑥ cleared its floor). This is the most direct answer to "show me the 3am–7am shape," is purely descriptive, and touches no detection floor. Recommended as a small fast-follow; flagged, not assumed.

### 7.6 Honest limitation — no retroactive history
History accrues **from the PR-4 deploy forward**. The specific past 3am–7am *finding instance* the PM remembers cannot be reconstructed (it was overwritten before persistence existed). Two mitigations: (a) the timing *shape* is still computable live from raw events (§7.5 hour-of-day view); (b) going forward, if it re-fires it is captured as a thread. State this plainly in the surface's first-run so the log never implies it covers pre-launch history.

---

## 8. Interaction with the vet report (Step 9)
The signal history is a natural vet-report input — the **arc** of what was flagged and when ("vomiting flagged since May, persistent, mostly pre-dawn") is exactly the anamnesis a vet wants. Forward hooks only (this spec does not build the report bridge):
- The vet-report **`Established`-only** rule (`nyx-vet-report-requirements.md` §8.5) still governs what crosses; ended/early threads stay owner-side.
- Same data-minimization boundary (computed findings + counts, never raw logs/photos).
- Tracked as a gated fast-follow (PR 6, §11), aligned with the B-023 PR 5 "Share with my vet" bridge.

---

## 9. Open decisions (PM / expert calls — resolve to lock the spec)
- **D1 — Naming.** "Signal history" vs "Patterns over time" vs "Past signals." *(Designer + PM. Recommend "Signal history.")*
- **D2 — `signal_key` granularity** (§7.2): per-`(type, symptom, key-dims)`, e.g. correlation keyed by protein. *(Data Scientist. Recommend as listed.)*
- **D3 — Flicker defaults** (§7.2): end-after-absence window (rec. **48h**) + re-open window (rec. **14 days**). *(Data Scientist; tune on real data.)*
- **D4 — Hour-of-day view** (§7.5): build the descriptive timing view on `MetricDetailScreen` as a fast-follow? *(PM; recommend yes — smallest, most direct answer to the PM's actual "3am–7am" ask.)*
- **D5 — Sub-floor / "watching" surface:** do we surface a pattern that has *never* cleared a floor (vs only threads that actually fired)? **Recommend: no** — history shows only what fired; anything sub-floor routes to the existing **Emerging-signals-tier** open question (CLAUDE.md), not this spec. *(PM.)*
- **D6 — Retention:** keep `signal_history` indefinitely, or prune ended threads after N months? **Recommend keep** (small, computed, valuable for the vet arc); revisit at scale. *(Engineer + PM.)*
- **D7 — v1 surface shape:** inline last-N + "See all" now, pushed full log later — confirm the split. *(Designer + PM.)*

## 10. Immediate action (out-of-band — not gated on this spec)
- [ ] **Cut a fresh TestFlight/OTA build from `main`.** The `symptom_chronicity` renderer (#250) is already merged; a new build surfaces Nyx's currently-swallowed **safety** card ("book a vet visit") right away. This is the live-safety remediation; do it independent of the Tier-1 code work (which prevents recurrence).

## 11. Phased build plan (PRs)
- **PR 1 — Tier 1 resilience** (no schema). Generic fallback renderer (§5.1) + tests (§5.3) + STATUS.md drift fix (§5.4). **Ship first.** code-reviewer; adversarial-reviewer for the never-drop-safety behavior.
- **PR 2 — Tier 2 empty-state polish** (no schema). Wire quiet states to history pointer; Designer + `nyx-voice` + `clinical-guardrails` (never all-clear).
- **PR 3 — Tier 3a schema:** migration 025 `signal_history` + RLS + indexes (§7.3). **Own PR**, Migration Safety Pre-flight, `rls-privacy-reviewer` (new pet-data table + deletion cascade).
- **PR 4 — Tier 3b write path:** `generate-signal` upserts threads by `signal_key` + sustained-absence end + re-open grace (§7.2). Engine change → **adversarial-reviewer mandatory** (dedup/identity correctness, flicker, and the *never-resolved / never-reassure* framing of ended threads). Deploy-discipline gate (§5.2).
- **PR 5 — Tier 3c owner surface:** inline "Signal history" section on `/insights` (§7.4). `pm-feature-review` + Designer + clinical framing.
- **PR 6 — (gated on Step 9) vet-report bridge** (§8). Not now.

**Parallelism:** PR 1 and PR 2 are independent of the history chain and of each other (disjoint files; only STATUS.md collides at wrap). The Tier-3 chain is strictly ordered: PR 3 (schema) → PR 4 (write) → PR 5 (surface). **PR 1 is the urgent one** (live safety).

## 12. Personas / safety sign-off (to be completed at build; recorded here as the review contract)
- **Dir. of Engineering** — cache (`ai_signals`) stays the fast render path; `signal_history` is the durable log; two writes, one function, one JWT, no service role; schema-isolation held.
- **Data Scientist** — `signal_key` identity + flicker windows; **no detection-floor change**; no false continuity in the thread date-range denominator.
- **Dr. Chen (Vet)** — ended threads never read as resolved; safety threads keep safety framing; the log is not a reassurance surface; safety never dropped at the render layer.
- **Trust & Safety / Privacy** — data-minimization (computed findings only); deletion cascade covers `signal_history`; RLS parity with `ai_signals`.
- **Sr. Product Designer** — the log reads as one calm surface (reuses `LiveStack` idiom); quiet-state composition; Principle 3 (a destination, not a 4th Home zone); Principle 5 (empty states).
- **Sr. QA** — the never-blank/never-drop render tests are the acceptance gate for PR 1; multi-pet stale-flash guard on the history read.
- **Jordan / Sam** — can revisit a past insight; the quiet state is honest, not anxious; nothing nags (Principle 4 — ended threads never notify).
