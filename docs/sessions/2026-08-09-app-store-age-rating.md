# App Store age rating entered (4+) — submission guide step 13

**Date:** 2026-08-09
**Shipped via:** #624

## What this session was

A PM walk-through of the App Store Connect **age-rating questionnaire** (guide step 13, B-269), followed by recording the outcome. The PM completed the questionnaire in ASC during the session; the app was rated **4+**. No app code, schema, store, or Edge Function was touched — documentation only.

## What shipped

- **`docs/app-store-age-rating.md`** *(new)* — the as-entered answer record. It exists because App Store Connect never shows the questionnaire back after computing a rating, so this is the only durable record of what was answered. It carries: the full answer set (every content descriptor `None`, every capability `No`, Kids Category off), the one judgment call written out (Medical/Treatment Information → `None`), and a consistency checklist to run before any future listing-copy change.
- **`docs/app-store-submission-guide.md`** — step 13 tracker row + body marked age-rating ✅ done (4+); the listing-copy half stays open on the PM subtitle decision.
- **`docs/backlog.md`** — B-269 row: the age-rating PM-in-ASC half done; row stays **Partial** (upload, capture, copy/subtitle remain).
- **`docs/store-listing-copy.md`** — §6 age-rating answer marked entered (4+).

## The one decision of substance

**Medical/Treatment Information → None.** Culprit logs symptoms/meds and surfaces patterns but does not diagnose or instruct treatment — the posture of the B-270 veterinary disclaimer and the listing copy. There is no rating downside to the choice (even "Infrequent/Mild" resolves to 4+); the reason to answer `None` is *consistency* — the age-rating answers must not contradict a description that disclaims medical advice, or the mismatch becomes a rejection trigger. This is the load-bearing rule for a health-adjacent app and is why the record and the checklist exist.

## Two answers grounded in code, not intent

The two capability answers a reviewer could second-guess were verified against the source rather than asserted:

- **Unrestricted Web Access → No.** The only `react-native-webview` usages render the app's *own* content: `app/report.tsx` renders a fixed `source={{ html: report.html }}` clinical report, and `components/vetfiles/DocumentPdfViewer.tsx` points a WebView at a *local* vet-document file with `allowingReadAccessToURL` scoped to that file's directory. There is no in-app browser and no address bar; external links (privacy/terms) open in the system browser, which does not count.
- **In-app purchases → No** (in the submission build). The paywall is a flagged-off mock (`app_config.paywall_enabled = false`, guide step 6) and no purchase SDK (RevenueCat/StoreKit) ships in the build.

## Base-alignment note

The branch (`claude/app-store-age-ratings-j0g8w1`) started 2 commits behind `main` with no unique commits, so it was reset onto latest `origin/main` (`71090cb`, which includes #619's screenshot-track edits to the same submission-guide rows + B-269) before editing — so the edits landed on the current text, not a stale copy.

## Not touched, deliberately

**STATUS.md** was left unchanged. The submission workflow is tracked in the submission guide's own progress tracker + the B-269 backlog row, not in STATUS.md's Current Phase / Parallel Tracks / Open PM Action Items — there is no age-rating line there to bring current. Leaving it alone also honors the minimise-the-STATUS.md-diff rule (the one file every parallel session touches).

## Remaining on step 13

The **listing-copy half** is still open: the copy is drafted (`docs/store-listing-copy.md`, from #617) but awaits PM review and the subtitle decision — keep the ASC-locked "Track symptoms, find triggers" vs. adopt "Diet trials & symptom diary" (team recommendation, carries the diet-trial wedge). That decision also determines the keyword string (§5 is coupled to §2).
