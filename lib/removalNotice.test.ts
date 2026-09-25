// The removal notice (HV-10 / CUL-1167; spec §4 "Remove a row"): the one fact that lets a
// list fold away the row the OWNER removed, and nothing that left for another reason.

import { REMOVAL_NOTICE_MS, clearRemovalNotices, noteRemoval, takeRemovals } from './removalNotice';

afterEach(() => clearRemovalNotices());

describe('removal notices', () => {
  it('a list takes the notices for the rows it draws, once each; an id it never drew costs nothing', () => {
    noteRemoval('e1', 1_000);
    noteRemoval('e2', 1_000);
    expect(takeRemovals(['e0', 'e1'], 1_500)).toEqual(['e1']);
    // Taken is gone: coming back a second time folds nothing.
    expect(takeRemovals(['e1'], 1_600)).toEqual([]);
    expect(takeRemovals(['e2'], 1_700)).toEqual(['e2']);
  });

  it('a notice nobody took lapses: it never folds a row some later list happens to draw', () => {
    noteRemoval('e1', 0);
    expect(takeRemovals(['e1'], REMOVAL_NOTICE_MS + 1)).toEqual([]);
    noteRemoval('e2', 0);
    expect(takeRemovals(['e2'], REMOVAL_NOTICE_MS)).toEqual(['e2']);
  });

  it('sign-out clears every notice (the FR-9 parity rule)', () => {
    noteRemoval('e1', 0);
    clearRemovalNotices();
    expect(takeRemovals(['e1'], 1)).toEqual([]);
  });
});
