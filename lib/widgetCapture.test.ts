// The App Intents' capture flow (lib/widgetCapture.ts, W4): inbox-first write
// order, the failed-tap contract, the best-effort direct REST leg, and the
// payload parity with lib/sync.ts's upsert columns. Everything runs through
// the injectable deps seam — no container, keychain, or network.

jest.mock('expo-file-system', () => ({
  Directory: class {},
  File: class {},
  Paths: { appleSharedContainers: {} },
}));
jest.mock('expo-sqlite', () => ({ openDatabaseSync: jest.fn() }));
jest.mock('./db', () => ({ getDb: jest.fn() }));
jest.mock('./signal', () => ({ triggerSignalRegenDebounced: jest.fn() }));
jest.mock('./appGroup', () => ({
  APP_GROUP_ID: 'group.test',
  getCaptureInboxDirectory: jest.fn(() => null),
  getSnapshotDirectory: jest.fn(() => null),
  clearWidgetData: jest.fn(),
}));
jest.mock('./widgetSession', () => ({ getExtensionSession: jest.fn() }));

import {
  buildBowlTopUpCapture,
  buildMealCapture,
  defaultRestConfig,
  eventRestPayload,
  logMealIntent,
  logTreatIntent,
  mealRestPayload,
  topUpBowlIntent,
  type CaptureDeps,
} from './widgetCapture';
import { captureFileName } from './captureRecord';
import { classifyInboxPayload } from './captureInbox';

const PET = '11111111-1111-4111-9111-111111111111';
const FOOD = '22222222-2222-4222-9222-222222222222';
const EVT = '33333333-3333-4333-9333-333333333333';
const MEAL = '44444444-4444-4444-9444-444444444444';

const NOW = new Date('2026-07-24T18:00:00.000Z');

const SESSION = { accessToken: 'jwt-token', expiresAt: null, userId: 'user-1' };

function testDeps(overrides: Partial<CaptureDeps> = {}): {
  deps: Partial<CaptureDeps>;
  inbox: Map<string, string>;
  fetchMock: jest.Mock;
} {
  const inbox = new Map<string, string>();
  const fetchMock = jest.fn().mockResolvedValue({ ok: true });
  const ids = [EVT, MEAL];
  const deps: Partial<CaptureDeps> = {
    writeInboxFile: (name, contents) => {
      inbox.set(name, contents);
    },
    readSession: jest.fn().mockResolvedValue(SESSION),
    fetchImpl: fetchMock as unknown as typeof fetch,
    restConfig: { url: 'https://abcdef.supabase.co', anonKey: 'anon-key' },
    now: () => NOW,
    newId: () => ids.shift() ?? 'exhausted',
    ...overrides,
  };
  return { deps, inbox, fetchMock };
}

describe('record builders', () => {
  it('builds the meal/treat record: writer-generated ids, tap-time occurred=created', () => {
    const record = buildMealCapture({
      petId: PET,
      foodItemId: FOOD,
      kind: 'treat',
      loggedVia: 'widget',
      now: NOW,
      ids: { eventId: EVT, mealId: MEAL },
    });
    expect(record).toEqual({
      schemaVersion: 1,
      id: EVT,
      mealId: MEAL,
      kind: 'treat',
      petId: PET,
      foodItemId: FOOD,
      occurredAt: NOW.toISOString(),
      createdAt: NOW.toISOString(),
      loggedVia: 'widget',
    });
  });

  it('what the intents write, the app-side trust boundary accepts (round-trip)', () => {
    const mealRecord = buildMealCapture({
      petId: PET,
      foodItemId: FOOD,
      kind: 'meal',
      loggedVia: 'intent',
      now: NOW,
      ids: { eventId: EVT, mealId: MEAL },
    });
    expect(classifyInboxPayload(JSON.stringify(mealRecord)).status).toBe('valid');

    const topUp = buildBowlTopUpCapture({ petId: PET, loggedVia: 'widget', now: NOW, id: EVT });
    expect(classifyInboxPayload(JSON.stringify(topUp)).status).toBe('valid');
  });
});

describe('REST payload parity (the id-keyed convergence contract)', () => {
  const record = buildMealCapture({
    petId: PET,
    foodItemId: FOOD,
    kind: 'meal',
    loggedVia: 'widget',
    now: NOW,
    ids: { eventId: EVT, mealId: MEAL },
  });

  it('events payload mirrors syncPendingEvents column-for-column', () => {
    expect(eventRestPayload(record)).toEqual({
      id: EVT,
      pet_id: PET,
      event_type: 'meal',
      occurred_at: NOW.toISOString(),
      severity: null,
      notes: null,
      source: 'manual',
      occurred_at_source: 'now',
      occurred_at_confidence: 'witnessed',
      occurred_at_earliest: null,
      occurred_at_latest: null,
      deleted_at: null,
      created_at: NOW.toISOString(),
      updated_at: NOW.toISOString(),
      logged_via: 'widget',
    });
  });

  it('meals payload is assumed-portion, UNRATED (a tap is never a witnessed rating)', () => {
    expect(mealRestPayload(record)).toEqual({
      id: MEAL,
      event_id: EVT,
      pet_id: PET,
      food_item_id: FOOD,
      quantity: 'unknown',
      is_full_portion: null,
      notes: null,
      created_at: NOW.toISOString(),
      updated_at: NOW.toISOString(),
      intake_rating: null,
      logged_via: 'widget',
    });
  });
});

describe('the intent flow', () => {
  it('inbox first, then the direct REST leg: events before meals, owner JWT, ignore-duplicates', async () => {
    const { deps, inbox, fetchMock } = testDeps();
    const result = await logMealIntent(PET, FOOD, { deps });

    expect(result.ok).toBe(true);
    expect(result.direct).toBe('written');
    // The inbox holds the record under its id-keyed filename.
    expect(inbox.has(`${EVT}.json`)).toBe(true);
    expect(captureFileName(result.record!)).toBe(`${EVT}.json`);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [eventsUrl, eventsInit] = fetchMock.mock.calls[0];
    const [mealsUrl] = fetchMock.mock.calls[1];
    expect(eventsUrl).toBe('https://abcdef.supabase.co/rest/v1/events?on_conflict=id');
    expect(mealsUrl).toBe('https://abcdef.supabase.co/rest/v1/meals?on_conflict=id');
    expect(eventsInit.headers.Authorization).toBe('Bearer jwt-token');
    expect(eventsInit.headers.apikey).toBe('anon-key');
    expect(eventsInit.headers.Prefer).toBe('resolution=ignore-duplicates,return=minimal');
    expect(JSON.parse(eventsInit.body).logged_via).toBe('widget');
  });

  it('a failed inbox write IS a failed tap: ok:false, and the REST leg never runs', async () => {
    const { deps, fetchMock } = testDeps({
      writeInboxFile: () => {
        throw new Error('container gone');
      },
    });
    const result = await logMealIntent(PET, FOOD, { deps });
    expect(result.ok).toBe(false);
    expect(result.record).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('no usable session → direct leg skipped; the inbox still has the capture', async () => {
    const { deps, inbox } = testDeps({ readSession: jest.fn().mockResolvedValue(null) });
    const result = await logTreatIntent(PET, FOOD, { deps });
    expect(result.ok).toBe(true);
    expect(result.direct).toBe('skipped');
    expect(inbox.size).toBe(1);
  });

  it('a non-2xx REST response downgrades to failed — never to a lost capture', async () => {
    const { deps, inbox } = testDeps({
      fetchImpl: jest.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch,
    });
    const result = await logMealIntent(PET, FOOD, { deps });
    expect(result.ok).toBe(true);
    expect(result.direct).toBe('failed');
    expect(inbox.size).toBe(1);
  });

  it('a thrown fetch (offline) is swallowed the same way', async () => {
    const { deps } = testDeps({
      fetchImpl: jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch,
    });
    const result = await logMealIntent(PET, FOOD, { deps });
    expect(result.ok).toBe(true);
    expect(result.direct).toBe('failed');
  });

  it('LogTreat writes kind treat; loggedVia defaults to widget and accepts intent', async () => {
    const { deps, inbox } = testDeps();
    const result = await logTreatIntent(PET, FOOD, { deps, loggedVia: 'intent' });
    expect(result.record).toMatchObject({ kind: 'treat', loggedVia: 'intent' });
    expect(JSON.parse([...inbox.values()][0]).loggedVia).toBe('intent');
  });

  it('TopUpBowl writes the arrangement record and NEVER attempts a direct REST leg', async () => {
    const { deps, inbox, fetchMock } = testDeps();
    const result = await topUpBowlIntent(PET, { deps });
    expect(result.ok).toBe(true);
    expect(result.direct).toBe('skipped');
    expect(result.record).toMatchObject({ kind: 'bowl_topup', petId: PET });
    expect(inbox.size).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('missing REST config (entitlement-less / env-less build) degrades to inbox-only', async () => {
    const { deps } = testDeps({ restConfig: null });
    const result = await logMealIntent(PET, FOOD, { deps });
    expect(result.ok).toBe(true);
    expect(result.direct).toBe('skipped');
  });
});

describe('defaultRestConfig', () => {
  it('null on missing or placeholder values — degrade, never throw (unlike lib/supabase.ts, by design)', () => {
    expect(defaultRestConfig(undefined, 'k')).toBeNull();
    expect(defaultRestConfig('https://abcdef.supabase.co', undefined)).toBeNull();
    expect(defaultRestConfig('your-supabase-url', 'k')).toBeNull();
    expect(defaultRestConfig('https://abcdef.supabase.co', 'k')).toEqual({
      url: 'https://abcdef.supabase.co',
      anonKey: 'k',
    });
  });
});
