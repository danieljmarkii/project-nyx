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
