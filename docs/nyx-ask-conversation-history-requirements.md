# Ask — Conversation History (browsable, durable) — Requirements & Build Plan

**Version:** 0.1 — **DRAFT for PM ruling** | **Date:** 2026-07-19
**Backlog anchor:** **B-387** (new). Distinct from **B-374** (pinnable *answers* as artifacts) and **B-375** (internal telemetry/query-log). This is the owner-facing *durable, browsable conversation history* the D8 in-memory store deliberately stops short of.
**Depends on:** shipped Ask v1 (B-228 A1–A8), `ai_usage`/caps (#348), B-039 deletion cascade, B-054 multi-device local-first sync.
**Status:** **Not build-ready.** This spec reverses a ratified non-goal and reopens the T&S posture the whole Ask track was built around. It exists to frame the decision, not to green-light a build. Nothing here ships until the PM rules H1–H8 (§2) and Trust & Safety signs off on the chosen shape.

---

## 0. The headline decision (read this first)

Ask v1 does not merely *lack* history — it **rules it out on purpose, twice**:

1. `docs/nyx-ask-requirements.md` **§11 Non-goals** lists *"persisted threads / memories"* as an explicit non-goal.
2. The research lesson behind **B-374** (the Dia "lost-history friction" study, `docs/research/2026-07-ask-ai-ux-landscape.md`) is stated as a rule: **persist *answers* as artifacts, never *transcripts*.**

What shipped instead is the D8 middle ground: the conversation is **ephemeral in-memory Zustand state** (`store/askStore.ts`) that survives in-app navigation and the provenance tap-through, but is intentionally gone on app-background/kill, pet-switch, or ~30-min idle. That was a conscious Trust & Safety call — a **durable, server-side log of health questions over a pet's record** is a materially heavier data-sensitivity surface than anything Ask holds today.

**Option B (this spec) reverses that stance.** It builds exactly the thing §11 fences off: a persisted, browsable, reopenable transcript store. That is a legitimate product direction — the PM asked to explore it — but it is a **product + privacy decision, not a plumbing task**, and it must not be smuggled in as an implementation detail.

### The persona conflict, stated (not resolved)

> **Pet Owner (Jordan/Sam):** I asked a good question last week and now it's gone. A chat with no history feels broken — every assistant I use keeps my conversations. Let me come back to them.
>
> **Trust & Safety / Privacy:** A durable, cross-device store of free-text health questions — *amplified by D2, which already puts note text and clinical photo-reads inside answers* — is a new, standing, sensitive-data asset. It needs a lawful basis, a retention position, at-rest posture, per-item + bulk deletion, and a clean fold into the B-039 erasure story. "Owners expect it" is a reason to design it carefully, not a reason to skip the review. I dissented on D2's ephemeral boundary; **persisting** that content widens exactly the boundary I flagged.
>
> **Designer:** The ratified answer to lost-history was *"save the answer, not the chat"* (B-374). Before we build a full transcript store, we should be honest that a browsable-history list is a different product than a save-the-useful-answer affordance — and that the market default (chat keeps everything) is not automatically the Culprit-voice-right default for *health* data.
>
> **PM decision needed:** Do we build durable browsable history at all (vs. B-374's save-answers path)? And if yes, on which of the H1–H8 shapes below?

This block is the gate. Everything downstream (§3–§11) is written *conditionally* — "if the PM rules to build B, here is the honest way to do it" — and each open decision is flagged, not silently defaulted.

---

## 1. What this is and why

**Ask — Conversation History** gives the owner a **browsable list of their past Ask conversations**, each **reopenable** as a full transcript, surviving app restart and (H2) across devices — with **per-conversation and clear-all deletion**, folded into account deletion.

- **The friction is real and observed** (PM dogfood, 2026-07-19): "should I have been able to navigate away from Ask and return to the conversation? As far as I can tell there's no chat history." The D8 store is doing its job (survives nav), but the moment the app backgrounds, the thread is gone — and there is no list of past threads anywhere.
- **The reflective wedge argues *for* it.** Ask is a reflective surface (evening couch; parking lot before the vet). A question worth asking is often worth returning to — "what did she say about the vomiting timing again?" the night before a vet visit. History turns one-shot answers into a record the owner builds.
- **But the wedge also argues for restraint.** The *keepable artifact* Ask v1 chose was the **vet-visit rundown** (deterministic, pinnable) — precisely because it's the thing a reactive owner actually reuses. History may be the more general version of that need, or it may be scope that dilutes it. That tension is H8.

---

## 2. Decision record — OPEN (PM to rule)

Each row carries a **recommendation** and the alternative. None is ratified. The T&S-load column is the honest cost signal.

| # | Decision | Recommendation | Alternative(s) | T&S load |
|---|---|---|---|---|
| **H1** | **Build B at all?** Durable browsable history vs. B-374 save-answers. | **Decide deliberately.** If the felt need is "return to the *conversation*," B. If it's "keep the *useful answer*," B-374 is lighter and already stance-aligned. Recommend a quick Jordan/Sam read before committing. | B-374 only (no transcript store); or both (B-374 first, B later). | — |
| **H2** | **Storage locus.** Local-only (SQLite) vs. server-synced (Supabase + RLS). | **Server-synced.** B-054 multi-device is live; a history that exists on one phone is a broken promise the moment the owner switches devices, and centralizing it makes deletion honest. This is the heavier path — chosen on the ambition of "browsable history," not by default. | **Local-only** — much lighter T&S (nothing new leaves the device beyond what the answer already sent), but single-device, lost on reinstall/logout-wipe. A genuine v1 de-risk. | Server: **high.** Local: **low.** |
| **H3** | **What is persisted per turn.** Full rendered body incl. D2 raw content vs. rendered prose + provenance refs only. | **Prose + refs only.** Store the owner's question, the assistant **headline + detail as shown** (already the exact string `askTurns()` serializes), the structural component payload (pips/sparkline/list data), and **provenance event-id references** — but **do NOT copy raw note bodies or photo-read prose into the new store.** On reopen, provenance re-resolves live via the existing tap-through (RLS-checked, override-aware). Keeps the durable store from becoming a *second home* for the most sensitive D2 content — directly answering the D2 dissent. | Persist the fully-denormalized body (faithful snapshot even if the source event is later edited/deleted) — but that is a new durable copy of note text + clinical reads outside the event where they live. | Refs-only: **contains** the D2 blast radius. Snapshot: **widens** it. |
| **H4** | **Faithfulness vs. freshness on reopen.** | **Faithful to what was said** for the prose (H3 stores the rendered headline/detail verbatim), **honest about drift** for provenance: if a referenced event was since edited or soft-deleted, the tap-through says so ("this event was edited/removed since") rather than silently showing a new number. Never resurface a soft-deleted event's content. | Live re-resolve the whole answer (always current, but the transcript stops being a record of what was actually said). | — |
| **H5** | **Retention.** | **PM call — do not default silently.** Product-preferred: **keep all, owner-deletable** (a history that silently forgets undercuts the feature). T&S-preferred: a **bounded window** (rolling N conversations or a time cap) to keep the standing sensitive-data footprint small. Recommend: keep-all **with** a visible clear-all + per-item delete, and revisit a cap after dogfood if the store grows. | Rolling-N / time-boxed auto-expiry; or forever-no-delete (rejected — deletion is non-negotiable for health data). | Keep-all: **higher** standing footprint. Windowed: **lower.** |
| **H6** | **Deletion granularity.** | **Per-conversation delete + clear-all**, both a **real purge** (not soft-delete — the soft-delete-only rule governs *events* for sync/audit; a transcript the owner asks to forget should be gone), **and** an automatic fold into the B-039 cascade via `ON DELETE CASCADE`. | Soft-delete with a purge job (adds a window where "deleted" history still exists server-side — worse story for a T&S-sensitive asset). | Real purge: **best** erasure story. |
| **H7** | **Multi-pet scoping.** | **Per-pet.** Conversations already re-scope on pet switch; each conversation carries `pet_id`; the list is filtered to the active pet (with the pet named on each row for multi-pet clarity). | Account-wide list grouped by pet. | — |
| **H8** | **Scope vs. the rundown/B-374.** | Ship history as **navigation over past Ask threads only** — not a second "saved items" surface. Keep the **rundown** as the deterministic pinnable artifact and **B-374** as the save-*this-answer* affordance; they compose, they don't merge. Revisit whether a saved-answer pin belongs *inside* a reopened conversation after dogfood. | Fold B-374 into this (one "saved" surface) — larger, and mixes two different mental models. | — |

**Inherited, non-negotiable regardless of H-rulings:** the two safety invariants; D2's boundary mechanisms (§6 of the Ask spec) still bind what *enters* an answer; Pets > $ (history of safety-relevant answers can't be paywalled behind a hard wall — §7); nyx-voice on every string; `rls-privacy-reviewer` mandatory on any server surface.

---

## 3. Product definition (conditional on H1=B)

### 3.1 Entry
- A **history affordance on the Ask surface** — a list/clock glyph in the Ask header (not a new Home card; Home carries no new state, per Principle 3 and D5). Tapping opens the **history list**.
- The existing **"＋ / new conversation"** affordance stays; starting fresh no longer discards the old thread — it's now saved to history.

### 3.2 The history list (`app/ask-history.tsx`, new)
- **Reverse-chronological list of past conversations for the active pet** (H7). Each row: an auto-title (H3: the **first user question**, truncated — deterministic, no extra model call), a relative timestamp, and (multi-pet) the pet's name.
- **Row tap → reopen** the conversation as a read-only-then-continuable transcript (§3.3).
- **Swipe / long-press → delete** one conversation (H6), with an undo-less honest confirm for a real purge ("Delete this conversation? It can't be recovered.").
- **Overflow → "Clear all history"** (H6) — type-to-confirm-free but explicit, nyx-voice, honest about permanence.
- **Empty state (Principle 5, designed):** "Your past questions about {petName} will show up here." + a chip back to a fresh Ask. Never a blank screen.
- **Offline:** if H2=server, the list reads from the **local SQLite mirror** (§5), so browsing history works offline; only *new answers* need the network (Ask's existing online-only exception). If H2=local, it's local by construction.

### 3.3 Reopening a conversation
- Renders the saved turns via the **existing Ask answer-card renderer** (`components/ask/*`) — same headline/detail/component/provenance/chips.
- **Provenance tap-throughs re-resolve live** (H4): open the source event where the note/photo actually lives; if that event was edited/soft-deleted since, show the honest drift line rather than a stale or resurrected read.
- **Continuing a reopened conversation** appends new turns to it (D8 semantics preserved: in-memory during the session, persisted on answer-resolve). Credit rules: §7.

### 3.4 What history is NOT
- Not a search interface (v1 — future, §12).
- Not a saved-answers/pins surface (that's B-374 — H8 keeps them separate).
- Not a "memory" the model reasons over across conversations (persisted *memories* stay a permanent non-goal; history is owner-facing navigation, never model context beyond the in-session D8 turns).

---

## 4. Data model (conditional on H2=server; sketch, not final)

House conventions applied: `pet_id` + RLS on every table, `ON DELETE CASCADE` from `auth.users`/`pets` so it folds into B-039 for free, UTC timestamps, last-write-wins. Single-table + `jsonb` turns (mirrors the `ai_signals.findings jsonb` precedent and the client's existing whole-conversation shape) — a normalized `ask_messages` child table is the alternative if per-turn querying is ever needed (it isn't for v1).

```sql
-- Migration NNN_ask_conversation_history.sql  (OWN PR — schema isolation)
CREATE TABLE ask_conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pet_id      UUID NOT NULL REFERENCES pets(id)        ON DELETE CASCADE,
  title       TEXT,                 -- derived from the first user question (H3), client-set
  turns       JSONB NOT NULL DEFAULT '[]'::jsonb,      -- H3: prose + component payload + provenance REFS only; NO raw note/photo-read bodies
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()       -- last-write-wins on sync
  -- NO deleted_at: H6 = real purge, not soft delete.
);

ALTER TABLE ask_conversations ENABLE ROW LEVEL SECURITY;

-- Owner-only, AND pet-ownership (defense in depth: a conversation's pet must belong to the caller).
CREATE POLICY ask_conversations_rw_own ON ask_conversations
  FOR ALL TO authenticated
  USING      (user_id = auth.uid() AND pet_id IN (SELECT id FROM pets WHERE user_id = auth.uid()))
  WITH CHECK (user_id = auth.uid() AND pet_id IN (SELECT id FROM pets WHERE user_id = auth.uid()));

CREATE INDEX ask_conversations_pet_updated ON ask_conversations (pet_id, updated_at DESC);
```

### 4.1 Migration Safety Pre-flight
- **Destructive:** `n` — purely additive (one new table + RLS + index; no existing column/type/table/row touched).
- **Rollback:** `DROP TABLE IF EXISTS ask_conversations;`
- **Backfill:** `N/A` — new table, starts empty; rows accrue live. (There is no in-memory history to migrate — D8 state was never persisted.)
- **Affected tables:** none existing. Pre-apply check: `SELECT count(*) FROM ask_conversations; -- expect: relation does not exist`.

### 4.2 Deletion cascade (B-039 fold-in)
Because `user_id`/`pet_id` are `ON DELETE CASCADE`, account deletion and pet deletion tear down conversations automatically — **no new delete code in `delete-account`**, exactly the B-039 property. Add a one-line note to `docs/nyx-account-deletion-requirements.md` §2a table (`ask_conversations | user_id/pet_id → CASCADE`) and an AC-3 row-count check. *(Flagged as a Tier-2 doc edit, §11 — not made unilaterally.)*

---

## 5. Storage & sync architecture (conditional on H2=server)

Local-first, matching the app's existing pattern (`lib/sync.ts`, `lib/db.ts`), so history reads work offline and writes survive reconnect:

- **Local SQLite mirror** `ask_conversations` (same columns) — the read source for the list + reopen. Cleared by the B-054 logout-wipe like every synced table.
- **Write on answer-resolve.** When `resolveAnswer` fires (online — Ask can't answer offline), upsert the whole conversation row (id + turns + title + updated_at) to Supabase **and** the local mirror. Whole-conversation upsert = last-write-wins on `updated_at`, no merge logic (house rule).
- **`supabase-sync` guardrails apply:** check the upsert result before marking synced (no unchecked-upsert-marks-synced trap, B-027); no `fetch(uri).blob()` 0-byte trap (no blobs here — turns are JSON); RLS-gated reads only.
- **Sync-down** on app foreground / Ask-history open: pull conversations for the active pet the local mirror doesn't have (multi-device convergence). Bounded by H5 retention.
- **No new Storage bucket** — H3 stores refs, not photos; the photos stay in `nyx-event-attachments` where they already live.

If **H2=local**, drop the Supabase table + sync entirely: the local SQLite table is the whole feature, and the B-039 fold-in is instead handled by the existing `clearLocalData()` wipe (history dies with the device/account, no server erasure needed). Much smaller build; the trade is single-device + lost-on-reinstall.

---

## 6. Privacy & T&S posture (the heart of this spec)

This section is **conditional and must be signed off by Trust & Safety before build**, not after.

- **New standing asset.** If H2=server, this creates the first **durable, cross-device store of free-text health questions** in the product. That is a categorical change from Ask v1 ("persists nothing"). It needs an explicit **lawful basis** (owner's own data, owner-initiated, owner-deletable) written into the privacy policy — a **PM/legal action**, mirroring the B-354 terms rewrite.
- **D2 containment (H3).** The single most important guardrail: **do not persist raw note bodies or photo-read prose into the history store.** Store the rendered answer prose (already destined for the model as context) + provenance refs; let the sensitive source content stay in the event and re-resolve live. This keeps history from re-widening the exact boundary T&S dissented on for D2.
- **At-rest posture.** Supabase encrypts at rest by default; RLS is owner+pet-scoped (default-deny to every other account). App-layer encryption of the transcript is likely over-engineering for v1 — **flag for T&S to confirm**, don't assume.
- **Deletion (H6).** Per-conversation + clear-all, real purge, plus the B-039 cascade. This is table stakes; it is what makes the "we keep our word about erasure" story (B-039 §1.1) survive the new asset.
- **Retention (H5).** A bounded window is the T&S-preferred posture; keep-all is the product-preferred. **PM ruling required** — do not ship keep-all-forever without an explicit decision.
- **Injection surface unchanged in kind** — history stores *outputs*; it never becomes model *input* beyond the in-session D8 turns Ask already sends. No new injection path.
- **`rls-privacy-reviewer` mandatory** on the server PR (the new read/write surface + cross-user/cross-pet attack) and on the B-039 fold-in verification.
- **Telemetry (B-375) stays separate.** This is owner-facing history; it is **not** an internal question-log for quality/parser work. Do not let one become a backdoor for the other.

---

## 7. Cap / credit interaction (D3/D9)

- **Reading and reopening history is always free** — no model call, no credit, no `ask_message`, no `ask_conversation`. Browsing the past is not gated (and must not be, under Pets > $, when a past answer was safety-relevant).
- **Continuing a reopened conversation** = appending a new question. Rule (recommend): a follow-up in a reopened thread **within the same UTC month** as that conversation's `updated_at` does **not** spend a new `ask_conversation` credit (it's the same conversation, D9 semantics); a follow-up in a **later month** starts a **new** conversation credit — otherwise one old thread becomes an unlimited free channel. `ask_message` still counts every model call (cost/abuse backstop, unchanged). **Flag H-adjacent: PM/team confirm this rule.**
- **The cap never deletes or hides history.** A capped owner can still browse and reopen every past conversation; only *new* answers are gated (§9.3 of the Ask spec — the cap gates the model call, never the record).

---

## 8. Functional requirements (conditional on H1=B)

- **FR-1 — Persist on resolve.** On each substantive answer, the conversation (turns + title + updated_at) is written durably (H2 locus). A deflection/floor/cap answer is still part of the transcript visually but follows the D9 credit rule (§7).
- **FR-2 — History list.** Reverse-chronological, per-pet (H7), auto-titled by first question (H3), empty-state designed (Principle 5).
- **FR-3 — Reopen.** Renders saved turns via the existing card renderer; provenance re-resolves live with honest drift handling (H4).
- **FR-4 — Per-conversation delete** (H6) — real purge, honest confirm.
- **FR-5 — Clear all** (H6) — real purge, honest confirm, nyx-voice.
- **FR-6 — Deletion cascade.** `ON DELETE CASCADE` folds into B-039; a pet delete removes that pet's conversations. (H2=server only; H2=local uses the logout-wipe.)
- **FR-7 — Offline read.** History list + reopen work offline from the local mirror (H2=server) or local table (H2=local); only new answers need the network.
- **FR-8 — Multi-device convergence** (H2=server) — sync-down on foreground/open; last-write-wins on `updated_at`.
- **FR-9 — D2 containment** (H3) — no raw note/photo-read content persisted to the history store.
- **FR-10 — Voice + honesty** — every string via nyx-voice; delete copy honest about permanence, no dark patterns.

---

## 9. Acceptance criteria (paste verbatim at Build Step Kickoff, once H1–H8 ruled)

- **AC-1.** A past conversation survives app **background/kill and restart**, and is reopenable from the history list. *(The exact gap the PM hit.)*
- **AC-2.** (H2=server) A conversation created on device A appears on device B after sync. (H2=local) — N/A, documented as a known single-device limit.
- **AC-3.** Reopening renders the saved turns faithfully; a provenance tap-through to a **since-edited or since-deleted** event shows the honest drift line and never resurfaces soft-deleted content (H4).
- **AC-4.** Per-conversation delete and clear-all **purge** the data (verify: gone from local mirror and, H2=server, from `ask_conversations` in the dashboard) — not soft-deleted.
- **AC-5.** (H2=server) Account deletion removes all of the user's `ask_conversations` rows via cascade — dashboard shows **0 rows** for that user (B-039 AC-3 extended).
- **AC-6.** No raw note body or photo-read prose is written to the history store (H3/FR-9) — inspect a stored `turns` payload for an event-recall answer and a photo-backed answer.
- **AC-7.** Reading/reopening history spends **no** credit and issues **no** model call; a cross-month follow-up in a reopened thread spends a new `ask_conversation` per §7.
- **AC-8.** A **capped** owner can still browse and reopen all past conversations (Pets > $; cap gates only new answers).
- **AC-9 (privacy backstop, mandatory).** `rls-privacy-reviewer` run on the server diff (H2=server) and the B-039 fold-in — reports the concrete attacks tried (cross-user read/write of another account's conversations; cross-pet; confused-deputy on upsert) and that each held. A bare ✓ is not sign-off.
- **AC-10.** Unit tests cover the pure title-derivation, turn-serialization (D2-containment assertion), and the cross-month credit rule; `deno check`/`tsc` + suites pass.
- **AC-11.** `pm-feature-review` run on the built list + reopen flow (legibility: does a real Jordan/Sam understand what's saved, what's deleted, and that deletion is permanent?).

---

## 10. Persona sign-off (requirements stage — INCOMPLETE by design)

- **Trust & Safety / Privacy — ⚠️ CONDITIONAL, blocking.** Approves *nothing* until H2/H3/H5/H6 are ruled. Hard requirements: D2 containment (H3=refs-only), real-purge deletion (H6), a retention position (H5), lawful-basis policy line, and the mandatory `rls-privacy-reviewer` pass. Records the standing dissent that a durable health-Q&A store is a new asset class for the product.
- **Designer — ⚠️** Wants H1 answered honestly (history vs. B-374 save-answers) before investing; if history, the empty state, the delete confirm, and the "what's kept" legibility are the make-or-break surfaces.
- **Pet Owner (Jordan/Sam) — ✓ (motivating)** This resolves a real felt gap; the ask is "let me come back to it," and honest, obvious deletion is a feature not a footnote.
- **Dir. of Engineering — ✓ (conditional)** If H2=server: one table + RLS + local mirror + whole-conversation upsert, folds into B-039 for free — bounded. If H2=local: smaller still. No new bucket. Recommend building **H2=local first** as a de-risk if T&S wants to see the surface before it goes cross-device.
- **Data Scientist — ✓ (N/A-ish)** No correlation/statistics load; the one rigor point is H4 (never let a stale/resurrected event misrepresent a past number).
- **QA — ✓** ACs enumerated; AC-3 (drift) and AC-6 (D2 containment) are the ones to actually exercise.
- **Dr. Chen — N/A** clinically; the concern is only that a persisted read never contradicts the live event (H4/one-read-path parity).

**This sign-off block is intentionally unfinished. It is a gate, not a formality.**

---

## 11. Phased build plan (conditional; ordered so the risky bits gate early)

*Only after H1–H8 are ruled.* Recommended sequencing if H1=B, H2=server:

| PR | Scope | Gates |
|---|---|---|
| **H-1** | Schema migration `NNN_ask_conversation_history.sql` (§4) — own PR, migration isolation; apply live via MCP + `get_advisors`. | Pre-flight; Dir. of Eng; **rls-privacy-reviewer** (RLS) |
| **H-2** | Persistence + local-first sync (§5): local SQLite mirror, whole-conversation upsert on resolve (D2-containment enforced at serialization, H3/FR-9), sync-down, logout-wipe fold-in. Unit-test the serializer's containment + title derivation. | code-reviewer; **rls-privacy-reviewer** (service/RLS surface); supabase-sync |
| **H-3** | History list + reopen UI (`app/ask-history.tsx`, §3.2–3.3): reverse-chron list, reopen via existing renderer, live provenance re-resolve + drift handling (H4), designed empty state. | code-reviewer; nyx-voice; Designer; **pm-feature-review** |
| **H-4** | Deletion (H6/FR-4/FR-5): per-conversation + clear-all real purge, honest confirms; B-039 §2a/AC-3 doc + verification. | code-reviewer; **rls-privacy-reviewer** (cascade); Trust & Safety |
| **H-5** | Credit-rule + capped-access polish (§7): cross-month follow-up rule, capped-owner browse/reopen, tests. | adversarial-reviewer (credit rule); code-reviewer |

If **H2=local**, collapse to: H-2' (local table + write-on-resolve + logout-wipe), H-3 (UI), H-4' (local purge). No migration, no `rls-privacy-reviewer`-on-server, no sync — a ~2-PR feature and a clean way to ship the UX and *watch the surface* before committing to a server store.

### Kickoff prompt (once ruled)
> _"Build B-387 per `docs/nyx-ask-conversation-history-requirements.md` — start at PR H-1 (the `ask_conversations` migration, §4) after confirming the H1–H8 rulings are recorded in §2. Own PR for the schema; apply via Supabase MCP + `get_advisors`; run `rls-privacy-reviewer` on the RLS. Do NOT persist raw note/photo-read content (H3/FR-9)."_

---

## 12. Non-goals (v1) & composes-with
- **Search over history** — future; a reverse-chron list is v1.
- **Cross-conversation "memory"** the model reasons over — **permanent non-goal** (distinct from owner-facing history).
- **Saved-answer pins (B-374)** — separate surface, composes (H8).
- **Internal telemetry/query-log (B-375)** — separate, T&S-gated, do not conflate.
- **AI-ready export / context pack (B-089)** — the whole-record artifact; unrelated.
- **Voice input (B-373), contextual "Ask about this" (B-372)** — orthogonal Ask fast-follows.

---

## Appendix — why this is B-387 and not B-375
The 2026-07-19 dogfood surfaced this as "no chat history." The nearest existing rows are **B-374** (pinnable *answers*, not transcripts) and **B-375** (internal *telemetry*, not owner-facing). Neither is a browsable, reopenable *conversation* store — so this is a **new item, B-387**, with an explicit dependency on the H1 ruling (it may instead resolve as "do B-374, not B"). Recorded so the distinction between *owner-facing history*, *saved answers*, and *internal logging* stays clean.
