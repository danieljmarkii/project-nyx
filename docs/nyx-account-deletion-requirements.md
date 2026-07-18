# In-App Account Deletion (B-039) — Requirements

**Status:** Shipped. Gating decision resolved 2026-06-19 (hard-delete — see §9).
**Backlog:** B-039 (priority **Now**, App Store hard blocker).

> **B-354 amendment (2026-07-17, PR 4 shipped #381 / PR 5 doc reconciliation).** `food_items` + `nyx-food-photos` were de-globalized to **per-account** ownership (`docs/nyx-per-account-food-library-requirements.md`, FR-1/FR-7). A user's foods and food-label photos are now their own data, so account deletion **purges** them instead of preserving them. This inverts the original FR-4 + AC-5 (and the §2a FK, the §7 edge case, the §9 default, and the §11 sign-off), all corrected inline below and marked **[B-354]**.
**Build phase:** Independent of the formal build sequence; a launch gate that must land before App Store submission. File-disjoint from Step 9 (vet report) — parallelizable as its own session/branch.

---

## 1. Problem & Vision

**Apple App Store Guideline 5.1.1(v):** any app that supports account *creation* must let the user *initiate account deletion from within the app*. Not deactivation, not a "email us to delete" link — an in-app path that erases the account. Nyx has email signup (Apple Sign-In planned), so this is a **hard rejection blocker**, not polish.

The same act satisfies **GDPR Art. 17** (right to erasure). The vision is simple and honest: a user can, from inside Nyx, permanently delete their account and everything Nyx holds about them and their pets — and we can say truthfully that it is *gone*, not merely hidden.

### 1.1 This is a legal/compliance gate, not a feature
There is no growth or UX upside here — the entire value is "we are allowed to ship, and we keep our word about deletion." That framing governs every decision below: bias toward *honest, complete, irreversible* erasure over cleverness.

---

## 2. Background — what the codebase already gives us (evidence)

Two findings from reading the schema (migrations `001`–`019`) shape the whole design:

**(a) The FK graph already cascades from `auth.users`.** Every user-data table hangs off `auth.users` or `pets` with `ON DELETE CASCADE`, so deleting the one `auth.users` row tears down the entire tree automatically:

| Table | FK → parent | On delete | Migration |
|---|---|---|---|
| `user_profiles` | `id → auth.users(id)` | **CASCADE** | 001 |
| `pets` | `user_id → auth.users(id)` | **CASCADE** | 001 |
| `vet_reports` | `generated_by → auth.users(id)`, `pet_id → pets(id)` | **CASCADE** | 001 |
| `conditions` | `pet_id → pets(id)` | **CASCADE** | 001 |
| `events` | `pet_id → pets(id)` | **CASCADE** | 001 |
| `meals` | `event_id → events(id)`, `pet_id → pets(id)` | **CASCADE** | 001 |
| `diet_trials` | `pet_id → pets(id)` | **CASCADE** | 001 |
| `vet_visits` | `pet_id → pets(id)` | **CASCADE** | 001 |
| `event_attachments` | `event_id → events(id)`, `pet_id → pets(id)` | **CASCADE** | 003 |
| `vet_visit_attachments` | `vet_visit_id → vet_visits(id)`, `pet_id → pets(id)` | **CASCADE** | 003 |
| `ai_signals` | `pet_id → pets(id)` | **CASCADE** | 005 |
| `event_ai_analysis` | `event_id → events(id)`, `pet_id → pets(id)` | **CASCADE** | 013 |
| `feeding_arrangements` | `pet_id → pets(id)`, `food_item_id → food_items(id)` | **CASCADE** | 018 |
| `food_items` | `created_by_user_id → auth.users(id)` | ~~**SET NULL**~~ → **CASCADE** **[B-354]** | 001 → 033 |

Verified: **no FK to `auth.users` uses `RESTRICT`/`NO ACTION`**, so nothing blocks `auth.admin.deleteUser`. **[B-354]** `food_items` was originally the deliberate exception — globally scoped (no `user_id`), surviving with attribution nulled — but migration 033 re-scoped it per-account and flipped the FK to `ON DELETE CASCADE`, so the user's food rows now tear down with the account like every other table. `medication_items` got the same treatment. **Consequence: hard-delete needs NO new schema and NO table-by-table delete loop in app code** — the database does it.

**(b) Soft-deleted events get hard-purged for free.** `events` use `deleted_at` (soft delete, never `DELETE` — a CLAUDE.md hard constraint). The cascade deletes those rows regardless of `deleted_at`, so account deletion is the one documented place the soft-delete-only rule yields to a legal hard-delete. No special handling.

**(c) The local-wipe already exists.** B-054's FR-9 logout-wipe (`clearLocalData()` in `lib/db.ts`, fired on the `SIGNED_OUT` auth event in `app/_layout.tsx`) deletes on-device attachment files and clears every synced table. Post-deletion we just sign out and this runs — no new client teardown code.

**(d) The service-role Edge Function pattern exists.** `supabase/functions/analyze-vomit/index.ts` already builds a dual client — a `userClient` from the caller's JWT and an `adminClient` from `SUPABASE_SERVICE_ROLE_KEY` (already provisioned, Secrets Register). B-039 reuses this shape exactly.

---

## 3. Scope

### In scope (v1)
- A discoverable, non-buried **"Delete account"** affordance inside the app (profile → Account section).
- A **destructive confirmation** flow with type-to-confirm and honest, dark-pattern-free copy.
- A **`delete-account` Edge Function** (service role) that purges the user's Storage objects and then deletes the `auth.users` row (firing the DB cascade).
- **Post-deletion sign-out** that reuses the FR-9 local wipe.
- An **offline guard** so the action never reports false success without a connection.

### Out of scope (v1 — tracked separately, see §10)
- Re-authentication before deletion (hardening — B-119).
- Apple Sign-In token revocation (B-119) — required by Apple *only once Apple Sign-In ships*.
- Periodic orphaned-Storage sweep (defense-in-depth — B-120).
- A grace period / "deactivate instead" / undo window — v1 is immediate, honest, irreversible (Apple permits a *disclosed* delay; we choose not to retain).
- Data export (B-041) — the inverse operation; shares the service-role architecture but is a separate item and **not** an App Store gate.

---

## 4. Personas & user stories

- **Trust & Safety / Privacy (lead):** "If Apple's reviewer — or the user — asks how everything we hold is erased, I can answer: the row is gone, the photos are gone." Owns the completeness and honesty of the erasure.
- **Jordan (owner):** "I want to be able to leave and take my data with me / make it disappear — without hunting for the button, and without nuking six weeks of Mochi's trial with one sloppy 3am tap."
- **Dir. of Engineering:** "Lean on the cascade the schema already has; keep the new surface area to one Edge Function + one screen section."
- **Designer:** "Reachable, clear, irreversible, no dark patterns — Apple scrutinizes the confirmation as hard as the feature's absence."
- **Dr. Chen:** N/A clinically, but the health photos are exactly the sensitive data the erasure must actually remove from Storage.

---

## 5. Functional requirements

### 5.1 The `delete-account` Edge Function (core)
- **FR-1 — service-role dual client.** New `supabase/functions/delete-account/index.ts`, mirroring `analyze-vomit`: a `userClient` (caller JWT) to authenticate, an `adminClient` (`SUPABASE_SERVICE_ROLE_KEY`) for privileged ops. CORS + `OPTIONS` preflight per the existing functions.
- **FR-2 — identity from the JWT, never the body.** Resolve `userId` from the verified caller token only. The function takes **no** user/pet id from the request body. A caller can delete only *themselves*. (Confused-deputy guard — the rls-privacy-reviewer's first attack.)
- **FR-3 — collect Storage paths BEFORE any delete.** Using the admin client, gather every Storage object owned by `userId`, scoped strictly through `pets.user_id = userId`:
  - `nyx-pet-photos` ← `pets.photo_path` for the user's pets
  - `nyx-event-attachments` ← `event_attachments.storage_path` for the user's pets
  - `nyx-vet-attachments` ← `vet_visit_attachments.storage_path` for the user's pets
  - vet-report PDFs ← `vet_reports.storage_path` for the user's pets *(forward-looking; the bucket lands with Step 9 — tolerate its absence today)*

  Paths are derived only from rows the user owns — **never** from client input. This must run before the cascade, which will destroy the rows that hold these paths.
- **FR-4 [B-354] — `nyx-food-photos` IS purged.** *(Inverted by B-354 FR-7 — was "NOT purged" while the catalog was global.)* Food-label photos now belong to the deleting account's per-account `food_items` rows, so they are the user's own data and must be removed with the account. Collect them alongside the other buckets (FR-3): the food-photo paths come from `food_items.photo_paths` for rows where `created_by_user_id = userId`, and every path is kept only if its first folder segment is a `food_items.id` **this user created** (`scopeFoodPaths` — a by-hand port of the migration-033 food-photo SELECT RLS, so a crafted `photo_paths` value can't name another account's object; empty owned-id set fails closed). The `food_items` **rows** themselves are torn down by the FR-1/033 CASCADE; FR-5 removes the Storage objects. *(The medication-photo bucket follows the same already-coded pattern.)*
- **FR-5 — purge Storage (best-effort, collect failures).** Remove the FR-3 objects per bucket. Aggregate failures; do not abort the run on a single missing/failed object.
- **FR-6 — delete the auth user LAST.** Only after the Storage purge, call `adminClient.auth.admin.deleteUser(userId)`. This fires the FK cascade (§2a) that erases all DB rows. Deleting last makes the operation **idempotent and retryable**: a failed/partial run leaves the account intact and re-runnable (paths can be re-collected), so no health photos are orphaned with their DB references already cascaded away.
- **FR-7 — honest result.** Return `{ ok: true }` only when the auth user is deleted. On failure, return a non-200 the client surfaces as "couldn't finish — try again," never a false success.

### 5.2 Client — entry point & confirmation
- **FR-8 — discoverable, not buried (the surface already exists).** The profile tab (`app/(tabs)/profile.tsx`) already renders an **"Account" card** at the bottom (`{/* ── Account ── */}`, ~L424) holding a single **"Sign out"** row (`accountRow`/`accountRowText`). Add **"Delete account" as a second row beneath Sign out in that same card** — text in `theme.colorDestructive` (vs Sign out's muted `colorTextSecondary`) so it reads destructive. No new screen or section to build; the surface is already labeled "Account" and reachable (satisfies Apple's "not buried"). Theme tokens only; `hitSlop` to ≥44pt. **NOTE:** Sign out uses a lightweight native `Alert.alert` confirm (`handleSignOut`, ~L255); **Delete account does NOT reuse it** — it routes to the heavier type-to-confirm flow (FR-9), because the consequence is irreversible.
- **FR-9 — single destructive confirmation, no modal-on-modal.** One confirmation surface stating the consequence plainly, requiring the user to **type `DELETE`** to enable the destructive action. No pre-checked "deactivate instead," no guilt copy, no hidden button. (Apple dark-pattern scrutiny.)
- **FR-10 — copy via nyx-voice.** First-person-pet / second-person-owner, no exclamation, plain, honest about permanence. Draft: *"Delete your account — This removes your account and everything you've logged for {petName}. Their health history can't be recovered, and this can't be undone."* (For multiple pets: "…everything you've logged for your pets.")
- **FR-11 — offline guard.** If offline, the destructive action is disabled with an honest message ("You'll need a connection to delete your account"); it never reports success offline.

### 5.3 Post-deletion teardown
- **FR-12 — sign out → reuse FR-9 wipe.** On `{ ok: true }`, call `supabase.auth.signOut()`. The existing `SIGNED_OUT` handler (`app/_layout.tsx`) runs `clearLocalData()` + `clearPersistedActivePetId()` + `petStore.reset()` and routes to auth. No new local-teardown code. Show a brief honest confirmation on the auth screen.

---

## 6. UX requirements
- Destructive styling (theme `danger` token) on the row and the final action only.
- The confirm action is **disabled until** the user types `DELETE` exactly.
- A pending/in-flight state on the confirm button; deletion is a network round-trip.
- After success: routed to the auth/sign-in screen, no residual pet data visible.

---

## 7. Edge cases (QA)
- **Offline at deletion** → action guarded; no false success (FR-11).
- **Partial Storage failure** → auth user not deleted; account re-runnable (FR-6); user sees retryable error.
- **In-flight sync queue** at deletion → irrelevant; cascade removes the server target and the local wipe clears the queue.
- **Second device on the same account** (post-B-054) → its session token is now invalid → next call 401 → treated as signed-out → local wipe. No stale access.
- **User's food contributions [B-354]** → `food_items` rows + `nyx-food-photos` are the user's per-account data now → deleted with the account (033 CASCADE + Storage purge). No other account references them (0 cross-account refs).
- **Re-signup with the same email** → a clean new account; no resurrected data.
- **No pets yet / empty account** → deletion still works (no rows to cascade; auth user + `user_profiles` removed).
- **Network drop after auth-user delete but before client learns** → account is gone; stale token 401s on next call → signed-out path. Acceptable.

---

## 8. Acceptance criteria (QA — paste verbatim at Build Step Kickoff)
- **AC-1.** A "Delete account" affordance is reachable from within the app (profile → Account), not buried — satisfies Apple 5.1.1(v).
- **AC-2.** The confirmation requires typing `DELETE`; copy states permanence; no dark patterns (no pre-checked deactivate, no hidden button, no guilt copy).
- **AC-3.** On confirm, the auth user is deleted and all DB rows cascade away — verify in the Supabase dashboard that `pets`, `events`, `meals`, `conditions`, `diet_trials`, `vet_visits`, `vet_reports`, `event_attachments`, `vet_visit_attachments`, `ai_signals`, `event_ai_analysis`, `feeding_arrangements`, `user_profiles` hold **0 rows** for that user.
- **AC-4 [B-354].** The user's objects in `nyx-pet-photos`, `nyx-event-attachments`, `nyx-vet-attachments` (and vet-report PDFs, when Step 9's bucket exists) **and `nyx-food-photos`** are removed. *(Was: `nyx-food-photos` untouched.)*
- **AC-5 [B-354].** `food_items` rows the user created are **deleted** by the 033 CASCADE, and their label photos are purged from `nyx-food-photos`; because the catalog is per-account with **0 cross-account references** (B-354 §2.3), no other account's correlation query ever pointed at them. *(Was: rows survive with `created_by_user_id = NULL`, resolvable by another account.)*
- **AC-6.** After success the client signs out and local SQLite is wiped (FR-9 reuse) — relaunch shows the auth screen with no residual data.
- **AC-7.** A user can only delete their own account — identity from the JWT, never the request body.
- **AC-8.** Offline, the delete action is guarded and never reports false success.
- **AC-9.** `delete-account` is idempotent/retryable — auth user deleted last; a simulated partial Storage failure leaves the account re-runnable with no orphaned health photos.
- **AC-10 (privacy backstop, mandatory).** The `rls-privacy-reviewer` subagent is run on the `delete-account` diff and reports the concrete attacks it tried (cross-user delete via body id; Storage path-scope widening; confused-deputy) and that each boundary held. A bare ✓ is not sign-off.
- **AC-11.** Unit tests cover the pure path-collection/scoping logic; `deno check` + the test suite pass.

---

## 9. Open questions / PM decisions consolidated
- **[RESOLVED 2026-06-19] Cascade strategy = hard-delete.** Resolves the long-open GDPR-cascade Open Question. Rationale: ~all data is pet-health, not classic PII, so anonymization buys nothing legally and would need a migration; hard-delete is the cleaner Art. 17 story and the schema already cascades. Documented exception to the soft-delete-only constraint. Team rec unanimous (Trust & Safety lead).
- **[RESOLVED 2026-07-16 — inverted by B-354] Food catalog treatment (FR-4).** Originally kept `food_items` + `nyx-food-photos` (attribution nulled) on the "global catalog" architecture. B-354 de-globalized the catalog to per-account, so the PM ratified flipping preserve→purge: the user's foods + food photos are now deleted with the account (D4, `docs/nyx-per-account-food-library-requirements.md` §9). Shipped in PR 4 (#381).
- **[DEFAULT] Confirmation friction (FR-9).** Type-to-confirm `DELETE`; full re-auth deferred to B-119.
- **[DEFAULT] No grace period.** v1 is immediate and irreversible; no deactivate-instead, no undo window.

---

## 10. Out of scope / future (composes-with)
- **B-119** — re-authentication before account deletion (hardening; defends the unlocked-stolen-phone threat type-to-confirm doesn't).
- **B-120** — Apple Sign-In token revocation on deletion (`POST /auth/revoke`); **Apple-required once Apple Sign-In ships** — gate it to that work.
- **B-121** — periodic orphaned-Storage sweep (defense-in-depth for objects left by a partial purge).
- **B-041** — data export (GDPR Art. 20); inverse operation, shares the service-role Edge Function architecture.
- **B-002** — pre-prod readiness checklist; this is one of its line items.

---

## 11. Persona sign-off (requirements stage)
- **Trust & Safety / Privacy ✓✓** (lead) — hard-delete is honest erasure; FR-2/FR-3 scoping and AC-10 backstop guard the service-role surface.
- **Dir. of Engineering ✓** — cascade does the work; one Edge Function + one screen section; no schema; soft-delete-constraint override flagged on the record.
- **Designer ✓** — discoverable, single destructive confirm, no dark patterns, theme tokens.
- **Jordan ✓** — type-to-confirm is the right friction; honest "can't be undone" copy.
- **Data Scientist ✓** — ~~global `food_items` rows/queries survive cleanly~~ **[B-354]** per-account `food_items` rows + food photos purge cleanly with 0 cross-account references (FR-4, AC-5).
- **QA ✓** — edge cases + ACs enumerated; idempotency AC-9 is the one to actually exercise.
- **Dr. Chen — N/A** (no clinical read; health photos covered by the Storage purge).

---

## 12. Phased delivery plan (build order)

No schema migration. Two PRs, backend first so the function is deployed and curl-verified before any UI calls it.

### PR 1 — `delete-account` Edge Function (backend)
- **FR-1 … FR-7.** New `supabase/functions/delete-account/index.ts` (dual client) + a pure, unit-tested module for path collection/scoping and delete ordering (the `detection.ts`/`phrasing.ts` split). `deno check` clean.
- **DoD:** AC-7, AC-9, AC-11 covered by tests; **AC-10 — run `rls-privacy-reviewer` on the diff** (mandatory; report the attacks tried). PM deploys the function (CLI or dashboard) and curl-verifies AC-3/AC-4 against a throwaway test account before PR 2.
- **Kickoff prompt:** _"Build B-039 PR 1 per `docs/nyx-account-deletion-requirements.md` §12 — the `delete-account` Edge Function (FR-1…FR-7): service-role dual client (mirror `analyze-vomit`), userId from JWT only, collect the user's Storage paths (pet photos + event/vet attachments + vet-report PDFs; NOT `nyx-food-photos`) before any delete, best-effort purge, then `auth.admin.deleteUser` LAST for idempotency. Extract a pure path/order module + unit-test it. Then run the `rls-privacy-reviewer` subagent on the diff per AC-10."_

### PR 2 — Client deletion UX
- **FR-8 … FR-12.** Profile "Account" section + type-to-confirm destructive flow + offline guard + nyx-voice copy + post-success `signOut()` reusing the FR-9 wipe.
- **DoD:** AC-1, AC-2, AC-6, AC-8; Designer + Jordan sign-off on the confirm flow + copy; on-device QA (delete a throwaway account end-to-end, confirm relaunch is clean).
- **Kickoff prompt:** _"Build B-039 PR 2 per `docs/nyx-account-deletion-requirements.md` §12 — the client deletion UX (FR-8…FR-12): add a `colorDestructive` 'Delete account' row to the EXISTING Account card at the bottom of `app/(tabs)/profile.tsx` (beneath the Sign out row), with a destructive type-to-confirm `DELETE` flow (no dark patterns), an offline guard, nyx-voice copy, and a post-success `supabase.auth.signOut()` that reuses the B-054 FR-9 local wipe. Verify a full delete on a throwaway account on-device."_

---

## Appendix — relationship to existing backlog
- **B-039** (this) — the feature.
- **B-041** — data export; inverse op, shared architecture, separate item, *not* an App Store gate.
- **B-002** — pre-prod checklist; B-039 is a line item.
- **B-054** — multi-device sync shipped the FR-9 logout-wipe this reuses, and the second-device-token edge case.
- **B-119 / B-120 / B-121** — deferred hardening spun out of this plan (re-auth, Apple token revocation, orphaned-Storage sweep).
- **GDPR-cascade Open Question** (CLAUDE.md) — resolved by §9 (hard-delete).
