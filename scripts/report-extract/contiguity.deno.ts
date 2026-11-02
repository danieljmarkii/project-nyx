// The clinic-AI contiguity guard (CUL-2292, row VR2-12; v2 spec §8). Runs on every PR inside the
// required `Edge Functions (deno test)` job, with no browser: it holds the v2 print HTML's text
// layer to the same expectations the Chromium extraction job holds the PDF to (`expect.deno.ts`).
//
// What it can see without a layout engine, which is what makes a PDF extractor lose a line before
// any font is involved:
//   1. CONTIGUITY. Every fired flag and every sheet 1 line is one unbroken run inside ONE block of
//      sheet 1's markup. Inline tags (b, span, sup, …) join; any other tag is a boundary, because a
//      block boundary is where an extractor may reorder (CUL-2276's "NOT TRIGGERED" printed after
//      its paragraph). The chart SVG is cut out first: it is aria-hidden, the twin carries its
//      facts, and its labels must never be the only place a fact survives.
//   2. NO GENERATED TEXT. No stylesheet rule outside `@page` writes a digit through `content:`.
//      Text a stylesheet draws is not in the DOM, so the model never sees it and an extractor may.
//   3. NOT GREEN OVER NOTHING. The fixtures carry a fired flag, a lead chart flag, a trial with its
//      own signs, and both small-cat weights; the decline detector fires on a decline.
//   4. NO DECLINE. No sentence in the whole document (sheet 1 and the back sheets, as text) names
//      one of the trial's own signs and states a decline in it.
//   5. THE STUB. "How this record was kept" is asserted by nothing until VR2-14 (CUL-2294). The
//      day a renderer prints that heading while `KEPT_STUB` is still true, this goes red.
//
// BLIND SPOTS, stated so they never read as coverage: fonts (tnum, calt; guards/reportNoTnum.test.ts
// holds the declarations, the Chromium job the behaviour); the page head in `@page` margin boxes,
// which repeats the masthead; and WebKit, the engine iOS prints in (CUL-1771's device probe).
//
// Usage: deno test --allow-read=supabase/functions,scripts scripts/report-extract/contiguity.deno.ts
import { strict as nodeAssert } from 'node:assert'
import { buildDocumentV2 } from '../../supabase/functions/generate-report/documentV2.ts'
import { renderPrintV2 } from '../../supabase/functions/generate-report/renderPrintV2.ts'
import { extractionDocs } from './docs.deno.ts'
import { declineSentences, divergence, expectationsOf, fold, KEPT_HEADING, KEPT_STUB, missing, withoutFurniture, type ExpectedLine } from './expect.deno.ts'
import { SMALL_CAT_WEIGHTS } from './fixtures.deno.ts'

// node:assert is bundled, so this suite fetches nothing (the CI step runs it --cached-only).
function assert(cond: unknown, msg?: string): asserts cond {
  nodeAssert.ok(cond, msg)
}
function assertEquals<T>(actual: T, expected: T, msg?: string): void {
  nodeAssert.deepEqual(actual, expected, msg)
}

/** Tags that keep a run of text together; every other tag is a block boundary. */
const INLINE = new Set(['a', 'abbr', 'b', 'bdi', 'bdo', 'cite', 'code', 'em', 'i', 'kbd', 'mark', 'q', 's', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'wbr'])

const cp = (n: number): string => String.fromCodePoint(n)
const ENTITIES: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'",
  rsquo: cp(0x2019), lsquo: cp(0x2018), ldquo: cp(0x201c), rdquo: cp(0x201d), mdash: cp(0x2014), ndash: cp(0x2013), middot: cp(0xb7), hellip: cp(0x2026), times: cp(0xd7),
}

function decode(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

/** Sheet 1's markup: the `<main data-sheet="1">` element, its chart SVGs cut out. */
export function sheet1Html(html: string): string {
  const open = html.indexOf('<main class="sheet" data-sheet="1">')
  const close = html.indexOf('</main>', open)
  if (open < 0 || close < 0) throw new Error('no sheet 1 <main> in the rendered HTML')
  return html.slice(open, close).replace(/<svg[\s\S]*?<\/svg>/g, ' ')
}

/** The text runs an extractor can keep together: sheet 1's text split at every block boundary. */
export function textRuns(sheetHtml: string): string[] {
  const marked = sheetHtml.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (_m, tag: string) => (INLINE.has(tag.toLowerCase()) ? '' : '\u0000'))
  return marked
    .split('\u0000')
    .map((r) => decode(r).replace(/\s+/g, ' ').trim())
    .filter((r) => r !== '')
}

/** Lines that are not a run inside any single block, with the block they lost contiguity in. */
export function brokenLines(runs: readonly string[], want: readonly ExpectedLine[]): ExpectedLine[] {
  const folded = runs.map(fold)
  return want.filter((w) => {
    const f = fold(decode(w.text))
    return !folded.some((r) => r.includes(f))
  })
}

/** `content:` declarations outside `@page` that draw a digit. */
export function generatedDigits(html: string): string[] {
  const css = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n')
  const noPage = stripAtPage(css.replace(/\/\*[\s\S]*?\*\//g, ' '))
  return [...noPage.matchAll(/content\s*:\s*([^;}]*)/g)].map((m) => m[1]).filter((v) => /"[^"]*\d[^"]*"|'[^']*\d[^']*'|counter\(/.test(v))
}

/** CSS with every `@page …{…}` rule (nested braces included) removed. */
function stripAtPage(css: string): string {
  let out = ''
  let i = 0
  while (i < css.length) {
    const at = css.indexOf('@page', i)
    if (at < 0) {
      out += css.slice(i)
      break
    }
    out += css.slice(i, at)
    const open = css.indexOf('{', at)
    if (open < 0) break
    let depth = 1
    let j = open + 1
    while (j < css.length && depth > 0) {
      if (css[j] === '{') depth++
      else if (css[j] === '}') depth--
      j++
    }
    i = j
  }
  return out
}

const docs = extractionDocs(buildDocumentV2)

for (const { name, snap, doc } of docs) {
  Deno.test(`contiguity — ${name}: every fired flag and every sheet 1 line is one run in one block`, () => {
    const html = renderPrintV2(doc)
    const want = expectationsOf(doc, snap)
    assert(want.lines.length > 0, `${name}: the model printed no sheet 1 lines`)
    const runs = textRuns(sheet1Html(html))
    const lost = [...brokenLines(runs, want.flags).map((l) => ['flag', l] as const), ...brokenLines(runs, want.lines).map((l) => ['line', l] as const)]
    assertEquals(
      lost.map(([k, l]) => `${k} (${l.block}): ${divergence(runs.join(' | '), decode(l.text))}`),
      [],
      `${name}: lines an extractor could split`,
    )
  })

  Deno.test(`contiguity — ${name}: no stylesheet draws a digit outside the page head`, () => {
    assertEquals(generatedDigits(renderPrintV2(doc)), [])
  })
}

for (const { name, snap, doc } of docs) {
  Deno.test(`contiguity — ${name}: no sentence states a decline for the trial's own sign`, () => {
    const signs = expectationsOf(doc, snap).trialSigns
    const html = renderPrintV2(doc).replace(/<style>[\s\S]*?<\/style>/g, ' ').replace(/<svg[\s\S]*?<\/svg>/g, ' ')
    assertEquals(declineSentences(textRuns(html).join(' '), signs), [])
  })
}

Deno.test('contiguity — the fixtures carry every class the extraction job is for (never green over nothing)', () => {
  const all = docs.map(({ name, snap, doc }) => ({ name, want: expectationsOf(doc, snap), doc }))
  assert(all.some((d) => d.want.flags.some((f) => f.block === 'band')), 'no fixture fires a band flag')
  assert(all.some((d) => d.want.flags.some((f) => f.block === 'lead-chart')), 'no fixture leads with a flagged chart (R-11)')
  assert(all.some((d) => d.want.trialSigns.length > 0), "no fixture carries a trial with its own signs")
  for (const [fixture, kg] of Object.entries(SMALL_CAT_WEIGHTS)) {
    const d = all.find((x) => x.name === fixture)
    assert(d, `fixture ${fixture} is missing`)
    assert(d.want.lines.some((l) => fold(l.text).includes(fold(kg))), `${fixture} does not print "${kg}" on sheet 1`)
  }
})

Deno.test('contiguity — "How this record was kept" is a stub only while no renderer prints it (VR2-14)', () => {
  const printed = docs.filter(({ doc }) => renderPrintV2(doc).includes(KEPT_HEADING)).map((d) => d.name)
  if (KEPT_STUB) {
    assertEquals(printed, [], `the "${KEPT_HEADING}" block now prints; write keptSentences() in expect.deno.ts and set KEPT_STUB to false`)
  } else {
    assert(printed.length === docs.length, 'KEPT_STUB is off but not every fixture prints the block')
    for (const { name, doc } of docs) assert(expectationsOf(doc, docs.find((d) => d.name === name)!.snap).kept.length > 0, `${name}: no kept sentences`)
  }
})

// ── The detectors, proved on inputs where the answer is known ──────────────────────────────────

Deno.test('fold — whitespace, case, ligatures and the quote forms an extractor hands back', () => {
  assertEquals(fold('Owner’s  Home\nLog'), fold("ownerʼs home log"))
  assertEquals(fold('ﬁve'), fold('five'))
  assert(fold('1.95 kg').includes(fold('1.95kg')))
  assert(!fold('1.9 kg').includes(fold('1.95 kg')), 'a dropped hundredth must not match')
})

Deno.test('missing / divergence — a dropped digit is lost, and the report names it', () => {
  const want: ExpectedLine[] = [{ block: 'band', text: 'below this pet’s baseline for 2 consecutive days' }]
  assertEquals(missing("below this petʼs baseline for 2 consecutive days", want), [])
  assertEquals(missing('below this pet’s baseline for consecutive days', want).length, 1)
  assert(divergence('below this pet’s baseline for consecutive days', want[0].text).includes('wanted "2consecutive'))
})

Deno.test('textRuns / brokenLines — a block boundary inside a line breaks it; inline tags do not', () => {
  const runs = textRuns('<main class="sheet" data-sheet="1"><p>Weight <b>1.86</b> kg</p><div>1.95</div><div>kg</div></main>')
  assertEquals(brokenLines(runs, [{ block: 'x', text: 'Weight 1.86 kg' }]), [])
  assertEquals(brokenLines(runs, [{ block: 'x', text: '1.95 kg' }]).length, 1)
})

Deno.test('generatedDigits — a digit drawn by CSS is caught; the page head and labels are not', () => {
  assertEquals(generatedDigits('<style>@page{@bottom-right{content:"page " counter(page);}}.a::before{content:attr(x) ": ";}</style>'), [])
  assertEquals(generatedDigits('<style>.n::before{content:"2 ";}</style>').length, 1)
  assertEquals(generatedDigits('<style>li::marker{content:counter(list-item) ". ";}</style>').length, 1)
})

Deno.test('declineSentences — a decline beside the trial sign is caught; scope lines and other signs are not', () => {
  const signs = ['itching']
  assertEquals(declineSentences('Itching fell from 9 to 2 entries a week.', signs).length, 1)
  assertEquals(declineSentences('Fewer itching entries in week 6. Vomiting: none.', signs).length, 1)
  assertEquals(declineSentences('Itching on 12 of 14 days. Vomiting fell to 1.', signs), [])
  assertEquals(declineSentences('3 itching entries fall outside this window.', signs), [])
  assertEquals(declineSentences('Itching fell to 1.', []), [])
})

Deno.test('withoutFurniture — a running head mid-line is cut; a lost digit still is not forgiven', () => {
  const d = docs.find((x) => x.name === 'mira-long-bowls')
  assert(d, 'mira-long-bowls fixture missing')
  const m = d.doc.blocks.find((b) => b.kind === 'masthead')
  assert(m && m.kind === 'masthead')
  const head = `page 1 of 2 ${m.name} · ${m.signalmentBrief} · owner\u2019s home log · ${m.window}`
  const want: ExpectedLine[] = [{ block: 'lead-chart', text: 'courses and foods: Purina ONE 12 days' }]
  assertEquals(missing(withoutFurniture(`courses and foods: ${head} Purina ONE 12 days`, d.doc), want), [])
  assertEquals(missing(withoutFurniture(`courses and foods: ${head} Purina ONE 1 days`, d.doc), want).length, 1)
})
