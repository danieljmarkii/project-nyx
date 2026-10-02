---
name: product-voice
description: Use this skill when writing or reviewing any user-facing copy in {{PRODUCT}}: any string {{PRIMARY_USER}} or {{SECONDARY_USER}} will read on screen, in a notification or in an email. Triggers include editing an empty state, a nudge, a home-surface insight, a status or AI read label, a button, an error or alert, a toast, an onboarding line, or any text node / alert / notification call; adding a new enum or observation label that renders; writing templated read text for an AI feature. Loads the voice rules (specific over generic, no exclamation marks, designed empty states, plain language translated at the boundary, warm-not-nagging nudges, never reassure on absence), each grounded in a string already shipped. For what AI copy is FORBIDDEN to assert, defer to ai-output-guardrails; this skill covers how it sounds.
---

# {{PRODUCT}} Voice: user-facing copy

## Origin and Scope
The voice in one line: **{{VOICE_ONE_LINE}}**  <!-- e.g. "the register of a smart, caring friend who happens to know the domain." Not a brand mascot, not a clinical record tool. -->

Every pattern points at a string already shipped, so the next contributor copies the register by example rather than re-deriving it from adjectives. **Until real strings ship, the examples are placeholders; replace each with a shipped `file:line` as soon as one exists.**

**Out of scope:** what AI reads may assert (`ai-output-guardrails`); the {{EXPERT_ARTIFACT}} register, which speaks to {{DOMAIN_EXPERT}}, not the user.

---

## PATTERN 1: Address the user as "you"; name the {{ENTITY}}
**RULE:** {{NAMING_RULE}}  <!-- e.g. "The pet is the subject, by name; the owner is 'you'. Fallback when the name is missing: 'your pet', never 'the pet'." -->
**CANONICAL EXAMPLE:** `<file:line>`
**ANTI-PATTERN:** "The user's item…", "Your account has…" where a name exists.

## PATTERN 2: Specific over generic
**RULE:** Insight copy names the number, the day, the thing, the window. If you cannot be specific, say what is still being gathered.
**ANTI-PATTERN:** "Things are improving." On a high-stakes surface, generic praise is quietly unsafe: it implies a verdict the data may not support.

## PATTERN 3: Empty states are designed, forward-looking copy
**RULE:** Every empty state names what is being built and what to do to get there. Never blank, never "No data", never "Coming soon" on a surface that will fill with the user's data.
**CARVE-OUT:** a row for a feature deliberately not shipped yet may say "Coming soon", only where no user data could ever appear.

## PATTERN 4: No exclamation marks, no manufactured enthusiasm
**RULE:** Calm and quietly confident, including success states. Enforced as a test on templated strings: `expect(s.includes('!')).toBe(false)`, and by a copy guard over rendered text.

## PATTERN 5: Plain language, translated at the UI boundary
**RULE:** Stored values may be technical; every one gets a plain label before it renders. Never pipe a raw enum into a text node.

## PATTERN 6: Concerns surface clearly, without alarm, and never reassure
**RULE:** Name the concern plainly; no alarm language before the data justifies it; never assert safety on absence. This is the copy face of `ai-output-guardrails`.

## PATTERN 7: The nudge is warm, not nagging (delete if the product never nudges)
**RULE:** At most one per day, specific, sent only when something is worth saying. Read it aloud: thoughtful friend or metrics target?

## PATTERN 8: Errors never leak internals
**RULE:** An error string shown to the user is mapped through a copy function; a raw error message, a stored error field or an untranslated technical term never reaches a text node. Enforce with a guard over display sinks.

---

## Ambiguities Flagged
