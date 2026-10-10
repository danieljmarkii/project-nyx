# 2026-08-30 — CUL-672: the §15 vet question sheet, made send-ready

**Mode:** DISCOVERY. **Issue:** CUL-672 (`Waiting on PM`, project Event Taxonomy Expansion).
**Outcome:** `docs/vet-question-sheet.md` + a published artifact; three additions proposed for PM ruling. Shipped via #765.

## What the issue asked

CUL-672's single remaining step is a human action: the PM takes the §15 sheet to their vet, or messages it. Nothing was buildable, so the session's job was to remove the friction from that step and to check that the sheet is still asking the right questions.

## What was built

**`docs/vet-question-sheet.md`** — a rendering of §15 with the build-team apparatus stripped out. §15 stays canonical; the file says so in its header, so a future revision re-renders rather than forks. Two formats, because the issue names two delivery paths and they want different things: **Format A** is a pasteable message, self-contained, no context required from us; **Format B** is the same nine questions reordered for a conversation, since a visit yields three or four questions and Q4 should not be the fourth one asked. A "what each answer decides" table stays on our side of the sheet.

**A published artifact** — https://claude.ai/code/artifact/397eae2b-44da-4c0b-a614-2b3afaacc49e — the same content designed to be read on a phone in an exam room, with the message block copyable in one tap. Re-publishes to that URL on revision, per the same-URL rule.

## The finding

**The sheet asks the sequencing question and omits the gating ones.** Q4 sets the RRR counter's build priority *within* W2. But W2 is not currently buildable at all: it is gated on CUL-684, whose §9b pass left four open rulings — and three of those four (F1, F3, F4) are clinical questions a vet answers in a sentence:

- **F1** — is straining *with* a few drops an escalating observation?
- **F3** — may an evidence floor cap the *tier* of a presence-class red flag? (the covered-box household, topping out at prompt-24–48h for a condition fatal in 24–48h)
- **F4** — does the dog arm of `labored_breathing` fire?

All three are presently being ruled by the **Dr. Chen persona reading consensus documents**. A real vet's answer would be the strongest available evidence for three decisions that today rest on a persona's reading of the literature. If the visit is the scarce resource — and it is; the PM gets one conversation — these arguably outrank Q4.

They are drafted as **scenarios, not as our proposed rules**, deliberately. "We escalate on X — does that match your practice?" gets agreement, not information.

They were **not** added to §15. The sheet's own precedent is that questions arrive by PM ruling (D13/D14 → Q8/Q9), so these sit in a visibly quarantined appendix marked *not ratified*, and the fork is a decision brief rather than a silent edit. §9b's fourth open ruling (F19 — may a band name a household) is product/UX rather than clinical and is deliberately not proposed.

## Honest note on urgency

Nothing on the sheet blocks anything, and this session did not change that. W1 proceeds without it; W3 proceeds without it. Q4 sets a sequencing call inside a wave that is separately blocked. The sheet is a next-natural-visit errand, not an appointment — that is now stated on the sheet itself so a future reader does not re-derive it.

## Definition of Done

- **AC** — N/A. No build step; the issue's acceptance is a human action the session cannot perform.
- **Anti-patterns** — none introduced. No app code touched.
- **Types / lint / tests** — N/A, docs only. No store, Edge Function or `lib/` utility in the diff.
- **Secrets** — none used.
- **Persona sign-off** — Designer ✓ (the sheet is a read surface: clinical register per Principle 6, no decoration, legible at arm's length) · Dr. Chen ✓ (the finding above is his lens — flagged that three rulings attributed to him rest on document reading where a practitioner is reachable) · Product Owner ✓ (fork surfaced as a decision brief, not folded in) · Engineer N/A · Data N/A · QA N/A.
- **Adversarial review** — N/A. No clinically or statistically load-bearing logic in the diff; the sheet asserts nothing and computes nothing. Note the sheet is deliberately built *not* to assert: it never states our thresholds to the vet, because a leading question returns agreement rather than evidence — which is the same failure mode an adversarial pass would look for here.
- **Future-self review** — a rendering that can drift from its source is the risk. Mitigated by naming §15 canonical in the file header and by keeping the rendering thin enough that re-rendering is cheaper than reconciling.

## Documentation updates

- `CLAUDE.md` — no change. No decision was made this session; the fork is open.
- **Proposed Tier-2 edit (awaiting PM approval, not written):** add a one-line pointer in `docs/nyx-event-taxonomy-requirements.md` §15 to `docs/vet-question-sheet.md` and the artifact URL, so a session reaching §15 finds the send-ready rendering. Content-neutral — no question, ruling or priority changes.
