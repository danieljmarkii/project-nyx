// The registry of links into History, and where each one lands in History v2 (HV-11 /
// CUL-1168; spec §5.8, AC 37). The guard that fails on an unregistered sender is
// `guards/historyDoorways.test.ts`; v1's landings and the flag flipping after mount are
// `app/(tabs)/history.doors.test.tsx`.
//
// Every case drives the SENDER'S OWN builder where it has one (C-34: a fixture that
// restates the sender would be green over a sender that changed). Three senders spell their
// params inline at the call site, and the cases for those are marked: the widget (frozen,
// bound to this reader by `widgets/CulpritWidget.test.ts`), the flag-off calendar and Ask's
// chip, each pinned by a text check on its own file below.
// The builders' modules reach the env-guarded client and the local database at import; no
// case here reads either.
jest.mock('./supabase', () => ({ supabase: {} }));
jest.mock('./db', () => ({ getDb: jest.fn() }));
jest.mock('./sync', () => ({ syncPendingEvents: jest.fn(), syncPendingLooks: jest.fn() }));

import * as fs from 'fs';
import * as path from 'path';

import { resolveTapThrough, ASK_HISTORY_V1, type AskHistoryReach } from './ask';
import { historyDayHref } from './historyDateFilter';
import { historyDoorRequestOf, type HistoryDoorParams } from './historyDoorParams';
import { HISTORY_DOORS, historyHref, rundownHistoryHref, type HistoryDoorId } from './historyDoors';
import { lookMoreTodayHref } from './lookCard';
import { noticedCardHref } from './lookPatterns';
import type { HistoryDoorRequest } from '../store/historyScopeStore';

const REPO_ROOT = path.resolve(__dirname, '..');
const NOW = 1_790_000_000_000;

/** A string route's query as params (`/history?type=check_in&ts=1` → `{ type, ts }`). */
function paramsOfString(route: string): HistoryDoorParams {
  const q = route.indexOf('?');
  return q < 0 ? {} : Object.fromEntries(new URLSearchParams(route.slice(q + 1)));
}

function paramsOf(route: string | { params: Record<string, string> }): HistoryDoorParams {
  return typeof route === 'string' ? paramsOfString(route) : route.params;
}

const V2: AskHistoryReach = { historyV2: true, trialWindowOffered: true };

/** Ask's link as the screen pushes it: the resolver's params, plus the nonce `app/ask.tsx`
 *  adds at the tap (text-pinned below). */
function askParams(symptomType: string, window: string): HistoryDoorParams {
  const nav = resolveTapThrough({ kind: 'filter', symptomType, window }, V2) as { params: Record<string, string> };
  return { ...nav.params, ts: '1' };
}

interface Case {
  name: string;
  params: HistoryDoorParams;
  /** What v2 applies (`historyDoorRequestOf`), or null for a bare route. */
  lands: HistoryDoorRequest | null;
}

const ALL = { kind: 'all' } as const;

/** One or more real landings per registered door. */
const CASES: Record<HistoryDoorId, Case[]> = {
  'widget-day': [
    {
      name: 'inline (frozen): the shape `widgets/CulpritWidget.test.ts` parses off the rendered widget',
      params: { date: '2026-07-24', ts: '1', pet: 'p2', src: 'widget' },
      lands: { filter: ALL, window: ALL, landOn: '2026-07-24' },
    },
  ],
  'month-day': [
    {
      name: 'historyDayHref',
      params: paramsOf(historyDayHref('2026-09-17', NOW)),
      lands: { filter: ALL, window: ALL, landOn: '2026-09-17' },
    },
  ],
  'calendar-day': [
    {
      name: 'inline: `{ date: dayKey, ts }` (text-pinned below)',
      params: { date: '2026-09-17', ts: '1' },
      lands: { filter: ALL, window: ALL, landOn: '2026-09-17' },
    },
  ],
  'look-more-today': [
    {
      name: 'lookMoreTodayHref',
      params: paramsOf(lookMoreTodayHref(NOW)),
      lands: { filter: { kind: 'noticed' }, window: { kind: 'today' } },
    },
  ],
  'noticed-card': [
    {
      name: 'noticedCardHref',
      params: paramsOf(noticedCardHref(NOW)),
      lands: { filter: { kind: 'noticed' }, window: ALL },
    },
  ],
  'ask-provenance': [
    ...(['7d', '14d', '30d'] as const).map((w) => ({
      name: `resolveTapThrough, ${w}`,
      params: askParams('vomit', w),
      lands: { filter: { kind: 'type', type: 'vomit' }, window: { kind: 'last', days: Number(w.slice(0, -1)) } } as HistoryDoorRequest,
    })),
    {
      name: 'resolveTapThrough, all time',
      params: askParams('cough', 'all'),
      lands: { filter: { kind: 'type', type: 'cough' }, window: ALL },
    },
    {
      name: 'resolveTapThrough, since the trial started (CUL-498)',
      params: askParams('diarrhea', 'since_trial_start'),
      lands: { filter: { kind: 'type', type: 'diarrhea' }, window: { kind: 'trial' } },
    },
  ],
  'ask-chip': [
    {
      name: 'inline: `{ date: \'today\', ts }` (text-pinned below)',
      params: { date: 'today', ts: '1' },
      lands: { filter: ALL, window: { kind: 'today' } },
    },
  ],
  'medication-course': [
    {
      name: 'historyHref, as `app/medication/[id].tsx` calls it',
      params: paramsOf(historyHref({ type: 'medication', course: 'reg-1' }, NOW)),
      lands: { filter: { kind: 'course', courseKey: 'reg-1' }, window: ALL },
    },
  ],
  rundown: [
    {
      name: 'rundownHistoryHref, since the last visit',
      params: paramsOf(rundownHistoryHref({ scope: 'since-visit' }, true, NOW)),
      lands: { filter: ALL, window: { kind: 'visit' } },
    },
    {
      name: 'rundownHistoryHref, None logged in 30 days',
      params: paramsOf(rundownHistoryHref({ scope: 'symptoms-30d' }, true, NOW)),
      lands: { filter: { kind: 'symptoms' }, window: { kind: 'last', days: 30 } },
    },
    {
      name: 'rundownHistoryHref, a past course',
      params: paramsOf(rundownHistoryHref({ scope: 'course', courseKey: 'item:zyr' }, true, NOW)),
      lands: { filter: { kind: 'course', courseKey: 'item:zyr' }, window: ALL },
    },
    {
      name: 'rundownHistoryHref, not scoped (flag off, or another pet): the bare route',
      params: paramsOf(rundownHistoryHref({ scope: 'since-visit' }, false, NOW)),
      lands: null,
    },
  ],
};

describe('the registry (lib/historyDoors.ts)', () => {
  it('one row per door id, each with a landing case here, and the widget alone frozen', () => {
    const ids = HISTORY_DOORS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(Object.keys(CASES).sort());
    expect(HISTORY_DOORS.filter((d) => d.frozen).map((d) => d.id)).toEqual(['widget-day']);
  });

  it('every row names files that exist, and a builder its file exports', () => {
    for (const door of HISTORY_DOORS) {
      for (const f of door.senders) expect({ door: door.id, f, exists: fs.existsSync(path.join(REPO_ROOT, f)) }).toMatchObject({ exists: true });
      if (door.builder) {
        const src = fs.readFileSync(path.join(REPO_ROOT, door.builder.file), 'utf8');
        expect(src).toMatch(new RegExp(`export function ${door.builder.fn}\\b`));
      }
    }
  });
});

describe.each(Object.entries(CASES))('%s lands where its row says in History v2', (_id, cases) => {
  it.each(cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(historyDoorRequestOf({ ...c.params })).toEqual(c.lands);
  });
});

describe('each in-app link carries a nonce, so a second tap on a mounted tab applies again', () => {
  it.each(
    Object.entries(CASES).flatMap(([id, cases]) => cases.filter((c) => c.lands !== null).map((c) => [id, c.name, c] as const)),
  )('%s: %s', (_id, _name, c) => {
    expect(c.params.ts).toMatch(/^\d+$/);
  });
});

describe('the inline senders still send what their case says (text pins; the component owns the tap)', () => {
  const src = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
  it('the flag-off calendar sends its day as `date`, with a nonce', () => {
    expect(src('components/dashboard/PatternCalendar.tsx')).toMatch(
      /pathname: '\/\(tabs\)\/history', params: \{ date: dayKey, ts: String\(Date\.now\(\)\) \}/,
    );
  });
  it('Ask\'s answer link is pushed with a nonce added at the tap', () => {
    expect(src('app/ask.tsx')).toMatch(/params: \{ \.\.\.nav\.params, ts: String\(Date\.now\(\)\) \}/);
  });
  it('Ask\'s History chip sends the Today window, with a nonce', () => {
    expect(src('app/ask.tsx')).toMatch(/pathname: '\/\(tabs\)\/history', params: \{ date: 'today', ts: String\(Date\.now\(\)\) \}/);
  });
  it('the medication screen sends Medication and the course it was drawn for', () => {
    expect(src('app/medication/[id].tsx')).toMatch(/historyHref\(\{ type: 'medication', course: courseKey \}\)/);
  });
});

describe('historyHref', () => {
  it('adds the nonce and leaves out what the link does not ask for', () => {
    expect(historyHref({ type: 'vomit', window: undefined, course: '' }, 5)).toEqual({
      pathname: '/(tabs)/history',
      params: { type: 'vomit', ts: '5' },
    });
  });
});

describe('Ask flag off keeps its v1 windows (the registry\'s flagOff column)', () => {
  it('14 days and since the trial started open Patterns; 7 / 30 / all open History', () => {
    const at = (w: string) => resolveTapThrough({ kind: 'filter', symptomType: 'vomit', window: w }, ASK_HISTORY_V1);
    expect(at('14d')?.pathname).toBe('/insights/[metric]');
    expect(at('since_trial_start')?.pathname).toBe('/insights/[metric]');
    for (const w of ['7d', '30d', 'all']) expect(at(w)?.pathname).toBe('/(tabs)/history');
  });
});
