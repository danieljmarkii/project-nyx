// A daily look keeps the escalate-only gap row on screen (adversarial-reviewer, release QA).
//
// useSignal keeps looks out of the Signal's counts and floor but in its RECENCY check,
// because `stale` turns the watching read off and with it the gap row ("Gaps between
// vomiting episodes are getting shorter"). Counting looks out of recency too sent an owner
// who answers the look every day, while a cat's vomits came 12, 7 and 3 days apart, to the
// stale frame 48 hours after the last one, and the row went with it. End to end: the real
// hook, the real watching read and the real SignalZone over a real, upgraded schema. The
// schema needs COLUMN_UPGRADES: without `occurred_at_confidence` the watching read quietly
// returns nothing, and "no gap row" would pass over nothing.

import { DatabaseSync } from 'node:sqlite';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (cb: () => void | (() => void)) => require('react').useEffect(cb, [cb]),
}));
jest.mock('../../hooks/useDesignV2', () => ({ useDesignV2: () => false }));
jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn(), functions: { invoke: jest.fn() } } }));
type Params = (string | number | null)[];
let mockDb: InstanceType<typeof DatabaseSync>;
jest.mock('../../lib/db', () => ({
  getDb: () => ({
    getAllSync: (sql: string, params: Params = []) => mockDb.prepare(sql).all(...params),
    getAllAsync: async (sql: string, params: Params = []) => mockDb.prepare(sql).all(...params),
    getFirstSync: (sql: string, params: Params = []) => mockDb.prepare(sql).get(...params) ?? null,
    getFirstAsync: async (sql: string, params: Params = []) => mockDb.prepare(sql).get(...params) ?? null,
  }),
}));
jest.mock('../../lib/signal', () => ({
  ...jest.requireActual('../../lib/signal'),
  readSignalCache: jest.fn(async () => null),
  isSignalCacheStale: jest.fn(() => false),
  regenerateSignal: jest.fn(),
  readSignalsAndRefresh: jest.fn(),
}));
jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: () => true }));
jest.mock('../../lib/signalArrival', () => ({ hasPlayedArrival: async () => true, markArrivalPlayed: async () => {} }));
jest.mock('../../lib/haptics', () => ({ insightArrival: () => {} }));

import { render, screen, waitFor } from '@testing-library/react-native';
import { BASE_SCHEMA_SQL, applyColumnUpgrades } from '../../lib/localSchema';
import { usePetStore } from '../../store/petStore';
import { staleIntro } from '../../lib/signalCopy';
import { SignalZone } from './SignalZone';

const PET = { id: 'pet-1', name: 'Pixel', species: 'cat' } as never;
const DAY = 86_400_000;
const GAP_ROW = /Gaps between vomiting episodes are getting shorter/;
/** What `lib/looks.ts` writes as a look's parent event. */
const LOOK = 'check_in';

let seq = 0;
function log(type: string, msAgo: number) {
  mockDb
    .prepare('INSERT INTO events (id, pet_id, event_type, occurred_at) VALUES (?, ?, ?, ?)')
    .run(`e-${++seq}`, 'pet-1', type, new Date(Date.now() - msAgo).toISOString());
}
/** Vomits 12, 7 and 3 days apart, the last one four days ago, and nothing else logged
 *  (a free-fed cat): an accelerating run whose row is still current at day four. */
function acceleratingRun() {
  for (const d of [26, 14, 7, 4]) log('vomit', d * DAY);
}

async function renderZone() {
  const reports: { live: boolean | null }[] = [];
  render(<SignalZone onSafetyLive={(r) => reports.push(r)} />);
  await waitFor(() => expect(reports.at(-1)?.live ?? null).not.toBeNull());
  return reports;
}

async function freshWorld() {
  mockDb = new DatabaseSync(':memory:');
  mockDb.exec(BASE_SCHEMA_SQL);
  await applyColumnUpgrades(async (sql) => {
    mockDb.exec(sql);
  });
  usePetStore.setState({ pets: [PET], activePet: PET });
}

// COLD-CACHE WARM-UP (the AddMedicationModal precedent, CUL-1155): on an empty jest cache,
// which CI always has, this file's first render measured 3.0 s against the 5 s default.
beforeAll(async () => {
  await freshWorld();
  const view = render(<SignalZone />);
  await screen.findByText(staleIntro('Pixel'));
  view.unmount();
}, 60000);

beforeEach(freshWorld);

it('an owner answering the look every day keeps the shortening-gaps row on screen', async () => {
  acceleratingRun();
  for (let k = 1; k <= 25; k++) log(LOOK, k * DAY - 3_600_000);
  log(LOOK, 60_000);
  const reports = await renderZone();
  expect(await screen.findByText(GAP_ROW)).toBeTruthy();
  expect(screen.queryByText(staleIntro('Pixel'))).toBeNull();
  expect(reports.at(-1)?.live).toBe(true);
});

// Non-vacuity, and the hole that remains: the same record with no look goes stale and
// drops the row (pre-existing; CUL-1468 owns it). So the look is what keeps it above.
it('without a look the same record goes stale and drops the row (CUL-1468)', async () => {
  acceleratingRun();
  const reports = await renderZone();
  expect(await screen.findByText(staleIntro('Pixel'))).toBeTruthy();
  expect(screen.queryByText(GAP_ROW)).toBeNull();
  expect(reports.at(-1)?.live).toBe(false);
});
