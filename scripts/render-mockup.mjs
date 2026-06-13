// One-off mockup → PNG renderer for docs/mockups/*.html (the Calm/Linear/Oura
// mockup convention). puppeteer is intentionally NOT a project dependency (heavy,
// bundles Chromium); install it transiently before rendering:
//   npm install --no-save puppeteer
// Usage:
//   node scripts/render-mockup.mjs <input.html> <output.png> [widthPx]
// Renders the full page (full board) at a 2x device scale for a crisp artifact,
// waiting for the Google-fonts (Geist + Newsreader) to settle so the display
// face is correct in the capture.
import puppeteer from 'puppeteer';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const [, , inArg, outArg, widthArg] = process.argv;
if (!inArg || !outArg) {
  console.error('usage: node scripts/render-mockup.mjs <input.html> <output.png> [widthPx]');
  process.exit(1);
}
const inPath = resolve(inArg);
const outPath = resolve(outArg);
const width = Number(widthArg) || 1320;

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width, height: 1200, deviceScaleFactor: 2 });
  await page.goto(pathToFileURL(inPath).href, { waitUntil: 'networkidle0', timeout: 60000 });
  // Belt-and-suspenders: ensure the webfonts are actually ready before capture.
  await page.evaluate(async () => { if (document.fonts && document.fonts.ready) await document.fonts.ready; });
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: outPath, fullPage: true });
  console.log('wrote', outPath);
} finally {
  await browser.close();
}
