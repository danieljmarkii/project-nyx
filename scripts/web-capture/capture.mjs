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

// Every scroll on the page at its end: on web a ScrollView is an overflowing element.
const toEnd = (page) =>
  page.evaluate(() => {
    for (const el of document.querySelectorAll('*')) {
      const y = getComputedStyle(el).overflowY;
      if ((y === 'auto' || y === 'scroll') && el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight;
    }
  });

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
  // CUL-2246: Home at the end of its scroll, where the + must clear the last card's last
  // row at every height (Home's bottom inset, lib/fabFootprint.ts).
  { name: 'home-end-juniper', pet: 'juniper', go: [toEnd] },
];

// ── The every-size sweep (CUL-2244, CUL-2245): behind CAPTURE_SET=all ─────────────────
// The default set above is what every PR touching a screen photographs. The sweep adds every
// route the Every iPhone sweeps walk, so a run with CAPTURE_SET=all photographs the whole app
// at each size; a PR run keeps its time. Each sweep group gets a browser context of its own,
// so its rows and flags never reach the default shots' local store (OPFS is per context).
//
// The fixture writes no vet record, so the vet routes get capture-only rows: one visit three
// weeks back with a two-page document, one booking three days out, and one "I've called" on
// Juniper's latest vomit. They are served only to the sweep context.
const SWEEP_DAY = (d) => new Date(NOW + d * 86400e3).toISOString().slice(0, 10);
const SWEEP_AT = (d, h = 12) => new Date(Date.parse(`${SWEEP_DAY(d)}T00:00:00Z`) + h * 3600e3).toISOString();
const SWEEP = {
  visitId: 'c2245000-0000-4000-8000-000000000001',
  appointmentId: 'c2245000-0000-4000-8000-000000000002',
  callId: 'c2245000-0000-4000-8000-000000000003',
  documentGroupId: 'c2245000-0000-4000-8000-000000000004',
};
const SWEEP_FLAGS = [
  { key: 'paywall_enabled', value: true },
  { key: 'ask_enabled', value: { enabled: true } },
  { key: 'engines_v3_en14', value: { enabled: true } },
];
function sweepTables() {
  const j = pet('juniper').id;
  const stamp = new Date(NOW - 60e3).toISOString();
  const vomit = firstVomit(j);
  return {
    vet_visits: [{
      id: SWEEP.visitId, pet_id: j, visited_at: SWEEP_DAY(-21), clinic_name: 'Northside Animal Clinic',
      vet_name: 'Dr. Okafor', reason: 'Vomiting on and off for two weeks', notes: 'Bloods taken. Start the trial diet.',
      next_visit_at: SWEEP_DAY(3), deleted_at: null, created_at: SWEEP_AT(-21), updated_at: stamp,
    }],
    vet_documents: [0, 1].map((page) => ({
      id: `c2245000-0000-4000-8000-00000000001${page}`, pet_id: j, vet_visit_id: SWEEP.visitId,
      document_group_id: SWEEP.documentGroupId, kind: 'lab_result', title: 'Blood panel', document_date: SWEEP_DAY(-21),
      notes: null, source: 'camera', source_filename: null, storage_path: `${j}/c2245-doc-${page}.jpg`,
      mime_type: 'image/jpeg', file_size_bytes: 240000, page_index: page, deleted_at: null,
      created_at: SWEEP_AT(-21, 14), updated_at: stamp,
    })),
    vet_appointments: [{
      id: SWEEP.appointmentId, pet_id: j, scheduled_at: SWEEP_AT(3, 15), clinic_name: 'Northside Animal Clinic',
      vet_name: 'Dr. Okafor', reason: 'Trial recheck', questions: ['Is the vomiting slowing down enough?'],
      notes_draft: null, vet_visit_id: null, cancelled_at: null, deleted_at: null, created_at: SWEEP_AT(-21, 15), updated_at: stamp,
    }],
    vet_calls: [{
      id: SWEEP.callId, pet_id: j, called_on: vomit.occurred_at.slice(0, 10), event_id: vomit.id, note: null,
      supersedes: null, withdrawn: false, covers_rank: null, covers_from: null, created_at: stamp,
    }],
    // The gated routes the sweep walks, on for the fixture account in this context only.
    // They replace a CAPTURE_FLAGS row of the same key rather than sitting beside it.
    app_config: [
      ...tables.app_config.filter((r) => !SWEEP_FLAGS.some((f) => f.key === r.key)),
      ...SWEEP_FLAGS,
    ],
  };
}
const REPORT_STAND_IN = {
  html: '<!doctype html><html><body style="font-family:sans-serif;padding:24px;color:#555">' +
    '<p>Capture stand-in: the report body is rendered by generate-report, which the capture path does not run.</p></body></html>',
  pet_name: 'Juniper', start_date: SWEEP_DAY(-90), end_date: SWEEP_DAY(0), scope_basis: 'default', photo_count: 0,
};
const SWEEP_SHOTS = [
  // The vet routes last, so the warm launches have the longest to hydrate their rows.
  { name: 'report-juniper', go: [push('/report')] },
  { name: 'ask-juniper', go: [push('/ask')] },
  // Onboarding, as the signed-in fixture account (each step reads the active pet).
  // Pet name reads the draft's species and sends a cold arrival back to the first step, so
  // it is reached the way the flow reaches it.
  ...['pet-type', 'pet-breed', 'pet-gender', 'pet-age', 'disclaimer', 'paywall', 'done'].map((step) => ({
    name: `onboarding-${step}`, go: [push(`/onboarding/${step}`)],
  })),
  { name: 'onboarding-pet-name', go: [push('/onboarding/pet-type'), link(/^Dog$/), link(/^Continue$/)] },
  { name: 'vet-visits-juniper', go: [push('/vet-visits')] },
  { name: 'vet-visit-juniper', go: [push(`/vet-visits/${SWEEP.visitId}`)] },
  { name: 'vet-visit-after-juniper', go: [push(`/vet-visits/after?appointment=${SWEEP.appointmentId}`)] },
  { name: 'vet-visit-at-the-vet-juniper', go: [push(`/vet-visits/at-the-vet?appointment=${SWEEP.appointmentId}`)] },
  { name: 'vet-visit-edit-appointment-juniper', go: [push(`/vet-visits/edit-appointment?appointment=${SWEEP.appointmentId}`)] },
  { name: 'vet-visit-edit-juniper', go: [push(`/vet-visits/edit?visit=${SWEEP.visitId}`)] },
  { name: 'vet-files-juniper', go: [push('/vet-files')] },
  { name: 'vet-document-juniper', go: [push(`/vet-document/${SWEEP.documentGroupId}`)] },
  { name: 'vet-call-juniper', go: [push(`/vet-call/${SWEEP.callId}`)] },
  { name: 'rundown-juniper', go: [push(`/rundown?appointmentId=${SWEEP.appointmentId}`)] },
].map((s) => ({ pet: 'juniper', group: 'sweep', ...s }));
// Signed out: a context with no stored session, so the app lands on the Landing.
const SIGNED_OUT_SHOTS = [
  { name: 'auth-landing', go: [] },
  // The Landing's own doors, as an owner reaches them: a push from the Landing does not move.
  { name: 'auth-how-it-works', go: [link('See how it works')] },
  { name: 'auth-signup', go: [link(/^Create account$/)] },
  { name: 'auth-login', go: [link(/^Log in$/)] },
  { name: 'auth-forgot-password', go: [link(/^Log in$/), link(/^Forgot/)] },
  { name: 'auth-confirm', go: [push('/confirm')] },
  { name: 'auth-reset-password', go: [push('/reset-password')] },
].map((s) => ({ pet: 'juniper', group: 'signedOut', ...s }));
// Sweep 1 (CUL-2244): logging, the record, capture, Foods, the trial, Pet, settings and
// Patterns' own routes. Patterns' index and the event editor are already default shots
// (`patterns-juniper`, `edit-*-juniper`, `incident-juniper`), so they are not repeated here.
// The fixture writes no medication, so one capture-only drug row stands behind the
// medication screen, served to this group's context only.
const SWEEP1_MEDICATION_ID = 'c2244000-0000-4000-8000-000000000001';
function sweep1Tables() {
  return {
    medication_items: [{
      id: SWEEP1_MEDICATION_ID, generic_name: 'Maropitant', brand_name: 'Cerenia', strength: '16 mg',
      form: 'tablet', default_route: 'oral', is_prescription: true, is_critical: false, photo_paths: [],
      notes: null, created_by_user_id: FIXTURE_USER_ID, archived_at: null,
      created_at: new Date(NOW - 30 * 86400e3).toISOString(), updated_at: new Date(NOW - 60e3).toISOString(),
    }],
  };
}
const trialFoodOf = (key) => tables.diet_trial_foods.find((f) => f.pet_id === pet(key).id).food_item_id;
// Home's lead card is the door to its finding's screen, the way an owner arrives. Its title
// is Juniper's fixture lead, which signals.deno.ts refuses to compute when it moves.
const openLead = link(/^Vomiting between/);
const SWEEP1_SHOTS = [
  { name: 'log-juniper', go: [push('/log')] },
  { name: 'mix-miso', pet: 'miso', go: [() => {}, (page) => push(`/mix?event=${latestOf(pet('miso').id, 'meal').id}&pet=${pet('miso').id}&from=detail`)(page)] },
  { name: 'event-meal-juniper', go: [() => {}, (page) => push(`/event/${latestOf(pet('juniper').id, 'meal').id}`)(page)] },
  { name: 'day-summary-juniper', go: [push('/day-summary')] },
  { name: 'food-capture', go: [push('/food-capture')] },
  { name: 'medication-capture', go: [push('/medication-capture')] },
  { name: 'food-juniper', go: [() => {}, (page) => push(`/food/${trialFoodOf('juniper')}`)(page)] },
  { name: 'medication-juniper', go: [push(`/medication/${SWEEP1_MEDICATION_ID}`)] },
  { name: 'foods-juniper', go: [tab('Foods')] },
  { name: 'trial-foods-juniper', go: [() => {}, (page) => push(`/trial-foods?pet=${pet('juniper').id}`)(page)] },
  { name: 'trial-exposures-juniper', go: [() => {}, (page) => push(`/trial-exposures?pet=${pet('juniper').id}`)(page)] },
  { name: 'trial-juniper', go: [() => {}, (page) => push(`/trial/${pet('juniper').id}`)(page)] },
  { name: 'profile-juniper', go: [label(/pet profile$/)] },
  { name: 'add-pet', go: [push('/add-pet')] },
  { name: 'archived-pets', go: [push('/archived-pets')] },
  { name: 'weight-history-juniper', go: [() => {}, (page) => push(`/weight-history?petId=${pet('juniper').id}`)(page)] },
  { name: 'settings', go: [push('/settings')] },
  ...['ai-reading', 'beta', 'feedback', 'notifications', 'password'].map((s) => ({ name: `settings-${s}`, go: [push(`/settings/${s}`)] })),
  { name: 'patterns-metric-juniper', go: [push('/insights/vomit')] },
  { name: 'patterns-timing-juniper', go: [push('/insights/timing')] },
  { name: 'patterns-trial-juniper', go: [push('/insights/trial')] },
  { name: 'signal-juniper', go: [openLead] },
].map((s) => ({ pet: 'juniper', group: 'sweep1', ...s }));

const CAPTURE_SET = process.env.CAPTURE_SET ?? 'pr';
if (!['pr', 'all'].includes(CAPTURE_SET)) throw new Error(`CAPTURE_SET is pr or all, not ${CAPTURE_SET}`);

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

async function captureSize(browser, size, server, shots, group) {
  // A group's rows: the sweep's capture-only vet record and flags on top of the fixture.
  const served = group === 'sweep' ? { ...tables, ...sweepTables() } : group === 'sweep1' ? { ...tables, ...sweep1Tables() } : tables;
  const signedIn = group !== 'signedOut';
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
      if (session) localStorage.setItem('securestore:' + key, JSON.stringify(session));
      for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, v);
      globalThis.__NYX_FONT_SCALE = scale;
    },
    // CAPTURE_STORAGE seeds device-local state (AsyncStorage is localStorage on web), e.g.
    // an older build's beta opt-ins: '{"culprit.betaOptIns.v1":"{\\"history_v2\\":true}"}'.
    { key: 'sb-fixture-auth-token', session: signedIn ? session : null, scale: size.scale, storage: JSON.parse(process.env.CAPTURE_STORAGE ?? '{}') },
  );
  // Realtime would open a socket to the fixture host; there is nothing to say on it.
  await context.routeWebSocket(/fixture\.nyx-capture\.invalid/, (ws) => ws.close());
  await context.route(`${HOST}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' };
    if (url.pathname.startsWith('/rest/v1/')) {
      const a = answerRest({ ...served, ...shotOverlay }, req.method(), url, req.headers()['accept'] ?? '');
      if (process.env.CAPTURE_DEBUG) log(`${req.method()} ${url.pathname}${url.search.slice(0, 160)} -> ${a.status} ${a.body.length}b`);
      return route.fulfill({ status: a.status, contentType: 'application/json', body: a.body, headers: { ...cors, ...(a.headers ?? {}) } });
    }
    // The read-state records' photo: every signing request answers one path, and that path
    // answers a drawn photo (CUL-1912). Nothing else under /storage is served.
    if (url.pathname.startsWith('/storage/v1/object/sign/fixture-photo.svg')) {
      return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: PHOTO_SVG, headers: cors });
    }
    if (req.method() === 'POST' && url.pathname.startsWith('/storage/v1/object/sign/')) {
      // A batch (`createSignedUrls`, the vet documents' pages) posts its paths and wants a row each.
      let paths = null;
      try {
        paths = req.postDataJSON()?.paths;
      } catch {
        // Not JSON: answered as a single signing, as before.
      }
      const body = Array.isArray(paths)
        ? paths.map((path) => ({ path, signedURL: PHOTO_PATH, error: null }))
        : { signedURL: PHOTO_PATH };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body), headers: cors });
    }
    // The vet report's body is the server's HTML (generate-report), which this path does not
    // run, and its WebView has no web build anyway: a stand-in answer lets the screen reach
    // its loaded frame (range, toggle, Send), which is the layout the sweep checks.
    if (group === 'sweep' && url.pathname === '/functions/v1/generate-report') {
      return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(REPORT_STAND_IN) });
    }
    if (!signedIn && url.pathname.startsWith('/auth/v1/')) {
      return route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"no session"}', headers: cors });
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
  // The sweep's vet rows hydrate after the fixture's events, late in the cycle, so its
  // context takes one more warm launch before its first shot (CUL-2245).
  for (let i = 0; i < (group === 'sweep' ? 3 : 2); i++) {
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
  const all = [...SHOTS, ...(CAPTURE_SET === 'all' ? [...SWEEP_SHOTS, ...SIGNED_OUT_SHOTS, ...SWEEP1_SHOTS] : [])];
  const shots = all.filter((s) => !ONLY || ONLY.includes(s.name));
  for (const size of SIZES) {
    for (const group of ['default', 'sweep', 'signedOut', 'sweep1']) {
      const inGroup = shots.filter((s) => (s.group ?? 'default') === group);
      if (inGroup.length === 0) continue;
      const { files, notes } = await captureSize(browser, size, server, inGroup, group);
      for (const f of files) console.log(f);
      for (const n of [...new Set(notes)].slice(0, Number(process.env.CAPTURE_NOTES ?? 12))) console.log('   ', n);
    }
  }
} finally {
  await browser.close();
  server.close();
}
