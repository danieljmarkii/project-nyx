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

**THE TIER BESIDE THE VERDICT (EN-3, CUL-1133; Engines v3 PR-26).** `recommendation` keeps its three values forever, so installed builds keep today's words. How soon to act lives in a second column, `event_ai_analysis.tier` (migration 079): `call_now` · `call_today` · `logged` · `not_enough_to_say`. None asserts wellness; `logged` is "Keep an eye out" with a watch-for list, never a comment on the absence of concern, and "part of a pattern" is drawn at render and never stored (K2). Under `engines_v3_en3` every write that sets `recommendation` sets `tier` by ONE map (`tierForVerdict`, `lib/incidentTier.ts`): `worth_a_call` → `call_today`, `monitor` → `logged`, `not_enough_to_say` → `not_enough_to_say`, so a vomit with no photo read is `not_enough_to_say` in both columns, never `logged`. Every reader and every guard reads the LOUDER of the two columns (`effectiveTierRank`): a missed dual-write never renders calmer than the verdict, and a flag-off build that writes only the verdict never lowers a tier already on the row. A tier value a build does not know ranks as `call_now`. `tier` is server-written only (079's freeze).

**A VALUE A BUILD DOES NOT KNOW (CUL-1277).** Installed builds outlive any server flag, so every reader sorts a verdict with ONE allowlist of the QUIET values, `QUIET_VERDICTS` in `lib/incidentVerdict.ts` (phone and server import it): off the list is an escalation (the rose, the words "Worth a call", never blank, never folded, rescued through a failed re-read). A guard that PROTECTS an escalation already in the record asks `isEscalationVerdict`, never `=== 'worth_a_call'`; a gate that RELEASES model words (Pattern 10) stays on the literal, because it must fail toward withholding. A quiet verdict stands only on a finished read (`FINISHED_READ_STATUSES`). Adding a value to the quiet list makes it calm everywhere at once, so a wellness value never joins it. `guards/unknownVerdict.test.tsx` and the `CUL-1277` Deno cases pin both halves.

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

**THE FLOOR IN TIERS (EN-3, CUL-1133).** The floor still returns one of the three verdicts, and the tier is mapped from it after every downstream step (the partial-read collapse included), so the floor has no path to a quiet tier over a flag either. Today every escalation maps to `call_today`; a `call_now` is written only by a rule that decides it, with its own review (EN-4's counts, EN-6's photo rows). **The model's own escalation** (its `worth_a_call` with no visual or contextual flag behind it, GAP-31) is `call_today`, keeps its words (Pattern 10 is unchanged: model text rides only the self-escalated path), and is told apart by `tierReasonOf` (`model_only`), never promoted to `call_now`. **Never-lower binds the call tiers only** (`_shared/incident-analysis.ts`): a stored call holds over a quieter verdict (`holdsOver`, reading the louder column), and a call written over a louder stored call keeps the stored tier while its own findings still land (`keepLouderTier`: a hold there would keep fresh blood off the structured columns); `logged` ↔ `not_enough_to_say` moves freely, so an unreadable or partial re-read can still collapse a calm read (B-203, CUL-812).

**A CONTEXTUAL FLAG MUST BE TRUE OF THIS SAMPLE, AND QUIETING NEEDS POSITIVE EVIDENCE (EN-7, CUL-1138).** A flag's words describe the incident it lands on: stool's `concurrent_vomiting` used to describe loose stool over a formed one. Under the key the flag is computed as before the read (so a capped, unreadable, failed or photoless read keeps the call), and is WITHDRAWN only after a complete read shows a formed stool (Bristol 2 to 4) and nothing else asks for it: not logged Loose, the vomiting not meeting the vomit read's repeat rule (`_shared/vomitRepeat.ts`), and not the vomit read's own feline intake arm (the stool asks the vomit's questions, because a photoless vomit gets no read of its own until its record is opened). Each reason has its own sentence. A withdrawal is a bounded framework exception (`ContextualRun.withdrawable` + `afterRead`, `mergeAfterRead`): only named flags, only on a COMPLETE read of a SINGLE-photo event (one set of structured fields cannot speak for several frames), never over an owner's corrected field, never on the cap or rescue path; and an owner's edit away from formed re-runs the read (`needsEn7Recheck`, `lib/stoolForm.ts`, CUL-1408), so a correction always gets the call back. Any other descriptor still cannot weaken the floor.

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

**A run that FAILS keeps the escalation it already computed (CUL-815).** A transient failure (a storage error, a 529, a failed write-back) still ends in the outer catch, but the catch no longer throws away the escalation the run worked out first: `buildRescueRead` takes the run's own post-floor escalation, or the contextual flags alone, and `buildFailureWrite` writes it as `status: 'failed'` with the read fields only (never a structured column). A stored escalation still outranks it (CUL-812, error-only), and an unreadable row still skips (fail closed). And no write is decided on an unanswered read: the step-3b existing-row read throws on error (`existingRowOrThrow`, CUL-817), before the cap gate spends a unit.

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

**CANONICAL EXAMPLE** (`supabase/functions/_shared/incident-analysis.ts` — `buildAnalysisWriteBack`, reached through `resolveReanalysisWrite`, fed by `readStoredRow` in `runIncidentAnalysis`, which throws on a read error; both incident types run through it):

```ts
const existing = await readStoredRow() // existingRowOrThrow: an unanswered read is never "no row"
const humanEdited = !!existing?.edited_at

export function buildAnalysisWriteBack(params): AnalysisWriteBack {
  if (params.humanEdited) {
    // ONLY the read columns. No structured field, no ai_raw_payload.
    return { mode: 'update', values: { ...params.readFields } }
  }
  // First analysis OR re-analysis of an un-edited row: full upsert.
  return { mode: 'upsert', values: {
    ...params.structuredValues,
    event_id: params.eventId, pet_id: params.petId, incident_type: params.incidentType,
    ...params.readFields,
  } }
}
```

**ANTI-PATTERN:** Unconditionally upserting the full AI payload on every re-analysis. The owner's edits — which the vet will rely on — are silently lost on the next trigger.

**Two rules on top, both in `resolveReanalysisWrite` (`_shared/incident-analysis.ts`), decided on a fresh read of the row taken after the vision call:**

- **A re-analysis never LOWERS a stored escalation (CUL-1201 part 2, PM 2026-09-26).** A second run of one incident that sees less is absence, and absence is not wellness. A stored `worth_a_call` is held whatever the calmer run says, across re-reads and photo swaps, contextual escalations included: both descriptors count their context windows back from `Date.now()`, so a lapsed window cannot be told from an owner deleting a duplicate. Nothing is written except, on a row the last run left `failed`, this run's status (`completed` or `uncertain`). There is **no owner-correction exception yet**: `ai_raw_payload` is frozen at the read the owner edited, so it cannot say whether the stored verdict came from that read or from a later re-escalation the owner never saw. The owner's path to lower a verdict needs a read-time stamp (CUL-1201 part 1) or an explicit owner act on the verdict (CUL-1107 / CUL-409). So "a re-analysis refreshes the verdict" above holds only upward or sideways.
- **A stored red flag carries; a stored absence does not (CUL-532).** When the stored structured columns assert a flag (per the descriptor's `presentFlagsFromStructured`, the Pattern 9 derivation) that this run's columns don't, the write refreshes the read fields only. The capped branch never overwrites an existing row's structured columns, and a failed run over a stored flag writes the error only, so the retry frame never hides it. A stored "none visible" is never kept over a read that saw nothing. The per-field union of a stored flag and a DIFFERENT new one is CUL-1110's.

**These are proven through the pipeline, not only the helpers:** `_shared/incident-analysis.pipeline.test.ts` drives the real `runIncidentAnalysis` through a fake client and model (`PipelineDeps`). A new write path or a rebase of this one adds its case there.

**THE OWNER'S HIDE (CUL-1323, PM 2026-09-27).** `dismissed_at` is a statement about the read the owner saw, never about the incident, and every new read clears it: both builder modes, the capped escalation, the failure write's rescue, and a HOLD (it keeps the escalation's words, but a hide on file may predate the client that checks which read it was made on). Only a run that reads nothing keeps it: an error-only failure, a failed upsert, the cap state. A new write path that writes `read_text` or `recommendation` takes its values from `buildAnalysisWriteBack` / `resolveReanalysisWrite` / `buildFailureWrite`, and only those three touch the hide, or the sink scan in `incident-analysis.test.ts` fails the build. The client half is the order: Hide and Show write only over the read on screen, everything Hide takes off it: verdict, words, description and every observation, arrays included (`lib/analysisDismissal.ts`, pinned by rendering each section over a row that records every column it reads), so on that client a read that lands first is never hidden unseen. Builds already on phones hide unconditionally; closing that on the server is CUL-1357, and the same race on Edit is CUL-1356.

---

## PATTERN 8: The Never-Reassure Invariant Is a Test Assertion, Not Just a Comment

**RULE:** Every templated owner-facing string that the function can emit (contextual read text, no-flag fallback, photo-unreadable fallback) must be covered by a test that scans for reassurance words and asserts none appear. Documentation comments are not enough — the test is the guardrail.

**CANONICAL EXAMPLE** (`supabase/functions/analyze-vomit/index.test.ts:545–554`; the regex is now a file-local `REASSURE_VOCAB`, copied word for word at `analyze-stool/index.test.ts:537`, so widen both together):

```ts
// :542 — const REASSURE_VOCAB = /\b(fine|okay|ok|healthy|normal|unremarkable|all clear|nothing (?:to worry|concerning|alarming))\b/i
Deno.test('buildContextualReadText — never reassures', () => {
  for (const t of [
    buildContextualReadText('Mochi', ['feline_reduced_intake']),
    buildContextualReadText('Mochi', ['repeated_vomiting']),
    buildContextualReadText('Mochi', ['concurrent_lethargy']),
  ]) {
    assertEquals(REASSURE_VOCAB.test(t), false)
    assertEquals(t.includes('!'), false)
  }
})
```

**ANTI-PATTERN:** Adding a new templated read string and leaving the invariant as a code comment ("no reassurance here, by convention"). Future copy edits — by you, by me, by a future contributor copying the function for a sibling incident type — will quietly drift. Extend the regex test to every new template before merging.

---

## PATTERN 9: Derive a Red Flag From the Owner-Editable Structured Fields, Never the Cached Read

**Provenance:** re-homed from `CLAUDE.md` § Open Questions 2026-08-02 (B-487). The two rulings behind this pattern — the **B-340** red-flag elevation and the **B-247 PR 3** stool seam — used to live only as resolved rows in that table; they now live here (auto-loaded) and at their code seams. Full records in `docs/decisions-archive.md` → "Re-homed 2026-08-02 (B-487)".

**RULE:** Any surface that *elevates or re-derives* a per-incident red flag from an existing analysis — a Home Signal (B-340), the vet report, an escalation floor, an Ask read — must compute it from the owner-editable **structured clinical fields** (`foreign_material_present`, `blood_present` / `stool_blood_present`, and siblings), **never** from the cached `visual_flags` array or the raw model read. An owner edit (Pattern 7) refreshes the structured fields but deliberately leaves the cached `visual_flags` / `recommendation` untouched, so the array can be stale the moment the owner clears a false flag. Derivation is **present-only** (elevate on the *presence* of a flag; never reassure on its absence — Pattern 1) and subtype-agnostic across the incident family. Two corollaries the two shipped incident types already encode:

- **A monitor-tier visual finding surfaces via a structured field, never `visual_flags`.** Any entry in `visual_flags` forces `worth_a_call`, so a non-escalating observation (stool mucus-without-blood, B-247) rides its own structured column (`stool_mucus_present`) and the `monitor` copy stays generic — naming a benign finding in prose flirts with reassurance-on-absence.
- **A "repeat" escalation keys off the pre-vision, owner-classified contextual flag, not this photo's read.** `repeated_loose_stool` / `repeated_vomiting` are computed before the vision call from the owner's event classifications (Pattern 3), so they survive the per-incident cap and the extraction being flag-gated off (Pattern 2; B-247 seam ruling (a)).

**CANONICAL EXAMPLE** — the readers derive present flags from the structured fields, never the cached array: `generate-signal/detection.ts` `deriveIncidentFlags` (the B-340 lane), `generate-report/report.ts` `unionPresentFlags` / `stoolUnionPresentFlags`, and Ask's `derivePresentFlags` (`ask/tools.ts`). At write time both descriptors' parses union blood / foreign derived from the model's own fresh fields into `visual_flags` — `analyze-stool/index.ts` `parseAnalysisToolResult` (adversarial ①, 2026-07-17) and `analyze-vomit/index.ts` `parseAnalysisToolResult` (CUL-534, 2026-09-26: `fresh_red` / `coffee_ground` → `blood`, `yes` → `suspected_foreign_material`) — so the shared floor escalates on the recorded finding even when the model drops the flag and self-selects `monitor`. The shared pipeline itself does not derive; the descriptor's parse does. **The write-time rule: a descriptor's parse MUST union present-only flags derived from the model's structured fields into `visual_flags` (never replace the model's array, never derive from `unsure`), with either parse as the template.**

```ts
// generate-signal/detection.ts — present-only, each family's blood in its own column.
export function deriveIncidentFlags(a: IncidentAnalysisInput): IncidentFlagKind[] {
  const flags: IncidentFlagKind[] = []
  const cat = incidentCategory(a.incidentType)
  const bloodPresent =
    cat === 'stool' ? a.stoolBloodPresent === 'yes'
    : cat === 'vomit' ? a.bloodPresent === 'fresh_red' || a.bloodPresent === 'coffee_ground'
    : false
  if (bloodPresent) flags.push('blood')
  if (cat !== null && a.foreignMaterialPresent === 'yes') flags.push('foreign_material')
  return flags
}
```

**ANTI-PATTERN:** Reading `analysis.visual_flags` (or `recommendation`) directly to decide whether to elevate. After an owner clears a false flag via the B-028 edit path, that cached array still says "blood" — so you re-raise a flag the owner already corrected, or (the inverted, worse failure) you trust a cleared array and drop a flag the structured fields still assert.

---

## PATTERN 10: Model Free-Text Fields Surface Only on a Self-Escalated worth_a_call (Two-Layer Gate)

**Provenance:** CUL-152 / B-179 (2026-08-17), extending B-060. Applies to EVERY owner-facing free-text string the vision model emits — today `read_text` and `description`; a future incident type's equivalents inherit it. Resolves Ambiguities #1 and #2 below.

**RULE:** The model's free-text fields reach the owner ONLY when the model ITSELF escalated (its own `worth_a_call`) AND the FINAL, post-floor recommendation is a non-contextual, readable `worth_a_call`. Every other path — `monitor`, `not_enough_to_say`, a floor-forced *contextual* escalation, a floor *downgrade* of the model's `worth_a_call`, an unreadable photo — gets a deterministic template (`read_text`) or `null` (`description`), never the model's words. This is Pattern 1 (never reassure on absence) made structural for free text. A regex denylist/strip was tried and rejected (~86% miss — B-060): the guarantee is structural, not lexical.

**Two layers, both required (one alone leaks):**
- **Layer 1 — parse (`parseAnalysisToolResult`):** null the field unless the model's OWN recommendation is `worth_a_call`. Closes "model recorded blood / set a visual flag but self-selected `monitor` with a soft read" — the floor forces `worth_a_call`, but the model's monitor-era prose must not ride it.
- **Layer 2 — post-floor (shared pipeline):** `selectReadText` (`read_text`) and `selectDescription` (`description`) re-gate on the FINAL recommendation. Closes "model self-escalated but the floor DOWNGRADED to `not_enough_to_say`" (e.g. `appears_to_show_subject=false`), where Layer 1 alone leaves reassuring prose on a calm card. *(A parse-only description gate shipping without Layer 2 was a real leak caught by adversarial review — the exact reason both layers are mandatory.)*

**CANONICAL EXAMPLE** (`_shared/incident-analysis.ts` `selectDescription`, applied post-floor in `runIncidentAnalysis`; the Layer-1 gate lives in each descriptor's `parseAnalysisToolResult`):

```ts
// post-floor: mutate `analysis` so the description COLUMN and ai_raw_payload land the null TOGETHER
analysis.description = selectDescription({
  modelDescription: analysis.description,  // already Layer-1-gated (null unless the model self-escalated)
  recommendation, contextualFlags, photoUnreadable,
})
// selectDescription returns the description ONLY when:
//   contextualFlags.length === 0 && !photoUnreadable && recommendation === 'worth_a_call'
// read_text gets the identical post-floor condition inside selectReadText.
```

**CONSISTENCY COROLLARY (owner-edit diff, Pattern 7):** gate where the value lands in BOTH the stored column and `ai_raw_payload`, so `extract*EditableFromPayload`'s baseline never diverges from the column (no spurious "Edited"). An owner-authored field (written via a different path) is NEVER gated.

**ANTI-PATTERN:** gating a model free-text field on only ONE layer — parse-only leaks on a floor downgrade; post-floor-only leaks when a flag forces `worth_a_call` over the model's monitor-era prose. Every model free-text field must pass through both.

---

## Ambiguities Flagged

These are gaps between what the skill claims and what the code currently enforces. #1, #2 and #4 have since been **RESOLVED** (see inline); remaining open items are left for PM decision rather than silently "fixed" in this skill.

1. **Model-emitted `read_text` is not regex-tested.** — **RESOLVED (B-060 + CUL-152).** `read_text` is guarded STRUCTURALLY, not by regex: the descriptor's parse nulls it unless the model self-escalated, and `selectReadText` surfaces it only on a non-contextual, readable, final `worth_a_call`. See **Pattern 10**. (A denylist was tried and rejected — ~86% miss.)

2. **`description` field is guarded by prompt only.** — **RESOLVED (CUL-152 / B-179, 2026-08-17).** `description` now gets the identical two-layer gate as `read_text` (parse + the post-floor `selectDescription`). See **Pattern 10**. The original "worth a one-line assertion" under-scoped it: adversarial review showed a parse-only gate still leaks on a floor downgrade, so both layers are required.

3. **`VomitAnalysisSection.tsx` carries the no-reassure rule as a comment (`:11–13`).** The component never renders an all-clear UI element — but that's enforced by the absence of a `looks_normal` enum value (Pattern 1), not by any test in the component itself. Acceptable as long as Pattern 1 holds. _(Still open — accepted.)_

4. **No cross-incident-type abstraction yet.** — **RESOLVED (B-247 PR 2 / D2, 2026-07-16).** The pipeline is now the shared `_shared/incident-analysis.ts`, parameterized by an `IncidentDescriptor` (analyze-vomit + analyze-stool live on it). The patterns above are framework-owned there; a descriptor controls which findings become flags, never what flags do. A descriptor can still weaken the floor through its parse, which is why Pattern 9's write-time rule exists; both shipped parses now follow it (vomit since CUL-534).
