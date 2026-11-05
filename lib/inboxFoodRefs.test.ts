// CUL-2542: the inbox reader behind the catalog cache flush's keep-set. An inbox it cannot
// read must answer null (the flush then skips), never [] (the flush would then delete a
// food a capture it could not see is waiting on).
jest.mock('./appGroup', () => ({ getCaptureInboxDirectory: jest.fn() }));

import { readInboxFoodIds } from './inboxFoodRefs';
import { getCaptureInboxDirectory } from './appGroup';

const FOOD = '22222222-2222-4222-9222-222222222222';
const file = (name: string, text: () => string) => ({ name, textSync: text });

describe('readInboxFoodIds', () => {
  it('reads the foods the .json records name', () => {
    (getCaptureInboxDirectory as jest.Mock).mockReturnValue({
      list: () => [
        file('a.json', () => JSON.stringify({ foodItemId: FOOD })),
        file('a.json.deferred', () => '2026-11-05T00:00:00.000Z'),
      ],
    });
    expect(readInboxFoodIds()).toEqual([FOOD]);
  });

  it('no inbox (Android, no entitlement) keeps nothing', () => {
    (getCaptureInboxDirectory as jest.Mock).mockReturnValue(null);
    expect(readInboxFoodIds()).toEqual([]);
  });

  it('a listing that fails answers null', () => {
    (getCaptureInboxDirectory as jest.Mock).mockReturnValue({
      list: () => {
        throw new Error('io');
      },
    });
    expect(readInboxFoodIds()).toBeNull();
  });

  it('a record that will not read answers null', () => {
    (getCaptureInboxDirectory as jest.Mock).mockReturnValue({
      list: () => [
        file('a.json', () => JSON.stringify({ foodItemId: FOOD })),
        file('b.json', () => {
          throw new Error('io');
        }),
      ],
    });
    expect(readInboxFoodIds()).toBeNull();
  });
});
