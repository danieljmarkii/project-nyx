# Project Nyx — App Store Submission Guide (Step by Step)

**Created:** 2026-07-07 · **Owner:** PM, advised by the expert submission-advisory pass
**Companion:** [`docs/app-store-readiness.md`](./app-store-readiness.md) — the register says **what** gates submission; this guide says **how and in what order**. Every step keys back to a backlog ID so the backlog stays the source of truth.

**How to use this guide:**

- Steps are ordered so **long-lead items start first** and nothing blocks on anything avoidable. Steps inside the same phase can usually run in parallel.
- Steps marked **[PR]** are Claude Code sessions — each has a **copy-pasteable kickoff prompt**. One PR per session, per CLAUDE.md.
- Steps marked **[PM]** are actions only you can take (dashboards, devices, accounts). When done, paste **"Guide step N complete: <one-line result>"** into any session — Claude updates the tracker below, the backlog row, and STATUS.md so progress stays recorded.
- Steps marked **[Mixed]** have both a PM part and a Claude part.
- **Update the tracker below whenever a step's state changes** — it is the live "how far to the App Store" answer.

---

## Progress tracker

| # | Step | Type | Backlog | Status |
|---|---|---|---|---|
| 1 | Verify the App Store Connect record + lock the name | PM | B-272 | ✅ Done 2026-07-08 — name "Culprit — Pet Health Tracker", category Lifestyle/Health & Fitness |
| 2 | Draft the legal docs (privacy policy, terms, disclaimer) | PR | B-229 / B-230 / B-270 | ⬜ Not started |
| 3 | Stand up the web presence (support URL + hosted docs) | Mixed | B-273 | 🔵 Spec'd 2026-07-08 — domain `getculprit.app` purchased (Cloudflare); build-ready spec `docs/culprit-website-requirements.md`; awaiting PM repo + Email Routing setup |
| 4 | Pick + configure the production SMTP provider | PM | B-152 (part 1) | ⬜ Not started |
| 5 | iOS store-config PR (permission strings + iPad off) | PR | B-267 / B-269 | ⬜ Not started |
| 6 | Ratify + flag off the paywall for v1 | Mixed | B-263–266 (deferral) | ⬜ Not started |
| 7 | In-app version display | PR | B-231 | ⬜ Not started |
| 8 | On-device deletion QA + logout-wipe (email confirm still OFF) | PM | B-039 + AC-6 | ⬜ Not started |
| 9 | Flip email confirmation ON + verify the signup path | Mixed | B-152 (part 2) | ⬜ Not started |
| 10 | Cut the production build + built-artifact verification | Mixed | — | ⬜ Not started |
| 11 | Seed the App Review demo account + reviewer notes | Mixed | B-271 | ⬜ Not started |
| 12 | Screenshots | PM | B-269 | ⬜ Not started |
| 13 | Listing copy + age rating | Mixed | B-269 | ⬜ Not started |
| 14 | App Privacy nutrition label | Mixed | B-268 | ⬜ Not started |
| 15 | Assemble the submission + submit | PM | — | ⬜ Not started |
| 16 | During review: monitoring + rejection playbook | Reference | — | — |

**Dependency notes:** 1–4 are independent of everything and of each other — start them all now. 5–7 are independent PRs (parallelizable as separate sessions; STATUS.md is the one wrap collision). 8 must precede 9 (the throwaway-account QA needs confirmation OFF). 10 needs 5–7 merged. 11–14 need 1; 12 benefits from 10's build. 15 needs everything.

---

## Phase 1 — Start now (long-lead, zero code)

### Step 1 — Verify the App Store Connect record + lock the store name **[PM]** (B-272)

**Summary:** App names are globally unique on the App Store. Because a TestFlight build is already installed (2026-06-07), an App Store Connect record for Nyx **already exists** — this step is verifying it, not creating it. The record is also where the privacy label (step 14), listing (steps 12–13), and review info (step 15) get entered, so auditing it now unblocks everything store-side.

**How:**
1. Sign in at <https://appstoreconnect.apple.com> → **My Apps** → open the Nyx app record.
2. Check **App Information → Name**. This is the *App Store display name* (max 30 chars), independent of the on-device name (`app.json` `name: "Culprit"` — set by the B-274 rebrand). If plain "Nyx" was accepted when the record was created, the name is reserved — done. If it's something placeholder-ish, or you want a more searchable name, set it now — e.g. **"Nyx — Pet Health Tracker"** (name + subtitle real estate is also the strongest App Store search signal).
3. While there, note what's already filled in vs. empty (category, subtitle, content rights) — you'll come back for the rest in steps 12–14.

**Tips:**
- Primary category: **Medical** invites the strictest review lens; **Lifestyle** or **Health & Fitness** fit a pet-tracking app better. Recommendation: **Lifestyle** primary, **Health & Fitness** secondary — revisit at step 13.
- If the name field fights you ("name already in use"), variants with a descriptor ("Nyx Pet Health") almost always clear.

**Confirm with:** `Guide step 1 complete: name locked as "<name>", category <category>.`

---

### Step 2 — Draft the legal docs in one pass **[PR]** (B-229 privacy policy · B-230 terms · B-270 disclaimer)

**Summary:** All three documents share one drafting effort and one factual base (what data Nyx collects, where it goes, what the AI does and doesn't claim). Draft them as repo docs first; you review; hosting (step 3) and in-app wiring follow. The privacy policy URL is **required** on the store listing; the disclaimer is the Guideline 1.4.1 posture for a health-adjacent app.

**Helpful references:**
- App Review Guidelines §5.1 (data collection/privacy): <https://developer.apple.com/app-store/review/guidelines/#privacy>
- Guideline 1.4.1 sits under "Physical harm": <https://developer.apple.com/app-store/review/guidelines/#physical-harm>

**Tips:**
- The privacy policy must name third-party processors — for Nyx that is **Supabase** (auth/DB/storage) and **Anthropic** (photo extraction + phrasing). It must also describe deletion (B-039 — built) and note data-retention behavior.
- These drafts are also the *source material* for step 14's nutrition label — one factual audit feeds both, which is why this step comes early.
- Claude drafts; **you should still have a lawyer glance at them** before launch if feasible. For a solo-dev v1 this level of diligence is the norm, but it isn't legal advice.

**Kickoff prompt:**

> Read `docs/app-store-submission-guide.md` step 2, `docs/app-store-readiness.md`, the Secrets Register in CLAUDE.md, and `docs/nyx-account-deletion-requirements.md`. Draft three documents in `docs/legal/`: (1) `privacy-policy.md` (B-229) grounded in Nyx's *actual* data flows — audit what is collected (account email, owner name, pet-health events + photos), where it's processed (Supabase auth/DB/Storage; Anthropic for photo extraction + AI phrasing), retention, and the in-app deletion path (B-039); (2) `terms-of-service.md` (B-230); (3) `veterinary-disclaimer.md` (B-270) — a blanket "Nyx is not a substitute for professional veterinary care" statement that must never reassure (clinical-guardrails skill; n=1 invariant). Run nyx-voice on any copy that will render in-app. One PR, docs only — the in-app link wiring is a separate follow-up PR once B-273 hosting exists (guide step 3). Update the guide tracker + backlog rows at wrap.

---

### Step 3 — Stand up the web presence **[Mixed]** (B-273)

**Summary:** App Review *visits* the support URL — it must resolve to a real page with a way to contact you — and the listing requires a privacy-policy URL. One site covers support + privacy policy + terms. Nyx currently has no web presence at all.

**⬆ Scope upgraded 2026-07-08 — host + domain now decided.** The PM purchased the custom domain **`getculprit.app`** (Cloudflare Registrar) and wants a real branded Culprit landing page, not just a legal stub. The build-ready spec is **`docs/culprit-website-requirements.md`** — read it for the full plan. Headline decisions: hosting = **Cloudflare Pages** (free; DNS already at Cloudflare), framework = **Astro**, a **separate `culprit-web` repo**, email = **Cloudflare Email Routing** (`support@getculprit.app` → PM Gmail), cookieless analytics. The spec's §10 phase plan separates the submission gate (3 URLs live) from the brand landing so neither blocks the other. The GitHub Pages/Carrd options below are superseded by that spec but kept for context.

**How (PM part — now, per the spec §13):**
- **Create the `culprit-web` GitHub repo** (public) + grant session access (GitHub scope is `project-nyx`-only today).
- **Enable Cloudflare Email Routing** on `getculprit.app`: route `support@` (+ optionally `privacy@`) → your Gmail.
- _(Superseded host options, for reference: GitHub Pages / Carrd / Netlify free tiers — no longer the plan now that the domain + Cloudflare Pages are chosen.)_

You need three URLs by the end (anchors/pages on the site): `getculprit.app/support`, `/privacy`, `/terms`.

**Tips:**
- The support page needs, at minimum: the app name, a contact email, and a sentence about what the app is. That's genuinely enough for review — the branded landing (spec Job B) is extra.
- Brand hygiene (**B-274**): every public string is **Culprit**, never "Nyx".

**Claude part (after hosting exists + step 2 is merged) — kickoff prompt:**

> Read `docs/app-store-submission-guide.md` step 3. The legal docs from step 2 are hosted: privacy `<URL>`, terms `<URL>`, support `<URL>`. (If you need page HTML generated from `docs/legal/*.md` for the host, produce it first.) Wire the real in-app links: replace the "on its way" stubs — the TOS/privacy line in `app/(auth)/signup.tsx` and any Settings/profile surface — with links that open these URLs (`expo-linking`). Add the B-270 disclaimer acceptance line per its backlog row. One PR; update the guide tracker + backlog rows (B-229/B-230/B-270/B-273) at wrap.

**Confirm the PM part with:** `Guide step 3 (hosting) complete: support URL <url>.`

---

### Step 4 — Pick + configure the production SMTP provider **[PM]** (B-152, part 1)

**Summary:** Email confirmation must be ON for real users (step 9), and Supabase's built-in email service is rate-limited to a handful of emails per hour — testing-only, not production. Provision a real SMTP provider now so step 9 is a config flip, not a project.

**How:**
1. Pick a provider. **Resend** (<https://resend.com>) is the current default choice for Supabase projects (generous free tier, first-class Supabase integration guide); **Postmark** and **AWS SES** are solid alternatives.
2. Verify a sending domain (or use the provider's shared domain to start — fine at this scale).
3. Supabase Dashboard → project `aigchluqluzuhtbfllgh` → **Authentication → Emails → SMTP Settings** → enter host/port/user/password. Guide: <https://supabase.com/docs/guides/auth/auth-smtp>
4. **Don't flip "Confirm email" ON yet** — step 8's throwaway-account QA needs it OFF. This step is provisioning only.

**Tips:**
- Add the SMTP credentials to the **Secrets Register** in CLAUDE.md when you confirm this step (Claude will do it) — that's the house rule for every new secret.
- Send yourself a test email from the provider dashboard to confirm the domain verifies before wiring it into Supabase.

**Confirm with:** `Guide step 4 complete: SMTP provisioned via <provider>, configured in Supabase, confirmation still OFF.`

---

## Phase 2 — Code changes (small PRs; 5–7 are parallelizable as separate sessions)

### Step 5 — iOS store-config PR **[PR]** (B-267 permission strings + B-269 iPad decision)

**Summary:** The one genuinely-new hard blocker: the app requests camera/photo-library at runtime with **no purpose strings configured**, which crashes iOS at the permission prompt and fails review (Guideline 5.1.1). Same PR flips `supportsTablet` to `false` (advisor recommendation — zero iPad QA exists; obligating iPad screenshots + layout for v1 buys nothing). Both changes are `app.json` config — one concern, one PR.

**Reference:** expo-image-picker config plugin: <https://docs.expo.dev/versions/latest/sdk/imagepicker/#installation>

**Kickoff prompt:**

> Read `docs/app-store-submission-guide.md` step 5, the B-267 backlog row, and `docs/app-store-readiness.md` Tier 1. In `app.json`: (1) add the `expo-image-picker` config plugin with explicit `cameraPermission`, `photosPermission`, and `microphonePermission` strings — purpose-specific copy in Nyx voice explaining *why* (photographing meals, symptoms, medication labels, and your pet), never generic "needs access" phrasing (run nyx-voice on the strings); (2) flip `ios.supportsTablet` to `false` (B-269 advisor recommendation, PM-ratified via this guide). Verify with `npx expo config --type introspect` (or `npx expo prebuild -p ios --no-install` on a scratch copy) that the resulting Info.plist carries all three `NS*UsageDescription` keys. Note in the PR that final verification happens on the real EAS build (guide step 10). Update the guide tracker + backlog rows at wrap.

---

### Step 6 — Ratify + flag off the paywall for v1 **[Mixed]** (defers B-263–266)

**Summary:** The onboarding paywall is a non-functional mock whose trial CTA *admits Premium isn't live* — shown to a reviewer, that's a near-certain Guideline 2.1 (incomplete/placeholder) rejection. Wiring StoreKit instead means weeks of work plus the Paid Apps Agreement + banking/tax setup. **Recommendation: feature-flag the screen off for the store build.** This is the one step that changes product surface, so it needs your explicit go — but saying yes removes the freemium decision from the submission critical path entirely.

**PM part:** ratify the recommendation (or overrule — if you want the paywall visible in v1, we go back to the register's Tier 3 options and accept the StoreKit + Paid-Apps-Agreement path and its lead time).

**Kickoff prompt (after ratifying):**

> Read `docs/app-store-submission-guide.md` step 6, `app/onboarding/paywall.tsx`, `app/onboarding/pet-age.tsx`, and `constants/flags.ts`. The PM has ratified flagging the paywall off for the v1 store build (advisor recommendation in `docs/app-store-readiness.md` Tier 3). Add a `PAYWALL_ENABLED` flag (off) to `constants/flags.ts` following the `SOCIAL_AUTH_ENABLED` pattern; when off, `pet-age`'s `finish()` routes straight to `/onboarding/done` and the paywall screen is unreachable (keep the screen + its tests intact — it returns post-launch when the freemium gate is decided; B-263–266 stay open). Update the affected navigation tests. One PR; update the guide tracker + a note on the B-263 row at wrap.

---

### Step 7 — In-app version display **[PR]** (B-231)

**Summary:** Small but load-bearing for everything after launch: TestFlight feedback, App Review correspondence, and crash triage all start with "what version are you on?". Read it from the native binary so it's always truthful.

**Kickoff prompt:**

> Read `docs/app-store-submission-guide.md` step 7 and the B-231 backlog row. Surface the app version + build number in the app's settings/profile surface (find the right existing screen — likely where sign-out lives): `Application.nativeApplicationVersion` + `Application.nativeBuildVersion` from `expo-application` (add it if not installed; fall back to `expo-constants` if preferred), rendered as quiet footer text (e.g. "Nyx 1.0.0 (42)") in theme tokens. One small PR; update the guide tracker + B-231 at wrap.

---

## Phase 3 — On-device gates (Runtime B; before cutting the build)

### Step 8 — Deletion QA + logout-wipe **[PM]** (B-039 + AC-6 — *the ship gate*)

**Summary:** The hardest App Store blocker (in-app account deletion, Guideline 5.1.1(v)) is code-complete and merged; this on-device pass is the only thing left. Run it **while email confirmation is still OFF** (throwaway-account creation depends on that). The AC-6 logout-wipe check rides along in the same session.

**How:**
1. Runtime B: `git checkout main && git pull --ff-only && npx expo start --tunnel`, scan the QR.
2. Create a **throwaway account** (email confirmation is OFF, so signup completes directly). Add a pet, log a few events with a photo.
3. Delete the account via the in-app deletion flow. Expect: signed out, returned to Landing.
4. Sign back in with the **same** credentials → expect a fresh signup-level experience / no prior data (account truly gone, not soft-hidden).
5. Verify server-side (Supabase dashboard): the auth user is gone; `pets`/`events` rows cascaded; Storage objects for the account purged (`nyx-pet-photos`, `nyx-event-attachments`).
6. **AC-6 logout-wipe:** on a device populated with your real account, sign out → confirm local data empties → sign into a *different* account → confirm no prior-pet data shows.

**Reference:** Apple's account-deletion requirement: <https://developer.apple.com/support/offering-account-deletion-in-your-app/>

**Confirm with:** `Guide step 8 complete: B-039 deletion verified end-to-end on device, AC-6 logout-wipe clean.` (Claude closes the B-039 row — the App Store's hardest blocker goes green.)

---

### Step 9 — Flip email confirmation ON + verify signup **[Mixed]** (B-152, part 2)

**Summary:** With deletion QA done and SMTP provisioned (step 4), turn real email confirmation on and prove the signup path holds — including the soft-verify "check your inbox" flow that shipped in onboarding PR 6.

**How (PM):**
1. Supabase Dashboard → Authentication → Sign In / Providers → Email → toggle **Confirm email ON**.
2. On device: create a fresh test account → expect the soft "check your inbox" screen → confirmation email arrives via your SMTP provider (check spam the first time) → confirm → sign in → onboarding proceeds.
3. Also run the two RLS dashboard checks folded into B-152 (see its backlog row).

**Optional Claude part:** the B-152 row carries a "harden the soft-verify login path" residual (raw-error surface once confirmation is re-enabled). If step 9's device pass shows rough copy on the unconfirmed-login path, kick off:

> Read the B-152 backlog row and `docs/app-store-submission-guide.md` step 9. Email confirmation is now ON in production. Harden the soft-verify path in `app/(auth)/signup.tsx` / login per the B-152 residual — an unconfirmed sign-in attempt must surface calm, specific copy (nyx-voice), never a raw Supabase error. One PR; update the tracker + B-152 at wrap.

**Confirm with:** `Guide step 9 complete: confirmation ON, signup + confirm + sign-in verified on device via <provider>.`

---

## Phase 4 — Build + verify

### Step 10 — Cut the production build + built-artifact verification **[Mixed]**

**Summary:** With steps 5–7 merged, cut a production iOS build and verify — on the artifact, not from source — everything this project has learned to distrust: the permission strings, the privacy manifest, the hidden social buttons, the absent paywall, the version display.

**How (PM):**
1. From an up-to-date `main`: `eas build --platform ios --profile production` (interactive `eas login` first if the Codespace is fresh).
2. When it finishes, the build appears in App Store Connect → TestFlight automatically (or run `eas submit -p ios` if the build isn't auto-submitted). Install it via TestFlight.
3. On-device spot-check: camera prompt shows your purpose string (tap "add photo" on a log); no Apple/Google buttons on signup; onboarding skips the paywall; version renders in settings.

**Built-artifact checklist (Claude can run most of it if you download the `.ipa` from the EAS build page, or verify via `npx expo config --type introspect` + the TestFlight install):**
- [ ] `NSCameraUsageDescription` / `NSPhotoLibraryUsageDescription` / `NSMicrophoneUsageDescription` present in Info.plist with the Nyx-voice copy
- [ ] `ITSAppUsesNonExemptEncryption` = false present
- [ ] `PrivacyInfo.xcprivacy` present in the bundle (Expo SDK 54 aggregation — verify, don't assume)
- [ ] `UIDeviceFamily` = iPhone-only (the `supportsTablet: false` flip took)
- [ ] Social auth buttons hidden; paywall unreachable; version string renders

**Kickoff prompt (verification session):**

> Read `docs/app-store-submission-guide.md` step 10. A production iOS build is cut (EAS build URL: `<url>`; .ipa downloaded to `<path>` if available). Run the built-artifact verification checklist from the guide: unzip the .ipa and inspect the app bundle's Info.plist and PrivacyInfo.xcprivacy (fall back to `npx expo config --type introspect` for anything the artifact isn't available for), and confirm from `constants/flags.ts` + navigation that social auth and the paywall are off. Report pass/fail per checklist item and update the guide tracker.

**Confirm with:** `Guide step 10 complete: build <number> verified, checklist green.`

---

## Phase 5 — Store-side artifacts

### Step 11 — Seed the App Review demo account + reviewer notes **[Mixed]** (B-271)

**Summary:** A reviewer signing into an empty Nyx can't evaluate anything — the Signal, trends, Patterns, and vet report all need weeks of data to render. Create a demo account, have Claude seed it server-side with realistic history (multi-device hydration — B-054 — will pull it onto any device the reviewer signs in on), and write the reviewer notes.

**How (PM part):** create the demo account through the real signup flow (e.g. `nyx.appreview@<yourdomain>` — an address you control; confirmation is ON now, so confirm it), add a pet, then hand Claude the account email.

**Kickoff prompt:**

> Read `docs/app-store-submission-guide.md` step 11 and the B-271 backlog row. The demo account is `<email>` (pet already created: `<name>`). Seed ~3 weeks of realistic history for it server-side via the Supabase MCP (`execute_sql`, service-role) respecting `docs/nyx-schema-v1_0.sql`: daily meals against real `food_items`, a handful of symptom events (one with enough pattern for a Signal finding to fire), a weight entry, varied `occurred_at` confidence. Realistic, not synthetic-looking — a reviewer may scroll History. Then trigger/verify `generate-signal` produces a finding and the vet report renders for the pet. Finally, draft `docs/app-review-notes.md`: what Nyx is, the demo credentials placeholder, where the AI reads appear (and their "not a diagnosis" framing), and a note that camera features can be tested by logging a meal with photo. Update the tracker + B-271 at wrap.

**Confirm with:** `Guide step 11 complete: demo account seeded, Signal + report render.`

---

### Step 12 — Screenshots **[PM]** (B-269)

**Summary:** One 6.9-inch iPhone screenshot set is required (smaller sizes scale down automatically since 2024; iPad is out per step 5). Take them on the demo account — it's exactly the "app full of life" state screenshots need.

**How:**
1. Device or Simulator sized to a 6.9" iPhone (iPhone 16 Pro Max class → **1320 × 2868 px** portrait). Spec: <https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications/>
2. Signed into the demo account, capture 4–6 screens leading with the wedge: **Home with a live Signal card**, quick-log, Trend/Patterns, the vet report, Timeline.
3. Upload at App Store Connect → your app → the version's App Store tab.

**Tips:**
- Plain screenshots pass review fine; framed/annotated marketing shots can come later — don't let polish block submission.
- First two screenshots are what shows in search results — lead with the Signal (the differentiator), not the login screen.
- Clean status bar: full battery, strong signal, 9:41 if you care (Simulator: `xcrun simctl status_bar` overrides).

**Confirm with:** `Guide step 12 complete: N screenshots uploaded.`

---

### Step 13 — Listing copy + age rating **[Mixed]** (B-269)

**Summary:** Description, subtitle, keywords, promotional text — Claude drafts in Nyx voice, you review and paste into App Store Connect — plus the age-rating questionnaire.

**Kickoff prompt:**

> Read `docs/app-store-submission-guide.md` step 13, `docs/nyx-design-principles-v1_0.md`, `docs/nyx-research-v1_0.md` (wedge/persona), and load nyx-voice. Draft `docs/store-listing-copy.md`: App Store name (≤30 chars, from guide step 1), subtitle (≤30), promotional text (≤170), description (≤4000), keywords (≤100 chars, comma-separated, no words already in name/subtitle). Ground in the reactive-owner wedge (diet trials, symptom monitoring) and Pets > $ (care features free). Clinically honest — never claim diagnosis or medical advice (this copy is read against Guideline 1.4.1 and the age-rating answers). Deliver for PM review; update the tracker at wrap.

**Age rating (PM, in ASC):** the questionnaire was revised in 2025 (tiers 4+/9+/13+/16+/18+). Answer the **medical/treatment information** question as: the app provides informational pet-health tracking, not medical treatment or diagnosis (consistent with B-270's disclaimer). Expected outcome: **4+**.

**Confirm with:** `Guide step 13 complete: copy entered, age rating <tier>.`

---

### Step 14 — App Privacy nutrition label **[Mixed]** (B-268)

**Summary:** The mandatory data-collection questionnaire in App Store Connect — distinct from the privacy-policy document, and it must **match** it (mismatches are a rejection/re-review trigger). Claude produces an exact answer sheet from the real data flows; you transcribe it.

**Reference:** <https://developer.apple.com/app-store/app-privacy-details/>

**Kickoff prompt:**

> Read `docs/app-store-submission-guide.md` step 14, the B-268 backlog row, `docs/legal/privacy-policy.md` (step 2), and audit the actual data flows (Supabase tables in `docs/nyx-schema-v1_0.sql`, Storage buckets, Edge Functions calling Anthropic, `lib/supabase.ts`). Produce `docs/app-privacy-answers.md`: every datum Nyx collects mapped to Apple's App Privacy categories (contact info: email + name; user content: photos + pet-health events; identifiers/diagnostics: only if actually collected — verify, e.g. B-016 is NOT shipped), whether each is linked to identity (yes — account-based), whether any is used for tracking (no — no ads/ATT), and third-party processors (Supabase, Anthropic). One row per ASC questionnaire answer with a one-line rationale so the PM can transcribe directly. Flag any mismatch found against the privacy policy. Update the tracker + B-268 at wrap.

**Confirm with:** `Guide step 14 complete: nutrition label entered in ASC.`

---

## Phase 6 — Submit

### Step 15 — Assemble the submission + submit **[PM]**

**Summary:** Everything converges here. Attach the build to the version, fill App Review Information, and submit.

**Checklist (App Store Connect → your app → the 1.0 version page):**
- [ ] Build attached (from step 10; pick it under "Build")
- [ ] Screenshots (step 12), description/subtitle/keywords/promotional text (step 13)
- [ ] Support URL + privacy-policy URL (step 3)
- [ ] Age rating (step 13) · App Privacy (step 14) · Category (step 1)
- [ ] **App Review Information:** demo account credentials (step 11) + the reviewer notes from `docs/app-review-notes.md` pasted into the Notes field + your contact info
- [ ] Export compliance: auto-answered by `ITSAppUsesNonExemptEncryption` in the build — no action expected
- [ ] **Release option:** choose **"Manually release this version"** — so a surprise approval doesn't publish before you're ready; you press the button after approval
- [ ] Pricing: Free (no Paid Apps Agreement needed with the paywall off)

Then **Submit for Review**.

**Expectations:** most reviews complete within **24–48 hours**. First submissions get a slightly deeper look. Status emails arrive at each transition ("In Review", "Approved" / "Rejected").

**Confirm with:** `Guide step 15 complete: submitted <date>.`

---

### Step 16 — During review: monitoring + rejection playbook **[Reference]**

**If approved:** release manually when ready. Consider **Phased Release** (version page → automatic staged rollout over 7 days) for post-1.0 updates; for 1.0 it's moot (no existing users).

**If rejected — don't panic; first-submission rejections are routine and most resolve in one round:**
1. Read the rejection in **App Store Connect → Resolution Center**. It cites the specific guideline and usually includes screenshots.
2. Paste the full rejection text into a Claude session: `App Review rejected the build — here's the rejection: <text>`. We diagnose whether it's a **metadata fix** (respond/change listing text — no new build needed), a **config/binary fix** (new PR → new build → resubmit), or a **misunderstanding** (reply in Resolution Center explaining — e.g. pointing the reviewer at the demo data or the disclaimer; polite, specific replies genuinely work).
3. Resubmissions typically review faster than the first pass.

**Common first-submission rejections this plan has specifically defused:** missing purpose strings (step 5), placeholder/incomplete features (step 6), no demo account / couldn't evaluate (step 11), missing account deletion (step 8), privacy label mismatch (step 14), dead support URL (step 3).

---

## After approval — deferred items to pick back up

The register's Tier 4/5 (observability B-016, AI cost caps B-001, SecureStore chunking B-199, retention hygiene) become the *"before real scale"* list, and the paywall cluster (freemium gate → B-263/264/265 + the Paid Apps Agreement + banking/tax in ASC, which take days to clear — start them when the decision lands) returns as a post-launch product decision made with real user data. `docs/app-store-readiness.md` remains the register for those.
