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

/** Delegation / containment: the concern is declared held, handed off, or finished. */
export const DELEGATION_RE = new RegExp(
  [
    // "under control", "in check", "at bay" — containment verdicts, whoever holds it.
    String.raw`\bunder control\b`,
    String.raw`\bin check\b`,
    String.raw`\bat bay\b`,
    // "your vet has it covered", "the vet's got this handled", "they have things in hand"
    String.raw`(?:\b(?:has|have|had)|['’](?:s|ve|d))\s+(?:got\s+|gotten\s+)?(?:it|this|that|things|everything|her|him|them)\s+(?:all\s+)?(?:covered|handled|in hand|sorted)\b`,
    // "in the vet's hands", "in your vet's hands", "in good hands"
    String.raw`\bin\s+(?:(?:the|your|her|his|their|a|nyx['’]s)\s+)?(?:vet['’]?s|vets['’]|doctor['’]?s|good|safe|capable|expert|professional|the right)\s+hands\b`,
    // "the vet is on it", "your vet's handling it"
    String.raw`\b(?:vet|vets|doctor|clinic)\s*(?:is|are|['’]s|['’]re)\s+(?:on|handling|managing|across)\s+(?:it|this|that|things)\b`,
    // "nothing more to do", "nothing else you can do", "nothing further needed". The bare
    // "nothing to do" arm also takes "nothing to do with the food" — a causal-negation claim
    // the app may not make either, so the collision is in the safe direction.
    String.raw`\bnothing\s+(?:(?:more|else|further)\s+)?(?:(?:to|for you to|you need to|you can|we can|that can)\s+(?:be\s+)?(?:do|done|watch|monitor)|needed|required)\b`,
    // "no need to call the vet / to go back / for another visit"
    String.raw`\bno need (?:to\s+(?:call|see|book|contact|ring|go back|follow up|return|bring)|for\s+(?:a|another|any)\s+(?:vet|visit|check|appointment|follow[- ]?up))\b`,
    // "taken care of", "dealt with", "being handled / managed", "well managed"
    String.raw`\btaken care of\b`,
    String.raw`\bdealt with\b`,
    String.raw`\bbeing\s+(?:handled|managed)\b`,
    String.raw`\bwell[- ]managed\b`,
    // "resolved", "cleared up", "behind her now", "no longer a concern"
    String.raw`\bresolv(?:ed|ing)\b`,
    String.raw`\bcleared up\b`,
    String.raw`\bbehind (?:her|him|them|us|you)\b`,
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
    String.raw`(?:\b(?:is|are|was|were|seems? to be|seemed to be|appears? to be|appeared to be|looks? to be|has been|have been|had been|may be|might be|could be|must be)|['’](?:s|re))\s+(?:(?:really|clearly|definitely|already|finally|probably|likely|slowly)\s+)?(?:helping(?!\s+(?:herself|himself|themselves|itself))|working(?!\s+(?:through|on|at|out|her way|his way|their way))|doing (?:its|the|their) (?:job|trick)|kicking in|taking effect|paying off|making (?:a|the|some) difference|effective|successful)\b`,
    // "has helped", "seems to have worked", "made a difference", and the bare past forms
    // ("the prednisone helped her cough", "the new food worked") — an effect verdict in any
    // tense. Bare "helped"/"worked" never appear in an honest count/date recount.
    String.raw`\b(?:helped|worked|kicked in|took effect|paid off)\b`,
    String.raw`\b(?:made|makes|making) (?:a|the|some|a real|a big) difference\b`,
    String.raw`\bdid the trick\b`,
    // "has settled since the prednisone started", "calmed down after the visit",
    // "eased off once she started the new food". The verb is the verdict, "since" the
    // attribution; "4 episodes since the visit" carries neither verb and passes.
    String.raw`\b(?:(?:settled|eased|calmed|subsided|quiet(?:ed|ened)|lessened|cleared|improved|gotten better|got better)(?:\s+(?:down|off|up))?|died down|let up|tapered off)\s+(?:(?:a lot|a bit|right|quite a bit|noticeably|nicely)\s+)?(?:since|after|once)\b`,
    // "thanks to the prednisone", "responding well to the treatment"
    String.raw`\bthanks to\b`,
    String.raw`\brespond(?:s|ed|ing)?\s+(?:(?:well|nicely|poorly|badly)\s+)?to\b`,
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
