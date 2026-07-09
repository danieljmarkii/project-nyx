# Culprit — Name Rebrand Requirements (Nyx → Culprit)

**Status:** Build-ready spec (v1) — awaiting execution. This is the **naming half** of the Culprit brand pass; the **icon/visual half** lives in [`docs/culprit-icon-brand-direction.md`](./culprit-icon-brand-direction.md) + [`docs/brand/culprit-icon-design-brief.md`](./brand/culprit-icon-design-brief.md).
**Date:** 2026-07-08 · **Tracks:** [`B-274`](./backlog.md) (Nyx → Culprit rebrand — this spec) · pairs with **B-275** (finalise the icon/brand identity).
**Why now:** The App Store display name is locked as **"Culprit — Pet Health Tracker"** (B-272, done 2026-07-08). The on-device icon label and in-app brand strings still say **Nyx** (the original codename — the PM's cat is also named Nyx). This spec inventories exactly which strings become "Culprit," which must **not**, and in what order.

> **The whole game in one sentence:** replace **Nyx-the-brand** with **Culprit**; never touch **Nyx-the-pet**; leave **Nyx-the-infrastructure** alone.

---

## 1. Purpose & how to use this doc

This is the *what-changes* spec that a future **combined "name + icon" session** executes against, alongside the icon master that design produces from `culprit-icon-design-brief.md`. It exists so that session doesn't have to re-derive the brand-vs-pet-vs-infra split (the reason this isn't a search-and-replace).

Read this file when: executing B-274, or touching any user-facing brand string. Read it *with* `culprit-icon-brand-direction.md` — the two together are the first brand pass.

---

## 2. The core principle — "Nyx" wears three hats

Every one of the ~1,560 `nyx`/`Nyx` matches in the repo is exactly one of these. The category, not the string, decides what happens:

| Hat | What it is | Action | Why |
|---|---|---|---|
| **① Brand** | The app name a user or vet *reads on screen* ("Nyx", "Project Nyx", "Nyx Premium", the vet-report letterhead) | **→ "Culprit"** | This is the deliverable. |
| **② Pet** | "Nyx" as a *pet name* in sample/seed/test data (the PM's cat) | **Never change** | It correctly models a pet named Nyx; renaming it would be wrong, not just unnecessary. |
| **③ Infrastructure** | Bundle IDs, Storage buckets, local DB name, storage keys, Expo slug, deep-link scheme, internal type/component names | **Do not change** (see §5) | User-invisible; changing them is destructive or breaks App Store / OTA / auth / existing data. |

A blind find-and-replace corrupts ② and ③. Every edit below is hand-verified against its surrounding context.

---

## 3. IN SCOPE — user-facing brand strings (the B-274 deliverable)

Small and surgical: **~14 strings across 8 files**, plus 3 test files that assert them. Line numbers are as of base `08c5b4b` (2026-07-08) — re-grep before editing, they drift.

### 3.1 App config

| File · line | Current | Change to | Notes |
|---|---|---|---|
| `app.json:3` | `"name": "Nyx"` | `"name": "Culprit"` | Drives `CFBundleDisplayName` — the label under the home-screen icon. **The single most important change.** Config-only, low-risk. |

### 3.2 Auth screens

| File · line | Current | Change to |
|---|---|---|
| `app/(auth)/index.tsx:69` | `<Text style={styles.wordmark}>Nyx</Text>` | `Culprit` |
| `app/(auth)/login.tsx:49` | `<Text style={styles.wordmark}>Nyx</Text>` | `Culprit` |
| `app/(auth)/signup.tsx:141` | `'Check your inbox for the link from Nyx.'` | `…from Culprit.` |
| `app/(auth)/signup.tsx:341` | `By continuing you agree to Nyx's` | `…agree to Culprit's` |

Also update the explanatory comments in `app/(auth)/index.tsx` (lines ~28, ~153 reference "Nyx" the brand) for accuracy.

### 3.3 Home

| File · line | Current | Change to |
|---|---|---|
| `components/home/HomeHeader.tsx:37` | `<Text style={styles.wordmark}>Project Nyx</Text>` | `Culprit` (drop "Project" — that was the codename prefix) |

Update the comments at `HomeHeader.tsx:12` and `:79` ("Project Nyx" wordmark) to match.

### 3.4 Onboarding

| File · line | Current | Change to |
|---|---|---|
| `app/onboarding/paywall.tsx:108` | `Nyx Premium` | `Culprit Premium` |
| `components/onboarding/ValuePreview.tsx:28` | `'Nyx tells you what the data means…'` | `Culprit tells you…` |
| `components/onboarding/ValuePreview.tsx:32` | `"…it's what lets Nyx catch what's changing."` | `…lets Culprit catch…` |
| `components/onboarding/ValuePreview.tsx:44` | a11y: `'Preview of a Nyx insight: …'` | `Culprit` |
| `components/onboarding/ValuePreview.tsx:45` | a11y: `'Preview of the Nyx quick-log: …'` | `Culprit` |
| `components/onboarding/ValuePreview.tsx:46` | a11y: `'Preview of a Nyx vet summary: …'` | `Culprit` |

The `.tsx:44-46` strings are accessibility labels (read aloud by VoiceOver) — user-facing, so they count. Update the "Nyx UI" comment at `ValuePreview.tsx:9` too. **Leave** the `nyx-voice` reference at `:22` — that's the skill name (§5, infra).

### 3.5 Vet report (the shared artifact — a vet reads it) — the one tricky surface

`supabase/functions/generate-report/render.ts` prints "Nyx" as **both brand and patient name**. Change **only** the brand wordmark + brand body copy; the patient-name renders are dynamic (`snap.signalment.name`) and are correct.

| File · line | Current | Action |
|---|---|---|
| `render.ts:515` | letterhead masthead `<span class="wordmark">Nyx</span>` | **→ Culprit** (brand) |
| `render.ts:1581` | footer `<span class="w">Nyx</span>` | **→ Culprit** (brand) |
| `render.ts:805` | body: `…the owner can log weigh-ins in Nyx.` | **→ …in Culprit.** (brand) |
| `render.ts:1582` | `Patient: ${h(snap.signalment.name)}` | **Leave** — dynamic pet name |

**Two design notes the executor must preserve:**
1. The report **deliberately does not name the app as the actor** of an AI read. `render.ts:666-667` attributes flags to *"automated photo analysis,"* never "a photo Nyx flagged," precisely because the app name collided with the patient's name. Keep that mechanism-not-brand attribution as-is (once the brand is "Culprit" the collision is gone, but the phrasing is still the correct clinical voice).
2. The `Patient:` label (`render.ts:1574-1575` comment) exists to disambiguate pet-name from app-name. It's harmless to keep and good PIMS practice; update the *comment* to note the collision no longer exists, but keep the label.

### 3.6 Tests that assert the strings above (update in lockstep)

| File · line | Current assertion | Change |
|---|---|---|
| `app/(auth)/index.test.tsx:23,25` | wordmark text `'Nyx'` | → `'Culprit'` |
| `components/onboarding/ValuePreview.test.tsx:13` | `/Nyx tells you what the data means/` | → `Culprit` |
| `components/onboarding/ValuePreview.test.tsx:31` | `/Preview of a Nyx vet summary/` | → `Culprit` |
| `supabase/functions/generate-report/render.test.ts:188` | `html.includes('>Nyx<')` — matches the **brand wordmark** only | → `>Culprit<` (and, if desired, add a separate assertion that the pet name still renders) |

**Do NOT change** these pet-name assertions in the same file: `render.test.ts:49` (`name: 'Nyx'` fixture), `:857` (`<title>Owner-reported summary — Nyx`), `:1339` (`Patient: Nyx`), and `:220-223` (the anti-collision test — it asserts the app name is *absent* from AI attribution; it stays valid and becomes trivially true).

### 3.7 One stale doc line to correct (not app code, but part of this PR)

`docs/app-store-submission-guide.md:49` currently reads *"the on-device name (`app.json` `name: "Nyx"` — that one stays as is)."* That predates the Culprit decision and is now wrong. Update it to reflect that `app.json` `name` becomes `"Culprit"` (this spec / B-274).

---

## 4. There is no central app-name constant

The brand is **hardcoded inline** at each of the ~14 sites above — there is no `APP_NAME`/`PRODUCT_NAME` constant. Introducing one (`constants/…`) is optional future-hygiene, not required for this pass, and would be a *new pattern* (trips the future-self-review bar). Recommendation: do the inline replacements now; if a second rename ever looms, extract a constant then. Logged as a note, not a task.

---

## 5. OUT OF SCOPE — do NOT change (and why)

These match `nyx` but are **not brand**. Changing them ranges from pointless to destructive. None are visible to a user.

### 5.1 Identity & infrastructure — changing these breaks things

| Thing | Where | Why it must stay |
|---|---|---|
| **Bundle ID** `com.projectnyx.app` | `app.json` `ios.bundleIdentifier`, `android.package` | **Immutable** once registered in App Store Connect / Play. It *is* the ASC record's identity (Apple ID `6777691423`). Changing it = a brand-new app, throwing away the TestFlight build + store record. Explicitly confirmed in B-274. |
| **Expo `slug`** `project-nyx`, **`owner`** `project-nyx`, **`projectId`**, **`updates.url`** | `app.json` | EAS project + OTA-update linkage. Changing breaks `eas update` to installed builds. |
| **Deep-link `scheme`** `nyx` | `app.json:9` | Used for the auth/magic-link redirect. Changing needs a coordinated Supabase redirect-allowlist update and breaks existing links. User-invisible. Deferred (see §8 / backlog). |
| **Storage buckets** `nyx-pet-photos`, `nyx-event-attachments`, `nyx-food-photos`, `nyx-vet-attachments`, `nyx-medication-photos` | ~15 code sites (`lib/storage.ts`, `lib/sync.ts`, `app/*`, migrations `006/008/021/025`) | Renaming a bucket orphans **every already-uploaded photo** and its RLS policies. Bucket names are not brand-bearing to users. |
| **Local DB filename** `nyx.db` | `lib/db.ts:20` | Renaming orphans all on-device SQLite data on the next app update (creates a fresh empty DB). |
| **AsyncStorage key** `nyx.activePetId` | `store/petStore.ts:26` | Renaming loses the stored active-pet selection for every existing user. |
| **SVG gradient id** `nyx-completion-glow` | `components/ui/CompletionMoment.tsx:15` | Internal DOM id; not user-visible. |
| **npm package name** `project-nyx` | `package.json:2` | Internal; harmless; not worth the diff. |

### 5.2 Pet name "Nyx" (the cat) — never touch

All `petName: 'Nyx'` / `name: 'Nyx'` / possessive `Nyx's` in **test fixtures and sample data**: `lib/dashboardCards.test.ts`, `lib/metricDetail.test.ts`, `lib/signalCopy.test.ts`, `lib/pdf.test.ts`, `lib/medications.test.ts`, `app/insights/*.test.tsx`, `components/dashboard/*.test.tsx`, `supabase/functions/generate-report/{report,render}.test.ts`, etc. These correctly represent a pet named Nyx. Leaving them is *authentic* (it's literally the app's origin pet), and the PM's explicit instruction.

### 5.3 `nyx-voice`, `nyx-*` doc filenames, `nyx.*` in comments

`nyx-voice` is the name of a **skill** (`.claude/skills/nyx-voice`) referenced in dozens of comments/tests — a tool name, not brand copy. Doc filenames (`docs/nyx-*.md`) and comment references (`docs/nyx-schema-v1_0.sql`, etc.) are the internal **codename**. See §6.

---

## 6. DEFERRED — internal codename (a separate decision)

These are real but low-value and user-invisible; bundling them into a submission-critical PR adds risk and review noise. Each gets a backlog row rather than living in the B-274 execution PR.

| Deferred item | Backlog | Recommendation |
|---|---|---|
| **Internal code identifiers** — `interface NyxEvent` (~30 usages across `store/eventStore.ts`, `app/(tabs)/history.tsx`, `components/home/TodayZone.tsx`, `components/history/EventRow.tsx`), `function NyxTabBar` (`app/(tabs)/_layout.tsx`) | new row | Pure mechanical rename, zero user effect. Do as its own cleanup PR *after* the App Store push, if at all. |
| **Docs / codename sweep** — ~50 `docs/*.md`, `CLAUDE.md`, `STATUS.md` say "Nyx"/"Project Nyx" as the codename; doc filenames are `nyx-*` | new row | Keeping "Nyx" as the *internal* codename is fine and costs nothing. Sweep later only if the mismatch bothers the team. Renaming files also breaks cross-references. |
| **Deep-link scheme** `nyx://` → `culprit://` | new row | Only if a future session also updates the Supabase redirect allowlist. User-invisible; not worth the coordination now. |

---

## 7. NOT code — PM / designer action items (blocking for actual submission)

These cannot be done from the repo and are **required** for a coherent brand at submission. Route to the PM; the icon items belong to B-275.

- [ ] **Visual assets** — `assets/icon.png`, `splash-icon.png`, `adaptive-icon.png`, `favicon.png`. If any embeds the "Nyx" wordmark or an N-monogram, it must be redesigned for Culprit. The "Moon & Signal" master from B-275 (`culprit-icon-design-brief.md`) is the replacement. **This is the icon half of the combined pass** — the point of sequencing name + icon together.
- [ ] **App Store Connect** — store display name already locked "Culprit — Pet Health Tracker" (B-272 ✓). Ensure the uploaded build's on-device name + icon match once this ships.
- [ ] **Supabase auth email templates** — the magic-link / confirmation email almost certainly says "Nyx"; it lives in the Supabase dashboard (Auth → Email Templates), not the repo. Update to "Culprit." (May overlap the B-152 soft-verify email work.)

---

## 8. Open decisions

1. **Deep-link scheme.** Recommendation: **leave `nyx://`** for now (user-invisible; changing it is coordinated auth work with no user benefit). Flip only in a dedicated session that also updates Supabase redirect URLs. → backlog.
2. **On-device name vs. store name.** Apple allows them to differ, but a mismatch (icon says "Nyx," store says "Culprit") reads as two apps. This spec sets the on-device `app.json` name to "Culprit" to match. Confirmed direction; no open question.
3. **Codename sweep timing** (§6) — PM call on whether/when the internal docs get rebranded. Not blocking submission.

---

## 9. Acceptance criteria for the execution PR (the combined name + icon session)

- [ ] `app.json` `name` = `"Culprit"`; **bundle ID unchanged** (`com.projectnyx.app`).
- [ ] All §3 user-facing strings render "Culprit"; **zero** pet-name (`Nyx`) or infra (`nyx-*`, `nyx.db`) strings changed (§5).
- [ ] Vet report letterhead + footer show "Culprit"; the **patient name still renders dynamically** (regenerate the Nyx report and confirm "Patient: Nyx" + title unchanged).
- [ ] `render.test.ts` brand assertion updated; pet-name assertions untouched; full `deno test` for `generate-report` green.
- [ ] `tsc --noEmit` clean; `npm test` green (the 3 updated test files pass).
- [ ] The `generate-report` change is **deployed** (Supabase MCP `deploy_edge_function`, `verify_jwt` preserved) — the vet report is server-rendered, so a repo change alone doesn't reach users.
- [ ] Icon/splash assets swapped to the B-275 "Moon & Signal" master (design deliverable).
- [ ] `docs/app-store-submission-guide.md:49` corrected (§3.7).
- [ ] Persona sign-off: **Designer** (wordmark/brand consistency), **nyx-voice** (the reworded strings still pass — first-person-pet / no exclamation), **Dr. Chen / vet-report-cold-read** (the regenerated report still reads clinic-ready with the new letterhead), **QA** (grep proves no ②/③ collateral).

---

## 10. Suggested execution order (combined pass)

1. **Prereq:** design delivers the "Moon & Signal" icon master (B-275) — the long pole. The string work below can be built in parallel and merged when the asset lands.
2. Config: `app.json` `name` → Culprit; drop in the new icon/splash assets.
3. App strings: auth → home → onboarding (§3.2–3.4) + their tests (§3.6).
4. Vet report: `render.ts` brand wordmarks + body (§3.5) + `render.test.ts` (§3.6); **deploy** `generate-report`.
5. Doc fix (§3.7); backlog reconciliation.
6. On-device QA (below) + `vet-report-cold-read` on a freshly-regenerated Nyx report.

### Manual QA (post-build, on-device)
1. Fresh install / reload → **home-screen icon label reads "Culprit"** (AC: §3.1) and the new icon renders.
2. Sign out → Landing + Login wordmark read **"Culprit"** (AC: §3.2).
3. Home header wordmark reads **"Culprit"**, not "Project Nyx" (AC: §3.3).
4. Onboarding value previews + paywall read **"Culprit … Premium"** (AC: §3.4).
5. Generate a vet report for the pet **Nyx** → letterhead + footer say **"Culprit"**; the **Patient line + title still say "Nyx"** (AC: §3.5 — proves brand changed, pet didn't).
6. Grep gate: `grep -rn "Culprit" app components` shows the expected sites; `git diff` touches no `nyx-*` bucket, `nyx.db`, `NyxEvent`, or test pet-name.

---

## Persona sign-off (this spec)
Product Owner ✓ (scoped to B-274; deferrals filed as backlog rows) — Engineer ✓ (bundle ID / slug / buckets / DB name / scheme held; deploy step named) — Designer ✓ (pairs with the locked Moon & Signal direction; wordmark becomes "Culprit") — Dr. Chen / vet-report-cold-read ✓ (brand-not-actor attribution preserved; patient name intact) — QA ✓ (brand-vs-pet-vs-infra split is the guardrail against collateral) — Trust & Safety ✓ (no data-path / bucket / RLS change).
