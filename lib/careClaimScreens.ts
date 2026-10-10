// The two care-claim screens (CUL-1271) — ONE module imported by the client banner screen
// (`lib/signalCopy.ts` validateBannerPhrasing), Ask (`supabase/functions/ask/answer.ts`
// validateAnswer + sanitizeFollowups) and the Signal (`generate-signal/phrasing.ts`
// validatePhrasing's safety + reflection branches, `summary.ts` validateSummary).
//
// Why these exist. Every never-reassure screen in the app was a WELLNESS lexicon ("fine",
// "healthy", "on the mend"), and two whole classes of reassuring sentence contain none of
// those words, so they passed all of them (reproduced at ffacb4e by the CUL-1268 critique):
//   • DELEGATION / CONTAINMENT — the concern is handed to someone or declared held:
//     "her vomiting is under control since the visit", "your vet has it covered", "it's in
//     the vet's hands now, with 4 episodes since". Engines v3's care state (EN-9) hands the
//     model a visit to hang this on; a cat 15% down would read it and put the phone down.
//   • TREATMENT ATTRIBUTION — an effect claimed for a drug or a diet: "the prednisone seems
//     to be helping", "her cough has settled since the prednisone started". Ask already reads
//     the medications, so this is reachable today. It is n=1 reassurance (a calm stretch
//     happens on its own; regression to the mean) and a causal claim the record cannot make.
// The honest form of both is the same: a DATED FACT beside a COUNT — "Your vet saw Nyx on
// Sep 16; 4 episodes are logged since." — which none of these arms touch, because every arm
// is anchored on the verdict phrase, never on "since", "vet", a drug name or a date.
//
// ⚠ EXCEPT A ZERO (CUL-1429). "Since the Sep 16 visit, 0 vomiting episodes are logged" passes
// both arms above, and is the third reassuring class: a zero beside a visit or a masking drug
// reads as "it worked", and a steroid (or an injection given in the room) can hide the very
// sign being counted (care-state spec §5.1, AC 17). An earlier header here called "none LOGGED
// since" the honest form; beside a visit or a drug it is not. `zeroBesideCareReason` below is
// the count-aware screen, used by Ask; the Signal's own lines withhold the zero structurally
// (`generate-signal/careContext.ts`), from the same drug table (`lib/maskingSpans.ts`).
//
// A keyword screen is not paraphrase-proof: the structural question (a denylist versus an
// allowlisted recount or a judge) is CUL-271's and stays open there. What this module buys is
// that the screens agree: the banner used to mirror phrasing.ts by hand ("KEEP IN SYNC"), and
// a new arm added in one place and not the other is exactly the drift that let a sibling
// screen fall behind. Deno needs the `.ts` import extension, so importers from
// `supabase/functions` write '../../../lib/careClaimScreens.ts'; this file imports only the
// shared drug table (`maskingSpans.ts`, pure), so the zero screen and the Signal agree on
// which drugs mask.
//
// Apostrophes: models emit both ' and ’, so every contraction arm takes either.

import {
  ALL_SIGNS,
  courseEffectOn,
  DRUG_NAME_CLASSES,
  resolveDrugClasses,
  type DrugClass,
  type MaskSign,
} from './maskingSpans.ts'

// Shared fragments. APOS takes both apostrophes; SYMPTOM_WORD is only the symptom vocabulary
// the comparison / absence arms anchor on, so an INTAKE escalation ("finished fewer meals
// since", "stopped eating since the visit") never collides with them.
const APOS = `['’]`
const SYMPTOM_WORD = String.raw`(?:cough\w*|vomit\w*|diarrh\w*|stools?|itch\w*|scratch\w*|sneez\w*|symptoms?|episodes?)`
const VERDICT_SINCE_VERB = String.raw`(?:settl(?:ed|ing)|eas(?:ed|ing)(?:\s+off)?|calm(?:ed|ing)\s+down|subsid(?:ed|ing)|quiet(?:ed|ened)|lessen(?:ed|ing)|improv(?:ed|ing)|stopped(?!\s+(?:eating|drinking|finishing|touching))|gone away|went away|cleared up|dropped off)`

/** Delegation / containment: the concern is declared held, handed off, or finished. */
export const DELEGATION_RE = new RegExp(
  [
    // Containment verdicts, whoever holds it: "under control", "in check", "at bay", "in hand",
    // "well controlled on prednisone", "under good control". `in check` never takes "check-in".
    String.raw`\bunder control\b`,
    String.raw`\bin check\b(?!-)`,
    String.raw`\bat bay\b`,
    String.raw`\b(?:all\s+)?in hand\b`,
    String.raw`\b(?:well|better|nicely|fully|now)[- ]controlled\b|\bunder (?:good|better|tight|full|some) control\b|\bcontrolled (?:on|with|by|since)\b`,
    // "your vet has it covered", "the vet's got this handled", "has you covered", "has it well
    // covered" — and the clause-final "Nyx's vet has this." / "Your vet's got this."
    String.raw`(?:\b(?:has|have|had)|${APOS}(?:s|ve|d))\s+(?:got\s+|gotten\s+)?(?:it|this|that|things|everything|you|her|him|them)(?:\s+one)?\s+(?:all\s+|well\s+|fully\s+|completely\s+)?(?:covered|handled|sorted)\b`,
    String.raw`(?:\bhas|\bhave|${APOS}s got|${APOS}ve got|\bgot)\s+(?:this|it)(?:\s+one)?\s*(?:[.,;—–]|$|\bnow\b)`,
    // "in the vet's hands", "in Juniper's vet's hands", "in your vet's capable hands", "in the
    // vet's care", "under your vet's care", "in the hands of your vet", "in good hands".
    String.raw`\bin\s+(?:(?:the|your|her|his|their|a)\s+|\w+${APOS}s\s+)?(?:vet${APOS}?s|vets${APOS}|doctor${APOS}?s|clinic${APOS}?s)\s+(?:\w+\s+)?(?:hands|care)\b`,
    String.raw`\bunder\s+(?:(?:the|your|her|his|their)\s+|\w+${APOS}s\s+)?(?:vet${APOS}?s|vets${APOS}|veterinary|doctor${APOS}?s)\s+care\b`,
    String.raw`\bin the hands of\b`,
    String.raw`\bin\s+(?:good|safe|capable|expert|professional|the right)\s+hands\b`,
    // The vet as the subject of the holding: "the vet is on it", "your vet's already on top of
    // it", "the vet is keeping an eye on it", "your vet is handling the vomiting". The honest
    // instruction ("your vet asked you to keep an eye on it") has no copula before the verb.
    String.raw`\b(?:vet|vets|doctor|clinic)\s*(?:is|are|${APOS}s|${APOS}re|will)\s+(?:already\s+|now\s+)?(?:on (?:it|this|that|things|top of|the case)\b|across (?:it|this|that|things)\b|keeping (?:an eye|tabs|watch) on|looking after|taking care of|take care of|handle|handling|managing|monitoring|watching|following)`,
    String.raw`\bleave it (?:to|with) (?:the|your)\s+vet\b`,
    // "nothing more to do", "nothing else you can do", "nothing further needed". The bare
    // "nothing to do" arm also takes "nothing to do with the food" — a causal-negation claim
    // the app may not make either, so the collision is in the safe direction.
    String.raw`\bnothing\s+(?:(?:more|else|further)\s+)?(?:(?:to|for you to|you need to|you can|we can|that can)\s+(?:be\s+)?(?:do|done|watch|monitor)|needed|required)\b`,
    // "no need to call the vet / to go back / for another visit"; "you can relax"
    String.raw`\bno need (?:to\s+(?:call|see|book|contact|ring|go back|follow up|return|bring)|for\s+(?:a|another|any)\s+(?:vet|visit|check|appointment|follow[- ]?up))\b`,
    String.raw`\byou can (?:relax|rest easy|stop worrying|breathe easier)\b`,
    // "taken care of", "dealt with", "being handled / managed / looked after", "well managed"
    String.raw`\btaken care of\b`,
    String.raw`\bdealt with\b`,
    String.raw`\bbeing\s+(?:handled|managed|looked after|taken care of|addressed|monitored)\b`,
    String.raw`\bwell[- ]managed\b`,
    // "resolved", "cleared up", "that episode is behind her now", "no longer a concern". The
    // behind arm needs a copula so a location ("vomited behind her bowl") passes.
    String.raw`\bresolv(?:ed|ing)\b`,
    String.raw`\bcleared up\b`,
    String.raw`\b(?:is|are|was|were|${APOS}s|${APOS}re|now)\s+(?:all\s+|well\s+)?behind\b`,
    String.raw`\bno longer (?:a |an )?(?:concern|worry|problem|issue|something to watch)\b`,
  ].join('|'),
  'i',
)

/** Treatment attribution: an effect claimed for a medication, a diet, or a visit. */
export const TREATMENT_ATTRIBUTION_RE = new RegExp(
  [
    // "is helping", "seems to be working", "has been doing the trick", "'s kicking in".
    // The lookaheads keep the honest non-effect uses: "is working through her bowl",
    // "was helping herself to the cat's food".
    String.raw`(?:\b(?:is|are|was|were|seems? to be|seemed to be|appears? to be|appeared to be|looks? to be|has been|have been|had been|may be|might be|could be|must be)|${APOS}(?:s|re))\s+(?:(?:really|clearly|definitely|already|finally|probably|likely|slowly)\s+)?(?:helping(?!\s+(?:herself|himself|themselves|itself))|working(?!\s+(?:through|on|at|out|her way|his way|their way))|doing (?:its|the|their) (?:job|trick)|kicking in|taking effect|paying off|making (?:a|the|some) difference|effective|successful)\b`,
    // "has helped", "seems to have worked", and the bare past forms ("the prednisone helped her
    // cough", "the new food worked") — an effect verdict in any tense. The lookaheads keep "helped
    // herself", "worked through her bowl" and the visit's "your vet worked her up".
    String.raw`\b(?:helped(?!\s+(?:herself|himself|themselves|itself))|worked(?!\s+(?:through|on|at|out|her way|his way|their way|her up|him up|them up))|kicked in|took effect|paid off)\b`,
    // Present simple, appearance and inchoative forms: "seems to help her cough", "should
    // start working", "is starting to help", "helps her cough". A bare "works"/"will help" is not
    // screened ("it works without a connection", "logging will help your vet"); only an effect on
    // the pet or a symptom is.
    String.raw`\b(?:seems?|appears?|looks?|seemed|appeared|ought to|is meant to|is supposed to|(?:(?:is|are|has|have|should|will)\s+)?(?:start(?:ing|ed|s)?|begin(?:ning|s)?|begun))\s+(?:to\s+)?(?:help|work|working|helping|kick in|settle|ease|take effect)\b`,
    String.raw`\b(?:should|will|would|could)\s+(?:help|work|ease|settle)\s+(?:(?:with\s+)?(?:her|his|their|its|the|\w+${APOS}s)\s+${SYMPTOM_WORD}|for\s+(?:her|him|them))\b`,
    String.raw`\bhelps\s+(?:with\s+)?(?:her|his|their|the|\w+${APOS}s)\s+${SYMPTOM_WORD}|\bworks\s+for\s+(?:her|him|them)\b`,
    // Completed-job and benefit idioms: "made a difference", "did the trick", "has done its job",
    // "done wonders", "has been a big help", "she's benefiting", "is doing her good".
    String.raw`\b(?:made|makes|making) (?:a|the|some|a real|a big) difference\b`,
    String.raw`\b(?:did|done)\s+(?:its|the|their)\s+(?:job|trick)\b|\bdone wonders\b|\bbeen (?:a (?:big |real )?help|helpful|effective)\b|\bseems? (?:helpful|effective)\b|\bbenefit(?:ing|ed|s)?\b|\bdoing (?:her|him|them) good\b|\bhad (?:an|a \w+|the \w+) effect\b`,
    String.raw`\bturn(?:ed|ing)\s+(?:a|the)\s+corner\b|\bturned\s+(?:things|it)\s+around\b`,
    // "has settled since the prednisone started", "has been easing since the visit", "calmed
    // down after the visit" — and the same clause fronted: "Since the prednisone started, her
    // cough has settled", "Her cough has since settled". The verb is the verdict, "since" the
    // attribution; "4 episodes since the visit" carries neither, and "since the visit she has
    // stopped eating" is an escalation the lookahead keeps.
    String.raw`\b(?:(?:settled|eased|calmed|subsided|quiet(?:ed|ened)|lessened|cleared|improved|gotten better|got better)(?:\s+(?:down|off|up))?|died down|let up|tapered off)\s+(?:(?:a lot|a bit|right|quite a bit|noticeably|nicely)\s+)?(?:since|after|once)\b`,
    String.raw`\b(?:settling|easing|calming|subsiding|stopped(?!\s+(?:eating|drinking|finishing|touching))|gone away|went away|dropped off|gone down)\s+(?:\w+\s+){0,3}?(?:since|after|once|following)\b`,
    String.raw`\b(?:since|after|once)\b[^.;:?!]{0,80}?\b${VERDICT_SINCE_VERB}\b`,
    String.raw`\bsince\s+(?:settled|eased|calmed|subsided|stopped|cleared|improved)\b`,
    // A symptom comparison or absence anchored on the treatment's date: "coughed less since the
    // prednisone", "fewer episodes since", "hasn't vomited since the visit", "no vomiting since".
    // An unlogged day is not a symptom-free one; the honest form is "none LOGGED since".
    String.raw`\b(?:fewer\s+(?:\w+\s+)?(?:episodes|coughs|vomits|bouts|accidents|flare-?ups)|(?:vomited|coughed|scratched|itched|sneezed|been sick|vomiting|coughing|scratching|itching|sneezing)\s+less(?:\s+often)?|appetite\s+(?:has\s+)?(?:come|came)\s+back)\s*(?:\w+\s+){0,3}?(?:since|after|once)\b`,
    String.raw`\bsince\b[^.;:?!]{0,80}?\b(?:(?:vomited|coughed|scratched|itched|sneezed|been sick)\s+less|fewer\s+(?:\w+\s+)?(?:episodes|coughs|vomits|bouts)|appetite\s+(?:has\s+)?(?:come|came)\s+back)\b`,
    String.raw`\b(?:hasn${APOS}t|has not|haven${APOS}t|have not)\s+(?:vomited|coughed|scratched|itched|sneezed|thrown up|been sick|had (?:a|any)\s+(?:\w+\s+)?(?:episode|accident))\s+since\b|\b(?:vomit|cough|symptom|itch|diarrh\w*)-free since\b|\bno\s+(?:vomiting|coughing|scratching|itching|sneezing|diarrh\w*|episodes?)\s+since\b`,
    // "thanks to the prednisone"; "responding well to the treatment"; "she's responding to the
    // prednisone". A bare "responds to" is behaviour ("responds to her name"), so the arm needs a
    // qualifier, an auxiliary, or a treatment object.
    String.raw`\bthanks to\b`,
    String.raw`\brespond(?:s|ed|ing)?\s+(?:well|nicely|poorly|badly|quickly)\s+to\b`,
    String.raw`(?:\b(?:is|are|was|were|seems? to be|appears? to be|has been|have been)|${APOS}(?:s|re))\s+(?:already\s+|clearly\s+)?responding\s+to\b`,
    String.raw`\brespond(?:s|ed|ing)?\s+to\s+(?:(?:the|her|his|their|its)\s+)?(?:new\s+)?(?:treatment|medication|meds?|medicine|drugs?|pills?|therapy|diet|food|course|dose|steroids?|antibiotics?)\b`,
  ].join('|'),
  'i',
)

export type CareClaimReason = 'delegation' | 'treatment_attribution'

/** The first care-claim class `text` asserts, or null. Delegation is checked first because it
 *  is the reassurance-shaped one; the order only decides which reason a caller logs. */
export function careClaimReason(text: string): CareClaimReason | null {
  const t = text ?? ''
  if (DELEGATION_RE.test(t)) return 'delegation'
  if (TREATMENT_ATTRIBUTION_RE.test(t)) return 'treatment_attribution'
  return null
}

// ── A zero beside a visit or a medication (CUL-1429) ──────────────────────────────────────
//
// The rule is the Signal's (care-state spec §5.1, AC 17; `generate-signal/careContext.ts`): no
// zero beside a visit, and no zero of a sign beside a drug that can hide that sign. The Signal
// knows dates and withholds only inside the 42-day spans; a sentence does not carry its dates
// reliably, so this screen is stricter in the safe direction:
//   • a ZERO is any count of none: "0 episodes", "no vomiting", "none logged", "nothing has
//     been logged", "hasn't vomited", "vomit-free", "not a single cough", "…: 0".
//   • a VISIT is any visit word (visit, appointment, check-up, recheck, exam, "the vet saw"),
//     past or booked: a zero beside one is refused on every sign, because the visit is taken as
//     an unrecorded masking drug (an injection in the room never enters `medications`).
//   • a MEDICATION is a name in the shared table, a name the record handed the writer, or a
//     generic word ("her medication", "the steroid", "doses") when no name is written. A name
//     is judged by `resolveDrugClasses` + `courseEffectOn`, the Signal's own: carprofen beside
//     "no coughing" passes (it cannot hide a cough); prednisone, an unknown name or a bare "her
//     medication" is refused (unresolved fails toward masking, like a systemic steroid).
//   • a course the record says may be ON BOARD (`onBoardNames`) sits beside every zero in the
//     answer whether the answer names it or not, as the Signal's lines withhold every zero on
//     the screen while a masking drug is on board.
// The zero's sign is read from its own sentence; a sentence naming no sign ("nothing logged",
// "0 episodes") is a zero of every sign.
//
// What this does not see (stated, so it never reads as coverage): a visit the answer names only
// by its date ("since Sep 16"), and a masking course the record holds that the answer neither
// names nor the caller passes. The prompt's rule 10 asks for the window and the logging instead,
// which carries no zero at all.

const ZERO_RES: RegExp[] = [
  // "0 vomiting episodes", "zero coughs", "no vomiting", "no new episodes", "not a single
  // cough", "without an episode". The sign noun is required, so "no need", "no more than 3
  // episodes" and "No, she…" pass.
  new RegExp(
    String.raw`\b(?:0(?![.,:]\d)|zero|no|not (?:a single|one|any)|without (?:a|an|any))\s+(?:(?:new|more|further|other|logged|recorded|reported)\s+){0,2}(?:\w+\s+)?(?:vomit\w*|throw(?:ing)?[- ]up|diarrh\w*|loose stools?|stools?|cough\w*|sneez\w*|itch\w*|scratch\w*|lick\w*|skin\w*|rash\w*|symptoms?|episodes?|bouts?|accidents?|flare-?ups?|times|incidents?|events?|signs?)\b`,
    'i',
  ),
  // "none logged", "nothing has been logged", "none since", "nothing so far".
  new RegExp(
    String.raw`\b(?:nothing|none)(?:\s+(?:new|more|else|at all|of (?:them|it|those)))?(?:\s+(?:is|was|were|are|has|have|had)(?:\s+been)?)?\s+(?:logged|recorded|noted|reported|seen|since|so far)\b`,
    'i',
  ),
  // "hasn't vomited", "has not had any episodes", "didn't log a cough". An INTAKE absence
  // ("hasn't eaten") is an escalation and never matches.
  new RegExp(
    String.raw`\b(?:hasn${APOS}t|has not|haven${APOS}t|have not|didn${APOS}t|did not|hadn${APOS}t|had not)\s+(?:\w+\s+)?(?:vomited|coughed|scratched|itched|sneezed|licked|thrown up|threw up|been sick|had (?:a|an|any)\b|logged (?:a|an|any)\b)`,
    'i',
  ),
  // "vomit-free", "symptom free", and the count stated after its noun: "…since the visit: 0",
  // "the count is 0".
  new RegExp(String.raw`\b(?:vomit\w*|cough\w*|symptom|itch\w*|diarrh\w*|scratch\w*|sneez\w*|episode)[- ]free\b`, 'i'),
  new RegExp(String.raw`(?:[:=]|\b(?:is|are|was|were|at|stands at))\s*(?:0|zero)\b(?![.,:]\d)`, 'i'),
  // "on 0 of 14 days".
  new RegExp(String.raw`\b(?:0|zero|none)\s+of\s+(?:the\s+)?\d+\b`, 'i'),
]

const VISIT_RE =
  /\b(?:visit(?:s|ed)?|appointments?|check-?ups?|re-?checks?|exams?|examination|consult(?:ation)?s?|(?:the|your|her|his|their)\s+vet\s+(?:saw|examined|checked)|saw\s+(?:the|your|her|his|their|a)\s+vet|seen\s+by\s+(?:the|your|her|his|their|a)\s+vet|at\s+the\s+(?:vet|clinic))\b/i

// A medication referred to without its name. Judged only when no name is written: "the
// prednisone … her medication" names one course, not two.
const GENERIC_MED_RE =
  /\b(?:medications?|medicines?|meds|drugs?|doses?|dosing|pills?|tablets?|injections?|injected|shots?|steroids?|antibiotics?|treatments?|prescription|prescribed|course)\b/i

const SIGN_WORDS: [RegExp, MaskSign[]][] = [
  [/\b(?:vomit\w*|threw up|thrown up|throw(?:ing)?[- ]up|been sick)\b/i, ['vomit']],
  [/\b(?:diarrh\w*|loose stools?|stools?)\b/i, ['diarrhea']],
  [/\bcough\w*\b/i, ['cough']],
  [/\bsneez\w*\b/i, ['sneeze']],
  [/\bitch\w*\b/i, ['itch']],
  [/\b(?:scratch\w*|lick\w*)\b/i, ['scratch']],
  [/\b(?:skin|rash\w*|hives)\b/i, ['skin_reaction']],
]

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** The signs each zero in `text` counts: its own sentence's sign words, or every sign. */
function zeroSigns(text: string): Set<MaskSign> {
  const signs = new Set<MaskSign>()
  for (const sentence of text.split(/(?<=[.;?!])\s+|\n+/)) {
    if (!ZERO_RES.some((re) => re.test(sentence))) continue
    let named = false
    for (const [re, ss] of SIGN_WORDS) {
      if (re.test(sentence)) {
        named = true
        for (const s of ss) signs.add(s)
      }
    }
    if (!named) for (const s of ALL_SIGNS) signs.add(s)
  }
  return signs
}

/** The medications `text` names, each as the table reads it (null: unresolved, masks all). */
function namedMedications(text: string, knownNames: readonly string[]): (DrugClass[] | null)[] {
  const out: (DrugClass[] | null)[] = []
  const lower = text.toLowerCase()
  for (const w of lower.split(/[^a-z-]+/)) {
    if (!w) continue
    const classes = DRUG_NAME_CLASSES[w]
    if (classes) out.push([...classes])
    // A combination ("Metro-Pred") is judged whole, so an unknown part fails toward masking.
    else if (w.includes('-') && w.split('-').some((part) => DRUG_NAME_CLASSES[part])) out.push(resolveDrugClasses([w]))
  }
  for (const name of knownNames) {
    const n = (name ?? '').trim().toLowerCase()
    if (n.length < 3) continue
    if (new RegExp(String.raw`(?:^|[^a-z0-9])${escapeRe(n)}(?:$|[^a-z0-9])`).test(lower)) {
      out.push(resolveDrugClasses([name]))
    }
  }
  if (out.length === 0 && GENERIC_MED_RE.test(text)) out.push(null)
  return out
}

export interface ZeroBesideCareContext {
  /** Every medication name the record handed the writer this turn (the regimens' and doses'
   *  labels). A mention of one in the text is a medication beside the zero, nickname or not. */
  knownNames: readonly string[]
  /** The names of courses that may be on board (active, or dosed in the read window). Each one
   *  sits beside every zero in the answer, named or not. */
  onBoardNames: readonly string[]
}

export type ZeroBesideCareReason = 'zero_beside_visit' | 'zero_beside_medication'

/** Whether `text` puts a zero beside a visit or beside a medication that can hide the counted
 *  sign (CUL-1429). Both lists are required: an empty list is a statement that the record
 *  handed over no medication, never a default (C-37). */
export function zeroBesideCareReason(text: string, ctx: ZeroBesideCareContext): ZeroBesideCareReason | null {
  const t = text ?? ''
  const signs = zeroSigns(t)
  if (signs.size === 0) return null
  if (VISIT_RE.test(t)) return 'zero_beside_visit'
  const meds = [...namedMedications(t, ctx.knownNames), ...ctx.onBoardNames.map((n) => resolveDrugClasses([n]))]
  for (const classes of meds) {
    for (const sign of signs) if (courseEffectOn(classes, sign).masks) return 'zero_beside_medication'
  }
  return null
}
