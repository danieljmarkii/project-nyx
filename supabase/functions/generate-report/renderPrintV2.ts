// Vet report v2 sheet 1: the print renderer (CUL-2290, row VR2-10; v2 spec §3.3, §5, §7).
//
// `renderPrintV2(doc)` lays a `DocumentV2` out for A4 and Letter in absolute points. It decides
// nothing: what prints, in what order, with what words, is the document model's. It emits every
// block in the model's order with `data-block="<id>"`, so the parity test (spec §3.4) can read the
// ids off the HTML, and the phone reflow (VR2-15) will be held to the same list.
//
// THE MARK LEXICON (spec §5.4, chart standard §4.3's row):
//   - hatch means nothing logged, and nothing else (`hatchCol` is the only place it is drawn);
//   - one count scale across every stacked sign row, with a stated floor so one entry never
//     draws at full height; the word "scale" never appears on the axis;
//   - an empty cell is drawn as nothing at all, never a `0` (these signs are logged only when
//     they happen);
//   - intake is part of whole: the share not finished of those rated, refused and partly eaten
//     as two fills, labelled "n of N";
//   - a course is a solid bracketed line in ink-2; prescribed with no dose logged, hollow dashed;
//   - the SVG is `aria-hidden` and carries no label: the text twin under it is the only carrier
//     of the chart's facts;
//   - every label over a mark wears the paper halo (`paint-order: stroke`).
//
// Fonts and the QR are VR2-11 (CUL-2291); this file names the families and draws no QR.
import { h, notReadCol, type BlockV2, type ChartColumn, type ChartRow, type DocumentV2, type LeadChart } from './documentV2.ts'
import { fmtDay } from './render.ts'

/** Never fewer than this many counts on the axis, so a single entry draws at a quarter height. */
export const COUNT_AXIS_MIN_MAX = 4

const LABEL_W = 118
const PLOT_W = 392
const SIGN_ROW_H = 40
const BAR_H = 26
const SPAN_ROW_H = 16
const AXIS_H = 26

function x0(i: number, n: number): number {
  return LABEL_W + (i * PLOT_W) / n
}

function colW(n: number): number {
  return PLOT_W / n
}

function hatchCol(i: number, n: number, y: number, hgt: number): string {
  return `<rect class="hatch" x="${x0(i, n).toFixed(1)}" y="${y}" width="${colW(n).toFixed(1)}" height="${hgt}" fill="url(#v2hatch)"/>`
}

/** Labels longer than the label column are cut with an ellipsis; the twin carries the full name. */
export const ROW_LABEL_CHARS = 24

function rowLabel(text: string, y: number, cls: string): string {
  const t = text.length > ROW_LABEL_CHARS ? `${text.slice(0, ROW_LABEL_CHARS - 1).trimEnd()}…` : text
  return `<text class="${cls}" x="0" y="${y}">${h(t)}</text>`
}

/** The bar's count over it, with the paper halo. */
function haloText(x: number, y: number, text: string, cls = 'cnt'): string {
  return `<text class="${cls} halo" x="${x.toFixed(1)}" y="${y}" text-anchor="middle">${h(text)}</text>`
}

function signRow(r: Extract<ChartRow, { kind: 'sign' }>, cols: ChartColumn[], top: number, axisMax: number, unit: LeadChart['unit']): string {
  const n = cols.length
  const base = top + SIGN_ROW_H - 4
  const parts: string[] = [rowLabel(r.label, base - 2, r.lead ? 'rl lead' : 'rl')]
  parts.push(`<line class="base" x1="${LABEL_W}" x2="${LABEL_W + PLOT_W}" y1="${base}" y2="${base}"/>`)
  cols.forEach((c, i) => {
    if (c.loggedDays === 0) {
      parts.push(hatchCol(i, n, top + 4, SIGN_ROW_H - 8))
      return
    }
    const count = r.counts[i]
    if (count <= 0) {
      // Under the floor, v1's "–" ("not read"), never a 0; a read empty cell draws nothing.
      if (notReadCol(c, unit)) parts.push(haloText(x0(i, n) + colW(n) / 2, base - 3, '–', 'cnt nr'))
      return
    }
    const bh = Math.max(2, (count / axisMax) * BAR_H)
    // A part column draws at its days' share of the width (spec §5.4), so a 4-day week's bar
    // never reads as a full week's fall.
    const full = unit === 'day' ? 1 : unit === 'week' ? 7 : 14
    const w = Math.max(2, colW(n) * 0.62 * Math.min(1, c.days / full))
    const x = x0(i, n) + colW(n) * 0.19 // a part bar starts where a full one does
    parts.push(`<rect class="${r.lead ? 'bar lead' : 'bar'}" x="${x.toFixed(1)}" y="${(base - bh).toFixed(1)}" width="${w.toFixed(1)}" height="${bh.toFixed(1)}"/>`)
    parts.push(haloText(x + w / 2, Math.max(top + 8, base - bh - 2), String(count)))
  })
  return parts.join('')
}

function intakeRow(r: Extract<ChartRow, { kind: 'intake' }>, cols: ChartColumn[], top: number): string {
  const n = cols.length
  const base = top + SIGN_ROW_H - 4
  const parts: string[] = [rowLabel(r.label, base - 2, 'rl lead'), rowLabel('0 to 100% of rated', base + 8, 'rl sub')]
  parts.push(`<line class="base" x1="${LABEL_W}" x2="${LABEL_W + PLOT_W}" y1="${base}" y2="${base}"/>`)
  cols.forEach((c, i) => {
    const cell = r.cells[i]
    if (c.loggedDays === 0) {
      parts.push(hatchCol(i, n, top + 4, SIGN_ROW_H - 8))
      return
    }
    if (!cell || cell.rated === 0 || cell.notFinished === 0) return
    const w = Math.max(2, colW(n) * 0.62)
    const x = x0(i, n) + (colW(n) - w) / 2
    const refusedH = (cell.refused / cell.rated) * BAR_H
    const partlyH = ((cell.notFinished - cell.refused) / cell.rated) * BAR_H
    if (refusedH > 0) parts.push(`<rect class="bar lead" x="${x.toFixed(1)}" y="${(base - refusedH).toFixed(1)}" width="${w.toFixed(1)}" height="${refusedH.toFixed(1)}"/>`)
    if (partlyH > 0) parts.push(`<rect class="bar partly" x="${x.toFixed(1)}" y="${(base - refusedH - partlyH).toFixed(1)}" width="${w.toFixed(1)}" height="${partlyH.toFixed(1)}"/>`)
    parts.push(haloText(x + w / 2, Math.max(top + 8, base - refusedH - partlyH - 2), `${cell.notFinished} of ${cell.rated}`))
  })
  return parts.join('')
}

function coverageRow(r: Extract<ChartRow, { kind: 'coverage' }>, cols: ChartColumn[], top: number): string {
  const n = cols.length
  // Logging is not a concern: the coverage row draws in ink-2, never the concern ink (cold read).
  const parts: string[] = [rowLabel(r.label, top + SIGN_ROW_H / 2 + 3, 'rl')]
  cols.forEach((c, i) => {
    if (c.loggedDays === 0) {
      parts.push(hatchCol(i, n, top + 6, SIGN_ROW_H - 12))
      return
    }
    const w = Math.max(1.5, colW(n) - 1.5)
    parts.push(`<rect class="cov" x="${(x0(i, n) + 0.75).toFixed(1)}" y="${top + 6}" width="${w.toFixed(1)}" height="${SIGN_ROW_H - 12}"/>`)
  })
  return parts.join('')
}

function spanRow(r: Extract<ChartRow, { kind: 'span' }>, cols: ChartColumn[], top: number): string {
  const n = cols.length
  const y = top + SPAN_ROW_H / 2
  const xa = r.openStart ? LABEL_W : x0(r.fromCol, n) + colW(n) / 2
  const xb = r.openEnd ? LABEL_W + PLOT_W : x0(r.toCol, n) + colW(n) / 2
  const cls = r.hollow ? 'span hollow' : 'span'
  const parts = [rowLabel(r.label, y + 3, 'rl span-l'), `<line class="${cls}" x1="${xa.toFixed(1)}" x2="${Math.max(xa + 2, xb).toFixed(1)}" y1="${y}" y2="${y}"/>`]
  // The bracket ends: a tick where the record dates a start or an end, none where it runs off the edge.
  if (!r.openStart) parts.push(`<line class="${cls}" x1="${xa.toFixed(1)}" x2="${xa.toFixed(1)}" y1="${y - 4}" y2="${y + 4}"/>`)
  if (!r.openEnd) parts.push(`<line class="${cls}" x1="${xb.toFixed(1)}" x2="${xb.toFixed(1)}" y1="${y - 4}" y2="${y + 4}"/>`)
  return parts.join('')
}

function axis(chart: LeadChart, top: number): string {
  const cols = chart.columns
  const n = cols.length
  const stride = n <= 8 ? 1 : chart.unit === 'day' ? 7 : 2
  const parts: string[] = []
  cols.forEach((c, i) => {
    if (i % stride !== 0) return
    parts.push(`<text class="ax" x="${(x0(i, n) + 1).toFixed(1)}" y="${top + 10}">${h(fmtDay(c.start).replace(/&nbsp;/g, ' '))}</text>`)
  })
  // Partial columns are marked under their own column (spec §5.4).
  cols.forEach((c, i) => {
    const full = chart.unit === 'week' ? 7 : chart.unit === 'two_weeks' ? 14 : 1
    let label: string | null = null
    if (chart.unit !== 'day') {
      if (c.days < full) label = `${c.days}-day ${chart.unit === 'week' ? 'week' : 'bin'}${i === n - 1 ? ', so far' : ''}`
      else if (c.loggedDays > 0 && c.loggedDays < c.days) label = `logged ${c.loggedDays} of ${c.days}`
    }
    if (label) parts.push(`<text class="ax part" x="${(x0(i, n) + 1).toFixed(1)}" y="${top + 21}">${h(label)}</text>`)
  })
  return parts.join('')
}

/** The lead chart's SVG. `aria-hidden`, unlabelled: the twin carries every fact (spec §5.4). */
export function chartSvg(chart: LeadChart): string {
  const signish = chart.rows.filter((r) => r.kind !== 'span')
  const spans = chart.rows.filter((r): r is Extract<ChartRow, { kind: 'span' }> => r.kind === 'span')
  const counts = chart.rows.flatMap((r) => (r.kind === 'sign' ? r.counts : []))
  const axisMax = Math.max(COUNT_AXIS_MIN_MAX, ...counts)
  let y = 0
  const body: string[] = []
  for (const r of signish) {
    if (r.kind === 'sign') body.push(signRow(r, chart.columns, y, axisMax, chart.unit))
    else if (r.kind === 'intake') body.push(intakeRow(r, chart.columns, y))
    else if (r.kind === 'coverage') body.push(coverageRow(r, chart.columns, y))
    y += SIGN_ROW_H
  }
  for (const r of spans) {
    body.push(spanRow(r, chart.columns, y))
    y += SPAN_ROW_H
  }
  body.push(axis(chart, y))
  y += AXIS_H
  const hatch = `<defs><pattern id="v2hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" class="hatchline"/></pattern></defs>`
  return `<svg class="chart" aria-hidden="true" focusable="false" viewBox="0 0 ${LABEL_W + PLOT_W} ${y}" width="${LABEL_W + PLOT_W}pt" height="${y}pt">${hatch}${body.join('')}</svg>`
}

function block(b: BlockV2): string {
  const open = (tag: string, cls: string) => `<${tag} class="${cls}" data-block="${b.id}">`
  switch (b.kind) {
    case 'masthead':
      return `${open('header', 'mast')}<div class="eyebrow">${h(b.eyebrow)}</div><h1>${h(b.name)}</h1><p class="sig">${h(b.signalment)}</p>${
        b.conditions ? `<p class="cond">${h(b.conditions)}</p>` : ''
      }<p class="win">${h(b.window)}</p><p class="last">${b.lastEntryHtml}.</p></header>`
    case 'disclosure':
      return `${open('div', 'disc')}${b.html}</div>`
    case 'band':
      return `${open('section', 'band')}<h2>${h(b.heading)}</h2><ul>${b.items
        .map((i) => `<li data-item="${h(i.id)}"><b>Flag: ${h(i.tag.toLowerCase())}.</b> ${i.html}</li>`)
        .join('')}</ul>${b.checksHtml ? `<p class="checks">${b.checksHtml}</p>` : ''}</section>`
    case 'checks':
      return `${open('p', 'checks unframed')}${b.html}</p>`
    case 'scope_line':
      return `${open('p', 'scope')}${h(b.text)}</p>`
    case 'changes':
      // Never framed like the band, never called a flag (PM ruling (a) on CUL-2323).
      return `${open('section', `changes ${b.placement === 'band_slot' ? 'slot' : 'under'}`)}<h2 class="sech">${h(b.heading)}</h2><ul>${b.lines
        .map((l) => `<li data-item="${h(l.id)}">${h(l.text)}.</li>`)
        .join('')}</ul></section>`
    case 'record_edge':
      return `${open('div', 'edge')}${b.lines.map((l) => `<p>${h(l)}</p>`).join('')}</div>`
    case 'lead_sentence':
      return `${open('p', 'lede serif')}${h(b.text)}</p>`
    case 'lead_chart': {
      const c = b.chart
      return `${open('section', c.flagHtml ? 'leadchart flagged' : 'leadchart')}<h2 class="${c.flagHtml ? 'flagh' : 'charth'}">${h(c.heading)}</h2>${
        c.flagHtml ? `<p class="flagrow">${c.flagHtml}</p>` : ''
      }${c.reasonLine ? `<p class="why">${h(c.reasonLine)}</p>` : ''}${chartSvg(c)}<p class="twin">${h(c.twin)}</p></section>`
    }
    case 'confounder':
      return `${open('p', 'conf')}${h(b.text)}</p>`
    case 'record_lines':
      return `${open('ol', 'lines')}${b.lines.map((l) => `<li data-item="${h(l.id)}">${h(l.text)}</li>`).join('')}</ol>`
    case 'gap_lines':
      return `${open('section', 'gaps')}<h2 class="sech">${h(b.heading)}</h2><ul>${b.lines
        .map((g) => `<li data-item="${h(g.id)}">${h(g.text)}.</li>`)
        .join('')}</ul></section>`
    case 'questions':
      return `${open('section', 'qs')}<h2 class="sech">${h(b.heading)}</h2><ol>${b.items
        .map((q) => `<li><span class="q">${h(q.text)}</span> <span class="ptr">${h(q.pointer)}</span></li>`)
        .join('')}</ol></section>`
    case 'colophon':
      return `${open('footer', 'colo')}${h(b.text)}</footer>`
  }
}

/** The block ids in print order, read off the rendered HTML (the parity test reads this). */
export function blockIdsOf(html: string): string[] {
  return [...html.matchAll(/data-block="([^"]+)"/g)].map((m) => m[1])
}

const STYLE_V2 = `
:root{--ink:#16181d;--ink2:#565961;--faint:#8a8d94;--hair:#d8d9dd;--paper:#ffffff;--concern:#9F1239;--partly:#d9a3b0;--cov:#c2c4c9;}
@page{size:auto;margin:36pt 40pt;}
*{box-sizing:border-box;}
html,body{margin:0;padding:0;background:var(--paper);color:var(--ink);}
body{font-family:"Geist",ui-sans-serif,-apple-system,system-ui,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:9.5pt;line-height:1.38;font-variant-numeric:tabular-nums;orphans:3;widows:3;}
.sheet{width:515pt;margin:0 auto;}
.serif{font-family:"Newsreader",Georgia,"Iowan Old Style",serif;}
.mast .eyebrow{font-size:7.5pt;letter-spacing:.08em;text-transform:uppercase;color:var(--ink2);}
.mast h1{font-size:20pt;line-height:1.1;margin:2pt 0 3pt;font-weight:650;}
.mast p{margin:0 0 1.5pt;}
.mast .sig,.mast .cond{color:var(--ink);}
.mast .win{color:var(--ink2);}
.mast .last{font-size:10.5pt;font-weight:600;margin-top:3pt;}
.disc{margin:6pt 0;color:var(--ink2);font-size:8.5pt;}
section{margin:10pt 0 0;}
h2{font-size:9pt;margin:0 0 4pt;font-weight:650;letter-spacing:.02em;}
.band{border:1.25pt solid var(--ink);padding:7pt 9pt;}
.band h2{color:var(--concern);text-transform:uppercase;letter-spacing:.06em;}
.band ul{margin:0;padding:0;list-style:none;}
.band li{margin:0 0 4pt;}
.band .checks,.checks.unframed{color:var(--ink2);font-size:8.5pt;margin:4pt 0 0;}
.scope{margin:10pt 0 0;font-weight:600;}
.changes h2,.sech{font-size:7.5pt;text-transform:uppercase;letter-spacing:.1em;color:var(--ink2);}
.changes ul,.gaps ul{margin:0;padding:0 0 0 12pt;}
.gaps li{list-style:circle;}
.edge p{font-size:10.5pt;font-weight:600;margin:8pt 0 0;}
.lede{font-size:13pt;line-height:1.3;margin:10pt 0 0;}
.leadchart .flagh{color:var(--concern);}
.leadchart.flagged{border:1.25pt solid var(--ink);padding:7pt 9pt;}
svg .cnt.nr{fill:var(--ink2);font-weight:400;}
.leadchart .why,.flagrow{color:var(--ink2);margin:0 0 4pt;}
.twin{font-size:8.5pt;color:var(--ink);margin:3pt 0 0;}
.conf{margin:6pt 0 0;}
.lines{margin:8pt 0 0;padding-left:14pt;}
.lines li{margin:0 0 2pt;}
.qs .ptr{color:var(--ink2);font-size:8pt;}
.colo{margin-top:14pt;padding-top:5pt;border-top:.5pt solid var(--hair);font-size:7.5pt;color:var(--ink2);}
svg.chart{display:block;margin:2pt 0 0;overflow:visible;}
svg .rl{font-size:8.5px;fill:var(--ink2);}
svg .rl.lead{fill:var(--concern);font-weight:650;}
svg .rl.sub{font-size:7px;}
svg .base{stroke:var(--hair);stroke-width:.75;}
svg .bar{fill:var(--ink2);}
svg .bar.lead{fill:var(--concern);}
svg .bar.partly{fill:var(--partly);}
svg .cov{fill:var(--cov);}
svg .hatchline{stroke:var(--faint);stroke-width:1;}
svg .span{stroke:var(--ink2);stroke-width:1.5;}
svg .span.hollow{stroke-dasharray:3 2;stroke-width:1;fill:none;}
svg .cnt{font-size:8px;fill:var(--ink);font-weight:600;}
svg .halo{paint-order:stroke;stroke:var(--paper);stroke-width:2.5px;stroke-linejoin:round;}
svg .ax{font-size:7.5px;fill:var(--ink2);}
svg .ax.part{fill:var(--ink);}
@media print{.sheet{width:auto;}}
`

/** The whole v2 document as HTML: sheet 1 only until the back sheets ship (VR2-13). */
export function renderPrintV2(doc: DocumentV2): string {
  const name = doc.blocks.find((b) => b.kind === 'masthead')
  const title = name && name.kind === 'masthead' ? `${name.name}: owner's home log` : "Owner's home log"
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="report-version" content="v2" />
<title>${h(title)}</title>
<style>${STYLE_V2}</style>
</head>
<body>
<main class="sheet" data-sheet="1">
${doc.blocks.map(block).join('\n')}
</main>
</body>
</html>`
}
