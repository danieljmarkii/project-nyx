# Per-Account Food Library — Requirements (B-354)

**Version:** 1.0 | 2026-07-16 | Status: build-ready pending the §9 PM ratifications
**Reads with:** `docs/food-library-redesign-requirements.md` (the surface being re-scoped), `docs/nyx-food-dedup-requirements.md` (the track this reshapes), `docs/nyx-account-deletion-requirements.md` (the survival rule this inverts), B-005 backlog row (the archive plan this unblocks).

---

## 1. Decision context

`food_items` was deliberately built as a **globally scoped shared catalog** — one of CLAUDE.md's two sanctioned no-`user_id` exceptions (food-library-redesign D1: "do not add `user_id` to `food_items`"). The bet was network-effect value: one owner scans a bag of Blue Buffalo, every owner logging the same product inherits it.

**PM direction (2026-07-16, this session):** the shared/standardized catalog remains the right *long-term* idea, but to ship in the near term the library goes **per-account**, expanding back toward shared/canonical if and when that's needed. This ratifies the team lean recorded in B-354 (surfaced during the B-005 planning session, Trust & Safety framing it a pre-launch privacy blocker).

Why the global catalog can't ship as-is:

- **Privacy (T&S — launch blocker):** any signed-in account sees every other account's foods in its picker (`refreshFoodCache` pulls all rows; RLS SELECT is `auth.role()='authenticated'`). A user's added foods are their pet's actual diet — health-adjacent data — exposed cross-tenant along with `created_by_user_id`. Food label photos in `nyx-food-photos` are equally cross-readable.
- **Integrity (B-343):** migration 004's permissive policies (`WITH CHECK (true)` / `USING (true)`) mean any authed user can INSERT or UPDATE **any** food row — one account's edit re-keys another account's food, and the correlations built on it.
- **UX (Designer / Jordan / Sam):** strangers' foods and typos in your picker fail the 10-second test; the library stops feeling like *your* pantry.
- **Data (Data Scientist):** per-account isolation removes cross-user metadata contamination of correlations and makes dedup within-account (cleaner n).

## 2. Current state (code-verified, 2026-07-16)

### 2.1 Schema & policies

- `food_items` (migration 001 + 007/010/014/019): no `user_id`; `created_by_user_id → auth.users ON DELETE SET NULL` is **attribution only**. `upc_barcode` is **globally UNIQUE** (007:17).
- RLS today: SELECT open to all authed (001:245); INSERT/UPDATE effectively unrestricted — 004's permissive policies OR with (and swallow) 001's creator checks; DELETE alone is creator-gated (009).
- `medication_items` is the **identical twin** (same global scope, same `created_by_user_id` pattern), carrying *drug names* — if anything a more sensitive exposure class than foods.
- Storage: `nyx-food-photos` INSERT/SELECT open to any authed user (008), paths keyed `{foodItemId}/{slot}.jpg` — **not** uid-prefixed.

### 2.2 Read/write paths

- `lib/sync.ts refreshFoodCache()` selects **all** of `food_items` (no filter) into the on-device `food_items_cache` (`lib/db.ts` — no owner column). Sign-out wipes the cache (`lib/hydration.ts LOCAL_WIPE_TABLES`); nothing else ever deletes cache rows — `ON CONFLICT DO UPDATE` never removes rows the server stops returning.
- Every picker/library/dedup read (`lib/foodQueries.ts`, `getRecentFoods`, Foods tab) reads the unscoped local cache.
- Writers: food-capture insert + commit upsert, food-detail edit (`app/food/[id].tsx` — the live B-343 path), two pre-sync upserts in `lib/sync.ts`, and the `extract-food-from-photo` Edge Function (service role, keyed on a **caller-supplied** `food_item_id` with no ownership predicate).
- `generate-signal` and `generate-report` read meal→food joins **through the caller's JWT/RLS** — they need no code change if every food a user's meals reference is a food that user owns.
- `delete-account` **deliberately preserves** `food_items` + `nyx-food-photos` ("another account's correlation query still resolves them" — plan.ts:37).

### 2.3 Live data (queried this session, read-only)

| Fact | Value |
|---|---|
| `food_items` rows | 56 — **all created by one account**; 0 null-creator rows |
| `medication_items` rows | 2 — same single creator |
| Accounts | 4 (one real household account; the rest test accounts with no catalog writes) |
| Cross-account references (meals / diet_trials / feeding_arrangements → another account's food) | **0 / 0 / 0** (624 meal→food refs total, all same-account) |

**Consequence:** the backfill is trivial — `owner = created_by_user_id` covers every row, no cloning, no repointing, no orphaned joins. This is the cheapest this migration will ever be; it gets strictly harder with every new account.

## 3. Team deliberation

No unresolved persona conflicts — the direction was near-unanimous at B-005 planning and the PM has now set it. Positions recorded:

- **Trust & Safety:** per-account scoping + private storage closes the cross-tenant exposure. The re-scoping migration and the storage policy change are **`rls-privacy-reviewer` mandatory**. Insists `medication_items` rides the same track (same class, worse content). Flags the **legal ripple**: terms §3 grants a "perpetual, irrevocable" cross-user catalog license that survives account deletion, and the privacy policy names the shared catalog as "the one thing that survives" — both become false statements the day this ships (§7.4).
- **Dir. of Engineering:** scope **in place** on `created_by_user_id` rather than adding a redundant `owner_user_id` — deployed clients already write `created_by_user_id` on every insert/upsert path, so keeping the column name is the zero-breakage choice; add `NOT NULL` + `DEFAULT auth.uid()` and flip the FK `SET NULL → CASCADE`. A parallel-named owner column that must always equal the creator is two names for one fact. The 004 permissive policies must be **dropped**, not merely supplemented — same-command policies OR together, so any new restrictive policy is dead until 004's are gone.
- **Data Scientist:** per-account shrinks the canonicalization pool (`canonicalizeProtein` ranking sees one account's foods) — acceptable; correlations were always per-pet, and the exposure set only ever came from that pet's own meals. Confirms the signal/report Edge Functions need **no logic change** given the 0-cross-reference reality, but wants that asserted by a fixture, not assumed. Dedup (B-009/B-018) becomes *within-account* — strictly easier (§7.2).
- **Dr. Chen:** one invariant — **no historical join may degrade.** A meal logged last month must render the same food name in the vet report after the migration. Guaranteed by construction here (backfill = attribution, 0 cross-refs), but AC-5 makes it explicit.
- **Designer / Jordan / Sam:** the picker becomes *your* pantry — strictly better. New accounts start with an empty library; the existing designed empty states (onboarding food entry, picker empty state) already cover this — verify, don't rebuild. No new UI in this track (B-005's Archived section comes after).
- **Product Owner:** ripples routed in §7 — B-343 closes by construction, B-009/B-018 rescope, B-005 unblocks, B-292 (household) noted as the future scope-unit question, the food-dedup spec's parked "multi-user merge authorization" question dissolves.
- **Sr. QA:** the state matrix is account-pairs — the acceptance criteria (§8) must be exercised with **two real accounts**, not one.

## 4. Requirements

### FR-1 — Ownership scope on the catalog tables
`food_items.created_by_user_id` becomes the ownership scope: `NOT NULL`, `DEFAULT auth.uid()`, FK re-pointed `ON DELETE SET NULL → ON DELETE CASCADE`. Same treatment for `medication_items` (D2). Semantics documented in-migration: *created it = owns it = the only account that can see it*.

### FR-2 — RLS rewrite (default-deny to other accounts)
- **Drop** 004's two permissive policies.
- Replace all four commands on `food_items` (and `medication_items`) with `created_by_user_id = auth.uid()` (SELECT/UPDATE/DELETE `USING`, INSERT `WITH CHECK`).
- This also closes **B-343's client half** for free: the food-detail edit can no longer touch another account's row.

### FR-3 — UPC uniqueness goes per-account
Global `UNIQUE (upc_barcode)` → `UNIQUE (created_by_user_id, upc_barcode)`. Two households scanning the same bag each get their own row (that's the model now); one household scanning the same bag twice still collides into B-009's dedup flow, which becomes purely within-account.

### FR-4 — Storage re-scope (`nyx-food-photos`)
Bucket reads/writes scoped to the owner of the food the path names. Paths are `{foodItemId}/…`, so the policy is an ownership subquery: first path segment must be a `food_items.id` whose `created_by_user_id = auth.uid()` (INSERT `WITH CHECK` + SELECT `USING`). Edge Functions (service role) are unaffected. Same-class treatment for the medication photo bucket if its policies are similarly open (verify at build). *Alternative rejected:* migrating paths to `{uid}/{foodId}/…` moves live objects for no gain — the subquery policy is additive and object-stable.

### FR-5 — Client cache scoping + one-time flush
- `refreshFoodCache` filters to the account (`.eq('created_by_user_id', uid)`) — belt-and-braces with RLS, and self-documenting.
- **One-time `food_items_cache` truncate** on first launch after the migration (cache-version bump): RLS starting to filter rows does NOT remove already-cached foreign rows from SQLite — without the flush, other accounts' foods linger in the picker indefinitely. Same for the medication cache if mirrored.

### FR-6 — Edge Function ownership gate (`extract-food-from-photo`)
The service-role UPDATE keyed on caller-supplied `food_item_id` gains an ownership predicate: JWT-verified uid (already derived since T2-3) must equal the row's `created_by_user_id`. Closes **B-343's server half**. The UPC-collision retry path (B-009 null-drop) now collides only within-account. Same gate on `extract-medication-from-photo` if it writes its catalog row by caller-supplied id.

### FR-7 — Account deletion flips from preserve to purge
Per-account foods are the user's data: `delete-account` stops exempting `food_items` + `nyx-food-photos` (FR-1's CASCADE handles rows; the Storage purge adds the food-photo prefixes). Inverts `nyx-account-deletion-requirements.md` FR-4/AC-5 (Tier-2 edit, §7.4). Fold-in matches the existing `medication_items` photo-purge pattern already coded in `plan.ts`.

### FR-8 — No degradation of history, analytics, or the vet report
Every historical meal/diet-trial/arrangement join resolves identically post-migration (guaranteed by the 0-cross-ref backfill; asserted by AC-5). `generate-signal` / `generate-report` ship **no logic change** — verified by fixture, not assumption.

### FR-9 — The future shared catalog is not foreclosed
The long-term standardized catalog returns as a **separate curated/canonical layer** (the same explicit future refactor already recorded for `medication_items` in the med-logging spec D2) — e.g. a read-only `canonical_food_items` table user rows can reference — **never** by un-scoping user-created rows back to global. Recorded as design intent; no build now.

## 5. Explicitly out of scope

- **B-005 build** (archive/restore + Archived section) — unblocked by this, sequenced after (§6).
- **Dedup builds** (B-009/B-018) — reshaped by this (§7.2), not delivered by it.
- **Household/shared-care scoping (B-292)** — scope unit stays *account*; if the household primitive lands, the owner predicate becomes membership-based in that track, not this one.
- **Curated canonical catalog / re-globalization** (FR-9) — future track.
- **`food_item_overrides`** (food-library-redesign D8) — mooted while per-account (your row is yours to edit); revisit only with the canonical layer.

## 6. B-005 interplay (PM-directed consideration)

The B-005 plan (ratified 2026-07-16: archive-not-delete, `archived_at` flag, Archived section + Restore + undo, filter at picker/library reads only — never history/analytics/report joins) **assumed a global catalog and had to invent per-user archive semantics**. Per-account dissolves that:

- `archived_at` on an account-scoped row **is** per-user by construction — no `archived_by_user_id`, no join table, no per-user override layer. B-005's PR 1 shrinks to one nullable column + cache column + reads filter.
- The B-005 invariant (archive filters only picker/library reads) is unchanged and composes cleanly: `archived_at` and ownership are orthogonal predicates.
- **Sequence stands: B-354 → B-005.** Bundling `archived_at` into the B-354 migration was considered and rejected — the re-scoping migration is the highest-blast-radius change in this track and should carry nothing optional (Engineer; migration-isolation discipline).
- Today's delete cascade (`app/food/[id].tsx` — hard-delete food + soft-delete referencing events) survives B-354 untouched but becomes account-scoped; B-005 then replaces it as the primary "remove from library" affordance.

## 7. Ripples

### 7.1 CLAUDE.md (Tier 1 — edited this session)
The engineering hard constraint "two sanctioned global exceptions (`food_items`, `app_config`)" is rewritten: **`app_config` is the sole sanctioned global table**; `food_items`/`medication_items` are per-account (this doc). No new code may assume the global catalog.

### 7.2 Dedup track (B-009 / B-018 / food-dedup spec)
- Match-and-steer, UPC collision, and merge all become **within-account** — the parked §5.3 "who may merge a global food?" multi-user-authorization question **dissolves by construction** (merge only ever touches your rows).
- The spec's global-scope premises (§2b, §2e "entire global catalog" mirror) need a reconciliation pass (Tier-2, flagged).

### 7.3 Resolved / reshaped backlog rows
- **B-343** — closed by FR-2 + FR-6 when they ship (ownership predicate now exists).
- **B-005** — unblocked; plan simplifies (§6).
- **B-009/B-018** — within-account rescope noted on the rows.
- **B-292** — future scope-unit note (§5).

### 7.4 Legal + deletion docs (Tier 2 — PM confirmation, then republish hosted docs)
- `terms-of-service.md` §3: the shared-catalog license paragraph (perpetual/irrevocable, "available to all Culprit users," survives deletion) is **removed/rewritten** — contributions are per-account content covered by the standard operating license, deleted with the account. §4's "harvest the shared food catalog" line adjusts.
- `privacy-policy.md`: the three shared-catalog passages (incl. "the one thing that survives") rewritten to match FR-7.
- `nyx-account-deletion-requirements.md` FR-4/AC-5 inverted per FR-7.
- **Timing:** the hosted docs are live but pre-launch with no external users; the rewrite must land **before** first submission and ideally rides the same window as the B-354 deploy so the docs never describe a catalog that no longer exists.

## 8. Acceptance criteria

- **AC-1** Two-account isolation: account B's picker, Foods tab, food detail, and search show **only** account B's foods — including on a device that was signed in *before* the migration (cache flush verified).
- **AC-2** Writes scoped: account B cannot read, update, or delete account A's food row (direct PostgREST attempt fails RLS), and `extract-food-from-photo` refuses a `food_item_id` owned by another account.
- **AC-3** Storage scoped: account B cannot fetch account A's food label photo (signed-in storage GET fails); the extractor still reads via service role.
- **AC-4** UPC: the same barcode can exist under two accounts; a within-account duplicate still routes to the existing collision path.
- **AC-5** History intact: pre-migration meals/diet-trials/arrangements resolve the same food names post-migration; a regenerated vet report over a pre-migration window is byte-equivalent in its food labels; the Signal's exposure set is unchanged for the real household account.
- **AC-6** Deletion: deleting an account removes its foods + food photos; no other account's data is touched (`rls-privacy-reviewer` attack pass).
- **AC-7** New account: empty library renders the designed empty states; first food add works end-to-end (capture → extraction → picker).

## 9. Decisions

| # | Decision | Status |
|---|---|---|
| D1 | Per-account direction (library scoped to account; shared catalog is a future curated layer) | **PM-ratified 2026-07-16** (this session's directive) |
| D2 | `medication_items` rides the same track — same migration PR, same RLS/storage/deletion treatment | **PM-ratified 2026-07-16** ("we need to bundle meds into this as well") |
| D3 | Scope in place on `created_by_user_id` (NOT NULL + DEFAULT `auth.uid()` + CASCADE), no new column | Build-time (Dir. of Eng call) — recommend-and-proceed |
| D4 | Deletion flips preserve→purge + terms §3 / privacy-policy rewrite + hosted-doc republish | **PM-ratified 2026-07-16** (small rewrite acknowledged; republish stays a PM action at PR 5) |
| D5 | Re-globalization only ever via a separate curated canonical layer, never un-scoping user rows | Recorded intent (FR-9) — PM acknowledge |
| D6 | B-354 precedes B-005; `archived_at` deliberately NOT bundled into the re-scoping migration | **PM-ratified 2026-07-16** (back-to-back B-354 → B-005 workflow) |

## 10. PR plan

| PR | Contents | Gates |
|---|---|---|
| 1 | **Schema migration** (own PR): FR-1 + FR-2 + FR-3 + FR-4 storage policies, `food_items` + `medication_items`. Backfill defensive no-op (data is clean; assert with a pre-check). Applied via Supabase MCP + `get_advisors`. | Migration Safety Pre-flight (destructive=`n` — additive constraints + policy swaps; rollback = restore prior policies/FK); **`rls-privacy-reviewer` mandatory** |
| 2 | **Client**: `refreshFoodCache` filter + cache-version truncate (FR-5); no picker/UI changes | code-reviewer; two-account QA (AC-1) |
| 3 | **`extract-food-from-photo` ownership gate** (FR-6) + med twin; deploy via MCP | rls-privacy-reviewer; deno tests |
| 4 | **`delete-account` purge flip** (FR-7); deploy | rls-privacy-reviewer; deletion-requirements doc edit flagged Tier-2 |
| 5 | **Docs/legal**: terms + privacy rewrite (PM-confirmed), dedup-spec reconciliation, technical-spec + food-library-redesign D1 updates | PM confirms each Tier-2 edit; PM republishes hosted docs |

Order matters: PR 1's RLS must land **with or before** PR 2 (an old client selecting unfiltered simply receives fewer rows — safe), and PR 3/4 are independent of PR 2. `generate-signal`/`generate-report`: **no PR** (FR-8).

## 11. Open questions routed to the PM

**All resolved 2026-07-16 (same day):** D2 ratified (meds bundle into PR 1), D4 ratified (deletion flip + the small legal rewrite; hosted-doc republish stays a PM action at PR 5), D6 ratified (B-354 → B-005 back to back). D5 remains recorded intent (FR-9). **PR 1 is ready to build.**
