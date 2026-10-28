// Layout captures of the app through Expo web (CUL-1895 spike).
//
//   scripts/web-capture/build.sh <dist>
//   node --experimental-strip-types scripts/web-capture/capture.mjs <dist> <out-dir>
//
// Signs in as the fixture account (a fake session against a host that cannot resolve),
// answers every Supabase request from scripts/web-capture/fixtureRest.ts, freezes the
// clock at NOW so every row and every "today" is the same on every run, and photographs
// each screen at each width. Playwright comes from the container's global install.
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { serve } from './serve.mjs';
import { buildFixtureTables, answerRest, captureFlagRows, CAPTURE_DEFAULT_NOW, FIXTURE_USER_ID, FIXTURE_EMAIL } from './fixtureRest.ts';

const require = createRequire(process.env.PLAYWRIGHT_REQUIRE_FROM ?? '/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');

const [dist, outDir] = process.argv.slice(2).map((p) => resolve(p));
if (!dist || !outDir) throw new Error('usage: capture.mjs <dist> <out-dir>');

const NOW = Date.parse(process.env.CAPTURE_NOW ?? CAPTURE_DEFAULT_NOW);
const HOST = 'https://fixture.nyx-capture.invalid';
const tables = buildFixtureTables(NOW);
// app_config flags, for capturing a build from before a rollout went GA
// (e.g. CAPTURE_FLAGS='{"history_v2":true}'). Unset, the app reads its own defaults.
tables.app_config = captureFlagRows(process.env.CAPTURE_FLAGS);
// Home's Signal (CUL-2150): the ai_signals rows signals.deno.ts computed with the shipped
// engine over these same rows. Without them Home photographs the Signal's building state.
// A file computed at another instant or under other flags describes a different record, so
// it is refused rather than served.
if (process.env.CAPTURE_SIGNALS) {
  const seeded = JSON.parse(await readFile(process.env.CAPTURE_SIGNALS, 'utf8'));
  if (Date.parse(seeded.nowIso) !== NOW) {
    throw new Error(`CAPTURE_SIGNALS was computed at ${seeded.nowIso}, not at this run's ${new Date(NOW).toISOString()}`);
  }
  if (JSON.stringify(seeded.flagRows ?? []) !== JSON.stringify(tables.app_config)) {
    throw new Error('CAPTURE_SIGNALS was computed under different CAPTURE_FLAGS');
  }
  tables.ai_signals = seeded.ai_signals;
} else {
  console.log('CAPTURE_SIGNALS unset: Home shows the Signal building state, not its lead');
}

const ONLY = process.env.CAPTURE_ONLY?.split(',');

function b64url(o) {
  return Buffer.from(JSON.stringify(o)).toString('base64url');
}
const exp = Math.floor(NOW / 1000) + 365 * 86400;
const user = {
  id: FIXTURE_USER_ID, aud: 'authenticated', role: 'authenticated', email: FIXTURE_EMAIL,
  app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date(NOW - 60 * 86400e3).toISOString(),
};
const accessToken = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: user.id, aud: 'authenticated', role: 'authenticated', exp, email: user.email })}.fixture`;
const session = { access_token: accessToken, refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 365 * 86400, expires_at: exp, user };

const pet = (key) => tables.pets.find((p) => p.name.toLowerCase() === key);

// ── The incident screen's read states (CUL-1912) ─────────────────────────────────────
// The fixture story writes no read and no photo (fixtureStory.ts, WHAT IT NEVER WRITES), so
// `incident-juniper` is a photoless vomit with no read, and the states a design pass on that
// screen must be seen in never reach a capture. Three capture-only vomits carry a photo and a
// read: a Worth a call, a Keep an eye out with its findings, and a photo the server did not read
// under a no. They sit 400 days back, outside every window a Home, History or Patterns shot
// reads, and outside the Signal (signals.deno.ts computes from the fixture alone). The consent
// answer is served per shot, so every other shot still photographs the fixture's own account.
const READ_STATE_AT = new Date(NOW - 400 * 86400e3).toISOString();
const PHOTO_PATH = '/object/sign/fixture-photo.svg?token=fixture';
const PHOTO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><defs><radialGradient id="g" cx="50%" cy="55%" r="40%">' +
  '<stop offset="0" stop-color="#D8B56A"/><stop offset="1" stop-color="#9E8F7E"/></radialGradient></defs>' +
  '<rect width="800" height="600" fill="url(#g)"/></svg>';
const READ_STATES = [
  {
    eventId: 'c1912000-0000-4000-8000-000000000001',
    analysis: {
      status: 'completed', recommendation: 'worth_a_call', tier: 'call_today',
      read_text: 'I can see what looks like fresh red blood in this one.',
      colour: 'yellow', consistency: 'foamy', contents: ['bile'], blood_present: 'fresh_red',
      foreign_material_present: 'no', visual_flags: ['blood'],
    },
    consent: true,
  },
  {
    eventId: 'c1912000-0000-4000-8000-000000000002',
    analysis: {
      status: 'completed', recommendation: 'monitor', tier: 'logged',
      read_text: "This one doesn't show anything that stands out on its own.",
      colour: 'yellow', consistency: 'foamy', contents: ['bile'], blood_present: 'none_visible',
      foreign_material_present: 'no', visual_flags: [],
    },
    consent: true,
  },
  {
    eventId: 'c1912000-0000-4000-8000-000000000003',
    analysis: { status: 'read_disabled', recommendation: null, tier: null, read_text: null, ai_raw_payload: null },
    consent: false,
  },  {
    // A row with no verdict on it: the branch an unsynced photo or a watch that gave up
    // reaches (CUL-820's frame).
    eventId: 'c1912000-0000-4000-8000-000000000004',
    analysis: { status: 'completed', recommendation: null, tier: null, read_text: null, ai_raw_payload: null },
    consent: true,
  },
];
for (const [i, r] of READ_STATES.entries()) {
  const at = new Date(Date.parse(READ_STATE_AT) + i * 3600e3).toISOString();
  tables.events.push({
    id: r.eventId, pet_id: pet('juniper').id, event_type: 'vomit', occurred_at: at, severity: null, notes: null,
    source: 'manual', occurred_at_source: 'manual', occurred_at_confidence: 'witnessed',
    occurred_at_earliest: null, occurred_at_latest: null, logged_via: 'app', deleted_at: null,
    // A minute before now, like every fixture row, so the first watermark pull takes it.
    created_at: at, updated_at: new Date(NOW - 60e3).toISOString(),
  });
  (tables.event_attachments ??= []).push({
    id: r.eventId.replace(/\d$/, (d) => `a${d}`), event_id: r.eventId, pet_id: pet('juniper').id,
    storage_path: `fixture/${r.eventId}.jpg`, mime_type: 'image/jpeg', deleted_at: null, created_at: at,
    updated_at: new Date(NOW - 60e3).toISOString(),
  });
}
// What a shot overlays on the served tables: the read rows always (they are fetched only by
// the record that owns them), and the consent answer only for the read-state shots.
let shotOverlay = {};
const readStateOverlay = (consent) => ({
  event_ai_analysis: READ_STATES.map((r) => ({
    event_id: r.eventId, pet_id: pet('juniper').id, incident_type: 'vomit', description: null, consistency: null,
    colour: null, contents: null, blood_present: null, bile_present: null, foreign_material_present: null,
    foreign_material_note: null, edited_at: null, dismissed_at: null, error: null, engine_flags: null,
    call_said_at: null, may_wait: null, may_wait_decided_at: null, photo_set_key: null,
    updated_at: READ_STATE_AT, ...r.analysis,
    // The model's payload is the read's own fields, so nothing reads as an owner edit.
    ai_raw_payload: r.analysis.status === 'completed' ? { ...r.analysis } : null,
  })),
  ai_consent: [{
    user_id: FIXTURE_USER_ID, scope: 'ai_boundary', granted: consent, copy_version: '2026-10-12',
    source: 'settings', decided_at: READ_STATE_AT,
  }],
});
const latestOf = (petId, type) =>
  tables.events.filter((e) => e.pet_id === petId && e.event_type === type).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))[0];
const firstVomit = (petId) =>
  tables.events.filter((e) => e.pet_id === petId && e.event_type === 'vomit').sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))[0];

// Each shot: which pet is active and how to reach the screen. Every shot launches on
// Home and then moves the way an owner would (a tab, a link, a client-side push), because
// a cold deep link skips the tab layout that loads the pets and renders a pet-less screen
// no owner can reach.
const tab = (name) => (page) => page.getByText(name, { exact: true }).last().click({ timeout: 8000 });
const link = (text) => (page) => page.getByText(text).first().click({ timeout: 8000 });
const label = (text) => (page) => page.getByLabel(text).first().click({ timeout: 8000 });
const push = (path) => (page) =>
  page.evaluate((p) => {
    window.history.pushState({}, '', p);
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
  }, path);

const SHOTS = [
  { name: 'home-juniper', pet: 'juniper', go: [] },
  { name: 'home-miso', pet: 'miso', go: [] },
  { name: 'home-pepper', pet: 'pepper', go: [] },
  { name: 'history-pepper', pet: 'pepper', go: [tab('History')] },
  { name: 'incident-juniper', pet: 'juniper', go: [() => {}, (page) => push(`/event/${firstVomit(pet('juniper').id).id}`)(page)] },
  // CUL-1909: the event editor, reached the one way an owner reaches it (the record's Edit).
  { name: 'edit-vomit-juniper', pet: 'juniper', go: [() => {}, (page) => push(`/event/${firstVomit(pet('juniper').id).id}`)(page), link(/^Edit$/)] },
  { name: 'edit-meal-juniper', pet: 'juniper', go: [() => {}, (page) => push(`/event/${latestOf(pet('juniper').id, 'meal').id}`)(page), link(/^Edit$/)] },
  { name: 'patterns-juniper', pet: 'juniper', go: [link(/^Patterns/)] },
  // CUL-1912: the incident screen's read states (see READ_STATES above).
  { name: 'incident-call-juniper', pet: 'juniper', overlay: readStateOverlay(true), go: [() => {}, push(`/event/${READ_STATES[0].eventId}`)] },
  { name: 'incident-watch-juniper', pet: 'juniper', overlay: readStateOverlay(true), go: [() => {}, push(`/event/${READ_STATES[1].eventId}`)] },
  { name: 'incident-off-juniper', pet: 'juniper', overlay: readStateOverlay(false), go: [() => {}, push(`/event/${READ_STATES[2].eventId}`)] },
  { name: 'incident-unread-juniper', pet: 'juniper', overlay: readStateOverlay(true), go: [() => {}, push(`/event/${READ_STATES[3].eventId}`)] },
  // CUL-1282's path: a tap on an earlier day in History's week strip must bring the
  // list to that day (Sunday the 11th, three cards down, past the 21-row long day).
  { name: 'history-strip-tap-pepper', pet: 'pepper', go: [tab('History'), (page) => page.getByText('11', { exact: true }).first().click({ timeout: 8000 })] },
  // CUL-2243: a Modal presents outside the column, so two sheets are photographed open: the
  // pet switcher and a ScopeMenu (History's date range, the pill every text size can reach).
  // The log sheet is not: the FAB's fan does not open on the web build.
  { name: 'pet-switcher-juniper', pet: 'juniper', go: [label(/^Switch pet/)] },
  { name: 'scope-menu-pepper', pet: 'pepper', go: [tab('History'), label(/^Date range/)] },
];

// Each size the run photographs, as `W[xH][@text]` (CUL-2237): a width alone keeps the
// 844pt height every capture used before. Text multipliers are RN's own iOS table
// (React/CoreModules/RCTAccessibilityManager.mm): xxxLarge is the largest size in
// Settings > Display > Text Size, AX5 the largest with Larger Accessibility Sizes on.
// The defaults add the SE (375x667), the folded Duo (466x678) and the unfolded Duo both
// ways (626x890, 890x626); Duo points are pixels / 3, since Apple has not published them.
const SIZES = (process.env.CAPTURE_SIZES ?? '320@1,375x667@1,390@1,466x678@1,626x890@1,890x626@1,390@3.571,320@3.571').split(',').map((s) => {
  const [dims, f] = s.split('@');
  const [w, h] = dims.split('x');
  const scale = Number(f ?? 1);
  const text = scale === 1 ? '' : `-text${scale === 3.571 ? 'AX5' : scale === 1.353 ? 'xxxL' : scale}`;
  return { width: Number(w), height: Number(h ?? 844), scale, label: `${dims}${text}` };
});

async function captureSize(browser, size, server, shots) {
  const port = server.address().port;
  const settle = Number(process.env.CAPTURE_SETTLE_MS ?? 6000);
  const notes = [];
  const log = (m) => notes.push(m);
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: 2,
    timezoneId: 'UTC',
    locale: 'en-US',
  });
  await context.clock.setFixedTime(NOW);
  await context.addInitScript(
    ({ key, session, scale, storage }) => {
      localStorage.setItem('securestore:' + key, JSON.stringify(session));
      for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, v);
      globalThis.__NYX_FONT_SCALE = scale;
    },
    // CAPTURE_STORAGE seeds device-local state (AsyncStorage is localStorage on web), e.g.
    // an older build's beta opt-ins: '{"culprit.betaOptIns.v1":"{\\"history_v2\\":true}"}'.
    { key: 'sb-fixture-auth-token', session, scale: size.scale, storage: JSON.parse(process.env.CAPTURE_STORAGE ?? '{}') },
  );
  // Realtime would open a socket to the fixture host; there is nothing to say on it.
  await context.routeWebSocket(/fixture\.nyx-capture\.invalid/, (ws) => ws.close());
  await context.route(`${HOST}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' };
    if (url.pathname.startsWith('/rest/v1/')) {
      const a = answerRest({ ...tables, ...shotOverlay }, req.method(), url, req.headers()['accept'] ?? '');
      if (process.env.CAPTURE_DEBUG) log(`${req.method()} ${url.pathname}${url.search.slice(0, 160)} -> ${a.status} ${a.body.length}b`);
      return route.fulfill({ status: a.status, contentType: 'application/json', body: a.body, headers: { ...cors, ...(a.headers ?? {}) } });
    }
    // The read-state records' photo: every signing request answers one path, and that path
    // answers a drawn photo (CUL-1912). Nothing else under /storage is served.
    if (url.pathname.startsWith('/storage/v1/object/sign/fixture-photo.svg')) {
      return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: PHOTO_SVG, headers: cors });
    }
    if (req.method() === 'POST' && url.pathname.startsWith('/storage/v1/object/sign/')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signedURL: PHOTO_PATH }), headers: cors });
    }
    if (url.pathname.startsWith('/auth/v1/user')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user), headers: cors });
    }
    if (url.pathname.startsWith('/auth/v1/token')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session), headers: cors });
    }
    log(`unanswered ${req.method()} ${url.pathname}`);
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}', headers: cors });
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => log(`pageerror ${e.message.slice(0, 300)}`));
  page.on('console', (m) => {
    if (m.type() === 'error' || (process.env.CAPTURE_DEBUG && m.type() === 'warning')) log(`console.${m.type()} ${m.text().slice(0, 300)}`);
  });

  // Two warm-up launches. The first builds the schema while its own screens race it
  // (a phone's first launch does the same, faster); the second hydrates the fixture
  // into SQLite, which OPFS keeps for the context. Every capture after is a warm launch.
  for (let i = 0; i < 2; i++) {
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForTimeout(settle * (i + 1));
  }
  if (!process.env.CAPTURE_DEBUG) notes.length = 0;

  const files = [];
  for (const shot of shots) {
    shotOverlay = shot.overlay ?? {};
    await page.evaluate((id) => localStorage.setItem('nyx.activePetId', id), pet(shot.pet).id);
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForTimeout(settle);
    let failed = false;
    for (const step of shot.go) {
      try {
        await step(page);
      } catch (e) {
        log(`${shot.name}: could not reach the screen (${String(e.message).split('\n')[0]})`);
        failed = true;
        break;
      }
      await page.waitForTimeout(settle / 2);
    }
    const file = `${outDir}/${shot.name}-${size.label}${failed ? '-UNREACHED' : ''}.png`;
    await page.screenshot({ path: file });
    files.push(file);
  }
  await context.close();
  return { files, notes };
}

await mkdir(outDir, { recursive: true });
const server = await serve(dist);
const browser = await chromium.launch();
try {
  const shots = SHOTS.filter((s) => !ONLY || ONLY.includes(s.name));
  for (const size of SIZES) {
    const { files, notes } = await captureSize(browser, size, server, shots);
    for (const f of files) console.log(f);
    for (const n of [...new Set(notes)].slice(0, Number(process.env.CAPTURE_NOTES ?? 12))) console.log('   ', n);
  }
} finally {
  await browser.close();
  server.close();
}
