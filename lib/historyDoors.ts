// Every link into History, one row per sender (History v2 · the record you can read, HV-11 /
// CUL-1168; spec §5.8, H-7, AC 36–37).
//
// A link into History is a promise about what the owner will see when they get there: the
// count Ask spoke, the day the month showed, the course the medication screen described. Nine
// places make one. This file lists them, and `guards/historyDoorways.test.ts` fails the build
// on a route to History found anywhere in the repository that no row here accounts for, so a
// tenth cannot ship without saying where it lands in both flag states.
//
// ── THE RULE A ROW FOLLOWS (H-7) ─────────────────────────────────────────────────
//
//   • The widget is FROZEN: it runs on the owner's home screen and does not update with the
//     app, so History reads what it sends (`dayScopeFromParams`, CUL-1073) and it is never
//     edited to suit History.
//   • Every other sender may change, and a flag-on sender may say more than v1 can read. A
//     parameter v1 does NOT read (`course`) may be sent in both flag states: v1 lands exactly
//     as before. A parameter v1 DOES read (`type`, `window`, `date`, `day`) takes a new value
//     only under `history_v2`, because v1 would read the new value its own way (v1 reads
//     `window=trial` as All time, a superset of the count it was sent to audit).
//   • A flag-on sender reads the gate (`useHistoryV2()`) where it decides the link, and draws
//     nothing of v2: those files are the deciders in `guards/historyV2FlagOff.test.tsx`.
//
// ── WHERE A LINK LANDS (§5.8, AC 37) ─────────────────────────────────────────────
//
// v1 filters its list: a day link shows that one day. v2 keeps the list and applies the link
// to its scope in one update (`applyDoor`): the filter and the window it names, and a day it
// names is LANDED ON (the day card, or the gap line that holds it, outlined; the strip on its
// week), under All types and All time so the day is always in the window. The reading is
// `lib/historyDoorParams.ts`; `hooks/useHistoryDoor.ts` applies each tap once, across the
// screen swap a flag flip causes.
//
// What the rows below do not promise is written on the row: Ask's server count is UTC days
// until CUL-1251; the rundown lands on the ACTIVE pet (CUL-1252), so its scoped doors apply
// only when the rundown is about the pet on screen.

// Types only from the reader: a sender imports this file, and the reader's module graph
// reaches History's scope store, which a sender has no business loading.
import type { HistoryDoorParams } from './historyDoorParams';
import type { RundownHistoryDoor } from './rundown';

/** One sender's row. */
export interface HistoryDoor {
  id: HistoryDoorId;
  /** The files that make the link: where the owner taps, and where the route is pushed. */
  senders: readonly string[];
  /** A function that spells the route for the senders, and its file. Every file that names
   *  it must be one of `senders` (the guard's one hop). Null when the senders spell it. */
  builder: { file: string; fn: string } | null;
  /** What the link carries. */
  sends: string;
  /** Where it lands with `history_v2` off (v1's screen). */
  flagOff: string;
  /** Where it lands with `history_v2` on (v2's screen). */
  flagOn: string;
  /** The sender cannot ship with the app (the widget alone, H-7). */
  frozen: boolean;
}

export type HistoryDoorId =
  | 'widget-day'
  | 'month-day'
  | 'calendar-day'
  | 'look-more-today'
  | 'noticed-card'
  | 'ask-provenance'
  | 'ask-chip'
  | 'medication-course'
  | 'rundown';

export const HISTORY_DOORS: readonly HistoryDoor[] = [
  {
    id: 'widget-day',
    senders: ['widgets/CulpritWidget.tsx'],
    builder: null,
    sends: '`date` (a LOCAL day), `pet`, `src=widget`, `ts` (minted when the widget draws, CUL-1177)',
    flagOff: 'that local day, on the widget\'s pet (switched once per tap, CUL-1119)',
    flagOn: 'lands on that day under All types and All time, on the widget\'s pet (switched once per tap, never again after a flag flip)',
    frozen: true,
  },
  {
    id: 'month-day',
    senders: ['components/designV2/patterns/MonthInstrument.tsx'],
    builder: { file: 'lib/historyDateFilter.ts', fn: 'historyDayHref' },
    sends: '`day` (a LOCAL day, the month\'s own), `ts`',
    flagOff: 'that local day (CUL-1073)',
    flagOn: 'lands on that day under All types and All time',
    frozen: false,
  },
  {
    id: 'calendar-day',
    senders: ['components/dashboard/PatternCalendar.tsx'],
    builder: null,
    sends: '`date` (a UTC day, its own sheet\'s), `ts`; drawn only with design_v2 off, retired at D2-8',
    flagOff: 'that UTC day',
    flagOn: 'lands on the local day with the same date: v2 hides no row, so the UTC day\'s entries are all on screen around it',
    frozen: false,
  },
  {
    id: 'look-more-today',
    senders: ['components/home/LookCard.tsx'],
    builder: { file: 'lib/lookCard.ts', fn: 'lookMoreTodayHref' },
    sends: '`type=check_in`, `window=today`, `ts`',
    flagOff: 'Check-in, Today',
    flagOn: 'Noticed, Today',
    frozen: false,
  },
  {
    id: 'noticed-card',
    senders: ['app/insights/index.tsx'],
    builder: { file: 'lib/lookPatterns.ts', fn: 'noticedCardHref' },
    sends: '`type=check_in`, `ts`',
    flagOff: 'Check-in, All time',
    flagOn: 'Noticed, All time',
    frozen: false,
  },
  {
    id: 'ask-provenance',
    senders: ['components/ask/AskAnswerCard.tsx', 'app/ask.tsx'],
    builder: { file: 'lib/ask.ts', fn: 'resolveTapThrough' },
    sends: '`type` (a History symptom), `window` (7d / 30d, absent for all time; 14d and trial under the flag), `ts`',
    flagOff: 'that symptom over v1\'s 7 or 30 days (now minus N × 24 hours) or all time; 14 days and since the trial started open Patterns',
    flagOn:
      'that symptom over the window table\'s Last 7 / 14 / 30 days (local days), All time, or Since the trial started ' +
      'while History offers it for this pet today (else Patterns: CUL-498). Ask\'s server still counts 7 / 14 / 30 as UTC days (CUL-1251)',
    frozen: false,
  },
  {
    id: 'ask-chip',
    senders: ['app/ask.tsx'],
    builder: null,
    sends: '`date=today`, `ts` (the capped state\'s *History* chip)',
    flagOff: 'Today',
    flagOn: 'All types, Today',
    frozen: false,
  },
  {
    id: 'medication-course',
    senders: ['app/medication/[id].tsx'],
    builder: { file: 'lib/historyDoors.ts', fn: 'historyHref' },
    sends: '`type=medication`, `course` (the past course\'s key), `ts`: `course` in both flag states (v1 does not read it)',
    flagOff: 'Medication, All time (as before)',
    flagOn: 'that course, All time (CUL-488\'s per-course lens)',
    frozen: false,
  },
  {
    id: 'rundown',
    senders: ['app/rundown.tsx'],
    builder: { file: 'lib/historyDoors.ts', fn: 'rundownHistoryHref' },
    sends: 'nothing flag off; under the flag, per tile: `window=visit` · `type=symptoms&window=30d` · `course`, with `ts`',
    flagOff: 'the bare route: History as the owner left it',
    flagOn:
      'since the last visit → Since the last vet visit; *None logged in 30 days* → All symptoms, Last 30 days; a past course ' +
      'with no regimen → that course, All time. Only when the rundown is about the pet on screen; for another pet\'s ' +
      'appointment, the bare route (CUL-1252)',
    frozen: false,
  },
];

// ── The builders ──────────────────────────────────────────────────────────────────

const HISTORY_PATHNAME = '/(tabs)/history';

/** The `?type=` value for All symptoms. Not an event type, so v1 would read it as All types;
 *  only a flag-on sender sends it, and `lib/historyDoorParams.ts` reads it. */
export const SYMPTOMS_TYPE_PARAM = 'symptoms';

/** The parameters an in-app sender builds; the nonce is `historyHref`'s to add. */
export type HistoryLinkParams = Omit<HistoryDoorParams, 'ts' | 'pet' | 'src'>;

export interface HistoryHref {
  pathname: typeof HISTORY_PATHNAME;
  params: Record<string, string>;
}

/**
 * A link into History with a nonce (`ts`): the tab stays mounted, so a tap is a new nonce,
 * never a remount, and History applies each tap once. Undefined parameters are left out, so
 * a link carries only what it asks for.
 */
export function historyHref(params: HistoryLinkParams, nowMs: number = Date.now()): HistoryHref {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) if (typeof v === 'string' && v !== '') out[k] = v;
  out.ts = String(nowMs);
  return { pathname: HISTORY_PATHNAME, params: out };
}

/**
 * A rundown tile's door into History (D2, PM 2026-09-25 on CUL-1168). Flag off, or when the
 * rundown is about a pet other than the one on screen, the bare route as before: History as
 * the owner left it. Under the flag, each tile lands on the scope its claim is about:
 *   • since the last visit ........ Since the last vet visit (§5.8; the report's bound, H-11)
 *   • *None logged in 30 days* .... All symptoms, Last 30 days. The tile claims an absence, so
 *                                   History can only show more than it, never less; the
 *                                   tile's 30 days are UTC days (`calendarWindow`), the
 *                                   table's are local, and an entry near UTC midnight can
 *                                   sit in one and not the other
 *   • a past course, no regimen ... that course, All time: a course may end before the last
 *                                   visit, and a visit window would hide every dose of it
 */
export function rundownHistoryHref(
  door: RundownHistoryDoor,
  scoped: boolean,
  nowMs: number = Date.now(),
): HistoryHref | typeof HISTORY_PATHNAME {
  if (!scoped) return HISTORY_PATHNAME;
  switch (door.scope) {
    case 'since-visit':
      return historyHref({ window: 'visit' }, nowMs);
    case 'symptoms-30d':
      return historyHref({ type: SYMPTOMS_TYPE_PARAM, window: '30d' }, nowMs);
    case 'course':
      return historyHref({ course: door.courseKey }, nowMs);
  }
}
