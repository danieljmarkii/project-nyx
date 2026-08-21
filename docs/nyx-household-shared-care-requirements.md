# Household Shared Care (Minimal Primitive) — Requirements (B-292 / CUL-194)

**Version:** 1.0 (draft) | 2026-08-21 | Status: **DISCOVERY OUTPUT — awaiting PM ratification of Discovery OQ2.** This document *is* the brief the 2026-07-10 deferral asked for. Nothing here is build-authorized until §0's D1 is ruled.
**Reads with:** `docs/logging-capture-discovery.md` (§1.2/§5 — the origin), `docs/multi-device-sync-requirements.md` (B-054 — the pull machinery this rides), `docs/nyx-per-account-food-library-requirements.md` (B-354 — the catalog boundary this collides with), `docs/nyx-multi-pet-requirements.md` (B-086 — the hidden-switch rule this generalizes).

---

## 0. Decision record — PM decision briefs

Rule from these alone; the sections below carry the evidence. D1 is the OQ2 ratification itself; D2–D6 are shape calls inside it. Recommendations are the team's; C1 (inside D3) carries a genuine persona conflict, named.

**D1 — Adopt the primitive, in this shape?**
- **Deciding:** whether B-292 builds at all, and as what: an **account-to-account caregiver link** (owner invites; an active link grants the caregiver read/write on *all* the owner's pets), one caregiver role, no household entity, `pets.user_id` untouched, cap ~3 active caregivers, free (Pets > $ — capture infrastructure is care).
- **Options:** (a) **adopt as specced — recommended** (smallest primitive that fixes the diet-trial false-negative; ~30 of 47 policy edits become a one-line helper swap); (b) per-pet grants (defer — adds a which-pets picker + finer RLS for a need no user has voiced); (c) full household entity with pet re-homing (defer — B-354-scale migration); (d) don't build (the competitive doc records rivals shipping it and its absence generating 1★ reviews).
- **Consequence:** (a) unblocks the HH-1..HH-9 plan (§9); the widget/notification multipliers B-292 was filed for; the `logged_by` telemetry §8 of the discovery wants. Declining leaves the PM's own household on one shared credential.

**D2 — Catalog visibility for a shared household (the B-354 collision).**
- **Deciding:** what a caregiver's food/medication picker shows, given `food_items`/`medication_items` are per-account (migration 033). Today a caregiver would hydrate the owner's meals **whose catalog rows they cannot see** — broken joins, broken trial allowed-sets. Doing nothing is not viable.
- **Options:** (a) **union-read — recommended** (each member additionally *reads* the other's catalog; writes stay own-account; `diet_trial_foods`' ownership check widens to match): smallest change that un-breaks every join. (b) migrate catalogs to household scope (a second B-354; not for v1). (c) share-pet-scoped subset (complex, still breaks historical joins).
- **Consequence:** (a) accepts two owned-by-different-accounts copies of the same food may exist in one household (dedup stays within-account — flagged to the B-009/B-018 track, §11); Sam's "my pantry" feeling now includes the partner's pantry, which is the household's actual pantry.

**D3 — The owner-only surface set (carries conflict C1).**
- **Deciding:** which actions stay owner-only vs open to any active caregiver. Proposed owner-only: pet lifecycle (create/edit/archive/photo), **diet-trial lifecycle (start/end/extend/target-protein)**, med **regimen** create/edit, household invite/revoke, delete-account. Caregiver-writable: all event-family logging (meals, symptoms, doses, weights, vet visits/files, photos), plus reads of everything pet-scoped.
- **Conflict (Persona Conflict Protocol):**
  > **Dr. Chen:** A trial has one directive-holder. Two people able to start/end/extend a trial is how a 12-week GI trial gets ended at week 6 by the caregiver who didn't sit in the consult room — trial-lifecycle writes should be owner-only in v1.
  > **Jordan:** My wife takes him to the vet half the time. Whoever got the directive should be able to act on it; an owner-only wall makes her a second-class caregiver in her own house.
  > **Designer:** If the wall exists it must be *visible-but-explained* (a disabled affordance with "Ask {owner} to…"), never a dead-end error.
  > **PM decision needed:** owner-only trial/regimen lifecycle in v1 (Dr. Chen + team recommendation, with Designer's explained-wall), or symmetric?
- **Consequence:** owner-only also sidesteps the cross-writer race on the `diet_trials` unique-active index (§2.4 #8) without new machinery; symmetric requires solving that race in v1.

**D4 — `logged_by` capture + render rule.**
- **Deciding:** `events.logged_by UUID` (write-once, `DEFAULT auth.uid()`), **backfilled NULL** (pre-attribution rows were a shared credential — authorship is unknown, and honest provenance forbids fabricating it), rendered as a neutral fact ("Logged by Sarah") on event detail + Today rows **only when the household has >1 member**; NULL renders nothing.
- **Options:** (a) **as specced — recommended**; (b) backfill the owner's id (fabricates authorship the PM's own household disproves — rejected); (c) capture but never render (loses the discovery's ambient "did you log it?" answer, the one social-adjacent thing §5 explicitly blessed).
- **Consequence:** (a) needs the narrow cross-profile name read (§4 FR-7); G2 bounds it hard — attribution is a fact, never a lever.

**D5 — Invite transport.**
- **Deciding:** how an invite travels. Proposed: owner mints a **single-use, ~7-day, hashed token** via a service-role Edge Function; delivered as a deep link through the OS share sheet (iMessage/WhatsApp — the household's channel); redeemed server-side. No email lookup (`user_profiles` has no email column; adding one for this is scope creep).
- **Options:** (a) **share-sheet deep link — recommended** (migration-026 precedent: token validated server-side, never an anon-queryable RLS predicate); (b) email invites (needs auth.admin lookups + email templates — later, if ever); (c) show-a-code (worse UX, same security).
- **Consequence:** (a) one Edge Function + one screen; the deep-link route must survive the signed-out → sign-up → redeem path (§4 FR-4).

**D6 — Convergence latency.**
- **Deciding:** whether v1 adds realtime. A caregiver's log reaches the other phone on next foreground/reconnect/pull-to-refresh (B-054 machinery; no polling, no realtime on synced tables).
- **Options:** (a) **ship with foreground-pull convergence — recommended** (the kitchen conversation is the household's realtime; the record converges within one phone-pickup); (b) add a realtime nudge channel (the `event_ai_analysis` pattern exists to copy, but it's new always-on infrastructure for a latency nobody has complained about).
- **Consequence:** (a) zero new infra; "both phones open side-by-side don't live-update" is a documented v1 limitation. Revisit on dogfood evidence.

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
- **The single-writer assumption lives in ~2 places client-side:** the pet-list read (`hooks/usePet.ts:52` `.eq('user_id', userId)` + ~10 sibling call sites) and the absence of any authorship column.
- **RLS is one pattern, ~30× over.** 17 pet-scoped table policies + 13 storage policies resolve through the *same* `pet_id IN (SELECT id FROM pets WHERE user_id = auth.uid())` subquery; a `SECURITY DEFINER STABLE` helper (`household_pet_ids()`) makes the swap near-mechanical (§4 FR-2). Direct-predicate policies: `pets` (1), `vet_reports` (1, keys on `generated_by`), catalogs (8). Four same-pet guard triggers (023/041/045/051) also assume single ownership.
- **Edge Functions authorize purely via caller-JWT + RLS** — no manual ownership compares anywhere. Widening the policies widens the functions for free. Two named seams: `generate-signal`'s `user_profiles` read (returns the *caller's* profile — fine for tz, assumption noted) and `generate-report`'s "Owner:" line (a caregiver-generated report names the caregiver — accepted v1 limitation; the fix rides the B-494 redeploy, never its own deploy).
- **Storage is mostly pet-prefixed** (`{petId}/…` on event/vet/pet-photo buckets, policies keyed on the same pets subquery) — shared-care-ready by construction.
- **Active-pet selection is already caregiver-safe** — device-local, never synced, justified in `store/petStore.ts:23` by exactly this hazard (B-086).
- **The invite has an in-repo security precedent:** migration 026 (B-218) deleted an anon-queryable share-token policy and ratified *"a service-role Edge Function that validates the token server-side… never a raw, anon-queryable table."* The invite follows it (G5).

### 2.2 The four breaks the discovery didn't know about
1. **Per-account catalogs (migration 033).** `food_items`/`medication_items` are creator-scoped; the cache refreshers filter `.eq('created_by_user_id', session.user.id)`. A caregiver hydrates the owner's meals/doses **whose food/med rows they can't see**: broken picker, broken meal joins, broken trial allowed-sets (`diet_trial_foods` WITH CHECK requires *your own* food). → D2.
2. **No authorship column anywhere on the event family.** `logged_via` (038) is a *surface*, not a person, and has zero render sites. "Who fed her at 6" is unanswerable. → D4, FR-6.
3. **`nyx-medication-photos` is the one user-prefixed bucket** (`{auth.uid()}/…`, migration 021). A caregiver's med detail screen shows a blank label photo — fails closed. → FR-3.
4. **No revocation path.** `clearLocalData` is all-or-nothing; hydration has no "pet left my scope" tombstone. An ex-caregiver keeps a full local mirror until sign-out. → FR-8, G4.

### 2.3 Also single-writer-shaped (handled in the plan, not blockers)
- **LWW is server-arrival-time, whole-row** — and `lib/hydration.ts:17-33` *already names this feature*: "for two trusted caregivers who rarely edit the same row… acceptable for v1; the true-authorship fix is deferred to if/when linked accounts land." We keep that deferral, now with its bill visible (§10).
- `pets.weight_kg` denormalized snapshot written from each device's local view (three call sites) — cross-writer flapping; bound the write to strictly-newer readings (HH-9).
- `diet_trials` unique-active index + `23505`-is-terminal quarantine — a cross-writer trial-start race; owner-only lifecycle (D3) sidesteps it in v1.
- `user_profiles` has **no email column** — shapes D5.
- `uuid()` is `Math.random()`-based — collision risk negligible, but predicted-id write-targeting is hygiene worth fixing while we're here (HH-9; `expo-crypto` `randomUUID`).
- Account-level tables that deliberately do NOT widen: `ai_usage` (caps stay per-user — a household informally doubles quota; accepted, it's an abuse control not a fairness control), `legal_acceptances` (each caregiver accepts individually), `notification_preferences` (per-person; the 051 trigger needs membership-awareness for per-pet rows), `app_config`, `user_profiles` (bar the FR-7 name read).

## 3. Team deliberation

Convened 2026-08-21 over the research above. Positions, then the two genuine conflicts.

- **Dir. of Engineering:** In favor — the helper-function swap keeps the blast radius reviewable, the schema is additive, and the client's pull path needs nothing. Insists on: schema-PR isolation per the house rule (three separate schema PRs, §9), the helper hardened per the 047 precedent (pinned `search_path`, EXECUTE revoked), and **no policy references the helper in the same PR that creates it** — dark first, flip second.
- **Sr. Data Scientist:** Strongly in favor — this *removes* a structural bias in every denominator the engine consumes (single-writer under-counting is unmodeled missingness concentrated on exactly the contamination events the trial verdict hinges on). Two conditions: `logged_by` is write-once and backfills NULL (a fabricated backfill would poison any future two-caregiver analysis), and the catalog union must not let cross-account duplicate foods split a protein's exposure count silently — flag to the dedup track, and the protein canonicalizer (Class A, read-time) already absorbs most of it.
- **Dr. Chen:** The vet report gets *more* trustworthy — a two-writer record is closer to the household's ground truth, and the report never needs to render `logged_by` (the record speaks pet-centrically; Appendix-level provenance is a later call). Holds the C1 position above on trial lifecycle.
- **Jordan / Sam:** The invite must pass the 10-second test end-to-end (send from settings, partner taps link, signs up, sees the pets — no codes to transcribe). Sam flags the union library: her partner's "whatever was on sale" food entries now appear in her picker — acceptable because it's the household's real pantry, but recents-ordering should keep *her* recents first (HH-6 detail). Both flag: a caregiver must never feel second-class on the surfaces they're allowed to use — the owner-only walls need the Designer's explained-affordance treatment.
- **Sr. Product Designer:** The whole feature is two small surfaces (a Household settings section; a join screen) plus one register rule: attribution copy is a timestamp-grade fact, styled like metadata, never like a message. Empty state for the invitee ("You're caring for Biscuit now") is a designed moment (Principle 5). Holds the explained-wall position in C1.
- **Trust & Safety / Privacy:** In favor *of this shape specifically* because it's the anti-surveillance version: no feeds, no per-person stats, no partner-activity notifications (G1/G2 binding). Three hard requirements: (1) revocation must end server access instantly and purge the ex-caregiver's device best-effort (G4) — the abuse case is an ex-partner with a standing window into a household's daily routine (feeding times are location-and-schedule data about *people*, not just pets); (2) both deletion directions must be answered (owner deletes → links die, caregiver's mirror purges on next sync; caregiver deletes → their authored events *survive* as the pet's record with `logged_by` going NULL-equivalent via `ON DELETE SET NULL` — their identity leaves, the pet's history stays); (3) the invite link is a bearer credential — hashed at rest, single-use, short-lived, and the redeem screen must *name what's being granted* before the tap.
- **Sr. QA:** The deliverable QA holds the plan to is the §5 permission matrix — every cell is a test. Regression risk concentrates in HH-3 (the policy swap): the matrix must be exercised as *both* members *and* a third stranger account, and the B-354 suite re-run (catalog isolation against non-household strangers must not regress).
- **Product Owner:** CUL-194 stays the tracking issue; out-of-scope discoveries file new CUL issues (§11); B-293's recent cancellation should be PM-confirmed as deliberate before any doc treats it as dead.

**C1 — trial/regimen lifecycle control** — carried in D3 above (Dr. Chen vs Jordan; recommendation owner-only + explained wall).

**C2 — catalog scope** — Designer/Sam ("one household, one pantry — union feels right") vs Data Scientist (duplicate-minting worsens within-household dedup) vs Engineer (full migration is a second B-354). Resolved into D2's recommendation (union-read now, dedup flagged, migration deliberately not foreclosed) — surfaced rather than silent, but the team converged; the PM ratifies via D2 rather than adjudicating a live disagreement.

## 4. Requirements

**FR-1 — The link.** `caregiver_links`: `owner_user_id`, `caregiver_user_id` (nullable until redeemed), `status` (`invited`/`active`/`revoked`), `invite_token_hash` (raw token never stored), `token_expires_at` (~7 days), timestamps. Unique active link per pair; self-invite blocked; ~3 active links cap. RLS: owner full on own links; caregiver SELECT on links naming them; **no anon path, ever**. All lifecycle transitions via the `household-invite` Edge Function (service role, migration-026 pattern): `create` → mints + hashes token, returns deep link; `redeem` → validates hash/expiry/single-use under the *redeemer's* verified JWT; `revoke` → owner-only.

**FR-2 — The access swap.** `public.household_pet_ids()` — `SECURITY DEFINER STABLE`, pinned `search_path`, EXECUTE revoked from PUBLIC/anon (047 precedent): own pets ∪ pets of owners with an *active* link to `auth.uid()`. The 17 pet-scoped policies, 13 pet-keyed storage policies, and 4 guard triggers swap to it. `pets`: SELECT widens to membership; INSERT/UPDATE/DELETE stay owner-only. `pets.user_id` remains the single ownership root — no re-homing, no household entity.

**FR-3 — The seams.** Catalog SELECT union (D2) + `diet_trial_foods` WITH CHECK conjunct widened + `nyx-food-photos` SELECT widened + `nyx-medication-photos` SELECT extended to an active counterparty's prefix (writes stay own-prefix) + the 051 notification-prefs trigger made membership-aware.

**FR-4 — Invite UX.** Settings → Household: invite via share sheet (D5), member list (name + since-date), revoke with a plain-language consequence sheet. Redeem route survives signed-out → sign-up → redeem; the redeem screen names the grant ("You'll be able to see and log for {owner}'s pets") before the accept tap. All copy through `nyx-voice`.

**FR-5 — Membership-aware client.** Pet-list reads become RLS-driven (drop the `.eq('user_id')` chokepoints; audit all ~10 sites incl. archived-pets, switcher, onboarding). Owner-only actions render the Designer's explained wall for caregivers (D3). Cross-pet surfaces (safety banner) treat visible pets uniformly — a caregiver sees the same safety-first Home.

**FR-6 — Attribution.** `events.logged_by UUID DEFAULT auth.uid()`, write-once (trigger), FK `ON DELETE SET NULL`, backfill NULL (D4/G3). Local column via `COLUMN_UPGRADES`; carried through push mappers + hydrate SELECTs. Render: neutral metadata on event detail + Today rows, only when household >1; NULL renders nothing.

**FR-7 — Name resolution.** A narrow read path so `logged_by` renders as a first name: active counterparties may read each other's `display_name`/`first_name` **only** (a view or column-scoped policy — never the whole profile row).

**FR-8 — Revocation reality (G4).** Revoke → server access ends at once (RLS). Client: a post-hydration reconciler purges local rows (and App Group snapshot entries) for pets no longer in scope — per-pet, children-first, sharing the `LOCAL_WIPE_TABLES` ordering. Documented limitation: an offline ex-caregiver's device retains data until it next syncs; sign-out wipe is the backstop. Queued writes for revoked pets: RLS filters them at push; the existing pushRows set-comparison leaves them unsynced → the reconciler drops them with the pet's rows (never silently marked synced — the B-027 rule holds).

**FR-9 — Deletion, both directions (T&S).** Owner deletes account → pets cascade (unchanged), links die, ex-caregiver's mirror purges via FR-8 on next sync. Caregiver deletes account → their `caregiver_links` rows die, **their authored events survive** (the pet's record), `logged_by` → NULL via FK. `delete-account`'s plan gains the links table; export (B-041, when built) includes rows you authored on shared pets.

**FR-10 — No degradation.** Flag-off/unlinked accounts byte-identical in behavior; B-354 catalog isolation against *strangers* fully intact; single-user households see zero attribution chrome, zero new copy.

### The guardrail spine
- **G1 — Not a social layer.** No feeds, comments, reactions, per-person stats, completion scoreboards, or partner-directed nudges. Ever, in this track.
- **G2 — Attribution is a fact, never a lever.** `logged_by` renders as neutral provenance; the app never says "X hasn't logged", never compares caregivers, never notifies about a *person's* activity (the "caregiver echo" notification is out of scope and gated on its own future ruling).
- **G3 — No fabricated authorship.** Backfill NULL; write-once; unattributed renders nothing.
- **G4 — Revocation is real.** Instant server-side; best-effort device purge; named offline limitation; sign-out backstop.
- **G5 — The invite is never an RLS predicate.** Service-role Edge Function, hashed single-use expiring token (migration-026 precedent).
- **G6 — The owner remains the account of record.** `pets.user_id` unchanged; deletion cascades unchanged; a caregiver's own account and pets are untouched by the link.
- **G7 — Per-person stays per-person.** AI caps, legal acceptances, notification preferences, beta opt-ins — none pool across the household.

## 5. Permission matrix (QA contract — every cell is a test)

| Action | Owner | Caregiver (active) | Revoked / stranger |
|---|---|---|---|
| See pets / full record | ✓ | ✓ | ✗ |
| Log events, meals, doses, weights, vet visits/files, photos | ✓ | ✓ | ✗ |
| Edit / soft-delete events (any author's) | ✓ | ✓ *(LWW household-trust model, §2.3)* | ✗ |
| Run AI reads / Signal / Ask / report **(own per-user caps)** | ✓ | ✓ | ✗ |
| See counterparty's food/med catalog + photos | ✓ | ✓ (read-only) | ✗ |
| Create/edit own catalog items | ✓ | ✓ (own account's) | — |
| Pet lifecycle (create/edit/archive/photo) | ✓ | ✗ *(D3)* | ✗ |
| Trial lifecycle / target protein; regimen create/edit | ✓ | ✗ *(D3 — C1 pending)* | ✗ |
| Invite / revoke caregivers | ✓ | ✗ | ✗ |
| Read counterparty display/first name | ✓ | ✓ (that only) | ✗ |
| Delete account | own only | own only | own only |

## 6. Explicitly out of scope (v1)
Realtime convergence (D6) · per-pet grants · >1 role / read-only role · email invites · household-scoped catalog migration (D2b) · `logged_by` on the vet report · per-person notifications of any kind (caregiver echo — future ruling) · `vet_reports` re-key (flagged for Step 9 PR 6) · shared/pooled AI budgets · Android-specific invite handling beyond the deep link · the B-288 confirmation-push interplay (its per-person schedules compose naturally; its budget-unit question already lives on B-015/B-288).

## 7. Security review (`rls-privacy-reviewer`, spec-stage)

_Run this session against the proposed design + live migrations; findings below are baked into §4/§9. The reviewer re-runs on every RLS-touching PR (HH-1/HH-3/HH-4) per the standing rule._

**[PLACEHOLDER — findings pending; patched in before commit]**

## 8. Acceptance criteria (track-level)
1. An invited caregiver can, within 10 minutes of receiving a link: sign up, redeem, see the owner's pets, and log a meal that appears on the owner's device on next foreground.
2. Every §5 matrix cell passes as owner, caregiver, and stranger (integration tests, HH-9).
3. Revocation: server reads fail immediately; the ex-caregiver's device purges shared-pet rows on next sync; their own pets unaffected.
4. A single-member household is pixel- and behavior-identical to today (FR-10 snapshot-pinned where feasible).
5. `logged_by` never fabricated (NULL backfill; write-once enforced by trigger + test), never rendered in a comparative or absence-framing register (nyx-voice pass).
6. B-354 stranger-isolation suite still green; `get_advisors` clean after every schema PR.

## 9. PR plan

Sequencing: **HH-1 is the gate** — everything queues behind it. HH-2 ∥ HH-3 ∥ HH-4 once HH-1 lands. HH-7 ∥ HH-5/HH-6. Access flips server-side at HH-3 but is inert until HH-2+HH-5 make an invite redeemable — enforcement always precedes UI. Schema PRs are isolated per the house rule; `rls-privacy-reviewer` runs on HH-1, HH-3, HH-4 and re-runs at HH-9; migration pre-flights are all additive/destructive-n except where noted.

| PR | Scope | Gates / notes |
|---|---|---|
| **HH-1** (schema, gate) | Migration: `caregiver_links` + its RLS + `household_pet_ids()` (hardened: pinned search_path, EXECUTE revoked, STABLE). **Dark** — no existing policy references it yet. | rls-privacy-reviewer; pre-flight additive; advisors |
| **HH-2** (edge fn) | `household-invite` (create/redeem/revoke; hashed single-use token, expiry, cap, self-invite block). deno tests incl. replay/expiry/twice-redeem. Deploy per runbook. | ∥ HH-3/4 |
| **HH-3** (schema) | The swap: 17 pet-scoped policies + 13 storage policies + 4 guard triggers + `pets` SELECT widening → `household_pet_ids()`. | rls-privacy-reviewer (mandatory); B-354 stranger suite; rollback = restore prior policy text |
| **HH-4** (schema) | The seams: catalog SELECT union, `diet_trial_foods` WITH CHECK, food/med-photo storage SELECT, FR-7 name read, 051 trigger. | rls-privacy-reviewer; advisors |
| **HH-5** (client) | Household settings section + invite share flow + member list + revoke sheet + redeem deep-link route (incl. signed-out path). | pm-feature-review; nyx-voice |
| **HH-6** (client) | Membership-aware pet reads (all ~10 sites), D3 explained walls, FR-8 revocation reconciler + App Group purge, union-cache refreshers (own-recents-first ordering). | supabase-sync skill; matrix subset tests |
| **HH-7** (schema, small) | `events.logged_by` (+DEFAULT, NULL backfill, write-once trigger, `ON DELETE SET NULL`). | pre-flight: additive, backfill N/A-by-design |
| **HH-8** (client) | `logged_by` through write paths/mappers/`COLUMN_UPGRADES`/hydrates + attribution render (detail + Today, household>1) + FR-7 name resolution + voice pass. | nyx-voice; G2/G3 test-asserted |
| **HH-9** (hardening) | §5 matrix integration tests (3 personas × cells), weight-snapshot strictly-newer bound, `uuid()` → `expo-crypto`, edit-clobber disclosure line, delete-account plan update (FR-9), docs, dogfood TestFlight cut. | rls-privacy re-run; pm-feature-review; DoD full pass |

**Per-session kickoff prompts** (one PR per session; every PR references CUL-194):
- HH-1: *"B-292 HH-1: create the `caregiver_links` schema + `household_pet_ids()` helper per `docs/nyx-household-shared-care-requirements.md` §4 FR-1/FR-2 + §7. Schema-only PR, dark. Run rls-privacy-reviewer before pushing."*
- HH-2: *"B-292 HH-2: build the `household-invite` Edge Function per spec §4 FR-1 + §7 (migration-026 token pattern). deno tests for replay/expiry/double-redeem. Deploy per `docs/edge-deploy-runbook.md`."*
- HH-3: *"B-292 HH-3: swap the 17 pet-scoped + 13 storage policies + 4 guard triggers to `household_pet_ids()` per spec §4 FR-2. Schema-only. rls-privacy-reviewer mandatory; re-run the B-354 stranger-isolation suite."*
- HH-4: *"B-292 HH-4: the catalog/photo/name/notification seams per spec §4 FR-3 + FR-7. Schema-only. rls-privacy-reviewer."*
- HH-5: *"B-292 HH-5: the Household settings + invite/redeem surfaces per spec §4 FR-4. pm-feature-review + nyx-voice before push."*
- HH-6: *"B-292 HH-6: membership-aware client reads + owner-only walls + the revocation reconciler per spec §4 FR-5/FR-8."*
- HH-7: *"B-292 HH-7: the `events.logged_by` migration per spec §4 FR-6. Schema-only, additive, NULL backfill by design."*
- HH-8: *"B-292 HH-8: logged_by capture + attribution render per spec §4 FR-6/FR-7, G2/G3 test-asserted."*
- HH-9: *"B-292 HH-9: the hardening pass per spec §9 — permission-matrix tests, FR-9 deletion updates, dogfood cut."*

## 10. Known limitations & follow-ups (filed, not hidden)
- **LWW true-authorship fix** (client-authored timestamp the trigger respects) — the `lib/hydration.ts:17` deferral comes due *if* dogfood shows same-row cross-caregiver edits; file on first observed instance.
- **`generate-report` owner-name line** under a caregiver JWT names the caregiver — accepted until the B-494-gated redeploy; fold the fix there.
- **`generate-signal` tz read** uses the caller's profile — same-household tz assumption; revisit only if a split-tz household surfaces.
- **Cross-account duplicate foods** within a household — flagged to the dedup track (B-009/B-018).
- **`vet_reports`** stays `generated_by`-scoped until Step 9 PR 6 re-keys it (row filed).

## 11. Ripples
- **CLAUDE.md (Tier 1):** on D1 ratification — resolve the OQ row (move to `decisions-archive.md`), add the household exception line to the engineering constraint about `pet_id`+RLS tables (`caregiver_links` is account-pair-scoped by design).
- **Linear:** new issues to file at build kickoff — vet_reports re-key (Step 9 PR 6 dependency), LWW true-authorship (filed-on-evidence), dedup household note on the B-009/B-018 issues. B-293's cancellation → PM confirm.
- **Tier-2 docs:** `nyx-vet-files-requirements.md` §caregiver-access note resolves to "follows this spec"; `nyx-technical-spec` gains the membership model on its next refresh pass. Both flagged, not written.
