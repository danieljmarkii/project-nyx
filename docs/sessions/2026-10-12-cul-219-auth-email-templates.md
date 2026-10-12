# CUL-219: the four Culprit auth email templates

**Date:** 2026-10-12
**One thing:** none — a copy and docs row; no new engineering concept beyond the PKCE same-device rule the recovery spec already teaches

[CUL-219](https://linear.app/projectnyx/issue/CUL-219), shipped via #1201. App Store 1.2.0 · the first public release, Wave 1 row PR-03.

## What shipped

- `docs/auth-email-templates/`: Confirm signup, Reset password, Magic link and Invite as paste-ready HTML, plus a README that is the paste sheet (dashboard tab, subject, file, when each is sent) and names what every template must keep.
- `guards/authEmailTemplates.test.ts`: every auth link stays `{{ .ConfirmationURL }}`, no old name, no exclamation mark, and the same-phone line stays on confirm and reset. Mutation proof: a `{{ .SiteURL }}` link, an exclamation mark, "Nyx" and a dropped same-phone line in reset each red it (3 of 9); restored, 9 of 9 green.

## Decisions

- **Reset says "the phone where you asked for it", not the build note's "the phone you signed up on".** Only the asking phone holds the PKCE verifier, and an owner can sign up on one phone and reset on another. Confirm keeps "the phone you signed up on", where the two are the same phone. Team call, Designer and Engineer lenses; logged on the issue.
- **No link lifetime is stated.** The recovery link lifetime is unread (CUL-66 step 3), so reset says what to do when a link stops working.
- **No claim that opening on a computer uses the link up.** §9.3 Q1 has not run. "The link only works in the Culprit app on that phone" is true either way.
- **Confirm says the link signs you in, not that it fails on a computer.** GoTrue verifies the address before the redirect, so a laptop open does confirm it; only the app sign in is lost.
- Magic link and Invite are drafted although the app sends neither, so no unbranded Supabase default can reach an owner.
- Light only, inline styles, no images; the button is the app's primary button (`#0A0A0A`, white text), the wordmark text in brand night.

## Device check, and what it found

- The PM pasted all four templates. The reset email arrived in Gmail on the PM's iPad as drafted: sender Culprit, subject `Set a new Culprit password`, the same phone line, the PKCE verify link. Logged on CUL-66 (step 1 done) and CUL-219 (close condition met).
- The same test exposed an app bug past the email. Auth logs show `/recover` 200, `/verify` 303, `/token?grant_type=pkce` **200**, yet the app showed "Couldn't finish that". auth-js 2.105.4 emits `PASSWORD_RECOVERY`, not `SIGNED_IN`, after a recovery exchange; `shouldAdoptSessionDuringRecovery` admits only `SIGNED_IN` during the window, so the session is dropped and the 20s watchdog fires. Filed as [CUL-1886](https://linear.app/projectnyx/issue/CUL-1886) (Urgent, App Store 1.2.0), not folded in: an auth change does not ride on a docs PR. The unit tests mocked the event as `SIGNED_IN`, the shape the spec assumed, which is why CI never saw it.

## Residuals

- [CUL-1885](https://linear.app/projectnyx/issue/CUL-1885): the password changed notice, change email and reauthentication templates, filed Backlog.
- [CUL-1887](https://linear.app/projectnyx/issue/CUL-1887): a design pass on these four emails, filed at the PM's ask (Todo, Medium, outside the App Store project).
- STATUS.md unchanged: no track boundary moved.
