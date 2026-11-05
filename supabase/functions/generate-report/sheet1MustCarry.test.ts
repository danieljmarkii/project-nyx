// The sheet-1 must-carry guard (CUL-2551, PM ruling (a) on the v2 document fork, 2026-11-05).
//
// v2's sheet 1 never says less than v1's page 1. Every leaf of v1's page 1 (the smallest block of
// text v1 prints: a flag row, a trial row, a tile, a callout, a note), read off `renderReport`'s own
// output on every fixture and nyx-live's real record, must be in sheet 1's print text AND its phone
// text in one of three ways:
//   1. verbatim: the leaf's folded text, its pointers folded to one token (`pointerFold`);
//   2. a named reformat (`REFORMATS`): v2 states the same facts in its own shape, and the reformat's
//      own check proves it on the v2 model (the masthead's signalment, the band's flag rows);
//   3. not clinical (`NOT_CLINICAL`, asserted exactly): v1's letterhead, contents line and footer.
// A leaf that is none of these reds the build. Because v1 is read, never listed, a block v1 adds to
// its page 1 (CUL-2529's new facts) is held here the day it lands. Mutation tests at the foot prove
// each path reds.
import assert from 'node:assert/strict'
import type { ReportSnapshot } from './report.ts'
import { buildDocumentV2, signalmentLineOf, type BlockV2, type DocumentV2, type DocumentV2Options } from './documentV2.ts'
import { renderPrintV2 } from './renderPrintV2.ts'
import { renderPhoneV2 } from './renderPhoneV2.ts'
import { classOf, fallingTrialSignLabels, topLevelDivs, UNDRAWN_CHART_CAPTIONS, v1Page1Html } from './sheet1CarryV2.ts'
import { fold, pointerFold, v1Page1Leaves, type V1Leaf } from './sheet1MustCarry.testutil.ts'
import { trialOwnSignsOf } from './v2Predicates.ts'
import { renderReport, symptomLabel } from './render.ts'
import { nyxLiveSnapshot } from './nyxLive.testutil.ts'
import { v2DocFixtures } from '../../../scripts/report-phone/fixtures.deno.ts'

const OPTS: DocumentV2Options = { owner: { firstName: 'Ada', lastName: null }, shortId: null, questions: [] }

function fixtures(): Array<[string, ReportSnapshot]> {
  const out: Array<[string, ReportSnapshot]> = [...v2DocFixtures(), ['nyx-live-real', nyxLiveSnapshot()]]
  assert.ok(out.length >= 13, `only ${out.length} fixtures`)
  return out
}

/** Sheet 1's text in each renderer, folded, pointers tokened. */
interface Sheet1Text {
  print: string
  phone: string
}

function sheet1Text(doc: DocumentV2): Sheet1Text {
  const one = (html: string) => {
    const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'))
    // The band's own label ("Flag: intake.") is v2's frame for v1's tag; the reformat check reads it.
    return pointerFold(fold(main))
  }
  return { print: one(renderPrintV2(doc)), phone: one(renderPhoneV2(doc)) }
}

const has = (t: Sheet1Text, needle: string): boolean => t.print.includes(needle) && t.phone.includes(needle)

/** What a reformat or exemption is handed. */
interface Ctx {
  snap: ReportSnapshot
  doc: DocumentV2
  text: Sheet1Text
  /** v1's flag tags, in order ("Intake", "Not triggered"). */
  flagTags: string[]
}

function blockOf<K extends BlockV2['kind']>(doc: DocumentV2, kind: K): Extract<BlockV2, { kind: K }> | undefined {
  return doc.blocks.find((b): b is Extract<BlockV2, { kind: K }> => b.kind === kind)
}

const strip = (t: string): string => t.replace(/[.,:;()]/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * v1's identity block → v2's masthead (spec §5.7: one signalment builder, ruling W's weight). Each
 * fact v1 prints must be in the masthead's own words: species, breed, sex, neuter, age, household,
 * weight, conditions, the window's logged days. Returns what is missing, empty when carried.
 */
function mastheadCarries(leaf: V1Leaf, c: Ctx): string[] {
  const m = blockOf(c.doc, 'masthead')
  if (!m) return ['no masthead']
  const sig = fold(m.signalment)
  const miss: string[] = []
  const need = (ok: boolean, what: string) => {
    if (!ok) miss.push(what)
  }
  switch (leaf.cls) {
    case 'name':
      need(fold(m.name) === leaf.text, 'name')
      break
    case 'sig': {
      // The ONE builder, so the line is what `signalmentLineOf` says for this record (no drift).
      need(m.signalment === signalmentLineOf(c.snap), 'signalment builder')
      const s = c.snap.signalment
      need(sig.includes(s.species === 'dog' ? 'dog' : s.species === 'cat' ? 'cat' : s.species), 'species')
      if (s.breed) need(sig.includes(fold(s.breed)), 'breed')
      if (s.sex !== 'unknown') need(sig.includes(s.sex), 'sex')
      if (s.ageYears !== null) need(sig.includes(`${s.ageYears} y`), 'age')
      const lives = /lives with ([^·]+?) owner-recorded/.exec(leaf.text)
      if (lives) need(sig.includes(`lives with ${lives[1].trim()}`), 'household')
      break
    }
    case 'wt': {
      const kg = /latest weight ([\d.]+) kg/.exec(leaf.text)
      if (kg) need(sig.includes(`${kg[1]} kg`), 'latest weight')
      if (/no weigh-in recorded/.test(leaf.text)) need(sig.includes('no weight recorded'), 'no weight')
      // The owner's name: v2 takes it from the sender's profile (the colophon), v1 from the record.
      need(c.text.print.includes('kept by') || c.text.print.includes('owner'), 'owner')
      break
    }
    case 'cond':
      need(m.conditions !== null && strip(fold(m.conditions)) === strip(leaf.text), 'conditions')
      break
    case 'days': {
      const d = /(\d+) days with a log/.exec(leaf.text)
      if (d) need(fold(m.window).includes(`${d[1]} of`) && fold(m.window).includes('logged'), 'logged days')
      break
    }
    default:
      need(has(c.text, pointerFold(leaf.text)), `"${leaf.text}"`)
  }
  return miss
}

/** v1's trial-food list inside the diet-not-eaten flag, which v2's band cuts (CUL-2381 ruling (a)). */
const BAND_FOOD_LIST = / trial diet: ([^]*?)\. dates covered:/

/**
 * v1's safety band → v2's band (or, for a sole chronicity flag, the lead chart's flag heading).
 * Every flag's tag and its words after the tag print on sheet 1 verbatim; v1's "Not triggered" row
 * is the band's checks line, without the tag. The one cut v2 makes is CUL-2381 ruling (a)'s: the
 * band names the first trial foods, and every food v1's list names must print on sheet 1 elsewhere
 * (the trial block's rows).
 */
function bandCarries(leaf: V1Leaf, c: Ctx): string[] {
  if (leaf.cls === 'h') return blockOf(c.doc, 'band') || blockOf(c.doc, 'lead_chart')?.chart.flagHtml ? [] : ['no band and no chart flag']
  const tag = c.flagTags.map((t) => fold(t)).find((t) => leaf.text.startsWith(`${t} `))
  if (!tag) return [`a flag row with no tag v1 printed: "${leaf.text.slice(0, 60)}"`]
  let body = pointerFold(leaf.text.slice(tag.length + 1)).replace(/@ \([^)]*\)/g, '@')
  const miss: string[] = []
  const list = BAND_FOOD_LIST.exec(body)
  if (list) {
    // v1's first sheet may name the list by count ("the 6 trial-diet foods named in the diet-trial
    // block", CUL-2529): then every trial food on the flag must print on sheet 1 (the trial rows).
    const byCount = /^the \d+ trial-diet foods named in the diet-trial block$/.test(list[1].trim())
    const flag = c.snap.safetyFlags.find((f) => f.kind === 'trial_diet_refusal')
    const foods = byCount && flag && flag.kind === 'trial_diet_refusal' ? flag.trialDietLabels.map((l) => fold(l)) : list[1].split(' / ')
    for (const food of foods) if (!has(c.text, food.trim())) miss.push(`trial food "${food.trim()}"`)
    body = body.replace(BAND_FOOD_LIST, ' dates covered:')
    // The band's own cut list: the words before and after it, each verbatim.
    for (const part of body.split(' dates covered:')) if (!has(c.text, part.trim().replace(/\.$/, ''))) miss.push(`"${part.trim().slice(0, 80)}"`)
    return miss
  }
  if (!has(c.text, body)) miss.push(`"${body.slice(0, 120)}"`)
  // A sole chronicity flag is drawn on the lead chart (`bandMembersOf`), whose heading names it in
  // words ("Flag: itching over at least 49 days"): that heading is the tag's reformat.
  const chartFlag = blockOf(c.doc, 'lead_chart')?.chart
  const onChart = tag === 'chronicity' && !!chartFlag?.flagHtml && chartFlag.heading.startsWith('Flag: ')
  if (tag !== 'not triggered' && !onChart && !has(c.text, tag)) miss.push(`tag "${tag}"`)
  return miss
}

/**
 * v1's halves comparison for a trial's own sign whose later half falls: left off sheet 1 pending the
 * PM's ruling (CUL-2551, the quieter reading stays off; `fallingTrialSignLabels`). The check proves
 * the cut is exactly that: the leaf is a halves comparison (or its caveat) of a falling trial sign,
 * read off the snapshot's own `trendHalves`, and the sign's count and its lead-chart row still print.
 */
function fallingHalvesCut(leaf: V1Leaf, c: Ctx): string[] {
  if (leaf.cls !== 'delta' && leaf.cls !== 'delta-caveat') return ['a trend leaf that is not a halves comparison']
  const falling = fallingTrialSignLabels(c.snap)
  if (falling.length === 0) return ['no trial sign falls, so nothing may be cut']
  // Exactly the leaves the cut removes (adversarial pass 1: any caveat passed once one sign fell):
  // the delta and caveats of a falling trial sign's own trend block, and only where its delta states
  // the two counts. Read off v1's html, block by block, never matched by text alone.
  const trend = topLevelDivs(v1Page1Html(c.snap)).find((d) => /<h2>Symptom frequency/.test(d)) ?? ''
  const cut = new Set<string>()
  for (const m of trend.matchAll(/<div class="trend">[\s\S]*?(?=<div class="trend">|<div class="callout">|$)/g)) {
    const who = /<div class="who">([^<]*)/.exec(m[0])?.[1].trim() ?? ''
    const delta = /<div class="delta">([\s\S]*?)<\/div>/.exec(m[0])?.[1] ?? ''
    if (!falling.includes(who) || !delta.includes('&rarr;')) continue
    for (const d of m[0].matchAll(/<div class="delta(?:-caveat)?">[\s\S]*?<\/div>/g)) cut.add(fold(d[0]))
  }
  if (!cut.has(leaf.text)) return [`a trend leaf the pending cut does not remove: "${leaf.text}"`]
  const chart = blockOf(c.doc, 'lead_chart')?.chart
  const own = new Set<string>(trialOwnSignsOf(c.snap))
  const miss: string[] = []
  for (const s of c.snap.symptoms.filter((x) => own.has(x.type) && falling.includes(symptomLabel(x.type)))) {
    if (!chart?.rows.some((r) => r.kind === 'sign' && r.sign === s.type) && !c.text.print.includes(fold(symptomLabel(s.type)))) miss.push(`${s.type} on the chart or a line`)
  }
  return miss
}

/**
 * v1's captions that describe only a chart sheet 1 does not draw (CUL-2579 ruling (a): a caption
 * goes with its chart). Written here in v1's folded words, apart from the cut list in
 * `sheet1CarryV2.ts`, so a cut that grows past its caption leaves words this list does not name.
 * `rest` is what must still print verbatim; `items` is the change list a key names.
 */
function captionCut(leaf: V1Leaf): { rest: string; items: string | null } | null {
  const key = /^a dashed vertical marks the week a treatment or diet change started; a flat-headed vertical marks the week one stopped: (.*)\. timing and overlap are in "reading the trend" below\.$/.exec(leaf.text)
  if (key) return { rest: '', items: key[1] }
  if (/^under each date: days with a meal logged, of [^.]*\. a treat alone does not count as a meal\.$/.test(leaf.text)) return { rest: '', items: null }
  if (/^: a week with (?:no off-diet feeding recorded that is still not read as clean|meals logged on fewer than)/.test(leaf.text)) return { rest: '', items: null }
  const cut = leaf.text
    .replace('; each bar is one week, stacked by protein.', '.')
    .replace(' colour is a convenience — every protein also carries a texture, so this reads in black & white.', '')
  return cut === leaf.text ? null : { rest: cut, items: null }
}

/** A caption left out: the lead chart prints, the rest of the leaf is verbatim, and each change the key names is on the sheet with its dates. */
function captionCarries(leaf: V1Leaf, c: Ctx): string[] {
  const cut = captionCut(leaf)
  if (!cut) return ['a caption this reformat names']
  const miss: string[] = []
  if (!blockOf(c.doc, 'lead_chart')) miss.push('the lead chart')
  if (cut.rest !== '' && !has(c.text, pointerFold(cut.rest))) miss.push(`"${cut.rest.slice(0, 120)}"`)
  for (const item of (cut.items ?? '').split(/; (?![^(]*\))/).filter((x) => x !== '')) {
    const label = item
      .replace(/^(?:the medication|the trial diet|free-fed|the allowed food|the food) /, '')
      .split(/ on | from |, stopped |, permitted |, permit ended | \(|, first logged/)[0]
    if (!has(c.text, label)) miss.push(`the change "${label}"`)
    for (const d of item.match(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec) \d{1,2}(?:, \d{4})?\b/g) ?? []) {
      if (!has(c.text, d)) miss.push(`${label}'s date ${d}`)
    }
  }
  return miss
}

/** The named reformats: a v1 block kind (and, where it is narrower, the leaf), the v2 block that carries it, and its check. */
const REFORMATS: ReadonlyArray<{ name: string; top: string; when?: (leaf: V1Leaf) => boolean; v2: string; check: (leaf: V1Leaf, c: Ctx) => string[] }> = [
  { name: 'an undrawn chart’s caption → the lead chart', top: '*', when: (l) => captionCut(l) !== null, v2: 'lead-chart', check: captionCarries },
  { name: 'identity → masthead', top: 'ident', v2: 'masthead', check: mastheadCarries },
  { name: 'safety band → band', top: 'safetyband', v2: 'band', check: bandCarries },
  { name: 'a falling trial sign’s halves → off sheet 1, pending the PM', top: 'sec:symptom frequency & trend', v2: 'lead-chart', check: fallingHalvesCut },
]

/** v1 page 1's furniture: not report content. Asserted exactly (each key must be seen). */
const NOT_CLINICAL: Readonly<Record<string, string>> = {
  'letter/brand': 'the wordmark and the document kind',
  'letter/hqrblock': 'the QR code’s caption',
  'orient/orient': 'v1’s contents line; v2’s sheets carry their own titles',
  'ref': 'the diet block’s contents line ("Full event log, …: appendices A–E")',
  'foot/scan': 'v1’s page footer (patient and owner on every page: v2’s colophon and running head)',
  'foot/pg': 'v1’s page footer range and section label',
  'foot/fw': 'v1’s page footer wordmark',
}

/** v1's page 1 html, the letterhead included. */
const renderReportPage1 = (s: ReportSnapshot): string => renderReport(s).split('<section class="page">')[1] ?? ''

function notClinicalKey(l: V1Leaf): string | null {
  if (l.cls === 'ref') return 'ref'
  const k = `${l.top}/${l.cls}`
  return k in NOT_CLINICAL ? k : null
}

function flagTagsOf(snap: ReportSnapshot): string[] {
  const band = topLevelDivs(v1Page1Html(snap)).find((d) => classOf(d) === 'safetyband') ?? ''
  return [...band.matchAll(/<div class="flag"><span class="tag">([\s\S]*?)<\/span>/g)].map((m) => m[1].replace(/<[^>]*>/g, ''))
}

interface Verdict {
  missing: string[]
  verbatim: number
  reformatted: number
  exempt: Set<string>
}

/** The guard: every v1 page-1 leaf on sheet 1, or a reason the build accepts. */
function checkSheet1(name: string, snap: ReportSnapshot, doc: DocumentV2, leaves: V1Leaf[] = v1Page1Leaves(snap)): Verdict {
  const c: Ctx = { snap, doc, text: sheet1Text(doc), flagTags: flagTagsOf(snap) }
  const v: Verdict = { missing: [], verbatim: 0, reformatted: 0, exempt: new Set() }
  for (const l of leaves) {
    const nc = notClinicalKey(l)
    if (nc) {
      v.exempt.add(nc)
      continue
    }
    if (has(c.text, pointerFold(l.text))) {
      v.verbatim++
      continue
    }
    const r = REFORMATS.find((x) => (x.top === '*' || x.top === l.top) && (x.when?.(l) ?? true))
    if (!r) {
      const where = [c.text.print.includes(pointerFold(l.text)) ? '' : 'print', c.text.phone.includes(pointerFold(l.text)) ? '' : 'phone'].filter(Boolean).join(' and ')
      v.missing.push(`${name}: ${l.top}/${l.cls} missing from sheet 1 (${where}): "${l.text.slice(0, 160)}"`)
      continue
    }
    const miss = r.check(l, c)
    if (miss.length > 0) v.missing.push(`${name}: ${r.name} (${l.top}/${l.cls}) does not carry ${miss.join(', ')}`)
    else v.reformatted++
  }
  return v
}

Deno.test('sheet 1 must-carry — every leaf of v1’s page 1 prints on sheet 1, verbatim or as a named reformat, in print and on the phone (every fixture, nyx-live)', () => {
  const missing: string[] = []
  const exempt = new Set<string>()
  let verbatim = 0
  let reformatted = 0
  for (const [name, s] of fixtures()) {
    const v = checkSheet1(name, s, buildDocumentV2(s, OPTS))
    missing.push(...v.missing)
    verbatim += v.verbatim
    reformatted += v.reformatted
    for (const k of v.exempt) exempt.add(k)
  }
  assert.deepEqual(missing, [], `${missing.length} v1 page-1 leaves not on sheet 1:\n${missing.join('\n')}`)
  // Non-vacuous: hundreds of leaves compared, both reformats exercised, every exemption seen.
  assert.ok(verbatim > 600, `only ${verbatim} verbatim leaves`)
  assert.ok(reformatted > 40, `only ${reformatted} reformatted leaves`)
  // The pending cut is exercised, so its check is not green over nothing.
  assert.ok(fixtures().some(([, s]) => fallingTrialSignLabels(s).length > 0), 'a fixture with a falling trial sign')
  assert.deepEqual([...exempt].sort(), Object.keys(NOT_CLINICAL).sort(), 'every not-clinical key is one v1 prints, and no other')
})

Deno.test('sheet 1 must-carry — the reader is v1’s own output: the leaves include each block the PM named (flags, the trial with its callout, Timing vs symptoms, the medication overlap)', () => {
  const cooper = v2DocFixtures().find(([n]) => n === 'cooper')![1]
  const leaves = v1Page1Leaves(cooper)
  const tops = new Set(leaves.map((l) => l.top))
  assert.ok(tops.has('safetyband') && tops.has('headline') && tops.has('weight'))
  assert.ok(leaves.some((l) => l.top === 'sec:diet trial' && l.cls === 'callout' && l.text.startsWith('interpreting this record')))
  assert.ok(leaves.some((l) => l.text.startsWith('timing vs symptoms ')))
  assert.ok(leaves.some((l) => l.text.startsWith('medication during the trial ')))
  assert.ok(leaves.some((l) => l.text.startsWith('feedings not matched to the trial diet') || /\bfeedings not matched to the trial diet\b/.test(l.text)))
})

// ── Mutation proof: each path reds ───────────────────────────────────────────

const cooperSnap = (): ReportSnapshot => v2DocFixtures().find(([n]) => n === 'cooper')![1]
const without = (doc: DocumentV2, id: string): DocumentV2 => ({ ...doc, blocks: doc.blocks.filter((b) => b.id !== id) })

Deno.test('sheet 1 must-carry, mutation — dropping the diet-and-medication block (Timing vs symptoms) reds the guard', () => {
  const s = cooperSnap()
  const doc = buildDocumentV2(s, OPTS)
  assert.deepEqual(checkSheet1('cooper', s, doc).missing, [])
  const m = checkSheet1('cooper', s, without(doc, 'diet-meds')).missing
  assert.ok(m.some((x) => x.includes('timing vs symptoms')), m.join('\n'))
})

Deno.test('sheet 1 must-carry, mutation — dropping one trial row ("Switch onto the diet") or the callout reds the guard', () => {
  const s = cooperSnap()
  const doc = buildDocumentV2(s, OPTS)
  const cut = (f: (b: Extract<BlockV2, { kind: 'trial_reading' }>) => Extract<BlockV2, { kind: 'trial_reading' }>): DocumentV2 => ({
    ...doc,
    blocks: doc.blocks.map((b) => (b.kind === 'trial_reading' ? f(b) : b)),
  })
  const noSwitch = checkSheet1('cooper', s, cut((b) => ({ ...b, rows: b.rows.filter((r) => !r.labelHtml.startsWith('Switch')) }))).missing
  assert.ok(noSwitch.some((x) => x.includes('switch onto the diet')), noSwitch.join('\n'))
  const noCallout = checkSheet1('cooper', s, cut((b) => ({ ...b, html: null }))).missing
  assert.ok(noCallout.some((x) => x.includes('interpreting this record')), noCallout.join('\n'))
})

Deno.test('sheet 1 must-carry, mutation — a v1 page-1 block v2 never heard of reds the guard (CUL-2529’s new facts land held)', () => {
  const s = cooperSnap()
  const doc = buildDocumentV2(s, OPTS)
  const added: V1Leaf = { top: 'sec:diet trial', cls: 'kv', text: 'medication overlap prednisolone overlapping the trial sep 28 to oct 16' }
  const m = checkSheet1('cooper', s, doc, [...v1Page1Leaves(s), added]).missing
  assert.equal(m.length, 1)
  assert.match(m[0], /medication overlap prednisolone/)
})

Deno.test('sheet 1 must-carry, mutation — a band row that loses a sentence, or a masthead that loses the household, reds its reformat', () => {
  const s = nyxLiveSnapshot()
  const doc = buildDocumentV2(s, OPTS)
  assert.deepEqual(checkSheet1('nyx-live-real', s, doc).missing, [])
  const band: DocumentV2 = {
    ...doc,
    blocks: doc.blocks.map((b) =>
      b.kind === 'band' ? { ...b, items: b.items.map((i) => ({ ...i, html: i.html.replace(/ The owner was told[^.]*\./g, '') })) } : b,
    ),
  }
  const mb = checkSheet1('nyx-live-real', s, band).missing
  assert.ok(mb.some((x) => x.startsWith('nyx-live-real: safety band → band')), mb.join('\n'))
  const mast: DocumentV2 = {
    ...doc,
    blocks: doc.blocks.map((b) => (b.kind === 'masthead' ? { ...b, signalment: b.signalment.replace(/ · lives with [^·]+/, '') } : b)),
  }
  const mm = checkSheet1('nyx-live-real', s, mast).missing
  assert.ok(mm.some((x) => x.includes('identity → masthead') && x.includes('signalment builder')), mm.join('\n'))
})

Deno.test('sheet 1 must-carry, mutation — a leaf that prints in print but not on the phone reds the guard', () => {
  const s = cooperSnap()
  const doc = buildDocumentV2(s, OPTS)
  const text = sheet1Text(doc)
  const leaf = v1Page1Leaves(s).find((l) => l.text.startsWith('timing vs symptoms '))!
  assert.ok(has(text, pointerFold(leaf.text)))
  const phoneless: Sheet1Text = { print: text.print, phone: text.phone.replace(pointerFold(leaf.text), '') }
  assert.equal(has(phoneless, pointerFold(leaf.text)), false)
})

// ── CUL-2579 ruling (a): v1's framing where v1 put it ────────────────────────

const mastOf = (html: string): string => fold(html.slice(html.indexOf('<header'), html.indexOf('</header>')))

Deno.test('CUL-2579 — the masthead carries v1’s stamp line word for word, in print and on the phone, read off v1’s letterhead', () => {
  for (const [name, s] of fixtures()) {
    const doc = buildDocumentV2(s, OPTS)
    const stamp = /<div class="stamp">([\s\S]*?)<\/div>\s*<\/div>/.exec(renderReportPage1(s))?.[1] ?? ''
    const lines = [...stamp.matchAll(/<div>([\s\S]*?)<\/div>/g)].map((m) => fold(m[1])).filter((l) => !l.startsWith('generated'))
    assert.equal(lines.length, 2, `${name}: v1's stamp lines`)
    for (const html of [renderPrintV2(doc), renderPhoneV2(doc)]) {
      const mast = mastOf(html)
      for (const l of lines) assert.ok(mast.includes(l), `${name}: "${l}" in the masthead`)
      // Above the fold on the phone: before the "More details" fold opens.
      assert.ok(mast.indexOf(lines[1]) < (mast.indexOf('more details') === -1 ? Infinity : mast.indexOf('more details')), `${name}: the stamp is not folded away`)
    }
  }
})

Deno.test('CUL-2579 — the colophon carries v1’s page footer word for word, "associational" included', () => {
  for (const [name, s] of fixtures()) {
    const foot = /<div class="scan">[^<]*?&middot; (owner-reported observations &middot; associational, not a diagnosis)\.<\/div>/.exec(renderReportPage1(s))
    assert.ok(foot, `${name}: v1's footer`)
    const col = buildDocumentV2(s, OPTS).blocks.find((b) => b.kind === 'colophon')
    assert.ok(col && col.kind === 'colophon')
    assert.ok(fold(col.text).includes(fold(foot[1])), `${name}: ${col.text}`)
  }
})

Deno.test('CUL-2579 — v1’s headline prints straight under the band (or the checks line), never after the lead chart', () => {
  let seen = 0
  for (const [name, s] of fixtures()) {
    const ids = buildDocumentV2(s, OPTS).blocks.map((b) => b.id)
    const h = ids.indexOf('headline')
    if (h < 0) continue
    seen++
    const anchor = Math.max(ids.indexOf('band'), ids.indexOf('checks'), ids.indexOf('disclosure'), ids.indexOf('masthead'))
    assert.equal(h, anchor + 1, `${name}: ${ids.join(' ')}`)
  }
  assert.ok(seen >= 10, `${seen} fixtures with a headline`)
})

Deno.test('CUL-2579 — no caption of an undrawn chart prints, and the counts beside it still do (nyx-live)', () => {
  const s = nyxLiveSnapshot()
  const t = sheet1Text(buildDocumentV2(s, OPTS))
  for (const gone of ['a dashed vertical marks', 'each bar is one week', 'under each date:', 'colour is a convenience', ': a week with no off-diet feeding']) {
    assert.ok(!t.print.includes(gone) && !t.phone.includes(gone), gone)
  }
  assert.ok(has(t, 'off-diet feedings (feedings not matched to the trial diet or the allowed list) over'), 'the protein chart’s count still prints')
  assert.ok(has(t, 'a food containing several proteins counts once for each'), 'its counting rule still prints')
  assert.equal(UNDRAWN_CHART_CAPTIONS.length, 5)
})

Deno.test('CUL-2579, mutation — a caption cut that takes a count with it, or a key whose change is not on the sheet, reds the guard', () => {
  const s = nyxLiveSnapshot()
  const doc = buildDocumentV2(s, OPTS)
  assert.deepEqual(checkSheet1('nyx-live-real', s, doc).missing, [])
  const greedy: DocumentV2 = {
    ...doc,
    blocks: doc.blocks.map((b) => (b.kind === 'carried' && b.id === 'protein-timeline' ? { ...b, html: b.html.replace(/<div class="subnote"><span class="num">\d+<\/span> off-diet feeding[\s\S]*?<\/div>/, '') } : b)),
  }
  const mg = checkSheet1('nyx-live-real', s, greedy).missing
  assert.ok(mg.some((x) => x.includes('an undrawn chart’s caption') && x.includes('off-diet feeding')), mg.join('\n'))
  const key = v1Page1Leaves(s).find((l) => l.text.startsWith('a dashed vertical marks'))
  assert.ok(key, 'nyx-live prints a change key')
  const extra: V1Leaf = { ...key, text: key.text.replace('. timing and overlap', '; the medication gabapentin on oct 9. timing and overlap') }
  const mk = checkSheet1('nyx-live-real', s, doc, [...v1Page1Leaves(s).filter((l) => l !== key), extra]).missing
  assert.ok(mk.some((x) => x.includes('the change "gabapentin"')), mk.join('\n'))
})

Deno.test('CUL-2579, mutation — a masthead without the stamp reds the guard (the stamp is no longer exempt)', () => {
  const s = cooperSnap()
  const doc = buildDocumentV2(s, OPTS)
  const bare: DocumentV2 = { ...doc, blocks: doc.blocks.map((b) => (b.kind === 'masthead' ? { ...b, stamp: '' } : b)) }
  const m = checkSheet1('cooper', s, bare).missing
  assert.ok(m.some((x) => x.includes('letter/stamp') && x.includes('prepared for veterinary review')), m.join('\n'))
})
