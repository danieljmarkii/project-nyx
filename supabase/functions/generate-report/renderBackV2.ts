// Vet report v2 sheets 2 to N: the HTML both renderers share (CUL-2293, row VR2-13).
//
// One function writes each back-sheet block, so the print renderer (`renderPrintV2`) and the phone
// reflow (`renderPhoneV2`) print the same words in the same order (spec §3.4); each renderer
// brings only its own stylesheet (absolute pt for print, rem for the phone, spec §6.3). Every block
// carries `data-block="<id>"`, read by the parity tests exactly as sheet 1's are.
//
// THE LEDGER (spec §6.1, R-2's "C's ledger"): one square per day, a row per seven days from the
// window's first day. Three marks, and the caption names only the ones drawn:
//   - filled, with its count: the lead sign that day;
//   - plain: an entry that day, none of the lead sign (drawn as nothing, never a 0: AC 5);
//   - hatched: nothing logged (the one meaning hatch has, AC 4).
// The grid is aria-hidden; the lines under it carry every fact it draws, in words.
import { h, type BandPhoto, type DocumentV2 } from './documentV2.ts'
import type { BackBlockV2, BackSheetV2, LedgerCell } from './backSheetsV2.ts'

/** Every block id in print order, sheet 1 then the back sheets: what the parity tests compare. */
export function documentBlockIds(doc: DocumentV2): string[] {
  return [...doc.blocks.map((b) => b.id), ...doc.backSheets.flatMap((s) => s.blocks.map((b) => b.id))]
}

/** R-10: the dated photos beside a band line. Empty when the line cites no photographed event. */
export function bandPhotosHtml(photos: readonly BandPhoto[], leftOutLine: string | null = null): string {
  // R-10 (PR-23): a photo the owner left out is dated here, beside the line it would have sat by.
  const left = leftOutLine === null ? '' : `<span class="bleft">${h(leftOutLine)}</span>`
  if (photos.length === 0) return left
  return `${left}<span class="bphotos">${photos
    .map(
      (p) =>
        `<span class="bphoto">${p.src ? `<img src="${p.src}" alt="${h(p.alt)}" />` : ''}<span class="bcap">${h(p.caption)}</span></span>`,
    )
    .join('')}</span>`
}

function cell(c: LedgerCell): string {
  switch (c.state) {
    case 'sign':
      return `<td class="${c.refusedAll === false ? 'lg-sign lg-partly' : 'lg-sign'}">${c.count}</td>`
    case 'logged':
      return '<td class="lg-logged"></td>'
    case 'none':
      return '<td class="lg-none"></td>'
    case 'outside':
      return '<td class="lg-out"></td>'
  }
}

function backBlock(b: BackBlockV2, phone: boolean): string {
  const open = (tag: string, cls: string) => `<${tag} class="${cls}" data-block="${b.id}">`
  switch (b.kind) {
    case 'photo_strip':
      return `${open('section', 'photos')}<h2>${h(b.heading)}</h2><p class="bnote">${b.introHtml}</p>${
        b.leftOutLine === null ? '' : `<p class="bnote">${h(b.leftOutLine)}</p>`
      }<div class="phstrip">${b.cardsHtml.join('')}</div></section>`
    case 'no_photos':
      return `${open('p', 'nophotos')}${h(b.text)}</p>`
    case 'ledger':
      return `${open('section', 'ledger')}<h2>${h(b.heading)}</h2><p class="bnote">${h(b.caption)}</p><table class="lg" aria-hidden="true"><tbody>${b.rows
        .map((r) => `<tr><th>${h(r.label)}</th>${r.cells.map(cell).join('')}</tr>`)
        .join('')}</tbody></table>${b.lines.map((l) => `<p class="lgline">${h(l)}</p>`).join('')}</section>`
    case 'episodes':
      return `${open('section', 'episodes')}<h2>${h(b.heading)}</h2>${b.html}</section>`
    case 'intake':
      // The predicate sits above the tables it reconciles, so "the dated list below" is true.
      return `${open('section', 'intake')}<h2>${h(b.heading)}</h2><p class="bnote">${b.introHtml}</p>${
        b.lastAboveRefused ? `<p class="lastmeal">${h(b.lastAboveRefused)}</p>` : ''
      }${b.predicate ? `<p class="predicate">${h(b.predicate)}</p>` : ''}${phone ? labelTableCells(b.tablesHtml) : b.tablesHtml}</section>`
    case 'section':
      // A v1 section reprinted whole (VR2-14); the phone labels its table cells like the intake sheet.
      return `${open('section', `v1sec v1-${b.id}`)}${b.heading ? `<h2>${h(b.heading)}</h2>` : ''}${phone ? labelTableCells(b.html) : b.html}</section>`
    case 'kept':
      // Each rule is one unit that never splits across a page, so its sentences extract whole.
      return `${open('section', 'kept')}<h2>${h(b.heading)}</h2><dl>${b.entries
        .map((e) => `<div class="kentry"><dt>${h(e.term)}</dt><dd>${h(e.text)}</dd></div>`)
        .join('')}</dl></section>`
  }
}

/** A CSS string literal, for owner-entered text inside `content:` (never interpolated raw). */
function cssString(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\n\r\f]/g, ' ').replace(/</g, '\\3C ')}"`
}

/**
 * The patient on every printed page after the first (cold read, CUL-2293: a back sheet that runs to
 * a second page left a page about vomit contents with no patient on it). Page margin boxes print
 * in Chromium; a renderer that ignores them (WebKit's print) still has each sheet's own running
 * head, so this only adds.
 */
export function pageHeadCss(doc: DocumentV2): string {
  const mast = doc.blocks.find((b) => b.kind === 'masthead')
  if (!mast || mast.kind !== 'masthead') return ''
  // Whose record, by more than a first name: species, sex and age, the window, and the report id
  // when the copy is saved (cold read round 2: a detached page read "Nyx" and nothing more).
  const head = cssString([mast.name, mast.signalmentBrief, 'owner’s home log', mast.window, ...(doc.reportId ? [`report ${doc.reportId}`] : [])].join(' · '))
  // Margin boxes inherit nothing from the body, so they name the sheet's family themselves.
  const box = 'font-family:"Geist",ui-sans-serif,-apple-system,system-ui,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:7pt;color:#565961;'
  return `@page{@top-left{content:${head};${box}}@bottom-right{content:"page " counter(page) " of " counter(pages);${box}}}@page :first{@top-left{content:none;}}`
}

/**
 * The phone's intake tables, each body cell labelled with its column's heading (CUL-2401). At large
 * text the table stacks one cell to a line and each line prints its own label, so no value is read
 * by its position against a key: a cell's own " · " (a protein's "list not read", the intake
 * ratings) once made a key-by-position reading put the dates under Meals. Phone only, so the print
 * document's bytes never move. A spanning cell (the "earlier meals not shown" row) takes no label.
 */
export function labelTableCells(tablesHtml: string): string {
  const span = (attrs: string) => Math.max(1, Number(/\bcolspan="(\d+)"/.exec(attrs)?.[1] ?? 1))
  return tablesHtml.replace(/<table\b([^>]*)>[\s\S]*?<\/table>/g, (table, tattrs: string) => {
    if ((/\bclass="([^"]*)"/.exec(tattrs)?.[1] ?? '').split(/\s+/).includes('lg')) return table
    const thead = /<thead\b[^>]*>([\s\S]*?)<\/thead>/.exec(table)?.[1] ?? ''
    // One label per column a heading covers, so a spanning heading never shifts the ones after it.
    const heads = [...thead.matchAll(/<th\b([^>]*)>([\s\S]*?)<\/th>/g)].flatMap((m) => {
      const label = m[2].replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '').replace(/"/g, '&quot;').replace(/\s+/g, ' ').trim()
      return Array<string>(span(m[1])).fill(label)
    })
    if (heads.length === 0) return table
    return table.replace(/<tbody\b[^>]*>[\s\S]*?<\/tbody>/, (tbody) =>
      tbody.replace(/<tr\b[^>]*>[\s\S]*?<\/tr>/g, (tr) => {
        // Every cell, header or data, takes its columns; only a single-column data cell is labelled.
        let col = 0
        return tr.replace(/<(td|th)\b([^>]*)>/g, (cell, tag: string, attrs: string) => {
          const n = span(attrs)
          const label = heads[col]
          col += n
          return tag === 'td' && n === 1 && label ? `<td${attrs} data-label="${label}">` : cell
        })
      }))
  })
}

/** One back sheet: its running head (pet, sheet n of N, title) and its blocks. `phone` labels the intake cells. */
export function backSheetHtml(doc: DocumentV2, sheet: BackSheetV2, phone = false): string {
  const mast = doc.blocks.find((b) => b.kind === 'masthead')
  const name = mast && mast.kind === 'masthead' ? mast.name : ''
  const total = 1 + doc.backSheets.length
  return `<section class="sheet back" data-sheet="${sheet.n}">
<header class="runhead"><span class="rn">${h(name)}</span> · sheet ${sheet.n} of ${total} · <span class="rt">${h(sheet.title)}</span></header>
${sheet.blocks.map((b) => backBlock(b, phone)).join('\n')}
</section>`
}

// The v1 fragments' own classes (characteristics, tables, photo cards) are styled here with the
// v2 tokens, so both renderers carry the same rules. Sizes are separate: print in pt, phone in rem.
const BACK_SHARED = `
.sheet.back{break-before:page;}
.back .runhead{color:var(--ink2);border-bottom:.5pt solid var(--hair);padding-bottom:3pt;margin-bottom:6pt;}
.back .runhead .rn{color:var(--ink);font-weight:650;}
.back h2{font-weight:650;margin:0 0 4pt;}
.back h3{font-weight:650;margin:8pt 0 3pt;}
.back section{margin:10pt 0 0;}
.back .bnote,.back .note,.back .mixkey,.back .limit,.back .phread{color:var(--ink2);}
.back .note b,.back .limit b,.back .present b,.back .phread b{color:var(--ink);}
.back .nophotos{margin:4pt 0 0;color:var(--ink2);}
.back .lg{border-collapse:separate;border-spacing:2pt;margin:4pt 0 0;}
.back .lg th{font-weight:400;color:var(--ink2);text-align:right;padding:0 4pt 0 0;white-space:nowrap;}
.back .lg td{border:.75pt solid var(--hair);text-align:center;vertical-align:middle;font-weight:650;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.back .lg td.lg-sign{background:var(--concern);border-color:var(--concern);color:var(--paper);}
.back .lg td.lg-sign.lg-partly{background:var(--partly);border-color:var(--partly);color:var(--ink);}
.back .lg td.lg-none{background:repeating-linear-gradient(45deg,var(--faint) 0 1px,var(--paper) 1px 4px);}
.back .lg td.lg-out{border-color:transparent;}
.back .lgline{margin:3pt 0 0;}
.back .pheno{display:grid;grid-template-columns:1.35fr 1fr;gap:10pt;align-items:start;}
.back .barmix{display:flex;overflow:hidden;border:.75pt solid var(--hair);}
.back .barmix .seg{display:flex;align-items:center;justify-content:center;color:var(--paper);font-weight:600;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.back .mixkey .sw{display:inline-block;margin-right:3pt;vertical-align:middle;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.back .limit{border-left:2pt solid var(--faint);padding:0 0 0 8pt;}
.back .present{border-left:2pt solid var(--ink);padding:0 0 0 8pt;}
.back .limit .h,.back .present .h{display:block;font-weight:700;text-transform:uppercase;letter-spacing:.05em;}
.back .aitag,.back .aibadge,.back .conf{color:var(--ink2);border:.75pt solid var(--hair);padding:0 3pt;white-space:nowrap;}
.back table:not(.lg){width:100%;border-collapse:collapse;margin-top:3pt;}
.back table:not(.lg) caption{caption-side:top;text-align:left;color:var(--ink2);}
.back table:not(.lg) th,.back table:not(.lg) td{text-align:left;padding:2pt 4pt;border-bottom:.5pt solid var(--hair);vertical-align:top;}
.back table:not(.lg) thead th{border-bottom:1pt solid var(--ink);font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ink2);}
.back td.c,.back th.c{text-align:center;}
.back td.omit{text-align:center;font-style:italic;color:var(--ink2);}
.back .rnote{color:var(--ink2);font-style:italic;}
.back .lastmeal{font-weight:600;margin:4pt 0 0;}
.back .predicate{margin:6pt 0 0;}
.back .phstrip{display:grid;grid-template-columns:repeat(3,1fr);gap:8pt;margin-top:4pt;}
.back .phcard{margin:0;border-top:.5pt solid var(--hair);padding-top:4pt;break-inside:avoid;}
.back .phimg{display:block;width:100%;height:auto;object-fit:contain;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.back .phimg-missing{display:flex;align-items:center;justify-content:center;font-style:italic;color:var(--ink2);border-bottom:.5pt solid var(--hair);}
.back .phhead{display:flex;align-items:center;gap:4pt;flex-wrap:wrap;}
.back .phhead .phdate{font-weight:700;}
.back .phhead .phtype{color:var(--ink2);}
.back .phtag{font-weight:700;text-transform:uppercase;letter-spacing:.05em;border:.75pt solid var(--ink);padding:0 3pt;}
.bphotos{display:flex;gap:6pt;flex-wrap:wrap;margin-top:3pt;}
.bleft{display:block;margin-top:2pt;font-style:italic;}
.bphoto{display:inline-flex;flex-direction:column;}
.bphoto img{object-fit:cover;border:1pt solid var(--ink);-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.bcap{color:var(--ink2);}
.back h2,.back h3{break-after:avoid;}
.back .sec,.back .pheno,.back .ledger,.back .lg,.back .phcard,.back .lastmeal,.back .predicate,.back tr{break-inside:avoid;}
/* VR2-14: v1's sections reprinted on the event log, medication, diet and Noticed sheets, on v2's tokens.
   A reprinted section may run longer than a page (a trial, a diet history), so it flows; its rows keep together. */
.back .v1sec .sec{margin:0;break-inside:auto;}
.back .appx-sub,.back .rnote,.back .fields,.back .aside{color:var(--ink2);}
.back .aside{font-weight:400;}
.back .fields{display:block;}
.back .fields b{color:var(--ink);font-weight:600;}
.back .kv{display:flex;gap:6pt;margin:3pt 0;}
.back .kv .k{flex:0 0 auto;font-weight:650;color:var(--ink2);}
.back .kvcol .kv .k{flex:0 0 30%;}
.back .callout{border-left:2pt solid var(--ink);padding:0 0 0 8pt;margin:6pt 0 0;}
.back .callout .k{display:block;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ink2);}
.back .qual{color:var(--ink2);}
.back .ptrow{display:flex;gap:6pt;align-items:baseline;}
.back .ptrow .ptfood{flex:0 0 46%;}
.back .ptrow .ptset{flex:1 1 auto;}
.back .weight{display:flex;align-items:center;gap:10pt;border-top:.5pt solid var(--hair);border-bottom:.5pt solid var(--hair);padding:5pt 0;}
.back .weight .spark{flex:0 0 auto;}
.back .weight .spk{fill:none;stroke:var(--ink);stroke-width:1.4;}
.back .weight .spkdot{fill:var(--ink);}
.back .weight .wt-read .v{font-weight:700;}
.back .weight .wt-read .l{color:var(--ink2);}
.back .noticed-line{border-top:.5pt solid var(--hair);padding-top:5pt;}
.back .noticed-h{font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--ink2);}
.back .noticed-note{color:var(--ink2);}
.back .noticed-graph{display:grid;grid-template-columns:1fr 1fr;gap:10pt;align-items:start;}
.back .noticed-graph-1{grid-template-columns:1fr;}
.back .nb-title{font-weight:700;}
.back .nb-row{display:flex;align-items:center;gap:6pt;margin-bottom:3pt;}
.back .nb-lab{flex:0 0 30%;}
.back .nb-first{display:block;color:var(--ink2);}
.back .nb-track{flex:1 1 auto;border:.75pt solid var(--hair);overflow:hidden;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.back .nb-fill{height:100%;background:var(--ink);-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.back .nb-val{flex:0 0 auto;color:var(--ink2);white-space:nowrap;}
.back .noticed-conflict{border-left:2pt solid var(--ink);padding:1pt 0 1pt 8pt;margin-top:4pt;}
.back .nb-held,.back .ns-legend,.back .ns-cap{color:var(--ink2);}
.back .ns-row{display:flex;gap:1pt;align-items:flex-end;}
.back .ns-cell{flex:1 1 0;min-width:0;text-align:center;line-height:1;}
.back .ns-v{display:block;color:var(--ink);}
.back .ns-vn{visibility:hidden;}
.back .ns-o,.back .ns-n{color:var(--ink2);}
.back .ns-key{white-space:nowrap;margin-right:8pt;}
.back .ns-vi{display:inline;}
.back .ng-day td{font-weight:700;}
.back .ng-hour{white-space:nowrap;color:var(--ink2);}
.back .ng-vom,.back .ng-abs,.back .ng-trunc{color:var(--ink2);}
.back .kept dl{margin:4pt 0 0;}
.back .kentry{break-inside:avoid;margin:0 0 5pt;}
.back .kentry dt{font-weight:700;}
.back .kentry dd{margin:0;}
.back .kv,.back .callout,.back .weight,.back .noticed-line,.back .nb-row,.back .ns-row{break-inside:avoid;}
/* A day heading never ends a page apart from its entries; a note or footnote never starts one apart
   from the table it reads (cold read: a stranded "Oct 16" header, a footnote cut from its table). */
.back tr.ng-day{break-after:avoid;}
.back .v1sec table + p,.back .v1sec table + .note,.back .v1sec table + div,.back .v1sec .tbl + p{break-before:avoid;}
`

/** VR2-14's reprinted v1 sections, in absolute pt: shared by the print sheet and the phone's print block. */
const BACK_V1_PRINT = `.back .appx-sub,.back .kv,.back .callout,.back .noticed-counts,.back .noticed-conflict,.back .nb-held,.back .ns-words,.back .ns-cap,.back .kept,.back .ptrow{font-size:8.5pt;}
.back .fields,.back .rnote,.back .aside,.back .noticed-note,.back .nb-title,.back .nb-lab,.back .ns-legend,.back .ns-n{font-size:7.5pt;}
.back .callout .k,.back .noticed-h,.back .nb-first,.back .nb-val,.back .ns-v,.back .ns-o,.back .ns-f,.back .ng-vom,.back .ng-trunc{font-size:7pt;}
.back .weight .wt-read{font-size:8.5pt;}
.back .weight .wt-read .v{font-size:10pt;}
.back .nb-track{height:6pt;}
.back .ns-v{height:8pt;}`

/** The print sheet's back-sheet rules: every size in absolute pt (spec §6.3). */
export const BACK_STYLE_PRINT = `${BACK_SHARED}
.back .runhead{font-size:7.5pt;}
.back h2{font-size:9pt;}
.back h3{font-size:8.5pt;}
.back .bnote,.back .note,.back .mixkey,.back .limit,.back .present,.back .phcap,.back .nophotos,.back .lgline,.back .predicate,.back .lastmeal{font-size:8.5pt;}
.back .limit .h,.back .present .h,.back .aitag,.back .aibadge,.back .conf,.back .phtag{font-size:7pt;}
.back table:not(.lg){font-size:8pt;}
.back table:not(.lg) thead th{font-size:7pt;}
.back .lg th{font-size:7.5pt;}
.back .lg td{width:22pt;height:16pt;font-size:8pt;}
/* A gap under the bar keeps its segment counts out of the key's first line in a PDF extractor's
   layout pass (pdfminer read "food ×2 · 2 1 Bile ×1" on Letter once Geist set the line; VR2-11). */
.back .barmix{height:16pt;margin-bottom:5pt;}
.back .barmix .seg{font-size:8pt;}
.back .mixkey .sw{width:7pt;height:7pt;}
.back .phimg{max-height:112pt;}
.back .phimg-missing{min-height:60pt;}
.back .phread{font-size:7.5pt;}
.bphoto img{width:54pt;height:54pt;}
.bcap{font-size:7.5pt;}
${BACK_V1_PRINT}
`

// Nothing on the phone's back sheets may run past the screen's edge (CUL-2401): a photo's AI read
// sat off-screen at 320pt. Grid columns size to their content by default, so a nowrap tag or a 46px
// word at AX5 pushed the whole page sideways. Screen only, so neither PDF moves.
// - The ledger: at compact text (`data-compact`, scale >= 1.6) its week label goes above its days.
// - The intake tables, and the tables of v1 sections reprinted by VR2-14, stack wherever their column is under 24rem: every phone at every text size
//   (five columns in a phone's column starved Food to a letter a line), side by side only on a wide
//   screen, measured in text sizes so no script is needed. Each cell takes its own line under its
//   own column heading (`labelTableCells`), never a position against a key (a cell's own " · " made
//   that misread). A number never breaks inside itself: side by side, `.num` stays whole (a split
//   once read "×117" as "×11").
const BACK_FIT_PHONE_SCREEN = `@media screen{
.back .phstrip{grid-template-columns:repeat(auto-fill,minmax(min(100%,8rem),1fr));}
.back .phcard,.back .pheno>*{min-width:0;}
.back .pheno{grid-template-columns:minmax(0,1fr);}
.back .phcard,.back .pheno{overflow-wrap:anywhere;}
.back .aitag,.back .aibadge,.back .conf{white-space:normal;-webkit-box-decoration-break:clone;box-decoration-break:clone;}
[data-compact] .back .lg,[data-compact] .back .lg tbody{display:block;}
[data-compact] .back .lg tr{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:2pt;margin-bottom:2pt;}
[data-compact] .back .lg th{grid-column:1/-1;text-align:left;padding:0;}
[data-compact] .back .lg td{width:auto;}
.back .intake,.back .v1sec{container-type:inline-size;}
.back table:not(.lg) .num{white-space:nowrap;}
}
@container (max-width:24rem){
.back table:not(.lg),.back table:not(.lg) caption,.back table:not(.lg) tbody,.back table:not(.lg) tr,.back table:not(.lg) td{display:block;}
.back table:not(.lg) thead{display:none;}
.back table:not(.lg) tr{padding:0.3rem 0;border-bottom:.5pt solid var(--hair);}
.back table:not(.lg) td{width:auto!important;padding:0;border:0;text-align:left;overflow-wrap:break-word;}
.back table:not(.lg) td.num{white-space:normal;}
.back table:not(.lg) td[data-label]::before{content:attr(data-label) ": ";font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ink2);}
}`

/** The phone's back-sheet rules for the screen: rem only, nothing under 11pt (spec §6.2, §6.3). */
export const BACK_STYLE_PHONE_SCREEN = `${BACK_SHARED}
.sheet.back{padding-top:1rem;border-top:1px solid var(--hair);}
.back .runhead{font-size:0.875rem;}
.back h2{font-size:1rem;}
.back h3{font-size:0.95rem;}
.back .bnote,.back .note,.back .mixkey,.back .limit,.back .present,.back .phcap,.back .nophotos,.back .lgline,.back .predicate,.back .lastmeal,.back .phread,.bcap{font-size:0.875rem;}
.back .limit .h,.back .present .h,.back .aitag,.back .aibadge,.back .conf,.back .phtag{font-size:0.875rem;}
.back table:not(.lg){font-size:0.875rem;}
.back table:not(.lg) thead th{font-size:0.875rem;}
.back .lg th{font-size:0.875rem;}
.back .lg td{width:1.9rem;height:1.6rem;font-size:0.875rem;}
.back .pheno{grid-template-columns:1fr;}
.back .phstrip{grid-template-columns:repeat(2,1fr);}
.back .barmix{height:1.6rem;}
.back .barmix .seg{font-size:0.875rem;}
.back .mixkey .sw{width:0.6rem;height:0.6rem;}
.bphoto img{width:4.5rem;height:4.5rem;}
.back .appx-sub,.back .kv,.back .callout,.back .callout .k,.back .weight,.back .fields,.back .rnote,.back .aside,.back .noticed-line,.back .noticed-counts,.back .noticed-note,.back .noticed-h,.back .nb-title,.back .nb-lab,.back .nb-first,.back .nb-val,.back .nb-held,.back .noticed-conflict,.back .ns-v,.back .ns-o,.back .ns-f,.back .ns-n,.back .ns-legend,.back .ns-words,.back .ns-cap,.back .ng-vom,.back .ng-trunc,.back .kept,.back .ptrow{font-size:0.875rem;}
.back .weight .wt-read .v{font-size:1rem;}
.back .nb-track{height:0.6rem;}
.back .noticed-graph,.back .kv{grid-template-columns:1fr;display:block;}
.back .kv .k{display:block;}
.back .weight{flex-wrap:wrap;}
${BACK_FIT_PHONE_SCREEN}
`

/** The phone's back-sheet rules inside its `@media print` block: absolute pt, like the print sheet. */
export const BACK_STYLE_PHONE_PRINT = `
.back .runhead{font-size:7.5pt;}
.back h2{font-size:9pt;}
.back h3{font-size:8.5pt;}
.back .bnote,.back .note,.back .mixkey,.back .limit,.back .present,.back .phcap,.back .nophotos,.back .lgline,.back .predicate,.back .lastmeal,.back .phread,.bcap{font-size:8.5pt;}
.back .limit .h,.back .present .h,.back .aitag,.back .aibadge,.back .conf,.back .phtag{font-size:7pt;}
.back table:not(.lg){font-size:8pt;}
.back table:not(.lg) thead th{font-size:7pt;}
.back .lg th{font-size:7.5pt;}
.back .lg td{width:22pt;height:16pt;font-size:8pt;}
.sheet.back{padding-top:0;border-top:0;}
${BACK_V1_PRINT}
`
