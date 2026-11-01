// The AI lead's verifier: the bake-off's verifier (verifyCore.ts, `verify.py` ported verbatim)
// held to the v2 contract (spec §9.1, PM 2026-10-31). Run on the exact text that prints:
// `printedSentences` is the one function the renderer and the stored copy both read, and nothing
// is trimmed or reformatted after it (spec §9.1, "verified on the exact printed text").
//
// Every rule here only ever REMOVES a lead. A false rejection costs the vet one paragraph and
// prints the code lines alone; a false pass can put a misleading sentence above a safety line.
// So each rule is deliberately lexical and deliberately strict.
//
// What the core already checks (verify.py §4): every number, date, time, weekday, food and drug
// is in a cited fact; the banned phrase classes H1 to H7, AP, MIN, VAGUE, RATE, REL, VOICE;
// person names; required facts and must-say groups; a live band cited in sentence 1.
//
// What v2 adds, each a rule the bake-off found the core could not see:
//   structure   1 to 3 sentences, at most 60 words IN ALL (the core counts per sentence)
//   quotes      no quotation marks at all (R-12: owner words never print in the lead)
//   band-first  sentence 1 cites band item 1, and its first clause uses that item's label noun
//   band-once   at most one sentence cites any band fact (may restate the band once, no more)
//   period-run  no run of 3 or more period counts ("3 in week 1, 2 in week 2, 0 in week 3")
//   order       H2 by order with no causal word (the Data Scientist's 2026-10-31 exhibit): an
//               exposure and an observation in one sentence, by any word; and an observation
//               sentence set after an earlier exposure sentence by a word of sequence
//   absence     an ending, absence or softening word said of a sign or flag ("stopped",
//               "single", "dipped") unless the cited line itself prints that word
//   band-numbers band item 1's headline numbers, as digits, in sentence 1
//   waiver      "not as a cause" only, when a cited fact prints it (waiveSideBySide)
//   names       every capitalised word past the first is printed in a cited fact (a product the
//               lexicon does not know is still caught)

import { norm, verifyBakeoff, type FactTable, type VerifyIssue, type VerifyReport } from './verifyCore.ts'

/** The writer's output after schema validation: every sentence has text and cites. */
// Type aliases, not interfaces: an alias is assignable to the core's index-signature types.
export type LeadSentence = { text: string; cites: string[] }
export type LeadSummary = { sentences: LeadSentence[] }

export const LEAD_VERIFIER_VERSION = 'vr2-2'
export const LEAD_MAX_SENTENCES = 3
export const LEAD_MAX_WORDS = 60
export const PERIOD_RUN_MAX = 2

export interface LeadVerdict {
  verifier: typeof LEAD_VERIFIER_VERSION
  pass: boolean
  errors: VerifyIssue[]
  core: VerifyReport
}

const QUOTE_MARKS = /["“”‘„«»]/
/** Words that set an observation in time after something else (adversarial pass 1, 4 and 5). On a
 *  sentence citing an observation after one that cited an exposure, any of these rejects. */
const SEQUENCE_WORDS = /\b(?:after|afterwards?|before|then|thereafter|subsequently|since|until|once|following|followed|later|earlier|during|while|throughout|meanwhile|next|from then)\b/i
/** Absence, ending and softening said of a sign or a flag: reassurance by another word (H4) or a
 *  flag made smaller (H7) (adversarial pass 1, 6 to 8). The core's lists do not hold these. */
const ABSENCE_WORDS = /\b(?:stop(?:ped|s|ping)?|ceas\w*|ended|ending|resolv\w*|not (?:seen|logged|recorded) again|not recur\w*|did not recur|has not recurred|none (?:after|since)|no (?:more|further|longer|new)|single|isolated|one-off|one-time|only once|just once|dipp?\w*|brief(?:ly)?|transient\w*|temporar\w*|passing|minor|small)\b/i
const ORDER_WORDS = /\b(?:after|before|then|followed|following|since|until|once|started|starting|began|begun|ended|ending|first fed|later|earlier|subsequently|thereafter)\b/i
const PERIOD_COUNT = /\b\d+(?:\s+\w+){0,3}?\s+(?:in|on|during|over)\s+(?:the\s+)?(?:\w+\s+)?(?:weeks?|months?|fortnights?|wk)\b|\b(?:weeks?|months?)\s+\d+\s*[:=]\s*\d+/gi
const MONTHS_AND_DAYS = new Set([
  'Jan', 'January', 'Feb', 'February', 'Mar', 'March', 'Apr', 'April', 'May', 'Jun', 'June', 'Jul', 'July',
  'Aug', 'August', 'Sep', 'Sept', 'September', 'Oct', 'October', 'Nov', 'November', 'Dec', 'December',
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
])

/** An exposure: something given or fed. An observation: something seen or counted. */
function isExposure(id: string): boolean {
  return id === 'trial' || id === 'confounder' || id.startsWith('medication-')
}
function isObservation(id: string): boolean {
  return id === 'line-1' || id === 'intake' || id === 'coverage' || id === 'noticed' || id.startsWith('sign-') || id.startsWith('band-')
}

function words(text: string): number {
  return norm(text).split(' ').filter((w) => w !== '').length
}

function firstClause(text: string): string {
  return norm(text).split(/[,:;]|\s[–—-]\s/)[0].toLowerCase()
}

/** The sentences exactly as they print, in order. The renderer, the stored lead text and
 *  this verifier all read this one function's output. */
export function printedSentences(summary: LeadSummary): string[] {
  return summary.sentences.map((s) => norm(s.text))
}

/** The lead's stored text: the printed sentences joined by one space. */
export function printedLeadText(summary: LeadSummary): string {
  return printedSentences(summary).join(' ')
}

export function verifyLead(table: FactTable, summary: LeadSummary): LeadVerdict {
  // The core judges the printed form, never the model's raw strings.
  const printed: LeadSummary = { sentences: summary.sentences.map((s, i) => ({ text: printedSentences(summary)[i], cites: s.cites })) }
  const core = verifyBakeoff(table, printed, { minSentences: 1, maxSentences: LEAD_MAX_SENTENCES, maxWordsPerSentence: LEAD_MAX_WORDS })
  const errors: VerifyIssue[] = waiveSideBySide(core.errors, printed, table)
  const err = (sentence: number | null, check: string, detail: string) => errors.push({ sentence, check, detail })
  const facts = new Map(table.facts.map((f) => [f.id, f]))
  const sents = printed.sentences

  const total = sents.reduce((n, s) => n + words(s.text), 0)
  if (total > LEAD_MAX_WORDS) err(null, 'structure', `the lead has ${total} words (max ${LEAD_MAX_WORDS})`)

  const band = table.facts.filter((f) => f.role === 'band')
  if (band.length > 0) {
    const first = sents[0]
    if (!first || !first.cites.includes(band[0].id)) {
      err(1, 'band-first', `sentence 1 must cite band item 1 (${band[0].id})`)
    } else {
      const raw = (band[0] as { label?: unknown }).label
      const label = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
      // No label is no way to check the first clause, so it rejects (a missing label is a bug).
      if (label === '' || !firstClause(first.text).includes(label)) {
        err(1, 'band-first', `sentence 1's first clause does not name band item 1 (${label})`)
      }
    }
  }
  const bandSentences = sents.filter((s) => s.cites.some((c) => facts.get(c)?.role === 'band')).length
  if (bandSentences > 1) err(null, 'band-once', `${bandSentences} sentences cite band facts (max 1)`)

  // Band item 1's headline numbers, as digits, in sentence 1 (facts.ts `headlineNumbers`).
  const leadNumbers = (band[0] as { lead_numbers?: unknown } | undefined)?.lead_numbers
  if (Array.isArray(leadNumbers) && sents[0]) {
    for (const n of leadNumbers) {
      if (typeof n === 'string' && !new RegExp(`(?<![\\d.])${n.replace('.', '\\.')}(?![\\d.])`).test(sents[0].text)) {
        err(1, 'band-numbers', `sentence 1 drops band item 1's number ${n}`)
      }
    }
  }

  const periodCounts = sents.reduce((n, s) => n + [...s.text.matchAll(PERIOD_COUNT)].length, 0)
  if (periodCounts > PERIOD_RUN_MAX) err(null, 'period-run', `${periodCounts} period counts (max ${PERIOD_RUN_MAX})`)

  sents.forEach((s, idx) => {
    const i = idx + 1
    if (QUOTE_MARKS.test(s.text)) err(i, 'quotes', 'the lead never quotes (owner words never print in it)')

    const exposure = s.cites.some(isExposure)
    const observed = s.cites.some(isObservation)
    // An exposure and an observation never share a sentence, whatever joins them: "after",
    // "during", "while" and "with" all set a change beside a count (H2). The one exception is a
    // cited line that itself states both windows "side by side, not as a cause".
    if (exposure && observed) {
      const sideBySide = /\bnot as a cause\b/i.test(s.text) && s.cites.some((c) => /\bnot as a cause\b/i.test(facts.get(c)?.text ?? ''))
      if (!sideBySide) {
        const order = s.text.match(ORDER_WORDS)
        err(i, 'order', order ? `an exposure and an observation joined by ${JSON.stringify(order[0])} (H2, cause by order)` : 'an exposure and an observation in one sentence (H2)')
      }
    }
    // Across sentences: once an exposure has been named, an observation sentence may not be set
    // after it in time ("After it ended, vomiting…", "Vomiting then…").
    if (observed && !exposure && sents.slice(0, idx).some((p) => p.cites.some(isExposure))) {
      const seq = s.text.match(SEQUENCE_WORDS)
      if (seq) err(i, 'order', `${JSON.stringify(seq[0])} sets an observation after an exposure named earlier (H2, cause by order)`)
    }
    if (observed) {
      const soft = s.text.match(ABSENCE_WORDS)
      if (soft && !s.cites.some((c) => new RegExp(`\\b${soft[0]}\\b`, 'i').test(facts.get(c)?.text ?? ''))) {
        err(i, 'absence', `${JSON.stringify(soft[0])} said of a sign or a flag (H4, H7)`)
      }
    }

    const cited = s.cites.map((c) => facts.get(c)?.text ?? '').join(' ')
    const tokens = s.text.match(/(?<![\w'’])[A-Z][\w'’-]*/g) ?? []
    for (const t of tokens.slice(1)) {
      if (MONTHS_AND_DAYS.has(t.replace(/\.$/, ''))) continue
      if (!new RegExp(`(?<![\\w])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w])`).test(cited)) {
        err(i, 'names', `${JSON.stringify(t)} is not printed in a cited fact`)
      }
    }
  })

  return { verifier: LEAD_VERIFIER_VERSION, pass: errors.length === 0, errors, core }
}

/** The one waiver: the core bans "cause" outright (H2), which would also reject the exhibit's own
 *  fix, a line stating two windows "side by side, not as a cause". A `'cause'` hit is waived only
 *  for each exact "not as a cause" in a sentence that cites a fact printing that same phrase; any
 *  other cause word in the sentence still rejects it. */
function waiveSideBySide(errors: VerifyIssue[], summary: LeadSummary, table: FactTable): VerifyIssue[] {
  const facts = new Map(table.facts.map((f) => [f.id, f]))
  const budget = new Map<number, number>()
  summary.sentences.forEach((s, idx) => {
    const cited = s.cites.some((c) => /\bnot as a cause\b/i.test(facts.get(c)?.text ?? ''))
    const n = (norm(s.text).match(/\bnot as a cause\b/gi) ?? []).length
    if (cited && n > 0) budget.set(idx + 1, n)
  })
  return errors.filter((e) => {
    if (e.check !== 'banned:H2' || e.detail !== "'cause'" || e.sentence === null) return true
    const left = budget.get(e.sentence) ?? 0
    if (left === 0) return true
    budget.set(e.sentence, left - 1)
    return false
  })
}
