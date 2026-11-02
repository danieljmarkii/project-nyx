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
//   5. HOW THIS RECORD WAS KEPT (VR2-14, CUL-2294; GAP-33). Every fixture prints the block, last,
//      and each of its sentences is one run in one block, so an extractor gets it whole.
//
// BLIND SPOTS, stated so they never read as coverage: fonts (tnum, calt; guards/reportNoTnum.test.ts
// holds the declarations, the Chromium job the behaviour); the page head in `@page` margin boxes,
// which repeats the masthead and is cut before matching, not asserted; the serif slot (line 1 and
// the AI lead), which the runner prints in Liberation Serif, not Newsreader, until VR2-11 embeds
// it; WebKit, the engine iOS prints in (CUL-1771's device probe); and the decline detector, which
// is a word and count list over today's copy, not a reader: `aiLead/verify.ts` is the lead's gate.
//
// Usage: deno test --allow-read=supabase/functions,scripts scripts/report-extract/contiguity.deno.ts
import { strict as nodeAssert } from 'node:assert'
import { buildDocumentV2 } from '../../supabase/functions/generate-report/documentV2.ts'
import { renderPrintV2 } from '../../supabase/functions/generate-report/renderPrintV2.ts'
import { extractionDocs } from './docs.deno.ts'
import { declineSentences, divergence, expectationsOf, fold, KEPT_HEADING, keptSentences, missing, withoutFurniture, type ExpectedLine } from './expect.deno.ts'
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

for (const { name, snap, doc, aiLead } of docs) {
  Deno.test(`contiguity — ${name}: every fired flag and every sheet 1 line is one run in one block`, () => {
    const html = renderPrintV2(doc, aiLead)
    const want = expectationsOf(doc, snap, aiLead)
    assert(want.lines.length > 0, `${name}: the model printed no sheet 1 lines`)
    const runs = textRuns(sheet1Html(html))
    const lost = [...brokenLines(runs, want.flags).map((l) => ['flag', l] as const), ...brokenLines(runs, want.lines).map((l) => ['line', l] as const)]
    assertEquals(
      lost.map(([k, l]) => `${k} (${l.block}): ${divergence(runs.join(' | '), decode(l.text))}`),
      [],
      `${name}: lines an extractor could split`,
    )
  })

  Deno.test(`contiguity — ${name}: every "How this record was kept" sentence is one run in one block`, () => {
    const html = renderPrintV2(doc, aiLead)
    const want = expectationsOf(doc, snap, aiLead)
    assert(want.kept.length >= 30, `${name}: ${want.kept.length} kept sentences`)
    const kept = html.slice(html.indexOf('data-block="kept"'))
    const runs = textRuns(kept)
    assertEquals(brokenLines(runs, want.kept).map((l) => divergence(runs.join(' | '), decode(l.text))), [], `${name}: kept sentences an extractor could split`)
  })

  Deno.test(`contiguity — ${name}: no stylesheet draws a digit outside the page head`, () => {
    assertEquals(generatedDigits(renderPrintV2(doc, aiLead)), [])
  })

  Deno.test(`contiguity — ${name}: every safety flag the snapshot fired is a flag the test expects`, () => {
    // The expectations come from the document; this ties them back to the snapshot, so a flag the
    // document model dropped cannot also drop out of the test (adversarial pass 1, hardening).
    assertEquals(expectationsOf(doc, snap, aiLead).flags.length, snap.safetyFlags.length)
  })
}

for (const { name, snap, doc, aiLead } of docs) {
  Deno.test(`contiguity — ${name}: no sentence states a decline for the trial's own sign`, () => {
    const want = expectationsOf(doc, snap, aiLead)
    const html = renderPrintV2(doc, aiLead).replace(/<style>[\s\S]*?<\/style>/g, ' ').replace(/<svg[\s\S]*?<\/svg>/g, ' ')
    assertEquals(declineSentences(textRuns(html).join(' '), want.trialSigns, want.lineLabels), [])
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

Deno.test('contiguity — "How this record was kept" prints on every fixture, and a document without it cannot pass (VR2-14)', () => {
  // Read on the folded text, so markup or a spacing change inside the heading cannot slip past.
  const prints = (d: (typeof docs)[number]): boolean => fold(textRuns(renderPrintV2(d.doc, d.aiLead)).join(' ')).includes(fold(KEPT_HEADING))
  assertEquals(docs.filter((d) => !prints(d)).map((d) => d.name), [])
  for (const d of docs) assert(expectationsOf(d.doc, d.snap, d.aiLead).kept.length > 0, `${d.name}: no kept sentences`)
  // Mutation: the block cut out of a document makes the expectations throw, never assert nothing.
  const d = docs[0]
  const cut = { ...d.doc, backSheets: d.doc.backSheets.map((s) => ({ ...s, blocks: s.blocks.filter((b) => b.kind !== 'kept') })) }
  nodeAssert.throws(() => keptSentences(cut), /no "How this record was kept" block/)
})

Deno.test('contiguity — the AI lead variants print the lead (never a lead-shaped fixture with no lead)', () => {
  const leads = docs.filter((d) => d.aiLead !== null)
  assert(leads.length >= 3, 'fewer than three AI lead variants')
  for (const d of leads) assert(renderPrintV2(d.doc, d.aiLead).includes('data-block="ai-lead"'), `${d.name}: no lead slot`)
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
  assertEquals(declineSentences('Itching on 12 of 14 days. Weight 4.10 kg. Vomiting fell to 1.', signs), [])
  assertEquals(declineSentences('Vomiting: 5 entries, the last Jun 17. Diet trial: z/d, stopped Jun 19.', ['vomit'], ['Diet trial']), [])
  // Only the document's own labels end the window: an early colon in a follow-on does not (pass 2).
  assertEquals(declineSentences('Itching on 9 days in week 1. By week 6 it had settled: 2 entries.', ['itch'], ['Diet trial']).length, 1)
  assertEquals(declineSentences('3 itching entries fall outside this window.', signs), [])
  assertEquals(declineSentences('Itching fell to 1.', []), [])
})

Deno.test('declineSentences — every decline adversarial pass 1 planted is caught', () => {
  const planted: Array<[string, string[]]> = [
    ['Diarrhea entries fell from 5 to 1 a week.', ['diarrhea']],
    ['Loose stool dropped after week 2.', ['diarrhea']],
    ['Vomited less often after week 2.', ['vomit']],
    ['Itching: 9 \u2192 2 entries a week.', ['itch']],
    ['Itching entries fall after the diet change.', ['itch']],
    ['Itching settled by week 6.', ['itch']],
    ['The itching no longer kept her up at night.', ['itch']],
    ['Itchy episodes were half as frequent.', ['itch']],
    ['Itching went from 9 to 2.', ['itch']],
    ['Itching cleared by week 5.', ['itch']],
    ['Itching is now rare.', ['itch']],
    ['Itching halved.', ['itch']],
    ['Itching responded to the diet.', ['itch']],
    ['Itching is under control.', ['itch']],
    ['Itching abated.', ['itch']],
    ['Itching was at its lowest in week 6.', ['itch']],
    ['Scratched less in week 6.', ['scratch']],
    ['Itching vs. week 1 fell.', ['itch']],
    ['Itching on 9 days in week 1. By week 6 it was 2.', ['itch']],
    // Pass 2's planted misses:
    ['Itching from 9 on week 1 to 2 on week 6.', ['itch']],
    ['Itching on 9 days in week 1, then 2.', ['itch']],
    ['Itching 9 vs 2 entries a week.', ['itch']],
    ['Itching entries: 9 in week 1, 2 in week 6.', ['itch']],
    ['Itching 9 \u2014 2.', ['itch']],
    ['Itching 9 \u27f6 2.', ['itch']],
    ['Itching 9 \u21d2 2.', ['itch']],
    ['Itching on 9 days in week 1. Week 6: fewer.', ['itch']],
    ['Pruritus decreased.', ['itch']],
    ['Paw licking dropped.', ['scratch']],
    ['Threw up less in week 6.', ['vomit']],
    ['Emesis decreased.', ['vomit']],
    ['No itching since week 3.', ['itch']],
    ['Itching disappeared.', ['itch']],
    ['Itching went away.', ['itch']],
    ['Itching is controlled.', ['itch']],
    ['Itching in remission.', ['itch']],
    ['Itch-free by week 6.', ['itch']],
    ['Itching was absent in week 6.', ['itch']],
    ['Itching: none in week 6.', ['itch']],
    ['Itching was minimal.', ['itch']],
    ['Itching lessened.', ['itch']],
    ['Itching diminished.', ['itch']],
    ['Itching was milder.', ['itch']],
    ['Itching trended downward.', ['itch']],
    ['Itching dwindled.', ['itch']],
    ['Itching only twice in week 6.', ['itch']],
    ['Itching is occasional.', ['itch']],
    ['Itching peaked in week 1.', ['itch']],
  ]
  for (const [text, signs] of planted) assertEquals(declineSentences(text, signs).length > 0, true, text)
})

Deno.test('declineSentences — dates, times and the measured carve-outs are not a decline', () => {
  assertEquals(declineSentences('Itching getting worse: not checked (from 14:00 on Jun 25 to 14:00 on Jul 2).', ['itch']), [])
  assertEquals(declineSentences('Loose stool photo: not clear enough to read.', ['diarrhea']), [])
  assertEquals(declineSentences('Vomiting Oct 31: its photo is no longer retained.', ['vomit']), [])
  // A carve-out never covers a looser phrase:
  assertEquals(declineSentences('Itching entries fall in the last two weeks.', ['itch']).length, 1)
  // VR2-14's back-sheet carve-outs, each beside the near phrase that must still count.
  assertEquals(declineSentences('Vomiting Oct 31: read uncertain, photo no longer retained.', ['vomit']), [])
  assertEquals(declineSentences('42 trial days fall before it (10 vomiting).', ['vomit']), [])
  assertEquals(declineSentences('35 days of a trial that has run 87 \u2014 52 trial days fall before it (10 vomiting).', ['vomit']), [])
  assertEquals(declineSentences('Vomiting 87 \u2014 52 over the trial.', ['vomit']).length, 1)
  assertEquals(declineSentences('Vomiting entries fall before the diet change.', ['vomit']).length, 1)
  assertEquals(declineSentences('Vomiting falls entirely before this span.', ['vomit']), [])
  assertEquals(declineSentences('Vomiting falls entirely after the switch.', ['vomit']).length, 1)
  assertEquals(declineSentences('9 of 14 timed vomiting episodes fell within ~30 min of eating.', ['vomit']), [])
  assertEquals(declineSentences('Vomiting fell within two weeks of the switch.', ['vomit']).length, 1)
  assertEquals(declineSentences('Diarrhoea (active). No weigh-in falls inside this window.', ['diarrhea']), [])
  assertEquals(declineSentences('Vomiting in 4 of 4 episodes, vs 0 of 4 matched control windows.', ['vomit']), [])
  assertEquals(declineSentences('Vomiting went from 4 of 4 days to 0 of 4.', ['vomit']).length, 1)
  assertEquals(declineSentences('For pruritus. The highest before it in the last 365 days: 31.80 kg, down from 32.40 kg.', ['itch']), [])
  assertEquals(declineSentences('Pruritus is down from last month.', ['itch']).length, 1)
  assertEquals(declineSentences('Oct 28 vomit logged. No flag is not an all-clear. A clear photo is never an all-clear; never counted as clear.', ['vomit']), [])
  assertEquals(declineSentences('Vomiting has cleared.', ['vomit']).length, 1)
  assertEquals(declineSentences('Vomiting 6 days. The denser the symptom record, the less this marker means.', ['vomit']), [])
  assertEquals(declineSentences('Vomiting: less this week.', ['vomit']).length, 1)
})

Deno.test('fold — whitespace between digits is never dropped', () => {
  assert(!fold('week 74-day week').includes(fold('week 7 4-day week')))
  assert(!fold('1 2 of 14 days').includes(fold('12 of 14 days')))
  assert(fold('12 of\n14 days').includes(fold('12 of 14 days')))
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
