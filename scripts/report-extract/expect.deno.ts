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
//   2. every line sheet 1 prints, whole, which is every digit on sheet 1 in its own sentence;
//   3. no sentence naming one of the trial's own signs states a decline in it;
//   4. "How this record was kept": a stub until VR2-14 (CUL-2294) writes those sentences.
//
// MATCHING is whitespace-blind, case-blind and NFKC-folded: an extractor may break a line, insert
// a space at a kerning gap, read a `text-transform: uppercase` heading in capitals, or hand back a
// ligature as one code point. None of that changes what a reader is told. A dropped, swapped or
// reordered character does, and fails.
import type { DocumentV2 } from '../../supabase/functions/generate-report/documentV2.ts'
import { textOf } from '../../supabase/functions/generate-report/documentV2.ts'
import type { ReportSnapshot } from '../../supabase/functions/generate-report/report.ts'
import { symptomLabel } from '../../supabase/functions/generate-report/render.ts'
import { SKIN_TRIAL_SIGNS } from '../../supabase/functions/generate-report/v2Predicates.ts'

export interface ExpectedLine {
  /** The block it prints in (`data-block`), so a failure names where to look. */
  block: string
  text: string
}

export interface Expectations {
  flags: ExpectedLine[]
  lines: ExpectedLine[]
  /** Lower-case labels of the trial's own signs ("itching"), empty without a gi or skin trial. */
  trialSigns: string[]
  /** "How this record was kept" (VR2-14). Empty until those sentences exist; see `KEPT_STUB`. */
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
    // filed for the font work (VR2-11), because a search for the curly form misses them.
    .replace(SINGLE_QUOTES, "'")
    .replace(DOUBLE_QUOTES, '"')
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
        for (const i of b.items) add(b.id, bandItemText(i.tag, i.html))
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

export function trialSignLabels(snap: ReportSnapshot): string[] {
  const ind = snap.trial?.indication ?? null
  const signs: readonly string[] = ind === 'skin' ? SKIN_TRIAL_SIGNS : ind === 'gi' ? GI_TRIAL_SIGNS : []
  return signs.map((s) => symptomLabel(s).toLowerCase())
}

/**
 * "How this record was kept" (spec §6.1, GAP-33): the fixed absence rules, always last. VR2-14
 * (CUL-2294) writes them; until then there is nothing to assert, and this says so rather than
 * passing quietly. When that block lands, `keptSentences` reads it off the back sheets and this
 * flips to `false`; `contiguity.deno.ts` fails the day the block exists while this is still `true`.
 */
export const KEPT_STUB = true
export const KEPT_HEADING = 'How this record was kept'

export function keptSentences(_doc: DocumentV2): ExpectedLine[] {
  return []
}

export function expectationsOf(doc: DocumentV2, snap: ReportSnapshot): Expectations {
  return { flags: firedFlags(doc), lines: sheet1Lines(doc), trialSigns: trialSignLabels(snap), kept: keptSentences(doc) }
}

/** The expected lines whose folded text is not a run inside the folded haystack. */
export function missing(haystack: string, want: readonly ExpectedLine[]): ExpectedLine[] {
  const hay = fold(haystack)
  return want.filter((w) => !hay.includes(fold(w.text)))
}

/**
 * Words that state a sign went down. Broad on purpose: a false hit costs a look at the fixture, a
 * miss lets a clinic's summarizer tell a vet the trial is working on a sign it is not. "no longer",
 * "stopped" and "resolved" are in it because a summary of a falling count reads as one of those.
 * Two carve-outs, each a measured false hit on main's fixtures: "fall outside this window" (a
 * scope line) and "no longer retained" (a deleted photo). Neither is about the sign's course.
 */
export const DECLINE_WORDS =
  /\b(declin\w*|decreas\w*|fewer|less|lower\w*|down|dropp?\w*|fell|falling|fall(?!\s+(?:outside|inside|within|before|after|on|in)\b)|improv\w*|reduc\w*|eas(?:ed|ing)|subsid\w*|resolv\w*|better|no longer(?!\s+(?:retained|kept|stored|available|on file)\b)|stopped)\b/i

/** Sentences of `text` that name one of `signs` and state a decline in the same sentence. */
export function declineSentences(text: string, signs: readonly string[]): string[] {
  if (signs.length === 0) return []
  const flat = text.normalize('NFKC').replace(/\s+/g, ' ')
  const sentences = flat.split(/(?<=[.;!?])\s+/)
  return sentences.filter((s) => signs.some((sign) => s.toLowerCase().includes(sign)) && DECLINE_WORDS.test(s))
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
