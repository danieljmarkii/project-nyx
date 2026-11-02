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
export function bandPhotosHtml(photos: readonly BandPhoto[]): string {
  if (photos.length === 0) return ''
  return `<span class="bphotos">${photos
    .map(
      (p) =>
        `<span class="bphoto">${p.src ? `<img src="${p.src}" alt="${h(p.alt)}" />` : ''}<span class="bcap">${h(p.caption)}</span></span>`,
    )
    .join('')}</span>`
}

function cell(c: LedgerCell): string {
  switch (c.state) {
    case 'sign':
      return `<td class="lg-sign">${c.count}</td>`
    case 'logged':
      return '<td class="lg-logged"></td>'
    case 'none':
      return '<td class="lg-none"></td>'
    case 'outside':
      return '<td class="lg-out"></td>'
  }
}

function backBlock(b: BackBlockV2): string {
  const open = (tag: string, cls: string) => `<${tag} class="${cls}" data-block="${b.id}">`
  switch (b.kind) {
    case 'photo_strip':
      return `${open('section', 'photos')}<h2>${h(b.heading)}</h2><p class="bnote">${b.introHtml}</p><div class="phstrip">${b.cardsHtml.join('')}</div></section>`
    case 'no_photos':
      return `${open('p', 'nophotos')}${h(b.text)}</p>`
    case 'ledger':
      return `${open('section', 'ledger')}<h2>${h(b.heading)}</h2><p class="bnote">${h(b.caption)}</p><table class="lg" aria-hidden="true"><tbody>${b.rows
        .map((r) => `<tr><th>${h(r.label)}</th>${r.cells.map(cell).join('')}</tr>`)
        .join('')}</tbody></table>${b.lines.map((l) => `<p class="lgline">${h(l)}</p>`).join('')}</section>`
    case 'episodes':
      return `${open('section', 'episodes')}<h2>${h(b.heading)}</h2>${b.html}</section>`
    case 'intake':
      return `${open('section', 'intake')}<h2>${h(b.heading)}</h2><p class="bnote">${b.introHtml}</p>${
        b.lastAboveRefused ? `<p class="lastmeal">${h(b.lastAboveRefused)}</p>` : ''
      }${b.tablesHtml}${b.predicate ? `<p class="predicate">${h(b.predicate)}</p>` : ''}</section>`
  }
}

/** One back sheet: its running head (pet, sheet n of N, title) and its blocks. */
export function backSheetHtml(doc: DocumentV2, sheet: BackSheetV2): string {
  const mast = doc.blocks.find((b) => b.kind === 'masthead')
  const name = mast && mast.kind === 'masthead' ? mast.name : ''
  const total = 1 + doc.backSheets.length
  return `<section class="sheet back" data-sheet="${sheet.n}">
<header class="runhead"><span class="rn">${h(name)}</span> · sheet ${sheet.n} of ${total} · <span class="rt">${h(sheet.title)}</span></header>
${sheet.blocks.map(backBlock).join('\n')}
</section>`
}

// The v1 fragments' own classes (characteristics, tables, photo cards) are styled here with the
// v2 tokens, so both renderers carry the same rules. Sizes are separate: print in pt, phone in rem.
const BACK_SHARED = `
.sheet.back{break-before:page;}
.runhead{color:var(--ink2);border-bottom:.5pt solid var(--hair);padding-bottom:3pt;margin-bottom:6pt;}
.runhead .rn{color:var(--ink);font-weight:650;}
.back h2{font-weight:650;margin:0 0 4pt;}
.back h3{font-weight:650;margin:8pt 0 3pt;}
.back section{margin:10pt 0 0;}
.bnote,.back .note,.mixkey,.limit,.phread{color:var(--ink2);}
.back .note b,.limit b,.present b,.phread b{color:var(--ink);}
.nophotos{margin:4pt 0 0;color:var(--ink2);}
.lg{border-collapse:separate;border-spacing:2pt;margin:4pt 0 0;}
.lg th{font-weight:400;color:var(--ink2);text-align:right;padding:0 4pt 0 0;white-space:nowrap;}
.lg td{border:.75pt solid var(--hair);text-align:center;vertical-align:middle;font-weight:650;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.lg td.lg-sign{background:var(--concern);border-color:var(--concern);color:var(--paper);}
.lg td.lg-none{background:repeating-linear-gradient(45deg,var(--faint) 0 1px,var(--paper) 1px 4px);}
.lg td.lg-out{border-color:transparent;}
.lgline{margin:3pt 0 0;}
.pheno{display:grid;grid-template-columns:1.35fr 1fr;gap:10pt;align-items:start;}
.barmix{display:flex;overflow:hidden;border:.75pt solid var(--hair);}
.barmix .seg{display:flex;align-items:center;justify-content:center;color:var(--paper);font-weight:600;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.mixkey .sw{display:inline-block;margin-right:3pt;vertical-align:middle;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.limit{border-left:2pt solid var(--faint);padding:0 0 0 8pt;}
.present{border-left:2pt solid var(--ink);padding:0 0 0 8pt;}
.limit .h,.present .h{display:block;font-weight:700;text-transform:uppercase;letter-spacing:.05em;}
.aitag,.aibadge,.conf{color:var(--ink2);border:.75pt solid var(--hair);padding:0 3pt;white-space:nowrap;}
.back table:not(.lg){width:100%;border-collapse:collapse;margin-top:3pt;}
.back table:not(.lg) caption{caption-side:top;text-align:left;color:var(--ink2);}
.back table:not(.lg) th,.back table:not(.lg) td{text-align:left;padding:2pt 4pt;border-bottom:.5pt solid var(--hair);vertical-align:top;}
.back table:not(.lg) thead th{border-bottom:1pt solid var(--ink);font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ink2);}
.back td.c,.back th.c{text-align:center;}
.back td.omit{text-align:center;font-style:italic;color:var(--ink2);}
.rnote{color:var(--ink2);font-style:italic;}
.lastmeal{font-weight:600;margin:4pt 0 0;}
.predicate{margin:6pt 0 0;}
.phstrip{display:grid;grid-template-columns:repeat(3,1fr);gap:8pt;margin-top:4pt;}
.phcard{margin:0;border-top:.5pt solid var(--hair);padding-top:4pt;break-inside:avoid;}
.phimg{display:block;width:100%;height:auto;object-fit:contain;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.phimg-missing{display:flex;align-items:center;justify-content:center;font-style:italic;color:var(--ink2);border-bottom:.5pt solid var(--hair);}
.phhead{display:flex;align-items:center;gap:4pt;flex-wrap:wrap;}
.phhead .phdate{font-weight:700;}
.phhead .phtype{color:var(--ink2);}
.phtag{font-weight:700;text-transform:uppercase;letter-spacing:.05em;border:.75pt solid var(--ink);padding:0 3pt;}
.bphotos{display:flex;gap:6pt;flex-wrap:wrap;margin-top:3pt;}
.bphoto{display:inline-flex;flex-direction:column;}
.bphoto img{object-fit:cover;border:1pt solid var(--ink);-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.bcap{color:var(--ink2);}
.back h2,.back h3{break-after:avoid;}
.back .sec,.pheno,.ledger,.lg,.phcard,.lastmeal,.predicate,.back tr{break-inside:avoid;}
`

/** The print sheet's back-sheet rules: every size in absolute pt (spec §6.3). */
export const BACK_STYLE_PRINT = `${BACK_SHARED}
.runhead{font-size:7.5pt;}
.back h2{font-size:9pt;}
.back h3{font-size:8.5pt;}
.bnote,.back .note,.mixkey,.limit,.present,.phcap,.nophotos,.lgline,.predicate,.lastmeal{font-size:8.5pt;}
.limit .h,.present .h,.aitag,.aibadge,.conf,.phtag{font-size:7pt;}
.back table:not(.lg){font-size:8pt;}
.back table:not(.lg) thead th{font-size:7pt;}
.lg th{font-size:7.5pt;}
.lg td{width:22pt;height:16pt;font-size:8pt;}
.barmix{height:16pt;}
.barmix .seg{font-size:8pt;}
.mixkey .sw{width:7pt;height:7pt;}
.phimg{max-height:112pt;}
.phimg-missing{min-height:60pt;}
.phread{font-size:7.5pt;}
.bphoto img{width:54pt;height:54pt;}
.bcap{font-size:7.5pt;}
`

/** The phone's back-sheet rules for the screen: rem only, nothing under 11pt (spec §6.2, §6.3). */
export const BACK_STYLE_PHONE_SCREEN = `${BACK_SHARED}
.sheet.back{padding-top:1rem;border-top:1px solid var(--hair);}
.runhead{font-size:0.875rem;}
.back h2{font-size:1rem;}
.back h3{font-size:0.95rem;}
.bnote,.back .note,.mixkey,.limit,.present,.phcap,.nophotos,.lgline,.predicate,.lastmeal,.phread,.bcap{font-size:0.875rem;}
.limit .h,.present .h,.aitag,.aibadge,.conf,.phtag{font-size:0.875rem;}
.back table:not(.lg){font-size:0.875rem;}
.back table:not(.lg) thead th{font-size:0.875rem;}
.lg th{font-size:0.875rem;}
.lg td{width:1.9rem;height:1.6rem;font-size:0.875rem;}
.pheno{grid-template-columns:1fr;}
.phstrip{grid-template-columns:repeat(2,1fr);}
.barmix{height:1.6rem;}
.barmix .seg{font-size:0.875rem;}
.mixkey .sw{width:0.6rem;height:0.6rem;}
.bphoto img{width:4.5rem;height:4.5rem;}
`

/** The phone's back-sheet rules inside its `@media print` block: absolute pt, like the print sheet. */
export const BACK_STYLE_PHONE_PRINT = `
.runhead{font-size:7.5pt;}
.back h2{font-size:9pt;}
.back h3{font-size:8.5pt;}
.bnote,.back .note,.mixkey,.limit,.present,.phcap,.nophotos,.lgline,.predicate,.lastmeal,.phread,.bcap{font-size:8.5pt;}
.limit .h,.present .h,.aitag,.aibadge,.conf,.phtag{font-size:7pt;}
.back table:not(.lg){font-size:8pt;}
.back table:not(.lg) thead th{font-size:7pt;}
.lg th{font-size:7.5pt;}
.lg td{width:22pt;height:16pt;font-size:8pt;}
.sheet.back{padding-top:0;border-top:0;}
`
