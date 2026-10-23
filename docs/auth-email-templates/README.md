# Culprit auth email templates

**Created:** 2026-10-12 · **Issue:** CUL-219 (App Store 1.2.0, row PR-03) · **Paste and check:** CUL-66 step 1

The four emails Supabase Auth sends on Culprit's behalf. These files are the source of truth: edit here, then re-paste. The dashboard holds a copy, never the original.

## Paste them

Supabase Dashboard → project `aigchluqluzuhtbfllgh` → **Authentication → Emails → Templates**. For each tab, set the subject, replace the body with the whole file, and Save.

| Dashboard tab | Subject | File | Sent when |
|---|---|---|---|
| Confirm signup | `Confirm your email for Culprit` | `confirm-signup.html` | Every new account (`signUp`, and the resend on the check your inbox screen) |
| Reset password | `Set a new Culprit password` | `reset-password.html` | Forgot password (`resetPasswordForEmail`) |
| Magic link | `Your Culprit sign in link` | `magic-link.html` | Not sent by the app today; no `signInWithOtp` call exists |
| Invite user | `You’re invited to Culprit` | `invite.html` | Not sent by the app today; only an admin invite from the dashboard sends it |

The two the app never sends are drafted anyway, so no Supabase default that says nothing about Culprit can ever reach an owner. The sender (`Culprit <support@getculprit.app>`) is set under SMTP Settings, not here, and is already live.

Then check one: sign up at a `+test` address, or use Forgot password on your own account, and confirm the received email shows Culprit, the right subject, and a button that opens the app on the phone. Post a screenshot on CUL-66.

## What each one must keep

- **`{{ .ConfirmationURL }}` in both the button and the plain link.** It is GoTrue's `/auth/v1/verify` hop, which redirects to the `nyx:///confirm` or `nyx:///reset-password` the app passed. Never swap it for a hand-built `{{ .SiteURL }}` or `{{ .TokenHash }}` link: the app's PKCE exchange (`app/(auth)/confirm.tsx`, `lib/recoveryDeepLink.ts`) expects the `?code=` that hop produces.
- **The same phone line** on confirm and reset. Both links are PKCE, so the verifier lives only on the phone that asked, and the redirect is a custom scheme a computer cannot open (password recovery spec, D1c). Reset says *the phone where you asked for it*, not *the phone you signed up on*: an owner can sign up on one phone and reset on another, and only the asking phone holds the verifier.
- **No promise about how long a link lasts.** The recovery link lifetime is unread (CUL-66 step 3), so the copy says what to do when a link stops working rather than naming a duration.
- **No claim an account exists beyond the address it was sent to.** Enumeration protection hides whether an address has an account; these emails only reach a real account, so naming `{{ .Email }}` leaks nothing.
- **Light only, inline styles, no images.** No hosted logo to break, no dark mode rewrite for a mail client to mangle. The wordmark is text in brand night (`#13112E`); the button is the app's primary button (`#0A0A0A`, white text).

## Not here

Supabase also has *Change email address*, *Reauthentication* and the security notifications (password changed, among others). The app sends none of the first two today (email change is spec'd as D9, unbuilt), and the password changed notice is switched on in CUL-66 step 2 with its default text. Branding those is a separate issue, not this one.
