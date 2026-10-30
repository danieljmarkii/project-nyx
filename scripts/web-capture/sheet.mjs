// One contact sheet of a capture run (CUL-2150): every shot down the side, every size across
// the top, so a reviewer opens one image on the PR's check instead of a zip of thirty.
//
//   node scripts/web-capture/sheet.mjs <shots-dir> <out.png> [summary.md]
//
// Reads the PNGs capture.mjs wrote (`<shot>-<size>[-UNREACHED|-UNSETTLED].png`), lays them out in
// Chromium, and photographs the page. With a third argument it also writes a Markdown table
// of the same grid for the job summary. Exits non-zero when the directory holds no capture,
// because a sheet of nothing would read as a clean run.
import { createRequire } from 'node:module';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const require = createRequire(process.env.PLAYWRIGHT_REQUIRE_FROM ?? '/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');

const [dir, out, summary] = process.argv.slice(2).map((p) => (p ? resolve(p) : p));
if (!dir || !out) throw new Error('usage: sheet.mjs <shots-dir> <out.png> [summary.md]');

// The size labels capture.mjs writes, in the order a reader compares them.
// Phones narrow to wide, then the Duo folded and unfolded, then the large text sizes.
const SIZE_ORDER = ['320', '375x667', '390', '466x678', '626x890', '890x626', '320-textxxxL', '390-textxxxL', '320-textAX5', '390-textAX5'];
const files = (await readdir(dir)).filter((f) => f.endsWith('.png')).sort();
if (files.length === 0) {
  console.error(`no captures in ${dir}`);
  process.exit(1);
}
const grid = new Map();
const sizes = new Set();
for (const f of files) {
  // A shot that could not reach its screen, or reached it and never settled (CUL-2266).
  const unreached = f.match(/-(UNREACHED|UNSETTLED)\.png$/)?.[1] ?? null;
  const stem = f.replace(/(-UNREACHED|-UNSETTLED)?\.png$/, '');
  const size = SIZE_ORDER.find((s) => stem.endsWith(`-${s}`)) ?? stem.slice(stem.lastIndexOf('-') + 1);
  const shot = stem.slice(0, stem.length - size.length - 1);
  sizes.add(size);
  if (!grid.has(shot)) grid.set(shot, new Map());
  grid.get(shot).set(size, { f, unreached });
}
const cols = [...sizes].sort((a, b) => (SIZE_ORDER.indexOf(a) + 1 || 99) - (SIZE_ORDER.indexOf(b) + 1 || 99));

const cell = async (c) => {
  if (!c) return '<td class="none">not captured</td>';
  const png = await readFile(join(dir, c.f));
  // One point scale across the sheet (CUL-2237): the PNG's width is 2x its points, drawn
  // at a quarter, so a 390 phone is 195px as before and the Duo is as wide as it is.
  const b64 = png.toString('base64');
  return `<td${c.unreached ? ' class="unreached"' : ''}><img style="width:${png.readUInt32BE(16) / 4}px" src="data:image/png;base64,${b64}">${c.unreached ? `<div>${c.unreached}</div>` : ''}</td>`;
};
let rows = '';
for (const [shot, bySize] of grid) {
  rows += `<tr><th class="shot">${shot}</th>`;
  for (const s of cols) rows += await cell(bySize.get(s));
  rows += '</tr>';
}
const html = `<!doctype html><meta charset="utf-8"><style>
  body { margin: 16px; font: 13px system-ui, sans-serif; background: #fff; color: #111; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid #ddd; padding: 6px; vertical-align: top; }
  th.shot { writing-mode: vertical-rl; transform: rotate(180deg); }
  img { display: block; }
  td.unreached { background: #fde8e8; } td.unreached div { color: #a00; font-weight: 600; }
  td.none { color: #888; }
</style><table><tr><th></th>${cols.map((c) => `<th>${c}</th>`).join('')}</tr>${rows}</table>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 400, height: 400 }, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: out, fullPage: true });
} finally {
  await browser.close();
}
console.log(out);

if (summary) {
  const md = [`| shot | ${cols.join(' | ')} |`, `|---|${cols.map(() => '---').join('|')}|`];
  for (const [shot, bySize] of grid) {
    md.push(`| ${shot} | ${cols.map((s) => (!bySize.get(s) ? '—' : bySize.get(s).unreached ? `**${bySize.get(s).unreached}**` : '✓')).join(' | ')} |`);
  }
  await writeFile(summary, md.join('\n') + '\n');
}
