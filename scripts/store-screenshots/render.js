#!/usr/bin/env node
'use strict';
/*
 * Store screenshot export pipeline (B-269 · guide step 12).
 *
 * Renders template.html (the round-5 design, true 1320×2868) through headless
 * Chromium and guarantees every output is exactly 1320×2868 RGB PNG — the App
 * Store Connect 6.9″ portrait spec, no alpha (Apple rejects transparency).
 *
 * Modes:
 *   node render.js --draft          all six frames from the built-in stand-in
 *                                   screens (no captures needed — today's mode)
 *   node render.js                  capture mode: composites real device
 *                                   captures from captures/ into frames 2–6 and
 *                                   builds the frame-1 night hero by cropping
 *                                   the two Signal cards out of the Home
 *                                   capture (captures/hero-crops.json — see
 *                                   README.md for how to measure the rects)
 *   --only 1,3                      render a subset
 *
 * Zero npm dependencies on purpose: this must run in a cloud session or the
 * PM's Codespace with nothing but Node + a Chromium binary.
 *
 * Headless quirk this file exists to absorb: with `--headless=new`, the layout
 * viewport is SHORTER than --window-size (87px of window accounting on the
 * builds tested), and --screenshot pads the difference with canvas background —
 * which silently produces a frame with a dead strip at the bottom. So the
 * pipeline first measures the real offset with a fixed-position marker page,
 * oversizes the window by it, and crops the PNG back to 2868 in the same
 * decode pass that flattens any alpha channel. Never trust --window-size to
 * equal the viewport.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DIR = __dirname;
const CAPTURES = path.join(DIR, 'captures');

// Upload order per docs/store-screenshot-plan.md §3 (D-SS3 ruled). The hero
// and frame 6 share the same Home capture by design ("the same photograph,
// composed differently" — §0.5).
const FRAMES = [
  { n: 1, slug: 'night-hero', capture: 'home.png' },
  { n: 2, slug: 'quick-log', capture: 'quicklog.png' },
  { n: 3, slug: 'vet-report', capture: 'report.png' },
  { n: 4, slug: 'patterns', capture: 'patterns.png' },
  { n: 5, slug: 'history', capture: 'history.png' },
  { n: 6, slug: 'home', capture: 'home.png' },
];

const EXPORT_W = 1320;
const EXPORT_H = 2868;
// Accepted capture inputs for the 6.9″ slot (plan §1). Output is always
// 1320×2868 regardless — captures are composited into the frame.
const CAPTURE_SIZES = [[1320, 2868], [1290, 2796]];

function fail(msg) {
  console.error('\n✖ ' + msg);
  process.exit(1);
}

function findChromium() {
  const candidates = [
    process.env.CHROMIUM_BIN,
    '/opt/pw-browsers/chromium',
    'chromium',
    'chromium-browser',
    'google-chrome',
    'google-chrome-stable',
  ].filter(Boolean);
  for (const c of candidates) {
    const probe = spawnSync(c, ['--version'], { stdio: 'ignore' });
    if (probe.status === 0) return c;
  }
  fail(
    'No Chromium binary found. Set CHROMIUM_BIN to a Chrome/Chromium executable.\n' +
    '  Cloud session: /opt/pw-browsers/chromium is pre-installed.\n' +
    '  Codespace:     sudo apt-get install -y chromium-browser (or npx playwright install chromium\n' +
    '                 and point CHROMIUM_BIN at the downloaded binary).'
  );
}

function chromiumScreenshot(chromium, url, outFile, winW, winH) {
  const res = spawnSync(chromium, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--window-size=${winW},${winH}`,
    `--screenshot=${outFile}`,
    '--virtual-time-budget=15000',
    url,
  ], { encoding: 'utf8' });
  if (res.status !== 0 || !fs.existsSync(outFile)) {
    fail(`Chromium failed:\n${res.stderr || res.stdout || '(no output)'}\nURL: ${url}`);
  }
  return fs.readFileSync(outFile);
}

/* ══ Minimal PNG codec (8-bit RGB/RGBA in, RGB out) — no deps ══ */
function pngInfo(buf) {
  if (buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47) fail('Not a PNG: bad signature');
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    bitDepth: buf[24],
    colorType: buf[25], // 2 = RGB, 6 = RGBA
  };
}
function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}
// → { width, height, rgb: Buffer of h*w*3 }
function decodePNG(buf) {
  const info = pngInfo(buf);
  if (info.bitDepth !== 8 || (info.colorType !== 2 && info.colorType !== 6)) {
    fail(`decodePNG: unsupported PNG (bit depth ${info.bitDepth}, color type ${info.colorType})`);
  }
  const { width: w, height: h } = info;
  const bpp = info.colorType === 6 ? 4 : 3;
  const idats = [];
  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    if (type === 'IDAT') idats.push(buf.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idats));
  const inRow = 1 + w * bpp;
  const prev = Buffer.alloc(w * bpp);
  const rgb = Buffer.alloc(h * w * 3);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * inRow];
    const line = raw.subarray(y * inRow + 1, (y + 1) * inRow);
    for (let i = 0; i < line.length; i++) {
      const a = i >= bpp ? line[i - bpp] : 0;   // left
      const b = prev[i];                         // up
      const c = i >= bpp ? prev[i - bpp] : 0;   // up-left
      if (filter === 1) line[i] = (line[i] + a) & 0xff;
      else if (filter === 2) line[i] = (line[i] + b) & 0xff;
      else if (filter === 3) line[i] = (line[i] + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) line[i] = (line[i] + paeth(a, b, c)) & 0xff;
      // filter 0: as-is
    }
    line.copy(prev);
    for (let x = 0; x < w; x++) {
      rgb[(y * w + x) * 3] = line[x * bpp];
      rgb[(y * w + x) * 3 + 1] = line[x * bpp + 1];
      rgb[(y * w + x) * 3 + 2] = line[x * bpp + 2];
    }
  }
  return { width: w, height: h, rgb };
}
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
// rgb: h*w*3 → 8-bit truecolor PNG, filter 0, no alpha
function encodePNG(w, h, rgb) {
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    const o = y * (1 + w * 3);
    raw[o] = 0;
    rgb.copy(raw, o + 1, y * w * 3, (y + 1) * w * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: truecolor RGB
  // compression 0, filter 0, interlace 0 — already zeroed
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ── Viewport calibration: measure how much shorter the layout viewport is
   than --window-size on THIS Chromium build, using a position:fixed marker
   that by definition fills exactly the viewport. ── */
function calibrateViewportOffset(chromium, tmpDir) {
  const marker = 'data:text/html,' + encodeURIComponent(
    '<!doctype html><style>body{margin:0;background:#00FF00}i{position:fixed;inset:0;background:#F00}</style><i></i>'
  );
  const probeH = EXPORT_H + 200;
  const tmp = path.join(tmpDir, 'calibrate.png');
  const img = decodePNG(chromiumScreenshot(chromium, marker, tmp, EXPORT_W, probeH));
  let viewportH = 0;
  for (let y = 0; y < img.height; y++) {
    const i = (y * img.width + (img.width >> 1)) * 3;
    if (img.rgb[i] > 200 && img.rgb[i + 1] < 100) viewportH = y + 1;
  }
  fs.unlinkSync(tmp);
  if (viewportH < EXPORT_H / 2) fail(`Viewport calibration failed (marker measured ${viewportH}px)`);
  const offset = probeH - viewportH;
  if (offset < 0 || offset > 200) fail(`Viewport calibration implausible: offset ${offset}px`);
  return offset;
}

/* ── Capture-mode input validation ── */
function validateCapture(file) {
  const p = path.join(CAPTURES, file);
  if (!fs.existsSync(p)) {
    fail(
      `Missing capture: captures/${file}\n` +
      'Capture mode needs the on-device PNGs from the plan\'s shot list (docs/store-screenshot-plan.md §3):\n' +
      '  home.png (frames 1+6) · quicklog.png · report.png · patterns.png · history.png\n' +
      'No captures yet? That step is gated on guide step 11 (demo seed). Use --draft in the meantime.'
    );
  }
  const info = pngInfo(fs.readFileSync(p));
  if (!CAPTURE_SIZES.some(([w, h]) => w === info.width && h === info.height)) {
    fail(
      `captures/${file} is ${info.width}×${info.height} — expected 1320×2868 (6.9″) or 1290×2796 (6.7″).\n` +
      'Capture on a Pro Max class device or the matching Simulator (plan §1).'
    );
  }
  return info;
}
function loadHeroCrops(homeInfo) {
  const p = path.join(CAPTURES, 'hero-crops.json');
  if (!fs.existsSync(p)) {
    fail(
      'Missing captures/hero-crops.json — frame 1 composites the two Signal cards out of the Home\n' +
      'capture and needs their pixel rects (never guessed; the crop IS the design contract).\n' +
      'Open captures/home.png in any editor that shows pixel coordinates and record each card\'s\n' +
      'rect — the white card region from its left edge to its right edge, top of the card to its\n' +
      'bottom (safety card = the intake-decline card, insight card = the beef↔vomiting card):\n' +
      '  { "safety": {"x":66,"y":690,"w":1188,"h":320},\n' +
      '    "insight": {"x":66,"y":1040,"w":1188,"h":560} }\n' +
      '(Numbers above are format examples, not real coordinates.)'
    );
  }
  let crops;
  try { crops = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { fail(`captures/hero-crops.json is not valid JSON: ${e.message}`); }
  for (const key of ['safety', 'insight']) {
    const r = crops[key];
    if (!r || [r.x, r.y, r.w, r.h].some((v) => typeof v !== 'number' || v < 0)) {
      fail(`hero-crops.json: "${key}" needs numeric {x, y, w, h} ≥ 0`);
    }
    if (r.x + r.w > homeInfo.width || r.y + r.h > homeInfo.height) {
      fail(`hero-crops.json: "${key}" rect exceeds the Home capture (${homeInfo.width}×${homeInfo.height})`);
    }
  }
  return crops;
}

/* ── Render one frame ── */
function renderFrame(chromium, frame, mode, outDir, viewportOffset, heroExtras) {
  const params = new URLSearchParams({ frame: String(frame.n), mode });
  if (mode === 'capture') {
    params.set('img', 'captures/' + frame.capture);
    if (frame.n === 1) {
      params.set('crops', JSON.stringify(heroExtras.crops));
      params.set('capw', String(heroExtras.capw));
    }
  }
  const url = 'file://' + path.join(DIR, 'template.html') + '?' + params.toString();
  const outFile = path.join(outDir, `frame-0${frame.n}-${frame.slug}.png`);
  const shot = chromiumScreenshot(chromium, url, outFile, EXPORT_W, EXPORT_H + viewportOffset);
  const img = decodePNG(shot);
  if (img.width !== EXPORT_W || img.height < EXPORT_H) {
    fail(`frame ${frame.n} rendered ${img.width}×${img.height}, expected ≥ ${EXPORT_W}×${EXPORT_H}`);
  }
  const buf = encodePNG(EXPORT_W, EXPORT_H, img.rgb.subarray(0, EXPORT_H * EXPORT_W * 3));
  fs.writeFileSync(outFile, buf);
  return { outFile, bytes: buf.length };
}

/* ── Main ── */
(function main() {
  const args = process.argv.slice(2);
  const draft = args.includes('--draft');
  const onlyArg = args.find((a) => a.startsWith('--only'));
  let only = null;
  if (onlyArg) {
    const v = onlyArg.includes('=') ? onlyArg.split('=')[1] : args[args.indexOf(onlyArg) + 1];
    only = (v || '').split(',').map(Number).filter(Boolean);
    if (!only.length) fail('--only needs frame numbers, e.g. --only 1,3');
  }

  const mode = draft ? 'draft' : 'capture';
  const outDir = path.join(DIR, 'out', mode);
  fs.mkdirSync(outDir, { recursive: true });

  const frames = FRAMES.filter((f) => !only || only.includes(f.n));

  let heroExtras = null;
  if (mode === 'capture') {
    const infos = {};
    for (const f of frames) infos[f.capture] = validateCapture(f.capture);
    if (frames.some((f) => f.n === 1)) {
      const homeInfo = infos['home.png'] || validateCapture('home.png');
      heroExtras = { crops: loadHeroCrops(homeInfo), capw: homeInfo.width };
    }
  }

  const chromium = findChromium();
  const viewportOffset = calibrateViewportOffset(chromium, outDir);
  console.log(`Rendering ${frames.length} frame(s) in ${mode} mode via ${chromium} (viewport offset ${viewportOffset}px)\n`);
  for (const f of frames) {
    const { outFile, bytes } = renderFrame(chromium, f, mode, outDir, viewportOffset, heroExtras);
    console.log(`  ✓ ${path.relative(DIR, outFile)}  ${EXPORT_W}×${EXPORT_H} RGB  ${(bytes / 1024).toFixed(0)} KB`);
  }
  console.log(`\nDone → ${path.relative(process.cwd(), outDir)}`);
  if (mode === 'draft') {
    console.log('Draft frames use stand-in screens — real captures replace them at guide step 11+12.');
  } else {
    console.log('Upload in filename order (plan §6); frame files keep the ruled D-SS3 order honest.');
  }
})();
