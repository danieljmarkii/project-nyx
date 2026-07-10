# Project Nyx — App Store Readiness Register

**Created:** 2026-07-07 · **Owner:** Product Owner / Backlog Steward (with Trust & Safety, Dir. of Engineering, PM, QA lenses)
**Updated:** 2026-07-07 — expert submission-advisory pass (PM-requested): added the App Review demo account (B-271), the App Store Connect record verification (B-272), the live web presence / support URL (B-273), privacy-manifest verification (rides B-267), a concrete paywall recommendation (flag it off for v1), and iPad/screenshot guidance. **The sequenced, step-by-step path through everything below — with links, tips, and per-step kickoff prompts — now lives in [`docs/app-store-submission-guide.md`](./app-store-submission-guide.md).** This register stays the *what gates submission* lens; the guide is the *how and in what order*.

_This is the synthesis the PM asked for: a single "what stands between us and the App Store" view, assembled from `docs/backlog.md`, `STATUS.md`, and a direct read of the repo (`app.json`, `package.json`, signup/auth copy). It realizes the checklist that **B-002** anticipated ("flesh out as prod timing comes into view"). It is a reconciliation of existing tracked work plus four newly-surfaced items (B-267–B-270) — **no new product scope is invented**; freemium/paywall product decisions remain Open Questions for the PM._

**How to read it:** items are grouped by *what they gate*, not by priority. Tier 1 = the app is rejected or crashes without it. Tier 2 = the submission form can't be completed without it. Tier 3 = a PM decision unblocks a chunk of Tier-1/2 work. Tier 4/5 = strongly-recommended-but-not-a-hard-gate. Each row keys to a backlog ID so this doc stays a lens, not a second source of truth.

---

## Bottom line

**The single hardest App Store blocker — in-app account deletion (B-039, Apple 5.1.1(v)) — is code-complete and merged.** Only its on-device QA gate remains. That is the good news.

The gap between "code-complete" and "submittable" is **six things**, most of which are cheap and none of which are large:

1. **A missing iOS permission-string config (B-267)** — newly found this pass. The app requests camera + photo-library at runtime with **no purpose strings set in `app.json`**. iOS crashes on the permission request without them; App Review rejects. This was a real hard blocker that was not tracked. **Config fix shipped via #299** — the `expo-image-picker` config plugin now injects Culprit-branded `NSCameraUsageDescription` + `NSPhotoLibraryUsageDescription` (introspect-verified; mic string suppressed as unused). Two residuals stay on the built artifact (introspect can't check them): confirm both keys on the real `Info.plist`, and confirm the aggregated `PrivacyInfo.xcprivacy` privacy manifest — Expo SDK 54 generates it, but verify, don't assume.
2. **The legal + privacy artifacts** — Privacy Policy (B-229) and Terms (B-230) are stubbed in-app ("The full document is on its way"), and the **App Store Connect App Privacy nutrition label (B-268)** doesn't exist. All three are mandatory to submit.
3. **The store listing + a live web presence** — screenshots, description, age rating (B-269), and a **support URL that App Review actually visits** — it must resolve to a real page with a contact path (B-273). One static page can host support contact + the B-229 privacy policy + the B-230 terms in a single deliverable.
4. **A launch-config flip** — email confirmation is currently OFF with no production SMTP (B-152); it must be on for real users, and B-039's throwaway-account QA depends on the toggle.
5. **The paywall — advisor recommendation: flag it off for the v1 store build (new)**. The onboarding paywall ships as a **non-functional mock** (B-263–266) whose trial CTA *openly acknowledges Premium isn't live* — shown to a reviewer, that is close to a guaranteed **Guideline 2.1 (incomplete/placeholder) rejection**, and fully wiring StoreKit (option a) also requires the **Paid Apps Agreement + banking/tax setup** in App Store Connect (a long-lead item). Feature-flagging the screen off (the `SOCIAL_AUTH_ENABLED` pattern; the flow already advances cleanly without it) **removes the freemium PM decision from the submission critical path entirely** — it becomes a post-launch decision made with real user data.
6. **An App Review demo account (B-271) — newly surfaced by the advisory pass.** Nyx is login-gated: Apple requires working sign-in credentials in App Review Information, and a reviewer landing in an *empty* account sees only empty states — "we were unable to evaluate the app's features" is a common rejection. Pre-seed a demo pet with a few weeks of realistic logs so the Signal, trends, and vet report actually render; this also sidesteps the reviewer depending on B-152's confirmation email arriving.

Everything else (observability, AI cost caps, SecureStore hardening, storage-retention cleanup) is **strongly recommended before real users** but is not a submission gate.

**Do first, regardless of everything else:** verify the **App Store Connect app record (B-272)**. A TestFlight build is already installed, so a record exists — confirm the **App Store name** on it is the one we want ("Nyx" is short and plausibly taken or too generic; a "Nyx — Pet Health Tracker"–style name may be needed). The record is also the surface where B-268 (privacy label), B-269 (listing), and B-271 (review info) get filled in, so checking it early unblocks all three.

---

## Tier 1 — Hard blockers (rejected or crashes without it)

| ID | Item | Status | Owner lens | What's left |
|---|---|---|---|---|
| **B-039** | In-app account deletion (Apple **5.1.1(v)**) | **Partial — code-complete + merged** (#191 backend, #193 client) | Trust & Safety | On-device end-to-end deletion QA on a throwaway account. **This is the ship gate.** Depends on the B-152 email toggle to create the account. |
| **B-267** | iOS camera + photo-library **usage strings** missing from `app.json` | **Config fixed — #299** (introspect-verified); on-build verify pending | Dir. of Engineering | ✅ `expo-image-picker` config plugin added — injects Culprit-branded, purpose-stating `NSCameraUsageDescription` + `NSPhotoLibraryUsageDescription`. `NSMicrophoneUsageDescription` intentionally **suppressed** (`microphonePermission: false`): every image-picker call site is `mediaTypes: ['images']` — no video capture — so the mic string would be unused (an unused permission string is its own review risk). `expo config --type introspect` confirms both keys + the suppression. **Residuals on the built artifact (introspect can't check):** verify both keys on the real `Info.plist`, **and** that the aggregated `PrivacyInfo.xcprivacy` privacy manifest is present — Expo SDK 54 auto-aggregates; verify, don't assume. iOS **crashes** without the usage strings. |
| **B-229** | Privacy Policy (published URL + in-app link) | **Open** — in-app link is a stub (`signup.tsx` alerts "on its way") | Trust & Safety | Draft + host the document; wire a real Settings/onboarding link; supply the store-listing URL. The App Store listing **requires** a privacy-policy URL. |
| **B-268** | App Store Connect **App Privacy** disclosure (nutrition label) | **Open — newly surfaced** | Trust & Safety | Complete the mandatory data-collection questionnaire (email, owner name, pet-health photos/events; processors Supabase + Anthropic). Distinct from B-229. |
| **B-152** | Re-enable email confirmation + **production SMTP** | **Open** — "Confirm email" toggled OFF for testing | Dir. of Engineering / T&S | Flip it on before real users; back `resend` with a production SMTP provider; harden the soft-verify login path (B-251 PR 6 residual). |

> **QA note (Sr. QA Associate):** B-039's on-device pass is the last thing standing between the hardest blocker and "done." It cannot be verified from code — it needs a throwaway account, a real device, and a confirmed empty-state after deletion + a clean cross-account sign-in (the AC-6 logout-wipe check rides along). Run these together.

---

## Tier 2 — Required store-side submission artifacts

| ID | Item | Status | What's left |
|---|---|---|---|
| **B-230** | Terms of Service (published + in-app link + acceptance) | **Open** — stubbed like B-229 | Draft + host; one drafting/legal pass likely covers B-229 + B-230 + the B-270 disclaimer together. |
| **B-269** | Listing assets: screenshots, marketing icon, description, keywords, age rating | **Open — newly surfaced** | Produce all listing metadata. Screenshot requirement is one **6.9-inch iPhone set** (smaller sizes scale down automatically); iPad 13-inch only if tablet support stays on. **iPad — advisor recommendation: flip `supportsTablet` to `false` for v1** (zero iPad QA has been run, iPad screenshots are extra work, and a phone-stretched layout on a 13" iPad is a quality-bar risk; add iPad when it's designed, not defaulted). Age rating: Apple's **2025 revised questionnaire** (4+/9+/13+/16+/18+ tiers) — answer the medical/treatment-information question thoughtfully; B-270's disclaimer framing helps. |
| **B-271** | **App Review demo account + reviewer notes** | **Open — newly surfaced (advisory pass)** | Nyx is login-gated: working sign-in credentials are required in App Review Information (Guideline 2.1), and an empty account can't demonstrate the Signal / trends / vet report. Pre-seed a demo pet with ~2–4 weeks of realistic logs; write reviewer notes (what the app does, where the AI reads appear, the demo credentials). Sidesteps the reviewer depending on B-152's confirmation email. |
| **B-272** | **Verify/complete the App Store Connect app record + lock the store name** | **Open — newly surfaced (advisory pass)** | A TestFlight build is installed, so a record **exists** — verify the App Store **name** on it is the one we want ("Nyx" is short/contested; a subtitle-style name may be needed), and audit what's already configured. The record is the prerequisite surface for B-268, B-269, and B-271. PM-only dashboard action; do it first. |
| **B-273** | **Live web presence: support URL + hosted privacy policy + terms** | **Open — newly surfaced (advisory pass)** | App Review *visits* the support URL — it must resolve to a real page with a contact path; the privacy-policy URL is required on the listing. One static page (GitHub Pages / Carrd / Netlify) can host support contact + B-229 + B-230 as a single deliverable. |
| **B-270** | App-level medical/veterinary disclaimer + acceptance | **Open — newly surfaced** | Blanket "not a substitute for veterinary care" + owner acknowledgment (Guideline 1.4.1). Per-surface "not a diagnosis" copy is already strong; this is the missing app-level statement. Reuse clinical voice; must not reassure. |
| **B-231** | Surface app version + build number in-app | **Open** | Small: read from `expo-constants`; needed for TestFlight/App Review triage. |

---

## Tier 3 — PM decisions that gate submission work

These are **Open Questions**, not deferrals — a decision here unblocks a cluster of Tier-1/2 work. They are surfaced, not resolved, per the backlog-groomer hard rule.

| Decision | Gates | Why it's on the critical path |
|---|---|---|
| **Freemium gate** — which features (if any) sit behind the paywall (CLAUDE.md Open Question) | **B-263** (paywall content), **B-264** (StoreKit + Guideline 3.1.2), **B-265** (placement) | The onboarding paywall ships as a **non-functional mock** whose trial CTA *openly acknowledges Premium isn't live* — shown to a reviewer, that is close to a guaranteed **Guideline 2.1 (incomplete/placeholder) rejection**. **Advisor recommendation (2026-07-07): option (c) — feature-flag the paywall screen off for the v1 store build** (the `SOCIAL_AUTH_ENABLED` pattern; `pet-age finish()` advances straight to the completion screen). Rejected alternatives: (a) fully wiring StoreKit is weeks of work **plus** the Paid Apps Agreement + banking/tax setup in App Store Connect (long-lead), and (b) any visible "Start 7-day free trial" that doesn't purchase stays a 2.1 magnet. **Flagging it off removes the freemium decision from the submission critical path entirely** — it becomes a post-launch decision made with real user data. When it does ship: safety-relevant features can't be gated (Principle 7 / Pets > $); multi-pet ships FREE (B-086) — do not gate it. |
| **Social auth for v1** — email-only vs functional Apple/Google (B-251 PR 11) | Whether Sign-in-with-Apple is required | v1 ships email-only with Apple/Google **hidden** behind `SOCIAL_AUTH_ENABLED=false` — this is fine (Sign-in-with-Apple is only *required* if you offer another third-party login). **Verify at build time the mocked buttons are hidden, not visible-but-dead** (a dead social button = rejection). If Google ships later, B-120 (Apple token revocation on deletion) becomes a hard requirement. |

---

## Tier 4 — Strongly recommended before public launch (not a hard gate)

| ID | Item | Lens | Why before real users |
|---|---|---|---|
| **B-001** | AI cost & rate-limit strategy (per-user/day cap, caching, cost-per-active-user) | Engineering | Real users hitting Claude vision/phrasing = unbounded cost + abuse surface. PM previously deferred "until pre-shipping" — that's now. |
| **B-016** | App-wide error observability (Sentry-style) | Engineering | You cannot triage a TestFlight crash or an App Review "it crashed" blind. Wire before wide distribution. Feeds B-047 retention instrumentation. |
| **B-199 / B-021** | SecureStore session-token chunking (>2048-byte warning → future throw) | Engineering | Benign today, but a future expo-secure-store SDK throw = silent logout / failed session restore. Cheap chunking adapter. |
| **B-002** | Pre-prod readiness checklist (EAS env, observability, error reporting, push provider) | Engineering / PM | The parent checklist; this register is its App-Store slice. Keep the non-store bullets (push provider, EAS env verification) tracked here. |
| — | **Whole-system aesthetic + household TestFlight QA pass** | Designer / QA | STATUS lists these as open on-device gates; a first-impression pass matters for a public launch and for App Review's "quality" bar. |

---

## Tier 5 — Compliance / data-rights / hardening (pre-prod, not App Store gates)

| ID | Item | Note |
|---|---|---|
| **B-041** | User data export (GDPR Art. 20) | Legal/GDPR, **not** an Apple gate (Apple requires deletion, not export). Inverse of B-039; build as an Edge Function extension. |
| **B-248 / B-249 / B-255** | Storage access + retention hardening (`nyx-vet-attachments` bucket read; orphaned event-photo objects; expired vet-report reaping) | T&S / data-minimization. Not live leaks (B-244 closed the exploitable one), but retention hygiene before scale. |
| **B-119 / B-120 / B-121** | Account-deletion hardening (re-auth; Apple-token revocation; orphaned-Storage sweep) | Post-B-039. **B-120 becomes hard the day Apple Sign-In ships.** |
| **B-118** | Delete the leftover `smart-worker` Edge Function (stock template, RLS-bypass `secret` path) | `Now`, PM-only dashboard action; a security-review loose end (sibling of the already-closed B-043). |
| **B-178 / B-180** | Edge-Function post-merge deploy-drift guard + runnable deno suites | Reliability: a merged clinical fix can sit un-deployed (bit `analyze-vomit` once). Not a store gate, but a "don't ship a silently-stale function" guard. |

---

## Already de-risked (was a pre-prod blocker, now done)

- **B-054 Multi-device down-sync / hydration** — a new phone / reinstall / offload previously saw an empty log (a data-durability + device-portability defect explicitly flagged as a likely App Store blocker). **Done** (#82–#86); only the on-device logout-wipe QA gate rides with B-039.
- **B-251 Onboarding revamp** — the v0.1 2-screen flow didn't scale to a public release (no owner identity, fragile "≥1 pet" completion inference, no durable completion marker). **PRs 1–10 shipped; the flow is complete end-to-end (no dead ends) — a build can be cut.** Only PR 11 (functional social auth) remains, and it's post-v1.
- **Per-surface clinical disclaimers** — the AI reads and vet report already carry "not a diagnosis" framing (the blanket app-level statement is the remaining B-270 gap).
- **Export compliance** — `ITSAppUsesNonExemptEncryption: false` is already set in `app.json` (correct for an app using only standard HTTPS/TLS); the export-compliance question auto-answers at submission. _(Verified 2026-07-07, advisory pass.)_
- **App icon** — a real 1024×1024 PNG is wired (`assets/icon.png`), not an Expo placeholder. The separate ASC "marketing icon" upload is no longer required (pulled from the build since 2024).
- **Bundle identifier + versioning** — `com.projectnyx.app` is set; `eas.json` production profile has `autoIncrement: true` + remote `appVersionSource`, so build numbers manage themselves.

---

## Sequenced runway

The tiers above say **what** gates submission; the order of attack — with long-lead items started first, per-step links and tips, kickoff prompts for the PR-shaped steps, and a live progress tracker — lives in **[`docs/app-store-submission-guide.md`](./app-store-submission-guide.md)**. Headline: with the paywall flagged off (Tier 3 recommendation), **nothing on the runway waits on a PM product decision** — the only calls left are operational defaults (iPad off, SMTP provider) with recommendations already attached.

---

## Persona sign-off on this register

- **Product Owner / Backlog Steward** — reconciled B-039 (draft→merged head); added B-267–B-270 as proactive tracking rows (sanctioned, not scope-invention); flagged one structural cleanup: rows B-253–B-266 sit below the `## Done` header in `docs/backlog.md` and should migrate up in the next slim pass (B-141).
- **Trust & Safety / Privacy** — deletion (B-039) is the gate and is nearly closed; the privacy *documents* (B-229/B-268/B-270) are the exposed edge and are all still Open. Retention hardening (Tier 5) is real but not a launch gate.
- **Dir. of Engineering** — B-267 is the one genuinely-new hard blocker and it's a config fix; B-152/B-001/B-016 are the launch-config trio. Verify permission strings and hidden social buttons **on the built artifact**, not from source.
- **Sr. Product Manager** — two decisions own the critical path: the freemium gate (unblocks the paywall cluster + de-risks a 2.1/3.1.2 rejection) and the v1 social-auth scope (email-only is fine; confirm the mocked buttons are hidden).
- **Sr. QA Associate** — the B-039 + AC-6 logout-wipe on-device pass is the terminal gate for the hardest blocker; run them as one session on a throwaway account.
