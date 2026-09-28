# The per-incident read in tiers: EN-3 + EN-4 requirements

**Version:** 0.2 (discovery draft, PR-24; v0.2 folds in the adversarial pass, §13) · **Last Updated:** 2026-09-28
**Issues:** CUL-1133 (EN-3), CUL-1134 (EN-4); frames CUL-819 (a), CUL-531
**Project:** Engines v3: the accountable engine, Wave 4 (PR-24 → PR-25, PR-26, PR-27, PR-28, PR-30)
**Design authority:** `docs/culprit-incident-tiers-mockups.html` round 1 (https://claude.ai/artifact/Ug8BR3wCSgDVAgnZKmw3ao). Its own page; the Engines v3 mock (`docs/culprit-engines-v3-mockups.html`) is PR-20's.
**Status:** 🌱 living. Three PM rulings open (§9: K1 = PMD-14, K2, K3 = CUL-531). Every threshold in §7 is a placeholder for the ruling sheet (CUL-583) and the paid vet review (CUL-1312). Nothing here is built.

**Binds:** `clinical-guardrails` (all ten patterns), the critique's R-1 to R-5 (`docs/engines-v3-critique-2026-09.md`), E-6 as amended 9/26, the never-lower rule (CUL-1201 part 2).

---

## 0. TL;DR, plain English

The vomit and stool read stops saying one thing ("Worth a call") and says how soon: call your vet now, call today, part of a pattern Home is tracking, or keep an eye out with a specific list of what would change that. Old reads keep their old words forever, and the month never mixes the two. A new rule-based check runs on every vomit, photo or not, on the server, and it never re-sends a photo. Three things are yours to rule (§9).

---

## 1. Storage: an additive tier column

- A new nullable column (name fixed in PR-25's plan, e.g. `event_ai_analysis.tier`), CHECK-constrained to `call_now | call_today | logged | not_enough_to_say` (plus `pattern` only if K2 rules "stored"). Own PR, Migration Safety Pre-flight, R-5 privacy line.
- **Dual-write, every writer.** Under EN-F every write that sets `recommendation` also sets `tier`: the full write-back, the floor-only write, `buildRescueRead` / `buildFailureWrite`'s rescue, the cap branch and the partial-read collapse (which rewrites both columns). Mapping: `call_now`/`call_today` → `worth_a_call`; `logged` → `monitor`; `not_enough_to_say` → `not_enough_to_say`. A vomit with no photo read (photoless, unreadable, or not showing the subject) is never `logged`: it is `not_enough_to_say` in both columns, so an installed build never shows a calm "Keep an eye out" over a photo nothing read. `recommendation` never holds a new value (CUL-1277's binding condition on CUL-1133), so installed builds keep today's words and every shipped guard keeps working.
- **"Earlier rule" is decided by the rule-version stamp** (PR-10's `event_ai_analysis` stamp), never by a NULL tier. A NULL tier on a post-GA row is a writer bug, and readers show the max of the tier and the rank of `recommendation`, so a missed dual-write can never render calmer than the legacy column. Never back-filled; an old `worth_a_call` is never relabelled. `escalationSurvivesFailure` becomes tier-aware on the same max.
- **One order, one list.** `TIER_ORDER = call_now > call_today > {logged, not_enough_to_say}`, in an import-free module beside `lib/incidentVerdict.ts`. **Never-lower binds the call tiers only:** a legacy `worth_a_call` ranks as `call_today`, an unknown value as `call_now`. Movement between `logged` and `not_enough_to_say` is free in both directions, so a partial or unreadable read can still collapse an earlier calm read (B-203, CUL-812). `resolveReanalysisWrite` and the cap branch compare on it, so an escalation replacing an escalation never steps down (the PR-04b note on CUL-1133). `pattern` is not stored (K2) and is exempt by name.
- **The shown call is stored.** Each arrival of a call tier records the tier shown and when (`tier_shown_at` or a small log, PR-25's plan). A recompute may raise it; only the owner's own act lowers it, recorded as such (GAP-34). Deleting the row that caused a raise (lethargy logged on the wrong pet) is that act: the tier falls back to what the remaining rows give, with a record line ("Lowered at 10:02 AM because the lethargy log was deleted").

## 2. The tier-word map

One module holds every owner-facing word for a tier. A build guard fails on the literal "worth a call" (any case) outside it and outside legacy fixtures (WBC-1).

| Stored | Chip | Record action line | Spoken on landing | "read as" | Colour | A call in counts? |
|---|---|---|---|---|---|---|
| `call_now` | Call your vet now | Call your vet now. If they're closed, call an emergency clinic. | "{Pet}'s read: call your vet now." | read as call now | rose, filled; rose rail | yes, new-rule population |
| `call_today` | Call your vet today | Call your vet today. If they're closed, first thing tomorrow, or an emergency clinic tonight if {this pet's call-now signs}. | "{Pet}'s read: call your vet today." | read as call today | rose outline; rose rail | yes, new-rule population |
| pattern (render only, §11 K2) | Part of a pattern | Home is tracking {Pet}'s {sign}, and this one is part of it. Door: See what Home is tracking. | "{Pet}'s read: part of a pattern Home is tracking." | not used: History, the month and chart text use `logged`'s words | dashed pale rose | no |
| `logged` | Keep an eye out | The two-sentence watch-for list (§3). | "{Pet}'s read: keep an eye out. What would change that is below." | read as keep an eye out | grey | no |
| `not_enough_to_say` | Not enough to say yet | Today's copy plus the watch-for list (every photoless vomit with no call lands here). | "{Pet}'s read: not enough to say yet." | not read | grey | no |
| legacy `worth_a_call` | Worth a call | Today's words, unchanged | "{Pet}'s read: worth a call." | read as worth a call | rose, filled | earlier-rule population only |
| legacy `monitor` | Keep an eye out | Today's words | "{Pet}'s read: keep an eye out." | read as keep an eye out | grey | no |
| unknown | Worth a call | CUL-1277 fallback | "{Pet}'s read: worth a call." | read as worth a call | rose | yes |

Rules:
1. Every call names the service and resolves against the clock (GAP-13). "Now" appears on every call-now surface, the Home row and strip included. Late-day `call_today` becomes "first thing tomorrow", with the pet's call-now signs as the exception.
2. A call carries "What to tell them": time, what was seen, courses on board, from **enum fields only** (`blood_present`, `foreign_material_present`, `texture`, the counts, the course names the owner entered). Never `foreign_material_note`, `description` or `read_text`: those are model free text (the note is filled on "unsure" too, CUL-240) and Pattern 10 gates them.
3. No tier asserts wellness (Pattern 1). `logged` always carries its list and never comments on the absence of concern. The Pattern 8 regex runs over every template, the list sentences included.
4. Colour never carries a tier alone: `call_now` and `call_today` share the rose; fill against outline and the words differ (GAP-32).
5. Narrow rows (History, gallery) may use the short chip ("Call now", "Call today"); the accessible label is always the full phrase.

## 3. The watch-for list

- Two sentences, each with its own timeframe: "Call your vet now if … Call your vet today if …". For a dog, a third sentence first: "Go to your vet or an emergency clinic now if he retches with nothing coming up, or his belly looks swollen or tight. That can be bloat." (static until GAP-14's capture exists; never "GDV").
- **Generated from §7's rows**, never hand-written: each clause names a row, and a test runs the real floor for every clause's trigger and asserts the tier its sentence names (BRK-3).
- Only signs the engines hear (PMD-10): vomit logs, the `lethargy` leaf, a refused meal rating, a photo finding. The meal clause appears only for a pet whose meals are rated. Deadlines are named hours ("by 2 AM tomorrow"), never "since yesterday".
- An unknown birthday adds the young-animal clause (T7), whose window is 24 h. A pet on a critical drug or a course started in the last 14 days is already at call today (T20, T21), so its read is a call, not a list.
- Each clause names exactly what its row hears. "If you see her vomit twice more in the next 4 hours" (T2 counts witnessed onsets; found piles land on T4/T5a at call today). "Doesn't finish a meal by {time}" (T10c, shown only for a pet whose meals are rated). "Is low on energy before {time}" (T3's bound). "Vomits on each of the next two days" (T8). "You see blood" is advice whose row is heard only through a photo (T12/T13); the clause test drives it with a photo fixture and the copy never claims the app saw it.

## 4. Surfaces

Every surface that reads `recommendation` moves in PR-27 (`components/designV2/`), reading the tier through the map. The per-surface table is §03 of the mock and is normative. The fixed points:

- **Vet report: renders no tier** (GAP-27). CUL-1133's acceptance line "the vet report renders tiers" is corrected to this; the present-only blood and foreign-material line is unchanged. Tier-2 note in §8.
- **Get ready's Copy as text** carries dated facts only, never a tier word.
- **Ask** quotes the map's words; its model receives a one-line definition of each tier, never the raw value.
- **Home's safety band** shows `call_now` / `call_today` rows (visual today; contextual only under K1 A). `pattern` and `logged` add no Home row.
- **Month:** call tiers paint the day; the legend counts each rule population on its own line (§5).
- **"Part of a pattern"** appears only on the record and the Signal screen's gallery, and only on a `logged` read that is in the live finding's evidence set. It never appears in History, the month, chart text, the shown-tier log, or on a `not_enough_to_say` or call read.
- **Notifications:** none (PR-36 decides any push).

## 5. The GA day

- Old reads keep their words; the record adds one meta line: "Read under the earlier rule, before {date}."
- The first tiered read of a pet that already has an earlier-rule read carries one line: "New since {date}: reads say how soon to call. {Pet}'s earlier reads keep the words they had." Decided from the record, no device key.
- The month never adds the two populations: "Before {date}, read as worth a call · N days" and "From {date}, read as call now or call today · M days", and a seam mark on the date. A month on one side shows one line.
- Nothing about the change reaches Home, a notification, motion or a haptic.
- Installed builds (1.2.0) read only `recommendation`, so they show today's words for every new read.
- A Re-run, a replaced photo, an Ask live read or the floor's 24 h re-run can give an old read a tier; it keeps or raises a call, never lowers it, and the read then carries the new rule's stamp.

## 6. PMD-14 and the raised-later read

Recommended (K1 A):
1. A contextual `call_now` / `call_today` joins Home's safety band beside the visual red flag (the `incident_red_flag` lane gains a contextual source; ranking unchanged: safety first).
2. A photoless vomit whose floor returns `call_now` routes to its record, as a photographed one does. `call_today` stays on the completion path.
3. A log that raises an earlier read says so on its own completion ("Her 7:02 AM vomit read is now: call your vet now. Open the read"), and that card holds while a call is on it (C-21 dwell pause).
4. A tier changed after it was shown carries a record-fact line: "Raised from keep an eye out at 9:15 AM, because lethargy was logged."

Tier-2 edit it needs (drafted, awaiting approval): `docs/nyx-incident-screen-requirements.md` D2 gains "…and a photoless vomit whose rule-based check returns call now"; G3's "an escalation that lands after they leave is the Signal's acute card's job" gains "and is said once on the completion of the log that raised it". D2's premise that the Signal handles photoless escalations is recorded as false (critique PMD-14).

## 7. The sign-to-tier table (for CUL-583 and CUL-1312)

"vs today" compares with the shipped single "Worth a call". **Louder** rows are adopted provisionally (E-6). **Quieter** rows need harness proof (PR-16: no injected red flag below its shipped tier), PM sign-off and the vet review; until then today's louder row stands. Where two shipped or drafted tables disagree, the louder row stands. ★ = contested; ⏸ = held.

| # | Sign | Who | Window | Proposed | Today | vs today | For the vet |
|---|---|---|---|---|---|---|---|
| T1 | 3 witnessed vomits logged | all | 30 min | call now | worth a call | louder | merge gap |
| T2 | 3 witnessed vomits in a span containing this one | all | ~4 h | call now | worth a call (2 in 4 h) | louder | span |
| T3 ★ | vomiting + lethargy logged | all | 24 h before to a fixed bound after | call now | worth a call; Noticed door: call today | louder | BRK-3; the door moves up to match. A bound after the vomit shorter than today's reach (lethargy up to ~24 h after, on a late read) is **quieter** there (TD-2) |
| T4 ★ | 3 vomits in 24 h (found piles count) | adult cat, dog | 24 h | call today | worth a call | same | cats: today or now |
| T5a ★ | 2 vomits **logged** within 4 h, any confidence, merged or not | adult cat, species other | 4 h | call today (today's row stands) | worth a call | same | EN-4 draft = keep an eye out: **quieter**, gated |
| T5c ★ | EN-4's counting: a 30-min merge of witnessed logs; found piles never onsets | all | — | two logs 10 min apart = one onset; witnessed + found in 4 h = no T5a | worth a call | **quieter** | gated; until it passes T5a counts logs. Estimated and unclassified logs count as onsets |
| T5b | 2 vomits in 24 h, >4 h apart | adult cat | 24 h | keep an eye out, toward the pattern | nothing | same | confirm |
| T6 ★ | 2 vomits in 24 h | dog | 24 h | call today (Noticed door) | worth a call if within 4 h | louder | EN-4 draft said logged |
| T7 | 2 vomits in 24 h, <6 months or no birthday | all | 24 h | call today | worth a call if within 4 h | louder | age cut |
| T8 | vomiting 3 days running | all | 3 days | call today | nothing unless 3 in 24 h | louder | 2 or 3 days (GAP-5) |
| T9 | another vomit while a call today is open | all | while open | call now | another worth a call | louder | how long "open" lasts (GAP-33) |
| T10 ★ | vomit + observed refusal (the shipped Noticed predicate: 2 of the last 3 qualifying meals refused or picked) or EN-5 "No" | cat | 3 days | call today | worth a call on T10c's test | **quieter** (it replaces T10c) | GAP-28: one predicate; gated |
| T10c | today's arm: a cat whose owner rates meals, no meal rated most or all in 24 h, and a vomit | cat | 24 h | call today (stands until T10 passes; the union of both fires) | worth a call | same | Pattern 6 guard kept |
| T10b ★ | the same | dog | 24 h | call today if no food 24 h (Noticed door) | nothing | louder | does the rung cover dogs |
| T11 ⏸ | retching, nothing produced / swollen belly | dog | — | go now (emergency) | nothing | louder | held for capture (GAP-14); size, kennel cough |
| T12 | photo: digested (coffee-ground) blood | all | — | call now | worth a call | louder | confirm |
| T13 ★ | photo: fresh red blood | all | — | call now | worth a call | louder | a streak vs a lot |
| T14 ★ | photo: foreign material present | all | — | call today; string in a cat: call now | worth a call | same | toy fragment in a bright dog |
| T15 | photo: blood-like colour, blood unsure | all | — | call today | keep an eye out | louder | needs a presence field (GAP-31) |
| T16 | photo: possible worms | all | — | call today (single-incident rung) | model's own call only | louder | or "mention at next visit" |
| T17 ★ | photo: tablet or pill | all | — | call today; critical drug: call now | model's own call only | louder | needs T20's list |
| T18 ★ | photo: plant material | cat | — | call now if a lily is possible, else call today | model's own call only | louder | lily question wording |
| T19 | model's own escalation, no field | all | — | call today, words kept, counted separately | worth a call | same | interim (GAP-31) |
| T20 | critical drug on board + any vomit | all | — | call today | nothing | louder | the curated list (GAP-7) |
| T21 | course started ≤14 days + vomiting | all | 14 d | call today | nothing | louder | window |
| T22 ★ | known condition + vomit | all | — | one rung up, or none | nothing | louder | which conditions, if any |
| T23 ★ | normal stool after a recent vomit | all | 24 h | no call from the stool (EN-7) | worth a call ("loose stool") | **quieter** | removes a false sentence; still gated |
| S1 | loose stool + any vomit in 24 h | all | 24 h | call today | worth a call | same | confirm |
| S2 | 2 loose stools in 24 h | all | 24 h | call today | worth a call | same | confirm |
| S3 | a stool + lethargy | all | 24 h | call today | worth a call | same | call now, to match T3? |
| S4 | stool photo: blood present | all | — | call today | worth a call | same | fresh vs dark |
| S5 | stool photo: foreign material present | all | — | call today | worth a call | same | confirm |
| T25 | cough beside vomiting | all | — | no discount; shipped disclosure | disclosure | same | breathing arm (GAP-29) |
| T26 | species "other" | other | — | the count rungs (T1, T2, T4, T5a, T8, T9), T3, every all-species photo row (T12–T19) and S1–S5 | today's rules without the cat intake arm | same | R-4 |
| T27 | ≥4 vomits in 7 days, no earlier week | all | 7 d | burden card on Home (CUL-1311), not a read tier | nothing | louder | the count; live before PR-28 |

`lib/lookEmergency.ts` (the Noticed door) reads the same table in PR-28, so its rows move to match T3 and stay matched by test.

## 8. EN-4's floor: where it runs

1. **One pure rule**, import-free and copy-free, beside `lib/incidentVerdict.ts` (C-26: Edge Functions import it without pulling client copy). Input: settled rows (vomit onsets marked witnessed or found, lethargy, meal ratings, EN-5 answers), species, age, courses, conditions, tiers already shown. Output: tier, reason class, counts.
2. **Authoritative home: the server.** A floor-only mode of the shared pipeline (`_shared/incident-analysis.ts`), exposed as a request mode on `analyze-vomit` or a small sibling (PR-28's plan decides). Reads the settled record with the caller's JWT, computes context flags and the tier, writes read fields only through `resolveReanalysisWrite`. **Never downloads from Storage, never calls the model, never spends a cap unit.** Deno test: a fake client whose `storage.download` and model call throw; the floor path completes and writes. A registered-sink scan keeps it on the three sanctioned writers (Pattern 7's hide rule).
3. **Triggers:** insert of a vomit, a lethargy log or a meal; a later meal rating; edit or soft delete of any of those. A delete re-floors and still never lowers a shown tier.
4. **Durable marker:** a local queue row written in the same local transaction as the event; its DDL in a schema constant and the table in `LOCAL_WIPE_TABLES` (hydration test). Drains through `serializeQueuePush` only after the event's own push has landed; marks the version it sent (C-23, C-24). Survives an app kill; offline it waits.
5. **Offline:** the phone runs the same rule over local SQLite and shows the tier on the completion card and the record with one line ("Worked out on this phone. It's saved when {Pet}'s record syncs."). Never on History, the month or Home's band. The tier shown rides the marker as a **device claim** with its rule version and the row ids it read. The server adopts it as the floor only if it reproduces that tier from those rows under its own rule; otherwise it stores its own tier and the record discloses "Shown on this phone as call now at 3:14 AM" beside it. A client can never write a tier the server's rule does not give.
6. **The 24-hour re-run:** a lethargy log or a refusal re-floors every vomit of the same pet in the prior 24 hours. Photo findings come from each stored row's structured fields (Pattern 9). **It never downloads a photo, never calls the model, never regenerates model text, never spends a cap unit.** A raised read's words are the context template for its new reason.
7. **One arrival per bout** (GAP-33): when a re-run raises several reads of one bout, only the most recent carries the arrival, the announcement and Home's row. **A stored tier arrives only when it is above the tier the phone already showed** for that read, so an offline preview is never announced twice.
8. **Never lower a shown tier.** Proven by mutation: remove the guard and "call today at 8:00, a meal rated All at 12:00" goes red.
9. **Counting:** T1/T2 count witnessed, estimated and unclassified onsets in a span containing this vomit and two others; merged within 30 minutes of the first, non-chaining; found piles count toward 24 h, dated by discovery. The merge and the found-pile exclusion are quieter than today for two logs in 4 h (T5c), so until T5c passes T5a counts raw logs. A second, differently named predicate beside `lib/symptomEpisodes.ts`, registered under C-34; copy says "vomits logged", never "episodes" (GAP-10).
10. **Behind EN-F.** Flag-off never runs the floor-only path; a rollback never lowers a tier written under the flag (R-1).
11. **Known limits, stated where the tier shows:** a found pile in a two-cat home goes to the pet on screen (CUL-807); species "other" runs count rungs only; an unknown birthday prints the young-animal line.

Acceptance (PR-28): `incidentReplay.deno.ts` replays the record as an event stream, proven by deleting the bout latch; property tests for the photoless triple, the found pair, the late-logged found vomit, the lethargy re-run (asserting zero Storage and model calls), and the GDV dog (only once GAP-14 exists; until then its test asserts the static line).

## 9. EN-5's question

- Lives on the record under the read, no time limit, until answered. Never announced; a heading and a radio group ("1 of 4"). Answered state folds to "You said: … · Change".
- **Cat, meal-fed:** "Has {Pet} eaten a meal since {6 PM yesterday}?" Yes, ate well · A little · No · Not sure.
- **Free-fed or shared bowl:** "Did you see {Pet} eat since {6 PM yesterday}?" Yes · No, she wouldn't · Didn't see. "Didn't see" and no answer store **intake not observable**, never "normally". Wording to CUL-583.
- **Dogs, and any pet on a running trial:** "Could {Pet} have eaten something else?" (trial: "…something off her {protein} trial?") Yes · No · Not sure. Yes opens the off-diet capture as a door; the record never holds a form.
- An answer only adds evidence: "No" can raise (T10, T10c); "Yes, ate well" counts as a positive-intake meal for later computation, exactly as a rated meal does today, and never lowers a shown call. "A little" maps as a `some` rating (to confirm with CUL-583). The storage shape must not push real refusals out of the last-three window (CUL-1118).
- The answer is an input to the one intake predicate, moved to an import-free module both the app and `analyze-vomit` import (GAP-28). Its storage shape is D2's (CUL-1118).

## 10. CUL-819 and CUL-531

- **CUL-819 (a), ruled:** a rescued call keeps its card and adds "Reading the new photo didn't finish. The call above is from the earlier read at {time}. Try again", and the observations are labelled "From the earlier photo". Spoken as one announcement with the call. Needs CUL-816 first.
- **CUL-531 (K3):** recommended C, scope the observation: "Blood: none visible in the 2 photos read" + "1 photo couldn't be opened".

## 11. Open rulings (PM)

- **K1 · PMD-14:** A (recommended) or B. §6. Gates PR-28 and PR-30.
- **K2 · "Part of a pattern":** drawn at render from a live Home finding on the same sign (recommended; a better-than-the-rule brief against D1's stored fourth tier) or stored. Gates PR-25.
- **K3 · CUL-531:** C (recommended), A or B.

## 12. Tier-2 edits this implies (awaiting approval, not written)

- `docs/nyx-incident-screen-requirements.md` D2 and G3 (only under K1 A), §6 above.
- `docs/nyx-vet-report-requirements.md`: one line that the report renders no per-incident tier.
- `.claude/skills/clinical-guardrails/SKILL.md` Patterns 1 and 2: rewritten in PR-26 (the tier column, the order, the model's own call → call today, the never-lower rule), not here.

## 13. v0.2: what the adversarial pass changed (2026-09-28)

Verdict on v0.1: FAIL, six rows showed an owner something calmer than today without a "quieter" mark. Fixed here and on the mock:
1. T10 (the Noticed predicate) is quieter than today's feline arm; today's arm stays as T10c and fires in union until T10 passes.
2. T26 (species other) keeps T3, the photo rows, T5a and the stool rows.
3. The counting refinements (30-min merge, found piles not onsets) are a quieter row, T5c; estimated and unclassified logs count as onsets.
4. Stool rows S1–S5 added (T24 folded into S1).
5. Every EN-F writer sets `tier`; readers show the max of both columns; "earlier rule" comes from the rule-version stamp.
6. A photoless or unread vomit is `not_enough_to_say` in both columns, never `logged`.
7. Never-lower binds call tiers only; `logged` ↔ `not_enough_to_say` is free, and the collapse rewrites both columns.
8. K2's render-time pattern is limited to `logged` reads in the finding's evidence set and kept off History, the month, chart text and the shown-tier log.
9. Watch-for clauses rewritten to the rows they name.
10. The phone's shown tier is a device claim the server must reproduce.
11. A stored tier arrives only above the tier already shown.
12. "What to tell them" reads enum fields only.
13. T3's bound marked quieter where shorter than today's reach; the 24 h re-run named as a fourth path.

Held: escalation over escalation never steps down; the re-run makes no Storage or model call; the report renders no tier; EN-5's "Didn't see" is never normal intake.
