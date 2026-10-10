# Engines v3 PR-27o: "Part of a pattern" on a calm read in a live finding's evidence

**Date:** 2026-10-10
**One thing:** none — dispatched session, not this round's teach row

Shipped via #1149 (CUL-1515). Dispatched by `/dispatch`, BUILD mode, on `claude/engines-v3-pr27o-10101213`. The issue was the build note. The session stopped once, for about ten minutes, because the record's half needed `VomitAnalysisSection` / `StoolAnalysisSection` while PR-27n (#1145) still held them. It resumed when #1145 merged.

## What shipped

- **`lib/incidentPattern.ts` (new): the words and one membership predicate.**
  - A finding carries no event ids, so its evidence set is the episodes the Signal screen draws for it.
  - The record runs the same `loadSignalScreen` and looks for its own row (bout re-logs included). The record and the gallery therefore count one population (C-4), and every gate the screen keeps applies to the record too.
  - Each finding is asked on its own. Any failure returns null, which leaves "Keep an eye out".
- **`lib/signalScreen.ts`:**
  - The episodes carry `tracksPattern` from `findingTracksPattern`, an exhaustive allowlist.
  - Allowed: worsening, burden, chronicity, a flat reflection, and a trial pair that is not falling.
  - Never: an improving reflection, a falling trial pair, timing findings, a correlation, a photo red flag, intake decline, or the stood-down line.
- **Gallery (`EpisodeGallery`):** a new-rule `logged` tile under a tracked finding says "Part of a pattern" in the secondary ink, never the rose. Earlier-rule `monitor` keeps CUL-1233's silence.
- **Record:**
  - The `IncidentReadCard` `pattern` frame: dashed pale rose border and rail, the line "Home is tracking {Pet}'s {sign}, and this one is part of it.", and one door, "See what Home is tracking". The watch-for list stays under it, and a call ignores the frame.
  - Both sections ask through `hooks/usePatternMembership.ts`. They also ask while a read is in flight, so the landing is spoken as "{Pet}'s read: part of a pattern Home is tracking." (mock §04) and never as "keep an eye out" first. The stool section asks with `diarrhea`, the only stool sign a finding counts. A `stool_normal` record never matches by row.
- **Deploys and visibility:**
  - The words live outside `lib/incidentTierWords.ts`, which is in Ask's closure (C-26), so no Edge Function redeploys.
  - Dark until `engines_v3_en3` is seeded (CUL-1407): nothing stamps a `logged` read before then.

## Decisions (team calls, logged on CUL-1515)

- **Which findings count as "tracking".** The adversarial pass failed the first cut, which counted every live finding but the stood-down line.
  - A fresh vomit was framed as "part of" an improving reflection, and its only door opened a screen saying vomiting is down (n=1 never reassures).
  - A timing finding took every vomit in the drawn weeks as its evidence, against spec §4.
  - Both fixes fail toward the shipped "Keep an eye out", so they were applied, not filed.
- **A Signal regenerated while the record stays open** is picked up on the next open, not live. This blind spot is stated in the hook, and it errs louder.

## Falsification attempts

- **Mutation:** making `findingTracksPattern` always true turns 2 tests red.
- **Mutation:** dropping the in-flight ask turns the landing-speech test red.
- **Adversarial-reviewer, round 1:**
  - Held: a call, a held call, a louder phone floor, a re-run in flight, `not_enough_to_say` and `monitor` never take the word. Hide and a re-read that lands as a call clear the mark. Record-pet scoping holds.
  - Failed, fixed above: the improving reflection, the timing finding, a stale comment, the single try/catch, and unkeyed hook state.
- **Adversarial-reviewer, round 2: PASS.**
  - Held: an improving reflection and a falling trial pair mark nothing, and neither does a postprandial finding with a 3am fasting vomit.
  - Marked, and should be: a flat diarrhea reflection on a stool record, and a rising trial pair over in-trial episodes.
  - A higher-ranked finding that throws no longer hides a lower one that matches.
  - A reused screen never carries one record's finding to another.
  - One residual, documented in `findingTracksPattern`: a 7-day burden drawn over two weeks over-includes, on the louder side.

## Residuals

- A burden finding's drawn weeks are wider than its own window, so the mark over-includes on the louder side. This is documented, not clipped.
- `lib/incidentTierWords.ts`'s header still says the pattern "lands with the finding's evidence set, and until then a logged read says Keep an eye out". It is left alone because an edit there redeploys Ask.
- Should an insight-class flat reflection count as "tracking"? Today it does: its bars are its evidence. Raised on CUL-1515 for the PM's eye, not blocking.
