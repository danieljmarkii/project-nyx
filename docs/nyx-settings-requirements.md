# Culprit — "You" (Profile & Settings) Requirements
**Version:** 0.1 | **Status:** Draft — build-ready pending PM ratification of §3 decisions | **Last Updated:** 2026-07-09

Owner-facing user/account surface. Pulls the user actions off the Pet tab into a dedicated screen, gives the support email + legal links their in-app home, and adds two mocked surfaces (Notifications, App feedback). Design + entry-point mockups: **`docs/settings-mockups.html`** (rendered artifact linked from PR #313). Backlog: **B-283**.

---

## 1. Context & problem

The Pet tab (`app/(tabs)/profile.tsx`) does double duty. It carries **pet-scoped** data (photo, conditions, medications, weight, diet trial, vet report) *and*, wedged in an "Account" card at the bottom, **user-scoped** actions that have nowhere else to live: the owner name (`OwnerNameRow`), **Sign out**, and **Delete account**. Those are not pet actions — a user looking to sign out, contact support, or read the privacy policy has no reason to look under a tab named *Pet*, and today there's nothing there to find beyond sign-out/delete.

Separately, four App-Store-readiness items already **assume an in-app "Settings" home that doesn't exist**:

| Item | Needs | Homed by |
|---|---|---|
| **B-229** Privacy policy | An in-app link | About & legal |
| **B-230** Terms of service | An in-app link | About & legal |
| **B-231** App version | A place to show it | Screen foot |
| **B-270** Medical/vet disclaimer | A durable statement | About & legal |

And the support email (**B-273**, `support@getculprit.app`, Cloudflare Email Routing → PM Gmail) has no in-app surface. This screen is the missing home for all of the above — it sits on the submission path, not beside it.

## 2. Goals / non-goals

**Goals**
- A single, calm, benchmark-familiar home for the *owner* (identity, account actions, support, legal, app info).
- Relocate Sign out + Delete account + owner name off the Pet tab.
- Home the four App-Store items (B-229/230/231/270) + the support email (B-273).
- Reserve two new surfaces the PM asked for: **Notifications** and **App feedback** — mocked in v1, structured so wiring is a later flag-flip, not a re-layout.
- **Zero schema.** Owner name lives in `user_profiles`; email in `auth`.

**Non-goals (v1)**
- Functional push notifications (blocked on the push-provider Open Question).
- A feedback backend / admin console (v1 feedback composes an email).
- Change email / password (needs a reauth flow — future).
- Export my data (B-041), Units (lbs/kg), theme, language — real future tenants, **out of scope for this chunk** (see §12).

## 3. Decisions (recommend-and-proceed; PM to ratify)

- **D1 — Entry point = a quiet avatar in the Home header.** A *doorway*, not a fifth tab (design-principles §Navigation: a tab is "a place you return to and act within"; a low-frequency account screen isn't one). The header is chrome — the identity strip that already holds the wordmark + pet switcher — not a Signal card, so Principle 3's "no settings shortcut on Home" holds. Benchmark-aligned (Oura/Calm/Linear/Fitbit/Strava). **PM-confirmed 2026-07-09.**
- **D2 — Name = "You".** Squad's pick over "Profile", which in a pet-first app collides with the pet's own profile (the Pet tab). "You" cleanly means the human, pairs with the avatar, and is well-precedented in health apps (Fitbit/Strava "You"). One-word flip to "Profile" if it reads too informal. **PM deferred to squad; squad → You.**
- **D3 — Route** = `app/settings.tsx` (internal path; user-invisible), **title "You"**. Pushed screen (default push presentation), back chevron to the previous tab.
- **D4 — Relocate off the Pet tab:** owner name (`OwnerNameRow`), Sign out, Delete account move to You. The Pet tab keeps everything pet-scoped, **including the vet report** (it's pet-scoped, not account-scoped). **PM approved the mock 2026-07-09.**
- **D5 — Legal links behind a flag.** `LEGAL_LINKS_ENABLED` (off until getculprit.app + the hosted docs are live, B-273/229/230). While off, the Privacy/Terms rows render **"Coming soon"**, not a dead link — App Review *visits* these URLs, so a 404 is worse than an honest not-yet. The **medical disclaimer** (B-270) is always-visible text (no dependency).
- **D6 — Contact support** = `mailto:support@getculprit.app`, prefilled with app version + platform so triage never starts with "what version are you on?". Falls back to a copyable address alert if no mail client.
- **D7 — Notifications = MOCK in v1.** The push provider is undecided (Open Question; B-015/B-227). The surface is reserved with a clear **"Coming soon"** state. **Safety gate (clinical-guardrails / T&S):** a mocked notifications surface must **not** imply an *active* reminder — an owner who toggles "Medication reminders" on and relies on it while nothing fires is a genuine safety risk (a missed insulin/anti-seizure dose). So v1 shows the categories in a plainly non-live state, and **does not present a medication-reminder that appears armed**. Real wiring is gated on the push-provider decision.
- **D8 — App feedback** = a lightweight in-app composer (a short prompt + optional category + free text) that opens a `mailto:` on send. **Distinct from Contact support:** support = "I need help / something's broken" (reply expected); feedback = "here's a product thought" (no reply guarantee). v1 routes to `support@getculprit.app` with a `[Feedback]` subject tag (one inbox via Cloudflare routing) — **no schema, no backend.** A stored `feedback` table + admin review (or a service like Canny) is a future upgrade (§12). *PM sub-decision: reuse `support@` with a tag (recommended) vs. provision a separate `feedback@`.*
- **D9 — Change email / password = future.** Needs a reauth flow (relates B-119). v1 shows a quiet "Changing your email or password is coming soon" line under the account block rather than a dead row — honest about direction without overpromising. *(Omit entirely if the PM prefers.)*
- **D10 — Owner avatar = email-initial monogram**, fallback to a neutral person glyph if the email is unreadable. Chosen over an owner photo for v1 (no upload flow) and over always-glyph (a monogram is warmer and matches the mock). No extra fetch — the email is already in `authStore`.

## 4. The "You" screen (v1)

### 4.1 Entry point — Home-header avatar
`components/home/HomeHeader.tsx` gains a top-right avatar button aligned with the "Culprit" wordmark: a ~32pt tinted circle showing the owner's initial (D10), `hitSlop` to clear the 44pt floor, `accessibilityRole="button"`, label "You — account and settings", `onPress` → `router.push('/settings')`. The pet identity/switcher row below is unchanged. The avatar renders on the Home tab only (the app's tabs don't share a header) — a single, learnable entry, matching the benchmark.

### 4.2 Screen structure (top → bottom)
Grouped into labelled sections so it scales without becoming a firehose (**Account · Preferences · Support · About · account actions**):

1. **Account**
   - Identity header: avatar monogram (D10) + email (read-only; the stable identity).
   - `OwnerNameRow` (existing, inline-editable name; hint "Shown as the owner on the vet report" — §7.1 of the vet-report spec).
   - Quiet line: "Changing your email or password is coming soon." (D9)
2. **Preferences**
   - **Notifications** row → pushes the Notifications screen (§5). Trailing "Coming soon" while mocked.
3. **Support**
   - **Contact support** row → `mailto` (D6). Sub: "We usually reply within a day."
   - **Share feedback** row → pushes the Feedback screen (§6).
4. **About**
   - **Privacy policy** · **Terms of service** rows (D5 — link when `LEGAL_LINKS_ENABLED`, else "Coming soon").
   - Medical disclaimer, always-visible text: *"Culprit helps you track and share your pet's health. It doesn't diagnose, and it isn't a substitute for professional veterinary care."* (B-270; must never reassure — clinical-guardrails.)
5. **Account actions** (own card, the destructive zone)
   - **Sign out** (neutral) → confirm alert → `supabase.auth.signOut()`.
   - **Delete account** (destructive red) → the existing `DeleteAccountSheet` (B-039 type-to-confirm — **never** demoted to Sign out's light alert).
6. **Version** — quiet, centered at the foot: "Culprit v1.0.0 (build 1)", read live from `expo-constants` (B-231).

### 4.3 What moves off the Pet tab
Remove from `app/(tabs)/profile.tsx`: the "Account" card (owner name / Sign out / Delete account), `handleSignOut`, the `DeleteAccountSheet` instance + its `deleteSheetVisible` state, and the now-unused `useAuthStore`/`OwnerNameRow`/`DeleteAccountSheet` imports + account-only styles. Keep the pet header, info chips, weight, conditions, medications, diet trial, **vet report**, and archive.

### 4.4 Copy (nyx-voice)
Plain, warm, no exclamation marks. Section labels are quiet. "Contact support" / "Share feedback" / "Sign out" / "Delete account" say exactly what happens. The delete sub-line is honest and non-manipulative ("Permanently deletes your account and all pet data"). All owner-facing strings pass the `nyx-voice` gate.

### 4.5 States / edge cases
- No email on the session → identity header shows a neutral glyph + "Signed in"; monogram falls back to the glyph.
- No mail client → Contact support / feedback show a copyable-address alert instead of failing silently.
- Version unreadable → foot reads "Culprit vunknown" (never blank; a bug report is never version-less).
- Legal rows disabled → non-interactive, `accessibilityState={{ disabled: true }}`, "Coming soon".

## 5. Notifications (mocked)
A pushed screen (`app/settings/notifications.tsx`) reachable from the Preferences row.
- A top note establishing it's **not live**: "Notifications aren't turned on yet — we'll let you know the moment they're ready." (Honest empty-state, Principle 5; prevents a false reliance.)
- The reserved categories, shown in a plainly non-active state (not interactive toggles that read as *on*): **Daily check-in nudge** (the Zone-2 nudge, one/day — Principle 4) and **Health insights** (proactive Signal notifications, ≤1/day).
- **No medication-reminder shown as armed** (D7 safety gate). Owner-configured med/care reminders (B-227) are a separate, later build with their own safety framing.
- Real wiring (provider, permission prompt, scheduling, quiet hours) is gated on the push-provider Open Question.

## 6. App feedback
A pushed screen (`app/settings/feedback.tsx`) reachable from the Support row.
- A warm prompt: "What's working? What could be better?" + an optional category (`ChipGroup`: Idea · Problem · Praise) + a free-text field + a **Send** button.
- Send composes a `mailto:` to `support@getculprit.app` with a `[Feedback]` subject (+ category) and the app version appended (reuses the §D6 helper). No schema, no backend (D8).
- Distinct from Contact support in framing (product input vs. help); a one-line note sets expectations ("We read every note; we can't always reply.").
- Future: store submissions in Supabase + an admin view, or adopt a feedback service (§12).

## 7. Data model & schema
**None.** Owner name is `user_profiles.display_name` (existing); email is `auth`. Notifications + feedback are mocked/email in v1. No migration, no RLS change. (When notifications/feedback graduate to real backends, those get their own schema-isolated PRs per the Git Workflow rules.)

## 8. Privacy & safety (Trust & Safety / clinical-guardrails)
- **Delete account** keeps its full B-039 type-to-confirm gravity; this screen becomes the one canonical "your account & data" locus (a T&S win and an App-Review expectation for a health app).
- **Notifications mock must not imply an active reminder** (D7) — the medication case is safety-load-bearing (a relied-upon, non-firing dose reminder). Enforced by copy + the non-live state.
- **Feedback free-text** may contain PII/health detail; the mailto carries only what the owner types + app version/platform (no logs, no pet data auto-attached). A stored backend (future) would need its own retention + RLS review.
- **Medical disclaimer** (B-270) never reassures — it's a neutral "not a substitute for veterinary care" statement.

## 9. Open sub-decisions (build-time, not PM-blocking unless noted)
- **S1 (PM)** — feedback routing: reuse `support@` with a `[Feedback]` tag (recommended, one inbox) vs. provision `feedback@getculprit.app`.
- **S2** — show the "change email/password coming soon" line (D9) or omit it. Recommend show.
- **S3** — Notifications mock: categories shown as static "coming soon" rows vs. visibly-disabled toggles. Recommend static rows (least risk of reading as armed).
- **S4 (PM)** — should Notifications appear at all pre-provider-decision, or wait? Recommend reserve it (mocked) so the IA is complete; the safety gate makes it honest.

## 10. PR-by-PR plan

Small, independently shippable PRs. No schema in any of them. Each carries the DoD (types/lint, tests where there's extractable logic, persona sign-off, `code-reviewer`; `pm-feature-review` on the user-facing screens).

| PR | Title | Scope | Depends on | Reviews |
|---|---|---|---|---|
| **1** | Support + version primitives | `lib/support.ts` (`buildSupportMailto`, `formatAppVersion` — pure, tested), `constants/links.ts` (`SUPPORT_EMAIL`, legal URLs, `LEGAL_LINKS_ENABLED=false`). No UI. | — | code-reviewer; unit tests |
| **2** | The "You" screen + avatar entry + relocation | `app/settings.tsx` (Account / Support / About / account-actions / version per §4.2), `HomeHeader` avatar → `/settings` (§4.1), remove the account block from `app/(tabs)/profile.tsx` (§4.3), register the route in `app/_layout.tsx`. | PR 1 | code-reviewer; **pm-feature-review**; nyx-voice; Designer (P1/P3); T&S (delete stays type-to-confirm) |
| **3** | Notifications (mocked) | `app/settings/notifications.tsx` (§5) + the Preferences row. Honest not-live state; no armed med-reminder (D7 safety gate). | PR 2 | code-reviewer; nyx-voice; **clinical-guardrails** (no false reminder); Designer |
| **4** | App feedback | `app/settings/feedback.tsx` (§6) + the Share-feedback row; composer → `mailto` reusing PR 1's helper. | PR 2 (PR 1 helper) | code-reviewer; nyx-voice; pm-feature-review |
| **5** | Go-live flips (gated / future) | Flip `LEGAL_LINKS_ENABLED` when getculprit.app + legal docs land (B-273/229/230); real notification wiring when the push provider is chosen; feedback backend if/when adopted. Each rides its own gate. | external gates | per-change |

**Parallelism:** PR 1 is a clean unblock; PR 2 is the long pole. **PR 3 and PR 4 are independent of each other** (disjoint files, both only depend on PR 2's screen existing) and can run as concurrent sessions/branches — the one shared-file collision to expect is `app/settings.tsx` (each adds one Preferences/Support row) and `STATUS.md` at wrap. PR 5 is gated on external items and shouldn't block 1–4.

## 11. Acceptance criteria
- [ ] Tapping the Home-header avatar opens the "You" screen; back returns to Home.
- [ ] Account shows the owner email (read-only) + inline-editable name (persists via `updateDisplayName`).
- [ ] Sign out and Delete account are **gone from the Pet tab** and present on You; delete still requires type-to-confirm (B-039).
- [ ] Contact support opens a mail draft to `support@getculprit.app` prefilled with the app version + platform; no-mail-client falls back to a copyable alert.
- [ ] Privacy/Terms render "Coming soon" while `LEGAL_LINKS_ENABLED=false`; the medical disclaimer text is always visible.
- [ ] The version string reads the real build from `expo-constants`.
- [ ] Notifications is reserved with an honest not-live state and **no armed medication reminder** (D7).
- [ ] Share feedback composes a `[Feedback]` mail distinct from Contact support.
- [ ] `tsc` clean, `npm test` green (PR 1 helper unit tests), no anti-patterns introduced, persona sign-off emitted.

## 12. Out of scope / future (real tenants, later chunks)
- **Export my data** (B-041) — sits beside Delete under "Your data"; completes data-rights (Pets > $).
- **Units** (lbs/kg) — the app hardcodes lbs today.
- **Culprit Premium — manage plan + Restore Purchases** (App Store requirement when Premium wires; B-264).
- **Change email / password** (D9 — needs reauth; relates B-119).
- **Connected sign-in** (Apple/Google) when social auth lands (B-281).
- **Manage / archived pets** doorway (a home for the existing `archived-pets` screen); **Share a pet with a co-owner** (household).
- **Help & FAQ** (once getculprit.app has one); **Rate / share Culprit** (low-key growth, never an upsell); **Diagnostics opt-out** (when error reporting lands, B-016); appearance/theme, language.
- Feedback **backend** (stored `feedback` table + admin review, or a service) — upgrades D8's email composer.

---

_Restraint line: no insight/Patterns surfaces here (those stay Home/Patterns — Principle 3); no Premium **pitch** wall (a calm "manage", never an upsell — Pets > $); no per-pet clinical settings (those live on the Pet tab)._
