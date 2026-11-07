// VR2-11 (CUL-2291; v2 spec §5.10, §7): the embedded faces and the QR, checked from the bytes.
//
// THE FACES are opened here, not trusted from the build script's word: each WOFF2 is decompressed
// (brotli), its table directory walked, and its own cmap and hmtx read, so the test sees what a
// browser sees. It holds that every digit maps to a glyph, the ten digits are one width (tabular in
// the DEFAULT cmap, so no CSS feature is needed), no GSUB table survived (no alternate a PDF's text
// layer could lose), and the faces fit their byte budget.
//
// THE QR: an https URL with no query string or fragment (tokenless), its matrix a well-formed QR
// symbol (finder patterns, timing lines), printed at ≥ 0.5 mm a module inside a 4-module quiet zone,
// its caption one unbreakable line, on the print render and never on the phone's. The decode off a
// degraded raster is the print-survival job's (scripts/report-extract/survival.py).
import { strict as assert } from 'node:assert'
import { createHash } from 'node:crypto'
import { brotliDecompressSync } from 'node:zlib'
import { buildDocumentV2 as build, type DocumentV2Options } from './documentV2.ts'
import {
  FONT_BYTE_BUDGET,
  QR_MODULE_MM,
  QR_QUIET_MODULES,
  REPORT_FONT_FACES,
  REPORT_QR_MATRIX,
  REPORT_QR_URL,
  qrCaption,
  qrSvgV2,
  reportFontFaceCss,
} from './printAssetsV2.ts'
import { renderPhoneV2 } from './renderPhoneV2.ts'
import { renderPrintV2 } from './renderPrintV2.ts'
import { v2DocFixtures as v2Fixtures } from '../../../scripts/report-phone/fixtures.deno.ts'

const OPTS: DocumentV2Options = { owner: { firstName: 'Ada', lastName: null }, shortId: 'K7QD', questions: [] }
const doc = (s: Parameters<typeof build>[0]) => build(s, OPTS)

// ── A minimal WOFF2 reader: the table directory, the brotli stream, cmap and hmtx ────────────────

const KNOWN_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT',
  'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH',
  'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar',
  'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill',
]

function base128(b: Uint8Array, at: { i: number }): number {
  let v = 0
  for (let k = 0; k < 5; k++) {
    const byte = b[at.i++]
    v = v * 128 + (byte & 0x7f)
    if ((byte & 0x80) === 0) return v
  }
  throw new Error('bad UIntBase128')
}

/** Every table's (untransformed or transformed) bytes, by tag. */
export function woff2Tables(bytes: Uint8Array): Map<string, { data: Uint8Array; transformed: boolean }> {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  assert.equal(String.fromCharCode(...bytes.slice(0, 4)), 'wOF2', 'a WOFF2 signature')
  const numTables = dv.getUint16(12)
  const compressed = dv.getUint32(20)
  const at = { i: 48 }
  const dir: Array<{ tag: string; len: number; transformed: boolean }> = []
  for (let t = 0; t < numTables; t++) {
    const flags = bytes[at.i++]
    let tag = KNOWN_TAGS[flags & 0x3f]
    if ((flags & 0x3f) === 63) {
      tag = String.fromCharCode(...bytes.slice(at.i, at.i + 4))
      at.i += 4
    }
    const version = flags >> 6
    const orig = base128(bytes, at)
    // glyf and loca are transformed at version 0; every other table at any version but 0.
    const transformed = tag === 'glyf' || tag === 'loca' ? version === 0 : version !== 0
    const len = transformed ? base128(bytes, at) : orig
    dir.push({ tag, len, transformed })
  }
  const stream = new Uint8Array(brotliDecompressSync(bytes.slice(at.i, at.i + compressed)))
  const out = new Map<string, { data: Uint8Array; transformed: boolean }>()
  let off = 0
  for (const d of dir) {
    out.set(d.tag, { data: stream.slice(off, off + d.len), transformed: d.transformed })
    off += d.len
  }
  return out
}

/** The glyph id the font's Unicode cmap maps `cp` to (format 4 or 12), or 0. */
export function cmapLookup(cmap: Uint8Array, cp: number): number {
  const dv = new DataView(cmap.buffer, cmap.byteOffset, cmap.byteLength)
  const n = dv.getUint16(2)
  const subs: Array<{ pid: number; eid: number; off: number }> = []
  for (let i = 0; i < n; i++) subs.push({ pid: dv.getUint16(4 + i * 8), eid: dv.getUint16(6 + i * 8), off: dv.getUint32(8 + i * 8) })
  const pick = subs.find((s) => s.pid === 3 && s.eid === 10) ?? subs.find((s) => s.pid === 3 && s.eid === 1) ?? subs.find((s) => s.pid === 0)
  assert.ok(pick, 'a Unicode cmap subtable')
  const o = pick.off
  const format = dv.getUint16(o)
  if (format === 12) {
    const groups = dv.getUint32(o + 12)
    for (let g = 0; g < groups; g++) {
      const start = dv.getUint32(o + 16 + g * 12)
      const end = dv.getUint32(o + 20 + g * 12)
      if (cp >= start && cp <= end) return dv.getUint32(o + 24 + g * 12) + (cp - start)
    }
    return 0
  }
  assert.equal(format, 4, 'cmap format 4 or 12')
  const segX2 = dv.getUint16(o + 6)
  const ends = o + 14
  const starts = ends + segX2 + 2
  const deltas = starts + segX2
  const ranges = deltas + segX2
  for (let s = 0; s < segX2 / 2; s++) {
    const end = dv.getUint16(ends + s * 2)
    if (cp > end) continue
    const start = dv.getUint16(starts + s * 2)
    if (cp < start) return 0
    const delta = dv.getInt16(deltas + s * 2)
    const ro = dv.getUint16(ranges + s * 2)
    if (ro === 0) return (cp + delta) & 0xffff
    const g = dv.getUint16(ranges + s * 2 + ro + (cp - start) * 2)
    return g === 0 ? 0 : (g + delta) & 0xffff
  }
  return 0
}

function advance(hhea: Uint8Array, hmtx: Uint8Array, gid: number): number {
  const numH = new DataView(hhea.buffer, hhea.byteOffset, hhea.byteLength).getUint16(34)
  const dv = new DataView(hmtx.buffer, hmtx.byteOffset, hmtx.byteLength)
  return dv.getUint16(4 * Math.min(gid, numH - 1))
}

function faceBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

// ── The faces ────────────────────────────────────────────────────────────────────────────────────

Deno.test('fonts — Geist at 400, 600 and 700 and the one Newsreader face, each as stated', () => {
  assert.deepEqual(
    REPORT_FONT_FACES.map((f) => `${f.family} ${f.weight}`),
    ['Geist 400', 'Geist 600', 'Geist 700', 'Newsreader 400'],
  )
  for (const f of REPORT_FONT_FACES) {
    const bytes = faceBytes(f.woff2Base64)
    assert.equal(bytes.length, f.bytes, `${f.family} ${f.weight}: byte count`)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), f.sha256, `${f.family} ${f.weight}: hash`)
  }
})

Deno.test('fonts — under the byte budget, per face and in total', () => {
  for (const f of REPORT_FONT_FACES) assert.ok(f.bytes <= FONT_BYTE_BUDGET.perFace, `${f.family} ${f.weight}: ${f.bytes} > ${FONT_BYTE_BUDGET.perFace}`)
  const total = REPORT_FONT_FACES.reduce((n, f) => n + f.bytes, 0)
  assert.ok(total <= FONT_BYTE_BUDGET.total, `${total} > ${FONT_BYTE_BUDGET.total}`)
})

Deno.test('fonts — the default cmap draws tabular figures: every digit mapped, all ten one width', () => {
  for (const f of REPORT_FONT_FACES) {
    const t = woff2Tables(faceBytes(f.woff2Base64))
    const cmap = t.get('cmap')!.data
    const hmtx = t.get('hmtx')!
    assert.equal(hmtx.transformed, false, 'hmtx stored plain, so its advances can be read')
    const gids = [...'0123456789'].map((d) => cmapLookup(cmap, d.codePointAt(0)!))
    assert.ok(gids.every((g) => g > 0), `${f.family} ${f.weight}: every digit in the cmap`)
    assert.equal(new Set(gids).size, 10, `${f.family} ${f.weight}: ten distinct digit glyphs`)
    const widths = new Set(gids.map((g) => advance(t.get('hhea')!.data, hmtx.data, g)))
    assert.equal(widths.size, 1, `${f.family} ${f.weight}: digit advances ${[...widths].join(', ')}`)
    if (f.family === 'Geist') assert.equal(f.frozenTnum, 10, 'Geist: the ten digits were frozen to tnum')
  }
})

Deno.test('fonts — no GSUB table: no alternate, ligature or contextual glyph can leave the cmap', () => {
  for (const f of REPORT_FONT_FACES) assert.equal(woff2Tables(faceBytes(f.woff2Base64)).has('GSUB'), false, `${f.family} ${f.weight}`)
})

Deno.test('fonts — the reader is not vacuous: a proportional-figure face reads as one', () => {
  // A hand-built cmap (format 4: 0–9 → gids 1–10) and hmtx with unequal advances must fail the width check.
  const cmap = new Uint8Array(4 + 8 + 14 + 4 * 2 + 2 + 4 * 2 * 3)
  const dv = new DataView(cmap.buffer)
  dv.setUint16(2, 1)
  dv.setUint16(4, 3)
  dv.setUint16(6, 1)
  dv.setUint32(8, 12)
  const o = 12
  dv.setUint16(o, 4)
  dv.setUint16(o + 6, 4) // two segments
  dv.setUint16(o + 14, 0x39)
  dv.setUint16(o + 16, 0xffff)
  dv.setUint16(o + 20, 0x30)
  dv.setUint16(o + 22, 0xffff)
  dv.setInt16(o + 24, 1 - 0x30)
  dv.setInt16(o + 26, 1)
  assert.equal(cmapLookup(cmap, 0x30), 1)
  assert.equal(cmapLookup(cmap, 0x39), 10)
  const hhea = new Uint8Array(36)
  new DataView(hhea.buffer).setUint16(34, 11)
  const hmtx = new Uint8Array(44)
  for (let g = 0; g < 11; g++) new DataView(hmtx.buffer).setUint16(4 * g, g === 2 ? 384 : 600)
  const widths = new Set([...'0123456789'].map((d) => advance(hhea, hmtx, cmapLookup(cmap, d.codePointAt(0)!))))
  assert.equal(widths.size, 2)
})

Deno.test('fonts — the print render declares every face, and selects no figure feature', () => {
  const css = reportFontFaceCss()
  for (const f of REPORT_FONT_FACES) assert.ok(css.includes(`font-family:"${f.family}";font-style:normal;font-weight:${f.weight};font-display:swap;`), `${f.family} ${f.weight}`)
  for (const [name, s] of v2Fixtures()) {
    const html = renderPrintV2(doc(s))
    assert.ok(html.includes(css), `${name}: the faces are inline`)
    const style = html.replace(/\/\*[\s\S]*?\*\//g, ' ')
    assert.doesNotMatch(style, /font-variant-numeric\s*:\s*(?!normal)/, `${name}: no figure variant`)
    assert.doesNotMatch(style, /"tnum"/, `${name}: no tnum feature`)
  }
})

// ── The QR ───────────────────────────────────────────────────────────────────────────────────────

Deno.test('QR — tokenless: an https URL with no query string or fragment', () => {
  const u = new URL(REPORT_QR_URL)
  assert.equal(u.protocol, 'https:')
  assert.equal(u.search, '')
  assert.equal(u.hash, '')
  assert.doesNotMatch(REPORT_QR_URL, /[?#]/)
  assert.equal(u.hostname, 'getculprit.app')
})

Deno.test('QR — the matrix is a well-formed symbol: square, 17 + 4v, finder patterns, timing lines', () => {
  const n = REPORT_QR_MATRIX.length
  assert.ok(REPORT_QR_MATRIX.every((r) => r.length === n && /^[01]+$/.test(r)))
  assert.equal((n - 17) % 4, 0)
  const finder = ['1111111', '1000001', '1011101', '1011101', '1011101', '1000001', '1111111']
  for (const [ox, oy] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
    finder.forEach((row, y) => assert.equal(REPORT_QR_MATRIX[oy + y].slice(ox, ox + 7), row, `finder at ${ox},${oy}`))
  }
  for (let i = 8; i < n - 8; i++) {
    assert.equal(REPORT_QR_MATRIX[6][i], i % 2 === 0 ? '1' : '0', `timing row ${i}`)
    assert.equal(REPORT_QR_MATRIX[i][6], i % 2 === 0 ? '1' : '0', `timing column ${i}`)
  }
})

Deno.test('QR — printed at ≥ 0.5 mm a module, inside a 4-module quiet zone, the caption on one line', () => {
  assert.ok(QR_MODULE_MM >= 0.5)
  assert.equal(QR_QUIET_MODULES, 4)
  const svg = qrSvgV2()
  const dim = REPORT_QR_MATRIX.length + 8
  const [, w] = svg.match(/width="([\d.]+)mm"/)!
  assert.ok(Number(w) / dim >= 0.5, `module ${Number(w) / dim} mm`)
  assert.match(svg, new RegExp(`viewBox="0 0 ${dim} ${dim}"`))
  // No dark module inside the quiet zone.
  for (const m of svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)"/g)) {
    const [x, y, run] = [Number(m[1]), Number(m[2]), Number(m[3])]
    assert.ok(x >= 4 && y >= 4 && x + run <= dim - 4 && y <= dim - 5, `module run at ${x},${y}`)
  }
  assert.equal(qrCaption(), 'getculprit.app')
  assert.equal(qrCaption('https://getculprit.app/vets'), 'getculprit.app/vets', 'the caption follows a repoint')
  const html = renderPrintV2(doc(v2Fixtures()[0][1]))
  assert.match(html, /\.qrcap\{[^}]*white-space:nowrap/)
  assert.match(html, /<span class="qrcap">getculprit\.app<\/span>/)
})

Deno.test('QR — once on the print render, in the colophon; never on the phone render', () => {
  for (const [name, s] of v2Fixtures()) {
    const d = doc(s)
    const print = renderPrintV2(d)
    assert.equal((print.match(/<svg class="qr"/g) ?? []).length, 1, `${name}: one QR`)
    assert.match(print, /<footer class="colo withqr" data-block="colophon">[\s\S]*?<svg class="qr"/, `${name}: in the colophon`)
    const phone = renderPhoneV2(d)
    assert.doesNotMatch(phone, /class="qr|getculprit\.app/, `${name}: no QR on the phone`)
  }
})
