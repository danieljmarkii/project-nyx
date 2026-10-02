export const meta = {
  name: 'design-critique',
  description: 'Isolated persona lenses critique one surface from the same rendered pixels; a verifier tries to refute every finding; a synthesis turns the survivors into a QA-note critique and decision briefs',
  whenToUse: 'Run by the /design-critique command (.claude/commands/design-critique.md): a mock round before requirements, a spec before build, a shipped surface, a finish pass before GA',
  phases: [
    { title: 'Critique', detail: 'isolated lens reads of the artifact' },
    { title: 'Verify', detail: 'full: one adversarial verifier per lens; light: one verifier across every finding' },
    { title: 'Synthesize', detail: 'merge, dedupe, conflicts, gating changes, decision briefs' },
    { title: 'Completeness', detail: 'full only: a critic hunts for what the critique missed; targeted follow-ups' },
    { title: 'Final', detail: 'full only: fold the follow-ups into the synthesis' },
  ],
}

// The house design critique (CUL-1176), generalized from the script that ran CUL-1108's
// History v2 round-3 critique: nine isolated lenses, a verifier each, a synthesis, a
// completeness critic, follow-ups, a final synthesis (118 confirmed, 12 plausible,
// 13 mock artifacts, 2 refuted). The command file carries the method and the args
// contract; this script carries the orchestration and the lens library.
//
// args: { issue, title, kind: 'mock'|'spec'|'shipped', depth: 'light'|'full', next_step,
//         scratch, repo?, artifact: { sources, renders?, text?, code?, notes? },
//         settled?, overruled?, open?, exclude?, standards?,
//         lenses: [{ key, focus, agentType?, name?, code?, mandate? }] }

const A = args || {}
const art = A.artifact || {}
if (!A.issue || !A.title || !A.scratch || !A.lenses || !A.lenses.length || !['mock', 'spec', 'shipped'].includes(A.kind)) {
  throw new Error('design-critique: args needs issue, title, kind (mock | spec | shipped), scratch and a non-empty lenses list; see .claude/commands/design-critique.md')
}
const SP = A.scratch
const REPO = A.repo || '/home/user/project-nyx'
const DEPTH = A.depth === 'full' ? 'full' : 'light'
const NEXT = A.next_step || 'the next step'
const list = (xs) => (xs && xs.length ? xs.map((x) => `- ${x}`).join('\n') : '- (none named)')

// Mandates are the persona's standing lens (docs/personas.md); the caller's FOCUS is what
// to try to break on THIS surface. A caller may override name, code or mandate per lens.
const LIBRARY = {
  designer: { code: 'DES', name: 'Sr. Product Designer',
    mandate: `You own the seven principles, UX quality, copy voice (.claude/skills/nyx-voice/SKILL.md), the 10-second test and designed empty states, and you hold the Design v2 language (the spine, Principle 8, Principle 9). Benchmark: Calm, Linear, Oura. Would a designer at Calm be proud of this screen?` },
  motion: { code: 'MOT', name: 'Motion Designer',
    mandate: `One physics for the whole app, every motion verified on a phone, six gestures and no more: draw in, open in place, arrive, fold, the wait as the shape of what is coming, the card-to-screen flight. Reviews for: a motion that is not one of the six; chrome that moves on its own; a loop that is not real work; a symptom celebrated; a safety card arriving differently from a benign one; a reset that transitions instead of snapping. Anti-patterns: motion added because a thing looked bare; two engines for one gesture (CLAUDE.md C-30); a duration under 150ms or over 500ms without a reason written down; a gesture with no Reduce Motion frame or no VoiceOver focus rule.` },
  mobile_ia: { code: 'MIA', name: 'Mobile Information Architect',
    mandate: `The fold economics of a 390pt phone. What is above the fold answers the screen's job in one glance; what grows with the record compacts before it scrolls; the thumb's reach and the FAB's footprint are designed, never incidental. Reviews for: a section that grows without a compaction rule; a mark or row too small for a thumb (the 44pt floor, CLAUDE.md C-5); a door where the thing would fit; the FAB covering a control; a first frame that does not say what the screen is for. Anti-pattern: "it will be fine on a real device" without a fixture at real density.` },
  data: { code: 'DAT', name: 'Sr. Data Scientist with the Data Visualization Designer',
    mandate: `Data integrity, correlation rigor, the intake and n=1 invariants, and Principle 8's five columns on every mark: a mark per fact, a count on every mark, the denominator in view, the uncounted disclosed, the window named. Every count is a record fact (C-3); a window may index, only the total may be spoken; a read capped by a setting you cannot see earns completeness from a count (C-42); two counts over one population partition it (C-4); a record-anchored date is free and a duration is guarded (C-19, C-37). Try to break every number and mark with a concrete record shape, and read the shipped predicates before accepting a new one.` },
  drchen: { code: 'VET', name: 'Veterinarian (Dr. Alex Chen)',
    mandate: `You are the clinical end user: "would I trust this for a patient I haven't met?" You guard the n=1 invariant (a single-sample read may escalate on the presence of a red flag, never reassure on its absence) and intake is not preference. Walk the exam-room questions the surface must answer and name the concrete patient case for each finding. Check anything the vet report (docs/nyx-vet-report-requirements.md) would state differently for the same window.` },
  jordan: { code: 'JOR', name: 'Pet Owner (Jordan, a diet-trial dog owner)',
    mandate: `You are Jordan: a dog on an elimination diet trial, told by the vet to log everything, especially vomiting or itching. You ask every screen: "can I do this in under 10 seconds while my dog is being weird?" and "can I answer my vet's question from this?". You are not a designer; you read screens literally. Narrate what you understand in the first ten seconds, attempt real tasks from the renders, count taps, and say what a real owner would misread. Be honest when something is genuinely good.` },
  sam: { code: 'SAM', name: 'Pet Owner (Sam, a grazing, picky cat)',
    mandate: `You are Sam: a cat who grazes and is picky; you can never tell fussy from sick. Some days you log nine small meals, some days you forget after breakfast. Your fear is that the app reassures you when the cat is actually unwell, or makes you feel like a bad owner for gaps. Report what you would misread, what would scare you falsely, what would falsely reassure you, and what is genuinely good.` },
  tns: { code: 'TNS', name: 'Trust and Safety / Privacy',
    mandate: `Data rights, deletion and export, platform compliance, health-photo handling, and anything that widens who can read the pet's health record or the owner's words: notes, search, links carrying ids, multi-pet naming (C-9), shared devices and the sign-out wipe (LOCAL_WIPE_TABLES). Where a finding touches RLS, Storage, deletion or export, say so: the build must route it through the rls-privacy-reviewer.` },
  eng: { code: 'ENG', name: 'Dir. of Engineering with Sr. QA',
    mandate: `Architecture integrity and tech-debt prevention (managed Expo, local-first SQLite plus Supabase sync, last write wins, soft deletes, UTC stored, Zustand), and as QA, acceptance-criteria testability, edge cases and regressions. Your question: can this be specified so it is buildable on the shipped code without a second source of truth, and testable so that a guard reds when it breaks? Map each element to what exists and what is new, and list the fixtures the next step must name.` },
}

const LENSES = A.lenses.map((l) => {
  const base = LIBRARY[l.key] || {}
  const L = { ...base, ...l }
  if (!L.name || !L.code || !L.mandate || !L.focus) {
    throw new Error(`design-critique: lens "${l.key}" needs a focus, and a name, code and mandate unless it is one of: ${Object.keys(LIBRARY).join(', ')}`)
  }
  return L
})

const KIND_LINE = {
  mock: 'a design mock: an HTML page whose frames stand in for the app',
  spec: 'a requirements spec: the text is the artifact, and any mock it cites is secondary evidence',
  shipped: 'a shipped surface: its code plus screenshots. No one tapped a device, so mark any finding that needs a device to confirm',
}

const SETTLED_BLOCK = `SETTLED rulings:
${list(A.settled)}
OVERRULED dissents (recorded):
${list(A.overruled)}
OPEN items (carry them; say what ${NEXT} must say about each):
${list(A.open)}`

const COMMON = `
You are one lens in an ISOLATED design critique of ${A.title} for Culprit (the Nyx pet-health app), Linear issue ${A.issue}. This is DISCOVERY: do not redraw, do not build, do not edit any file in the repo, never post to Linear or GitHub. You may write scratch files only under ${SP}/<your-lens-key>/.

THE ARTIFACT UNDER CRITIQUE (${KIND_LINE[A.kind]})
Sources, the evidence for what the design intends (paths relative to ${REPO}):
${list(art.sources)}
Renders: ${art.renders ? `${art.renders}. READ ${art.renders}/MANIFEST.md FIRST, then Read the PNGs (the Read tool shows images). The renders are the primary evidence for anything visual. Where a render and a source disagree, that disagreement is itself a finding: say which one the design intends.` : 'none. Say so in any finding about how something looks.'}
${art.text ? `Extracted text: ${art.text}\n` : ''}Shipped code to compare against:
${list(art.code)}
${art.notes ? `Notes: ${art.notes}\n` : ''}
WHAT IS SETTLED: carry these; do not re-argue them
${SETTLED_BLOCK}
A settled ruling is the PM's. You may challenge one ONLY with evidence the ruling could not have had (a render defect, a code constraint, a counterexample); then mark it relation_to_settled = "challenges_settled_with_new_evidence" and frame it as a better-than-the-rule brief (the ruling, what it protected, the better thing, whether the protection still holds). A settled item re-argued on taste alone is not a finding.

ISOLATION
Form your read from the artifact, the renders, the standards and the shipped code. ${A.exclude && A.exclude.length ? `Do NOT read these until your findings are written: ${A.exclude.join('; ')}.` : 'Do NOT read earlier deliberation about this surface (its Linear comments, its session records in docs/sessions/) until your findings are written.'} Afterwards you may consult it ONLY to mark a finding as carried (already recorded) rather than new.

THE STANDARDS YOU CRITIQUE AGAINST
- The seven design principles: ${REPO}/docs/nyx-design-principles-v1_0.md (summarised in CLAUDE.md), and the two safety invariants: intake is not preference; n=1 never reassures.
- The Design v2 language: the spine (Home's node rows); the six gestures (docs/personas.md § Motion Designer); Principle 8 "the data is the delight" and its five-column check (a mark per fact · a count on every mark · the denominator in view · the uncounted disclosed · the window named; docs/culprit-design-v4-mockups.html §05 and §07); Principle 9 "motion is the record moving".
- The house rules in CLAUDE.md (conventions C-1 onward): cite them by number where one applies.
- Your own lens's entry in ${REPO}/docs/personas.md, read in full.
${A.standards && A.standards.length ? A.standards.map((s) => `- Also: ${s}`).join('\n') : ''}

OUTPUT
Report in the PM's QA-note taxonomy. category is exactly one of: broken (does not do what it claims, or a render or logic defect), works_but_confusing (works as drawn but a real owner or vet would misread it), design_gap (a state, case or rule it does not cover), missing_follow_up (something that must be filed or sequenced elsewhere), pm_decision (needs a ruling the team cannot make), backlog (real, worth doing, not gating). For each finding give the concrete evidence (a render filename, a § or rule id, or file:line), the principle, Design v2 rule or convention it offends, the counterexample you tried (mandatory for any clinical, statistical or count claim: name the concrete record shape that breaks it), what should change in ${NEXT} (never a redraw), and whether it gates ${NEXT}. Also list in "held" the attempts you made that FAILED to break it: a critique that only lists defects is half a critique. Aim for depth over count: ${DEPTH === 'full' ? '6 to 18' : '4 to 10'} findings, each specific. Use ids prefixed with your lens code.`

const CATEGORY = ['broken', 'works_but_confusing', 'design_gap', 'missing_follow_up', 'pm_decision', 'backlog']

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    lens: { type: 'string' },
    verdict: { type: 'string', enum: ['READY', 'READY_WITH_CONDITIONS', 'NOT_READY'] },
    verdict_why: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          category: { type: 'string', enum: CATEGORY },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          where: { type: 'string' },
          evidence: { type: 'string' },
          principle_or_rule: { type: 'string' },
          counterexample: { type: 'string' },
          resolution: { type: 'string' },
          gates_next_step: { type: 'boolean' },
          relation_to_settled: { type: 'string', enum: ['new', 'carried_open_item', 'challenges_settled_with_new_evidence'] },
          settled_item_ref: { type: 'string' },
        },
        required: ['id', 'title', 'category', 'severity', 'where', 'evidence', 'principle_or_rule', 'counterexample', 'resolution', 'gates_next_step', 'relation_to_settled'],
      },
    },
    held: { type: 'array', items: { type: 'string' } },
  },
  required: ['lens', 'verdict', 'verdict_why', 'findings', 'held'],
}

const RESULT_ITEM = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    verdict: { type: 'string', enum: ['CONFIRMED', 'PLAUSIBLE', 'REFUTED', 'MOCK_ARTIFACT'] },
    why: { type: 'string' },
    checked: { type: 'string' },
    corrected_category: { type: 'string', enum: [...CATEGORY, 'unchanged'] },
    corrected_severity: { type: 'string', enum: ['high', 'medium', 'low', 'unchanged'] },
    corrected_gates: { type: 'string', enum: ['true', 'false', 'unchanged'] },
    reargues_settled_without_new_evidence: { type: 'boolean' },
    sharpened_resolution: { type: 'string' },
  },
  required: ['id', 'verdict', 'why', 'checked', 'corrected_category', 'corrected_severity', 'corrected_gates', 'reargues_settled_without_new_evidence'],
}

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    results: { type: 'array', items: RESULT_ITEM },
    missed: { type: 'array', items: { type: 'string' } },
  },
  required: ['results', 'missed'],
}

const lensPrompt = (L) => `${COMMON}

YOUR LENS: ${L.name} (id prefix ${L.code}; your scratch dir is ${SP}/${L.key}/)
${L.mandate}

WHAT TO LOOK AT, AT MINIMUM, ON THIS SURFACE
${L.focus}

Return the structured result. Set "lens" to "${L.name}".`

const VERIFIER_BRIEF = `Your job is to try to REFUTE each finding below, not to agree with it. Do not edit any repo file; scratch only under ${SP}/verify/. Never post to Linear or GitHub.

The artifact (${KIND_LINE[A.kind]}): ${list(art.sources)}
Renders: ${art.renders ? `${art.renders} (read MANIFEST.md, then the PNGs a finding cites)` : 'none'}. Shipped code: ${REPO}${art.code && art.code.length ? ` (${art.code.join(', ')})` : ''}. House rules: CLAUDE.md (C-1 onward). Principles: docs/nyx-design-principles-v1_0.md. Personas: docs/personas.md.

A finding that re-argues a settled ruling on taste alone, without new evidence, must be flagged reargues_settled_without_new_evidence = true.
${SETTLED_BLOCK}

For EACH finding: check the claim against the sources (grep a mock's script and CSS for the rule or fixture that produces it), the renders and the code. Verdicts: CONFIRMED (you reproduced it), PLAUSIBLE (consistent with the evidence but not reproducible from what exists), REFUTED (the evidence contradicts it: say exactly how), MOCK_ARTIFACT (a defect of a mock's harness or CSS that does not represent the design's intent; say whether ${NEXT} must still specify the behaviour the artifact exposes). Correct the category, severity and gating where the lens over- or under-stated them (a taste preference is not "broken"; a count that can lie is not "low"). Sharpen the resolution into a sentence ${NEXT} can carry. Finally, list in "missed" anything important the lens's remit should have caught and did not (concrete, with evidence).`

const verifyPrompt = (L, r) => `You are an ADVERSARIAL VERIFIER for one lens of an isolated design critique (${A.issue}, ${A.title}, Culprit/Nyx). ${VERIFIER_BRIEF}

THE LENS: ${L.name}
Its verdict: ${r.verdict}: ${r.verdict_why}
Its findings (JSON):
${JSON.stringify(r.findings, null, 1)}
Its "held" list:
${JSON.stringify(r.held, null, 1)}`

const verifyAllPrompt = (reads) => `You are the ADVERSARIAL VERIFIER for every lens of an isolated design critique (${A.issue}, ${A.title}, Culprit/Nyx). ${VERIFIER_BRIEF}

Finding ids are unique across lenses (each carries its lens's prefix). Verify every one.

THE LENSES' OUTPUTS (JSON):
${JSON.stringify(reads.map((d) => ({ lens: d.lens, verdict: d.read.verdict, verdict_why: d.read.verdict_why, findings: d.read.findings, held: d.read.held })), null, 1)}`

phase('Critique')
log(`${DEPTH} critique of ${A.title}: ${LENSES.length} isolated lenses`)

const lensOpts = (L) => ({ label: `lens:${L.key}`, phase: 'Critique', schema: FINDINGS_SCHEMA, ...(L.agentType ? { agentType: L.agentType } : {}) })

let done
if (DEPTH === 'full') {
  // One verifier per lens, pipelined: a lens is verified the moment its read lands.
  done = (await pipeline(
    LENSES,
    (L) => agent(lensPrompt(L), lensOpts(L)),
    (r, L) => {
      if (!r) return null
      return agent(verifyPrompt(L, r), { label: `verify:${L.key}`, phase: 'Verify', schema: VERIFY_SCHEMA })
        .then((v) => ({ lens: L.name, key: L.key, code: L.code, read: r, verify: v }))
    },
  )).filter(Boolean)
} else {
  // Light: one verifier sees every finding, so it waits for all the reads (a real barrier).
  const reads = (await parallel(LENSES.map((L) => () => agent(lensPrompt(L), lensOpts(L)).then((r) => (r ? { lens: L.name, key: L.key, code: L.code, read: r } : null))))).filter(Boolean)
  const v = reads.length ? await agent(verifyAllPrompt(reads), { label: 'verify:all', phase: 'Verify', schema: VERIFY_SCHEMA }) : null
  done = reads.map((d) => ({ ...d, verify: v }))
}

const dropped = LENSES.filter((L) => !done.find((d) => d.key === L.key)).map((L) => L.key)
if (dropped.length) log(`Lenses with no result: ${dropped.join(', ')}`)

// Merge each finding with its verification (plain code).
const merged = done.map((d) => {
  const vmap = {}
  ;((d.verify && d.verify.results) || []).forEach((x) => { vmap[x.id] = x })
  return {
    lens: d.lens, code: d.code, verdict: d.read.verdict, verdict_why: d.read.verdict_why, held: d.read.held,
    findings: d.read.findings.map((f) => ({ ...f, verification: vmap[f.id] || { verdict: 'UNVERIFIED' } })),
  }
})
const missed = done.length ? (DEPTH === 'full' ? done.flatMap((d) => (d.verify && d.verify.missed) || []) : ((done[0].verify && done[0].verify.missed) || [])) : []
const total = merged.reduce((n, m) => n + m.findings.length, 0)
const count = (v) => merged.reduce((n, m) => n + m.findings.filter((f) => f.verification.verdict === v).length, 0)
log(`${total} findings from ${merged.length} lenses: ${count('CONFIRMED')} confirmed, ${count('PLAUSIBLE')} plausible, ${count('MOCK_ARTIFACT')} mock artifacts, ${count('REFUTED')} refuted, ${count('UNVERIFIED')} unverified`)

const SYNTH_SCHEMA = {
  type: 'object',
  properties: {
    overall_verdict: { type: 'string', enum: ['READY', 'READY_WITH_CONDITIONS', 'NOT_READY'] },
    overall_summary: { type: 'string' },
    lens_verdicts: { type: 'array', items: { type: 'object', properties: { lens: { type: 'string' }, verdict: { type: 'string' }, why: { type: 'string' } }, required: ['lens', 'verdict', 'why'] } },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          category: { type: 'string', enum: CATEGORY },
          title: { type: 'string' },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          lenses: { type: 'array', items: { type: 'string' } },
          source_ids: { type: 'array', items: { type: 'string' } },
          where: { type: 'string' },
          evidence: { type: 'string' },
          counterexample: { type: 'string' },
          resolution: { type: 'string' },
          gates_next_step: { type: 'boolean' },
          verification: { type: 'string' },
          shipped_defect: { type: 'boolean' },
        },
        required: ['id', 'category', 'title', 'severity', 'lenses', 'source_ids', 'where', 'evidence', 'resolution', 'gates_next_step', 'verification', 'shipped_defect'],
      },
    },
    conflicts: {
      type: 'array',
      items: { type: 'object', properties: { topic: { type: 'string' }, sides: { type: 'array', items: { type: 'object', properties: { lens: { type: 'string' }, position: { type: 'string' } }, required: ['lens', 'position'] } }, pm_decision_needed: { type: 'string' } }, required: ['topic', 'sides', 'pm_decision_needed'] },
    },
    gating_changes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          change: { type: 'string' },
          why: { type: 'string' },
          kind: { type: 'string', enum: ['rule', 'pm_ruling', 'sequencing'] },
          from_items: { type: 'array', items: { type: 'string' } },
          brief_deciding: { type: 'string' },
          brief_options: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, line: { type: 'string' }, recommended: { type: 'boolean' } }, required: ['label', 'line', 'recommended'] } },
          brief_recommendation_why: { type: 'string' },
          brief_dissent: { type: 'string' },
          brief_consequence: { type: 'string' },
        },
        required: ['id', 'change', 'why', 'kind', 'from_items'],
      },
    },
    carried_open_items: { type: 'array', items: { type: 'object', properties: { item: { type: 'string' }, status: { type: 'string' }, what_next_step_must_say: { type: 'string' } }, required: ['item', 'status', 'what_next_step_must_say'] } },
    held: { type: 'array', items: { type: 'string' } },
    refuted_or_artifact: { type: 'array', items: { type: 'object', properties: { source_id: { type: 'string' }, title: { type: 'string' }, why: { type: 'string' } }, required: ['source_id', 'title', 'why'] } },
  },
  required: ['overall_verdict', 'overall_summary', 'lens_verdicts', 'items', 'conflicts', 'gating_changes', 'carried_open_items', 'held', 'refuted_or_artifact'],
}

const synthPrompt = (inputs, extra) => `You are the synthesis editor for an isolated design critique (${A.issue}, ${A.title}, Culprit/Nyx), writing for a PM who reads plainly and rules from decision briefs. Do not edit any repo file; never post anywhere.

Below are the verified findings of ${inputs.length} isolated lenses. Each finding carries its verifier's verdict (CONFIRMED / PLAUSIBLE / REFUTED / MOCK_ARTIFACT / UNVERIFIED) and any corrected category, severity or gating. Your job:
1. Drop REFUTED findings from the critique (list them in refuted_or_artifact with why). Keep a MOCK_ARTIFACT finding ONLY where the verifier says ${NEXT} must still specify the behaviour the artifact exposes (the item is then about ${NEXT}, not the mock); otherwise list it in refuted_or_artifact.
2. Move any finding flagged reargues_settled_without_new_evidence out of the critique body (into refuted_or_artifact: "re-argues a PM ruling on taste"). Keep challenges_settled_with_new_evidence as better-than-the-rule items (category pm_decision) naming the ruling, what it protected, the better thing, and whether the protection still holds.
3. MERGE duplicates across lenses into one item (union the lenses and source_ids; keep the strongest evidence and the sharpest resolution; the highest justified severity). Apply the verifier's corrections. Every item keeps a concrete counterexample where the claim is clinical, statistical or a count.
4. Categorise into exactly the QA-note taxonomy (broken · works_but_confusing · design_gap · missing_follow_up · pm_decision · backlog). Number items within category: BRK-1…, WBC-1…, GAP-1…, MFU-1…, PMD-1…, BKL-1…
5. Mark shipped_defect = true only for a defect in code that is ALREADY SHIPPED (it can be filed and fixed today, whatever happens to the proposal); false for anything about the proposal itself.
6. Surface genuine persona conflicts (two lenses want incompatible things) under the Persona Conflict Protocol: each side's position and the one PM decision needed. Never resolve a conflict silently.
7. Produce gating_changes: the SHORT list of what must change or be decided BEFORE ${NEXT}. kind = rule (the team can write it as a rule; no ruling needed), pm_ruling (needs the PM: then fill the brief: brief_deciding = one line on what changes with the answer; brief_options = 2 to 4 real options, one line each, with the team's recommendation marked; brief_recommendation_why = one line; brief_dissent if a lens dissents; brief_consequence = one line on what the ruling unblocks or forecloses), or sequencing (an ordering constraint with another issue). Be ruthless: a gating change is something ${NEXT} cannot be done correctly without. Everything else stays in the taxonomy. Aim for ${DEPTH === 'full' ? '5 to 12' : '2 to 6'}.
8. carried_open_items: for each OPEN item below, its status after this critique (unchanged / sharpened / now blocking / resolved by evidence) and exactly what ${NEXT} must say about it.
${list(A.open)}
9. held: the strongest falsification attempts that FAILED (the design survived), at most 12, each naming the lens and the attempt.
10. lens_verdicts: each lens's own verdict and one-line why, as the lens gave it (never overwrite a lens's verdict).
11. overall_verdict and a four to six sentence overall_summary in plain English.

Write in plain, direct English. No em dashes, and no hyphens used as dashes in prose; use commas, colons or full stops. Keep each item's fields tight (evidence and resolution one to three sentences each).
${extra || ''}
${missed.length ? `\nWHAT THE VERIFIERS SAY THE LENSES MISSED (weigh each; add an item only where the evidence holds):\n${list(missed)}\n` : ''}
THE VERIFIED LENS OUTPUTS (JSON):
${JSON.stringify(inputs, null, 1)}`

phase('Synthesize')
const synth = await agent(synthPrompt(merged, ''), { label: 'synthesize', phase: 'Synthesize', schema: SYNTH_SCHEMA })

if (DEPTH !== 'full') {
  return { final: synth, depth: DEPTH, merged, missed, dropped_lenses: dropped }
}

phase('Completeness')
const CRITIC_SCHEMA = {
  type: 'object',
  properties: {
    gaps: { type: 'array', items: { type: 'object', properties: { what: { type: 'string' }, why_it_matters: { type: 'string' }, lens: { type: 'string', enum: LENSES.map((L) => L.key) }, question: { type: 'string' } }, required: ['what', 'why_it_matters', 'lens', 'question'] } },
    uncited_renders: { type: 'array', items: { type: 'string' } },
    dropped_wrongly: { type: 'array', items: { type: 'object', properties: { source_id: { type: 'string' }, why: { type: 'string' } }, required: ['source_id', 'why'] } },
    miscategorised: { type: 'array', items: { type: 'object', properties: { item_id: { type: 'string' }, should_be: { type: 'string' }, why: { type: 'string' } }, required: ['item_id', 'should_be', 'why'] } },
    gating_list_problems: { type: 'array', items: { type: 'string' } },
  },
  required: ['gaps', 'uncited_renders', 'dropped_wrongly', 'miscategorised', 'gating_list_problems'],
}
const critic = await agent(`You are the COMPLETENESS CRITIC for an isolated design critique (${A.issue}, ${A.title}, Culprit/Nyx). Do not edit any repo file; never post anywhere; scratch only under ${SP}/critic/.

Ask: what did this critique MISS? Check the synthesis against (a) every section and rule of the artifact (${(art.sources || []).join(', ')}${art.text ? `; extracted text at ${art.text}` : ''}); (b) every render${art.renders ? ` in ${art.renders} (read MANIFEST.md; list in uncited_renders every render no finding cites, and look at those)` : ''}; (c) each of the seven principles, the two safety invariants, and the Design v2 language (the spine, the six gestures, Principle 8's five columns); (d) the open items; (e) accessibility (VoiceOver, Dynamic Type, Reduce Motion, colour carrying meaning alone), multi-pet, a brand-new account with nothing logged, a very long record, offline, and the shipped pieces of this surface the artifact does not mention${art.code && art.code.length ? ` (${art.code.join(', ')})` : ''}. Also check the synthesis did not wrongly drop a finding (compare against the raw lens outputs below), did not miscategorise, and that the gating list is neither padded nor missing something ${NEXT} genuinely cannot be done without.

Return up to 6 gaps, each assigned to the lens best placed to answer it (lens keys: ${LENSES.map((L) => L.key).join(', ')}) with one precise question.

THE SYNTHESIS (JSON):
${JSON.stringify(synth, null, 1)}

THE RAW VERIFIED LENS OUTPUTS (JSON):
${JSON.stringify(merged, null, 1)}`, { label: 'completeness-critic', phase: 'Completeness', schema: CRITIC_SCHEMA })

const gaps = ((critic && critic.gaps) || []).slice(0, 6)
if (critic && critic.gaps && critic.gaps.length > 6) log(`Critic raised ${critic.gaps.length} gaps; following up the first 6`)
log(`Critic: ${gaps.length} gaps, ${((critic && critic.dropped_wrongly) || []).length} wrongly dropped, ${((critic && critic.miscategorised) || []).length} miscategorised`)

const followups = await parallel(gaps.map((g, i) => () => {
  const L = LENSES.find((x) => x.key === g.lens) || LENSES[0]
  return agent(`${COMMON}

YOUR LENS: ${L.name} (id prefix ${L.code}F; scratch dir ${SP}/${L.key}-followup-${i}/)
${L.mandate}

This is a FOLLOW-UP. The critique's completeness critic found a gap in your remit:
WHAT WAS MISSED: ${g.what}
WHY IT MATTERS: ${g.why_it_matters}
THE QUESTION: ${g.question}

Answer it with findings in the same shape (verify each yourself against the sources, the renders and the code before reporting it; say in the evidence field what you checked). If the gap turns out to be covered, return zero findings and say so in "held". Set "lens" to "${L.name} (follow-up)".`, { label: `followup:${L.key}:${i}`, phase: 'Completeness', schema: FINDINGS_SCHEMA, ...(L.agentType ? { agentType: L.agentType } : {}) })
}))

phase('Final')
const fu = followups.filter(Boolean)
let final = synth
if (fu.length || (critic && ((critic.dropped_wrongly || []).length || (critic.miscategorised || []).length || (critic.gating_list_problems || []).length))) {
  final = await agent(synthPrompt(merged, `
THIS IS THE FINAL PASS. You already produced the synthesis below; a completeness critic reviewed it and follow-up reads answered its gaps. Produce the corrected, complete synthesis: fold in the follow-up findings (they were self-verified; treat them as CONFIRMED unless their evidence says otherwise), restore anything the critic shows was wrongly dropped, fix the miscategorisations the critic names where you agree (where you disagree, keep your call), and fix the gating list's problems. Keep item ids stable where an item is unchanged.

YOUR PREVIOUS SYNTHESIS (JSON):
${JSON.stringify(synth, null, 1)}

THE CRITIC (JSON):
${JSON.stringify(critic, null, 1)}

THE FOLLOW-UP FINDINGS (JSON):
${JSON.stringify(fu, null, 1)}`), { label: 'final-synthesis', phase: 'Final', schema: SYNTH_SCHEMA })
}

return { final: final || synth, first_synthesis: synth, depth: DEPTH, critic, followups: fu, merged, missed, dropped_lenses: dropped }
