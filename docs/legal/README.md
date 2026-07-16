# docs/legal — public legal documents (drafts)

Drafted 2026-07-08 (App Store submission guide, step 2). These are the **public, store-linked** documents, so they carry the public brand name **Culprit** (B-274) even though the repo/internal docs still say Nyx.

| File | Backlog | What remains after this PR |
|---|---|---|
| `privacy-policy.md` | B-229 | PM + (ideally) lawyer review → host (B-273, guide step 3) → in-app link wiring → store-listing URL. Also the factual base for the step-14 App Privacy nutrition label (B-268). |
| `terms-of-service.md` | B-230 | Same review → host → in-app link + signup acceptance line (replaces the "on its way" stubs in `app/(auth)/signup.tsx`). |
| `veterinary-disclaimer.md` | B-270 | Same review → host → onboarding acknowledgment + Settings/About link (in-app copy is in the file's appendix, nyx-voice checked). |

**Filled in this revision** (PM decisions, 2026-07-16 — legal-consultant review pass):
- **Contact email** → `support@getculprit.app` (privacy + terms; matches the support page).
- **Governing law / venue** → State of Nebraska; state and federal courts located in Nebraska (terms §14). Disputes go to **courts — there is no arbitration clause** (provisional; lawyer to confirm or replace at legal review).
- **Operator type** → an individual (the legal *name* itself is still a placeholder — see below).
- **Scope** → **US-only**: Culprit is offered in the United States and data is processed there (privacy §4).
- **Account sharing** → softened to allow household caregivers to use one account, with the account holder responsible for activity (terms §2).

**Placeholders that still remain before hosting** (search for `[` in each file):
- `[YOUR FULL LEGAL NAME]` — the operator's full legal name (an individual). Appears in the privacy header, terms header, and terms §12 (Apple App Store section).
- `[NAME WHEN PROVISIONED]` — the email delivery provider (privacy §4; lands with guide step 4 / B-152; **not yet provisioned**, so left as a placeholder).
- Effective dates — set when hosted (all three docs).

**Grounding:** drafted from the actual data flows — Supabase (auth/DB/Storage/Edge Functions, RLS), Anthropic (food-label + medication-label extraction, single-incident symptom-photo reads, Signal phrasing over structured findings only), the B-039 in-app hard-delete path (`docs/nyx-account-deletion-requirements.md`), the 24h `ai_signals` cache, the food-catalog `SET NULL` survival, and the EXIF/GPS-stripping report photo transform. If a data flow changes (new SDK, analytics/crash reporting, push provider, public report links), update the policy **and** the App Privacy label together.

**Review-pass revisions (2026-07-16):** the deletion path now describes the real shipped route (the **You** screen via the Home-header avatar, not the retired "Profile → Account" — `app/(tabs)/profile.tsx` account block relocated per `docs/nyx-settings-requirements.md`); privacy §1 discloses per-account, per-feature **AI-usage metering** (migration `031_ai_usage` + `record_ai_usage` in the four AI Edge Functions — internal fair-use counting, never shared); privacy §2 covers the **support mailto** carrying app version + OS (`lib/appInfo.ts`); terms §3 now **grants** the shared-food-catalog license (not just describes it) and states it survives deletion; terms gains an **Apple App Store** section (Apple's 10 minimum EULA terms) and a **General** section (severability, entire agreement, assignment, no-waiver, notices, force majeure); terms §5 notes AI usage limits (the D-M7 caps live at launch). The Anthropic retention sentence (privacy §3) is deliberately left future-proof and untouched. Backups residual (privacy §6) stays "a short period" — the exact Supabase backup-retention window was not verifiable this session; **PM to confirm** and tighten to "typically 30 days or less" if it holds.

These drafts are diligence, not legal advice — a lawyer's pass before launch is recommended (guide step 2 tip). The disputes/no-arbitration posture (terms §14) is provisional pending that pass.
