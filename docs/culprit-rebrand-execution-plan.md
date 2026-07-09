# Culprit Rebrand — Execution Plan (name + icon + branding)

**Status:** Plan for review (v1) — awaiting PM greenlight to execute. No app code changed by this doc.
**Date:** 2026-07-08 · **Tracks:** [`B-274`](./backlog.md) (name) · [`B-275`](./backlog.md) (icon/brand)
**Purpose:** operationalize all the naming + branding work done so far into a concrete PR-by-PR sequence. This is the *orchestration* layer; it does **not** re-derive the detail that already lives in:

- [`docs/culprit-rename-requirements.md`](./culprit-rename-requirements.md) — the string-level *what-changes* (brand vs. pet-name vs. infra split). **Authoritative for PR A.**
- [`docs/culprit-icon-brand-direction.md`](./culprit-icon-brand-direction.md) + [`docs/brand/culprit-icon-design-brief.md`](./brand/culprit-icon-design-brief.md) — the "Moon & Signal" direction + the paste-into-design brief. **Authoritative for PR B.**

> **The whole job in one line:** flip **Nyx-the-brand → Culprit** everywhere a user or vet reads it; drop in the **Moon & Signal** icon; tokenise **midnight indigo** — while never touching **Nyx-the-cat** (fixtures) or **Nyx-the-infrastructure** (bundle ID, buckets, DB, scheme).

---

## 1. Decisions locked this session (2026-07-08)

| Decision | Choice | Consequence |
|---|---|---|
| **Icon sourcing** | **Wait for a design-produced master** | PR B is gated on the asset landing (the long pole). The string work (PR A) does **not** wait on it. |
| **Midnight-indigo token** | **Include now** | PM greenlights `colorBrandNight`. This **resolves** the CLAUDE.md open question ("adopt midnight indigo?") to **yes — additive & background-only** (teal stays the sole interactive accent). Exact value + `colorSurfaceDark` reconciliation lock inside PR C. |
| **This session** | **Plan only** | Deliver this doc for review; touch no app code. Execution (and the CLAUDE.md / STATUS.md / backlog updates that ride with it) happens on greenlight. |

**Doc updates deferred to greenlight** (flagged, not silently held): mark the CLAUDE.md indigo Open Question **Resolved**; advance **B-274 → in-progress**, **B-275 → in-progress**; correct `app-store-submission-guide.md:49` (rides PR A per rename-spec §3.7).

---

## 2. The plan at a glance

| PR | Scope | Ready to build? | Schema | Deploy |
|---|---|---|---|---|
| **A — Name + brand strings** | `app.json` `name`; all in-app wordmarks/copy; the vet-report brand strings; the 3 test files; the submission-guide doc line | ✅ **now** — no external dependency | none | **yes** — `generate-report` Edge Function |
| **B — App icon + splash** | Swap the 4 asset PNGs for the Moon & Signal master; night-ground splash/adaptive bg; iOS-18 dark/tinted config | ⛔ **gated** on the design master | none | no |
| **C — `colorBrandNight` token** | Tokenise midnight indigo in `theme.ts`; reconcile with `colorSurfaceDark` | ✅ **now** — PM greenlit; disjoint from A | none | no |

**Why three PRs, not one.** The rename spec's §10 imagines a single combined "name + icon" pass — that assumes the icon asset is in hand. Since the icon is the long pole (we chose "wait for a master"), collapsing everything into one PR would hold the trivial, submission-important, low-risk name flip hostage to studio artwork. Splitting lets PR A + PR C ship immediately and PR B land the moment the asset arrives. All three are in before the store build (guide step 10), which has other blockers ahead of it anyway (B-267, B-269).

> If the design master happens to land **before** PR A is built, A + B may be merged as one PR (the rename-spec §10 shape). Default assumption: they're separate.

---

## 3. PR A — Name + brand strings

**Goal:** every user-/vet-facing "Nyx" brand string reads **Culprit**; zero pet-name or infra strings touched. Advances **B-274**.

### 3.1 Files & sites
Authoritative list: **`culprit-rename-requirements.md` §3** (re-grep line numbers before editing — they drift). Summary:

- **Config:** `app.json:3` `name` `"Nyx"` → `"Culprit"` (drives `CFBundleDisplayName`, the home-screen label — the single most important change). Bundle ID / slug / scheme / `owner` / `projectId` / `updates.url` **unchanged**.
- **Auth:** `app/(auth)/index.tsx` (wordmark + 2 comments), `login.tsx` (wordmark), `signup.tsx` (×2 copy).
- **Home:** `components/home/HomeHeader.tsx` — `"Project Nyx"` → `"Culprit"` (drop the "Project" codename prefix) + 2 comments.
- **Onboarding:** `app/onboarding/paywall.tsx` `"Nyx Premium"` → `"Culprit Premium"`; `components/onboarding/ValuePreview.tsx` (2 body strings + 3 VoiceOver a11y labels + 1 comment). **Leave** the `nyx-voice` skill reference (infra).
- **Vet report** `supabase/functions/generate-report/render.ts` — brand only, pet name is dynamic (`snap.signalment.name`):
  - `:515` letterhead wordmark → Culprit
  - `:1581` footer wordmark → Culprit
  - `:805` body "…log weigh-ins in **Nyx**." → Culprit
  - **`:1669`** note "Photo findings are **Nyx's** read of the owner's photo…" → **Culprit's** — ⚠️ **this site is NOT in rename-spec §3.5; found by re-grep this session. Add it.**
  - `:1582` `Patient: ${…name}` → **leave** (dynamic pet name)
  - Keep the mechanism-not-brand AI attribution at `:666–667` ("automated photo analysis," never "a photo Culprit flagged"). Update the collision comments (`:667`, `:1574`) to note the name collision is now gone.

### 3.2 Tests (update in lockstep)
`app/(auth)/index.test.tsx` (wordmark), `components/onboarding/ValuePreview.test.tsx` (body + a11y), `supabase/functions/generate-report/render.test.ts:188` (`>Nyx<` → `>Culprit<`). **Do NOT change** the pet-name assertions in `render.test.ts` (`:49` fixture, `:857` title, `:1339` `Patient: Nyx`, `:220–223` anti-collision — stays valid, becomes trivially true).

### 3.3 Doc line
`docs/app-store-submission-guide.md:49` — correct the stale "the on-device name … stays as is" to reflect `app.json` `name` = `"Culprit"` (rename-spec §3.7).

### 3.4 Deploy
The vet report is **server-rendered** — a repo change to `render.ts` does not reach users until `generate-report` is redeployed. Deploy via Supabase MCP `deploy_edge_function` (`project_id aigchluqluzuhtbfllgh`; **preserve `verify_jwt=true`**), then verify version bump + `ACTIVE` + a JWT'd boot smoke-test. Per CLAUDE.md this is done from the build session — **not** a PM action item.

### 3.5 Review gates (DoD)
- **nyx-voice** — the reworded strings still pass (first-person-pet / no exclamation).
- **Designer** — wordmark/brand consistency across auth/home/onboarding/report.
- **`vet-report-cold-read`** — regenerate the real **Nyx** report → letterhead + footer say **Culprit**; **Patient line + `<title>` still say Nyx** (proves brand changed, pet didn't).
- **QA grep gate** — `git diff` touches no `nyx-*` bucket, `nyx.db`, `NyxEvent`/`NyxTabBar`, `scheme`, or test pet-name.
- `tsc --noEmit` clean; `npm test` green; `deno test` for `generate-report` green.

### 3.6 Risk / rollback
Config + copy only, **no schema, no data path**. Rollback = revert the PR (and redeploy the prior `generate-report` build). Blast radius: cosmetic. The one thing that *would* break users is a stray infra edit — the brand-vs-pet-vs-infra split (rename-spec §2/§5) is the guardrail; the grep gate is the check.

### 3.7 Acceptance criteria
Use **`culprit-rename-requirements.md` §9** verbatim, **plus**: the `render.ts:1669` site is changed and covered.

---

## 4. PR B — App icon + splash

**Goal:** the home-screen icon and splash are **Moon & Signal**, replacing the current placeholder (`assets/icon.png` today is a concentric-circle grid — no Nyx mark embedded, so nothing to "un-brand," just replace). Advances **B-275**.

### 4.1 Dependency (the gate)
Design delivers, per **`culprit-icon-design-brief.md`**:
- **1024×1024 master, no alpha** (App-Store face) — night ground `#13112E`, moonlight crescent `#F2EEE4`, teal Signal dot `#00C2A8`.
- **iOS-18 dark + tinted** icon variants.
- **Adaptive foreground** (Android) + **splash** + **favicon** exports.
- Crescent drawn true-curve + squircle-aligned (not two subtracted circles); Signal dot sized to survive **29 px** tray.

### 4.2 Code changes (config-light — `app.json` already points at these paths)
- Swap `assets/icon.png`, `assets/adaptive-icon.png`, `assets/splash-icon.png`, `assets/favicon.png`.
- `app.json`: set `splash.backgroundColor` and `android.adaptiveIcon.backgroundColor` `#ffffff` → the night ground `#13112E` (matches the icon field; hardcoded hex — `app.json` is static JSON and can't read a JS token, so it carries the value literally even though PR C tokenises the same hex for components).
- Wire iOS-18 dark/tinted icon config (Expo's iOS icon config) if the SDK/build target supports it; otherwise note as a native-config follow-up.

### 4.3 Review gates
- **Designer + `pm-feature-review`** — 40/29 px legibility (does the dot survive the tray?), competitor-grid differentiation (drop next to Calm / a sleep app / a vet app), greyscale/contrast proof.
- **On-device** — home-screen icon renders Moon & Signal; splash matches; label reads "Culprit" (needs PR A).

### 4.4 Acceptance criteria
- All required asset variants present and swapped in `assets/`.
- `app.json` grounds set to the night field; no alpha in the 1024 master.
- Legibility + differentiation + greyscale checks pass; on-device render confirmed.

---

## 5. PR C — `colorBrandNight` indigo token

**Goal:** tokenise midnight indigo as an **additive, background/world** brand colour — teal stays the one interactive accent. Advances **B-275** (palette half); resolves the CLAUDE.md indigo Open Question. Own PR per the brand-direction guidance ("its own PR — no interactive-accent change").

### 5.1 Scope
- Add to `constants/theme.ts`: `colorBrandNight: '#13112E'` and `colorBrandNightElevated: '#251F57'` (cards/depth on the night).
- Comment the rule at the token: **indigo = world/ground only (icon field, heroes, dark surfaces); never a tappable accent.** Teal (`colorAccent #00C2A8`) remains the sole interactive accent.
- **Reconcile with the existing `colorSurfaceDark '#101312'`** — the one open sub-decision inside this PR:
  - **(a) keep both** — indigo is the *brand* night, `colorSurfaceDark` stays the neutral photo/premium canvas (simplest; two dark tokens with distinct roles), **or**
  - **(b) repoint** existing `colorSurfaceDark` usages to indigo (one dark identity; larger diff + on-device dark-surface QA).
  - **Recommendation: (a) keep both**, documented — smallest blast radius, and the brand-direction frames indigo as *additive*, not a replacement. Lock with the Designer at build time.

### 5.2 Review gates
- **Designer / Dir. of Eng** — the "one interactive accent" system rule survives (indigo introduces no new tappable accent); the two-dark-token roles are legible.
- `tsc --noEmit` clean. If no component adopts the token yet, this is a pure additive token change (no visual regression); any surface repoint (option b) needs on-device dark QA.

### 5.3 Acceptance criteria
- `colorBrandNight` (+ elevated) present and documented as background/world-only; no interactive-accent repoint.
- `colorSurfaceDark` reconciliation decided and recorded.
- CLAUDE.md indigo Open Question marked Resolved with the locked value.

---

## 6. Sequencing & parallelism

```
now ──┬── PR A (name + report)   ──┐
      └── PR C (indigo token)    ──┤   disjoint files → run concurrently as
                                    │   separate sessions/branches
   design master lands ── PR B (icon) ──┘  (soft-prefers PR C merged first
                                            so the night-ground value is locked)
```

- **PR A ⟂ PR C** — fully independent (strings/`render.ts` vs `theme.ts`). Parallelizable as separate sessions. **Only shared-file collision: `STATUS.md` at each wrap.**
- **PR B** — gated on the external design asset (the single decision that unblocks the last piece). Soft-prefers PR C merged first (so `#13112E` is locked in one place), but the icon PNG bakes the colour regardless, so it's not hard-blocked.
- **Store build (guide step 10)** consumes all three — but sits behind other blockers (**B-267** iOS permission strings, **B-269** listing assets), so the rename shipping ahead of the icon is fine; both land before the build is cut.

---

## 7. Explicitly OUT of scope (tracked, not forgotten)

| Item | Backlog | Why deferred |
|---|---|---|
| Internal `Nyx*` code identifiers (`interface NyxEvent`, `function NyxTabBar`) | **B-276** | User-invisible; pure mechanical rename; kept out of the submission-critical PR to avoid diff noise. |
| Docs / codename sweep (`docs/*.md`, `CLAUDE.md`, `STATUS.md`, `nyx-*` filenames) | **B-277** | "Nyx" as the *internal codename* is fine and costs nothing; renaming files breaks cross-references. (Excludes the `nyx-voice` skill + `nyx-*` buckets — those are infra, never swept.) |
| Deep-link `scheme` `nyx://` → `culprit://` | **B-278** | Needs a coordinated Supabase redirect-allowlist update; user-invisible; do in a dedicated auth session. |
| Comment-only codename refs (`components/ui/TextField.tsx`, `components/dashboard/FrequencyCalendarCard.tsx`, `lib/*`, `constants/eventTypes.ts`) | folds into **B-277** | Comments, not user-facing. Optional to touch during PR A for tidiness. |

**PM / non-repo actions (required for a coherent brand at submission):**
- [ ] **Supabase auth email templates** — the magic-link / confirmation email still says "Nyx" (dashboard → Auth → Email Templates). Update to Culprit. (May overlap B-152 soft-verify work.)
- [ ] **App Store Connect** — store display name already locked "Culprit — Pet Health Tracker" (B-272 ✓); ensure the uploaded build's on-device name + icon match once PR A/B ship.
- [ ] **Design** — deliver the Moon & Signal master per `culprit-icon-design-brief.md` (unblocks PR B).

---

## 8. Definition of done — the whole rebrand
- [ ] `app.json` `name` = `"Culprit"`; **bundle ID unchanged** (`com.projectnyx.app`).
- [ ] Every §3 user-facing string (incl. `render.ts:1669`) reads Culprit; **zero** pet-name / infra strings changed.
- [ ] Vet report letterhead + footer + body say Culprit; **patient name renders dynamically** (regenerate the Nyx report → "Patient: Nyx" + title intact); `generate-report` **deployed**.
- [ ] Moon & Signal icon + splash swapped in; legibility/differentiation/greyscale pass; on-device render confirmed.
- [ ] `colorBrandNight` tokenised (background-only); teal still the one interactive accent; CLAUDE.md open question resolved.
- [ ] `tsc` clean; `npm test` + `deno test` green.
- [ ] Persona sign-offs per each PR's gates above.

---

## Persona sign-off (this plan)
Product Owner ✓ (three PRs mapped to B-274/B-275; deferrals to B-276/277/278 preserved) — Engineer ✓ (bundle ID / slug / buckets / DB / scheme held; deploy step named; token is additive/background-only) — Designer ✓ (Moon & Signal + indigo world colour; one interactive accent survives) — Dr. Chen / vet-report-cold-read ✓ (brand-not-actor attribution kept; patient name intact) — QA ✓ (brand-vs-pet-vs-infra grep gate is the guardrail; caught the `render.ts:1669` omission) — Trust & Safety ✓ (no data-path / bucket / RLS change in any PR).
