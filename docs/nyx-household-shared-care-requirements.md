# Household Shared Care (Minimal Primitive) — Requirements (B-292 / CUL-194)

**Version:** 1.0 (draft) | 2026-08-21 | Status: **DISCOVERY OUTPUT — awaiting PM ratification of Discovery OQ2.** This document *is* the brief the 2026-07-10 deferral asked for. Nothing here is build-authorized until §0's D1 is ruled. The spec-stage `rls-privacy-reviewer` pass (§7) returned **FAIL on the initial proposal — 5 BLOCKER / 5 HIGH / 6 MED — and every finding is incorporated below**; the design in §4 is the amended one. The reviewer re-runs on HH-1/HH-3/HH-4 and again at HH-9.
**Reads with:** `docs/logging-capture-discovery.md` (§1.2/§5 — the origin), `docs/multi-device-sync-requirements.md` (B-054 — the pull machinery this rides), `docs/nyx-per-account-food-library-requirements.md` (B-354 — the catalog boundary this collides with), `docs/nyx-multi-pet-requirements.md` (B-086 — the hidden-switch rule this generalizes).

---

## 0. Decision record — PM decision briefs

Rule from these alone; the sections below carry the evidence. D1 is the OQ2 ratification itself; D2–D8 are shape calls inside it. Recommendations are the team's; C1 (inside D3) carries a genuine persona conflict, named.

**D1 — Adopt the primitive, in this shape?**
- **Deciding:** whether B-292 builds at all, and as what: an **account-to-account caregiver link** (owner invites; an active link grants the caregiver read/write on *all* the owner's pets), one caregiver role, no household entity, `pets.user_id` untouched, cap **2** active caregivers (was ~3; lowered per §7 MED 11), free (Pets > $ — capture infrastructure is care).
- **Options:** (a) **adopt as specced — recommended** (smallest primitive that fixes the diet-trial false-negative; ~30 of 47 policy edits become a one-line helper swap); (b) per-pet grants (defer — adds a which-pets picker + finer RLS for a need no user has voiced); (c) full household entity with pet re-homing (defer — B-354-scale migration); (d) don't build (the competitive doc records rivals shipping it and its absence generating 1★ reviews).
- **Consequence:** (a) unblocks the HH-1..HH-9 plan (§9); the notification/intent multipliers B-292 was filed for; the `logged_by` telemetry §8 of the discovery wants. Declining leaves the PM's own household on one shared credential.

**D2 — Catalog visibility for a shared household (the B-354 collision) — amended by §7 BLOCKER 4.**
- **Deciding:** what a caregiver's food/medication picker shows, given `food_items`/`medication_items` are per-account (migration 033). Today a caregiver would hydrate the owner's meals **whose catalog rows they cannot see** — broken joins, broken trial allowed-sets. Doing nothing is not viable.
- **Options:** (a) **union-READ + copy-on-use — recommended**: each member *reads* the other's catalog; but a pet's record only ever *references* catalog rows owned by that pet's owner — a caregiver's pick of their own food is materialized (service-role RPC) as a row owned by the pet's owner before anything references it. The red-team proved plain union-write re-opens the exact cross-account CASCADE hazard migration 040:246-259 documents (a caregiver deleting their account would silently shrink the owner's trial allowed-set and flip a trial verdict). (b) migrate catalogs to household scope (a second B-354; not v1). (c) caregiver picker limited to own library (breaks historical joins — not viable).
- **Consequence:** (a) adds one RPC + copy-on-use plumbing (HH-4/HH-6); duplicates within a household are *by construction* owned by one account (better for dedup than naive union-write); the invariant "a pet's record only references its owner's catalog rows" becomes testable.

**D3 — The owner-only surface set (carries conflict C1).**
- **Deciding:** which actions stay owner-only vs open to any active caregiver. Proposed owner-only: pet lifecycle (create/edit/archive/photo), **diet-trial lifecycle (start/end/extend/target-protein)**, med **regimen** create/edit, household invite/revoke, delete-account, **and hard DELETE of any row (§7 HIGH 6 — caregivers get SELECT/INSERT/UPDATE, never DELETE; soft-delete via `deleted_at` UPDATE remains available to both)**. Caregiver-writable: all event-family logging (meals, symptoms, doses, weights, vet visits/files, photos), plus reads of everything pet-scoped.
- **Conflict (Persona Conflict Protocol):**
  > **Dr. Chen:** A trial has one directive-holder. Two people able to start/end/extend a trial is how a 12-week GI trial gets ended at week 6 by the caregiver who didn't sit in the consult room — trial-lifecycle writes should be owner-only in v1.
  > **Jordan:** My wife takes him to the vet half the time. Whoever got the directive should be able to act on it; an owner-only wall makes her a second-class caregiver in her own house.
  > **Designer:** If the wall exists it must be *visible-but-explained* (a disabled affordance with "Ask {owner} to…"), never a dead-end error.
  > **PM decision needed:** owner-only trial/regimen lifecycle in v1 (Dr. Chen + team recommendation, with Designer's explained-wall), or symmetric?
- **Consequence:** owner-only also sidesteps the cross-writer race on the `diet_trials` unique-active index (§2.3) without new machinery; symmetric requires solving that race in v1.

**D4 — `logged_by` capture + render rule.**
- **Deciding:** `events.logged_by UUID` (server-stamped — see FR-6's forgery-proof shape from §7 HIGH 9), **backfilled NULL** (pre-attribution rows were a shared credential — authorship is unknown, and honest provenance forbids fabricating it), FK `ON DELETE SET NULL` (a caregiver's account deletion removes their *identity*, never the pet's record), rendered as a neutral fact ("Logged by Sarah") on event detail + Today rows **only when the household has >1 member**; NULL renders nothing.
- **Options:** (a) **as specced — recommended**; (b) backfill the owner's id (fabricates authorship the PM's own household disproves — rejected); (c) capture but never render (loses the discovery's ambient "did you log it?" answer, the one social-adjacent thing §5 explicitly blessed).
- **Consequence:** (a) needs the counterparty name RPC (FR-7); G2 bounds it hard — attribution is a fact, never a lever.

**D5 — Invite transport.**
- **Deciding:** how an invite travels. Proposed: owner mints a **single-use, ~7-day, ≥128-bit CSPRNG token (sha256-stored)** via a service-role Edge Function; delivered as a deep link through the OS share sheet, token carried in the **URL fragment** (never reaches a server log — §7 MED 13); redeemed server-side atomically. Plus **owner confirmation at redeem** (§7 MED 15): redemption surfaces who joined, with one-tap revoke — the only control an owner has over a misdirected link.
- **Options:** (a) **share-sheet deep link — recommended** (migration-026 precedent: token validated server-side, never an anon-queryable RLS predicate); (b) email invites (needs auth.admin lookups + templates — later, if ever); (c) show-a-code (worse UX, same security).
- **Consequence:** (a) one Edge Function + two screens; the redeem route must survive signed-out → sign-up → redeem (FR-4).

**D6 — Convergence latency.**
- **Deciding:** whether v1 adds realtime. A caregiver's log reaches the other phone on next foreground/reconnect/pull-to-refresh (B-054 machinery; no polling, no realtime on synced tables).
- **Options:** (a) **ship with foreground-pull convergence — recommended** (the kitchen conversation is the household's realtime; the record converges within one phone-pickup); (b) add a realtime nudge channel (the `event_ai_analysis` pattern exists to copy, but it's new always-on infrastructure for a latency nobody has complained about).
- **Consequence:** (a) zero new infra; "both phones open side-by-side don't live-update" is a documented v1 limitation. Revisit on dogfood evidence.

**D7 — AI cap unit under a household (new; §7 MED 11).**
- **Deciding:** `ai_usage` caps are per-user, so N members = N× the per-pet Signal cap and N× every incident-read cap — a direct multiplier on the Track-2 throttling contract and on `generate-signal`'s bug-loop *safety* backstop.
- **Options:** (a) **charge pet-scoped AI usage to the pet's owner's account — recommended** (small change inside `record_ai_usage`, already SECURITY DEFINER; household adds zero quota); (b) accept the multiplier, cap links at 2, and state it in the throttling spec's caps table (simplest; revisit at Premium).
- **Consequence:** (a) touches the Track-2 contract → needs a one-line amendment to `docs/monetization-and-throttling-requirements.md` (Tier-2, flagged); (b) is free now but couples household size to server cost.

**D8 — `nyx-pet-photos` privacy flip as a prerequisite (new; §7 MED 12).**
- **Deciding:** the pet-photo bucket is `public = true` with derivable paths (`{petId}/profile.jpg`) — revocation can never claw back a photo URL an ex-caregiver knows. Household doesn't change the exposure, it changes *who knows the path*.
- **Options:** (a) **flip the bucket private + signed URLs before HH-3 ships — recommended** (closes the standing 042 §A3 question; the only real fix); (b) ship household with the limitation documented (accepted-limitation register, revisit later).
- **Consequence:** (a) is its own small pre-req PR (client reads move to signed URLs — bounded, one path); (b) costs nothing now but makes revocation *knowingly* leaky for one asset class.

---

## 1. Decision context

The 2026-07-10 logging-capture discovery reframed the customer as the **household**: single-writer accounts structurally under-count, and the unwitnessed spouse-treat is the canonical reason an elimination trial reads as failed when it was never run clean (`docs/logging-capture-discovery.md` §1.2). The PM's own household shares one credential — which is why B-054 (multi-device hydration) and B-086's device-local active-pet rule exist, and why `logged_by` doesn't. The minimal primitive — invite + shared write + `logged_by` + RLS — was scoped there as *capture infrastructure, explicitly not a social layer*, and deferred pending this brief (Discovery OQ2).

**What changed since 2026-07-10, and how it bears on the case:**
- **B-288 is already unblocked** (notification-foundation D1 carved out owner-configured confirmations) and PM-elevated. Confirmation pushes fire per-*person*; a household where both adults can answer doubles the chance someone does.
- **The widget went informational-only** (B-664 v2), so "multiplies every capture surface" is today mostly: the log flow ×2, med confirms ×2, notification answers ×2 — still the multiplier, minus the widget-write leg (the B-291 intent rail remains).
- **The competitive refresh** records shared care as a gap rivals ship and users 1★ about.
- **Monetization strategy** already recommends one Premium covering the household — this spec stays free-tier and doesn't foreclose that.

## 2. Current state (code-verified this session, 2026-08-21)

Four research passes over migrations 001–059, `lib/sync.ts`/`lib/hydration.ts`/`lib/session.ts`, every capture surface, and Linear. Full detail in the session record; the load-bearing facts:

### 2.1 The good news — the client is nearly ready
- **The pull machinery is writer-agnostic.** `fetchAllRows` applies no user filter by design ("RLS scopes the SELECT to the account" — `lib/sync.ts:351`); every hydrate step reconciles by server `updated_at` and marks foreign rows `synced=1`. Built for multi-*device* (B-054), it delivers multi-*writer* rows with **zero changes** the moment RLS lets them through.
- **The single-writer assumption lives in ~2 places client-side:** the pet-list read (`hooks/usePet.ts:52` `.eq('user_id', userId)` + sibling call sites, inventoried in FR-5) and the absence of any authorship column.
- **RLS is one pattern, ~30× over.** 17 pet-scoped table policies + 13 storage policies resolve through the *same* `pet_id IN (SELECT id FROM pets WHERE user_id = auth.uid())` subquery; a `SECURITY DEFINER STABLE` helper (`household_pet_ids()`) makes the swap near-mechanical (FR-2). Direct-predicate policies: `pets` (1), `vet_reports` (1, keys on `generated_by`), catalogs (8). Four same-pet guard triggers (023/041/045/051) also assume single ownership — **three of which must NOT be widened** (§7 BLOCKER 3).
- **Edge Functions authorize purely via caller-JWT + RLS** — no manual ownership compares anywhere. Widening the policies widens the functions for free. Named seams: `generate-signal`'s and `generate-report`'s unfiltered `user_profiles` reads (§7 BLOCKER 5 — the reason FR-7 is an RPC, not a policy) and the report's "Owner:" line (§7 MED 14).
- **Storage is mostly pet-prefixed** (`{petId}/…` on event/vet/pet-photo buckets, policies keyed on the same pets subquery) — shared-care-ready by construction, with one UPDATE-verb caveat (§7 BLOCKER 2, Storage `move()`).
- **Active-pet selection is already caregiver-safe** — device-local, never synced, justified in `store/petStore.ts:23` by exactly this hazard (B-086).
- **The invite has an in-repo security precedent:** migration 026 (B-218) deleted an anon-queryable share-token policy and ratified *"a service-role Edge Function that validates the token server-side… never a raw, anon-queryable table."* The invite follows it (G5).

### 2.2 The four breaks the discovery didn't know about
1. **Per-account catalogs (migration 033).** `food_items`/`medication_items` are creator-scoped; the cache refreshers filter `.eq('created_by_user_id', session.user.id)`. A caregiver hydrates the owner's meals/doses **whose food/med rows they can't see**: broken picker, broken meal joins, broken trial allowed-sets. → D2.
2. **No authorship column anywhere on the event family.** `logged_via` (038) is a *surface*, not a person, and has zero render sites. "Who fed her at 6" is unanswerable. → D4, FR-6.
3. **`nyx-medication-photos` is the one user-prefixed bucket** (`{auth.uid()}/…`, migration 021). A caregiver's med detail screen shows a blank label photo — fails closed. → FR-3.
4. **No revocation path.** `clearLocalData` is all-or-nothing; absence-reconciliation exists for exactly one table (meals). An ex-caregiver keeps a full local mirror **indefinitely, even online** — until sign-out. → FR-8, G4, §7 HIGH 8.

### 2.3 Also single-writer-shaped (handled in the plan, not blockers)
- **LWW is server-arrival-time, whole-row** — and `lib/hydration.ts:17-33` *already names this feature*: "for two trusted caregivers who rarely edit the same row… acceptable for v1; the true-authorship fix is deferred to if/when linked accounts land." We keep that deferral, now with its bill visible (§10).
- `pets.weight_kg` denormalized snapshot written from each device's local view (three call sites) — cross-writer flapping; bound the write to strictly-newer readings (HH-9).
- `diet_trials` unique-active index + `23505`-is-terminal quarantine — a cross-writer trial-start race; owner-only lifecycle (D3) sidesteps it in v1.
- `user_profiles` has **no email column** — shapes D5.
- `uuid()` is `Math.random()`-based — collision risk negligible, but predicted-id write-targeting is hygiene worth fixing while we're here (HH-9; `expo-crypto` `randomUUID`).
- Account-level tables that deliberately do NOT widen: `ai_usage` (unit is D7's call), `legal_acceptances` (each caregiver accepts individually; its column-scoped INSERT grant stays untouched), `notification_preferences` (per-person; the 051 trigger needs the *argument-form* helper — §7 BLOCKER 3), `app_config`, `user_profiles` (FR-7 is an RPC precisely so this row policy never changes).

## 3. Team deliberation

Convened 2026-08-21 over the research above. Positions, then the two genuine conflicts.

- **Dir. of Engineering:** In favor — the helper-function swap keeps the blast radius reviewable, the schema is additive, and the client's pull path needs nothing. Insists on: schema-PR isolation per the house rule (three separate schema PRs, §9), the helper hardened per the 047 precedent (pinned `search_path`, EXECUTE revoked; the argument form trigger-only), and **no policy references the helper in the same PR that creates it** — dark first, flip second.
- **Sr. Data Scientist:** Strongly in favor — this *removes* a structural bias in every denominator the engine consumes (single-writer under-counting is unmodeled missingness concentrated on exactly the contamination events the trial verdict hinges on). Two conditions: `logged_by` is server-stamped, write-once, and backfills NULL (a fabricated or forgeable attribution would poison any future two-caregiver analysis — §7 HIGH 9's trigger shape satisfies this), and the catalog answer must not let cross-account duplicates split a protein's exposure count silently — D2's copy-on-use keeps every referenced row inside one account, which is *better* for dedup than naive union-write.
- **Dr. Chen:** The vet report gets *more* trustworthy — a two-writer record is closer to the household's ground truth, and the report never needs to render `logged_by` (the record speaks pet-centrically; Appendix-level provenance is a later call). Holds the C1 position above on trial lifecycle. Flags §7 MED 14 (a caregiver-generated report printing the caregiver as "Owner:") as clinically wrong, not just cosmetic — the vet needs the owner of record.
- **Jordan / Sam:** The invite must pass the 10-second test end-to-end (send from settings, partner taps link, signs up, sees the pets — no codes to transcribe; D5's owner-confirm must not add a second blocking step for the *invitee*). Sam flags the union library: her partner's "whatever was on sale" food entries now appear in her picker — acceptable because it's the household's real pantry, but recents-ordering should keep *her* recents first (HH-6 detail). Both flag: a caregiver must never feel second-class on the surfaces they're allowed to use — the owner-only walls need the Designer's explained-affordance treatment.
- **Sr. Product Designer:** The whole feature is two small surfaces (a Household settings section; a join screen) plus one register rule: attribution copy is a timestamp-grade fact, styled like metadata, never like a message. Empty state for the invitee ("You're caring for Biscuit now") is a designed moment (Principle 5). Holds the explained-wall position in C1.
- **Trust & Safety / Privacy:** In favor *of this shape specifically* because it's the anti-surveillance version: no feeds, no per-person stats, no partner-activity notifications (G1/G2 binding). Hard requirements, all now load-bearing in §4: (1) revocation must end server access instantly and purge the ex-caregiver's device **by a named mechanism** (G4/FR-8 — the abuse case is an ex-partner with a standing window into a household's daily routine; feeding times are location-and-schedule data about *people*); (2) both deletion directions answered (FR-9); (3) the invite link is a bearer credential — hashed at rest, single-use, short-lived, fragment-carried, and the redeem screen names the grant before the tap; (4) an ex-caregiver's minted report share-tokens die at revocation (§7 HIGH 7).
- **Sr. QA:** The deliverable QA holds the plan to is the §5 permission matrix — every cell is a test, run as owner, caregiver, **a second-household caregiver** (the §7 BLOCKER 2 bridge case), and a stranger. The B-354 stranger-isolation suite re-runs at HH-3 and HH-4.
- **Product Owner:** CUL-194 stays the tracking issue; out-of-scope discoveries file new CUL issues (§11); B-293's recent cancellation should be PM-confirmed as deliberate before any doc treats it as dead.

**C1 — trial/regimen lifecycle control** — carried in D3 above (Dr. Chen vs Jordan; recommendation owner-only + explained wall).

**C2 — catalog scope** — Designer/Sam ("one household, one pantry — union feels right") vs Data Scientist (duplicate-minting worsens within-household dedup) vs Engineer (full migration is a second B-354). The red-team then settled the *write* half on security grounds (§7 BLOCKER 4: cross-account references are a CASCADE hazard), leaving read-union + copy-on-use as the shape all three lenses accept — D2 carries it; the PM ratifies rather than adjudicates.

## 4. Requirements

_Amended throughout per §7; each amendment cites its finding._

**FR-1 — The link.** `caregiver_links`: `owner_user_id`, `caregiver_user_id` (nullable until redeemed), `status` (`invited`/`active`/`revoked`), `token_expires_at` (~7 days), timestamps. **Token hash lives in a separate `caregiver_link_secrets` table — RLS-enabled, zero policies (service-role only) — because this project has no column-level grants and the caregiver-side SELECT must never see a hash** (§7 B1). Constraints: **partial** unique index on the active pair (`WHERE status IN ('invited','active')` — a plain unique would forbid re-inviting a revoked caregiver forever, §7 L17); self-invite CHECK **plus a redeem-time re-check** (the CHECK can't fire while `caregiver_user_id` is NULL); cap **2** active links. **RLS: two SELECT policies only (`TO authenticated`, owner-side and caregiver-side), verb-split, never `FOR ALL` — the deliberate absence of INSERT/UPDATE/DELETE policies is default-deny (the `ai_usage` 031 shape), stated in the migration header so no later session "adds the missing policies" as a kindness** (§7 B1: the repo's dominant `FOR ALL USING` idiom would make this table a self-grant primitive — an attacker POSTing a row naming any victim as owner). **Create, redeem AND revoke all go through the service-role `household-invite` Edge Function** (`verify_jwt: true` on all three actions): redeem is a **single atomic UPDATE** (`WHERE hash matches AND status='invited' AND caregiver_user_id IS NULL AND not expired RETURNING id` — zero rows = `invite_invalid`, one indistinguishable error for the whole not-found/expired/revoked/redeemed set, §7 M13); the cap check takes a **`pg_advisory_xact_lock`** on the owner's uid (TOCTOU, §7 M13); token ≥128 bits CSPRNG, sha256-stored, indexed, never logged; **never `IS NOT DISTINCT FROM` against `caregiver_user_id`** (NULL-matching under service role, §7 M13).

**FR-2 — The access swap.** `public.household_pet_ids()` — `SECURITY DEFINER` (mandatory: it's referenced from `pets`' own policy; invoker recurses — say so in the header) `STABLE`, `SET search_path = ''`, schema-qualified body, `(select auth.uid())` inside: own pets ∪ pets of owners with an *active* link to the caller. **Grants: zero-arg form EXECUTE to `authenticated` only (revoked from PUBLIC/anon); the argument form `household_pet_ids(p_user uuid)` is TRIGGER-USE ONLY — EXECUTE revoked from PUBLIC/anon/authenticated (else it's a cross-tenant pet-enumeration RPC, §7 H10).** The 17 pet-scoped table policies and 13 pet-keyed storage policies swap to `pet_id IN (SELECT * FROM household_pet_ids())`. **Caregiver access is verb-split: SELECT/INSERT/UPDATE via the widened predicate; DELETE stays owner-only on every pet-scoped table** (§7 H6 — an about-to-be-revoked caregiver must not be able to hard-destroy the record; soft-delete via `deleted_at` UPDATE remains shared). **`pet_id` becomes immutable on every pet-scoped table via a shared BEFORE UPDATE trigger (`NEW.pet_id IS DISTINCT FROM OLD.pet_id` → raise)** — §7 B2: without it, a caregiver serving two owners is a cross-tenant re-homing bridge across all 17 tables (USING admits the old pet, WITH CHECK admits the new one; nothing in the app has ever re-homed a row, so this costs nothing and holds at rest, including under service role. **Storage UPDATE for caregivers either pins the destination prefix to the source pet or is dropped (delete+reupload)** — Storage implements `move()` as an UPDATE of `objects.name`.) **Links are never transitive — one hop, tested (A→B→C gets nothing).** **Guard triggers: 023/041/045 are NOT widened** (they constrain pet-to-pet; `pets.user_id` is untouched, so same-pet still implies same-owner — widening them deletes the protection they were written for, §7 B3); **only 051 widens, via the argument form keyed on `NEW.user_id`** (its service-role push path has no `auth.uid()`). `pets` itself: SELECT widens to membership; INSERT/UPDATE/DELETE stay owner-only. `pets.user_id` remains the single ownership root — no re-homing, no household entity.

**FR-3 — The seams.** Catalog **SELECT** union (D2) + `nyx-food-photos` SELECT widened + `nyx-medication-photos` SELECT extended to an active counterparty's prefix (writes stay own-prefix) + the 051 trigger per FR-2. **The `diet_trial_foods` food-ownership WITH CHECK conjunct is NOT widened** (§7 B4 — it exists to stop exactly the cross-account CASCADE this would re-open); instead, **copy-on-use**: a caregiver's pick of a cross-account food is materialized as a `food_items` row owned by the **pet's owner** (`created_by_user_id = pets.user_id`) via a service-role RPC before any pet-scoped row references it. Invariant, test-asserted: *a pet's record only ever references catalog rows owned by that pet's owner.* **Also closed while here: `meals.food_item_id` and `diet_trials.food_item_id` are bare FKs (FK checks bypass RLS) — under a union library a caregiver legitimately knows the ids, so they gain the 041-class ownership conjunct/trigger** (§7 B4).

**FR-4 — Invite UX.** Settings → Household: invite via share sheet (D5), member list (name + since-date), revoke with a plain-language consequence sheet. Redeem route survives signed-out → sign-up → redeem; the redeem screen names the grant ("You'll be able to see and log for {owner}'s pets") before the accept tap. **On redemption the owner gets an immediate, unmissable in-app surface naming who joined, with one-tap revoke** (§7 M15 — the only control over a misdirected link; whether it's confirm-to-activate or notify-with-revoke is a build-time Designer/T&S call inside this FR). Token in the URL **fragment**; the web fallback page logs no query strings and loads no third-party resource (§7 M13). All copy through `nyx-voice`.

**FR-5 — Membership-aware client.** Pet-list reads become RLS-driven — **explicit inventory: `hooks/usePet.ts:52`, `components/pet/PetSwitcherSheet.tsx:46`, `app/archived-pets.tsx:46` and `:82`** (§7 M16), plus onboarding/add-pet/profile writers which stay owner-scoped. **Caution recorded: `archived-pets.tsx:82` sits on an archive *write* path — dropping its filter must not let a caregiver archive the owner's pet (D3); the read widens, the write keeps the owner check.** Owner-only actions render the Designer's explained wall for caregivers (D3). Cross-pet surfaces (safety banner) treat visible pets uniformly — a caregiver sees the same safety-first Home.

**FR-6 — Attribution (forgery-proof shape, §7 H9).** `events.logged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL` (`NO ACTION` would deadlock the caregiver's own account deletion against the owner's events — an Apple 5.1.1(v) regression; CASCADE would delete the owner's record). **Server-stamped: a BEFORE INSERT trigger *overwrites* `NEW.logged_by := auth.uid()` when auth.uid() is non-NULL — a client value is never trusted; write-once enforced on UPDATE.** **`logged_by` never appears in any sync payload or `toRemote` mapper — enforced by an AST source-scan guard test (the `guards/ownerFacingCopy.test.ts` shape) that fails the build if it does** (the `logged_via` precedent proves the payload is the forgery path). Backfill NULL (D4/G3). Local column via `COLUMN_UPGRADES`, carried through hydrate SELECTs (read-only client-side). Render: neutral metadata on event detail + Today rows, only when household >1; NULL renders nothing.

**FR-7 — Name resolution (§7 B5).** **`user_profiles`' row policy is not touched** — a second permissive SELECT policy would return two rows to the unfiltered `.maybeSingle()` reads in `generate-report`/`generate-signal`/`ask` (500ing the report for the whole household; silently killing detector ⑥'s timezone), and RLS cannot express column narrowing. Instead: a `SECURITY DEFINER` RPC **`household_member_names()`** returning `(user_id, display_name)` for the caller's *active* counterparties only — `SET search_path = ''`, EXECUTE revoked per 047, granted to `authenticated`. A regression test asserts `user_profiles` still has exactly one policy.

**FR-8 — Revocation reality (G4; mechanism per §7 H8 — "best-effort purge" is otherwise an outcome without a mechanism: absence-reconciliation exists for meals only).** Revoke → server access ends at once (RLS). Client, on every foreground sync: fetch the authoritative accessible-pet-id set (one id-only read) and **hard-delete every local row whose `pet_id` is not in it** — children-first via the `LOCAL_WIPE_TABLES` ordering, **including quarantined sync-queue rows** (a post-revocation push is RLS-filtered server-side but the data otherwise sits in the queue forever); purge the **App Group snapshot + widget timeline per-pet**; **cancel scheduled local notifications referencing a revoked pet** (else the 9pm Day Summary keeps naming the ex-household's pet on the lock screen). The purge joins the `hydration.test.ts` B-424 guard so a future local table can't skip it. Documented limitation: an *offline* device retains data until it next syncs; sign-out wipe is the backstop. **Revocation also expires artifacts the ex-caregiver minted: every `vet_reports.token_expires_at` where `generated_by = ex-caregiver` and the pet was the owner's is set to `now()` by the revoke action** (§7 H7; B-143 declined manual revocation, so expiry is the only lever — this must live in *this* spec because Step 9 PR 6 won't know about it). v1 mints no other unauthenticated artifacts (verified §2); any future one joins this sweep by rule.

**FR-9 — Deletion, both directions (T&S).** Owner deletes account → pets cascade (unchanged), links die, ex-caregiver's mirror purges via FR-8 on next sync. Caregiver deletes account → their `caregiver_links` rows die, **their authored events survive** (the pet's record), `logged_by` → NULL via the FK. `delete-account`'s plan gains the links + secrets tables; export (B-041, when built) includes rows you authored on shared pets. **Copy-on-use (FR-3) is what makes caregiver deletion safe for the owner's trial data** — no owner-side row ever references a caregiver-owned catalog row, so 033's CASCADE can't reach it.

**FR-10 — Vet reports are household-visible in v1 (§7 H7 — upgraded from a deferral).** `vet_reports` re-keys: SELECT/DELETE by `pet_id IN (household_pet_ids())`; `generated_by` stays for INSERT attribution. Without this, an owner can neither see nor kill a report (with a live 30-day share token) that a caregiver generated over their own pet's data.

**FR-11 — No degradation.** Flag-off/unlinked accounts byte-identical in behavior; B-354 catalog isolation against *strangers* fully intact (suite re-run at HH-3/HH-4); single-user households see zero attribution chrome, zero new copy.

### The guardrail spine
- **G1 — Not a social layer.** No feeds, comments, reactions, per-person stats, completion scoreboards, or partner-directed nudges. Ever, in this track.
- **G2 — Attribution is a fact, never a lever.** `logged_by` renders as neutral provenance; the app never says "X hasn't logged", never compares caregivers, never notifies about a *person's* activity (the "caregiver echo" notification is out of scope and gated on its own future ruling).
- **G3 — No fabricated authorship.** Backfill NULL; server-stamped write-once; never client-suppliable; unattributed renders nothing.
- **G4 — Revocation is real.** Instant server-side; a named device-purge mechanism (FR-8), not an intent; minted share-tokens expire at revoke; named offline limitation; sign-out backstop.
- **G5 — The invite is never an RLS predicate.** Service-role Edge Function, hashed single-use expiring token, atomic redeem (migration-026 precedent).
- **G6 — The owner remains the account of record.** `pets.user_id` unchanged; `pet_id` immutable; links never transitive; deletion cascades unchanged; a caregiver's own account and pets are untouched by the link.
- **G7 — Per-person stays per-person.** Legal acceptances, notification preferences, beta opt-ins never pool. AI caps: D7's call.

## 5. Permission matrix (QA contract — every cell is a test, run as owner, caregiver, a *second-household* caregiver, and a stranger)

| Action | Owner | Caregiver (active) | 2nd-household caregiver / revoked / stranger |
|---|---|---|---|
| See pets / full record | ✓ | ✓ | ✗ |
| Log events, meals, doses, weights, vet visits/files, photos | ✓ | ✓ | ✗ |
| Edit events (any author's); soft-delete (`deleted_at`) | ✓ | ✓ *(LWW household-trust model, §2.3)* | ✗ |
| **Hard DELETE any row** | ✓ | **✗** *(§7 H6)* | ✗ |
| **Move any row/photo to another pet (`pet_id`)** | **✗** *(immutable)* | **✗** *(§7 B2)* | ✗ |
| Run AI reads / Signal / Ask / report *(cap unit = D7)* | ✓ | ✓ | ✗ |
| See household vet reports (incl. counterparty-generated) | ✓ *(FR-10)* | ✓ | ✗ |
| See counterparty's food/med catalog + photos | ✓ | ✓ (read-only) | ✗ |
| Reference a cross-account catalog row from a pet's record | via copy-on-use | via copy-on-use | ✗ |
| Pet lifecycle (create/edit/archive/photo) | ✓ | ✗ *(D3)* | ✗ |
| Trial lifecycle / target protein; regimen create/edit | ✓ | ✗ *(D3 — C1 pending)* | ✗ |
| Invite / revoke caregivers | ✓ | ✗ | ✗ |
| Read counterparty display name (via RPC only) | ✓ | ✓ (that only) | ✗ |
| Enumerate anyone's pet ids via the helper | own set only | own set only | ✗ *(§7 H10 grants)* |
| Delete account | own only | own only *(FR-9: their events survive, identity leaves)* | own only |

## 6. Explicitly out of scope (v1)
Realtime convergence (D6) · per-pet grants · >1 role / read-only role · email invites · household-scoped catalog migration (D2b) · `logged_by` on the vet report · per-person notifications of any kind (caregiver echo — future ruling) · shared/pooled AI budgets beyond D7's unit call · Android-specific invite handling beyond the deep link · the B-288 confirmation-push interplay (its per-person schedules compose naturally; its budget-unit question already lives on B-015/B-288) · the LWW true-authorship fix (§10).

## 7. Security review — `rls-privacy-reviewer`, spec-stage (2026-08-21)

**Verdict on the initial proposal: FAIL — 5 BLOCKER / 5 HIGH / 6 MED, every one fixable at zero rows. All are incorporated into §4; this section is the record.** The reviewer's core assessment: the design's instincts held (`pets.user_id` stays the root, no re-homing, 026-pattern redemption, pet-scoped keys); every break was a widening that reached one layer past the ownership root, or an outcome stated without a mechanism. Re-runs: HH-1, HH-3, HH-4, and the HH-9 full pass.

| # | Sev | Finding (attack) | Resolution (where) |
|---|---|---|---|
| B1 | BLOCKER | Direct PostgREST INSERT of a self-naming `caregiver_links` row — the repo's dominant `FOR ALL USING` idiom (USING reused as WITH CHECK) makes the natural policy a self-grant primitive; owner-side UPDATE re-key variant too | SELECT-only verb-split policies; all writes via Edge Function incl. revoke; hash in a zero-policy secrets table (FR-1) |
| B2 | BLOCKER | A caregiver serving two owners PATCHes `pet_id` from owner A's pet to owner B's — `household_pet_ids()` is the union of the caller's households, so USING+WITH CHECK both admit; same via Storage `move()` | `pet_id` immutable (shared BEFORE UPDATE trigger); Storage UPDATE pinned or dropped; links one-hop, tested (FR-2) |
| B3 | BLOCKER | "Widen the 4 guard triggers equivalently" — widening 023/041/045 deletes the wrong-pet protection they were written for (pet-to-pet ⟹ same-owner survives household); 051 can't use `auth.uid()` (NULL on its service-role path) | 023/041/045 NOT widened; 051 only, via `household_pet_ids(p_user)` keyed on `NEW.user_id` (FR-2) |
| B4 | BLOCKER | Caregiver adds their own food to the owner's trial allowed-set, then deletes their account → 033's CASCADE + 040:159 silently shrinks the trial's allowed set, flipping exposures — verbatim the hazard 040:246-259 documents; plus bare FKs on `meals`/`diet_trials`.`food_item_id` become routine once ids are known | `diet_trial_foods` conjunct NOT widened; copy-on-use materialization owned by the pet's owner; bare FKs gain ownership guards (FR-3, D2) |
| B5 | BLOCKER | A second `user_profiles` SELECT policy makes the unfiltered `.maybeSingle()` reads return 2 rows → `generate-report` 500s for the whole household; `generate-signal` tz silently undefined (detector ⑥ stops); column-narrowing inexpressible in RLS | `user_profiles` untouched; `household_member_names()` RPC; single-policy regression test (FR-7) |
| H6 | HIGH | Caregiver `DELETE /rest/v1/events?pet_id=eq.…` — FOR ALL includes DELETE; a second party can irreversibly destroy the owner's record (no audit, no backup; the about-to-be-revoked caregiver is the motivated actor) | Caregiver verbs = SELECT/INSERT/UPDATE; DELETE owner-only (FR-2, 044 precedent) |
| H7 | HIGH | Ex-caregiver's minted `vet_reports` share tokens survive revocation up to 30 days; owner can't see or kill them (`generated_by`-scoped; B-143 declined) | `vet_reports` re-keyed in v1 (FR-10); revoke expires the ex-caregiver's tokens (FR-8) |
| H8 | HIGH | "Best-effort purge on next sync" had no mechanism — absence-reconcile is meals-only; an *online* ex-caregiver retains the mirror indefinitely; App Group, scheduled notifications, quarantined queue rows all leak | The named FR-8 purge: authoritative-set diff, LOCAL_WIPE_TABLES order, quarantine included, per-pet App Group + notification cancellation, B-424 guard |
| H9 | HIGH | `logged_by` forgeable via the sync payload (the `logged_via` precedent proves the path); unstated FK = NO ACTION deadlocks the caregiver's own account deletion | Server-stamped BEFORE INSERT overwrite; never in any payload (AST guard test); `ON DELETE SET NULL` (FR-6) |
| H10 | HIGH | The argument-form helper, default-granted, is a cross-tenant pet-id enumeration RPC (`SECURITY DEFINER` bypasses RLS; Supabase default-privileges grant anon/authenticated); search_path unpinned | Grants split (zero-arg → authenticated; arg form → nobody); `SET search_path = ''`; DEFINER-is-mandatory noted (FR-2) |
| M11 | MED | N members = N× every AI cap incl. the per-pet Signal safety backstop (sock-puppet multiplier) | → D7 (recommended: charge pet-scoped usage to the pet's owner); cap lowered to 2 either way (D1) |
| M12 | MED | `nyx-pet-photos` is `public=true` with derivable paths — revocation can never claw back a known URL | → D8 (recommended: flip private + signed URLs as a pre-req) |
| M13 | MED | Token lifecycle: double-redeem race (SELECT-then-UPDATE), cap TOCTOU, token in server/CDN logs via query-string deep links, error oracle, NULL-matching via `IS NOT DISTINCT FROM` | Atomic redeem, advisory lock, fragment-carried token, single `invite_invalid`, banned predicate — all in FR-1/FR-4 |
| M14 | MED | Caregiver-generated report prints the *caregiver's* name/email as "Owner:" (caller-profile read + JWT-email fallback) — clinically wrong + email disclosure | Owner line resolves from `pets.user_id` (via the FR-7 RPC) or splits into Owner/Generated-by; rides the B-494 redeploy; Tier-2 flag to `nyx-vet-report-requirements.md` §7.1 + `vet-report-cold-read` (§10, §11) |
| M15 | MED | No identity confirmation at redeem — whoever a forwarded link reaches becomes a caregiver silently | Owner-confirm surface with one-tap revoke at redemption (FR-4) |
| M16 | MED | RLS widening alone changes nothing client-side — 4 `.eq('user_id')` call sites, one on an archive *write* path | Inventoried in FR-5 with the write-path caution |
| L17 | LOW | Partial unique index; redeem-time self-invite check; perf indexes on `caregiver_links(caregiver_user_id,status)`/`(owner_user_id,status)`; `get_advisors` after each schema PR; `legal_acceptances` untouched; verify realtime (059) respects widened RLS | Folded into FR-1/FR-2 + HH plan gates |

**PM checks (dashboard-only — the reviewer cannot verify these from the repo):**
1. Diff live policies against the migration set before HH-1 (`pg_policies` query in the review record) — dashboard drift would invalidate the line-cites.
2. `select id, public from storage.buckets` — confirm only `nyx-pet-photos` is public (bears on D8).
3. Confirm no health-photo signed URL TTL exceeds ~1h and none is cached past revocation.
4. After HH-2 deploys: `list_edge_functions` shows `household-invite` with `verify_jwt = true`.
5. Never create a future bucket via SQL (042 §A3 standing rule; no bucket is added by this track).
6. Confirm `delete-account`'s `collectStoragePaths` re-scopes pet-photo paths (042:112-113 left it out).
7. Live row counts for the HH-1/HH-7 Migration Safety Pre-flights at build time.

## 8. Acceptance criteria (track-level)
1. An invited caregiver can, within 10 minutes of receiving a link: sign up, redeem, see the owner's pets, and log a meal that appears on the owner's device on next foreground.
2. Every §5 matrix cell passes as owner, caregiver, second-household caregiver, and stranger (integration tests, HH-9).
3. Revocation: server reads fail immediately; the ex-caregiver's device purges shared-pet rows (incl. quarantined queue rows, App Group entries, scheduled notifications) on next sync; their own pets unaffected; their minted report tokens expired.
4. A single-member household is pixel- and behavior-identical to today (FR-11, snapshot-pinned where feasible).
5. `logged_by` never fabricated and never client-suppliable (NULL backfill; server-stamp + write-once trigger-tested; the payload AST guard fails the build on regression), never rendered in a comparative or absence-framing register (nyx-voice pass).
6. B-354 stranger-isolation suite still green; `get_advisors` (security + performance) clean after every schema PR.
7. The A→B→C transitivity test: a caregiver's caregiver sees nothing.

## 9. PR plan

Sequencing: **HH-1 is the gate** — everything queues behind it. **HH-0 (D8) and HH-2 ∥ HH-3 ∥ HH-4** once HH-1 lands. HH-7 ∥ HH-5/HH-6. Access flips server-side at HH-3 but is inert until HH-2+HH-5 make an invite redeemable — enforcement always precedes UI. Schema PRs are isolated per the house rule; `rls-privacy-reviewer` runs on HH-1, HH-3, HH-4 and re-runs at HH-9; migration pre-flights are all additive/destructive-n except where noted.

| PR | Scope | Gates / notes |
|---|---|---|
| **HH-0** (schema+client, pre-req — D8a) | Flip `nyx-pet-photos` private + signed-URL reads. Independent of everything; ship any time before HH-3. | Skipped entirely if PM rules D8b |
| **HH-1** (schema, gate) | `caregiver_links` + `caregiver_link_secrets` (zero-policy) + SELECT-only verb-split RLS + partial unique + indexes + `household_pet_ids()` both forms (hardened grants, pinned search_path, DEFINER-mandatory header). **Dark** — nothing references the helper yet. | rls-privacy-reviewer; pre-flight additive; advisors |
| **HH-2** (edge fn) | `household-invite` (create / atomic redeem / revoke incl. the FR-8 token-expiry sweep; advisory-lock cap; fragment token; `invite_invalid` oracle; `verify_jwt` true). deno tests: replay, expiry, double-redeem race, cap TOCTOU, self-invite at redeem. | ∥ HH-3/4; deploy per runbook |
| **HH-3** (schema) | The swap: 17 pet-scoped policies → verb-split (caregiver S/I/U, owner-only DELETE) on `household_pet_ids()`; 13 storage policies (UPDATE pinned/dropped); the shared `pet_id`-immutability trigger; 051 → arg-form helper (023/041/045 untouched, stated in the migration header); `pets` SELECT widening; **`vet_reports` re-key (FR-10)**. | rls-privacy-reviewer (mandatory); B-354 stranger suite; transitivity test; rollback = restore prior policy text |
| **HH-4** (schema+fn) | The seams: catalog SELECT union; food/med-photo storage SELECT; `household_member_names()` RPC; the **copy-on-use RPC**; bare-FK ownership guards on `meals`/`diet_trials`.`food_item_id`; `user_profiles` single-policy regression test. | rls-privacy-reviewer; advisors |
| **HH-5** (client) | Household settings + invite share flow + member list + revoke sheet + redeem deep-link route (incl. signed-out path) + the FR-4 owner-confirm surface. | pm-feature-review; nyx-voice |
| **HH-6** (client) | Membership-aware pet reads (FR-5 inventory; archive write-path caution), D3 explained walls, **the FR-8 revocation purge** (authoritative-set diff + quarantine + App Group + notification cancellation + B-424 guard), copy-on-use picker plumbing + union-cache refreshers (own-recents-first). | supabase-sync skill; matrix subset tests |
| **HH-7** (schema, small) | `events.logged_by` (`ON DELETE SET NULL`, server-stamp BEFORE INSERT overwrite, write-once UPDATE guard, NULL backfill). | pre-flight: additive, backfill N/A-by-design |
| **HH-8** (client) | `logged_by` hydrate-only plumbing + `COLUMN_UPGRADES` + **the payload AST guard test** + attribution render (detail + Today, household>1) + FR-7 name resolution + voice pass. | nyx-voice; G2/G3 test-asserted |
| **HH-9** (hardening) | §5 matrix integration tests (4 personas × cells), weight-snapshot strictly-newer bound, `uuid()` → `expo-crypto`, edit-clobber disclosure line, `delete-account` plan update (FR-9 + links/secrets tables), D7 implementation if (a), docs, dogfood TestFlight cut. | rls-privacy re-run; pm-feature-review; DoD full pass |

**Per-session kickoff prompts** (one PR per session; every PR references CUL-194):
- HH-0: *"B-292 HH-0: flip `nyx-pet-photos` private + signed-URL reads per spec §0 D8 + §7 M12. Schema + the one client read path. rls-privacy-reviewer."*
- HH-1: *"B-292 HH-1: `caregiver_links`/`caregiver_link_secrets` + `household_pet_ids()` per `docs/nyx-household-shared-care-requirements.md` §4 FR-1/FR-2 + §7 B1/H10. Schema-only, dark. rls-privacy-reviewer before push."*
- HH-2: *"B-292 HH-2: the `household-invite` Edge Function per spec FR-1/FR-4/FR-8 + §7 M13. deno tests for the race/TOCTOU/oracle set. Deploy per `docs/edge-deploy-runbook.md`."*
- HH-3: *"B-292 HH-3: the verb-split policy swap + pet_id immutability + 051-only trigger widening + vet_reports re-key per spec FR-2/FR-10 + §7 B2/B3/H6/H7. Schema-only. rls-privacy-reviewer mandatory; B-354 stranger suite + transitivity test."*
- HH-4: *"B-292 HH-4: catalog union-read + copy-on-use RPC + `household_member_names()` + bare-FK guards per spec FR-3/FR-7 + §7 B4/B5. rls-privacy-reviewer."*
- HH-5: *"B-292 HH-5: the Household settings + invite/redeem/owner-confirm surfaces per spec FR-4. pm-feature-review + nyx-voice before push."*
- HH-6: *"B-292 HH-6: membership-aware client reads + owner-only walls + the FR-8 revocation purge + copy-on-use plumbing per spec FR-5/FR-8."*
- HH-7: *"B-292 HH-7: the `events.logged_by` migration per spec FR-6 + §7 H9. Schema-only, additive, NULL backfill by design."*
- HH-8: *"B-292 HH-8: logged_by plumbing + the payload AST guard + attribution render per spec FR-6/FR-7, G2/G3 test-asserted."*
- HH-9: *"B-292 HH-9: the hardening pass per spec §9 — 4-persona matrix tests, FR-9 deletion updates, D7 if ruled (a), dogfood cut."*

## 10. Known limitations & follow-ups (filed, not hidden)
- **LWW true-authorship fix** (client-authored timestamp the trigger respects) — the `lib/hydration.ts:17` deferral comes due *if* dogfood shows same-row cross-caregiver edits; file on first observed instance.
- **`generate-report` "Owner:" line** under a caregiver JWT names the caregiver — even their email (§7 M14). Fix = resolve from `pets.user_id` via the FR-7 RPC (or an Owner/Generated-by split); **rides the B-494-gated redeploy, never its own** — household's report correctness has a sequencing dependency on B-494 clearing. Tier-2 edit to `nyx-vet-report-requirements.md` §7.1 flagged; `vet-report-cold-read` re-run required.
- **`generate-signal` tz read** uses the caller's profile — same-household tz assumption; revisit only if a split-tz household surfaces.
- **Cross-account duplicate foods** within a household — copy-on-use bounds them to owner-account rows; residual duplicates flagged to the dedup track (B-009/B-018).
- **Realtime publication (059)** — verify caregiver subscriptions to `event_ai_analysis` respect the widened RLS (PM check 2 adjacency; part is dashboard-configured).

## 11. Ripples
- **CLAUDE.md (Tier 1):** on D1 ratification — resolve the OQ row (move to `decisions-archive.md`), add the household exception line to the engineering constraint about `pet_id`+RLS tables (`caregiver_links`/`caregiver_link_secrets` are account-pair-scoped by design).
- **Linear:** new issues to file at build kickoff — the HH-0 pre-req (if D8a), the LWW true-authorship follow-up (filed-on-evidence), dedup household note on B-009/B-018, the M14 report fix riding B-494. B-293's cancellation → PM confirm.
- **Tier-2 docs (flagged, not written):** `nyx-vet-report-requirements.md` §7.1 (M14); `docs/monetization-and-throttling-requirements.md` caps table (D7); `nyx-vet-files-requirements.md` caregiver-access note resolves to "follows this spec"; `nyx-technical-spec` gains the membership model on its next refresh pass.
