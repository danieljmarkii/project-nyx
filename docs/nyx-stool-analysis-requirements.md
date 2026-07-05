# Stool Analysis — Requirements
**Version:** 1.0 | Created: 2026-07-05 | Backlog: B-247
**Status:** Draft — awaiting PM ratification of §2 decisions before PR 1 starts

---

## 1. Problem

Nyx has a mature per-incident AI read for vomit (`analyze-vomit`, B-013/B-027/B-028) but nothing equivalent for stool. This is a gap out of proportion to stool's importance: for the primary wedge — an owner running a diet trial or symptom-monitoring directive — **stool consistency and character is usually the primary outcome being measured**, not a secondary one. `docs/nyx-vet-report-requirements.md` already flags this explicitly (§3.7, line 59): stool "is the **primary** outcome of a diet trial (GI internist) yet was under-rendered vs. vomit." The vet-report's current stool section renders only an owner-entered consistency distribution — no AI-read fields (blood, mucus, colour) at all — because there is no analysis function producing them.

Today, stool logging captures a photo (same attachment pipeline as every other event type) but nothing reads it. The photo sits unanalyzed. If Nyx wants to be a credible GI app, the highest-volume GI event type cannot be the one incident type with no clinical read.

### 1.1 Why this is not just "copy analyze-vomit and rename it"

The shape is genuinely the same — single photo in, structured clinical fields + an escalate-never-reassure recommendation out — but two things make this a real spec, not a find-replace:

- **`clinical-guardrails` (`.claude/skills/clinical-guardrails/SKILL.md`) explicitly anticipates this exact moment.** Its "Ambiguities Flagged" §4 states: *"No cross-incident-type abstraction yet... Generalising to siblings (stool, skin, eye) will need to factor out the patterns above... This skill assumes that refactor happens with the second incident type, not before (per the 'earn the right to abstract' rule)."* Stool is the second incident type. The abstraction question (§2 D2 below) is now live, not hypothetical.
- **The consistency taxonomy is different in kind, not just in values.** Vomit's `vomit_consistency` enum is a flat descriptive list. Stool has an actual clinical standard — the **Bristol Stool Scale** (Type 1–7) — that vets already think in. Using anything else forces Dr. Chen to mentally re-map every read, which fails the "would I trust this for a patient I haven't met?" bar the vet report has to clear.

---

## 2. Decisions (proposed — PM ratification requested before PR 1)

| # | Decision | Ruling |
|---|---|---|
| **D1** | Schema approach | **Build on the current schema. No `stool_normal`/`diarrhea` consolidation.** The two event_type values stay split; this spec adds AI-analysis columns to the existing, incident-agnostic `event_ai_analysis` table (migration 013's header comment: *"ONE feature, parameterized by incident_type — do NOT fork the table per type"*). The CLAUDE.md "stool schema consolidation" Open Question remains open and unrelated — this build does not require or block it. *(PM-directed 2026-07-05.)* |
| **D2** | Shared incident-analysis library | **Factor out the vomit-proven patterns into a shared module** (`supabase/functions/_shared/incident-analysis.ts`) reused by a refactored `analyze-vomit` and the new `analyze-stool`: the 3-layer escalation-floor pattern (system prompt → enum → deterministic floor), the image-fetch/downscale/base64-chunk utilities (5MB→3.93MB raw ceiling math, imgproxy 1568px downscale, magic-byte sniffing, chunked base64 encoder — all incident-agnostic today), and the `event_ai_analysis` upsert/re-analysis-preserves-edits write-back logic (Pattern 7). Per-type pieces (tool schema, system prompt content, contextual-flag computation, structured columns) stay local to each function. This is the skill's own predicted refactor point — deferring it to a third incident type would mean building `analyze-stool` as a second full copy-paste of an 863-line file, which the codebase's own "would a senior engineer at Linear be comfortable maintaining this" bar does not survive. **Recommend-and-proceed; Dir. of Engineering to confirm module boundary at PR 1, or explicitly override to a standalone copy if the shared-module refactor risks destabilizing the shipped vomit path.** |
| **D3** | Consistency taxonomy | **Bristol Stool Scale, Type 1–7**, as a new `stool_consistency` enum (`type_1_hard_lumps` … `type_7_watery`), plus separate `stool_colour`, `stool_content` (mucus/blood/foreign material excluded from this array — same drift-avoidance reasoning as vomit's `vomit_content`), `stool_blood_present` (tristate + fresh/dark distinction, since melena — black/tarry stool — is a distinct escalation-worthy finding from bright red blood), and `stool_mucus_present` (tristate). *(PM-directed 2026-07-05.)* |
| **D4** | Model | **Claude Sonnet 4.6** (`claude-sonnet-4-6`), matching `analyze-vomit`, `extract-food-from-photo`, and `extract-medication-from-photo`. Stool-characteristic extraction (consistency type, blood, mucus) is clinically load-bearing for both the owner-facing read and the vet report — the established codebase rule (B-001, cheapest-capable) reserves Haiku for non-load-bearing phrasing only (`generate-signal`). No new rationale needed; this just follows precedent. |
| **D5** | Escalation-driving findings | Deterministic floor forces `worth_a_call` on: blood present (either colour), Bristol Type 7 (watery) **repeated** within a contextual window (a single Type 7 is monitor-tier; a repeat is the diarrhea-persistence signal vets actually act on), and any concurrent-vomiting or lethargy event in the prior 24h (mirrors vomit's `concurrent_lethargy` contextual flag). Mucus alone (no blood) is a `monitor`-tier visual flag, not an automatic escalation — mucus in stool is common and usually benign in isolation, but must still surface to the owner (never silently dropped) per Pattern 1. Single soft/loose stool with no other flags is `monitor`. Bristol Type 1 (hard lumps, possible constipation) is also `monitor`-tier, not `worth_a_call`, unless paired with a contextual flag (e.g. reduced intake) — constipation alone is rarely an acute escalation. |
| **D6** | Vet report integration | Feeds the existing "Stool characteristics" section (`nyx-vet-report-requirements.md` §3.7, §12 PR 4) rather than creating a new section. That section currently renders only owner-entered consistency counts; this build supplies the AI-read fields (blood/mucus present-only rendering, same discipline as Vomit Characteristics) as an additive enrichment. No change needed to that PR's scope description — it already expects this data, it just has no source for it yet. |

---

## 3. Capture & analysis UX (mirrors vomit, per the PM's ask)

The UX goal is: **the owner's experience of logging a stool event and later seeing an AI read should feel identical to vomit**, modulo copy and the Bristol-scale framing.

1. **Log flow (`app/log.tsx`)** — unchanged. The existing "Stool" → Normal/Loose sub-step (lines 913–943) and optional photo attachment stay exactly as they are. No new step is added to the 10-second-test log flow; the photo is already optional and already captured today, just unread.
2. **Auto-trigger on log** — new `triggerStoolAnalysis(eventId)` in `lib/analysis.ts`, structurally identical to `triggerVomitAnalysis` (flush pending sync → force this event's attachments synced → invoke `analyze-stool` with `{ event_id }`, fire-and-forget, idempotent upsert). Fires only when the logged event has a photo (a stool event with no photo has nothing to analyze — same as vomit's `photoUnreadable`/`not_enough_to_say` path, just skipped client-side rather than round-tripped for a guaranteed-empty read).
3. **Detail screen (`app/event/[id].tsx`)** — new `StoolAnalysisSection` component, sibling to `VomitAnalysisSection`, rendered for `event_type IN ('stool_normal','diarrhea')`. Same layout family: recommendation banner (worth_a_call / monitor / not_enough_to_say), read text, structured fields (Bristol type shown as both the number and its plain-language label — e.g. "Type 6 — soft, mushy" — never the number alone, since owners don't know the scale), present-only blood/mucus flags, retry CTA on `failed` status, edit affordance on structured fields (mirrors `EDITABLE_VOMIT_FIELDS`).
4. **Owner-facing copy** — Bristol type numbers are a clinical detail for the vet report, not the owner's primary framing. The owner-facing read text describes texture in plain language ("soft and unformed," "watery," "firm") per `nyx-voice`; the numeric Bristol type is a secondary/small-print detail alongside it, present for when the owner does end up relaying it to a vet on the phone.
5. **Re-run / edit** — identical to vomit: `edited_at` gates re-analysis to the read fields only (Pattern 7), dismissible n=1 read, never editable.

---

## 4. Proposed schema (PR 1 — finalize with Data Scientist + rls-privacy-reviewer + adversarial-reviewer)

No new table. Additive columns on the existing `event_ai_analysis` table (migration 013), reusing every incident-agnostic column as-is (`status`, `error`, `ai_raw_payload`, `ai_confidence`, `description`, `recommendation`, `read_text`, `visual_flags`, `contextual_flags`, `edited_at`, `dismissed_at`). `incident_type` already exists and already reuses `events.event_type` — it takes `'stool_normal'` or `'diarrhea'` for these rows (no schema change needed there; D1 keeps the two-value split).

### 4.1 New enums

```sql
CREATE TYPE stool_consistency AS ENUM (
  'type_1_hard_lumps',      -- Bristol 1
  'type_2_lumpy',           -- Bristol 2
  'type_3_cracked',         -- Bristol 3
  'type_4_smooth_soft',     -- Bristol 4 (the "normal" reference point)
  'type_5_soft_blobs',      -- Bristol 5
  'type_6_mushy',           -- Bristol 6
  'type_7_watery',          -- Bristol 7
  'unsure'
);

CREATE TYPE stool_colour AS ENUM (
  'brown', 'dark_brown', 'yellow', 'green', 'black_tarry', 'grey_pale', 'red_streaked', 'unsure'
);

CREATE TYPE stool_content AS ENUM (
  'undigested_food', 'grass', 'hair', 'unsure'
  -- deliberately excludes mucus/blood/foreign material — same drift-avoidance
  -- reasoning as vomit_content; those are their own dedicated flag columns so
  -- the bulk-content description can never drift against the escalation fields.
);

CREATE TYPE stool_tristate AS ENUM ('yes', 'no', 'unsure');
```

### 4.2 New columns on `event_ai_analysis`

```sql
ALTER TABLE event_ai_analysis
  ADD COLUMN stool_consistency stool_consistency,
  ADD COLUMN stool_colour      stool_colour,
  ADD COLUMN stool_content     stool_content[],
  ADD COLUMN stool_blood_present stool_tristate,
  ADD COLUMN stool_blood_type  TEXT,        -- 'fresh_red' | 'dark_tarry' | null; only meaningful if stool_blood_present='yes'
  ADD COLUMN stool_mucus_present stool_tristate,
  ADD COLUMN foreign_material_present vomit_tristate,  -- REUSE existing tristate type, not stool-specific
  ADD COLUMN foreign_material_note TEXT;                -- REUSE, column already exists — no-op if already present
```

The last two rows are a reminder, not new work: `foreign_material_present`/`foreign_material_note` already exist on the table from the vomit migration and are semantically identical for stool (a sock in stool is exactly as much a foreign-material finding as a sock in vomit) — reuse them, do not add stool-prefixed duplicates.

**Rollback:** `DROP COLUMN` the new columns, `DROP TYPE` the three new enums. Purely additive; no backfill needed (existing rows have all-null new columns, which the app already treats as "not yet analyzed" via `status`).
**Destructive:** n — additive only.
**Backfill:** N/A.

### 4.3 RLS

No new policy needed — the existing `event_ai_analysis_owner` policy already covers all columns on the table (`FOR ALL`, not column-scoped).

---

## 5. Clinical safety invariants (non-negotiable — `clinical-guardrails` skill applies in full)

Stool analysis inherits every invariant vomit already enforces, applied to the stool-specific fields:

1. **n=1 never reassures.** A single stool photo showing no red flags escalates to `not_enough_to_say` or `monitor`, never a wellness claim. Absence of visible blood/mucus in one photo ≠ a healthy GI tract.
2. **Deterministic escalation floor, model cannot downgrade.** Same 3-layer structure as vomit (D2 shares the actual code). Blood present, repeated Type 7, or a concurrent-vomiting/lethargy contextual flag forces `worth_a_call` regardless of model output.
3. **Contextual flags are server-computed.** `repeated_loose_stool` (≥2 diarrhea/loose events in a rolling window — exact threshold set at PR 1, likely mirroring vomit's `repeated_vomiting` cadence), `concurrent_vomiting`, `concurrent_lethargy` — computed from SQL over `events`, never reasoned by the vision model.
4. **Absence-of-log guard (Pattern 6) — load-bearing here, not hypothetical.** Any future flag keying off "no normal stool logged in N days" (a constipation signal) MUST be gated by confirming the owner actually logs stool events for this pet at some baseline rate, exactly as `feline_reduced_intake` is gated by `tracksIntake`. This spec does not build such a flag in v1 (out of scope, §7), but the guard requirement is recorded now so it isn't missed when it's proposed later.
5. **Re-analysis preserves owner edits (Pattern 7).** An owner-edited `stool_consistency`/`stool_colour`/etc. is never overwritten by a re-run; only `recommendation`/`read_text`/flags refresh.
6. **Honest degradation on unreadable input.** Same `photoUnreadable` path as vomit — never reassures, never 500s, always leaves a retryable row.
7. **The never-reassure invariant is a test assertion**, not a comment — every stool-analysis template string gets the same regex-scanned reassurance-word test as vomit's.

Nyx-voice example:
> ✅ "Type 6, soft and unformed — worth mentioning at your next vet visit if it continues past a couple of days."
> ❌ "Nothing to worry about, this looks like a normal stool!"

---

## 6. Cross-cutting touch-points (audit)

- `supabase/functions/analyze-stool/` — new Edge Function (PR 2/3).
- `supabase/functions/_shared/incident-analysis.ts` — new shared module (PR 2, if D2 ratified); `analyze-vomit` refactored to consume it (same PR, so the two functions never drift out of sync mid-migration).
- `lib/analysis.ts` — add `triggerStoolAnalysis`, add `EDITABLE_STOOL_FIELDS`.
- `app/log.tsx` — wire the auto-trigger call after a stool event with a photo is created (same call site pattern as vomit's).
- `app/event/[id].tsx` — render `StoolAnalysisSection` for stool event types.
- `components/event/StoolAnalysisSection.tsx`, `components/event/stoolFields.ts` — new, siblings of the vomit components.
- `supabase/functions/generate-signal/detection.ts` — no change required for v1 (diarrhea is already a first-class `CORRELATION_SYMPTOM_TYPES` entry); a future PR could let the signal engine consume `stool_consistency` trend data, but that's Step-10-evolution scope, not this build (see §7).
- `docs/nyx-vet-report-requirements.md` §3.7 / §12 PR 4 — no scope change, just a data source becoming available (D6).
- Migration: one new file, e.g. `0NN_stool_analysis_columns.sql` (own PR, additive-only, passes Migration Safety Pre-flight trivially).

---

## 7. Out of scope for v1 (deferred, with reasons)

- **Constipation / no-recent-normal-stool detection.** Requires the Pattern-6 absence-of-log guard (§5.4) to be designed properly, not bolted on. Route to backlog once this build ships.
- **Stool-consistency trend detector in the Signal engine** (e.g. a Bristol-drift-over-time lane analogous to B-182 chronicity). Step 10 evolution scope; the per-incident read (this doc) is a prerequisite for it, not the same build.
- **Colour-based diet-response correlation** (e.g. "stool colour changed after switching protein X"). This is exactly the kind of cross-incident, multi-sample claim Pattern 3 reserves for the correlation engine, not a per-incident read — future Step 10 work, not this spec.
- **Schema consolidation of `stool_normal`/`diarrhea` into a single `event_type='stool'`.** Explicitly deferred per D1; remains a separate, still-open CLAUDE.md question.

---

## 8. PR-by-PR build plan

**Phase A — Foundation**
- **PR 1 — Schema.** The `stool_*` enums + `event_ai_analysis` columns (§4). Migration Safety Pre-flight (additive, no destructive flag). Data Scientist + rls-privacy-reviewer sign-off. PM action: apply via Supabase MCP `apply_migration`.

**Phase B — Analysis engine**
- **PR 2 — Shared incident-analysis module (if D2 ratified) + `analyze-vomit` refactor.** Extract the 3-layer escalation pattern, image-processing utilities, and write-back/re-analysis logic into `_shared/incident-analysis.ts`. Refactor `analyze-vomit` to consume it with **zero behavior change** — this PR's acceptance criterion is that `analyze-vomit`'s existing test suite passes unmodified. Engineer + adversarial-reviewer sign-off (regression risk on a shipped clinical function is exactly what adversarial review exists for).
- **PR 3 — `analyze-stool` Edge Function.** New function: tool schema (Bristol enum + colour/content/blood/mucus/foreign-material fields, `recommendation`, `read_text`), system prompt (stool-specific guardrail language + Bristol-scale framing instructions for the model), contextual-flag computation (`repeated_loose_stool`, `concurrent_vomiting`, `concurrent_lethargy`), escalation floor (D5). Sonnet 4.6, forced tool choice. **Adversarial-reviewer mandatory** (this is a new clinically load-bearing function — the DoD line applies in full, not by inheritance from vomit's prior review). Every template string covered by the reassurance-word regex test (Pattern 8).
- **PR 4 — Deploy + smoke test.** Bundle via `scripts/deploy-edge.sh analyze-stool`, deploy via Supabase MCP, verify JWT'd boot smoke test returns a clean 4xx on a bogus event id.

**Phase C — Client + UX**
- **PR 5 — `lib/analysis.ts` trigger + sync wiring.** `triggerStoolAnalysis`, `EDITABLE_STOOL_FIELDS`, call-site wiring in `app/log.tsx` after a photographed stool event is created.
- **PR 6 — `StoolAnalysisSection` + `stoolFields.ts`.** Detail-screen rendering (§3), Designer sign-off against the seven principles + nyx-voice (Bristol-type-as-secondary-detail framing is a Designer call, not just an Engineer one).

**Phase D — Vet report (gated)**
- **PR 7 — Feed AI-read fields into the existing "Stool characteristics" vet-report section.** Gated on Step 9's §12 PR 4 landing first (that PR owns the section's existence; this PR only adds a data source to it). Present-only rendering discipline for blood/mucus (same as Vomit Characteristics). `vet-report-cold-read` subagent run once a rendered sample exists.

**Parallelism:** PR 1 is a hard prerequisite for everything else. PR 2 and PR 3 are sequential if D2 (shared module) is ratified — PR 2 must land and pass `analyze-vomit`'s existing tests before PR 3 builds on top of it — but if D2 is overridden to "standalone copy," PR 2 disappears and PR 3 can start immediately after PR 1, in parallel with nothing else in this doc. PR 5 and PR 6 are independent of each other (different files: `lib/analysis.ts` vs. new components) and can run as parallel sessions once PR 3/4 land. PR 7 is hard-gated on Step 9 progress outside this doc's control — do not block Phases A–C on it.

---

## 9. Acceptance criteria (QA — per PR, before merge)

- PR 1: migration applies cleanly to a fresh + to the live schema; `get_advisors` clean (no missing RLS, no unindexed FK — none introduced).
- PR 2: `analyze-vomit`'s full existing test suite passes with zero test-file changes (proves the refactor is behavior-preserving).
- PR 3: every reassurance-word/exclamation-mark test passes; escalation floor forces `worth_a_call` on blood-present and repeated-Type-7 fixtures; `photoUnreadable` path never 500s; adversarial-reviewer counterexample stated and held (see DoD template).
- PR 5/6: a stool event with a photo produces a rendered `StoolAnalysisSection` within the same latency envelope as vomit; an owner edit to `stool_consistency` survives a re-analysis trigger; dismiss is reversible.
- PR 7: INSUFFICIENT verdict from `vet-report-cold-read` blocks merge; section renders present-only for blood/mucus, omits entirely when no stool events exist (matches existing §3.7 gating).

---

## 10. Evidence / references

- `.claude/skills/clinical-guardrails/SKILL.md` — the 8 canonical patterns this spec inherits verbatim, and its own §4 prediction that stool is "the second incident type" earning the abstraction refactor.
- `supabase/functions/analyze-vomit/index.ts` — the structural template for `analyze-stool` (model choice, tool-use pattern, escalation floor, contextual flags, write-back logic).
- `supabase/migrations/013_event_ai_analysis.sql` — the table this spec extends; header comment mandates parameterization over forking.
- `docs/nyx-vet-report-requirements.md` §3.7, §12 PR 4 — the existing (data-source-less) "Stool characteristics" section this build feeds.
- `docs/nyx-medication-logging-requirements.md` — the structural template for this document itself (D-table format, PR-by-PR plan, safety-invariant section).
