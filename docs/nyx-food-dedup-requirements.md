# Food Deduplication & Merge — Requirements

**Status:** Build-ready DRAFT (awaiting PM ratification). Direction aligned with the product team 2026-06-24.
**Backlog:** converges three existing rows — **B-009** (UPC-collision prevention), **B-018** (same brand+product dupes: dedup-on-insert + merge), **B-005** (tombstone-not-cascade deletes). Not net-new scope.
**Build phase:** Parallel track — food library / intake. File-disjoint from Step 9 (vet report) and Step 10 (AI Signal); parallelizable as its own session/branch (only `STATUS.md` collides at wrap).

> **ID note (read first):** "B-142" was renamed to **B-158** (medication *Ongoing* vs fixed-course framing) and "B-162" is the migration-history backfill — **neither is the food-dedup item.** The work is B-009 / B-018 / B-005. This spec is the single home for the direction; those rows now point here.

---

## 1. Problem & Vision

As an owner uses Nyx, duplicate `food_items` accumulate: they forget a food is already in the library and add it again, an AI capture creates a fresh row for a food that already exists, or the same product gets typed two slightly different ways. Duplicates are not cosmetic — they fracture the clinical record (intake history and protein correlation split across two rows) and they put an arbitrary `food_type` in front of the engine and the vet report.

The vision has **two parts**, deliberately sequenced:

1. **Prevention** — the system is smart enough to know a food already exists and steers the owner to it *before* a duplicate is created.
2. **Merge** — for the duplicates that already exist (or that prevention misses), an owner can merge them: the survivor is kept, the loser's history is **repointed, never deleted**, so historical feedings still read as the survivor food.

**Non-negotiable from the PM:** we never just *delete* a duplicate. Duplicates are attached to real events (feedings, diet-trial meals); that data is preserved by repointing it to the survivor, then tombstoning the loser.

### 1.1 The reframe that shapes the design — the library already masks exact duplicates

`LIBRARY_FOODS_QUERY` (`lib/foodQueries.ts:19`) and the picker both `GROUP BY LOWER(brand), LOWER(product_name)`. Two consequences govern everything below:

- **Exact duplicates are *latent*, not visible.** Two captures of "Fancy Feast Chicken" already show as **one tile**. So the duplicates an owner will *see and want to merge* are **textual variants** that escape the GROUP BY — "Fancy Feast Chicken" vs "Fancy Feast — Chicken Feast" vs "fancyfeast chicken." That is prevention's real target.
- **An invisible exact-dupe is still a clinical bug.** The GROUP BY picks an *arbitrary* winning row — including an arbitrary `food_type` (meal vs treat), which gates diet-trial compliance and intake semantics (the load-bearing core of B-018). A "clean-looking" library can still feed the engine an arbitrary `food_type`. Merge fixes that at the root; prevention stops new instances.

---

## 2. Background — what the codebase already gives us (evidence)

**(a) The reference graph is small — three tables point at `food_items`** (verified against the migrations):

| Table | FK column | On delete | Nullable | Migration |
|---|---|---|---|---|
| `meals` | `food_item_id → food_items(id)` | **SET NULL** | yes | 001 (`:135`) |
| `diet_trials` | `food_item_id → food_items(id)` | **SET NULL** | yes | 001 (`:150`) |
| `feeding_arrangements` | `food_item_id → food_items(id)` | **CASCADE** | **NOT NULL** | 018 (`:67`) |

A merge repoints all three from loser→survivor, then tombstones the loser. `feeding_arrangements` is the one with a `UNIQUE(pet_id, food_item_id)` collision risk (see §5.2) and a CASCADE delete (so a naive hard-delete of the loser would silently drop the arrangement — another reason to tombstone, not delete).

**(b) `food_items` is globally scoped** — no `user_id`; `created_by_user_id` is attribution only (`ON DELETE SET NULL`). Merge therefore mutates *shared* state — moot at single-user MVP, load-bearing for the multi-user authorization question (§5.3, parked).

**(c) Normalization helpers already exist.** `canonicalizeBrand` (`lib/food.ts:77`) strips trademark glyphs, normalizes apostrophes, NFKC-folds, lowercases, collapses whitespace — built for *grouping*, reusable for *matching*. `foodIntakeKey` (`lib/food.ts:163`) already folds brand+product into a key. Prevention needs only a product-name twin of `canonicalizeBrand` (a pure function — no schema).

**(d) `upc_barcode` is `UNIQUE` and indexed** (`007_food_library_redesign.sql:17,43`). It is the strongest match signal and the source of B-009's current bug: on a UPC collision the Edge Function retries with `upc_barcode: null`, landing a duplicate instead of resolving to the existing row.

**(e) The catalog is fully mirrored on-device.** `food_items_cache` (`lib/db.ts:59`) is a read-through mirror of the *entire* global catalog, refreshed by `refreshFoodCache` (`lib/sync.ts:390`). So **proactive matching can run client-side, offline, against the local cache** — covering every add path (photo-capture, onboarding, manual create) with no Edge Function round-trip.

**(f) The service-role Edge Function pattern exists** (B-039 `delete-account`, `analyze-vomit`): a dual client (`userClient` from the JWT + `adminClient` from `SUPABASE_SERVICE_ROLE_KEY`, already provisioned). Merge's bulk cross-row repoint reuses this shape exactly.

**(g) Repoints hydrate to other devices for free.** `meals.updated_at` (migration 016), and `diet_trials` / `feeding_arrangements` update triggers, mean a repoint bumps `updated_at` → the existing incremental hydration (B-054) carries the merge to every device. **No new sync machinery.**

---

## 3. This session's decisions (the alignment)

| # | Decision | Notes |
|---|---|---|
| **D1** | **Prevention first; merge is Phase 2.** | Prevention is the cheaper lever, stops the inflow, and rides the existing capture flow. Merge is the heavier build (service-role Edge Function + conflict UX + the multi-user question) and cleans the existing stock — built as a fast-follow once dupe volume is observable. |
| **D2** | **Survivorship ("what we keep") is a Phase-2 / merge decision — explicitly NOT a Phase-1 blocker.** | PM call this session. Holds technically: prevention never merges anything (tap "use existing" → no new row; tap "add anyway" → intentional new row), so it has zero dependency on the survivorship rules. Reversibility and the multi-user-auth question are parked the same way (§5.3). |
| **D3** | **Prevention steers, never blocks.** | Designer/Jordan/Sam: a hard stop on the owner's own pantry fails Principle 1 and the "don't nag" bar. Non-blocking interstitial, default = use existing, one tap either way. |
| **D4** | **Prevention is tiered by match confidence; silent on weak matches.** | Resolves the Designer × Data Scientist tension (§3.1): high-confidence (UPC-exact / normalized-exact brand+product) steers; anything fuzzier stays silent and is left for merge. Avoids false-positive nags. |
| **D5** | **Never delete a duplicate — repoint then tombstone.** | PM hard line. Merge sets a `merged_into` pointer + `merged_at` on the loser; the row survives (auditable, undo-capable). Supersedes the B-005 hard-delete-that-kills-records path for the merge case. |

### 3.1 Conflict surfaced and resolution-leaned (PM ratified D4)

> **Designer:** A rare duplicate is cheaper than nagging an owner who knows their own pantry — bias toward silence.
> **Data Scientist:** The arbitrary-`food_type` winner is a clinically load-bearing integrity bug — bias toward catching it.
> **Resolution (D4):** Tier the match. UPC-exact or normalized-exact brand+product → steer to the existing food; everything fuzzier → silent, leave for merge. Both lenses satisfied; the exact threshold is tunable on real data.

---

## 4. Phase 1 — Prevention (build-ready)

Two mechanisms, both prevention, that together fully resolve **B-009**:

### 4a. Proactive match-and-steer (client-side, all add paths)

**Where it fires:** the moments a *new* `food_items` row would be created —
- the photo-capture **confirm** screen (`app/food-capture.tsx`), after extraction returns brand/product/UPC;
- the **onboarding** food step (`app/onboarding/food.tsx`);
- a manual create from the food-detail screen, if/when that path exists.

**Where it must NOT fire:** the hot re-log path. Tapping a Recent or Library tile stays exactly one tap (Principle 1, 10-second test). Prevention only touches "Add new," already the rare path.

**Matching (tiered, D4):**
1. **UPC-exact** → near-certain duplicate → strong steer ("This is already in your library").
2. **Normalized brand + product exact** (via `canonicalizeBrand` + a new `canonicalizeProduct`) → likely duplicate → soft steer ("Looks like you already have this").
3. **Fuzzier than that** → silent. No fuzzy/edit-distance matching in v1 (false positives cost more than a rare dupe; merge cleans the tail).

Runs client-side against `food_items_cache` via one pure helper, e.g. `findDuplicateCandidate(brand, product, upc, catalog)` — instant, offline, single code path for every entry point.

**UX (steer, not block — D3):** a non-blocking interstitial on the confirm screen:

```
Mochi already has Fancy Feast Chicken in your library.
[ Use the existing one ]   [ This is different — add it ]
```

- Default / primary action = **Use existing** (logs the meal against the existing food; no new row).
- **Add anyway** = the owner's explicit override; creates the new row (intentional, not a dupe to police).
- Copy via `nyx-voice` (pet's name, no exclamation, not nagging). One tap either way; never a hard stop.

### 4b. Reactive UPC-collision resolution (Edge Function — the proper B-009 fix)

When a create still reaches the server with a `upc_barcode` that already exists, `extract-food-from-photo` currently catches the `UNIQUE` violation and **retries with `upc_barcode: null`**, landing a duplicate. Replace that with: **look up the existing row by UPC and return its id** so the client steers to the canonical food instead of creating a dupe. This is the server-side backstop for the proactive check (and the literal text of B-009).

### 4.1 Schema

**None.** Prevention is a pure normalization helper + a confirm-screen UX change + the Edge-Function collision-resolution swap. No migration.

### 4.2 Acceptance criteria (Phase 1)

- Re-adding a food already in the library surfaces the steer interstitial; **Use existing** logs against the existing row and creates **no** new `food_items` row.
- **Add anyway** creates a new row (override respected) — prevention never traps the owner.
- A capture whose extracted UPC matches an existing food resolves to that food server-side; **no `upc_barcode: null` dupe** is created (B-009 closed).
- The hot re-log path (Recent / Library tap) is **byte-for-byte unchanged** — still one tap, 10-second test intact.
- Weak/partial matches do **not** fire the interstitial (no false-positive nag).
- All-new-interactive-elements ≥44pt hit zone.

### 4.3 Build order (Phase 1 — each its own PR)

1. **PR P1** — `lib/food.ts`: `canonicalizeProduct` + `findDuplicateCandidate`, fully unit-tested. No schema, no UI. (Disjoint, parallelizable.)
2. **PR P2** — `extract-food-from-photo`: UPC-collision → resolve-to-existing (B-009). Edge Function + tests (mocked Claude + a collision fixture). `adversarial`-review not required (no clinical inference); `code-reviewer`.
3. **PR P3** — confirm-screen + onboarding steer interstitial wired to the P1 helper. `pm-feature-review` (Jordan + Sam, the steer copy + 10-second-test regression); Designer (Principles 1, 4).

---

## 5. Phase 2 — Merge (direction-level; deferred, fully spec'd later)

Resolves **B-018** (the merge that repoints `meals.food_item_id`) and **B-005** (tombstone, not cascade). Direction is settled below; the parked decisions (§5.3) get locked at implementation planning.

### 5.1 Architecture

Directional merge — the owner picks the **survivor** (Asana-style "merge B into A"). A **`merge-foods` Edge Function (service role)** does the bulk mutation atomically:

1. `UPDATE meals SET food_item_id = A WHERE food_item_id = B`
2. `UPDATE diet_trials SET food_item_id = A WHERE food_item_id = B`
3. Repoint `feeding_arrangements` (handle the UNIQUE collision — §5.2)
4. Apply field survivorship to A (§5.3, parked)
5. Tombstone B: set `merged_into = A` + `merged_at = now()`; B drops out of every catalog read but the row survives (auditable, undo-capable). **Never a hard delete.**

This belongs server-side (local-first + global catalog → a client-side bulk repoint across the sync queue is fragile under LWW/partial-flush). It reuses the B-039 dual-client pattern (§2f), and the repoints hydrate to other devices via existing rails (§2g).

**Surface:** a "Manage library" affordance (not the hot path) — multi-select two foods → pick the keeper → confirm. Off the 10-second path entirely.

### 5.2 Reference-graph handling

- `meals` / `diet_trials` — straight repoint (`SET NULL` FKs; an active elimination trial pointing at B **must** follow to A or compliance math breaks — Data Scientist + Dr. Chen).
- `feeding_arrangements` — `UNIQUE(pet_id, food_item_id)`: if both A and B have an arrangement for the same pet, the repoint collides → keep one (the survivor's), drop the duplicate. Don't let the bare repoint throw.
- Catalog reads (`LIBRARY_FOODS_QUERY`, picker, `refreshFoodCache`) must filter `merged_into IS NULL`.

### 5.3 Parked decisions (Phase-2 — D2: not Phase-1 blockers)

| Decision | Team's lean (to ratify at planning) |
|---|---|
| **Survivorship — what we keep** | **Survivor wins + gap-fill from loser, confirm clinical conflicts.** Survivor wins every field, but blanks are filled from the loser (ingredients, UPC, photos, protein) and photo sets are unioned — never discard data the survivor was missing. **`food_type` (meal/treat) or differing UPC → stop and confirm, never auto-resolve** (clinically load-bearing; differing UPC is a strong "not the same product — don't merge" signal). |
| **Reversibility** | Tombstone-with-pointer makes the data model **undo-capable** in v1; ship the actual undo *button* only if needed. Record which event ids were repointed so an undo can reverse them. |
| **Multi-user authorization** | At multi-user, merge mutates a *global* food through the service role and could touch rows that aren't the actor's. Needs a real authorization story (who may merge a global food?) **before** multi-user. Mandatory `rls-privacy-reviewer` pass on the Edge Function (confused-deputy). Flagged now; not foreclosed. |

### 5.4 Schema (Phase 2 — its own migration PR)

Additive on `food_items`: `merged_into UUID REFERENCES food_items(id)` + `merged_at TIMESTAMPTZ`. Migration-isolated, Migration Safety Pre-flight, additive/non-destructive.

### 5.5 Out of scope (Phase 2)

- Per-user catalog overrides (`food_item_overrides`) — still deferred (food-library-redesign §6).
- Auto-merge without owner confirmation — never; a wrong merge corrupts the clinical record.
- N-way bulk merge UI beyond pairwise in the first cut (engine can repoint N→1; the UI starts pairwise).

---

## 6. Safety invariants (govern both phases)

- **`food_type` is clinically load-bearing, not cosmetic.** It gates diet-trial compliance and intake semantics and flows to the vet report. Prevention's steer must not silently adopt a conflicting `food_type`; merge must confirm a `food_type` conflict, never auto-resolve it.
- **Repoint, never delete** (D5). Real feedings stay attached to history through the survivor.
- **A wrong merge corrupts the record.** High match bar; differing UPC blocks; merge is owner-confirmed and (by data model) reversible.
- **Merge mutates global, shared state** — the multi-user authorization question (§5.3) is on record before any multi-user release.

---

## 7. Backlog reconciliation (Product Owner)

- **B-009** → Phase 1 (4a proactive + 4b reactive). This spec is its home; re-prioritize **Now** when this track is picked up.
- **B-018** → Phase 2 (merge engine + dedup-on-insert, which 4a/4b deliver). Points here.
- **B-005** → folded into Phase 2's tombstone model (D5). Points here.
- Related, unchanged: B-011 / B-017 (`food_type` / `food_format` cleanup), B-052 (write-time protein normalization — composes with 4a's `canonicalizeProduct`).

---

## 8. Open questions for the PM

1. **Ratify this DRAFT** (and the §3 decisions) → flips status to Build-ready and re-prioritizes B-009 to **Now**.
2. **Phase-1 timing:** slot it as the next food-track session, or after the current Step 9/10 work? (File-disjoint — can run as a parallel session/branch.)
3. **Parked for Phase-2 planning (not now):** survivorship rule, undo-button scope, multi-user merge authorization (§5.3).

---

## 9. Persona sign-off (direction review)

Dir. of Eng ✓ (reference graph, service-role architecture, hydration-for-free) — Data Scientist ✓ (the masking/arbitrary-`food_type` integrity case; diet-trial repoint) — Designer ✓ (steer-not-block, hot-path untouched; Principles 1, 4) — Jordan + Sam ✓ (no nag on weak matches; "use existing" one-tap) — Dr. Chen ✓ (`food_type`/UPC conflict confirmed, not auto-resolved) — Trust & Safety ✓ (global-catalog mutation + multi-user auth flagged; tombstone is auditable) — Product Owner ✓ (ID reconciliation; B-009/B-018/B-005 converged). Backstops scheduled for build: `rls-privacy-reviewer` (merge Edge Function), `code-reviewer` (all PRs), `pm-feature-review` (P3 steer UX).
