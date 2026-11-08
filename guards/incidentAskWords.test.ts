// The floor's words live in one module, and anything that module does not know gets them
// (Clinical voice row 2, CUL-2667; clinical-guardrails "No literal floor string lives outside
// that module"; tiers spec §2 rule 6).
//
// THREE CHECKS.
//   1. The floor's literal ("call your vet today", any case) appears in CODE (comments blanked,
//      strings and JSX text kept) only in `lib/incidentAskWords.ts`, so no surface can mint its
//      own floor or drop it quietly. One exemption, named and expiring: `lib/incidentTierWords.ts`
//      still holds call today's row, which Ask and generate-signal read until row 3 (CUL-2668)
//      moves the server copy onto the module.
//   2. An unknown reason, tier, trigger or kind renders the floor's words on every surface that
//      picks words by reason, driving the REAL functions (C-34: never a re-derived rule).
//   3. Pattern 11's Never column: no ask any of those surfaces can print carries a condition on
//      the owner's sense of normal, a "can wait" or a vaguer clock.
//
// NOT SCANNED: test files and `guards/` (their fixtures ARE the phrase, C-18); `supabase/functions/`
// (row 3's half, with its own copy guards). STATED BLIND SPOT (C-38): a phrase assembled at
// runtime ('call your vet ' + 'today') is an evasion no source scan can see.

import * as fs from 'fs';
import * as path from 'path';

import { blankComments } from './blankComments';
import {
  allAskStrings,
  DEFERENTIAL_ASK,
  FLOOR_ASK,
} from '../lib/incidentAskWords';
import { incidentReadLabel } from '../lib/incidentReadState';
import { callTodayActionOf } from '../lib/mayWaitLine';
import { stripAskLine, STRIP_ASKS, incidentRedFlagAsk } from '../lib/signalCopy';
import { signalHomeAsk } from '../lib/signalHomeLine';
import { composerAskLevelOf } from '../lib/reportComposer';
import { askRowsFor, sendCallCard } from '../lib/reportSend';
import { allEmergencyStrings } from '../lib/lookEmergency';
import { trialDeclineVetLine } from '../lib/dietTrialCompletion';
import type { SignalFinding } from '../lib/signal';

const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['app', 'components', 'lib', 'store', 'hooks', 'constants', 'widgets'];
const SKIP_DIRS = new Set(['node_modules', '.git', '.expo', 'ios', 'android', 'dist']);

const MODULE = 'lib/incidentAskWords.ts';
/** Each exemption names why it cannot be the module yet. It must still hold a hit (C-32). */
const EXEMPT: Record<string, string> = {
  'lib/incidentTierWords.ts':
    "call today's row in the tier-word map, read by Ask and generate-signal; row 3 (CUL-2668) moves the server onto the module and deletes this entry",
};

export const FLOOR_PHRASE = /call your vet today/i;

function walk(dir: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) out.push(abs);
  }
}

function floorHits(root: string): string[] {
  const files: string[] = [];
  for (const d of SCAN_DIRS) walk(path.join(root, d), files);
  return files
    .filter((abs) => FLOOR_PHRASE.test(blankComments(fs.readFileSync(abs, 'utf8'))))
    .map((abs) => path.relative(root, abs).split(path.sep).join('/'))
    .sort();
}

describe('1. the floor\'s literal lives in the ask module', () => {
  const hits = floorHits(ROOT);

  it('the scan reaches the real tree: the module itself is found (non-vacuity, C-36)', () => {
    expect(hits).toContain(MODULE);
  });

  it('no client file but the module (and its named exemption) says "call your vet today"', () => {
    expect(hits.filter((f) => f !== MODULE && !(f in EXEMPT))).toEqual([]);
  });

  it('every exemption still holds the phrase (C-32)', () => {
    for (const f of Object.keys(EXEMPT)) expect(hits).toContain(f);
  });
});

describe('2. anything the build does not know gets the floor\'s words', () => {
  const tiered = { status: 'completed', recommendation: 'worth_a_call', tier: 'call_today', engine_flags: ['engines_v3_en3'], edited_at: null };

  it('the record: an unknown flag, or reasons the surface was never handed', () => {
    expect(incidentReadLabel({ ...tiered, contextual_flags: ['a_flag_from_the_future'], visual_flags: [] })).toBe(FLOOR_ASK.label);
    expect(incidentReadLabel({ ...tiered, contextual_flags: [], visual_flags: ['a_flag_from_the_future'] })).toBe(FLOOR_ASK.label);
    expect(incidentReadLabel(tiered)).toBe(FLOOR_ASK.label);
    // The control: known, floor-free reasons are deferential.
    expect(incidentReadLabel({ ...tiered, contextual_flags: ['repeated_vomiting'], visual_flags: [] })).toBe(DEFERENTIAL_ASK.label);
  });

  it('the record: a floor sign on an unknown tier is the floor (CUL-2675 (a))', () => {
    expect(incidentReadLabel({ ...tiered, tier: 'call_tomorrow', blood_present: 'fresh_red' })).toBe(FLOOR_ASK.label);
  });

  it('the action line: a caller that names no level gets the floor\'s line', () => {
    expect(callTodayActionOf({ row: null, facts: null, freshRow: null, freshReadAt: null, lastLoggedAt: null, kind: 'vomit', petName: 'Rex', species: 'dog', birthDate: null, nowMs: Date.now() })).toBe(FLOOR_ASK.action);
  });

  const intake = (trigger: string) =>
    ({ type: 'intake_decline', priorityClass: 'safety', trigger, species: 'dog', daysBelowBaseline: 2, refusedFoodLabel: null, ratedMealsConsidered: 6 }) as unknown as SignalFinding;

  it('the Signal: an unknown intake trigger is the floor on the strip and on Home', () => {
    expect(stripAskLine(intake('something_new'))).toBe(STRIP_ASKS.call);
    expect(signalHomeAsk(intake('something_new'))).toBe(FLOOR_ASK.inline);
  });

  it('the Signal: an unknown red-flag tier is the floor', () => {
    const odd = { type: 'incident_red_flag', priorityClass: 'safety', incidentType: 'vomit', flags: ['blood'], mostRecentFlaggedIso: '2026-11-01T10:00:00.000Z', flaggedIncidentCount: 1, windowDays: 14, tier: 'call_whenever' } as unknown as Parameters<typeof incidentRedFlagAsk>[0];
    expect(incidentRedFlagAsk(odd)).toBe(FLOOR_ASK.inline);
  });

  it('the report: an unknown kind or trigger is the floor, and keeps the floor\'s rows', () => {
    expect(composerAskLevelOf({ kind: 'a_kind_from_the_future', sign: null, trigger: null })).toBe('floor');
    expect(composerAskLevelOf({ kind: 'intake_decline', sign: null, trigger: 'a_trigger_from_the_future' })).toBe('floor');
    const card = sendCallCard({ state: 'flags', startDate: '2026-09-14', endDate: '2026-11-08', flags: [{ kind: 'a_kind_from_the_future', sign: null, trigger: null }] }, 'Rex', 11);
    expect(card?.rows[0].text).toBe(FLOOR_ASK.imperative);
  });

  it('the diet trial: a decline it cannot name keeps a cat\'s floor line', () => {
    expect(trialDeclineVetLine('cat', null, 'Pixel')).toMatch(/needs a call today/);
    expect(trialDeclineVetLine('cat', { trigger: 'a_trigger_from_the_future' }, 'Pixel')).toMatch(/needs a call today/);
  });
});

describe('3. Pattern 11\'s Never column, over every ask these surfaces can print', () => {
  // A condition on the owner's sense of normal, a stand-down, or a vaguer clock.
  const NEVER = /\bif (this|it|she|he|they)\s+(isn'?t|is not) like\b|\bif you'?re not worried\b|\bcan wait\b|\bno rush\b|\bwhen convenient\b/i;
  const asks = [
    ...allAskStrings(),
    ...Object.values(STRIP_ASKS),
    ...allEmergencyStrings(),
    ...(['floor', 'call', 'word'] as const).flatMap((l) => [11, 22, 3].flatMap((h) => askRowsFor(l, h, 'Rex').map((r) => r.text))),
    ...(['cat', 'dog', 'other'] as const).flatMap((sp) =>
      [null, { trigger: 'consecutive_low' }, { trigger: 'sustained_refusal' }].map((f) => trialDeclineVetLine(sp, f, 'Pixel')),
    ),
  ];

  it('the sweep is not empty (non-vacuity)', () => {
    expect(asks.length).toBeGreaterThan(30);
  });

  it.each(asks.map((a) => [a]))('%s', (a) => {
    expect(a).not.toMatch(NEVER);
  });

  it('the Never pattern catches the counterexample it exists for (the chronic vomiter)', () => {
    expect("If this isn't like Mochi, a call today is worth it.").toMatch(NEVER);
    expect('No rush, a call when convenient.').toMatch(NEVER);
  });

  it('every deferential call keeps its clock', () => {
    const cards = [11, 22, 3].map((h) => askRowsFor('call', h, 'Rex').map((r) => r.text).join(' '));
    for (const a of [DEFERENTIAL_ASK.label, DEFERENTIAL_ASK.inline, DEFERENTIAL_ASK.door, DEFERENTIAL_ASK.imperative, DEFERENTIAL_ASK.action, ...cards]) {
      expect(a).toMatch(/today|same day|now|when they open/);
    }
  });
});
