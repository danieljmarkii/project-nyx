# Home v1 — the Signal fold aligned and filed; Home v2 fed into the spike (CUL-695)

**Date:** 2026-09-03

Shipped via **#795** (draft). Mode: **DISCOVERY** (spec + mock + tracking; no app code). Branch `claude/home-signals-redesign-v5kivp`.

## What this was

The PM brought dogfood feedback from two real daily users — themselves and their spouse:

> "the 'signals' section of 'home' is overwhelmingly large and it doesn't rotate through data well enough to justify it's continued prominent existence. It's like.. every-time I open the app I'm beat w/ a massive message." · "there can be no more than 3 'slots' on the 'home' page. That was then.. but lets revisit some of those assumptions." · "my wife … called the 'home' experience 'boring'. … the data that 'signals' is presenting is genuinely useful … But the challenge is that the signals change relatively infrequently."

And a phasing: **v1 = the minimize/expand, rolled out to all accounts, kicked off now; v2 = the broader re-imagination**, with the persona team interviewed, the Designer weighing in, and competitive research done. The session's job: align v1, track it in Linear so it can start, and feed v2.

## What already existed (found, not re-derived)

- **CUL-695 "The Living Signal"** (2026-08-29, PR #736 unmerged): the same complaint, seven directions F2–F7, rulings D1–D5 on `Waiting on PM`. The PM's minimize idea is **F3 "Seen & fold"**. D1 — *may a safety card fold?* — was the round's one recorded Designer↔Dr. Chen conflict.
- **Home Redesign — Conference Spike** (2026-08-31, PR #789 unmerged): the v2 container; two research briefs done (CUL-773/774), D1–D4 rulings pending (CUL-775), mock round 1 (CUL-776) gated on them.
- **The fact that made D1 load-bearing:** Nyx's lead card is the *safety* card (`symptom_chronicity`, rank 0 since ~Jul 20) while the weekly counts fell 4·6·8·4·4·4·4 → 2·0·1·1. A benign-only fold would not fix the PM's own screen.

## How the interviews were run

Five isolated subagents, no build-conversation anchoring, each given the PM's feedback verbatim, the prior discovery, the research, and the Home code as built (`app/(tabs)/index.tsx`, `SignalZone`, `InsightCard`, the strips) — writing only to the scratchpad, never the repo (clean tree confirmed after each). Four persona interviews (Jordan, Sam, Dr. Chen, the Designer) and one research sweep (74 web calls). The full texts sit in the session scratchpad; what follows is what each said that changed the outcome.

**Jordan (diet-trial dog owner).** Week 1 the eye went to the Signal; week 5 it skips it "like a cookie banner" and lands on the three things that can move (the trial day count, the Trend bars, the Today line). The strip must keep the rail, a short name, the count, and on the safety card the four-word ask. Control = "a small explicit text button", never a bare tap (already spent) and never a swipe ("in every other app a swipe on a card means delete… I'd genuinely worry I'd deleted the vet thing, one-handed, at 3am"). Persist, or "it isn't a fold, it's a snooze, and I'll stop bothering by day three." Re-open only when *he* did something; "if it changed because time passed, leave it." On the safety card: day one, fine; day thirty with a visit booked, "a smoke alarm with a low battery." And the line that moved Dr. Chen: if the only way to shrink the card is to state an action, "give me 'Not yet' as an honest option. Otherwise I'll tap 'Visit booked' when I haven't… and now the record is lying." Closing: "the fold doesn't fix your complaint… a fold with nothing new underneath is a smaller version of boring."

**Sam (grazing-cat owner).** "Boring" is the screen not answering the question she opened it with: 7am *what happened while I wasn't looking*; 9pm *is today worse than the run, and can I sleep* — both about change and recency; the card answers "what has been true since July." Sharper: the giant card is about the improving thing (vomit) and Home is silent about the frightening one (intake) — the Trend's "Food · 5 of 7 days" counts her *logging*; the free-choice bowl in `feeding_arrangements` is read by no Home component; S8 is unbuilt. Strip must keep rail, symptom, count + span, the three-word ask, and recency ("last logged…"). Re-open on a new episode of the same symptom, a tier change, a new finding of another type (as its own card); never on a count aging out, the regen, or a missed meal (its own finding). On the stand-down: "a card that vanishes tells me less than a card that folds." "The card is right; its *tense* is wrong."

**Dr. Chen.** "Both halves are true. The card is right… And the card has stopped working." Habituation is a clinical finding; a safety card nobody reads protects nobody; visibly ignoring the Trend bars costs credibility, and lost credibility on a safety card is a safety cost. **D1: moved from (b) to a conditioned (c)** — "a strip that keeps the ask is the same escalation at a size an owner can live beside"; what moved him was Jordan's false-"Booked" confession and the detector's own calibration (`ongoingRecencyDays` = 14: an ongoing course produces its next episode inside the floor or the engine stops calling it ongoing — "the detector is already the timer"). Conditions: rail at full opacity, the symptom, the ask verb, the count with span, the **date** of the last episode (never a counter); the explicit expanded-state control; re-open on a new same-symptom episode, a tier change, the cough↔vomit adjacency turning on, a re-fire after standing down; **no time-based re-open**; ranking never moves; a vetoed vocabulary. Two engine findings: `detectReflections` returns `[]` whenever any symptom is chronic (so the counted 2-vs-12 must live *inside* the safety card, not as a second calm card — F2 re-shaped), and the wordless stand-down is "reassurance-by-absence wearing an honesty costume" (the labeled stand-down line, verbatim, with four conditions). Falsification: the refusing cat, the owner who never books, improving-then-relapsing — all held once release-on-absence is in; the count-drifts-down residual accepted provided it never animates.

**Designer.** The diagnosis in one line: *size encodes rank here; in every daily-open product size encodes novelty.* Three things stack — habituation, the wrong half of Principle 3's question, no acknowledgment register. Build-ready anatomy (rail · clause `textSM`/`weightMedium` · `sampleLine` count line `textXS` · the strip chevron; `minHeight 44`; ~52pt), the three states, **the control in the expanded state only as a sibling of the row `Pressable`** ("you fold what you have opened" — a stated acknowledgment by construction), the per-type clause table, D1 = (b′) by class (standing folds, acute never), a per-type material-fingerprint proposal, the "Back because" cue, a11y, the edge states (all folded = label + strips + doorway, no zone line; the canvas never inherited). For v2: three directions — **A "The Register"**, **B "Since you last looked"** (Change → Cadence → Standing; recommended lead), **C "The Briefing"** — and the slot cap replaced by a height-and-register budget.

**Research** (`docs/research/2026-09-home-insight-fold-and-freshness-patterns.md`): an 11-pattern taxonomy; every reversible hide in 16 products has a named home while hidden; **no consumer product re-opens a hidden item on a change in the data** — the fold's re-open is the latching-alarm pattern (IEC 60601-1-8, Dexcom, the OBD lamp) imported into consumer software: *acknowledge silences the modality; the condition governs the state; the policy is not the user's to set.* Habituation is measured, fast, positional. The pet category still documents no collapse/dismiss on an insight card.

## The ruling set (spec §0)

DF-1 all accounts, no flag · **DF-2 standing safety cards fold to the conditioned strip, acute never — both lenses agree; PM ratifies (gates PR 2 only)** · DF-3 the expanded-state control (PM-vetoable; the face placement drawn) · DF-4 client-side material change in v1, server token as the v2 migration (PM decision; does not block PR 1) · DF-5 no clock · DF-6 device-local, wiped by name · DF-7 order is rank, canvas not inherited · DF-8 the Back-because cue · DF-9 the v1.1 follow-ups.

**The process note worth keeping (now in CLAUDE.md v1.30):** a persona conflict recorded as "PM decision needed" was closed by re-interviewing both lenses in isolation against the built screen and each other's evidence — both moved — leaving the PM a ratification instead of a tie-break.

## Deliverables

- `docs/nyx-signal-fold-requirements.md` v1.0 (build-ready for PR 1; PR 2 gated on DF-2).
- `docs/culprit-home-signal-fold-mockups.html` round 1 — eight frames on Nyx's record + three briefs; artifact `https://claude.ai/code/artifact/1f968b54-e1ba-4aab-a7e0-afe7701417e1` (a current-proposal page split from the exploratory Living-Signal page, per the 2026-08-15 rule; same-URL republish from here).
- `docs/research/2026-09-home-insight-fold-and-freshness-patterns.md` 🧊 + README row.
- `CLAUDE.md` v1.30 (Read-These row; v1.27 archived).
- **Linear:** CUL-695 description (the 2026-09-03 update + narrowed rulings) + the convening-record comment + the artifact link; **CUL-784** (PR 1, ready), **CUL-785** (PR 2, blocked by CUL-695's DF-2), **CUL-786** (v1.1-a labeled stand-down), **CUL-787** (v1.1-b the 4-week compare inside the safety card); the Home spike's project document *"Home v2 — the dogfood read, four interviews, three directions (2026-09-03)"* + a CUL-775 comment refining D3 (draw A/B/C side by side, B leads; the slot cap → a height-and-register budget) and D4 (the fold lands first and independently).

## Decisions made this session

None PM-ratified — by design. The lenses closed D1 among themselves; DF-2 / DF-3 / DF-4 are teed as briefs. One provisional call, labeled: the spec follows the Designer's control placement (expanded state) over the owners' face-placement ask, with the alternative drawn.

## Residuals / known gaps

- PR #736 and #789 are still unmerged drafts; nothing here depends on them (this mock is its own page; the research brief is a delta and cites theirs as `[prior brief]`).
- The research agent flagged a CompanAIn release-notes discrepancy between the 2026-08-31 and 2026-09-03 iTunes reads at the same version — re-verify before citing either (brief §8).
- The artifact wake subscription could not be registered from this session (the service refused a session credential); the page is published and linked, just not watched.
- Fold state is not synced across devices (DF-6, accepted); CUL-629's `New` carrier stays parked on the engine's finding-set memory.

## Next

PR 1 (CUL-784) can start now. The PM's three answers — DF-2, DF-3, DF-4 — and CUL-775 D1–D4 are the only gates. Kickoff prompts are in the session summary.

---

## Part 2 — the PM's reactions, applied (same day)

The PM reacted to round 1 within the session:

> "as these cards are expanding and contracting .. lets add some design delight. Not sure what that looks like. But lets make it happen" · "F5. I like this one. Keeping the dismiss controls at the top level. I think this is also df3." · "F6. I like this to an extent. But lets not make this v1." · "DF2. I think the acute card should collapse too." · "df4. Im fine w the recommendation of a" · "If theres anything we can di to improve the design of the cards lets explore those options" · "i think we have some issues in linear. But lets add that to a project and i want a cul by cul (pr by pr) plan for how to run this added to the project description"

**Rulings applied (spec → v1.1):**
- **DF-2:** every safety card folds, **the acute class included** — the lenses' class line overridden. The concern was stated once (an intake-decline card is the 48-hour window for a cat; Dr. Chen's falsification set assumed it stays open) and the PM's call was built to: the acute fold is bounded by the record, not the reader — `daysBelowBaseline` climbs daily and a new flagged photo moves `mostRecentFlaggedIso`, so an acute fold lasts one regen cycle; the strip keeps the card's ask verb verbatim; Dr. Chen's dissent is recorded in §10 and he signs the four acute strings at PR 2. §5.3 gained the two acute rows; §4 the four acute clauses and two Back-because lines.
- **DF-3:** the control on the **face** (F5), beside `Why we're showing this`, repeated in the expanded row; §3.3 rewritten as a host-split two-button control row with the 44pt floor reached upward only (the next card's own `Pressable` starts just past the hairline — a bottom slop would share hit area with it). FS-4 rewritten; "you fold what you have opened" retired.
- **DF-4:** (a), as recommended. **F6:** not v1 (DF-9c).

**Two new asks → a second isolated Designer pass** (motion + card directions; no `react-native-reanimated` in the project, confirmed; `InsightCard` is on the haptics guard's always-scanned list, so the fold is silent by construction):
- **§12 the fold motion (DF-10, PR 3 — CUL-788).** The principle: a fold is a collapse in place, so the motion is subtraction with one thing held constant — **the rail is the same node before, during and after**, never changing colour or opacity. Fold = 150ms the body fades and drifts 4pt toward the line (`Animated`, ease-out quad) + 250ms the box closes around the rail while the strip fades in as one node (`LayoutAnimation`, custom config object — `create()` cannot express the ease/spring split). Unfold = 400ms with one soft settle (iOS spring, damping 0.85, ≤2pt overshoot; Android ease) + the sentence landing −4→0 over 250ms. Identical on every class (S1 lives in what the strip says). Reduced motion = crossfade only (a 130pt jump is itself a jolt — §3.2 softened by one word). Forbidden: any loop, a bounce on *close* (reads as relief), scale, sideways travel, a wash, a rail colour change, a check mark, a haptic. The settling wrapper mounts only while settling, so the idle tree stays byte-identical.
- **§13 three card directions (DF-11, PR 4 — CUL-790).** **A "Quiet foot"** (the boxed pills go; `Early pattern` becomes a prefix on the sample line; one control row) · **B "Margin rule"** (row hairlines go; the rails become segments of one ruled margin — a folded strip is a short segment beside one line; the rose segment is the only warm mark on the paper; one Tier-2 line in the Signal spec §5.2) · **C "Picture first"** (the receipt leads on benign cards — **vetoed**: re-opens S4/S10, breaks the fold's compression logic, and a falling compare as a hero beside a folded safety strip is reassurance by layout). Recommendation: **build B carrying A's foot.**

**Mock round 2** (same URL): the rulings ledger at the top; F2/F5/F6/F7 recaptioned (F7 now draws an acute card folded and the next morning's return, "Back because another day came in below the usual."); a **tappable motion frame** running the §12 beats in CSS with a reduce-motion toggle; the three card directions side by side; two briefs left for the PM — DF-10 (approve the motion as drawn / quicker / spring both ways) and DF-11 (B+A recommended / A only / keep the cards).

**Linear:** new project **Home v1 — The Signal fold** with the CUL-by-CUL plan in its description (PR 0 #795 → PR 1 CUL-784 → PR 2 CUL-785 → PR 3 CUL-788 → PR 4 CUL-790; v1.1 CUL-786 / CUL-787; gates, parallelism, the `lib/signalCopy.ts` collision named, the per-PR session ritual, and what "done" means). CUL-784/785/786/787 moved into it; CUL-785 re-scoped to all four safety types and un-blocked; CUL-788 (the motion), CUL-789 (mock round 2, this session), CUL-790 (the card refresh) filed; CUL-695 keeps the decision record and gained the rulings comment.

**Open for the PM after this part:** DF-10 (approve the motion) and DF-11 (pick the card direction) on CUL-789; CUL-775 D1–D4 for v2. PR 1 (CUL-784) needs nothing.

---

## Part 3 — the round-2 reactions, applied (same day)

> "F3. I sort of hate how the line of text in the headline of the safety strip wraps." · "Re the fold and unfold motion.. I'll defer to you on that experience. But I like the direction here a lot… Feel free to even go a bit more aggressive." · "DF-11.. Let's punt on card direction. Don't want to blow up scope!"

- **The wrap (spec → v1.2, FS-11).** A real defect, not a mock artifact: `Recurring vomiting — worth a vet visit` fits a 390pt phone by a few points and wraps on 375pt; `Recurring skin irritation — …` wraps everywhere. Truncation is off the table (C-8), so the fix is structural — the strip is built from short lines, each its own node: the **name** (≤ 30), the **ask** on its own line on safety strips (≤ 20, plain ink), and a **compact count** (`stripCountLine`, ≤ 40 — Dr. Chen's own form, `14 episodes, 5 of 8 weeks · last Aug 26`). Benign names shortened too (`Vomiting soon after eating`). Worst-case fixtures pinned; the joint-candidate correlation is the one sanctioned wrap.
- **The motion (§12 v1.2).** Bolder, per the PM, the Designer's call on the details: the drift doubles to 8pt; the settle is felt (damping 0.7, ~4pt); and **the rail leads** — its own animated height, growing ~80ms ahead of the box on unfold and shortening ~80ms after it on fold. The close-bounce veto holds. The mock's tappable frame runs the new beats.
- **The card refresh (DF-11).** Punted; CUL-790 canceled; PR 4 struck from the project plan; §13 kept as the record. A's host-split control row ships anyway because F5 needs it.

Mock republished as round 2.1 (same URL). Nothing is left for the PM on the fold; PR 1 (CUL-784) is ready.

---

## Part 4 — the readiness check, the Linear consolidation, the merge (same day)

> "Do we think that we're ready to build here?" · "Can you please add all these issues to a single project in linear please?" · "Let's just track any remaining decisions that need made on the issue itself as we're working on it… we can tackle them on the fly." · "Let's /wrap and merge."

- **Readiness, checked against the tree rather than asserted** (the taxonomy lesson: verify a premised surface at file:line before building on it). Every field the §5.3 fingerprint table names exists in `lib/signal.ts` — all ten finding types have a row, `empty_stomach_timing` / `timing_story` included. The wipe path the fold mirrors is real: `wipeLocalSession` already clears the arrival store by name (`lib/session.ts:221`), and the fold adds one call beside it. `InsightCard`, `LiveStack`, `visibleFindings` and `isLead` bound to index 0 exist as §6 composes them. No open PR touches the fold's files; four stale branches do, all already squash-merged. **One stale sentence found and fixed:** §5's identity paragraph still called `incident_red_flag` "never foldable" (pre-DF-2), and the correlation key now names the payload's real fields (`proteins` when present, else `[protein]`). Pushed as `b779f18`; CI green on all three checks.
- **Verdict: ready for PR 1 (CUL-784) once #795 merges.** Residuals named, none blocking: FS-11's no-wrap claim is proven in HTML at 375pt, not yet in React Native — PR 1's test pins it; PR 2 carries the one genuinely new engineering item (the last-episode date read from the local record, timezone-honest) and Dr. Chen's sign-off on the four acute strings; `lib/signalCopy.ts` is the one shared file if CUL-787 runs in parallel.
- **Linear consolidated into one project.** All eight fold issues now live in *Home v1 — The Signal fold*: CUL-695 (moved in from *Signals v2 — the record, decomposed*; it was the only outlier, the parent living apart from all seven children), CUL-784 / 785 / 788 (Todo), CUL-789 (Done), CUL-790 (Canceled), CUL-786 / 787 (v1.1). CUL-695's description refreshed to the rulings as made — it still said "acute cards never fold" and "DF-4: decide". The project description patched: PR 4 struck through, DF-10 / DF-11 / FS-11 recorded, "nothing needed from the PM".
- **PM ruling on the residual decisions.** D3 (the daily check-in), D4 (the care thread), D5 (the omnibox) stay on CUL-695, no separate issues, taken on the fly as the work reaches them — none gates PR 1–3 or the v1.1 items. `Waiting on PM` removed from CUL-695 because nothing there waits on the PM today; a build session re-adds it the moment one of D3–D5 gates a PR.
- **Mock round 2.1 republished** at the same artifact URL (the publish required the live version re-read first; it was byte-identical to the committed round 2). PR #795 title and body refreshed to v1.2 / round 2.1. The artifact service refuses wake subscriptions from this session (HTTP 403), so comments on the mock do not wake it — noted, not worked around.

**Outcome:** shipped via #795 — squash-merged at the PM's direction as this wrap's last step. The PM takes the PR-by-PR launch plan from the project description next; PR 1 (CUL-784) starts from a fresh session with the plan-gate.
