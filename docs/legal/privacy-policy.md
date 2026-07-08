# Culprit — Privacy Policy

**Status: DRAFT** — pending PM review and legal review before hosting (B-273). Placeholders marked `[...]` must be filled before publication.

**Effective date:** [SET WHEN HOSTED]
**Applies to:** the Culprit mobile app ("Culprit", "the app", "we") and any web pages we operate for it.
**Operator:** [LEGAL OPERATOR NAME — the individual or entity that publishes Culprit]
**Contact:** [CONTACT EMAIL — must match the support page]

Culprit is a pet health tracking app. You log what you observe about your pet — meals, symptoms, medications, weight — and Culprit turns those logs into trends, pattern findings, and reports you can share with your veterinarian. This policy explains what we collect, where it goes, how long we keep it, and how you delete it. It is written to match what the app actually does, and nothing more.

A note on scope: almost everything Culprit stores is information **about your pet**, not about you. Pet health data is not human health data under laws like HIPAA, but we treat it as sensitive anyway — it contains photos from inside your home and a record only you and your vet should control.

---

## 1. What we collect

**Account information (about you):**
- Email address and password. Your password is stored only as a secure hash by our authentication provider; we never see it.
- Your first and last name, as entered at sign-up.

**Pet profile (about your pet):**
- Name, species, breed, sex, and birth date (exact or approximate — the app records which).
- A profile photo, if you add one.
- Medical conditions, weight entries, feeding arrangement, and diet trials you record.

**Health log (what you enter):**
- Events you log: meals (including the foods involved and how much was eaten), symptoms (for example vomiting or stool changes), medication regimens and individual doses (including whether a dose was given, refused, or unconfirmed), weight checks, vet visits, and notes.
- Timestamps for each event, including estimated times and time windows when you didn't witness the event directly.

**Photos and files:**
- Photos you attach to events (including symptom photos), documents you attach to vet visits, food package photos, and medication label photos.
- When you photograph a food package, the app reads the photo's "date taken" metadata (EXIF) to record when the photo was taken. We do not collect your device's location, and we do not use photo location metadata. When photos are embedded into a vet report, the server strips location and other metadata from them first (see Section 3).

**What we do NOT collect:**
- No advertising identifiers, no ad networks, no cross-app tracking.
- No analytics or behavioral tracking SDKs, and no crash-reporting SDKs, in the current version. If we add crash reporting later, we will update this policy and the App Store privacy label first.
- No location data.
- No contacts, no microphone or health data from your device.

## 2. How we use your data

- **To run the app:** store your logs, sync them across your devices, and compute the trends, pattern findings, and vet reports the app shows you. Pattern detection (which foods or times correlate with which symptoms) is computed by our own deterministic code on our servers.
- **AI features:** described fully in Section 3.
- **Account email:** we send transactional email only — account confirmation and similar. We do not send marketing email.
- **Shared food catalog:** when you add a food by photographing its package, the food's name, brand, ingredients, and package photo become part of Culprit's shared food catalog so other users logging the same commercial product don't have to re-enter it. Catalog entries describe commercial products, not you or your pet.

We do not sell your data. We do not share it with advertisers or data brokers. We do not use your data to train AI models, and our AI provider does not either (Section 3).

## 3. AI features and what leaves our infrastructure

Some features send specific data to **Anthropic**, the AI provider whose Claude models power Culprit's AI features. Each is triggered by an action you take:

- **Food package photos** — when you add a food by photo, the package photo is sent to Anthropic to extract the product name, brand, and ingredients.
- **Medication label photos** — when you add a medication by photo, the label photo is sent to Anthropic to extract the drug name and dose details. The app always asks you to confirm extracted medication details; it never trusts them silently.
- **Symptom photos** — when you request an AI read of a symptom photo you logged (for example a photo of vomit), that photo is sent to Anthropic to describe what is visible in that single photo. The read is observational only — see the [Veterinary Disclaimer](./veterinary-disclaimer.md).
- **Pattern phrasing** — when the app phrases a pattern finding into a sentence, it sends Anthropic only the computed, structured finding (for example, event counts and the food or time window involved). Your raw log history and your photos are never sent for this purpose.

Vet report generation does not use AI at all — reports are assembled deterministically from your logs. Photos embedded into a report are first re-encoded server-side, which strips location and other metadata.

Under Anthropic's commercial API terms, data sent to the API is not used to train Anthropic's models. Anthropic retains API inputs and outputs only for a limited period for abuse monitoring, per its usage policies.

## 4. Where your data lives

- **Supabase** provides our authentication, database, file storage, and server functions. Your data is encrypted in transit (TLS) and at rest. Database access is enforced per-account with row-level security: your account can read and write only its own rows.
- **Anthropic** processes the specific data described in Section 3, when you use those features.
- **An email delivery provider** [NAME WHEN PROVISIONED — guide step 4] handles transactional account email.
- A copy of your recent data is also cached **on your device** so the app works offline. It is wiped when you sign out or delete your account.

Our providers operate in the United States and other countries; by using Culprit you understand your data may be processed there.

## 5. Sharing you control

- **Vet reports:** you generate a report in the app and choose how to share it — for example, handing your vet a PDF from your device's share sheet. Whatever you send contains what the report shows (including any photos it includes, with metadata stripped); once you send it, the recipient controls their copy.
- Nothing in Culprit is shared publicly, and no other user can see your pets or logs. The one exception is the shared food catalog (Section 2), which contains commercial product information — never anything about you or your pet.

## 6. Retention

- Your data is retained while your account exists.
- When you delete an individual log entry, it disappears from your account immediately and is permanently erased when your account is deleted.
- Computed pattern findings are cached for about 24 hours and continuously replaced.
- Routine encrypted backups may hold residual copies for a short period after deletion, until they rotate out.

## 7. Deleting your account — everything, from inside the app

You can delete your account from inside the app: **Profile → Account → Delete account.** Deletion is immediate, permanent, and honest:

- Your account, your name and email, your pets, and every log, event, report, and analysis are hard-deleted — removed, not hidden or "deactivated".
- Your photos and attachments are purged from file storage, including symptom photos and vet documents.
- The local copy on your device is wiped.
- The one thing that survives: food catalog entries you contributed (names, ingredients, and package photos of commercial products) remain in the shared catalog with your identity removed. They contain no information about you or your pet.

There is no grace period and no recovery. If deletion cannot complete (for example, you're offline), the app tells you so — it never claims success it can't verify.

## 8. Your rights

Depending on where you live (for example under the GDPR or similar laws), you may have rights to access, correct, export, delete, or object to processing of your data. In practice:

- **Access and correction:** your data is visible and editable in the app.
- **Deletion:** in-app, Section 7.
- **Export and anything else:** contact us at [CONTACT EMAIL] and we will respond within the timeframe required by applicable law. (A self-serve export is planned.)

## 9. Children

Culprit is not directed to children. You must be at least 13 years old (or the higher minimum age in your country) to create an account. If we learn an account belongs to a child under the applicable minimum age, we will delete it.

## 10. Security

Data is encrypted in transit and at rest; per-account row-level security is enforced at the database; privileged server credentials never ship in the app. No system is perfectly secure — if we learn of a breach affecting your data, we will notify you as required by law.

## 11. Changes to this policy

If we change this policy, we will update the effective date and, for material changes, tell you in the app before they take effect.

## 12. Contact

Questions, requests, or complaints: [CONTACT EMAIL]. You may also have the right to lodge a complaint with your local data protection authority.
