// Vet report v2 sheet 1: v1 page 1's sections, carried word for word (CUL-2551, PM ruling (a) on the
// v2 document fork, 2026-11-05).
//
// Every cold read of v2's front sheet found something v1's page 1 said that sheet 1 said less
// clearly, because sheet 1 rebuilt the page piece by piece. The fix is the cause: sheet 1 carries
// every block of v1's page 1, verbatim or as a named, tested reformat, and `sheet1MustCarry.test.ts`
// fails the build when one goes missing (the same mechanism as the back sheets' `mustCarry.test.ts`).
//
// WHAT THIS FILE CARRIES. v1's page 1 is read from `renderReport`'s own output (never a list of
// sentences), split into its top-level blocks, and each block is placed by kind:
//   - furniture (the letterhead, its rule, the contents line): not report content;
//   - the identity block and the safety band: v2's masthead and band carry them (named reformats);
//   - the diet trial section: v2's `trial_reading` block carries every row and the callout;
//   - vomit and stool characteristics: `episodesBlock` (v1's sections with v2's pointers);
//   - every other block (the headline, the weight, At a glance, the symptom trend, the off-diet
//     protein chart's notes, the diet-and-medication block with Timing vs symptoms, and any block v1
//     adds later): carried here, word for word, in v1's order. A chart's SVG is left out (brief 3a:
//     v2's lead chart draws it), and so is a caption that describes only the drawing (CUL-2579);
//     every count and caveat printed around it stays.
//
// THE RULES (the same as `documentV2.ts`): no clinical number is computed and no finding is worded
// here; pointers move through `v2Pointers` only; `html` is v1's already-escaped markup.
import { renderReport, symptomLabel } from './render.ts'
import type { ReportSnapshot } from './report.ts'
import { SHEET1_HERE, v2Pointers } from './backSheetsV2.ts'
import { trialOwnSignsOf } from './v2Predicates.ts'

/** A v1 page-1 section carried onto sheet 1. */
export interface CarriedSection {
  /** Unique across the document; stable for the parity tests (`data-block`). */
  id: string
  /** Already-escaped html, v1's words with v2's pointers. */
  html: string
}

/** v1 page 1's top-level blocks that v2 carries in a block of its own (or that are not content). */
export const V1_PAGE1_ELSEWHERE: Readonly<Record<string, string>> = {
  letter: 'furniture: the letterhead, the brand mark and the QR code',
  'rule-brand': 'furniture: the letterhead rule',
  orient: 'navigation: v1’s contents line ("appendices A–G follow"); v2’s sheets carry their own titles',
  ident: 'the masthead (named reformat: name, signalment, conditions, owner, window, last entry)',
  safetyband: 'the band (named reformat: each flag row, v2’s pointers)',
}

/** The html of v1's page 1: the first sheet section, before the appendices. */
export function v1Page1Html(input: ReportSnapshot): string {
  const html = renderReport(input)
  const open = '<section class="page">'
  const a = html.indexOf(open)
  if (a < 0) return ''
  const start = a + open.length
  const end = html.indexOf('</section>', start)
  return html.slice(start, end < 0 ? undefined : end)
}

/** The top-level `<div>` children of a fragment, in order. */
export function topLevelDivs(html: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = -1
  const re = /<(\/?)div\b[^>]*>/g
  for (let m = re.exec(html); m !== null; m = re.exec(html)) {
    if (!m[1]) {
      if (depth === 0) start = m.index
      depth++
    } else {
      depth--
      if (depth === 0 && start >= 0) out.push(html.slice(start, m.index + m[0].length))
    }
  }
  return out
}

/** A block's first class name. */
export function classOf(div: string): string {
  return /^<div\b[^>]*class="([^"\s]*)/.exec(div)?.[1] ?? ''
}

/** A section's heading text, lower-cased, its aside included. */
export function headingOf(div: string): string {
  const m = /<h2[^>]*>([\s\S]*?)<\/h2>/.exec(div)
  if (!m) return ''
  return m[1]
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Sections v2 carries elsewhere on sheet 1, by heading: the trial (`trial_reading`), the characteristics (`episodes`). */
const SECTIONS_ELSEWHERE = [/^diet trial\b/, /^vomit characteristics\b/, /^stool characteristics\b/]

/** Stable ids for v1's page-1 sections, by heading; the back sheets' must-carry rows name `diet-meds`. */
const SECTION_IDS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^at a glance/, 'at-a-glance'],
  [/^symptom frequency/, 'symptom-trend'],
  [/^off-diet protein exposure/, 'protein-timeline'],
  [/^diet, feeding, medications/, 'diet-meds'],
]

/** A section's id: a fixed one for each section v1 prints today, else its first three words. */
function sectionId(heading: string): string {
  const known = SECTION_IDS.find(([r]) => r.test(heading))
  if (known) return known[1]
  return `v1-${heading.split(' ').slice(0, 3).join('-').replace(/[^a-z0-9-]+/g, '') || 'section'}`
}

/**
 * v1's page-1 blocks that sheet 1 carries word for word, in v1's order (see the header). The diet
 * block is lifted out of v1's `tail` wrapper, which also holds v1's page footer.
 */
export function carriedSectionsOf(input: ReportSnapshot, episodesHtml: string | null): CarriedSection[] {
  const out: CarriedSection[] = []
  const seen = new Set<string>()
  const add = (base: string, html: string) => {
    let id = base
    for (let n = 2; seen.has(id); n++) id = `${base}-${n}`
    seen.add(id)
    out.push({ id, html })
  }
  for (const div of topLevelDivs(v1Page1Html(input))) {
    const cls = classOf(div)
    if (cls in V1_PAGE1_ELSEWHERE) continue
    if (cls === 'tail') {
      // v1 holds its diet block and its page footer together, so the footer never sits alone.
      for (const inner of topLevelDivs(div.replace(/^<div\b[^>]*>/, '').replace(/<\/div>$/, ''))) {
        if (classOf(inner) === 'foot') continue
        add(classOf(inner) === 'sec' ? sectionId(headingOf(inner)) : `v1-${classOf(inner) || 'block'}`, carry(inner, input))
      }
      continue
    }
    if (cls === 'sec') {
      const heading = headingOf(div)
      // v1's vomit and stool sections print where v1 put them, as v2's episodes block (brief 5a).
      if (/^(?:vomit|stool) characteristics\b/.test(heading)) {
        if (episodesHtml !== null && !seen.has('episodes')) add('episodes', episodesHtml)
        continue
      }
      if (SECTIONS_ELSEWHERE.some((r) => r.test(heading))) continue
      add(sectionId(heading), carry(div, input))
      continue
    }
    add(cls === 'weight' || cls === 'headline' ? cls : `v1-${cls || 'block'}`, carry(div, input))
  }
  return out
}

/**
 * The signs whose halves comparison sheet 1 leaves out, pending the PM's ruling (CUL-2551): a trial's
 * own sign whose later half counts fewer entries than its earlier one. v2's extraction rule (spec §8,
 * AC 7 rule 3) holds that no sentence states a decline in a trial's own sign; v1's page 1 prints
 * "first 23 d 11 → last 23 d 5" for it. Until the PM rules, the quieter reading (the fall, which reads
 * as the diet working) stays off sheet 1; the count, the lead chart's weekly bars and v1's notes
 * still print. Read off the snapshot's own `trendHalves`, never computed here.
 */
export function fallingTrialSignLabels(snap: ReportSnapshot): string[] {
  const own = new Set<string>(trialOwnSignsOf(snap))
  return snap.symptoms.filter((s) => own.has(s.type) && s.trendHalves !== null && s.trendHalves.lastCount < s.trendHalves.firstCount).map((s) => symptomLabel(s.type))
}

/** v1's trend blocks, each one sign: the halves comparison (and its caveat) cut for a falling trial sign. */
function withoutFallingHalves(div: string, snap: ReportSnapshot): string {
  const falling = fallingTrialSignLabels(snap)
  if (falling.length === 0) return div
  return div.replace(/<div class="trend">[\s\S]*?(?=<div class="trend">|<div class="callout">|$)/g, (trend) => {
    const who = /<div class="who">([^<]*)/.exec(trend)?.[1].trim() ?? ''
    // Only a comparison that states the two counts ("11 → 5") is a decline; v1's "not compared"
    // (a half too sparsely logged) and its caveat say the opposite, and print as v1 wrote them.
    const delta = /<div class="delta">([\s\S]*?)<\/div>/.exec(trend)?.[1] ?? ''
    if (!falling.includes(who) || !delta.includes('&rarr;')) return trend
    return trend.replace(/<div class="delta">[\s\S]*?<\/div>/g, '').replace(/<div class="delta-caveat">[\s\S]*?<\/div>/g, '')
  })
}

/**
 * v1's captions that describe a chart sheet 1 does not draw (CUL-2579 ruling (a), amending brief 3a:
 * a caption goes with its chart). Each is left out as a named reformat into the lead chart, which
 * draws each change with its dates; every count and caveat beside them still prints. The must-carry
 * guard checks each cut on its own terms (`sheet1MustCarry.test.ts`, "an undrawn chart's caption").
 */
export const UNDRAWN_CHART_CAPTIONS: ReadonlyArray<{ name: string; re: RegExp; to: string }> = [
  { name: 'the change marks’ key', re: /\s*<div class="chartlegend">[\s\S]*?<\/div>/g, to: '' },
  { name: 'the protein chart’s date row', re: /\s*<div class="subnote">Under each date: [\s\S]*?<\/div>/g, to: '' },
  { name: 'the protein chart’s unread-week glyph', re: /\s*<div class="subnote"><svg class="key"[\s\S]*?<\/div>/g, to: '' },
  { name: 'the protein chart’s bars', re: /; each bar is one week, stacked by protein\./g, to: '.' },
  { name: 'the protein chart’s colours', re: / Colour is a convenience — every protein also carries a texture, so this reads in black &amp; white\./g, to: '' },
]

/** v1's words with v2's pointers; a chart's SVG, its captions and v1's contents line left out (see the header). */
function carry(div: string, input: ReportSnapshot): string {
  const html = UNDRAWN_CHART_CAPTIONS.reduce((acc, c) => acc.replace(c.re, c.to), withoutFallingHalves(div, input))
    .replace(/<svg\b(?![^>]*class="spark")[\s\S]*?<\/svg>/g, '')
    .replace(/\s*<p class="ref">Full event log, [\s\S]*?<\/p>/g, '')
  return v2Pointers(html, input, SHEET1_HERE).trim()
}
