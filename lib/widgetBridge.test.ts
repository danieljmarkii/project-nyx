// The bridge (Widget V2, PR 2) — publish v2 props, and the §3 one-time v1
// residual-outbox drain.
//
// v2 never writes, so the per-tick drain is gone; what remains is the UPGRADE
// path. `applyOutbox` (the v1 apply machinery — replay a capture through its W4
// intent, ingest between apply and revoke) is unchanged and still tested here,
// because `drainResidualV1Outbox` uses it to rescue a build-35 user's un-drained
// tap exactly once. The publish tests prove the v2 payload carries no outbox.

import {
  applyOutbox,
  clearWidgetTimeline,
  drainResidualV1Outbox,
  publishWidgetPass,
  publishWidgetTimeline,
  __setWidgetHandleForTests,
  type DrainDeps,
  type WidgetHandle,
} from './widgetBridge';
import type { CulpritWidgetProps, WidgetPendingCapture } from './widgetProps';

const PET = '11111111-1111-4111-8111-111111111111';

function capture(overrides: Partial<WidgetPendingCapture> = {}): WidgetPendingCapture {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    mealId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    kind: 'meal',
    petId: PET,
    foodItemId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    occurredAt: '2026-07-24T17:05:00.000Z',
    label: "Dinner — Hill's z/d",
    ...overrides,
  };
}

function fakeDeps() {
  const calls: { fn: string; args: unknown[] }[] = [];
  const ok = async () => ({ ok: true, record: null, direct: 'skipped' as const });
  const deps: DrainDeps = {
    logMeal: (async (...args: unknown[]) => {
      calls.push({ fn: 'logMeal', args });
      return ok();
    }) as unknown as DrainDeps['logMeal'],
    logTreat: (async (...args: unknown[]) => {
      calls.push({ fn: 'logTreat', args });
      return ok();
    }) as unknown as DrainDeps['logTreat'],
    topUpBowl: (async (...args: unknown[]) => {
      calls.push({ fn: 'topUpBowl', args });
      return ok();
    }) as unknown as DrainDeps['topUpBowl'],
    ingest: async () => {
      calls.push({ fn: 'ingest', args: [] });
    },
    revokeEvent: async (id: string) => {
      calls.push({ fn: 'revokeEvent', args: [id] });
    },
  };
  return { deps, calls };
}

describe('applyOutbox (the v1 apply machinery — reused by the §3 drain)', () => {
  it('replays a meal through logMealIntent with the WIDGET’s ids and tap time', async () => {
    const { deps, calls } = fakeDeps();
    const record = capture();
    const outcome = await applyOutbox({ pending: [record], revoked: [] }, deps);

    expect(outcome).toEqual({ applied: 1, revoked: 0, failed: [], deferredRevokes: [] });
    expect(calls.map((c) => c.fn)).toEqual(['logMeal', 'ingest']);
    const [petId, foodItemId, opts] = calls[0].args as [string, string, Record<string, unknown>];
    expect(petId).toBe(PET);
    expect(foodItemId).toBe(record.foodItemId);
    expect(opts.ids).toEqual({ eventId: record.id, mealId: record.mealId });
    expect((opts.occurredAt as Date).toISOString()).toBe(record.occurredAt);
    expect(opts.loggedVia).toBe('widget');
  });

  it('routes a treat to logTreatIntent and a bowl top-up to topUpBowlIntent', async () => {
    const { deps, calls } = fakeDeps();
    await applyOutbox(
      {
        pending: [
          capture({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', kind: 'treat' }),
          capture({ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', kind: 'bowl_topup', mealId: null, foodItemId: null }),
        ],
        revoked: [],
      },
      deps,
    );
    expect(calls.map((c) => c.fn)).toEqual(['logTreat', 'topUpBowl', 'ingest']);
  });

  it('never writes a capture that names nothing (D2 survives the outbox hop)', async () => {
    const { deps, calls } = fakeDeps();
    const outcome = await applyOutbox(
      { pending: [capture({ foodItemId: null }), capture({ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', petId: '' })], revoked: [] },
      deps,
    );
    expect(calls.map((c) => c.fn)).toEqual(['ingest']);
    expect(outcome.applied).toBe(0);
    expect(outcome.failed).toHaveLength(2);
  });

  it('INGESTS between applying and revoking (the order is the correctness argument)', async () => {
    const { deps, calls } = fakeDeps();
    await applyOutbox({ pending: [capture()], revoked: ['77777777-7777-4777-8777-777777777777'] }, deps);
    expect(calls.map((c) => c.fn)).toEqual(['logMeal', 'ingest', 'revokeEvent']);
  });

  it('defers revocations (rather than burning them) when the ingest fails', async () => {
    const { deps } = fakeDeps();
    deps.ingest = async () => {
      throw new Error('db locked');
    };
    const outcome = await applyOutbox({ pending: [], revoked: ['undo-me'] }, deps);
    expect(outcome.deferredRevokes).toEqual(['undo-me']);
  });
});

// ── The §3 one-time upgrade drain ────────────────────────────────────────────

describe('drainResidualV1Outbox', () => {
  function fakeWidget(entries: unknown[]) {
    const published: CulpritWidgetProps[] = [];
    const handle: WidgetHandle = {
      getTimeline: async () => entries as { date: Date; props: CulpritWidgetProps }[],
      updateTimeline: (next) => next.forEach((e) => published.push(e.props)),
    };
    return { handle, published };
  }

  afterEach(() => __setWidgetHandleForTests(null));

  it('applies a residual v1 capture found in the stored (v1-shaped) timeline', async () => {
    const { deps, calls } = fakeDeps();
    // A build-35 timeline entry carries the v1 outbox on its props.
    const { handle } = fakeWidget([{ date: new Date(), props: { schemaVersion: 1, pending: [capture()], revoked: [] } }]);
    __setWidgetHandleForTests(handle);

    const outcome = await drainResidualV1Outbox(deps);
    expect(outcome.applied).toBe(1);
    expect(calls.map((c) => c.fn)).toEqual(['logMeal', 'ingest']);
  });

  it('is a no-op on a v2 timeline (no outbox in the contract) — idempotent after the first publish', async () => {
    const { deps, calls } = fakeDeps();
    const { handle } = fakeWidget([{ date: new Date(), props: { schemaVersion: 2, pets: {}, signedIn: true } }]);
    __setWidgetHandleForTests(handle);

    const outcome = await drainResidualV1Outbox(deps);
    expect(outcome).toEqual({ applied: 0, revoked: 0, failed: [], deferredRevokes: [] });
    expect(calls).toEqual([]); // nothing applied, no ingest
  });

  it('is a clean no-op when there is no widget (Android / Expo Go / pre-widget build)', async () => {
    __setWidgetHandleForTests(null);
    await expect(drainResidualV1Outbox()).resolves.toEqual({ applied: 0, revoked: 0, failed: [], deferredRevokes: [] });
  });
});

// ── Publish ──────────────────────────────────────────────────────────────────

describe('publishWidgetTimeline / clearWidgetTimeline', () => {
  function fakeWidget() {
    const published: CulpritWidgetProps[] = [];
    const handle: WidgetHandle = {
      getTimeline: async () => [],
      updateTimeline: (next) => next.forEach((e) => published.push(e.props)),
    };
    return { handle, published };
  }

  afterEach(() => __setWidgetHandleForTests(null));

  it('publishes both timeline entries (now + midnight) carrying the v2 props', () => {
    const { handle, published } = fakeWidget();
    __setWidgetHandleForTests(handle);
    const props: CulpritWidgetProps = { schemaVersion: 2, pets: {}, signedIn: true };
    publishWidgetTimeline(props, new Date(2026, 6, 24, 21, 30));
    expect(published).toHaveLength(2);
    expect(published[0]).toBe(props);
    expect(published[1]).toBe(props);
  });

  it('clearWidgetTimeline publishes the signed-out v2 props (schema 2, no outbox)', () => {
    const { handle, published } = fakeWidget();
    __setWidgetHandleForTests(handle);
    clearWidgetTimeline();
    expect(published[0]).toEqual({ schemaVersion: 2, pets: {}, signedIn: false });
  });
});

// ── The drain-gated publish seam (the residual-drain data-loss fix) ───────────
//
// A partial upgrade drain must NOT overwrite the v1 timeline — that timeline is
// the un-applied tap's only durable copy. These pin that the publish is withheld
// exactly when the drain came back incomplete.
describe('publishWidgetPass', () => {
  function fakeWidget(timeline: unknown[]) {
    const published: CulpritWidgetProps[] = [];
    const handle: WidgetHandle = {
      getTimeline: async () => timeline as { date: Date; props: CulpritWidgetProps }[],
      updateTimeline: (next) => next.forEach((e) => published.push(e.props)),
    };
    return { handle, published };
  }
  const v2Props = (): CulpritWidgetProps => ({ schemaVersion: 2, pets: {}, signedIn: true });

  afterEach(() => __setWidgetHandleForTests(null));

  it('publishes after a clean residual drain and reports drainComplete', async () => {
    const { deps } = fakeDeps();
    const { handle, published } = fakeWidget([
      { date: new Date(), props: { schemaVersion: 1, pending: [capture()], revoked: [] } },
    ]);
    __setWidgetHandleForTests(handle);
    const res = await publishWidgetPass(async () => v2Props(), { needsDrain: true, deps });
    expect(res.drainComplete).toBe(true);
    expect(published).toHaveLength(2); // now + midnight
  });

  it('does NOT publish when a residual capture fails to apply — the v1 timeline is preserved', async () => {
    const { deps } = fakeDeps();
    // A capture that names nothing can never be applied → outcome.failed.
    const { handle, published } = fakeWidget([
      { date: new Date(), props: { schemaVersion: 1, pending: [capture({ foodItemId: null })], revoked: [] } },
    ]);
    __setWidgetHandleForTests(handle);
    const res = await publishWidgetPass(async () => v2Props(), { needsDrain: true, deps });
    expect(res.drainComplete).toBe(false);
    expect(published).toHaveLength(0); // the timeline holding the un-applied tap is untouched
  });

  it('does NOT publish when a revoke is deferred (ingest failed)', async () => {
    const { deps } = fakeDeps();
    deps.ingest = async () => {
      throw new Error('db locked');
    };
    const { handle, published } = fakeWidget([
      { date: new Date(), props: { schemaVersion: 1, pending: [], revoked: ['undo-me'] } },
    ]);
    __setWidgetHandleForTests(handle);
    const res = await publishWidgetPass(async () => v2Props(), { needsDrain: true, deps });
    expect(res.drainComplete).toBe(false);
    expect(published).toHaveLength(0);
  });

  it('publishes directly when no drain is needed (steady state) — and never touches the drain', async () => {
    const { deps, calls } = fakeDeps();
    const { handle, published } = fakeWidget([]);
    __setWidgetHandleForTests(handle);
    let built = false;
    const res = await publishWidgetPass(
      async () => {
        built = true;
        return v2Props();
      },
      { needsDrain: false, deps },
    );
    expect(res.drainComplete).toBe(true);
    expect(built).toBe(true);
    expect(published).toHaveLength(2);
    expect(calls).toEqual([]); // no apply / ingest — the drain was skipped entirely
  });

  it('a clean v2 timeline (no residual) publishes on the first pass', async () => {
    const { deps } = fakeDeps();
    const { handle, published } = fakeWidget([{ date: new Date(), props: v2Props() }]);
    __setWidgetHandleForTests(handle);
    const res = await publishWidgetPass(async () => v2Props(), { needsDrain: true, deps });
    expect(res.drainComplete).toBe(true);
    expect(published).toHaveLength(2);
  });
});
