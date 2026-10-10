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
// A sentence about meals or doses alone ("hasn't had a full meal since the visit", "0 doses
// given") is set aside: it is an escalation, and refusing it would deflect it.
//
// What this does not see (stated, so it never reads as coverage): a visit the answer names only
// by its date when neither the answer nor the owner's current question names it (an earlier turn
// of the conversation is not read), and a zero phrased in words no arm lists. It is a DENYLIST: the
// structural answer (an allowlisted recount or a judge) is CUL-271's and stays open there. The
// prompt's rule 10 asks for the window and the logging instead, which carries no zero at all,
// and Ask's caller hands in every course the record holds on board or in its tail, so a zero is
// refused while one is, named or not.

// The sign nouns a zero is counted in. Wide on purpose: an owner's word ("honking", "runny
// poop", "hairballs") is still a sign, and an unlisted noun is caught by the generic arm below.
const ZERO_NOUN = String.raw`(?:vomit\w*|throw(?:ing|s)?[- ]?ups?|retch\w*|regurgitat\w*|hairballs?|gag\w*|diarrh\w*|loose stools?|runny \w+|stools?|poops?|cough\w*|hack\w*|honk\w*|sneez\w*|itch\w*|scratch\w*|lick\w*|skin\w*|rash\w*|hives|symptoms?|episodes?|bouts?|accidents?|flare-?ups?|times|incidents?|events?|entr(?:y|ies)|days?)`
const SIGN_VERB = String.raw`(?:vomit\w*|cough\w*|scratch\w*|itch\w*|sneez\w*|lick\w*|retch\w*|gag\w*|hack\w*|throwing up)`
const NEG = String.raw`(?:\b(?:has|have|had|did|was|were|is|are|does|do|could|can|would)(?:n${APOS}t|\s+not)|${APOS}(?:ve|s|d)\s+not)`

const ZERO_RES: RegExp[] = [
  // "0 vomiting episodes", "zero coughs", "no vomiting", "no new episodes", "not a single
  // cough", "without vomiting", "no days with vomiting". The noun is required, so "no need",
  // "no more than 3 episodes" and "No, she…" pass.
  new RegExp(
    String.raw`\b(?:0(?![.,:]\d)|zero|no|not (?:a single|one|any)|without(?:\s+(?:a|an|any))?)\s+(?:(?:new|more|further|other|logged|recorded|reported|single)\s+){0,2}(?:\w+\s+)?${ZERO_NOUN}\b`,
    'i',
  ),
  // "none logged", "Nothing's been logged", "none since", "nothing so far", "none of the
  // vomiting has come back", "she's had none", and a bare trailing "…, nothing."
  new RegExp(
    String.raw`\b(?:nothing|none)(?:${APOS}s)?(?:\s+(?:new|more|else|at all|of (?:them|it|those|the \w+)|(?:about|regarding)\s+\w+))?(?:\s+(?:is|was|were|are|has|have|had)(?:\s+been)?)?(?:\s+been)?\s+(?:logged|recorded|noted|reported|seen|since|so far|came back|come back|returned)\b`,
    'i',
  ),
  new RegExp(String.raw`\b(?:had|has had|have had|${APOS}s had|${APOS}ve had)\s+none\b|(?:^|[,:;])\s*nothing\s*(?:[.;!?]|$)`, 'i'),
  // "hasn't vomited", "has not had any episodes", "didn't log a cough", "vomiting has not been
  // logged", "hasn't recurred", "didn't happen again", "there hasn't been any vomiting",
  // "you've not logged any". An INTAKE absence ("hasn't eaten") never matches here, and a
  // sentence about meals or doses alone is set aside below.
  new RegExp(
    String.raw`${NEG}\s+(?:\w+\s+){0,2}?(?:vomited|coughed|scratched|itched|sneezed|licked|retched|gagged|thrown up|threw up|been sick|had (?:a|an|any|another)\b|logged (?:a|an|any|another)\b|(?:see|find|spot)\s+any\b|been any\b|been (?:a|an)\s+(?:single\s+)?(?:\w+\s+)?${ZERO_NOUN}|(?:shown up|turned up|appeared)(?!\s+(?:as|less|more|fewer|quite|so)\b)|been (?:logged|recorded|seen|noted|reported)(?!\s+as\b)|recurred|returned|come back|came back|happened(?: again)?(?!\s+before)|happen\b(?: again)?(?!\s+before))`,
    'i',
  ),
  // "has stopped vomiting", "the vomiting stopped". Not "stopped eating": an escalation.
  // "hasn't stopped vomiting" is the opposite claim, and never matches.
  new RegExp(String.raw`(?<!n${APOS}t\s|\bnot\s|\bnever\s|\bstill\s)\bstopped\s+${SIGN_VERB}|\b${SIGN_VERB}\s+(?:has\s+|have\s+|had\s+)?stopped\b`, 'i'),
  // "vomit-free", "symptom free", "clear of vomiting", "the log is clean / empty / quiet".
  new RegExp(String.raw`\b(?:vomit\w*|cough\w*|symptom|itch\w*|diarrh\w*|scratch\w*|sneez\w*|episode)[- ]free\b|\bclear of\b`, 'i'),
  new RegExp(
    String.raw`\b(?:log|logs|record|logging|it|things?)(?:${APOS}s)?\s+(?:(?:is|was|has been|have been|had been|looks?|stayed|been)\s+)?(?:\w+\s+)?(?:clean|empty|quiet|blank)\b`,
    'i',
  ),
  // A count stated after its noun or as a result: "…since the visit: 0", "the count is 0",
  // "vomiting 0", "vomiting none", "dropped to zero", "went from 5 to 0", "0 logged".
  new RegExp(String.raw`(?:[:=]|\b(?:is|are|was|were|at|stands at|to))\s*(?:0|zero)\b(?![.,:]\d)`, 'i'),
  new RegExp(String.raw`\b${ZERO_NOUN}\s+(?:0|zero|none)\b(?![.,:]\d)`, 'i'),
  new RegExp(String.raw`\b(?:0|zero)\s+(?:(?:were|are|was|is)\s+)?(?:logged|recorded)\b`, 'i'),
  // "on 0 of 14 days", "0/14 days", "0 of the last 3 days", "0% of days", "0.0 per day".
  new RegExp(String.raw`\b(?:0|zero|none)\s*(?:/|of)\s*(?:the\s+)?(?:last\s+|past\s+)?\d+\b`, 'i'),
  new RegExp(String.raw`(?:^|[^\d.])0(?:\.0+)?\s*(?:%|percent\b|per cent\b)|\b0\.0+\s+(?:per|a|an|each)\b`, 'i'),
  // The generic arm: a count of none of a noun no list above names ("no seizures logged").
  new RegExp(String.raw`\bno\s+\w+(?:\s+\w+)?\s+(?:logged|recorded|since|so far)\b`, 'i'),
  // Recall phrasings: "there's no record of vomiting", "the log shows nothing", "vomiting
  // doesn't appear", "Vomiting episodes in the last 14 days: none", "eaten well and not vomited".
  new RegExp(String.raw`\bno (?:record|trace|mention|entry|entries) of\b|\bno signs? of (?:any\s+)?(?:more\s+)?${SIGN_VERB}|\b(?:vomit\w*|cough\w*|diarrh\w*|itch\w*|scratch\w*|sneez\w*|symptoms?|episodes?)\s+(?:is|are|was|were|has been|have been)\s+absent\b|\bnothing\s+(?:about|on|regarding|for)\s+(?:her\s+|his\s+|the\s+)?${SIGN_VERB}|\bno signs? of (?:illness|being sick|anything)\b|\bno logs? (?:for|of)\s+${SIGN_VERB}|\bshows? nothing\b|\b(?:doesn${APOS}t|does not|don${APOS}t|do not)\s+(?:appear|show up)\b|[:=]\s*(?:none|nothing)\b`, 'i'),
  // "none of those entries is vomiting", "Vomiting isn't among them".
  new RegExp(String.raw`\bnone of (?:it|them|those|these|the)\b[^.;]{0,40}?\b(?:is|are|was|were)\b|\b(?:isn${APOS}t|is not|aren${APOS}t|are not|wasn${APOS}t|was not|weren${APOS}t|were not)\s+(?:among|in|on|part of)\s+(?:them|those|these|it|the (?:log|record|entries))\b`, 'i'),
  new RegExp(String.raw`(?<!\b(?:has|have|had|is|was|were|are)\s)\bnot\s+(?:vomited|coughed|scratched|itched|sneezed|licked|thrown up|been sick)\b`, 'i'),
]

const VISIT_RE = new RegExp(
  [
    String.raw`\b(?:visit(?:s|ed)?|appointments?|appts?|check-?ups?|re-?checks?|exams?|examination|consult(?:ation)?s?|clinic\w*|hospital\w*|discharg\w*|surger(?:y|ies)|dental)\b`,
    String.raw`\b(?:the|your|her|his|their)\s+vet\s+(?:saw|examined|checked|looked|treated|gave|injected)\b`,
    String.raw`\b(?:saw|seen\s+by|seeing)\s+(?:the|your|her|his|their|a)\s+vet\b`,
    String.raw`\b(?:since|after|before|at|from)\s+(?:the|her|his|their|your)\s+vet\b`,
    String.raw`\b(?:trip|visit|going|went|go|been)\s+to\s+(?:the|a|her|his|their|your)\s+(?:vet|er|emergency)\b`,
    String.raw`\bvet\s+(?:trip|appt|appointment|stay|check)\b`,
  ].join('|'),
  'i',
)
// Case-sensitive: "the ER", "Dr. Patel", "Dr Okafor".
const VISIT_CASED_RE = /\bER\b|\bDr\.?\s+[A-Z]/
// Routing advice names a place, not a visit that happened: "call the clinic", "go to the ER",
// "consult your vet", "bring this to her next appointment", "raise it at the exam". The prompt
// tells the model to route to the vet, so these are blanked before the visit test (adversarial
// pass 2, PR-45a: they deflected plain zero answers that named no visit and no drug).
const ROUTING_RE =
  /\b(?:call|ring|phone|contact|email|go to|head to|take her to|take him to|take them to|consult|book|schedule|bring (?:\w+ ){0,2}to|raise (?:\w+ ){0,2}(?:at|with)|ask (?:\w+ ){0,2}at|mention (?:\w+ ){0,2}at|at)\s+(?:the|your|her|his|their|an?|a)?\s*(?:next\s+|nearest\s+|local\s+|emergency\s+|24-hour\s+)*(?:clinic|vet|ER|hospital|appointment|appt|exam|check-?up|recheck|consult(?:ation)?)\b(?:\s+on\s+\w+\s+\d+)?/gi
function mentionsVisit(text: string): boolean {
  const t = text.replace(ROUTING_RE, ' ')
  return VISIT_RE.test(t) || VISIT_CASED_RE.test(t)
}

// A medication referred to without its name. Judged only when no name is written: "the
// prednisone … her medication" names one course, not two.
const GENERIC_MED_RE =
  /\b(?:medications?|medicines?|meds|drugs?|doses?|dosing|pills?|tablets?|injections?|injected|injectables?|shots?|jabs?|steroids?|antibiotics?|antiemetics?|inhalers?|rx|treatments?|prescription|prescribed|course)\b/i

const SIGN_WORDS: [RegExp, MaskSign[]][] = [
  [/\b(?:vomit\w*|threw up|thrown up|throw(?:ing|s)?[- ]?ups?|been sick|retch\w*|regurgitat\w*|hairballs?|gag\w*)\b/i, ['vomit']],
  [/\b(?:diarrh\w*|loose stools?|runny \w+|stools?|poops?)\b/i, ['diarrhea']],
  [/\b(?:cough\w*|hack\w*|honk\w*)\b/i, ['cough']],
  [/\bsneez\w*\b/i, ['sneeze']],
  [/\bitch\w*\b/i, ['itch']],
  [/\b(?:scratch\w*|lick\w*)\b/i, ['scratch']],
  [/\b(?:skin|rash\w*|hives)\b/i, ['skin_reaction']],
]

// A sentence about meals, food or doses alone is not a symptom zero: "she hasn't had a full meal
// since the visit" and "0 doses given, 3 missed" are escalations, and refusing them would trade
// the screen's protection for a deflection (adversarial review, PR-45a). A sentence that also
// names a sign or an episode is judged as a zero.
const INTAKE_OR_DOSE_RE =
  /\b(?:meals?|food|foods|eat\w*|ate|finish\w*|water|drink\w*|treats?|kibble|dinner|breakfast|lunch|appetite|doses?|given|administered|missed)\b/i
// Built from the same nouns and verbs the zero arms read, plus the phrasal forms, so the two
// can never drift apart (adversarial pass 2: "hasn't thrown up and is eating well" was set aside).
const SYMPTOM_ONLY_RE = new RegExp(
  String.raw`\b(?:${SIGN_VERB}|vomit\w*|thr(?:ew|own|ow\w*) up|throw(?:ing|s)?[- ]?ups?|brought (?:\w+ )?up|kept (?:\w+ )?down|retch\w*|regurgitat\w*|hairballs?|gag\w*|diarrh\w*|loose stools?|runny \w+|stools?|poops?|cough\w*|hack\w*|honk\w*|sneez\w*|itch\w*|scratch\w*|lick\w*|skin\w*|rash\w*|hives|symptoms?|episodes?|bouts?|flare-?ups?|sick)\b`,
  'i',
)
// A medication as the thing not logged ("prednisolone hasn't been logged since Oct 3", "nothing
// logged for her prednisolone") is an adherence escalation, set aside like a dose. A medication
// as the zero's anchor ("since the prednisolone, nothing") is not, and is judged.
const MED_NOT_LOGGED_RE =
  /\b(?:has|have|was|were)(?:n['’]t|\s+not)\s+been\s+(?:logged|recorded|given)\b|\b(?:logged|recorded|given)\s+for\s+(?:her|his|their|the)\b|\bno\s+(?:doses?|pills?)\b/i
// "no episodes other than 2 coughs": the exception names a sign the zero is NOT about.
const EXCEPTION_RE = /\b(?:other than|besides|except|apart from|aside from|but for|just|only)\b/i

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// A statement about the LOG, not the pet: "nothing was logged on Tuesday", "with nothing logged
// on 2 of them", "no entries exist for Sep 20 and 21", "days without a log can't be counted as
// days without vomiting". Rule 10's honest coverage form; blanked before the zero arms read the
// clause (adversarial pass 3: it deflected answers on every turn with a gap).
// A partial day count ("2 of 14", "2 of them") is coverage; an all-days count ("11 of 11") is the
// zero itself, so the numbers must differ. "those days", "some days" are not read as coverage:
// they are as often the zero's own window (adversarial pass 4).
const DAY_WORD = String.raw`(?:(?:mon|tues|wednes|thurs|fri|satur|sun)day|today|yesterday|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\w*\.?\s+\d{1,2}|(?<gapn>\d+)\s+of\s+(?!\k<gapn>\b)(?:\d+|them|the)\b|that day|the other \d+)`
const DATE_WORD = String.raw`(?:(?:mon|tues|wednes|thurs|fri|satur|sun)day|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\w*\.?\s+\d{1,2})`
const LOG_GAP_RES: RegExp[] = [
  new RegExp(
    String.raw`\b(?:nothing|no entries|no logs?|none)\b(?:\s+(?:was|were|is|are|has been|have been|had been|exist|exists))?(?:\s+(?:logged|recorded|entered))?\s+(?:on|for)\s+${DAY_WORD}`,
    'i',
  ),
  // "days without a log can't be counted", "the days where nothing was logged", "2 days have no
  // entries". Each stops at its own clause, so a zero in the next clause is still read.
  /\bdays?\s+(?:without|with no)\s+(?:a\s+|any\s+)?(?:log|logs|logging|entr(?:y|ies))\b/i,
  /\bdays?\s+(?:where|when|on which)\s+nothing\s+(?:was|is|has been)\s+logged\b/i,
  /\bdays?\s+(?:have|had|has)\s+no\s+(?:entries|logs?)\b/i,
]

// "nothing was logged between Sep 19 and Sep 21", "no entries from Sep 19 to Sep 21": blanked over
// the whole sentence before it is cut into clauses, since the range itself holds an "and".
const LOG_GAP_RANGE_RE = new RegExp(
  String.raw`\b(?:nothing|no entries|no logs?|none)\b(?:\s+(?:was|were|is|are|has been|have been|had been|exist|exists))?(?:\s+(?:logged|recorded|entered))?\s+(?:between\s+${DATE_WORD}\s+and|from\s+${DATE_WORD}\s+to)\s+${DATE_WORD}`,
  'gi',
)

// An escalation phrased with a negation: "there hasn't been a day without coughing".
const NEGATED_ESCALATION_RE =
  /\b(?:hasn['’]t|has not|haven['’]t|have not|wasn['’]t|was not)\s+been\s+(?:a|one)\s+(?:single\s+)?day\s+without\b[^,;.]*/gi

/** A clause with its coverage statements blanked, unless it names a sign: "nothing was logged
 *  on 11 of 11 days for vomiting" is the zero, not a gap. */
function withoutLogGaps(clause: string): string {
  if (SYMPTOM_ONLY_RE.test(clause.replace(/\bdays?\s+(?:without|with no)\s+(?:a\s+|any\s+)?(?:log|logs|logging|entr(?:y|ies))\b[^,;]*/gi, ' '))) {
    return clause
  }
  return LOG_GAP_RES.some((re) => re.test(clause)) ? ' ' : clause
}

/** Whether one clause states a symptom zero. A clause about meals, doses or a medication alone
 *  ("eaten 0 of 6 meals", "prednisolone hasn't been logged since Oct 3") is set aside: it is an
 *  intake or adherence escalation. Judged per CLAUSE, so a food word in one half of a sentence
 *  never hides a symptom zero in the other ("hasn't thrown up and is eating well"). */
function clauseHasZero(clause: string, meds: (c: string) => boolean): boolean {
  if (!ZERO_RES.some((re) => re.test(clause))) return false
  const setAside = INTAKE_OR_DOSE_RE.test(clause) || (meds(clause) && MED_NOT_LOGGED_RE.test(clause))
  return !setAside || SYMPTOM_ONLY_RE.test(clause)
}

/** The signs each zero in `text` counts: its own sentence's sign words, or every sign. */
function zeroSigns(text: string, meds: (c: string) => boolean): Set<MaskSign> {
  const signs = new Set<MaskSign>()
  for (const raw of text.split(/(?<=[.;?!])\s+|\n+/)) {
    const sentence = raw.replace(NEGATED_ESCALATION_RE, ' ').replace(LOG_GAP_RANGE_RE, ' ')
    const clauses = sentence.split(/[,;]|\s(?:and|but|while|though|so)\s/i).map(withoutLogGaps)
    if (!clauses.some((c) => clauseHasZero(c, meds))) continue
    let named = false
    if (!EXCEPTION_RE.test(sentence)) {
      for (const [re, ss] of SIGN_WORDS) {
        if (re.test(sentence)) {
          named = true
          for (const s of ss) signs.add(s)
        }
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
    else if (w.includes('-') && DRUG_NAME_CLASSES[w.replace(/-/g, '')]) out.push([...DRUG_NAME_CLASSES[w.replace(/-/g, '')]])
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
  /** The owner asked about a visit ("has she vomited since her vet visit?"), so a zero the
   *  answer dates ("since Sep 16") sits beside that visit though it never says the word. */
  visitInContext: boolean
}

export type ZeroBesideCareReason = 'zero_beside_visit' | 'zero_beside_medication'

/** Whether `text` puts a zero beside a visit or beside a medication that can hide the counted
 *  sign (CUL-1429). Both lists are required: an empty list is a statement that the record
 *  handed over no medication, never a default (C-37). */
export function zeroBesideCareReason(text: string, ctx: ZeroBesideCareContext): ZeroBesideCareReason | null {
  // NFKC folds lookalike and full-width letters; a soft hyphen is dropped.
  const t = (text ?? '').normalize('NFKC').replace(/\u00ad/g, '')
  const signs = zeroSigns(t, (clause) => namedMedications(clause, ctx.knownNames).length > 0)
  if (signs.size === 0) return null
  if (ctx.visitInContext || mentionsVisit(t)) return 'zero_beside_visit'
  const meds = [...namedMedications(t, ctx.knownNames), ...ctx.onBoardNames.map((n) => resolveDrugClasses([n]))]
  for (const classes of meds) {
    for (const sign of signs) if (courseEffectOn(classes, sign).masks) return 'zero_beside_medication'
  }
  return null
}

/** Whether a question or an earlier turn names a visit, read the way the zero screen reads an
 *  answer (routing advice set aside). Ask's caller passes it as `visitInContext`. */
export function textMentionsVisit(text: string): boolean {
  return mentionsVisit((text ?? '').normalize('NFKC'))
}
