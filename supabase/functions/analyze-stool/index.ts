// Supabase Edge Function — analyze-stool
// Per-incident AI analysis for stool events (B-247, second child of B-013).
//
// The SECOND incident type on the shared pipeline. Structurally identical to
// analyze-vomit — one Claude Sonnet vision call turns a single stool photo into
// (1) structured clinical fields (Bristol consistency, colour, blood, mucus,
// foreign material) and (2) an n=1 owner-facing read — but the clinical content
// is stool-specific: the Bristol Stool Scale (Type 1-7) that vets already think
// in (D3), a fresh-red/melena blood split, and a mucus finding that surfaces to
// the owner WITHOUT escalating.
//
// This file is the STOOL DESCRIPTOR. The pipeline itself — auth, cap/flag gate,
// image handling, vision call, escalation floor, never-clobber write-back — lives
// in _shared/incident-analysis.ts (B-247 PR 2, D2). Here we supply only: the
// enums, tool schema, system prompt, contextual-flag SQL, owner-facing copy, and
// Track-2 keys. Reads are ownership-scoped via the caller's JWT (RLS); storage
// download + write-back use the service role (trusted pipeline).
//
// Dr. Chen's asymmetry (clinical-guardrails, inherited in full — its DoD line is
// NOT inherited from vomit's prior review): the read ESCALATES on the PRESENCE
// of a red flag (visible blood, foreign material, or a deterministic contextual
// flag) and NEVER reassures on the ABSENCE of one. The recommendation enum has
// no reassuring value; a single loose/watery stool with no other flag is
// monitor-tier, never an all-clear.
//
// D5 escalation rules (docs/nyx-stool-analysis-requirements.md §2, §5):
//   - VISUAL flags (model-raised, force worth_a_call): blood present (fresh OR
//     dark/tarry melena), suspected foreign material.
//   - CONTEXTUAL flags (server-computed, force worth_a_call): repeated_loose_stool
//     (the diarrhea-persistence signal), concurrent_vomiting, concurrent_lethargy.
//   - Mucus WITHOUT blood is monitor-tier: it surfaces via the stool_mucus_present
//     structured field, and is deliberately NOT a visual flag (any visual_flags
//     entry forces worth_a_call — B-247 seam ruling 2026-07-17).
//   - A single Type 7 (watery) is monitor-tier; the REPEAT is what escalates, and
//     the repeat is the owner-classified repeated_loose_stool contextual flag —
//     NOT this photo's Bristol read. (Seam ruling (a) 2026-07-17: prior-events-
//     only, pre-vision, so it survives the cap. The AI's Type-7 read still shows
//     as a monitor-tier structured field; it just doesn't drive escalation alone.)

import {
  RECOMMENDATIONS,
  type Recommendation,
  type ClaudeResponse,
  type SupabaseClient,
  type FunctionCaps,
  type IncidentCopy,
  type IncidentDescriptor,
  type AnalysisWriteBack,
  type AnalysisReadFields as IncidentAnalysisReadFields,
  getToolUseInput,
  sanitizeEnum,
  sanitizeEnumArray,
  hoursBetween,
  applyEscalationFloor as applyIncidentEscalationFloor,
  selectReadText as selectIncidentReadText,
  buildAnalysisWriteBack as buildIncidentAnalysisWriteBack,
  runIncidentAnalysis,
} from '../_shared/incident-analysis.ts'

// Re-export the incident-agnostic pure helpers (and their types) under this
// function's import surface, mirroring analyze-vomit — so index.test.ts imports
// everything it asserts from './index.ts', and the shared gate/encoder helpers
// are unit-tested here too (they ship inlined into this bundle).
export {
  detectImageMediaType,
  bytesToBase64,
  resolveGateState,
  resolveFlagValue,
  resolveCaps,
} from '../_shared/incident-analysis.ts'
export type { FunctionCaps, GateState, AnalysisWriteBack } from '../_shared/incident-analysis.ts'

// ── Clinical thresholds (Dr. Chen — PR 3 build-time call; adversarial target) ──
// repeated_loose_stool is the diarrhea-PERSISTENCE signal vets act on: more than
// one loose/watery stool inside a day (§5.3, "≥2 diarrhea/loose events in a
// rolling window"). Counted over OWNER-CLASSIFIED 'diarrhea' events (the Loose
// sub-step of the Stool log), NOT the AI's Bristol read — the seam ruling (a):
// this is pre-vision context, so a capped/flagged-off incident still escalates.
// A single loose stool stays monitor-tier. The exact 2-in-24h threshold is the
// safe-direction floor for a safety lane; a longer persistence window (e.g.
// 3-in-72h) is a possible future refinement, deliberately out of scope for v1.
const REPEAT_LOOSE_STOOL_WINDOW_HOURS = 24
const REPEAT_LOOSE_STOOL_COUNT = 2
// Concurrent GI/systemic signals within the prior day (D5) — vomiting alongside
// diarrhea runs a pet down fast (fluid loss), and lethargy alongside GI upset is
// the "more than a tummy ache" cue. Presence within the window is enough.
const CONCURRENT_VOMITING_HOURS = 24
const CONCURRENT_LETHARGY_HOURS = 24

// ── Enum vocabularies (must match the DB enums in migration 034) ──────────────
// Bristol Stool Scale Type 1-7 (D3). Type 4 is the "normal" reference point;
// 1-2 trend constipation, 5-7 trend loose/diarrhoeal.
const CONSISTENCIES = [
  'type_1_hard_lumps', 'type_2_lumpy', 'type_3_cracked', 'type_4_smooth_soft',
  'type_5_soft_blobs', 'type_6_mushy', 'type_7_watery', 'unsure',
] as const
const COLOURS = ['brown', 'dark_brown', 'yellow', 'green', 'black_tarry', 'grey_pale', 'red_streaked', 'unsure'] as const
const CONTENTS = ['undigested_food', 'grass', 'hair', 'unsure'] as const
const TRISTATE = ['yes', 'no', 'unsure'] as const
// stool_blood_type is a free-text column; sanitise it to this closed set so a
// hallucinated value never lands. Only meaningful when blood_present = 'yes'.
const BLOOD_TYPES = ['fresh_red', 'dark_tarry'] as const
// ESCALATING visual flags ONLY (any entry forces worth_a_call). Mucus is NOT
// here — mucus-without-blood is monitor-tier and surfaces via stool_mucus_present.
const VISUAL_FLAGS = ['blood', 'suspected_foreign_material'] as const

type ContextualFlag = 'repeated_loose_stool' | 'concurrent_vomiting' | 'concurrent_lethargy'

// ── Types ─────────────────────────────────────────────────────────────────────

interface StoolToolInput {
  appears_to_show_stool?: boolean
  consistency?: string
  colour?: string
  contents?: string[]
  blood_present?: string
  blood_type?: string
  mucus_present?: string
  foreign_material_present?: string
  foreign_material_note?: string
  description?: string
  visual_flags?: string[]
  recommendation?: string
  read_text?: string
  confidence?: Record<string, number>
}

// Normalised structured output of the vision call.
export interface StoolAnalysis {
  appears_to_show_stool: boolean
  consistency: string | null
  colour: string | null
  contents: string[] | null
  blood_present: string | null
  blood_type: string | null
  mucus_present: string | null
  foreign_material_present: string | null
  foreign_material_note: string | null
  description: string | null
  visual_flags: string[]
  recommendation: Recommendation
  read_text: string | null
  confidence: Record<string, number> | null
}

// ── Vision tool schema ──────────────────────────────────────────────────────────
// Tool use forces structured JSON. The model returns 'unsure' (not a guess) for
// any field it cannot read (carried from the vomit / food-extraction rule).

const ANALYZE_TOOL = {
  name: 'analyze_stool',
  description:
    'Record structured observations and a single-instance owner-facing read for one photo of pet stool (faeces). ' +
    'Return "unsure" for any field not clearly visible — never guess.',
  input_schema: {
    type: 'object',
    properties: {
      appears_to_show_stool: {
        type: 'boolean',
        description: 'True only if the photo plausibly shows pet stool/faeces. False if it shows something else (the pet, food, vomit, an empty floor, etc.).',
      },
      consistency: {
        type: 'string',
        enum: CONSISTENCIES,
        description:
          'Bristol Stool Scale type from the photo: type_1_hard_lumps (separate hard lumps), type_2_lumpy (lumpy sausage), ' +
          'type_3_cracked (sausage with surface cracks), type_4_smooth_soft (smooth soft sausage — the normal reference), ' +
          'type_5_soft_blobs (soft blobs, clear edges), type_6_mushy (mushy, ragged edges), type_7_watery (liquid, no solid pieces).',
      },
      colour: { type: 'string', enum: COLOURS, description: 'Dominant colour. black_tarry = very dark/tarry (possible digested blood); red_streaked = streaks of fresh red; grey_pale = pale/clay-coloured.' },
      contents: {
        type: 'array',
        items: { type: 'string', enum: CONTENTS },
        description: 'Visible non-faecal material in the stool (may be several): undigested food, grass, hair. Do NOT include blood, mucus, or foreign material here — those have dedicated fields.',
      },
      blood_present: {
        type: 'string',
        enum: TRISTATE,
        description: 'Is blood visible in or on the stool? yes / no / unsure. Both bright-red surface streaks AND dark tarry/black stool (digested blood) count as yes.',
      },
      blood_type: {
        type: 'string',
        enum: BLOOD_TYPES,
        description: 'Only if blood_present = yes: fresh_red = bright/red blood on the surface; dark_tarry = black, tarry, or coffee-coloured stool (digested blood).',
      },
      mucus_present: {
        type: 'string',
        enum: TRISTATE,
        description: 'Is a slimy/jelly-like mucus coating visible? yes / no / unsure. Report it if seen, but mucus on its own is NOT a red flag — do not set a visual_flag for it.',
      },
      foreign_material_present: { type: 'string', enum: TRISTATE, description: 'Anything that is not food/faeces — fabric, plastic, string, a foreign object that looks non-dietary?' },
      foreign_material_note: { type: 'string', description: 'Short plain description of the suspected foreign material, only if foreign_material_present = yes.' },
      description: {
        type: 'string',
        description: 'One or two calm, plain-language sentences describing what is visible. Owner-facing. Describe texture in plain words ("soft and unformed", "watery", "firm"), not the Bristol number. No jargon, no diagnosis, no exclamation marks.',
      },
      visual_flags: {
        type: 'array',
        items: { type: 'string', enum: VISUAL_FLAGS },
        description: 'Set "blood" if blood_present is yes (either fresh_red or dark_tarry). Set "suspected_foreign_material" if foreign_material_present is yes. Do NOT set any flag for mucus or for a watery/loose stool on its own — those are not red flags.',
      },
      recommendation: {
        type: 'string',
        enum: RECOMMENDATIONS,
        description:
          "worth_a_call = a visible red flag is present (blood, or foreign material); monitor = this photo shows nothing obviously concerning ON ITS OWN — including a single loose or watery stool, or mucus, with no blood or foreign material; " +
          "not_enough_to_say = the photo is unclear or does not appear to show stool. NEVER choose a value that reassures the owner the pet is well.",
      },
      read_text: {
        type: 'string',
        description:
          'One or two sentences, owner-facing, matching the recommendation. Describe texture in plain language, not the Bristol number. For worth_a_call, name the visible concern plainly and calmly suggest a vet call. ' +
          'For monitor, do NOT comment on the absence of red flags (never "nothing concerning/alarming", "looks fine/normal", or "all clear"): instead state plainly what IS visible in this one photo, then one calm forward-looking line — what to keep an eye on and that the vet is the best call if the owner is worried or it continues. ' +
          'No diagnosis, no treatment, no exclamation marks; never say or imply the pet is fine/okay/healthy/normal.',
      },
      confidence: {
        type: 'object',
        description: 'Per-field legibility confidence 0.0–1.0.',
        properties: {
          consistency: { type: 'number', minimum: 0, maximum: 1 },
          colour: { type: 'number', minimum: 0, maximum: 1 },
          blood_present: { type: 'number', minimum: 0, maximum: 1 },
          mucus_present: { type: 'number', minimum: 0, maximum: 1 },
          foreign_material_present: { type: 'number', minimum: 0, maximum: 1 },
        },
      },
    },
    required: ['appears_to_show_stool', 'recommendation'],
  },
}

const SYSTEM_PROMPT =
  'You are a veterinary triage assistant analysing a single photo of pet stool (faeces), logged by a pet owner. ' +
  'You produce two things from this one photo: (1) factual structured fields describing what is visible, and ' +
  '(2) a brief, calm owner-facing read of this single instance. Hard rules: ' +
  '(1) You are looking at ONE instance. You never diagnose, never name a disease or condition, never suggest treatment, medication, or dosing. ' +
  '(2) You may flag the PRESENCE of something visibly concerning — visible blood (bright red streaks, OR dark/tarry/black stool, which is digested blood), or material that does not look like food or faeces — ' +
  'and when present, recommend the owner call their vet. You phrase this calmly, without alarm. ' +
  '(3) You NEVER reassure based on the absence of a visible problem — absence of a visible red flag does not mean the pet is well, and is never an all-clear. ' +
  'A single loose or watery stool, or visible mucus, is NOT on its own a reason to alarm the owner AND is NOT a reason to reassure them — report it plainly and stay forward-looking. ' +
  'When you see no red flag, do NOT comment on that absence at all: do not say a photo looks fine/normal/okay, that there is nothing concerning or alarming, or that there is nothing to worry about. ' +
  'Instead, describe plainly what IS visible in this one photo, then give a single calm, forward-looking line — what to keep an eye on (e.g. if it happens again, or the pet seems unwell or off their food), and that the vet is the best call if the owner is worried. ' +
  'Never say or imply the pet is "fine", "okay", "healthy", or "normal". ' +
  '(4) Classify consistency on the Bristol Stool Scale (Type 1-7) in the structured field, but in the owner-facing description and read describe the texture in plain words ("soft and unformed", "watery", "firm") — never lead with the Bristol number. ' +
  '(5) Mucus: if you see a slimy/jelly coating, set mucus_present=yes, but do NOT add a visual_flag for it — mucus alone is not a red flag. Only blood and foreign material are visual_flags. ' +
  '(6) For any structured field not clearly visible, return "unsure" — never guess. Set confidence to reflect legibility. ' +
  '(7) If the photo does not appear to show stool, set appears_to_show_stool=false, leave fields "unsure", and recommend not_enough_to_say. ' +
  '(8) Plain owner language, not clinical jargon ("blood" not "haematochezia/melena", "something that is not food" not "foreign body"). No exclamation marks. ' +
  'Call the analyze_stool tool with your findings.'

// ── Pure helpers (exported for unit tests — see index.test.ts) ────────────────

// Normalises the tool_use block into a StoolAnalysis. Bad/hallucinated enum
// values are dropped to null rather than tripping the DB enum on write.
// blood_type is retained only when blood_present is 'yes' (it is meaningless
// otherwise, and keeping a stray type would let colour/blood corroboration drift).
export function parseAnalysisToolResult(response: ClaudeResponse): StoolAnalysis | null {
  const input = getToolUseInput(response, 'analyze_stool') as StoolToolInput | null
  if (!input) return null

  const appears = input.appears_to_show_stool === true
  const contents = sanitizeEnumArray(input.contents, CONTENTS)
  const modelRecommendation = sanitizeEnum(input.recommendation, RECOMMENDATIONS) as Recommendation | null
  const recommendation = (modelRecommendation ?? 'not_enough_to_say') as Recommendation
  const bloodPresent = sanitizeEnum(input.blood_present, TRISTATE)
  const foreignPresent = sanitizeEnum(input.foreign_material_present, TRISTATE)

  // Escalating visual flags are DERIVED from the structured clinical fields, then
  // unioned with any the model set — NEVER the model's array alone (adversarial ①,
  // 2026-07-17). A recorded red flag (blood present either type, or foreign
  // material) forces its visual flag even when the model omits it from
  // visual_flags, so the deterministic floor escalates on the PRESENCE of the
  // finding rather than trusting the weaker of the two signals the model emits.
  // This aligns the floor with generate-report, which likewise derives blood/
  // foreign from the owner-editable structured fields, never the (possibly stale)
  // visual_flags array (B-340 ruling, 2026-07-13). Mucus is deliberately NOT
  // derived — it is monitor-tier and must not force worth_a_call.
  const visualFlags = Array.from(new Set(sanitizeEnumArray(input.visual_flags, VISUAL_FLAGS)))
  if (bloodPresent === 'yes' && !visualFlags.includes('blood')) visualFlags.push('blood')
  if (foreignPresent === 'yes' && !visualFlags.includes('suspected_foreign_material')) {
    visualFlags.push('suspected_foreign_material')
  }

  // The model's free-text read may surface (on the escalation path) ONLY when the
  // MODEL ITSELF escalated (its own worth_a_call). If the floor escalates via a
  // DERIVED flag the model did not reflect in its own recommendation, the model's
  // read was written for a non-escalation and must not surface — null it so the
  // deterministic visualFlagFallback names the concern instead. Without this, a
  // derived-blood escalation could pair a "Worth a call" banner with a soft/benign
  // model read (a reassurance leak on an escalation). B-060 safe direction.
  const readText = modelRecommendation === 'worth_a_call' && typeof input.read_text === 'string'
    ? input.read_text
    : null

  return {
    appears_to_show_stool: appears,
    consistency: sanitizeEnum(input.consistency, CONSISTENCIES),
    colour: sanitizeEnum(input.colour, COLOURS),
    contents: contents.length > 0 ? contents : null,
    blood_present: bloodPresent,
    blood_type: bloodPresent === 'yes' ? sanitizeEnum(input.blood_type, BLOOD_TYPES) : null,
    mucus_present: sanitizeEnum(input.mucus_present, TRISTATE),
    foreign_material_present: foreignPresent,
    foreign_material_note: typeof input.foreign_material_note === 'string' ? input.foreign_material_note : null,
    description: typeof input.description === 'string' ? input.description : null,
    visual_flags: visualFlags,
    recommendation,
    read_text: readText,
    confidence: input.confidence && typeof input.confidence === 'object' ? input.confidence : null,
  }
}

export interface StoolContextInput {
  // occurred_at (ISO) of every non-deleted 'diarrhea' (owner-classified Loose)
  // event in the last 24h, INCLUDING the event being analysed WHEN it is itself
  // a 'diarrhea' event (race guard — matches vomit's recentVomitTimes shape).
  // Uses occurred_at (B-010 representative point). NOT the AI's Bristol read: the
  // seam ruling (a) keys the repeat off the owner's Loose/Normal classification.
  recentLooseStoolTimes: string[]
  thisEventOccurredAt: string
  // True if a non-deleted vomit event was logged within the concurrent window.
  hasRecentVomiting: boolean
  // True if a non-deleted lethargy event was logged within the concurrent window.
  hasRecentLethargy: boolean
}

export function computeContextualFlags(input: StoolContextInput): ContextualFlag[] {
  const flags: ContextualFlag[] = []

  const within = (hours: number) =>
    input.recentLooseStoolTimes.filter((t) => hoursBetween(t, input.thisEventOccurredAt) <= hours).length
  if (within(REPEAT_LOOSE_STOOL_WINDOW_HOURS) >= REPEAT_LOOSE_STOOL_COUNT) {
    flags.push('repeated_loose_stool')
  }

  if (input.hasRecentVomiting) {
    flags.push('concurrent_vomiting')
  }

  if (input.hasRecentLethargy) {
    flags.push('concurrent_lethargy')
  }

  return flags
}

// The escalation floor. Contextual and visual flags both force worth_a_call;
// no-photo / not-stool collapses to not_enough_to_say; otherwise monitor.
// There is intentionally no path to a reassuring verdict. The mechanism is
// framework-owned (_shared/incident-analysis.ts — a descriptor cannot weaken
// it); this wrapper keeps a stool-named signature for the test suite.
export function applyEscalationFloor(params: {
  modelRecommendation: Recommendation
  appearsToShowStool: boolean
  hasPhoto: boolean
  visualFlags: string[]
  contextualFlags: ContextualFlag[]
}): Recommendation {
  return applyIncidentEscalationFloor({
    modelRecommendation: params.modelRecommendation,
    appearsToShowSubject: params.appearsToShowStool,
    hasPhoto: params.hasPhoto,
    visualFlags: params.visualFlags,
    contextualFlags: params.contextualFlags,
  })
}

// When contextual flags fire, the model's photo-only read may have (honestly)
// said "nothing concerning" — which now contradicts the forced worth_a_call.
// Replace it with a specific, calm read that names the contextual reason.
// Highest-acuity flag wins: concurrent vomiting + diarrhea (fluid loss) leads,
// then persistent diarrhea, then lethargy. Plain language, pet name, no
// diagnosis, no alarm.
export function buildContextualReadText(petName: string, flags: ContextualFlag[]): string {
  const p = petName || 'Your pet'
  if (flags.includes('concurrent_vomiting')) {
    return `${p} has been vomiting around the same time as this. Vomiting and loose stool together can run a pet down quickly, so it's worth a call to your vet.`
  }
  if (flags.includes('repeated_loose_stool')) {
    return `${p} has had more than one loose stool in a short window. Diarrhea that keeps up like that is worth a call to your vet.`
  }
  return `${p} has also been low on energy around this. Together with the stool, that's worth a quick call to your vet.`
}

function buildNoFlagReadText(petName: string, hasPhoto: boolean): string {
  const p = petName || 'your pet'
  const lead = hasPhoto
    ? "There's not much I can read from this one on its own."
    : "Without a photo there's not much I can read from this one on its own."
  return `${lead} If you're worried about ${p}, your vet is the best call.`
}

// ── B-060: the n=1 read never reassures on the ABSENCE of a red flag ───────────
// Same structural guarantee as vomit (clinical-guardrails Pattern 1 / B-060): the
// model's free-text read reaches the owner ONLY on the worth_a_call escalation
// path (a visual flag it raised, or its own worth_a_call — either way it NAMES a
// present concern, the safe direction). On the monitor / no-flag path — the
// reassurance-on-absence risk — the read is a deterministic template, never the
// model's words. The selection ORDER lives in the shared module's selectReadText;
// these are the stool-specific templates it selects among.

// monitor: a clear photo with no visible/contextual flag. This bucket spans the
// FULL healthy→loose range — a formed Bristol Type 3/4 (the most-logged stool,
// and the diet-trial owner's happy path) AND a single loose/watery stool or
// mucus-without-blood. The copy must therefore work for BOTH without (a)
// reassuring on the normal one (absence ≠ wellness) or (b) presuming the current
// stool is a symptom. The old "if it happens again" phrasing did (b): it read as
// a warning about a normal poop recurring, which is exactly backwards on the
// happy path (B-362 — pm-feature-review's highest-value catch, 2026-07-17).
//
// The fix reframes n=1 as a DATA POINT the owner is building a trend from — which
// is precisely the wedge (an owner logging a good stool during a diet trial is
// doing the right thing, tracking progress). It affirms the ACTION (keep logging)
// without reassuring about the STATE. "Logging the next few" is change-neutral, so
// it fits a normal stool (build the picture) and a single loose one equally, and it
// does NOT comment on the absence of concern or name the benign finding (the
// structured field carries that to the detail screen).
//
// The persistence + systemic escalation cues are BOTH kept, but stated
// STATE-SILENTLY so they serve the whole monitor range (formed Type 3/4 → single
// loose Type 6/7 → mucus) without the old misfire. The old "if it happens again"
// presumed THIS stool was the problem — backwards for a normal poop; "if {p} keeps
// having loose stools" instead names the concerning FUTURE pattern to watch for,
// which reads correctly for a normal stool (watch for loose ones) AND for a single
// loose one (watch for it continuing). Crucially it is an OWNER-FACING instruction
// robust to under-logging — it does not silently delegate recurrence-escalation to
// the logging-dependent repeated_loose_stool flag (adversarial Axis-2, 2026-07-17:
// dropping the owner-side cue narrowed the single-loose-stool net for a non-logging
// owner). The deterministic flag still REINFORCES this when the owner does log the
// recurrence — it is a backstop, not the sole path. B-362 rides into this PR-3
// function pre-deploy; own adversarial + Dr. Chen pass. The sanctioned "Keep an eye
// out" monitor HEADER (clinical-guardrails Pattern 1) is unchanged.
function buildMonitorReadText(petName: string): string {
  const p = petName || 'your pet'
  return `One stool on its own is just a single snapshot — it can't show how ${p}'s gut is doing over time. That fuller picture comes from logging the next few. If ${p} keeps having loose stools, seems unwell, or goes off food, your vet is the best call.`
}

// Escalation on a model-raised visual flag, used when the model didn't write its
// own read. Names the present concern plainly (the safe direction) and routes to
// the vet.
function buildVisualFlagReadText(petName: string, visualFlags: string[]): string {
  const p = petName || 'your pet'
  const hasBlood = visualFlags.includes('blood')
  const hasForeign = visualFlags.includes('suspected_foreign_material')
  const seen = hasBlood && hasForeign
    ? "what looks like blood, and something that doesn't look like food,"
    : hasBlood
      ? 'what looks like blood'
      : hasForeign
        ? "something that doesn't look like food"
        : 'something worth a closer look'
  return `I can see ${seen} in this stool photo. That's worth a call to your vet about ${p}.`
}

// Photo present but unreadable (oversize / undecodable format). Honest about the
// failure, never reassures, routes to the vet.
function buildPhotoUnreadableReadText(petName: string): string {
  const p = petName || 'your pet'
  return `I couldn't read this photo — it may be too large or in a format I can't open. Try replacing it with a fresh shot and I'll take another look. If you're worried about ${p}, your vet is the best call.`
}

// The stool templates handed to the shared pipeline. Every string here is
// covered by the reassurance-word regex test (Pattern 8) in index.test.ts —
// NOT inherited from vomit's suite (D2).
const STOOL_COPY: IncidentCopy<ContextualFlag> = {
  contextual: buildContextualReadText,
  photoUnreadable: buildPhotoUnreadableReadText,
  monitor: buildMonitorReadText,
  visualFlagFallback: buildVisualFlagReadText,
  noFlag: buildNoFlagReadText,
}

// The load-bearing read selection, pure + exported so the never-reassure
// guarantee is unit-tested rather than asserted by a comment. Binds the shared
// selection order to the stool copy.
export function selectReadText(params: {
  petName: string
  recommendation: Recommendation
  contextualFlags: ContextualFlag[]
  visualFlags: string[]
  modelReadText: string | null
  photoUnreadable: boolean
  hasPhoto: boolean
}): string {
  return selectIncidentReadText(STOOL_COPY, params)
}

// ── Write-back: the server half of the never-clobber guard (B-028) ─────────────
// The read + flags always refresh (so the floor can re-escalate on worsening
// context); the structured CLINICAL fields are the owner's once edited and must
// survive a re-analysis untouched. The update-vs-upsert decision is the shared
// module's (Pattern 7); this file owns only the stool column set.

type AnalysisReadFields = IncidentAnalysisReadFields<ContextualFlag>

// The stool structured column values for the full-upsert path. Called with null
// when no model ran — every column is then null (nothing to preserve on a fresh
// row; a prior real analysis routes through update mode instead). Column names
// match migration 034; foreign_material_* are the columns 013 already defined
// (reused, not stool-prefixed).
function buildStoolStructuredValues(analysis: StoolAnalysis | null): Record<string, unknown> {
  return {
    ai_raw_payload: analysis,
    ai_confidence: analysis?.confidence ?? null,
    stool_consistency: analysis?.consistency ?? null,
    stool_colour: analysis?.colour ?? null,
    stool_content: analysis?.contents ?? null,
    stool_blood_present: analysis?.blood_present ?? null,
    stool_blood_type: analysis?.blood_type ?? null,
    stool_mucus_present: analysis?.mucus_present ?? null,
    foreign_material_present: analysis?.foreign_material_present ?? null,
    foreign_material_note: analysis?.foreign_material_note ?? null,
    description: analysis?.description ?? null,
  }
}

// Kept with a stool-named signature (analysis in, incident_type resolved from the
// event's own type) — the test suite pins the never-clobber shape through this
// wrapper. incident_type is 'stool_normal' or 'diarrhea' (D1: the split stays).
export function buildAnalysisWriteBack(params: {
  humanEdited: boolean
  eventId: string
  petId: string
  incidentType: string
  analysis: StoolAnalysis | null
  readFields: AnalysisReadFields
}): AnalysisWriteBack {
  return buildIncidentAnalysisWriteBack({
    humanEdited: params.humanEdited,
    eventId: params.eventId,
    petId: params.petId,
    incidentType: params.incidentType,
    structuredValues: buildStoolStructuredValues(params.analysis),
    readFields: params.readFields,
  })
}

// Exported only so the test can assert the update branch carries no structured
// column (the columns the never-clobber guard must protect).
export const STRUCTURED_FIELD_KEYS = [
  'ai_raw_payload', 'ai_confidence', 'stool_consistency', 'stool_colour', 'stool_content',
  'stool_blood_present', 'stool_blood_type', 'stool_mucus_present',
  'foreign_material_present', 'foreign_material_note', 'description',
] as const

// ── Context assembly (DB reads, ownership-scoped via the caller JWT) ───────────

async function assembleContext(
  userClient: SupabaseClient,
  petId: string,
  thisEventOccurredAt: string,
  eventType: string,
): Promise<StoolContextInput> {
  const now = Date.now()
  const looseWindowAgo = new Date(now - REPEAT_LOOSE_STOOL_WINDOW_HOURS * 3_600_000).toISOString()
  const vomitWindowAgo = new Date(now - CONCURRENT_VOMITING_HOURS * 3_600_000).toISOString()
  const lethargyWindowAgo = new Date(now - CONCURRENT_LETHARGY_HOURS * 3_600_000).toISOString()

  const [looseRes, vomitRes, lethargyRes] = await Promise.all([
    // Owner-classified Loose stool events (event_type='diarrhea'). NOT the AI's
    // Bristol read — the seam ruling (a): pre-vision, owner-classified.
    userClient
      .from('events')
      .select('occurred_at')
      .eq('pet_id', petId)
      .eq('event_type', 'diarrhea')
      .is('deleted_at', null)
      .gte('occurred_at', looseWindowAgo),
    userClient
      .from('events')
      .select('id')
      .eq('pet_id', petId)
      .eq('event_type', 'vomit')
      .is('deleted_at', null)
      .gte('occurred_at', vomitWindowAgo)
      .limit(1),
    userClient
      .from('events')
      .select('id')
      .eq('pet_id', petId)
      .eq('event_type', 'lethargy')
      .is('deleted_at', null)
      .gte('occurred_at', lethargyWindowAgo)
      .limit(1),
  ])

  const recentLooseStoolTimes = (looseRes.data ?? []).map((r) => r.occurred_at as string)
  // Race guard: if THIS event is itself a Loose (diarrhea) event, ensure it is
  // represented even if the read raced its own write. A Normal stool event does
  // NOT add to the loose-stool count (correct — only diarrhea events persist the
  // repeated-loose-stool signal).
  if (eventType === 'diarrhea' && !recentLooseStoolTimes.includes(thisEventOccurredAt)) {
    recentLooseStoolTimes.push(thisEventOccurredAt)
  }

  return {
    recentLooseStoolTimes,
    thisEventOccurredAt,
    hasRecentVomiting: (vomitRes.data ?? []).length > 0,
    hasRecentLethargy: (lethargyRes.data ?? []).length > 0,
  }
}

// ── Cap + flag gate identity (Monetization Track 2, T2-3 / B-329 + B-001) ─────
// docs/monetization-and-throttling-requirements.md §4–§5. The gate logic is the
// shared module's; the per-type keys + caps live here in the descriptor. The
// stool caps mirror vomit (D-M2 — identical across tiers; the cap gates the
// DESCRIPTIVE read only, never the deterministic escalation floor). The flag
// fails OPEN to enabled if app_config has no 'ai_stool_read_enabled' row yet, so
// stool reads work before the row is provisioned (PM action item to add it).
const CAPS: FunctionCaps = { daily: 10, monthly: 200 }
const FUNCTION_KEY = 'analyze_stool'
const FLAG_KEY = 'ai_stool_read_enabled'

// ── The stool descriptor (D2) ────────────────────────────────────────────────────

const STOOL_DESCRIPTOR: IncidentDescriptor<StoolAnalysis, ContextualFlag> = {
  functionName: 'analyze-stool',
  // Both owner-classified stool event types get a read (D1 keeps the split). The
  // row's incident_type reuses events.event_type ('stool_normal' or 'diarrhea').
  eventTypes: ['stool_normal', 'diarrhea'],
  wrongEventTypeMessage: 'Event is not a stool event',
  functionKey: FUNCTION_KEY,
  flagKey: FLAG_KEY,
  caps: CAPS,
  model: 'claude-sonnet-4-6',
  systemPrompt: SYSTEM_PROMPT,
  tool: ANALYZE_TOOL,
  userMessageText: 'Analyse this photo of pet stool.',
  parseToolResult: parseAnalysisToolResult,
  appearsToShowSubject: (analysis) => analysis.appears_to_show_stool,
  computeContextualFlags: async (userClient, { petId, occurredAt, eventType }) =>
    computeContextualFlags(await assembleContext(userClient, petId, occurredAt, eventType)),
  copy: STOOL_COPY,
  buildStructuredValues: buildStoolStructuredValues,
}

const handler = (req: Request): Promise<Response> => runIncidentAnalysis(STOOL_DESCRIPTOR, req)

// Guard the listener so importing this module for `deno test` does not try to
// bind a server. `import.meta.main` is true only when this file is the deployed
// entrypoint, false on test import (B-180).
if (import.meta.main) {
  Deno.serve(handler)
}
