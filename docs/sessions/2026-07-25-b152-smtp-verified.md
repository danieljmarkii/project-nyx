# Guide step 4 ✅ — production SMTP verified by a live send (B-152 part 1)

**Date:** 2026-07-25

Closes the last infrastructure gate in front of every email the app sends. **Proven by sending, not by reading the config** — which turned out to matter three separate times.

`POST /auth/v1/signup` returned **HTTP 200 with `confirmation_sent_at` and no `access_token`**, and the message was delivered. Two facts fall out of that single response: Supabase handed the message to Resend *and* email confirmation is genuinely ON. That second one is the state the dashboard cannot distinguish — a 200 carrying a session would have meant confirmation was off and no email was ever going to be sent, which looks identical from the settings screen and is exactly the state two `auth.users` rows had been stuck in since June.

**What the chain needed, and where each step nearly failed silently:**

- **Sending domain.** `getculprit.app` verified in Resend — DKIM + SPF MX + SPF TXT (DMARC `p=none` added as a bonus record; deliberately not tightened until there is sending history). Verified against Resend's API rather than the dashboard screenshots, which is how we knew the DKIM key in Cloudflare matched byte for byte.
- **SMTP username.** First attempt used `Resend`; it must be exactly `resend`. Case-sensitive, and **invisible from every screen** — Supabase never displays the stored password back, so a mis-paste of either field produces a config that looks complete and sends nothing.
- **The key itself.** The initial curl 401'd because the anon JWT was mangled mid-paste (a terminal masked it). Ruled out key rotation by reading the project's publishable keys directly — legacy anon key still active and matching `eas.json`. Switched to the short `sb_publishable_…` key, which survives a clipboard.

**Sender:** `support@getculprit.app` / name `Culprit`, PM-ratified over the spec's original `noreply@`. Rationale and the accepted cost (replies to automated mail land in the inbox App Review uses) recorded in `docs/culprit-website-requirements.md` §5.2. Escape hatch if it gets noisy: `noreply@` sender with `Reply-To: support@`.

**Secrets Register:** row added to CLAUDE.md for the Resend SMTP credentials — server-only, lives in Supabase's encrypted SMTP config, never in the repo or EAS. Carries the rotation caveat above, because "re-verify by sending, never by eye" is the lesson that cost the most time here.

**Unblocks:** **B-280 PR 4** (password recovery — a "check your inbox" that never delivers is worse than the dead end it replaces) and **B-271** (the App Review demo account is created through a real signup).

**Step 9 residuals:** the confirm-click loop (where the link lands is **B-432**), the in-app device pass (needs a dev-client build — Expo Go stopped working once the widget native targets landed), the email-enumeration-protection dashboard check, and the auth email templates that still say "Nyx" (audit §B7).

**Housekeeping:** the `+smtp1` user is unconfirmed in `auth.users`; delete it once the click loop is done.

Docs-only — no app code, no schema, no deploy. Shipped via #445.
