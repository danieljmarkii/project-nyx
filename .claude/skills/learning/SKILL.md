---
name: learning
description: Use this skill to teach the PM one software-engineering or strategic-PM concept on the fly, drawn from the work the session just did. Triggers include the `/wrap` and `/handoff` commands (which call it for their "One thing" block), the PM saying "teach me", "explain", "what does that mean", "I don't understand", "too technical", "why does X work like that", or asking how a piece of the system works. Loads the PM's assessed baseline, the difficulty ladder, the track order and the block format from `docs/learning/curriculum.md`, plus the rules that keep the teaching real (only concepts today's work illustrates, one concept per session, a check question, the ledger line). Not for writing owner-facing copy (`nyx-voice`) or for the monthly coaching read (`/coach`).
---

# Learning — One Thing, On The Fly

The PM learns inside the work (the 70 of 70/20/10). Each session that changed something ends with **one** concept the session itself illustrated, pitched at the PM's level, with one question that checks it landed. The curriculum, baseline and ladder live in `docs/learning/curriculum.md`. Read it before writing a block.

## Procedure

1. **Read the ledger.** `grep -rh '^\*\*One thing' docs/sessions | sort`. Work out, per track, the current level (curriculum §2) and which concepts are done. A `pending` check with no later grade is asked again first, in one line, before the new block; its grade goes in *this* session's record as a `**One thing (re-ask):**` line (curriculum §4), never as an edit to the old record.
2. **Find what today illustrated.** Look at this session's diff (`git diff origin/main...HEAD`) and decisions. List the curriculum concepts (§3) it gives a *real* example of. Code-heavy session → G / T / S / D / C. Decision- or scope-heavy session → P.
3. **Pick one.** The lowest unfinished concept in the earliest unfinished track that today illustrates. If today illustrates nothing new, revisit the weakest done concept with today's example. Never invent an example; skip the block and say why rather than teach from nothing.
4. **Write the block** at the track's level (format below).
5. **Record it.** `/wrap` writes the ledger line into the session record. When the PM answers the check in the same session, grade it honestly (`correct` / `missed`) and update the line before the record is committed.

## Block format

```
### One thing — <concept title> (<ID>, L<n>)
<2–4 sentences: the concept in plain words. No jargon without a gloss.>

**Like:** <one everyday analogy that maps onto the mechanism, not just the vibe.>

**In today's work:** `<file>:<line>`
<the real line (L1) or 5–10 real lines (L2), each annotated in plain words; L3: the raw hunk, no annotation>

**Why it matters to you as PM:** <one sentence connecting it to a decision, a bug, or a spec the PM touches.>

**Check:** <one question the PM can answer in a sentence. It asks for a prediction or a consequence, never a definition.>
```

At L3, ask the PM to explain the hunk *before* showing anything else, and hold the explanation for the reply.

## Rules

- **One concept per session.** If `/handoff` already taught one this session, `/wrap` records that one and does not add a second.
- **Plain words first.** The PM's baseline is "does not read code yet." Every term gets a gloss on first use. No paths, enums or codenames in the plain-words paragraph; the code goes in *In today's work* only.
- **The check tests understanding, not recall.** Good: "If a session pushes to the branch while your phone is on `main`, what happens when you pull?" Bad: "What is a branch?"
- **Grade honestly.** A partly right answer is `missed`, with the missing half said kindly in one line. Inflated grades promote the PM past what they know and the next block lands on sand.
- **Keep it short.** The block is read in about 90 seconds. If it does not fit, the concept is too big; pick a smaller one.
- **When the PM asks mid-session** ("what does that mean?"), answer at their level with the same shape (plain words, analogy, the real line) but no check and no ledger line, unless they ask to be quizzed.
- **Readings** (curriculum §3) are offered only when the matching decision is live, one at a time, as a single line under the block.
- The PM's prose preference applies here as everywhere: confident, direct, no filler, no dashes in prose.
