# App Store creative & conversion landscape — screenshots, the search card, and the rules

**Date:** 2026-08-09 · 🧊 frozen point-in-time evidence capture
**Method:** two parallel web-research passes. (1) **Primary-source creative survey:** 15 live US-storefront iPhone screenshot sets pulled via Apple's iTunes Lookup API on 2026-08-09 and examined directly — frame counts exact, captions transcribed from the images. (2) **Conversion/rules sweep:** Apple's own developer documentation fetched directly, plus vendor test data (SplitMetrics, Storemaven, AppTweak, Appfigures, M+C Saatchi). Every non-Apple claim carries a confidence grade: **[Apple text]** / **[Measured]** (vendor-published test or panel data) / **[Practitioner]** (expert claim, no published data). Sets change without notice — per-app descriptions are accurate to 2026-08-09.
**Informs:** B-269 store screenshots (`docs/store-screenshot-plan.md`), guide steps 12–13 (`docs/app-store-submission-guide.md`), the store listing copy session, post-launch ASO work.
**Per the research-brief charter this file carries evidence, not decisions.** The design directions and submission posture built on it live in `docs/store-screenshot-plan.md` and the 2026-08-09 session record.

---

## 1. How the listing is actually seen

- **Search is the venue.** Apple's own published numbers (via Apple Ads marketing): **70% of App Store visitors use search to discover apps; 65% of downloads follow a search.** [Apple text — marketing statistic, methodology unpublished] <https://ads.apple.com/app-store>
- **The search card shows the first 1–3 portrait screenshots** (1 if landscape) when no app preview video runs. [Apple text] <https://developer.apple.com/app-store/product-page/>
- **Decision timing:** Storemaven's platform dataset (millions of product-page sessions, pre-2023): **~60% of visitors are "decisive"** — install or bounce off the first impression alone, never scrolling; visitors spend **~3–6 seconds** on the first impression; ~50% of installs come from it. [Measured — vendor platform; primary pages JS-blocked, figures confirmed via excerpts/secondary citations] <https://www.storemaven.com/academy/app-store-statistics-revealed/>
- **Fewer than 2% ever tap "read more"** on the description (SplitMetrics via AppTweak) — and the description is not keyword-indexed on iOS anyway. [Measured, secondhand] <https://www.apptweak.com/en/aso-blog/how-to-optimize-your-app-screenshots>
- Only **~11% of users scroll through all five portrait frames** (SplitMetrics analysis of 1,800 tests, cited in a vendor audit). [Measured, secondhand] <https://appscreenshotstudio.com/blog/panoramic-app-store-screenshots-convert-better-2026>
- **Conversion calibration:** AppTweak 2025 panel — US average product-page conversion ~8.6%, huge category spread; benchmark against category peers only (their impression counting can produce >100% in odd categories). [Measured — panel] <https://www.apptweak.com/en/aso-blog/average-app-conversion-rate-per-category>

## 2. What best-in-class sets actually run (primary-source, 2026-08-09)

Compressed to the load-bearing facts; frame-by-frame transcriptions live in the session's research pass and can be re-pulled from the live listings.

| App | Frames | Ground | Caption voice | Device treatment | Distinctives |
|---|---|---|---|---|---|
| **Oura** | 9 | Near-black, zero decoration, identical every frame | Thin-weight white sans, title case, 3–5 words, top-center, no bold/color/punctuation | Upright dark bezel that dissolves into the ground; dark UI full-screen, unedited | No award/press/lifestyle/mascot frames at all. The premium effect is one black field + one quiet type voice + the product's own data glow. |
| **WHOOP** | 10 | Dark gunmetal, subtle sheen | White sentence case, 4–8 words | Dark device; **one huge number/gauge leads every frame** | Matched trio (Sleep/Recovery/Strain — same layout ×3, one variable changes); offer-led frame 1. |
| **Calm** | 6 | One continuous blue gradient | 5–7-word benefit lines, white, centered | White bezels (pre-notch — visibly dated), tilted hero pair | Set is old (2017 award badge); calm register = nothing changes frame to frame. |
| **Headspace** | 8 | Orange/yellow + dune motif; one purple sleep frame | Bold black, one keyword tinted orange | Frameless floating panels + zoomed overlapping cards | Bookends: award hero opens, press-logo wall closes. ~15 rounds of A/B → **+34% organic conversion** (M+C Saatchi case study); concise captions + bright grounds won. |
| **AllTrails** | 10 | Frame 1 dark-green stat hero ("Discover 500,000+ trails"); frames 2–9 pale sage; frame 10 photo | Dark green, two lines, first line bolder, 4–7 words | Current-gen bezel, upright, real UI ×8 | Two emotional bookends around eight straight product frames; photography exactly once (the closing press-quote frame). |
| **Flo** | 8 | One lavender field | Two lines; bold phrase in a white "highlighter pill" | Frameless cropped UI cards | Medical vocabulary rendered plainly in-frame ("42 days — ABNORMAL…", symptom-checker matches); education copy inside frames. |
| **Clue** | 9 | Red gradients, cream caption zones | Dark red, 4–7 words | Frameless floating panels; photo hero | **Privacy badge on frame 1** ("Strict data privacy" + "Chosen by 100M"); "Turn gut feelings into evidence" caption; typical/atypical framing as design system. |
| **Duolingo** | 8 | Near-full-bleed UI | **Caption below**, in bottom color pills, lowercase | No bezels | The inversion works only because the cartoon UI is itself the thumbnail hook. |
| **Notion** | 7 | Pure white | **Top-left**, bold near-black, ends with a period, 3–5 words | Black current-gen bezel | Editorial monochrome; illustration hero; capability-index closer (icon list). |
| **Things 3** | 8 | One flat cornflower-blue field | Top-left, white, **small**, 10–18-word full sentences with a bold lead phrase | Black bezel, real UI | Deliberately breaks the short-caption rule; compensates with total layout constancy. Award claim folded into caption prose, no laurel. |
| **Fabulous** | 6 | Sunset gradient + mountains | None outside the device | Device shells contain **illustrated posters, not UI** | Sells the method, not the interface; high-craft, high-risk (product invisible). |

**Pet category (the competitive floor):** **Rover** (8) — marketplace-trust creative: laurel + Trustpilot stack on frame 1, review-quote cards, safety checklist, lifestyle photo; real UI in ~3 of 8 frames. **Chewy** (10) — retail collage: "$5 off" offer frames, dog in sunglasses, scalloped waves. **PetDesk** (4) — dated bezels, four frames, bolds "one" in every caption. **11pets** (10) — no captions, raw washed-out screenshots, iPhone-8 bezels. **No pet app runs a premium, product-forward, data-made-human set — the Oura register is unoccupied in this category.**

## 3. Pattern taxonomy (who uses what, what job it does)

1. **Caption-above / device-below** — the default stack (Oura, Whoop, AllTrails, Things, Notion, Calm). Vendor aggregate: top captions beat bottom by 15–25% [Practitioner — soft number]. Caption-below (Duolingo) is safe only when the UI top is the hook at thumbnail scale.
2. **Full device frame cropped at the bottom edge** (Oura, Whoop, Notion, Things, AllTrails) — "this is the real product"; the crop buys caption room and signals continuation. **Frameless floating/zoomed cards** (Headspace, Flo, Clue) — warmer, consumer-soft, less product credibility. **Tilted devices** now read dated; no current premium set tilts.
3. **Panorama/connected frames:** only Calm's hero pair among the premium sets. The circulating "+30% lift" claim has no published test behind it [explicit vendor audit found none]; and a message split past frame 3 reaches the ~11% who scroll that far.
4. **Frame roles:** brand/award hero frame 1 (Headspace, AllTrails, Clue) · matched-trio rhythm (Whoop) · social-proof closer (Headspace press wall, AllTrails quote-over-photo) · capability-index closer (Notion) · offer-led hero (Whoop, Chewy — absent from every calm-register set).
5. **Surface treatments:** single continuous color field = set-level coherence read as confidence (Oura black, Things blue, Flo lavender, Notion white); at most **one** content-matched ground exception (Headspace's purple sleep frame). **Dark vs light tracks the app's own UI theme in every observed case — no set puts a light-mode app on a black field.** Lifestyle photography only where the value is human (Clue, AllTrails, Rover); the data-value sets (Oura, Whoop, Notion, Things) omit it entirely.
6. **Copy norms:** 3–6 words clusters as guidance (AppFollow: "under five when possible"; the "squint test" at ~1/3 thumbnail scale); observed: Oura 3–5, Whoop 4–8, AllTrails 4–7, Notion 3–5; Things 10–18 as a deliberate exception. One quiet emphasis device per system (bold lead phrase, single tinted word, pill) — never several.

## 4. Conversion evidence (published A/B cases)

All single-app tests on vendor platforms — directional, not universal constants:

- First-screenshot + caption redesign: **+32%** (ZiMAD/SplitMetrics). First-screenshot caption clarity: **+15%** (ŠKODA). Background/template change alone: **+20%** (Prisma), **+31%** (Empire City). Shorter captions, bolder graphics: **+10%** (SongPop2). [All Measured — single-app A/Bs] <https://splitmetrics.com/cases/>
- Headspace listing: ~15 test rounds → **+34% average organic conversion**; concise captions + bright grounds won. [Measured — agency case study] <https://www.mcsaatchiperformance.com/news/increasing-headspaces-organic-conversion-rate-through-aso-testing/>
- **No published controlled test of caption vs no-caption exists**; the evidence is convergence (every winning variant had short benefit captions). No published dark-vs-light or panorama A/B numbers exist either. [Verified absence]
- **Relative asset weight:** icon is the highest-leverage single asset (in every placement; AppTweak 2025: winning icon tests +22.8% avg, screenshots +21.7%; SplitMetrics: icon tests up to +30%). Ratings act as a credibility floor (practitioner consensus ~4.0). [Measured panels + Practitioner]
- **Screenshot caption text is now reportedly OCR-indexed for search** as a *reinforcing* signal (Appfigures mid-2025 observational analysis; third-party replication found the effect real but weak; never confirmed by Apple). Consequence: high-contrast, keyword-bearing captions earn ranking and conversion from the same pixels — but treat as bonus, not strategy. [Measured — observational]

## 5. Apple's rules (fetched from Apple's own pages)

- **2.3.3:** screenshots must "show the app in use, and not merely the title art, login page, or splash screen" — and "may also include text and image overlays." **Marketing frames, captions, device frames, and composited-but-real UI are explicitly permitted**; the UI shown must be the real app. (In practice, UI-free brand heroes on frame 1 — Headspace, AllTrails, Clue — pass review; the rule is enforced against sets with *no* app-in-use content and against fabricated UI.)
- **2.3.9:** screenshots use **fictional account data**, never a real person's data. **2.3.7:** subtitles must not make unverifiable product claims. **2.3.10:** no other-platform imagery. **2.3.8:** all metadata 4+-appropriate. No prices in images.
- **Specs (2025–26):** 1–10 screenshots per localization; portrait 6.9″ = 1320×2868 (1290×2796 accepted); smaller devices auto-scale; iPad 13″ set only if the app runs on iPad. App previews: up to 3, 15–30s, video captures of the app only (2.3.4 — stricter than screenshots), autoplay muted. Apple recommends including a Dark Mode screenshot if the app supports one.
- **Metadata system:** indexed for search = **name (30) + subtitle (30) + hidden keyword field (100, comma-separated, no repeats, skip plurals/"app")**. Description and promotional text are NOT indexed; promotional text (170 chars) is updatable any time without review — the only same-day messaging surface.
- **Ratings:** summary rating is per-territory; new apps launch with none. StoreKit `requestReview` only — max 3 prompts per user per 365 days, sheet shown at Apple's discretion; custom "rate us" UI violates 5.6.1. Every review can be answered in ASC.
- **PPO (native A/B):** up to 3 treatments vs original; icon/screenshots/previews only; 90-day max; **requires the app to be live** — a v1 launch page cannot be A/B'd, it is a judgment call; icon variants must ship inside the binary. **Custom Product Pages:** up to 70, unique URLs, and since July 2025 keywords from the keyword field can be assigned to a CPP (organic searchers on those terms see the tailored page).
- Sources: <https://developer.apple.com/app-store/review/guidelines/> · <https://developer.apple.com/app-store/product-page/> · <https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications/> · <https://developer.apple.com/app-store/product-page-optimization/> · <https://developer.apple.com/app-store/custom-product-pages> [all Apple text]

## 6. Health-adjacent honesty (the 1.4.1 seam)

- **1.4.1** targets medical apps: accuracy claims about health measurements must be backed by disclosed data/methodology or the app is rejected; apps "should remind users to check with a doctor." Written for human health — pet apps inherit it by analogy, and **the trigger is the marketing language, not the code**: wellness apps get swept in when copy sounds diagnostic (developer-forum rejection threads). [Apple text + Practitioner reports]
- **2.3.7's "no unverifiable product claims" applies to the subtitle** — "AI that catches illness early" is an unverifiable accuracy claim; "see patterns in your pet's health record" is a description of function. [Apple text]
- **Observed category practice:** shipped pet-health listings carry "informational and organizational purposes only… does not provide veterinary medical advice, diagnoses, or treatment" disclaimers. Nothing veterinary-specific exists in Apple's own text. [Observed practice]
- **Clue demonstrates honesty-as-design:** privacy badge on frame 1, "Turn gut feelings into evidence," typical/atypical framing, science-education frames — the sensitive-domain trust moves rendered as a design system rather than a disclaimer.

## 7. First-submission pragmatics

- Guideline **2.1 (App Completeness) is the #1 rejection bucket** (~40% of rejection issues per widely-echoed Apple statements): crashes, placeholder content, broken links, backend off during review. Demo account with realistic **fictional** data + specific (not generic — 2.3.1(a)) Notes for Review are the countermeasures. [Practitioner echoing Apple]
- Screenshot rejections cluster on: login/splash as frame 1 (2.3.3), wrong dimensions, UI not matching the submitted build, other-platform references, prices in images, real-person data. [Practitioner]

## 8. Research debt / could not verify

- Storemaven primary pages JS-blocked; 60/40 decisive-explorer, 3–6s, 60%-never-scroll confirmed only via excerpts/secondary citations; dataset pre-2023.
- "Median user views 2.4 screenshots" (eye-tracking) — no traceable primary study; do not quote as data.
- "30–40% of first submissions rejected for screenshot violations" — circulating figure, no primary source.
- Panorama and dark-vs-light conversion lifts — no published controlled numbers exist in either direction.
- Caption-OCR indexing — observational, disputed effect size, unconfirmed by Apple.
- "Top captions beat bottom by 15–25%" — aggregated vendor data, exact percentage soft.
- "First 3 frames carry ~70–80% of conversion weight" — practitioner shorthand consistent with scroll data; the number itself is not measured.
- Headspace frame 3's device chrome may be a reused non-iOS asset; described as a frameless panel rather than asserted as iOS.
