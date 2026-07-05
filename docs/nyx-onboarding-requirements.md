# Project Nyx — Onboarding Experience Requirements

**Version:** 1.0 (draft — awaiting build) | **Status:** Build-ready pending sub-decisions | **Last Updated:** 2026-07-05
**Owner:** PM (decisions) · Sr. Product Designer (flow/craft lead) · Dir. of Engineering (build) · Trust & Safety (store gates)
**Swimlane:** App-store readiness (siblings: B-039 account deletion, B-229 privacy policy, B-230 TOS, B-231 version display)

---

## 1. Context — why we're doing this

Onboarding today is **v0.1**: two screens (`app/onboarding/pet.tsx` capturing only pet name + species via `PetForm`; a skippable `app/onboarding/food.tsx`). It was enough to get the PM dogfooding, but it does not scale to a public release:

- **The owner is never identified.** Signup is bare email + password; there is no name field anywhere. `user_profiles` has a single nullable `display_name` written *later* as an optional Profile edit — the direct cause of vet reports printing "Owner: not recorded" until 2026-07-03.
- **No social login exists**, despite the technical spec listing "User can sign in with Apple ID" as an unmet Step-1 acceptance criterion and naming Apple Sign-In "required for App Store submission."
- **"Onboarding complete" is not persisted** — it's inferred from "user has ≥1 pet" on every cold start (`hooks/usePet.ts`), so a user who quits mid-flow is silently treated as done, with no progress indicator, no resumability, and no back-navigation.
- **Rich pet fields are never captured at setup.** Breed, gender, and age exist in the schema and in `EditPetModal`, but onboarding writes only `{name, species}`. `BreedPicker` (PR #259) was explicitly built to be reused here.

This project **burns down v0.1 and rebuilds** a short, functional, app-store-ready flow. The bar is *"functional and submittable,"* not *"the best onboarding ever"* — every screen is a funnel drop-off point, so restraint is a feature.

**Design inspiration reconciled** (Designer, as onboarding lead): **Pawfolio is the model** — one decision per screen, generous whitespace, skips everywhere, a dual integer-or-birthday age input, and a paywall *delayed until value is delivered*. **CompanAIn is the cautionary tale** — beautiful but a 15+ screen clinical intake; that data is exactly what Nyx captures *in-app*, not here. **The Pack** shows the optional value-carousel done warmly. Broader craft drawn on: deliver value before the signup wall (Duolingo), one-question-per-screen with visible progress, skippable > absent, and a warm payoff at the finish rather than a dump into an empty home.

---

## 2. Decisions ratified this session

| # | Decision | Source |
|---|---|---|
| **D1** | Scope = app-store-readiness swimlane; **functional & submittable, not best-ever.** | PM |
| **D2** | **Burn down v0.1** (the 2-screen flow) and rebuild fresh. | PM |
| **D3** | Capture **owner** (first name, last name, email) + **pet** (type, name, breed, gender, age). **No food/health data** in onboarding — captured in-app. | PM |
| **D4** | **Required = pet type + name only.** Breed, gender, age are prompted (own screens) but **skippable** and backfillable in-app. | PM (Q1) |
| **D5** | Capture **Pet_1 only** in onboarding; multi-pet via the existing in-app **add-pet** route + a closing "add more anytime" note. | PM |
| **D6** | Age uses a **dual input — integer (years/months) OR birthday.** Stored as `date_of_birth` (+ precision marker; see S2). | PM |
| **D7** | Auth v1: **email/password functional.** Apple + Google are **mocked** in the flow now and **specced/PR'd as a functional follow-up** (PR 9). Apple Sign-In is mandatory *alongside* Google when the functional social path ships (Apple's rule; email-only is exempt today). | PM (Q3) |
| **D8** | **Value-education carousel = a short 3-card, skippable** version. | PM (Q4) |
| **D9** | **Paywall = mocked, not wired.** Design the screen + reserve its flow slot (skippable), ship non-functional. We cannot spec what it sells yet — the freemium-gate question is open and Principle 7 keeps care free. | PM (Q2) |
| **D10** | **TOS + privacy-policy acceptance point is mocked** (B-230); the documents' content is built separately. | PM |
| **D11** | **No notification-permission ask** in v1 — the nudge/push system isn't built (push-provider question open); don't burn the one-shot iOS prompt before we have anything to send. | Team (Designer/Eng) |
| **D12** | Replace the fragile "≥1 pet" inference with a **durable onboarding-complete flag.** | Eng |
| **D13** | The design constitution's Onboarding section (`design-principles.md` §Interaction Principles → Onboarding: "minimum viable / required: name+species / 60 seconds") **must be revised** to match this flow. Proposed Tier-2 edit — **PM ratification required** (see §12). | Designer |

---

## 3. The target flow

Account-first (matches the PM's own ordering and the current architecture — pets write to Supabase under an authenticated `user_id`; there is no offline pet creation today). Delaying the signup wall behind pet creation is a known funnel optimization, deferred (see S4).

A visible **progress indicator** runs across the post-account pet-setup steps (S5 decides whether it spans the whole flow).

```
0. Welcome + value carousel  (3 cards, skippable)      ──▶ "Get started" / "Log in"
1. Create account            (owner: first, last, email, password; TOS/privacy; Apple/Google mocked)
   └─ 1a. Verify email       (soft "check your inbox" — enforcement deferred, S3)
2. Pet type                  Cat · Dog                 [REQUIRED]        ◀── progress starts
3. Pet name                                            [REQUIRED]
4. Breed                     BreedPicker (species-filtered)      [skippable]
5. Gender                    Male · Female             [skippable]
6. Age                       integer (yr/mo) OR birthday          [skippable]
7. Paywall                   mocked, non-functional    [skippable — "Maybe later"]
8. All set                   warm payoff → Home        (+ "add more pets anytime")
```

### 0 · Welcome + value carousel
- Three tight, swipeable cards; **skippable** via a persistent "Skip" and a "Get started" CTA; a small "Log in" affordance routes returning users to the existing login screen.
- Card themes (copy in §5): (1) frictionless logging, (2) understand your pet (the Signal), (3) vet-ready reports. Warm illustration, on-brand, no exclamation marks.
- This is the **new unauthenticated entry point** (replaces the current bare login-first landing). Users with a valid session + completed onboarding never see it.

### 1 · Create account
- Fields: **First name**, **Last name**, **Email**, **Password** — built on a new shared `TextField` primitive (see PR 3). Inline validation (valid email, password length) surfaced calmly, not as red-alarm.
- On submit: `supabase.auth.signUp({ email, password })`; on success write **`first_name`, `last_name`, and a derived `display_name = "First Last"`** to `user_profiles` (keeps `generate-report`'s existing `display_name` read working — no report change needed).
- **Apple + Google buttons are part of the design**, behind a feature flag (`SOCIAL_AUTH_ENABLED`, off in v1). Rendered so the layout is final; PR 9 flips the flag on. (Test-build treatment vs hidden-for-submission — small call, noted in PR 9.)
- **TOS + privacy acceptance:** a single line beneath the CTA — "By continuing you agree to Nyx's Terms and Privacy Policy" — with the two terms as tappable links (mocked destinations per B-230/B-229). No separate checkbox screen.

### 1a · Verify email (soft)
- If Supabase email confirmation is on, show the existing "check your inbox" state (`signup.tsx` already branches on `!data.session`) with a **resend** affordance and a way to proceed. **Enforcement (hard gate before entry) is deferred** to the store-readiness hardening pass (S3).

### 2 · Pet type — REQUIRED
- Two large tiles/chips: **Cat · Dog** (onboarding drops the enum's `other`; the value stays for the in-app add-pet path). No default selection — an explicit tap advances.

### 3 · Pet name — REQUIRED
- Single `TextField`. Advancing requires a non-empty name (the only two hard-required fields are type + name).

### 4 · Breed — skippable
- **`BreedPicker`** (species-filtered via `breedsForSpecies`), search + capped list + always-reachable "Other / not listed" free text. A prominent **Skip** advances with `breed = null`.

### 5 · Gender — skippable
- Two chips: **Male · Female**. Skip → stored as `sex = 'unknown'` (no neuter status in onboarding; that's a clinical field for in-app/profile).

### 6 · Age — skippable (dual input)
- A segmented toggle: **Age** (two wheels: years + months) or **Birthday** (date picker, `maximumDate = today`). Skip advances with `date_of_birth = null`.
- **Storage:** always resolves to `date_of_birth`. Birthday → exact date, `date_of_birth_precision = 'exact'`. Integer → an anchored approximate DOB (`today − years/months`, anchor convention per S6), `date_of_birth_precision = 'approximate'`. Downstream surfaces (Profile, vet report) render approximate ages honestly ("~2 years old"), never as a witnessed birthday (Dr. Chen / Data Scientist honesty guardrail).

### 7 · Paywall — mocked, skippable
- A designed upgrade screen slotted here (after value is delivered, per Pawfolio), **non-functional** — no purchase, no StoreKit. A clear "Maybe later" / "Skip for now" advances. Copy avoids implying any care feature is gated (Principle 7).

### 8 · All set — warm payoff
- A brief completion moment ("You're all set — say hi to {petName}") then routes to Home (which has its own designed empty state, Principle 5). We do **not** force a first log here (the finish line for v0.1's constitution was "first event logged"; D13 revises this — see §12).
- On reaching this screen, write **`onboarding_completed_at = now()`** (D12) — the durable gate, replacing the "≥1 pet" inference.
- A quiet closing line: "Got more than one pet? You can add {them} anytime from your profile."

---

## 4. Data model & schema changes

The `pets` table already holds species, name, breed, sex, and date_of_birth — capturing them at onboarding is mostly **wiring existing columns into the flow**. Two additive, schema-isolated migrations are needed:

**Migration A — owner profile** (next available number, e.g. `027_user_profile_names.sql` — main took 025/026 via #282/#283)
```sql
ALTER TABLE user_profiles ADD COLUMN first_name              TEXT;
ALTER TABLE user_profiles ADD COLUMN last_name               TEXT;
ALTER TABLE user_profiles ADD COLUMN onboarding_completed_at TIMESTAMPTZ;
-- display_name retained; written = trim(first_name || ' ' || last_name) at account creation,
-- so generate-report's existing display_name read is unaffected.
```
- **Migration Safety Pre-flight:** additive · **Destructive: n** · nullable, no default · **Backfill: N/A** (existing accounts keep null names + a null `onboarding_completed_at`; they're already past onboarding, so routing treats null-but-has-a-pet as complete — see §6). **Rollback:** `DROP COLUMN` ×3.
- RLS: `user_profiles` already has owner-scoped policies; new columns inherit them. `rls-privacy-reviewer` light check that no policy widens.

**Migration B — age precision** (e.g. `028_pet_dob_precision.sql`) — *gated on S2*
```sql
CREATE TYPE dob_precision AS ENUM ('exact', 'approximate');
ALTER TABLE pets ADD COLUMN date_of_birth_precision dob_precision NOT NULL DEFAULT 'exact';
```
- **Pre-flight:** additive · **Destructive: n** · default `'exact'` (existing DOBs came from the birthday picker → exact is correct) · **Backfill: N/A**. **Rollback:** `DROP COLUMN` + `DROP TYPE`.

**No change to `pets` for type/name/breed/gender/birthday** — all exist. Onboarding UI offers a **2-value type picker** (Cat/Dog) over the 3-value enum; the enum is untouched. **No local SQLite pets table** exists (pets load live from Supabase); onboarding requires connectivity, which account creation requires anyway — acceptable, and out of scope to change here.

**TypeScript:** extend the `Pet` interface consumers already use; introduce a real `UserProfile` type (`{ first_name, last_name, display_name, timezone, onboarding_completed_at }`) to replace the inlined shapes at each call site.

---

## 5. Copy (nyx-voice)

First-person pet / second-person owner, specific over generic, no exclamation marks, warm-not-cute. Draft copy — `nyx-voice` skill reviews at build.

- **Carousel 1 (logging):** "Log a symptom or a meal in a few taps — even one-handed at 2am."
- **Carousel 2 (Signal):** "Nyx watches for patterns you can't, and tells you what they mean — not just what happened."
- **Carousel 3 (report):** "When you see the vet, hand them a clear, clinical summary — free, always."
- **Account CTA:** "Create your account" · TOS line: "By continuing you agree to Nyx's Terms and Privacy Policy."
- **Pet type:** "Who are we tracking?" (subtitle: "You can add more pets later.")
- **Pet name:** "What's your pet's name?"
- **Breed skip:** "Skip — you can add {name}'s breed anytime."
- **Age header:** "How old is {name}?" (subtitle: "An age or a birthday — whichever you know.")
- **Age skip / rescue case (Sam):** "Not sure? Skip it — an estimate is fine later."
- **Paywall skip:** "Maybe later."
- **Completion:** "You're all set — say hi to {name}." + "Got more than one pet? You can add them anytime from your profile."

---

## 6. Edge cases & states

- **Returning user, mid-flow quit:** the durable `onboarding_completed_at` (null) + presence of a pet decides routing. Rule: **onboarding is complete when `onboarding_completed_at` is set.** A user who created an account but no pet resumes at the pet steps; a user with a pet but null completion (legacy dogfood accounts) is treated as complete (they predate this flow — don't re-onboard them). Legacy detection: `onboarding_completed_at IS NULL AND has ≥1 pet → treat complete`.
- **Email already registered:** reuse the existing empty-`identities` detection in `signup.tsx`; route to login with a calm message.
- **Email confirmation on vs off:** flow handles both (existing branch); with confirmation on, 1a shows the soft verify state.
- **Skip everything:** type + name are the only walls; a user can reach Home with a bare Cat/Dog + name pet. Every skipped field has an in-app backfill (Profile / EditPetModal).
- **Offline at account creation:** signup + pet insert require connectivity (no local pet table); show an honest "you'll need a connection to finish setting up" state rather than a silent failure. Not a new offline pipeline.
- **Back-navigation:** the rebuilt flow supports back between steps (v0.1 had none), preserving entered values.
- **Every screen has a designed state** — no blank/broken intermediate (Principle 5; QA verifies).

---

## 7. Deliberately excluded from v1 (with rationale)

- **Food / diet / health-condition capture** — captured in-app (D3); the food-library-redesign track makes in-app food add cheap. *Consequence:* the food library starts empty, so the *first* meal log is an entry, not a confirmation — a minor softening of Principle 2's "pre-populated from onboarding" clause (flagged in §12).
- **Notification-permission prompt** (D11).
- **Functional social login** — mocked now, PR 9 later (D7).
- **Functional paywall / purchases** — mocked now (D9).
- **Second-pet capture in onboarding** — in-app only (D5).
- **Neuter/spay status, weight, microchip, photo** — in-app Profile fields; not onboarding.
- **Delayed-signup-wall (pet-before-account)** — funnel optimization, deferred (S4).

---

## 8. Open sub-decisions (build-time — not PM-blocking)

| # | Decision | Recommendation |
|---|---|---|
| **S1** | Owner name: structured `first_name`/`last_name` columns vs concatenate into `display_name` only. | **Add the columns** (Migration A) — cleaner personalization + keeps a clean `display_name` for the report. |
| **S2** | Age precision: add `date_of_birth_precision` (Migration B) vs store integer-entered ages as precise DOBs. | **Add the marker** — Dr. Chen/Data Scientist honesty guardrail (don't render a computed birthday as witnessed). Small; drop only if PM wants v1 simpler and accepts the false-precision. |
| **S3** | Email verification: soft (v1, allow-in + nudge) vs hard gate (block entry until verified). | **Soft in v1** (matches "email-only for now"); hard-gate in the store-readiness hardening pass — needs deep-link handling. |
| **S4** | Signup-wall placement: account-first (v1) vs pet-first/account-last (funnel-better, needs client-held pet state + no local-pets architecture change). | **Account-first for v1**; log the delayed-wall as a future A/B (backlog). |
| **S5** | Progress indicator scope: pet-steps only vs whole post-account flow. | **Whole post-account flow** if cheap; pet-steps minimum. |
| **S6** | Integer-age anchor convention for the approximate DOB (first-of-month vs today-minus-exact). | **Today − entered duration**, precision='approximate' so the anchor is never shown as exact. |
| **S7** | Mocked Apple/Google in the built app: shown-disabled-with-"coming soon" (test build) vs hidden-behind-flag (cleaner store build). | Show in design; **hide in the built app when the flag is off** for a clean submission, surface in mocks; PR 9 flips on. |

---

## 9. PR plan

Schema-isolated, one concern per PR. Order: schema → primitives → screens → wiring → social follow-up.

| PR | Title | Contents | Schema? | Reviews |
|---|---|---|---|---|
| **1** | Owner-profile schema | Migration A (first/last name + `onboarding_completed_at`); `UserProfile` type; write derived `display_name`. | ✅ (isolated) | `rls-privacy-reviewer` (light), supabase-sync |
| **2** | Age-precision schema | Migration B (`date_of_birth_precision`) — *gated on S2*. | ✅ (isolated) | Data Scientist / Dr. Chen sign-off |
| **3** | Design-system primitives | New `TextField` primitive; `PrimaryButton` `loading` prop; consolidate onboarding/auth onto `ChipGroup`/`PrimaryButton`. | ❌ | code-reviewer |
| **4** | Account creation | Owner first/last/email/password; inline validation; TOS/privacy line (B-230 mock); Apple/Google buttons behind `SOCIAL_AUTH_ENABLED` (off); soft verify state; write names + display_name. | ❌ | code-reviewer, nyx-voice, rls-privacy (auth path) |
| **5** | Welcome + value carousel | 3 skippable cards; new unauthenticated entry point; "Log in" affordance; routing. | ❌ | Designer, nyx-voice, pm-feature-review |
| **6** | Pet-setup flow | type → name → breed (`BreedPicker`) → gender → age (dual input); progress indicator; skips; back-nav; writes all captured pet fields + precision. | ❌ | Designer (Principles 1/5), Jordan+Sam, code-reviewer, nyx-voice |
| **7** | Paywall mock | Non-functional, skippable, slotted screen; Principle-7-safe copy. | ❌ | Designer, nyx-voice |
| **8** | Completion + gate wiring | "All set" payoff → Home; write `onboarding_completed_at`; replace the ≥1-pet inference; returning-user + legacy-account routing (§6). | ❌ | code-reviewer, QA (routing edge cases), pm-feature-review |
| **9** | *(follow-up, specced now)* Functional Apple + Google sign-in | `expo-apple-authentication` + Google OAuth; deep-link handling; flip `SOCIAL_AUTH_ENABLED`; backfill names from the provider. **Apple mandatory alongside Google** (Apple's rule). | ❌ | rls-privacy-reviewer (new auth paths), code-reviewer |

Parallelism: PRs 1 & 2 (schema) and PR 3 (primitives) are independent and can run concurrently; PRs 4–8 depend on 1 & 3. Shared-file collision to expect at wrap: `STATUS.md`.

---

## 10. Acceptance criteria (supersedes technical-spec §2 Onboarding for this flow)

- New users land on the **welcome/carousel**, not a bare login.
- Account creation captures **owner first name, last name, email**; `user_profiles.first_name`/`last_name`/`display_name` are written.
- **Only pet type + name are required**; breed, gender, and age are each reachable, skippable, and — when entered — persisted correctly (age via either input; precision recorded).
- A **progress indicator** is visible through pet setup; **back-navigation** preserves entered values.
- **Apple/Google** appear in the design (flag off in v1); **email/password is fully functional**.
- **TOS/privacy acceptance point** is present (mocked links).
- The **paywall** screen appears and is fully skippable with no purchase.
- **`onboarding_completed_at`** is set at completion; returning users skip onboarding; legacy (has-pet, null-completion) accounts are not re-onboarded.
- Every screen has a **designed state**; the flow is completable one-handed; no dead ends.
- **No food step, no notification prompt.**
- Existing Step-1 auth criteria still hold (session persists; unauthenticated users can't reach app screens; a `user_profiles` row exists for every user).

---

## 11. Review routing & DoD notes

- **Not clinically/statistically load-bearing** overall → no `adversarial-reviewer` gate — **except** the age-precision honesty rule (S2/Migration B), which gets a Data Scientist / Dr. Chen sign-off (don't render computed DOBs as witnessed).
- **`pm-feature-review`** on the assembled flow (PRs 5, 6, 8) — the fresh-eyes product walk as Jordan/Sam; pairs with on-device QA.
- **`nyx-voice`** on all copy; **`rls-privacy-reviewer`** on the auth path (PR 4) and the social paths (PR 9); **`supabase-sync`** on the profile write.
- **QA** owns the routing/edge matrix in §6 (mid-flow quit, legacy accounts, email-already-registered, offline).
- **Persona sign-off line** required per PR.

---

## 12. References & backlog reconciliation

**Docs:** `docs/personas.md` · `docs/nyx-design-principles-v1_0.md` (§Interaction Principles → Onboarding, **to be revised — D13**) · `docs/nyx-technical-spec-v1_0.md` (§1 Auth, §2 Onboarding) · `docs/nyx-schema-v1_0.sql` · competitor teardown (The Pack / Pawfolio / CompanAIn, this session).

**Proposed Tier-2 doc edit (PM ratification required):** revise `design-principles.md` §Onboarding. Current text ("Minimum viable onboarding. Required: pet name, species. Optional but prompted: primary food. First log possible within 60 seconds. Onboarding is complete when Jordan logs their first event.") no longer matches: this flow adds owner identity + optional pet richness + store gates, drops the food step, and moves the finish line from "first event logged" to "profile created → land on a warm empty home." Also soften Principle 2's "food library pre-populated from onboarding" → "…on first meal log" (food capture moved in-app). Do **not** edit until the PM ratifies.

**Backlog reconciliation:**
- **B-251** (new) — this project (Onboarding experience revamp). Priority **Next** (app-store-readiness swimlane).
- **B-210** (breed capture in onboarding) — **subsumed** by PR 6; close on merge.
- **B-038** (onboarding food-format subset drift) — **mooted** (the onboarding food step is removed); close as won't-fix-by-removal.
- **B-230** (TOS) / **B-229** (privacy policy) — this flow provides the **acceptance point**; the documents' content remains those items' scope.
- **B-217** (WSAVA previous-diet capture) — explicitly **not** here (no diet data in onboarding); stays its own item.
- **B-231 / B-039** — sibling store-readiness items, not touched here.
