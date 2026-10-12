// A run order shaped like Engines v3 on 10/9 to 10/11 (retro 4, CUL-1858), reduced to the
// rows the sort's and alarms' cases need: PR-23 (the latch), the `may_wait` rows under
// CUL-1611's three-row forecast, an off-path polish row, and PR-41 (the go-live, whose
// issue CUL-1432 is CUL-1741's parent). Ids are the real ones where the case is a real
// shape (CUL-1438, CUL-1741, CUL-1611, CUL-1668); the rest are stand-ins.

import type { PlanInput } from '../plan.ts';
import type { Candidate } from '../sort.ts';

export const NOW = '2026-10-11T22:00:00Z';
export const PM_UUID = '27452d8f-0000-0000-0000-000000000000';

export const PAGE = [
  'Alias: Engines v3',
  '',
  '| PR | Issue(s) | What it is | After | Lane |',
  '|---|---|---|---|---|',
  '| 23 | CUL-1300 | The latch | — | A |',
  '| 27e | CUL-1601 (of CUL-1611) | may_wait read | — | B |',
  '| 27f | CUL-1602 (of CUL-1611) | may_wait render | PR-27e | B |',
  '| 27g | CUL-1603 (of CUL-1611) | may_wait stale path | PR-27f | B |',
  '| 40 | CUL-1400 | Polish pass | — | C |',
  '| 41 | CUL-1432 | v3.0 go-live | — | D |',
  '',
  '**Critical path to v3.0:** PR-23 → PR-41',
  '',
  '**Done means (rows):** 23, 27e, 27f, 27g, 41',
  '',
  '**PR-27e:** the read, per CUL-1611 option A.',
  '**PR-41:** the go-live: `engines_v3_en9` on for everyone. CUL-1777 is named here.',
].join('\n');

export const APP_CONFIG: Record<string, unknown> = {
  engines_v3_en9: { enabled: false, allowlist: [] },
  engines_v3_en10: false,
  engines_v3_en3: { enabled: false, allowlist: [PM_UUID] },
  engines_v3_all: { enabled: true, allowlist: [] },
};

export const GO_LIVES: Record<string, string> = {
  engines_v3_en9: 'CUL-1500',
  engines_v3_en10: 'CUL-1501',
  engines_v3_en3: 'CUL-1502',
  engines_v3_all: 'CUL-1503',
};

export function input(over: Partial<PlanInput> = {}): PlanInput {
  return {
    now: NOW,
    project: { name: 'Engines v3: the record that reads itself', description: PAGE },
    prs: [],
    issues: {
      'CUL-1300': { id: 'CUL-1300', state: 'Todo' },
      'CUL-1601': { id: 'CUL-1601', state: 'Todo', parentId: 'CUL-1611' },
      'CUL-1602': { id: 'CUL-1602', state: 'Todo', parentId: 'CUL-1611' },
      'CUL-1603': { id: 'CUL-1603', state: 'Todo', parentId: 'CUL-1611' },
      'CUL-1400': { id: 'CUL-1400', state: 'Todo' },
      'CUL-1432': { id: 'CUL-1432', state: 'Todo' },
      'CUL-1500': { id: 'CUL-1500', state: 'Todo' },
      'CUL-1501': { id: 'CUL-1501', state: 'Todo' },
      'CUL-1502': { id: 'CUL-1502', state: 'Todo' },
      'CUL-1503': { id: 'CUL-1503', state: 'Todo' },
    },
    claims: [],
    sessions: {},
    launches: [],
    mainMigrations: ['supabase/migrations/101_engines_v3_en3_seed.sql'],
    appliedMigrations: ['engines_v3_en3_seed'],
    appConfig: APP_CONFIG,
    // The rollout keys go through the allowlist resolver; a kill switch would not be listed.
    allowlistKeys: ['engines_v3_en9', 'engines_v3_en3', 'engines_v3_all'],
    goLives: GO_LIVES,
    findings: [],
    ...over,
  };
}

// A finding filed in this project on 10/11, unless a case says otherwise.
export function finding(id: string, over: Partial<Candidate> = {}): Candidate {
  return {
    id,
    title: `${id} finding`,
    description: 'TL;DR — plain English: a finding.\n\nDirection: QUIET\n\n---\n\nBody.',
    inProject: true,
    project: 'Engines v3: the record that reads itself',
    createdAt: '2026-10-11T12:00:00Z',
    open: true,
    labels: [],
    relatedTo: ['CUL-1300'],
    keys: ['engines_v3_en9'],
    arm: 'on',
    ...over,
  };
}

export const tagged = (d: 'QUIET' | 'LOUD' | 'neither') => `TL;DR — plain English: a finding.\n\nDirection: ${d}\n\n---\n\nBody.`;
export const UNTAGGED = 'TL;DR — plain English: a finding with no tag.\n\n---\n\nBody.';
