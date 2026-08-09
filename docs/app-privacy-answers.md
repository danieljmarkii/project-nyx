# Culprit — App Privacy Nutrition Label: Answer Sheet (B-268)

**Purpose:** the exact, transcribe-ready answers for the **App Privacy** questionnaire in App Store Connect (ASC → your app → **App Privacy** → *Get Started* / *Edit*). This is the mandatory data-collection "nutrition label," **distinct from** the hosted privacy-policy document (B-229) — but it **must match it**. A label that discloses less than the policy (or more) is a documented rejection / re-review trigger (guide step 16).

**Reference:** <https://developer.apple.com/app-store/app-privacy-details/>

**Companion docs:** guide step 14 (`docs/app-store-submission-guide.md`) · the policy this must match (`docs/legal/privacy-policy.md`) · B-268 backlog row.

---

## How to use this sheet

1. In ASC, the flow is: *"Do you or your third-party partners collect data from this app?"* → then, for each **data type** you check, ASC asks **(a)** purpose(s), **(b)** *"linked to the user's identity?"*, **(c)** *"used for tracking?"*.
2. Work down **§3 (the master table)** — it lists **every** Apple data type with a Yes/No. Check only the six marked **COLLECT = Yes**.
3. For each of those six, transcribe the purpose / linked / tracking answers from **§4**. They are identical across all six (App Functionality · Linked · No tracking), which is itself the headline: **everything Culprit collects is account-linked app functionality; nothing is used for tracking, advertising, or analytics.**
4. Read **§5 (judgment calls)** before you click — three answers are non-obvious and a reviewer may probe them; §5 gives you the defense.
5. **§6** is the policy cross-check (every answer traced to a policy section, mismatches flagged). **§7** is the one-screen ASC click-path.

**Golden rule:** if you change the app's data flows or the privacy policy, re-run this sheet. The label and the policy move together.

---

## 1. Audit basis — what this sheet was built from

Answers were derived from the **actual code and schema**, not from intent:

| Source audited | What it established |
|---|---|
| `package.json` | No ad SDK, no ATT (`expo-tracking-transparency` absent), no third-party analytics/crash SDK (no Sentry/Firebase/Amplitude/Segment/Bugsnag), no `expo-device`. Notifications are `expo-notifications` **local-only** (push entitlement stripped by `plugins/withoutPushEntitlement.js`). |
| `app.json` | No `NSUserTrackingUsageDescription`; camera/photo-library purpose strings only; `ITSAppUsesNonExemptEncryption: false`; no ad/tracking config. |
| `lib/supabase.ts`, `lib/secureStore.ts` | Auth session stored encrypted in the OS keychain (SecureStore); anon key is public/RLS-gated; no device identifier read or transmitted. |
| `supabase/migrations/001–055` (23 app tables) | The full data model — all pet/account data, all account-scoped + RLS default-deny. Storage buckets: `nyx-pet-photos`, `nyx-event-attachments`, `nyx-food-photos`, `nyx-medication-photos`, `nyx-vet-attachments`, `nyx-vet-documents` (+ forward-looking `nyx-vet-reports`). |
| `supabase/functions/*` (Anthropic callers) | `extract-food-from-photo`, `extract-medication-from-photo`, `analyze-vomit`, `analyze-stool`, `generate-signal`, `ask`. `generate-report` uses **no AI**. |
| `ai_usage` table (migration 031) | Per-account, per-feature, per-day AI-call counters (fair-use throttle) — the one app-generated, account-linked usage datum. |
| `app/settings/feedback.tsx`, `lib/appInfo.ts`, `lib/support.ts` | Support + "Share feedback" compose a **`mailto:`** opened in the user's own mail app — app version + OS travel in that email, **never to our backend**. |
| `supabase/migrations/037_ask_config.sql`, `lib/appConfig.ts` | **Ask** ships **dark** (`ask_enabled = {"enabled": false, "allowlist": []}`) and stores **no** conversation table — not a live data practice for v1 (see §5.4). |

Grep receipts (reproducible):
- No tracking/ad/analytics SDK: `grep -riE "sentry|firebase|analytics|amplitude|segment|admob|idfa|tracking-transparency" package.json` → **0 hits** (the `analytics.ts` in `lib/` is Culprit's own on-device pattern engine, not a vendor SDK).
- No push/device token: `grep -rn "getExpoPushToken\|getIosIdForVendor\|PushToken" lib/ app/` → **0 hits**.
- No device-ID library: `expo-device` absent from `package.json`.

---

## 2. Top-line gateway answers

| ASC gateway question | Answer | Why |
|---|---|---|
| **Do you or your third-party partners collect data from this app?** | **YES** | Account email/name + pet-health content are stored server-side, linked to the account. |
| **Is any data used to track you?** (the ATT sense: linked with third-party data for ads, or shared with a data broker) | **NO** | No ad networks, no ATT, no data brokers, no cross-app/third-party linking. Supabase + Anthropic are processors acting on our behalf, not trackers (§8). |

⇒ The finished label will show **"Data Linked to You"** only. The **"Data Used to Track You"** and **"Data Not Linked to You"** sections will be **empty**.

---

## 3. Master table — every Apple data type

For each collected type: **Linked = Yes**, **Tracking = No**, **Purpose = App Functionality** (details + rationale in §4). Uncollected types carry a one-line "why not" so you can click past them and defend it.

| Apple collection → data type | Collect? | Notes / why |
|---|:--:|---|
| **Contact Info** → Email Address | **YES** | Account sign-up email (Supabase Auth). §4.1 |
| **Contact Info** → Name | **YES** | Owner first + last name at sign-up (`user_profiles`). §4.2 |
| Contact Info → Phone Number | No | Never requested or stored. |
| Contact Info → Physical Address | No | Never requested or stored. |
| Contact Info → Other User Contact Info | No | — |
| **Health & Fitness** → Health | **No** | **Judgment call §5.1.** Culprit records **pet** health, not the *user's* health. Apple's "Health" is human health data (HealthKit / human-subject). Pet data is mapped to **User Content** instead. Policy is explicit: *"Pet health data is not human health data."* |
| Health & Fitness → Fitness | No | No user fitness/activity data. |
| Financial Info → Payment / Credit / Other | No | Free app; the paywall is flagged **off** for v1 (guide step 6); no StoreKit/IAP in the build. |
| **Location** → Precise Location | **No** | No location APIs. Photo EXIF is **stripped on upload** (re-encode). §5.3 |
| **Location** → Coarse Location | **No** | Same — no location collected at any granularity. |
| **Sensitive Info** → Sensitive Info | **No** | Apple's Sensitive Info = human racial/ethnic/sexual-orientation/biometric/etc. Not applicable to a pet tracker. §5.1 |
| Contacts → Contacts | No | Address book never accessed. |
| **User Content** → Photos or Videos | **YES** | Pet/symptom/food-label/med-label photos + vet documents. §4.3 |
| User Content → Emails or Text Messages | No | We store no message content (support is `mailto:`, §5.4). |
| User Content → Audio Data | No | `microphonePermission: false`; no audio capture. |
| User Content → Gameplay Content | No | N/A. |
| User Content → Customer Support | No | Feedback/support is an **optional `mailto:`** in the user's own mail app → Apple's customer-service carve-out. §5.4 |
| **User Content** → Other User Content | **YES** | The health log itself: meals, symptoms, meds/doses, weight, notes, vet visits, conditions, diet trials, pet profile fields. §4.4 |
| Browsing History | No | Not an app-web-browser; nothing tracked. |
| Search History | No | In-app food/list search is a **local filter**, not stored or transmitted as history. |
| **Identifiers** → User ID | **YES** | The Supabase account UUID that keys every row. §4.5 |
| **Identifiers** → Device ID | **No** | No IDFA/IDFV/device ID read or sent; no push token (local notifications only). |
| Purchases → Purchase History | No | No IAP live in v1 (paywall off). |
| **Usage Data** → Product Interaction | **YES** *(recommended)* | The `ai_usage` fair-use counter (per-account AI-feature call counts). **Judgment call §5.2** — disclosed to match the policy's "Usage metering" section. |
| Usage Data → Advertising Data | No | No ads anywhere. |
| Usage Data → Other Usage Data | No | No other behavioral/usage collection (no analytics SDK). |
| **Diagnostics** → Crash Data | **No** | No crash-reporting SDK in v1 (policy commits to updating the label first if added). §5.4 |
| Diagnostics → Performance Data | No | No performance/telemetry SDK. |
| Diagnostics → Other Diagnostic Data | No | App version + OS exist only inside the **user-sent** support `mailto:` → carve-out §5.4. |
| Other Data → Other Data Types | No | Nothing outside the above. |

**Collected (6):** Email Address · Name · Photos or Videos · Other User Content · User ID · Product Interaction.

---

## 4. Detail per collected type — the exact ASC sub-answers

Every one of the six: **Purposes → check "App Functionality" only** · **Linked to identity → Yes** · **Used for tracking → No.** Below is the per-type source + the reason no other purpose applies.

### 4.1 Contact Info → Email Address — **Yes / Linked / No tracking / App Functionality**
- **Source:** collected at sign-up; stored by Supabase Auth (`auth.users`). Password is a salted hash we never see (not a disclosable data type).
- **Purpose = App Functionality only:** authentication + **transactional** email (account confirmation). **Not** "Developer's Advertising or Marketing" — policy §2: *"We do not send marketing email."* Do **not** check Analytics or Product Personalization.
- **Policy trace:** §1 "Account information," §2 "Account email."

### 4.2 Contact Info → Name — **Yes / Linked / No tracking / App Functionality**
- **Source:** owner first + last name at sign-up (`user_profiles`, migration 027).
- **Purpose = App Functionality:** identifies the account / shown back to the owner in-app. Not used for personalization-in-the-ad-sense, analytics, or marketing.
- **Policy trace:** §1 "Your first and last name."

### 4.3 User Content → Photos or Videos — **Yes / Linked / No tracking / App Functionality**
- **Source:** pet profile photos (`nyx-pet-photos`), event/symptom photos (`nyx-event-attachments`), food-package photos (`nyx-food-photos`), medication-label photos (`nyx-medication-photos`), vet-visit attachments + documents (`nyx-vet-attachments`, `nyx-vet-documents`). Some are sent to **Anthropic** for extraction/reads when the owner triggers that action (§8; policy §3).
- **Purpose = App Functionality:** store/sync the photo, extract label data, produce the observational read. No ads/analytics/marketing.
- **Location note:** re-encoded on upload → EXIF/GPS stripped before leaving the device (so this does **not** pull in "Location"; §5.3).
- **Policy trace:** §1 "Photos and files," §3 AI features.

### 4.4 User Content → Other User Content — **Yes / Linked / No tracking / App Functionality**
- **Source:** the structured health log the owner enters — `events`, `meals`, `medications`/`medication_administrations`, `weight_checks`, `vet_visits`, `conditions`, `diet_trials`/`diet_trial_foods`, `feeding_arrangements`, `food_items` (per-account library), notes, and pet profile fields (`pets`: name/species/breed/sex/birth date). Derived artifacts (`ai_signals` pattern findings, `event_ai_analysis` reads, `vet_reports`) are computed from this same content.
- **Purpose = App Functionality:** the core product — store the logs, sync across the owner's devices, compute trends/pattern findings/vet reports (deterministically, our own server code). No ads/analytics/marketing.
- **Policy trace:** §1 "Pet profile" + "Health log," §2 "To run the app."

### 4.5 Identifiers → User ID — **Yes / Linked / No tracking / App Functionality**
- **Source:** the Supabase auth user UUID (`auth.uid()`) that keys every row and every RLS policy. (No device ID, no advertising ID.)
- **Purpose = App Functionality:** it *is* the account identity — authentication + per-account row-level security.
- **Policy trace:** §4 "Database access is enforced per-account with row-level security."

### 4.6 Usage Data → Product Interaction — **Yes / Linked / No tracking / App Functionality**  *(recommended — see §5.2)*
- **Source:** `ai_usage` (migration 031) — per-account, per-AI-feature, per-day/-month call counts, incremented server-side before each Anthropic call to enforce fair-use caps. Owner-readable via RLS; no client write path; folds into the delete cascade.
- **Purpose = App Functionality:** abuse/fair-use bounding so no single account can exhaust the service (Apple files fraud-prevention/security under App Functionality). **Not** Analytics — it is never used to study behavior, and never leaves our infrastructure.
- **Policy trace:** §1 "Usage metering (generated by the app)."

---

## 5. Judgment calls — read before you click

### 5.1 Pet health is **User Content**, not "Health & Fitness" / "Sensitive Info" (highest-scrutiny answer)
Apple's **Health** data type is *human* health/medical data (HealthKit, Clinical Health Records, human-subject research). Apple's **Sensitive Info** is *human* protected-class data. Everything clinical in Culprit is **about the pet** — so the accurate mapping is **User Content** (Photos + Other User Content), and **Health & Fitness = No**, **Sensitive Info = No**.
- **This is the single answer a reviewer is most likely to question.** The defense is one sentence and it is already in the policy (§ scope note): *"Pet health data is not human health data under laws like HIPAA … we treat it as sensitive anyway."* We treat it as sensitive operationally (RLS default-deny, encryption, hard-delete), but it is **not** the user's health data, which is what Apple's category asks about.
- Consistency check: the app-wide `hasSeverity: false` posture and the "not a diagnosis" framing already say Culprit does not hold *human* medical data.

### 5.2 Usage metering (`ai_usage`) → disclose as **Product Interaction** *(recommended)*
**Deciding:** whether the fair-use AI-call counter is a disclosed "Usage Data → Product Interaction" datum, or an internal security counter that need not be listed.
- **Option A — disclose (recommended).** It is app-generated data about *how the user interacts with the app* (count of feature uses), transmitted off-device and stored linked to the account — which meets Apple's definition of "collect," and the policy **already discloses it** (§1 "Usage metering"). Listing it (Linked · No tracking · App Functionality) keeps label and policy in lockstep. *Why recommended:* the requirement is that the label match the policy; the carve-out for undisclosed data requires it be *user-provided in the UI*, which this counter is not — so non-disclosure is the weaker position.
- **Option B — omit** as pure security/operational data. Defensible in spirit (it is a throttle, not analytics) but it creates a policy-discloses-more-than-label gap, the exact asymmetry §14 review flags.
- **Consequence:** choosing A adds one row (Product Interaction) to the label; choosing B means also softening the policy's "Usage metering" paragraph so the two still agree. **Recommendation: A.** If the PM prefers B, edit both surfaces together, never just one.

### 5.3 Location = **No**, deliberately, despite photos
Photographing a food package reads the photo's **timestamp** (EXIF *date-taken*) to date the entry — **not** its location. Every upload is re-encoded, which strips GPS and other embedded metadata *before it leaves the device* (`lib/storage.ts`; policy §1 + §3). No location API is called anywhere. So neither Precise nor Coarse Location is collected. Policy §1: *"We do not collect your device's location, and we do not use photo location metadata."*

### 5.4 Support/feedback + app-version/OS → **not collected** (customer-service carve-out)
"Contact support" and "Share feedback" build a **`mailto:`** and hand off to the user's own mail app (`app/settings/feedback.tsx`, `lib/support.ts`); the app version + OS string (`lib/appInfo.ts`) rides *inside that email*, which the user sends themselves. Nothing is transmitted to our backend, and it is optional customer-service content → Apple does not require disclosing it. Hence **Customer Support = No** and **Diagnostics = No**. (No crash/telemetry SDK exists; the policy commits to updating the label *before* adding one.)

### 5.5 Ask is shipped **dark** → nothing to disclose for v1 (watch-item)
The `ask` Edge Function can send a typed question + retrieved record context to Anthropic — but Ask ships **off for everyone** (`ask_enabled = {"enabled": false, "allowlist": []}`, migration 037) and persists **no** conversation table. In the submission build it is not a live data practice, so it adds **no** label entry and needs **no** new policy line today.
- **Watch-item (not a v1 blocker):** if Ask (or its A8 live-photo path) is ever enabled for real users, re-confirm this sheet and add Ask to **policy §3** (which today names four AI flows: food, med, symptom, phrasing — all live — but not Ask). Flagged for the PM in §9.

---

## 6. Policy cross-check — every answer traces to the policy (no mismatch)

| Label answer | Privacy-policy anchor | Agree? |
|---|---|:--:|
| Email + Name collected, App Functionality, no marketing | §1 Account info; §2 "we send transactional email only … not marketing" | ✅ |
| Photos collected (pet/symptom/food/med/vet), sent to Anthropic on the owner's action | §1 Photos and files; §3 AI features | ✅ |
| Other User Content (the health log) collected, computed into trends/reports on our own servers | §1 Health log; §2 "To run the app" | ✅ |
| User ID collected; per-account RLS | §4 "row-level security"; §10 Security | ✅ |
| Product Interaction (usage metering) collected, internal only, never shared | §1 "Usage metering … never shared, never used for any other purpose" | ✅ |
| **No** Location (EXIF stripped; no location API) | §1 "We do not collect … location"; §3 metadata stripped | ✅ |
| **No** tracking / ads / data brokers / model training | §1 "No advertising identifiers…"; §2 "We do not sell your data"; §3 "not used to train" | ✅ |
| **No** Diagnostics SDK (crash/perf); version+OS only via user's `mailto:` | §1 "No analytics or behavioral tracking SDKs, and no crash-reporting SDKs"; §2 Support | ✅ |
| **No** Device ID / push token (local notifications only) | §1 "What we do NOT collect"; policy silent on push (consistent — none exists) | ✅ |
| Everything deletable in-app (hard delete) — supports "Data Linked to You" honesty | §7 Deleting your account | ✅ |

**Mismatches found: none for v1.** One forward-looking gap (Ask not yet in policy §3) — harmless while Ask is dark; tracked as a watch-item (§5.5, §9).

**Two policy placeholders that gate publishing the *policy* (not this label):** Operator legal name (§Operator) and email-provider name (§4) are still `[...]`. They do not change any label answer, but the hosted policy the label points to must have them filled before submission (guide step 3 / B-229).

---

## 7. ASC click-path (one screen)

1. **App Privacy → Get Started.** *"Do you or your third-party partners collect data?"* → **Yes.**
2. Check exactly these six data types:
   - Contact Info → **Email Address**
   - Contact Info → **Name**
   - User Content → **Photos or Videos**
   - User Content → **Other User Content**
   - Identifiers → **User ID**
   - Usage Data → **Product Interaction** *(per §5.2 — recommended)*
3. For **each** of the six, on its follow-up screens:
   - **Purpose:** check **App Functionality** only. (Leave Third-Party Advertising, Developer's Advertising or Marketing, Analytics, Product Personalization, Other Purposes **unchecked**.)
   - **"Is this data linked to the user's identity?"** → **Yes.**
   - **"Do you use this data for tracking purposes?"** → **No.**
4. Leave every other data type **unchecked** (§3).
5. **Save** → **Publish.** Confirm the preview shows **Data Linked to You** populated with the six, and **Data Used to Track You** = *(none)*.

**Expected published label:** *Data Linked to You* — Email Address, Name, Photos or Videos, Other User Content, User ID, Product Interaction. *Data Used to Track You* — none. *Data Not Linked to You* — none.

---

## 8. Third-party processors (for reviewer questions — not a separate label field)

The questionnaire discloses **data types**, not processor names (that is the policy's job, §3/§4). Both third parties are **service providers/processors** acting on Culprit's behalf, which is why **Tracking = No** holds:
- **Supabase** — auth, database, storage, Edge Functions (our infrastructure; TLS + at-rest encryption; per-account RLS). Not an independent collector, not an ad network.
- **Anthropic** — processes only the specific inputs in policy §3, only when the owner triggers a feature. Under Anthropic's commercial API terms, inputs are **not used to train models** and are retained only briefly for abuse monitoring. Not an ad network or data broker.

Neither links Culprit's data with third-party data for advertising, and neither is a data broker — so nothing here is "tracking" in the ATT sense.

---

## 9. PM action items

- [ ] **Ratify §5.2 (usage metering).** Recommended: disclose `ai_usage` as **Usage Data → Product Interaction** (the sheet assumes this). If you prefer to omit it, tell me and I'll soften the policy's "Usage metering" paragraph so the two still match — never change only one.
- [ ] **Transcribe §7 into ASC** (App Privacy section) when ready — the six checks + identical purpose/linked/tracking answers.
- [ ] **Before submission (policy, not label):** fill the two policy placeholders — Operator legal name and email-provider name (§4) — so the hosted privacy policy the label links to is complete (guide step 3 / B-229).
- [ ] **Watch-item, not a v1 blocker:** if **Ask** is turned on for real users (flip `ask_enabled`), re-run this sheet and add Ask to **policy §3** before it goes live (§5.5).
- [ ] After entering it in ASC, confirm step 14: `Guide step 14 complete: nutrition label entered in ASC.`

---

## 10. One-line summary (the whole label in a sentence)

> Culprit collects the owner's **email + name**, the **pet-health content** they log (photos + structured logs), the **account ID** that keys it, and an internal **AI-usage counter** — all **linked to the account**, all for **app functionality**, and **none** used for tracking, advertising, analytics, or model training.
