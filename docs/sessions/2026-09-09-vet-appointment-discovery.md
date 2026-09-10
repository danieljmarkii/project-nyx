# Vet visits — the appointment companion: discovery (CUL-878) + the PMM persona ask (CUL-877)

**Date:** 2026-09-09 → 10 · **Mode:** DISCOVERY · **Shipped via #818** (docs-only: spec v0.1, evidence brief, mock round 1, CLAUDE.md row; no app code, no schema).

## What the PM asked

"We have a vet appointment coming up and I believe we have a vet-appointment idea on the backlog." Eleven prompts: keep v1 lightweight (date · vet · notes); it lands in history and feeds the report; define v1 as the minimum that captures a visit *and* a UX we'd be proud of, spec the rest as later; placement open; an AI-first approach (microphone transcript, rich-text notes); beyond v1, AI summaries and real-time question suggestions; before the visit, summarise the last one and suggest what to discuss — "the mini owner-facing vet report"; check the competition ("hint hint"); add a product-marketing persona as its own Linear task under an "AI infra" label; would this be a differentiator when integrated; loop in the consult personas, legal first.

## What shipped

- **`docs/nyx-vet-visits-requirements.md` v0.1** — the code audit at file:line; the jobs; the v1.0 / v1.x / v2.0 split; the data model; the recording consent contract; draft ACs; the VV-0 → VV-5 plan; **seven decision briefs G1–G7**; three recorded conflicts.
- **`docs/research/2026-09-vet-visit-companion-evidence.md`** 🧊 — three isolated lanes with sources, indexed in the research README.
- **`docs/culprit-vet-visits-mockups.html`** — round 1, published as an Artifact (one URL for every round to come).
- **Linear:** CUL-878 (this discovery, claimed and closed out with the briefs; `Waiting on PM`), CUL-877 (the Product Marketing Manager persona + a `competitive-landscape` backstop), the new label **`Area: AI infra`**.
- CLAUDE.md v1.36: the Read-These row; v1.33 archived.

## How it ran

1. **The audit before the brainstorm.** Four of the eleven prompts were already shipped or specced: `vet_visits` (migration 001) and a capture screen (`app/vet-visit.tsx`) that is **write-only** — captured, synced both ways, rendered nowhere, reachable only via Ask → rundown → "No prior visit logged"; the deterministic rundown (`lib/rundown.ts`, Ask A6) that *is* the pre-visit mini report; Vet Files for paperwork; and a report window keyed off the last logged visit (`report.ts:679`). The feature is a shape over parts, not parts.
2. **Three research agents in parallel from one brief each** (the Vet Files discovery's method): competitive (owner apps · vet-side scribes · human-health analogues), legal/T&S, technical. Each returned a tagged brief; the spec restates only the conclusions.
3. **The mock came before the lanes finished** and was patched once on the legal lane's two design inputs (exam room only; the acknowledgment as the owner's claim; the spoken announcement as an open option) — one republish, same URL.

## What the lanes settled

- **Competitive.** The parts are commodities: Pawtient AI (Dec 2025, one rating) already records visits with an AI summary; Fi Intelligence owns "vet visit companion" without recording; clinic-side scribes record a rising share of exam rooms and emit client summaries. **The loop is whitespace** — no product closes prep-before → capture-during → the-visit-in-the-owner's-longitudinal-record, and nobody generates questions from the pet's own record. Abridge's dead patient app is the lesson: don't sell the transcript, sell the record it lands in. Claims to retire and claims to make are in the brief §1.6 — the PMM persona's first exercise.
- **Legal / T&S.** Eleven all-party states for in-person recording (CA, FL, IL, MD, MA, MI, MT, NH, OR, PA, WA; DE treated the same); Nebraska one-party. The Otter.ai ruling (2026-08-13) draws the tool-vs-eavesdropper line: never hold raw audio server-side, never train, no independent use. Apple 2.5.14 (consent + visible/audible indication), 5.1.2(i) (third-party AI needs an in-app permission), and **5.1.1(ix)** (sensitive information → a legal entity, not an individual) make the LLC already on the attorney brief a prerequisite of the microphone release. The waiting room is off limits (non-participant interception has no exception anywhere). No diarization (BIPA / CUBI / RCW; three live suits). Live suggestions are the highest-risk item, not the summary. The lane's recommendation is the spec's G5.
- **Technical.** The Claude API takes no audio — server transcription is a second vendor. iOS 26's SpeechAnalyzer is the one on-device engine that handles a 30-minute consult (~2 % / ~5 % WER vs ~9 % / ~16 % legacy), reachable from Expo managed through a thin local module; older iOS is undocumented past a minute; Android is weak. `expo-audio` background recording is eight months old with a predecessor's history of lock-screen and phone-call failures → spike first. Rich text is not worth v1. A summary costs $0.015–0.045 per visit; live suggestions $0.08–0.29.

## Decisions with teeth (proposed — the PM rules on CUL-878)

- **G3 — the appointment is its own table.** Three readers treat every `vet_visits` row as a visit that happened, and the rundown takes `MAX(visited_at)` with no upper bound; a future-dated row would silently corrupt "since last visit". `vet_appointments` keeps D7 true by construction and unblocks CUL-253.
- **G5 — the microphone stays out of the submission binary.** It is a compliance release (policy + App Privacy + purpose string + Terms + the entity question), not a feature PR.
- **G6 — nothing in v1 calls a model.** "Worth raising" is the record's own findings phrased as questions, one source each; the summary and phrased questions take a D2-class ruling; live suggestions carry a recorded dissent.
- **The plan rows are doors, never a second store.** Med, trial, next visit and paperwork each open the flow the app already has with the visit linked; a linked record keeps its own numbers.

## Lessons that generalise

- **A brainstorm's "new feature" is first a map of what exists.** The most valuable hour was the audit; it turned "build a vet-visit feature" into "give four shipped parts a shape and a door."
- **A feature that adds a permission is a compliance release.** The microphone touches four documents, three Apple guidelines and eleven state statutes before it touches a screen.
- **The consent norm is a design norm before it is a law.** Every vendor, AAHA, Medcorder and Apple converge on ask-first; the honest control is a real tap with a timestamp, never boilerplate.

## Next

- PM: react to round 1 (the Artifact) and rule G1–G7 on CUL-878; the window length (3 vs 7 days) is a reaction, not a gate.
- On a greenlight: a project "Vet visits — the appointment companion" with VV-0 → VV-4 as issues (the spec §8 carries the kickoff prompts); VV-3's rundown promotion is the cheap piece that could ride earlier as the PM's own visit approaches.
- CUL-877 can be picked up cold by any session; its first exercise is this feature's positioning and the App Store listing copy.
