# Home redesign spike — kickoff, research, and the D1–D4 tee-up (CUL-773, CUL-774)

**Date:** 2026-08-31

Shipped via **#789** (draft). Mode: **DISCOVERY** (research + track kickoff — no app code). Branch `claude/home-screen-redesign-spike-jf3zgc`.

## The mandate

CEO → CPO, relayed at session start: a conference in ~a quarter; wants a "kickass new home screen redesign"; named at least two downstream research tracks — the competition, and UX/design leaders in SaaS. This session stood the spike up end to end: the Linear container, the two commissioned research passes (run and shipped, not just filed), a code-true current-state audit, and the four decisions that shape everything downstream, teed as briefs.

## What shipped

**Linear (work-path):** project **Home Redesign — Conference Spike** (In Progress, target Nov 2026 *month-resolution placeholder*, lead = PM) with five phase issues — CUL-773 competitive research (Done this session), CUL-774 design-leadership research (Done this session), **CUL-775 D1–D4 rulings (`Waiting on PM`, Urgent — the gate)**, CUL-776 mock round 1 (blocked on 775), CUL-777 build-ready spec (blocked on 776) — plus the project document **"Home today — current-state audit and constraint map"**, re-derived from `app/(tabs)/index.tsx` rather than the specs (the July landscape pass caught the docs drifting in both directions; the audit reads the code).

**Repo (read-path):**
- `docs/research/2026-08-home-screen-competitive-teardown.md` — 22 current US App Store records (iTunes Search API, primary) + the consumer-health design bar + the iOS 26→27 platform window. 🧊 frozen, per-claim verification flags, research-debt section.
- `docs/research/2026-08-home-screen-design-leadership.md` — 13 voices with verified/dated quotes, the 2025–26 AI-home discourse, redesign practice + backlash postmortems, conference-stage craft, 16 attributed candidate principles. 🧊 frozen, auto-transcript quotes flagged, research-debt section.
- `docs/research/README.md` — two index rows.
- `STATUS.md` — one row registering the track (the boundary condition that file exists for).

**Artifact (CEO-shareable):** the spike kickoff brief — mandate, research headlines, D1–D4, the twelve-week shape, the guardrails — at `https://claude.ai/code/artifact/a74eb095-6661-487e-aada-750decebb69a` (private until shared; linked from the Linear project).

## How the research was run

Two isolated background subagents (the adversarial-review isolation rationale applied to research: no anchoring on the build conversation), each under the repo's evidence discipline — fetch every cited URL, per-claim verification flags, attribution at source strength, universal negatives banned ("none of the N checked…" with the method limit stated). The session then edited both raw files into the frozen briefs and **independently re-verified the single most load-bearing platform claim** (Apple's Apr 28, 2026 iOS 26 SDK mandate — verbatim match) plus the repo's own Expo/RN versions (SDK 57 / RN 0.86 → toolchain compliance ~met; *design adoption* is the open question). The CUL-671 lesson applied in both directions: agents were briefed on attribution strength up front, and the one claim everything hangs on got a second, first-party check.

## Findings most likely to change a decision (full detail in the briefs)

1. **Tractive moved into our position at scale** (Apr 2026 "Health Intelligence": per-pet "health at a glance" screen, weekly plain-language AI insights, predictive alerts; 43.9K ratings; absorbed Whistle's base). Seams to design against: device-fed, no food identity, no owner symptom record, weekly not daily.
2. **The bounded daily briefing is the consumer pattern of 2025–26** (Oura "one big thing," Whoop Daily Outlook, ChatGPT Pulse's "Great, that's it for today") — the Signal stack is already this shape, and none of the 22 checked pet listings describes one. The credible AI-surface stance is **curation, not generation** (NN/g/Nielsen).
3. **The platform window is real and datable:** iOS 26 SDK mandatory for uploads from 2026-04-28 (session-verified); iOS 27 ships Sept 2026 mid-window; only 1 of 22 checked pet apps has touched the iOS 26 design language. NativeTabs (the RN path to real Liquid Glass chrome) is **alpha** → feasibility is a CUL-777 spec question.
4. **The delivery playbook the evidence recommends is the one we already own** (Linear: time-boxed, flags, private beta, incremental) — the `signal_design_v2` machinery, proven on the last Home uplift.
5. **The failure modes are named and priced:** Sonos (capability + accessibility parity are launch gates), Snapchat/Instagram (muscle memory has a market price). And the category is filling the reassurance hole badly (a shipped "positive reinforcement when everything looks good") — our structural never-reassure is unclaimed ground and the stage foil.

## Decisions

None PM-ratified this session — by design. **D1–D4 are teed on CUL-775** (conference target + real date · scope boundary · register/boldness · track composition vs Design Polish + App Store Launch), each as a ≤4-line brief with a recommendation. The project's 2026-11-30 target is an explicit placeholder pending D1. The one provisional call made and labeled as such: registering the track in `STATUS.md` immediately (the spike is PM-initiated; the *scope* is what awaits ruling).

## Process notes for future sessions

- **A review/research subagent shares the working tree** — both agents were instructed to write only to the scratchpad and touch nothing in the repo; clean tree confirmed after both returned.
- The competitive brief's whitespace section states its method limit inline (store-record-grade, no installs) — the July doc's research-debt item #1 still stands and now matters most for Tractive's Health screen.
- TTcare could not be found in US iTunes search this pass — stated as exactly that, not as "delisted." Do not cite TTcare as a live US consumer competitor without a follow-up check.
- The stop-hook fired mid-session on the uncommitted STATUS.md edit → committed and PR #789 opened early (draft), with the briefs landing as a second commit on the same PR. One PR per session held.

## Next

PM rules D1–D4 (CUL-775) → mock round 1 (CUL-776) renders the surviving directions side by side against the two briefs + the audit doc. Kickoff prompts are in the session summary and on the project.
