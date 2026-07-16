# Culprit — one-page brief for a Nebraska attorney (narrow engagement)

*Prepared 2026-07-16 for a flat-fee scope. This is context so you don't re-derive it, not a request for a full review.*

## What Culprit is
A US-only iOS pet-health **tracking** app (pre-launch, TestFlight stage). Owners log meals, symptoms, medications, and weight; the app shows trends, statistical pattern findings, and a vet-report export. It is explicitly **not** a veterinary service, makes **no diagnosis**, and is designed to **never give an all-clear** (a documented safety design rule). Core features are free; a convenience-only subscription is planned later. No human-health/HIPAA data — the content is about pets.

## Operator / structure
- Solo operator, an **individual** in **Nebraska**, currently with **no entity**. Apple Developer account is an individual account (my personal legal name shows as Seller).
- Public brand name is **"Culprit"**; internal/legal name is a placeholder in the docs.
- Vendors: **Supabase** (auth/DB/storage/functions, row-level security) and **Anthropic** (AI extraction/reads; commercial API terms — inputs not used to train). No ad SDKs, no analytics SDKs, no location collection.

## The three documents (drafted, self-reviewed, hosted-pending)
Terms of Service, Privacy Policy, Veterinary Disclaimer — in `docs/legal/`. They already include: US-only scope, an Apple App Store minimum-terms EULA section, a general/boilerplate section, a warranty disclaimer, a liability cap (greater of trailing-12-month payments or **USD $50**), a veterinary disclaimer incorporated by reference, and an in-app hard-delete data path.

## What I'm asking you to opine on / execute (narrow)
1. **Entity formation execution.** Should I form a **Nebraska LLC** before public launch, and if so, please handle: Certificate of Organization ($100 online), the **Nebraska newspaper Notice-of-Organization publication** (3 consecutive weeks + affidavit), and — because I operate under the brand **"Culprit"** — the **trade-name (DBA) registration** ($100 online, one newspaper notice, proof of publication within 45 days). Confirm whether a single "Culprit LLC" filing removes the need for a separate trade name.
2. **Dispute-resolution enforceability opinion (only if you flag it).** My docs deliberately use **Nebraska courts, no arbitration, no class-action waiver**, plus an informal-resolution-first step and a small-claims carve-out. I chose courts over arbitration because I'm a solo operator with a free app (AAA consumer per-case and mass-arbitration fees fall on the business and are asymmetric to my size). Tell me if that posture is sound under Nebraska/FAA law, or if you'd add a class-action waiver later when the app monetizes.
3. **Liability-cap / disclaimer sanity check** for a consumer pet-health app under Nebraska consumer-protection law (UDAP) — is the $50-floor cap + "as is" warranty disclaimer + veterinary disclaimer stack enforceable, and does anything undercut it?
4. **A physical contact address** for the Apple EULA minimum terms (currently a placeholder) — a registered-agent or LLC-office address, not my home.

## What I do NOT need
A full policy rewrite, GDPR/EU program (US-only), or HIPAA analysis. The documents are drafted; I need the formation executed and a narrow enforceability sign-off, not a from-scratch draft.

## Key facts for your file
- **Age floor:** 13+. **Venue:** Nebraska. **Governing law:** Nebraska.
- **Data deletion:** in-app hard-delete (not anonymization); Storage purged; food-catalog contributions survive de-identified.
- **No sale of data, no ad tracking, no location.** AI vendor is Anthropic under commercial (no-train) API terms.
- **Money today:** $0 (free app), so the liability cap floors at $50.
