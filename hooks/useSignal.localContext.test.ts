// A daily look never enters the Signal's empty-state counts (daily-look spec R1, §5.6),
// and still counts as the owner being here.
//
// useSignal reads the pet's events from local SQLite to pick E1 (building), E2 ("no clear
// patterns yet") or stale, and to write "Day {n} — {k} events so far". The engine never
// reads a look (generate-signal pulls symptoms, meals and medications only), so a look
// counted there lifts a thin record over the substantial-history floor into E2 (a claim
// about data the engine never had), inflates {k} and moves Day 1 earlier. Recency is the
// one place it stays: `stale` turns the watching read and its gap row off, and an owner
// answering every day has not gone quiet (SignalZone.lookRecency.test.tsx pins the row).
// This runs the hook's REAL query over a real schema.

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

it('a record of looks alone counts nothing and starts no day, and has not gone quiet', async () => {
  answerLooksDaily();
  const { result } = renderHook(() => useSignal());
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  // Thirteen looks over twelve days, counted, would be E2's "no clear patterns yet".
  expect(result.current.displayState).toBe('building');
  expect(result.current.eventCount).toBe(0);
  expect(result.current.dayNumber).toBe(1);
});

it('a record whose only recent row is a look is not stale; with no look it is', async () => {
  log('meal', localNoon(5));
  const quiet = renderHook(() => useSignal());
  await waitFor(() => expect(quiet.result.current.isLoading).toBe(false));
  expect(quiet.result.current.displayState).toBe('stale');
  quiet.unmount();
  log(LOOK, justNow());
  const answered = renderHook(() => useSignal());
  await waitFor(() => expect(answered.result.current.isLoading).toBe(false));
  expect(answered.result.current.displayState).toBe('building');
  expect(answered.result.current.eventCount).toBe(1);
});

it('looks beside real logs move nothing: the count, Day 1 and the state come from the logs', async () => {
  answerLooksDaily();
  log('meal', localNoon(5));
  log('meal', justNow());
  const { result } = renderHook(() => useSignal());
  await waitFor(() => expect(result.current.eventCount).toBe(2));
  // Two logs is a building record, not "no clear patterns yet" over thirteen looks.
  expect(result.current.displayState).toBe('building');
  // Day-1-inclusive from the first MEAL five days back, never from the look twelve back.
  expect(result.current.dayNumber).toBe(6);
});
