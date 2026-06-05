# Multi-Device Sync (Down-Sync / Hydration) — Requirements

**Version:** 1.0 | **Status:** Requirements (pre-implementation) | **Date:** 2026-06-05

> Output of a research/requirements session prompted by a real dogfood failure: the PM's wife logged into the shared account on a second phone (Expo Go) and saw an empty log, while the PM's own writes were visible in the Supabase dashboard. Investigation (this session) confirmed the cause is architectural, not a bug or a cache to clear. Read this **and** `CLAUDE.md` before starting the implementation session.
>
> Decisions marked **[PM-DECISION]** are open and must be resolved before or during the build session — they are not yet settled. Everything else is a team recommendation ready to build unless the PM overrides.
>
> **Getting started:** jump to **§12 Phased delivery plan** — four small PRs in risk order, each with a paste-ready kickoff prompt. The "wife's phone" fix lands in Phase 1.

---

## 1. Problem & Vision

**Problem (verified this session).** Nyx is local-first. Every logged event/meal/symptom/vet-visit is written to on-device SQLite and read back from that same on-device store. Sync is **push-only**: `lib/sync.ts` flushes local writes *up* to Supabase, but **no code path ever pulls another device's rows back *down* into local SQLite.** The only cloud→local write in the whole client is `refreshFoodCache()`, and that's the globally-scoped food library, not pet data.

Consequence: two phones on the same account are two write-only islands. They both push to one cloud, neither reads the other's writes. A second device sees a *partial* picture — the pet, conditions, diet-trial card and AI Signal appear (those are read live from Supabase), but the **actual log/timeline is empty**, and anything the second device logs never reaches the first.

**Vision.** Two people who care for the same pet (the PM and his wife; Jordan and a partner; a multi-caregiver household) should see **one shared, current health record** from any device they log into. A meal logged on either phone appears on the other. Deletes and edits propagate. The app stays offline-first — local SQLite remains the read source and the offline buffer — but it now *reconciles downward* on connect, not just upward.

This is the missing half of Step 8 (Offline Sync). Step 8 built the flush queue (up); this builds hydration (down).

---

## 2. Background — what crosses devices today (evidence)

Traced exhaustively this session. Three buckets:

| Data | Storage | Read path | Crosses devices today? |
|---|---|---|---|
| Pet profile | Supabase `pets` | `hooks/usePet.ts` reads live from Supabase | ✅ Yes |
| Conditions, diet trials | Supabase | `profile.tsx`, `useTrend.ts` read live | ✅ Yes |
| AI Signal | Supabase `ai_signals` | `lib/signal.ts` reads live | ✅ Yes |
| Per-incident AI read | Supabase `event_ai_analysis` | live, but only reachable by tapping an event | ⚠️ Only if the event is present |
| **Events, meals, timeline, "Today"** | **local SQLite** | **`lib/db.ts` (`getTimeline`, `getTodayEvents`…)** | ❌ **No** |
| **Vet visits + attachments** | **local SQLite** | **`lib/db.ts`** | ❌ **No** |
| **Event attachments (photos)** | local SQLite rows; files in Storage | local SQLite for rows | ❌ rows No (files are in Storage) |
| Food library | Supabase `food_items` → local `food_items_cache` | `refreshFoodCache()` pulls down | ✅ Yes (the one existing down-sync) |

**The hydration target set is therefore:** `events`, `meals`, `event_attachments`, `vet_visits`, `vet_visit_attachments`. (Pets/conditions/diet-trials/signals already cross devices; the food cache already hydrates.)

RLS already scopes every one of these to the owning account (`docs/nyx-schema-v1_0.sql` — `events_owner`, `meals_owner`, `vet_visits_owner` policies, all `pet_id → pets.user_id = auth.uid()`). So a second device authenticated to the same account is **already permitted** to read these rows — the code to do so just doesn't exist.

---

## 3. Scope

### In scope (v1)
- A **down-sync (hydration) engine** that pulls the account's `events`, `meals`, `event_attachments`, `vet_visits`, `vet_visit_attachments` from Supabase into local SQLite.
- Runs on the same triggers the push queue already uses: app foreground, network-reconnect, and post-login (`hooks/useSync.ts`).
- **Conflict resolution** consistent with the existing last-write-wins rule, made correct for two writers.
- **Cold-start hydration**: a fresh device with empty SQLite, logging into an account that already has history, ends up showing that history.
- **Attachment hydration**: photo *rows* land locally and their images resolve from Storage (signed URLs / download-on-demand) without requiring the original local file.
- UX for the first-load state and the steady state (see §6).

### Out of scope (v1 — tracked separately, see §10)
- **Supabase Realtime** push (instant cross-device updates). v1 is pull-on-trigger; Realtime is a fast-follow layer **on top of** hydration, not a replacement.
- **Household / linked accounts** (each caregiver with their own login linked to a shared pet via a join table). v1 rides on the existing single shared login — **[PM-DECISION confirmed this session: "same login for now."]**
- **Per-user attribution** ("who logged what"). Single shared identity has none; out of scope until linked accounts.
- Any change to the *push* path beyond what conflict-correctness requires.

---

## 4. Personas & user stories

- **PM / Jordan (primary).** "My wife and I both care for Mochi. We each log from our own phone, and we both want to open the app and see the *same* up-to-date history — not two halves." → The hero story. Cold-start + steady-state hydration both required.
- **Sam (cat owner).** Often the secondary logger in a household; grazing/intake notes get logged by whoever's home. Needs the other person's intake ratings to show up or the diet picture is wrong.
- **Dr. Chen (clinical end-user).** The vet report must reflect the *whole* household's logging, not one phone's slice. (Note: the report is server-side and already reads the full Supabase record, so the report itself is fine today — but the owner reviewing on-device before a visit must see the same thing the report will.)
- **Trust & Safety / Privacy.** A second device now holds a full local copy of the pet's health record. Logout/account-switch must not leave that data behind for the next person who uses the app on that phone (see §5.4).

---

## 5. Functional requirements & sync semantics

### 5.1 Hydration engine (the core)
- **FR-1.** Add a `hydrateFromCloud()` path in `lib/sync.ts` (mirror of the existing `syncPending*` functions, inverted) that, for each target table, `SELECT`s the account's rows from Supabase and `INSERT OR REPLACE`s them into local SQLite.
- **FR-2.** Wire `hydrateFromCloud()` into `runSync()` in `hooks/useSync.ts`. **Ordering matters:** hydrate **after** the push flush within a sync cycle, so local unsynced writes are sent up before remote state is pulled down (avoids a stale remote row clobbering a not-yet-pushed local edit). Events before meals (meals FK → events), as the push path already enforces.
- **FR-3.** Hydration must be **incremental after the first run.** Track a per-table high-water mark (last successfully-pulled `updated_at`) and pull only rows changed since, to avoid re-downloading the entire history on every foreground. Cold start pulls everything; subsequent pulls are deltas. **[PM-DECISION: acceptable to ship v1 with a full-pull and add the delta optimization as a fast-follow if it keeps the first cut simpler? Team lean: build the high-water mark from day one — it's cheap and the full-pull-every-foreground pattern will bite on real history sizes.]**

### 5.2 Conflict resolution (last-write-wins, made correct for two writers)
- **FR-4.** Reconciliation is **last-write-wins on `updated_at`**, consistent with the CLAUDE.md hard constraint ("Last-write-wins on sync conflicts; no merge logic"). On hydrate, a remote row overwrites the local row **only if** `remote.updated_at > local.updated_at`. A locally-newer row (e.g. an edit made offline, not yet pushed) is **not** clobbered by an older remote copy.
- **⚠️ FR-5 — the server-trigger gotcha (Data Scientist, load-bearing).** The schema has `set_updated_at()` triggers that stamp `updated_at = NOW()` on **every** server write (`docs/nyx-schema-v1_0.sql:400`). That means when device A pushes a row, the server rewrites its `updated_at` to server-now — **discarding the client's intended timestamp.** If device B then pushes an *older* edit afterward, server-now makes B's stale edit look newer. **LWW on a server-stamped column is not true last-write-wins.** v1 must pick one:
  - **(a)** Compare on a **client-authored** timestamp the trigger doesn't touch (the existing `updated_at` is client-set in local SQLite but server-overwritten — we'd need the upsert to preserve the client value, i.e. drop/adjust the trigger for these tables, or add a separate `client_updated_at` column the trigger ignores). **Migration required.**
  - **(b)** Accept server-time LWW and document that near-simultaneous two-device edits to the *same row* resolve by server-arrival order, not true authorship time. For two trusted caregivers rarely editing the same row in the same minute, this is likely acceptable for v1.
  - **[PM-DECISION required.]** Team lean: **(b) for v1** (events are mostly append-only; same-row simultaneous edits by two people are rare), with **(a)** noted for if/when linked accounts land. The Data Scientist's condition: whichever is chosen, it is **written down and the failure mode is named**, not left implicit (this is the exact class of bug the `useSync.ts:25` comment already flags).
- **FR-6 — `meals` has no `updated_at`.** Confirmed: the `meals` table (server and local) carries only `created_at`, no `updated_at`, no soft-delete. Meals are effectively immutable once written (a meal edit is modeled as event-level). Hydration for meals is therefore **insert-if-absent** keyed on `id` (no LWW needed); never overwrite an existing local meal. Deletions of meals happen via the food-deletion cascade (hard delete) — see FR-8.

### 5.3 Deletes & tombstones
- **FR-7 — soft-deleted events propagate.** `events` use `deleted_at` (soft delete, never `DELETE` — CLAUDE.md hard constraint). Hydration pulls `deleted_at` like any other column, so a soft-delete on device A lands on device B as a row with `deleted_at` set, and the existing `WHERE deleted_at IS NULL` read filters hide it. No tombstone table needed for events. ✅
- **FR-8 — hard-deleted meals/foods are the gap.** The food-deletion flow (`app/food/[id].tsx`) **hard-`DELETE`s** `meals` rows server-side. A pull-based hydration *cannot observe a row that no longer exists* — so device B, which already pulled that meal, will keep a local copy forever (a ghost meal). v1 must handle this: **[PM-DECISION]** either (a) convert meal deletion to a tombstone/soft-delete (composes with **B-005** "smarter library deletes"), or (b) reconcile by *absence* — periodically compare local meal ids for a pet against the server set and delete locals the server no longer has. Team lean: **(b)** as a bounded reconciliation pass for v1 (cheaper than a schema change), **(a)** as the principled fix later via B-005. Note this is the one place the "pull can't see deletes" problem is real, because it's the one place we hard-delete.

### 5.4 Trust & Safety
- **FR-9 — logout must wipe local SQLite.** With hydration, a second (or shared/borrowed) device now holds a full local copy of the pet's health record. On sign-out / account switch, the app must **clear the local SQLite tables** (and any cached signed-URL'd photos) so the next user of that phone can't read the prior account's data. **Verify current logout behavior** — today, with single-device single-account, logout likely does *not* clear local SQLite (it didn't need to). This becomes mandatory the moment a device can be shared. Trust & Safety treats this as a **ship gate**, not a nice-to-have.
- **FR-10 — attachment images.** Event/vet photos: the *rows* hydrate, but the image *files* live in Storage and the original local file won't exist on device B. Detail/timeline rendering must resolve images via **signed URL from Storage** (the pattern `lib/storage.ts` / the food cache already use), not assume a `local_uri`. Hydrated attachment rows have a `storage_path` but a null/foreign `local_uri` — rendering must tolerate that and fetch from Storage.

---

## 6. UX requirements

The seven principles still govern. The relevant ones:

- **Principle 5 (empty states are features).** A freshly-logged-in second device will be empty for the seconds/however-long hydration takes. It must show a **designed loading/empty state** ("Catching up on Mochi's history…"), never a bare blank that looks like data loss — the PM's wife seeing "empty" was the whole genesis of this work.
- **Principle 3 (Home is a calm intelligence surface).** Hydration must not turn Home into a flickering firehose as rows stream in. Settle to the curated surface; don't animate every inserted row.
- **Principle 4 (warm, not nagging).** No "syncing…" spinner anxiety. At most a calm, dismissible status; ideally invisible once caught up.

### ⚠️ Persona conflict surfaced (Designer × Engineer) — needs PM ruling
> **Engineer:** Simplest correct first cut is a **blocking hydration on cold start** — show a full-screen "Catching up…" state, await the first full pull, then render the populated app. Guarantees the user never sees a misleading half-empty timeline, and is the least state-management.
>
> **Designer:** A blocking spinner on every fresh login violates the calm bar (Principles 4/5) and punishes the common case (already-hydrated device, just foregrounding). Prefer **progressive hydration** — render immediately from whatever's local, hydrate in the background, let rows fill in under a calm "still catching up" affordance that resolves silently.
>
> **PM decision needed:** Blocking-on-cold-start-only (simple, safe, slightly heavier first-login) vs progressive-always (calmer, more state to manage, risk of a momentarily-incomplete timeline)? A reasonable synthesis — **block only when local is empty (true cold start), progress silently otherwise** — is the team's lean, but it's a UX call the PM owns.

---

## 7. Edge cases (QA)

1. **Cold start, account has history** → after hydration, second device shows the full timeline/today/vet visits. (The headline acceptance case.)
2. **Bidirectional steady state** → A logs a meal; within one sync cycle on B (foreground/reconnect) it appears on B, and vice-versa.
3. **Offline edit on B, newer than remote** → B's edit is pushed up *before* hydration pulls down, and is **not** clobbered by the older remote copy (FR-2 ordering + FR-4 LWW).
4. **Soft-deleted event on A** → disappears from B after hydrate (FR-7).
5. **Hard-deleted meal/food on A** → does **not** linger as a ghost on B (FR-8 reconciliation).
6. **Large history** → hydration of a pet with thousands of events doesn't freeze the UI or re-pull everything every foreground (FR-3 incremental).
7. **Attachment-only device** → a photo logged on A renders on B from Storage, with no local file present (FR-10).
8. **Logout on a shared phone** → local SQLite is empty afterward; next login (different account) sees none of the prior pet's data (FR-9).
9. **Two devices, same row, near-simultaneous edit** → resolves deterministically per the chosen FR-5 rule; the documented failure mode is the only surprise, and it's bounded.
10. **Meal FK integrity** → a hydrated meal never lands before its parent event (ordering), so the local FK constraint never rejects it.

---

## 8. Acceptance criteria (QA — paste verbatim at Build Step Kickoff)

- [ ] **AC-1.** A second device logging into an account with existing data displays that data (timeline, Today, vet visits, attachments) after one sync cycle — verified on a genuinely empty SQLite.
- [ ] **AC-2.** A write on either device appears on the other after foreground/reconnect, both directions.
- [ ] **AC-3.** An offline edit is not overwritten by an older remote copy (LWW correctness per the chosen FR-5 rule).
- [ ] **AC-4.** Soft-deleted events vanish on the other device; hard-deleted meals don't linger as ghosts.
- [ ] **AC-5.** Hydrated photos render from Storage with no local file present.
- [ ] **AC-6.** Logout clears local SQLite — no prior-account data survives a sign-out on a shared device. **(Trust & Safety ship gate.)**
- [ ] **AC-7.** Repeated foregrounds don't re-pull the full history (incremental hydration) and don't cause visible Home flicker.
- [ ] **AC-8.** `npm test` covers the reconciliation/LWW logic in `lib/sync.ts` (DoD: sync path is a shared utility → tests required). **Note B-026** — jest isn't wired yet; this AC depends on it or carries an explicit Engineer exemption.
- [ ] **AC-9.** Adversarial review (Data Scientist): the FR-5 server-`updated_at` failure mode is named with a concrete counterexample (two-device same-row edit) and the chosen resolution shown to hold or its limits documented.

---

## 9. Open questions / PM decisions consolidated

1. **[PM-DECISION] FR-5 conflict basis** — client-authored timestamp (migration, true LWW) vs server-time LWW (no migration, bounded surprise). Team lean: server-time for v1, documented.
2. **[PM-DECISION] FR-8 meal-delete propagation** — tombstone meals (schema, composes with B-005) vs absence-reconciliation pass (no schema). Team lean: absence-reconciliation for v1.
3. **[PM-DECISION] FR-3 incremental vs full-pull** for v1. Team lean: incremental (high-water mark) from day one.
4. **[PM-DECISION] §6 UX** — blocking-cold-start vs progressive vs the block-only-when-empty synthesis.
5. **[PM-DECISION] Sequencing** — this is **new scope outside the MVP build sequence** (current formal phase is Step 9, Vet report; Step 10 AI Signal follow-ups are live). Building this slips those. Is multi-device a now/next priority, or does it sit in the backlog (B-054) behind Step 9/10? *This is a roadmap call only the PM makes.*
6. **(Confirm)** Logout currently does **not** wipe local SQLite — confirm and treat FR-9 as a gate.

---

## 10. Out of scope / future (composes-with)

- **Realtime cross-device updates** (Supabase `postgres_changes` on the hydration target tables) — instant instead of on-foreground. Fast-follow on top of v1. Composes with **B-030** (per-incident AI realtime — same publication plumbing).
- **Household / linked accounts** — separate logins, a `pet_caregivers`/household join table, per-user attribution, invites. The "proper" multi-user model; a real feature in its own right. v1 deliberately rides the single shared login instead.
- **Per-user attribution / audit** ("logged by Sam") — depends on linked accounts.
- **Multi-pet** interplay — orthogonal, but the hydration engine should pull all of the account's pets' rows, not just the active pet, so switching pets doesn't trigger a fresh cold-start each time.

---

## 11. Persona sign-off (requirements stage)

- **Dir. of Engineering ✓** — hydration is the clean inverse of the existing push queue; reuses `useSync` triggers and the `INSERT OR REPLACE` + `synced` machinery. Flag: the `set_updated_at` trigger interaction (FR-5) is the one real architectural decision; don't build LWW without resolving it.
- **Data Scientist ✓ (conditional)** — conditional on FR-5 being decided and its failure mode *named*, not left implicit (this is the `useSync.ts:25` debt coming due). Reconciliation logic must be unit-tested.
- **Designer △** — supports the feature; **open conflict on the cold-start UX** (§6) needs a PM ruling before the UI is built. Empty/loading state is a Principle 5 deliverable, not an afterthought.
- **Trust & Safety / Privacy ✓ (gate)** — FR-9 (logout wipes local SQLite) is a **ship gate**, not optional, the moment a device can hold another caregiver's data.
- **Dr. Chen ✓** — the on-device picture an owner reviews pre-visit must match the full record the vet report renders; hydration closes that gap.
- **Jordan / Sam ✓✓** — this is the literal "my partner and I both log" story; high real-world value.
- **QA ✓** — AC set in §8; depends on **B-026** (jest) for AC-8 to be honestly satisfiable.

---

## 12. Phased delivery plan (build order)

This is the recommended build sequence — **four small PRs, not one big one.** The order is deliberate: the risk rises with each phase, and the *visible win* (a second device shows the history) lands in Phase 1, while the *unforgiving correctness work* is isolated in Phase 2 where it can get the heavy review it needs. Each phase is independently shippable and dogfoodable. Don't fold Phase 2 into Phase 1 — the happy-path demo looks identical, but the naive version loses edits in the field.

| Phase | Goal | Delivers | Risk | Depends on |
|---|---|---|---|---|
| **0** | Test harness exists | `npm test` runs jest | Low | — (closes **B-026**) |
| **1** | Second device shows the shared history | The "wife's phone" fix | **Low** | Phase 0 |
| **2** | No silent edit loss under two writers | Correctness | **Medium** (the careful one) | Phase 1 |
| **3** | Scale + delete-correctness | Polish | Low–Medium | Phase 2 |
| **4** *(post-v1, optional)* | Instant cross-device updates | Realtime | Low | Phase 3 |

### Phase 0 — Wire up the test runner (prerequisite)
**Why first:** the highest-risk logic in the app (sync reconciliation) cannot honestly ship untested, and jest isn't installed yet (`npm test` is a no-op — this is **B-026**). Cheapest single risk-reducer in the whole effort. Small.
- Add `jest` + `jest-expo` preset + `@testing-library/react-native`, a `test` script, and ideally wire the pre-push hook to run it.
- **Satisfies:** the precondition for AC-8 across every later phase.
- **Kickoff prompt:** _"Do B-054 Phase 0 per `docs/multi-device-sync-requirements.md` §12 — wire up jest (B-026): install jest-expo + testing-library, add the `test` script + config, confirm the existing `.test.ts` files run, and have the pre-push hook run `npm test`."_

### Phase 1 — Read-only cold-start hydration + the safety gate (the visible win)
**Why:** this is the PR that **literally fixes your wife's phone** — a device logs in and sees the account's full history. Deliberately *excludes* two-writer conflict cleverness to stay low-risk. Includes the logout-wipe gate because Phase 1 is the first moment a device holds shareable health data (pulled forward from the original Phase 2 framing — it removes the only Trust & Safety concern with shipping Phase 1, and it's small).
- **FR-1** `hydrateFromCloud()` in `lib/sync.ts` (mirror of the push functions) for `events`, `meals`, `event_attachments`, `vet_visits`, `vet_visit_attachments`.
- **FR-2** wire into `runSync()` with correct ordering (push-before-pull; events-before-meals). Naive guard only: **insert-if-absent, else replace-if-`remote.updated_at > local.updated_at`** — enough never to clobber an obviously-newer local row, but *not* yet the trigger-correct LWW (that's Phase 2).
- **FR-6** meals = insert-if-absent (immutable, no `updated_at`).
- **FR-7** soft-deleted events propagate for free (just another pulled column).
- **FR-9** logout clears local SQLite + cached photos (**Trust & Safety gate**).
- **FR-10** hydrated attachments render from Storage (signed URL), tolerating a missing `local_uri`.
- **Satisfies:** AC-1, AC-5, AC-6, and AC-2 for non-conflicting writes.
- **Risk:** Low. Additive; the existing push path is untouched; no conflict subtlety yet.
- **Dogfoodable:** ✅ Safe for you + your wife on your own phones once this lands.
- **Kickoff prompt:** _"Do B-054 Phase 1 per `docs/multi-device-sync-requirements.md` §12 — read-only cold-start hydration in `lib/sync.ts` + `useSync.ts` (FR-1, FR-2 ordering, FR-6, FR-7, FR-10) plus the FR-9 logout local-wipe gate. Naive remote-newer guard only; defer trigger-correct LWW to Phase 2. Unit-test the hydration + wipe logic."_

### Phase 2 — Conflict-correctness (the careful one)
**Why:** makes two-writer reconciliation actually correct, so an edit can never silently disappear. Small code, heavy thought, heavy tests, **mandatory adversarial review.** This is the phase the Dir. of Eng. wants reviewed hardest.
- **FR-4 / FR-5** resolve the `set_updated_at`-trigger LWW problem per the **[PM-DECISION]** in §9.1 (client-authored timestamp + migration, *or* documented server-time LWW). Implement and **name the failure mode** with a concrete two-device counterexample.
- **Satisfies:** AC-2 (full bidirectional), AC-3 (offline-edit not clobbered), AC-9 (adversarial review).
- **Risk:** Medium. This is where this codebase has lost time before; treat the happy-path demo as meaningless and lean on the unit tests + the `adversarial-reviewer` subagent.
- **Kickoff prompt:** _"Do B-054 Phase 2 per `docs/multi-device-sync-requirements.md` §12 — conflict-correct LWW (FR-4/FR-5). PM decision FR-5 = [(a) client-timestamp+migration | (b) server-time documented]. Unit-test the reconciliation, then run the adversarial-reviewer subagent on it per AC-9."_

### Phase 3 — Scale + delete-correctness
**Why:** stops two real but lower-urgency defects — re-pulling the whole history on every foreground, and hard-deleted meals lingering as ghost rows.
- **FR-3** incremental hydration via a per-table high-water mark (`last-pulled updated_at`).
- **FR-8** hard-deleted-meal reconciliation per the **[PM-DECISION]** in §9.2 (absence-reconciliation pass, or tombstone via **B-005**).
- **Satisfies:** AC-4 (no ghost rows), AC-7 (no full re-pull / no Home flicker).
- **Risk:** Low–Medium. Watermark off-by-one is the thing to test.
- **Kickoff prompt:** _"Do B-054 Phase 3 per `docs/multi-device-sync-requirements.md` §12 — incremental hydration watermark (FR-3) + hard-deleted-meal reconciliation (FR-8, PM decision = [absence-reconcile | tombstone]). Unit-test the watermark boundary."_

### Phase 4 — Realtime (post-v1, optional)
**Why:** upgrades pull-on-foreground to instant cross-device updates via Supabase `postgres_changes`. Layered *on top of* hydration (still need Phase 1–3 for cold-start backfill + offline catch-up). Shares the Realtime publication plumbing with **B-030**. Out of v1 scope (§10) — schedule only if instant updates prove worth it after dogfooding.

> **Designer × Engineer cold-start UX conflict (§6)** must be ruled by the PM **before Phase 1's UI is built** — it determines whether Phase 1 ships a blocking "Catching up…" state, progressive hydration, or the block-only-when-empty synthesis.

---

## Appendix — relationship to existing backlog

- **B-054** (this work) — the tracking row.
- **B-005** — smarter library deletes (tombstone meals) — the principled fix for FR-8.
- **B-026** — jest runner — gates AC-8.
- **B-030** — per-incident AI realtime — shares the Realtime publication plumbing the v2 fast-follow would use.
- **B-039** — account deletion Edge Function — adjacent Trust & Safety surface; FR-9 (local wipe) and B-039 (server cascade) together define "this device/account no longer holds the data."
