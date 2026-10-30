# Vet report round 3, clean slate: a report in the house language, AI reopened, built for clinic AI, and the flow after the button (CUL-2275)

**Date:** 2026-10-30

DISCOVERY session on [CUL-2275](https://linear.app/projectnyx/issue/CUL-2275), filed this session at the PM's direction (the exploration started from a chat prompt). No app or Edge Function code. Shipped via #1361, which names only its sub-issue [CUL-2277](https://linear.app/projectnyx/issue/CUL-2277) so the decision briefs stay open on the parent. Branch `claude/serene-ramanujan-q6iqnv`.

## The ask

The PM asked the product team to: convene the team, personas and any useful consultant; do a deep competitive dive on vet reports (features, layouts, and what powers them); work out how to lean into AI (in the report, a summary of it, a report optimised for AI readers); check whether the report is one of the older surfaces and which v1 rules no longer fit; fix how text heavy it is; keep v1 and v2 live together behind a toggle; redesign the feature around the report (the date picker and the rest); and say what a step change from v1 would take.

## What was already there (found, then set aside at the PM's word)

- The engine is busy (77 `generate-report` commits since July, 17 in October); the page and `app/report.tsx` still carry the July Step 9 design.
- Two earlier v2 discoveries: [CUL-847](https://linear.app/projectnyx/issue/CUL-847) (2026-09-09) and [CUL-1859](https://linear.app/projectnyx/issue/CUL-1859) (2026-10-11), nine briefs (B1 to B9) unruled since 2026-10-11.
- **PM ruling, 2026-10-30:** clean slate (the earlier mocks do not anchor this round; their measurements stay citable); reopen "AI writes the summary"; scope is everything after the button plus saved reports and visit links; the report must meet the app's design bar ("we've swung a bit too clinical").
- Real-vet evidence I had missed and the PM pointed back to: [CUL-598](https://linear.app/projectnyx/issue/CUL-598) (closed 2026-10-12). The clinic prescribed a novel protein trial from the report, and its photos separated hairballs and regurgitation from vomiting.

## How the round ran

1. **Evidence.** Two isolated web sweeps, frozen: `docs/research/2026-10-vet-report-competitor-teardown.md` (pet apps; §V verifies Pawsitive against its own listing and corrects a preset claim) and `docs/research/2026-10-vet-report-analog-reports.md` (Dexcom Clarity, LibreView, Tidepool, Zoetis trackers, CoVet).
2. **Wave 1, five isolated lanes.** Today's report rendered from the repo's own fixtures under Node with a Deno shim (583 of 584 render and report tests pass under the harness; browser prints, not phone prints); the AI options; a v1 rules audit; the flow and supporting features; the design language. Working papers in `docs/vet-report-v3-discovery/`.
3. **Wave 2, six isolated panel reads** of the renders: Dr. Chen; the skeptical GP and the criticalist; the vet tech and a clinic AI vendor PM; Jordan and Sam; the Data Scientist and Trust & Safety.
4. **Wave 3, mock round 3** (`docs/culprit-vet-report-v3-mockups.html`): today pinned; three page 1 directions drawn on Cooper (A The Front Page, B The Panel, C The Ledger); the recommended sheets for Cooper and Mira, the phone view and mono copies; four AI options drawn as the top of sheet 1 plus "Ask this report"; the clinic AI layer; questions; 33 flow frames; the step change; briefs R-1 to R-11. Then a cold read (Dr. Chen), a product walkthrough (Jordan and Sam), and two adversarial passes (the cap).

## What the round found

- **"Too clinical" is style, not the safety rules.** None of the 81 honesty rules sets the look. The report renders in the system sans (Newsreader was never embedded), the wordmark outranks the pet's name, a hand-typed grey palette matches no app token, and eight block types share one 3px rule. Page 1 runs 814 to 1,955 words over 2 to 5 sheets; the first chart is on sheet 2; on a phone the fixed 794px page shrinks to about 6.6pt body text.
- **The words are hedges, not clinical facts** (Dr. Chen: "too wordy and too defensive"; the skeptical GP: "too lawyerly"). The app shows honesty with marks (ticks, hollows, hatch); the report spells it out in sentences.
- **AI.** Every clinical, data and clinic-software reader ranked model prose on the page last. The AI architect showed drafts that pass every number, date and verb check and still break all three founding hazards, because the hazards come from the kinds of facts a useful summary needs. What survives: AI arranging code-written lines under a rule-chosen lead (option B), and a vet-side "Ask this report" on a saved report (later). No human-health product found puts model prose on the clinician-facing page.
- **Clinic AI reads only visible text and the filename.** No hidden channel; text addressed to an AI reads as an injection. pypdf drops the digits from a Chromium print of today's report (comment on [CUL-1771](https://linear.app/projectnyx/issue/CUL-1771); phone path unverified).
- **The flow builds before it asks** (the window is revealed after generation), the two inline calendars fight, every change rebuilds, and nothing is kept: `vet_reports` has never held a row.

## Reviews of the mock

- **Cold read (Dr. Chen):** NOT READY on Cooper sheet 1, Mira and the phone; sheet 2 CLINIC-READY; the mono copy passes. All findings fixed.
- **Product walkthrough:** blocking findings on the composer, preview and send (intake decline unflagged, a suggested update window that cropped itching silently, an after-hours call prompt to a closed clinic, a bold "0 doses logged" reading as non-compliance). All fixed.
- **Adversarial pass 1: FAIL**, 12 findings (the staple washout clearing chicken, calm fills on refused days, the missing 30 in a row refusal run, a weight band that read as in range, question pointers that answered the owner, option B salience, the chronicity exemption's scope, and more). All fixed.
- **Adversarial pass 2 (the cap): FAIL**, seven quiet breaks, several introduced by pass 1's fixes (the feline lipidosis line removed, phone surfaces still printing "4 of 154", calm fills on Cooper's no-itch days, a false "no safety flag is live", a 7 day emergency window that hid flags, an update that dropped back-dated entries, a question pinned to a live flag). **Fixed after the cap and not re-reviewed**; the PR says so. Loud residuals carried: the confounded pre-Jun 8 comparison (now worded), the weight range formula (footnoted), the mono legend names.
- **Word count:** Cooper sheet 1 rose from 301 to about 376 as the reviews added guards back (the full chicken exposure, "Not tested", the Apoquel line). The ≤250 target is not met on this record; R-2 carries it.

## Decisions requested (R-1 to R-11 on CUL-2275, label Waiting on PM)

R-1 Principle 6, better than the rule · R-2 page 1 direction · R-3 who writes the words (reopened; team recommends code-written lines, AI arranging under a rule-chosen lead; dissent stated) · R-4 built for clinic AI · R-5 questions and gaps · R-6 the flow and saved reports · R-7 the vet link and Ask, later · R-8 v1 and v2 side by side · R-9 deleted entries (persona conflict) · R-10 photos on sheet 1 (persona conflict) · R-11 the itch chronicity exemption (persona conflict, spec §7.1).

## Filed

- [CUL-2275](https://linear.app/projectnyx/issue/CUL-2275) this discovery; [CUL-2277](https://linear.app/projectnyx/issue/CUL-2277) the PR's sub-issue.
- [CUL-2276](https://linear.app/projectnyx/issue/CUL-2276) today's text layer misleads a clinic AI on a refused trial ("NOT TRIGGERED" after its paragraph, "Trial 19 / 19", "unfinished" for 34 of 38 refused).
- Comments: [CUL-1771](https://linear.app/projectnyx/issue/CUL-1771) (pypdf digit drop and the phone probe), [CUL-283](https://linear.app/projectnyx/issue/CUL-283) (saved reports prerequisites: server-only writes; account deletion must fail hard).

## Limits

- Every reader except the July clinic is simulated. The renders are browser prints of fixtures, not phone prints of live data.
- No rival app was installed and no rival PDF generated ([CUL-1777](https://linear.app/projectnyx/issue/CUL-1777) is the hands-on pass).
- The fixes after adversarial pass 2 were not reviewed again (the cap).

### Next Session Kickoff

**Recommended first prompt:**
> Rule [CUL-2275](https://linear.app/projectnyx/issue/CUL-2275)'s briefs R-1 to R-11 from the round 3 mock, then set up a "Vet report v2" project with the run order the rulings imply. Read `docs/culprit-vet-report-v3-mockups.html` §11 first.

**Alternate prompts:**
- "Build [CUL-2276](https://linear.app/projectnyx/issue/CUL-2276): today's text layer misleads a clinic AI on a refused trial. Server only, `generate-report/render.ts`."
- "Export one vet report PDF from my phone and run the [CUL-1771](https://linear.app/projectnyx/issue/CUL-1771) probe: `pdffonts` plus pypdf, grep the flag lines for digits."
