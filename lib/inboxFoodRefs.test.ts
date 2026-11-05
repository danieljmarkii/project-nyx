// CUL-2542, CUL-2570, CUL-2572: the inbox reader behind the catalog cache flush's keep-set, and
// the bound on how long an unreadable inbox may hold the flush back. An inbox it cannot read
// whole must answer incomplete (the flush then skips), never complete and empty (the flush
// would then delete a food a capture it could not see is waiting on). And the skip ends.
jest.mock('./appGroup', () => ({ openCaptureInbox: jest.fn() }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CATALOG_FLUSH_MAX_SKIP_DAYS,
  CATALOG_FLUSH_SKIPS_KEY,
  clearCatalogFlushSkips,
  inboxKeepForCatalogFlush,
  readInboxFoodRefs,
} from './inboxFoodRefs';
import { openCaptureInbox } from './appGroup';

const FOOD = '22222222-2222-4222-9222-222222222222';
const file = (name: string, text: () => string) => ({ name, textSync: text });
const inbox = (list: () => unknown[]) =>
  (openCaptureInbox as jest.Mock).mockReturnValue({ status: 'ok', dir: { list } });

describe('readInboxFoodRefs', () => {
  it('reads the foods the .json records name', () => {
    inbox(() => [
      file('a.json', () => JSON.stringify({ foodItemId: FOOD })),
      file('a.json.deferred', () => '2026-11-05T00:00:00.000Z'),
    ]);
    expect(readInboxFoodRefs()).toEqual({ ids: [FOOD], complete: true });
  });

  it('no inbox (Android, no entitlement) is complete and keeps nothing', () => {
    (openCaptureInbox as jest.Mock).mockReturnValue({ status: 'none' });
    expect(readInboxFoodRefs()).toEqual({ ids: [], complete: true });
  });

  it('CUL-2570: an inbox folder that would not open is incomplete, never "no inbox"', () => {
    (openCaptureInbox as jest.Mock).mockReturnValue({ status: 'unavailable' });
    expect(readInboxFoodRefs()).toEqual({ ids: [], complete: false });
  });

  it('a listing that fails is incomplete', () => {
    inbox(() => {
      throw new Error('io');
    });
    expect(readInboxFoodRefs()).toEqual({ ids: [], complete: false });
  });

  it('a record that will not read is incomplete, and keeps what the others name', () => {
    inbox(() => [
      file('a.json', () => JSON.stringify({ foodItemId: FOOD })),
      file('b.json', () => {
        throw new Error('io');
      }),
    ]);
    expect(readInboxFoodRefs()).toEqual({ ids: [FOOD], complete: false });
  });
});

describe('inboxKeepForCatalogFlush (CUL-2572: the skip is bounded)', () => {
  const day = (n: number) => new Date(Date.UTC(2026, 10, 1 + n, 12));
  const incomplete = { ids: [FOOD], complete: false };

  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('a complete read keeps what it read and records no skip', async () => {
    expect(await inboxKeepForCatalogFlush({ ids: [FOOD], complete: true }, day(0))).toEqual([FOOD]);
    expect(await AsyncStorage.getItem(CATALOG_FLUSH_SKIPS_KEY)).toBeNull();
  });

  it('skips on the first days, then runs keeping the readable foods once the bound is reached', async () => {
    for (let n = 0; n < CATALOG_FLUSH_MAX_SKIP_DAYS - 1; n++) {
      expect(await inboxKeepForCatalogFlush(incomplete, day(n))).toBeNull();
    }
    expect(await inboxKeepForCatalogFlush(incomplete, day(CATALOG_FLUSH_MAX_SKIP_DAYS - 1))).toEqual([FOOD]);
  });

  it('counts distinct days, never launches: a crash loop on one day never reaches the bound', async () => {
    for (let n = 0; n < CATALOG_FLUSH_MAX_SKIP_DAYS * 4; n++) {
      expect(await inboxKeepForCatalogFlush(incomplete, day(0))).toBeNull();
    }
    expect(JSON.parse((await AsyncStorage.getItem(CATALOG_FLUSH_SKIPS_KEY)) ?? '[]')).toEqual(['2026-11-01']);
  });

  it('a ledger that will not read skips and leaves the recorded days alone', async () => {
    await AsyncStorage.setItem(CATALOG_FLUSH_SKIPS_KEY, JSON.stringify(['2026-11-01', '2026-11-02']));
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('io'));
    expect(await inboxKeepForCatalogFlush(incomplete, day(5))).toBeNull();
    expect(JSON.parse((await AsyncStorage.getItem(CATALOG_FLUSH_SKIPS_KEY)) ?? '[]')).toEqual([
      '2026-11-01',
      '2026-11-02',
    ]);
  });

  it('clearing the ledger starts the next count from zero', async () => {
    for (let n = 0; n < CATALOG_FLUSH_MAX_SKIP_DAYS - 1; n++) await inboxKeepForCatalogFlush(incomplete, day(n));
    await clearCatalogFlushSkips();
    expect(await inboxKeepForCatalogFlush(incomplete, day(20))).toBeNull();
  });
});
