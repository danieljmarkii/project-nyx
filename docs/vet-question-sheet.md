# The vet question sheet — send-ready

**Rendering of:** `docs/nyx-event-taxonomy-requirements.md` §15 (D7). **That section is canonical** — if the two ever disagree, §15 wins and this file is re-rendered from it.
**Purpose:** §15 is written for the build team, with build-priority annotations and spec references (D13, D14, P4, W1/W3) threaded through it. This file is the same questions with all of that stripped out, in a form that can be pasted into a message or read on a phone in an exam room.
**Tracked by:** CUL-672. **Last rendered:** 2026-08-30.
**Phone-readable version:** https://claude.ai/code/artifact/397eae2b-44da-4c0b-a614-2b3afaacc49e — same content, designed to be read in an exam room. Re-publishes to that same URL on revision.

---

## How to use this

Two formats below, same nine questions.

- **Format A — the message.** Paste into a text or email. Self-contained; the vet needs no context from us.
- **Format B — the visit.** Same questions reordered for a conversation, with the one that matters most first, because a visit gives you three or four questions, not nine.

**Short answers are worth more than long ones.** These are being used to rank which observations become buttons in the app, not to write clinical content — so "I never ask that" is as useful an answer as a paragraph.

**Where the answers go:** back onto CUL-672 as a comment, verbatim. They fold into the spec as a revision plus a scoring adjustment. Capture them roughly and unedited rather than tidily and interpreted — the interpretation is our job, and a tidied answer has already had our assumptions applied to it.

---

## Format A — the message

> Hi [name] — I'm building a pet health tracking app. The owner side is quick logging; the output is a summary a vet can actually read in a minute. Before I decide what owners can log next, I'd rather ask a working vet than guess.
>
> Nine questions below. Short answers are genuinely more useful than long ones, and "I never ask that" is a real answer. If you only answer one, make it number 4.
>
> 1. When a GI, respiratory, skin, or urinary case comes in, which owner-reported observations actually change your workup? And which do you wish owners had **counted** rather than described?
>
> 2. What's the first question you ask that owners usually can't answer? (How often? Since when? How long does it last?)
>
> 3. A cat or dog that's been coughing — what home observations would make you want to see them sooner, rather than monitor?
>
> 4. **Do you teach owners to count sleeping breaths for cardiac patients?** And if an owner arrived with dated counts they'd taken at home, would you trust them and use them?
>
> 5. Before a urinary visit, what would you want an owner to have recorded about litter-box behaviour or accidents?
>
> 6. Which owner-reported signs do you find least reliable, or most over-reported — the ones where structured logging wouldn't help?
>
> 7. If a summary handed you dated counts — cough episodes over six weeks, itch episodes flagged "woke her from sleep", stools with consistency — would that change what you do in the consult, or just confirm what you'd already concluded?
>
> 8. We have one button for itching, labelled "Itch/Scratch". Does that wording read right to you — and are itching and scratching one thing to you, or would you want them recorded separately?
>
> 9. If an owner logged each cough, would knowing it was dry vs wet-sounding, or that the pet retched afterwards, change your workup? (i.e. is that worth two extra taps at the moment of logging?)
>
> Happy to show you what it produces if you're curious. Thanks — [PM]

---

## Format B — the visit

Ask in this order. You will probably get through three or four.

1. **Sleeping breath counts.** *Do you teach owners to count sleeping breaths for cardiac patients? Would you trust and use counts an owner brought in?*
   — The priority question. See "What each question decides" below.
2. **The unanswerable question.** *What's the first thing you ask that owners can never answer?*
   — Highest-yield question on the sheet for finding things we haven't thought of.
3. **Cough — when to come in.** *What home observations make you want to see a coughing pet sooner rather than monitor?*
4. **Counted vs described.** *Which owner-reported observations actually change your workup, and which do you wish owners had counted rather than described?*
5. **The unreliable ones.** *Which owner-reported signs are least reliable or most over-reported?*
   — Tells us what **not** to build, which is worth as much as the opposite.
6. **Urinary.** *Before a urinary visit, what would you want recorded about litter-box behaviour or accidents?*
7. **Would dated counts change the consult, or just confirm it?**
8. **The itch button** — wording, and one bucket or two.
9. **Cough detail** — dry vs wet, retched afterwards: worth two taps?

---

## What each question decides

Keep this side out of the vet's copy — it is here so you know what an answer is worth, and what to probe if one comes back thin.

| Q | Decides |
|---|---|
| 1, 2 | Leaf ranking on the demand axis. A named observation we don't have is a candidate leaf. |
| 3 | Cough escalation copy, and whether cough needs a safety register at all. |
| **4** | **The breath counter's build priority inside wave 2** — whether the safety trio ships as strain + laboured first with the counter following. Note the framing: home sleeping-respiratory-rate monitoring is already ACVIM-endorsed and deliberately numberless, so this is **not** asking whether the literature supports it. It asks whether *this* vet teaches it and would consume owner-logged counts. A "I don't teach it and wouldn't trust it" is a real and useful answer, and it demotes the counter. |
| 5 | Wave 3's urinary leaves. |
| 6 | The negative list — what we decline to build. |
| 7 | Whether the vet-report problem line earns its place. |
| 8 | Double-checks the ruling that itch and scratch are one owner-observable, before the button wording locks. A "record them separately" reopens that ruling and costs a real engine build in wave 3. |
| 9 | Whether cough capture ships two optional chips. Wave 1 ships without them regardless — this is a follow-on, never a blocker. |

**Nothing on this sheet blocks anything.** Wave 1 proceeds without it; wave 3 proceeds without it. Q4 sets a sequencing call inside wave 2, and wave 2 is separately gated on CUL-684. Take it to the next natural visit; there is no reason to make an appointment for it.

---

## Appendix — three proposed additions (NOT ratified; PM's call)

**Status: proposed 2026-08-30, awaiting a PM ruling. Do not send these without deciding.** The nine questions above are ratified; these three are not, and they are recorded separately so the distinction survives.

The reasoning: Q4 sets the breath counter's priority *within* wave 2. But wave 2 is currently blocked on CUL-684, and three of the four rulings that block it are clinical questions a vet answers in a sentence. Those rulings are presently being made by the Dr. Chen persona reading consensus documents. A real vet's answer would be the strongest available evidence for three decisions that currently rest on a persona's reading — so if the visit is the scarce resource, these arguably outrank Q4.

They are written as scenarios, not as our proposed rules, deliberately: asking "we escalate on X, does that match your practice?" gets agreement, not information.

> **A.** A male cat is making repeated trips to the litter box, and the owner tells you a little urine is coming out each time. Does that lower your concern, or not? What do you tell them on the phone?

> **B.** An owner calls: their male cat has been in and out of the box maybe fourteen times in five hours. It's a covered box, so they genuinely cannot see whether anything is coming out. Come in now, or watch and call in the morning?

> **C.** Laboured or open-mouth breathing at rest — same level of emergency in a dog as in a cat, or different?

| Proposed | Answers | Currently ruled by |
|---|---|---|
| A | §9b **F1** — whether straining *with* a few drops is an escalating observation. The spec's own line is that a few drops is the presentation of a partial obstruction, not the exclusion of one; A checks that against practice. | Dr. Chen persona |
| B | §9b **F3** — whether an evidence floor may cap the *tier* of a red flag. Today the covered-box household tops out at a "check within 24–48h" prompt for a condition fatal in 24–48h. B is that exact household, asked of a real vet. | Dr. Chen persona |
| C | §9b **F4** — whether the dog arm of laboured breathing fires. The rule is currently written "in a cat" three lines above a bound naming the CHF dog as its target patient. | Dr. Chen persona |

§9b's fourth open ruling (F19 — whether a safety band may name a household rather than one animal) is a product and UX question, not a clinical one, and is deliberately **not** proposed for the sheet.
