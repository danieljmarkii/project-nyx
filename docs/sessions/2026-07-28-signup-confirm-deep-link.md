# The emailed confirmation link now comes back into the app (B-432, B-483)

**Date:** 2026-07-28

Shipped via **#494**. Closes **B-483** outright and B-432 down to its on-device pass.

## What was broken

`signUp` sent no `emailRedirectTo`, so Supabase fell back to the project **Site URL** — still the untouched default `http://localhost:3000`. The owner tapped "Confirm email" and landed on a localhost page, then had to find their own way back into the app and sign in by hand. Build-35 QA had caught the symptom (B-483); B-432 held the durable fix.

The account was always genuinely confirmed — GoTrue verifies the token server-side *before* it redirects — so this was never a broken flow. It was the first thing every new owner does, rendered badly at the moment they are trusting us most, and a visible review risk at submission.

## What shipped

- `signUp` and **both** `resend` call sites (signup's verify state, login's unconfirmed-sign-in remedy) send `emailRedirectTo: nyx:///confirm`. The resend mattered as much as the original send: it is the control a stuck owner reaches for, so a link that skipped the redirect would have reproduced the bug on the one path where it hurts most.
- **`app/(auth)/confirm.tsx`** turns the returned PKCE code into a live session. Four states, one forward action each.
- **`lib/emailConfirm.ts`** — every decision, pure, so all four terminal states are reachable in a unit test instead of only on a device with a real email in hand.
- **`lib/authDeepLink.ts`** — the URL parser, extracted from `lib/passwordRecovery.ts`. A confirmation link and a recovery link differ only in their *path*; the query/fragment shapes are byte-identical. Two hand-rolled parsers would have been two drifting definitions of what a hostile deep link looks like. The 39 existing recovery cases pass unchanged, which is the proof the extraction was behaviour-preserving.
- `APP_SCHEME` now has exactly one declaration, so **B-278**'s `nyx:` → `culprit:` flip stays a one-file change plus the allowlist.

The PM set the dashboard half the same session: Redirect URLs `nyx://**` (Supabase's `**` matches separators, so one entry covers `nyx:///confirm` **and** B-280's `nyx:///reset-password`), and Site URL `http://localhost:3000` → `https://getculprit.app`.

Site URL still mattered even though the app now always sends an explicit redirect, which is worth writing down because the first instinct was that it had been made moot: it is exposed as `{{ .SiteURL }}` inside the auth email templates, so `localhost` was one template variable away from reaching a real inbox regardless of what the client sent.

## The four states, and why three of them say the account is fine

| State | When | Confirmed? | Forward action |
|---|---|---|---|
| `working` | exchanging | — | — |
| `already_signed_in` | a session is already live | **yes** | Continue → app · *Sign out to use another account* |
| `confirmed_needs_signin` | code present, exchange failed here | **yes** | Go to sign in |
| `link_dead` | `?error=…`, or nothing usable | **no** | Go to sign in (login's resend mints a fresh link) |

The server-side verify ordering is what lets the copy avoid "something went wrong" — which would be both false and unactionable. `link_dead` deliberately does not assert *which* cause: GoTrue returns one indistinguishable shape for expired, already-used, and consumed-by-a-mail-scanner, so the copy states a general property of the links rather than naming a cause the device cannot observe. Same reasoning B-280 §5.5 arrived at, reached independently here.

## Three findings, two of which changed the design

**1. The cold-start bounce would have erased the route.** A cold start *from* an auth link has no session by definition — establishing one is the link's entire job — so `app/_layout.tsx`'s `to-auth` branch was about to `router.replace('/(auth)')` over the route expo-router had just opened from the link, milliseconds after opening it. The owner would have watched their confirmation do nothing and land them on the Landing. Guarded on `isAuthDeepLink(Linking.getLinkingURL())`; `getLinkingURL()` is synchronous, so it does not race the decision it guards. `AUTH_DEEP_LINK_PATHS` deliberately lists only routes whose screen file exists — suppressing the bounce for an unregistered route would strand the owner on expo-router's not-found screen, which is strictly worse. B-280 PR 2 adds `reset-password` to that list in the same commit that adds its screen.

**2. `signOut()` destroys the PKCE code verifier → B-576, and it blocks B-280 PR 2.** Verified in `node_modules/@supabase/auth-js`, not inferred: `_removeSession()` removes `${storageKey}-code-verifier` alongside the session, and `signOut()` removes it a second time explicitly.

The recovery spec's §6.4 orders the handler *step 5 `signOut()` → step 6 `exchangeCodeForSession()`* — deliberately, and for a good reason: forcing the session to null first means the shipped, tested `SIGNED_OUT` teardown runs instead of a second one written for a non-null → non-null swap, which was the fix for `rls-privacy-reviewer`'s five blockers. As written, step 5 deletes the credential step 6 needs. Every recovery exchange would fail, and fail as `wrong_device` — telling the owner to open the link on the phone they are already holding.

Worth noting *how* it hid: `passwordRecovery.ts` is pure and its 39 cases are green. The defect lives entirely in the interaction with the real client, which is exactly the class §9.3's device checks were meant to catch — except this one would have presented as "the link doesn't work on any device," a symptom that invites blaming the allowlist or the email template rather than the ordering.

This PR did not have to pick a fix. The confirm handler declines to exchange while a session is live, which also closes the session-swap hazard from the same reviewer pass. Recovery cannot copy that, because there the exchange **is** the flow.

**3. Turning confirmation ON would have reintroduced "Owner: not recorded."** Signup's owner-name write only runs on the session-present branch. With confirmation ON there is no session at that moment (RLS rejects the write), and the app may be killed before the link is tapped, so the names are gone from memory too — every new account would have reached the vet report with an empty Owner line, the exact regression B-251 PR 6 fixed. The names now ride `options.data` on the auth user, and the confirm screen writes them at the first moment a session exists. Best-effort, so a failed write never strands the owner.

## Why a live session blocks the exchange

The safety call of the flow, argued in `decideConfirm`'s docstring and locked by two tests:

1. Exchanging a code for account B while the device is signed in as A is a session swap, non-null → non-null — the shape `wipeLocalSession()` was never built for. `useSync` and `useWidgetSnapshots` re-arm instead of unmounting and re-publish A's pets, including onto the Home Screen widget, *after* the wipe.
2. B-280's answer (sign out first) is unavailable here — see finding 2.
3. And it isn't needed. Confirmation already happened server-side, so declining costs the owner nothing: the account is confirmed and signing in normally reaches it.

One test covers the non-obvious half: a device whose stored session failed a transient refresh reports `null` from `getSession()` while still holding the other account's local record. `coldStartDecision` already draws that line (null-**with**-error is not a sign-out), so the confirm handler reuses it rather than testing `session != null`.

## Residuals

- **The on-device pass has not run** — the one unchecked DoD box. JS-only change, so the existing dev client carries it over Metro; Expo Go cannot (no `nyx` scheme) and build 35 predates the redirect, so testing on either proves nothing.
- **B-576** is open and blocks B-280 PR 2.
- **Tier-2 edit flagged, not written:** `docs/nyx-password-recovery-requirements.md` §6.4 needs the ordering correction plus a B-576 pointer, and §6.1's new-files table should note that `parseRecoveryLink` now delegates to `lib/authDeepLink.ts`.

## Bookkeeping

B-576 was filed as **B-524** and renumbered at wrap — `main` had taken B-524 for the Saw-it-default EXIF row from the B-448 trace, which landed first. Caught by the B-435 duplicate-ID check run *after* merging `main`, which is the ordering that rule exists to enforce; running it before the merge would have reported clean.
