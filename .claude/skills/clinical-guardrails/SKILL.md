---
name: clinical-guardrails
description: Use this skill when building, reviewing, or modifying any per-incident AI analysis in Nyx — a feature that reads a single sample (one photo, one event, one log entry) and produces an owner-facing recommendation or read. Triggers include touching `supabase/functions/analyze-vomit/`, building new sibling functions (e.g. `analyze-stool`, `analyze-skin`, `analyze-eye`), modifying the `event_ai_analysis` table or any recommendation enum, writing read text or recommendation copy that will be shown to a pet owner, adding contextual escalation flags, calling Claude vision from an Edge Function, or rendering an AI read in a detail-screen component. Loads the non-negotiable rules for the n=1 escalate-but-never-reassure asymmetry that originated with B-013/B-027 and is inherited by Step 10's AI Signal.
---

# Clinical Guardrails — Per-Incident AI

## Origin and Scope

Extracted from B-027 (`supabase/functions/analyze-vomit/`, `components/event/VomitAnalysisSection.tsx`, `lib/analysis.ts`). The asymmetry these patterns enforce is Dr. Chen's non-negotiable rule, restated in CLAUDE.md (Sr. Data Scientist anti-patterns):

> A single-incident AI read may **escalate** on the *presence* of a visible red flag → "worth a call to your vet," never a diagnosis. It must **never reassure** on the *absence* of one. Absence of a visible flag ≠ wellness. The clear-foam-once-but-cat-hasn't-eaten-36h case is the feline 48hr hepatic-lipidosis call. Reassurance, if ever, comes only from a cross-incident multi-sample read.

This skill is the citable, code-grounded version of that rule. When building the next per-incident AI feature (stool, skin, eye, the rest of B-013), inherit these patterns by reference — do not re-derive them from prose.

**Out of scope:** generic Edge Function patterns (auth, RLS, storage download, base64 encoding, image media-type sniffing). Those are technical hygiene used by `analyze-vomit` but separable; document them in a `nyx-edge-function-vision` skill if/when they recur.

---

## PATTERN 1: No-Reassure Recommendation Enum

**RULE:** The recommendation enum must not contain a value that asserts wellness. Available verdicts are `worth_a_call` | `monitor` | `not_enough_to_say`. The owner-facing label for `monitor` is forward-looking ("Keep an eye out"), not reassuring ("All clear", "Looks fine"). Adding a fourth value that asserts wellness is a clinical regression — flag and route to PM, do not merge.

**CANONICAL EXAMPLE** (`supabase/functions/analyze-vomit/index.ts:62`, and the UI label at `components/event/VomitAnalysisSection.tsx:66`):

```ts
// supabase/functions/analyze-vomit/index.ts
const RECOMMENDATIONS = ['worth_a_call', 'monitor', 'not_enough_to_say'] as const

// components/event/VomitAnalysisSection.tsx
const REC_LABEL: Record<Recommendation, string> = {
  worth_a_call: 'Worth a call',
  monitor: 'Keep an eye out',          // forward-looking, NOT reassuring
  not_enough_to_say: 'Not enough to say yet',
};
```

The schema description handed to the model spells out the asymmetry explicitly (`index.ts:158`):

```ts
"worth_a_call = a visible red flag is present (blood or foreign material);
 monitor = this photo shows nothing obviously concerning ON ITS OWN;
 not_enough_to_say = the photo is unclear or does not appear to show vomit.
 NEVER choose a value that reassures the owner the pet is well."
```

**ANTI-PATTERN:** Adding a `looks_normal`, `no_concern`, `all_clear`, or `healthy` value — even with "softened" copy. Absence of a visible flag does not equal wellness; conflating them is the hepatic-lipidosis miss.

---

## PATTERN 2: Deterministic Escalation Floor — Model Cannot Downgrade

**RULE:** After the vision call returns the model's recommendation, a pure, deterministic function combines the model's read with server-computed contextual flags and visual flags to produce the final recommendation. The function has no path to a reassuring verdict by construction. The model can escalate (by emitting `worth_a_call`) but cannot downgrade an escalation that fired on context.

**CANONICAL EXAMPLE** (`supabase/functions/analyze-vomit/index.ts:284–300`):

```ts
// The escalation floor. Contextual and visual flags both force worth_a_call;
// no-photo / not-vomit collapses to not_enough_to_say; otherwise monitor.
// There is intentionally no path to a reassuring verdict.
export function applyEscalationFloor(params: {
  modelRecommendation: Recommendation
  appearsToShowVomit: boolean
  hasPhoto: boolean
  visualFlags: string[]
  contextualFlags: ContextualFlag[]
}): Recommendation {
  if (params.contextualFlags.length > 0) return 'worth_a_call'
  if (params.visualFlags.length > 0) return 'worth_a_call'
  if (!params.hasPhoto) return 'not_enough_to_say'
  if (!params.appearsToShowVomit) return 'not_enough_to_say'
  if (params.modelRecommendation === 'worth_a_call') return 'worth_a_call'
  return 'monitor'
}
```

**ANTI-PATTERN:** Letting the model's `recommendation` field flow straight to the user without the floor. The model can be persuaded by a benign-looking photo to choose `monitor` even when context (repeated vomiting, feline + reduced intake, concurrent lethargy) clinically warrants a call. The floor is not optional, not feature-flaggable, and not deferrable.

---

## PATTERN 3: Contextual Flags Are Server-Computed, Not Model-Reasoned

**RULE:** Risk-elevating context (other recent events, intake history, species-specific thresholds) is computed deterministically in the Edge Function from SQL queries over `events` + `meals` and passed as a discrete `ContextualFlag[]` into the escalation floor. The vision model **only sees the single photo** plus its system prompt — it is never given multi-sample context to reason about.

**CANONICAL EXAMPLE** (`supabase/functions/analyze-vomit/index.ts:259–282`, called from the handler at `:569–571`):

```ts
export function computeContextualFlags(input: ContextInput): ContextualFlag[] {
  const flags: ContextualFlag[] = []

  const within = (hours: number) =>
    input.recentVomitTimes.filter((t) => hoursBetween(t, input.thisEventOccurredAt) <= hours).length
  if (
    within(REPEAT_VOMIT_SHORT_WINDOW_HOURS) >= REPEAT_VOMIT_SHORT_WINDOW_COUNT ||
    within(REPEAT_VOMIT_DAY_WINDOW_HOURS) >= REPEAT_VOMIT_DAY_WINDOW_COUNT
  ) {
    flags.push('repeated_vomiting')
  }

  if (input.species === 'cat' && input.tracksIntake && !input.hasRecentPositiveIntake) {
    flags.push('feline_reduced_intake')
  }

  if (input.hasRecentLethargy) {
    flags.push('concurrent_lethargy')
  }

  return flags
}
```

**ANTI-PATTERN:** Putting "this is the pet's 3rd vomit in 24h" into the model's user message or system prompt and asking it to reason about the pattern. The model will then form a multi-sample judgement from a single photo — exactly the n=1 violation we are trying to prevent. Multi-sample reads belong in the cross-incident AI Signal (Step 10), not in per-incident analysis.

---

## PATTERN 4: System Prompt Is the First Guardrail Layer (Defense in Depth)

**RULE:** The model's system prompt explicitly enumerates the no-diagnose, no-reassure, no-jargon, no-exclamation rules and the "return 'unsure' rather than guess" rule. This is layer one. The recommendation enum (Pattern 1) is layer two. The escalation floor (Pattern 2) is layer three. Each layer fails closed; all three must be present.

**CANONICAL EXAMPLE** (`supabase/functions/analyze-vomit/index.ts:184–197`):

```ts
const SYSTEM_PROMPT =
  'You are a veterinary triage assistant analysing a single photo of pet vomit, logged by a pet owner. ' +
  'You produce two things from this one photo: (1) factual structured fields describing what is visible, and ' +
  '(2) a brief, calm owner-facing read of this single instance. Hard rules: ' +
  '(1) You are looking at ONE instance. You never diagnose, never name a disease or condition, never suggest treatment, medication, or dosing. ' +
  '(2) You may flag the PRESENCE of something visibly concerning ... ' +
  '(3) You NEVER reassure based on the absence of a visible problem. A normal-looking photo does not mean the pet is well. ' +
  "If nothing concerning is visible, say only that this one doesn't show anything obviously concerning on its own, and keep the read forward-looking. " +
  'Never say or imply the pet is "fine", "okay", or "healthy". ' +
  '(4) For any structured field not clearly visible, return "unsure" — never guess. ...'
```

The model is also pinned to `tool_choice: { type: 'any' }` against a single tool (`index.ts:443–444`) — the response is always structured JSON, never free text that has to be parsed.

**ANTI-PATTERN:** Relying on the system prompt alone for the no-reassure rule (skipping Pattern 1 or Pattern 2). Prompt-only guardrails are best-effort; the enum + floor are absolute.

---

## PATTERN 5: Honest Degradation on Unreadable Input

**RULE:** When the photo cannot be analysed (oversize, undecodable format like HEIC, Claude 400 response, missing photo entirely) the function does NOT 500, does NOT reassure, and does NOT skip the escalation floor. It sets a `photoUnreadable` flag, runs the contextual floor anyway (context-only flags can still fire), and falls back to a templated read that names the failure plainly and points the owner at their vet.

**CANONICAL EXAMPLE** (`supabase/functions/analyze-vomit/index.ts` — the raw-size guard at ~`:702–712`, the templated fallback via `selectReadText` at ~`:389–397`):

```ts
// Guard on the RAW byte size BEFORE encoding. Encoding a multi-MB image is
// itself what OOM'd the worker (546, WORKER_RESOURCE_LIMIT) — a hard kill that
// runs before any row is written — so an oversized photo must be skipped
// *before* base64, never sent to Claude. (The old guard filtered on the encoded
// length, i.e. after the OOM.)
const usableBlobs = blobs.filter((b) => b.size > 0 && b.size <= MAX_CLAUDE_IMAGE_BYTES)
if (usableBlobs.length === 0) {
  photoUnreadable = true // no photo within Claude's size limit (or all empty)
} else {
  const imageParts = await Promise.all(usableBlobs.map(blobToImagePart))
  try {
    analysis = await runVisionCall(imageParts)
    if (!analysis) throw new Error('Vision model did not return an analysis')
  } catch (visionErr) {
    const msg = visionErr instanceof Error ? visionErr.message : String(visionErr)
    if (msg.includes('Claude API error 400')) {
      photoUnreadable = true  // undecodable format (e.g. HEIC) — degrade, don't 500
    } else {
      throw visionErr  // transient errors are real, retryable failures
    }
  }
}
// ... the read is then chosen by selectReadText(), whose photoUnreadable branch
// returns a templated fallback that names the failure and never reassures:
//   "I couldn't read this photo — it may be too large or in a format I can't
//    open. Try replacing it with a fresh shot… If you're worried about {pet},
//    your vet is the best call."
```

**ANTI-PATTERN:** Returning a 500 on an unreadable image (the user sees a generic failure and loses the read entirely). Or, worse, returning a `monitor` recommendation with a "couldn't see the photo so probably fine" read — that's reassurance on absence, the exact rule violation Pattern 1 forbids.

---

## PATTERN 6: Tracking-Dependent Flags Need an Absence-of-Log Guard

**RULE:** Any contextual flag that fires on the **absence** of a positive signal (e.g. "no full meal in 24h" → feline reduced intake) must be gated by a separate guard confirming the owner actually tracks that signal. Without the guard, absence-of-log silently masquerades as the clinical condition and produces false positives for owners who simply don't log meals.

**CANONICAL EXAMPLE** (`supabase/functions/analyze-vomit/index.ts:272–275`, with the baseline window at `:48`):

```ts
// Intake-tracking baseline window: the feline flag keys off ABSENCE of
// positive intake, which conflates "didn't eat" with "didn't log". Only fire
// it for owners who actually track intake — i.e. who have rated a meal in the
// last week — so we never flag a non-logger. (Data caveat, B-027.)
const INTAKE_BASELINE_WINDOW_DAYS = 7

// In computeContextualFlags:
if (input.species === 'cat' && input.tracksIntake && !input.hasRecentPositiveIntake) {
  flags.push('feline_reduced_intake')
}
```

And the corresponding test (`index.test.ts:141–149`) asserts the guard:

```ts
Deno.test('computeContextualFlags — feline flag suppressed when owner does not track intake', () => {
  // Absence-of-log must not masquerade as anorexia (B-027 data caveat).
  const flags = computeContextualFlags(baseCtx({
    species: 'cat', tracksIntake: false, hasRecentPositiveIntake: false,
  }))
  assertEquals(flags, [])
})
```

**ANTI-PATTERN:** Firing a contextual flag on `!hasRecentPositiveIntake` alone, without the `tracksIntake` guard. Equivalent anti-patterns will appear for any future flag that keys off absence (no recent stool log → constipation? no recent activity log → lethargy?). Each needs its own tracking guard.

---

## PATTERN 7: Re-Analysis Preserves Human-Edited Structured Fields

**RULE:** When re-analysing an event whose structured observations have been edited by the owner (`edited_at` is set), the write-back must preserve all editable facts and the cached original AI payload. Only the read (`read_text`, `recommendation`, `visual_flags`, `contextual_flags`, `status`) refreshes — because the deterministic floor must remain free to re-escalate on worsening context, but the owner's clinical observations are now load-bearing for the vet report and must not be silently overwritten.

**CANONICAL EXAMPLE** (`supabase/functions/analyze-vomit/index.ts:597–644`):

```ts
const { data: existing } = await adminClient
  .from('event_ai_analysis')
  .select('id, edited_at')
  .eq('event_id', eventId)
  .maybeSingle()

const humanEdited = !!existing?.edited_at

const readFields = {
  recommendation, read_text: readText,
  visual_flags: visualFlags, contextual_flags: contextualFlags,
  status, error: null,
}

if (humanEdited) {
  // Refresh read + flags only. Structured observations are owner's.
  ;({ error: writeError } = await adminClient
    .from('event_ai_analysis').update(readFields).eq('event_id', eventId))
} else {
  // First analysis OR re-analysis of an un-edited row: full upsert.
  ;({ error: writeError } = await adminClient
    .from('event_ai_analysis').upsert({ ...fullPayload, ...readFields },
      { onConflict: 'event_id' }))
}
```

**ANTI-PATTERN:** Unconditionally upserting the full AI payload on every re-analysis. The owner's edits — which the vet will rely on — are silently lost on the next trigger.

---

## PATTERN 8: The Never-Reassure Invariant Is a Test Assertion, Not Just a Comment

**RULE:** Every templated owner-facing string that the function can emit (contextual read text, no-flag fallback, photo-unreadable fallback) must be covered by a test that scans for reassurance words and asserts none appear. Documentation comments are not enough — the test is the guardrail.

**CANONICAL EXAMPLE** (`supabase/functions/analyze-vomit/index.test.ts:248–257`):

```ts
Deno.test('buildContextualReadText — never reassures', () => {
  for (const t of [
    buildContextualReadText('Mochi', ['feline_reduced_intake']),
    buildContextualReadText('Mochi', ['repeated_vomiting']),
    buildContextualReadText('Mochi', ['concurrent_lethargy']),
  ]) {
    assertEquals(/\b(fine|okay|ok|healthy|nothing to worry)\b/i.test(t), false)
    assertEquals(t.includes('!'), false)
  }
})
```

**ANTI-PATTERN:** Adding a new templated read string and leaving the invariant as a code comment ("no reassurance here, by convention"). Future copy edits — by you, by me, by a future contributor copying the function for a sibling incident type — will quietly drift. Extend the regex test to every new template before merging.

---

## Ambiguities Flagged

These are gaps between what the skill claims and what the code currently enforces. They are intentionally left open for PM decision rather than silently "fixed" in this skill.

1. **Model-emitted `read_text` is not regex-tested.** Pattern 8 covers the *templated* contextual read text and the photo-unreadable fallback. The clean-photo-no-flags path uses the model's own `read_text` field, which is guarded only by the system prompt (Pattern 4) — not by a parser assertion. If the model emits "Mochi looks fine" in the `read_text` field, nothing catches it before display. A defensible defence would be a post-call regex check on the model's `read_text` against the same reassurance vocabulary used in the test. Flagged as a B-028-adjacent follow-up.

2. **`description` field is guarded by prompt only.** Same shape as #1 but for the structured `description` field. Likely lower risk (it's positional/factual by prompt) but worth a one-line assertion.

3. **`VomitAnalysisSection.tsx` carries the no-reassure rule as a comment (`:11–13`).** The component never renders an all-clear UI element — but that's enforced by the absence of a `looks_normal` enum value (Pattern 1), not by any test in the component itself. Acceptable as long as Pattern 1 holds.

4. **No cross-incident-type abstraction yet.** The function is hard-coded for `event_type = 'vomit'`. Generalising to siblings (stool, skin, eye) will need to factor out the patterns above — the natural shape is an `incident_type` parameter on a shared library + per-type schema/prompt/flag-computation modules. This skill assumes that refactor happens with the second incident type, not before (per the "earn the right to abstract" rule).
