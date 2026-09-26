# Design v2 on the phone: the PM's first device reactions

**Date:** 2026-09-26

The PM installed the Design v2 build and used it on a real day. The session opened on six reactions. It fixed the two defects among them and turned the other four into a mock round with decision briefs. Shipped via #922.

## The reactions, and where each went

| # | Reaction | Outcome |
|---|---|---|
| 1 | The Signal's screens are beautiful and hard to reach; less Signal on Home, more affordance toward the screens | Mock round 1, §01, brief D1 (CUL-1270, new) |
| 1a | Some vomit previews on the Signal screen are grey boxes | **Fixed** (CUL-1269, new) |
| 2 | Tapping an event in the calendar's day panel does nothing | **Fixed** (CUL-320, the July B-315 prediction, pulled into Design v2) |
| 3 | Two signals open the same detail card | Diagnosed; mock §02, brief D2 (on CUL-1270) |
| 4 | Signals are text heavy | Same fix as #1 |
| 5 | The FAB teal is drab; maybe the Culprit indigo | Mock §05, briefs D3 and D4 (CUL-322) |
| 6 | Make the FAB interaction world class | Mock §06 with a live hold-and-slide demo, brief D5 (CUL-322) |

## What was built

**CUL-1269: the gallery tiles.** `EpisodeGallery`'s tile trusted any non-empty `local_uri`. iOS evicts the image-picker cache, so an evicted path rendered blank and never reached a signed URL. A failed transform had no fallback, and signing errors were swallowed. The tile now mirrors the record screen (B-207):
- `localFileExists` moved from `app/event/[id].tsx` to `lib/localFile.ts`, now shared by both surfaces.
- The transform and the raw original are signed together.
- `lib/tilePhoto.ts` `resolveTilePhoto` walks local → transform → raw, skipping any source whose `<Image>` fired `onError`.
- When every source fails, the tile says "Photo didn't load" and remains a door to the record.

Tests were run red against the old tile (all five cases).

**CUL-320: the month's day rows.** `MonthInstrument`'s `DaySlot` rows are `Pressable` doors to `/event/[id]`: 44pt, flush, no hitSlop (C-5), with a chevron and press feedback on the panel's ground. `describeDayEventDoors` (`lib/dayEvents.ts`) carries the id the `TimelineRow` already had. The flag-off `DayEventsSheet` is untouched. The test asserts tappability through `owningTouchable` (C-6) and counts the push; it was red on the old panel.

## The diagnosis behind #3

Nyx's live `ai_signals` payload (generated 2026-09-26 01:11 UTC) holds four findings with four distinct fold identities:
- `incident_red_flag:vomit`
- `symptom_chronicity:vomit` (56 days)
- `symptom_chronicity:cough`
- `postprandial_timing:vomit` (60 days)

Every door routes to its own finding, so this is not CUL-1213's collision. The two vomiting findings still render near-identical screens. `signalTitle` names the symptom and window ("Vomiting, the last 8 weeks" / "Vomiting, the last 60 days"), and `buildSignalScreenModel` draws both the same weekly bars and gallery from `readSignalEpisodes(pet, 'vomit')`. The fix is a title that names the claim and a first chart that is the finding's own evidence (D2).

## The mock

`docs/culprit-design-v2-device-mockups.html`, published at https://claude.ai/artifact/JpCk6GVspMvirBAT4Jgd7R. It carries five briefs, each with a recommendation:
- **D1:** B, headline + ask + chevron on every card, a small chart on insight cards, the disclaimer once per zone.
- **D2:** titles name the claim.
- **D3:** an indigo disc with a bright-teal plus, 6.57:1 and 14.3:1. This is a better-than-the-rule brief against in-app brand rule 3 (2026-07-10).
- **D4:** park indigo as the app-wide action colour until the FAB is judged on device.
- **D5:** ship the fan and springs first; hold-and-slide goes in its own PR after a device test.

## Reviews

The `code-reviewer` found no bugs. Its three cleanups rode the PR: a direct test for `localFileExists` including the `content://` branch, a direct test for `describeDayEventDoors`, and no wasted reset render on tile mount. No clinical or statistical logic changed, so no adversarial pass was needed. The mock's Home copy keeps every safety ask in words on Home (clinical-guardrails; S1), and the Home line is to be composed from finding fields, never by truncating the server sentence.

## Validation

`tsc --noEmit` clean. Full jest before review: 519 suites, 11,695 passed. After the review fixes, the affected suites (353 tests) and the guard and constants suites (668 tests) passed.

## The rulings (same day)

The PM ruled D1 B, D2 (a), D3 C, D4 park and D5 (a). The mock was republished as the single ruled proposal: the options not chosen left the page, and commit 2460a58 keeps them. The build issues:
- **CUL-1270:** the Signal on Home and the claim titles, under `design_v2`. The S1 wording edit rides its PR.
- **CUL-322:** the indigo FAB with the teal plus, and the fan choreography, closing BRK-37. The brand rule-3 exception rides its PR.
- **CUL-1278:** hold-and-slide, after CUL-322 and a device test.
- **CUL-1279:** indigo as the app-wide action colour, parked until the FAB has been judged on a phone.
