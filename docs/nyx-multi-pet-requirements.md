# Nyx — Multi-Pet v1 Requirements

**Status:** Build-ready. Spec'd 2026-06-12 from the PM-convened product-team review; mockups approved same day (`docs/mockups/multi-pet-v1-mockup.html`).
**Backlog anchor:** B-086. **Rides on:** the multi-pet-ready schema (every clinical table carries `pet_id`; `pets.is_active`; hydration already pulls all pets — `lib/sync.ts` §10 note).

---

## 0. Scope

**In v1:** add a pet; per-pet home with a switcher; device-local active-pet selection; pet identity in the log flow; per-pet free-feeding rows on food detail (mock frame B2); cross-pet safety breakthrough banner (mock frame A3); archive-only pet removal.

**Out of v1 (each deliberately deferred):**

| Deferred | Why | Where it lives |
|---|---|---|
| Move an event to another pet | PM call 2026-06-12. Recovery = delete + re-log (soft delete keeps engine integrity). Makes prevention (log-flow identity) load-bearing. | B-087 |
| Shared-bowl per-cat attribution (`is_shared` activation) | "Unsolved without hardware" (research 2026-05 §1/§4). Hook stays inert. | B-040 deferral list |
| Premium gating of multi-pet | PM: out of scope now; possibly premium later. Nothing here may prejudice either outcome. | Open Questions (freemium gate) |
| Nudge budget (per pet vs per account) | No notification infra yet. Designer lean recorded: per-account. | B-015 note |
| Household / linked accounts, per-user attribution | Orthogonal; v1 keeps the single shared login. | `multi-device-sync-requirements.md` §non-goals |
| True pet deletion (data removal) | Privacy track. Archive covers the UX need. | B-039 / GDPR Open Question |

## 1. Decisions log (PM, 2026-06-12)

1. **Per-pet home with a switcher** — the B-076 strip's avatar/name becomes the switcher tap-target; everything below (Signal, Today, Trend, History, Pet tab) follows the active pet.
2. **Active-pet selection is device-local** — persisted on-device, never synced. Rationale (PM): a synced selection would silently flip the pet under another caregiver's feet ("if she didn't consciously switch… she might not realize she's on another pet profile").
3. **Cross-pet safety banner: IN** (frame A3 ratified over A4). Contract in §4.
4. **Free-feeding capture: per-pet rows** (frame B2 / "Option A"). Food domain only — the 2026-06-09 "food belongs with food" decision stands; the pet page stays untouched.
5. **Pet identity leads the log sheet** ("Logging for {pet}" + pre-log flip). No move-to-pet in v1.
6. **Archive-only removal** — `pets.is_active = false`; hidden from switcher, history kept, reversible from "Archived pets." The schema comment already says exactly this.
7. **Premium out of scope.** Multi-pet ships free for now.
8. **Sam persona extends to a two-cat household** (Tier-2 personas.md edit; draft text in §10, awaiting PM sign-off on wording).

## 2. Data model — no schema changes

- **No new tables, no migrations.** `pet_id` is already on every clinical table; RLS already scopes via `pet_id → pets.user_id`; `feeding_arrangements` is already a per-pet join.
- **`pets.is_active` is formally "not archived"** (resolves the Dir-of-Eng ambiguity). Archive = direct update `is_active=false` + local mirror; un-archive reverses it. Last-write-wins as everywhere.
- **Active-pet selection:** persisted Zustand slice (AsyncStorage), storing the selected `pet_id` per device. Restore on launch; fall back to the oldest active pet (today's behavior); clear on sign-out (FR-9 wipe parity).
- **`petStore` grows `pets: Pet[]`** alongside `activePet`. `usePet` is rewritten: load *all* active pets, restore the persisted selection, then the existing retry/onboarding-guard logic applies to the *list* being empty, not a single row.

## 3. Surfaces

### 3.1 Header + switcher (mock A1/A2)
- The header chevron renders **only when `pets.length > 1`** — single-pet households never see multi-pet chrome (Jordan's condition). 44pt tap zone on the whole identity row.
- Tap → bottom sheet: "Your pets" — avatar, name, identity line per pet; active pet checked; tap switches + dismisses. Below the list: **"Add a pet"**; below that, a quiet **"Archived pets"** link (rendered only if ≥1 archived pet exists).
- Switching sets the persisted selection and `activePet`; every consumer already reads the store reactively (B-076 was built for this).

### 3.2 Add a pet (mock A2)
- Extract the onboarding pet form into a shared `PetForm` component; `app/onboarding/pet.tsx` keeps its account-coupled wrapper (`setOnboarded`, routing); a new `add-pet` route uses the bare form and returns to home with the new pet selected.
- New pet starts with designed empty states everywhere (they exist; QA verifies the contrast case — rich pet beside empty pet, §7).

### 3.3 Log-flow identity (mock B1)
- The FAB sheet leads with a "Logging for {pet}" chip — avatar + name + quiet flip affordance (opens the same switcher sheet). Flip is *before* logging; the log taps themselves are unchanged (Principle 1).
- Renders only when `pets.length > 1` (same no-chrome rule). All log paths (`log.tsx`, `food-capture.tsx`, FAB quick-symptoms) write the active pet's `pet_id` — audit per §6.

### 3.4 Free-feeding per-pet rows (mock B2)
- Food detail's "Always available" card becomes one toggle row per active pet (avatar + name + since-date), active pet sorted first. Single-pet households see today's single toggle, unchanged.
- Both-ON on the same food *is* the shared bowl, represented as two independent `feeding_arrangements` rows — engine ingestion (PR #123) already handles this per pet; `is_shared` stays inert.
- Food library "Always available" section labels each entry with the pet(s) it's down for.

### 3.5 Archive (mock B4)
- Quiet "Archive {pet}" action at the bottom of the Pet tab → confirm sheet (copy per mock: "Her history stays safe… bring her back anytime"). Archived pets: excluded from switcher, banner, signal regen, and per-pet surfaces; **history retained and hydrated** (events keep `pet_id`; nothing cascades).
- "Archived pets" screen: list + un-archive. If the *active* pet is archived, selection falls back to the oldest remaining active pet; archiving the **last** active pet is blocked with honest copy (the app requires one pet; true deletion is the Privacy track).

## 4. Cross-pet safety banner (mock A3) — contract

- **Trigger:** a **safety-class** finding (today: `intake_decline`, `symptom_worsening` — the detection engine's safety lane) present in the **cached** `ai_signals.findings` of a *non-active, non-archived* pet. Never any other finding class — reflections, correlations, descriptive lanes do not cross over.
- **Render:** at most **one** banner, above the Signal zone (it belongs to a different pet, so it must not read as the active pet's content): small avatar + one specific, calm sentence + chevron. Tap = switch active pet (one tap to the right home). Dismissible? **No** — it clears when the underlying finding clears, same as the Signal itself. If multiple other pets have safety findings, show the highest-ranked (intake-decline outranks worsening, per the existing ranking) — never stack.
- **Copy:** template-only, derived from the finding's existing short form; `validatePhrasing` rules apply (never reassure, never causal, no alarm language). The banner can only ever *escalate attention*; by construction it cannot reassure (absence of banner ≠ wellness — it's a cache read).
- **Freshness:** home reads cache only (hard constraint — no live LLM/engine calls on open). The existing daily-expiry regen must cover **all active pets**, not just the active one; the after-log debounce stays per-logged-pet. A stale or missing cache for the other pet renders nothing — acceptable v1 degradation, erring toward silence on a *cross-pet convenience surface* while the pet's own home stays the source of truth.
- **Adversarial review is mandatory** for the banner's selection/ranking logic (it's a clinical escalation surface feeding owner attention).

## 5. Engine & cost notes

- `generate-signal` already runs per pet; no detection changes. Daily regen × N pets multiplies Claude phrasing calls — bounded (N small, 24h TTL, template fallback), but noted against B-001's cost-cap item.
- Species-specific thresholds (feline 48h, etc.) already key off the event's pet via the engine input — QA regression-checks this in mixed-species households (§7).

## 6. Single-pet-assumption audit (rides with build PR 2)

Sweep and fix every surface that assumes one pet. Known list (grep targets, not exhaustive):
- `hooks/usePet.ts` — oldest-active-pet-wins (§2 rewrite).
- `hooks/useSignal.ts` / `lib/signal.ts` — regen + cache reads keyed to active pet only (§4 freshness).
- FAB recent-meals + picker Recent (B-019's staleness gets a per-pet dimension).
- Today/Trend zones, History filters, Pet tab — verify all read `activePet` reactively (B-076 pattern) rather than fetching pet-independently.
- Local SQLite mirrors + sync queue — confirm `pet_id` flows from the store at write time, not from a cached closure (the offline-queue-then-switch edge, §7).
- Onboarding `isOnboarded` flag — must mean "has ≥1 pet," not "has a pet named at signup."

## 7. QA edge cases (acceptance gates for the build PRs)

1. Offline: queue events for pet A, switch to pet B, reconnect → each event flushes with the `pet_id` it was *logged* under.
2. Two devices, different active pets, same account → no interference (selection is local; LWW untouched).
3. Mixed species: cat thresholds fire for the cat even while a dog is active.
4. Archive the active pet → clean fallback; archive-last-pet blocked; un-archive restores switcher presence and banner eligibility.
5. New pet beside a data-rich pet: every per-pet surface shows its designed empty state; the Signal building-state copy is honest per pet (B-051 class).
6. Banner: renders only for safety-class findings; never for the active pet; never stacks; disappears when the finding clears; tap lands on the right pet's home.
7. Per-pet free-feeding rows: toggling pet A never mutates pet B's arrangement; History ambient strip stays per-pet.
8. Single-pet account: zero visible change anywhere (no chevron, no chip, no banner, single toggle).

## 8. Build order — one PR per session, no schema PRs needed

| PR | Scope | Depends on |
|---|---|---|
| **1 (this one, #144)** | Mockups + this spec + header restyle to mock + backlog (B-086/B-087) | — |
| **2 — Foundation** | `petStore.pets[]` + persisted device-local selection; `usePet` rewrite; shared `PetForm` + add-pet route; §6 audit sweep | — |
| **3 — Switcher + archive** | Chevron lights up; switcher sheet; archive action + confirm + Archived-pets screen | PR 2 |
| **4 — Log-flow identity** | "Logging for {pet}" chip + pre-log flip across all log paths | PR 3 (reuses sheet) |
| **5 — Free-feeding per-pet rows** | Food detail rows + library labels | PR 2 |
| **6 — Cross-pet safety banner** | Banner + all-pets regen freshness; **adversarial review mandatory** | PRs 2–3; needs 2 pets with signals to QA |

PRs 4 and 5 are parallelizable after their dependencies. Step 9 (vet report) sequencing relative to PRs 2–6 is a PM roadmap call at each session start.

## 9. Voice notes (nyx-voice applies throughout)

- Banner: specific + calm — "Juniper hasn't finished a meal since Tuesday — worth a look." Never alarm, never reassure.
- Archive: warm + honest about reversibility — "Her history stays safe, and she comes off your pet list."
- Switcher/add-pet: plain — "Your pets," "Add a pet." No cuteness.

## 10. Sam persona extension — draft for PM sign-off (Tier 2, not yet applied)

> **Who Sam is:** 29, two indoor cats — Pixel (6yo domestic shorthair) and Juniper (2yo domestic shorthair, adopted this spring). Pixel is the fussy one; Juniper eats anything, including Pixel's leftovers — so Sam can rarely say for certain who ate what from a shared bowl. Sam's recurring pains: the cabinet of half-eaten cans Pixel rejected, and now the low-grade worry of telling two cats' habits apart — including who the vomit on the rug belongs to when nobody saw it happen.
>
> Additional "consulting Sam when": designing any multi-pet surface (switcher, per-pet toggles, cross-pet banner); evaluating whether a multi-pet affordance stays invisible for single-pet owners; any shared-bowl or attribution-confidence copy.

(Existing needs/anti-wants stay; the unwitnessed-incident attribution question feeds B-010's window model and the future B-040 attribution layer, not v1 scope.)
