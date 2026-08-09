# App Privacy nutrition label — the transcribe-ready answer sheet (B-268, guide step 14)

**Date:** 2026-08-09
**Shipped via #618** (App Store submission guide step 14; docs-only)

## What this session did

Produced **`docs/app-privacy-answers.md`** — the exact, transcribe-ready answers for the App Store Connect **App Privacy** questionnaire (the privacy "nutrition label"), built from a **code/schema audit** rather than from the B-268 row's original guesses. The sheet must — and does — match `docs/legal/privacy-policy.md`; a label that discloses more or less than the policy is a documented re-review trigger (guide step 16).

Docs-only. No app code, no schema, no build-phase change. STATUS.md deliberately untouched (it has no step-14/B-268 line to keep true, and it's a hot file the parallel Signal/Home sessions are editing — the guide tracker is the submission steps' source of truth).

## The audit (what was verified, not assumed)

Every answer traces to code:

- **No tracking infrastructure.** `package.json` has no ad SDK, no ATT (`expo-tracking-transparency` absent), no third-party analytics/crash SDK (Sentry/Firebase/Amplitude/Segment/Bugsnag all absent), no `expo-device`. The `lib/analytics.ts` hits are Culprit's own on-device pattern engine, not a vendor SDK. `app.json` carries no `NSUserTrackingUsageDescription`.
- **No device identifiers / push tokens.** `grep` for `getExpoPushToken`/`getIosIdForVendor`/`PushToken` → 0 hits. Notifications are `expo-notifications` **local-only** (push entitlement stripped by `plugins/withoutPushEntitlement.js`).
- **Location is genuinely not collected.** `lib/storage.ts` re-encodes every upload via `manipulateAsync` + `SaveFormat.JPEG` (drops EXIF/GPS before it leaves the device); no location API is called anywhere. Only the photo *timestamp* is read, to date entries.
- **Support/feedback is a `mailto:`.** `app/settings/feedback.tsx` + `lib/support.ts` compose a mail draft opened in the user's own mail app; `lib/appInfo.ts`'s app-version + OS string rides *inside that email*, never to our backend → Apple's customer-service carve-out ⇒ **Diagnostics = No, Customer Support = No.**
- **Ask ships dark.** `037_ask_config.sql` seeds `ask_enabled = {"enabled": false, "allowlist": []}` and there is no conversation table — Ask is not a live data practice for v1 (watch-item if ever enabled).
- **The report is AI-free** (`generate-report` has zero Anthropic refs) and there's **no IAP** in the build (the paywall is explicitly "no StoreKit, no purchase").
- 23 app tables (migrations 001–055) + 6 Storage buckets inventoried; all account-scoped, RLS default-deny.

## The result

**6 data types collected**, and the three sub-answers are identical for all six — **Linked to identity: Yes · Used for tracking: No · Purpose: App Functionality**:

1. Contact Info → Email Address
2. Contact Info → Name
3. User Content → Photos or Videos
4. User Content → Other User Content (the structured health log)
5. Identifiers → User ID (the Supabase account UUID)
6. Usage Data → Product Interaction (the `ai_usage` fair-use counter) — the one judgment call

Finished label: **Data Linked to You** populated with the six; **Data Used to Track You** empty; **Data Not Linked to You** empty.

## The three answers a reviewer might probe (documented in the sheet's §5)

- **§5.1 — Pet health is User Content, not Apple's "Health."** Apple's Health/Sensitive categories are *human*-subject data; Culprit's clinical data is about the pet. This is the highest-scrutiny call; the one-sentence defense is already in the policy's scope note (*"Pet health data is not human health data under laws like HIPAA"*). This corrects the B-268 row, which had loosely called pet health "sensitive."
- **§5.2 — Usage metering → disclose as Product Interaction (recommended, the one PM ratification).** The `ai_usage` counter is app-generated, account-linked, stored server-side, and **the policy already discloses it** — so disclosing it keeps label and policy in lockstep. The non-disclosure carve-out requires the datum be *user-provided in the UI*, which a server counter is not. Alternative (omit + soften the policy) noted and not recommended; the point is to move both surfaces together, never one.
- **§5.4 — Diagnostics = No.** No crash/telemetry SDK; the only version/OS data lives inside a user-sent support email → carve-out. This corrects the B-268 row's "device diagnostics if B-016 lands" (B-016 is not shipped).

## Policy cross-check

§6 of the sheet maps every label answer to a privacy-policy section. **No v1 mismatch.** One forward-looking gap: the policy's §3 names four AI flows (food, med, symptom, phrasing — all live) but not Ask; harmless while Ask is dark, flagged as a watch-item to add before Ask is enabled. Two policy `[...]` placeholders (operator legal name, email-provider name) don't affect any label answer but gate finalizing the hosted policy (B-229).

## PM action items

- Ratify §5.2 (disclose `ai_usage` as Usage Data → Product Interaction — recommended).
- Transcribe the sheet's §7 click-path into ASC → App Privacy.
- Fill the policy's two remaining placeholders before submission (B-229).
- Watch-item: re-run the sheet + add Ask to policy §3 if `ask_enabled` is ever flipped on.
- Confirm: `Guide step 14 complete: nutrition label entered in ASC.`

## Files

- **new** `docs/app-privacy-answers.md` — the answer sheet.
- `docs/app-store-submission-guide.md` — step 14 tracker row + detail updated to "answer sheet ready."
- `docs/backlog.md` — B-268 row updated (answer sheet shipped; PM transcription pending; row stays Open until entered in ASC).
