---
name: ai-output-guardrails
description: Use this skill when building, reviewing or modifying any feature in {{PRODUCT}} where a model (LLM or vision) reads a single sample (one photo, one document, one event, one message) and produces a user-facing verdict, recommendation, classification or free-text read. Triggers include adding or editing a server function that calls a model, defining or changing a recommendation / verdict enum, writing the system prompt or tool schema for such a call, writing templated fallback copy, computing contextual flags that feed a verdict, re-running an analysis over an existing row, or rendering a model's read in the UI. Loads the escalate-but-never-reassure asymmetry and the ten structural patterns that enforce it. For how the copy SOUNDS, defer to product-voice; this skill covers what the output is FORBIDDEN to assert.
---

# AI Output Guardrails: single-sample reads

## Origin and Scope
Generalized from a predecessor project's per-incident AI analysis (a vision model reading one photo and returning an owner-facing read). Its expert's non-negotiable rule, which transfers to any domain where a user may act on a model's output:

> A single-sample read may **escalate** on the *presence* of a red flag ("worth getting this checked"), never diagnose. It must **never reassure** on the *absence* of one. Absence of a visible flag is not evidence of safety. Reassurance, if ever, comes only from a careful multi-sample read.

Each pattern below is structural: it holds even when the model misbehaves. Prompt wording is layer one of several, never the whole guarantee. {{DOMAIN_EXAMPLE_OF_THE_ASYMMETRY}}

**Out of scope:** generic server hygiene (auth, storage download, encoding, media-type sniffing); how the copy sounds (`product-voice`).

---

## PATTERN 1: The verdict enum has no value that asserts safety
**RULE:** Available verdicts are escalate / watch / not-enough-to-say (name them for the domain). The label for the middle value is forward-looking ("Keep an eye out"), never reassuring ("All clear"). Adding a value that asserts safety is a regression: route to the PM, do not merge.
**ANTI-PATTERN:** `looks_normal`, `no_concern`, `all_clear`, `healthy`, `safe`, even with softened copy.
**Corollary (unknown values):** installed clients outlive server changes. Every reader sorts verdicts with ONE allowlist of the *quiet* values; anything off the list renders as an escalation, never blank. A gate that *releases* model words keys on the literal escalate value, so it fails toward withholding.

## PATTERN 2: A deterministic floor the model cannot downgrade
**RULE:** After the model returns, a pure function combines its verdict with server-computed contextual flags and structured findings to produce the final verdict. Context or a present red flag forces escalate; no input / unreadable input collapses to not-enough-to-say; the function has **no path to a reassuring verdict by construction**. The model may escalate; it may not downgrade an escalation that fired on context.
```ts
export function applyFloor(p: { model: Verdict; readable: boolean; flags: string[]; context: string[] }): Verdict {
  if (p.context.length > 0) return 'escalate'
  if (p.flags.length > 0) return 'escalate'
  if (!p.readable) return 'not_enough_to_say'
  if (p.model === 'escalate') return 'escalate'
  return 'watch'
}
```
**ANTI-PATTERN:** the model's verdict flowing straight to the user.

## PATTERN 3: Context is computed by the server, never reasoned by the model
**RULE:** Risk-raising context (recent repeats, history, thresholds) is computed deterministically from queries and passed as discrete flags into the floor. The model sees only the single sample and its system prompt.
**ANTI-PATTERN:** putting "this is the 3rd one today" into the prompt. The model then forms a multi-sample judgement from one sample, which is the violation.

## PATTERN 4: The system prompt is layer one of defense in depth
**RULE:** The prompt enumerates no-diagnose, no-reassure, no-jargon, and "return `unsure` rather than guess". The enum (P1) is layer two, the floor (P2) layer three. Pin the model to a single structured tool (`tool_choice`), never free text you must parse.
**ANTI-PATTERN:** relying on the prompt alone.

## PATTERN 5: Honest degradation on unreadable input
**RULE:** Oversize, undecodable or missing input does not 500, does not reassure, and does not skip the floor. Set `unreadable`, run the contextual floor anyway, return a templated read that names the failure and points to the right next step. Guard raw size *before* encoding (encoding an oversize file is itself what crashes the worker). A run that fails transiently keeps any escalation it already computed.
**ANTI-PATTERN:** "couldn't read it, so probably fine".

## PATTERN 6: A flag keyed on ABSENCE needs a tracking guard
**RULE:** Any contextual flag that fires on the absence of a positive record must also require proof the user actually tracks that signal. Otherwise "didn't log" masquerades as the condition and flags every non-logger.

## PATTERN 7: Re-analysis preserves human edits and never lowers a stored escalation
**RULE:** When the user has edited the structured fields, a re-run refreshes only the read columns. A re-run that sees less never lowers a stored escalation (a second look that sees less is absence, and absence is not safety). A stored red flag carries; a stored absence does not.

## PATTERN 8: The never-reassure invariant is a test, not a comment
**RULE:** Every templated string the function can emit is covered by a test that scans for reassurance vocabulary and asserts none appears (and no `!`). Extend the regex to every new template before merging.
```ts
const REASSURE = /\b(fine|okay|ok|safe|healthy|normal|all clear|nothing (?:to worry|concerning|alarming))\b/i
```

## PATTERN 9: Derive flags from the user-editable structured fields, never the cached read
**RULE:** Any surface that elevates or re-derives a red flag reads the structured fields (which the user can correct), never a cached `flags` array or the raw model text. Derivation is present-only. At write time, union present flags derived from the model's own structured fields into the flags array so the floor escalates even when the model drops the flag and self-selects "watch".

## PATTERN 10: Model free text reaches the user only on a self-escalated, final escalation (two layers)
**RULE:** The model's free-text fields surface only when the model itself chose escalate (**layer 1, at parse**) AND the final post-floor verdict is a non-contextual, readable escalate (**layer 2, post-floor**). Every other path gets a deterministic template or null. One layer alone leaks: parse-only leaks on a floor downgrade; post-floor-only leaks the model's calm prose under a flag-forced escalation. A regex denylist was tried and missed ~86%; the guarantee is structural, not lexical.

---

## Ambiguities Flagged
Record here any gap between what this skill asserts and what the code currently enforces, with file:line, rather than silently "fixing" it.
