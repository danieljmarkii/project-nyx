// The gap warning and the quiet line, end to end (CUL-1838; CUL-1468's case, CUL-1484's).
//
// The real hook, the real gap read and the real SignalZone over a real, upgraded schema.
// The schema needs COLUMN_UPGRADES: without `occurred_at_confidence` the vomit read throws,
// the warning resolves to nothing, and "no warning" would pass over nothing — so every
// "no warning" case here sits beside a case on the same harness where it shows.
//
// What it pins: a record gone quiet keeps the warning (logged time, not the wall clock); a
// daily look neither keeps a record "recent" nor moves the warning's anchor; a look logged
// after the record went quiet makes the header name meals and symptoms.

import { DatabaseSync } from 'node:sqlite';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (cb: () => void | (() => void)) => require('react').useEffect(cb, [cb]),
}));
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
// The vet door's read reaches the intake-decline service; its words are SignalZone.test's.
jest.mock('../../lib/emergencyDoorRead', () => ({ loadEmergencyRead: async () => ({ status: 'failed' }) }));
jest.mock('../../hooks/useFloorOn', () => ({ useFloorOn: () => false }));
jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: () => true }));
jest.mock('../../lib/signalArrival', () => ({ hasPlayedArrival: async () => true, markArrivalPlayed: async () => {} }));
jest.mock('../../lib/haptics', () => ({ insightArrival: () => {} }));

import { act, render, screen } from '@testing-library/react-native';
import { BASE_SCHEMA_SQL, applyColumnUpgrades } from '../../lib/localSchema';
import { usePetStore } from '../../store/petStore';
import { QUIET_TOO_EARLY_HEADER, QUIET_GONE_QUIET_SUB } from '../../lib/signalCopy';
import { SignalZone } from './SignalZone';

const PET = { id: 'pet-1', name: 'Pixel', species: 'cat' } as never;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const GAP = /Gaps between vomiting episodes are getting shorter/;
/** What `lib/looks.ts` writes as a look's parent event. */
const LOOK = 'check_in';

let seq = 0;
function log(type: string, msAgo: number) {
  mockDb
    .prepare('INSERT INTO events (id, pet_id, event_type, occurred_at) VALUES (?, ?, ?, ?)')
    .run(`e-${++seq}`, 'pet-1', type, new Date(Date.now() - msAgo).toISOString());
}
/** Vomits 12, 7 and 3 days apart, the last one `daysAgo` back, and nothing else logged (a
 *  free-fed cat, Sam's persona). */
function acceleratingRun(daysAgo: number) {
  for (const d of [22, 10, 3, 0]) log('vomit', (daysAgo + d) * DAY);
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
  await screen.findByText(QUIET_TOO_EARLY_HEADER);
  view.unmount();
}, 60000);

beforeEach(freshWorld);

it('0 events: "Too early to tell", never stale', async () => {
  render(<SignalZone />);
  expect(await screen.findByText(QUIET_TOO_EARLY_HEADER)).toBeTruthy();
  expect(screen.queryByText(/Nothing logged since/)).toBeNull();
});

it('looks only (CUL-1484): a month of daily looks reads too early', async () => {
  for (let k = 0; k <= 30; k++) log(LOOK, k * DAY + HOUR);
  render(<SignalZone />);
  expect(await screen.findByText(QUIET_TOO_EARLY_HEADER)).toBeTruthy();
  expect(screen.queryByText(/week 1|This is week/i)).toBeNull();
});

it('the backfill case: a history whose last event is 2.5 days old opens with the warning, not the stale line', async () => {
  acceleratingRun(2.5);
  render(<SignalZone />);
  expect(await screen.findByText(GAP)).toBeTruthy();
  expect(screen.getByText(/12 days, then 7, then 3/)).toBeTruthy();
  expect(screen.queryByText(QUIET_GONE_QUIET_SUB)).toBeNull();
});

it('a record gone quiet keeps the warning however long it sits (the wall clock dropped it at day 6.5)', async () => {
  acceleratingRun(20);
  render(<SignalZone />);
  expect(await screen.findByText(GAP)).toBeTruthy();
});

it('a look answered every day since neither counts as logging nor moves the anchor', async () => {
  acceleratingRun(20);
  for (let k = 0; k < 20; k++) log(LOOK, k * DAY + HOUR);
  render(<SignalZone />);
  expect(await screen.findByText(GAP)).toBeTruthy();
});

it('control: meals logged through the quiet days age the run out — the warning was available to show', async () => {
  acceleratingRun(20);
  for (let h = 12; h < 20 * 24; h += 12) log('meal', h * HOUR);
  render(<SignalZone />);
  // Six weeks of meals is a substantial record: "No pattern right now", and no warning.
  expect(await screen.findByText('No pattern right now')).toBeTruthy();
  // Let the gap read answer before asserting its absence (C-12): an unanswered read is not "no warning".
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
  expect(screen.queryByText(GAP)).toBeNull();
});

it('gone quiet with no run: dated, and a look logged since makes it name meals and symptoms', async () => {
  log('meal', 5 * DAY);
  log('meal', 4 * DAY);
  render(<SignalZone />);
  expect(await screen.findByText(/^Nothing logged since /)).toBeTruthy();
  expect(screen.getByText(QUIET_GONE_QUIET_SUB)).toBeTruthy();
  screen.unmount();
  log(LOOK, HOUR);
  render(<SignalZone />);
  expect(await screen.findByText(/^No meals or symptoms since /)).toBeTruthy();
});
