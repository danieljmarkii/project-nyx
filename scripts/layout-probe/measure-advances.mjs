// Advance-width measurement straight off the shipped Geist_500Medium.ttf.
// Parses head (unitsPerEm), cmap (fmt 4/12), hmtx/hhea (advances), kern-free
// (Geist ships GPOS kerning only; RN's iOS text layout applies it, but for a
// 6-9 char label the delta is sub-point — noted, not modelled).
import { readFileSync } from 'node:fs';

const buf = readFileSync(process.argv[2]);
const u16 = (o) => buf.readUInt16BE(o);
const i16 = (o) => buf.readInt16BE(o);
const u32 = (o) => buf.readUInt32BE(o);

const numTables = u16(4);
const tables = {};
for (let i = 0; i < numTables; i++) {
  const o = 12 + i * 16;
  tables[buf.toString('ascii', o, o + 4)] = { off: u32(o + 8), len: u32(o + 12) };
}
const unitsPerEm = u16(tables.head.off + 18);
const numHMetrics = u16(tables.hhea.off + 34);

// cmap → unicode subtable
const cmapOff = tables.cmap.off;
let sub = null;
for (let i = 0; i < u16(cmapOff + 2); i++) {
  const r = cmapOff + 4 + i * 8;
  const pid = u16(r), eid = u16(r + 2), off = cmapOff + u32(r + 4);
  const fmt = u16(off);
  if ((pid === 3 && (eid === 1 || eid === 10)) || pid === 0) {
    if (!sub || fmt === 12) sub = { off, fmt };
  }
}
function glyphFor(cp) {
  const { off, fmt } = sub;
  if (fmt === 4) {
    const segX2 = u16(off + 6), seg = segX2 / 2;
    const endO = off + 14, startO = endO + segX2 + 2, deltaO = startO + segX2, rangeO = deltaO + segX2;
    for (let s = 0; s < seg; s++) {
      if (cp <= u16(endO + s * 2)) {
        const start = u16(startO + s * 2);
        if (cp < start) return 0;
        const ro = u16(rangeO + s * 2);
        if (ro === 0) return (cp + i16(deltaO + s * 2)) & 0xffff;
        const gi = u16(rangeO + s * 2 + ro + (cp - start) * 2);
        return gi === 0 ? 0 : (gi + i16(deltaO + s * 2)) & 0xffff;
      }
    }
    return 0;
  }
  if (fmt === 12) {
    const n = u32(off + 12);
    for (let g = 0; g < n; g++) {
      const r = off + 16 + g * 12;
      if (cp >= u32(r) && cp <= u32(r + 4)) return u32(r + 8) + (cp - u32(r));
    }
  }
  return 0;
}
function advance(gid) {
  const h = tables.hmtx.off;
  return gid < numHMetrics ? u16(h + gid * 4) : u16(h + (numHMetrics - 1) * 4);
}
function widthAt(text, px) {
  let units = 0;
  for (const ch of text) units += advance(glyphFor(ch.codePointAt(0)));
  return (units / unitsPerEm) * px;
}
const out = {};
for (const label of ['Saw it', 'Found it']) out[label] = {};
// RN iOS multipliers — RCTAccessibilityManager.mm:257-269 (authoritative, not recalled)
const SCALES = { default: 1.0, xxxLarge: 1.353, AX2: 2.143, AX3: 2.643, AX5: 3.571 };
for (const [name, m] of Object.entries(SCALES)) {
  for (const label of ['Saw it', 'Found it']) out[label][name] = widthAt(label, 13 * m);
}
console.log(JSON.stringify({ unitsPerEm, scales: SCALES, widths: out }, null, 2));
