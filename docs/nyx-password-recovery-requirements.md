# Password Recovery — Requirements & Design (B-280)

**Version:** 1.1 — *revised after review; §6.4 rewritten* | **Last Updated:** 2026-07-24
**Backlog:** B-280 (`Now`) · touches B-152, B-278, B-281, B-401, B-271 · files B-418/B-419/B-420/B-421
**Status:** design session complete. **PR 1 build-ready.** PR 2 gated on **three PM rulings (D1c, D4, D6b)** + **three device checks (§9.3)** — see §0.
**Reviews run:** `nyx-voice` ✓ · `pm-feature-review` (2 SHIP-SHAPED / 2 NEEDS-WORK / 1 INSUFFICIENT) · `rls-privacy-reviewer` **FAIL on v1.0 — 5 merge blockers, all folded in**. Full record + attack log: **§12**.

> **v1.0 → v1.1 in one line:** the privacy gate broke the original cross-account fix five ways, because `wipeLocalSession()` was built for the `SIGNED_OUT` transition (session → **null**) and a recovery swap is non-null → non-null. §6.4 now forces a real `signOut()` before the exchange and reuses the shipped teardown instead of inventing a second one.

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

**Trap 2 — a recovery link can cross accounts on a shared device.** If owner **A** is signed in on this phone and a recovery link for owner **B** is opened on it, the exchange replaces the session with B's — while the local SQLite mirror, the App Group snapshots, and the widget timeline still hold **A's pet data**. That is a cross-account health-data exposure on a Home Screen surface, reachable with no attack more sophisticated than tapping the wrong email. → FR-7.

**⚠ The first fix for Trap 2 was itself broken, and the reason generalises.** The v1 draft said "compare `user.id`, wipe if different." `rls-privacy-reviewer` broke that five ways (§12), all rooting in one assumption: **`wipeLocalSession()` was written for the `SIGNED_OUT` shape, where the session goes *null*. A recovery swap is non-null → non-null** — a shape the teardown machinery has never had to handle, so the session-keyed producers re-arm instead of unmounting and re-publish A's data *after* the wipe. The corrected design (§6.4) stops reaching for a second teardown and forces a real `signOut()` first. **When a new flow reuses an existing teardown, check the transition shape it was written for, not just what it clears.**

### 0.4 What is gated on the PM

| # | Ruling needed | Team recommendation | Blocks |
|---|---|---|---|
| **D1c** | Ship v1 with the **custom-scheme** redirect (same-device only) and accept the desktop-open dead end as a documented limit? Or fund the https interstitial + universal links first? | **Custom scheme now**, interstitial → backlog (B-418). The desktop case is *already* broken and the mitigation is one line of copy. | PR 2 |
| **D4** | Does this track also build **in-app password change** in settings (retiring half the "coming soon" line)? | **Yes, as PR 3** — trivial on an authenticated session, removes a "half-built" signal the audit's Designer lens flagged. **Email change stays out** (needs dual-address re-verification and touches vet-report owner identity). | PR 3 only |
| **D6b** | After a successful reset, **sign out the owner's other devices**? | **No, not in v1** — and this is a genuine conflict, recorded in §7. | PR 2 |

Everything else in §3 is ruled recommend-and-proceed with the rationale stated, per the standing convention.

**Three device checks (§9.3) also gate PR 2's design** — Q1 (does a desktop open burn the token?), Q2 (is a missing PKCE verifier distinguishable from expiry?), Q3 (does `message://` reach a Gmail-only owner?). Q1 changes how strongly D1c must be mitigated; **Q2 can reopen D1a.** None can be settled by reading code.

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

**⚠ The cost of this limit may be understated, and `pm-feature-review` is right that it changes the mitigation.** The emailed link points at Supabase's `/auth/v1/verify?token=…&redirect_to=…`, and that hop runs **server-side before the redirect** — the very mechanism D8 credits for mail scanners consuming links. If so, opening on a laptop **burns the token**, and the owner who then walks to their phone hits §5.5 on their first honest attempt. The desktop case would then not be "a browser error outside our app" but a **consumed reset**.

If confirmed (§9.3-Q1), the mitigation is load-bearing rather than a convenience hint, and its primary home is the **email template** — above the button, where the desktop owner is actually looking — not only the in-app Sent state they never see: *"Open this link on the phone where you asked for it — opening it anywhere else uses it up."*

- **Team rec — accept as a documented limit in v1.** Mitigate with copy in the Sent state ("Open the link on this phone") and a matching, appropriately-strengthened line in the email template. Cost: one sentence — or one sentence and a device check.
- **Alternative — an https interstitial** at `getculprit.app/reset` that deep-links into the app and explains itself on desktop. Correct long-term, but it is cross-repo work in `culprit-web` plus (for a seamless hop) an `associatedDomains` entitlement and an `apple-app-site-association` file — a native-config change and a build-cut. → filed as **B-418**, recommended post-submission.

**D2 — Enumeration posture: always neutral.** *(T&S-led, recommend-and-proceed; **scope widened after review**)*

**The v1 draft audited one screen and asserted a dashboard control it had not checked.** The Sent state, the resend, and the conditional support escape all **held** under attack — none is conditional on a server response. But the two *adjacent* screens already carry existence oracles this track must own, because it is the track that makes enumeration a stated posture:
- `login.tsx:84` renders `error.message` **verbatim**. Neutral today, but it becomes a positive oracle the day B-152 part 2 turns email confirmation on: *"Email not confirmed"* ⟹ this account exists. (§5.1b's copy fix closes it.)
- `signup.tsx:80` does the same for `signUp`, and `signup.tsx:92-99` shows an explicit **"You already have an account"** — a deliberate disclosure whose safety rests on a Supabase behaviour nobody has verified.

**And "confirm enumeration protection is ON" is not a free checkbox** (§9.2). Flipping it changes the behaviour of a shipped screen this track doesn't otherwise touch: signup's `identities?.length === 0` branch exists *because* of that setting. Either it is already on — and that redirect is dead code the spec should say so about — or turning it on is an **untested behaviour change to account creation** that needs its own QA row.
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

**`rls-privacy-reviewer` sharpened the framing, and the PM should see the inversion plainly:** combined with FR-7, "no" means a reset **destroys an innocent co-resident's unsynced local queue** (mitigated but not eliminated by §6.4 step 4's flush) while **evicting no session anywhere** — the opposite of what "reset my password" implies on both counts. Two binding conditions follow, whichever way this is ruled:
- **No copy anywhere may imply other devices were signed out.** Nothing in the current pack does; keep it that way.
- If "no", the only compensating control the owner has is **being told their password changed** — so the Supabase *password-changed notification email* must be enabled (§9.2). Declining D6b without it leaves an account takeover completely silent.

**PM decision needed.** Do not resolve silently.

**D7 — Resend cadence and abuse.** *(recommend-and-proceed)*
Client-side **60-second cooldown** with a visible countdown on the resend control (server-side limits stay authoritative — the client cooldown exists so the owner sees *why* nothing happened, rather than tapping into a silent server rejection). Copy stays warm and never scolds: Principle 4 governs, and the owner is already having a bad day.

**The cooldown starts at the *initial* send, not at the first resend** — so the Sent state renders `Resend in 60s` from first paint. Starting it at the first *resend* leaves the single most likely tap uncooled: the impatient one at t≈5s, which is exactly the tap that hits the server's rate limit and produces the silent rejection this decision exists to prevent. (Caught by `pm-feature-review`; the original design defeated its own stated rationale.)

**D8 — Single-use links and mail scanners.** *(recommend-and-proceed)*
Recovery links are single-use, and corporate mail-security scanners routinely fetch links before the human taps them — so "already used" is a **normal**, non-exceptional state that a blameless owner will hit. It renders as the same designed state as expiry (§5.5): one honest sentence, one tap to send a new link. It is never an error alert, and never phrased as though the owner did something wrong.

**A third cause, found by review: resending silently invalidates the earlier email.** Every `resetPasswordForEmail` mints a fresh PKCE verifier, overwriting the previous one (`lib/secureStore.ts:84-92`). An owner who taps "Resend link" and then opens the **first** email — the one that arrived first, which is the natural thing to do — hits an unexchangeable link. This is now a third reason §5.5's title cannot say "expired": under the v1 copy that owner was told *"reset links only work once, and they don't last long"*, and **both stated causes were false**. §10 row 20 covers it.

---

## §4 — Functional requirements

| # | Requirement |
|---|---|
| **FR-1** | A **"Forgot password?"** control sits under the password field on `app/(auth)/login.tsx`, ≥44pt tap target, reachable before any submit attempt. |
| **FR-2** | The request screen accepts an email, validates with the shipped `emailError`, and calls `resetPasswordForEmail(email, { redirectTo })`. It **pre-fills** whatever the owner already typed on login (they just typed it; asking twice is a decision at the moment of need). |
| **FR-3** | The Sent state is **identical for existing and non-existing addresses** (D2) and carries three escapes: resend (D7 cooldown), edit address, contact support. |
| **FR-4** | **Two** classifications, not one — the v1 draft's "classify the URL" was incomplete and that is what made a failed exchange unreachable in §6.4. **(a)** the *URL shape* (`valid-shaped` · `error-shaped` · `malformed`), a pure unit-tested function; **(b)** the *exchange result* (`expired` · `used` · `wrong_device` · `error`), which under PKCE is discoverable **only** from the exchange response — the success shape is an opaque `?code=`. Both get designed states. `wrong_device` (§5.5b) is conditional on §9.3-Q2. |
| **FR-5** | On `valid`, the app exchanges the code for a session and routes to the set-password screen. |
| **FR-6** | **The recovery gate.** `recoveryInProgress` is set before the exchange and **persisted to disk** — a plain zustand field is in-memory while the recovery *session* is persisted, so a jetsam/force-quit/crash on the set-password screen resumes straight into the tabs with the password unchanged (Trap 1, verbatim). Enforced at the router by §6.5. |
| **FR-7** | **The unconditional pre-exchange sign-out.** The handler calls `signOut()` **before** `exchangeCodeForSession`, letting the shipped `SIGNED_OUT` teardown run in full. No `user.id` comparison — comparison fails **open** on cold-start-from-link and in the `retain` state (`authRouting.ts`), both normal. Fail-closed by construction. (Trap 2; §6.4.) |
| **FR-14** | **Local provenance.** A recovery link is honoured only if this device recorded the request (FR-12's marker). Any app or webpage can fire `nyx:///reset-password?code=x`; an unauthenticated URL must never set the gate. Doubles as the `wrong_device` signal (§5.5b). |
| **FR-15** | The gate is cleared in a **`finally`** on every non-success path. Clearing only on success wedges the app in the gate — permanently, once FR-6 persists it. |
| **FR-16** | The set-password screen has an **explicit escape** that calls `signOut()` and clears the gate. A recovery session is full-privilege and already hydrated (§6.6); abandoning a reset must be a designed terminal state, not a trap. |
| **FR-17** | The recovery `code`, the verifier, and any raw deep-link URL are **never logged**. `lib/authDebug.ts`'s `SENSITIVE_KEY_RE` matches none of `code`/`verifier`/`url`, and `MAX_DETAIL_STRING = 64` stores shorter strings **verbatim** — `nyx:///reset-password?code=` (27) + a 36-char code = **63**, under the threshold, in a log `app/settings/diagnostics.tsx` invites the owner to **share**. Widen the regex in PR 1. |
| **FR-8** | The set-password screen enforces the **same** password rules as signup (shared `passwordError`), and on success signs the owner into the app — never back to a login form (Jordan's rule). |
| **FR-9** | Every terminal state in §10 has a **designed screen** with at least one forward action. No `Alert.alert` is the sole representation of any state. |
| **FR-10** | The flow degrades honestly with no network: a failed request surfaces a calm retry, never a false Sent state. |
| **FR-11** | No new secret. No new dependency. No schema change. No new Edge Function. |
| **FR-12** | The last-requested email is **persisted locally at request time**, so §5.5's `Send a new link` and §5.5b both return to a pre-filled request screen. Without this, the cold-start-from-link path (§10 row 12) hands the owner a blank field on the state most likely to strand them. Cleared on a successful reset and by `wipeLocalSession()`. |
| **FR-13** | The login-failure alert (§5.1b) carries a **`Reset password`** action and never renders a raw server string. |

---

## §5 — Screens, states, and the copy pack

All copy below is the **shipping text**, written to `nyx-voice` (second-person owner, no exclamation marks, specific over generic, no dev-speak, no blame).

### 5.1 Login — the entry point
- Link: **`Forgot password?`** — placed under the password field, above the primary button.

### 5.1b Login failure — the moment of discovery *(added after `pm-feature-review`)*
An owner discovers they need this flow by **failing a login** — and that path today is `Alert.alert("Couldn't sign you in", error.message)` (`login.tsx:84`), which renders Supabase's raw `Invalid login credentials` in a modal sitting **on top of** the new FR-1 link. That is a shipped `nyx-voice` Pattern 8 violation on the highest-intent screen in the flow, and this track is what makes it fixable.
- Alert title: **`Couldn't sign you in`** (unchanged)
- Body: **`We couldn't sign you in with that email and password.`** (replaces `error.message`)
- Actions: **`Reset password`** → `/(auth)/forgot-password` · **`Try again`**

Putting the recovery affordance *inside* the alert announcing the failure is the whole point — otherwise the modal hides the link the owner needs.

### 5.2 Request screen (`app/(auth)/forgot-password.tsx`)
- Title: **`Reset your password`**
- Body: **`Check your email address is right and we'll send you a link to set a new one.`**
  *Not "enter your email" — it is pre-filled, so instructing an action already done wastes the line. A wrong email and a wrong password produce the **identical** `Invalid login credentials`, so an owner who mistyped their address arrives here certain they forgot their password, and FR-2's pre-fill faithfully carries the typo forward. This is the last cheap place to catch it before D2's neutral Sent state hides it.*
- Field: `Email` (pre-filled from login)
- Primary: **`Send reset link`**

### 5.3 Sent state — neutral (D2)
- Title: **`Check your inbox`**
- Body: **`If {email} has an account, we've sent a link to set a new password. Open it on this phone. It should arrive in a minute or two — check your spam folder if it doesn't.`**
  *"Open it on this phone" is D1c's mitigation. The spam line is the highest-frequency real cause of "it never came", and it is **enumeration-neutral**, so D2 costs nothing here — without it every affordance on the screen routes the owner toward resending, and the second email lands in the same spam folder.*
- Primary: **`Open email app`** (reuses signup's `message://` handler + its fallback)
- Secondary: **`Use a different email`** — teal, in the shipped auth-link language (`login.tsx:266`, `signup.tsx:483`), **not** grey. It is the single affordance that rescues the typo case; styling it as a caption is what makes D2's neutrality unaffordable.
- Tertiary: **`Resend in {n}s`** → **`Resend link`** when cool
- **`Still nothing? Contact support`** + `We usually reply within a day.` (the expectation `settings.tsx:164` already ships) → `SUPPORT_EMAIL` mailto

**Control order is deliberate:** primary → edit-address → resend → support. The two *escapes* must not rank below a disabled countdown, which is where a naive layout puts them.

### 5.4 Set new password (`app/(auth)/reset-password.tsx`)
- Title: **`Set a new password`**
- Body: **`Almost there — choose a password and we'll take you back to {petName}.`**
  *Falls back to `…take you back in.` when no pet name is available. Nothing is fetched to satisfy this line: it renders the name only if the local mirror already has it (and after an FR-7 wipe it will not — correctly, since that pet belongs to another account).*
- Field: `New password` + the shipped inline validation
- Primary: **`Save and continue`**

### 5.5 Link no longer works (D8) — the state most likely to strand someone
- Title: **`That link no longer works`**
  *Deliberately **not** "That link has expired." This state is the destination for expiry, scanner-consumption, a malformed URL, and (if D1c-Q1 confirms) a desktop-burned token — so a title naming **expiry specifically** is false in most of the ways an owner actually arrives here. An owner who received the email ninety seconds ago and is told it "expired" concludes the app is broken. Flagged independently by the `nyx-voice` pass and `pm-feature-review`; specificity loses to honesty when we don't actually know the cause.*
- Body: **`Reset links only work once, and they don't last long. Send yourself a fresh one.`**
  *No blame, no "invalid token," no error code. The body names both real causes, so a scanner-consumed link doesn't read as the owner's mistake.*
- Primary: **`Send a new link`** → returns to §5.2 **pre-filled** (see FR-12 — the address must be persisted at request time, or a cold start hands the owner a blank field on the state most likely to strand them)
- Tertiary: **`Back to log in`** — and the back chevron follows `login.tsx:61-67`'s `canGoBack()` → else `replace('/(auth)')` pattern, or is dropped. On a cold start from a link there is nothing behind it.

### 5.5b Wrong device (PKCE verifier absent) *(added after `pm-feature-review`)*
The direct cost of D1a. Sam requests a reset on her iPhone and opens her email on the **shared household iPad**, where Culprit is also installed: that app receives the deep link, holds no verifier, and the exchange fails. Rendering §5.5 there would be **untrue and unactionable** — and this is Sam's documented behaviour (§1), not a hypothetical.

Unlike expiry, this condition is **locally knowable** — this device never requested a reset — so it earns its own FR-4 classification rather than collapsing into the generic failure.
- Title: **`Open this link on the phone you asked from`**
- Body: **`For your security, a reset link only works on the device that asked for it. You can send a fresh one from this device instead.`**
- Primary: **`Send a link from this device`** · Tertiary: **`Back to log in`**

**Build gate:** whether the verifier-absent error is distinguishable from a genuine expiry needs a **device check** (§9.3-Q2). If it is not, this state cannot be built and §5.5's copy must absorb the case — which is an argument for revisiting D1a, not for shipping a false "expired".

### 5.6 Request failed
Split on the error shape — one message cannot serve both causes.
- Title: **`Couldn't send that link`**
- Body, offline: **`You're offline. We'll need a connection to send that link.`**
- Body, anything else: **`Something went wrong on our end. Try again in a moment.`**
  *A blanket "check your connection" **blames the owner's wifi for our rate limit** — the most likely non-network cause (§9.2). An online owner reads it, checks their connection, finds it fine, and taps straight back into the same rejection.*
- Primary: **`Try again`** · Tertiary: **`Back to log in`**

### 5.7 Settings — change password (PR 3, gated on D4)
- Row replaces the current "coming soon" note: **`Change password`**
- Screen title: **`Change password`**; fields `Current password`, `New password`
- Primary: **`Save`** · success confirmation: **`Password updated.`** (renders as a `Snackbar`, not an alert)
- The residual line becomes: **`To change your account email, contact support.`**
  *Not `Changing your email is coming soon.` — `nyx-voice` Pattern 3 lists "Coming soon" in its never-set, and keeping one directly under a newly-working row re-creates the exact half-built signal D4 was justified by (`pm-feature-review`). A path beats an undated promise, and it is also the only answer we currently have for the owner who has lost access to their signup mailbox (§11).*

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

### 6.4 Ordering inside the handler — **rewritten after `rls-privacy-reviewer` returned FAIL**

The v1 draft ordered this as *exchange → compare `user.id` → wipe if different*. The reviewer broke it five ways, and the root cause was one wrong assumption worth stating plainly, because it is the lesson of this whole section:

> **`wipeLocalSession()` was built for the `SIGNED_OUT` shape, where `session` goes null and every session-keyed producer unmounts. A recovery swap is non-null → non-null.** `useWidgetSnapshots` (`hooks/useWidgetSnapshots.ts:34`) and `useSync` key their effects on `[session]`, so on a *swap* they tear down and **re-arm** — then publish `usePetStore.getState().pets`, which is still **A's** until `wipeLocalSession`'s last lines (`lib/session.ts:36-40`). The publish path includes a network hop, so a pass that begins before the wipe routinely finishes *after* it, **re-writing A's pet names onto the Home Screen widget after `clearWidgetTimeline()` already ran.** The only in-flight guard that exists (`notifySignedOut()`/`signOutEpoch`) is checked in `hydrateFromCloud` alone.

**The fix is not a better comparison — it is to stop inventing a second teardown.** Force the session to actually go null first, so the shipped, tested `SIGNED_OUT` path does the work:

1. **Classify the URL shape** (FR-4). A non-`valid` shape never touches auth state.
2. **Require local provenance** (FR-14). Refuse to proceed unless *this device* recorded a reset request (FR-12's marker). `nyx:///reset-password?code=x` is firable by **any app or webpage on the device** — expo-router's built-in linking routes it the moment the screen file exists — so an unauthenticated URL must never be able to set the gate.
3. **Set `recoveryInProgress = true`, persisted** (FR-6).
4. **Best-effort flush** of the current owner's pending local writes, bounded and non-fatal. This is what keeps step 5 from destroying an innocent co-resident's unsynced queue.
5. **`supabase.auth.signOut()`** — unconditionally, *before* any exchange. `session` goes null, `SIGNED_OUT` fires, and the **shipped** teardown runs in full: `notifySignedOut()` arms the epoch, `wipeLocalSession()` clears SQLite + the App Group + the widget timeline + the active-pet id + the onboarding draft, and **every session-keyed producer unmounts rather than re-arming.** No id comparison exists to fail open (F2), no push window exists under the wrong JWT (F5), no publisher survives the swap (F1).
6. **`exchangeCodeForSession(code)`** — B's session now arrives onto a *clean* device.
7. Route to `reset-password`.
8. On success → `updateUser({ password })` → clear the flag → `replace('/(tabs)')`.
9. **`finally`: clear the flag on every non-success path** (FR-15) and route to the designed failure state. The v1 draft cleared it only on success, so a failed exchange wedged the app in the gate until force-quit — and once the flag is persisted (F3's fix) that becomes a *permanent* lockout.

**The accepted cost, stated rather than hidden:** a same-user reset now also wipes and re-hydrates local data. Step 4 is what makes that survivable, and hydration is a shipped path — but it is a real cost, deliberately paid to reuse a tested teardown instead of maintaining a second one that only runs on the rarest path in the app.

**Where the `SIGNED_OUT` branch goes.** The FR-6 handling must **not** early-return ahead of the `SIGNED_OUT` block in `app/_layout.tsx:136`. `SIGNED_OUT` is the sole authority for teardown; swallowing it would skip `wipeLocalSession()` entirely. The block runs unmodified and *only its routing target* is conditional: `recoveryInProgress ? '/(auth)/reset-password' : (justDeleted ? '/(auth)/login' : '/(auth)')`.

### 6.5 The gate needs an enforcement point that does not exist yet

FR-6 said "the router holds the owner on the set-password screen." **There is no auth gate anywhere in the router** — `app/(tabs)/_layout.tsx` has none, `app/(auth)/_layout.tsx` is a bare `<Stack>`, and the tabs are reached by explicit `router.replace` calls. A requirement with no mechanism is not a requirement.

Worse, whatever is built must beat **expo-router's built-in deep linking**, because the shipped widget emits `nyx:///history?pet=…` and `nyx:///log?…` (`widgets/CulpritWidget.tsx:156-158`) — so while the owner sits on the set-password screen with their email app foregrounded, one Home Screen tap walks straight past the gate.

**Requirement:** a redirect guard in `app/(tabs)/_layout.tsx` that sends any entry to `/(auth)/reset-password` while `recoveryInProgress` is set. That is the enforcement point, and the widget bypass is its acceptance test.

### 6.6 The gate is a router gate, not a data gate — so recovery needs an exit

A recovery session is a full-privilege JWT. Adopting it at step 6 starts `useSync` → `hydrateFromCloud` pulls **B's entire record** into local SQLite, and the widget publisher pushes it to the App Group and the Home Screen — all **before** any password write. An abandoned reset therefore leaves B's full pet-health history on A's device.

§5.4 originally specified no escape from the set-password screen (every other screen in §5 has one), and §10 had no "abandon the reset" row — making the design either a trap with no exit, or an unspecified exit leaving a live privileged session behind. **Requirement:** an explicit escape that calls `signOut()` **and** clears the flag (FR-16), so abandoning a reset is a designed, clean terminal state.

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
| **1** | Foundations — `flowType: 'pkce'`, `lib/passwordRecovery.ts` + tests (FR-4's **two** classifications), the **persisted** `recoveryInProgress` (FR-6), FR-12's request marker, **FR-17's redaction widening**, the `PASSWORD_RECOVERY_ENABLED` constant (off). **No user-visible change.** | `code-reviewer`; `npm test` | ✅ **Yes — today.** Independent of every open ruling. FR-4's contract was re-scoped before its tests get written, which was the reviewer's one PR-1 ask. |
| **2** | The whole flow — FR-1 → FR-16: login link + §5.1b alert, request, Sent, deep-link handler, the §6.4 sign-out-first ordering, the §6.5 router gate, §6.6's escape, set-password, link-no-longer-works, wrong-device, request-failed. | **`rls-privacy-reviewer` (mandatory, merge gate — must clear F1–F5)** · `nyx-voice` · `pm-feature-review` · `code-reviewer` | ⚠️ **On D1c + §9.3 device checks.** |
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
- [ ] **OTP / recovery link expiry — read the actual value.** §5.5's "they don't last long" is an assertion the repo cannot verify.
- [ ] **"Secure password change" (require re-authentication) — confirm ON before PR 3 ships.** Supabase's `updateUser({ password })` does **not** require the current password unless this is enabled, which makes §5.7's current-password field **decorative**: an unlocked, unattended phone becomes a Settings-screen account takeover. This is a server-control item, not a copy detail.
- [ ] **Password-changed notification email — confirm enabled.** Load-bearing if D6b is declined (see above).
- [ ] **Enumeration protection — read the *current* state before flipping**, then re-run signup's already-registered path and login's wrong-address path on device and compare rendered output. The setting changes shipped behaviour on both screens (D2).
- [ ] **Build entitlement check for the FR-7 QA.** In Expo Go or a pre-W3 dev client, `getAppGroupContainer()` returns null and **every App Group / widget wipe silently no-ops** (`lib/appGroup.ts:44-52`) — so §10 row 7 would pass **vacuously on the wrong binary**. That row must run on a dev client carrying `com.apple.security.application-groups`, with a widget actually placed on the Home Screen.

### 9.3 Device checks that must run before PR 2's design locks
Neither can be settled by reading code; both change what gets built.

- **Q1 — does a desktop open consume the token?** Open a reset link on a laptop, then open the **same** link on the phone. If the phone renders §5.5, D1c's cost is a burned reset (not a browser error) and the email-template copy above becomes mandatory.
- **Q2 — is a missing PKCE verifier distinguishable from a genuine expiry?** Request a reset on phone A, open the link on phone B (both with the app installed), and inspect the error. Distinguishable → build §5.5b. Not distinguishable → §5.5b cannot exist, §5.5 must absorb the case, and **that is an argument for revisiting D1a** rather than for shipping a false "expired".
- **Q3 — does `Linking.openURL('message://')` reach a Gmail-only owner's inbox,** and does its `catch` fallback ever fire? (An unhandled scheme on iOS often resolves rather than throwing, which would make `signup.tsx:145`'s fallback dead code.) Pre-existing pattern, inherited here; recovery is where landing in an empty Apple Mail costs most — it convinces the owner the email never arrived.

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
| 16 | **Wrong device** — link opened on a second installed device | Request on phone A, open on the household iPad | §5.5b, **not** a false "expired" (conditional on §9.3-Q2) |
| 17 | **Desktop first, then phone** | Open on laptop, then the same link on the phone | The realistic desktop *sequence*. If the hop consumes the token → §5.5, not row 14's browser error (§9.3-Q1) |
| 18 | Login with a wrong password | Any bad credential | §5.1b — in-voice copy + a `Reset password` action, **no raw server string** (FR-13) |
| 19 | Cold start → §5.5 → `Send a new link` | Kill the app, tap an expired link | Request screen is **pre-filled**, not blank (FR-12) |

| 20 | **Resend, then open the *first* email** | Request, resend, open email #1 | §5.5 — the earlier verifier is overwritten (D8). Under v1's copy both stated causes were **false** |
| 21 | **Kill the app on the set-password screen** | Force-quit, relaunch | Returns to set-password. **Must not** resume into the tabs (F3 — the gate must be persisted) |
| 22 | **Widget tap while gated** | Sit on set-password, tap the Home Screen widget | Redirected back to set-password (§6.5). This is the enforcement point's acceptance test |
| 23 | **Hostile deep link** | Fire `nyx:///reset-password?code=x` from Safari | Refused — no local request marker (FR-14); the gate does **not** set, the app does **not** wedge |
| 24 | **Abandon a reset** | Reach set-password, take the escape | `signOut()` + gate cleared; no privileged session, no B data left on device (FR-16, §6.6) |
| 25 | **Cold start from link with no prior session** | Fresh install, tap a link | Wipe still runs (FR-7 is unconditional) — the case where id-comparison failed open |

Rows **7, 11, and 12** fail silently if the §6.4 ordering is wrong. Row **2** is verified by comparing rendered output, not by reading code. Rows **16–17** were surfaced by walking the flow as Sam rather than as an implementer; rows **20–25** all come from the `rls-privacy-reviewer` FAIL and **did not exist in v1** — each one is a state the original design could reach and had no answer for.

**Row 7 has a QA trap of its own:** it passes *vacuously* on a binary without the App Group entitlement (§9.2). Run it on a dev client with a widget actually on the Home Screen, or it proves nothing.

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
| Password reveal toggle on `components/ui/TextField` | **B-420** — app-wide gap (login, signup, reset, change all mask with no reveal and no confirm field); recovery is where a silent typo costs most, since it surfaces days later at the next cold start with the link already spent |
| Manual ops runbook: owner has lost access to their signup email | **B-421** — recovery is **single-factor on an address B-419 defers making changeable**. An owner who loses that mailbox has *no path back into their pet's record at all*, and "contact support" is currently the whole answer, with no documented procedure behind it |

**Recorded on B-401 — D1a arms a landmine on the B-152 flip.** `flowType: 'pkce'` is behaviour-neutral *today* only because email confirmation is off. The day B-152 part 2 turns it on, **signup-confirmation links become same-device-only PKCE links pointing at a redirect nothing handles.** B-401 already owns fixing that path's routing; it now also owns this. Noted on the row rather than left for whoever flips the switch to discover.

**Named, not filed — the shared-credential ping-pong.** Under D6b-as-recommended, a reset by partner A leaves partner B's *session* alive but B's *stored password* wrong: B is fine until their next sign-out, then stranded, then runs recovery and resets it back. Nothing in this design is wrong here and it is not a reason to flip D6b — it is a reason **B-292** (the household primitive) matters. Written down so the next person to meet it recognises it.

---

## §12 — Review record

Three gates ran against **v1.0 of this document** (a design review, pre-build). Their findings are folded into the text above; this section is the audit trail of what was attacked and what it cost.

### 12.1 `nyx-voice` — ✓ with one substantive change
The copy pack held on Patterns 1, 3, 4, 5, 7, 8 (pet by name with a second-person fallback, designed forward-looking failure states, zero exclamation marks, no jargon, no error codes, no blame). **One real catch:** §5.5's title asserted *expiry* on a state that also serves scanner-consumption, malformed links, wrong-device and (pending §9.3-Q1) desktop-burned tokens — so the stated cause is false in most of the ways an owner actually arrives. Changed to **"That link no longer works."** `pm-feature-review` reached the identical conclusion independently, and `rls-privacy-reviewer` then found a *third* false cause (resend-overwrites-verifier), which is about as strong a signal as a copy line gets.

### 12.2 `pm-feature-review` — SHIP-SHAPED ×2, NEEDS-WORK ×2, INSUFFICIENT ×1
Happy path and Settings passed; the **typo** and **scanner-consumed** flows did not; the desktop flow could not be judged from code.

| Finding | Resolution |
|---|---|
| Login-failure alert renders a raw Supabase string **on top of** the new link | **§5.1b** — in-voice copy + a `Reset password` action (FR-13) |
| Resend cooldown started one send too late, defeating D7's own rationale | **D7** — cooldown starts at the *initial* send |
| "Check your connection" blames the owner's wifi for our rate limit | **§5.6** — split on error shape |
| Pre-fill launders a login typo; nothing invites a second look | **§5.2** — "Check your email address is right…" |
| `Use a different email` styled as a caption, and unlabelled for its job | **§5.3** — teal, in the shipped auth-link language, promoted above resend |
| Support escape gated behind a resend that cannot work in the typo case | **§5.3** — reveals on the first of (a resend, or ~60s) |
| No spam-folder line anywhere; enumeration-neutral, so D2 costs nothing | **§5.3** |
| `Send a new link` lands on a blank field after a cold start | **FR-12** |
| **Wrong device** (PKCE verifier absent) rendered a false "expired" — Sam's *documented* shared-iPad behaviour | **§5.5b** + §10 row 16, gated on §9.3-Q2 |
| Settings kept a "coming soon" — the exact signal D4 was justified by removing | **§5.7** — a support path replaces the undated promise |
| Desktop open may **burn the token**, not just error | **§9.3-Q1** device check; strengthens D1c's mitigation into the email template |

### 12.3 `rls-privacy-reviewer` — **FAIL**, 5 merge blockers
The most valuable gate of the three. Every claim was **independently verified against the code** before being accepted.

| # | Attack | Outcome |
|---|---|---|
| **F1** | Recovery swap keeps `session` non-null → `useWidgetSnapshots`/`useSync` re-arm instead of unmounting; A's pets re-publish to the App Group + **Home Screen widget after the wipe** | **BROKE** → §6.4 sign-out-first |
| **F2** | Wipe-on-id-difference fails **open** on cold-start-from-link and in the `retain` state | **BROKE** → FR-7 unconditional |
| **F3** | `recoveryInProgress` in-memory while the recovery *session* is persisted → force-quit resumes into the tabs, password unchanged | **BROKE** → FR-6 persisted |
| **F4** | Failed exchange never clears the gate; `nyx:///reset-password?code=x` firable by any app → wedged app | **BROKE** → FR-14 + FR-15 |
| **F5** | A's food/med catalog pushed into B's account — `created_by_user_id` is **client-asserted**, so `food_items_insert`'s `WITH CHECK` passes | **BROKE** → closed by FR-7's ordering |
| **F6** | No auth gate exists in the router; widget deep links walk past it | **BROKE** → §6.5 |
| **F7** | D2 audited one screen; login/signup carry existence oracles | **BROKE** → D2 widened |
| **F8** | Resend overwrites the verifier; §5.5's two stated causes both false | **BROKE** → D8 + §10 row 20 |
| **F9** | Recovery code is **63 chars** — under `MAX_DETAIL_STRING = 64` — stored verbatim in a log the owner is invited to **share** | **BROKE** → FR-17 |
| — | A's *pet-scoped* rows pushed into B's account (`pet_id → pets.user_id = auth.uid()`) | **HELD** — server-side backstop is real |
| — | Custom-scheme hijack: another app registers `nyx://` and receives the code | **HELD** — the verifier stays in our keychain. D1a earns more than it was credited with |
| — | Tokens in a URL / browser history / referrer | **HELD** — PKCE carries only an opaque code |

**The generalisable lesson**, worth more than any individual fix: `wipeLocalSession()` was written for the `SIGNED_OUT` transition, where the session goes **null**. A recovery swap is non-null → non-null. **When a new flow reuses an existing teardown, check the transition *shape* it was built for, not just the list of things it clears.** Four of the five blockers are the same mistake wearing different clothes.
