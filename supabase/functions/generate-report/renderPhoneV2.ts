// Vet report v2: the phone reflow (CUL-2295, row VR2-15; v2 spec §3.3, §6.2, §6.3).
//
// `renderPhoneV2(doc)` lays the same `DocumentV2` the print renderer reads out at the phone's
// column width. It is laid out, never scaled (BRK-2): it decides nothing the model has not
// decided, emits every block in the model's order with `data-block="<id>"` (the parity test,
// spec §3.4), and prints no band, flag or opener the PDF does not (BRK-1).
//
// TYPE THAT FOLLOWS THE OWNER (spec §6.3). Every screen size is a rem. The root takes
// `font: -apple-system-body`, so on iOS the whole page grows with Dynamic Type; Android's
// WebView passes `textZoom` from the font scale (the app's side, VR2-17). A browser that does not
// know `-apple-system-body` drops the declaration and keeps the 17px fallback written before it.
// Every `@media print` size is an absolute pt, so no phone setting can reach a printed page.
//
// LABELS IN HTML, MARKS IN SVG (spec §6.2). Row labels, the axis dates and the part-column notes
// are HTML that wraps and grows with the text; each row's SVG holds only marks and counts. Its
// viewBox is `PLOT_W` wide and draws at 100% of the column, and the column is never narrower
// than `PLOT_W` at 320pt (a flagged chart's frame included), so a count is never under 11pt.
//
// THE KEEP-TOGETHER RULE (PM ruling (a) on CUL-2320, and option 1 on CUL-2295, 2026-11-01). The
// lead chart's heading, its bars and its confounder line are one unit (`data-keep="lead"`), which
// never straddles a frame boundary: when it would, a spacer starts it in the next frame. When the
// unit is taller than a frame (a long confounder at 320pt, any record at AX5), the line's lead
// sentence (the model's `lead`: its warning) also prints between the heading and the bars
// (`data-part`, never a block, so parity holds) and stays pinned to the top of the frame while the
// bars scroll under it; the page's scroll padding equals its height, so a screen-step scroll
// never lands content under it. The repeat always shows, even when the unit fits a frame: a free
// scroll can rest anywhere, and only the pinned sentence is beside the bars at every position
// (adversarial pass on CUL-2295; the PM rules whether it may hide).
// Frames are known only on the device (its height and text size), so the script measures there.
import { h, notReadCol, type BlockV2, type ChartColumn, type ChartRow, type DocumentV2, type LeadChart } from './documentV2.ts'
import { COUNT_AXIS_MIN_MAX } from './renderPrintV2.ts'
import { fmtDay } from './render.ts'

/** The plot's viewBox width. A 320pt screen less its gutters and a flagged chart's frame leaves
 *  265pt, so the SVG never draws below 1:1 and an 11-unit count is never under 11pt. */
export const PLOT_W = 240
/** The smallest size any SVG text is drawn at, in viewBox units (spec §6.2: 11pt or larger). */
export const SVG_TEXT_MIN = 11
/** The font scale at which the reflow compacts (spec §6.3). */
export const COMPACT_SCALE = 1.6
/** The root size `-apple-system-body` resolves to at the default text size. */
export const BODY_PX = 17
/** The pinned repeat stops growing at 1.25×, so it never takes more than 40% of even a short
 *  320pt screen and the bars always show under it (adversarial pass 2 on CUL-2295; the guard's
 *  PIN_MAX_SHARE). It repeats words that print at full size in their own place below. */
export const VERDICT_MAX_SCALE = 1.25
export const VERDICT_MAX_PX = Math.round(BODY_PX * VERDICT_MAX_SCALE)

const SIGN_ROW_H = 34
const BAR_H = 22
const SPAN_ROW_H = 14

function x0(i: number, n: number): number {
  return (i * PLOT_W) / n
}

function colW(n: number): number {
  return PLOT_W / n
}

/** One row's SVG. Each carries its own hatch pattern: an id is page-unique, rows are many. */
function rowSvg(id: string, height: number, body: string, hatched: boolean): string {
  const defs = hatched
    ? `<defs><pattern id="${id}" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" class="hatchline"/></pattern></defs>`
    : ''
  return `<svg class="marks" aria-hidden="true" focusable="false" viewBox="0 0 ${PLOT_W} ${height}" preserveAspectRatio="xMinYMin meet">${defs}${body}</svg>`
}

function hatchCol(pid: string, i: number, n: number, y: number, hgt: number): string {
  return `<rect class="hatch" x="${x0(i, n).toFixed(1)}" y="${y}" width="${colW(n).toFixed(1)}" height="${hgt}" fill="url(#${pid})"/>`
}

function haloText(x: number, y: number, text: string, cls = 'cnt'): string {
  return `<text class="${cls} halo" x="${x.toFixed(1)}" y="${y}" text-anchor="middle">${h(text)}</text>`
}

function rowWrap(label: string, labelCls: string, svg: string, sub: string | null = null): string {
  return `<div class="crow"><div class="${labelCls}">${h(label)}</div>${sub ? `<div class="rl sub">${h(sub)}</div>` : ''}${svg}</div>`
}

function signRow(r: Extract<ChartRow, { kind: 'sign' }>, cols: ChartColumn[], axisMax: number, unit: LeadChart['unit'], pid: string): string {
  const n = cols.length
  const top = SVG_TEXT_MIN + 2 // room for the tallest bar's count above it
  const base = top + BAR_H
  const parts: string[] = [`<line class="base" x1="0" x2="${PLOT_W}" y1="${base}" y2="${base}"/>`]
  let hatched = false
  cols.forEach((c, i) => {
    if (c.loggedDays === 0) {
      hatched = true
      parts.push(hatchCol(pid, i, n, top, BAR_H))
      return
    }
    const count = r.counts[i]
    if (count <= 0) {
      // Under the floor, v1's "–" ("not read"), never a 0; a read empty cell draws nothing.
      if (notReadCol(c, unit)) parts.push(haloText(x0(i, n) + colW(n) / 2, base - 3, '–', 'cnt nr'))
      return
    }
    const bh = Math.max(2, (count / axisMax) * BAR_H)
    // A part column draws at its days' share of the width (spec §5.4), as on paper.
    const full = unit === 'day' ? 1 : unit === 'week' ? 7 : 14
    const w = Math.max(2, colW(n) * 0.62 * Math.min(1, c.days / full))
    const x = x0(i, n) + colW(n) * 0.19
    parts.push(`<rect class="${r.lead ? 'bar lead' : 'bar'}" x="${x.toFixed(1)}" y="${(base - bh).toFixed(1)}" width="${w.toFixed(1)}" height="${bh.toFixed(1)}"/>`)
    parts.push(haloText(x + w / 2, base - bh - 2, String(count)))
  })
  return rowWrap(r.label, r.lead ? 'rl lead' : 'rl', rowSvg(pid, base + 2, parts.join(''), hatched))
}

function intakeRow(r: Extract<ChartRow, { kind: 'intake' }>, cols: ChartColumn[], pid: string): string {
  const n = cols.length
  const top = SVG_TEXT_MIN + 2
  const base = top + BAR_H
  const parts: string[] = [`<line class="base" x1="0" x2="${PLOT_W}" y1="${base}" y2="${base}"/>`]
  let hatched = false
  cols.forEach((c, i) => {
    const cell = r.cells[i]
    if (c.loggedDays === 0) {
      hatched = true
      parts.push(hatchCol(pid, i, n, top, BAR_H))
      return
    }
    if (!cell || cell.rated === 0 || cell.notFinished === 0) return
    const w = Math.max(2, colW(n) * 0.62)
    const x = x0(i, n) + (colW(n) - w) / 2
    const refusedH = (cell.refused / cell.rated) * BAR_H
    const partlyH = ((cell.notFinished - cell.refused) / cell.rated) * BAR_H
    if (refusedH > 0) parts.push(`<rect class="bar lead" x="${x.toFixed(1)}" y="${(base - refusedH).toFixed(1)}" width="${w.toFixed(1)}" height="${refusedH.toFixed(1)}"/>`)
    if (partlyH > 0) parts.push(`<rect class="bar partly" x="${x.toFixed(1)}" y="${(base - refusedH - partlyH).toFixed(1)}" width="${w.toFixed(1)}" height="${partlyH.toFixed(1)}"/>`)
    parts.push(haloText(x + w / 2, base - refusedH - partlyH - 2, `${cell.notFinished} of ${cell.rated}`))
  })
  return rowWrap(r.label, 'rl lead', rowSvg(pid, base + 2, parts.join(''), hatched), '0 to 100% of rated')
}

function coverageRow(r: Extract<ChartRow, { kind: 'coverage' }>, cols: ChartColumn[], pid: string): string {
  const n = cols.length
  // Logging is not a concern: the coverage row draws in ink-2, never the concern ink.
  const parts: string[] = []
  let hatched = false
  cols.forEach((c, i) => {
    if (c.loggedDays === 0) {
      hatched = true
      parts.push(hatchCol(pid, i, n, 2, SIGN_ROW_H - 12))
      return
    }
    const w = Math.max(1.5, colW(n) - 1.5)
    parts.push(`<rect class="cov" x="${(x0(i, n) + 0.75).toFixed(1)}" y="2" width="${w.toFixed(1)}" height="${SIGN_ROW_H - 12}"/>`)
  })
  return rowWrap(r.label, 'rl', rowSvg(pid, SIGN_ROW_H - 8, parts.join(''), hatched))
}

function spanRow(r: Extract<ChartRow, { kind: 'span' }>, cols: ChartColumn[], pid: string): string {
  const n = cols.length
  const y = SPAN_ROW_H / 2
  const xa = r.openStart ? 0 : x0(r.fromCol, n) + colW(n) / 2
  const xb = r.openEnd ? PLOT_W : x0(r.toCol, n) + colW(n) / 2
  const cls = r.hollow ? 'span hollow' : 'span'
  const parts = [`<line class="${cls}" x1="${xa.toFixed(1)}" x2="${Math.max(xa + 2, xb).toFixed(1)}" y1="${y}" y2="${y}"/>`]
  // The bracket ends: a tick where the record dates a start or an end, none where it runs off the edge.
  if (!r.openStart) parts.push(`<line class="${cls}" x1="${xa.toFixed(1)}" x2="${xa.toFixed(1)}" y1="${y - 4}" y2="${y + 4}"/>`)
  if (!r.openEnd && r.endDeclared) parts.push(`<line class="${cls}" x1="${xb.toFixed(1)}" x2="${xb.toFixed(1)}" y1="${y - 4}" y2="${y + 4}"/>`)
  return rowWrap(r.label, 'rl span-l', rowSvg(pid, SPAN_ROW_H, parts.join(''), false))
}

/** The axis as HTML: the first and last column's dates, then each part column named by its date. */
function axisHtml(chart: LeadChart): string {
  const cols = chart.columns
  const n = cols.length
  const ends = n > 1
    ? `<span>${fmtDay(cols[0].start)}</span><span>${fmtDay(cols[n - 1].start)}</span>`
    : `<span>${fmtDay(cols[0]?.start ?? null)}</span>`
  const notes: string[] = []
  cols.forEach((c, i) => {
    if (chart.unit === 'day') return
    const full = chart.unit === 'week' ? 7 : 14
    let label: string | null = null
    if (c.days < full) label = `${c.days}-day ${chart.unit === 'week' ? 'week' : 'bin'}${i === n - 1 ? ', so far' : ''}`
    else if (c.loggedDays > 0 && c.loggedDays < c.days) label = `logged ${c.loggedDays} of ${c.days}`
    if (label) notes.push(`<li>${fmtDay(c.start)}: ${h(label)}</li>`)
  })
  return `<div class="axis">${ends}</div>${notes.length > 0 ? `<ul class="parts" role="list">${notes.join('')}</ul>` : ''}`
}

/** The lead chart's rows: HTML labels over SVG marks, one count scale across every sign row. */
export function chartHtml(chart: LeadChart): string {
  const counts = chart.rows.flatMap((r) => (r.kind === 'sign' ? r.counts : []))
  const axisMax = Math.max(COUNT_AXIS_MIN_MAX, ...counts)
  const signish = chart.rows.filter((r) => r.kind !== 'span')
  const spans = chart.rows.filter((r): r is Extract<ChartRow, { kind: 'span' }> => r.kind === 'span')
  const rows: string[] = []
  ;[...signish, ...spans].forEach((r, i) => {
    const pid = `v2h${i}`
    if (r.kind === 'sign') rows.push(signRow(r, chart.columns, axisMax, chart.unit, pid))
    else if (r.kind === 'intake') rows.push(intakeRow(r, chart.columns, pid))
    else if (r.kind === 'coverage') rows.push(coverageRow(r, chart.columns, pid))
    else rows.push(spanRow(r, chart.columns, pid))
  })
  // `aria-hidden` over the whole drawing, labels included: the twin is the only carrier of the
  // chart's facts (spec §5.4), so a screen reader hears it once, in words.
  return `<div class="chart" aria-hidden="true">${rows.join('')}${axisHtml(chart)}</div>`
}

function block(b: BlockV2, lead: string | null): string {
  const open = (tag: string, cls: string) => `<${tag} class="${cls}" data-block="${b.id}">`
  switch (b.kind) {
    case 'masthead':
      // At font scale 1.6 the full signalment, the conditions and the window fold behind one line
      // (spec §6.3), so the band still starts in the first frame. What decides urgency never folds:
      // species, sex, age and weight (the model's brief; cold read on CUL-2295), and the last entry.
      return `${open('header', 'mast')}<div class="eyebrow">${h(b.eyebrow)}</div><h1>${h(b.name)}</h1><p class="brief">${h(b.signalmentBrief)}</p><button class="more" type="button" aria-expanded="false" aria-controls="v2more">More details</button><div class="fold" id="v2more"><p class="sig">${h(b.signalment)}</p>${
        b.conditions ? `<p class="cond">${h(b.conditions)}</p>` : ''
      }<p class="win">${h(b.window)}</p></div><p class="last">${b.lastEntryHtml}.</p></header>`
    case 'disclosure':
      return `${open('div', 'disc')}${b.html}</div>`
    case 'band':
      return `${open('section', 'band')}<h2>${h(b.heading)}</h2><ul role="list">${b.items
        .map((i) => `<li data-item="${h(i.id)}"><b>Flag: ${h(i.tag.toLowerCase())}.</b> ${i.html}</li>`)
        .join('')}</ul>${b.checksHtml ? `<p class="checks">${b.checksHtml}</p>` : ''}</section>`
    case 'checks':
      return `${open('p', 'checks unframed')}${b.html}</p>`
    case 'scope_line':
      return `${open('p', 'scope')}${h(b.text)}</p>`
    case 'changes':
      return `${open('section', `changes ${b.placement === 'band_slot' ? 'slot' : 'under'}`)}<h2 class="sech">${h(b.heading)}</h2><ul role="list">${b.lines
        .map((l) => `<li data-item="${h(l.id)}">${h(l.text)}.</li>`)
        .join('')}</ul></section>`
    case 'record_edge':
      return `${open('div', 'edge')}${b.lines.map((l) => `<p>${h(l)}</p>`).join('')}</div>`
    case 'lead_sentence':
      return `${open('p', 'lede serif')}${h(b.text)}</p>`
    case 'lead_chart': {
      const c = b.chart
      // The repeat is `aria-hidden`: it exists for the eye that sees bars, and a screen reader
      // reaches the full confounder in its own place, in the PDF's order.
      const rep = lead ? `<p class="verdict" data-part="confounder-verdict" aria-hidden="true">${h(lead)}</p>` : ''
      return `${open('section', c.flagHtml ? 'leadchart flagged' : 'leadchart')}<h2 class="${c.flagHtml ? 'flagh' : 'charth'}">${h(c.heading)}</h2>${
        c.flagHtml ? `<p class="flagrow">${c.flagHtml}</p>` : ''
      }${c.reasonLine ? `<p class="why">${h(c.reasonLine)}</p>` : ''}${rep}${chartHtml(c)}<p class="twin">${h(c.twin)}</p></section>`
    }
    case 'confounder':
      return `${open('p', 'conf')}${h(b.text)}</p>`
    case 'record_lines':
      // Line numbers are real text (spec §6.3, GAP-40): a copied or spoken line keeps its number.
      return `${open('ol', 'lines" role="list')}${b.lines.map((l, i) => `<li data-item="${h(l.id)}"><span class="ln">${i + 1}.</span> ${h(l.text)}</li>`).join('')}</ol>`
    case 'gap_lines':
      return `${open('section', 'gaps')}<h2 class="sech">${h(b.heading)}</h2><ul role="list">${b.lines
        .map((g) => `<li data-item="${h(g.id)}">${h(g.text)}.</li>`)
        .join('')}</ul></section>`
    case 'questions':
      return `${open('section', 'qs')}<h2 class="sech">${h(b.heading)}</h2><ol role="list">${b.items
        .map((q) => `<li><span class="ln">${q.n}.</span> <span class="q">${h(q.text)}</span> <span class="ptr">${h(q.pointer)}</span></li>`)
        .join('')}</ol></section>`
    case 'colophon':
      return `${open('footer', 'colo')}${h(b.text)}</footer>`
  }
}

/** The blocks, with the lead chart, the lines under it and the confounder wrapped as one unit. */
function body(doc: DocumentV2): string {
  const conf = doc.blocks.find((b): b is Extract<BlockV2, { kind: 'confounder' }> => b.kind === 'confounder')
  // The model chooses which sentence leads the line as a warning; the phone never re-cuts it.
  const warning = conf ? conf.lead : null
  const out: string[] = []
  const lead = doc.blocks.findIndex((b) => b.kind === 'lead_chart')
  const confAt = doc.blocks.findIndex((b) => b.kind === 'confounder')
  const last = confAt > lead ? confAt : lead
  doc.blocks.forEach((b, i) => {
    if (i === lead) out.push(`<div class="keep-push" aria-hidden="true"></div><div class="keep" data-keep="lead">`)
    out.push(block(b, warning))
    if (i === last && lead >= 0) out.push('</div>')
  })
  return out.join('\n')
}

// Screen sizes are rem; print sizes are pt and never rem, em, px or %.
const STYLE_PHONE = `
:root{--ink:#16181d;--ink2:#565961;--faint:#8a8d94;--hair:#d8d9dd;--paper:#ffffff;--concern:#9F1239;--partly:#d9a3b0;--cov:#c2c4c9;}
html{font-size:${BODY_PX}px;font:-apple-system-body;-webkit-text-size-adjust:100%;text-size-adjust:100%;}
*{box-sizing:border-box;}
html,body{margin:0;padding:0;background:var(--paper);color:var(--ink);}
/* The PDF text layer (CUL-2386, measured 2026-11-02): Inter's contextual alternates beside a digit carry no
   ToUnicode entry, so ":" "(" "×" "–" next to a number dropped from the extracted text; the UA's tabular list
   markers did the same to a line's number. Both off; the guard is guards/reportNoTnum.test.ts. */
*{font-feature-settings:"calt" 0,"case" 0;}
::marker{font-variant-numeric:normal;}
body{font-family:"Geist",ui-sans-serif,-apple-system,system-ui,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:1rem;line-height:1.4;overflow-wrap:anywhere;}
.sheet{padding:1rem 16px 2rem;max-width:40rem;margin:0 auto;}
#v2probe{position:absolute;left:-999rem;top:0;display:block;font-size:1rem;line-height:1;visibility:hidden;}
.serif{font-family:"Newsreader",Georgia,"Iowan Old Style",serif;}
.mast .eyebrow{font-size:0.75rem;letter-spacing:.06em;text-transform:uppercase;color:var(--ink2);}
.mast h1{font-size:1.6rem;line-height:1.15;margin:0.15rem 0 0.3rem;font-weight:650;}
.mast p{margin:0 0 0.2rem;}
.mast .fold .win{color:var(--ink2);}
.mast .brief{display:none;}
.mast .last{font-weight:600;margin-top:0.35rem;}
.disc{margin:0.6rem 0;color:var(--ink2);font-size:0.875rem;}
section{margin:1rem 0 0;}
h2{font-size:1rem;line-height:1.3;margin:0 0 0.4rem;font-weight:650;}
ul,ol{margin:0;padding:0;list-style:none;}
.band{border:1.5px solid var(--ink);padding:0.6rem 0.7rem;}
.band h2{color:var(--concern);text-transform:uppercase;letter-spacing:.05em;}
.band li{margin:0 0 0.45rem;}
.band .checks,.checks.unframed{color:var(--ink2);font-size:0.875rem;margin:0.4rem 0 0;}
.scope{margin:1rem 0 0;font-weight:600;}
.changes h2,.sech{font-size:0.8125rem;text-transform:uppercase;letter-spacing:.08em;color:var(--ink2);}
.changes li,.gaps li{margin:0 0 0.3rem;}
.edge p{font-weight:600;margin:0.8rem 0 0;}
.lede{font-size:1.2rem;line-height:1.3;margin:1rem 0 0;}
.keep{margin:1rem 0 0;}
.keep > section:first-child{margin-top:0;}
.leadchart .flagh{color:var(--concern);}
.leadchart.flagged{border:1.5px solid var(--ink);padding:0.6rem 10px;}
.leadchart .why,.flagrow{color:var(--ink2);margin:0 0 0.4rem;}
.verdict{position:sticky;top:0;z-index:1;margin:0 0 0.4rem;padding:min(0.3rem, 5px) 0;background:var(--paper);font-weight:650;border-bottom:1px solid var(--hair);font-size:min(1rem, ${VERDICT_MAX_PX}px);}
.verdict[hidden]{display:none;}
.chart{margin:0.2rem 0 0;}
.crow{margin:0 0 0.35rem;}
.rl{font-size:0.8125rem;line-height:1.25;color:var(--ink2);}
.rl.lead{color:var(--concern);font-weight:650;}
.rl.sub{font-size:0.75rem;}
svg.marks{display:block;width:100%;height:auto;overflow:visible;}
.axis{display:flex;flex-wrap:wrap;justify-content:space-between;gap:0 1rem;font-size:0.8125rem;color:var(--ink2);margin:0.1rem 0 0;}
.parts{font-size:0.8125rem;color:var(--ink);margin:0.15rem 0 0;}
.twin{font-size:0.875rem;margin:0.4rem 0 0;}
.conf{margin:0.6rem 0 0;}
.lines{margin:0.8rem 0 0;}
.lines li,.qs li{margin:0 0 0.3rem;}
.ln{color:var(--ink2);}
.qs .ptr{color:var(--ink2);font-size:0.8125rem;}
.colo{margin-top:1.4rem;padding-top:0.5rem;border-top:1px solid var(--hair);font-size:0.75rem;color:var(--ink2);}
svg .base{stroke:var(--hair);stroke-width:.75;}
svg .bar{fill:var(--ink2);}
svg .bar.lead{fill:var(--concern);}
svg .bar.partly{fill:var(--partly);}
svg .cov{fill:var(--cov);}
svg .hatchline{stroke:var(--faint);stroke-width:1;}
svg .span{stroke:var(--ink2);stroke-width:1.5;}
svg .span.hollow{stroke-dasharray:3 2;stroke-width:1;fill:none;}
svg .cnt{font-size:${SVG_TEXT_MIN}px;fill:var(--ink);font-weight:600;}
svg .cnt.nr{fill:var(--ink2);font-weight:400;}
svg .halo{paint-order:stroke;stroke:var(--paper);stroke-width:2.5px;stroke-linejoin:round;}
.mast .more{display:none;}
@media screen{
[data-compact] .mast .more{display:block;min-height:44px;width:100%;margin:0.1rem 0;padding:0.15rem 0;border:0;border-top:1px solid var(--hair);border-bottom:1px solid var(--hair);background:none;color:var(--ink2);font:inherit;font-size:0.875rem;text-align:left;}
[data-compact] .mast .more::after{content:" ›" / "";}
[data-compact] .mast:not([data-open]) .fold{display:none;}
[data-compact] .mast .brief{display:block;}
[data-compact] .mast[data-open] .brief{display:none;}
[data-compact][data-tight] .mast .brief{display:none;}
[data-compact] .mast[data-open] .more::after{content:" ⌄" / "";}
[data-compact] .band li{margin-bottom:0.3rem;}
[data-compact] .sheet{padding-top:0.4rem;}
[data-compact] .mast .eyebrow{display:none;}
[data-compact] .mast h1{font-size:1.25rem;margin:0 0 0.1rem;}
[data-compact] .mast .last{margin-top:0.1rem;}
[data-compact] section{margin-top:0.5rem;}
[data-compact] .band{padding:0.35rem 0.5rem;}
[data-compact] .band h2{text-transform:none;letter-spacing:0;}
}
@media print{
html,body{font-size:9.5pt;}
.sheet{padding:0;max-width:none;}
.mast .eyebrow{font-size:7.5pt;}
.mast h1{font-size:20pt;}
.disc,.band .checks,.checks.unframed,.twin{font-size:8.5pt;}
h2{font-size:9pt;}
.changes h2,.sech,.colo{font-size:7.5pt;}
.lede{font-size:13pt;}
.rl,.axis,.parts,.qs .ptr{font-size:8pt;}
.rl.sub{font-size:7pt;}
.verdict{display:none;}
.keep-push{display:none;}
.keep,.leadchart{break-inside:avoid;}
}
`

// The layout script: compaction at font scale 1.6 and the keep-together rule. It measures a
// 1rem probe rather than reading `font-size`, because Android's `textZoom` scales the text it
// draws without changing the computed style.
const SCRIPT_PHONE = `
(function(){
  var root = document.documentElement;
  function scale(){ var p = document.getElementById('v2probe'); return p ? p.getBoundingClientRect().height / ${BODY_PX} : 1; }
  function lay(){
    if (scale() >= ${COMPACT_SCALE}) root.setAttribute('data-compact', ''); else root.removeAttribute('data-compact');
    // The band is the warning, so it outranks the brief for the first frame: the brief folds too
    // only where it would push the band's heading out of that frame (320pt at large text).
    root.removeAttribute('data-tight');
    var bandH = document.querySelector('[data-block=band] h2');
    var mast = document.querySelector('.mast');
    if (root.hasAttribute('data-compact') && bandH && mast && !mast.hasAttribute('data-open') && bandH.getBoundingClientRect().bottom + window.pageYOffset > window.innerHeight) {
      root.setAttribute('data-tight', '');
      // Fold the brief only where folding brings the band into the frame; otherwise it costs the
      // species for nothing (adversarial pass 2 on CUL-2295).
      if (bandH.getBoundingClientRect().bottom + window.pageYOffset > window.innerHeight) root.removeAttribute('data-tight');
    }
    var unit = document.querySelector('[data-keep="lead"]');
    var push = document.querySelector('.keep-push');
    if (!unit || !push) return;
    var rep = unit.querySelector('[data-part="confounder-verdict"]');
    push.style.height = '0px';
    root.style.scrollPaddingTop = '';
    // The repeat always shows. Hiding it when the unit fits a frame left 220 to 440pt of resting
    // scroll positions with the bars on screen and the confounder below it (adversarial pass on
    // CUL-2295): a free scroll has no frames, so only a sentence pinned beside the bars holds.
    if (rep) rep.hidden = false;
    // A page-step scroll (VoiceOver, a keyboard) lands below the pinned repeat, so nothing the
    // repeat covers is skipped between one screen and the next (cold read on CUL-2295).
    if (rep) root.style.scrollPaddingTop = rep.getBoundingClientRect().height + 'px';
    var frame = window.innerHeight;
    if (!frame) return;
    var fits = unit.getBoundingClientRect().height <= frame;
    if (!fits) return;
    var top = unit.getBoundingClientRect().top + window.pageYOffset;
    var k = Math.floor(top / frame);
    var end = top + unit.getBoundingClientRect().height;
    if (end > (k + 1) * frame) push.style.height = ((k + 1) * frame - top) + 'px';
  }
  var more = document.querySelector('.mast .more');
  if (more) more.addEventListener('click', function(){
    var mast = more.parentNode;
    var open = !mast.hasAttribute('data-open');
    if (open) mast.setAttribute('data-open', ''); else mast.removeAttribute('data-open');
    more.setAttribute('aria-expanded', open ? 'true' : 'false');
    lay();
  });
  window.__nyxV2Layout = lay;
  lay();
  window.addEventListener('resize', lay);
  window.addEventListener('load', lay);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(lay);
  // A text-size change with no reload fires no resize: watch what it moves.
  if (window.ResizeObserver) {
    var queued = false;
    var ro = new ResizeObserver(function(){ if (queued) return; queued = true; requestAnimationFrame(function(){ queued = false; lay(); }); });
    var probe = document.getElementById('v2probe');
    if (probe) ro.observe(probe);
    var u = document.querySelector('[data-keep="lead"]');
    if (u) ro.observe(u);
  }
})();
`

/** The whole v2 document laid out for the phone: sheet 1 only until the back sheets ship. */
export function renderPhoneV2(doc: DocumentV2): string {
  const name = doc.blocks.find((b) => b.kind === 'masthead')
  const title = name && name.kind === 'masthead' ? `${name.name}: owner's home log` : "Owner's home log"
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="report-version" content="v2" />
<meta name="report-layout" content="phone" />
<title>${h(title)}</title>
<style>${STYLE_PHONE}</style>
</head>
<body>
<span id="v2probe" aria-hidden="true">M</span>
<main class="sheet" data-sheet="1">
${body(doc)}
</main>
<script>${SCRIPT_PHONE}</script>
</body>
</html>`
}

export { STYLE_PHONE }
