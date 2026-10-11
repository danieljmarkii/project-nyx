# Apple's first-submission requirements for Culprit, re-verified

**Date:** 2026-10-11 · 🧊 **Frozen** (a dated capture of Apple's live rules; correct it additively with a dated §V section at the foot, never in place) · **Written for:** the App Store 1.2.0 restart (Linear project *App Store 1.2.0 · the first public release*), by the App Store submission consultant lens
**Scope:** Culprit 1.2.0 for iOS (iPhone only), the first public App Store submission, United States only, from an individual Apple Developer account
**Method:** every claim was re-checked on 2026-10-11 against the live Apple page; claims about Culprit were checked against the repo at `b504253` and the live site getculprit.app (17:07 UTC).
**Read with:** the restart's run order in Linear (what we are doing about each item) and [`2026-10-synthetic-user-testing.md`](./2026-10-synthetic-user-testing.md). The August consultant pass this supersedes is summarised in `docs/sessions/2026-08-20-app-store-launch-project.md`.
**After this brief was written (same day):** AI consent PR 2, the server-side gate, merged at 16:42 UTC (#1187), with its six functions held until the client ships. The PM ruled no external TestFlight beta before launch (§5 records the consultant's view before that ruling).

**Confidence tags**
- **[V]** verified today at a primary source: an Apple or Expo page, the repo, or the live site.
- **[S]** secondary source only: a law firm, a developer-forum post quoting App Review, or a blog.
- **[U]** unverified. This is my inference or judgment, not a fact.

**Dates on sources.** Apple's Help pages show no last-updated date, only "© 2026". The dated Apple sources are:
- the App Review Guidelines ("Last Updated: June 8, 2026"),
- the Developer Program License Agreement (DPLA) footer ("LYL255 August 18, 2026"),
- Developer News posts,
- the App Store Connect release notes.

---

## 1. What the requirements mean for Culprit, in rejection-risk order

1. **Finish the AI consent (5.1.2(i)), and make sure App Review actually sees it.**
   - **The rule** **[V]**: "clearly disclose where personal data will be shared with third parties, including with third-party AI, and obtain explicit permission before doing so."
   - **What reviewers ask for** **[S]**: the App Review message quoted on the forums (Feb 2026) checks four things: what data is sent, who receives it, permission before sending, and a privacy policy that says all of it.
   - **The privacy policy has gaps** **[V]**. The live policy (effective Jul 19, 2026) names Anthropic. It does not:
     - describe Ask, if Ask can be reached;
     - confirm that third parties give "the same or equal protection" (5.1.1(i));
     - say how to withdraw consent.
   - **The demo account can hide the prompt** **[V]**. Under the demo-account spec, the PM generates the seeded AI read in the app. With the new gate, that pre-consents the account, so the reviewer may never see the prompt. One rejected app received exactly this message: "We were not presented with the consent prompt…" **[S]**.
2. **Fix the dead link today.** `https://getculprit.app/disclaimer` returns **404** (checked 17:07 UTC). The app opens it from the onboarding disclaimer step (`app/onboarding/disclaimer.tsx`) and from Settings (`app/settings.tsx`, via `constants/links.ts`) **[V]**. Apple says "All links in your app must be functional" (2.1) **[V]**.
3. **Re-answer the age rating; it should end up 13+, not 4+.**
   - **The Terms force it** **[V]**: Culprit's Terms require users to be at least 13. Apple: "If your app has a EULA with minimum age requirements that exceed the rating that Apple calculated, you must override to a rating that adheres to the requirements." The Terms are the app's user agreement; that Apple treats them as the "EULA" is my reading **[U]**.
   - **The 4+ rested on a false assumption** **[V]**: the earlier answer sheet assumed "even 'Infrequent/Mild' Medical/Treatment resolves to 4+". Under today's table, *Infrequent* Medical or Treatment Information gives **13+** and *Frequent* gives **16+**.
   - **Comparable apps rate higher** **[V]**: two AI pet-health apps self-rate 13+ (Infrequent) and 16+ (Frequent).
   - **One more question to answer**: the social-media capability question has been required to submit since **September 2026**.
4. **Complete the declarations and account steps that block the Submit button** **[V]**:
   - **Regulated Medical Device status.** Required for Culprit because Health & Fitness is its secondary category. Answer **No**.
   - **DSA trader status.** Required even for a US-only app. Answer **"not a trader."**
   - **The DPLA dated Aug 18, 2026.** The Account Holder must accept it.
   - **App Review contact phone.** It must be in **+1…** international format (from Aug 19, 2026).
   - **App Privacy answers.** They must be **Published**, not just saved.
5. **Disclose or disable every server-flagged feature.**
   - **The features:** the Ask allowlist, the Engines v3 keys, widget eligibility and the paywall.
   - **The rule** **[V]**: 2.3.1(a) says "Don't include any hidden, dormant, or undocumented features." App Review lists "attempting to hide features in review" as a fraud signal.
   - **What to do:** never turn one of these on for everyone after approval unless a reviewed version described it.
6. **Product page.**
   - **No vomit or stool imagery** in screenshots. Under 2.3.8, metadata must suit a 4+ audience even when the app is rated higher.
   - **More than half the screenshots must show the app in use**, per the new 2.3.3 guidance page announced Oct 5.
   - **Upload both a 6.9″ set and a 6.3″ set.** Apple's own spec page contradicts itself about which iPhone size is required.
   - **No diagnostic or accuracy claims** anywhere in the metadata (1.4.1).
7. **Device coverage.**
   - **Test in iPad compatibility mode.** Apple says App Review "evaluates apps… installed on real devices", and that an iPhone-only app "can be downloaded from the App Store onto iPad" **[V]**. A rejection message quoted on the forums names "Review Device: iPad Air 11-inch (M3)" **[S]**.
   - **Untick Apple-silicon Mac and Vision Pro availability.** Both are on by default.
   - **The build toolchain is fine.** Building with Xcode 26.6 (the EAS default for SDK 57) is valid until April 2027. On iPhone Duo (on sale Oct 23) the app will run letterboxed.
8. **Outside App Review, but live now.**
   - **The laws:** Texas SB 2420 has been enforceable since June 2026; the Supreme Court refused to block it on Jul 6. California AB 1043 starts **Jan 1, 2027**. Apple says "App Review has no changes related to age assurance," so this is legal exposure, not a rejection reason. Get counsel; `expo-age-range` ships in SDK 57.
   - **A low-probability, high-impact risk:** a "Submitted by incorrect entity" rejection under 5.1.1(ix). Apple names healthcare among the fields where apps must come from a legal entity, and Culprit ships from an individual account.

---

## 2. What changed since 2026-08-20

| Date | Change | What it means for Culprit | Source | Conf. |
|---|---|---|---|---|
| Aug 18, 2026 (2 days before the earlier pass; effective Oct 1) | DPLA updated: Attachment 14, the EU terms. "Sign in to your account to accept the updated terms." A forum post quotes the App Store Connect banner: "…In order to update your existing apps and submit new apps, the Account Holder must review and accept the updated agreement…" | The PM (Account Holder) must accept it before submitting. The DPLA footer now reads "LYL255 August 18, 2026". | https://developer.apple.com/news/?id=0cgo95n6 · https://developer.apple.com/support/terms/apple-developer-program-license-agreement/ · https://developer.apple.com/forums/thread/843788 | V (post, DPLA) / S (banner text) |
| Aug 19, 2026 (1 day before) | App Store Connect editorial updates: (1) the App Review contact phone "must be entered in international format (e.g., +852), not digits-only"; (2) the first consumable, non-consumable or subscription of each type must be submitted with a new app version. | Enter `+1…`. Item (2) matters when the paywall ships. | https://developer.apple.com/help/app-store-connect/release-notes/ | V |
| Sep 2026 (announced Jun 8 and Jul 9) | The age-rating questionnaire's **social-media capability** answers became **required** to submit new apps and updates. | Answer "No". This is the "Sept-2026 delta" the earlier pass mentioned. | https://developer.apple.com/news/?id=tlur8uvi · https://developer.apple.com/news/?id=0d2gpmml | V |
| Sep 9, 2026 | Submissions open for iOS 27. **From April 2027**, apps must be built with the iOS 27 SDK; the Submitting page adds "target iOS 15 or later". Separately, the Upcoming Requirements page says that **since Sep 9, 2026** apps must "target iOS 13 or later". | Minimum target is 16.4, so this passes. Plan the move to Xcode 27 before April. | https://developer.apple.com/news/?id=k1mtkt1k · https://developer.apple.com/app-store/submitting/ · https://developer.apple.com/news/upcoming-requirements/ | V |
| Sep 9, 2026 | Screenshot specs added for iPhone Duo and iPhone 18 Pro / Pro Max. | See the screenshot conflict in §3. | release notes (above) | V |
| Sep 14, 2026 | App Store Connect accepts Xcode 27 builds for the App Store. | Optional for 1.2.0. | release notes | V |
| Oct 1, 2026 | Attachment 14 took effect. A law firm notes California AB 1043 is operative Jan 1, 2027. | Accept the DPLA. AB 1043 is legal, not App Review (§1 item 8). | DPLA; https://technologylaw.fkks.com/post/102o301/update-your-app-again-californias-digital-age-assurance-act-takes-effect-janu | V / S |
| Oct 5, 2026 | iPhone Duo on sale Oct 23. **"Starting April 2027, any apps or games submitted will need to include screenshots for iPhone Duo"** (news). The spec page says "for any app using the iOS 27.1 SDK or later". Apps built with the iOS 26 SDK "run on iPhone Duo, but won't adapt… your app will appear in the center of the display." | No 1.2.0 impact. An April 2027 task. | https://developer.apple.com/news/?id=kkphp5qo · https://developer.apple.com/iphone-duo/prepare/ · screenshot specs | V |
| Oct 5, 2026 | New creative assets (product-page header, search results), an Asset Library, a product-page preview tool, and **new App Review guidance on 2.3.3**: Apple "will approve only those submissions where more than half of screenshots show the app in use." | The creative assets are optional. The majority rule binds the screenshot set. | https://developer.apple.com/news/?id=ljpl7kyn · https://developer.apple.com/help/app-review/guideline-reference/2-3-3-screenshots | V |
| Seen 2026-10-11 | Apple's App Review page now says reviews are "typically reviewing at least 50% of submissions in less than 24 hours and 90% in less than 48 hours." A secondary article dated Oct 5, 2026 still quoted "90%… in less than 24 hours". | Expect up to ~2 days, longer for health or AI apps. | https://developer.apple.com/distribute/app-review/ · https://blakecrosley.com/blog/app-review-what-reviewers-look-for-2026 | V (current text) / U (date of change) |
| **No change** | App Review Guidelines: still **"Last Updated: June 8, 2026"**. No revision since the earlier pass. | — | https://developer.apple.com/app-store/review/guidelines/ | V |

**Before Aug 20, but missing from the earlier pass:**
- **Regulated medical device status is mandatory for new apps in Health & Fitness or Medical in the US, UK and EEA, effective Mar 26, 2026** **[V]**: https://developer.apple.com/news/?id=nyqbfz1y
- **Texas SB 2420 has applied to new Texas Apple Accounts since Jun 4, 2026** **[V]** (https://developer.apple.com/news/?id=sg176nne). The Supreme Court denied emergency stays on Jul 6, 2026 **[S]** (https://www.infolawgroup.com/insights/2026/7/7/supreme-court-clears-the-way-texass-app-store-accountability-act-is-now-enforceable).
- **Utah's compliance date moved to May 6, 2027 and Louisiana's to Jul 1, 2027** **[S]**: https://www.wiley.law/alert-Key-Developments-With-State-App-Store-Accountability-Acts-as-Texas-Act-Takes-Effect
- **The Jun 8, 2026 guideline revision** (kid and teen intro, 1.2, 4.3(a)/(b), 4.5.3) touches nothing Culprit does **[V]**: https://developer.apple.com/news/?id=a233fmpw

**Deadlines in the next 6 months (to Apr 2027)**
- **Oct 23, 2026:** iPhone Duo ships. Not a requirement.
- **Jan 1, 2027:** California AB 1043 **[S]**. An Alabama law of the Louisiana type also starts **[S]**.
- **"Early 2027":** existing apps without a medical-device status can no longer submit updates. Culprit declares it at first submission **[V]**.
- **Feb 1, 2027:** the Developer ID Sub-CA expires. macOS `.pkg` only, so it doesn't apply.
- **April 2027:** iOS 27 SDK, minimum target iOS 15+, and iPhone Duo screenshots **[V]**.
- **No date announced:** Accessibility Nutrition Labels. Apple: "voluntary to start… over time, you'll be required" **[V]**.
- **Just past the window:** Utah May 6, 2027 and Louisiana Jul 1, 2027 **[S]**.

---

## 3. First-submission checklist for this profile

"Status" comes from the profile and the repo; "?" means unknown from here.

**A. Account and agreements**

| # | Item | Required? | Source | What it means for Culprit | Status |
|---|---|---|---|---|---|
| A1 | Apple Developer Program membership, individual | Yes | https://developer.apple.com/programs/enroll/ | "Your name will be displayed as the seller name of your apps on the App Store": the PM's legal name, not "Culprit". [V] | ✓ |
| A2 | Latest DPLA accepted (Aug 18, 2026) | Yes, in practice (the banner blocks submission) | DPLA; news 0cgo95n6; forum 843788 | Account Holder signs in at developer.apple.com/account. [V/S] | ? |
| A3 | Paid Apps Agreement, tax, banking | **No** for a free app | https://developer.apple.com/help/app-store-connect/manage-agreements/sign-and-update-agreements | "you can distribute free apps… under the Apple Developer Program License Agreement." Needed only when IAP ships. [V] | N/A |
| A4 | DSA trader status | **Yes** | https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements | "Even if you don't distribute apps in the EU, you'll still need to declare a trader status." For apps "on the App Store only outside the EU, you're not acting as a trader." Pick "This is not a trader account" (Business → Agreements → Compliance). If the app ever goes to the EU, re-assess; a trader's address, phone and email are published. [V] | ? |

**B. App Information page**

| # | Item | Required? | Source | What it means for Culprit | Status |
|---|---|---|---|---|---|
| B1 | Name, 2–30 characters | Yes | required-properties table; https://developer.apple.com/help/app-store-connect/reference/app-information/app-information | "Culprit — Pet Health Tracker" (28). [V] | ✓ |
| B2 | Subtitle, ≤30 characters | Optional | same | Must not "make unverifiable product claims" (2.3.7). [V] | PM decision pending |
| B3 | Bundle ID, SKU, primary language | Yes | same | — | ✓ |
| B4 | Primary category (secondary optional) | Yes | same; https://developer.apple.com/app-store/categories/ | Lifestyle / Health & Fitness is defensible. Health & Fitness **triggers B8**. [V] | ✓ |
| B5 | Content Rights | **Yes** | app-information reference | "Apps that contain, show, or access third-party content must have all the necessary rights…" Likely "No" for Culprit. [V rule / U answer] | ? |
| B6 | Age rating questionnaire, including the social-media question | **Yes** | https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions · https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating | Redo it (see §6 risk 3). Medical or Treatment Information: Infrequent → 13+ (or keep None and *Override to Higher Age Rating* 13+ because of the Terms). Health or Wellness Topics → 9+ if yes. Social media: No. Apple: "consider how all app features, including AI assistants and chatbot functionality, impact the frequency of sensitive content" (https://developer.apple.com/news/?id=ks775ehf). [V] | ⚠ entered as 4+ on 2026-08-09 |
| B7 | Made for Kids | No (choose Not Applicable) | set-age-rating page | Leave off. The selection can't be changed after approval. [V] | ✓ |
| B8 | **Regulated Medical Devices** | **Yes, for Culprit** | https://developer.apple.com/help/app-store-connect/manage-app-information/declare-regulated-medical-device-status | Required for apps in the US/UK/EU with Health & Fitness or Medical as primary or secondary category, or "Frequent" medical info. Path: App Information → App Store Regulations & Permits → Declare Regulated Medical Device → **No** → Save. Role: Account Holder or Admin. The page says nothing about veterinary apps. [V] | ? (likely missed) |
| B9 | License agreement | Apple's standard EULA by default | app-information reference | Optional custom EULA. [V] | — |
| B10 | App Store tags | Optional; auto-applied | https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-tags | "Currently, tags are only supported… in the United States," which is exactly Culprit's market. Deselect any tag that implies diagnosis. [V] | — |

**C. Version 1.2.0 page**

| # | Item | Required? | Source | What it means for Culprit | Status |
|---|---|---|---|---|---|
| C1 | **Screenshots** | Yes: 1–10 per size, .jpeg/.jpg/.png, no alpha | https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications | **⚠ Apple's page contradicts itself.** Its summary says "iPhone: At least one screenshot for iPhone with Dynamic Island (medium display)" (6.3″: 1206×2622 / 1179×2556). Its table marks only Face ID large (6.5″) as "Required… if… Dynamic Island (large display) aren't provided." Upload **both** 1320×2868 (6.9″) and 1206×2622. The two have near-identical aspect ratios, so the pipeline can render both. [V] | 6.9″ pipeline built |
| C2 | App previews | Optional | platform-version reference | — | — |
| C3 | Promotional text, ≤170 | Optional | https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information | — | — |
| C4 | Description, ≤4,000, plain text | **Yes** | same | Drafted (2,511). Keep the "does not diagnose" paragraph. [V] | drafted |
| C5 | Keywords, ≤100 bytes | **Yes** | same | "Names of other apps or companies aren't allowed." [V] | drafted (99) |
| C6 | Support URL | **Yes** | same | "must lead to actual contact information (legal address, email address, telephone number), as may be required by local law." `/support` returns 200 and shows support@getculprit.app. Email-only is common practice. [V / U on sufficiency] | ✓ |
| C7 | Marketing URL | Optional | same | — | — |
| C8 | Copyright | **Yes** | same | "name of the person or entity that owns the exclusive rights… preceded by the year", e.g. "2026 [legal name]". [V] | ? |
| C9 | **App Review Information** | **Yes** | same; https://developer.apple.com/help/app-review/before-submitting-for-review/complete-review | Contact name, email and phone (in `+1` format). Sign-in username and password: the account "must not expire". Notes, ≤4,000 bytes. Optional attachment. Apple's own list for the Notes: concept and audience; "Devices and OS versions tested"; "External services… (for example… AI services)" (so name Supabase, Anthropic Claude and Resend); regional differences (US only). [V] | demo account spec'd |
| C10 | Version release | **Yes** | same | Choose **Manual**: approval goes to "Pending Developer Release". [V] | plan ✓ |
| C11 | What's New, phased release, reset ratings | Updates only | required-properties table | Not available for a first version. [V] | N/A |
| C12 | Build and export compliance | Yes | https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance | `ITSAppUsesNonExemptEncryption: false` is in `app.json`, so App Store Connect skips the encryption questions. Typical HTTPS-only use is exempt. [V] | ✓ |

**D. Pricing and availability**

| # | Item | Required? | Source | What it means for Culprit | Status |
|---|---|---|---|---|---|
| D1 | Price and availability | **Yes** | https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/manage-availability-for-your-app-on-the-app-store | Free; "Specific Countries or Regions" → United States. [V] | ? |
| D2 | Apple-silicon Mac and Vision Pro availability | Default **on** | https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/manage-availability-of-iphone-and-ipad-apps-on-macs-with-apple-silicon · https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/manage-availability-of-iphone-and-ipad-apps-on-apple-vision-pro | The apps "will be available to users on Apple Vision Pro unless you edit their availability." Untick both unless tested. [V] | recommend untick |

**E. App Privacy**

| # | Item | Required? | Source | What it means for Culprit | Status |
|---|---|---|---|---|---|
| E1 | Privacy Policy URL | **Yes** | https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy | `/privacy` returns 200. ⚠ Content gaps (§6 risk 1). [V] | live, gaps |
| E2 | Data types, then **Publish** | **Yes** | same; https://developer.apple.com/app-store/app-privacy-details/ | Six types drafted. Consider adding **Health**, defined as "…any other user provided health or medical data". Pet-health data is a judgment call; over-disclosing has no review downside. [V def / U answer] Click **Publish** after answering. [V] | sheet drafted, not entered |
| E3 | Privacy Choices URL | Optional | same | — | — |

**F. Accessibility**

| # | Item | Required? | Source | What it means for Culprit | Status |
|---|---|---|---|---|---|
| F1 | Accessibility Nutrition Labels | **Optional** | https://developer.apple.com/help/app-store-connect/manage-app-accessibility/overview-of-accessibility-nutrition-labels · https://developer.apple.com/help/app-store-connect/manage-app-accessibility/manage-accessibility-nutrition-labels | "voluntary to start." "You can only publish support for devices that have a live version," so they can't be published before launch anyway. [V] | skip for 1.2.0 |

**G. Build and technical**

| # | Item | Required? | Source | What it means for Culprit | Status |
|---|---|---|---|---|---|
| G1 | Xcode 26+ with the iOS 26 SDK (since Apr 28, 2026) | Yes | upcoming-requirements page; https://developer.apple.com/news/?id=ueeok6yw | The EAS `sdk-57` image is `macos-tahoe-26.5-xcode-26.6`, i.e. Xcode 26.6 (https://docs.expo.dev/build-reference/infrastructure/). Confirm in the build log. [V] | ✓ |
| G2 | Target iOS 13+ (since Sep 9, 2026) | Yes | upcoming-requirements page | Minimum is iOS 16.4. [V] | ✓ |
| G3 | Required-reason API declarations in privacy manifests (since May 1, 2024) | Yes | https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api | "apps that don't describe their use of required reason API… aren't accepted." ⚠ The widget code (`expo-widgets/ios/WidgetsStorage.swift`) calls `UserDefaults(suiteName:)`, and expo-widgets ships no `PrivacyInfo.xcprivacy`; there is no `ios.privacyManifests` in `app.json`. Check the 1.2.0 processing email. If it cites the widget extension, declare UserDefaults reason **1C8F.1** (App Group). [V] | build 35 uploaded OK; recheck |
| G4 | Third-party SDK privacy manifests and signatures | Yes, for listed SDKs | https://developer.apple.com/support/third-party-SDK-requirements/ | The list includes `hermes`; React Native ships its own manifests. [V] | ✓ likely |
| G5 | App icon | Yes (in the binary) | https://developer.apple.com/design/human-interface-guidelines/app-icons | "Although you can provide a flattened image for your icon, layers give you the most control." Icon Composer is optional. [V] | ✓ light/dark/tinted PNGs |
| G6 | Purpose strings | Yes, for camera and photos | https://developer.apple.com/help/app-review/guideline-reference/5-1-1-purpose-strings | The current strings name specific features, which meets the bar. No microphone. [V] | ✓ |
| G7 | Push entitlement | Not needed for local notifications | — | Stripped by a config plugin. | ✓ |

**H. In-app behaviour App Review checks**

| # | Item | Required? | Source | What it means for Culprit | Status |
|---|---|---|---|---|---|
| H1 | Account deletion in the app (5.1.1(v)) | Yes | https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion | Must be easy to find and delete the whole account. [V] | ✓ built and verified |
| H2 | Privacy policy link inside the app (5.1.1(i)) | Yes | guidelines | — | ✓ Settings |
| H3 | Third-party AI consent (5.1.2(i)) | Yes | guidelines | See §6 risk 1. | in progress |
| H4 | Sign in with Apple | **No** | guidelines 4.8 | 4.8 applies only to third-party or social login. Culprit uses its own email and password, and the Apple/Google buttons are hidden. [V] | ✓ |
| H5 | All links work; backend live; no placeholders (2.1) | Yes | guidelines 2.1; App Review page | ⚠ `/disclaimer` is 404. [V] | fix |
| H6 | Personal info at sign-up (5.1.1(v), (x)) | Yes | guidelines | ⚠ First and last name are **required** (`app/(auth)/signup.tsx` `requiredNameError`). See §6 risk 7. [V] | review |
| H7 | Photo access minimisation (5.1.1(iii)) | Yes | guidelines; https://docs.expo.dev/versions/latest/sdk/imagepicker/ | ⚠ The app calls `requestMediaLibraryPermissionsAsync()` before opening the picker (`lib/photoSource.ts`, food/med capture). Expo: "No permissions request is necessary for launching the image library." [V] | review |
| H8 | Age assurance (Declared Age Range) | Not checked by App Review | https://developer.apple.com/support/age-assurance | "App Review has no changes related to age assurance." It's a legal obligation; see §6. [V] | — |

**Not present any more:** no "Advertising Identifier (IDFA)" question appears in Apple's current required-properties table. ATT and the privacy label replaced it **[V by absence]**.

---

## 4. Re-verification of the earlier consultant pass (2026-08-20)

| Earlier claim | Still true? | Source | Conf. |
|---|---|---|---|
| "5.1.2(i) AI consent is the one new hard blocker" | **Partly.** It is a hard blocker: the text was added Nov 13, 2025 and is still current. It is **not the only one**: there's also the age rating versus the 13+ Terms, the `/disclaimer` 404, the privacy-policy gaps, the medical-device declaration and the Aug 18 DPLA. | https://developer.apple.com/news/?id=ey6d8onl · guidelines (Last Updated June 8, 2026) | V |
| A "Sept-2026 age-rating questionnaire delta" exists | **True.** It is the social-media capability question, required to submit from September 2026. | https://developer.apple.com/news/?id=tlur8uvi | V |
| DSA trader question at first submission | **True.** It is required even for non-EU apps. US-only means "not a trader". | DSA help page | V |
| Accessibility Nutrition Labels optional | **True.** Still voluntary, with no date announced. Labels can't be published until a version is live. | ANL overview + manage pages | V |
| Xcode 26 gate satisfied | **True.** The requirement has applied since Apr 28, 2026, and EAS `sdk-57` uses Xcode 26.6. Next gate: the iOS 27 SDK in April 2027. | upcoming requirements; Expo infra page | V |
| A single 6.9-inch screenshot set is enough | **Uncertain.** Apple's spec page now says the iPhone requirement is a "Dynamic Island (medium display)" screenshot, but its table implies 6.9″ covers it. Upload 6.9″ and 6.3″. | screenshot specifications | V (the conflict) |
| Sign in with Apple not required | **True.** | guideline 4.8 | V |
| Manual release | **True.** It's a valid option, and recommended. | platform-version reference | V |
| *(from `docs/app-store-age-rating.md`)* "even 'Infrequent/Mild' still resolves to 4+" | **False today.** Infrequent Medical or Treatment Information gives 13+; Frequent gives 16+. | age-ratings values page | V |

---

## 5. TestFlight external beta: requirements, and the consultant's view

**Requirements**

- **Test information.** "Beta App Description… This field is required." Also a Feedback Email. Marketing URL and Privacy Policy URL are optional; the API calls a privacy policy "recommended". Each build added to a group gets "What to Test" notes. Apple: "your beta app description and beta app review information are required in order to share your beta with external testers." **[V]** https://developer.apple.com/help/app-store-connect/test-a-beta-version/provide-test-information · https://developer.apple.com/testflight/ · https://developer.apple.com/documentation/appstoreconnectapi/betaapplocalization/attributes-data.dictionary
- **Beta App Review information.** Contact first name, last name, phone and email. "Sign-in required" with a demo username and password: "Credentials must be valid and active for duration of review." Notes up to 4,000 characters. **[V]** https://developer.apple.com/documentation/appstoreconnectapi/betaappreviewdetail/attributes-data.dictionary
- **Groups and limits** **[V]** (https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers):
  - "To create an external group… you must first create an internal group."
  - Up to **10,000** external testers per app and **100** internal.
  - Invite by email or a **public link**. The link can be "Open to Anyone" or "Filter by Criteria" (device and OS only), with a tester limit of 1–10,000.
  - Testers who join by public link are anonymous.
- **Review.** "The first build you submit requires a full review, but later builds for the same version might not." Only one build of each version can be in review at a time. Up to 6 TestFlight App Review submissions in 24 hours. **[V]** (same page)
- **Expiry.** "You can test a build for up to 90 days." A build cut on 2026-08-29 expires around **2026-11-27**. **[V]** https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview
- **Rules.** Guideline 2.2: beta builds "should be intended for public distribution and should comply with the App Review Guidelines"; testers can't be paid. "Significant updates to your beta build should be submitted to TestFlight App Review." **[V]**
- **Regions.** TestFlight itself has no territory restriction; invitees from any country can join **[S]** (https://developer.apple.com/forums/thread/682057).
- **Timing.** Apple publishes no turnaround for Beta App Review. Developers reported 6+ days in "Waiting for Review" in June 2026 **[S]** (https://developer.apple.com/forums/thread/835231).
- **Does passing Beta App Review predict App Review?** Apple publishes no such statement **[U]**. My inference: TestFlight review sees the binary and the beta test info, not the product page, privacy label, age rating, medical-device declaration or screenshots. So it's only a partial signal, and the reviewer differs.

**The consultant's view, before the PM ruled (2026-10-11: no external beta before launch): a short, small external beta would have been worth it, run in parallel with the App Store submission.**
- **Why it's worth it:**
  - the consent gate, the server gate and the decline path are brand new;
  - real owners exercise sign-up with email confirmation, AI reads on real photos, deletion, and iPad compatibility mode;
  - TestFlight review gives an early, partial read on 5.1.2(i);
  - testers' screenshot feedback is cheap.
- **How:**
  1. Invite 15–30 **US** pet owners by **email**, not a public link, to keep the cohort known. The privacy policy says the app is "offered in the United States".
  2. Point "What to Test" at the consent screen, sign-up, an AI read, deletion and the widget.
  3. Submit the **same build** to App Review with **Manual release**, so approval and the beta run side by side. Release only after the beta clears.
- **Costs:** 1–7 days of Beta App Review [S]; real user data from day one, so the consent and privacy policy must be final first; AI spend.
- **Skip it only if** a hard launch date is under ~10 days away.

---

## 6. Top 10 rejection risks for Culprit

| # | Risk (guideline) | Likely reviewer action | Mitigation | Conf. |
|---|---|---|---|---|
| 1 | **Third-party AI sharing without visible consent or disclosure.** 5.1.2(i) and 5.1.1(i). | Rejection quoting the four-point template **[S]**: "explain what data is sent, identify who the data is sent to, and ask the user's permission before sharing personal data with a third-party AI service… the app's privacy policy must also identify… if it is shared with a third-party AI service" (https://developer.apple.com/forums/thread/815109, Feb 2026). Variant: "We were not presented with the consent prompt on launch or anywhere else in the app" (https://developer.apple.com/forums/thread/820209, Mar 2026). | **(a)** Use a consent sheet separate from the Terms, shown before the first transmission. It should name **Anthropic (Claude)**, list each flow (symptom photos for AI reads, food and med label photos, the pet record for Ask if it ships, structured findings for phrasing), and offer **Allow** and **Not now** (app still works). Add a Settings toggle to withdraw, as 5.1.1(ii) requires "an easily accessible… way to withdraw consent." The HIG says the same: "Ask permission… always offer a clear way to opt out… Clearly identify when and where you use AI" (https://developer.apple.com/design/human-interface-guidelines/generative-ai). **(b)** Make the reviewer meet it: deliver the demo account so the golden path triggers the sheet. Don't pre-consent it by generating the seeded AI read in-app after the gate ships, or design the declined state to re-present the sheet. Describe it in the Notes and attach a screen recording. **(c)** Update `/privacy`: add Ask if reachable, a "same or equal protection" sentence covering Supabase, Anthropic and the email provider (5.1.1(i) bullet 2), and how to revoke AI consent (bullet 3). **(d)** Keep the server-side gate for server-initiated phrasing; the "absence = declined" fail-closed design in migration 100 fits. | V (rule) · S (reviewer practice) |
| 2 | **App completeness (2.1).** Broken link, demo account, backend, iPad. Apple: "over 40% of unresolved issues are related to guideline 2.1." | Rejection for a broken link (`/disclaimer` 404 from onboarding and Settings), a demo login that fails, a crash on iPad, or a confirmation-email link that dead-ends. | **(a)** Publish `/disclaimer` now. **(b)** The demo account must not expire; keep the re-seed cadence and the resurrection protocol; don't deploy breaking server changes while "In Review". **(c)** Test the build on an iPad in compatibility mode. Apple's page says an iPhone app "can be downloaded from the App Store onto iPad," and one rejection message names "Review Device: iPad Air 11-inch (M3)" [S]. **(d)** Walk sign-up end to end: the confirmation link must land somewhere sensible. The auth emails still say "Nyx", so rebrand them before a reviewer signs up. | V / S |
| 3 | **Age rating inaccurate (2.3.6), plus Apple's EULA rule.** | Rejection asking to correct the questionnaire. Reviewers do check answers against the app: a forum thread shows repeated 2.3.6 rejections over an age-assurance answer (https://developer.apple.com/forums/thread/810077) [S]. | Override to at least **13+** to match the Terms (Apple's rule, verified). Answer Medical or Treatment Information honestly. The AI read can "calmly suggest a vet call", which fits Apple's definition ("guidance around the management of medical conditions… emergency medical care"). Use Infrequent → 13+. If an open-ended health Q&A (Ask) ships, consider Frequent → 16+. Peer evidence: XiaoBai Pet Health is 13+ (Infrequent); Pet Check AI is 16+ (Frequent): https://apps.apple.com/app/id6771024349 · https://apps.apple.com/app/pet-check-ai/id6749246922. Social media: No. Then update `docs/app-store-age-rating.md`. | V |
| 4 | **Hidden or dormant features (2.3.1(a)).** | Rejection, or a later removal, if a feature appears that review never saw. App Review lists "attempting to hide features in review (Guidelines 2.3.1(a)…)" as a fraud signal that extends review (https://developer.apple.com/help/app-review/after-submitting-for-review/review-status). | Inventory everything gated by `app_config` or allowlists in 1.2.0: `ask_enabled` / `ask_general_enabled`, `widget_enabled`, the `engines_v3_*` keys, `paywall_enabled`. For each: enable it on the demo account and describe it in the Notes, **or** keep it off for everyone until a later version is submitted with it described. Don't flip a feature on for all users after approval without a reviewed version. 2.5.2 and DPLA 3.3.1(B) bar downloaded code that "change[s] the primary purpose"; that is relevant to EAS Update. The paywall must stay unreachable until an IAP version is reviewed. | V (rules) / U (how strictly enforced) |
| 5 | **Medical scrutiny of AI photo reads (1.4.1) and metadata claims (2.3, 2.3.7).** | Questions or rejection if metadata implies diagnosis or accuracy. Apple's documentation list asks medical apps "that make diagnostic or treatment claims" for regulatory clearance (https://developer.apple.com/help/app-review/before-submitting-for-review/complete-review). | Keep the posture: no "diagnose", "detect", "accurate", "vet-grade", "clinical-grade", "AI vet" or "symptom checker" in the name, subtitle, description, screenshots or Notes. Keep the in-app "check with your vet" reminder (1.4.1 requires it). In the Notes, say plainly that AI reads describe a single photo, never reassure, and that there is no regulatory clearance because no diagnostic claim is made. | V |
| 6 | **Screenshots (2.3.3, 2.3.8, 2.3).** | Metadata rejection, which can be fixed without a new build. | More than half the frames must show the app in use. **No vomit or stool photos in any frame**, including report frames with embedded photos (2.3.8: metadata "adhere to a 4+ age rating even if your app is rated higher"). Show only UI the reviewed build gives users, nothing flag-gated. Use fictional data (2.3.9). No alpha channel. Upload 6.9″ and 6.3″ (C1). | V |
| 7 | **Required personal info and login wall (5.1.1(v), (x)).** | Data-minimisation rejection over the mandatory first and last name. Field-requirement rejections are a recurring pattern [S] (https://ptkd.com/journal/guideline-5-1-1-registration-form-fields-rejection-fix). | Make the name optional, or justify it in the Notes as directly relevant: the owner's name appears on the vet report. Also explain why an account is needed (sync, server-side analysis, report generation, deletion). Guideline text: "Apps may not require users to enter personal information to function, except when directly relevant to the core functionality" and "Apps may request basic contact information (such as name…) so long as the request is optional." | V (text) / S (pattern) |
| 8 | **Photo-library over-request (5.1.1(iii)).** | Possible note or rejection: Apple prefers "the out-of-process picker… rather than requesting full access to… Photos." | Remove the `requestMediaLibraryPermissionsAsync()` calls before `launchImageLibraryAsync()` for photo-only picks. Expo: "No permissions request is necessary for launching the image library." | V (rule, Expo) / U (frequency) |
| 9 | **"Submitted by incorrect entity" (5.1.1(ix)).** Low probability, high impact. | App Review: "Certain types of apps must be submitted by the legal entity that provides the services rather than an individual developer… healthcare…" (https://developer.apple.com/distribute/app-review/). | In the Notes: Culprit is a record-keeping tool for pet owners; it provides no veterinary service, telehealth or diagnosis, and collects no human health data. Contingency: appeal, or enrol an organisation. That needs a legal entity and a D-U-N-S number (https://developer.apple.com/programs/enroll/); the lead time is unverified. A 30-minute App Review appointment (Tue/Thu) is a cheap pre-check: https://developer.apple.com/help/app-review/before-submitting-for-review/app-review-appointment. No evidence was found of this applied to pet trackers. | V (rule) / U (applicability) |
| 10 | **"Beta" wording and chatbot framing (2.2, 4.7).** | A reviewer reading a visible "Beta features" shelf as beta functionality. One forum anecdote has a reviewer calling a test button a "Beta feature" under 2.2 [S]. Ask could be read as a chatbot under 4.7, which requires filtering and reporting. | Make sure the demo account can't see the beta shelf, or rename it ("Early access"). If Ask ships, scope it to the pet record, refuse dosing advice (1.4.2 reserves dosage calculators for approved entities), and describe it as a first-party feature in the Notes. | S / U |

**Not a rejection risk, but legal exposure:**
- **Texas SB 2420** applies to developers "regardless of its targeted audience" **[S]** (https://www.wiley.law/alert-State-App-Store-Accountability-Acts-Introduce-New-Obligations-for-App-Developers).
- **Its duties:** use the store's age-category and consent signals, re-consent after significant changes, assign age ratings, and delete the age data after use **[S]**.
- **Apple's position** **[V]**: "Developers are responsible for their own age restrictions… you must check the age of people using your app" where legally required, and "App Review has no changes related to age assurance" (https://developer.apple.com/support/age-assurance).
- **The tooling** **[V]**: `expo-age-range` exists in Expo SDK 57 (entitlement `com.apple.developer.declared-age-range`; `isEligibleForAgeFeaturesAsync` needs iOS 26.2+): https://docs.expo.dev/versions/v57.0.0/sdk/age-range/
- **Recommendation:** have counsel review before or soon after launch, and certainly before Jan 1, 2027 (California).

---

## 7. Open questions the consultant could not verify

- **Which iPhone screenshot size App Store Connect enforces today.** The spec page contradicts itself (C1). Check the media manager's "required" marker.
- **Whether reviewers actually delete demo accounts** while testing 5.1.1(v). It's practitioner lore; Apple has published nothing. The resurrection protocol remains sensible.
- **Beta App Review turnaround**, and whether passing it predicts App Review. Apple publishes neither.
- **When Apple changed its review-time wording** (50%/24h and 90%/48h).
- **Whether the widget extension triggers ITMS-91053** (missing UserDefaults reason). Read the 1.2.0 processing email.
- **Whether the US product page shows anything** ("not a medical device") when "No" is declared.
- **Whether Apple's Utah and Louisiana implementation tracks the legislative delays.** Apple's last post (Feb 24, 2026) used the 2026 dates.
- **Whether pet medical data belongs under the privacy label's "Health" type.** Apple's definition doesn't address non-human data.
- **Whether 5.1.1(ix) has ever been applied to a pet-health tracker.** No case found.
- **A claimed AI-content rule.** A secondary site (ConductAtlas) claims the June 2026 revision added an AI-generated-content disclosure rule. It is **not** in the live Guidelines (Last Updated June 8, 2026) or DPLA 3.3.11; I grepped the full text. Treat it as unsupported.
- **Not checked live (I did not query production `app_config`):**
  - whether Ask, the widget, the Engines v3 flags and the paywall are on or off for the demo account and for all users;
  - whether Ask is reachable in the 1.2.0 build. The demo spec (Aug 11) said "no entry point exists in the build."
- **The Developer Program membership state**, and **whether the Aug 18 DPLA is already accepted**.

---

## Sources

**Apple: rules, news and App Store Connect**
- App Review Guidelines (Last Updated June 8, 2026): https://developer.apple.com/app-store/review/guidelines/
- Developer News posts:
  - Nov 13, 2025 (guidelines; 5.1.2(i) AI text added): https://developer.apple.com/news/?id=ey6d8onl
  - Jul 24, 2025 (new age-rating system): https://developer.apple.com/news/?id=ks775ehf
  - Dec 23, 2025 (Texas injunction): https://developer.apple.com/news/?id=8jzbigf4
  - Feb 3, 2026 (SDK minimums): https://developer.apple.com/news/?id=ueeok6yw
  - Feb 24, 2026 (age requirements by region): https://developer.apple.com/news/?id=f5zj08ey
  - Mar 26, 2026 (regulated medical devices): https://developer.apple.com/news/?id=nyqbfz1y
  - Jun 3, 2026 (Texas): https://developer.apple.com/news/?id=sg176nne
  - Jun 8, 2026 (DPLA and guidelines): https://developer.apple.com/news/?id=a233fmpw
  - Jun 8, 2026 (Time Allowances): https://developer.apple.com/news/?id=0d2gpmml
  - Jul 9, 2026 (social-media questions): https://developer.apple.com/news/?id=tlur8uvi
  - Aug 18, 2026 (DPLA Attachment 14): https://developer.apple.com/news/?id=0cgo95n6
  - Aug 18, 2026 (EU changes): https://developer.apple.com/news/?id=gmws0jgp
  - Sep 9, 2026 (iOS 27 submissions): https://developer.apple.com/news/?id=k1mtkt1k
  - Sep 16, 2026 (betas): https://developer.apple.com/news/?id=rfb1rooi
  - Oct 5, 2026 (iPhone Duo): https://developer.apple.com/news/?id=kkphp5qo
  - Oct 5, 2026 (new assets): https://developer.apple.com/news/?id=ljpl7kyn
- Upcoming Requirements: https://developer.apple.com/news/upcoming-requirements/
- Submitting your apps: https://developer.apple.com/app-store/submitting/
- App Store Connect release notes: https://developer.apple.com/help/app-store-connect/release-notes/
- App Store Connect Help:
  - required properties: https://developer.apple.com/help/app-store-connect/reference/app-information/required-localizable-and-editable-properties
  - platform version information: https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information
  - app information: https://developer.apple.com/help/app-store-connect/reference/app-information/app-information
  - screenshot specifications: https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications
  - age-rating values: https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions
  - setting an age rating: https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating
  - regulated medical device: https://developer.apple.com/help/app-store-connect/manage-app-information/declare-regulated-medical-device-status
  - DSA: https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements
  - app privacy: https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy
  - export compliance: https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance
  - agreements: https://developer.apple.com/help/app-store-connect/manage-agreements/sign-and-update-agreements
  - availability: https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/manage-availability-for-your-app-on-the-app-store
  - app tags: https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-tags
  - custom product pages: https://developer.apple.com/help/app-store-connect/create-custom-product-pages/configure-multiple-product-page-versions
  - Accessibility Nutrition Labels: https://developer.apple.com/help/app-store-connect/manage-app-accessibility/overview-of-accessibility-nutrition-labels
  - TestFlight overview: https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview
  - TestFlight test information: https://developer.apple.com/help/app-store-connect/test-a-beta-version/provide-test-information
  - external testers: https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers
- App Store Connect API: https://developer.apple.com/documentation/appstoreconnectapi/betaappreviewdetail/attributes-data.dictionary · https://developer.apple.com/documentation/appstoreconnectapi/betaapplocalization/attributes-data.dictionary

**Apple: App Review process**
- App Review page: https://developer.apple.com/distribute/app-review/
- App Review Help:
  - complete review: https://developer.apple.com/help/app-review/before-submitting-for-review/complete-review
  - compatible devices: https://developer.apple.com/help/app-review/before-submitting-for-review/test-compatible-devices
  - appointment: https://developer.apple.com/help/app-review/before-submitting-for-review/app-review-appointment
  - 2.3.3 screenshots: https://developer.apple.com/help/app-review/guideline-reference/2-3-3-screenshots
  - account deletion: https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion
  - purpose strings: https://developer.apple.com/help/app-review/guideline-reference/5-1-1-purpose-strings
  - review status: https://developer.apple.com/help/app-review/after-submitting-for-review/review-status
  - expedited review: https://developer.apple.com/help/app-review/after-submitting-for-review/request-expedited-review
  - contacting App Review: https://developer.apple.com/help/app-review/after-submitting-for-review/contact-app-review
  - appeals: https://developer.apple.com/help/app-review/after-submitting-for-review/appeal-to-the-app-review-board
- 2025 App Store Transparency Report: https://www.apple.com/legal/app-store/transparency/2025/. It covers 9,100,620 submissions reviewed and 2,093,244 rejected. Rejections by section:

  | Section | Rejections |
  |---|---|
  | Performance | 1,354,418 |
  | Legal | 495,673 |
  | Design | 415,532 |
  | Business | 283,820 |
  | Safety | 151,159 |

**Apple: agreements, privacy and platform**
- DPLA (LYL255, Aug 18, 2026): https://developer.apple.com/support/terms/apple-developer-program-license-agreement/
- Age assurance Q&A: https://developer.apple.com/support/age-assurance
- Kids and age resources: https://developer.apple.com/kids/
- Third-party SDK requirements: https://developer.apple.com/support/third-party-SDK-requirements/
- Required-reason APIs: https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api
- Required-reason codes: https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacyaccessedapitypes/nsprivacyaccessedapitypereasons
- App privacy details: https://developer.apple.com/app-store/app-privacy-details/
- HIG App icons: https://developer.apple.com/design/human-interface-guidelines/app-icons
- HIG Generative AI: https://developer.apple.com/design/human-interface-guidelines/generative-ai
- iPhone Duo preparation: https://developer.apple.com/iphone-duo/prepare/
- Program enrollment: https://developer.apple.com/programs/enroll/
- App Store categories: https://developer.apple.com/app-store/categories/

**Expo**
- EAS build infrastructure: https://docs.expo.dev/build-reference/infrastructure/
- Apple privacy manifests: https://docs.expo.dev/guides/apple-privacy/
- `expo-age-range` (SDK 57): https://docs.expo.dev/versions/v57.0.0/sdk/age-range/
- Image picker: https://docs.expo.dev/versions/latest/sdk/imagepicker/
- TestFlight: https://docs.expo.dev/submit/testflight/

**Secondary sources**
- Apple Developer Forums threads:
  - 815109 (AI-sharing rejection message, Feb 2026): https://developer.apple.com/forums/thread/815109
  - 820209 (consent prompt not seen, Mar 2026): https://developer.apple.com/forums/thread/820209
  - 815715 (kids' AI tutor, Feb 2026): https://developer.apple.com/forums/thread/815715
  - 810077 (2.3.6 age-assurance answers): https://developer.apple.com/forums/thread/810077
  - 843788 (DPLA banner, Aug 2026): https://developer.apple.com/forums/thread/843788
  - 835231 (TestFlight wait, Jun 2026): https://developer.apple.com/forums/thread/835231
  - 682057 (TestFlight territories): https://developer.apple.com/forums/thread/682057
- Law firms:
  - Wiley (Jun 8, 2026): https://www.wiley.law/alert-Key-Developments-With-State-App-Store-Accountability-Acts-as-Texas-Act-Takes-Effect
  - Wiley (Oct 16, 2025): https://www.wiley.law/alert-State-App-Store-Accountability-Acts-Introduce-New-Obligations-for-App-Developers
  - InfoLawGroup (Jul 7, 2026): https://www.infolawgroup.com/insights/2026/7/7/supreme-court-clears-the-way-texass-app-store-accountability-act-is-now-enforceable
  - Pearl Cohen (Jun 28, 2026): https://www.pearlcohen.com/fifth-circuit-stays-injunctions-against-texas-app-store-accountability-act/
  - Frankfurt Kurnit (Oct 1, 2026): https://technologylaw.fkks.com/post/102o301/update-your-app-again-californias-digital-age-assurance-act-takes-effect-janu
- Blake Crosley (Oct 5, 2026): https://blakecrosley.com/blog/app-review-what-reviewers-look-for-2026
- App Store listings for the peer age ratings: https://apps.apple.com/app/id6771024349 · https://apps.apple.com/app/pet-check-ai/id6749246922

**Repo and live site (checked 2026-10-11)**
- `app.json`
- `constants/links.ts`
- `app/onboarding/disclaimer.tsx`
- `app/settings.tsx`
- `app/(auth)/signup.tsx`
- `lib/photoSource.ts`
- `lib/appConfig.ts`
- `supabase/migrations/100_ai_consent.sql`
- `node_modules/expo-widgets/ios/WidgetsStorage.swift`
- `docs/app-store-age-rating.md`
- `docs/nyx-demo-account-requirements.md`
- `docs/legal/terms-of-service.md`
