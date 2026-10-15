// A daily look never enters the Signal's quiet-line inputs (daily-look spec R1, §5.6;
// CUL-1838), and is read for one question only: was it logged after the last real log.
//
// useSignal reads the pet's events from local SQLite to route the quiet line: "Too early to
// tell", "Nothing logged since {day}" or "No pattern right now". The engine never reads a
// look, so a look counted there would lift a thin record over the substantial-history floor
// (a claim about data the engine never had), and a look counted as recency would hide a
// record that has gone quiet. Since CUL-1838 the gap warning stays up in `stale`, so a look
// no longer has to stand in for recency (SignalZone.lookRecency.test.tsx pins the warning).
// A record of looks alone reads "Too early to tell" for as long as it lasts (CUL-1484).
// This runs the hook's REAL query over a real schema, through the real routing.

import { DatabaseSync } from 'node:sqlite';
import { renderHook, waitFor } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void | (() => void)) => require('react').useEffect(cb, [cb]),
}));

let mockDb: InstanceType<typeof DatabaseSync>;
jest.mock('../lib/db', () => ({
  getDb: () => ({
    getAllSync: (sql: string, params: (string | number | null)[]) => mockDb.prepare(sql).all(...params),
  }),
}));

jest.mock('../lib/signal', () => ({
  readSignalCache: jest.fn(async () => null),
  isSignalCacheStale: jest.fn(() => false),
  regenerateSignal: jest.fn(),
  readSignalsAndRefresh: jest.fn(),
}));

import { BASE_SCHEMA_SQL } from '../lib/localSchema';
import { usePetStore } from '../store/petStore';
import { useSignal } from './useSignal';
import { deriveDisplayState } from '../lib/signalCopy';

const PET = { id: 'pet-1', name: 'Miso' } as any;
/** What `lib/looks.ts` writes as a look's parent event. */
const LOOK = 'check_in';

/** Local noon `daysAgo` calendar days back: far from midnight, so the day is the same in
 *  every zone the CI runs (B-514), and a DST change cannot move it. */
function localNoon(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}
const justNow = () => new Date(Date.now() - 60_000).toISOString();

let seq = 0;
function log(type: string, occurredAt: string) {
  mockDb
    .prepare('INSERT INTO events (id, pet_id, event_type, occurred_at) VALUES (?, ?, ?, ?)')
    .run(`e-${++seq}`, PET.id, type, occurredAt);
}
/** A look every day for twelve days and one a minute ago: enough, counted, to cross the
 *  substantial-history floor (8 events over 7 days) on its own. */
function answerLooksDaily() {
  for (let k = 1; k <= 12; k++) log(LOOK, localNoon(k));
  log(LOOK, justNow());
}

beforeEach(() => {
  mockDb = new DatabaseSync(':memory:');
  mockDb.exec(BASE_SCHEMA_SQL);
  usePetStore.setState({ pets: [PET], activePet: PET });
});

/** The routing the zone applies, with no findings drawn. */
function stateOf(r: ReturnType<typeof useSignal>) {
  return deriveDisplayState(0, r.eventCount, r.hasRecentActivity, r.hasSubstantialHistory);
}

it('a record of looks alone counts nothing and reads too early, never "week 1" (CUL-1484)', async () => {
  answerLooksDaily();
  const { result } = renderHook(() => useSignal());
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  // Thirteen looks over twelve days, counted, would be "No pattern right now".
  expect(result.current.eventCount).toBe(0);
  expect(stateOf(result.current)).toBe('building');
  expect(result.current.lastLoggedAt).toBeNull();
});

it('a look is not recency: a record whose only recent row is a look has gone quiet, and says a look came since', async () => {
  log('meal', localNoon(5));
  const quiet = renderHook(() => useSignal());
  await waitFor(() => expect(quiet.result.current.isLoading).toBe(false));
  expect(stateOf(quiet.result.current)).toBe('stale');
  expect(quiet.result.current.lookSinceLastLogged).toBe(false);
  quiet.unmount();
  log(LOOK, justNow());
  const looked = renderHook(() => useSignal());
  await waitFor(() => expect(looked.result.current.isLoading).toBe(false));
  expect(stateOf(looked.result.current)).toBe('stale');
  expect(looked.result.current.eventCount).toBe(1);
  // The header then reads "No meals or symptoms since {day}".
  expect(looked.result.current.lookSinceLastLogged).toBe(true);
  expect(looked.result.current.lastLoggedAt).toBe(localNoon(5));
});

it('looks beside real logs move nothing: the count and the state come from the logs', async () => {
  answerLooksDaily();
  log('meal', localNoon(5));
  log('meal', justNow());
  const { result } = renderHook(() => useSignal());
  await waitFor(() => expect(result.current.eventCount).toBe(2));
  // Two logs is a young record, not "No pattern right now" over thirteen looks.
  expect(stateOf(result.current)).toBe('building');
  expect(result.current.hasRecentActivity).toBe(true);
  // The look a minute ago is not after the meal a minute ago in any way that matters here:
  // the newest real log is the anchor, and a look older than it is not "since".
  expect(result.current.lastLoggedAt).not.toBeNull();
});

it('a deleted look is not a look since', async () => {
  log('meal', localNoon(5));
  mockDb
    .prepare('INSERT INTO events (id, pet_id, event_type, occurred_at, deleted_at) VALUES (?, ?, ?, ?, ?)')
    .run(`e-${++seq}`, PET.id, LOOK, justNow(), justNow());
  const { result } = renderHook(() => useSignal());
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(stateOf(result.current)).toBe('stale');
  expect(result.current.lookSinceLastLogged).toBe(false);
  expect(result.current.eventCount).toBe(1);
});

it('zero events is never stale (CUL-1838)', async () => {
  const { result } = renderHook(() => useSignal());
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.eventCount).toBe(0);
  expect(result.current.hasRecentActivity).toBe(false);
  expect(stateOf(result.current)).toBe('building');
});
