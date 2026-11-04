# Vet report v2: publish the current privacy policy to getculprit.app

**Date:** 2026-11-04

Dispatched row for [CUL-2520](https://linear.app/projectnyx/issue/CUL-2520), branch `claude/vet-report-v2-adhoc-11040238` in both repos. The site change is [culprit-web#9](https://github.com/danieljmarkii/culprit-web/pull/9); this record rides the project-nyx PR.

## What shipped

`getculprit.app/privacy` still carried the July 19, 2026 policy. Since then `docs/legal/privacy-policy.md` on main gained two paragraphs and lost one sentence, and none of it had reached the site:

- **§2, the evaluation paragraph** (merged 2026-10-12, #1207): the app does not test its accuracy on owners' records. It was never published either; it rides this cut because it is main's text.
- **§3, "Vet report summary (separate permission)"** (#1376, with the withdrawal sentence from #1413): what is sent to Anthropic for the summary, what never is, and what taking back the yes does.
- **§3, removed:** "Vet report generation does not use AI at all", which the summary made false.

culprit-web#9 transcribes those verbatim into `src/pages/privacy.astro`, links "Veterinary Disclaimer" to `/disclaimer` as the source links it, and moves the effective date to November 4, 2026. No project-nyx policy edit was needed: the source keeps `[SET WHEN HOSTED]` and the site holds the date, as it did in July.

## How it was checked

`npm ci && npm run build` in culprit-web passes; that repo has no CI workflow and non-main branches do not build. The rendered `dist/privacy.html` was compared to the source block by block (every paragraph, list item and heading): all 73 body blocks match. The only differences are the source's fill-at-hosting placeholders (draft banner, title, effective date, operator name, the unprovisioned email provider's name), handled exactly as the July publish handled them.

## Left for the PM

- Merge culprit-web#9 (a merge to its main publishes the live site). If it merges after November 4, set the date to the merge day first.
- Two rulings, as decision briefs in the project-nyx PR: whether another pending policy change publishes in this cut, and whether the policy's change clause ("for material changes, tell you in the app before they take effect") requires in-app notice for this one.
- The project-nyx PR stays unmerged until the site is live, so CUL-2520 does not close early.
