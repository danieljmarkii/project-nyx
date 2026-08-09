# Culprit — App Store Age Rating (as entered)

**Status:** ✅ Done — entered in App Store Connect 2026-08-09 · **Result: 4+**
**Guide step:** 13 (`docs/app-store-submission-guide.md`) · **Backlog:** B-269
**Companion:** `docs/store-listing-copy.md` §6 (the listing copy is written to be consistent with these answers) · `docs/legal/veterinary-disclaimer.md` (B-270)

> **Why this doc exists.** App Store Connect does not show the questionnaire back to you after it computes a rating, so this is the only record of *what was actually answered*. Keep it for two reasons: (1) the age-rating answers must stay consistent with the app description and the veterinary disclaimer — a mismatch is a rejection trigger — so any future copy change is checked against this sheet; (2) on a resubmission or an OS-driven re-rate (Apple periodically revises the questionnaire), this is the baseline to re-enter from, not reconstructed from memory.

---

## Result

**Age rating: 4+** — the lowest band. Every content descriptor is *None* and every capability question is *No*, so nothing raises the rating.

> **Note on the 2025 questionnaire revision.** Apple replaced the old `12+` / `17+` bands with `13+` / `16+` / `18+` in 2025 (bands are now `4+ / 9+ / 13+ / 16+ / 18+`) and reworded/added some questions. The on-screen wording may drift from the labels below, but the mapping holds: Culprit has no mature content and no exposure capabilities, so answer every content question *None* and every capability question *No*.

---

## Answers as entered

### Content descriptors — all **None**

| Question | Answer |
|---|---|
| Cartoon or Fantasy Violence | **None** |
| Realistic Violence | **None** |
| Prolonged Graphic or Sadistic Realistic Violence | **None** |
| Sexual Content or Nudity | **None** |
| Profanity or Crude Humor | **None** |
| Mature/Suggestive Themes | **None** |
| Horror/Fear Themes | **None** |
| Alcohol, Tobacco, or Drug Use or References | **None** |
| Simulated Gambling | **None** |
| **Medical/Treatment Information** | **None** — see the judgment call below |

### Capability / other questions — all **No**

| Question | Answer | Why (code-verified where noted) |
|---|---|---|
| Unrestricted Web Access | **No** | ✅ *Verified in code:* the only WebViews render the app's own vet-report HTML (`app/report.tsx`, a fixed `source={{ html }}` string) and stored vet-document PDFs (`components/vetfiles/DocumentPdfViewer.tsx`, a WebView pointed at a local file with `allowingReadAccessToURL` scoped to that file's directory). There is no in-app browser and no address bar. External links (privacy/terms) open in the system browser, which does not count as in-app unrestricted web access. |
| Gambling / Contests (real) | **No** | No gambling or contest features. |
| Messaging / chat between users | **No** | No user-to-user communication anywhere in the app. |
| User-generated content shared publicly | **No** | The vet report is a PDF the owner exports via the iOS share sheet — a private, on-device share, not public content. No share link/token is minted in the submission build. |
| In-app purchases (if asked as a capability) | **No** | ✅ *Verified:* the paywall is a flagged-off mock (`app_config.paywall_enabled = false`, guide step 6) and no purchase SDK (RevenueCat / StoreKit) ships in the build. |

### Kids Category — **Off**

Do **not** enable "Made for Kids" / the Kids Category. A 4+ rating means "no objectionable content"; the Kids Category is a separate, much stricter program (COPPA-grade data rules, no third-party analytics/ads, parental gates) that Culprit is not built for and does not need.

---

## The one judgment call: Medical/Treatment Information → **None**

Culprit logs a pet's symptoms and medications and surfaces patterns, but it **does not diagnose or instruct treatment** — that is the explicit posture of the veterinary disclaimer (B-270) and runs all through the listing copy ("It does not diagnose… leaves the diagnosis to the professional who can make one"). This descriptor targets content that *instructs or depicts medical treatment*, which Culprit does not do, so **None** is the accurate answer.

**There is no rating downside either way:** even the conservative "Infrequent/Mild" still resolves to 4+. The reason to choose **None** is *consistency* — the age-rating answers must not contradict a description that disclaims medical advice. Answering "Frequent/Intense Medical/Treatment Information" while the description says "not a substitute for veterinary care" is the kind of mismatch a reviewer flags; **None** keeps the whole submission telling one story.

---

## Consistency checklist (before any future edit)

- [ ] The description (`docs/store-listing-copy.md`) still claims **no diagnosis / no medical treatment** → Medical/Treatment Information stays **None**.
- [ ] No feature was added that lets users **browse arbitrary web content** in-app → Unrestricted Web Access stays **No**.
- [ ] No **user-to-user messaging** or **public UGC** was added → those stay **No**.
- [ ] In-app purchases are still **off** in the cut build (paywall flag off) → the IAP capability stays **No**.

If any box would change, re-open the questionnaire in App Store Connect (App Information → Age Rating → Edit) and re-answer, then update this sheet.
