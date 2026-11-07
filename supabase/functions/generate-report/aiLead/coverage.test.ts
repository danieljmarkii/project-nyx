// CUL-2629 (PM ruling (a), 2026-11-07): the checker's code half rejects any lead that leaves out a
// live band item, decided from the fact table and the printed words, whatever the model scored.
//
// The proof is read the way the bake-off reads stop (2) the second time: the record rule
// (`liveFlagIssues`) set aside, so the code half and the model half decide alone. `sansRecordRule`
// is that read, built on the exported `checkerCodeIssues`, the function the fourth run's harness
// calls (never a hand copy of checkerDecision's body, which is how rerun-3 could not see coverage).
//
// The exhibits are verbatim: `rv-script-d` from the committed set with the verdict the third run's
// checker returned for it (rerun-3/run/checker-set.json), and the lead the re-run printed on nyx-v2
// on runs 2 to 4 with each run's recorded checker verdict (rerun/2026-11-05-run/out/nyx-v2-0{2,3,4}.json).
import assert from 'node:assert/strict'
import { tableFromPayload, type LeadFactPayload } from './facts.ts'
import { checkerCodeIssues, checkerDecision, modelDecision, parseChecker, type CheckerVerdict } from './leadPipeline.ts'
import { bandCoverageIssues, bandOrderIssues, ownSignIssues, printedSentences, type LeadSentence, type LeadSummary } from './verify.ts'
import type { FactTable } from './verifyCore.ts'
import { HAZARDS } from './prompts.ts'

const DIR = new URL('./exhibits/adversarial/', import.meta.url)
const fixture = async (name: string) => JSON.parse(await Deno.readTextFile(new URL(`fixtures/${name}.json`, DIR))) as LeadFactPayload
const set = JSON.parse(await Deno.readTextFile(new URL('set.json', DIR))) as {
  items: Array<{ id: string; fixture: string; sentences: LeadSentence[] }>
  controls: Array<{ id: string; fixture: string; sentences: LeadSentence[] }>
}
const NYX = await fixture('nyx-v2')
const NYX_TABLE = tableFromPayload(NYX)
const OLIVE_TABLE = tableFromPayload(await fixture('olive'))

/** The record rule set aside: the code half, then the model. The fourth run's second read. */
function sansRecordRule(v: CheckerVerdict, table: FactTable, draft: LeadSummary): 'pass' | 'repair' | 'reject' {
  return checkerCodeIssues(table, draft).length > 0 ? 'reject' : modelDecision(v)
}
/** rerun-3's second read, as its harness wrote it (order and own sign, no coverage): the read that
 *  passed rv-script-d. Kept only to show the new half is what rejects. */
function rerun3Read(v: CheckerVerdict, table: FactTable, draft: LeadSummary): 'pass' | 'repair' | 'reject' {
  const printed = { sentences: printedSentences(draft).map((text, i) => ({ text, cites: draft.sentences[i].cites })) }
  if (bandOrderIssues(table, printed).length > 0 || ownSignIssues(table, printed).length > 0) return 'reject'
  return modelDecision(v)
}

const NONE = Object.fromEntries(HAZARDS.map((h) => [h, 'none']))
const verdict = (takeaway: string): CheckerVerdict => ({ takeaway, levels: NONE as CheckerVerdict['levels'], quotes: {}, omissions: [] })

/** rv-script-d's verdict from the third run's checker (claude-sonnet-5-5): every hazard none, no omissions. */
const RV_SCRIPT_D_VERDICT = verdict('Nyx has a live vomiting burden flag (6 entries in 7 days, on 3 days in a row). The owner-entered diet trial was not fed exclusively and is not a test of the diet alone.')
/** The re-run's nyx-v2 lead, printed on runs 2, 3 and 4 (identical sentences each time). */
const RERUN_NYX_LEAD: LeadSentence[] = [
  { text: 'Burden is a live flag: 6 vomiting entries in the last 7 days, on 3 days in a row.', cites: ['band-3-symptom_burden-vomit'] },
  { text: 'Vomiting: 16 entries on 12 of 45 logged days, the last Oct 31.', cites: ['line-1'] },
  { text: 'The owner-entered diet trial, Royal Canin Selected Protein PR, Dry and 5 other trial foods, ran from Jul 26, 2026 to Oct 20, 2026; the trial diet was not fed exclusively, and it is not a test of the diet alone.', cites: ['trial', 'trial-reading-3', 'confounder'] },
]
const RERUN_VERDICTS: Record<string, CheckerVerdict> = {
  'run 2': verdict('Nyx has a live vomiting burden flag (6 entries in 7 days, 3 days in a row), 16 vomiting entries overall with the last on Oct 31, and a diet trial that was not fed exclusively and is not a clean test of the diet alone.'),
  'run 3': verdict('Nyx has a live vomiting burden flag (6 entries in 7 days, on 3 days in a row), with 16 vomiting entries on 12 of 45 logged days. The owner-entered diet trial was not fed exclusively and is not a test of the diet alone.'),
  'run 4': verdict('Nyx has a live vomiting burden flag (6 entries in 7 days, on 3 days in a row), 16 vomiting entries on 12 of 45 logged days, and a diet trial that was not fed exclusively and is not a test of the diet alone.'),
}

Deno.test('the exhibits are what the runs recorded: six live flags, and the model alone passes every lead', () => {
  assert.equal(NYX.band.length, 6)
  for (const v of [RV_SCRIPT_D_VERDICT, ...Object.values(RERUN_VERDICTS)]) {
    assert.ok(parseChecker({ takeaway: v.takeaway, hazards: Object.fromEntries(HAZARDS.map((h) => [h, { level: 'none' }])), omissions: [] }))
    assert.equal(modelDecision(v), 'pass')
  }
})

Deno.test('CUL-2629: rv-script-d, 1 of 6 flags, is rejected with the record rule set aside', () => {
  const it = set.items.find((i) => i.id === 'rv-script-d')!
  assert.equal(it.fixture, 'nyx-v2')
  const draft = { sentences: it.sentences }
  // Before: rerun-3's read passed it (the third run's stop (2)).
  assert.equal(rerun3Read(RV_SCRIPT_D_VERDICT, NYX_TABLE, draft), 'pass')
  // Now: the code half rejects it on coverage, five flags left out, and only on coverage.
  assert.equal(sansRecordRule(RV_SCRIPT_D_VERDICT, NYX_TABLE, draft), 'reject')
  const issues = checkerCodeIssues(NYX_TABLE, draft)
  // Five flags left out, by coverage; and the verifier's sentence rules (ruling (a)) on its own words.
  assert.equal(issues.filter((e) => e.check === 'band-coverage').length, 5)
  assert.deepEqual(bandCoverageIssues(NYX_TABLE, draft).length, 5)
  assert.ok(issues.some((e) => e.check === 'script') && issues.some((e) => e.check === 'vocabulary'))
  // And the full decision still rejects it on the record rule first.
  assert.equal(checkerDecision(RV_SCRIPT_D_VERDICT, { table: NYX_TABLE, draft }), 'reject')
})

Deno.test('CUL-2629: the re-run nyx-v2 lead (runs 2 to 4) is rejected with the record rule set aside', () => {
  const draft = { sentences: RERUN_NYX_LEAD }
  // Before: the old read printed it when burden led the band. CUL-2627 (#1468) put present foreign
  // material first and regenerated nyx-v2, so the old read now rejects this lead too, but only on
  // band order (sentence 1 opens on burden), never on coverage. Pinned exactly, so a lead that opened
  // on foreign material and named nothing else would again pass the old read and only coverage would
  // catch it, which is what the five band-coverage issues below prove the code half does.
  const printed = { sentences: printedSentences(draft).map((text, i) => ({ text, cites: draft.sentences[i].cites })) }
  assert.deepEqual(bandOrderIssues(NYX_TABLE, printed).map((e) => e.check), ['band-first'])
  assert.ok(bandOrderIssues(NYX_TABLE, printed)[0].detail.includes(NYX.band[0].id))
  assert.deepEqual(ownSignIssues(NYX_TABLE, printed), [])
  assert.equal(checkerCodeIssues(NYX_TABLE, draft).filter((e) => e.check === 'band-coverage').length, 5)
  for (const [run, v] of Object.entries(RERUN_VERDICTS)) {
    assert.equal(rerun3Read(v, NYX_TABLE, draft), 'reject', `${run}: the old read now rejects it, on band order alone`)
    assert.equal(sansRecordRule(v, NYX_TABLE, draft), 'reject', run)
    assert.equal(checkerDecision(v, { table: NYX_TABLE, draft }), 'reject', run)
  }
  const left = bandCoverageIssues(NYX_TABLE, draft).map((e) => e.detail.split(' ')[3])
  assert.deepEqual(left.sort(), ['band-1-present_foreign', 'band-2-trial_diet_refusal', 'band-4-weight_loss', 'band-5-chronicity-vomit', 'band-6-chronicity-cough'])
})

Deno.test('CUL-2629: on every set item and control with the record rule set aside, a lead that names fewer flags than the band holds is rejected', () => {
  const clean = verdict('x')
  const tables: Record<string, FactTable> = {}
  for (const it of [...set.items, ...set.controls]) {
    const payload = tables[it.fixture] ??= tableFromPayload(JSON.parse(Deno.readTextFileSync(new URL(`fixtures/${it.fixture}.json`, DIR))))
    const band = payload.facts.filter((f) => f.role === 'band')
    const cited = new Set(it.sentences.flatMap((s) => s.cites).filter((c) => band.some((b) => b.id === c)))
    if (cited.size < band.length) {
      assert.equal(sansRecordRule(clean, payload, { sentences: it.sentences }), 'reject', it.id)
      assert.ok(bandCoverageIssues(payload, { sentences: it.sentences }).length > 0, it.id)
    }
    if (band.length === 0) assert.deepEqual(bandCoverageIssues(payload, { sentences: it.sentences }), [], `${it.id}: nothing to cover`)
  }
})

/** One sentence naming all six nyx-v2 flags, each with its label and one of its own numbers. */
const ALL_SIX = 'Burden is 6 entries in 7 days, weight 3.73 kg, foreign material on Sep 22, diet not eaten on 2 of 4, chronicity 44 days for vomiting, chronicity 34 days for coughing.'

Deno.test('the rule reads the printed words: cited, named as often as the flags carrying the label, each with its own number', () => {
  const ids = NYX.band.map((b) => b.id)
  const all = (text: string, cites = ids) => bandCoverageIssues(NYX_TABLE, { sentences: [{ text, cites }] })
  const about = (issues: Array<{ detail: string }>, id: string) => issues.some((e) => e.detail.includes(id))
  // The control: every flag cited, named and given its own number. "Diet not eaten" is a label, not a denial.
  assert.deepEqual(all(ALL_SIX), [])
  assert.deepEqual(all(ALL_SIX.toUpperCase()), [], 'case is read as it prints')
  // Chronicity once for two chronicity rows.
  assert.ok(about(all(ALL_SIX.replace('chronicity 34 days for coughing', '34 days for coughing')), 'chronicity'))
  // Cited without the word: the cite is the model's claim, not what the vet reads.
  assert.ok(about(all(ALL_SIX.replace('weight 3.73 kg', '3.73 kg')), 'band-4-weight_loss'))
  // A label inside another word does not count ("weighty"); nor one split by a zero-width space.
  assert.ok(about(all(ALL_SIX.replace('weight 3.73', 'weighty 3.73')), 'band-4-weight_loss'))
  assert.ok(about(all(ALL_SIX.replace('weight 3.73', 'wei\u200bght 3.73')), 'band-4-weight_loss'))
  // Named but not cited.
  assert.ok(all(ALL_SIX, ids.slice(0, 5)).some((e) => e.detail.includes('is not cited')))
  // An unlabelled band item is unreadable.
  const unlabelled = tableFromPayload({ ...NYX, band: [{ ...NYX.band[0], label: '' }] })
  assert.equal(bandCoverageIssues(unlabelled, { sentences: [{ text: 'Burden is a live flag: 6 entries in 7 days.', cites: [NYX.band[0].id] }] }).length, 1)
})

Deno.test('adversarial pass 1 on the PR: a flag negated, asked, merged under a shared label, reassured, or listed bare is rejected', () => {
  const ids = NYX.band.map((b) => b.id)
  const run = (sentences: LeadSentence[]) => checkerCodeIssues(NYX_TABLE, { sentences })
  const burden: LeadSentence = { text: 'Burden is a live flag: 6 vomiting entries in the last 7 days, on 3 days in a row.', cites: [ids[0]] }
  const shapes: Record<string, LeadSentence[]> = {
    negated: [{ text: 'Burden is a live flag: 6 vomiting entries in the last 7 days, on 3 days in a row; weight, foreign material, diet not eaten, chronicity and chronicity are not live flags.', cites: ids }],
    // The same, each flag given its number, so only the negation is left to catch.
    'negated, numbers kept': [{ text: `${ALL_SIX.slice(0, -1)}; none of these are live flags.`, cites: ids }],
    'negated before a label': [{ text: ALL_SIX.replace('foreign material on Sep 22', 'no foreign material on Sep 22'), cites: ids }],
    questioned: [burden, { text: 'Weight, foreign material, diet not eaten, chronicity, chronicity: none of these?', cites: ids.slice(1) }],
    'questioned, numbers kept': [{ text: `${ALL_SIX.slice(0, -1)}?`, cites: ids }],
    'shared label, one sign': [burden, { text: 'Chronicity: vomiting spans 44 days, chronicity a floor.', cites: ['band-5-chronicity-vomit', 'band-6-chronicity-cough'] }],
    'common-word label, reassured': [burden, { text: 'Weight is stable, no foreign material, the diet not eaten is a preference, chronicity, chronicity unclear.', cites: ids.slice(1) }],
    'labels only': [{ text: 'Burden, weight, foreign material, diet not eaten, chronicity, chronicity.', cites: ids }],
  }
  for (const [name, sentences] of Object.entries(shapes)) {
    const issues = run(sentences)
    assert.ok(issues.some((e) => e.check === 'band-coverage'), `${name}: ${JSON.stringify(issues)}`)
    assert.equal(sansRecordRule(verdict('x'), NYX_TABLE, { sentences }), 'reject', name)
  }
  // Which part catches which (each shape below is caught by that part alone).
  const details = (k: string) => run(shapes[k]).map((e) => e.detail).join(' | ')
  assert.match(details('negated, numbers kept'), /negates beside a live flag: "none of these"/)
  assert.match(details('negated before a label'), /"no § /)
  assert.match(details('questioned, numbers kept'), /asks about a live flag/)
  assert.match(details('shared label, one sign'), /band-6-chronicity-cough \(chronicity\): none of its own numbers/)
  // What coverage alone does not claim, an affirmative softening that keeps label, number and no
  // negation, is refused by the verifier's sentence rules inside the code half (ruling (a)).
  const softened = [{ text: ALL_SIX.replace('weight 3.73 kg', 'weight steady at 3.73 kg'), cites: ids }]
  assert.deepEqual(bandCoverageIssues(NYX_TABLE, { sentences: softened }), [])
  assert.equal(sansRecordRule(verdict('x'), NYX_TABLE, { sentences: softened }), 'reject')
})

Deno.test('CUL-2629 ruling (a): adversarial pass 2 on the PR, every shape coverage alone passed, is rejected by the code half', () => {
  const ids = NYX.band.map((b) => b.id)
  const fx = (name: string) => tableFromPayload(JSON.parse(Deno.readTextFileSync(new URL(`fixtures/${name}.json`, DIR))))
  const R11 = fx('r11')
  const COOPER = fx('cooper')
  const r11Band = R11.facts.filter((f) => f.role === 'band').map((f) => f.id)
  const cooperBand = COOPER.facts.filter((f) => f.role === 'band').map((f) => f.id)
  const shapes: Array<[string, FactTable, LeadSentence[]]> = [
    ['denial in a sentence citing no flag', NYX_TABLE, [{ text: ALL_SIX, cites: ids }, { text: 'None of these are live flags.', cites: ['line-1'] }]],
    ['question in a sentence citing no flag', NYX_TABLE, [{ text: ALL_SIX, cites: ids }, { text: 'Are any of these real flags?', cites: ['line-1'] }]],
    ['bare "not," before punctuation', NYX_TABLE, [{ text: `${ALL_SIX.slice(0, -1)}: not, on this record, live flags.`, cites: ids }]],
    ['negation borrowed from another line', NYX_TABLE, [{ text: ALL_SIX.replace('foreign material on Sep 22', 'not a single foreign material on Sep 22'), cites: ids }]],
    ['"absent"', NYX_TABLE, [{ text: `${ALL_SIX.slice(0, -1)}, all absent.`, cites: ids }]],
    ['"ruled out"', NYX_TABLE, [{ text: `${ALL_SIX.slice(0, -1)}, all ruled out.`, cites: ids }]],
    ['"nothing"', NYX_TABLE, [{ text: `${ALL_SIX.slice(0, -1)}, nothing urgent.`, cites: ids }]],
    ['zero-width "not"', NYX_TABLE, [{ text: `${ALL_SIX.slice(0, -1)}, n\u200bot live.`, cites: ids }]],
    ['shrunk count', NYX_TABLE, [{ text: ALL_SIX.replace('6 entries in 7 days', '1 entry in 7 days'), cites: ids }]],
    ['merged chronicity, borrowed number', NYX_TABLE, [{ text: 'Burden is 6 entries in 7 days, weight 3.73 kg, foreign material on Sep 22, diet not eaten on 2 of 4, chronicity and chronicity of vomiting, 44 days, sneezing 10 days ago.', cites: ids }]],
    ['r11: nothing here is a concern', R11, [{ text: 'Nothing here is a concern.', cites: r11Band }]],
    ['cooper: not, at 50 h, a concern', COOPER, [{ text: 'Intake below baseline for 2 consecutive days: not, at 50 h, a concern.', cites: cooperBand }]],
  ]
  for (const [name, table, sentences] of shapes) {
    assert.ok(checkerCodeIssues(table, { sentences }).length > 0, name)
    assert.equal(sansRecordRule(verdict('x'), table, { sentences }), 'reject', name)
  }
})

Deno.test('a band-empty record is unchanged: the code half has nothing to cover, and the checker decides as before', () => {
  const lead = { sentences: [{ text: 'Meals: 42 logged, 3 not fully eaten.', cites: ['intake'] }] }
  assert.deepEqual(checkerCodeIssues(OLIVE_TABLE, lead), [])
  assert.equal(checkerDecision(verdict('x'), { table: OLIVE_TABLE, draft: lead }), 'pass')
})

Deno.test('checkerDecision reads the code half through checkerCodeIssues, the function the bake-off calls', async () => {
  const src = await Deno.readTextFile(new URL('./leadPipeline.ts', import.meta.url))
  const body = src.slice(src.indexOf('export function checkerDecision'), src.indexOf('/** Withdrawal at send'))
  assert.match(body, /if \(liveFlagIssues\(ctx\.table\)\.length > 0\) return 'reject'\n\s+if \(checkerCodeIssues\(ctx\.table, ctx\.draft\)\.length > 0\) return 'reject'\n\s+return modelDecision\(v\)/)
  const half = src.slice(src.indexOf('export function checkerCodeIssues'), src.indexOf('/** The checker\'s decision (step 7)'))
  for (const f of ['bandOrderIssues', 'ownSignIssues', 'bandCoverageIssues']) assert.ok(half.includes(`...${f}(table, printed)`), f)
})
