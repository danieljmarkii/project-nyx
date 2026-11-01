// The bake-off verifier, ported verbatim from docs/vet-report-v3-discovery/bakeoff/verify.py
// (CUL-2305; spec docs/nyx-vet-report-v2-requirements.md §9.1). It is deliberately strict and
// deliberately only lexical: it checks what an AI-written summary SAID against a fact table,
// never what it implied. The v2 contract layer (what the shipped report additionally demands)
// lives in verify.ts; this file stays a faithful port so the bake-off's measured pass/fail
// results still hold for the code that ships. Parity is proven exhibit-by-exhibit against the
// real python output in verifyCore.test.ts (exhibits/expected.json) — change the python and
// regenerate, never edit one side alone.
//
// Why the regexes are translated rather than copied: python's `re` on str is Unicode-aware
// (\w, \d, \s, \b see every script) while JS's are ASCII unless rewritten, and python's `$`
// also matches before a final newline. `pyRe` rewrites those four escapes and `$` so the
// patterns below can stay byte-for-byte the python source.

export const VERIFIER_VERSION = 'bakeoff-1'

// ---------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------

export type Fact = {
  id: string
  text?: string
  kind?: string
  role?: string
  live?: boolean
  required?: boolean
  numbers?: unknown[]
  dates?: string[]
  foods?: string[]
  drugs?: string[]
  proteins?: string[]
  quotes?: string[]
  must_say?: string[][]
  [key: string]: unknown
}

export type ConditionalRule = {
  when?: string
  terms: string[]
  cite: string
  why?: string
  [key: string]: unknown
}

export type FactTable = {
  fixture?: unknown
  year?: string | number
  facts: Fact[]
  lexicon?: { foods?: Record<string, string[]>; drugs?: Record<string, string[]> }
  forbidden_names?: string[]
  safety_live?: boolean
  intake_not_directly_observed?: boolean
  require_any_sentence?: string[][]
  conditional?: ConditionalRule[]
  [key: string]: unknown
}

export type SummarySentence = { text?: string; cites?: string[]; [key: string]: unknown }
export type Summary = { sentences: SummarySentence[]; [key: string]: unknown }

export type VerifyIssue = { sentence: number | null; check: string; detail: string }

export type SentenceRecord = {
  i: number
  text: string
  cites: string[]
  quotes: string[]
  dates: string[]
  times: string[]
  terms: string[]
  numbers: number[]
}

export type VerifyReport = {
  verifier: string
  fixture: unknown
  pass: boolean
  error_count: number
  errors: VerifyIssue[]
  warnings: VerifyIssue[]
  facts_cited: string[]
  sentences: SentenceRecord[]
}

export type StructureLimits = { minSentences: number; maxSentences: number; maxWordsPerSentence: number }

export const DEFAULT_LIMITS: StructureLimits = { minSentences: 3, maxSentences: 6, maxWordsPerSentence: 55 }

// ---------------------------------------------------------------------------------------------
// Python-semantics helpers
// ---------------------------------------------------------------------------------------------

// str.isspace() / re's \s on str: JS's \s lacks \x1c-\x1f and \x85, and adds U+FEFF.
const PY_WS = '\\t\\n\\v\\f\\r \\x1c-\\x1f\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000'
// re's \w on str is str.isalnum() or '_': letters (L*) and numerics (N*).
const PY_W = '\\p{L}\\p{N}_'
const PY_B = `(?:(?<=[${PY_W}])(?![${PY_W}])|(?<![${PY_W}])(?=[${PY_W}]))`

/** Translate a python `re` pattern (str, no re.ASCII) to an equivalent JS `u` RegExp source. */
export function pyReSource(src: string): string {
  let out = ''
  let inClass = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (c === '\\' && i + 1 < src.length) {
      const n = src[i + 1]
      i++
      if (n === 'w') out += inClass ? PY_W : `[${PY_W}]`
      else if (n === 'W') out += inClass ? '\\P{L}' : `[^${PY_W}]` // \W is never used inside a class here
      else if (n === 'd') out += '\\p{Nd}'
      else if (n === 's') out += inClass ? PY_WS : `[${PY_WS}]`
      else if (n === 'b' && !inClass) out += PY_B
      else out += '\\' + n
      continue
    }
    if (inClass) {
      if (c === ']') inClass = false
      out += c
      continue
    }
    if (c === '[') {
      inClass = true
      out += c
      // a leading ']' or '^]' is literal in python; none of our patterns use it
      continue
    }
    if (c === '$') {
      out += '(?=\\n?(?![\\s\\S]))'
      continue
    }
    out += c
  }
  return out
}

export function pyRe(src: string, flags = ''): RegExp {
  return new RegExp(pyReSource(src), 'u' + flags)
}

/** Escape a literal for a JS `u` regex (re.escape's job; `u` forbids escaping non-syntax chars). */
export function reEscape(s: string): string {
  return s.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&')
}

/** Python's code-point length. */
function pyLen(s: string): number {
  let n = 0
  for (const _ of s) n++
  return n
}

/** Python str ordering is by code point; JS's default sort compares UTF-16 units. */
function pyCmp(a: string, b: string): number {
  const ai = [...a]
  const bi = [...b]
  const n = Math.min(ai.length, bi.length)
  for (let k = 0; k < n; k++) {
    const x = ai[k].codePointAt(0) ?? 0
    const y = bi[k].codePointAt(0) ?? 0
    if (x !== y) return x - y
  }
  return ai.length - bi.length
}

function pySorted(xs: Iterable<string>): string[] {
  return [...xs].sort(pyCmp)
}

const PY_WS_RUN = pyRe('\\s+', 'g')
const PY_WS_EDGE = new RegExp(`^[${PY_WS}]+|[${PY_WS}]+$`, 'gu')

/** str.split() with no argument. */
function pySplit(s: string): string[] {
  return s.split(PY_WS_RUN).filter((x) => x !== '')
}

function pyStrip(s: string, chars: string): string {
  let a = 0
  let b = s.length
  while (a < b && chars.includes(s[a])) a++
  while (b > a && chars.includes(s[b - 1])) b--
  return s.slice(a, b)
}

const ND = /\p{Nd}/u

/** Map any Unicode decimal digit (re's \d) to ASCII, as python's int()/float() accept them. */
function asciiDigits(s: string): string {
  let out = ''
  for (const ch of s) {
    if (ch >= '0' && ch <= '9') {
      out += ch
      continue
    }
    if (!ND.test(ch)) {
      out += ch
      continue
    }
    // Nd code points come in contiguous runs of whole 0-9 blocks: walk back to the run start.
    const cp = ch.codePointAt(0) ?? 0
    let start = cp
    while (ND.test(String.fromCodePoint(start - 1))) start--
    out += String((cp - start) % 10)
  }
  return out
}

function pyIntStr(s: string): number {
  return parseInt(asciiDigits(s).trim(), 10)
}

const FLOAT_FINITE = /^[+-]?(?:\d(?:_?\d)*(?:\.(?:\d(?:_?\d)*)?)?|\.\d(?:_?\d)*)(?:[eE][+-]?\d(?:_?\d)*)?$/
const FLOAT_SPECIAL = /^[+-]?(?:inf|infinity|nan)$/i

/** python float(str) — null where python raises ValueError. */
function pyFloatStr(raw: string): number | null {
  const s = asciiDigits(raw).replace(new RegExp(`^[${PY_WS}]+|[${PY_WS}]+$`, 'gu'), '')
  if (FLOAT_SPECIAL.test(s)) {
    const t = s.toLowerCase()
    if (t.endsWith('nan')) return NaN
    return t.startsWith('-') ? -Infinity : Infinity
  }
  if (!FLOAT_FINITE.test(s)) return null
  return Number(s.replaceAll('_', ''))
}

/** round(x, 6) — exact for binary floats, where a decimal tie at the 7th place cannot occur. */
function round6(x: number): number {
  if (!Number.isFinite(x) || Math.abs(x) >= 1e21) return x
  return Number(x.toFixed(6))
}

/** str(x) for a JSON-decoded value. */
function pyStr(x: unknown): string {
  if (typeof x === 'string') return x
  if (x === null || x === undefined) return 'None'
  if (x === true) return 'True'
  if (x === false) return 'False'
  if (typeof x === 'number') return pyNum(x)
  return pyRepr(x)
}

/** repr() of a python float or int. */
function pyNum(n: number): string {
  if (Number.isInteger(n) && Math.abs(n) < 1e16) return String(n)
  if (Number.isNaN(n)) return 'nan'
  if (!Number.isFinite(n)) return n > 0 ? 'inf' : '-inf'
  const a = Math.abs(n)
  if (a >= 1e16 || a < 1e-4) {
    const [mant, exp] = n.toExponential().split('e')
    const e = Number(exp)
    return `${mant}e${e < 0 ? '-' : '+'}${String(Math.abs(e)).padStart(2, '0')}`
  }
  return String(n)
}

/** Format a number the way python prints `int(n) if n == int(n) else n`. */
function pyIntOrFloat(n: number): string {
  if (Number.isInteger(n)) return BigInt(n).toString()
  return pyNum(n)
}

function pyStrRepr(s: string): string {
  const q = s.includes("'") && !s.includes('"') ? '"' : "'"
  let out = q
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0
    if (ch === '\\') out += '\\\\'
    else if (ch === q) out += '\\' + q
    else if (ch === '\n') out += '\\n'
    else if (ch === '\r') out += '\\r'
    else if (ch === '\t') out += '\\t'
    else if (cp < 0x20 || cp === 0x7f) out += '\\x' + cp.toString(16).padStart(2, '0')
    else if (cp >= 0x80 && cp < 0xa0) out += '\\x' + cp.toString(16).padStart(2, '0')
    else out += ch
  }
  return out + q
}

/** repr() of a JSON-decoded value (str, number, bool, None, list, dict). */
export function pyRepr(x: unknown): string {
  if (typeof x === 'string') return pyStrRepr(x)
  if (x === null || x === undefined) return 'None'
  if (x === true) return 'True'
  if (x === false) return 'False'
  if (typeof x === 'number') return pyNum(x)
  if (Array.isArray(x)) return '[' + x.map(pyRepr).join(', ') + ']'
  if (typeof x === 'object') {
    return '{' + Object.entries(x as Record<string, unknown>).map(([k, v]) => `${pyStrRepr(k)}: ${pyRepr(v)}`).join(', ') + '}'
  }
  return String(x)
}

/** Replace [a, b) UTF-16 spans with one space per code point, as python's list(text) masking does. */
function maskSpans(text: string, spans: Array<[number, number]>): string {
  let out = ''
  let pos = 0
  for (const ch of text) {
    const masked = spans.some(([a, b]) => a <= pos && pos < b)
    out += masked ? ' ' : ch
    pos += ch.length
  }
  return out
}

function spacesFor(s: string): string {
  return ' '.repeat(pyLen(s))
}

// ---------------------------------------------------------------------------------------------
// Patterns (python source, translated by pyRe)
// ---------------------------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
}
const MONTH_RE = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|' +
  'Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?'
// A continuation day after a month-day ("Jun 2, 14, 21 and 27", "Jun 5 to 19") counts as a date
// only when it is followed by punctuation, a list word or the end, so "Jun 29, 3 readings" keeps
// its 3 as a number and "May 18 to 31.8 kg" keeps its 31.8.
const CONT_FOLLOW = '(?=\\s*(?:,|;|:|\\)|\\.(?!\\d)|\\band\\b|\\bor\\b|\\bto\\b|$))'
const MD_SRC = '\\b(' + MONTH_RE + ')\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(20\\d\\d))?' +
  '((?:\\s*(?:,|and|&|to|through|–|-)\\s*\\d{1,2}(?!\\d)' + CONT_FOLLOW + ')*)'
const DM_SRC = '\\b(\\d{1,2})\\s+(' + MONTH_RE + ')\\b(?:,?\\s+(20\\d\\d))?'
const ISO_SRC = '\\b(20\\d\\d)-(\\d\\d)-(\\d\\d)\\b'
const TIME_SRC = '\\b(\\d{1,2}):(\\d\\d)\\b'
const WEEKDAY_SRC = '\\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\\b'
const NUM_SRC = '(?<![\\w.])\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?(?!\\d)|(?<![\\w.])\\d+(?:\\.\\d+)?'
const WORD_NUMS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  hundred: 100, dozen: 12, once: 1, twice: 2, thrice: 3,
}
const WORD_NUM_SRC = '\\b(' + Object.keys(WORD_NUMS).join('|') + ')\\b'
const QUOTE_SRC = '“([^”]+)”|"([^"]+)"'

const MD_RE = pyRe(MD_SRC, 'gi')
const DM_RE = pyRe(DM_SRC, 'gi')
const ISO_RE = pyRe(ISO_SRC, 'g')
const TIME_RE = pyRe(TIME_SRC, 'g')
const WEEKDAY_RE = pyRe(WEEKDAY_SRC, 'gi')
const NUM_RE = pyRe(NUM_SRC, 'g')
const WORD_NUM_RE = pyRe(WORD_NUM_SRC, 'gi')
const QUOTE_RE = pyRe(QUOTE_SRC, 'g')
const DIGITS_RE = pyRe('\\d{1,2}', 'g')
const MULTI_SENTENCE_RE = pyRe('[.?]\\s+[A-Z]', 'g')
const DOCTOR_RE = pyRe('\\bDr\\.?\\s+[A-Z]')

// Names not in the record that a writer might still produce: fabricated foods, proteins, drugs.
export const GENERIC_FOODS = [
  'chicken liver', 'chicken', 'beef', 'lamb', 'pork', 'turkey', 'duck', 'salmon', 'whitefish',
  'fish', 'tuna', 'venison', 'rabbit', 'kangaroo', 'egg', 'eggs', 'dairy', 'cheese', 'milk',
  'soy', 'cereal', 'wheat', 'corn', 'rice', 'liver', 'peanut butter', 'jerky',
]
export const GENERIC_DRUGS = [
  'apoquel', 'oclacitinib', 'nexgard', 'afoxolaner', 'simparica', 'bravecto', 'revolution',
  'maropitant', 'cerenia', 'prednisolone', 'prednisone', 'steroid', 'steroids', 'metronidazole',
  'antibiotic', 'antibiotics', 'famotidine', 'omeprazole', 'ondansetron', 'mirtazapine',
  'capromorelin', 'entyce', 'cytopoint', 'lokivetmab', 'cyclosporine', 'atopica',
  'antihistamine', 'antihistamines', 'probiotic', 'probiotics', 'fortiflora', 'antiemetic',
]

export type BannedClass = 'H1' | 'H2' | 'H3' | 'H4' | 'H7' | 'AP' | 'MIN' | 'VAGUE' | 'RATE' | 'REL' | 'VOICE'

/**
 * [class, python regex source, waivable]. Waivable single-word matches are waived when the exact
 * matched text appears in a cited fact's text (the fact's own code-written words). Multi-word
 * deferral and reassurance classes are never waived. Compile a source with `pyRe(src, 'gi')`.
 */
export const BANNED: ReadonlyArray<readonly [BannedClass, string, boolean]> = [
  // H1 - trial read as clean or adherent
  ['H1', "\\bstuck\\b|\\bstick(?:s|ing)? (?:to|with)\\b", false],
  ['H1', "\\bkept (?:to|on)\\b", false],
  ['H1', "\\bstay(?:ed|ing|s)? on\\b", false],
  ['H1', "\\bremain(?:ed|ing|s)? on\\b", false],
  ['H1', "\\badher\\w*", false],
  ['H1', "\\bcomplian\\w*|\\bcompliant\\b", false],
  ['H1', "(?<!not )(?<!not a )\\bclean\\b", false],
  ['H1', "\\bstrict(?:ly)?\\b", false],
  ['H1', "\\bfaithful\\w*", false],
  ['H1', "\\bon track\\b|\\bas directed\\b|\\bas prescribed\\b|\\bfollowed the (?:diet|trial|plan)\\b", false],
  ['H1', "\\bapart from\\b|\\bexcept for\\b|\\baside from\\b|\\bother than\\b|\\bbesides\\b|\\botherwise\\b", false],
  ['H1', "\\bexclusive(?:ly)?\\b", false],
  // H2 - cause or improvement implied
  ['H2', "\\bimprov\\w*", false],
  ['H2', "\\bbetter\\b", false],
  ['H2', "\\bresolv\\w*|\\bsettl\\w*|\\bsubsid\\w*|\\bcalm\\w*", false],
  ['H2', "\\beas(?:ed|ing|es)\\b", false],
  ['H2', "\\brespon(?:d|ded|ding|ds|se|sive)\\b", false],
  ['H2', "\\bworking\\b|\\beffective\\w*|\\bhelp(?:ed|ing|s)?\\b", false],
  ['H2', "\\bbecause\\b|\\bdue to\\b|\\bcaus\\w*|\\btrigger\\w*|\\bled to\\b|\\blead(?:s|ing)? to\\b|\\bthanks to\\b", false],
  ['H2', "\\bresult(?:ed|s|ing)? (?:in|from)\\b|\\bas a result\\b", false],
  ['H2', "\\bfell\\b|\\bfall(?:en|ing|s)?\\b|\\bdrop(?:ped|ping|s)?\\b|\\bdecreas\\w*|\\bdown (?:from|to)\\b|\\btail(?:ed|ing) off\\b", false],
  ['H2', "\\bdeclin\\w*|\\breduc\\w*", true],
  ['H2', "\\bhalv\\w*|\\bhalf as\\b|\\bdoubled\\b|\\btripled\\b", false],
  ['H2', "\\btrend\\w*", true],
  ['H2', "\\bsince (?:starting|beginning|the switch|switching|the change|the diet|the trial)\\b", true],
  ['H2', "\\b(?:after|following) (?:starting|the switch|switching|the change|the start)\\b", false],
  // H3 - refusal softened or read as preference
  ['H3', "\\bpicky\\b|\\bfussy\\b|\\bfussiness\\b|\\bfinicky\\b|\\bchoosy\\b|\\bselective\\b", false],
  ['H3', "\\bprefer\\w*", false],
  ['H3', "\\bliked\\b|\\blikes\\b|\\bdislik\\w*|\\bdidn'?t like\\b|\\bnot keen\\b", false],
  ['H3', "\\binterest(?:ed)?\\b|\\bappetite for\\b|\\bnose\\b|\\benjoy\\w*|\\btast(?:e|es|y)\\b|\\bpalatab\\w*", false],
  ['H3', "\\bbored\\b|\\btired of\\b|\\breluctan\\w*|\\bunwilling\\w*|\\bhesita\\w*", false],
  // H4 - reassurance from absence
  ['H4', "\\bnormal(?:ly)?\\b|\\bhealthy\\b|\\bfine\\b|(?<!as )\\bwell\\b|\\bstable\\b|\\bsteady\\b", false],
  ['H4', "\\bunremarkable\\b|\\breassur\\w*|\\ball clear\\b|\\bclear(?:ed)?\\b", true],
  ['H4', "\\bno (?:concern\\w*|worries)\\b|\\bnothing (?:concerning|worrying|alarming|of note|unusual)\\b", false],
  ['H4', "\\b(?:symptom|itch|vomit)[- ]free\\b|\\bfree of\\b|\\bquiet(?:er)?\\b", false],
  ['H4', "\\bno (?:further|more|new|other) (?:episodes?|itching|vomiting|signs?|entries)\\b", false],
  ['H4', "\\bno (?:itching|itch|vomiting|episodes?|signs?|symptoms?)\\b", false],
  ['H4', "\\bgood\\b|\\bgreat\\b|\\bthriv\\w*|\\bmend\\w*|\\brecover\\w*|\\bback to\\b|\\bdoing\\b", false],
  // H7 - safety deferred or softened (never waived)
  ['H7', "\\b(?:at|for|until) (?:the|her|his|their) (?:next )?(?:visit|recheck|appointment|check-?up)\\b", false],
  ['H7', "\\bnext visit\\b|\\bcan wait\\b|\\bno rush\\b|\\bnot urgent\\b|\\broutine\\b|\\bwhen convenient\\b", false],
  ['H7', "\\bmonitor (?:at home|for now)\\b|\\bkeep an eye\\b|\\bwatch and wait\\b|\\bfor now\\b", false],
  // AP - assessment, plan, diagnosis (disease words waivable when verbatim in a cited fact)
  ['AP', "\\bconsistent with\\b|\\bsuggest\\w*|\\bindicat\\w*|\\blikely\\b|\\bprobabl\\w*", false],
  ['AP', "\\bpossibl[ey]\\b", true],
  ['AP', "(?<!not a )\\bdiagnos\\w*", false],
  ['AP', "\\ballerg\\w*|\\bibd\\b|\\benteropath\\w*|\\bpancreatit\\w*|\\bkidney\\b|\\brenal\\b|\\bhyperthyroid\\w*|\\bcancer\\b|\\blymphoma\\b|\\bobstruct\\w*", false],
  ['AP', "\\blipidosis\\b|\\bhepatic\\b", true],
  ['AP', "\\brecommend\\w*|\\bshould\\b|\\bconsider\\w*|\\badvis\\w*|\\bneeds? to\\b|\\bmust\\b|\\bworth (?:a|checking|considering|discussing|asking)\\b", false],
  ['AP', "\\brule out\\b|\\bdifferential\\w*|\\bwork-?up\\b|\\bbloodwork\\b|\\bx-?ray\\w*|\\bradiograph\\w*|\\bultrasound\\b|\\bbiops\\w*", false],
  ['AP', "\\bswitch (?:to|back)\\b|\\brestart\\w*|\\bextend\\w*|\\bstop the (?:trial|diet)\\b", false],
  // MIN - minimizers
  ['MIN', "\\bonly\\b|\\bjust\\b|\\bmerely\\b|\\bbarely\\b", true],
  ['MIN', "\\bmild\\w*|\\bslight\\w*|\\boccasional\\w*|\\ba little\\b|\\ba few\\b|\\bminor\\b|\\bsmall\\b", false],
  // VAGUE - quantities without a denominator
  ['VAGUE', "\\bseveral\\b|\\bmany\\b|\\bmost days\\b|\\bfrequent\\w*|\\brarely\\b|\\boften\\b|\\ba handful\\b", false],
  ['VAGUE', "\\bsome days\\b|\\bregular(?:ly)?\\b|\\bintermittent\\w*|\\bsporadic\\w*|\\bnumerous\\b|\\bmultiple\\b", false],
  ['VAGUE', "\\bmostly\\b|\\bmainly\\b|\\blargely\\b|\\busually\\b|\\btypically\\b|\\bgenerally\\b|\\bnearly (?:every|all)\\b|\\balmost (?:every|all)\\b", false],
  ['VAGUE', "\\b(?:mid|early|late)[- ]?(?:" + MONTH_RE + "|month|week|trial)\\b", false],
  // RATE - invented rates
  ['RATE', "\\bevery other day\\b|\\bper (?:week|day|month)\\b|\\btimes a (?:day|week|month)\\b|/(?:week|day|wk)\\b|~|\\baverag\\w*", false],
  ['RATE', "\\babout every\\b|\\broughly\\b|\\bapproximately\\b", false],
  ['RATE', "\\b(?:a|per|each) (?:week|day|month)\\b", false],
  // REL - relative time
  ['REL', "\\btoday\\b|\\byesterday\\b|\\brecent(?:ly)?\\b|\\blately\\b|\\bthis week\\b|\\blast week\\b|\\bso far\\b|\\bcurrently\\b", true],
  // VOICE
  ['VOICE', "!", false],
  ['VOICE', "\\byou(?:r|rs|rself)?\\b", false],
]
const BANNED_C: Array<[BannedClass, RegExp, boolean]> = BANNED.map(([c, p, w]) => [c, pyRe(p, 'gi'), w])
const SAFE_MASKS = ['\\bnot a diagnosis\\b', '\\bintake not directly observed\\b'].map((p) => pyRe(p, 'gi'))

// ---------------------------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------------------------

export function norm(s: string): string {
  s = s.replaceAll('−', '-').replaceAll('–', '-').replaceAll('—', ' - ')
  s = s.replaceAll('’', "'").replaceAll('‘', "'").replaceAll('\u00a0', ' ')
  return s.replace(PY_WS_RUN, ' ').replace(PY_WS_EDGE, '')
}

function fnum(x: unknown): number | null {
  const v = pyFloatStr(pyStr(x).replaceAll(',', ''))
  return v === null ? null : round6(v)
}

function iso(y: string, m: string | number, d: string): string {
  const yy = pyIntStr(y)
  const mm = typeof m === 'number' ? m : pyIntStr(m)
  const dd = pyIntStr(d)
  return `${String(yy).padStart(4, '0')}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
}

/** Return [dates, maskedText]. Dates are ISO strings; masked text has them blanked. */
export function extractDates(text: string, year: string): [string[], string] {
  const dates: string[] = []
  const spans: Array<[number, number]> = []
  const inSpan = (start: number): boolean => spans.some(([a, b]) => a <= start && start < b)
  for (const m of text.matchAll(ISO_RE)) {
    dates.push(iso(m[1], m[2], m[3]))
    spans.push([m.index, m.index + m[0].length])
  }
  for (const m of text.matchAll(MD_RE)) {
    if (inSpan(m.index)) continue
    const mon = MONTHS[m[1].toLowerCase().replace(/\.+$/, '')]
    const y = m[3] || year
    dates.push(iso(y, mon, m[2]))
    for (const d of (m[4] || '').matchAll(DIGITS_RE)) dates.push(iso(y, mon, d[0]))
    spans.push([m.index, m.index + m[0].length])
  }
  for (const m of text.matchAll(DM_RE)) {
    if (inSpan(m.index)) continue
    const mon = MONTHS[m[2].toLowerCase().replace(/\.+$/, '')]
    dates.push(iso(m[3] || year, mon, m[1]))
    spans.push([m.index, m.index + m[0].length])
  }
  return [dates, maskSpans(text, spans)]
}

export function extractTimes(text: string): [string[], string] {
  const times = [...text.matchAll(TIME_RE)].map((m) => `${String(pyIntStr(m[1])).padStart(2, '0')}:${m[2]}`)
  return [times, text.replace(TIME_RE, ' ')]
}

export function extractNumbers(text: string): number[] {
  const nums: Array<number | null> = [...text.matchAll(NUM_RE)].map((m) => fnum(m[0]))
  for (const m of text.matchAll(WORD_NUM_RE)) nums.push(WORD_NUMS[m[1].toLowerCase()])
  return nums.filter((n): n is number => n !== null)
}

export type TermKind = 'foods' | 'drugs' | 'proteins'
export type Term = readonly [TermKind, string]
/** alias (lowercase) -> [kind, canonical], in python dict insertion order. */
export type TermIndex = Map<string, Term>

export const termKey = (t: Term): string => `${t[0]}|${t[1]}`

/** alias (lowercase) -> (kind, canonical). Longest aliases first when matching. */
export function buildTermIndex(table: FactTable): TermIndex {
  const idx: TermIndex = new Map()
  const lex = table.lexicon ?? {}
  for (const kind of ['foods', 'drugs'] as const) {
    for (const [canon, aliases] of Object.entries(lex[kind] ?? {})) {
      for (const a of [canon, ...aliases]) idx.set(a.toLowerCase(), [kind, canon])
    }
  }
  for (const g of GENERIC_FOODS) if (!idx.has(g)) idx.set(g, ['proteins', g === 'eggs' ? g.replace(/s+$/, '') : g])
  for (const g of GENERIC_DRUGS) if (!idx.has(g)) idx.set(g, ['drugs', g])
  return idx
}

export function termRegex(alias: string, flags = 'i'): RegExp {
  return pyRe('(?<![\\w/])' + reEscape(alias) + '(?![\\w/])', flags)
}

/** Longest alias first (a stable sort, so ties keep insertion order); each hit is blanked. */
export function extractTerms(text: string, idx: TermIndex): [Term[], string] {
  const found: Term[] = []
  let masked = text
  const aliases = [...idx.keys()].sort((a, b) => pyLen(b) - pyLen(a))
  for (const alias of aliases) {
    const rx = termRegex(alias, 'gi')
    rx.lastIndex = 0
    if (rx.test(masked)) {
      found.push(idx.get(alias) as Term)
      rx.lastIndex = 0
      masked = masked.replace(rx, spacesFor)
    }
  }
  return [found, masked]
}

function quoteGroups(text: string): string[] {
  return [...text.matchAll(QUOTE_RE)].map((m) => m[1] || m[2] || '')
}

type Profile = {
  text: string
  numbers: Set<number | null>
  dates: Set<string>
  times: Set<string>
  weekdays: Set<string>
  terms: Set<string>
  quotes: string[]
}

function tableYear(table: FactTable): string {
  return pyStr(table.year === undefined ? '2026' : table.year)
}

function factProfile(f: Fact, table: FactTable, idx: TermIndex): Profile {
  const text = norm(f.text ?? '')
  const year = tableYear(table)
  const qtext = text.replace(QUOTE_RE, ' ')
  const [dates, rest1] = extractDates(qtext, year)
  const [times, rest2] = extractTimes(rest1)
  const [terms, rest3] = extractTerms(rest2, idx)
  const nums = extractNumbers(rest3)
  const quotes = quoteGroups(text)
  return {
    text: text.toLowerCase(),
    numbers: new Set<number | null>([...nums, ...(f.numbers ?? []).map(fnum)]),
    dates: new Set([...dates, ...(f.dates ?? [])]),
    times: new Set(times),
    weekdays: new Set([...text.matchAll(WEEKDAY_RE)].map((m) => m[1].toLowerCase())),
    terms: new Set([
      ...terms.map(termKey),
      ...(f.foods ?? []).map((x) => `foods|${x}`),
      ...(f.drugs ?? []).map((x) => `drugs|${x}`),
      ...(f.proteins ?? []).map((x) => `proteins|${x}`),
    ]),
    quotes: [...quotes, ...(f.quotes ?? [])].map((q) => norm(q).toLowerCase()),
  }
}

function union<T>(sets: Array<Set<T>>): Set<T> {
  const out = new Set<T>()
  for (const s of sets) for (const x of s) out.add(x)
  return out
}

// ---------------------------------------------------------------------------------------------
// verify
// ---------------------------------------------------------------------------------------------

export function verifyBakeoff(table: FactTable, summary: Summary, limits: StructureLimits = DEFAULT_LIMITS): VerifyReport {
  const errors: VerifyIssue[] = []
  const warnings: VerifyIssue[] = []
  const outSentences: SentenceRecord[] = []
  const facts = new Map<string, Fact>()
  for (const f of table.facts) facts.set(f.id, f)
  const idx = buildTermIndex(table)
  const prof = new Map<string, Profile>()
  for (const [fid, f] of facts) prof.set(fid, factProfile(f, table, idx))
  const year = tableYear(table)
  const sents: unknown = summary.sentences
  if (!Array.isArray(sents)) throw new Error('summary.sentences must be a list')
  const sentences = sents as SummarySentence[]

  const err = (i: number | null, check: string, detail: string): void => {
    errors.push({ sentence: i, check, detail })
  }

  if (!(limits.minSentences <= sentences.length && sentences.length <= limits.maxSentences)) {
    err(null, 'structure', `expected ${limits.minSentences}-${limits.maxSentences} sentences, got ${sentences.length}`)
  }

  const allQuotes = pySorted(new Set([...prof.values()].flatMap((p) => p.quotes)))
  const citedBy = new Map<string, number[]>()
  sentences.forEach((s, k) => {
    const i = k + 1
    const text = norm(s.text ?? '')
    const rawCites = s.cites ?? []
    const rec: SentenceRecord = { i, text, cites: rawCites, quotes: [], dates: [], times: [], terms: [], numbers: [] }
    if (rawCites.length === 0) err(i, 'structure', 'sentence cites no fact')
    const unknown = rawCites.filter((c) => !facts.has(c))
    if (unknown.length > 0) err(i, 'structure', `unknown fact ids: ${pyRepr(unknown)}`)
    const cites = rawCites.filter((c) => facts.has(c))
    for (const c of cites) {
      const list = citedBy.get(c)
      if (list) list.push(i)
      else citedBy.set(c, [i])
    }
    const words = pySplit(text).length
    if (words > limits.maxWordsPerSentence) {
      err(i, 'structure', `sentence has ${words} words (max ${limits.maxWordsPerSentence})`)
    }
    MULTI_SENTENCE_RE.lastIndex = 0
    if (MULTI_SENTENCE_RE.test(text)) {
      warnings.push({ sentence: i, check: 'structure', detail: 'looks like more than one sentence' })
    }

    const cp = cites.map((c) => prof.get(c) as Profile)
    const allowedNums = union(cp.map((p) => p.numbers))
    const allowedDates = union(cp.map((p) => p.dates))
    const allowedTimes = union(cp.map((p) => p.times))
    const allowedWd = union(cp.map((p) => p.weekdays))
    const allowedTerms = union(cp.map((p) => p.terms))
    const allowedQuotes = cp.flatMap((p) => p.quotes)
    const citedText = cp.map((p) => p.text).join(' ')

    // quotes
    const quotes = quoteGroups(text).map(norm)
    for (const q of quotes) {
      const ql = pyStrip(q.toLowerCase(), ' .,;')
      if (!allowedQuotes.some((aq) => ql !== '' && aq.includes(ql))) {
        err(i, 'quotes', `quoted text is not a verbatim owner quote in a cited fact: ${pyRepr(q)}`)
      } else if (!text.toLowerCase().includes('owner')) {
        err(i, 'quotes', 'owner quote is not attributed to the owner in the sentence')
      }
    }
    const body = text.replace(QUOTE_RE, ' ')
    for (const aq of allQuotes) {
      if (pySplit(aq).length >= 3 && body.toLowerCase().includes(aq)) {
        err(i, 'quotes', `owner's words appear without quotation marks: ${pyRepr(aq)}`)
      }
    }
    rec.quotes = quotes

    // dates, times, weekdays, terms, numbers
    const [dates, r1] = extractDates(body, year)
    for (const d of dates) if (!allowedDates.has(d)) err(i, 'dates', `date ${d} is not in a cited fact`)
    const [times, r2] = extractTimes(r1)
    for (const t of times) if (!allowedTimes.has(t)) err(i, 'times', `time ${t} is not in a cited fact`)
    for (const m of r2.matchAll(WEEKDAY_RE)) {
      if (!allowedWd.has(m[1].toLowerCase())) err(i, 'dates', `weekday ${pyRepr(m[1])} is not in a cited fact`)
    }
    const r3 = r2.replace(WEEKDAY_RE, ' ')
    const [terms, r4] = extractTerms(r3, idx)
    for (const [kind, canon] of terms) {
      let ok = allowedTerms.has(`${kind}|${canon}`)
      if (!ok && kind === 'proteins') ok = citedText.includes(canon)
      if (!ok) err(i, 'terms', `${kind.slice(0, -1)} ${pyRepr(canon)} is not named by a cited fact`)
    }
    let rest = r4
    for (const m of SAFE_MASKS) rest = rest.replace(m, ' ')
    const nums = extractNumbers(rest)
    for (const n of nums) {
      if (!allowedNums.has(n)) err(i, 'numbers', `number ${pyIntOrFloat(n)} is not in a cited fact`)
    }
    rec.dates = dates
    rec.times = times
    rec.terms = terms.map(([, c]) => c)
    rec.numbers = nums

    // names
    const unquoted = text.replace(QUOTE_RE, ' ')
    for (const name of table.forbidden_names ?? []) {
      if (pyRe('(?<!\\w)' + reEscape(name) + '(?!\\w)', 'i').test(unquoted)) {
        err(i, 'names', `names a person: ${pyRepr(name)}`)
      }
    }
    if (DOCTOR_RE.test(text)) err(i, 'names', 'names a doctor')

    // banned phrases (screen the body with quotes, names and safe phrases masked)
    const screen = rest
    for (const [cls, rx, waivable] of BANNED_C) {
      for (const m of screen.matchAll(rx)) {
        const hit = m[0]
        if (waivable && citedText.includes(hit.toLowerCase())) {
          warnings.push({ sentence: i, check: 'banned-waived', detail: `${cls} ${pyRepr(hit)} (in a cited fact's text)` })
          continue
        }
        err(i, 'banned:' + cls, pyRepr(hit))
      }
    }
    outSentences.push(rec)
  })

  // required facts and must-say groups
  for (const [fid, f] of facts) {
    const by = citedBy.get(fid)
    if (f.required && !by) err(null, 'required', `required fact ${fid} is not cited (${pyStr(f.kind ?? '')})`)
    if (by) {
      const joined = by.map((i) => norm(sentences[i - 1].text ?? '').toLowerCase()).join(' ')
      for (const group of f.must_say ?? []) {
        if (!group.some((alt) => joined.includes(norm(alt).toLowerCase()))) {
          err(by[0], 'required-clause', `fact ${fid} is cited but its sentences lack one of ${pyRepr(group)}`)
        }
      }
    }
  }

  const alltext = sentences.map((s) => norm(s.text ?? '').toLowerCase()).join(' ')
  for (const group of table.require_any_sentence ?? []) {
    if (!group.some((a) => alltext.includes(norm(a).toLowerCase()))) {
      err(null, 'required-clause', `summary lacks one of ${pyRepr(group)}`)
    }
  }
  if (table.intake_not_directly_observed && !alltext.includes('intake not directly observed')) {
    err(null, 'required-clause', "summary lacks 'intake not directly observed' (true for this record)")
  }
  for (const rule of table.conditional ?? []) {
    if (rule.when === 'mentions_any') {
      const termsL = rule.terms.map((t) => t.toLowerCase())
      const hit = sentences.some((s) => {
        const t = norm(s.text ?? '').replace(QUOTE_RE, ' ')
        return termsL.some((term) => termRegex(term).test(t))
      })
      if (hit && !citedBy.has(rule.cite)) {
        err(null, 'conditional',
          `summary names ${rule.terms.slice(0, 4).join('/')} but does not cite ${rule.cite} (${pyStr(rule.why ?? '')})`)
      }
    }
  }

  // safety first
  if (table.safety_live) {
    const live = new Set(table.facts.filter((f) => f.role === 'band' && f.live).map((f) => f.id))
    const first = new Set(sentences.length > 0 ? sentences[0].cites ?? [] : [])
    if (![...first].some((c) => live.has(c))) {
      err(1, 'safety', `a safety flag is live; sentence 1 must cite a live band fact ${pyRepr(pySorted(live))}`)
    }
  }

  return {
    verifier: VERIFIER_VERSION,
    fixture: table.fixture ?? null,
    pass: errors.length === 0,
    error_count: errors.length,
    errors,
    warnings,
    facts_cited: pySorted(citedBy.keys()),
    sentences: outSentences,
  }
}
