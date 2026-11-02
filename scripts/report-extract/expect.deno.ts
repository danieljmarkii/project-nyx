// What a clinic's AI must still be able to read in a v2 vet report after the text is pulled out of
// the PDF (CUL-2292, row VR2-12; v2 spec §8, acceptance criterion 7). One module, read by both
// halves of the test, so the two can never disagree about what "survives" means:
//
//   • `contiguity.deno.ts` (the Deno guard, every PR, no browser) holds the HTML's text layer to
//     these expectations: each line is one unbroken run of text in sheet 1, never split by a block
//     boundary, never carried by CSS generated content, never hidden.
//   • `check.deno.ts` (the Chromium job) holds the text pypdf and pdfminer pull out of the printed
//     PDF to the same expectations.
//
// THE EXPECTATIONS are derived from the document model, never listed (a new block kind fails to
// compile in `sheet1Lines` until it is classified):
//   1. every fired flag: each band item ("Flag: … .") and a lead chart that carries a flag;
//   2. every line sheet 1 prints, whole, which is every digit on sheet 1 in its own sentence: the
//      band's photo captions and, when one prints, the AI lead's label and sentences included;
//   3. no sentence naming one of the trial's own signs (by stem) states a decline in it or in the
//      unlabelled sentence after it, in words or as a falling count;
//   4. "How this record was kept" (VR2-14, CUL-2294): every sentence of the last sheet, whole.
//
// MATCHING is whitespace-blind, case-blind and NFKC-folded: an extractor may break a line, insert
// a space at a kerning gap, read a `text-transform: uppercase` heading in capitals, or hand back a
// ligature as one code point. None of that changes what a reader is told. A dropped, swapped or
// reordered character does, and fails.
import type { DocumentV2 } from '../../supabase/functions/generate-report/documentV2.ts'
import { textOf } from '../../supabase/functions/generate-report/documentV2.ts'
import { pageHeadCss } from '../../supabase/functions/generate-report/renderBackV2.ts'
import { AI_LEAD_LABEL } from '../../supabase/functions/generate-report/renderPrintV2.ts'
import type { LeadSentence } from '../../supabase/functions/generate-report/aiLead/verify.ts'
import type { ReportSnapshot } from '../../supabase/functions/generate-report/report.ts'
import { symptomLabel } from '../../supabase/functions/generate-report/render.ts'
import { SKIN_TRIAL_SIGNS } from '../../supabase/functions/generate-report/v2Predicates.ts'
import { keptSentencesOf } from '../../supabase/functions/generate-report/backSheetsV2.ts'

export interface ExpectedLine {
  /** The block it prints in (`data-block`), so a failure names where to look. */
  block: string
  text: string
}

export interface Expectations {
  flags: ExpectedLine[]
  lines: ExpectedLine[]
  /** The trial's own signs as symptom keys ("itch"), empty without a gi or skin trial. */
  trialSigns: string[]
  /** The labels the document's own lines open with ("Diet trial (owner-entered)"), for the window. */
  lineLabels: string[]
  /** "How this record was kept" (VR2-14): each rule's term and every sentence of its text. */
  kept: ExpectedLine[]
}

/** Soft hyphen, zero-width space, ZWNJ, ZWJ, word joiner, BOM: nothing a reader sees. Built from
 *  code points so the source carries no invisible character. */
const INVISIBLE = new RegExp(`[${String.fromCodePoint(0xad, 0x200b, 0x200c, 0x200d, 0x2060, 0xfeff)}]`, 'g')
/** The apostrophe and its curly and modifier-letter forms (U+02BC, U+2018, U+2019). */
const SINGLE_QUOTES = new RegExp(`[${String.fromCodePoint(0x2bc, 0x2018, 0x2019)}']`, 'g')
/** The double quote and its curly and modifier-letter forms (U+02EE, U+201C, U+201D). */
const DOUBLE_QUOTES = new RegExp(`[${String.fromCodePoint(0x2ee, 0x201c, 0x201d)}"]`, 'g')

/** Folds what an extractor may change without changing the meaning (see the header). */
export function fold(s: string): string {
  return s
    .normalize('NFKC')
    .replace(INVISIBLE, '')
    // Measured 2026-11-02 (Chromium, Inter): the curly apostrophe and closing quote extract as the
    // modifier letters U+02BC and U+02EE in both tools. The same mark to a reader, so folded here;
    // filed as CUL-2420, because a search for the curly form misses them.
    .replace(SINGLE_QUOTES, "'")
    .replace(DOUBLE_QUOTES, '"')
    // Whitespace between two digits is kept as a mark, never dropped: "week 7 4-day week" read back
    // as "week 74-day week", or "12" as "1 2", changes a number (adversarial pass 1).
    .replace(/(\d)\s+(?=\d)/g, '$1#')
    .replace(/\s+/g, '')
    .toLowerCase()
}

/** Every line sheet 1 prints, in model order. Exhaustive over `BlockV2` on purpose. */
export function sheet1Lines(doc: DocumentV2): ExpectedLine[] {
  const out: ExpectedLine[] = []
  const add = (block: string, text: string | null | undefined): void => {
    const t = (text ?? '').replace(/\s+/g, ' ').trim()
    if (t !== '') out.push({ block, text: t })
  }
  for (const b of doc.blocks) {
    switch (b.kind) {
      case 'masthead':
        add(b.id, b.eyebrow)
        add(b.id, b.name)
        add(b.id, b.signalment)
        add(b.id, b.conditions)
        add(b.id, b.window)
        add(b.id, `${textOf(b.lastEntryHtml)}.`)
        break
      case 'disclosure':
        add(b.id, textOf(b.html))
        break
      case 'band':
        add(b.id, b.heading)
        for (const i of b.items) {
          add(b.id, bandItemText(i.tag, i.html))
          // The photo captions: the dated evidence beside a fired flag (R-10), a separate run because
          // an image sits between them and the line (adversarial pass 1).
          for (const p of i.photos) add(b.id, p.caption)
        }
        add(b.id, b.checksHtml === null ? null : textOf(b.checksHtml))
        break
      case 'checks':
        add(b.id, textOf(b.html))
        break
      case 'scope_line':
        add(b.id, b.text)
        break
      case 'changes':
        add(b.id, b.heading)
        for (const l of b.lines) add(b.id, `${l.text}.`)
        break
      case 'record_edge':
        for (const l of b.lines) add(b.id, l)
        break
      case 'lead_sentence':
        add(b.id, b.text)
        break
      case 'lead_chart':
        add(b.id, b.chart.heading)
        add(b.id, b.chart.flagHtml === null ? null : textOf(b.chart.flagHtml))
        add(b.id, b.chart.reasonLine)
        add(b.id, b.chart.twin)
        break
      case 'confounder':
        add(b.id, b.text)
        break
      case 'record_lines':
        for (const l of b.lines) add(b.id, l.text)
        break
      case 'gap_lines':
        add(b.id, b.heading)
        for (const l of b.lines) add(b.id, `${l.text}.`)
        break
      case 'questions':
        add(b.id, b.heading)
        for (const q of b.items) {
          add(b.id, q.text)
          add(b.id, q.pointer)
        }
        break
      case 'colophon':
        add(b.id, b.text)
        break
      default: {
        const never: never = b
        throw new Error(`unclassified sheet 1 block ${JSON.stringify(never)}`)
      }
    }
  }
  return out
}

function bandItemText(tag: string, html: string): string {
  return `Flag: ${tag.toLowerCase()}. ${textOf(html)}`
}

/** Every fired flag sheet 1 prints: the band's items and a flagged lead chart's flag row. */
export function firedFlags(doc: DocumentV2): ExpectedLine[] {
  const out: ExpectedLine[] = []
  for (const b of doc.blocks) {
    if (b.kind === 'band') for (const i of b.items) out.push({ block: b.id, text: bandItemText(i.tag, i.html) })
    if (b.kind === 'lead_chart' && b.chart.flagHtml !== null) out.push({ block: b.id, text: textOf(b.chart.flagHtml) })
  }
  return out
}

/** A gi trial's own signs (v2Predicates keeps its list private to the lead ladder). */
const GI_TRIAL_SIGNS = ['vomit', 'diarrhea'] as const

/** The trial's own signs, as symptom keys ("itch"), empty without a gi or skin trial. */
export function trialSignsOf(snap: ReportSnapshot): string[] {
  const ind = snap.trial?.indication ?? null
  return [...(ind === 'skin' ? SKIN_TRIAL_SIGNS : ind === 'gi' ? GI_TRIAL_SIGNS : [])]
}

/**
 * Every way the text names a sign, by stem, not by `symptomLabel` alone: the report's own copy says
 * "diarrhea" and "loose stool", and a summarizer says "vomited", "itchy", "scratched" (adversarial
 * pass 1). An unknown key falls back to its label, so a new sign is never silently unmatched.
 */
const SIGN_STEMS: Record<string, RegExp> = {
  vomit: /\b(?:vomit\w*|threw up|throw(?:s|ing)? up|emesis)\b/i,
  diarrhea: /\b(?:diarrh\w*|loose\s+stool\w*|stools?)\b/i,
  itch: /\b(?:itch\w*|prurit\w*)/i,
  scratch: /\b(?:scratch\w*|lick\w*|paw[- ]lick\w*|chew\w*)/i,
  skin_reaction: /\bskin\b/i,
}

export function signPattern(key: string): RegExp {
  return SIGN_STEMS[key] ?? new RegExp(`\\b${symptomLabel(key).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i')
}

/**
 * "How this record was kept" (spec §6.1, GAP-33): the fixed absence rules, always last. VR2-14
 * (CUL-2294) prints them, so this reads every sentence off the document's kept block and the check
 * asserts each one survives both extractors whole ("No flag is not an all-clear" included). A
 * document with no kept block throws here rather than asserting nothing: the block is mandatory.
 */
export const KEPT_HEADING = 'How this record was kept'

export function keptSentences(doc: DocumentV2): ExpectedLine[] {
  const kept = doc.backSheets.flatMap((s) => s.blocks).find((b) => b.kind === 'kept')
  if (!kept || kept.kind !== 'kept') throw new Error('the document prints no "How this record was kept" block')
  return [{ block: 'kept', text: KEPT_HEADING }, ...keptSentencesOf(kept.entries).map((text) => ({ block: 'kept', text }))]
}

/** The lead's printed lines when one is handed in: its label, then each sentence as stored. */
export function aiLeadLines(aiLead: readonly LeadSentence[] | null): ExpectedLine[] {
  if (aiLead === null || aiLead.length === 0) return []
  return [{ block: 'ai-lead', text: `${AI_LEAD_LABEL} beta` }, ...aiLead.map((s) => ({ block: 'ai-lead', text: s.text }))]
}

export function expectationsOf(doc: DocumentV2, snap: ReportSnapshot, aiLead: readonly LeadSentence[] | null = null): Expectations {
  const lines = sheet1Lines(doc)
  const lineLabels = [...new Set(lines.map((l) => /^([^.:]{1,60}):\s/.exec(l.text)?.[1] ?? '').filter((x) => x !== ''))]
  return { flags: firedFlags(doc), lines: [...aiLeadLines(aiLead), ...lines], trialSigns: trialSignsOf(snap), lineLabels, kept: keptSentences(doc) }
}

/** The expected lines whose folded text is not a run inside the folded haystack. */
export function missing(haystack: string, want: readonly ExpectedLine[]): ExpectedLine[] {
  const hay = fold(haystack)
  return want.filter((w) => !hay.includes(fold(w.text)))
}

/**
 * Words that state a sign went down, ended or softened. Broad on purpose: a false hit costs a look at
 * the fixture, a miss lets a clinic's summarizer tell a vet the trial is working on a sign it is not.
 * Widened after adversarial pass 1, which planted "settled", "cleared", "halved", "now rare",
 * "responded", "under control", "lowest" and "dropped" and found each one passing.
 */
export const DECLINE_WORDS = new RegExp(
  '\\b(?:' +
    [
      'declin\\w*', 'decreas\\w*', 'fewer', 'less', 'lower\\w*', 'lowest', 'down', 'dropp?\\w*', 'dips?', 'dipp\\w*',
      'fell', 'falls?', 'falling', 'improv\\w*', 'reduc\\w*', 'eas(?:ed|es|ing)', 'subsid\\w*', 'resolv\\w*', 'better',
      'no longer', 'stop(?:ped|s|ping)?', 'ceas\\w*', 'settl\\w*', 'clear(?:ed|ing|s)?', 'halv\\w*', 'half as',
      'rare\\w*', 'abat\\w*', 'respond\\w*', 'under control', 'taper\\w*', 'fad(?:ed|es|ing)', 'wan(?:ed|es|ing)',
      'let up', 'died down', 'calm\\w*', 'gone', 'recover\\w*', 'went from', 'quiet\\w*', 'only once', 'no more',
      // Pass 2, and the absence words `aiLead/verify.ts` already bans in a lead:
      'disappear\\w*', 'went away', 'controlled', 'remission', 'absent', 'absence', 'none (?:in|since|after)',
      'no \\w+ since', 'minimal', 'lessen\\w*', 'diminish\\w*', 'milder', 'trend\\w* down\\w*', 'dwindl\\w*',
      'only (?:twice|once|a few)', 'occasional\\w*', 'peak\\w*', 'highest', '(?:itch|scratch|vomit|symptom|sign)\\w*-free',
    ].join('|') +
    ')\\b',
  'i',
)

/**
 * A count that goes down in so many words: "9 → 2", "9 -> 2", "from 9 to 2", "9, then 2". Digits on
 * both sides, so a date range ("Jun 1 – Jun 19") and a rising window ("48–72 h") never match.
 */
const ARROWS = [0x2192, 0x27f6, 0x21d2, 0x2014, 0x2013].map((c) => String.fromCodePoint(c)).join('|')
const NUM = '(\\d+(?:\\.\\d+)?)'
const GAP = '(?:\\s+\\S+){0,6}?' // up to six words between the two counts (pass 2: "from 9 on week 1 to 2")
const DESCENT = new RegExp(
  [
    `${NUM}\\s*(?:${ARROWS}|->|=>)\\s*${NUM}\\b`,
    `\\bfrom\\s+${NUM}\\b${GAP}\\s+to\\s+${NUM}\\b`,
    `${NUM}\\b${GAP}[,;]?\\s+(?:then|vs\\.?|versus|by week \\d+ it was|it was)\\s+${NUM}\\b`,
    `${NUM}\\b(?:\\s+\\S+){0,3}?\\s+in week \\d+,\\s+${NUM}\\b`,
  ].join('|'),
  'g',
)

/** Dates ("Jun 25", "Jun 25, 2026") and clock times ("14:00"), cut before the descent test: "from
 *  14:00 on Jun 25 to 14:00 on Jul 2" is a window, not a count going from 25 to 14. */
const DATES_AND_TIMES = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? \d{1,2}(?:, \d{4})?\b|\b\d{1,2}:\d{2}\b/g

function hasDescent(s: string): boolean {
  for (const m of s.replace(DATES_AND_TIMES, ' ; ').matchAll(DESCENT)) {
    const nums = m.slice(1).filter((x) => x !== undefined).map(Number)
    if (nums.length === 2 && nums[1] < nums[0]) return true
  }
  return false
}

/**
 * The carve-outs, as whole phrases and nothing looser, each a measured false hit on main's fixtures
 * that is not about a sign's course: a scope line ("5 symptom events fall outside this window") and a
 * deleted photo ("its photo is no longer retained"), and two from the stool reads ("a lower-GI sign",
 * a photo "not clear enough to read"), and the back sheets' scope, timing and weight phrases (VR2-14,
 * each named below). A table's cells, or two sheets, can run together in the text an extractor
 * returns ("for pruritus" then the next sheet's "down from 32.40 kg"), which is how a weight reading
 * sat in a sentence with the trial's sign. Cut from the sentence before it is tested, so
 * "fall after the diet change" and "no longer kept her up" still count (adversarial pass 1).
 */
const NOT_A_COURSE = [
  /\bfall outside (?:this|the) window\b/gi,
  /\bphoto is no longer retained\b/gi,
  /\blower-GI\b/gi, // anatomy: "a lower-GI (large-bowel) sign"
  /\bnot clear enough to read\b/gi, // a photo's quality, not a sign's course
  /\ba declined or barely-\s?touched meal\b/gi, // the intake sheet: a refused meal, the opposite of reassurance
  /\bnot a single incident\b/gi, // beside every chronicity flag: a course, not one event
  // VR2-14 (CUL-2294) reprints v1's event log, trial, diet and Noticed sections on the back sheets;
  // each of these is a measured false hit there, and none is about a sign's course:
  /\bphoto no longer retained\b/gi, // the event log's tag beside a read whose photo was removed
  /\btrial days fall (?:before and after|before|after) it\b/gi, // the trial's scope beside this window
  /\bof a trial that has run \d+ \u2014/gi, // "35 days of a trial that has run 87 — 52 trial days…": a dash, not an arrow
  /\bfell within ~?\d+ min of eating\b/gi, // the timing line: when episodes happened, not how many
  /\bweigh-in falls inside this window\b/gi, // the diet history's nutritional status
  /\bvs \d+ of \d+ matched control windows\b/gi, // an association's control count, not a course
  /\bthe highest before it in the last \d+ days\b/gi, // the weight block's comparison, not a sign
  /\bdown from \d+\.\d{2} kg\b/gi, // a weight reading (kg at 2 dp), not a sign
  /\bthe less this marker means\b/gi, // the exposures' timing-marker footnote: the marker, not a sign
  // "How this record was kept": a clearance DENIED, the opposite of a decline (pdfminer ran the
  // Noticed log's "vomit logged" into the kept sheet's first term).
  /\b(?:is not|never) an all-clear\b/gi,
  /\bno flag is not an all-clear\b/gi,
  /\bnever counted as clear\b/gi,
]

/**
 * The Noticed strip's "<words> falls entirely before this span" (VR2-14 reprints it on v2's Noticed
 * sheet). Cut only when none of the words it names is one of the trial's signs: "Hunched or tucked up
 * falls entirely before this span" says nothing about a gi trial's vomiting, while "Scratching more
 * falls entirely before this span" on a skin trial reads to a summariser as "scratching resolved"
 * from absence over answered days (adversarial pass 1), so it stays a hit. The words are the
 * capitalised list straight before the phrase, never the legend text an extractor runs into it.
 */
const SPAN_WORDS = /\b([A-Z][a-z]+(?: [a-z]+)*(?:, [A-Z][a-z]+(?: [a-z]+)*)*) (?:falls|fall) entirely before this span\b/g
function cutSpanWords(s: string, pats: readonly RegExp[]): string {
  return s.replace(SPAN_WORDS, (m, words: string) => (pats.some((p) => new RegExp(p.source, p.flags.replace('g', '')).test(words)) ? m : ' '))
}

/**
 * Sentences that name one of `signs` with a decline in the same sentence or the next one (a summary
 * that says "Itching on 9 days in week 1. By week 6 it was 2." splits the claim across two), unless
 * the next one is a labelled line of its own.
 */
export function declineSentences(text: string, signs: readonly string[], lineLabels: readonly string[] = []): string[] {
  if (signs.length === 0) return []
  const pats = signs.map(signPattern)
  const flat = text.normalize('NFKC').replace(/\s+/g, ' ')
  const sentences = flat.split(/(?<=[.;!?])\s+(?=[A-Z0-9"'(])/)
  const out: string[] = []
  sentences.forEach((sent, i) => {
    if (!pats.some((p) => p.test(sent))) return
    // The next sentence joins unless it opens one of the document's own labelled lines ("Diet trial
    // (owner-entered): ... stopped Jun 19"), which is the next record line, not a follow-on. Only
    // the document's labels count: any early colon did, and hid "By week 6 it had settled: 2" (pass 2).
    const next = sentences[i + 1] ?? ''
    const follows = !lineLabels.some((l) => l !== '' && next.toLowerCase().startsWith(`${l.toLowerCase()}:`))
    const window = [sent, follows ? next : ''].map((x) => NOT_A_COURSE.reduce((acc, re) => acc.replace(re, ' '), cutSpanWords(x, pats))).join(' ')
    if (DECLINE_WORDS.test(window) || hasDescent(window)) out.push(follows && next !== '' ? `${sent} ${next}` : sent)
  })
  return out
}

/** Where a missing line stops matching: its longest prefix that is a run in the haystack, and the
 *  next characters the line wanted. Printed beside a failure so the lost character is named. */
export function divergence(haystack: string, line: string): string {
  const hay = fold(haystack)
  const want = fold(line)
  let lo = 0
  let hi = want.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (hay.includes(want.slice(0, mid))) lo = mid
    else hi = mid - 1
  }
  const at = hay.indexOf(want.slice(0, lo))
  return `matched "${want.slice(Math.max(0, lo - 24), lo)}", wanted "${want.slice(lo, lo + 16)}", text has "${hay.slice(at + lo, at + lo + 16)}"`
}

/**
 * The page furniture Chromium prints in the `@page` margin boxes: the running head (the patient,
 * from the renderer's own `pageHeadCss`, so it is never mirrored here) and "page N of M". An
 * extractor reads it wherever the page breaks, which can be mid-line: measured in CI on 2026-11-02,
 * a Letter page break put "page 1 of 2 · Mira · Cat ..." inside a chart twin. The line's own text
 * still read back whole and in order, so the furniture is cut out of the haystack before matching.
 * Cut on the folded text, so a line is never joined across anything but furniture.
 */
export function withoutFurniture(haystack: string, doc: DocumentV2): string {
  let hay = fold(haystack).replace(/page\d+of\d+/g, '')
  const m = /@top-left\{content:("(?:[^"\\]|\\.)*")/.exec(pageHeadCss(doc))
  if (m) {
    const head = m[1].slice(1, -1).replace(/\\3C /g, '<').replace(/\\(.)/g, '$1')
    const f = fold(head)
    if (f !== '') hay = hay.split(f).join('')
  }
  return hay
}
