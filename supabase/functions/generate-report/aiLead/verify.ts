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
//   absence     an ending, absence, minimising or window-relative word said of a sign or flag
//               ("stopped", "single", "dipped", "short of"), every match, no exemption
//   band-numbers every number band item 1 prints (outside dates), as digits, in sentence 1
//   number-binding each digit keeps the word its cited line prints after it
//   numbers     no spelled-out counts
//   classes     exposure and observation are read from the cites AND the words
//   one-observation, recency, window  pass 3: one sign per sentence; "N days ago" exactly as a
//               line prints it; a risk window only verbatim, once
//   intake-positive "fully eaten", "eating well" print only when a cited line says so, unnegated
//   waiver      "not as a cause" only, when a cited fact prints it (waiveSideBySide)
//   names       every capitalised word past the first is printed in a cited fact (a product the
//               lexicon does not know is still caught)

import { extractDates, extractNumbers, extractTimes, norm, verifyBakeoff, type FactTable, type VerifyIssue, type VerifyReport } from './verifyCore.ts'

/** The writer's output after schema validation: every sentence has text and cites. */
// Type aliases, not interfaces: an alias is assignable to the core's index-signature types.
export type LeadSentence = { text: string; cites: string[] }
export type LeadSummary = { sentences: LeadSentence[] }

export const LEAD_VERIFIER_VERSION = 'vr2-4'
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
/** Absence, ending, minimising and window-relative words said of a sign or a flag: reassurance by
 *  another word (H4), or a flag made smaller, older or not yet due (H7). Every match is checked, and
 *  no cited line excuses one: "not a single incident" in a line is not licence for "single"
 *  (adversarial passes 1 and 2). Errs loud: a lead that needs one of these words is dropped. */
const ABSENCE_WORDS = /\b(?:stop(?:ped|s|ping)?|ceas\w*|ended|ending|resolv\w*|recover\w*|not (?:been )?(?:seen|logged|recorded|noted)(?: again| since)?|not recur\w*|did not recur|has not recurred|none (?:after|since)|no (?:more|further|longer|new)|single|isolated|one-off|one-time|only once|just once|dipp?\w*|brief(?:ly)?|transient\w*|temporar\w*|passing|minor|small|taper\w*|fad(?:ed|ing|es)|wan(?:ed|ing|es)|absent|absence|rare\w*|infrequent\w*|in the past|behind (?:her|him|them|it)|short(?:-lived)?|shy of|not yet|yet to|within|inside|under|less|fewer|lower|gone|over now|approach\w*|nearing|close to|ruled? out|rules out|ruling out|histor\w*|previous\w*|prior|perhaps|maybe|artefact\w*|artifact\w*|modest\w*|shortfall\w*|let up|died down|calm\w*|settl\w*|subsid\w*|intact|reassur\w*)\b/gi
/** Signs and flags named in words, whatever the sentence cites (adversarial pass 2, break 2: a
 *  sentence citing only the trial said "the coughing stopped"). */
const SIGN_WORDS = /\b(?:flare\w*|prurit\w*|vomit\w*|cough\w*|itch\w*|scratch\w*|sneez\w*|diarrh\w*|stools?|loose|intake|meals?|eat\w*|ate|appetite|weight|weigh\w*|letharg\w*|lick\w*|chew\w*|flags?|symptoms?|signs?|episodes?|incidents?|entr(?:y|ies)|refus\w*|foreign|blood\w*|hairballs?|gag\w*|retch\w*|hunched|hiding|scoot\w*|limp\w*|pain\w*|drink\w*|thirst\w*|urin\w*|seizures?|breath\w*|wheez\w*)\b/i
/** Exposures named in words: a diet, a food, a medicine, a dose. */
const EXPOSURE_WORDS = /\b(?:trials?|diets?|foods?|fed|feed\w*|treats?|doses?|dosing|given|gave|courses?|medications?|medicines?|drugs?|supplements?|tablets?|pills?|injections?)\b/i
/** Intake said to be adequate. Prints only when a cited line says it the same way, not negated
 *  (adversarial pass 2: "22 recent rated meals fully eaten" read a baseline count as adequacy). */
const POSITIVE_INTAKE = /(?<!\bnot (?:fully )?)(?<!\bpartly )\b(?:fully eaten|eaten|ate|eats|finished|eat(?:s|ing)? (?:well|normally|fine)|cleared (?:the|her|his|their) bowl|good appetite|normal appetite)\b(?! some\b)/i

const POSITIVE_ALL = new RegExp(POSITIVE_INTAKE.source, 'gi')

/** Spelled-out counts escape the number checks; digits only. */
const SPELLED_NUMBERS = /\b(?:zero|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twice|thrice|once|dozen|several|couple)\b/i
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

/** The text with its dates and times blanked, ranges spelled "48 to 72", so a day of the month is
 *  never read as a count. */
function countText(text: string, year: string): string {
  const [, noDates] = extractDates(norm(text), year)
  const [, noTimes] = extractTimes(noDates)
  return noTimes.replace(/(\d)\s*[-–]\s*(\d)/g, '$1 to $2')
}

function numbersOf(text: string, year: string): number[] {
  return extractNumbers(countText(text, year).replace(/\b(?:one|once)\b/gi, ' '))
}

/** "<number>|<the word after it>" for every digit count in the text, lower-cased. */
function numberBindings(text: string, year: string): string[] {
  // Any symbol before a digit (≥, <, ~, +, #) is stripped, so "<48 h" is bound like "48 h"
  // (adversarial pass 3, B3: a prefixed number skipped the binding entirely).
  const tokens = countText(text, year).split(/\s+/).map((t) => t.replace(/^[^\p{L}\p{N}]+(?=\p{N})/u, '').replace(/^[(\[]+/, ''))
  const word = (t: string | undefined) => (t ?? '').toLowerCase().replace(/[^a-z0-9%]/g, '')
  const out: string[] = []
  tokens.forEach((t, k) => {
    const m = t.match(/^(\d+(?:\.\d+)?)(%?)([,.;:)\]]*)$/)
    if (!m) return
    // A number that ends its phrase ("day 61 of 84.", "84, from") binds to the phrase's end AND
    // to the word before it, so "day 84" cannot stand for "day 61 of 84" (pass 3, B7).
    if (m[2] !== '%' && m[3] !== '') out.push(`${word(tokens[k - 1])}<${m[1]}|`)
    else out.push(`${m[1]}|${m[2] === '%' ? '%' : word(tokens[k + 1])}`)
  })
  return out
}

/** The clauses of a line that name a risk window, normalised and lower-cased, without their stop. */
function windowClauses(text: string): string[] {
  return norm(text).split(/(?<=[.!?])\s+/).filter((c) => /\brisk window\b/i.test(c)).map((c) => c.replace(/[.!?]+$/, '').toLowerCase())
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

  // Every number band item 1 prints (outside its dates), as digits, in sentence 1: its count, its
  // hours, its window (adversarial pass 2: "short of the 48–72 h window" dropped the 50 h).
  const year = String(table.year ?? '2026')
  if (band[0] && sents[0]) {
    const have = new Set(numbersOf(sents[0].text, year))
    for (const n of new Set(numbersOf(band[0].text ?? '', year))) {
      if (!have.has(n)) err(1, 'band-numbers', `sentence 1 drops band item 1's number ${n}`)
    }
  }

  const windows = sents.reduce((n, s) => n + (s.text.match(/\bwindow\b/gi) ?? []).length, 0)
  if (windows > 1) err(null, 'window', `"window" ${windows} times (max 1)`)

  const periodCounts = sents.reduce((n, s) => n + [...s.text.matchAll(PERIOD_COUNT)].length, 0)
  if (periodCounts > PERIOD_RUN_MAX) err(null, 'period-run', `${periodCounts} period counts (max ${PERIOD_RUN_MAX})`)

  sents.forEach((s, idx) => {
    const i = idx + 1
    if (QUOTE_MARKS.test(s.text)) err(i, 'quotes', 'the lead never quotes (owner words never print in it)')

    // Classes from the cites AND the words: citing only the trial does not license naming a sign.
    const exposure = s.cites.some(isExposure) || EXPOSURE_WORDS.test(s.text)
    const observed = s.cites.some(isObservation) || SIGN_WORDS.test(s.text)
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
    const earlierExposure = sents.slice(0, idx).some((p) => p.cites.some(isExposure) || EXPOSURE_WORDS.test(p.text))
    if (observed && !exposure && earlierExposure) {
      const seq = s.text.match(SEQUENCE_WORDS)
      if (seq) err(i, 'order', `${JSON.stringify(seq[0])} sets an observation after an exposure named earlier (H2, cause by order)`)
    }
    // On EVERY sentence: a pronoun ("…day 61 of 84, and it has stopped") names a sign no word
    // list can see (adversarial pass 3, B1). A trial or a course may not "end" in the lead either.
    for (const m of s.text.matchAll(ABSENCE_WORDS)) err(i, 'absence', `${JSON.stringify(m[0])}: an ending, absence or softening word (H4, H7)`)
    // One observation per sentence, so a number or date cannot move from one sign to another
    // (pass 3, B4: the cough's "10 days ago" set on vomiting).
    const observations = s.cites.filter(isObservation)
    if (observations.length > 1) err(i, 'one-observation', `${observations.length} signs or flags cited in one sentence (max 1)`)
    // "N <unit> ago" is a recency: it must be printed in a cited line exactly (pass 3, B4).
    for (const m of countText(s.text, year).matchAll(/\b(\d+(?:\.\d+)?)\s+(days?|h|hours?|weeks?)\s+ago\b/gi)) {
      const phrase = `${m[1]} ${m[2]} ago`.toLowerCase()
      if (!s.cites.some((c) => countText(facts.get(c)?.text ?? '', year).toLowerCase().includes(phrase))) err(i, 'recency', `${JSON.stringify(phrase)} is not how a cited line dates it`)
    }
    // A risk window prints only as its line prints it, and only once (pass 3, B2: "below",
    // "approaching" and "before the ≥48–72 h window" on a cat already at about 50 h).
    for (const c of s.cites) {
      for (const clause of windowClauses(facts.get(c)?.text ?? '')) {
        const nums = numbersOf(clause, year)
        const touches = /\bwindow\b/i.test(s.text) || numbersOf(s.text, year).some((n) => nums.includes(n))
        if (touches && !norm(s.text).toLowerCase().includes(clause)) err(i, 'window', `a risk window restated other than as its line prints it: ${JSON.stringify(clause)}`)
      }
    }
    // Each adequacy phrase is excused only by the SAME phrase, unnegated, in a cited line: the
    // band's "fully-eaten meal was Oct 14" excuses nothing (pass 3, B6).
    const allowed = new Set(s.cites.flatMap((c) => [...norm(facts.get(c)?.text ?? '').matchAll(POSITIVE_ALL)].map((m) => m[0].toLowerCase())))
    for (const m of norm(s.text).matchAll(POSITIVE_ALL)) {
      if (!allowed.has(m[0].toLowerCase())) err(i, 'intake-positive', `${JSON.stringify(m[0])}: no cited line says intake was adequate in these words (H3)`)
    }
    const spelled = s.text.match(SPELLED_NUMBERS)
    if (spelled) err(i, 'numbers', `${JSON.stringify(spelled[0])}: counts are written as digits`)

    // Each number keeps the word its line prints after it ("16 entries", "12 of 45", "50 h"), so
    // true numbers cannot be recombined into a claim no line makes ("22 … fully eaten", "4 of 44")
    // (adversarial pass 2, break 5; pass 1, break 9).
    const bound = new Set(s.cites.flatMap((c) => numberBindings(facts.get(c)?.text ?? '', year)))
    for (const pair of numberBindings(s.text, year)) {
      if (!bound.has(pair)) err(i, 'number-binding', `"${pair.replace('<', ' ').replace('|', ' ').trim()}" is not how a cited line prints that number`)
    }

    // The cited lines normalised as the lead is (curly apostrophes), so "Hill's" matches.
    const cited = s.cites.map((c) => norm(facts.get(c)?.text ?? '')).join(' ')
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
