// Render a design mock for /design-critique (CUL-1176) so every lens reads the same pixels.
//
//   node scripts/design-critique/render.mjs <mock.html> <outDir> [--frames "<css>"] [--buttons "<css>"] [--max-buttons N]
//
// Writes into <outDir>:
//   - the whole page at 390 and 1280 wide, with Reduce Motion on and off;
//   - every frame (default selector ".phone, .frame", the classes the culprit-*-mockups.html
//     pages use) with every <details> opened, Reduce Motion on and off;
//   - every demo button pressed on a fresh load, so no demo leaks into the next
//     (Reduce Motion: the settled state; motion on: 250ms in, and settled);
//   - page.txt (the page's text) and MANIFEST.md (what each PNG shows, the page errors,
//     and whether the page scrolls sideways at 390).
// Look at the shots yourself before convening a lens, and add bespoke shots for the
// states the defaults miss (the CUL-1108 critique needed a long list scrolled one
// viewport at a time).
//
// Why not scripts/render-mockup.mjs: that renders one full-page PNG for presenting a
// board. A critique needs per-frame, per-state, per-motion evidence and a manifest.
//
// Playwright is deliberately not a project dependency. The cloud container ships it
// globally with Chromium in /opt/pw-browsers (PLAYWRIGHT_BROWSERS_PATH); elsewhere run
// `npm install --no-save playwright && npx playwright install chromium`. Set
// CHROMIUM_PATH to point at a specific Chromium build.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : dflt;
};
const positional = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
const [inArg, outArg] = positional;
if (!inArg || !outArg) {
  console.error('usage: node scripts/design-critique/render.mjs <mock.html> <outDir> [--frames "<css>"] [--buttons "<css>"] [--max-buttons N]');
  process.exit(1);
}
const FRAMES = opt('frames', '.phone, .frame');
const BUTTONS = opt('buttons', 'button');
const MAX_BUTTONS = Number(opt('max-buttons', '40'));
const MAX_FRAMES = 80;

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  try {
    return require('playwright');
  } catch {
    const globalRoot = execSync('npm root -g').toString().trim();
    return require(join(globalRoot, 'playwright'));
  }
}
const { chromium } = loadPlaywright();

const file = pathToFileURL(resolve(inArg)).href;
const out = resolve(outArg);
mkdirSync(out, { recursive: true });
const manifest = [];
const errors = [];
const add = (name, what) => manifest.push(`- ${name}: ${what}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (s, n = 40) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, n) || 'x';

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  // A fresh context per state: nothing a previous load did can leak into the next shot.
  const open = async (width, reduced) => {
    const ctx = await browser.newContext({
      viewport: { width, height: width < 800 ? 900 : 1600 },
      deviceScaleFactor: 2,
      reducedMotion: reduced ? 'reduce' : 'no-preference',
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${width}px ${reduced ? 'reduced' : 'motion'}: ${String(e).slice(0, 300)}`));
    await page.goto(file, { waitUntil: 'networkidle', timeout: 60000 });
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
    });
    await wait(reduced ? 600 : 2500); // let a first paint's motion settle
    return { ctx, page };
  };

  // 1. The whole page at both widths, Reduce Motion on and off.
  let overflow390 = 0;
  let text = '';
  for (const width of [390, 1280]) {
    for (const reduced of [true, false]) {
      const { ctx, page } = await open(width, reduced);
      const name = `page-${width}-${reduced ? 'reduced' : 'motion'}.png`;
      await page.screenshot({ path: join(out, name), fullPage: true });
      add(name, `the whole page, ${width}px wide, ${reduced ? 'Reduce Motion on' : 'motion on, settled'}`);
      if (width === 390 && reduced) overflow390 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (width === 1280 && reduced) text = await page.evaluate(() => document.body.innerText);
      await ctx.close();
    }
  }
  writeFileSync(join(out, 'page.txt'), text);

  // 2. Every frame, with every <details> opened, Reduce Motion on and off.
  for (const reduced of [true, false]) {
    const { ctx, page } = await open(1280, reduced);
    await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
    await wait(400);
    const frames = await page.$$(FRAMES);
    if (frames.length > MAX_FRAMES && reduced) manifest.push(`- NOTE: ${frames.length} frames matched "${FRAMES}"; only the first ${MAX_FRAMES} were shot`);
    let i = 0;
    for (const el of frames.slice(0, MAX_FRAMES)) {
      if (!(await el.isVisible())) continue;
      // Name a frame by its own id or heading, else the nearest caption or heading around it.
      const label = await el.evaluate((n) => {
        const own = n.querySelector('h1, h2, h3, h4, .tag, figcaption');
        let around = '';
        for (let a = n.parentElement, k = 0; a && k < 5 && !around; a = a.parentElement, k += 1) {
          const h = a.querySelector('h2, h3, h4, figcaption, .frame-cap, .cap');
          if (h) around = h.textContent;
        }
        const named = n.closest('[id]');
        return n.id || n.getAttribute('aria-label') || (own && own.textContent) || around || (named && named.id) || '';
      });
      i += 1;
      const name = `frame-${String(i).padStart(2, '0')}-${slug(label)}-${reduced ? 'reduced' : 'motion'}.png`;
      await el.scrollIntoViewIfNeeded();
      await wait(reduced ? 150 : 900);
      await el.screenshot({ path: join(out, name) });
      add(name, `frame ${i} ("${(label || '').trim().replace(/\s+/g, ' ').slice(0, 60)}"), ${reduced ? 'Reduce Motion on' : 'motion on'}`);
    }
    if (!i && reduced) manifest.push(`- NOTE: no visible frame matched "${FRAMES}"; re-run with --frames "<selector>"`);
    await ctx.close();
  }

  // 3. Every demo button, pressed on a fresh load.
  const probe = await open(1280, true);
  const labels = await probe.page.$$eval(BUTTONS, (bs) => bs.map((b) => (b.innerText || b.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ')));
  await probe.ctx.close();
  if (labels.length > MAX_BUTTONS) manifest.push(`- NOTE: ${labels.length} buttons matched "${BUTTONS}"; only the first ${MAX_BUTTONS} were pressed`);
  for (let b = 0; b < Math.min(labels.length, MAX_BUTTONS); b++) {
    for (const reduced of [true, false]) {
      const { ctx, page } = await open(1280, reduced);
      const btn = (await page.$$(BUTTONS))[b];
      if (!btn || !(await btn.isVisible())) {
        await ctx.close();
        continue;
      }
      const host = (await btn.evaluateHandle((n) => n.closest('section') || n.parentElement)).asElement();
      await btn.scrollIntoViewIfNeeded();
      await btn.click().catch((e) => errors.push(`pressing "${labels[b]}": ${String(e).slice(0, 200)}`));
      const base = `demo-${String(b + 1).padStart(2, '0')}-${slug(labels[b], 32)}`;
      if (!reduced) {
        await wait(250);
        await host.screenshot({ path: join(out, `${base}-motion-mid.png`) });
        add(`${base}-motion-mid.png`, `after pressing "${labels[b]}", motion on, 250ms in`);
      }
      await wait(reduced ? 600 : 2000);
      const name = `${base}-${reduced ? 'reduced' : 'motion'}-after.png`;
      await host.screenshot({ path: join(out, name) });
      add(name, `after pressing "${labels[b]}", ${reduced ? 'Reduce Motion on' : 'motion on, settled'}`);
      await ctx.close();
    }
  }

  const head = [
    `# Renders of ${inArg}`,
    '',
    `Rendered ${new Date().toISOString()} by scripts/design-critique/render.mjs: headless Chromium at 2x device scale. Frames matched "${FRAMES}"; demo buttons matched "${BUTTONS}"; each demo was pressed on a fresh load. The page text is in page.txt.`,
    '',
    overflow390 > 0 ? `- WARNING: the page scrolls sideways at 390px (${overflow390}px too wide).` : '- No sideways scroll at 390px.',
    errors.length ? `- PAGE ERRORS (${errors.length}):\n${errors.map((e) => `  - ${e}`).join('\n')}` : '- No page errors.',
    '',
    '## Files',
    '',
  ];
  writeFileSync(join(out, 'MANIFEST.md'), [...head, ...manifest, ''].join('\n'));
  console.log(`wrote ${manifest.length} manifest entries to ${join(out, 'MANIFEST.md')}; ${errors.length} page errors`);
} finally {
  await browser.close();
}
