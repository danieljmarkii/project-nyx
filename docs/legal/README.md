# docs/legal — public legal documents (drafts)

Drafted 2026-07-08 (App Store submission guide, step 2). These are the **public, store-linked** documents, so they carry the public brand name **Culprit** (B-274) even though the repo/internal docs still say Nyx.

| File | Backlog | What remains after this PR |
|---|---|---|
| `privacy-policy.md` | B-229 | PM + (ideally) lawyer review → host (B-273, guide step 3) → in-app link wiring → store-listing URL. Also the factual base for the step-14 App Privacy nutrition label (B-268). |
| `terms-of-service.md` | B-230 | Same review → host → in-app link + signup acceptance line (replaces the "on its way" stubs in `app/(auth)/signup.tsx`). |
| `veterinary-disclaimer.md` | B-270 | Same review → host → onboarding acknowledgment + Settings/About link (in-app copy is in the file's appendix, nyx-voice checked). |

**Placeholders the PM must fill before hosting** (search for `[` in each file):
- `[LEGAL OPERATOR NAME]` — the individual or entity publishing Culprit (privacy + terms).
- `[CONTACT EMAIL]` — must match the support page contact (all three docs reference it).
- `[JURISDICTION]` / `[VENUE]` — governing law (terms §12).
- `[NAME WHEN PROVISIONED]` — the email delivery provider (privacy §4; lands with guide step 4 / B-152).
- Effective dates — set when hosted.

**Grounding:** drafted from the actual data flows — Supabase (auth/DB/Storage/Edge Functions, RLS), Anthropic (food-label + medication-label extraction, single-incident symptom-photo reads, Signal phrasing over structured findings only), the B-039 in-app hard-delete path (`docs/nyx-account-deletion-requirements.md`), the 24h `ai_signals` cache, the food-catalog `SET NULL` survival, and the EXIF/GPS-stripping report photo transform. If a data flow changes (new SDK, analytics/crash reporting, push provider, public report links), update the policy **and** the App Privacy label together.

These drafts are diligence, not legal advice — a lawyer's pass before launch is recommended (guide step 2 tip).
