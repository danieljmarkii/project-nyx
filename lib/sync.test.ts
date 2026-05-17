// Contract tests for downloadRemoteData (sync.ts).
//
// Status: the repo does not yet wire up a Jest harness — `npm test` is not
// defined in package.json — so these specs are aspirational. They sit here
// alongside `store/attachmentStore.test.ts` (same situation) to document the
// invariants this code MUST satisfy. Backlog item B-011 tracks landing the
// harness; once Jest is wired up, these should run without modification.
//
// Each `it.todo()` below is a contract the implementation must satisfy.
// Whenever you change downloadRemoteData, walk this list mentally and confirm
// nothing here is broken. If an invariant changes, update the spec first.

describe('downloadRemoteData — second-device sync', () => {
  it.todo('pulls every event for the pet when local SQLite is empty (fresh device)');

  it.todo('uses MAX(updated_at) as a watermark and only fetches rows >= the watermark on subsequent runs');

  it.todo('treats null watermark (empty local DB) as "pull everything" — no >= filter is applied');

  it.todo('upserts events by id: a row that already exists locally with synced=1 gets its fields updated from the remote copy');

  it.todo('preserves rows where local synced=0: the ON CONFLICT clause has WHERE events.synced = 1, so a pending local edit is not clobbered by an incoming server row');

  it.todo('propagates soft deletes: a row whose remote deleted_at is non-null overwrites the local copy, hiding it from getTimeline()');

  it.todo('upserts meals AFTER events to satisfy the local SQLite FK on meals.event_id');

  it.todo('only pulls meals whose event_id is in the set of events just fetched (avoids dragging the entire meals table on every sync)');

  it.todo('marks every downloaded row synced=1 so the next upload pass does not re-send remote rows back to Supabase');

  it.todo('returns early without error if there is no active session');

  it.todo('returns early without writing anything if the remote events query errors');

  it.todo('is idempotent: running the function twice in a row produces the same local SQLite state as running it once');
});

// Pure helper extracted for unit testing. If/when more pure logic peels off
// downloadRemoteData, add it here.
describe('sync — pure helpers', () => {
  it.todo('booleanizeIsFullPortion: 1 → 1, 0 → 0, null/undefined → null');
});
