# Password Recovery — Requirements & Design (B-280)

**Version:** 1.0 (build-ready for PRs 1–2; PR 3 gated on D4) | **Last Updated:** 2026-07-24
**Backlog:** B-280 (`Now`) · touches B-152, B-278, B-281, B-401, B-271
**Status:** design session complete; **three PM rulings open (D1c, D4, D6b)** — see §0.

---

## §0 — Read this first

### 0.1 What this fixes

Culprit is a **login-gated** app. An owner who forgets their password today has **no path back in** — no "Forgot password?" link, no `resetPasswordForEmail` call anywhere in the repo, and `app/settings.tsx:133` telling them that changing a password is "coming soon." The dead end sits on the one screen whose entire job is returning an owner to their pet's health history.

This is not an auth-plumbing chore. The person hitting it is a returning owner locked out mid-diet-trial, or on the day something is wrong with their pet — the exact wedge user. **Recovery is a care path.** It is also a submission gap: the App Store hardening audit (§B2) rates a login-gated app with zero credential recovery as rejection-adjacent and a guaranteed support burden.

### 0.2 What the code actually says (verified this session, not assumed)

| Claim | Evidence |
|---|---|
| Zero recovery code exists | repo-wide grep: no `resetPasswordForEmail`, no `updateUser`, no `PASSWORD_RECOVERY` |
| No deep-link handler exists at all | no `Linking.addEventListener` / `useURL` outside outbound `openURL` calls |
| The client cannot currently receive a session from a URL | `lib/supabase.ts:44` — `detectSessionInUrl: false`, `flowType` unset (defaults to implicit) |
| Scheme is still the retired brand | `app.json:9` — `"scheme": "nyx"`; no `associatedDomains` (no universal links) |
| …and the scheme is now load-bearing | `widgets/CulpritWidget.tsx:158,278` emit `nyx:///` deep links (W5, shipped) |
| The auth listener adopts any session it is handed | `app/_layout.tsx:159` — `if (session) setSession(session)`, no recovery branch |
| `expo-linking` is already a dependency | `package.json` — `expo-linking ~57.0.4`; **no new dependency needed** |
| A reusable "check your inbox" shape exists | `app/(auth)/signup.tsx:161-227` — icon, title, resend, edit-address back-escape |
| Local teardown is already centralised | `lib/session.ts` — `wipeLocalSession()` (SQLite + App Group + widget timeline + stores) |

### 0.3 The two traps that shape the whole design

Both were found by reading `app/_layout.tsx` against the Supabase recovery flow. Neither is obvious from the backlog row, and a spec written without them would look complete and ship broken.

**Trap 1 — the recovery session is just… a session.** Exchanging a recovery link yields a real, fully-privileged session. The root listener at `app/_layout.tsx:159` adopts *any* session unconditionally, so the owner lands on **Home with their password still unchanged and unknown** — the reset silently didn't happen, and the next cold start after token expiry strands them again. The flow therefore needs an explicit *recovery-in-progress* gate that holds the owner on the set-password screen until the write succeeds. → FR-6.

**Trap 2 — a recovery link can cross accounts on a shared device.** If owner **A** is signed in on this phone and a recovery link for owner **B** is opened on it, the exchange replaces the session with B's — while the local SQLite mirror, the App Group snapshots, and the widget timeline still hold **A's pet data**. That is a cross-account health-data exposure on a Home Screen surface, reachable with no attack more sophisticated than tapping the wrong email. The handler must run the existing `wipeLocalSession()` **before** adopting a recovery session for a different `user.id`. → FR-7. This is the single most load-bearing requirement in this document and the reason `rls-privacy-reviewer` is mandatory on PR 2.

### 0.4 What is gated on the PM

| # | Ruling needed | Team recommendation | Blocks |
|---|---|---|---|
| **D1c** | Ship v1 with the **custom-scheme** redirect (same-device only) and accept the desktop-open dead end as a documented limit? Or fund the https interstitial + universal links first? | **Custom scheme now**, interstitial → backlog (B-418). The desktop case is *already* broken and the mitigation is one line of copy. | PR 2 |
| **D4** | Does this track also build **in-app password change** in settings (retiring half the "coming soon" line)? | **Yes, as PR 3** — trivial on an authenticated session, removes a "half-built" signal the audit's Designer lens flagged. **Email change stays out** (needs dual-address re-verification and touches vet-report owner identity). | PR 3 only |
| **D6b** | After a successful reset, **sign out the owner's other devices**? | **No, not in v1** — and this is a genuine conflict, recorded in §7. | PR 2 |

Everything else in §3 is ruled recommend-and-proceed with the rationale stated, per the standing convention.

### 0.5 Hard prerequisite, not a nice-to-have

**B-152's production SMTP gates this flow going live.** Supabase's built-in email sender is explicitly not for production (a low per-hour ceiling, shared reputation). With it, a real owner's reset email does not arrive — and a "check your inbox" state that lies is **worse than the honest dead end we are replacing**, because it consumes the owner's trust before stranding them.

The code in PRs 1–2 is independent and can be built and merged now. **Enabling it for real users is sequenced behind SMTP provisioning** (submission-guide step 4, already a long-lead PM item). §8 carries the mechanism; §9.2 carries the PM checklist.

---

## §1 — Personas & the lens each brought

| Persona | Position |
|---|---|
| **Jordan** (diet-trial dog owner) | "I reset passwords at 11pm one-handed with a dog doing something weird. If this takes more than: tap link, type new password, I'm in — I'm not doing it." Drove the **no-account-re-entry** rule: the reset lands the owner *in the app*, not back at a login form to type credentials a second time. |
| **Sam** (multi-cat, shares the household iPad) | Surfaced Trap 2 from lived shape, not theory: "my partner and I both open my email on the same iPad." Also the D6b dissent — signing out other devices kicks the partner who is mid-log. |
| **Trust & Safety / Privacy** | Owns D2 (enumeration) and FR-7 (the cross-account wipe). Position: neutral response text is **not optional**, and the wipe is a boundary requirement, not defensive polish. |
| **Sr. Product Designer** | Principle 5 — the **expired-link state is a feature**, and it is the state most likely to strand someone (mail scanners consume single-use links before the human taps them). Refused a spec where "error" was one alert. |
| **Dir. of Engineering** | Ruled D1a (PKCE) on the grounds that the custom-scheme redirect *already* constrains the flow to one device, so PKCE's same-device requirement costs nothing and removes tokens-in-URL. Flagged the `flowType` change as client-wide and therefore its own PR. |
| **Sr. QA Associate** | Owns the §10 state matrix — eight reachable terminal states, each with a designed screen and an escape. |
| **Product Owner** | B-278's cost/benefit has **changed** and the row is now stale: it was deferred as "user-invisible," but the widget shipped `nyx:///` deep links and recovery adds a second consumer. Not this track's job to flip; this track's job to say so. |

---

## §2 — The flow

```
Login  ──"Forgot password?"──▶  Request  ──▶  Sent (neutral)
                                                 │
                                    (owner taps link in email, same phone)
                                                 ▼
                                        Deep link  nyx:///reset-password?code=…
                                                 │
                            ┌────────────────────┼────────────────────┐
                            ▼                    ▼                    ▼
                     link invalid /        different user        valid, same/no user
                     expired / used        already signed in            │
                            │                    │                      │
                            ▼              wipeLocalSession()           │
                     Expired state  ────────────▶└──────────▶  Set new password
                     (one tap: send                                     │
                      a new link)                                       ▼
                                                                  Signed in → Home
```

**The owner never re-enters credentials.** Setting the password consumes the recovery session and lands them in the app. Jordan's rule.

---

## §3 — Decision record

### D1 — Delivery and return path

**D1a — Flow type: PKCE.** *(recommend-and-proceed)*
Set `flowType: 'pkce'` on the client. The code arrives as a **query parameter**, so expo-router surfaces it through normal params — no URL-fragment parsing, and no access/refresh tokens ever transiting a URL, a browser history entry, or a referrer header.

PKCE requires the verifier to live on the requesting device, so the email must be opened on the phone that asked. **That constraint is free**: the redirect target is a custom scheme, which a desktop browser cannot open *regardless* of flow type. We are not giving up a working cross-device path — there isn't one. Implicit flow would buy nothing and cost token exposure.

The change is client-wide but **behaviour-neutral today**: the only other consumers are signup-confirmation links (dormant — confirmation is OFF, B-152) and magic links (unused). It still ships in its own PR (PR 1) so a regression has one obvious cause.

**We are knowingly diverging from Supabase's documented React Native example, and here is why** (checked against the live docs this session, not from memory). Their RN sample uses the **implicit** flow: it parses `access_token` + `refresh_token` out of the URL and calls `setSession()`, via `expo-auth-session`'s `QueryParams.getQueryParams`. Two costs we decline to pay:
1. **It adds a dependency.** Implicit returns its tokens in the URL *fragment*, which `expo-linking`'s `Linking.parse()` does not surface — hence their reach for `expo-auth-session`, which we do not currently ship. PKCE returns a **query** parameter, which `Linking.parse()` handles natively. FR-11 (no new dependency) survives only under PKCE.
2. **It puts long-lived tokens in a URL.** A refresh token transiting a URL is strictly worse than a single-use code, on the one flow whose entire job is re-establishing trust.

The documented cross-device benefit of implicit is, again, unrealisable here: the redirect is a custom scheme. `resetPasswordForEmail` explicitly supports PKCE (Supabase JS reference), and `exchangeCodeForSession` is its documented counterpart.

**Corollary — do not build FR-6 on the `PASSWORD_RECOVERY` event.** That event is the *implicit*-flow signal (it is what Supabase's web example keys on). A PKCE exchange surfaces as `SIGNED_IN`, which is indistinguishable from a normal login at the listener. This is precisely why FR-6 uses an explicit flag set by *our* handler before the exchange, rather than pattern-matching an auth-js event — the flag is correct under either flow, and a future flip back to implicit cannot silently un-gate the tabs.

**D1b — Redirect target: `nyx:///reset-password`.** *(recommend-and-proceed)*
Uses the existing scheme and expo-router's file-based deep-link routing. Zero new infrastructure. Requires one PM dashboard action: add the URL to the Supabase **Redirect URLs** allowlist (§9.2), or Supabase refuses the redirect and every link dead-ends.

**Recorded, not fixed here:** the scheme is the *retired brand name*, and during the redirect hop it is briefly visible in the browser — on a security email, which is the least ideal place for a brand inconsistency. Flipping it is **B-278**, which needs a coordinated allowlist update and now also a widget-deep-link update. This track makes B-278 more valuable; it does not do it.

**D1c — The desktop / no-app case. → PM (§0.4).**
A link opened on a laptop redirects to `nyx://…`, which the desktop browser cannot handle: the owner sees a browser error page outside our app, with no explanation.

- **Team rec — accept as a documented limit in v1.** Mitigate with copy in the Sent state ("Open the link on this phone") and a matching line in the email template. Cost: one sentence.
- **Alternative — an https interstitial** at `getculprit.app/reset` that deep-links into the app and explains itself on desktop. Correct long-term, but it is cross-repo work in `culprit-web` plus (for a seamless hop) an `associatedDomains` entitlement and an `apple-app-site-association` file — a native-config change and a build-cut. → filed as **B-418**, recommended post-submission.

**D2 — Enumeration posture: always neutral.** *(T&S-led, recommend-and-proceed)*
The Sent state is shown for **every** well-formed address, and its copy never asserts an account exists: *"If that email has an account, we've sent a link."* Supabase's own enumeration protection must also be ON (§9.2) so timing and error shape don't leak what the copy withholds.

The UX cost is real and is paid for explicitly: an owner who typos their address waits for an email that will never arrive. Three affordances close that hole — an **edit-address escape** (the signup verify-state pattern, `signup.tsx:171-181`), a **resend**, and a **support escape** after the first resend (§5.3). Without those, neutral copy is just a dead end wearing better manners.

**D3 — Where the new password is typed: in-app.** *(recommend-and-proceed)*
`app/(auth)/reset-password.tsx`, reusing `TextField` + `PrimaryButton` + the same validators as signup (`passwordError` from `lib/authValidation.ts`), so the rules an owner meets on the way in are the rules they meet on the way back. A Supabase-hosted page would break voice, break Jordan's no-re-entry rule, and hand off the most trust-sensitive screen in the app to a page we don't style.

**D4 — Scope: password *change* in settings. → PM (§0.4).**
Recommendation **in, as PR 3**: `updateUser({ password })` on an authenticated session, behind the current-password re-check. It retires half of the `settings.tsx:133` "coming soon" line, and the audit's Designer lens specifically flagged that a curious stranger meets three "Coming soon" surfaces in session one and reads the app as half-built.
**Email change stays out** — it needs verification of both the old and new addresses, and the owner email is what the vet report's "Owner:" line and every share artifact key on. That is its own track, filed as **B-419**.

**D5 — Social-auth accounts (B-281).** *(recommend-and-proceed)*
Moot today (`SOCIAL_AUTH_ENABLED = false` — every account is email/password) but must not become a leak later. D2's neutral copy is already the correct answer: it holds for an OAuth-only account without disclosing the account's auth method. Setting a password on an OAuth account is legitimate — it adds a credential rather than replacing the identity. **Re-verify at B-251 PR 11** when the flag flips; noted on the B-281 row.

**D6 — Post-reset session handling.**

**D6a — The recovery gate and the cross-account wipe are mandatory.** *(recommend-and-proceed)* — FR-6 and FR-7, the §0.3 traps. Not negotiable and not deferrable to a follow-up; both are correctness, not polish.

**D6b — Sign out other devices? → PM (§0.4). Genuine persona conflict:**

> **Trust & Safety:** A password reset is the canonical "I may have been compromised" moment. Leaving other sessions live means a reset does not actually evict anyone.
> **Sam (cat owner) + Pet Owner lens:** Our households share one credential — that is documented in our own evidence base (B-054/B-086, and the PM's own household). Silently signing out the partner's phone mid-log, with no explanation on *their* device, breaks capture for the person who didn't do anything. They will read it as the app logging them out at random, which is the exact bug class `lib/authRouting.ts` exists to prevent.
> **Dir. of Engineering:** Both are one line (`signOut({ scope: 'others' })`). This is a product call, not a cost call.
> **Team recommendation: no in v1**, revisit when the household primitive (B-292) makes "your other devices" a concept the owner can actually see and reason about. Evicting sessions an owner cannot enumerate is a security gesture they can't verify.

**PM decision needed.** Do not resolve silently.

**D7 — Resend cadence and abuse.** *(recommend-and-proceed)*
Client-side **60-second cooldown** with a visible countdown on the resend control (server-side limits stay authoritative — the client cooldown exists so the owner sees *why* nothing happened, rather than tapping into a silent server rejection). Copy stays warm and never scolds: Principle 4 governs, and the owner is already having a bad day.

**D8 — Single-use links and mail scanners.** *(recommend-and-proceed)*
Recovery links are single-use, and corporate mail-security scanners routinely fetch links before the human taps them — so "already used" is a **normal**, non-exceptional state that a blameless owner will hit. It renders as the same designed state as expiry (§5.5): one honest sentence, one tap to send a new link. It is never an error alert, and never phrased as though the owner did something wrong.

---

## §4 — Functional requirements

| # | Requirement |
|---|---|
| **FR-1** | A **"Forgot password?"** control sits under the password field on `app/(auth)/login.tsx`, ≥44pt tap target, reachable before any submit attempt. |
| **FR-2** | The request screen accepts an email, validates with the shipped `emailError`, and calls `resetPasswordForEmail(email, { redirectTo })`. It **pre-fills** whatever the owner already typed on login (they just typed it; asking twice is a decision at the moment of need). |
| **FR-3** | The Sent state is **identical for existing and non-existing addresses** (D2) and carries three escapes: resend (D7 cooldown), edit address, contact support. |
| **FR-4** | A deep-link handler parses `nyx:///reset-password` and classifies the result into exactly one of: `valid` · `expired` · `used` · `invalid` · `error`. Classification is a **pure function** over the URL, unit-tested. |
| **FR-5** | On `valid`, the app exchanges the code for a session and routes to the set-password screen. |
| **FR-6** | **The recovery gate.** A `recoveryInProgress` flag is set on the auth store **before** the exchange and cleared only after the password write succeeds. While set, the router holds the owner on the set-password screen — the authenticated tabs are not reachable. (Trap 1.) |
| **FR-7** | **The cross-account wipe.** Before adopting a recovery session whose `user.id` differs from the currently-stored session's, the handler runs `wipeLocalSession()` — the same teardown `SIGNED_OUT` runs, covering SQLite, the App Group container, the widget timeline, the active-pet selection, and the onboarding draft. (Trap 2.) |
| **FR-8** | The set-password screen enforces the **same** password rules as signup (shared `passwordError`), and on success signs the owner into the app — never back to a login form (Jordan's rule). |
| **FR-9** | Every terminal state in §10 has a **designed screen** with at least one forward action. No `Alert.alert` is the sole representation of any state. |
| **FR-10** | The flow degrades honestly with no network: a failed request surfaces a calm retry, never a false Sent state. |
| **FR-11** | No new secret. No new dependency. No schema change. No new Edge Function. |

---

## §5 — Screens, states, and the copy pack

All copy below is the **shipping text**, written to `nyx-voice` (second-person owner, no exclamation marks, specific over generic, no dev-speak, no blame).

### 5.1 Login — the entry point
- Link: **`Forgot password?`** — placed under the password field, above the primary button.

### 5.2 Request screen (`app/(auth)/forgot-password.tsx`)
- Title: **`Reset your password`**
- Body: **`Enter your email and we'll send you a link to set a new one.`**
- Field: `Email` (pre-filled from login)
- Primary: **`Send reset link`**

### 5.3 Sent state — neutral (D2)
- Title: **`Check your inbox`**
- Body: **`If {email} has an account, we've sent a link to set a new password. Open it on this phone.`**
  *(The second sentence is D1c's entire mitigation — it earns its place.)*
- Primary: **`Open email app`** (reuses signup's `message://` handler + its fallback)
- Secondary: **`Resend link`** → cooling down: **`Resend in {n}s`**
- Tertiary: **`Use a different email`** (edit-address escape)
- After the first resend, reveal: **`Still nothing? Contact support`** → `SUPPORT_EMAIL` mailto

### 5.4 Set new password (`app/(auth)/reset-password.tsx`)
- Title: **`Set a new password`**
- Body: **`Almost there — choose a password and we'll take you back to {petName}.`**
  *Falls back to `…take you back in.` when no pet name is available. Nothing is fetched to satisfy this line: it renders the name only if the local mirror already has it (and after an FR-7 wipe it will not — correctly, since that pet belongs to another account).*
- Field: `New password` + the shipped inline validation
- Primary: **`Save and continue`**

### 5.5 Expired / already-used link (D8) — the state most likely to strand someone
- Title: **`That link has expired`**
- Body: **`Reset links only work once, and they don't last long. Send yourself a fresh one.`**
  *No blame, no "invalid token," no error code. It names the two real causes so a scanner-consumed link doesn't read as the owner's mistake.*
- Primary: **`Send a new link`** → returns to §5.2 with the address retained
- Tertiary: **`Back to log in`**

### 5.6 Request failed (no network / server error)
- Title: **`Couldn't send that link`**
- Body: **`Check your connection and try again.`**
- Primary: **`Try again`** · Tertiary: **`Back to log in`**

### 5.7 Settings — change password (PR 3, gated on D4)
- Row replaces the current "coming soon" note: **`Change password`**
- Screen title: **`Change password`**; fields `Current password`, `New password`
- Primary: **`Save`** · success confirmation: **`Password updated.`**

---

## §6 — Technical design

### 6.1 New files
| File | Contents |
|---|---|
| `lib/passwordRecovery.ts` | **Pure.** `parseRecoveryLink(url): RecoveryLinkResult` (FR-4 classification), `resendCooldown` state machine (D7), `recoveryRedirectUrl()`. No I/O — fully unit-testable. |
| `lib/passwordRecovery.test.ts` | Cases per §10, including the fragment-error shapes Supabase emits and a malformed-URL fallback to `invalid` (never a throw). |
| `app/(auth)/forgot-password.tsx` | §5.2 + §5.3 + §5.6 states. |
| `app/(auth)/reset-password.tsx` | §5.4 + §5.5 states; owns the FR-6 gate release. |
| `app/settings/password.tsx` | §5.7 (PR 3, D4). |

### 6.2 Changed files
| File | Change |
|---|---|
| `lib/supabase.ts` | `flowType: 'pkce'` (D1a). `detectSessionInUrl` stays `false` — the app handles the link explicitly rather than letting auth-js adopt a session behind the router's back. |
| `app/_layout.tsx` | Deep-link listener (`expo-linking`, cold start + warm) → FR-4/5/7; and the FR-6 branch in the existing `onAuthStateChange` handler so an adopted recovery session cannot fall through to `setSession` → tabs. |
| `store/authStore.ts` | `recoveryInProgress: boolean` + setter (FR-6). |
| `app/(auth)/login.tsx` | FR-1 link. |
| `app/settings.tsx` | PR 3 only — replace the "coming soon" note with the row. |

### 6.3 Why the gate lives in the store, not in the screen

**There is already a precedent to copy.** `store/authStore.ts` carries `justDeletedAccount` — a transient one-shot flag set before a routing transition and read by the screen that transition lands on (B-039 FR-12), deliberately untouched by `setSession(null)` and by the `petStore.reset()` that the `SIGNED_OUT` handler runs. `recoveryInProgress` is the same shape and the same lifecycle, and should follow its conventions rather than inventing a second pattern for flags that outlive an auth transition.

The recovery session arrives through `onAuthStateChange`, which fires from `app/_layout.tsx` — above every screen. A screen-local flag cannot suppress the root listener's routing, and a cold start with a persisted recovery session would bypass a screen-local guard entirely. The flag has to be readable at the same altitude as the listener that would otherwise route past it.

### 6.4 Ordering inside the handler (this order is load-bearing)
1. Parse the URL → classify (FR-4). Non-`valid` never touches auth state at all.
2. Read the current stored session's `user.id`.
3. Set `recoveryInProgress = true` (**before** the exchange — an exchange that resolves while the flag is unset is Trap 1).
4. `exchangeCodeForSession(code)`.
5. If the new `user.id` differs from step 2's → `await wipeLocalSession()` **before** the session reaches the pet stores (Trap 2).
6. Route to `reset-password`.
7. On a successful `updateUser({ password })` → clear the flag → `replace('/(tabs)')`.

Steps 3 and 5 are the two the reviewer should attack hardest.

---

## §7 — Safety, privacy, and the invariants

- **The clinical invariants are not implicated.** No pet-health inference, no n=1 read, no AI. `clinical-guardrails` is **N/A** here, stated explicitly rather than left silent.
- **The privacy boundary is squarely implicated** — FR-7 is a cross-account health-data exposure on a shared device, and FR-6 governs a fully-privileged session. `rls-privacy-reviewer` is **mandatory on PR 2** and its verdict is a merge gate.
- **Pets > $** — recovery is core access to the owner's own record. Free, unconditionally, forever. It is not a Premium surface and cannot become one.
- **Principle 5** — §5.5 and §5.6 are designed states, not error alerts. That is the whole point of the track.
- **Principle 4** — the resend cooldown informs, never scolds.

---

## §8 — The SMTP dependency (B-152)

The flow is **built and merged** independently of SMTP. What SMTP gates is whether the entry point is *visible to real users*.

**Mechanism:** the FR-1 link renders behind a single build-time constant in `constants/flags.ts`, `PASSWORD_RECOVERY_ENABLED`, following the shipped `SOCIAL_AUTH_ENABLED` convention (hidden entirely when off — never shown-disabled, per the same §8/S7 reasoning that governs the social block). Flip it on in the same session that verifies the first real reset email lands.

Deliberately **not** an `app_config` allowlist flag: this is not an experiment being dogfooded, it is a submission-blocking capability with a one-way flip, and a server-flippable flag would imply a rollback posture we don't want on a recovery path.

**Sequence:** provision SMTP (guide step 4) → send one real reset end-to-end on device → flip the constant → the dead end is closed.

---

## §9 — PR plan

| PR | Scope | Gates | Build-ready? |
|---|---|---|---|
| **1** | Foundations — `flowType: 'pkce'`, `lib/passwordRecovery.ts` + tests, `recoveryInProgress` on the auth store, the `PASSWORD_RECOVERY_ENABLED` constant (off). **No user-visible change.** | `code-reviewer`; `npm test` | ✅ **Yes — today.** Independent of every open ruling. |
| **2** | The whole flow — FR-1 through FR-10: login link, request, Sent, deep-link handler, recovery gate, cross-account wipe, set-password, expired/used, request-failed. | **`rls-privacy-reviewer` (mandatory, merge gate)** · `nyx-voice` · `pm-feature-review` · `code-reviewer` | ⚠️ **On D1c.** Everything else is ruled. |
| **3** | Settings → change password (§5.7); retires half the "coming soon" line. | `nyx-voice` · `code-reviewer` | ⚠️ **On D4.** |
| **4** | Enablement — flip `PASSWORD_RECOVERY_ENABLED`, on-device end-to-end verification, dashboard checklist confirmed. | On-device QA (§10) | ⛔ **On B-152 SMTP** (PM). |

**PR 2 is deliberately not split further.** Request-without-handler ships an email whose link goes nowhere; handler-without-request ships unreachable code. Splitting this particular flow would ship a dead end — the exact defect the track exists to remove.

### 9.1 Parallelism
PR 1 is disjoint from every other live track (`lib/`, `store/authStore.ts`, `constants/flags.ts`) and can run concurrently with the Ask A5 client work, the widget W6 cut, and B-351 slices 3–5. PR 2 touches `app/_layout.tsx`, which the **widget W6** work also touches — that is the one collision to expect, plus `STATUS.md` at wrap.

### 9.2 PM / dashboard actions (none of these are code)
- [ ] **Redirect allowlist** — add `nyx:///reset-password` to Supabase → Auth → URL Configuration. **Without this, every link dead-ends.**
- [ ] **Email enumeration protection** — confirm ON (D2's server half; the copy alone is not the control).
- [ ] **Auth email templates** — the recovery template still says "Nyx" (audit §B7). Rewrite to Culprit; include D1c's "open on your phone" line.
- [ ] **OTP / link expiry** — confirm the recovery link lifetime; §5.5's copy assumes "doesn't last long" is true.
- [ ] **Production SMTP** (B-152, guide step 4) — the §8 gate.
- [ ] Confirm rate limits on the recovery endpoint are sane for a real user retrying twice.

---

## §10 — QA state matrix

Every row is a reachable terminal state with a designed screen and a forward action.

| # | State | Trigger | Expected |
|---|---|---|---|
| 1 | Request sent, account exists | Valid known email | §5.3 Sent; email arrives |
| 2 | Request sent, **no** account | Unknown email | §5.3 Sent — **byte-identical** to #1 (D2) |
| 3 | Malformed email | `a@b` | Inline validation; no network call |
| 4 | Offline request | Airplane mode | §5.6; **no** false Sent state (FR-10) |
| 5 | Resend before cooldown | Tap twice | `Resend in {n}s`; no second send |
| 6 | Valid link, same device, signed out | Tap link | Set-password → Home, no re-login (FR-8) |
| 7 | Valid link, **different user signed in** | A signed in, B's link | `wipeLocalSession()` runs, **then** B's session adopted; no A data on device or widget (FR-7) |
| 8 | Valid link, **same** user signed in | Tap while logged in | Set-password, not a silent no-op |
| 9 | Expired link | Wait past expiry | §5.5 + one-tap resend |
| 10 | Already-used link | Tap twice / scanner-consumed | §5.5, identical to #9 (D8) |
| 11 | Malformed / truncated link | Hand-mangled URL | `invalid` → §5.5; **never a crash** |
| 12 | Cold start from link | App not running | Same as #6 — the gate survives a cold start (FR-6) |
| 13 | Link, then background mid-reset | Background on set-password | Returns to set-password, still gated |
| 14 | Desktop open | Email on laptop | Browser error **outside** the app — the documented D1c limit |
| 15 | New password fails rules | Weak password | Inline error, same rules as signup (FR-8) |

Rows **7, 11, and 12** are the ones that fail silently if the §6.4 ordering is wrong. Row **2** is verified by comparing rendered output, not by reading the code.

---

## §11 — Out of scope (filed, not forgotten)

| Item | Row |
|---|---|
| https interstitial + universal links (D1c alternative) | **B-418** |
| Change email address (D4's excluded half) | **B-419** |
| Deep-link scheme `nyx://` → `culprit://` | **B-278** (existing; cost/benefit changed — see §1) |
| Social-auth recovery re-verification | **B-281** (existing; noted) |
| "Verify later · continue for now" routes to the login wall | **B-401** (existing; belongs to B-152 part 2) |
| Sign out other devices | D6b — revisit at **B-292** if declined |
