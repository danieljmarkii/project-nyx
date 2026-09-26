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
// A keyword screen is not paraphrase-proof: the structural question (a denylist versus an
// allowlisted recount or a judge) is CUL-271's and stays open there. What this module buys is
// that the screens agree: the banner used to mirror phrasing.ts by hand ("KEEP IN SYNC"), and
// a new arm added in one place and not the other is exactly the drift that let a sibling
// screen fall behind. Deno needs the `.ts` import extension, so importers from
// `supabase/functions` write '../../../lib/careClaimScreens.ts'; this file imports nothing.
//
// Apostrophes: models emit both ' and ’, so every contraction arm takes either.

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
